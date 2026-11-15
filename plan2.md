# Appbridge: Plan 2 (what is done, what is left)

> **Historical.** This review reflects the build on 2026-11-06. Current status lives in
> [`docs/status.md`](./docs/status.md) and the current gap analysis and roadmap in
> [`gap_plan.md`](./gap_plan.md).

> **Written:** 2026-11-06, after reviewing `D:\claude\appbridge` against `plan.md`.
> **Companion to `plan.md`, not a replacement.** `plan.md` stays the master plan and the source of
> section numbers. This file says how far the code has actually got and what remains, in the order
> I would do it.

## Contents
1. Verdict
2. How this review was done, and its limits
3. Scorecard against plan.md
4. Phase 1 checklist (the phase the code is in)
5. Problems found in the current code
6. Remaining work, in order (milestones M0 to M9)
7. Gaps against the parity checklist (plan section 4)
8. Plan section 24 open decisions: where they stand
9. Housekeeping
10. Suggested next 10 working days

---

## 1. Verdict

**The project is not done. It is roughly 60-70% of Phase 1 and about 15% of the whole plan.**

What exists is a real, well-structured vertical slice: a Windows Floor (UI Automation host, input
synthesis, local OCR, Scene v0, verification), a safety harness (effect classifier, Action
Firewall, approvals, kill switch, hash-chained audit), an MCP + REST + CLI surface, App Memory v0
(Playbooks), Connect Hub v0 and the Universality lint. The architecture follows the plan closely
and the code I read is careful and honest about its limits.

What is **not** true yet:

- **The newest work is broken.** The last edit to `packages/gateway/src/bridge.ts` (modified today at
  20:35) added dialog, Skill and lab methods that very likely do not compile and, even if they
  did, would not work (section 5.1). Until that is fixed, `npm run build` should be assumed red.
- **The Phase 1 exit criterion has never been measured.** The plan's gate is "an external AI
  completes the Outlook-2012-style test on a stand-in old app, with approvals on Send, on at least
  70% of runs". There is no stand-in app, no harness and no measurement.
- **Phase 0 was skipped.** No `docs/spike-notes.md`, no OCR/detector/VLM bake-off, no baseline
  computer-use agent run, no VM spike, no api-anything/REA run-through.
- **Everything from Phase 2 onward is not started**: Task Pilot, provider layer, built-in chat,
  UI detector/VLM, Skill recording and healing, App Packs, VM workspace, accelerators, GUI,
  other platforms.

---

## 2. How this review was done, and its limits

**Read in full:** `plan.md`, `README.md`, `docs/status.md`, `package.json`, `tsconfig.json`,
`scripts/universality-lint.mjs`, `packages/cli/src/index.ts`, `packages/connect/src/clients.ts`,
`packages/core/src/{index,types,config}.ts`, `packages/gateway/src/{bridge,mcp,http,index}.ts`,
`packages/memory/src/*`, `packages/floor/src/{driver,verify,windows-driver,index}.ts`,
`packages/safety/src/{injection,index}.ts`, and the package manifests.

**Only seen as file names, not read line by line:** `floor/src/scene.ts`, `native-host.ts`,
`keys.ts`, `floor/native/uia-host.ps1`, `safety/src/{risk,firewall,approvals}.ts`,
`core/src/{audit,paths,result,ids,log}.ts`, and all `*.test.ts` files. For these I rely on
`docs/status.md` and the file layout. Treat statements about them as "claimed by status.md, not
re-verified here".

**Not done:** I did not run `npm run build`, `npm test`, `appbridge doctor` or any app. Every
claim below about compile errors comes from reading the source, not from compiler output. Run
`npm run check` first (milestone M0) to confirm.

**Timeline clue:** `docs/status.md` was last edited at 18:32. `memory/src/skills.ts` was created at
18:51 and `bridge.ts` was last changed at 20:35. So Skills, dialog detection and the lab command
are newer than the status document, have no tests, and are not described there.

---

## 3. Scorecard against plan.md

Legend: **Done** = implemented as the plan describes (for this phase). **Partial** = some of it.
**Missing** = not started. **Broken** = code exists but does not work as written.

| Plan section | Area | State | Notes |
|---|---|---|---|
| 3.2 | Universality Contract | Partial | Lint exists and scans 7 packages. No CI pipeline (no workflow file), no held-out app set, no technology-class sampling. |
| 6 | Architecture (daemon, workers) | Partial | One in-process `Bridge` plus one long-lived PowerShell host. No `appbridged` daemon, no sandboxed workers, no process separation. Acceptable for a slice. |
| 7.1 | Perception: accessibility + metadata + OCR | Done | UIA tree, window metadata, Windows OCR, fused Scene, cost policy (OCR only when UIA is sparse). |
| 7.1 | Perception: detector, VLM grounding, pixel diff | Missing | Only content-digest stability. No detector, no VLM, no annotated screenshot. |
| 7.2 | Stable element identity (selector bundle) | Partial | role + name + automation id + index. No tree path, no visual anchor, no relative geometry, no confidence scoring across strategies. |
| 7.3 | Action | Partial | Invoke/Toggle/Select/Expand, SetValue, Unicode typing, key combos, click, drag (driver only), scroll, clipboard (text only), window actions. No hover, press-and-hold, region select, file/image clipboard, menu-path helper. |
| 7.3 | Dialog handlers | Broken | Good generic detector in `memory/dialogs.ts`, but the bridge does not use it (5.1). |
| 7.3 | Text-mode apps | Missing | No terminal/emulator buffer reading. |
| 7.4 | Verify | Done | Expectations, stability wait, honest result classes. |
| 7.4 | Recover | Missing | No recovery ladder, no stall/loop detection, no hang ("Not Responding") detection. `error_dialog` class exists but I found nothing that returns it. |
| 7.5 | Speed and cost controls | Partial | Structured Scene first, OCR on demand. No budgets, no caching, no small-model micro-decisions. |
| 8 | Agent Workspace | Missing | Shared desktop only, and without user-yield (section 4 below). |
| 9 | Playbook | Partial | v0 is a UI map plus risk map from one Scene. No help-file reading, no safe exploration, no demonstration, no run-history capture. |
| 9.3 | Skill | Broken | Declarative format, validation, param handling and selector resolution exist in `skills.ts`. The execution path in `bridge.ts` is broken (5.1). |
| 9.4 | Explore, compile, heal loop | Missing | Nothing records trajectories, no verification gate, no healer. |
| 9.5 | Learning-data privacy | Missing | No encrypted trajectory store, no redaction, no retention. |
| 10 | Accelerators (S0-S7, G-*) | Missing | None. REA/api-anything reuse not started. |
| 10.4 | Grades | Partial | Every app is `bronze`. No path to silver/gold/platinum, no `restricted`. |
| 11.1 | Add-app flow | Partial | `appbridge add` captures an open window only. No installed-app picker, website, shortcut, "Learn this app" run, grade report, progress UI. |
| 11.2 | Device inventory | Partial | `device.json` has windows, running apps, process count. The driver can list installed apps but `inventory()` does not call it. No services, ports, COM, CLI tools, web apps, data stores. |
| 11.3 | Fingerprinting | Partial | Regex on window class/process name only. No PE/imports, bundled-runtime, COM, URL scheme analysis. |
| 11.4 | Discovery pipeline | Missing | Probe, explore, draft, verify, review, publish, maintain: none. |
| 12.1 | Provider layer, capability negotiation | Missing | Only config flags (`egress.mode`) that nothing enforces. |
| 12.2 | Interfaces | Partial | MCP stdio, REST + OpenAPI, CLI: done. Function-call schema export, SDKs, built-in chat, Remote Access: missing. |
| 12.3 | Tool-mode tool set | Partial | 21 MCP tools. Missing from MCP: `app.launch`, dialog, skill, memory tools. Missing everywhere: `scene.diff`, `apps.describe`, `ui.select_menu`, `ui.drag`, `window.resize`, `file.pick`, `approval.request`, `handoff.request`, `session.plan`, `skill.record_*`, `ops.*`. |
| 12.4 | Task mode / Pilot | Missing | |
| 12.5 | Built-in assistant, Teach, Explain | Missing | |
| 13 | App Packs | Missing | No exporter, importer, sanitizer, signing, ONBOARD_PROMPT. |
| 14 | Connect Hub | Partial | 8 clients, JSON/TOML/CLI writers, backup + undo. Not verified against real configs. No skill/rules install, no test call, no `.mcpb`/plugin bundles, no client-matrix test. |
| 15.1 | Offline-first | Partial | By construction there is no network code in the product. No offline self-test, no air-gapped mode, no outbound-connection test. |
| 15.2 | Hardware profiles | Missing | No GPU/RAM detection, no Fast/Balanced/Best, no benchmark. |
| 16.1 | Action Firewall | Done | Effect classifier, policy, approvals, grants. |
| 16.2 | Permissions | Partial | Policy is global per effect. No per AI client x per app permissions, no default blocklist (password managers, banking, anti-cheat), no plan approval. Time-boxed grants exist. |
| 16.3 | Handoff | Partial | `needs_human` exists; no `handoff.request` tool and no resume protocol beyond `session.status`. |
| 16.4 | Irreversibility | Missing | No snapshots, shadow copies, drafts-first logic, preview-before-commit, idempotency keys. |
| 16.5 | Screen injection | Partial | Heuristic flags and `untrusted` marking. No taint tracking. `safety.untrusted_requires_approval` exists in config but I saw nothing in `bridge.ts` that reads it. No red-team corpus. |
| 16.6 | Privacy / egress | Missing | `screen.capture` returns a raw PNG to the AI with no masking of password fields, card numbers or user-defined regions. No sensitivity labels, no data-flow report. |
| 16.7 | Gateway security | Partial | Loopback, bearer token, Host/Origin check, body cap, no-store: done. Single shared token (not per-client, not hashed). "Mode 0600" on Windows does not restrict access; it needs an ACL. No named-pipe transport. Audit log chain: done. |
| 17 | Legal boundary | Partial | Refusals by design are in the code comments and README. No first-run acknowledgement, no per-app terms notes, no blocklist. |
| 19 | Repository layout | Partial | 7 of about 17 planned packages exist. No `providers`, `pilot`, `workspace`, `learn`, `accel`, `inventory`, `vault`, `ui`. No `labs/`, `redteam/`, `playbooks/`, `skills/`, `docs/spike-notes.md`. |
| 20 | Platforms | Windows only | As planned for now. |
| 21 | Testing | Partial | ~15 unit tests in core/safety/floor. None for gateway, memory (skills, dialogs), connect, cli. No App Lab, conformance suite, benchmark, fuzzing, red-team, client matrix. The `scratch/*.mjs` smoke scripts are not wired into any script. |
| 22 | Roadmap Phase 0 | Missing | No spikes, no gate document. |
| 22 | Roadmap Phase 1 | In progress | See section 4. |
| 22 | Phases 2 to 9 | Missing | |

---

## 4. Phase 1 checklist (plan section 22, Phase 1)

| Phase 1 item | State |
|---|---|
| Capture | Done (`screen.capture`, unmasked; see 16.6 gap) |
| Accessibility + Win32 trees | Partial: UIA only. No separate Win32 child-control or MSAA path |
| OCR | Done (Windows OCR, `en-US` only on the dev machine) |
| Input synthesis | Done (see section 7 for gaps) |
| Window management | Partial: no move/resize tool |
| Verify/recover basics | Partial: verify done, recover not |
| Scene v0 | Done |
| MCP tool mode, `appbridge mcp`, `appbridge serve` | Done |
| Action Firewall v0, audit, kill switch | Done (kill switch is a file/CLI/MCP tool only; no hotkey) |
| Shared-desktop workspace **with user-yield** | **Missing**: no detection of user input, no pause/resume, no "AI is working" indicator, no stop hotkey (plan: yield latency < 300 ms) |
| Connect Hub v0 (+ Antigravity) | Partial: written, compiled, not exercised against real client configs |
| App Memory store v0 | Done (Playbook v0, run-history file format; the bridge never writes run history) |
| Hardware auto-detect and profiles | Missing |
| Provider abstraction + capability negotiation | Missing |
| Offline self-test | Missing |
| Universality Contract CI lint | Partial: script yes, CI no |
| Text-only-model Scene | Done (`formatScene`) |
| **Exit: external AI passes the stand-in test on >= 70% of runs** | **Not attempted** |

---

## 5. Problems found in the current code

### 5.1 `packages/gateway/src/bridge.ts` (blocking)

The file is 58,495 bytes. `bridge.ts.backup` next to it has exactly the same size and was created at
19:21, so it is probably a copy of an already-broken version and **not a clean restore point**.

Compile-level problems (from reading; confirm with `tsc -b`):

1. **Constructor uses `await`.** `this.skillStore = new (await import("@appbridge/memory")).SkillStore(home)`
   inside a non-async constructor is a syntax/semantic error. `skillStore` is also never declared
   as a class field.
2. **Wrong imports.** `mkdir` is imported from `node:fs` (the callback version) but used as
   `await mkdir(..., { recursive: true })` in `labRun`. `writeFile` is not imported at module level
   (only a local dynamic import inside `inventory()`), yet `labRun` uses it.
3. **Broken string literal in `labRun`.** The metrics line opens a template literal with a backtick
   and closes it with a double quote (`` `${JSON.stringify(metrics, null, 2)}\n", "utf8" ``). That is
   a syntax error and will swallow the code after it.
4. **Non-existent fields.** `skillRun` and `labRun` read `params.app_id`, which is not in their
   parameter types. `labRun` reads `result.chosen_button`, which does not exist on `ActionResult`.
   `failResult("failed", ...)` uses a class that is not in `ResultClass`.
5. **Wrong store calls.** `skillCompile` calls `this.memory.get(params.app_id, skillId)` and
   `this.memory.save(skill)`, but `MemoryStore` stores **Playbooks**, `get` takes one argument, and
   `save` writes `playbook.json`. Skills belong in `SkillStore`.
6. Several imports are unused (`detectDialogs`, `validateSkill`, `prepareSkillParams`,
   `substituteExpectation`, `CompileInput`, `RecordedEvent`). This only fails the build if
   `noUnusedLocals` is on in `tsconfig.base.json` (not read).

Logic problems (would remain after it compiles):

7. **`skillRun` reports failure on success.** The success branch is `if (ok && lastResult)`, but
   `lastResult` is only assigned when a step fails, so the success path falls through to
   `failResult("failed", ...)`.
8. **`skillRun` ignores most of the Skill format.** It never calls `prepareSkillParams`,
   `substituteParams` or `substituteExpectation`, never uses `resolveSkillSelector`, and drops each
   step's `expect` and `timeout_ms`. The `expect` step is a no-op. `type` ignores its target.
   `scroll` passes empty roles.
9. **Selector misuse.** It passes `automation_id` as `uid`, but `uid` means a Scene id like `e12`.
10. **A second Bridge per run.** `const gateway = new Bridge(...)` starts another PowerShell host and
    approval store on every Skill run and never closes it. It should use `this`.
11. **Stats bugs.** `recordRun(params.skill_id, skill.id, ok)` has the arguments in the wrong order
    (should be app id, then skill id). `skill.stats?.runs ?? 0 + 1` has an operator-precedence bug.
12. **`skillCompile` never compiles.** It ignores `events`, never calls `compileSkill`, and builds a
    skill with `steps: []`, which `validateSkill` rejects.
13. **`dialogHandle` clicks nothing.** It picks a button name and returns "ok" with
    `verified: true`. It does not support `choose_path`, `cancel` or `path`, and it observes the
    focused window instead of the dialog's window. That is a false-success result, which breaks
    plan principle 5 (honest results).
14. **`dialogList` re-implements `detectDialogs` badly.** The detector in `memory/dialogs.ts` is good
    (multilingual, classifies credential, save-changes, file-picker, print and message-box). The
    bridge ignores it and returns `kind: "message_box"` or `"unknown"`, so the **credential/UAC
    handoff rule is bypassed**.
15. When `dialog.handle` is fixed to really click, it must go through the same `click()` / Firewall
    path. Today it has no gate at all.

### 5.2 Surfaces out of sync

- `mcp.ts` registers 21 tools. `http.ts` advertises 29. The 8 missing from MCP: `app.launch`,
  `dialog.list`, `dialog.handle`, `skill.compile`, `skill.run`, `lab.run`, `memory.store.get`,
  `memory.store.list`. The README and `status.md` still say 21.
- CLI: `appbridge lab run` calls `lab.run` with `{}`, but `labRun` needs `skill_id`, so it always
  fails. `appbridge skill list` passes `app_id: ""` when no app is given. The `skill` command
  declares `const` directly inside a `case` without braces.
- `app.launch` exists in REST and the CLI path but not MCP, and its `gate()` call fakes a
  `WindowSummary` with a type cast.

### 5.3 Documentation drift

- `plan.md` header still says "planning, nothing built yet".
- `docs/status.md` predates Skills, dialogs and lab (see section 2) and says "No Skills compiler".
- `README.md` says "MCP stdio (21 tools)" and does not mention the dialog/skill/lab commands the CLI
  help now lists.

### 5.4 Safety and security items in code that exists

- `screen.capture` and `screen.describe` give raw pixels/text to the AI with no masking (plan 16.6).
- Gateway token file "mode 0600" is not meaningful on Windows. Use an ACL (for example `icacls`
  granting only the current user) and verify.
- The token is printed on every `serve` start; README says "printed once".
- Approvals are read-modify-written from several processes (already listed in `status.md`).
- `safety.untrusted_requires_approval` is read from config and validated but, in the files I read,
  not enforced. Plan 16.5 requires taint tracking after reading untrusted content.
- `launch()` is gated as `write` with a fake window object; there is no allow-list or path check.

---

## 6. Remaining work, in order

Sizes: **S** = under a day, **M** = 1 to 3 days, **L** = about a week, **XL** = several weeks
(1-2 developers with AI assistance, matching the plan's assumptions).

### M0. Get back to green (do this first) (S to M)

1. Run `npm run check` and record the real output.
2. Fix `bridge.ts` per 5.1. Recommended shape:
   - Import `SkillStore` and `compileSkill` statically; add `readonly skills: SkillStore`.
   - `skillCompile`: call `compileSkill(input)`; return its `skipped` and `errors`; save with
     `SkillStore`.
   - `skillRun`: use `this`; `prepareSkillParams` then, per step, `resolveSkillSelector` against a
     fresh Scene and call the existing `click/type/key/setValue/scroll/waitFor` methods (so the
     Firewall applies to every step); honor `expect` and `timeout_ms`; stop at the first failure
     and return that step's result with the step index; on success return `ok` with a per-step
     trace; call `recordRun(appId, skillId, ok)` and `MemoryStore.recordRun`.
   - `dialogList`: call `detectDialogs(scene)`.
   - `dialogHandle`: resolve the dialog, refuse `credential` and `unknown` kinds with
     `needs_human`, and click buttons through `click()`; implement `choose_path` (set the field,
     then click the confirm button, approval-gated).
   - Delete `bridge.ts.backup`.
3. Register the 8 missing tools in `mcp.ts` (or deliberately remove them from `http.ts`), and make
   the CLI `lab` command take a skill id.
4. Add tests: `skills.test.ts` (compile, params, selector resolution, ambiguity), `dialogs.test.ts`
   (each kind, multilingual buttons, credential handoff), and a `Bridge` test using a fake
   `DeviceDriver` (the interface already supports injection through `BridgeOptions.driver`). Add
   `memory` and `gateway` to the `test` script.
5. Update `docs/status.md`, `README.md` and the `plan.md` status line.

**Done when:** `npm run check` is green, a fake-driver test runs a compiled Skill end to end, and
`dialog.handle` on a credential dialog returns `needs_human`.

### M1. Finish Phase 1 (plan section 22) (L)

1. **User-yield and indicator** (plan 8, Phase 1): detect real mouse/keyboard input
   (low-level hook or `GetLastInputInfo`) distinct from synthetic input, pause the action loop,
   resume when idle, show a visible "AI is working" indicator, add a global stop hotkey that
   writes `HALT`. Target: stop within 300 ms.
2. **Provider layer v0** (12.1): OpenAI-compatible adapter plus capability negotiation (vision?,
   tools?, context?). Needed for the built-in chat and Task mode, and for enforcing
   `egress.mode = local-only`.
3. **Hardware detect + profiles** (15.2): GPU/RAM/VRAM detection, Fast/Balanced/Best config, a
   first-run benchmark that prints honest estimates.
4. **Offline self-test** (15.1): a command that proves Appbridge made no outbound connections
   during a scripted session; add it to CI.
5. **Connect Hub verification** (14): run the writers against throwaway copies of each client's
   config on this machine, then against real configs with backup; add skill/rules install and a
   post-install test call; add the client-matrix test.
6. **Safety fixes from 5.4**: capture masking, token ACL, approvals file lock (or single-writer
   daemon), enforce `untrusted_requires_approval` with basic taint tracking.
7. **CI**: add a pipeline (build, test, universality lint, offline test) and a held-out-app
   placeholder.
8. **Windows classic-control path**: explicit Win32/MSAA enumeration for old controls UIA misses.

### M2. Phase 1 exit test: the stand-in benchmark (M to L)

1. Build or pick a **stand-in old native app** with a mail-like workflow (list, search, open,
   attach, save-as dialog, reply, Send). A small WinForms or Delphi/VB6-style app made for testing
   is fine, and it must follow the Universality Contract (the harness may name it; core may not).
2. Write the `labs/` runner: scripted tasks, success checks that use an independent signal (file
   on disk, Sent folder), repeated N times, metrics JSON (success, steps, time, interventions,
   approvals, irreversible errors). `lab run` already has a stub for this.
3. Run it with an external AI over MCP. **Gate: >= 70% success with approval on Send.**
4. Write `docs/spike-notes.md` with the numbers (also the missing Phase 0 gate document).

### M3. Phase 0 spikes, done late but still needed (L)

Run the plan's Phase 0 list on about 10 apps sampled by technology class: tree quality, OCR
accuracy/latency (English plus one non-Latin script, and install the extra OCR language packs),
detector/grounding model bake-off by hardware tier, input reliability (focus, DPI, IME), a baseline
off-the-shelf computer-use agent, VM + guest-agent feasibility, and the api-anything / REA
run-through. Output: model/library choices, Scene v1, and the benchmark class list. These results
decide the shape of M4 and M8.

### M4. Phase 2: Pilot + perception fusion (XL)

- UI element detector and optional local VLM behind the perception policy (7.1); per-window capture
  (PrintWindow / Graphics Capture) so covered windows read correctly.
- Selector store with confidence scoring and the full selector bundle (7.2).
- Task Pilot: `task.run/status/cancel`, budgets, stall/loop detection, recovery ladder (7.4).
- Built-in chat with BYO key or local model; approvals inline with previews.
- Dialog-handler library (file pickers, print, wizards, installers) on top of `dialogs.ts`.
- Hang detection and popup/toast/spinner detection.
- Fast/Balanced/Best profiles, model-role splitting, per-app local-only policy.
- **Exit:** Long-Tail Benchmark v0 (20 apps x 5 tasks), >= 75% success, <= 1 intervention per
  task, cost and time recorded against the baseline.

### M5. Phase 3: Learning (XL)

- Trajectory recorder (this is what produces the `RecordedEvent`s `compileSkill` expects):
  `skill.record_start/stop`, Teach mode.
- Compiler improvements: parameter generalization, assertions per step, selector bundles,
  AI-fallback points, patch proposals.
- Verification gate: replay on clean state with different parameters before saving.
- Healer: classify drift (`app_updated`, `ui_changed`, ...), re-learn, replay, save only if it passes.
- Playbook builders: read F1/CHM/PDF help, safe read-only exploration, run-history capture,
  risk-map generation.
- Encrypted, redacted, retention-limited trajectory store (9.5).
- App Packs: exporter/importer, sanitizer + review screen, signing, `SKILL.md` generator,
  `ONBOARD_PROMPT.md`, import scanning (13).
- Grade progression bronze to platinum, `restricted` handling.
- **Exit:** repeat runs >= 5x faster and >= 80% cheaper at >= 95% success; healer repairs >= 60% of
  simulated drift; a pack exported on one machine works in a different AI client.

### M6. Phase 4: Agent Workspace (XL)

Hyper-V / VirtualBox adapters, guest agent, snapshots and rollback, controlled clipboard/file
transfer, pixel-only mode, legacy OS images. Also add copy-on-write file shadows and drafts-first
behavior to the shared desktop (16.4).

### M7. Phase 5: Accelerators (XL)

Background discovery and verified adoption: G-COM, G-CLI, G-CDP (Electron/WebView2/Chromium),
G-Data (SQLite), api-anything (web), official API/MCP import, first companions (Office add-in,
browser extension, VS Code), optional LMCP-as-MCP-client, selected REA modules. Fingerprinting
deepens here (PE imports, bundled runtimes). The inventory should use the installed-app listing the
driver already provides.

### M8. Phase 6: Product and UX (XL)

Tray/dashboard, Add-app wizard, Teach UI, approval previews with screenshots, privacy controls
(masking, sensitivity labels, data-flow report), installer/updater, offline bundles, air-gapped
mode UI, per-client export buttons, `.mcpb` / Claude Code plugin / Codex plugin packaging,
optional Remote Access, docs.

### M9. Phases 7 to 9 (ongoing)

Vision grade for pixel-only apps, Java Access Bridge, terminal-emulator scripting, SAP GUI scripting
(phase 7); macOS, Linux, Android drivers behind the existing `DeviceDriver` contract (phase 8); shared
Skill library and enterprise features (phase 9). Continuous work: security/privacy/legal review,
red-team corpus in CI, dependency and client-config re-verification each release.

---

## 7. Gaps against the parity checklist (plan section 4)

This list is the Floor's test suite, so it shows what the Floor still cannot do.

**Perceive**
- Not covered: spinners/progress bars, toasts, hung-app detection, caret tracking, right-to-left
  and non-Latin OCR (only `en-US` is installed), charts and custom-drawn grids beyond OCR text,
  multi-monitor mapping tests.

**Act**
- Not exposed as tools: drag-and-drop (driver has it), window move/resize (driver has it).
- Missing: hover and tooltips, press-and-hold, region select, nested menu helper with hover timing,
  ribbon handling, date pickers, file/image clipboard, print to PDF, MDI children.

**Understand**
- Missing: reading F1/CHM/PDF help, tooltips and status bars as knowledge sources.

**Plan and recover**
- Missing: step planning, adaptation to language/theme/DPI, retry/alternate-path/back-out ladder.

**Hand off to humans**
- Present: `needs_human` for approvals and for credential/privileged effects.
- Missing: CAPTCHA/2FA/payment screen recognition beyond keyword rules, `handoff.request` tool and
  resume protocol.

**Learn**
- Mostly missing (section 6, M5).

Plan requirement not yet met: "every item gets at least 3 test apps and an automated pass/fail
check". There are no such tests.

---

## 8. Plan section 24 open decisions: where they stand

None are recorded as answered in the repo. The code already assumes some defaults; confirm or
change them before they harden.

| # | Decision | Implied by the code today | Needed before |
|---|---|---|---|
| 1 | VM for Legacy Containment | Shared desktop only | M6 |
| 2 | Open source vs closed, shared library | No license file | any public release |
| 3 | Risk appetite at MVP | Approval for write/destructive/external effects (drafts-first not implemented) | M2 |
| 4 | LMCP relationship | Not used | M7 |
| 5 | Day-one languages/scripts | English OCR only | M3 |
| 6 | Legal review owner | None | public release |
| 7 | Name/branding check | "appbridge" used everywhere | before publishing |
| 8 | Platform timing | Windows only | M9 |
| 9 | Hosting of a pack library | None | M5 |

---

## 9. Housekeeping

- Delete `packages/gateway/src/bridge.ts.backup` (and use git history instead).
- `scratch/` is git-ignored but holds useful probe and smoke scripts (`mcp-smoke.mjs`,
  `http-smoke.mjs`, `safety-smoke.mjs`). Promote the useful ones to `scripts/` or `labs/` and wire
  them into `npm run`.
- `.freebuff/` is tool metadata; confirm it should stay out of the repository.
- `npm run clean` uses `rm -rf`, which fails in plain Windows `cmd`. Use a Node one-liner or
  `rimraf`.
- Add a `LICENSE` and a `docs/` index (decision 2).
- Keep `docs/status.md` as the single source of "what works", and update it in the same change as
  the code.
- The Universality lint's package list is hard-coded; it will silently skip new packages. Make it
  scan `packages/*`.
- Windows PowerShell 5.1 host: keep to C# 5 syntax as `status.md` notes; plan a compiled sidecar
  (C#/.NET or Rust) before the performance work in M4.

---

## 10. Suggested next 10 working days

| Day | Work |
|---|---|
| 1 | M0: run `npm run check`, fix `bridge.ts` compile errors, delete the backup, get green. |
| 2 | M0: rewrite `skillRun`/`skillCompile`/dialog methods on `this` + `SkillStore` + `detectDialogs`; add the 8 tools to MCP. |
| 3 | M0: tests for skills, dialogs and a fake-driver `Bridge`; update `status.md`, README, plan status line. |
| 4 | M1: capture masking, token ACL, approvals lock, enforce `untrusted_requires_approval`. |
| 5 | M1: user-yield + indicator + stop hotkey. |
| 6 | M1: Connect Hub dry-run against copies of real configs; skill/rules install; test call. |
| 7 | M1: provider layer v0 + hardware detect; CI pipeline with offline test. |
| 8 | M2: stand-in app and harness skeleton. |
| 9 | M2: first measured runs with an external AI; fix the top failure causes. |
| 10 | M2: decide whether the 70% gate is met; write `docs/spike-notes.md`; set the M3/M4 scope from the numbers. |
