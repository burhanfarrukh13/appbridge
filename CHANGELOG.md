# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [0.0.1] — 2026-11-15

First public release: a working Windows Floor, safety harness, MCP/REST/CLI surface, App
Memory, desktop console, and a portable Windows ZIP package.

### Added

- **Perception.** Structured Scene from Windows UI Automation: stable element ids, roles,
  names, bounds, states, supported actions, parent/child links, focus, per-element risk hints,
  untrusted marking, prompt-injection flags, and a content digest for change detection.
- **Partial snapshots.** `max_depth` plus `root` subtree drilling (`screen.describe`,
  `appbridge scene --depth`, `--root`) so dense apps can be read incrementally instead of
  dumping every node into the model context. Containers hiding content are marked
  `children_omitted`.
- **Local OCR.** Windows OCR engine fused into the Scene as untrusted text when accessibility
  is sparse; no image leaves the machine. `doctor` reports installed recognizer languages.
- **Action.** Accessibility Invoke/Toggle/Select/Expand/Value, synthetic mouse and keyboard,
  Unicode typing, clipboard, window focus/minimize/maximize/restore/close, scroll, drag.
- **Verification.** Every action returns `{ok, class, route, verified, change, next}`;
  expectation-based waits for elements, values, titles and files.
- **Safety harness.** Effect classifier, Action Firewall, persisted one-shot and time-boxed
  approvals, credential/privileged handoff, kill switch, hash-chained audit log, and
  cross-process file locking for approvals and audit appends.
- **Local access.** Root-scoped file list/search/read/write/edit and approval-gated,
  time-limited shell commands.
- **Memory.** Playbooks per app, declarative Skills compiled from Teach-mode recordings,
  App Packs with secret sanitization and SHA-256 manifests, dialog detection and handling.
- **Interfaces.** MCP stdio with 43 tools and per-tool read-only/open-world annotations,
  loopback REST + OpenAPI with bearer token and Origin checks, and a CLI.
- **Connect Hub.** Detection and config writers for popular MCP clients, with backups and
  undo.
- **Desktop console.** Flutter app with dashboard, app list, approval queue, audit timeline,
  skills, settings and a chat panel.
- **Portable Windows ZIP.** Includes the desktop app and production backend runtime; extracts
  and runs without a source checkout or separate Node.js installation.
- **Project scaffolding.** Apache-2.0 license, contributing guide, security policy, code of
  conduct, CI workflow, issue and pull request templates, architecture and tool reference
  docs, examples, and a competitive gap analysis (`gap_plan.md`).

### Fixed

- Default policy allowed `external-effect` and `unknown` actions without approval, contrary
  to the documented safety model. Both now require approval by default.
- Scene parent/child links were never populated because ids were looked up in the wrong map;
  `children`, `children_count` and drill hints now work.
- Audit appends could break the hash chain when the daemon, CLI and gateway wrote
  concurrently: appends are now serialized and re-read the true tail under a lock.
- Approval updates could be lost between concurrent processes; the store now uses the same
  cross-process lock.
- CLI version and MCP server version were hardcoded; both now come from `package.json`.
- Desktop startup no longer depends on a maintainer-specific checkout path.
- Ollama settings can be loaded from the per-user Appbridge environment file without a
  maintainer-specific path or greeting.
- README described an earlier build (claimed no GUI, no Skills, no App Packs).

### Known limits

Windows-only; no VLM grounding; OCR reads visible pixels; no VM workspace or rollback;
single local gateway token. See [`docs/status.md`](./docs/status.md) and
[`gap_plan.md`](./gap_plan.md).
