/** Diagnostics go to stderr: stdout belongs to the MCP protocol. */
export function debug(...parts: unknown[]): void {
  if (!process.env["APPBRIDGE_DEBUG"]) return;
  process.stderr.write(`[appbridge] ${parts.map(String).join(" ")}\n`);
}

export function warn(...parts: unknown[]): void {
  process.stderr.write(`[appbridge] warning: ${parts.map(String).join(" ")}\n`);
}
