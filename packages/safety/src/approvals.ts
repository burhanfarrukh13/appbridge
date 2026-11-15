import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { withFileLock, type ApprovalView, type Effect } from "@appbridge/core";


export type ApprovalStatus = "pending" | "granted" | "denied";
export type ApprovalScope = "once" | "session";

export interface ApprovalRecord {
  id: string;
  created_at: string;
  expires_at: string;
  effect: Effect;
  app: string | null;
  target: string | null;
  reason: string;
  scope: ApprovalScope;
  status: ApprovalStatus;
}

interface ApprovalState {
  version: 1;
  requests: ApprovalRecord[];
}

export interface ApprovalRequestInput {
  effect: Effect;
  app?: string;
  target?: string;
  reason: string;
  ttlSeconds: number;
}

function now(): number {
  return Date.now();
}

function expiry(ttlSeconds: number): string {
  return new Date(now() + ttlSeconds * 1000).toISOString();
}

function isLive(record: ApprovalRecord): boolean {
  return Date.parse(record.expires_at) > now();
}

/**
 * File-backed approval requests and grants. MCP clients cannot show UI, so an
 * agent asks, the human approves out-of-band (`appbridge approvals approve`),
 * and the call is retried.
 */
export class ApprovalStore {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private async read(): Promise<ApprovalState> {
    if (!existsSync(this.file)) return { version: 1, requests: [] };
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8")) as ApprovalState;
      if (!raw || !Array.isArray(raw.requests)) return { version: 1, requests: [] };
      return { version: 1, requests: raw.requests.filter((r) => r && typeof r.id === "string") };
    } catch {
      return { version: 1, requests: [] };
    }
  }

  private async write(state: ApprovalState): Promise<void> {
    mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.file);
  }

  /** Serialize read-modify-write cycles across CLI and daemon processes. */
  private async locked<T>(action: () => Promise<T>): Promise<T> {
    return withFileLock(this.file, action);
  }

  async list(): Promise<ApprovalRecord[]> {
    return this.locked(async () => {
      const pruned = await this.pruneState(await this.read());
      await this.write(pruned);
      return pruned.requests.sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }

  private async pruneState(state: ApprovalState): Promise<ApprovalState> {
    const kept = state.requests.filter((record) => isLive(record));
    return { version: 1, requests: kept };
  }

  async request(input: ApprovalRequestInput): Promise<ApprovalRecord> {
    return this.locked(async () => {
      const state = await this.pruneState(await this.read());
      const existing = state.requests.find(
        (record) =>
          record.status === "pending" &&
          isLive(record) &&
          record.effect === input.effect &&
          (record.target ?? "") === (input.target ?? "") &&
          (record.app ?? "") === (input.app ?? ""),
      );
      if (existing) {
        await this.write(state);
        return existing;
      }
      const record: ApprovalRecord = {
        id: `ap_${randomBytes(5).toString("hex")}`,
        created_at: new Date().toISOString(),
        expires_at: expiry(input.ttlSeconds),
        effect: input.effect,
        app: input.app ?? null,
        target: input.target ?? null,
        reason: input.reason,
        scope: "once",
        status: "pending",
      };
      state.requests.push(record);
      await this.write(state);
      return record;
    });
  }

  async decide(id: string, decision: "granted" | "denied", scope: ApprovalScope, ttlSeconds: number): Promise<ApprovalRecord> {
    return this.locked(async () => {
      const state = await this.pruneState(await this.read());
      const record = state.requests.find((r) => r.id === id);
      if (!record) throw new Error(`unknown approval request: ${id}`);
      record.status = decision;
      record.scope = scope;
      record.expires_at = expiry(ttlSeconds);
      await this.write(state);
      return record;
    });
  }

  async consume(id: string): Promise<void> {
    await this.locked(async () => {
      const state = await this.read();
      const before = state.requests.length;
      state.requests = state.requests.filter((r) => !(r.id === id && r.scope === "once"));
      if (state.requests.length !== before) await this.write(state);
    });
  }

  /** A live grant matching this action, if one was approved earlier. */
  async findGrant(effect: Effect, app?: string, target?: string): Promise<ApprovalRecord | undefined> {
    return this.locked(async () => {
      const state = await this.pruneState(await this.read());
      await this.write(state);
      return state.requests.find((record) => {
        if (record.status !== "granted" || !isLive(record)) return false;
        if (record.effect !== effect) return false;
        if (record.app && app && record.app !== app) return false;
        if (record.target && record.target !== "*" && target && record.target !== target) return false;
        if (record.target && record.target !== "*" && !target) return false;
        return true;
      });
    });
  }

  /** Remove expired and denied entries; returns the number removed. */
  async prune(): Promise<number> {
    return this.locked(async () => {
      const state = await this.read();
      const kept = state.requests.filter((record) => isLive(record) && record.status !== "denied");
      await this.write({ version: 1, requests: kept });
      return state.requests.length - kept.length;
    });
  }
}

export function approvalView(record: ApprovalRecord): ApprovalView {
  return {
    id: record.id,
    effect: record.effect,
    target: record.target ?? undefined,
    app: record.app ?? undefined,
    reason: record.reason,
    expires_at: record.expires_at,
  };
}
