import { createHash, randomUUID } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function randomId(): string {
  return randomUUID();
}

/** JSON with sorted keys, for hashing and comparisons. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${parts.join(",")}}`;
}

/** Short, human-readable id for scene elements and logs. */
export function shortHash(input: string, length = 10): string {
  return sha256Hex(input).slice(0, length);
}

export function slugify(input: string, fallback = "app"): string {
  const slug = input
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

export function truncate(input: string, max = 400): string {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}

/** Digest of an argument object, stored instead of raw arguments in the audit log. */
export function argsDigest(args: unknown): string {
  return shortHash(stableStringify(args ?? {}), 16);
}
