#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  appbridgeHome,
  ensureHome,
  loadConfig,
  verifyAuditLog,
  rotateAuditLog,
  persistPolicySetting,
  type ActionResult,
  type Scene,
} from "@appbridge/core";
import { ApprovalStore } from "@appbridge/safety";
import { Bridge } from "@appbridge/gateway";
import { runStdioServer, startHttpGateway } from "@appbridge/gateway";
import { connectClient, listClients, printMcpConfig, printTomlConfig, undoClient } from "@appbridge/connect";
import { AppPackManager } from "@appbridge/memory";
import { detectHardware } from "@appbridge/providers";

const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version?: string;
}).version ?? "0.0.0";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument.startsWith("--")) {
      const key = argument.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argument);
    }
  }
  return { positional, flags };
}

function flagString(flags: ParsedArgs["flags"], name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

async function withBridge<T>(action: (bridge: Bridge) => Promise<T>): Promise<T> {
  const bridge = new Bridge();
  try {
    return await action(bridge);
  } finally {
    await bridge.close();
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printResult(result: ActionResult): void {
  printJson(result);
  if (!result.ok) process.exitCode = 1;
}

function parseDuration(value: string | undefined, fallbackMinutes = 30): number {
  if (!value) return fallbackMinutes * 60;
  const match = /^(\d+)(s|m|h)?$/.exec(value.trim());
  if (!match) throw new Error(`invalid duration ${JSON.stringify(value)}; use e.g. 30m or 2h`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "m";
  if (unit === "s") return amount;
  if (unit === "h") return amount * 3600;
  return amount * 60;
}

function sceneFrom(result: ActionResult): Scene | undefined {
  const data = result.data as { scene?: Scene } | undefined;
  return data?.scene;
}

const HELP = `Appbridge ${VERSION} — let any AI operate any app, safely.

Usage: appbridge <command> [options]

Commands:
  mcp                       Run the MCP server over stdio (for AI clients)
  serve [--port N]          Run the loopback REST gateway + OpenAPI
  init                      Create ~/.appbridge with a documented config.toml
  doctor                    Check this machine, the native host, config and audit chain
  apps [--json]             List visible windows that can be driven
  scene [--window TITLE]    Describe a window as a structured Scene
                            (--ocr / --no-ocr, --depth N, --root e12 to drill down)
  call <tool> [json]        Call one bridge tool directly and print the result
  add [--window TITLE]      Learn an open app: save a Playbook v0 to App Memory
  inventory                 Write ~/.appbridge/device.json from the live device
  approvals [list]          List approval requests
  approvals approve <id>    Grant an approval (--once | --for 30m)
  approvals deny <id>       Deny an approval
  halt | resume             Kill switch on/off
  status                    Session, policy and pending approvals
  policy [set <effect> <action>]  Show or change one policy rule
  audit tail [--limit N]    Show recent audit records
  audit verify              Recompute the hash chain
  audit rotate              Archive a broken log and start a fresh chain
  dialogs                   List detected dialogs in the current window
  skill <compile|run|list>  Compile/run/record a Skill
  lab run                   Run a skill lab session, output metrics to ~/.appbridge/lab/metrics.json
  memory.store.get <app> <skill>  Get a skill from memory
  memory.store.list <app>     List skills for an app
  pack export <app_id>      Export a portable App Pack (.zip) for sharing
  pack import <dir|zip>     Import a shared App Pack into App Memory
  providers                 Show local hardware profile and AI provider tier
  connect --list            Detect installed AI clients
  connect --client <id>     Install the MCP entry into a client config (backup first)
  connect --undo <id>       Restore the latest config backup
  connect --print           Print a generic mcpServers entry
  version | help

Safety:
  Destructive and external-effect actions (send, delete, post, pay) always
  require a human approval unless config.toml says otherwise. Password and
  privileged actions are handed to the human. Screen text is untrusted data.
`;

async function commandInit(args: ParsedArgs): Promise<void> {
  const paths = ensureHome(appbridgeHome());
  const existed = existsSync(paths.config);
  const config = loadConfig(paths.home);
  const summary = {
    home: paths.home,
    config: paths.config,
    created: !existed,
    policy: config.policy,
    filesystem_roots: config.filesystem.roots,
    next: [
      "appbridge doctor",
      "appbridge apps",
      "appbridge connect --list",
    ],
  };
  if (args.flags["json"] === true) {
    printJson(summary);
    return;
  }
  process.stdout.write(`Appbridge home: ${paths.home}\n`);
  process.stdout.write(`  config:    ${paths.config}${existed ? " (kept existing)" : " (created)"}\n`);
  process.stdout.write(`  audit:     ${paths.audit}\n`);
  process.stdout.write(`  approvals: ${paths.approvals}\n`);
  process.stdout.write(`  memory:    ${paths.memory}\n`);
  process.stdout.write(`\nPolicy: ${Object.entries(config.policy).map(([effect, action]) => `${effect}=${action}`).join(" ")}\n`);
  process.stdout.write(`Filesystem roots: ${config.filesystem.roots.join(", ") || "(none)"}\n`);
  process.stdout.write("\nNext: appbridge doctor && appbridge apps && appbridge connect --list\n");
}

async function commandDoctor(args: ParsedArgs): Promise<void> {
  const json = args.flags["json"] === true;
  const checks: Array<{ name: string; ok: boolean; detail: string; critical: boolean }> = [];
  const paths = ensureHome(appbridgeHome());

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node",
    ok: nodeMajor >= 22,
    detail: `v${process.versions.node} (requires >= 22.23.4)`,
    critical: true,
  });
  checks.push({
    name: "platform",
    ok: process.platform === "win32",
    detail: process.platform === "win32" ? "windows driver available" : `${process.platform}: only the Windows driver exists in this build`,
    critical: true,
  });

  try {
    const config = loadConfig(paths.home);
    checks.push({ name: "config", ok: true, detail: paths.config, critical: true });
    checks.push({
      name: "policy",
      ok: true,
      detail: `destructive=${config.policy.destructive} external-effect=${config.policy["external-effect"]} credential=${config.policy.credential}`,
      critical: false,
    });
  } catch (error) {
    checks.push({
      name: "config",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      critical: true,
    });
  }

  const audit = await verifyAuditLog(paths.audit);
  checks.push({
    name: "audit",
    ok: audit.ok,
    detail: `${audit.entries} records${audit.ok ? "" : `, broken at ${audit.broken_at}: ${audit.reason ?? ""}`}`,
    critical: true,
  });
  try {
    const config = loadConfig(paths.home);
    const permissive = (["external-effect", "unknown", "destructive"] as const).filter(
      (effect) => config.policy[effect] !== "approve" && config.policy[effect] !== "block",
    );
    checks.push({
      name: "policy posture",
      ok: permissive.length === 0,
      detail:
        permissive.length === 0
          ? "irreversible effects require approval"
          : `${permissive.join(", ")} can run without approval; review [policy] in config.toml`,
      critical: false,
    });
  } catch {
    // config check above already reports the failure
  }

  try {
    const config = loadConfig(paths.home);
    const denied = config.tools.deny;
    // Disabling the groups the agent needs to stop itself or read its own audit
    // is a posture mistake worth naming, not a crash.
    const overreach = (["session", "audit", "screen"] as const).filter((group) =>
      denied.includes(group),
    );
    checks.push({
      name: "tool posture",
      ok: overreach.length === 0,
      detail:
        overreach.length > 0
          ? `[tools] deny removes ${overreach.join(", ")}; the agent cannot stop itself or read its own audit`
          : denied.length === 0
            ? "no tools disabled; terminal.run and app.launch are available to the model"
            : `disabled by [tools] deny: ${denied.join(", ")}`,
      critical: false,
    });
  } catch {
    // config check above already reports the failure
  }

  checks.push({
    name: "kill switch",
    ok: true,
    detail: existsSync(paths.halt) ? "ACTIVE (automation halted)" : "inactive",
    critical: false,
  });

  if (process.platform === "win32") {
    try {
      const bridge = new Bridge({ home: paths.home });
      const ping = await bridge.driver.ping();
      checks.push({
        name: "native host",
        ok: ping.ok,
        detail: `UI Automation host ready${ping.psVersion ? ` (PowerShell ${ping.psVersion})` : ""}`,
        critical: true,
      });
      try {
        const ocr = await bridge.driver.ocrLanguages();
        checks.push({
          name: "ocr",
          ok: ocr.languages.length > 0,
          detail:
            ocr.languages.length > 0
              ? `languages: ${ocr.languages.join(", ")}`
              : "no OCR language pack installed; screen.ocr will fail",
          critical: false,
        });
      } catch (error) {
        checks.push({
          name: "ocr",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
          critical: false,
        });
      }
      const windows = await bridge.driver.listWindows();
      checks.push({
        name: "windows",
        ok: windows.length > 0,
        detail: `${windows.length} top-level windows visible`,
        critical: false,
      });
      await bridge.close();
    } catch (error) {
      checks.push({
        name: "native host",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        critical: true,
      });
    }
  }

  const failedCritical = checks.filter((check) => check.critical && !check.ok);
  if (json) {
    printJson({ ok: failedCritical.length === 0, checks, home: paths.home });
  } else {
    process.stdout.write(`Appbridge doctor — home ${paths.home}\n`);
    for (const check of checks) {
      process.stdout.write(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name}: ${check.detail}\n`);
    }
    process.stdout.write(
      failedCritical.length === 0
        ? "\nAll critical checks passed.\n"
        : `\n${failedCritical.length} critical check(s) failed.\n` +
          (checks.some((check) => check.name === "audit" && !check.ok)
            ? "The audit log is append-only; run 'appbridge audit rotate' to archive it and start a clean chain.\n"
            : ""),
    );
  }
  if (failedCritical.length > 0) process.exitCode = 1;
}

async function commandApps(args: ParsedArgs): Promise<void> {
  await withBridge(async (bridge) => {
    const result = await bridge.listApps();
    if (!result.ok) {
      printResult(result);
      return;
    }
    const data = result.data as { windows: Array<{ id: string; pid: number; process_name: string; title: string; focused: boolean }> };
    if (args.flags["json"] === true) {
      printJson(data.windows);
      return;
    }
    for (const window of data.windows) {
      process.stdout.write(
        `${window.focused ? "*" : " "} ${window.id.padStart(10)}  ${String(window.pid).padStart(6)}  ${window.process_name.padEnd(18)}  ${window.title}\n`,
      );
    }
  });
}

async function commandScene(args: ParsedArgs): Promise<void> {
  await withBridge(async (bridge) => {
    const result = await bridge.describe({
      window_title: flagString(args.flags, "window"),
      window_id: flagString(args.flags, "id"),
      max_elements: flagString(args.flags, "max") ? Number(flagString(args.flags, "max")) : undefined,
      max_depth: flagString(args.flags, "depth") ? Number(flagString(args.flags, "depth")) : undefined,
      include_ocr:
        args.flags["ocr"] === true ? true : args.flags["no-ocr"] === true ? false : undefined,
      root: flagString(args.flags, "root"),
    });
    if (!result.ok) {
      printResult(result);
      return;
    }
    const scene = sceneFrom(result);
    if (args.flags["json"] === true) {
      printJson(scene);
      return;
    }
    const data = result.data as { text: string };
    process.stdout.write(`${data.text}\n`);
  });
}

async function commandCall(args: ParsedArgs): Promise<void> {
  const tool = args.positional[0];
  if (!tool) {
    process.stderr.write("usage: appbridge call <tool> [json]\n");
    process.exitCode = 1;
    return;
  }
  let payload: Record<string, unknown> = {};
  if (args.positional[1]) {
    try {
      payload = JSON.parse(args.positional[1]) as Record<string, unknown>;
    } catch (error) {
      process.stderr.write(`invalid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
      return;
    }
  }
  await withBridge(async (bridge) => {
    printResult(await bridge.callTool(tool, payload));
  });
}

async function commandAdd(args: ParsedArgs): Promise<void> {
  await withBridge(async (bridge) => {
    const result = await bridge.addApp({
      window_title: flagString(args.flags, "window"),
      window_id: flagString(args.flags, "id"),
    });
    if (!result.ok) {
      printResult(result);
      return;
    }
    const data = result.data as {
      summary: { app: string; technology: string; grade: string; controls: number; risky_controls: number };
      playbook: { risk_map: Array<{ match: { role?: string; name: string }; effect: string }>; app: { id: string } };
    };
    process.stdout.write(`Learned ${data.summary.app} (${data.summary.technology}) — grade ${data.summary.grade}\n`);
    process.stdout.write(`  Playbook: ~/.appbridge/memory/${data.playbook.app.id}/playbook.json\n`);
    process.stdout.write(`  Controls mapped: ${data.summary.controls}\n`);
    process.stdout.write(`  Actions that always need approval:\n`);
    if (data.playbook.risk_map.length === 0) process.stdout.write("    (none detected yet)\n");
    for (const entry of data.playbook.risk_map.slice(0, 20)) {
      process.stdout.write(`    ${entry.effect.padEnd(16)} ${entry.match.role ?? "?"}:${entry.match.name}\n`);
    }
    process.stdout.write("\nNext: connect an AI with `appbridge connect --list`, or use the built-in tool mode via `appbridge mcp`.\n");
  });
}

async function commandInventory(): Promise<void> {
  await withBridge(async (bridge) => {
    const result = await bridge.inventory();
    if (!result.ok) {
      printResult(result);
      return;
    }
    const data = result.data as { windows: unknown[]; running_apps: unknown[]; process_count: number };
    process.stdout.write(`Wrote ${ensureHome().device}\n`);
    process.stdout.write(`  windows=${data.windows.length} running_apps=${data.running_apps.length} processes=${data.process_count}\n`);
  });
}

async function commandPolicy(args: ParsedArgs): Promise<void> {
  const paths = ensureHome(appbridgeHome());
  if (args.positional[0] === "set") {
    const effect = args.positional[1];
    const action = args.positional[2];
    if (!effect || !action) {
      process.stderr.write("usage: appbridge policy set <effect> <allow|approve|block|handoff>\n");
      process.exitCode = 1;
      return;
    }
    persistPolicySetting(paths.config, effect as never, action as never);
    const config = loadConfig(paths.home);
    process.stdout.write(`${effect} = ${config.policy[effect as keyof typeof config.policy]}\n`);
    return;
  }
  const config = loadConfig(paths.home);
  if (args.flags["json"] === true) {
    printJson(config.policy);
    return;
  }
  process.stdout.write("Effect            Policy\n");
  for (const [effect, action] of Object.entries(config.policy)) {
    process.stdout.write(`${effect.padEnd(16)}  ${action}\n`);
  }
  process.stdout.write("\nEdit with: appbridge policy set <effect> <action>\n");
}

async function commandAudit(args: ParsedArgs): Promise<void> {
  const paths = ensureHome(appbridgeHome());
  const sub = args.positional[0] ?? "tail";
  if (sub === "verify") {
    const verification = await verifyAuditLog(paths.audit);
    if (args.flags["json"] === true) {
      printJson(verification);
    } else if (verification.ok) {
      process.stdout.write(`audit chain ok: ${verification.entries} records\n`);
    } else {
      process.stdout.write(
        `audit chain BROKEN at record ${verification.broken_at}: ${verification.reason}\n` +
          "Run 'appbridge audit rotate' to archive this log and start a clean chain.\n",
      );
    }
    if (!verification.ok) process.exitCode = 1;
    return;
  }
  if (sub === "rotate") {
    const rotated = await rotateAuditLog(paths.audit);
    printJson(rotated);
    if (rotated.archived_to) process.stdout.write(`Archived to ${rotated.archived_to}\n`);
    return;
  }
  if (sub === "tail") {
    const limit = flagString(args.flags, "limit") ? Number(flagString(args.flags, "limit")) : 20;
    await withBridge(async (bridge) => {
      const result = await bridge.callTool("audit.tail", { limit });
      printResult(result);
    });
    return;
  }
  process.stderr.write("usage: appbridge audit <tail|verify|rotate>\n");
  process.exitCode = 1;
}


async function commandApprovals(args: ParsedArgs): Promise<void> {
  const store = new ApprovalStore(ensureHome().approvals);
  const sub = args.positional[0] ?? "list";
  if (sub === "list") {
    const records = await store.list();
    if (args.flags["json"] === true) {
      printJson(records);
      return;
    }
    if (records.length === 0) {
      process.stdout.write("No approval requests.\n");
      return;
    }
    for (const record of records) {
      process.stdout.write(
        `${record.id}  ${record.status.padEnd(8)} ${record.effect.padEnd(16)} ${record.app ?? "-"} :: ${record.target ?? "-"}  expires ${record.expires_at}\n`,
      );
    }
    return;
  }
  if (sub === "approve" || sub === "deny") {
    const id = args.positional[1];
    if (!id) {
      process.stderr.write(`usage: appbridge approvals ${sub} <id>\n`);
      process.exitCode = 1;
      return;
    }
    const ttl = parseDuration(flagString(args.flags, "for"));
    const scope = args.flags["once"] === true ? "once" : "session";
    const record = await store.decide(id, sub === "approve" ? "granted" : "denied", scope, ttl);
    printJson(record);
    if (sub === "approve" && args.flags["json"] !== true) {
      process.stdout.write(
        scope === "once"
          ? "Granted for a single use. Retry the action now.\n"
          : `Granted until ${record.expires_at}. Retry the action now.\n`,
      );
    }
    return;
  }
  process.stderr.write(`unknown approvals subcommand: ${sub}\n`);
  process.exitCode = 1;
}

async function commandPack(args: ParsedArgs): Promise<void> {
  const sub = args.positional[0];
  if (sub === "export") {
    const appId = args.positional[1];
    if (!appId) {
      process.stderr.write("usage: appbridge pack export <app_id>\n");
      process.exitCode = 1;
      return;
    }
    const manager = new AppPackManager(ensureHome().home);
    const result = await manager.exportPack({ app_id: appId });
    printJson(result);
    if (!args.flags["json"]) {
      process.stdout.write(`Pack exported to: ${result.pack_dir}\n`);
      process.stdout.write(`Skills: ${result.manifest.skills_count}\n`);
    }
    return;
  }
  if (sub === "import") {
    const dir = args.positional[1];
    if (!dir) {
      process.stderr.write("usage: appbridge pack import <dir>\n");
      process.exitCode = 1;
      return;
    }
    const manager = new AppPackManager(ensureHome().home);
    const result = await manager.importPack(dir);
    printJson(result);
    if (result.ok && !args.flags["json"]) {
      process.stdout.write(`Imported ${result.skills_imported} skill(s).\n`);
      if (result.warnings?.length) {
        for (const warning of result.warnings) process.stdout.write(`  warning: ${warning}\n`);
      }
    }
    return;
  }
  process.stderr.write(`unknown pack subcommand: ${sub ?? ""}\nusage: appbridge pack export <app_id> | import <dir>\n`);
  process.exitCode = 1;
}

async function commandProviders(): Promise<void> {
  const hw = detectHardware();
  process.stdout.write(`Platform:    ${hw.platform}\n`);
  process.stdout.write(`CPU cores:   ${hw.cpu_cores}\n`);
  process.stdout.write(`Total RAM:   ${hw.total_ram_gb} GB\n`);
  process.stdout.write(`GPU:         ${hw.gpu_detected ? hw.gpu_backend : "none"}\n`);
  process.stdout.write(`Tier:        ${hw.recommended_tier}\n`);
  process.stdout.write(`Profile:     ${hw.recommended_profile}\n`);
  process.stdout.write(`Patient:     ${hw.patient_mode}\n`);
}

async function commandConnect(args: ParsedArgs): Promise<void> {
  if (args.flags["list"] === true) {
    for (const client of listClients()) {
      process.stdout.write(
        `${client.detected ? "detected" : "        "}  ${client.id.padEnd(16)} ${client.name}\n`,
      );
    }
    return;
  }
  if (args.flags["print"] === true) {
    printJson(printMcpConfig());
    process.stdout.write(`\nCodex TOML:\n${printTomlConfig()}`);
    return;
  }
  const undo = flagString(args.flags, "undo");
  if (undo) {
    printJson(await undoClient(undo));
    return;
  }
  const client = flagString(args.flags, "client");
  if (!client) {
    process.stderr.write("usage: appbridge connect --list | --client <id> | --print | --undo <id>\n");
    process.exitCode = 1;
    return;
  }
  printJson(await connectClient(client));
}

async function main(): Promise<void> {
  const [command = "help", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case "mcp": {
      const bridge = new Bridge();
      await runStdioServer(bridge);
      return;
    }
    case "serve": {
      const bridge = new Bridge();
      const gateway = await startHttpGateway(bridge, {
        port: flagString(args.flags, "port") ? Number(flagString(args.flags, "port")) : undefined,
      });
      process.stdout.write(`Appbridge REST gateway: ${gateway.url}\n`);
      process.stdout.write(`Bearer token: ${gateway.token}\n`);
      process.stdout.write(`OpenAPI: ${gateway.url}/v1/openapi.json\n`);
      process.stdout.write("Loopback only. Ctrl+C to stop.\n");
      const shutdown = async (): Promise<void> => {
        gateway.server.close();
        await bridge.close().catch(() => undefined);
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      await new Promise(() => undefined);
      return;
    }
    case "init":
      await commandInit(args);
      return;
    case "doctor":
      await commandDoctor(args);
      return;
    case "apps":
      await commandApps(args);
      return;
    case "scene":
      await commandScene(args);
      return;
    case "call":
      await commandCall(args);
      return;
    case "add":
      await commandAdd(args);
      return;
    case "inventory":
      await commandInventory();
      return;
    case "policy":
      await commandPolicy(args);
      return;
    case "audit":
      await commandAudit(args);
      return;

    case "approvals":
      await commandApprovals(args);
      return;
    case "halt":
    case "stop":
      await withBridge(async (bridge) => printResult(await bridge.stop()));
      return;
    case "resume":
      await withBridge(async (bridge) => printResult(await bridge.resume()));
      return;
    case "status":
      await withBridge(async (bridge) => printResult(await bridge.status()));
      return;
    case "dialogs":
      await withBridge(async (bridge) => {
        const result = await bridge.callTool("dialog.list", {});
        printResult(result);
      });
      return;
    case "skill": {
      const skillSub = args.positional[0];
      if (!skillSub) {
        process.stderr.write(`usage: appbridge skill <compile|run|list> [json]\n`);
        process.exitCode = 1;
        return;
      }
      await withBridge(async (bridge) => {
        switch (skillSub) {
          case "compile": {
            if (args.positional[1]) {
              const input = JSON.parse(args.positional[1]);
              printResult(await bridge.callTool("skill.compile", input));
            } else {
              process.stderr.write(`usage: appbridge skill compile <json>\n`);
              process.exitCode = 1;
            }
            return;
          }
          case "run": {
            if (args.positional[1]) {
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(args.positional[1]) as Record<string, unknown>;
              } catch {
                input = { skill_id: args.positional[1] };
              }
              printResult(await bridge.callTool("skill.run", input));
            } else {
              process.stderr.write(`usage: appbridge skill run <skill_id | json>\n`);
              process.exitCode = 1;
            }
            return;
          }
          case "list": {
            printResult(await bridge.callTool("memory.store.list", { app_id: args.positional[1] || "" }));
            return;
          }
        }
      });
      return;
    }
    case "lab": {
      const skillId = args.positional[0] === "run" ? (args.positional[1] ?? "") : (args.positional[0] ?? "");
      await withBridge(async (bridge) => {
        const result = await bridge.callTool("lab.run", { skill_id: skillId });
        printResult(result);
      });
      return;
    }
    case "memory.store.get":
      await withBridge(async (bridge) => {
        if (args.positional[1]) {
          printResult(await bridge.callTool("memory.store.get", { app_id: args.positional[0], skill_id: args.positional[1] }));
        } else {
          process.stderr.write(`usage: appbridge memory.store.get <app_id> <skill_id>\n`);
          process.exitCode = 1;
        }
        return;
      });
      return;
    case "memory.store.list":
      await withBridge(async (bridge) => {
        if (args.positional[0]) {
          printResult(await bridge.callTool("memory.store.list", { app_id: args.positional[0] }));
        } else {
          process.stderr.write(`usage: appbridge memory.store.list <app_id>\n`);
          process.exitCode = 1;
        }
        return;
      });
      return;
    case "pack":
      await commandPack(args);
      return;
    case "providers":
      await commandProviders();
      return;
    case "connect":
      await commandConnect(args);
      return;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`appbridge ${VERSION}\n`);
      return;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    default:
      process.stderr.write(`unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`appbridge: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
