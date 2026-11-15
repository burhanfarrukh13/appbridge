# Implementation status

Last updated: 2026-11-15. Tracks this repository against `plan.md` and `gap_plan.md`.

## What this build is

The Phase 0/1 foundation of the plan: a working human-parity Floor on Windows, a safety
harness, a small MCP/REST tool surface, App Memory v0 and Connect Hub v0. It is a vertical
slice you can run end to end, not a complete product.

## Implemented

### Floor (plan sections 7, 19)
- Windows UI Automation via a persistent native host (`packages/floor/native/uia-host.ps1`)
  over newline-delimited JSON. One process, cached element handles, per-request timeouts
  with host restart.
- Window enumeration with process, class name, bounds, focus, minimized and visibility.
- Tree walk (breadth-first, depth/element caps, offscreen filtering) with roles, names,
  automation ids, class names, bounds, enabled/focused/password state, supported patterns
  and ValuePattern values (password values never leave the host).
- Input synthesis: UIA Invoke/Toggle/Select/Expand, ValuePattern `SetValue`, Unicode
  `SendInput` typing, virtual-key combos, synthetic mouse click/move/drag/wheel, clipboard,
  window focus/minimize/maximize/restore/close, app launch.
- DPI awareness is set in the host so UIA bounds are physical pixels.
- **Scene v0** (Appendix A): stable element ids across calls, parent/child links, focus,
  sources, truncation, per-element risk hint, untrusted marking, injection flags, diff
  against the previous Scene and `stable` detection by content digest.
- **Local OCR** through the Windows OCR engine (WinRT), with no image leaving the machine.
  Lines and words carry screen coordinates. OCR text is fused into the Scene as `role:
  Text` elements from `src: ["ocr"]`, marked untrusted, scanned for instruction-like text
  and deduplicated against accessible labels. Auto mode runs OCR only when accessibility
  is sparse (fewer than 5 named elements or under 200 name characters); it never runs
  during action verification. `include_ocr` forces it on or off, and `screen.ocr` returns
  the raw recognition result.
- **Partial snapshots:** `max_depth` for a skeleton view plus `root` to read one container's
  subtree. Containers whose children are outside the snapshot carry `children_count` and
  `children_omitted`, and `screen.describe` suggests the drill id. Ids stay stable between
  full and drilled snapshots.
- Verification: `waitForAction` polls a fresh Scene until it changes or an explicit
  expectation (`element_appears`, `element_disappears`, `value_equals`,
  `window_title_contains`, `file_exists`) is met. Results use the plan's honest classes.

### Safety (plan section 16)
- Effect classifier from generic, multilingual label/context keywords plus role baselines.
  Unknown/low-confidence controls escalate instead of being blind-clicked.
- Action Firewall with policy `allow | approve | block | handoff`, persisted approvals,
  one-shot and time-boxed session grants, target scoping, and deduplication of pending
  requests.
- Credential and privileged effects are handoff-only by default: the model cannot type
  passwords or elevate.
- Kill switch: `~/.appbridge/HALT`, checked before every action, with CLI and MCP tools.
- Prompt-injection heuristics on screen text; flagged as warnings on the Scene. Screen text
  is marked `untrusted` and never alters policy.
- Hash-chained audit log (append-only JSONL) with argument digests rather than raw values,
  result class, route, app and approval id. Appends are serialized with a cross-process lock
  and re-read the true tail, and sequence numbers are verified. `appbridge doctor` verifies
  the chain; `appbridge audit verify` recomputes it and `appbridge audit rotate` archives a
  broken log.
- Approvals use the same cross-process lock, so a CLI grant and a daemon request cannot
  overwrite each other.

### Gateway (plan sections 12, 14)
- MCP stdio server with 43 tools, per-tool read-only / open-world / idempotent annotations
  and server-level instructions:
  - Perception: `screen.describe`, `screen.capture`, `screen.ocr`, `ui.find`
  - Interaction: `ui.click`, `ui.type`, `ui.key`, `ui.set_value`, `ui.scroll`, `ui.drag`, `ui.wait_for`
  - Window & System: `apps.list`, `apps.describe`, `window.list`, `window.focus`, `window.action`, `app.launch`, `clipboard.get`, `clipboard.set`
  - Safety & Governance: `session.status`, `session.stop`, `session.resume`, `audit.tail`
  - Dialog Perception: `dialog.list`, `dialog.handle`
  - Declarative Skills: `skill.compile`, `skill.run`, `skill.record_start`, `skill.record_event`, `skill.record_stop`
  - App Memory: `playbook.get`, `memory.store.get`, `memory.store.list`
  - Benchmark & Diagnostics: `lab.run`, `inventory`
- Loopback REST + OpenAPI 3.1 document, bearer token in `~/.appbridge/gateway-token`
  (mode 0600), Host/Origin validation against DNS rebinding, no wildcard CORS, 2 MiB body
  cap, `no-store` responses.
- Root-scoped local filesystem tools for listing, searching, reading, writing and exact
  unique-match edits; routine writes are allowed by default. Terminal discovery and
  one-shot execution support installed PowerShell, cmd, bash, sh, zsh and WSL shells;
  routine read/build/test commands run without prompting, while destructive, privileged,
  external-effect, chained, or unclassified commands require approval or human handoff.
  Runs have timeout/output limits, configured-root working directories, and audit records.
- CLI with `mcp`, `serve`, `init`, `doctor`, `apps`, `scene`, `call`, `add`, `inventory`,
  `approvals`, `policy`, `audit`, `halt`/`resume`, `status`, `dialogs`, `skill`, `lab`, `pack`,
  `providers`, and `connect`. `scene` accepts `--depth` and `--root`.
- Connect Hub v0 with detection, config writers (JSON and TOML), backups before writes,
  vendor CLI use for Claude Code, Antigravity (`~/.gemini/config/mcp_config.json`), a generic printout, and `--undo`.

### Memory, Skills & App Packs (plan sections 8, 9, 10, 11)
- Playbook v0 per app: technology fingerprint, window/control map, risk map, notes.
  Written to `~/.appbridge/memory/<app>/playbook.json`; run history file supported.
- `appbridge add` / `apps.describe` captures the currently open window; `appbridge inventory` writes
  `device.json` with windows, running apps and process count.
- **Dialog Detection & Classification**: Case-insensitive role matching for dialogs and windows.
  Classifies credential dialogs (forcing human handoff), file pickers (`choose_path`), save changes,
  and standard message boxes (`findDialogButton`, `findCancelButton`).
- **Declarative Skills**: Compiled from recorded events or written by hand. Parameter declarations
  with validation, defaults, and substitution into text and expectations. Selectors resolve
  against fresh scenes with role, name, automation ID, and index disambiguation.
- **Teach Mode Trajectory Recording**: `skill.record_start`, `skill.record_event`, `skill.record_stop`
  record human or model interactions and compile them into verified declarative skills.
- **App Packs Exporter & Importer** (`AppPackManager`): Exports portable bundles (`app.pack.json`,
  `SKILL.md`, `ONBOARD_PROMPT.md`) with text sanitization (masking API keys, secrets, user home dirs),
  SHA-256 manifests, prompt injection scans on import, and source provenance tagging.
- **App Lab Harness** (`lab.run` / `appbridge lab run`): Executes benchmarks and writes run metrics
  (duration, success rate, verification status) to `~/.appbridge/lab/metrics.json`.

### AI Providers & Capability Negotiation (plan sections 15, 17)
- **Hardware Profile Auto-Detection**: CPU cores, RAM, GPU backend detection (DirectML on Windows,
  CUDA, Metal, CPU fallback) configuring tiers (`tier1-cpu`, `tier2-mid`, `tier3-best`) and
  performance profiles (`fast`, `balanced`, `best`, patient mode).
- **Capability Negotiation**: Steers small context or slower models to Task mode / linear skills
  while enabling Tool mode / full MCP tool loops for larger models.
- **OpenAI-Compatible Local Provider**: Strict egress policy enforcement blocking remote network
  requests in local-only / air-gapped modes.

### Universality (plan section 3.2)
- `npm run lint:universality` scans every package (TypeScript and the native PowerShell
  host) and fails on app or vendor names. Technology-class names are allowed.

## Verified in this session

- `npm run build` succeeds (TypeScript project references, strict mode).
- `npm test`: 48 unit and integration tests pass across 6 test suites covering:
  - Scene stability, diffing, risk classification, untrusted text & prompt injection scanning
  - OCR line fusion and duplicate label deduplication
  - Cryptographic audit chain and tamper detection
  - Configuration normalization and policy constraint verification
  - Approval gate, one-shot grant consumption, and session grant scoping
  - Bridge Gateway integration with FakeDriver (scene perception, skill compile/run, credential handoff, teach-mode recording)
  - Dialog detection and classification (message boxes, credential handoff, file pickers)
  - App Packs exporter and importer with secret sanitization and SHA-256 manifests
  - Declarative Skills compilation, parameter validation/substitution, selector resolution
  - Hardware profile auto-detection, AI model capability negotiation, and egress policy enforcement
  - Connect Hub client detection and stdio/TOML configuration generation
  - Scene child links, child counts and subtree scope; concurrent approval writes; safer
    default policy
- `npm run lint:universality`: clean across 8 packages.
- `appbridge doctor`: Node, platform, config, policy, audit chain and native host all pass;
  9 top-level windows detected.
- MCP client handshake exposes the registered screen, UI, local filesystem and terminal
  tools; `apps.list` and `screen.describe` return data.
- File Explorer Scene: 179 elements with roles, names, bounds and states.
- Typing into a search field returned `ok`, route keyboard, verified by ValuePattern
  read-back.
- OCR on a focused 1920x1080 window: 343-404 ms, 48-50 lines, `en-US` engine; forced OCR
  on File Explorer added 49 text elements to a 189-element Scene. Auto mode triggered on
  the Chromium window (sparse accessibility) and stayed off on the dense File Explorer tree.
- `window.focus` reports `no_effect` when Windows refuses a background focus change rather
  than claiming success; OCR warns when the target window is not in the foreground because
  it reads visible pixels.
- Clipboard write without an approval returned `needs_human` with an approval id; after
  `approvals approve` the retry succeeded and read-back matched.
- Kill switch: with `HALT` set, actions returned `class: "blocked"`; after `resume` they
  succeeded again.
- Loopback REST: `/healthz` without a token returns 200; `/v1/status` without or with a bad
  token returns 401; with the bearer token returns 200; a foreign `Origin` is rejected with
  403; `/v1/openapi.json` is served; `POST /v1/tools/apps.list` works with the token.
- Connect Hub detection found Claude Desktop, Claude Code, Codex, VS Code, Gemini CLI and
  Antigravity on this machine; the generated stdio entry and Codex TOML are correct. Writing
  into the user's real AI-client configs was deliberately not exercised in this session, so
  the writers are implemented and compiled but not yet verified end to end.
- `appbridge add` writes a Playbook v0 to `~/.appbridge/memory/`; `playbook.get` reads it
  back; `appbridge inventory` writes `device.json`.
- Partial snapshots on a live window: `scene --depth 2` returned 25 elements with
  `children_omitted` on depth-capped panes; `scene --root e5` returned 4 elements for that
  container with ids preserved.
- `audit verify` detected a pre-existing broken chain (written by the old unlocked code),
  `audit rotate` archived it, and `verify` reported a clean chain afterwards.
- `policy set unknown approve` persisted and cleared the new `doctor` posture warning.

## Known gaps and honest limits

| Gap | Impact | Next step |
|---|---|---|
| No UI detector / VLM grounding yet | Icons, unlabeled controls and layout meaning remain unresolved | Add a local detector and optional VLM behind the perception policy in section 7.1 |
| OCR reads visible pixels only | A covered or background window yields text from whatever is on top; OCR on a window the OS refuses to focus is unreliable | Warning is emitted; per-window capture (PrintWindow/Graphics Capture) remains future work |
| OCR languages depend on installed packs | Only `en-US` is installed on this machine | Languages are now reported by `doctor` and `ocr_languages`; add install guidance (gap_plan P2-3) |
| Chromium accessibility is shallow | Chrome/Electron windows often expose only a legacy document, not the DOM | CDP accelerator (G-S7) and an accessibility-enabled launch path |
| Minimized windows yield an empty Scene | Agent must restore first | Scene now warns; `window.action restore` exists |
| No tray app or auto-update | The Flutter console must be started separately | Tray + updater in Phase 6 |
| Single loopback token, not per-client hashed tokens | Any local process that can read the file can call the gateway | Per-client tokens with hashes in config, named-pipe transport |
| No desktop lease | Two clients, or a client and the human, can fight for focus and the cursor | Add a lease with a visible indicator and a take-back hotkey (gap_plan P0-3) |
| No VM workspace / snapshots | No rollback for risky actions | Phase 4 |
| Windows only | macOS/Linux/Android drivers absent | Implement the same `DeviceDriver` contract |
| Typing verification depends on ValuePattern | Some controls cannot be read back; then `verified` is false and says so | Add OCR text verification |

Not implemented by design: CAPTCHA solving, DRM/anti-cheat/entitlement bypass, hidden
remote control, binary hooking.

## Native host notes

- The host is PowerShell 5.1 because this machine has no .NET SDK. `Add-Type` compiles a
  small C# helper for `SendInput`, mouse events and DPI awareness. Keep that C# at C# 5
  syntax: Windows PowerShell's compiler rejects `out var` and other newer constructs.
- Startup is once per Bridge (~1-2 s). Requests are serialized; a timeout kills and
  restarts the host.
- Element ids are window id + UIA runtime id, cached in the host; scenes keep their own
  short ids (`e12`) and map back to the handle.

## Suggested next milestone

Close the Phase 1 exit criterion: an external AI completes a multi-step task in an older
native app through tools, with approvals on Send/Delete, on >= 70% of runs. OCR now covers
text that UIA misses; that needs (a) dialog detection and a common dialog-handler library,
(b) a small set of recorded Playbooks and a Skill compiler, and (c) an App Lab harness to
measure the success rate.
