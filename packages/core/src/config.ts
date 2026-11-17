import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parse } from "smol-toml";
import { EFFECTS, type Effect, type PolicyAction } from "./types.js";
import { ensureHome, appbridgeHome } from "./paths.js";

export type EgressMode = "local-only" | "cloud-allowed";
export type WorkspaceMode = "shared" | "vm";
export type OcrMode = "auto" | "on" | "off";

export interface AppbridgeConfig {
  gateway: { port: number; bind: string };
  scene: { max_elements: number; max_depth: number; include_offscreen: boolean; ocr: OcrMode };
  safety: { untrusted_requires_approval: boolean; approval_ttl_seconds: number };
  egress: { mode: EgressMode };
  workspace: { mode: WorkspaceMode };
  filesystem: { roots: string[]; max_file_bytes: number; max_search_results: number };
  terminal: { timeout_ms: number; max_output_chars: number };
  /**
   * Tools this machine refuses to dispatch. An entry is either a whole group
   * (`terminal`) or one tool (`terminal.run`). Denied tools are refused before
   * the driver is touched, so a skill or client can run with a smaller surface.
   */
  tools: { deny: string[] };
  policy: Record<Effect, PolicyAction>;
}

const POLICY_VALUES: PolicyAction[] = ["allow", "approve", "block", "handoff"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEFAULT_POLICY: Record<Effect, PolicyAction> = {
  navigate: "allow",
  read: "allow",
  "edit-draft": "allow",
  write: "allow",
  destructive: "approve",
  "external-effect": "approve",
  privileged: "handoff",
  credential: "handoff",
  unknown: "approve",
};

export const DEFAULT_CONFIG: AppbridgeConfig = {
  gateway: { port: 8787, bind: "127.0.0.1" },
  scene: { max_elements: 1000, max_depth: 20, include_offscreen: false, ocr: "auto" },
  safety: { untrusted_requires_approval: false, approval_ttl_seconds: 1800 },
  egress: { mode: "cloud-allowed" },
  workspace: { mode: "shared" },
  filesystem: { roots: [process.cwd()], max_file_bytes: 5_000_000, max_search_results: 100 },
  terminal: { timeout_ms: 30_000, max_output_chars: 32_000 },
  tools: { deny: [] },
  policy: { ...DEFAULT_POLICY },
};

export function defaultConfigToml(): string {
  const defaultRoot = process.cwd().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `# Appbridge local configuration. Never contains account or cloud credentials.
# Policy values: allow | approve | block | handoff.

[gateway]
bind = "127.0.0.1"
port = 8787

[scene]
max_elements = 1000
max_depth = 20
include_offscreen = false
# ocr: auto | on | off. Auto runs OCR when accessibility exposes almost no text.
ocr = "auto"

[safety]
untrusted_requires_approval = false
approval_ttl_seconds = 1800

[egress]
mode = "cloud-allowed"

[workspace]
mode = "shared"

[filesystem]
# Only these directories are available to filesystem and terminal tools.
roots = ["${defaultRoot}"]
max_file_bytes = 5000000
max_search_results = 100

[terminal]
timeout_ms = 30000
max_output_chars = 32000

[tools]
# Tools the AI client may not call on this machine. A group name disables every
# tool in it ("terminal"), a dotted name disables one ("terminal.run").
# Refused calls return class="blocked" and never reach the driver.
# deny = ["terminal.run", "app.launch"]
deny = []

[policy]
navigate = "allow"
read = "allow"
"edit-draft" = "allow"
write = "allow"
destructive = "approve"
"external-effect" = "approve"
privileged = "handoff"
credential = "handoff"
unknown = "approve"
`;
}

/** Update one policy setting without replacing any unrelated config sections. */
export function persistPolicySetting(
  file: string,
  effect: Effect,
  action: PolicyAction,
): void {
  if (!EFFECTS.includes(effect)) throw new Error(`invalid policy effect: ${effect}`);
  if (!POLICY_VALUES.includes(action)) throw new Error(`invalid policy action: ${action}`);
  const original = existsSync(file) ? readFileSync(file, "utf8") : defaultConfigToml();
  const lines = original.split(/\r?\n/);
  let sectionStart = lines.findIndex((line) => line.trim() === "[policy]");
  if (sectionStart < 0) {
    lines.push("", "[policy]");
    sectionStart = lines.length - 1;
  }

  let sectionEnd = sectionStart + 1;
  while (sectionEnd < lines.length && !/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[sectionEnd] ?? "")) {
    sectionEnd += 1;
  }

  const bareKey = escapeRegExp(effect);
  const keyPattern = new RegExp(`^\\s*(?:"${bareKey}"|${bareKey})\\s*=`);
  const settingLine = `${effect.includes("-") ? `"${effect}"` : effect} = "${action}"`;
  const existingIndex = lines.slice(sectionStart + 1, sectionEnd)
    .findIndex((line) => keyPattern.test(line));
  if (existingIndex >= 0) {
    lines[sectionStart + 1 + existingIndex] = settingLine;
  } else {
    lines.splice(sectionEnd, 0, settingLine);
  }

  const updated = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  normalizeConfig(parse(updated));
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, updated, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function pickInt(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid config: ${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * A deny entry is a group (`terminal`) or one tool (`terminal.run`). Anything
 * with spaces, wildcards or path characters is a typo, not a tool, and a typo
 * that silently disabled nothing would be the dangerous kind of mistake.
 */
const DENY_ENTRY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;

function normalizeDenyList(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_CONFIG.tools.deny];
  if (!Array.isArray(value)) {
    throw new Error('invalid config: tools.deny must be an array of tool or group names, e.g. ["terminal.run"]');
  }
  const entries: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !DENY_ENTRY.test(item.trim().toLowerCase())) {
      throw new Error(
        `invalid config: tools.deny[${index}] must be a tool ("terminal.run") or group ("terminal") name`,
      );
    }
    const entry = item.trim().toLowerCase();
    if (!entries.includes(entry)) entries.push(entry);
  }
  return entries;
}

/** Turn parsed TOML into a complete, validated config. Unknown keys are ignored. */
export function normalizeConfig(raw: unknown): AppbridgeConfig {
  const root = asRecord(raw);
  const gateway = asRecord(root["gateway"]);
  const scene = asRecord(root["scene"]);
  const safety = asRecord(root["safety"]);
  const egress = asRecord(root["egress"]);
  const workspace = asRecord(root["workspace"]);
  const filesystem = asRecord(root["filesystem"]);
  const terminal = asRecord(root["terminal"]);
  const tools = asRecord(root["tools"]);
  const policy = asRecord(root["policy"]);

  const policyValues: Record<Effect, PolicyAction> = { ...DEFAULT_POLICY };
  for (const effect of EFFECTS) {
    const value = policy[effect];
    if (value === undefined) continue;
    if (typeof value !== "string" || !POLICY_VALUES.includes(value as PolicyAction)) {
      throw new Error(
        `invalid config: policy.${effect} must be one of ${POLICY_VALUES.join(", ")}`,
      );
    }
    policyValues[effect] = value as PolicyAction;
  }

  const egressMode = pickString(egress["mode"], DEFAULT_CONFIG.egress.mode);
  if (egressMode !== "local-only" && egressMode !== "cloud-allowed") {
    throw new Error('invalid config: egress.mode must be "local-only" or "cloud-allowed"');
  }
  const workspaceMode = pickString(workspace["mode"], DEFAULT_CONFIG.workspace.mode);
  if (workspaceMode !== "shared" && workspaceMode !== "vm") {
    throw new Error('invalid config: workspace.mode must be "shared" or "vm"');
  }
  const ocrMode = pickString(scene["ocr"], DEFAULT_CONFIG.scene.ocr);
  if (ocrMode !== "auto" && ocrMode !== "on" && ocrMode !== "off") {
    throw new Error('invalid config: scene.ocr must be "auto", "on" or "off"');
  }

  return {
    gateway: {
      port: pickInt(gateway["port"], DEFAULT_CONFIG.gateway.port, 1024, 65535, "gateway.port"),
      bind: pickString(gateway["bind"], DEFAULT_CONFIG.gateway.bind),
    },
    scene: {
      max_elements: pickInt(scene["max_elements"], DEFAULT_CONFIG.scene.max_elements, 10, 5000, "scene.max_elements"),
      max_depth: pickInt(scene["max_depth"], DEFAULT_CONFIG.scene.max_depth, 1, 30, "scene.max_depth"),
      include_offscreen: pickBool(scene["include_offscreen"], DEFAULT_CONFIG.scene.include_offscreen),
      ocr: ocrMode,
    },
    safety: {
      untrusted_requires_approval: pickBool(
        safety["untrusted_requires_approval"],
        DEFAULT_CONFIG.safety.untrusted_requires_approval,
      ),
      approval_ttl_seconds: pickInt(
        safety["approval_ttl_seconds"],
        DEFAULT_CONFIG.safety.approval_ttl_seconds,
        30,
        86400,
        "safety.approval_ttl_seconds",
      ),
    },
    egress: { mode: egressMode },
    workspace: { mode: workspaceMode },
    filesystem: {
      roots: Array.isArray(filesystem["roots"])
        ? filesystem["roots"].map((item, index) => {
            if (typeof item !== "string" || item.trim().length === 0) {
              throw new Error(`invalid config: filesystem.roots[${index}] must be a non-empty path`);
            }
            return item.trim();
          })
        : [...DEFAULT_CONFIG.filesystem.roots],
      max_file_bytes: pickInt(
        filesystem["max_file_bytes"],
        DEFAULT_CONFIG.filesystem.max_file_bytes,
        1024,
        50_000_000,
        "filesystem.max_file_bytes",
      ),
      max_search_results: pickInt(
        filesystem["max_search_results"],
        DEFAULT_CONFIG.filesystem.max_search_results,
        1,
        500,
        "filesystem.max_search_results",
      ),
    },
    terminal: {
      timeout_ms: pickInt(
        terminal["timeout_ms"],
        DEFAULT_CONFIG.terminal.timeout_ms,
        1000,
        120000,
        "terminal.timeout_ms",
      ),
      max_output_chars: pickInt(
        terminal["max_output_chars"],
        DEFAULT_CONFIG.terminal.max_output_chars,
        1000,
        200000,
        "terminal.max_output_chars",
      ),
    },
    tools: { deny: normalizeDenyList(tools["deny"]) },
    policy: policyValues,
  };
}

export interface LoadConfigOptions {
  /** Create the config file on first run (default true). */
  create?: boolean;
}

export function loadConfig(home: string = appbridgeHome(), options: LoadConfigOptions = {}): AppbridgeConfig {
  const paths = ensureHome(home);
  if (!existsSync(paths.config)) {
    if (options.create === false) return DEFAULT_CONFIG;
    writeFileSync(paths.config, defaultConfigToml(), { encoding: "utf8", mode: 0o644 });
    return DEFAULT_CONFIG;
  }
  const text = readFileSync(paths.config, "utf8");
  try {
    return normalizeConfig(parse(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read config at ${paths.config}: ${message}`);
  }
}
