# Tool map

42 tools. This is which one to reach for, and which ones this skill leaves alone.

## Perception — start here, every time

| Tool | Use it for | Notes |
|---|---|---|
| `apps.list` | Enumerate visible windows with process, pid, bounds, focus | Cheapest call in the server. Do this before guessing a title. |
| `screen.describe` | The Scene: element ids, roles, names, states, risk hints | `max_depth: 3` first. `root` to drill. `include_ocr: true` only when the tree is sparse. |
| `ui.find` | Find an element by name or automation id when the tree is large | Returns matches only; it does not act. |
| `screen.ocr` | Text that accessibility does not expose (custom-drawn grids, canvas UIs) | Reads visible pixels: a covered window yields what is on top. |
| `screen.capture` | A PNG when the user asks to see something, or as a last resort | Costs tokens; prefer the Scene. |
| `dialog.list` | Detect and classify modal dialogs before interacting | `credential` dialogs are handoff-only. |
| `apps.describe` | Inspect or learn an app into a Playbook | Writes to App Memory; useful only if the user wants it. |
| `playbook.get` | Read a previously learned Playbook for the app | Good for stable selectors on a known app. |
| `inventory` | Snapshot windows and processes to `device.json` | Only when asked; it writes a file. |

## Interaction — one action, then verify

| Tool | Use it for | Notes |
|---|---|---|
| `ui.click` | Buttons, menu items, list rows, checkboxes | Takes `uid` first, `name`/`role` as a fallback. Attach `expect`. |
| `ui.set_value` | Text inputs, combo boxes with a value pattern | Most reliable typing route; verified by read-back. |
| `ui.type` | Free text into whatever is focused, optionally `submit` | Prefer `set_value` when the element has one. |
| `ui.key` | Chords: `CTRL+S`, `ENTER`, `ESC`, `ALT+F4` | A bare `DELETE` is classified destructive. |
| `ui.scroll` | Reach content below the fold | Scroll the container's `uid`, not the window, when you can. |
| `ui.drag` | Reorder, resize, sliders | Last resort; verifies poorly. |
| `ui.wait_for` | Explicit wait without a fixed sleep | `element_appears`, `value_equals`, `window_title_contains`. |
| `window.focus` | Bring a window forward on purpose | `no_effect` means Windows refused; ask the user to click it. |
| `window.action` | `focus`, `minimize`, `maximize`, `restore`, `close` | `close` can discard unsaved work. Say so first. |
| `clipboard.get` / `clipboard.set` | Move text through an app with no better route | Clipboard write can require approval depending on policy. |

## Governance — read, respect, never forge

| Tool | Use it for |
|---|---|
| `session.status` | Halt state, policy, pending approvals, denied tools. First call of a session. |
| `session.stop` | Only when the user asks to stop. This is their brake, not yours. |
| `audit.tail` | What actually happened, with result classes and approval ids. Use it to answer "did it work?". |
| `dialog.handle` | Act on a classified dialog, including `choose_path` for a file picker. |

Approvals and kill-switch resume are operator-only controls. Never grant or deny an approval
or try to clear the kill switch. The human can use the desktop controls or the Appbridge CLI.

## Memory and skills — only when the user wants reuse

`skill.compile`, `skill.run`, `skill.record_start`, `skill.record_event`,
`skill.record_stop`, `memory.store.list`, `memory.store.get`, `lab.run`.

These compile and replay a recorded trajectory inside one app. Reach for them when the user
asks for a repeatable procedure or a benchmark, not as a shortcut around perception: a
compiled skill resolves selectors against a fresh Scene, so it still fails honestly when
the window changes.

Note the name collision: an Appbridge *Skill* is a declarative automation for one app. This
SKILL.md is agent guidance. They are different objects; do not tell the user you "installed
a skill" when you recorded a trajectory.

## Out of bounds for this skill

| Tool | Why |
|---|---|
| `terminal.run` | Shell execution is a different task with a different risk profile. Only on an explicit user request, after saying what will run. Build/test commands require approval by default and the shell is not sandboxed by filesystem roots. |
| `app.launch` | Starting an executable is not "operating an open app". Ask first. |
| `filesystem.write` / `filesystem.edit` | Allowed only inside `filesystem.roots`, and only when the task is about files, not about the app UI. |

If one of these returns `class: "blocked"`, the machine was configured that way
(`[tools] deny` in `config.toml`). Do not look for another route to the same effect.
