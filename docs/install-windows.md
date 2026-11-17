# Install Appbridge on Windows

1. Download `Appbridge-0.0.2-windows-x64.zip` from the
   [0.0.2 GitHub release](https://github.com/burhanfarrukh13/appbridge/releases/tag/v0.0.2).
2. Extract the entire ZIP to a folder where you want to keep Appbridge, for example
   `%LOCALAPPDATA%\Programs\Appbridge`. Keep the `runtime` folder beside the desktop
   executable.
3. Run `appbridge_desktop.exe`. On first launch, open **Settings** and choose
   **Start Core Daemon**.
4. Choose the folders Appbridge may access by editing
   `%USERPROFILE%\.appbridge\config.toml`. Under `[filesystem]`, set `roots`, for example:

   ```toml
   [filesystem]
   roots = ["C:\\Users\\YOUR_NAME\\Documents", "D:\\Work"]
   ```

   Only add folders you intend to expose to file tools. The default installation folder is
   not a useful workspace; configure roots before using file tools. Roots also constrain
   the terminal's working directory, but shell commands run with your Windows account's
   permissions and are not sandboxed by those roots.
5. Optional: remove tools the AI should not have. Under `[tools]`, add `deny = ["terminal.run", "app.launch"]`
   (or a group, e.g. `"terminal"`) to `%USERPROFILE%\.appbridge\config.toml`. Denied calls
   return `blocked` instead of running. Build and test commands require approval by default
   because they execute project code. Approval and kill-switch resume are operator controls,
   not AI-callable tools.
6. Connect an AI client from Appbridge's **Connect** screen. Keep the installation in the
   same location afterward; configured clients reference files in that folder.

For the optional Ollama chat panel, add settings such as `OLLAMA_API_KEY`,
`OLLAMA_URL`, and `OLLAMA_MODEL` to `%USERPROFILE%\.appbridge\agent.env`, or set them as
process environment variables. Appbridge's **Reload settings** button reloads those values.

The ZIP includes the Appbridge backend, production dependencies, Node.js 24.15.0, and the
Node.js license. It does not install a service, require administrator rights, or modify
Windows startup settings. PowerShell 5.1 and Windows 10/11 x64 are required for the native
UI Automation host.

The release is unsigned. Windows may show a SmartScreen warning; only run it if the
downloaded archive's SHA-256 matches the checksum published alongside it on the release
page.
