# Gap plan

What comparable tools do, what Appbridge is missing, what was closed in this pass, and the
order to close the rest.

- **Analysis date:** 2026-11-15
- **Scope:** public documentation, READMEs and release notes of adjacent projects; no
  hands-on benchmark was run against them.
- **Appbridge baseline:** Windows-only build in this repository, 43 MCP tools, 48 tests.

---

## 1. Where Appbridge sits

The category has split into four camps:

| Camp | Examples | Core bet |
|---|---|---|
| **Accessibility-tree CLIs** | Vercel `agent-desktop`, `sbroenne/mcp-windows` | The OS tree is cheaper and more reliable than pixels; hand the agent refs |
| **Windows MCP suites** | `CursorTouch/Windows-MCP`, `deploymenttheory/windows-mcp-server`, `agentic-windows-mcp` | Breadth: UIA + screenshots + shell + registry + browser, packaged for MCP hosts |
| **Screenshot-first VLM agents** | UI-TARS / UI-TARS-desktop, Claude computer use (Cowork), ChatGPT agent | A vision model can drive anything a human can see |
| **Harnesses / governance** | Claude computer use guidance, enterprise MCP servers with posture + egress checks | Autonomy is only useful if it is bounded, attributable and reversible |

Appbridge is deliberately in camp 1 and camp 4. It does not try to win on click breadth; it
tries to be the harness you can leave running: honest perception, verified actions, explicit
effects, human grants, tamper-evident audit.

**Positioning sentence:** *Appbridge is the safety and verification layer for computer use —
accessibility-native, local, and auditable — with a working Windows implementation.*

---

## 2. Landscape notes

### Vercel `agent-desktop` (closest competitor)

Apache-2.0, Rust CLI + C library, macOS 13+, Windows 10 1809+, Ubuntu 24.04+. Reads the OS
accessibility tree (`AX` / UI Automation / AT-SPI), returns JSON with a stable `ref` per
actionable element, and acts headless by default — no pointer movement or focus steal.
`--skeleton` reads three levels deep, cut containers report `children_count` and a drill ref,
and `snapshot --root` expands one region. The builder reported 78–96% fewer tokens than full
tree dumps in Slack, VS Code and Notion. Distribution is `npm i -g agent-desktop` with
per-platform binaries; ~11.7k stars within days of the 1.0.0 release (Oct 27, 2026), 1.0.2 on
Oct 30.

What it does **not** do: apps without an accessibility tree are out of reach, web pages are
out of scope (it points to `agent-browser`), and there is no policy layer, approval flow,
audit chain, memory, or verification contract beyond "read again".

### Windows MCP suites

- **`CursorTouch/Windows-MCP`** — Python MCP server, UIA + synthetic input, no vision model.
  Adds a **desktop lease**: one agent owns the desktop at a time, with an on-screen
  indicator, `relaxed` / `balanced` / `strict` control modes, and a take-back chord for the
  human. Packaged as a Claude Desktop extension.
- **`deploymenttheory/windows-mcp-server`** — Go, UIA + screenshots + PowerShell + registry +
  processes + filesystem + scraping. Gates actions on **live device posture**, constrains
  **network egress**, and writes a **tamper-evident audit chain** the agent cannot switch
  off.
- **`sbroenne/mcp-windows`** — control-first UIA by name, screenshots/input as fallback.
  Strong distribution (VS Code Marketplace) and publishable **token benchmarks**.
- **`agentic-windows-mcp`** — FastMCP, Win32 + UIA, **CDP** for the user's Chrome/Edge, a
  control plane with a glowing border, policy levels, a lease queue, OAuth/bearer, and
  registry/shell tools.

Common bar in this camp: breadth of tools, a visible control indicator, a lease/take-back
model, policy modes, and either posture gating or egress control.

### Screenshot-first and hosted agents

- **UI-TARS / UI-TARS-desktop** (ByteDance) — end-to-end VLM: perception, grounding, System-2
  reasoning in one model, strong benchmark results, screenshot-only. Its weakness is cost,
  latency and unlabeled trust.
- **Claude computer use** (Cowork desktop, macOS + Windows) — screenshots of permitted apps,
  asks before touching a new app, sensitive apps blocked by default, stop anytime; the docs
  recommend a VM/container, minimal privileges and an internet allowlist. Reported
  OSWorld-Verified scores in the mid-80s by late 2026. The model is strong; governance lives
  with the client.
- **ChatGPT agent** — runs in a cloud virtual browser/terminal, not on the user's desktop.
  **Copilot Studio** and **Gemini API computer use** are hosted building blocks with the same
  shape: strong model, weak local governance.
- **OpenAdapt** — records human demonstrations and replays/learns them; adjacent to Appbridge's
  Teach mode, but not a live tool surface.

### What the category agrees on

1. Accessibility beats pixels when the tree is good.
2. Token economy decides whether an agent finishes a task (skeleton + drill, bounded results).
3. A visible/available stop control is table stakes.
4. Screenshot agents need a VM; local agents need a policy layer.
5. There is still **no reliable public benchmark** — a recurring complaint in launch threads.

---

## 3. Feature matrix

Legend: ● yes · ◐ partial / conditional · ○ no · ? not documented.

| Capability | agent-desktop | Windows MCP suites | UI-TARS / hosted agents | **Appbridge** |
|---|---|---|---|---|
| macOS / Linux | ● | ○ | ◐ (hosted) | ○ |
| Windows | ● | ● | ● | ● |
| Accessibility-tree perception | ● | ● | ○ | ● |
| Stable element refs | ● | ◐ | ○ | ● |
| Screenshot fallback | ● | ● | ● | ● |
| Local OCR (no pixels leave machine) | ○ | ◐ | ◐ (model sees image) | ● |
| Skeleton + subtree drill | ● | ○ | ○ | ● (this pass) |
| Action verification / expectation waits | ○ | ◐ | ○ | ● |
| Effect classification + policy | ○ | ◐ (modes/posture) | ○ | ● |
| Out-of-band human approvals | ○ | ◐ | ◐ (client prompt) | ● |
| Kill switch | ○ | ◐ (take-back) | ● (stop) | ● |
| Hash-chained audit | ○ | ◐ (one suite) | ○ | ● |
| Per-app memory / playbooks | ○ | ○ | ○ | ● |
| Declarative skills + Teach mode | ○ | ○ | ○ | ● |
| Shareable app packs | ○ | ○ | ○ | ● |
| Local files | ◐ | ● | ◐ | ● |
| Terminal with approval classes | ○ | ● | ● | ● |
| MCP server | ◐ (CLI) | ● | ○ | ● |
| REST + OpenAPI | ○ | ◐ | ○ | ● |
| Desktop GUI | ○ | ○ | ● | ● (Flutter console) |
| Desktop lease / user takeover | ○ (headless) | ● | ◐ | ○ |
| CDP browser accelerator | ○ | ◐ | ○ | ○ |
| VLM grounding for unlabeled icons | ○ | ○ | ● | ○ |
| VM / rollback workspace | ○ | ○ | ● (hosted) | ○ |
| Public benchmark numbers | ○ | ○ | ● | ○ |
| One-command install | ● (npm binaries) | ● (uvx/pip/VSIX) | ● | ◐ (build from source) |

---

## 4. Gaps, severity, and status

Severity is about *user-visible risk or adoption*, not implementation size.

### Closed in this pass

| # | Gap | Why it mattered | What changed |
|---|---|---|---|
| C1 | No license, no CI, stale README, no contribution/security docs, no templates | A public repo without these reads as a scratch dump and cannot be trusted with desktop control | Apache-2.0 `LICENSE`, `README.md` rewritten to match reality, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, CI workflow, issue/PR templates, `.gitignore` overhaul |
| C2 | Default policy allowed `external-effect` and `unknown` without approval | The README's central safety promise was false; "Send", "Post", "Pay" could run unattended | `DEFAULT_POLICY` and generated TOML now use `approve`; `doctor` reports a "policy posture" check; `appbridge policy set` edits rules safely |
| C3 | Audit chain broke under concurrent writers | Tamper-evidence failed in exactly the multi-process setup the product advertises | Appends are serialized with a cross-process lock, the true tail is re-read per record, sequence numbers are verified, `audit rotate` archives a broken log |
| C4 | Approval store lost updates between CLI and daemon | A grant could vanish, or a pending request reappear | Same shared lock, atomic replace preserved, concurrency test added |
| C5 | Scene `children` never populated | Drill-down hints and parent/child navigation were dead data | Fixed id map, added `children_count` and `children_omitted` |
| C6 | No token-economy story on dense apps | The newest competitor's headline win is 78–96% fewer tokens; Appbridge dumped up to 1000 elements | `root` subtree drilling across host → driver → bridge → MCP → CLI, plus `children_omitted` markers and a `next` hint; measured 25 → 4 elements on a container |
| C7 | MCP tools had no annotations | Clients cannot auto-approve safe reads or warn on destructive tools | `readOnlyHint` / `openWorldHint` / `idempotentHint` / `destructiveHint` per tool, plus server `instructions` |
| C8 | Version strings hardcoded; no `init`; no JSON on `apps`; no audit/policy CLI | First-run and automation friction | Version from `package.json`, `appbridge init`, `apps --json`, `scene --root/--depth`, `audit tail|verify|rotate`, `policy` / `policy set` |
| C9 | Flutter app still described itself as "A new Flutter project" | Publishing a template README undercuts the console | Real README, description, version, Windows product strings |

### Open — P0 (next, blocks adoption)

| # | Gap | Impact | Acceptance criteria |
|---|---|---|---|
| P0-1 | **Cross-platform drivers** (macOS AX, Linux AT-SPI) | "Universal" is Windows-only; every competitor except one is single-platform, so this is the clearest differentiator available | A driver implements `DeviceDriver`; `doctor`, `scene`, `ui.click` and OCR work on macOS; CI job builds; status table updated |
| P0-2 | **Accuracy benchmark** | No public evidence of task success; the category openly lacks one | A reproducible suite of ≥ 20 tasks across 5 app classes, run via `lab.run`, publishing success rate, verification rate and median steps; results in `docs/benchmarks.md` |
| P0-3 | **Desktop lease + takeover** | Two agents (or an agent and a human) fight for the cursor; competitors ship a lease and a take-back chord | A lease file/daemon grants one session at a time; an overlay or tray indicator shows ownership; `ESC`/hotkey revokes; actions outside the lease return `blocked` |
| P0-4 | **Distribution** | Clone + build is a wall; competitors install with one command | `npm i -g` (or a signed installer) that ships the native host; MCP Registry entry; `winget` manifest; release workflow producing a zip with checksums |

### Open — P1 (differentiation and trust)

| # | Gap | Impact | Acceptance criteria |
|---|---|---|---|
| P1-1 | **VLM grounding for unlabeled controls** | Icons and custom-drawn UI remain unreachable; the Scene can only say "unknown" | A pluggable detector returns elements with `src: ["vlm"]`, `untrusted: true`, confidence; disabled by default; egress policy enforced; measured on a labeled set |
| P1-2 | **Per-window capture for OCR** | A covered window yields the wrong text; minimized windows yield nothing | `PrintWindow` or Windows.Graphics.Capture path; OCR works on a background window; warning removed when verified |
| P1-3 | **Browser CDP accelerator** | Chromium trees are shallow, so web apps are the weakest case | Optional CDP attach per window; DOM nodes mapped into Scene ids; fallback to UIA when unavailable |
| P1-4 | **Per-client gateway tokens, OAuth, named pipes** | Any local process that reads one file can drive the desktop; enterprise reviewers will object | Named tokens with hashed secrets, per-token scopes, rotation, `401` audit records; optional OAuth for remote MCP hosts |
| P1-5 | **Sandbox / rollback** | No undo for risky actions; hosted agents get this for free | A workspace mode that snapshots file roots before writes and can restore; `undo` on the last N actions |
| P1-6 | **Session replay** | Debugging a failed run means reading JSON | Timeline with per-step Scene digest, screenshot thumbnail, effect, approval; exportable as a folder |
| P1-7 | **Egress control** | `egress.mode` exists for the local provider but is not a general policy | Allowlist/denylist per app/tool, audited; blocks a prompt-injection exfiltration path |

### Open — P2 (polish and reach)

| # | Gap | Impact |
|---|---|---|
| P2-1 | Rate limits, per-client quotas, and request budgets | Protects the desktop from runaway loops |
| P2-2 | Multi-monitor and virtual-desktop awareness in targeting | Wrong-window risk on large setups |
| P2-3 | OCR language detection and install guidance in `doctor` | Already reports languages; add install help and per-language confidence |
| P2-4 | Tray app, auto-update, crash recovery for the native host | Day-to-day usability |
| P2-5 | Docs site and video walkthrough | Discoverability |
| P2-6 | Localization of the CLI and console | Non-English users |
| P2-7 | App Pack registry / sharing index | Network effects, with a trust model |
| P2-8 | Conformance suite for third-party drivers | Keeps the `DeviceDriver` contract honest |

---

## 5. Sequencing rationale

1. **Trust before reach.** A desktop agent is installed once and trusted for months. Broken
   audit chains and permissive defaults destroy that faster than a missing platform does.
   Hence C2–C4 first.
2. **Cost before breadth.** The accessibility camp is converging on skeleton + drill because
   context is the binding constraint. C6 was cheap to add and measurable, so it went in with
   the trust fixes.
3. **One platform done well beats four half-done.** macOS support is the highest-value
   differentiator because `agent-desktop` is the only credible cross-platform accessibility
   CLI, and it has no governance layer.
4. **Benchmark before VLM.** A grounding model without a benchmark cannot be evaluated; a
   benchmark first makes every later perception change measurable.
5. **Lease before concurrency features.** Once two clients connect, ownership is a safety
   issue, not a nicety.

---

## 6. What this pass deliberately did not do

- No macOS or Linux driver. It is a real port (AX/AT-SPI + permissions + CI), not a config
  change, and pretending otherwise would be the kind of claim this project avoids.
- No VLM. It needs model hosting, an egress policy that users can reason about, and an
  evaluation set; shipping it without those would weaken the "local by default" promise.
- No VM workspace. Snapshot/restore semantics need a design for file roots, large files and
  external side effects.
- No npm publication. The packages are still `private`; the CLI packs cleanly
  (`npm pack --dry-run`), but a publishable build must ship `uia-host.ps1` and resolve
  workspace dependencies. That is P0-4, not a five-minute change.
- No benchmark numbers. Guessing them would be worse than having none.

---

## 7. Verification for this pass

```text
npm run check                     build + 48 tests + universality lint — pass
npm run build                     tsc project references, strict — pass
node packages/cli/dist/index.js doctor
                                  node, platform, config, policy, audit, kill switch,
                                  native host (PowerShell 5.1), OCR (en-US), windows — pass
scene --window <utility> --depth 2
                                  25 elements, children_omitted on depth-capped panes
scene --window <utility> --root e5
                                  4 elements, root=e5, ids preserved
audit verify / rotate             broken chain detected, archived, clean chain after rotate
policy set unknown approve        persisted, doctor posture check clears
```

The one remaining `doctor` failure on the author's machine is the pre-existing audit log
written by the old unlocked code; `appbridge audit rotate` archives it and the chain verifies
afterwards. That is the documented recovery path.

---

## 8. Sources

- Vercel Labs `agent-desktop`: repository README and launch coverage (Oct 31 – Nov 8, 2026);
  skeleton/drill and token figures as reported by the builders.
- `CursorTouch/Windows-MCP`, `deploymenttheory/windows-mcp-server`, `sbroenne/mcp-windows`,
  `agentic-windows-mcp`: repository READMEs and feature notes.
- ByteDance UI-TARS paper and `UI-TARS-desktop` README.
- Anthropic computer use documentation and Cowork guidance; OSWorld-Verified leaderboard
  figures as reported in September 2026 coverage.
- OpenAI ChatGPT agent, Microsoft Copilot Studio computer use, Google Gemini API computer use
  documentation summaries.
- OpenAdapt project notes.
- This repository: `plan.md`, `docs/status.md`, source and tests.
