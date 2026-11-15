# Tool reference

Appbridge exposes the same 43 tools over MCP stdio, the loopback REST gateway, and the CLI
(`appbridge call <tool> '<json>'`). Every tool returns the same envelope and passes the same
firewall.

## Result envelope

```jsonc
{
  "ok": true,                 // true only when the action was verified
  "class": "ok",              // ok | no_effect | wrong_state | error_dialog | timeout |
                              // blocked | needs_human | unsupported | stale_element |
                              // injection_suspected
  "route": "uia",             // uia | win32 | mouse | keyboard | clipboard | policy | ...
  "verified": true,
  "reason": null,             // why it failed, when it failed
  "next": "…",                // what the agent should try next
  "change": { "added": [], "removed": [], "changed": [] },
  "scene_id": "s4",
  "data": { }
}
```

`class: "needs_human"` includes an `approval` object with an id. The human grants it
out-of-band (`appbridge approvals approve <id> --once`), then the agent retries the same
call. Retrying before the grant returns another `needs_human`, which is the correct
behaviour: the model cannot self-approve.

## Window targeting

Most tools accept `window_id` or `window_title`. A title match is exact first, then
case-insensitive partial, then a tab lookup inside open windows. Omit both to target the
focused window. Use `apps.list` first when unsure.

## Perception

| Tool | Purpose | Key inputs | Read-only |
|---|---|---|---|
| `screen.describe` | Structured Scene of a window | `window_id`/`window_title`, `max_elements`, `max_depth`, `root`, `include_offscreen`, `include_ocr` | yes |
| `screen.ocr` | Windows OCR on a window or region | `window_id`/`window_title`, `region`, `scale` | yes |
| `screen.capture` | PNG screenshot (attached as image content) | `window_id`/`window_title`, `region`, `scale` | yes |
| `ui.find` | Search the Scene by name/automation id | `query`, `role`, `limit`, window target | yes |
| `apps.list` | Visible top-level windows with process, pid, bounds, focus | — | yes |
| `apps.describe` | Learn/inspect one app: Playbook, technology, risk map | window target, `notes` | writes a Playbook |
| `window.list` | Window list (same data as `apps.list`) | — | yes |
| `dialog.list` | Detect and classify dialogs in the target window | window target | yes |
| `inventory` | Write `~/.appbridge/device.json` with windows and processes | — | writes a file |

`screen.describe` returns `children_omitted: true` on containers whose content is outside the
snapshot. Drill in with `root: "<id>"` instead of raising `max_depth` and paying for the whole
tree.

## Interaction

| Tool | Purpose | Key inputs |
|---|---|---|
| `ui.click` | Click an element (accessibility first, pointer fallback) | `uid` or `name`/`role`, `button`, `count`, `expect`, `timeout_ms` |
| `ui.type` | Type Unicode text; optional submit | `text`, `submit`, `expect`, `timeout_ms` |
| `ui.key` | Key or chord | `combo` (`CTRL+SHIFT+S`), `expect`, `timeout_ms` |
| `ui.set_value` | Write a value through ValuePattern | `uid`, `value` |
| `ui.scroll` | Scroll inside an element or point | `uid`, `direction`, `amount`, `expect`, `timeout_ms` |
| `ui.drag` | Drag between elements or points | `from_uid`/`to_uid` or `from`/`to` |
| `ui.wait_for` | Wait for an expectation without a fixed sleep | `role`, `name`, `window_title_contains`, `timeout_ms` |
| `window.focus` | Focus a window and report whether the OS agreed | window target |
| `window.action` | `focus`, `minimize`, `maximize`, `restore`, `close`, `move_resize` | window target, `action` |
| `clipboard.get` | Read clipboard text | — |
| `clipboard.set` | Write clipboard text | `text` |
| `app.launch` | Start an executable | `path`, `args` |

`window.focus` reports `no_effect` when Windows refuses a background focus change rather than
claiming success. `ui.type` verification depends on a readable value; when the control cannot
be read back, `verified` is false and the reason says so.

## Local files

| Tool | Purpose | Key inputs |
|---|---|---|
| `filesystem.roots` | List configured roots | — |
| `filesystem.list` | List a directory under a root | `path` |
| `filesystem.search` | Search names and text under a root | `query`, `path`, `max_results` |
| `filesystem.read` | Read a bounded line range | `path`, `start_line`, `max_lines` |
| `filesystem.write` | Write a file under a root | `path`, `content` |
| `filesystem.edit` | Exact, unique string replacement | `path`, `old_text`, `new_text` |

Only directories in `[filesystem].roots` are reachable. Symlinks are not followed. File
content is untrusted data.

## Terminal

| Tool | Purpose | Key inputs |
|---|---|---|
| `terminal.list` | Detected shells (PowerShell, cmd, bash, sh, zsh, WSL) | — |
| `terminal.run` | One non-interactive command with timeout and output cap | `shell`, `command`, `cwd`, `timeout_ms` |

Routine read/build/test commands run without prompting. Destructive, privileged,
external-effect, chained or unclassified commands require approval or human handoff. Runs are
audited. The working directory must be inside an approved root; the command itself inherits
your OS account's permissions, so approve carefully.

## Session and governance

| Tool | Purpose | Key inputs |
|---|---|---|
| `session.status` | Session, policy, halt state, pending approvals | — |
| `session.stop` | Kill switch on | — |
| `session.resume` | Kill switch off | — |
| `audit.tail` | Recent audit records | `limit` |
| `dialog.handle` | Act on a detected dialog (`dismiss`, `accept`, `choose_path`, …) | `dialog_id`, `action`, `button`, `path` |

## Memory and skills

| Tool | Purpose | Key inputs |
|---|---|---|
| `playbook.get` | Read a Playbook for an app | `app_id` |
| `memory.store.list` | List skills for an app | `app_id` |
| `memory.store.get` | Read one skill | `app_id`, `skill_id` |
| `skill.compile` | Compile recorded events into a declarative skill | `app_id`, `app_name`, `window_title`, `name`, `description`, `params`, `events` |
| `skill.run` | Run a skill with parameters and verification | `skill_id`, `app_id`, `params` |
| `skill.record_start` | Begin Teach-mode recording | `app_id`, `window_title`, `name`, `description` |
| `skill.record_event` | Append an observed step | `act`, `target`, `text`, `combo`, `value`, `direction`, `amount`, `button`, `note` |
| `skill.record_stop` | Stop recording and compile | — |
| `lab.run` | Run a skill in the lab harness and record metrics | `skill_id`, `app_id`, `params` |

## MCP annotations

Tools declare `readOnlyHint` where true (perception, filesystem reads, `session.status`,
`audit.tail`), `openWorldHint` for `app.launch` and `terminal.run`, and `idempotentHint` for
`window.focus` and `window.action`. Clients that hide or auto-approve read-only tools rely on
these hints; they are advisory only. The Action Firewall is the authority.

## REST mapping

Every tool is available as `POST /v1/tools/<tool>` with the same JSON body and a bearer token:

```bash
curl -s -X POST http://127.0.0.1:8787/v1/tools/screen.describe \
  -H "Authorization: Bearer $(cat ~/.appbridge/gateway-token)" \
  -H "Content-Type: application/json" \
  -d '{"window_title":"Untitled - Notepad","max_depth":3}'
```

`GET /v1/status`, `GET /v1/approvals`, `POST /v1/approvals/:id`, `GET /v1/openapi.json` and
`GET /healthz` round out the gateway. See `packages/gateway/src/http.ts` for the exact routes.

## CLI equivalents

```bash
appbridge scene --window "..." --depth 3 --root e5
appbridge call ui.click '{"uid":"e12"}'
appbridge call skill.run '{"app_id":"notes","skill_id":"new-note"}'
appbridge audit tail --limit 50
appbridge policy set unknown approve
```
