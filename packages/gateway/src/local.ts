import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve, sep } from "node:path";
import type { Effect } from "@appbridge/core";

const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_FILES = 2000;
const MAX_SEARCH_DEPTH = 12;
const MAX_SEARCH_BYTES = 25_000_000;

export interface LocalAccessOptions {
  roots: string[];
  maxFileBytes: number;
  maxSearchResults: number;
}

export interface TerminalOptions {
  timeoutMs: number;
  maxOutputChars: number;
}

export type TerminalShell = "powershell" | "cmd" | "bash" | "sh" | "zsh" | "wsl";

export function classifyTerminalCommand(command: string): Effect {
  const text = command.trim();
  if (/(^|[\s;&|])(?:sudo|runas|set-executionpolicy|new-service|set-service|useradd|net\s+user|reg(?:\.exe)?\s+(?:add|delete)|sc(?:\.exe)?\s+(?:create|config|delete)|start-process\b.*-verb\s+runas)(?=$|[\s;&|])/i.test(text)) {
    return "privileged";
  }
  if (/(^|[\s;&|])(?:rm|del|erase|rmdir|remove-item|format|diskpart|clear-disk|shutdown|restart-computer|stop-computer|kill|killall|taskkill|stop-process|git\s+(?:push|clean)|npm\s+publish|docker\s+push|kubectl\s+(?:apply|delete)|terraform\s+(?:apply|destroy)|curl|wget|invoke-webrequest|invoke-restmethod|ssh|scp|sftp)(?=$|[\s;&|])/i.test(text)) {
    return "destructive";
  }
  if (!text || /[\r\n`$;|&><()]/.test(text)) return "destructive";

  if (/^(?:pwd|cd|get-location|echo(?:\s+[\w .:/\\-]+)?|write-output|npm\s+--version|node\s+--version|python(?:3)?\s+--version|git\s+--version)$/i.test(text)) {
    return "read";
  }
  if (/^(?:(?:ls|dir|get-childitem)(?:\s+\.)?|(?:cat|type|get-content)\s+[A-Za-z0-9._-]+|git\s+(?:status|diff|log|show|branch|rev-parse)(?:\s+[\w./-]+)*|(?:rg|grep|findstr)\s+(?:-[\w-]+\s+)*[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)*)$/i.test(text)) {
    return "read";
  }
  if (/^(?:npm\s+(?:test|run\s+(?:build|test|check|lint(?::[A-Za-z0-9._-]+)?|typecheck))|dotnet\s+(?:build|test)|flutter\s+(?:test|analyze|build)|cargo\s+(?:test|check|build)|go\s+test|pytest|python(?:3)?\s+-m\s+pytest|mvn\s+test|gradle\s+(?:test|build))(?:\s+[\w./:-]+)*$/i.test(text)) {
    return "unknown";
  }
  return "destructive";
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function truncateText(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(0, limit), truncated: true };
}

export class LocalComputerAccess {
  private readonly roots: string[];

  constructor(private readonly options: LocalAccessOptions) {
    this.roots = options.roots.map((root) => resolve(root));
  }

  async listRoots(): Promise<string[]> {
    return Promise.all(
      this.roots.map(async (root) => {
        const canonical = await realpath(root);
        const info = await stat(canonical);
        if (!info.isDirectory()) throw new Error(`configured file root is not a directory: ${root}`);
        return canonical;
      }),
    );
  }

  async resolvePath(input: string): Promise<string> {
    if (!input.trim()) throw new Error("path must not be empty");
    const roots = await this.listRoots();
    const candidate = isAbsolute(input) ? resolve(input) : resolve(roots[0] ?? process.cwd(), input);
    let existing = candidate;
    const missing: string[] = [];

    while (true) {
      try {
        const info = await lstat(existing);
        let current = existing;
        while (true) {
          if ((await lstat(current)).isSymbolicLink()) {
            throw new Error("symbolic links are not allowed for file access");
          }
          const parent = resolve(current, "..");
          if (parent === current) break;
          current = parent;
        }
        const canonical = await realpath(existing);
        const scoped = roots.some((root) => isWithin(root, canonical));
        if (!scoped) throw new Error(`path is outside configured file roots: ${input}`);
        return missing.length === 0 ? canonical : resolve(canonical, ...missing.reverse());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const parent = resolve(existing, "..");
        if (parent === existing) throw new Error(`cannot resolve path: ${input}`);
        missing.push(existing.slice(parent.length + 1));
        existing = parent;
      }
    }
  }

  async list(path?: string): Promise<Record<string, unknown>> {
    const roots = await this.listRoots();
    const directory = await this.resolvePath(path ?? roots[0] ?? "");
    const info = await stat(directory);
    if (!info.isDirectory()) throw new Error(`not a directory: ${path ?? directory}`);

    const entries = await readdir(directory, { withFileTypes: true });
    const visible = entries
      .filter((entry) => !entry.isSymbolicLink())
      .slice(0, MAX_LIST_ENTRIES)
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" }));
    return {
      path: directory,
      entries: visible,
      truncated: entries.length > visible.length,
    };
  }

  async read(path: string, startLine = 1, maxLines = 500): Promise<Record<string, unknown>> {
    if (!Number.isFinite(startLine) || !Number.isFinite(maxLines)) {
      throw new Error("start_line and max_lines must be finite numbers");
    }
    const file = await this.resolvePath(path);
    const info = await stat(file);
    if (!info.isFile()) throw new Error(`not a regular file: ${path}`);
    if (info.size > this.options.maxFileBytes) {
      throw new Error(`file exceeds the configured read limit of ${this.options.maxFileBytes} bytes`);
    }
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    const start = Math.max(1, Math.floor(startLine));
    const lineLimit = Math.min(Math.max(Math.floor(maxLines), 1), 2000);
    const selected = lines.slice(start - 1, start - 1 + lineLimit);
    return {
      path: file,
      start_line: start,
      total_lines: lines.length,
      content: selected.join("\n"),
      truncated: start - 1 + selected.length < lines.length,
    };
  }

  async search(query: string, path: string | undefined, maxResults: number): Promise<Record<string, unknown>> {
    if (!query.trim()) throw new Error("query must not be empty");
    const roots = await this.listRoots();
    const start = await this.resolvePath(path ?? roots[0] ?? "");
    const startInfo = await stat(start);
    if (!startInfo.isDirectory()) throw new Error(`search root is not a directory: ${path ?? start}`);

    const matches: Array<{ path: string; line?: number; text?: string; match: "name" | "content" }> = [];
    const pending: Array<{ path: string; depth: number }> = [{ path: start, depth: 0 }];
    let scanned = 0;
    let skipped = 0;
    let scannedBytes = 0;
    let budgetReached = false;
    const needle = query.toLocaleLowerCase();

    while (pending.length > 0 && scanned < MAX_SEARCH_FILES && matches.length < maxResults) {
      const current = pending.pop();
      if (!current) break;
      let entries: Dirent[];
      try {
        entries = await readdir(current.path, { withFileTypes: true });
      } catch {
        skipped += 1;
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const childPath = resolve(current.path, entry.name);
        if (entry.isDirectory()) {
          if (current.depth < MAX_SEARCH_DEPTH) pending.push({ path: childPath, depth: current.depth + 1 });
          continue;
        }
        if (!entry.isFile()) continue;
        scanned += 1;
        if (entry.name.toLocaleLowerCase().includes(needle)) {
          matches.push({ path: childPath, match: "name" });
          if (matches.length >= maxResults) break;
        }

        try {
          const info = await stat(childPath);
          if (info.size === 0 || info.size > this.options.maxFileBytes) continue;
          if (scannedBytes + info.size > MAX_SEARCH_BYTES) {
            budgetReached = true;
            pending.length = 0;
            break;
          }
          scannedBytes += info.size;
          const bytes = await readFile(childPath);
          if (bytes.includes(0)) {
            skipped += 1;
            continue;
          }
          const content = bytes.toString("utf8");
          const lines = content.split(/\r?\n/);
          for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
            const line = lines[index] ?? "";
            if (line.toLocaleLowerCase().includes(needle)) {
              const snippet = truncateText(line, 500);
              matches.push({ path: childPath, line: index + 1, text: snippet.text, match: "content" });
            }
          }
        } catch {
          skipped += 1;
        }
        if (matches.length >= maxResults) break;
      }
    }

    return {
      root: start,
      query,
      matches,
      scanned_files: scanned,
      scanned_bytes: scannedBytes,
      skipped_files: skipped,
      truncated: pending.length > 0 || scanned >= MAX_SEARCH_FILES || budgetReached,
    };
  }

  async write(path: string, content: string): Promise<Record<string, unknown>> {
    if (Buffer.byteLength(content, "utf8") > this.options.maxFileBytes) {
      throw new Error(`content exceeds the configured file limit of ${this.options.maxFileBytes} bytes`);
    }
    const file = await this.resolvePath(path);
    const previous = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (previous && !previous.isFile()) throw new Error(`not a regular file: ${path}`);
    await writeFile(file, content, { encoding: "utf8", flag: "w" });
    return {
      path: file,
      bytes_written: Buffer.byteLength(content, "utf8"),
      created: previous === undefined,
      verified: (await readFile(file, "utf8")) === content,
    };
  }

  async edit(path: string, oldText: string, newText: string): Promise<Record<string, unknown>> {
    if (!oldText) throw new Error("old_text must not be empty");
    const file = await this.resolvePath(path);
    const info = await stat(file);
    if (!info.isFile()) throw new Error(`not a regular file: ${path}`);
    if (info.size > this.options.maxFileBytes) {
      throw new Error(`file exceeds the configured edit limit of ${this.options.maxFileBytes} bytes`);
    }
    const bytes = await readFile(file);
    if (bytes.includes(0)) throw new Error("binary files cannot be edited as text");
    const content = bytes.toString("utf8");
    const first = content.indexOf(oldText);
    if (first < 0) throw new Error("old_text was not found; no changes were made");
    if (content.indexOf(oldText, first + oldText.length) >= 0) {
      throw new Error("old_text matches more than once; provide a more specific edit");
    }
    const updated = `${content.slice(0, first)}${newText}${content.slice(first + oldText.length)}`;
    return this.write(file, updated);
  }

  async availableShells(): Promise<TerminalShell[]> {
    const found: TerminalShell[] = [];
    for (const shell of ["powershell", "cmd", "bash", "sh", "zsh", "wsl"] as const) {
      if (await this.findShellExecutable(shell)) found.push(shell);
    }
    return found;
  }

  async run(
    shell: TerminalShell,
    command: string,
    cwd: string,
    options: TerminalOptions,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    if (!command.trim()) throw new Error("command must not be empty");
    if (command.length > 20000) throw new Error("command exceeds the 20000-character limit");
    const workingDirectory = await this.resolvePath(cwd);
    if (!(await stat(workingDirectory)).isDirectory()) throw new Error(`not a directory: ${cwd}`);
    if (!(await this.availableShells()).includes(shell)) throw new Error(`terminal is not available: ${shell}`);

    const executable = await this.findShellExecutable(shell);
    if (!executable) throw new Error(`terminal is not available: ${shell}`);
    const commandLine = this.commandLine(shell, command, executable);
    const timeout = Math.min(Math.max(timeoutMs ?? options.timeoutMs, 1000), 120000);
    const child = spawn(commandLine.executable, commandLine.args, {
      cwd: workingDirectory,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const append = (current: string, chunk: Buffer): string => {
      const remaining = options.maxOutputChars - current.length;
      if (remaining <= 0) {
        truncated = true;
        return current;
      }
      const text = chunk.toString("utf8");
      if (text.length > remaining) truncated = true;
      return current + text.slice(0, remaining);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const execution = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolvePromise({ code, signal }));
    });
    const timer = setTimeout(() => {
      child.kill();
    }, timeout);
    let exit: { code: number | null; signal: NodeJS.Signals | null };
    try {
      exit = await execution;
    } finally {
      clearTimeout(timer);
    }
    const timedOut = exit.signal !== null && exit.code === null;
    const stdoutResult = truncateText(stdout, options.maxOutputChars);
    const stderrResult = truncateText(stderr, Math.max(0, options.maxOutputChars - stdoutResult.text.length));
    return {
      shell,
      cwd: workingDirectory,
      exit_code: exit.code,
      timed_out: timedOut,
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      truncated: truncated || stdoutResult.truncated || stderrResult.truncated,
    };
  }

  private async findShellExecutable(shell: TerminalShell): Promise<string | undefined> {
    const candidates: Record<TerminalShell, string[]> = {
      powershell: process.platform === "win32" ? ["powershell.exe", "pwsh.exe"] : ["pwsh", "powershell"],
      cmd: process.platform === "win32" ? ["cmd.exe"] : [],
      bash: ["bash.exe", "bash"],
      sh: ["sh.exe", "sh"],
      zsh: ["zsh.exe", "zsh"],
      wsl: process.platform === "win32" ? ["wsl.exe"] : [],
    };
    const searchPath = (process.env["PATH"] ?? "").split(delimiter).filter(Boolean);
    if (process.platform === "win32" && process.env["SystemRoot"]) {
      searchPath.push(resolve(process.env["SystemRoot"], "System32"));
    }
    for (const directory of searchPath) {
      for (const name of candidates[shell]) {
        const candidate = resolve(directory, name);
        try {
          if ((await stat(candidate)).isFile()) return candidate;
        } catch {
          // Check the next executable candidate.
        }
      }
    }
    return undefined;
  }

  private commandLine(shell: TerminalShell, command: string, executable: string): { executable: string; args: string[] } {
    switch (shell) {
      case "powershell":
        return { executable, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] };
      case "cmd":
        return { executable, args: ["/d", "/s", "/c", command] };
      case "bash":
        return { executable, args: ["--noprofile", "--norc", "-lc", command] };
      case "sh":
        return { executable, args: ["-lc", command] };
      case "zsh":
        return { executable, args: ["-f", "-c", command] };
      case "wsl":
        return { executable, args: ["--exec", "bash", "--noprofile", "--norc", "-lc", command] };
    }
  }
}
