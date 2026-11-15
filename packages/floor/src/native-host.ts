import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { debug } from "@appbridge/core";

export class HostError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HostError";
    this.code = code;
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

interface HostResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

/**
 * Owns the long-lived native host process. Requests are JSON lines; a hung
 * request kills and restarts the host rather than blocking the bridge forever.
 */
export class NativeHost {
  private readonly scriptPath: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<string, Pending>();
  private counter = 0;
  private starting: Promise<void> | null = null;
  private killed = false;
  private stderrTail: string[] = [];

  constructor(scriptPath?: string) {
    this.scriptPath =
      scriptPath ?? fileURLToPath(new URL("../native/uia-host.ps1", import.meta.url));
  }

  async start(): Promise<void> {
    if (this.killed) throw new HostError("host_closed", "the native host has been closed");
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    if (!existsSync(this.scriptPath)) {
      throw new HostError("host_missing", `native host script not found: ${this.scriptPath}`);
    }
    this.starting = (async () => {
      const powershell = process.env["APPBRIDGE_POWERSHELL"] ?? "powershell.exe";
      const child = spawn(
        powershell,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      this.child = child;
      this.buffer = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      child.stderr.on("data", (chunk: string) => {
        this.stderrTail.push(chunk);
        if (this.stderrTail.length > 20) this.stderrTail.shift();
        debug("host stderr:", chunk.trim());
      });
      child.on("exit", (code) => this.onExit(code));
      child.on("error", (error) => this.failAll(new HostError("host_failed", error.message)));
      try {
        await this.request<{ ok: boolean }>("ping", {}, 45000, true);
      } catch (error) {
        const tail = this.stderrTail.join("").trim().slice(-1200);
        this.terminate();
        throw new HostError(
          "host_failed",
          `native host did not start${tail ? `: ${tail}` : ""}${
            error instanceof Error ? ` (${error.message})` : ""
          }`,
        );
      }
    })();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: HostResponse;
      try {
        message = JSON.parse(line) as HostResponse;
      } catch {
        debug("host non-protocol output:", line.slice(0, 300));
        continue;
      }
      if (message && message.ok === undefined) continue;
      const id = String(message.id ?? "");
      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.data);
      else
        pending.reject(
          new HostError(message.error?.code ?? "host_error", message.error?.message ?? "native host error"),
        );
    }
  }

  private onExit(code: number | null): void {
    const reason = new HostError(
      "host_exited",
      `native host exited${code === null ? "" : ` with code ${code}`}: ${this.stderrTail
        .join("")
        .trim()
        .slice(-800)}`,
    );
    this.child = null;
    this.failAll(reason);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  private terminate(): void {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) {
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      child.kill();
    }
  }

  async request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 20000, startup = false): Promise<T> {
    if (this.killed) throw new HostError("host_closed", "the native host has been closed");
    if (!startup) await this.start();
    const child = this.child;
    if (!child) throw new HostError("host_not_started", "the native host is not running");
    const id = String(++this.counter);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.terminate();
        reject(new HostError("timeout", `${method} did not return within ${timeoutMs}ms; host restarted`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        method,
      });
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new HostError("host_write_failed", error instanceof Error ? error.message : String(error)));
      }
    });
  }

  async close(): Promise<void> {
    this.killed = true;
    this.terminate();
    this.failAll(new HostError("host_closed", "the native host has been closed"));
  }
}
