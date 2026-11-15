# Appbridge — Master Plan

> **Goal:** Whatever a person can do in any app or website on a computer, an AI can do through Appbridge, even if the app is old, obscure, or has no API, plugin or MCP. Any AI (local or cloud). Works offline. Anyone can use it.
> **Status:** planning, nothing built yet. **Last updated:** 2026-11-06.
> **This is the only plan file.** It merges and replaces the earlier drafts (v1, v2, and the layered v3/v3.1/v3.2).

## Contents
1. Vision and the north-star test
2. Locked decisions
3. Principles, the Universality Contract, non-goals
4. What "anything a human can do" means (parity checklist)
5. The whole device: what must be covered
6. Architecture
7. The Floor: the human-parity engine
8. Agent Workspace
9. Learning and App Memory
10. Accelerators: optional faster routes
11. Add-app flow, device inventory, discovery
12. The AI-facing layer
13. App Packs: export and import
14. Connect Hub: adding Appbridge to AI tools
15. Offline-first and hardware
16. Safety, privacy, permissions
17. Legal and ethical boundary
18. Reusing the reference projects
19. Technology stack and repository layout
20. Platform strategy
21. Testing and evaluation
22. Roadmap
23. Risks
24. Open decisions
25. First 14 days
Appendices: A Scene format · B Playbook and Skill formats · C Operation spec (accelerators) · D Local folder layout · E Glossary

---

## 1. Vision and the north-star test

### 1.1 The idea
If an app was built in 2012 (or 1998) and nobody ever built an API, plugin or MCP server for it, a person can still use it by looking at the screen and using the mouse and keyboard. **Appbridge gives an AI those same eyes and hands**, so anyone can get AI to do real work in *any* app, including the long tail of old, generic, niche software that no vendor will ever integrate.

### 1.2 Why this is different from Microsoft Copilot in Office
Copilot works because Microsoft owns the app: the AI runs inside it, uses its internal object model, and billing is tied to Microsoft's accounts. A third party cannot be inside someone else's app, but it can do the same job from the outside: look, click, type, and use whatever programmatic surfaces the app happens to have (object model, command line, local database, web requests). Appbridge is the vendor-independent version of that.

### 1.3 North-star test: the "Outlook-2012 Test"
Take an app with **zero** AI integration. Tell an AI: "Find the email from Ahmed about the invoice, save the attachment to the Finance folder, and reply 'received'." If a person could do it in that app, Appbridge must let the AI do it, reliably, safely and repeatably. (Outlook is only an illustration. The test is run on apps sampled by technology class, never on a fixed list. See the Universality Contract, section 3.)

### 1.4 What the user sees
1. **Add app** (pick from detected apps, a window, or a website). Appbridge learns it and stores what it learned in **App Memory**.
2. The app gets a **grade** and a plain list of what AI can do there.
3. The user talks to the **built-in chat** (own API key or local model) or connects any external AI (Claude, Codex, Antigravity, others) through MCP/REST/CLI.
4. The user can **export** what was learned (an App Pack) so other AIs can work on that app too.
5. The user stays in control: permissions, approvals, what data may leave the machine.

### 1.5 Honest framing: where the difficulty and the value are
Existing "computer-use" agents (AI that looks at screenshots and clicks) prove the idea but are unreliable, slow, costly, forgetful, and take over your screen. Appbridge does not build a model. It builds everything around the model:
- a better **body**: fused perception (accessibility + OCR + detection + vision) so the AI sees a *structured* screen;
- **memory**: Playbooks and compiled Skills so second runs are fast, cheap and deterministic;
- a **safety harness**: an Action Firewall, approvals, snapshots and rollback;
- **isolation**: a separate workspace so it does not fight the user;
- **universality**: any app, any AI, offline.

The AI is the brain (replaceable). Appbridge is the body, the senses, the muscle memory and the safety harness.

---

## 2. Locked decisions

| # | Decision | Where it is specified |
|---|---|---|
| D1 | **Universal for any app**, regardless of name, vendor, age, language or technology. No app-specific design. | Section 3 (Universality Contract) |
| D2 | **Any AI, local or cloud.** Provider-agnostic; capability negotiation. | Section 12 |
| D3 | **The tool works fully offline.** Only the user-chosen cloud AI needs internet. | Section 15 |
| D4 | **GPU for better quality, CPU still works (slower).** Auto-detect, Fast/Balanced/Best profiles. | Section 15 |
| D5 | **Both developers and normal people.** One engine, three front doors (built-in chat, external AI clients, scripts/CLI). | Sections 11, 12 |
| D6 | **Add app, it learns, it stores in memory.** Built-in chat with the user's own API key (or local model). | Sections 9, 11, 12 |
| D7 | **Export what was learned** (App Pack) so any AI (Claude, Codex, Antigravity, others) can analyze, save and work on that app. | Section 13 |
| D8 | **Connect to AI tools** via MCP, skills and plugins/connectors through a Connect Hub. | Section 14 |
| D9 | **LMCP, REA and api-anything are references**: reuse their code where license and design allow. | Section 18 |
| D10 | **Human-parity first**; APIs, COM, CDP etc. are optional accelerators, never required. | Sections 7, 10 |

Remaining open questions are in section 24.

---

## 3. Principles, the Universality Contract, non-goals

### 3.1 Principles
1. **Floor first, accelerate later.** Seeing and acting like a human works on every app; faster routes are optional and always fall back to the Floor.
2. **Local-first.** Runs on the user's device; no account, no telemetry, no mandatory cloud.
3. **Generate, do not hand-write.** Knowledge about apps is learned and stored as data.
4. **Inspectable artifacts.** Playbooks, Skills and packs are readable files, versioned and editable.
5. **Honest results.** Every call says what happened, which route was used, what was verified, and what to do next. Never fake success.
6. **Safety is the product.** Action Firewall, approvals, handoff to the user, injection defenses, data-egress control are core.
7. **AI-agnostic.** MCP, REST/OpenAPI, function-calling schemas, CLI; cloud and local models.
8. **Authorized use only.** The user's own apps, accounts and data (section 17).

### 3.2 The Universality Contract (enforced, not aspirational)
1. **Zero app names in core code.** The core, Floor, Pilot, safety harness and learning engine contain no per-app branches, allow-lists, hard-coded titles or selectors. A CI lint fails the build if an app or vendor name appears in core packages.
2. **App-specific knowledge lives only in data** (Playbooks, Skills, dialog handlers, risk maps): optional, generated, removable. Deleting every Playbook must leave the tool fully working, just slower on the first run.
3. **Classify by technology and behavior, not brand.** Fingerprinting records: UI toolkit/runtime (Win32, .NET, Java, Qt, Electron, web, terminal, pixel-only...), accessibility quality score, scriptable routes present, language/script, DPI behavior. Routing uses these properties.
4. **Accelerators are generic per technology** (COM introspection, CLI help parsing, CDP, SQLite inspection...), never per app.
5. **Held-out universality test in CI.** Every release is run against a held-out set of apps never used in development or tuning, with no code changes allowed; a regression blocks release. Test apps are chosen by **sampling technology classes** (public freeware across toolkits, plus apps found on testers' machines via the inventory), not by popularity.
6. **Self-describing failure.** When an app cannot be driven (blocked, exotic rendering), the tool says exactly what is missing and what the user can try.

### 3.3 Non-goals
- Defeating licenses, paywalls, DRM, anti-cheat, CAPTCHAs, or re-creating a vendor's paid server-side AI for free.
- Becoming a general enterprise RPA platform (the target is AI-driven work with learned, typed, safe skills).
- Hosting apps in the cloud for users.
- Deterministic reliability for pixel-only or custom-drawn UIs (they get best-effort vision grade).

---

## 4. What "anything a human can do" means: the parity checklist

This checklist is the test suite for the Floor. Every item gets at least 3 test apps and an automated pass/fail check.

**Perceive**
- See the whole screen, any window, any monitor; read text in any script (including right-to-left and non-Latin), icons, tables, charts, colors, disabled/greyed state, selection, focus, caret.
- Detect changes: spinners, progress bars, popups, toasts, new windows, hung apps ("Not Responding").
- Read what no accessibility tree exposes: custom-drawn grids, text in images, rendered documents.

**Act**
- Mouse: move, click, double/right/middle click, drag-and-drop, scroll, hover (tooltips), press-and-hold, region select.
- Keyboard: type text (including Unicode/IME), shortcuts, menu mnemonics, function keys, Tab navigation.
- Clipboard: text, files, images.
- Windows: launch, focus, switch, minimize/maximize, resize, move, close; multiple windows; MDI children.
- Controls: ribbons, nested/context menus, toolbars, tree views, tabs, combo/list boxes, date pickers, sliders, checkboxes, radio groups.
- Dialogs: file open/save pickers, print, message boxes, wizards/installers, confirmations, UAC (**handoff**).
- Files and printing: save/export/import/attach; print to PDF.

**Understand**
- Know where it is in the app, what is possible here, what a control means (label, position, context, manual).
- Read F1 help, CHM/PDF manuals, tooltips, status bar, error messages.
- Remember how the app works (Playbook).

**Plan and recover**
- Break a goal into steps; choose menu path or shortcut; adapt to version, language, theme, DPI, window size.
- Detect failure (wrong screen, error dialog, no effect) and recover: undo, back out, retry differently, ask a human.
- Wait correctly (until something appears, not fixed sleeps).

**Hand off to humans (never fake it)**
- CAPTCHAs, 2FA codes, passwords/biometrics, UAC/admin prompts, payment confirmations, ambiguous decisions, legal/consent screens: pause and ask the user with a clear explanation.

**Learn**
- From exploring, from manuals, from a human demonstration, and from its own successful runs; compile repeatable tasks into fast Skills; repair them when the app changes.

---

## 5. The whole device: what must be covered

Everything on a device falls into these layers. All are in scope; coverage grade varies (section 10.4).

### 5.1 OS layer (AI needs this constantly)
| Area | Examples |
|---|---|
| File system | list/search/read/write/move/copy/zip, metadata, watch folders, recycle bin |
| Processes and windows | list apps/windows, launch, focus, close, move/resize, services |
| Settings and system | display, sound, network, power, default apps, settings pages, registry (guarded), environment variables |
| Shell/terminal | PowerShell, cmd, WSL, bash, zsh (heavily guarded) |
| Clipboard, notifications, capture, OCR | read/write clipboard, read notifications, capture a region |
| Scheduler and automation | Task Scheduler/cron, startup items |
| Package management | winget/choco/scoop/brew/apt: list, install, update |
| Devices/peripherals | printers, scanners, audio, Bluetooth, cameras (permissioned) |
| Network and security | firewall/VPN status, connections (mostly read-only) |
| Credentials | credential vault: operations may *use* secrets; raw secrets are never returned to AI |

### 5.2 Application categories
- **Documents and productivity:** word processors, spreadsheets, presentations, note apps, PDF tools, e-readers, reference managers, Markdown editors.
- **Communication and collaboration:** email clients, chat/messaging apps, video meetings, project/issue trackers, calendars, contacts.
- **Browsers and the web:** every browser, installed web apps, every website and SaaS (CRM, ERP, banking, government portals, e-commerce, social, streaming), including the user's logged-in sessions.
- **Developer tools:** IDEs/editors, Git clients, terminals, containers, database clients, API clients, build tools, cloud CLIs, local servers.
- **Creative and engineering:** image/video/audio editors, DAWs, 3D/CAD/CAE, design tools, scientific and numeric tools, game-engine editors.
- **Data, finance, business:** BI tools, statistics tools, accounting, ERP/CRM, HR/payroll, POS/inventory, hospital/clinic/school management, banking apps.
- **Media and personal:** music/video players, game launchers, galleries, smart-home apps.
- **Utilities:** archivers, download/torrent clients, backup, antivirus, disk tools, VPN and remote-desktop clients, password managers (special handling).
- **Legacy and custom:** Win32/MFC/VB6/Delphi/PowerBuilder, Java Swing/SWT, WinForms/WPF, Qt, GTK, terminal-based mainframe emulators, in-house line-of-business tools, kiosk software. Often no API and weak accessibility: the hardest and most valuable category.
- **Virtualized/remote:** RDP/Citrix/VNC, VMs, web-based VDI, Android emulators (pixels only unless a guest agent is installed).
- **Mobile and beyond (later):** Android (adb, accessibility, emulators), iOS (very limited), smart-home/IoT APIs.

---

## 6. Architecture

```
┌──────────────────────── Any AI (the "brain") ────────────────────────┐
│ Cloud LLMs · local models · external clients (Claude, Codex, ...)     │
└───────┬───────────────────────────────────────────────┬──────────────┘
        │ TOOL MODE (fine-grained: see/click/type)      │ TASK MODE (delegate a goal)
        ▼                                               ▼
┌──────────────────────────── Appbridge daemon ────────────────────────────────┐
│ Gateway: MCP · REST/OpenAPI · function-call schemas · CLI · SDK              │
│ Provider layer (local/cloud models) · Session manager · Task Pilot          │
│ ───────────────── SAFETY HARNESS ─────────────────                           │
│ Action Firewall · permissions · approvals · handoff · injection guard ·      │
│ egress/privacy filters · pacing · audit · kill switch                        │
│ ───────────────── THE FLOOR (Human-Parity Engine) ───────────────────────────│
│  PERCEPTION            ACTION                  VERIFY & RECOVER              │
│  screen capture        mouse / keyboard        expected-state checks         │
│  accessibility trees   clipboard / files       stability waits and diffs     │
│  window metadata       window management       undo / back-out / retry       │
│  OCR / text layout     dialog handlers         snapshot and rollback         │
│  UI element detection  drag-drop / scroll      human handoff                 │
│  VLM grounding         wait-for logic                                        │
│  → fused "Scene"                                                             │
│ ───────────────── APP MEMORY ────────────────────────────────────────────────│
│  Playbooks · Skills · selectors · risk maps · run history · packs            │
│ ───────────────── ACCELERATORS (optional) ───────────────────────────────────│
│  COM/object models · CLI · CDP/Electron · local data · local IPC ·           │
│  web (api-anything) · official API/MCP · companion plugins                   │
│ ───────────────── AGENT WORKSPACE ───────────────────────────────────────────│
│  shared desktop │ second desktop/session │ VM with guest agent (snapshots)   │
│ ───────────────── Connect Hub · Add-app UI · built-in chat · tray ───────────│
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼ Target apps (any: old, new, native, web, terminal, remote)
```

### 6.1 Two modes (both needed)
- **Tool mode:** the external AI drives step by step (`screen.describe`, `ui.click`, `ui.type`, ...). Maximum flexibility; works with any capable AI; slowest.
- **Task mode:** the AI says *what* it wants; Appbridge's **Task Pilot** runs the loop with the user's chosen model, uses Playbooks and Skills, and returns a verified result plus evidence. Faster, cheaper, safer.
Both pass through the same Safety Harness.

### 6.2 Process model (isolation matters)
- `appbridged`: core (gateway, safety, router, memory).
- `ab-floor-*`: sandboxed workers (capture, accessibility bridge, OCR/vision, input synthesis).
- `ab-pilot`: the agent loop (swappable).
- `ab-workspace`: desktop/VM sessions and guest agent.
- `ab-accel-*`: accelerator workers, each sandboxed.
- `ab-learn`: exploration and compilation (stricter permissions, runs only when triggered).
- UI/tray/built-in chat are clients of the daemon.

---

## 7. The Floor: the human-parity engine

### 7.1 Perception: build a "Scene" from many signals
| Signal | Strength | Weakness |
|---|---|---|
| **Accessibility tree** (Windows UI Automation + MSAA/IAccessible2; Java Access Bridge; macOS AX; Linux AT-SPI) | Exact names, roles, values, states, actions; cheap | Missing or wrong in custom-drawn or old apps |
| **Window/process metadata** (titles, classes, handles, classic Win32 child controls) | Works on very old apps | Limited meaning |
| **OCR / text layout** | Reads anything visible | Misreads; no semantics; slower on large screens |
| **UI element detection** (trained detector for buttons, fields, icons, tables) | Finds controls with no tree | Needs a good model; false positives |
| **Vision-language model grounding** | Understands meaning ("the Send button") | Cost, latency, imperfect coordinates |
| **Pixel diff / stability** | Knows when the screen finished changing; detects popups | No meaning |
| **Caret/focus tracking** | Knows where typing goes | OS-dependent |

**Perception policy (cost control):** start with the cheapest signals (tree + metadata); add OCR when text is missing; add detector/VLM only for regions still unresolved; use pixel diff to skip unchanged screens; cache per-app element maps. The result is the **Scene** (Appendix A): compact, structured, with ids, labels, roles, states, positions, plus an optional annotated screenshot for vision models. Text-only models get the structured Scene alone.

### 7.2 Stable element identity
A selector is a bundle, tried in order and combined into a confidence score: (1) automation id / control id / class + name; (2) tree path + role + sibling index; (3) text label (tree/OCR) + role; (4) visual anchor (small image template or embedding of the element and neighbors); (5) relative geometry to a landmark; (6) semantic description resolved by a VLM as last resort. Low confidence triggers re-perception or a question to the user.

### 7.3 Action: precise and polite
- **Input synthesis order:** semantic actions first (accessibility Invoke/SetValue/Select, window messages for classic controls), then OS-level synthetic mouse/keyboard, then coordinate clicks from vision as last resort.
- **Pacing and correctness:** human-like speed, retry with verification, focus management, DPI/scaling/multi-monitor coordinate mapping, IME/Unicode typing, keyboard layouts.
- **Hard interactions:** drag-and-drop, scroll-to-find, virtualized lists, hover tooltips, right-click and nested menus with hover timing, ribbons and collapsed toolbars.
- **Dialog handlers:** common patterns (file pickers, message boxes, print dialogs, wizards, installers) plus app-specific ones from Playbooks.
- **Text-mode apps:** terminals, consoles and mainframe emulators via text screen buffers (read by cell, send keys) instead of pixels where possible.

### 7.4 Verify and recover
Every action carries an **expectation** ("a window titled 'New Message' appears", "field equals X"). After acting, the Floor waits for stability, checks the expectation and returns `{ok, evidence, scene_diff, class, next}` where class is one of `ok | no_effect | wrong_state | error_dialog | timeout | blocked | needs_human`.
**Recovery ladder:** re-perceive → retry once → alternative path (shortcut vs menu) → back out (Esc/Undo/close dialog) → restore snapshot (workspace) → ask the human.
**Loop and stall detection** (same state N times: stop and escalate). **Hang detection** ("Not Responding", frozen frames): wait, then offer to restart the app (approval).

### 7.5 Speed and cost engineering
- Prefer the structured Scene over images; send images only when needed, cropped and downscaled.
- Compiled Skills skip perception when selectors resolve with high confidence ("blind execution with checkpoints").
- Parallel perception, incremental Scene diffs, caching.
- Small local models for frequent micro-decisions (OCR cleanup, "did the dialog close?", element grounding); the large model only for planning and ambiguity.
- Token and time budgets per task, with early stopping.

---

## 8. Agent Workspace: where the AI actually works

If the AI uses the same mouse and screen as the user, the user cannot work in parallel and mistakes hit the real session.

| Mode | How | Pros | Cons |
|---|---|---|---|
| **A. Shared desktop** | AI uses the user's real desktop | Simplest; sees real state | Fights user input; no rollback |
| **B. Second desktop/session** (extra Windows desktop, RDP-loopback, virtual display) | Separate input and screen | User keeps working | OS limits; many apps need an interactive session; DPI/GPU quirks |
| **C. VM workspace** (Hyper-V / Windows Sandbox / VirtualBox / QEMU) with a **guest agent** | Full isolation, **snapshots and rollback**, can host **old OS versions** | Safest; best for legacy and risky apps | Resource-heavy; guest-OS licensing; hardware/dongle apps; file transfer in and out |
| **D. Remote host** | Drive a different machine | Offload, always on | Network and security complexity |

**Plan:** MVP uses A with **user-yield** (detects user input, pauses and resumes; visible indicator; hotkey to stop). Phase 4 adds **C**, especially **Legacy Containment**: run an old app in a matching old Windows VM with a controlled clipboard/shared folder, drive it through guest agent plus pixels, snapshot before risky tasks, roll back on failure. **B** where feasible.

---

## 9. Learning and App Memory

### 9.1 App Memory (stored per app + version + language, local, encrypted, versioned)
Playbook, Skills, selectors, risk map, dialog handlers, run history, user permissions/settings. Exportable as an App Pack (section 13).

### 9.2 Playbook: knowledge, not code
Contains the UI map (windows, menus, ribbons, shortcuts), a **semantic glossary** of important controls, **common tasks** with recommended paths, **pitfalls** (modal dialogs, slow operations, confirmations), a **risk map** (irreversible actions: Send, Delete, Post, Pay, Overwrite), dialog handlers, login/handoff notes, and links to manuals.
Created by:
1. **Reading** the app's own documentation: F1 help, CHM/HLP, PDF manuals, tooltips, menu/shortcut lists, vendor knowledge-base pages (fetched only with consent).
2. **Exploring** the UI safely (open menus, view dialogs, never confirm destructive actions; in a VM workspace it can explore freely with snapshot rollback).
3. **Human demonstration** ("Teach mode": the user performs a task once; Appbridge records UI events, Scene snapshots and narration; AI generalizes it into a Skill).
4. **Successful runs**: trajectories distilled into Playbook entries.
5. **Imported packs** (opt-in).

### 9.3 Skill: compiled, parameterized, verified, fast
A Skill is a step list with: selectors, expected-state checks after each step, parameters, branches for known variations, risk annotations, and **AI-fallback points** (if a selector or assertion fails, control returns to the AI to recover; if it recovers, a patch to the Skill is proposed). Deterministic when healthy, near-zero model tokens, inspectable and editable.

### 9.4 The loop: explore once, compile, heal
```
First time:  Goal → AI explores/plans (Floor) → success → trajectory recorded (with consent)
Compile:     trajectory → generalize parameters → add assertions → add selectors → Skill v1
Next time:   Task mode picks the Skill → runs mostly blind with checkpoints → fast and cheap
Drift:       app update/theme/DPI change → assertion fails → AI recovers → patch Skill → re-verify
Share:       sanitized Skill/Playbook → optional export/import
```
**Verification gate before saving a Skill:** replay on a clean state (preferably a VM snapshot) with different parameter values; it must pass.
**Model independence:** Playbooks and Skills do not depend on which AI produced them; switching between cloud and local models keeps everything learned.

### 9.5 Storage and privacy of learning data
Trajectories contain screenshots: stored locally, encrypted, redacted (masked regions/fields), retention-limited, visible and deletable by the user. Sharing requires sanitization and explicit consent.

---

## 10. Accelerators: optional faster routes

The Floor works without any of these. When available, Appbridge discovers them in the background and uses them to make known tasks faster and safer. An accelerator is adopted for an operation **only after it passes the same verify test as the Floor path**; the Floor path stays as fallback, so a blocked or changed accelerator only makes things slower, never broken.

### 10.1 Routes (ordered by reliability; "S" numbers are stable ids)
| # | Route | How it works | Typical targets |
|---|---|---|---|
| S0 | **Official API / MCP server** | Vendor-published interface using the user's own key/login | GitHub, Slack, Notion, Google Workspace, Graph |
| S1 | **CLI / headless mode** | Parse `--help`, man pages, completions; run commands | git, ffmpeg, 7z, pandoc, kubectl, ImageMagick, headless office suites |
| S2 | **Object-model automation** | COM/OLE type libraries, AppleScript/JXA dictionaries, UNO, embedded Python (Blender, QGIS, FreeCAD), ExtendScript/UXP (Adobe), CAD .NET/LISP APIs, VBA, SAP GUI scripting | Office, Adobe, CAD, Blender, MATLAB, SolidWorks |
| S3 | **Companion plugin** | A small add-in inside the app talking to Appbridge | VS Code, JetBrains, Office add-ins, browser extensions, Obsidian, Figma, Photoshop panels |
| S4 | **Local data** | Read (and carefully write) SQLite/JSON/XML/registry/config/data files; watch files | Note vaults, browser stores, chat/mail stores, POS and accounting databases, game saves |
| S5 | **Local IPC / services** | localhost HTTP/WebSocket/gRPC, named pipes, D-Bus, window messages | Local media APIs, containers, databases, local AI servers, many Electron internals |
| S6 | **Web layer** | Learned HTTP requests (api-anything), headless or real browser | Any website without an API |
| S7 | **Chromium/WebView debugging (CDP)** | Attach to Chrome/Edge, Electron, WebView2/CEF/Tauri apps; read DOM, call page JS, observe network | Slack, Discord, Teams, Notion, VS Code, Postman and a large share of modern apps |
Not accelerators (they are the Floor): S8 accessibility trees, S9 screen vision + input. **Binary/runtime hooking is excluded** from the default product (dev-mode only, after legal review, never against protected software).

### 10.2 Generic adapters (class-level, per technology: zero per-app work)
| Generic adapter | Covers | Auto-generation trick |
|---|---|---|
| **G-CLI** | Any command-line tool | Parse help/man/completions, LLM names and types operations, sandbox-run to verify |
| **G-COM** | Any COM-automatable Windows app (Office, CAD, many legacy Win32 apps) | **Type-library introspection** enumerates objects/methods/params; LLM groups and names operations |
| **G-AppleScript** | Scriptable macOS apps | Read the app's scripting dictionary |
| **G-UNO** | LibreOffice/OpenOffice | UNO API introspection |
| **G-Embedded-Script** | Blender, QGIS, FreeCAD, Houdini, Maya, Adobe scripting | Reflection on the embedded API plus curated safe wrappers |
| **G-CDP** | Every Chromium browser, Electron, WebView2/CEF app | Attach, snapshot DOM/accessibility, enumerate routes/IPC |
| **G-Web** | Any website | api-anything-style learned requests with CDP fallback |
| **G-OpenAPI/MCP** | Anything exposing OpenAPI/GraphQL/MCP | Import the schema directly |
| **G-Data** | Local SQLite/JSON/XML/CSV/registry stores | Schema inspection gives read operations; guarded writes |
| **G-Shell/OS** | The OS layer (section 5.1) | Curated, guarded |

### 10.3 Companion plugins (the Copilot-style deep integration, where an app has a sanctioned extension model)
| Host | Companion form | Gives |
|---|---|---|
| Microsoft Office | Office Web Add-in / VSTO | live document model, selection, events, undo grouping |
| VS Code and forks | Extension | workspace, diagnostics, edits, tasks, terminals |
| JetBrains IDEs | Plugin | code model, refactorings, run configs |
| Chrome/Edge/Firefox | WebExtension | tabs, DOM, selection, downloads, per-site permissions |
| Obsidian / Joplin / Logseq | Plugin | vault/notes API, links, search |
| Figma and similar | Plugin | document tree, export |
| Adobe apps | UXP/CEP panel | layers, actions, export |
| Blender / FreeCAD / QGIS | Add-on | scene/model/map API |
| LibreOffice | Extension | UNO bridge |
| Android | Accessibility/companion app | UI tree and actions |
| Guest OS in a VM/RDP | Guest agent | turns a pixel-only session into tree-based access *inside* the guest |
Companions are optional, signed, minimal-permission, removable; being in-process they provide undo grouping, selection awareness and events that outside automation cannot.

### 10.4 Coverage by app class and coverage grades
| App class | Primary routes | Fallbacks | Known gaps |
|---|---|---|---|
| Office suites (Word/Excel/PowerPoint/Outlook) | S2 COM + S3 add-in | file-level edits (OOXML), Floor | Protected View, cloud-only docs, macOS differences |
| LibreOffice/WPS | S2 UNO / S1 headless | Floor | WPS has limited automation |
| Google Workspace / M365 web | S0 official APIs (user's OAuth) | S7, S6 | Quotas, consent screens |
| PDF tools | S1/S4 (PDF libraries on files) | S2, Floor | Scanned PDFs need OCR |
| Browsers and websites | S7 CDP, S3 extension, S6 | Floor | Logins/2FA, bot-blocking, terms of service |
| Electron apps | S7 CDP (+ S0 if API) | S4, Floor | Needs debug flag/relaunch; some block debugging |
| WebView2/Tauri/CEF apps | S7 | Floor | Varies by host |
| Windows native (Win32/WPF/WinForms/WinUI) | Floor (accessibility) + S2 if exposed | Vision | Depends on the app's accessibility |
| Qt/GTK apps | Floor (accessibility must be enabled) | Vision | Qt accessibility often off by default |
| Java Swing/SWT/JavaFX | Floor (Java Access Bridge) | Vision | JAB must be enabled |
| Legacy VB6/Delphi/PowerBuilder | Floor (MSAA/metadata/OCR), S2 if registered | Vision | Custom-drawn controls |
| Terminal/mainframe emulators | S1/S5 (emulator scripting APIs) | text-buffer reading, OCR | Fragile screen scraping |
| IDEs | S3 extension (+ S1) | S7, Floor | Very good depth possible |
| Database clients/servers | S5/S1 (direct drivers) | Floor | Use direct DB access rather than UI |
| Adobe suite | S2 scripting + S3 | Floor | Per-app scripts; user's own subscription login |
| CAD/engineering | S2 (vendor APIs) | Vision | Heavy APIs; version fragmentation |
| Blender/FreeCAD/QGIS | S2 embedded Python | S1 | Excellent coverage |
| DAWs/video editors | S2/S5 (OSC, scripting) / S1 | Vision | Realtime constraints |
| Chat/messaging desktop | S7 / S4 / S0 | Floor | Privacy-sensitive; encrypted stores; terms of service |
| Email clients | S0 protocols (user's creds), S4 | Floor | Prefer protocol over UI |
| Accounting/ERP/POS/hospital/school software (incl. local line-of-business) | S4 DB, S2 COM, S5 | Floor, Vision | Highest business value; vendor terms |
| SAP GUI | S2 GUI Scripting | Floor | Must be enabled on server |
| Games/launchers | Launcher (S4/S5) only | none | **Games with anti-cheat: blocked** |
| Remote/VDI/VM | Vision (pixels) | S2/accessibility *inside* guest via guest agent | Pixel-only otherwise |
| Android | adb + accessibility + UI automation | Vision | Later phase |

**Grades (shown per app; every app starts at Bronze automatically; earned by verified runs):**
| Grade | Meaning |
|---|---|
| **Bronze** | Floor works generically: AI can see and operate it; slower and costlier; no saved knowledge |
| **Silver** | Playbook exists; common tasks have verified Skills |
| **Gold** | Many verified Skills; accelerator(s) active; stable across versions |
| **Platinum** | Deep integration (object model/API/companion), broad Skills, self-healing history |
| **Restricted** | Policy-blocked (banking, anti-cheat, ...) or technically unreachable |

---

## 11. Add-app flow, device inventory, discovery

### 11.1 The Add-app flow
**Normal user (installer + tray app):**
1. **Add app:** choose from the detected-apps list, pick an open window, drag an app/shortcut, or paste a website address.
2. **Learn this app:** Appbridge identifies it, checks which accelerators exist, reads its help/manual, explores it safely (read-only; in a VM if available), builds its Playbook and first Skills, tests them, and grades it. Progress and a plain-language list of what it is doing are shown; the user can pause or cancel.
3. The result is saved to **App Memory**.
4. The app card shows "What AI can do here", the grade, **Test it**, **Export**, and permission toggles.
5. The user opens the **built-in chat** or connects an external AI.
**Developer:** the same engine through `appbridge add <app|url>`, `appbridge mcp`, `appbridge serve`, REST/OpenAPI, plain files in the local folder (section 19, Appendix D), and pack export/import commands.

### 11.2 Device Inventory Service (continuous, no AI needed)
- **Installed apps (Windows):** registry Uninstall keys (HKLM/HKCU/WOW6432), App Paths, Start Menu shortcuts, MSIX/Store packages, winget/choco/scoop lists, Program Files scan. macOS: /Applications, pkgutil, brew. Linux: .desktop files, dpkg/rpm/flatpak/snap.
- **Running state:** processes, windows, services, listening ports, named pipes, COM registrations (ProgIDs/CLSIDs), accessibility availability per window.
- **Web apps:** browser profiles' bookmarks/history/installed web apps, saved-login *domains* only (never passwords), user-nominated sites.
- **CLI tools:** PATH scan, package managers, WSL distributions.
- **Local data stores:** known data directories (AppData, ~/Library, ~/.config).
Output `device.json`: each app with name, vendor, version, technology fingerprint, install path, available routes, preliminary grade.

### 11.3 Fingerprinting (what is this app made of?)
Static, cheap, safe: PE/Mach-O/ELF headers and imports; bundled runtimes (Electron `app.asar`, CEF/WebView2 DLLs, .NET assemblies, Qt DLLs, JVM, Python/PyInstaller, Flutter, Unity/Godot); registered COM servers; scripting engines/plugin folders; bundled CLI binaries; URL schemes and file associations; manifests; embedded SQLite files. REA's desktop-installation, Electron/JavaScript, .NET, PyInstaller, Flutter and SQLite analyzers help here (section 18).

### 11.4 Discovery pipeline (probe, explore, draft, verify, review, publish)
1. **Probe** each route S0..S7 for presence and usability (fast health tests, no side effects).
2. **Introspect** what exists: COM type libraries, scripting dictionaries, `--help`, OpenAPI/GraphQL schemas, DB schemas, DOM/IPC maps, accessibility trees, plugin SDK docs.
3. **Explore (read-only agent):** walk the app, map screens and flows, capture state examples, using a restricted allow-list (navigate/read only) and sample data or a VM snapshot where possible.
4. **Draft** operations/Skills: an LLM groups low-level capabilities into meaningful, documented tasks, assigns **risk classes**, proposes verification checks.
5. **Verify:** run each with sample inputs on the real app; confirm with an independent signal (read-back, file diff, DB row, screenshot diff). Failures are dropped or flagged.
6. **Review:** show the user a plain-language list ("I can read your invoices, export reports, create customers..."); the user keeps or removes items and sets permissions.
7. **Publish:** save to App Memory with tests, grade and notes.
8. **Maintain:** health checks on app update; on failure classify (`app_updated`, `not_logged_in`, `blocked`, `ui_changed`, `permission`), re-learn the affected part, replay, save only if it passes.
Knowledge sources the LLM may use (treated as untrusted input and recorded in notes): official docs, SDK references, the app's help files, type libraries, community scripts.

---

## 12. The AI-facing layer

### 12.1 Provider abstraction (any AI, local or cloud)
One interface with adapters for: (a) **OpenAI-compatible endpoints** (covers most local servers such as Ollama, llama.cpp server, LM Studio, vLLM, and many cloud providers); (b) native cloud APIs; (c) **external clients** that bring their own AI and connect through MCP/REST/CLI.
- **Capability negotiation:** on connect Appbridge learns what the AI can do (vision or text-only, tool-calling or not, context size, speed) and adapts: image + Scene vs. structured Scene only; rich tools vs. a compact tool set vs. a constrained-JSON protocol; Tool mode vs. Task mode (small models are steered to Task mode so the Pilot handles fine-grained work).
- **Model roles can be split:** a local model for frequent cheap micro-decisions, a cloud or larger local model for planning and ambiguity. Policy can force **local-only** for sensitive apps.
- **Quality honesty:** small local models are less reliable at multi-step planning; the tool reports an expected reliability tier and raises safeguards (more approvals, smaller steps) for weaker models.

### 12.2 Interfaces offered
1. **MCP server** (stdio and streamable HTTP).
2. **REST + OpenAPI** (loopback, token).
3. **Function-calling exports** (OpenAI-style and Anthropic-style schemas) for any model.
4. **CLI** (`appbridge call ...`, `appbridge skill run ...`) for shell-driven agents.
5. **SDKs** (TypeScript, Python) and framework adapters.
6. **Built-in chat** with the user's own API key (kept in the OS keychain) or a local model; approvals inline with previews.
7. **Remote Access** (optional, off by default) so web chat apps that need a remote HTTPS connector can reach the local daemon through a user-owned authenticated tunnel/relay, with a clear warning.

### 12.3 Tool mode: tool set (kept small on purpose)
- **Perception:** `screen.capture(region?)`, `screen.describe(window?, detail)`, `ui.tree(window?)`, `ui.find(query)`, `ui.read(element|region)`, `ui.wait_for(condition, timeout)`, `scene.diff(since)`.
- **Action:** `ui.click`, `ui.type`, `ui.key`, `ui.select_menu(path)`, `ui.scroll`, `ui.drag`, `ui.set_value`, `clipboard.get/set`.
- **Windows and apps:** `apps.list`, `apps.describe`, `app.launch`, `window.list/focus/resize/close`, `file.pick(path)`.
- **Safety and flow:** `approval.request`, `handoff.request`, `session.plan(steps)`, `session.stop`.
- **Memory:** `playbook.get(app)`, `skill.list(app)`, `skill.run(name,args)`, `skill.record_start/stop` (Teach mode), `ops.search`, `ops.describe`, `ops.call` (typed accelerator operations).
- Optional **per-app tool packs** a user can enable per session for models that do better with direct tools. Compact and full input-schema profiles reduce context use.
Every action returns the verified-result shape from section 7.4 and a compact updated Scene.

### 12.4 Task mode
`task.run(goal, app?, constraints, budget, approvals)` streams progress and returns result + evidence (key screenshots/fields, files created) + any proposed Skill; `task.status`, `task.cancel`. Supports multi-step plans with one approval, long-running jobs, event subscriptions, and cross-app workflows.

### 12.5 Built-in assistant and Teach mode (non-technical UX)
Chat or voice panel ("do this for me in this app"); **Teach mode** ("watch me do it once" produces a Skill); **Explain mode** ("what can you do in this app?" shows Playbook-derived capabilities with grades); approvals as plain-language previews with screenshots.

---

## 13. App Packs: export and import

**Idea:** after Appbridge learns an app, the user exports the result and gives it to any AI (Claude, Codex, Antigravity, others) to analyze and save, so that AI can also work on that app.

**An AI needs two halves to work on an app:**
- **Knowledge** = the App Pack (how the app works, what is safe, how to do tasks).
- **Hands** = Appbridge running on the same machine (the MCP server or CLI that actually sees and clicks).
A pack alone teaches an AI about the app but cannot click. A pack plus the Appbridge connection lets it act. The export screen says this and offers to set up both at once.

### 13.1 Pack contents (folder or .zip; declarative, no code by default)
```
<app>-pack/
  manifest.json          # technology fingerprint, version range, language, grade, pack version, compatibility, hashes
  SKILL.md               # agent-readable operating manual (generated from structured data with a fixed template)
  references/
    playbook.md          # UI map, menus, shortcuts, glossary, pitfalls
    risk-map.md          # irreversible/external actions (approval needed)
    dialogs.md           # dialog handlers, login/handoff notes
  skills/*.yaml          # compiled, parameterized Skills (declarative steps with checks)
  selectors/             # element selectors (sanitized)
  tests/                 # replay tests for verification
  connect/mcp.json       # how to attach Appbridge (stdio command or loopback URL)
  ONBOARD_PROMPT.md      # paste-in instructions for any AI agent
  NOTICE / SANITIZATION_REPORT.md
```

### 13.2 Export targets (one button each, plus Generic)
Claude (Claude Code skill folder and plugin; Claude Desktop extension and skill), Codex (skills folder, AGENTS.md snippet, config entry), Antigravity (skills folder, GEMINI.md rule, MCP config), Gemini CLI, Cursor / VS Code / Windsurf (rules plus MCP config), Generic Markdown + JSON, and a **web-chat briefing** (one paste-in document for chat websites that cannot load skills).

### 13.3 "Ask your AI to analyze and save it"
Every pack ships `ONBOARD_PROMPT.md`. The user pastes it (or points the agent at the folder). It tells the AI to: (1) copy the pack into its own skills location; (2) confirm Appbridge is connected by calling `apps.describe` or running `appbridge doctor`; (3) summarize what it can do in this app and what needs approval; (4) never act outside the permissions Appbridge enforces. The Connect Hub (section 14) can do steps 1 and 2 automatically.

### 13.4 Sanitization (before any export)
Remove screenshots and text containing personal data unless approved; mask secrets; generalize file paths and account names; strip run history; show a review screen. Sharing outside the machine is always an explicit user action.

### 13.5 Trust and safety of packs
- Packs are **declarative data**; Skills are step lists with checks, not arbitrary code. Code-based accelerators are separate, signed and sandboxed.
- **Permissions live in Appbridge, not in the AI.** An AI reading a pack treats it as reference, not authority; even a malicious or edited pack cannot make Appbridge perform an action the user has not allowed.
- SKILL.md is generated from structured fields with a fixed template to reduce hidden-instruction risk; imported packs are scanned for instruction-like text and shown to the user before install.
- Packs are signed (optional for personal use, required for any shared library) and version-pinned to the app version range and language; they are model-independent.
- **Import** works on another machine that has Appbridge; Skills re-verify against the local app before being trusted.

---

## 14. Connect Hub: adding Appbridge to AI tools

Two ways of connecting exist everywhere: **MCP** (live tools) and **Skills/instructions** (knowledge). Appbridge ships both and a **Connect Hub** that detects installed AI clients, writes their configuration (with backup and undo), installs the skill and rules, runs a test call, and reports success. Unknown client: `appbridge mcp --print-config` prints a ready-to-paste entry.
Standard entry points: `appbridge mcp` (stdio, for desktop/CLI clients) and `appbridge serve` (loopback HTTP with token, REST/OpenAPI, optional MCP over HTTP).

| AI client | Add the MCP server | Where skills / instructions go |
|---|---|---|
| **Claude Code** | `claude mcp add --scope user appbridge -- appbridge mcp` (or a plugin bundle) | `~/.claude/skills/<name>/SKILL.md`; `CLAUDE.md` for rules |
| **Claude Desktop** | One-click `.mcpb` extension (double-click), or `claude_desktop_config.json` `mcpServers` | Upload skill/project knowledge as supported |
| **Codex (CLI/IDE)** | `codex mcp add appbridge -- appbridge mcp`, or `~/.codex/config.toml` `[mcp_servers.appbridge]` with `command` and `args` | `~/.agents/skills/<name>/SKILL.md` (or repo `.agents/skills/`); `AGENTS.md` |
| **Google Antigravity (2.0, IDE, CLI `agy`)** | `mcp_config.json` (shared at `~/.gemini/config/mcp_config.json`; older installs `~/.gemini/antigravity/mcp_config.json`); stdio uses `command`/`args`; **remote servers must use the key `serverUrl`**; in the CLI use `/mcp` | `~/.gemini/antigravity/skills/<name>/SKILL.md` or `<project>/.agent/skills/`; `GEMINI.md` for rules; restart the agent session after adding |
| **Gemini CLI** | `~/.gemini/settings.json` `mcpServers` | `GEMINI.md`; skills folder if supported |
| **Cursor** | `~/.cursor/mcp.json` (or project `.cursor/mcp.json`) | Rules files / `AGENTS.md` |
| **VS Code (Copilot/Cline)** | `mcp.json` (user: `%APPDATA%\Code\User\mcp.json`; project: `.vscode/mcp.json`) | `AGENTS.md` |
| **Windsurf / Zed / LM Studio / other MCP clients** | Their `mcp.json` / `mcp_config.json` equivalent | Their rules/instructions file |
| **Local-model chat UIs (Ollama-based, Open WebUI, ...)** | `appbridge serve` REST/OpenAPI, or the OpenAI-style tool schema export, or the built-in chat | Paste the pack briefing |
| **ChatGPT / Claude.ai (website)** | Need a **remote HTTPS MCP connector**: use the optional Remote Access feature (off by default; authenticated; user-owned tunnel/relay; warning because it exposes device control). Desktop clients recommended first. | Paste briefing or project knowledge |

- These config shapes came from vendor docs, public guides and the reference repos' setup code on 2026-11-06. Client UIs change often, so the Connect Hub has a **client-matrix CI test** and a per-release re-verification checklist.
- **Bundle packaging** (one install carrying MCP + skill + rules): Claude Code plugin, Claude Desktop `.mcpb`, Codex plugin (`.codex-plugin`), and the portable "mcp.json + skills/" convention other agent hosts use. Ship whichever are stable.
- **Without MCP:** agents with shell access call `appbridge call ...` / `appbridge skill run ...` directly (the CLI is a first-class interface).

---

## 15. Offline-first and hardware

### 15.1 Offline-first (the tool never needs the internet; only a cloud AI does)
- **No account, no license server, no telemetry, no mandatory updates, no cloud dependency** in any Appbridge component.
- **Bundled local perception:** OCR, UI element detector and Scene fusion run locally with bundled models. An optional local vision-language model can be installed for fully offline operation.
- **Offline install and updates:** installer, models, Playbook packs and updates are downloadable as packages that can be carried in on removable media; updates are optional and signed.
- **Egress is explicit and visible.** Only three kinds of outbound traffic can exist: (1) calls to the cloud AI the user selected, (2) optional update/pack downloads the user triggers, (3) whatever the target apps themselves do. Everything in (1) appears in the **data-flow report** and obeys per-app policy (for example local-only).
- **Air-gapped mode:** blocks all Appbridge outbound connections except a user-approved local endpoint (for example a local AI server on the same machine or LAN); a self-test and a CI test verify **zero unexpected outbound connections**.
- **Cloud AI plus offline tool is valid:** perception, safety, memory and execution stay local; only the minimal masked Scene/crops that policy allows go to the cloud model.

### 15.2 Hardware: GPU for quality, CPU still works
- **Auto-detect** GPU (NVIDIA/AMD/Intel/Apple) and RAM/VRAM at first run and choose backends (CUDA/DirectML/Vulkan/Metal through ONNX Runtime or llama.cpp-class engines); CPU fallback always present.
- **Same product, different speed:** with a GPU, use larger/better local models and finish steps quickly; CPU-only runs the same models slowly or auto-selects smaller ones. The user picks **Fast / Balanced / Best quality**.
- A **first-run benchmark** measures real time per step and gives honest estimates ("learning this app will take about 12 minutes on this PC").
- **Patient mode (CPU):** longer timeouts, background queue, learning while the user is away, resumable jobs, cached results so each app is learned once.
- **Hardware tiers (measured in Phase 0):** Tier 1 CPU-only/small RAM: accessibility + OCR + small detector, text-only small model or compact Task mode; slower, more conservative. Tier 2 consumer GPU/modern laptop: local detector + mid-size local VLM. Tier 3 strong GPU or a LAN model server: large local VLM, near-cloud quality.
- Cloud-AI users need no local GPU.

---

## 16. Safety, privacy, permissions

"Anything a human can do" is more dangerous than API access, so safety works at the **action** level.

### 16.1 Action Firewall (runtime effect classification)
Before executing any UI action, classify its **effect** using element label/role, dialog text, the Playbook risk map, current app/domain context, and a small classifier: `navigate` · `read` · `edit-draft` · `write` · `destructive` (delete, overwrite, format, uninstall) · `external-effect` (send, post, submit, publish, pay, order) · `privileged` (UAC, system settings, registry) · `credential` (login/password/payment fields). Policy decides **allow / allow-with-preview / require-approval / block / handoff**. Unknown or low-confidence is treated as higher risk; no blind clicks on unresolved buttons in sensitive contexts.

### 16.2 Permissions
Per AI client × per app (and per website domain): default **off**; navigate/read first; writes opt-in; destructive/external/privileged **always approve**; credential/payment apps **blocked unless explicitly unlocked**; **time-boxed grants**; **plan approval** (approve a whole plan once; deviations re-prompt). **Default blocklist:** password managers, banking/payment apps, security tools, anti-cheat games, remote-admin tools (overridable per app with warnings). **Kill switch:** global hotkey and tray revokes grants and halts jobs.

### 16.3 Human handoff
`needs_human(reason, instructions, resume_hint)` for CAPTCHAs, 2FA, passwords, UAC, payment confirmations, ambiguity, repeated failure. The workspace pauses, shows what is needed, resumes after the user acts.

### 16.4 Irreversibility handling
- **Snapshots:** VM snapshots; on the shared desktop, copy-on-write file backups, clipboard restore, **drafts-first** behavior (create the email draft rather than send unless approved).
- **Preview before commit:** show the exact message/recipient/amount/file operation with a screenshot and extracted fields.
- **Undo-first strategies** from the Playbook (Ctrl+Z, Deleted Items, recycle bin); **verify-after-write**; idempotency keys; duplicate suppression.

### 16.5 Prompt injection via the screen
Any text on screen (emails, web pages, documents, window titles, notifications, images) can contain instructions for the AI.
- All Scene text is **untrusted data**, tagged; it never changes permissions or the task.
- **Taint tracking:** after reading untrusted content, external-effect/destructive actions require approval and show their source; recipients/destinations must come from the *user's* request.
- Detect instruction-like text in untrusted content and flag it.
- A **red-team corpus** (hostile emails, fake dialogs, spoofed "Click OK to continue" overlays, clickjacking-style overlays, malicious pack text) runs in CI.

### 16.6 Privacy and data egress (screenshots are the most sensitive data there is)
- **Local-first perception:** OCR/detection local; send only cropped regions or structured text when possible.
- **Masking:** auto-mask password fields, card numbers, national IDs, secrets and user-defined regions/apps before anything leaves the device.
- **Per-app sensitivity labels** and **destination policy** (`local-model-only` for sensitive apps).
- **Minimization:** summaries/fields rather than whole documents; paging; size caps.
- **No raw secrets ever:** vault entries can be *used* (login, API calls) but never returned.
- **Session data-flow report:** what was sent to which model.
- Screen recordings/trajectories: encrypted, local, retention-limited, deletable.
- **No stealth:** visible "AI is working" indicator, audit log, global kill switch, no hidden remote control.

### 16.7 Gateway, adapter and local-system security
Loopback binding only; per-client tokens; Origin/Host validation (DNS-rebinding); no wildcard CORS; named-pipe/socket transports; signed updates; **hash-chained, append-only audit log** (who/what/app/action/args-hash/result/approval/route/time); sandboxed workers with declared permissions (file scopes, network hosts, process spawn); accelerators and packs from outside are signed and run with declared permissions; scoped file access; per-run session replay for debugging (redacted).

---

## 17. Legal and ethical boundary

**In scope:** the user's own AI operating software and accounts **the user is authorized to use**, on their own data, doing what the user could do manually; accessibility and interoperability; automating one's own work.

**Out of scope and refused by design:**
- Bypassing licenses, trials, entitlement checks, DRM, anti-cheat, anti-tamper.
- Re-creating a vendor's paid server-side AI feature without paying. Appbridge brings *your own* AI to capabilities your license already includes.
- Solving CAPTCHAs or evading bot detection or rate limits at scale; credential stuffing; mass scraping.
- Operating other people's accounts; hidden surveillance; stalkerware.
- Bypassing OS security boundaries (UAC/elevation, sandbox escapes).
- Fraud or mass-abuse automation; malware-like behavior; binary/runtime hooking against protected software.

**Mechanisms:** visible disclaimer and first-run acknowledgement; per-app **terms-of-service notes** (automating a site or app can breach its terms even when a human could do the same task manually); default blocklist; conservative defaults; an abuse policy; open-source license for the core with a responsible-use statement; pack/adapter provenance.
**Before any public or commercial release:** obtain legal review (software EULAs and reverse-engineering rules, data-protection laws, computer-misuse laws, jurisdiction differences).

---

## 18. Reusing the reference projects

Method (2026-11-06): shallow-cloned api-anything and REA; read licenses, `package.json`, source layout and key files; searched for LMCP's license and source. Remaining audit work (run on Windows, security-read adopted modules) is in Phase 0.

### 18.1 api-anything (github.com/goodnight000/api-anything): MIT, v0.4.0, TypeScript, about 27k lines, Node >= 22.13
Dependencies: MCP SDK, node-html-parser, playwright-core, tldts, zod.
- **Use as dependency (Web accelerator):** `learn.ts` / `learnsite.ts` (learn a site's request from example inputs), `codec.ts` (slot/codec), `execute.ts` (tiered execution), `heal.ts` (repair with replay), `classify.ts` / `results.ts` (honest result classes), `session.ts` / `login.ts` / `secrets.ts` (sessions, OS keychain), `host.ts` (call-only host API).
- **Adapt (vendor with attribution) for the core:** `setup.ts` (about 930 lines) detects Claude Code, Codex (TOML), Cursor, Claude Desktop, Gemini CLI, VS Code and Hermes, writes MCP entries and installs the skill. It is the base of the **Connect Hub**; add Antigravity, which it does not cover. Reuse patterns from `mcp.ts` (MCP server), `serve.ts` (loopback HTTP + token + OpenAPI), and `skill.ts` plus `skills/api-anything/SKILL.md` as the template for pack SKILL.md. Adopt its result shape (`ok/class/tier/reason/next`) and its "re-learn, replay, save only if it works" repair rule across all routes.
- **Skip:** shared-catalog/cloud parts (`registry*.ts`, `share.ts`, `publish.ts`, `seal.ts`) and bundled `sites/` specs (offline-first).
- **Notes:** needs Chrome only for learning and browser fallback; its docs conflict on npm availability, so install from git and pin a commit.

### 18.2 REA (github.com/morluto/rea): MIT, v6.8.0, TypeScript, about 236k lines, Node ^22.23.4 || ^24.22.1 || >=26.12.1
- **It contains no UI Automation or input-synthesis code** (searched), and its Windows native addon covers process/filesystem controls only. It provides **nothing for the Floor**; the Floor is new work.
- **Reuse (optional dependency `rea-agents`, or selected modules with notices):** `desktop/` and desktop-installation inspection (fingerprinting), `electron/` and `javascript/` (modules, IPC, routes, to discover CDP accelerators), `browser/` (CDP provider, Playwright scenarios, screenshots, **PNG visual diff**, traces: useful for the CDP accelerator and for verification), `captures/` (HAR analysis), SQLite inspection (local-data accelerator), and `application/ClientRegistration.ts` + `SupportedClients.ts` (a wider client list including LM Studio, Copilot CLI, opencode, plus Windows Store/MSIX path handling) to enrich the Connect Hub.
- **Ideas to copy (not code):** compact vs full MCP input-schema profiles, evidence-and-limitations result style, the portable "mcp.json + skills/" plugin convention.
- **Skip:** native decompiler providers (Hopper/Ghidra/IDA/Kuna), firmware, EVM, GPU/model-file inspectors and similar niche analyzers.
- **License caution:** REA is MIT. Its notices cover separately obtained tools (Ghidra, GDB, Unicorn: GPL-family) that are **not bundled**, a Windows addon statically linked with the GCC runtime (runtime exception applies), and optional Frida (LGPL with wxWindows exception). Rule: **never bundle those; keep them optional/bring-your-own**; keep REA's notices if code is vendored. Use the stricter of the two projects' Node minimums.

### 18.3 LMCP (Local MCP)
- **Not reusable as code:** it is **proprietary** (its GitHub repository is a releases-only repository; its page states proprietary software, free for the first 500 installs). Do not copy, decompile or repackage it.
- **Allowed:** (a) use it as an optional **external MCP server**: Appbridge can act as an MCP client and treat LMCP as one more accelerator when the user has it installed; (b) use its public descriptions as a **product reference** (reading Outlook through COM, local app data without API keys, one-click installer, optional cloud relay for web AIs).

### 18.4 Net effect
Reuse gives a head start on the **periphery**: connecting to AI clients, the web accelerator with self-repair, discovery/fingerprinting, CDP and visual-diff verification, secrets handling, and skill/pack templates. The **core** (Floor perception and action, Scene fusion, Action Firewall, App Memory, Playbook/Skill learning, Agent Workspace, App Packs) is new.

### 18.5 Other candidates to evaluate (not yet verified)
FlaUI / pywinauto / UIAutomation client libraries; Windows Graphics Capture; Windows OCR / Tesseract / PaddleOCR-class OCR; OmniParser-class UI parsers and open GUI-grounding models; Playwright / Chrome DevTools Protocol; COM interop libraries; LibreOffice UNO and OOXML libraries; Ollama / llama.cpp / ONNX Runtime; MCP SDKs and OpenAPI generators; Hyper-V / VirtualBox APIs; OS keychain libraries; signing tools (Sigstore-style). Keep every dependency behind an interface and record its license.

---

## 19. Technology stack and repository layout

- **Core:** TypeScript on Node (pin the version per section 18.2); first-class MCP SDK.
- **Windows native helpers (first platform):** C#/.NET (UI Automation via FlaUI-style libraries, COM interop, Win32), optionally Rust for fast capture/input; JSON-RPC over pipes.
- **macOS later:** Swift (Accessibility, AppleScript/ScriptingBridge). **Linux later:** Python/Rust (AT-SPI, D-Bus). **Android later:** Kotlin accessibility service/companion + adb bridge.
- **Perception:** OS capture APIs, OCR, UI detection and GUI-grounding models, VLM via cloud or local runtime.
- **Workspace:** Hyper-V/Windows Sandbox/VirtualBox/QEMU adapters; small signed guest agent.
- **Storage:** SQLite (audit, runs, selectors, health), encrypted file store for trajectories/skills, OS keychain/DPAPI for secrets.
- **UI:** Tauri or Electron + React tray, dashboard and built-in chat.
- **LLM:** provider-agnostic (cloud API or local runtime).

```
appbridge/
  plan.md
  packages/
    core/            # types, config, audit, taint, budgets
    gateway/         # MCP, REST, function-schema export, remote access (optional)
    safety/          # action firewall, permissions, approvals, handoff, redaction
    providers/       # model adapters, capability negotiation, hardware profiles
    floor/
      capture/ uia/ win32/ ax/ atspi/ jab/ textmode/
      ocr/ detect/ ground/ scene/ selectors/
      input/ dialogs/ verify/ recover/
    pilot/           # task-mode agent loop and planners
    workspace/       # shared-desktop, vm/, guest-agent/
    learn/           # explorer, playbook builder, teach recorder, skill compiler, healer
    memory/          # App Memory store, pack exporter/importer, sanitizer, signing
    accel/           # com/ cli/ cdp/ data/ ipc/ web (api-anything)/ official/ companions/
    inventory/       # installed/running app discovery and fingerprinting (REA-assisted)
    connect/         # Connect Hub (client detection, config writers, skill installers)
    vault/ ui/ cli/
  playbooks/ skills/ # optional sample data only
  labs/              # VM image scripts, app corpus, benchmark runner
  redteam/           # injection and overlay-attack corpus
  docs/
```

---

## 20. Platform strategy

The architecture is OS-neutral: the Floor sits behind one interface with per-OS drivers. **Windows 10/11 is built first** (largest app diversity, strongest COM and UI Automation), then **macOS** (AppleScript/JXA, Accessibility), then **Linux** (AT-SPI, D-Bus; fragmented desktops), then **Android** (adb + accessibility). **iOS** is largely out of scope (platform restrictions; possible only via Shortcuts/MDM/mirroring). Windows first is a build order, not a design limit.

---

## 21. Testing and evaluation

### 21.1 App Lab and conformance
- **App Lab:** automated VMs (Windows/macOS/Linux) with snapshots and a corpus of about 100 apps across the section 5 classes; nightly run of all Skill/accelerator tests; detect breakage after app updates.
- **Conformance suite:** schema validity, read-only probes, verify-after-write, idempotency, error classification, performance bounds.
- **Fuzz and negative tests:** malformed args, huge payloads, concurrent calls, app crashes/hangs, focus theft, modal dialogs, UAC prompts, locale/DPI/theme variations, multi-monitor.
- **Security tests:** red-team injection corpus, sandbox-escape attempts, token/Origin attacks on the gateway, malicious pack/adapter files.
- **Connect Hub client matrix:** verifies configuration writers against each supported AI client.
- **Offline test:** zero unexpected outbound connections from Appbridge processes.
- **Universality tests:** the Contract lint plus the held-out app set (section 3.2).

### 21.2 The Long-Tail Benchmark (the real product test)
- **Corpus:** at least 50 apps sampled across technology classes (old Win32/MFC, Delphi/VB6, WinForms/WPF, Java Swing/SWT, Qt, Electron, older office suites, terminal/mainframe-style, web portals, VM/remote desktop, niche utilities), with non-English UIs and different DPI/themes, and a **held-out portion**.
- **Tasks:** 5-10 per app, from simple (open, read) to multi-step (extract, transform, save, send).
- **Per-run metrics:** success, steps, wall time, tokens/cost, human interventions, **irreversible-error rate**, approvals triggered, false-block rate, selector-confidence calibration.
- **Reported per hardware tier and per model class** (local small / local large / cloud).
- **Regression:** re-run after app updates and theme/DPI/locale changes. **Adversarial:** screen-borne injection, fake dialogs, overlays, unexpected popups, hung apps.
- **Baselines:** a raw computer-use agent without Appbridge; Appbridge Floor only; plus Playbook; plus Skills; plus accelerators. Also compare against public computer-use benchmarks (for example OSWorld, Windows Agent Arena) where applicable.

### 21.3 Target metrics (by end of Phase 3 unless noted)
| Metric | Target |
|---|---|
| First-run success (Bronze, benchmark) | >= 75% |
| Repeat-run success (Skill) | >= 95% |
| Repeat-run cost vs first run | >= 80% lower |
| Repeat-run time vs first run | >= 5x faster |
| Irreversible mistakes in test suite | 0 unapproved |
| Injection suite | 100% blocked or approval-gated |
| Apps reaching Bronze automatically | >= 95% of installed GUI apps on a test PC |
| Time to teach a new task | < 10 minutes |
| User-yield latency (stop when user touches mouse) | < 300 ms |
| Verified-op pass rate, generated accelerator operations | >= 70% first try (>= 95% for curated) |
| Latency per accelerator step | S0-S5 median < 1 s; S7 < 2 s |
| Auto-repair rate on simulated drift | >= 60% |
| Accelerator effect (Phase 5) | >= 3x faster where available; removing any accelerator never fails a task |

---

## 22. Roadmap

Estimates assume 1-2 developers with AI coding assistance.

**Phase 0: Feasibility spikes (2 weeks).** Measure, do not assume. On about 10 apps sampled by technology class (old Win32/Delphi/VB6-style, WPF, Java, Electron, an older office suite, a terminal app, a web app, a custom-drawn-grid app):
- accessibility tree quality and classic-control fallback; OCR accuracy/latency (English plus one non-Latin script); detection/grounding bake-off with 2-3 candidate models (local and cloud) by hardware tier (CPU-only, mid GPU, strong GPU): latency and cost per step; input reliability (focus, DPI, IME), dialog handling;
- baseline: an off-the-shelf computer-use agent on the same tasks;
- VM + guest-agent feasibility with snapshot/rollback;
- finish the Windows run-through of api-anything and REA; security-read the modules to adopt; pick the Node version; prototype the provider layer and capability negotiation; draft the held-out set; build the GPU/CPU benchmark harness.
**Gate:** choose models/libraries; fix Scene v0; confirm benchmark classes; write `docs/spike-notes.md`.

**Phase 1: Floor MVP + Tool mode (6 weeks).** Capture, accessibility + Win32 trees, OCR, input synthesis, window management, verify/recover basics, Scene v0, MCP tool mode, `appbridge mcp` and `appbridge serve`, Action Firewall v0 (label-based classification, approvals, handoff), audit, kill switch, shared-desktop workspace with user-yield, **Connect Hub v0** (adapted from api-anything `setup.ts`, plus Antigravity), **App Memory store v0**, hardware auto-detect and profiles, provider abstraction with capability negotiation, offline self-test, Universality Contract CI lint, text-only-model Scene.
**Exit:** an external AI completes the Outlook-2012-style test on a stand-in old app via tools, with approvals on "Send", on >= 70% of runs.

**Phase 2: Pilot + perception fusion (6 weeks).** Task mode with built-in agent loop; fusion of tree + OCR + detector + VLM; selector store; speed/cost controls; local-VLM option; stall/loop detection; dialog-handler library; **built-in chat with BYO API key/local model**; Fast/Balanced/Best profiles; model-role splitting; per-app local-only policy; reliability-tier safeguards.
**Exit:** Long-Tail Benchmark v0 (20 apps x 5 tasks): >= 75% success with <= 1 human intervention per task; cost and time recorded vs baseline.

**Phase 3: Learning (8 weeks).** Manual/help-file ingestion, safe exploration, demo recorder (Teach mode), trajectory-to-Skill compiler, verification gate, drift repair/healer, risk-map generation, **pack exporter/importer** with sanitization review, ONBOARD_PROMPT generator, signing and import verification; proof that Playbooks/Skills are model-independent.
**Exit:** repeat tasks >= 5x faster and >= 80% cheaper than first run with >= 95% success on healthy apps; healer repairs >= 60% of simulated drift cases; a pack exported on one machine lets a different AI client operate the app after import.

**Phase 4: Agent Workspace: VM mode + Legacy Containment (6 weeks).** Hyper-V/VirtualBox integration, guest agent, snapshots/rollback, controlled clipboard/file transfer, pixel-only (remote/VDI) perception mode, legacy OS images for old apps.
**Exit:** a deliberately risky task in an old app is run, rolled back and re-run safely, while the user keeps using their own PC.

**Phase 5: Accelerators (6-8 weeks).** Background discovery and verified adoption: COM introspection, CLI-to-operations, CDP/Electron/WebView2, local data, api-anything (web), official APIs/MCP, first companions (Office add-in, browser extension, VS Code), optional LMCP-as-MCP-client accelerator, selected REA modules behind our interfaces.
**Exit:** accelerator targets in section 21.3 met on 10 benchmark apps.

**Phase 6: Product and UX (6 weeks).** Tray/dashboard, wizard-style Add-app flow, Teach mode UI, approvals with previews, privacy controls (masking, sensitivity labels, data-flow report), installer/updater, **offline installer and offline model/pack bundles**, air-gapped mode UI, Export buttons per AI client, bundle packaging (`.mcpb`, Claude Code plugin, Codex plugin), optional Remote Access for web AIs, docs.
**Exit:** a non-technical user installs, picks an AI, teaches one task, and runs it safely.

**Phase 7: Vision grade and legacy/enterprise (6 weeks).** Full vision grounding and input synthesis for pixel-only apps, Java Access Bridge, terminal-emulator scripting APIs, SAP GUI scripting, guest agent for VM/RDP, vision cost controls.

**Phase 8: Platforms (8+ weeks).** macOS runtime, then Linux, then Android.

**Phase 9: Ecosystem (ongoing).** Signed shared Playbook/Skill library (opt-in), SDK/docs, community contributions, enterprise features (policy server, SSO, central audit) if going commercial.

**Continuous:** security, privacy and legal review; red-team; dependency and model updates; client-matrix re-verification each release.

---

## 23. Risks (ranked)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | Model reliability, latency, cost of GUI agents | Flaky, slow, expensive | Fused structured perception; Skills/blind execution; local small models for micro-tasks; budgets; benchmark-driven iteration; model-agnostic design |
| 2 | Wrong irreversible action | Data loss, sent emails, payments | Action Firewall, previews, drafts-first, VM snapshots, file shadow copies, verify-after-write, blocklists |
| 3 | Screen-borne prompt injection | AI hijacked | Untrusted tagging, taint tracking, destination-from-user rule, detection, red-team CI |
| 4 | Privacy of screenshots sent to cloud models | Sensitive leak | Local perception, masking, sensitivity labels, local-only policy, data-flow reports |
| 5 | Poor accessibility in old apps | Gaps | Multi-signal fusion, per-app Playbooks, vision fallback |
| 6 | Input/focus conflicts with the user | Annoyance, stray input | Agent Workspace, user-yield, kill switch, indicators |
| 7 | Legal/terms/EULA exposure | Takedowns, liability | Authorized-use policy, terms notes, blocklist, no evasion, legal review |
| 8 | App updates break Skills | Maintenance burden | Assertions, selector bundles, healer, App Lab regression |
| 9 | Elevation/UAC integrity levels | Cannot drive elevated apps | Detect and hand off; optional elevated helper with explicit consent |
| 10 | Anti-automation (CAPTCHAs, bot checks) | Tasks stall | Handoff; no evasion |
| 11 | VM licensing and hardware dependencies | Legacy containment limits | Document guest-OS licensing; fall back to shared desktop; flag dongle/hardware apps |
| 12 | Scope creep | Never ships | Strict phase exits; Windows first; Floor before accelerators |
| 13 | Dependency drift (MCP spec, models, REA/api-anything, client config formats) | Breakage | Interfaces, pinning, contract tests, client-matrix CI |
| 14 | Malicious packs/Skills/adapters from sharing | Code execution or manipulation | Declarative format, signing, sandbox, import scanning and review, opt-in registry |
| 15 | Dual-use abuse (fraud, stalking, mass automation) | Reputation, legal | No stealth, rate limits, abuse policy, visible indicators, local-only |
| 16 | Weaker offline hardware | Poor local quality | Tiers, honest estimates, patient mode, safeguards scaled to model tier |
| 17 | Maintenance of many apps | Burnout | Generic adapters, learned (not hand-written) knowledge, optional shared packs, automated repair |
| 18 | Remote Access feature exposes device control | Takeover | Off by default, strong auth, user-owned tunnel, clear warnings, audit, short-lived tokens |

---

## 24. Open decisions (remaining)

1. **Virtual machines:** is requiring a VM for Legacy Containment acceptable (later phase), or must everything run on the real desktop?
2. **Distribution:** open source (MIT/Apache) vs. commercial/closed; shared Playbook/Skill library yes or no.
3. **Risk appetite at MVP:** read/navigate and drafts-only first, or approved sends/deletes from day one? (Recommended: drafts-first.)
4. **LMCP relationship:** only as an optional external MCP server (the plan's default), or also direct integration/partnership?
5. **Languages and scripts** that must work on day one (OCR/VLM, right-to-left support).
6. **Legal review owner** before public release.
7. **Name/branding** (check trademarks and package names).
8. **Platform timing:** confirm Windows first; decide when macOS/Linux/Android start.
9. **Hosting of any shared pack library** (self-hosted vs. none).
Answered already: universal for any app; any AI local or cloud; offline-first; GPU optional with CPU fallback; both developers and normal people; export packs; Connect Hub; reuse of reference projects.

---

## 25. First 14 days

- **Day 1:** create the repo/monorepo; copy this plan; set up a Windows test machine and a Hyper-V/VirtualBox VM; snapshot clean images (including an older Windows image if licensed).
- **Day 2:** assemble the 10-app spike corpus by technology class (include a custom-drawn-grid app and an older office suite if available).
- **Day 3:** accessibility + Win32 tree dumper; score each app's tree quality; log gaps.
- **Day 4:** screen capture + OCR benchmark (accuracy/latency; include a non-Latin script).
- **Day 5:** detector/grounding bake-off on 100 labeled screenshots (local vs cloud; CPU vs GPU).
- **Day 6:** input synthesis spike: click/type/drag/scroll/menus/file dialog on all 10 apps; measure success rate.
- **Day 7:** baseline: run an off-the-shelf computer-use agent on 5 tasks; record success, time, cost.
- **Day 8:** minimal Floor: `screen.describe` + `ui.click/type/key` + verify wrapper behind MCP; connect to a real AI client.
- **Day 9:** Action Firewall v0 (label keywords + approval prompt + handoff); test on "Send/Delete" buttons.
- **Day 10:** run the Outlook-2012-style test end to end (supervised); log every failure type.
- **Day 11:** prototype trajectory recording and hand-compile one Skill; replay with new parameters.
- **Day 12:** VM guest-agent spike: pixel-only perception plus snapshot/rollback demo; Connect Hub spike (adapt api-anything `setup.ts`, add Antigravity).
- **Day 13:** prompt-injection spike (hostile email/web page/fake dialog; verify the taint rule); pack export/import spike (export a hand-made pack, import into a second AI client).
- **Day 14:** decision gate: write `docs/spike-notes.md` with measured numbers; answer section 24; freeze Phase 1 scope.

---

## Appendix A: Scene format (sketch)

```json
{
  "app": "<app name>", "window": "<title>", "screen": "mail-list", "language": "en",
  "focus": "e12", "stable": true, "ts": 0,
  "sources": ["uia","ocr","detector"],
  "elements": [
    { "id":"e12","role":"list","name":"Message list","bounds":[0,0,0,0],"state":{"focused":true},
      "actions":["scroll","select"],"conf":0.97,"src":["uia"],"children":["e13"] },
    { "id":"e13","role":"listitem","name":"Ahmed - Invoice 4411",
      "text":{"value":"...","untrusted":true},
      "actions":["open","context_menu"],"conf":0.92,"src":["uia","ocr"] },
    { "id":"e40","role":"button","name":"Send","risk_hint":"external-effect","conf":0.99,"src":["uia"] }
  ],
  "dialogs": [],
  "data": {},
  "marks_image_ref": "optional annotated screenshot with numbered boxes",
  "diff_from": "scene_41"
}
```
Stable ids across calls; diffs between snapshots; budgets ("top-level only", "this region", "text only"); every text span from app/web content marked `untrusted`; cross-signal fusion merges accessibility tree, DOM and OCR.

## Appendix B: Playbook and Skill formats (sketch)

```yaml
# playbook: <app>.<lang>.yaml   (data only; no app names appear in core code)
app: { name: "<detected name>", version: "<range>", lang: en, technology: "<toolkit>" }
risk_map:
  - match: { role: button, name: "Send" }   effect: external-effect
  - match: { menu: "Delete" }               effect: destructive   undo: "Deleted items"
dialogs:
  - id: save_attachment   handler: file_picker   hint: "type full path in File name, Enter"
tasks:
  - id: reply_to_sender   path: "select message -> Ctrl+R -> type -> (approval) Send"
pitfalls: ["Protected View blocks attachment actions until editing is enabled"]
sources: ["F1 help: Reply to a message"]
```

```yaml
# skill: <app>.reply_with_save_attachment
params: { sender: string, keyword: string, folder: path, text: string }
risk: external-effect (final step)
steps:
  - act: focus_search                       expect: { focus: search_box }
  - act: type "${sender} ${keyword}" ; key Enter    expect: { list_not_empty }
  - act: open first_result                  expect: { window: message }
  - act: save_attachment(${folder})         expect: { file_exists: "${folder}/*" }
  - act: reply_type "${text}"               approval: required (send)   expect: { sent_items_contains }
fallbacks: ai_recover on any selector/assertion failure -> propose patch
```

## Appendix C: Operation spec (typed operations from accelerators)

```yaml
app: <detected app>
profile_version: 1
fingerprint: { technology: com, progid: "<registered id>", min_version: "<n>" }
grade: gold
operations:
  - id: add_pivot_table
    summary: Create a pivot table from a range.
    risk: write                      # read | write | destructive | external-effect | privileged
    approval: once-per-session       # never | once-per-session | always | scoped-grant
    sensitivity: personal            # public | personal | confidential | secret
    params:
      workbook: { type: string }
      source_range: { type: string }
    returns: { type: object }
    preview: { supported: true }
    undo: { supported: true, how: "undo-group" }
    idempotency: { key: [workbook, source_range], window: 300s }
    implementations:                 # ordered by preference; the Floor path is always the last fallback
      - route: S2-com    script: scripts/add_pivot.com
      - route: S3-addin  script: scripts/add_pivot.addin
      - route: floor     skill: skills/add_pivot.yaml
    verify: { read_back: get_pivot_info }
    errors: [not_found, locked, protected_view, blocked, permission, ui_changed, timeout]
    health: { last_ok: "...", fail_streak: 0, verified_on_version: "..." }
```

## Appendix D: Local folder layout

```
~/.appbridge/
  config.toml            # global policy, egress rules, hashed client tokens, hardware profile
  device.json            # inventory
  memory/<app>/          # App Memory: playbook, skills, selectors, risk map, run history
  accel/<app>/           # accelerator operation specs and sandboxed scripts
  packs/                 # exported/imported App Packs
  audit.db               # append-only, hash-chained
  health.db
  vault/                 # encrypted secrets, referenced as secret:<name>
  shadow/                # copy-on-write backups before file modifications
  models/                # local OCR/detector/VLM files (offline bundles)
```

## Appendix E: Glossary
**Floor:** the universal see-and-act engine that works on any app. **Accelerator:** an optional faster/safer route (object model, CLI, CDP, API, companion...). **Scene:** the fused structured view of the screen. **Playbook:** per-app knowledge. **Skill:** a compiled, parameterized, verified procedure. **App Memory:** the local store of everything learned per app. **App Pack:** an exported, sanitized bundle of an app's knowledge for another AI or machine. **Pilot:** the built-in agent loop for Task mode. **Action Firewall:** run-time effect classifier and gate for UI actions. **Agent Workspace:** where the AI works (shared desktop, second session, or VM). **Handoff:** pausing for the human. **Legacy Containment:** hosting old apps in matching VMs with snapshots. **Teach mode:** learning a Skill from a human demonstration. **Connect Hub:** the feature that configures AI tools to use Appbridge. **Universality Contract:** the enforced rules that keep the product app-agnostic.
