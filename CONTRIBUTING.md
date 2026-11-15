# Contributing to Appbridge

Thanks for helping. Appbridge is a local harness that lets an AI operate real applications,
so most review comments come back to three things: **does it perceive honestly, does it
verify, and can it be stopped?**

## Setup

```bash
git clone https://github.com/OWNER/REPO.git appbridge
cd appbridge
npm install
npm run build
npm test
```

Requirements: Node.js ≥ 22.23.4 on Windows 10/11. The test suite uses a `FakeDriver`, so it
runs without a desktop session or accessibility permissions.

Optional desktop console:

```bash
npm run desktop          # flutter run -d windows
```

## Before you open a pull request

```bash
npm run check            # build + tests + universality lint
appbridge doctor         # if you touched the native host or config
```

A change is ready when:

- `npm run check` passes.
- New behaviour has a test. A Scene, firewall, or audit change without a test will be asked
  for one.
- Any new tool is reachable from MCP, REST and the CLI, and is registered in
  `docs/mcp-tools.md`.
- Nothing claims more than it verified. If an action cannot be confirmed, return
  `verified: false` and say why instead of returning `ok`.

## The Universality Contract

**No app or vendor names in `packages/`.** Not in code, types, comments, fixtures or the
PowerShell host. App knowledge belongs in Playbooks, Skills, App Packs, or user
configuration.

```bash
npm run lint:universality
```

Technology-class names (`Chromium`, `Win32`, `UI Automation`) are allowed; product names are
not. This is what keeps the core usable for apps the project has never seen.

## Where things live

| Area | Package |
|---|---|
| Shared types, config, audit, file locks | `packages/core` |
| Effect classification, approvals, firewall | `packages/safety` |
| Scene building, verification, Windows driver | `packages/floor` |
| Playbooks, Skills, App Packs, dialogs | `packages/memory` |
| MCP server, REST gateway, tool logic | `packages/gateway` |
| MCP client config writers | `packages/connect` |
| CLI | `packages/cli` |

Read [`docs/architecture.md`](./docs/architecture.md) before changing the Scene format or the
native host protocol; both are contracts with every client.

## Adding a tool

1. Implement the logic in `packages/gateway/src/bridge.ts` and return an `ActionResult`.
2. Gate every effect through the firewall — never call the driver directly from a tool.
3. Register an MCP tool in `packages/gateway/src/mcp.ts` with a `title`, description, input
   schema and a read-only annotation where applicable.
4. Expose it through REST automatically (the gateway maps tools by name) and document it in
   `docs/mcp-tools.md`.
5. Add a test with `FakeDriver`.

## Adding a platform driver

Implement `DeviceDriver` from `packages/floor/src/driver.ts`. Keep normalisation inside the
driver: callers must never see platform-specific shapes. Reuse the Scene builder unchanged;
if the platform cannot supply a field, return an empty value and let the Scene mark it rather
than inventing data.

## Style

- TypeScript strict mode, ESM, NodeNext resolution.
- Comments explain *why*, not *what*. Avoid describing the diff.
- Prefer a smaller honest result over a larger guessed one.
- No telemetry, no analytics, no network calls in core paths.

## Commits and pull requests

Conventional-commit prefixes are welcome (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
In the pull request, state:

- what changed and why,
- how you verified it (commands, and the machine or fixture used),
- what is still not covered.

## Security

Do not open a public issue for a vulnerability. See [`SECURITY.md`](./SECURITY.md).

## Code of conduct

Participation is covered by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Maintainers

Repository creation, metadata, branch protection and release steps are in
[`docs/publishing.md`](./docs/publishing.md).
