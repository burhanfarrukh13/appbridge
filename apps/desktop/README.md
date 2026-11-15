# Appbridge desktop console

A Flutter (Windows) console for the loopback gateway: dashboard, app list, approval queue,
audit timeline, skills, settings, and a chat panel.

It is a client of the REST gateway, not a second driver — everything it does goes through the
same tools, policy, and audit log as MCP and the CLI.

## Run

```bash
# from the repository root
appbridge serve          # terminal 1: MCP + REST on 127.0.0.1:8787
npm run desktop          # terminal 2: flutter run -d windows
```

The console reads the bearer token from `~/.appbridge/gateway-token` (or the
`APPBRIDGE_GATEWAY_TOKEN` environment variable) and polls the gateway every few seconds so the
kill switch and approval queue stay live.

## Build

```bash
npm run desktop:build    # flutter build windows
```

Output lands in `apps/desktop/build/windows/x64/runner/Release/`.

## Portable Windows release

The GitHub release ZIP contains the complete Flutter output plus a colocated Appbridge
backend runtime and Node.js. Extract the full ZIP to a stable folder and run
`appbridge_desktop.exe`; do not move or run the EXE by itself. On first launch, use
**Settings → Start Core Daemon**. Configure the allowed file roots in
`%USERPROFILE%\.appbridge\config.toml` before connecting an AI client. Optional Ollama
settings can be supplied in `%USERPROFILE%\.appbridge\agent.env`. This is a portable ZIP,
not an installer, and the executable is not code-signed.

## Layout

```text
lib/main.dart            shell, navigation, kill switch header, polling
lib/services/            REST client and the local agent loop
lib/screens/             dashboard, apps, approvals, audit, skills, settings, connect, chat
lib/models/              gateway payload models
lib/theme/               dark theme
```
