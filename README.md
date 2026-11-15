<div align="center">

# Appbridge

**Let any AI operate any app — even apps with no API, plugin or MCP — safely and locally.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.23.4-339933.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6.svg)](#platform-support)
[![MCP](https://img.shields.io/badge/MCP-stdio%20%2B%20REST-6E56CF.svg)](./docs/mcp-tools.md)

<!-- After you create the GitHub repo, enable the CI badge:
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
-->

</div>

Appbridge gives an AI agent eyes and hands on a real computer. It perceives a window as a
structured **Scene** (the OS accessibility tree plus window metadata), acts through
accessibility patterns and input synthesis, verifies that something actually happened, and
puts every irreversible action behind a human approval.

No model account, cloud service, telemetry or internet connection is required to run it.
You bring the model; Appbridge provides the body, the senses, and the brakes.

```text
$ appbridge scene --window "Notepad" --depth 3
window: Untitled - Notepad [notepad.exe]  scene=s1 stable=true
focus: e8  elements=24
  e1 Window "Untitled - Notepad"
  e2 MenuBar "Application"
  e3 MenuItem "File"
  ...
  e9 Edit "Text Editor" [focused, value="hello"]
```

---

## Why another computer-use tool?

Most agents either guess at pixels or wrap one automation library. Appbridge is built as a
harness around three questions that decide whether an agent is safe to leave running:

| Question | What Appbridge does |
|---|---|
| **Can it see the app?** | Accessibility tree first: stable element ids, roles, names, bounds, states, supported actions, risk hints. Local Windows OCR fills in text when the tree is sparse. Every string from the screen is marked untrusted data. |
| **Did it actually work?** | Every action returns `{ok, class, route, verified, change, next}`. It waits for a real Scene change or an explicit expectation instead of sleeping and hoping. `no_effect` is reported honestly. |
| **Should it be allowed to?** | Every action is classified into an effect (`read`, `write`, `destructive`, `external-effect`, `credential`, …). Policy says allow / approve / block / handoff. Approvals are out-of-band, the kill switch is a file, and the audit log is hash-chained. |

That combination — perception, verification, governance — is the product. The automation
library underneath is replaceable.

## Highlights

- **Accessibility-native perception.** Stable element ids across calls, parent/child links,
  focus, per-element risk hints, prompt-injection flags, and a content digest that tells the
  agent whether anything changed.
- **Partial snapshots that stay cheap.** Dense apps expose thousands of nodes. Ask for
  `max_depth: 3`, then drill into one container with `root: "e12"` instead of dumping the
  whole tree into the context window. Containers that hide content are marked
  `children_omitted`.
- **Verification built in.** `wait_for` supports `element_appears`, `element_disappears`,
  `value_equals`, `window_title_contains` and `file_exists`.
- **A real safety harness.** Effect classification in multiple languages, one-shot and
  time-boxed approvals, credential handoff, kill switch, append-only hash-chained audit.
- **Local files and terminals.** Root-scoped file tools plus approval-gated, time-limited,
  non-interactive shell commands.
- **Memory that compounds.** Playbooks per app, recorded Teach-mode trajectories compiled
  into declarative Skills, and shareable App Packs with secret sanitization and checksums.
- **One core, three interfaces.** MCP stdio, a loopback REST + OpenAPI gateway, and a CLI —
  all gated by the same firewall.
- **Universality enforced by CI.** A lint fails if any app or vendor name appears in a
  package. App knowledge lives in data, never in core code.

## Install

Requires **Windows 10/11**, **Node.js ≥ 22.23.4**, and Windows PowerShell 5.1 (present by
default; the native UI Automation host runs on it).

```bash
git clone https://github.com/OWNER/REPO.git appbridge
cd appbridge
npm install
npm run build

npm link          # optional: puts `appbridge` on your PATH
appbridge init     # creates ~/.appbridge/config.toml
appbridge doctor   # checks Node, config, policy, audit chain, native host, OCR
```

Nothing leaves the machine. `~/.appbridge/` holds config, approvals, audit records, and
memory.

## Quick start

```bash
appbridge apps                          # windows that can be driven
appbridge scene                         # Scene of the focused window
appbridge scene --window "Notepad" --depth 3
appbridge scene --window "Notepad" --root e5   # drill into one container

appbridge add --window "Notepad"        # learn an app into a Playbook
appbridge approvals list                # pending human decisions
appbridge halt                          # emergency stop
appbridge resume
```

Give an AI access over MCP:

```bash
appbridge connect --list                # detect installed MCP clients
appbridge connect --client claude-code  # or claude-desktop, codex, cursor, vscode, gemini, antigravity
appbridge connect --print              # generic mcpServers entry for anything else
```

Or expose REST + OpenAPI on loopback:

```bash
appbridge serve
# Appbridge REST gateway: http://127.0.0.1:8787
# Bearer token: <printed once per start, stored in ~/.appbridge/gateway-token>
# OpenAPI: http://127.0.0.1:8787/v1/openapi.json
```

See [`docs/mcp-tools.md`](./docs/mcp-tools.md) for all 43 tools.

## Safety model

Every action is classified into one effect. Default policy
(`~/.appbridge/config.toml`, editable with `appbridge policy set`):

| Effect | Default | Meaning |
|---|---|---|
| `navigate`, `read`, `edit-draft` | allow | Moving around, reading, typing into unsaved drafts |
| `write` | allow | Normal edits inside the app |
| `destructive` | **approve** | Delete, overwrite, uninstall, format |
| `external-effect` | **approve** | Send, post, submit, publish, pay |
| `privileged` | **handoff** | UAC, system settings, registry |
| `credential` | **handoff** | Login and password fields |
| `unknown` | **approve** | Unclassified or low-confidence controls |

When an action needs approval, the tool returns `class: "needs_human"` with an approval id.
The human grants it out-of-band; the agent retries:

```bash
appbridge approvals list
appbridge approvals approve ap_1234 --once      # single use
appbridge approvals approve ap_1234 --for 30m   # time-boxed grant
```

Screen text, file contents and command output are untrusted data. Instruction-like text is
flagged in the Scene and can never change policy. Audit records are append-only and
hash-chained; `appbridge audit verify` recomputes the chain and `appbridge audit rotate`
archives a broken log (for example after a clock change) instead of hiding the evidence.

## How it fits together

```text
AI client (Claude, Codex, Cursor, any MCP host, or your own loop)
        │  MCP stdio  ·  REST + OpenAPI  ·  CLI
        ▼
Gateway      tool surface, verification loops, dialog perception
        ▼
Safety       effect classifier · Action Firewall · approvals · kill switch · audit
        ▼
Floor        Scene builder · Windows UI Automation driver · OCR · input synthesis
        ▼
Windows      accessibility tree (UI Automation) + SendInput + WinRT OCR
```

Read [`docs/architecture.md`](./docs/architecture.md) for the data flow, the Scene format,
and the native host protocol.

## Repository layout

```text
packages/core        shared types, config, paths, hash-chained audit, file locks
packages/safety      effect classification, prompt-injection flags, approvals, firewall
packages/floor       Scene builder, verification, Windows UIA driver, native host
packages/floor/native/uia-host.ps1   persistent UIA + Win32 + OCR host
packages/memory      Playbooks, declarative Skills, App Packs, dialog handling
packages/providers   hardware profile, capability negotiation, local model provider
packages/gateway     MCP server, loopback REST/OpenAPI, shared tool logic
packages/connect     MCP client detection and config writers with backup/undo
packages/cli         the `appbridge` command
apps/desktop         Flutter desktop console (dashboard, chat, approvals, audit)
scripts              Universality Contract lint
docs                 status, architecture, tool reference, publishing checklist
plan.md              the long-form design plan behind the implementation
gap_plan.md          competitive gap analysis and roadmap
```

## Desktop console

`apps/desktop` is a Flutter app that talks to the loopback gateway: live dashboard, app
list, approval queue, audit timeline, skill library, settings, and a chat panel.

```bash
appbridge serve                  # terminal 1
npm run desktop                 # terminal 2 (flutter run -d windows)
```

## Development

```bash
npm run build             # tsc project references, strict mode
npm test                  # 47 unit and integration tests
npm run lint:universality # fails if an app or vendor name leaks into a package
npm run check             # all three
```

Tests use a `FakeDriver`, so the suite runs without a desktop session.

## Platform support

| Platform | Status |
|---|---|
| Windows 10/11 | Supported today (UI Automation, SendInput, WinRT OCR) |
| macOS | Planned: AX API driver behind the same `DeviceDriver` contract |
| Linux | Planned: AT-SPI driver |
| Android | Planned |

The driver interface is deliberately small (`listWindows`, `getTree`, `invoke`, `click`,
`ocr`, …) so a new platform is one file plus a native helper, not a rewrite.

## Honest limits

- **Windows only** in this build.
- **No VLM grounding yet.** Unlabeled icons and purely graphical controls stay unresolved;
  the Scene says so instead of guessing.
- **OCR reads visible pixels.** A covered window yields whatever is on top, and minimized
  windows produce an empty Scene with a warning.
- **Chromium accessibility can be shallow** unless the app's accessibility mode is on.
- **No VM workspace or rollback** for risky actions yet.
- **Not a bypass.** Appbridge does not solve CAPTCHAs, break DRM, or cross security
  boundaries. Use it only on apps, accounts and data you are authorized to use.

The full matrix, including what is measured versus assumed, is in
[`docs/status.md`](./docs/status.md). The competitive gap analysis and roadmap are in
[`gap_plan.md`](./gap_plan.md).

## Contributing

Issues and pull requests are welcome. Start with
[`CONTRIBUTING.md`](./CONTRIBUTING.md), and read the Universality Contract before adding app
knowledge. Security issues: see [`SECURITY.md`](./SECURITY.md) — please do not open a public
issue for a vulnerability.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
