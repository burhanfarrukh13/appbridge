# Security policy

Appbridge can click, type, run files and start shell commands on a real machine. That makes
security reports especially valuable. Please report privately.

## Reporting a vulnerability

Use **GitHub → Security → Report a vulnerability** (private advisory) on this repository.
If that is unavailable, open a minimal public issue that only asks for a private channel —
do not include exploit details, payloads, affected app names or personal data.

Please include:

- affected version or commit,
- the smallest reproduction you can share,
- what an attacker gains (for example: policy bypass, approval forgery, audit tampering,
  prompt injection that changes an effect class, data exfiltration),
- whether the issue requires a local process, a malicious app, or only screen content.

We will acknowledge within 5 business days and agree a disclosure timeline with you. Please
give us a reasonable window before publishing.

## Supported versions

The latest release on the default branch. This project is pre-1.0, so fixes land on `main`
and in the next tagged release; there are no long-lived backport branches yet.

## Design guarantees (and their boundaries)

| Guarantee | Boundary |
|---|---|
| Screen, file and command text is untrusted data and cannot change policy | The model can still be *persuaded* by injected text to request a risky action; that request must pass the firewall |
| Irreversible effects require a human grant by default | A user who sets an effect to `allow` in `config.toml` removes that protection |
| Credential and privileged effects are handoff-only | The user can change policy, but Appbridge will not type a password for the model |
| Audit records are append-only and hash-chained | A local process with write access to `~/.appbridge/audit.jsonl` can delete the file; deletion is detectable only if you keep the chain elsewhere |
| Agent tool dispatch cannot grant approvals or clear the kill switch | Operator controls are separate from agent tools; a local process with the gateway bearer token can still call operator routes |
| Gateway is loopback-only with a bearer token, Host/Origin checks and no wildcard CORS | Any local process that can read `~/.appbridge/gateway-token` can call the gateway |
| File tools are root-scoped and do not follow symlinks | Terminal commands run with your OS account's permissions; roots constrain only the working directory, not shell access |
| Kill switch stops further actions | It is checked before each action, not inside an already-running shell command; only the human can resume |

## Threat model

In scope:

- prompt injection from screen text, documents, web pages or tool output,
- policy bypass through misclassification or forged effect metadata,
- approval replay, scope confusion, or race conditions between CLI and daemon,
- audit chain forgery or silent truncation,
- path traversal, symlink escape, or command injection in the file and terminal tools,
- DNS rebinding and cross-origin access against the loopback gateway,
- secret leakage through App Packs, logs or audit arguments.

Out of scope:

- an attacker who already has code execution or write access as your OS user (they can drive
  the desktop without Appbridge),
- CAPTCHA solving, DRM bypass, anti-cheat evasion, or crossing privilege boundaries,
- denial of service against the host machine,
- vulnerabilities in third-party applications that Appbridge merely drives.

## Hardening checklist for users

- Keep `destructive`, `external-effect` and `unknown` at `approve`.
- Keep `credential` and `privileged` at `handoff`.
- Approve `--once` rather than `--for 30m` when the action is rare.
- Run the agent against a test account or a VM when trying a new app.
- Review `appbridge audit tail --limit 50` after an unattended session.
- Treat App Packs from other people as code-adjacent: they are scanned and sanitized, but
  read the `SKILL.md` before running one.
