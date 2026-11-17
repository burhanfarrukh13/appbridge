# Benchmark protocol

No Appbridge task-success numbers are published yet. This file is the protocol a run has to
follow for its results to mean anything; the results table stays empty until someone
actually runs it.

Guessing numbers here would be worse than having none. Appbridge does not have measured
task-success results yet; do not make performance or success-rate claims until a run
produces evidence.

## Why a protocol at all

Three things make a desktop-agent benchmark easy to fake: a task set chosen after the run, a
"success" judged by the agent itself, and a machine that was already prepared. The rules
below remove all three.

## Requirements

- **At least 20 tasks** across **at least 5 application classes** (a native Win32 utility, an
  office suite app, a browser-hosted SaaS page, a legacy line-of-business client, a
  terminal-only workflow).
- **Every task stated in advance** as a user request, not as a sequence of clicks:
  "add yesterday's total to the notes file the app has open", not "click Edit, click Append".
- **Fresh session per task**: empty App Memory for that app unless the task is explicitly a
  memory task, default policy, kill switch off, no approvals pre-granted.
- **Success is judged from the Scene**, not from the agent's message: the expected change
  must be visible in a `screen.describe` (or a file read for file tasks), or the task fails.
- **Approvals count as part of the run**, not as failures and not as free passes: record
  whether the task needed one, and whether the human granted it.
- **Run it on the recorded hardware** and state the machine, Windows build, and app versions.
  A result without a machine is not a result.

## How to run

`lab.run` exists for this: it executes a compiled skill with parameters and appends
duration, success and verification status to `~/.appbridge/lab/metrics.json`.

```bash
appbridge skill compile --app <app_id> --file tasks/<task>.json
appbridge lab run --app <app_id> --skill <skill_id>
appbridge call lab.run '{"app_id":"<app_id>","skill_id":"<skill_id>"}'
```

For tasks that are not yet a compiled skill, run them through an MCP client and record the
tool transcript, then judge from the Scene yourself.

## Report

Fill this table per run. Keep the failures.

| # | App class | Task | Result | Steps | Approvals | Verified | Notes |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |

Summary numbers to publish:

- **Task success rate** — tasks completed and confirmed, over tasks attempted.
- **Verification rate** — actions whose effect was confirmed, over actions dispatched.
- **Median steps per task** — tool calls, not keystrokes.
- **Approval rate** — tasks that needed a human grant.
- **Honest failures** — how often the agent correctly reported `no_effect` / `unsupported`
  instead of claiming success. A harness that lies is worse than one that fails.

## Known conditions to state, not hide

Windows only; OCR reads visible pixels; Chromium accessibility may be shallow; the desktop
is shared with the human and there is no lease yet. Any of these can explain a failure and
must be listed next to the number rather than discovered by a reader later.
