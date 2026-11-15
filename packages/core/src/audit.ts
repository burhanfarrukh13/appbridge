import { appendFile, readFile, rename } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sha256Hex, stableStringify } from "./ids.js";
import { lastJsonLine, withFileLock } from "./lock.js";

export interface AuditEntryInput {
  actor: string;
  tool: string;
  args_digest: string;
  result: string;
  approval_id?: string | null;
  route?: string | null;
  app?: string | null;
  note?: string | null;
}

interface AuditBody extends AuditEntryInput {
  seq: number;
  ts: string;
  prev: string;
}

export interface AuditRecord extends AuditBody {
  hash: string;
}

/**
 * Append-only, hash-chained audit log. Each record commits to the previous
 * hash, so editing or removing a record breaks verification.
 *
 * Appends are serialized across processes (CLI, MCP server, REST gateway) and
 * the true tail is re-read for every record. A long-lived daemon therefore
 * cannot overwrite a chain written by a one-shot CLI call in between.
 */
export class AuditLog {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
  }

  private async tailRecord(): Promise<{ seq: number; hash: string }> {
    try {
      const text = await readFile(this.file, "utf8");
      const line = lastJsonLine(text);
      if (!line) return { seq: 0, hash: "genesis" };
      const last = JSON.parse(line) as AuditRecord;
      return {
        seq: Number.isInteger(last.seq) ? last.seq : 0,
        hash: typeof last.hash === "string" ? last.hash : "genesis",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { seq: 0, hash: "genesis" };
    }
  }

  async append(input: AuditEntryInput): Promise<AuditRecord> {
    return withFileLock(this.file, async () => {
      const tail = await this.tailRecord();
      const body: AuditBody = {
        seq: tail.seq + 1,
        ts: new Date().toISOString(),
        actor: input.actor,
        tool: input.tool,
        args_digest: input.args_digest,
        result: input.result,
        approval_id: input.approval_id ?? null,
        route: input.route ?? null,
        app: input.app ?? null,
        note: input.note ?? null,
        prev: tail.hash,
      };
      const hash = sha256Hex(`${tail.hash}\n${stableStringify(body)}`);
      const record: AuditRecord = { ...body, hash };
      await appendFile(this.file, `${JSON.stringify(record)}\n`, "utf8");
      return record;
    });
  }

  async tail(limit = 20): Promise<AuditRecord[]> {
    try {
      const text = await readFile(this.file, "utf8");
      const lines = text.split("\n").filter((line) => line.trim().length > 0);
      return lines.slice(-limit).map((line) => JSON.parse(line) as AuditRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

export interface AuditVerification {
  ok: boolean;
  entries: number;
  broken_at?: number;
  reason?: string;
}

/** Recompute the whole chain and report the first record that does not verify. */
export async function verifyAuditLog(file: string): Promise<AuditVerification> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, entries: 0 };
    throw error;
  }
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  let prev = "genesis";
  for (let index = 0; index < lines.length; index += 1) {
    let record: AuditRecord;
    try {
      record = JSON.parse(lines[index] as string) as AuditRecord;
    } catch {
      return { ok: false, entries: lines.length, broken_at: index + 1, reason: "unparseable record" };
    }
    if (record.prev !== prev) {
      return { ok: false, entries: lines.length, broken_at: index + 1, reason: "broken chain link" };
    }
    if (record.seq !== index + 1) {
      return {
        ok: false,
        entries: lines.length,
        broken_at: index + 1,
        reason: `unexpected sequence number ${record.seq}`,
      };
    }
    const { hash: _hash, ...body } = record;
    const expected = sha256Hex(`${prev}\n${stableStringify(body)}`);
    if (expected !== record.hash) {
      return { ok: false, entries: lines.length, broken_at: index + 1, reason: "hash mismatch" };
    }
    prev = record.hash;
  }
  return { ok: true, entries: lines.length };
}

/**
 * Archive a log and start a fresh genesis record. Needed after a chain break
 * (or a machine clock change) because an append-only file cannot be repaired
 * in place without hiding evidence.
 */
export async function rotateAuditLog(
  file: string,
): Promise<{ ok: boolean; entries: number; archived_to?: string }> {
  return withFileLock(file, async () => {
    if (!existsSync(file)) return { ok: true, entries: 0 };
    const entries = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim().length > 0)
      .length;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archived = `${file}.${stamp}.bak`;
    await rename(file, archived);
    return { ok: true, entries, archived_to: archived };
  });
}
