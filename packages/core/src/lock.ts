import { mkdir, open, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export interface FileLockOptions {
  /** Give up after this long and report the contention. */
  timeoutMs?: number;
  /** A lock older than this is assumed to belong to a crashed process. */
  staleMs?: number;
  retryMs?: number;
}

/**
 * Serialize a read-modify-write cycle on one file across processes.
 *
 * The lock is a sibling `<file>.lock` created with O_EXCL, so it works on
 * Windows and POSIX without native modules. A crashed holder is recovered by
 * the stale timeout rather than leaving the store permanently unusable.
 */
export async function withFileLock<T>(
  target: string,
  action: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const staleMs = options.staleMs ?? 15_000;
  const retryMs = options.retryMs ?? 25;
  const lock = `${target}.lock`;
  await mkdir(dirname(target), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const info = await stat(lock);
        if (Date.now() - info.mtimeMs > staleMs) {
          await unlink(lock).catch(() => undefined);
          continue;
        }
      } catch {
        // The holder released between attempts; retry immediately.
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`file is busy; another process holds ${lock}`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  try {
    return await action();
  } finally {
    await unlink(lock).catch(() => undefined);
  }
}

/** Read the last non-empty JSON line of a JSONL file, if any. */
export function lastJsonLine(text: string): string | undefined {
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.trim().length > 0) return line;
  }
  return undefined;
}
