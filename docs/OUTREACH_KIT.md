# Appbridge Creator & Community Outreach Kit

Use this ready-to-send kit to reach out to influencers, AI creators, and developer communities. Every message is customized with the exact hook that makes them want to test, star, make videos about, and contribute to **Appbridge**.

---

## 1. Direct Messages & Emails for Top YouTube Creators

### A. Matthew Berman (Audience: Local AI, Open-Source Agents, Privacy)
* **Where to reach**: Twitter/X (@matthewberman) or business email on his YouTube channel.
* **Subject**: Open-source, 100% local Windows Computer Use agent (runs on Ollama or Cloud)
* **Message**:
> Hi Matthew,
> 
> Loved your recent videos on local AI agents and autonomous workflows.
> 
> Anthropic’s Computer Use got everyone excited, but it’s cloud-only, expensive (draining tokens on screenshots), and fragile with pixel coordinates.
> 
> We just open-sourced **Appbridge** (Apache-2.0): a desktop bridge that gives any AI real eyes and hands on Windows using native Accessibility Trees (UIA) + WinRT OCR instead of guessing at pixels.
> 
> Why you might find it interesting for a video:
> 1. **Zero GPU required**: The local daemon takes ~50MB RAM. Users on everyday laptops can run it with Ollama Cloud, Claude, or Groq at 80+ tokens/sec, or run it 100% offline with local Ollama (`qwen2.5-coder`, `gemma`).
> 2. **Real Safety Harness**: Out-of-band approvals for destructive actions, append-only hash-chained audit log, and an instant kill switch.
> 3. **Native Desktop Chatbot + MCP**: Has a built-in Flutter desktop chatbot and also connects via MCP to Claude Code, Cursor, and Cline.
> 
> Repo: https://github.com/burhanfarrukh13/appbridge
> 
> Would love for you to test it out or roast it. Happy to help answer any questions or build custom recipes for apps you want to demo!
> 
> Best,  
> Burhan

---

### B. All About AI / Kris (Audience: Practical AI Automation & Agent Tutorials)
* **Where to reach**: Twitter/X (@AllAboutAI_Kris) or YouTube business contact.
* **Subject**: Free Windows Desktop Agent for any LLM (MCP + Desktop UI)
* **Message**:
> Hey Kris,
> 
> Huge fan of your agent walkthroughs and hands-on automation tutorials.
> 
> Wanted to share a new open-source project that your community might love: **Appbridge** (https://github.com/burhanfarrukh13/appbridge).
> 
> It’s a native Windows automation bridge that lets any LLM (Claude, OpenAI, Ollama) control desktop applications (WhatsApp, Excel, Notepad, browsers, legacy Win32 apps) without APIs. Unlike pixel-clicking tools, it reads the Windows UI Automation tree, verifies whether actions actually succeeded, and puts dangerous actions behind human approvals.
> 
> It includes:
> - A 1-click portable Windows desktop app with built-in agent chatbot.
> - Full MCP server support (connects directly into Claude Desktop or Cursor in 30 seconds).
> - Low hardware footprint (~50MB RAM, no expensive GPU required).
> 
> Would love to hear your thoughts or see you test it in a tutorial. Let me know if you want any custom skills built for a demo!
> 
> Cheers,  
> Burhan

---

### C. WorldofAI & Prompt Engineering (Audience: GitHub Repo Showcases & Install Guides)
* **Subject**: New Open Source Project: Appbridge (Windows Computer Use Agent)
* **Message**:
> Hey!
> 
> I built an open-source tool called **Appbridge** (https://github.com/burhanfarrukh13/appbridge) that brings "Computer Use" to Windows for any LLM.
> 
> Most computer-use agents take full-screen screenshots every step and cost a fortune. Appbridge uses Windows UI Automation trees + WinRT OCR, meaning:
> - It is instant and lightweight (<50MB RAM).
> - Runs on any PC (no dedicated GPU needed) with cloud APIs or local Ollama.
> - Has a clean Flutter desktop UI + MCP server for Claude Code/Cursor.
> - 100% open source under Apache-2.0 with a 1-click Windows portable ZIP.
> 
> I think your viewers would love a hands-on review/setup guide of this. Check it out and let me know if you have any feedback!

---

## 2. Reddit Post (for r/LocalLLaMA & r/ArtificialIntelligence)

* **Subreddit**: `r/LocalLLaMA` (Flair: `Project / Release`)
* **Title**: *I built Appbridge: An open-source, local-first Windows Computer Use agent that doesn't need an RTX 4090 (UIA + OCR + MCP)*

* **Body Content**:
> Hey r/LocalLLaMA,
> 
> When Anthropic announced Computer Use, I was excited—until I saw the architecture: taking massive screenshots every step, feeding them to expensive vision models, guessing (x, y) coordinates, and praying it clicks the right button. Not to mention it doesn't run locally and costs a fortune.
> 
> So I spent the last few months building **Appbridge** (Apache-2.0):
> 🔗 **GitHub**: https://github.com/burhanfarrukh13/appbridge
> 
> ### How it works (Why it's different):
> 1. **Accessibility Trees First (UIA)**: Instead of pixel-guessing, Appbridge queries the Windows UI Automation tree. It gets element names, roles, bounds, and states (`e1: Button "Save"`, `e2: Edit "Search"`). If an app's tree is sparse, local WinRT OCR fills in the text.
> 2. **Zero GPU Required / Any Model**: The background daemon uses ~50MB RAM. You don't need a high-end GPU. If you have a budget laptop, you can connect it to fast cloud models (Ollama Cloud, Claude, OpenAI, Groq). If you have a good GPU, you can run 100% offline with local Ollama (`qwen2.5-coder`, `gemma`).
> 3. **Verification, Not Sleep-and-Hope**: Every action returns `{ok, class, verified, change}` and verifies that the window/element actually reacted.
> 4. **A Real Safety Harness**: Irreversible actions (delete, send, pay) are classified into effects and paused for human approval. Kill switch is an instant local file touch, and audits are append-only hash chains.
> 5. **Two Ways to Use It**:
>    - **Built-in Desktop Chatbot UI** (Flutter Windows app with multi-model thinking + action timeline).
>    - **MCP Server** for Claude Code, Cursor, Cline, or any MCP client (`appbridge connect --client claude-code`).
> 
> Portable Windows ZIP available in GitHub Releases.
> 
> I'd love your feedback, feature requests, and bug reports! What apps would you want Appbridge to support next?

---

## 3. Hacker News "Show HN" Post

* **Title**: `Show HN: Appbridge – Local, accessibility-native computer use for Windows`
* **URL**: `https://github.com/burhanfarrukh13/appbridge`

* **Text**:
> Hi HN,
> 
> I built Appbridge, an open-source (Apache-2.0) harness that lets any AI agent operate desktop software on Windows.
> 
> Most computer-use projects treat the operating system as a raw pixel canvas, taking screenshots and asking a VLM to predict pixel coordinates. That is slow, token-heavy, and fragile.
> 
> Appbridge takes an accessibility-native approach:
> - **Perception**: Extracts structured Scenes from the Windows UI Automation (UIA) tree. OCR is used only as fallback for custom-rendered canvas elements.
> - **Verification**: Actions (`click`, `type`, `key`) wait for explicit state changes or element appearances instead of blind `time.sleep()`.
> - **Governance**: Actions are classified into effect categories (`read`, `write`, `destructive`, `external-effect`, `credential`). High-risk actions require human approval via a local loopback gateway.
> 
> It runs as an MCP server (for Claude Code, Cursor, Windsurf) or via an included Flutter desktop console. It runs on any machine with ~50MB RAM, allowing users to pair it with either cloud LLMs or local Ollama.
> 
> Code: https://github.com/burhanfarrukh13/appbridge
> 
> Would appreciate technical critique and feedback from the community.

---

## 4. Viral Twitter / X Launch Thread

**Tweet 1 (Hook + Video/GIF)**:
> Anthropic’s Computer Use is cool, but screenshot-guessing is slow, expensive, and cloud-bound.
> 
> Introducing Appbridge: an open-source, local-first Windows desktop bridge for AI agents.
> 
> ⚡ Accessibility Tree (UIA) instead of pixels  
> 🛡 Built-in human approval harness  
> 💻 Zero GPU needed (<50MB RAM)  
> 
> 🔗 https://github.com/burhanfarrukh13/appbridge  
> 🧵👇

**Tweet 2 (How it works)**:
> Why UIA beats screenshots:
> 
> When an agent wants to click "Save", vision models guess pixel (x, y). If resolution shifts, it breaks.
> 
> Appbridge inspects the native Windows UI Automation tree, gets exact element handles, verifies state changes, and only uses OCR where needed.

**Tweet 3 (Hardware & Privacy)**:
> You don't need a $2,000 GPU to use it.
> 
> - Budget laptop? Use Ollama Cloud, Claude, or Groq at 80+ tokens/sec.
> - Want 100% offline privacy? Toggle to local Ollama (Qwen, Gemma).
> 
> It also plugs into Claude Code, Cursor, and Cline via MCP with a single command:
> `appbridge connect --client claude-code`

**Tweet 4 (Call to Action)**:
> Appbridge is 100% open-source under Apache-2.0.
> 
> ⭐ Star the repo: https://github.com/burhanfarrukh13/appbridge
> 📦 Download the portable Windows ZIP in Releases
> 🤝 Looking for contributors: Help us build community App Packs and Linux/Mac drivers!
