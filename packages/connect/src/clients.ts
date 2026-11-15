import { exec, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);

export interface SelfInvocation {
  command: string;
  args: string[];
}

/** Node + the local CLI entry: always resolvable, no global install required. */
export function selfInvocation(): SelfInvocation {
  const cliPath = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));
  if (existsSync(cliPath)) return { command: process.execPath, args: [cliPath, "mcp"] };
  return { command: "appbridge", args: ["mcp"] };
}

interface ClientDefinition {
  id: string;
  name: string;
  kind: "json" | "toml" | "cli" | "manual";
  configPath?: string;
  /** Top-level key holding the server map (VS Code uses "servers"). */
  containerKey?: string;
  entryExtra?: Record<string, unknown>;
  cliCommand?: string[];
  detectCommand?: string;
  detectPath?: string;
  note: string;
}

const CLIENTS: ClientDefinition[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    kind: "json",
    configPath: "%APPDATA%/Claude/claude_desktop_config.json",
    note: "Writes mcpServers.appbridge and restarts nothing; quit and reopen Claude Desktop.",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "cli",
    detectCommand: "claude",
    detectPath: "~/.claude",
    cliCommand: ["claude", "mcp", "add", "--scope", "user", "appbridge", "--", "__NODE__", "__CLI__", "mcp"],
    note: "Uses the vendor CLI so its config format stays authoritative.",
  },
  {
    id: "codex",
    name: "Codex CLI / IDE",
    kind: "toml",
    configPath: "~/.codex/config.toml",
    detectCommand: "codex",
    detectPath: "~/.codex",
    note: "Appends [mcp_servers.appbridge] to config.toml after a backup.",
  },
  {
    id: "cursor",
    name: "Cursor",
    kind: "json",
    configPath: "~/.cursor/mcp.json",
    detectPath: "~/.cursor",
    note: "Writes mcpServers.appbridge.",
  },
  {
    id: "vscode",
    name: "VS Code (Copilot / Cline)",
    kind: "json",
    configPath: "%APPDATA%/Code/User/mcp.json",
    containerKey: "servers",
    entryExtra: { type: "stdio" },
    detectPath: "%APPDATA%/Code",
    note: "Writes servers.appbridge with type=stdio.",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    kind: "json",
    configPath: "~/.gemini/settings.json",
    detectPath: "~/.gemini",
    note: "Writes mcpServers.appbridge inside settings.json.",
  },
  {
    id: "antigravity",
    name: "Google Antigravity",
    kind: "json",
    configPath: "~/.gemini/config/mcp_config.json",
    detectPath: "~/.gemini/config",
    note: "Writes the shared mcp_config.json; stdio entries use command/args.",
  },
  {
    id: "generic",
    name: "Any other MCP client",
    kind: "manual",
    note: "Copy the printed mcpServers entry into the client's config, or run `appbridge mcp` as a stdio server.",
  },
];

function expandPath(path: string): string {
  let expanded = path;
  if (expanded.startsWith("~")) expanded = join(homedir(), expanded.slice(1));
  expanded = expanded.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? "");
  return expanded;
}

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function isDetected(definition: ClientDefinition): boolean {
  if (definition.detectPath && existsSync(expandPath(definition.detectPath))) return true;
  if (definition.configPath && existsSync(expandPath(definition.configPath))) return true;
  if (definition.detectCommand && commandExists(definition.detectCommand)) return true;
  return false;
}

export interface ClientStatus {
  id: string;
  name: string;
  kind: ClientDefinition["kind"];
  detected: boolean;
  config_path?: string;
  note: string;
}

export function listClients(): ClientStatus[] {
  return CLIENTS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    detected: isDetected(definition),
    config_path: definition.configPath ? expandPath(definition.configPath) : undefined,
    note: definition.note,
  }));
}

export interface McpEntry {
  command: string;
  args: string[];
  [key: string]: unknown;
}

export function mcpEntry(extra: Record<string, unknown> = {}): McpEntry {
  const invocation = selfInvocation();
  return { ...extra, command: invocation.command, args: invocation.args };
}

export interface ConnectResult {
  client: string;
  status: "configured" | "already-configured" | "cli" | "manual" | "error";
  path?: string;
  backup?: string;
  message: string;
  entry?: McpEntry;
}

async function installJson(definition: ClientDefinition, entry: McpEntry): Promise<ConnectResult> {
  const path = expandPath(definition.configPath as string);
  let existing: Record<string, unknown> = {};
  let backup: string | undefined;
  if (existsSync(path)) {
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    } catch {
      return {
        client: definition.id,
        status: "error",
        path,
        message: "existing config is not valid JSON; left untouched. Fix it, then retry.",
      };
    }
    backup = `${path}.appbridge-backup-${Date.now()}`;
    await copyFile(path, backup);
  } else {
    await mkdir(dirname(path), { recursive: true });
  }
  const containerKey = definition.containerKey ?? "mcpServers";
  const container = (existing[containerKey] as Record<string, unknown> | undefined) ?? {};
  container["appbridge"] = entry;
  existing[containerKey] = container;
  await writeFile(path, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return {
    client: definition.id,
    status: "configured",
    path,
    backup,
    message: `configured ${definition.name}. ${definition.note}`,
    entry,
  };
}

async function installToml(definition: ClientDefinition): Promise<ConnectResult> {
  const path = expandPath(definition.configPath as string);
  let existing = "";
  let backup: string | undefined;
  if (existsSync(path)) {
    existing = await readFile(path, "utf8");
    backup = `${path}.appbridge-backup-${Date.now()}`;
    await copyFile(path, backup);
  } else {
    await mkdir(dirname(path), { recursive: true });
  }
  if (existing.includes("[mcp_servers.appbridge]")) {
    return {
      client: definition.id,
      status: "already-configured",
      path,
      message: "config.toml already has [mcp_servers.appbridge]; left unchanged.",
    };
  }
  const invocation = selfInvocation();
  const args = invocation.args.map((argument) => JSON.stringify(argument)).join(", ");
  const block = `\n[mcp_servers.appbridge]\ncommand = ${JSON.stringify(invocation.command)}\nargs = [${args}]\n`;
  await writeFile(path, `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${block}`, "utf8");
  return {
    client: definition.id,
    status: "configured",
    path,
    backup,
    message: `appended [mcp_servers.appbridge]. ${definition.note}`,
  };
}

async function installCli(definition: ClientDefinition): Promise<ConnectResult> {
  const invocation = selfInvocation();
  const command = (definition.cliCommand ?? []).map((part) =>
    part === "__NODE__" ? invocation.command : part === "__CLI__" ? (invocation.args[0] as string) : part,
  );
  if (command.length === 0) {
    return { client: definition.id, status: "error", message: "no CLI command defined" };
  }
  const quote = (part: string): string => `"${part.replace(/"/g, '\\"')}"`;
  const line = command.map(quote).join(" ");
  try {
    const { stdout, stderr } = await execAsync(line, { timeout: 30000, windowsHide: true });
    return {
      client: definition.id,
      status: "cli",
      message: `ran ${command.slice(0, 4).join(" ")} …\n${(stdout || stderr).trim()}`.trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      client: definition.id,
      status: "error",
      message: `could not run the client CLI. Run it manually:\n  ${line}\n(${message})`,
    };
  }
}

export async function connectClient(id: string): Promise<ConnectResult> {
  const definition = CLIENTS.find((candidate) => candidate.id === id);
  if (!definition) {
    return {
      client: id,
      status: "error",
      message: `unknown client ${JSON.stringify(id)}; run \`appbridge connect --list\``,
    };
  }
  switch (definition.kind) {
    case "json":
      return installJson(definition, { ...mcpEntry(definition.entryExtra ?? {}) } as McpEntry);
    case "toml":
      return installToml(definition);
    case "cli":
      return installCli(definition);
    case "manual":
      return {
        client: definition.id,
        status: "manual",
        message: "Add this to your MCP client config (stdio):",
        entry: mcpEntry(),
      };
  }
}

export async function undoClient(id: string): Promise<{ restored: boolean; path?: string; message: string }> {
  const definition = CLIENTS.find((candidate) => candidate.id === id);
  if (!definition?.configPath) {
    return { restored: false, message: `no config file is managed for ${id}` };
  }
  const path = expandPath(definition.configPath);
  if (!existsSync(path)) return { restored: false, message: `no config at ${path}` };
  const dir = dirname(path);
  const base = basename(path);
  const files = await readdir(dir).catch(() => [] as string[]);
  const backups = files
    .filter((file) => file.startsWith(`${base}.appbridge-backup-`))
    .sort();
  const latest = backups[backups.length - 1];
  if (!latest) return { restored: false, path, message: "no Appbridge backup found next to the config" };
  await copyFile(join(dir, latest), path);
  return { restored: true, path, message: `restored ${base} from ${latest}` };
}

export function printMcpConfig(): Record<string, unknown> {
  return { mcpServers: { appbridge: mcpEntry() } };
}

export function printTomlConfig(): string {
  const invocation = selfInvocation();
  return `[mcp_servers.appbridge]\ncommand = ${JSON.stringify(invocation.command)}\nargs = [${invocation.args
    .map((argument) => JSON.stringify(argument))
    .join(", ")}]\n`;
}
