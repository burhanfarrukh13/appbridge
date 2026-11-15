import { existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AuditLog,
  appbridgeHome,
  argsDigest,
  ensureHome,
  loadConfig,
  persistPolicySetting,
  EFFECTS,
  okResult,
  failResult,
  truncate,
  type ActionResult,
  type AppbridgeConfig,
  type Effect,
  type HomePaths,
  type Playbook,
  type Rect,
  type Scene,
  type SceneElement,
  type WindowSummary,
} from "@appbridge/core";
import {
  ActionFirewall,
  ApprovalStore,
  classifyRisk,
  escalateForConfidence,
  type FirewallDecision,
} from "@appbridge/safety";
import {
  createDriver,
  diffScene,
  formatScene,
  isPrivilegedCombo,
  parseKeyCombo,
  sceneSignature,
  SceneRegistry,
  waitUntil,
  type DeviceDriver,
  type Expectation,
  type OcrResult,
  type TreeResult,
} from "@appbridge/floor";
import {
  MemoryStore,
  playbookFromScene,
  detectDialogs,
  findDialogButton,
  findCancelButton,
  SkillStore,
  compileSkill,
  validateSkill,
  prepareSkillParams,
  substituteParams,
  substituteExpectation,
  resolveSkillSelector,
  type Skill,
  type SkillSummary,
  type CompileInput,
  type RecordedEvent,
  type DialogInfo,
} from "@appbridge/memory";
import { classifyTerminalCommand, LocalComputerAccess, type TerminalShell } from "./local.js";

export interface TargetParams {
  window_id?: string;
  window_title?: string;
  windowId?: string;
  windowTitle?: string;
  uid?: string;
  role?: string;
  name?: string;
}



export interface DescribeParams extends TargetParams {
  max_elements?: number;
  max_depth?: number;
  include_offscreen?: boolean;
  include_ocr?: boolean;
  /** Scene element id to drill into; returns only that subtree. */
  root?: string;
}

export interface BridgeOptions {
  home?: string;
  driver?: DeviceDriver;
  config?: AppbridgeConfig;
  actor?: string;
}

export interface Observation {
  window: WindowSummary;
  scene: Scene;
}

export interface SkillParams {
  skill_id: string;
  params?: Record<string, unknown>;
}

export interface GateOutcome {
  allowed: boolean;
  result?: ActionResult;
  approvalId?: string;
  note?: string;
}

function sceneLimit(config: AppbridgeConfig, requested?: number): number {
  return Math.min(Math.max(requested ?? config.scene.max_elements, 10), 2000);
}

function compactScene(scene: Scene, limit = 40): Record<string, unknown> {
  return {
    id: scene.id,
    window: scene.window,
    app: scene.app,
    focus: scene.focus,
    stable: scene.stable,
    truncated: scene.truncated,
    warnings: scene.warnings,
    element_count: scene.elements.length,
    elements: scene.elements.slice(0, limit).map((element) => ({
      id: element.id,
      role: element.role,
      name: element.name,
      bounds: element.bounds,
      state: element.state,
      actions: element.actions,
      risk_hint: element.risk_hint,
      untrusted: element.untrusted,
      injection_flags: element.injection_flags,
    })),
  };
}

function centerOf(element: SceneElement): { x: number; y: number } {
  return {
    x: element.bounds.x + Math.round(element.bounds.width / 2),
    y: element.bounds.y + Math.round(element.bounds.height / 2),
  };
}

function keyEffect(combo: string): { effect: Effect; privileged: boolean } {
  const parsed = parseKeyCombo(combo);
  if (isPrivilegedCombo(parsed)) return { effect: "privileged", privileged: true };
  const modifiers = new Set(parsed.modifiers);
  if (modifiers.has("CTRL") && parsed.key === "S") return { effect: "write", privileged: false };
  if (modifiers.has("ALT") && parsed.key === "F4") return { effect: "write", privileged: false };
  if (modifiers.has("CTRL") && parsed.key === "ENTER") return { effect: "external-effect", privileged: false };
  if (modifiers.size === 0 && parsed.key === "DELETE") return { effect: "destructive", privileged: false };
  return { effect: "navigate", privileged: false };
}

/**
 * The single in-process entry point used by MCP, REST and the CLI. Every action
 * goes: perceive -> classify -> policy -> act -> verify -> audit.
 */
export class Bridge {
  readonly config: AppbridgeConfig;
  readonly paths: HomePaths;
  readonly driver: DeviceDriver;
  readonly memory: MemoryStore;
  readonly skillStore: SkillStore;

  private readonly registry = new SceneRegistry();
  private readonly approvals: ApprovalStore;
  private readonly firewall: ActionFirewall;
  private readonly audit: AuditLog;
  private readonly localComputer: LocalComputerAccess;
  private readonly actor: string;
  private readonly startedAt = Date.now();

  /** Active Teach-mode recording session, if any. */
  private recordSession: {
    id: string;
    app_id: string;
    window_title: string;
    name: string;
    description: string;
    events: RecordedEvent[];
    started_at: string;
  } | undefined;

  constructor(options: BridgeOptions = {}) {
    const home = options.home ?? appbridgeHome();
    this.paths = ensureHome(home);
    this.config = options.config ?? loadConfig(home);
    this.driver = options.driver ?? createDriver();
    this.localComputer = new LocalComputerAccess({
      roots: this.config.filesystem.roots,
      maxFileBytes: this.config.filesystem.max_file_bytes,
      maxSearchResults: this.config.filesystem.max_search_results,
    });
    this.memory = new MemoryStore(home);
    this.skillStore = new SkillStore(home);
    this.actor = options.actor ?? process.env["APPBRIDGE_ACTOR"] ?? "ai-client";
    this.approvals = new ApprovalStore(this.paths.approvals);
    this.firewall = new ActionFirewall({
      policy: this.config.policy,
      approvals: this.approvals,
      approvalTtlSeconds: this.config.safety.approval_ttl_seconds,
    });
    this.audit = new AuditLog(this.paths.audit);
  }

  isHalted(): boolean {
    return existsSync(this.paths.halt);
  }

  async close(): Promise<void> {
    await this.driver.close().catch(() => undefined);
  }

  private async record(
    tool: string,
    args: unknown,
    result: ActionResult,
    app?: string,
  ): Promise<void> {
    try {
      await this.audit.append({
        actor: this.actor,
        tool,
        args_digest: argsDigest(args),
        result: result.class,
        approval_id: result.approval?.id ?? null,
        route: result.route ?? null,
        app: app ?? null,
        note: result.ok ? null : truncate(result.reason ?? "", 300),
      });
    } catch {
      // Auditing must never turn a safe action into a crash; the caller is told
      // through stderr only.
      process.stderr.write("[appbridge] warning: could not append audit record\n");
    }
  }

  private async pickWindow(target: TargetParams): Promise<WindowSummary> {
    const windows = await this.driver.listWindows();
    const winId = (target.window_id ?? target.windowId)?.trim();
    if (winId) {
      const hit = windows.find((window) => window.id === winId);
      if (!hit) throw new Error(`no window with id ${winId}; run apps.list`);
      return hit;
    }
    const visible = windows.filter((window) => window.visible && window.title.trim().length > 0);
    const winTitle = target.window_title ?? target.windowTitle;
    if (winTitle) {
      const needle = winTitle.trim().toLowerCase();
      const exact = visible.find((window) => window.title.toLowerCase() === needle);
      if (exact) return exact;
      const partial = visible.find((window) => window.title.toLowerCase().includes(needle));
      if (partial) return partial;

      // Tab-level lookup across windows with tabs (browsers, tabbed apps)
      for (const win of visible) {
        try {
          const shallow = await this.driver.getTree({ windowId: win.id, maxDepth: 8, maxElements: 120, includeOffscreen: false });
          const matchingTab = shallow.elements.find(
            (e) => e.role === "TabItem" && e.name.toLowerCase().includes(needle),
          );
          if (matchingTab) {
            if (matchingTab.patterns.includes("selection") || matchingTab.patterns.includes("invoke")) {
              await this.driver.invoke(matchingTab.uid).catch(() => null);
            } else {
              const x = Math.round(matchingTab.bounds.x + matchingTab.bounds.width / 2);
              const y = Math.round(matchingTab.bounds.y + matchingTab.bounds.height / 2);
              if (x > 0 && y > 0) {
                await this.driver.click({ x, y, button: "left", count: 1 }).catch(() => null);
              }
            }
            await new Promise((r) => setTimeout(r, 200));
            return win;
          }
        } catch {
          // Continue checking other windows
        }
      }

      throw new Error(`no visible window matches ${JSON.stringify(winTitle)}; run apps.list`);
    }
    const focused = visible.find((window) => window.focused);
    if (focused) return focused;
    const first = visible[0];
    if (!first) throw new Error("no visible windows are available");
    return first;
  }

  async observe(
    target: TargetParams & Partial<DescribeParams> & { skip_ocr?: boolean },
  ): Promise<Observation> {
    const window = await this.pickWindow(target);
    const maxElements = sceneLimit(this.config, target.max_elements);
    const includeOffscreen = target.include_offscreen ?? this.config.scene.include_offscreen;
    const rootId = target.root?.trim() || undefined;
    let rootUid: string | undefined;
    if (rootId) {
      rootUid = this.registry.resolve(rootId, window.id);
      if (!rootUid) {
        throw new Error(
          `element ${rootId} is not in the current scene for this window; run screen.describe first`,
        );
      }
    }
    const tree: TreeResult = await this.driver.getTree({
      windowId: window.id,
      rootUid,
      maxDepth: Math.min(target.max_depth ?? this.config.scene.max_depth, 30),
      maxElements,
      includeOffscreen,
    });

    // Cost control: OCR runs only when accessibility exposes almost no text
    // (few named controls, or a shallow tree such as a Chromium surface), or
    // when the caller asks for it. It never runs during action verification.
    const namedElements = tree.elements.filter((candidate) => candidate.name.trim().length > 0).length;
    const namedCharacters = tree.elements.reduce((sum, candidate) => sum + candidate.name.trim().length, 0);
    const ocrMode = this.config.scene.ocr;
    const sparseAccessibility = namedElements < 5 || namedCharacters < 200;
    const useOcr =
      target.skip_ocr !== true &&
      !rootUid &&
      (target.include_ocr ?? (ocrMode === "on" || (ocrMode === "auto" && sparseAccessibility)));
    let ocr: OcrResult | undefined;
    let ocrError: string | undefined;
    if (useOcr) {
      try {
        ocr = await this.driver.ocr({ windowId: window.id });
      } catch (error) {
        ocrError = error instanceof Error ? error.message : String(error);
      }
    }

    const scene = this.registry.build(tree.window, tree, {
      maxElements,
      includeOffscreen,
      ocr: ocr?.lines,
      root: rootId,
    });
    scene.data["ocr_used"] = Boolean(ocr);
    if (ocr) {
      scene.data["ocr_ms"] = ocr.elapsed_ms;
      scene.data["ocr_language"] = ocr.language;
      if (!window.focused) {
        scene.warnings = scene.warnings ?? [];
        scene.warnings.push(
          "OCR reads visible pixels: this window is not in the foreground, so OCR text may come from a window covering it",
        );
      }
    }
    if (ocrError) scene.data["ocr_error"] = ocrError;
    return { window: tree.window, scene };
  }

  private contextFor(scene: Scene): string {
    // dialogs may be empty; only include if present
    const dialogNames = scene.dialogs?.map((dialog) => dialog.name).filter(Boolean) ?? [];
    return [scene.window, ...dialogNames].filter(Boolean).join(" | ");
  }

  private async gate(
    effect: Effect,
    window: WindowSummary,
    target: string | undefined,
    reason: string,
  ): Promise<GateOutcome> {
    if (this.isHalted()) {
      return {
        allowed: false,
        result: failResult("blocked", "the Appbridge kill switch is active", {
          route: "policy",
          next: "Ask the user to run `appbridge resume` when they want automation to continue.",
        }),
      };
    }
    const decision: FirewallDecision = await this.firewall.authorize({
      effect,
      app: window.process_name || window.title,
      target,
      reason,
    });
    if (decision.decision === "allow") {
      return { allowed: true, approvalId: decision.approvalId, note: decision.reason };
    }
    if (decision.decision === "approve") {
      const approval = decision.approval;
      return {
        allowed: false,
        result: failResult("needs_human", `approval required before a ${effect} action`, {
          route: "policy",
          approval,
          next: approval
            ? `Ask the user to run \`appbridge approvals approve ${approval.id}\` (once), or with \`--for 30m\` for a time-boxed grant, then retry.`
            : "Ask the user to approve this action, then retry.",
        }),
      };
    }
    if (decision.decision === "block") {
      return {
        allowed: false,
        result: failResult("blocked", decision.reason, {
          route: "policy",
          next: "This effect is blocked by policy; only the user can change config.toml.",
        }),
      };
    }
    return {
      allowed: false,
      result: failResult("needs_human", decision.reason, {
        route: "policy",
        next: "Hand the device to the user for this step, then call session.status before continuing.",
      }),
    };
  }

  async describe(params: DescribeParams = {}): Promise<ActionResult> {
    try {
      // A fresh process (CLI, restarted MCP client) has no id map yet. Take one
      // shallow snapshot so `root` can resolve instead of failing outright.
      if (params.root) {
        const target = await this.pickWindow(params);
        if (!this.registry.resolve(params.root, target.id)) {
          await this.observe({ ...params, root: undefined, skip_ocr: true, max_depth: 3 });
        }
      }
      const { scene, window } = await this.observe(params);
      const drillable = scene.elements.find((element) => element.children_omitted);
      const result = okResult(
        { scene, text: formatScene(scene) },
        {
          route: "uia",
          verified: true,
          scene_id: scene.id,
          next: drillable && !params.root
            ? `The Scene is partial. To read one container in detail, call screen.describe with root="${drillable.id}" (or raise max_depth).`
            : undefined,
        },
      );
      await this.record("screen.describe", params, result, window.process_name);
      void window;
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "uia",
        next: "Run apps.list to see available windows.",
      });
      await this.record("screen.describe", params, result);
      return result;
    }
  }

  private resolveElement(
    scene: Scene,
    params: TargetParams,
  ): { element: SceneElement } | { error: string } {
    if (params.uid) {
      const byId = scene.elements.find((element) => element.id === params.uid);
      if (byId) return { element: byId };
      // uid expired — fall through to name-based lookup if name also provided
      if (!params.name) {
        return { error: `element ${params.uid} is not in the current scene; run screen.describe first` };
      }
    }
    const targetName = params.name ?? (params as { query?: string }).query;
    if (!targetName) return { error: "provide element uid, name, or query" };

    const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const needle = targetName.trim().toLowerCase();
    const needleNorm = normalize(targetName);

    const byRole = params.role
      ? scene.elements.filter((element) => element.role.toLowerCase() === params.role?.toLowerCase())
      : scene.elements;

    // 1. Exact match
    const exact = byRole.filter((element) => element.name.trim().toLowerCase() === needle);
    if (exact.length === 1) return { element: exact[0] as SceneElement };
    if (exact.length > 1 && params.role) return { element: exact[0] as SceneElement };

    // 2. Substring match (needle contained in element name)
    const sub = exact.length > 0 ? exact : byRole.filter((element) => element.name.toLowerCase().includes(needle));
    if (sub.length === 1) return { element: sub[0] as SceneElement };

    // 3. Prefix match (element name starts with needle)
    const prefix = sub.length > 0 ? sub : byRole.filter((element) => element.name.trim().toLowerCase().startsWith(needle));
    if (prefix.length === 1) return { element: prefix[0] as SceneElement };

    // 4. Normalized match (strip punctuation, compare tokens)
    const normMatch = (prefix.length > 0 ? prefix : byRole).filter((element) => normalize(element.name) === needleNorm);
    if (normMatch.length >= 1) return { element: normMatch[0] as SceneElement };

    // 5. Best fuzzy: all needle words appear in element name
    const needleWords = needleNorm.split(" ").filter(Boolean);
    const wordMatch = byRole.filter((element) => {
      const en = normalize(element.name);
      return needleWords.every((word) => en.includes(word));
    });
    if (wordMatch.length === 1) return { element: wordMatch[0] as SceneElement };

    // Build candidates from best tier found
    let candidates = normMatch.length > 0 ? normMatch : wordMatch.length > 0 ? wordMatch : sub.length > 0 ? sub : prefix;

    // Disambiguation: Prefer in-page content over browser address bar unless explicitly targeted
    const isNavigationAddressBar = (e: SceneElement) =>
      e.class_name === "OmniboxViewViews" ||
      e.name.toLowerCase() === "address and search bar" ||
      e.name.toLowerCase().startsWith("search google or type a url");

    if (
      candidates.length > 1 &&
      !needle.includes("address") &&
      !needle.includes("url") &&
      !needle.includes("omnibox")
    ) {
      const filtered = candidates.filter((c) => !isNavigationAddressBar(c));
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (candidates.length === 0) {
      const available = byRole
        .slice(0, 8)
        .map((e) => `"${e.name}"`)
        .join(", ");
      return {
        error: `no element matches ${JSON.stringify(params.name)}; available: [${available}]`,
      };
    }
    if (candidates.length > 1 && !params.role) {
      return {
        error: `ambiguous target: ${candidates
          .slice(0, 5)
          .map((element) => `${element.id} ${element.role}:${element.name}`)
          .join(", ")}; add role or uid`,
      };
    }
    return { element: candidates[0] as SceneElement };
  }

  private async waitForAction(
    window: WindowSummary,
    before: Scene,
    expect: Expectation | undefined,
    timeoutMs: number,
  ): Promise<{ met: boolean; detail: string; elapsed_ms: number; scene: Scene; change: ReturnType<typeof diffScene> }> {
    const signature = sceneSignature(before);
    let latest = before;
    const outcome = await waitUntil(
      async () => {
        const observation = await this.observe({ window_id: window.id, skip_ocr: true });
        latest = observation.scene;
        if (expect) {
          if (expect.file_exists) {
            const { checkFile } = await import("@appbridge/floor");
            const exists = await checkFile(expect.file_exists);
            return { met: exists, detail: `file ${expect.file_exists} ${exists ? "exists" : "missing"}` };
          }
          return this.checkExpectation(latest, expect);
        }
        return {
          met: sceneSignature(latest) !== signature,
          detail: "screen changed",
        };
      },
      { timeoutMs, intervalMs: 200 },
    );
    return {
      met: outcome.met,
      detail: outcome.detail,
      elapsed_ms: outcome.elapsed_ms,
      scene: latest,
      change: diffScene(before, latest),
    };
  }

  private checkExpectation(scene: Scene, expect: Expectation): { met: boolean; detail: string } {
    const match = (query: { role?: string; name: string }): boolean =>
      scene.elements.some(
        (element) =>
          (!query.role || element.role.toLowerCase() === query.role.toLowerCase()) &&
          element.name.trim().toLowerCase() === query.name.trim().toLowerCase(),
      );
    if (expect.window_title_contains) {
      const needle = expect.window_title_contains.toLowerCase();
      if (!scene.window.toLowerCase().includes(needle)) {
        return { met: false, detail: `window title does not contain ${JSON.stringify(needle)}` };
      }
    }
    if (expect.element_appears && !match(expect.element_appears)) {
      return { met: false, detail: `waiting for ${expect.element_appears.role ?? "element"} ${expect.element_appears.name}` };
    }
    if (expect.element_disappears && match(expect.element_disappears)) {
      return { met: false, detail: `${expect.element_disappears.name} is still present` };
    }
    if (expect.value_equals) {
      const element = scene.elements.find((candidate) => candidate.id === expect.value_equals?.id);
      if (!element) return { met: false, detail: `element ${expect.value_equals.id} is not in the scene` };
      if ((element.state?.value ?? "") !== expect.value_equals.value) {
        return { met: false, detail: `value is ${JSON.stringify(element.state?.value ?? "")}` };
      }
    }
    return { met: true, detail: "expectation met" };
  }

  async click(
    params: TargetParams & {
      button?: "left" | "right" | "middle";
      count?: number;
      expect?: Expectation;
      timeout_ms?: number;
    },
  ): Promise<ActionResult> {
    const started = Date.now();
    try {
      const { window, scene } = await this.observe(params);
      const resolved = this.resolveElement(scene, params);
      if ("error" in resolved) return failResult("unsupported", resolved.error, { route: "uia" });
      let element = resolved.element;
      const risk = classifyRisk({
        role: element.role,
        name: element.name,
        contextText: this.contextFor(scene),
      });
      const effect = escalateForConfidence(risk.effect, risk.confidence);
      const target = `${element.role}:${element.name}`;
      const gate = await this.gate(effect, window, target, `click ${target}`);
      if (!gate.allowed) {
        await this.record("ui.click", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }

      const isOcr = element.src.includes("ocr");
      let uid = isOcr ? undefined : this.registry.resolve(element.id, window.id);
      if (!isOcr && !uid) {
        // Refresh scene and re-resolve if element handle expired
        const refreshed = await this.observe(params).catch(() => null);
        if (refreshed) {
          const reResolved = this.resolveElement(refreshed.scene, params);
          if ("element" in reResolved) {
            element = reResolved.element;
            uid = this.registry.resolve(element.id, refreshed.window.id);
          }
        }
        if (!uid) {
          return failResult("stale_element", "element handle expired; run screen.describe again", { route: "uia" });
        }
      }

      let route = "mouse";
      const semantic =
        !isOcr && element.actions?.some((action) => ["click", "toggle", "select", "expand"].includes(action));
      if (semantic && uid) {
        const invocation = await this.driver.invoke(uid);
        route = invocation.route;
      } else {
        const point = centerOf(element);
        await this.driver.click({ ...point, button: params.button ?? "left", count: params.count ?? 1 });
      }

      const outcome = await this.waitForAction(window, scene, params.expect, params.timeout_ms ?? 1500);
      const elapsed = Date.now() - started;
      const result = outcome.met
        ? okResult(
            { window: window.title, scene: compactScene(outcome.scene), route_detail: route, elapsed_ms: elapsed },
            {
              route,
              verified: true,
              scene_id: outcome.scene.id,
              change: outcome.change,
              evidence: { expectation: outcome.detail, approval: gate.approvalId ?? null },
            },
          )
        : failResult("no_effect", `no verified effect after click (${outcome.detail})`, {
            route,
            scene_id: outcome.scene.id,
            change: outcome.change,
            next: "Call screen.describe and try a different element or an alternative path (shortcut instead of menu).",
          });
      await this.record("ui.click", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "uia",
      });
      await this.record("ui.click", params, result);
      return result;
    }
  }

  async type(
    params: TargetParams & { text: string; submit?: boolean; expect?: Expectation; timeout_ms?: number },
  ): Promise<ActionResult> {
    try {
      const { window, scene } = await this.observe(params);
      let element: SceneElement | undefined;
      if (params.uid || params.name || (params as { query?: string }).query) {
        const resolved = this.resolveElement(scene, params);
        if ("error" in resolved) return failResult("unsupported", resolved.error, { route: "uia" });
        element = resolved.element;
      }
      if (!params.text || params.text.length > 20000) {
        return failResult("unsupported", "text is required and must be under 20000 characters", { route: "keyboard" });
      }

      if (element?.src.includes("ocr")) {
        return failResult(
          "unsupported",
          "OCR text is not an editable control; target an accessibility field from screen.describe instead",
          { route: "keyboard" },
        );
      }

      const label = element ? `${element.role}:${element.name}` : "focused control";
      const credentialField =
        element && (element.state?.masked || classifyRisk({ role: element.role, name: element.name }).effect === "credential");
      let effect: Effect = credentialField ? "credential" : "edit-draft";
      if (params.submit) effect = credentialField ? "credential" : "external-effect";

      const gate = await this.gate(effect, window, label, `type into ${label}`);
      if (!gate.allowed) {
        await this.record("ui.type", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }

      await this.driver.focusWindow(window.id);
      let route = "keyboard";
      if (element) {
        const uid = this.registry.resolve(element.id, window.id);
        if (uid) await this.driver.focusElement(uid).catch(() => null);
        // Click center of element to ensure input caret is placed (vital for web inputs and contenteditable)
        const point = centerOf(element);
        if (point.x > 0 && point.y > 0) {
          await this.driver.click({ ...point, button: "left", count: 1 }).catch(() => null);
          await new Promise((r) => setTimeout(r, 60));
        }
      }
      await this.driver.typeText(params.text);
      if (params.submit) await this.driver.key([0x0d]);

      const outcome = await this.waitForAction(window, scene, params.expect, params.timeout_ms ?? 1200);
      let verified = outcome.met;
      let note = outcome.detail;
      if (element && !params.expect && !credentialField) {
        const refreshed = outcome.scene.elements.find((candidate) => candidate.id === element.id);
        if (refreshed?.state?.value !== undefined) {
          verified = refreshed.state.value.includes(params.text.slice(0, 80));
          note = verified ? "field value read back and contains the typed text" : "field value did not reflect the typed text";
        }
      }
      const result: ActionResult = verified
        ? okResult(
            { window: window.title, scene: compactScene(outcome.scene), element: element?.id ?? null },
            { route, verified: true, scene_id: outcome.scene.id, change: outcome.change, evidence: { verification: note } },
          )
        : failResult("wrong_state", `typing not verified: ${note}`, {
            route,
            scene_id: outcome.scene.id,
            change: outcome.change,
            next: "Call screen.describe, confirm focus and field state, then retry.",
          });
      await this.record("ui.type", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "keyboard",
      });
      await this.record("ui.type", params, result);
      return result;
    }
  }

  async key(
    params: { combo: string; expect?: Expectation; timeout_ms?: number } & TargetParams,
  ): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const before = await this.observe({ window_id: window.id });
      const { effect } = keyEffect(params.combo);
      const gate = await this.gate(effect, window, `key:${params.combo}`, `press ${params.combo}`);
      if (!gate.allowed) {
        await this.record("ui.key", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }
      const parsed = parseKeyCombo(params.combo);
      await this.driver.focusWindow(window.id);
      await this.driver.key(parsed.codes);
      if (params.expect) {
        const outcome = await this.waitForAction(window, before.scene, params.expect, params.timeout_ms ?? 1500);
        const result = outcome.met
          ? okResult(
              { scene: compactScene(outcome.scene), combo: parsed.normalized },
              { route: "keyboard", verified: true, scene_id: outcome.scene.id, change: outcome.change },
            )
          : failResult("no_effect", `expectation not met after ${params.combo}: ${outcome.detail}`, {
              route: "keyboard",
              scene_id: outcome.scene.id,
              change: outcome.change,
            });
        await this.record("ui.key", params, result, window.process_name);
        return result;
      }
      const result = okResult(
        { scene: compactScene(before.scene), combo: parsed.normalized },
        {
          route: "keyboard",
          verified: false,
          scene_id: before.scene.id,
          reason: "no expectation supplied; key was sent without verification",
        },
      );
      await this.record("ui.key", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "keyboard",
      });
      await this.record("ui.key", params, result);
      return result;
    }
  }

  async setValue(params: { uid: string; value: string; expect?: Expectation }): Promise<ActionResult> {
    try {
      const { window, scene } = await this.observe(params);
      const resolved = this.resolveElement(scene, params);
      if ("error" in resolved) return failResult("unsupported", resolved.error, { route: "uia" });
      const element = resolved.element;
      if (element.src.includes("ocr")) {
        return failResult("unsupported", "OCR text is not an editable control; target a real field instead", {
          route: "uia",
        });
      }
      const risk = classifyRisk({ role: element.role, name: element.name, contextText: this.contextFor(scene) });
      const effect = risk.effect === "credential" ? "credential" : "write";
      const gate = await this.gate(effect, window, `${element.role}:${element.name}`, `set value`);
      if (!gate.allowed) {
        await this.record("ui.set_value", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }
      const uid = this.registry.resolve(element.id, window.id);
      if (!uid) return failResult("stale_element", "element handle expired; run screen.describe again", { route: "uia" });
      const invocation = await this.driver.setValue(uid, params.value);
      const refreshed = await this.observe({ window_id: window.id });
      const updated = refreshed.scene.elements.find((candidate) => candidate.id === element.id);
      const verified = updated?.state?.value === params.value;
      const result = verified
        ? okResult(
            { scene: compactScene(refreshed.scene), value: params.value },
            { route: invocation.route, verified: true, scene_id: refreshed.scene.id, change: diffScene(scene, refreshed.scene) },
          )
        : failResult("wrong_state", "value read-back did not match", {
            route: invocation.route,
            scene_id: refreshed.scene.id,
            next: "Check whether the control accepts direct value writes; otherwise focus it, select all, and type.",
          });
      await this.record("ui.set_value", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "uia" });
      await this.record("ui.set_value", params, result);
      return result;
    }
  }

  async scroll(
    params: TargetParams & {
      direction: "up" | "down" | "left" | "right";
      amount?: number;
      expect?: Expectation;
      timeout_ms?: number;
    },
  ): Promise<ActionResult> {
    try {
      const { window, scene } = await this.observe(params);
      const resolved = params.uid || params.name ? this.resolveElement(scene, params) : undefined;
      const point = resolved && !("error" in resolved) ? centerOf(resolved.element) : undefined;
      await this.driver.focusWindow(window.id);
      await this.driver.scroll(point, params.direction, Math.min(Math.max(params.amount ?? 3, 1), 20));
      const outcome = await this.waitForAction(window, scene, params.expect, params.timeout_ms ?? 900);
      const result = okResult(
        { scene: compactScene(outcome.scene), direction: params.direction },
        {
          route: "mouse",
          verified: outcome.met,
          scene_id: outcome.scene.id,
          change: outcome.change,
          evidence: { verification: outcome.detail },
        },
      );
      await this.record("ui.scroll", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "mouse" });
      await this.record("ui.scroll", params, result);
      return result;
    }
  }

  async waitFor(
    params: { role?: string; name?: string; window_title_contains?: string; timeout_ms?: number } & TargetParams,
  ): Promise<ActionResult> {
    const timeout = Math.min(Math.max(params.timeout_ms ?? 5000, 200), 120000);
    let lastScene: Scene | undefined;
    const outcome = await waitUntil(
      async () => {
        const observation = await this.observe(params);
        lastScene = observation.scene;
        const isMatch = sceneHas(lastScene, params.role, params.name);
        const titleMatch = !params.window_title_contains
          ? true
          : lastScene.window.toLowerCase().includes(params.window_title_contains.toLowerCase());
        return {
          met: Boolean(params.name) ? isMatch && titleMatch : titleMatch,
          detail: isMatch ? "element present" : "element not present yet",
        };
      },
      { timeoutMs: timeout, intervalMs: 250 },
    );
    const result = outcome.met
      ? okResult({ scene: compactScene(lastScene as Scene) }, { route: "uia", verified: true, scene_id: lastScene?.id })
      : failResult("timeout", `condition not met within ${timeout}ms: ${outcome.detail}`, {
          route: "uia",
          scene_id: lastScene?.id,
          next: "Call screen.describe to see the current state.",
        });
    await this.record("ui.wait_for", params, result);
    return result;
  }

  async capture(params: { window_id?: string; window_title?: string; region?: { x: number; y: number; width: number; height: number }; scale?: number }): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const capture = await this.driver.capture({
        windowId: window.id,
        region: params.region,
        scale: Math.min(Math.max(params.scale ?? 1, 0.1), 1),
      });
      const result = okResult(
        {
          png_base64: capture.png.toString("base64"),
          mime_type: "image/png",
          width: capture.width,
          height: capture.height,
          bounds: capture.bounds,
          window: window.title,
        },
        { route: "capture", verified: true },
      );
      await this.record("screen.capture", { ...params, region: params.region, scale: params.scale }, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "capture" });
      await this.record("screen.capture", params, result);
      return result;
    }
  }

  async ocr(
    params: TargetParams & { region?: Rect; scale?: number; include_scene?: boolean },
  ): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const ocr = await this.driver.ocr({
        windowId: window.id,
        region: params.region,
        scale: params.scale,
      });
      const result = okResult(
        {
          window: window.title,
          window_focused: window.focused,
          text: ocr.text,
          lines: ocr.lines,
          language: ocr.language,
          languages: ocr.languages,
          width: ocr.width,
          height: ocr.height,
          bounds: ocr.bounds,
          elapsed_ms: ocr.elapsed_ms,
          note: window.focused
            ? "OCR reads the visible pixels of this window."
            : "This window is not in the foreground: OCR may be reading a window that covers it. Focus it first for accurate text.",
        },
        { route: "ocr", verified: true },
      );
      await this.record("screen.ocr", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "ocr",
        next: "Install a Windows OCR language pack (Settings -> Language & region) and retry.",
      });
      await this.record("screen.ocr", params, result);
      return result;
    }
  }

  async find(params: TargetParams & { query?: string; limit?: number }): Promise<ActionResult> {
    const query = params.query ?? params.name ?? "";
    try {
      const { window, scene } = await this.observe(params);
      const needle = query.trim().toLowerCase();
      const matches = scene.elements
        .filter(
          (element) =>
            (!params.role || element.role.toLowerCase() === params.role.toLowerCase()) &&
            (!needle || element.name.toLowerCase().includes(needle) || element.automation_id?.toLowerCase().includes(needle)),
        )
        .slice(0, Math.min(params.limit ?? 20, 100));
      const result = okResult(
        { matches, scene_id: scene.id, total: scene.elements.length },
        { route: "uia", verified: true, scene_id: scene.id },
      );
      await this.record("ui.find", params, result, window.process_name);
      return result;
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "uia" });
    }
  }

  async listWindows(): Promise<ActionResult> {
    const windows = await this.driver.listWindows();
    const result = okResult({ windows }, { route: "uia", verified: true });
    await this.record("apps.list", {}, result);
    return result;
  }

  async listApps(): Promise<ActionResult> {
    const [windows, processes] = await Promise.all([this.driver.listWindows(), this.driver.listProcesses()]);
    const result = okResult(
      {
        windows: windows.filter((window) => window.visible && window.title.trim().length > 0),
        process_count: processes.length,
      },
      { route: "uia", verified: true },
    );
    await this.record("apps.list", {}, result);
    return result;
  }

  async focusWindow(params: { window_id?: string; window_title?: string }): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const gate = await this.gate("navigate", window, `window:${window.title}`, "focus window");
      if (!gate.allowed) {
        await this.record("window.focus", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }
      const focused = await this.driver.focusWindow(window.id);
      const isFocused = focused.focused || (!focused.minimized && focused.visible);
      if (!isFocused) {
        const result = failResult("no_effect", "the window did not become the foreground window", {
          route: "win32",
          data: { window: focused },
          next: "Windows can block focus changes from a background process. Ask the user to click the window, then retry; do not assume it is focused.",
        });
        await this.record("window.focus", params, result, window.process_name);
        return result;
      }
      const result = okResult({ window: focused }, { route: "win32", verified: true });
      await this.record("window.focus", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "win32" });
      await this.record("window.focus", params, result);
      return result;
    }
  }

  async windowAction(
    params: { window_id?: string; window_title?: string; action: "minimize" | "maximize" | "restore" | "close" } & Record<string, unknown>,
  ): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const effect: Effect = params.action === "close" ? "write" : "navigate";
      const gate = await this.gate(effect, window, `window:${window.title}`, `${params.action} window`);
      if (!gate.allowed) {
        await this.record("window.action", params, gate.result as ActionResult, window.process_name);
        return gate.result as ActionResult;
      }
      await this.driver.windowAction(window.id, { action: params.action });
      const result = okResult({ window: window.title, action: params.action }, { route: "win32", verified: true });
      await this.record("window.action", params, result, window.process_name);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "win32" });
      await this.record("window.action", params, result);
      return result;
    }
  }

  async launch(params: { path: string; args?: string[] }): Promise<ActionResult> {
    try {
      const gate = await this.gate("write", { process_name: "shell" } as WindowSummary, `launch:${params.path}`, "launch an application");
      if (!gate.allowed) {
        await this.record("app.launch", params, gate.result as ActionResult, "shell");
        return gate.result as ActionResult;
      }
      const pid = await this.driver.launchApp(params.path, params.args ?? []);
      const result = okResult({ pid, path: params.path }, { route: "win32", verified: false, reason: "process started; window presence not yet checked" });
      await this.record("app.launch", params, result, "shell");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "win32" });
      await this.record("app.launch", params, result);
      return result;
    }
  }

  async clipboardGet(): Promise<ActionResult> {
    const text = await this.driver.clipboardGet();
    const result = okResult({ text, length: text.length, untrusted: true }, { route: "clipboard", verified: true });
    await this.record("clipboard.get", {}, result);
    return result;
  }

  async clipboardSet(params: { text: string }): Promise<ActionResult> {
    const gate = await this.gate("write", { process_name: "clipboard" } as WindowSummary, "clipboard", "write clipboard");
    if (!gate.allowed) {
      await this.record("clipboard.set", params, gate.result as ActionResult, "clipboard");
      return gate.result as ActionResult;
    }
    await this.driver.clipboardSet(params.text);
    const readBack = await this.driver.clipboardGet();
    const result = okResult(
      { length: params.text.length, verified_read_back: readBack === params.text },
      { route: "clipboard", verified: readBack === params.text },
    );
    await this.record("clipboard.set", params, result, "clipboard");
    return result;
  }

  async filesystemRoots(): Promise<ActionResult> {
    try {
      const roots = await this.localComputer.listRoots();
      const result = okResult({ roots }, { route: "filesystem", verified: true });
      await this.record("filesystem.roots", {}, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.roots", {}, result, "filesystem");
      return result;
    }
  }

  async filesystemList(params: { path?: string } = {}): Promise<ActionResult> {
    try {
      const result = okResult(await this.localComputer.list(params.path), { route: "filesystem", verified: true });
      await this.record("filesystem.list", params, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.list", params, result, "filesystem");
      return result;
    }
  }

  async filesystemRead(params: { path: string; start_line?: number; max_lines?: number }): Promise<ActionResult> {
    try {
      const data = await this.localComputer.read(params.path, params.start_line, params.max_lines);
      const result = okResult({ ...data, untrusted: true }, { route: "filesystem", verified: true });
      await this.record("filesystem.read", params, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.read", params, result, "filesystem");
      return result;
    }
  }

  async filesystemSearch(params: { query: string; path?: string; max_results?: number }): Promise<ActionResult> {
    try {
      const data = await this.localComputer.search(
        params.query,
        params.path,
        Math.min(Math.max(params.max_results ?? this.config.filesystem.max_search_results, 1), 500),
      );
      const result = okResult({ ...data, untrusted: true }, { route: "filesystem", verified: true });
      await this.record("filesystem.search", params, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.search", params, result, "filesystem");
      return result;
    }
  }

  async filesystemWrite(params: { path: string; content: string }): Promise<ActionResult> {
    try {
      const path = await this.localComputer.resolvePath(params.path);
      const gate = await this.gate(
        "edit-draft",
        { process_name: "filesystem" } as WindowSummary,
        path,
        `write or replace a local file in an approved root: ${path}`,
      );
      if (!gate.allowed) {
        const result = gate.result as ActionResult;
        await this.record("filesystem.write", params, result, "filesystem");
        return result;
      }
      const data = await this.localComputer.write(path, params.content);
      const result = okResult(data, { route: "filesystem", verified: Boolean(data["verified"]) });
      await this.record("filesystem.write", params, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.write", params, result, "filesystem");
      return result;
    }
  }

  async filesystemEdit(params: { path: string; old_text: string; new_text: string }): Promise<ActionResult> {
    try {
      const path = await this.localComputer.resolvePath(params.path);
      const gate = await this.gate(
        "edit-draft",
        { process_name: "filesystem" } as WindowSummary,
        path,
        `edit a local file in an approved root: ${path}`,
      );
      if (!gate.allowed) {
        const result = gate.result as ActionResult;
        await this.record("filesystem.edit", params, result, "filesystem");
        return result;
      }
      const data = await this.localComputer.edit(path, params.old_text, params.new_text);
      const result = okResult(data, { route: "filesystem", verified: Boolean(data["verified"]) });
      await this.record("filesystem.edit", params, result, "filesystem");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "filesystem",
      });
      await this.record("filesystem.edit", params, result, "filesystem");
      return result;
    }
  }

  async terminalList(): Promise<ActionResult> {
    const result = okResult(
      { shells: await this.localComputer.availableShells() },
      { route: "terminal", verified: true },
    );
    await this.record("terminal.list", {}, result, "terminal");
    return result;
  }

  async terminalRun(params: {
    shell: TerminalShell;
    command: string;
    cwd?: string;
    timeout_ms?: number;
  }): Promise<ActionResult> {
    try {
      const roots = await this.localComputer.listRoots();
      const cwd = await this.localComputer.resolvePath(params.cwd ?? roots[0] ?? "");
      if (!(await this.localComputer.availableShells()).includes(params.shell)) {
        throw new Error(`terminal is not available: ${params.shell}`);
      }
      const commandDigest = argsDigest({ command: params.command });
      const effect = classifyTerminalCommand(params.command);
      const gate = await this.gate(
        effect,
        { process_name: "terminal" } as WindowSummary,
        `${params.shell}:${cwd}:${commandDigest}`,
        `run this ${effect}-risk ${params.shell} command in ${cwd}: ${params.command}`,
      );
      if (!gate.allowed) {
        const result = gate.result as ActionResult;
        await this.record("terminal.run", params, result, "terminal");
        return result;
      }

      const data = await this.localComputer.run(
        params.shell,
        params.command,
        cwd,
        {
          timeoutMs: this.config.terminal.timeout_ms,
          maxOutputChars: this.config.terminal.max_output_chars,
        },
        params.timeout_ms,
      );
      const resultData = { ...data, untrusted: true };
      const timedOut = data["timed_out"] === true;
      const exitCode = data["exit_code"];
      const result =
        timedOut || exitCode !== 0
          ? failResult(
              timedOut ? "timeout" : "no_effect",
              timedOut ? "terminal command timed out" : `terminal command exited with code ${String(exitCode)}`,
              { route: "terminal", data: resultData },
            )
          : okResult(resultData, { route: "terminal", verified: true });
      await this.record("terminal.run", params, result, "terminal");
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "terminal",
      });
      await this.record("terminal.run", params, result, "terminal");
      return result;
    }
  }

  async status(): Promise<ActionResult> {
    const pending = (await this.approvals.list()).filter((record) => record.status === "pending");
    const result = okResult(
      {
        halted: this.isHalted(),
        platform: this.driver.platform,
        version: "0.1.0",
        home: this.paths.home,
        egress: this.config.egress.mode,
        policy: this.config.policy,
        pending_approvals: pending.map((record) => ({
          id: record.id,
          effect: record.effect,
          app: record.app,
          target: record.target,
          expires_at: record.expires_at,
        })),
        workspace: this.config.workspace.mode,
        uptime_ms: Date.now() - this.startedAt,
      },
      { route: "core", verified: true },
    );
    return result;
  }

  async updatePolicy(effect: string, action: string): Promise<ActionResult> {
    const validEffect = EFFECTS.find((candidate) => candidate === effect);
    const validAction = (["allow", "approve", "block", "handoff"] as const)
      .find((candidate) => candidate === action);
    if (!validEffect || !validAction) {
      return failResult("unsupported", "invalid policy effect or action", { route: "settings" });
    }

    try {
      persistPolicySetting(this.paths.config, validEffect, validAction);
      this.config.policy[validEffect] = validAction;
      const result = okResult(
        { effect: validEffect, action: validAction, policy: this.config.policy },
        { route: "settings", verified: true },
      );
      await this.record("settings.policy.update", { effect: validEffect, action: validAction }, result);
      return result;
    } catch (error) {
      const result = failResult("unsupported", error instanceof Error ? error.message : String(error), {
        route: "settings",
      });
      await this.record("settings.policy.update", { effect, action }, result);
      return result;
    }
  }

  async stop(): Promise<ActionResult> {
    ensureHome(this.paths.home);
    writeFileSync(this.paths.halt, `stopped at ${new Date().toISOString()}\n`, "utf8");
    const result = okResult({ halted: true }, { route: "core", verified: true });
    await this.record("session.stop", {}, result);
    return result;
  }

  async resume(): Promise<ActionResult> {
    if (existsSync(this.paths.halt)) rmSync(this.paths.halt);
    const result = okResult({ halted: false }, { route: "core", verified: true });
    await this.record("session.resume", {}, result);
    return result;
  }

  async listApprovals(): Promise<ActionResult> {
    const approvals = await this.approvals.list();
    return okResult({ approvals }, { route: "safety", verified: true });
  }

  async decideApproval(params: {
    id: string;
    decision: "granted" | "denied";
    scope?: "once" | "session";
    ttl_seconds?: number;
  }): Promise<ActionResult> {
    try {
      const record = await this.approvals.decide(
        params.id,
        params.decision,
        params.scope ?? "once",
        params.ttl_seconds ?? 1800,
      );
      return okResult({ approval: record }, { route: "safety", verified: true });
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "safety" });
    }
  }
  async auditTail(params: { limit?: number } = {}): Promise<ActionResult> {
    const records = await this.audit.tail(Math.min(Math.max(params.limit ?? 20, 1), 200));
    return okResult({ records }, { route: "core", verified: true });
  }

  async playbookGet(params: { app?: string }): Promise<ActionResult> {
    if (!params.app) {
      return okResult({ apps: await this.memory.listApps() }, { route: "memory", verified: true });
    }
    const playbook = await this.memory.find(params.app);
    if (!playbook) {
      return failResult("unsupported", `no Playbook for ${JSON.stringify(params.app)}`, {
        route: "memory",
        next: "Run `appbridge add --window <title>` while the app is open.",
      });
    }
    return okResult({ playbook }, { route: "memory", verified: true });
  }

  async dialogList(params: { window_id?: string; window_title?: string }): Promise<ActionResult> {
    try {
      const window = await this.pickWindow(params);
      const observation = await this.observe({ window_id: window.id, skip_ocr: true });
      const dialogs = detectDialogs(observation.scene);
      const result = okResult({ dialogs, count: dialogs.length }, { route: "memory", verified: true, scene_id: observation.scene.id });
      await this.record("dialog.list", params, result, window.process_name);
      return result;
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "gateway" });
    }
  }

  async dialogHandle(params: {
    dialog_id?: string;
    action?: "choose" | "choose_path" | "cancel";
    button?: string;
    path?: string;
  }): Promise<ActionResult> {
    try {
      const { window, scene } = await this.observe({ window_id: undefined });
      const dialogs = detectDialogs(scene);
      const dialog = params.dialog_id
        ? dialogs.find((d) => d.id === params.dialog_id)
        : dialogs[0];

      if (!dialog) {
        return failResult("unsupported", params.dialog_id ? `dialog ${params.dialog_id} not found in current scene` : "no dialog detected in current scene", { route: "gateway" });
      }

      if (dialog.handoff || dialog.kind === "credential" || dialog.kind === "unknown") {
        const result = failResult("needs_human", `Dialog requires human intervention (${dialog.kind}): ${dialog.reason}`, {
          route: "safety",
          data: { dialog },
          next: "Please interact with the dialog manually, then resume.",
        });
        await this.record("dialog.handle", params, result, window.process_name);
        return result;
      }

      const action = params.action ?? dialog.suggested_action ?? "choose";

      if (action === "cancel") {
        const cancelBtn = findCancelButton(dialog);
        if (!cancelBtn) {
          return failResult("unsupported", "no cancel-like button found in dialog", { route: "gateway" });
        }
        return await this.click({ uid: cancelBtn.id });
      }

      if (action === "choose_path") {
        if (!params.path) {
          return failResult("unsupported", "choose_path requires a path parameter", { route: "gateway" });
        }
        const pathField = dialog.fields[0];
        if (pathField) {
          await this.setValue({ uid: pathField.id, value: params.path });
        }
        const confirmBtn = params.button
          ? findDialogButton(dialog, params.button)
          : dialog.buttons.find((b) => !["cancel", "no", "abort"].includes(b.name.toLowerCase())) ?? dialog.buttons[0];
        if (!confirmBtn) {
          return failResult("unsupported", "no confirm button found for file dialog", { route: "gateway" });
        }
        return await this.click({ uid: confirmBtn.id });
      }

      const targetBtn = params.button ? findDialogButton(dialog, params.button) : dialog.buttons[0];
      if (!targetBtn) {
        return failResult("unsupported", params.button ? `button ${params.button} not found in dialog` : "no buttons in dialog", { route: "gateway" });
      }
      return await this.click({ uid: targetBtn.id });
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "gateway" });
    }
  }

  async skillCompile(params: CompileInput): Promise<ActionResult> {
    try {
      const res = compileSkill(params);
      if (res.errors.length > 0 || !res.skill) {
        return failResult("unsupported", `skill compilation failed: ${res.errors.join("; ")}`, {
          route: "memory",
          data: { errors: res.errors, skipped: res.skipped },
        });
      }
      await this.skillStore.save(res.skill);
      const result = okResult({ skill: res.skill, skipped: res.skipped }, { route: "memory", verified: true });
      await this.record("skill.compile", { name: params.name, app_id: params.app_id }, result, params.app_id);
      return result;
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "gateway" });
    }
  }

  async skillRun(params: { skill_id: string; app_id?: string; params?: Record<string, unknown> }): Promise<ActionResult> {
    try {
      const appId = params.app_id ?? "";
      let skill: Skill | null = null;
      if (appId) {
        skill = await this.skillStore.get(appId, params.skill_id);
      } else {
        const apps = await this.memory.listApps();
        for (const app of apps) {
          skill = await this.skillStore.get(app.id, params.skill_id);
          if (skill) break;
        }
        if (!skill) {
          skill = await this.skillStore.find(appId, params.skill_id);
        }
      }

      if (!skill) {
        return failResult("unsupported", `skill ${params.skill_id} not found`, { route: "memory" });
      }

      if (!skill.steps || skill.steps.length === 0) {
        return failResult("unsupported", `skill ${params.skill_id} has no steps`, { route: "memory" });
      }

      const { values: paramValues, errors: paramErrors } = prepareSkillParams(skill, params.params);
      if (paramErrors.length > 0) {
        return failResult("unsupported", `invalid parameters: ${paramErrors.join("; ")}`, { route: "memory" });
      }

      const stepResults: Array<{ step: number; act: string; ok: boolean; result: ActionResult }> = [];
      let ok = true;
      let failureResult: ActionResult | null = null;

      for (let i = 0; i < skill.steps.length; i++) {
        const step = skill.steps[i];
        let stepResult: ActionResult;

        const observation = await this.observe({ skip_ocr: true }).catch(() => null);

        switch (step.act) {
          case "click": {
            if (!observation) {
              stepResult = failResult("wrong_state", "cannot observe window for click", { route: "gateway" });
              break;
            }
            let resolved = resolveSkillSelector(observation.scene, step.target);
            if (!resolved.element) {
              // Retry observation once after 250ms delay for dynamic UI renders
              await new Promise((r) => setTimeout(r, 250));
              const retryObs = await this.observe({ skip_ocr: true }).catch(() => null);
              if (retryObs) {
                resolved = resolveSkillSelector(retryObs.scene, step.target);
              }
            }
            if (!resolved.element) {
              const available = observation.scene.elements.slice(0, 5).map((e) => `${e.role}:${e.name}`).join(", ");
              stepResult = failResult("wrong_state", `${resolved.error ?? "element not found"}; scene elements: [${available}]`, { route: "floor" });
              break;
            }
            stepResult = await this.click({
              uid: resolved.element.id,
              button: step.button,
              count: step.count,
              expect: step.expect ? (substituteExpectation(step.expect, paramValues) as Expectation) : undefined,
              timeout_ms: step.timeout_ms,
            });
            break;
          }
          case "type": {
            const text = substituteParams(step.text, paramValues);
            let uid: string | undefined;
            if (step.target && observation) {
              let resolved = resolveSkillSelector(observation.scene, step.target);
              if (!resolved.element) {
                await new Promise((r) => setTimeout(r, 250));
                const retryObs = await this.observe({ skip_ocr: true }).catch(() => null);
                if (retryObs) {
                  resolved = resolveSkillSelector(retryObs.scene, step.target);
                }
              }
              if (resolved.element) uid = resolved.element.id;
            }
            stepResult = await this.type({
              uid,
              text,
              submit: step.submit,
              expect: step.expect ? (substituteExpectation(step.expect, paramValues) as Expectation) : undefined,
              timeout_ms: step.timeout_ms,
            });
            break;
          }
          case "key": {
            stepResult = await this.key({
              combo: step.combo,
              expect: step.expect ? (substituteExpectation(step.expect, paramValues) as Expectation) : undefined,
              timeout_ms: step.timeout_ms,
            });
            break;
          }
          case "set_value": {
            if (!observation) {
              stepResult = failResult("wrong_state", "cannot observe window for set_value", { route: "gateway" });
              break;
            }
            const resolved = resolveSkillSelector(observation.scene, step.target);
            if (!resolved.element) {
              stepResult = failResult("wrong_state", resolved.error ?? "element not found", { route: "floor" });
              break;
            }
            const value = substituteParams(step.value, paramValues);
            stepResult = await this.setValue({ uid: resolved.element.id, value });
            break;
          }
          case "scroll": {
            let uid: string | undefined;
            if (step.target && observation) {
              const resolved = resolveSkillSelector(observation.scene, step.target);
              if (resolved.element) uid = resolved.element.id;
            }
            stepResult = await this.scroll({
              uid,
              direction: step.direction,
              amount: step.amount,
              expect: step.expect ? (substituteExpectation(step.expect, paramValues) as Expectation) : undefined,
              timeout_ms: step.timeout_ms,
            });
            break;
          }
          case "wait_for": {
            stepResult = await this.waitFor({
              name: step.name ? substituteParams(step.name, paramValues) : undefined,
              role: step.role,
              window_title_contains: step.window_title_contains ? substituteParams(step.window_title_contains, paramValues) : undefined,
              timeout_ms: step.timeout_ms,
            });
            break;
          }
          case "focus_window": {
            stepResult = await this.focusWindow({
              window_title: step.title ? substituteParams(step.title, paramValues) : undefined,
            });
            break;
          }
          case "dialog": {
            stepResult = await this.dialogHandle({
              dialog_id: step.dialog_id,
              action: step.action,
              button: step.button ? substituteParams(step.button, paramValues) : undefined,
              path: step.path ? substituteParams(step.path, paramValues) : undefined,
            });
            break;
          }
          case "expect": {
            stepResult = okResult({ expectation: substituteExpectation(step.expect, paramValues) }, { route: "verify", verified: true });
            break;
          }
          default: {
            stepResult = failResult("unsupported", `unknown step act: ${(step as { act: string }).act}`, { route: "gateway" });
            break;
          }
        }

        stepResults.push({ step: i + 1, act: step.act, ok: stepResult.ok, result: stepResult });

        if (!stepResult.ok) {
          ok = false;
          failureResult = stepResult;
          break;
        }
      }

      await this.skillStore.recordRun(skill.app_id, skill.id, ok);
      const summary: SkillSummary = {
        id: skill.id,
        app_id: skill.app_id,
        name: skill.name,
        description: skill.description,
        steps: skill.steps.length,
        source: skill.source,
        runs: (skill.stats?.runs ?? 0) + 1,
        successes: (skill.stats?.successes ?? 0) + (ok ? 1 : 0),
        updated_at: new Date().toISOString(),
      };

      if (!ok && failureResult) {
        return {
          ...failureResult,
          data: {
            skill_id: skill.id,
            failed_at_step: stepResults.length,
            trace: stepResults,
            summary,
          },
        };
      }

      return okResult(
        {
          skill_id: skill.id,
          completed_steps: stepResults.length,
          trace: stepResults,
          summary,
        },
        { route: "memory", verified: true },
      );
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "gateway" });
    }
  }

  async labRun(params: { skill_id: string; app_id?: string; params?: Record<string, unknown> }): Promise<ActionResult> {
    try {
      const startTime = Date.now();
      const result = await this.skillRun(params);
      const labDir = join(this.paths.home, "lab");
      await mkdir(labDir, { recursive: true });
      const metrics = {
        skill_id: params.skill_id,
        app_id: params.app_id ?? null,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
        result: result.ok ? "ok" : result.class,
        verified: result.verified,
        reason: result.reason ?? null,
        data: result.data ?? null,
      };
      await writeFile(join(labDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
      return okResult({ metrics, result }, { route: "memory", verified: true });
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "gateway" });
    }
  }

  async memoryStoreGet(params: { app_id: string; skill_id: string }): Promise<ActionResult> {
    try {
      const skill = await this.skillStore.get(params.app_id, params.skill_id);
      if (!skill) {
        return failResult("unsupported", "skill not found", { route: "memory" });
      }
      return okResult({ skill }, { route: "memory", verified: true });
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "memory" });
    }
  }

  async memoryStoreList(params: { app_id: string }): Promise<ActionResult> {
    try {
      const summaries = await this.skillStore.list(params.app_id);
      return okResult({ summaries }, { route: "memory", verified: true });
    } catch (error) {
      return failResult("unsupported", error instanceof Error ? error.message : String(error), { route: "memory" });
    }
  }

  async addApp(params: { window_title?: string; window_id?: string; notes?: string[] }): Promise<ActionResult> {
    const observation = await this.observe(params);
    const playbook: Playbook = playbookFromScene(observation.scene, params.notes ?? []);
    await this.memory.save(playbook);
    const result = okResult(
      {
        playbook,
        summary: {
          app: playbook.app.name,
          technology: playbook.app.technology,
          grade: playbook.grade,
          controls: playbook.ui_map.windows[0]?.controls.length ?? 0,
          risky_controls: playbook.risk_map.length,
          window_titles: playbook.app.window_titles,
        },
      },
      { route: "memory", verified: true, scene_id: observation.scene.id },
    );
    await this.record("app.add", params, result, playbook.app.name);
    return result;
  }


  // ── Teach Mode: Skill Recording ─────────────────────────────────────────

  /** Start a Teach-mode recording session for the given app/window. */
  async skillRecordStart(params: {
    app_id: string;
    window_title: string;
    name: string;
    description?: string;
  }): Promise<ActionResult> {
    const id = `rec-${Date.now()}`;
    this.recordSession = {
      id,
      app_id: params.app_id,
      window_title: params.window_title,
      name: params.name,
      description: params.description ?? "",
      events: [],
      started_at: new Date().toISOString(),
    };
    return okResult(
      { session_id: id, app_id: params.app_id, window_title: params.window_title, name: params.name },
      { route: "teach", verified: false },
    );
  }

  /** Append one event to the active recording session. */
  skillRecordEvent(params: {
    act?: string;
    tool?: string;
    target?: { role?: string; name?: string; automation_id?: string };
    text?: string;
    combo?: string;
    value?: string;
    direction?: string;
    amount?: number;
    button?: string;
    count?: number;
    submit?: boolean;
    note?: string;
  }): ActionResult {
    if (!this.recordSession) {
      return failResult("unsupported", "no active recording session; call skill.record_start first", { route: "teach" });
    }
    const toolName = params.tool ?? (params.act ? (params.act.includes(".") ? params.act : `ui.${params.act}`) : "ui.click");
    const event: RecordedEvent = {
      ts: new Date().toISOString(),
      tool: toolName,
      app_id: this.recordSession.app_id,
      window_title: this.recordSession.window_title,
      target: params.target,
      text: params.text,
      combo: params.combo,
      value: params.value,
      direction: params.direction as "up" | "down" | "left" | "right" | undefined,
      amount: params.amount,
      button: params.button as "left" | "right" | "middle" | undefined,
      count: params.count,
      submit: params.submit,
    };
    this.recordSession.events.push(event);
    return okResult(
      { event_index: this.recordSession.events.length - 1, event },
      { route: "teach", verified: false },
    );
  }

  /** Stop the recording session and compile it into a Skill via skillCompile. */
  async skillRecordStop(params: { params?: Record<string, unknown> } = {}): Promise<ActionResult> {
    if (!this.recordSession) {
      return failResult("unsupported", "no active recording session", { route: "teach" });
    }
    const session = this.recordSession;
    this.recordSession = undefined;
    const compileInput: CompileInput = {
      app_id: session.app_id,
      window_title: session.window_title,
      name: session.name,
      description: session.description,
      params: (params.params ?? {}) as Record<string, import("@appbridge/memory").SkillParamSpec>,
      events: session.events,
    };
    return this.skillCompile(compileInput);
  }

  async inventory(): Promise<ActionResult> {
    const windows = await this.driver.listWindows();
    const processes = await this.driver.listProcesses();
    let installedApps: unknown[] = [];
    try {
      installedApps = await this.driver.listInstalledApps();
    } catch {
      // Driver might not support on some platforms
    }
    const running = windows
      .filter((window) => window.visible && window.title.trim().length > 0)
      .map((window) => ({
        window_id: window.id,
        title: window.title,
        process_name: window.process_name,
        pid: window.pid,
        class_name: window.class_name,
        technology: playbookFromScene({
          ...emptyScene(),
          app: window.process_name,
          window: window.title,
          data: { class_name: window.class_name },
        }).app.technology,
      }));
    const device = {
      generated_at: new Date().toISOString(),
      platform: process.platform,
      windows: windows,
      running_apps: running,
      process_count: processes.length,
      installed_apps_count: installedApps.length,
      installed_apps: installedApps.slice(0, 500),
    };
    await writeFile(this.paths.device, `${JSON.stringify(device, null, 2)}\n`, "utf8");
    return okResult(device, { route: "inventory", verified: true });
  }

  async drag(params: {
    from_uid?: string;
    to_uid?: string;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
  }): Promise<ActionResult> {
    const observation = await this.observe({ skip_ocr: true });
    let startPt = params.from;
    let endPt = params.to;
    if (params.from_uid) {
      const el = observation.scene.elements.find((e) => e.id === params.from_uid);
      if (el) startPt = centerOf(el);
    }
    if (params.to_uid) {
      const el = observation.scene.elements.find((e) => e.id === params.to_uid);
      if (el) endPt = centerOf(el);
    }
    if (!startPt || !endPt) {
      return failResult("unsupported", "drag requires valid from and to coordinates or element uids", { route: "floor" });
    }
    const gate = await this.gate("write", observation.window, "drag", "drag and drop");
    if (!gate.allowed) return gate.result as ActionResult;
    await this.driver.drag(startPt, endPt);
    const after = await this.observe({ skip_ocr: true });
    const result = okResult({ from: startPt, to: endPt }, { route: "floor", verified: true, scene_id: after.scene.id });
    await this.record("ui.drag", params, result, observation.window.process_name);
    return result;
  }

  /** Dispatch shared by the REST surface and the CLI. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ActionResult> {
    switch (name) {
      case "screen.describe":
        return this.describe(args as DescribeParams);
      case "screen.capture":
        return this.capture(args as { window_id?: string; window_title?: string; region?: Rect; scale?: number });
      case "screen.ocr":
        return this.ocr(args as unknown as TargetParams & { region?: Rect; scale?: number });
      case "ui.find":
        return this.find(args as TargetParams & { query?: string; limit?: number });
      case "ui.click":
        return this.click(args as TargetParams & { button?: "left" | "right" | "middle"; count?: number });
      case "ui.type":
        return this.type(args as unknown as TargetParams & { text: string; submit?: boolean });
      case "ui.key":
        return this.key(args as unknown as { combo: string } & TargetParams);
      case "ui.set_value":
        return this.setValue(args as { uid: string; value: string });
      case "ui.scroll":
        return this.scroll(
          args as unknown as TargetParams & { direction: "up" | "down" | "left" | "right"; amount?: number },
        );
      case "ui.drag":
        return this.drag(args as { from_uid?: string; to_uid?: string; from?: { x: number; y: number }; to?: { x: number; y: number } });
      case "ui.wait_for":
        return this.waitFor(args as { name?: string; role?: string; window_title_contains?: string; timeout_ms?: number });
      case "apps.list":
        return this.listApps();
      case "window.list":
        return this.listWindows();
      case "window.focus":
        return this.focusWindow(args as { window_id?: string; window_title?: string });
      case "window.action":
        return this.windowAction(args as { window_id?: string; window_title?: string; action: "minimize" | "maximize" | "restore" | "close" });
      case "clipboard.get":
        return this.clipboardGet();
      case "clipboard.set":
        return this.clipboardSet(args as { text: string });
      case "filesystem.roots":
        return this.filesystemRoots();
      case "filesystem.list":
        return this.filesystemList(args as { path?: string });
      case "filesystem.read":
        return this.filesystemRead(args as { path: string; start_line?: number; max_lines?: number });
      case "filesystem.search":
        return this.filesystemSearch(args as { query: string; path?: string; max_results?: number });
      case "filesystem.write":
        return this.filesystemWrite(args as { path: string; content: string });
      case "filesystem.edit":
        return this.filesystemEdit(args as { path: string; old_text: string; new_text: string });
      case "terminal.list":
        return this.terminalList();
      case "terminal.run":
        return this.terminalRun(args as {
          shell: TerminalShell;
          command: string;
          cwd?: string;
          timeout_ms?: number;
        });
      case "app.launch":
        return this.launch(args as { path: string; args?: string[] });
      case "playbook.get":
        return this.playbookGet(args as { app?: string });
      case "session.status":
        return this.status();
      case "session.stop":
        return this.stop();
      case "session.resume":
        return this.resume();
      case "audit.tail":
        return this.auditTail(args as { limit?: number });
      case "dialog.list":
        return this.dialogList(args as { window_id?: string; window_title?: string });
      case "dialog.handle":
        return this.dialogHandle(args as { dialog_id?: string; action?: "choose" | "choose_path" | "cancel"; button?: string; path?: string });
      case "skill.compile":
        return this.skillCompile(args as unknown as CompileInput);
      case "skill.run":
        return this.skillRun(args as { skill_id: string; app_id?: string; params?: Record<string, unknown> });
      case "lab.run":
        return this.labRun(args as { skill_id: string; app_id?: string; params?: Record<string, unknown> });
      case "memory.store.get":
        return this.memoryStoreGet(args as { app_id: string; skill_id: string });
      case "memory.store.list":
        return this.memoryStoreList(args as { app_id: string });
      case "apps.describe":
        return this.addApp(args as { window_title?: string; window_id?: string; notes?: string[] });
      case "skill.record_start":
        return this.skillRecordStart(args as { app_id: string; window_title: string; name: string; description?: string });
      case "skill.record_event":
        return this.skillRecordEvent(args as { act: string; target?: Record<string, string>; text?: string; combo?: string; value?: string; direction?: string; amount?: number; button?: string; note?: string });
      case "skill.record_stop":
        return this.skillRecordStop(args as { params?: Record<string, unknown> });
      case "inventory":
        return this.inventory();
      case "approval.list":
        return this.listApprovals();
      case "approval.decide":
        return this.decideApproval(args as { id: string; decision: "granted" | "denied"; scope?: "once" | "session"; ttl_seconds?: number });
      default:
        return failResult("unsupported", `unknown tool: ${name}`, { route: "gateway" });
    }
  }
}

function sceneHas(scene: Scene, role: string | undefined, name: string | undefined): boolean {
  if (!name) return false;
  const needle = name.trim().toLowerCase();
  return scene.elements.some(
    (element) =>
      (!role || element.role.toLowerCase() === role.toLowerCase()) &&
      element.name.trim().toLowerCase() === needle,
  );
}

function emptyScene(): Scene {
  return {
    id: "s0",
    ts: 0,
    app: "",
    window: "",
    stable: true,
    sources: [],
    elements: [],
    dialogs: [],
    data: {},
  };
}
