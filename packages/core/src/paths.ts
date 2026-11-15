import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Root of the local App Memory folder (Appendix D of the plan). */
export function appbridgeHome(): string {
  const env = process.env.APPBRIDGE_HOME;
  if (env && env.trim().length > 0) return resolve(env.trim());
  return join(homedir(), ".appbridge");
}

export interface HomePaths {
  home: string;
  config: string;
  audit: string;
  token: string;
  halt: string;
  approvals: string;
  device: string;
  memory: string;
  packs: string;
  logs: string;
  shadow: string;
  models: string;
}

/** Create the local folder layout if missing, and return every well-known path. */
export function ensureHome(home: string = appbridgeHome()): HomePaths {
  const paths: HomePaths = {
    home,
    config: join(home, "config.toml"),
    audit: join(home, "audit.jsonl"),
    token: join(home, "gateway-token"),
    halt: join(home, "HALT"),
    approvals: join(home, "approvals.json"),
    device: join(home, "device.json"),
    memory: join(home, "memory"),
    packs: join(home, "packs"),
    logs: join(home, "logs"),
    shadow: join(home, "shadow"),
    models: join(home, "models"),
  };
  for (const dir of [paths.home, paths.memory, paths.packs, paths.logs, paths.shadow, paths.models]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export function memoryDirFor(appId: string, home: string = appbridgeHome()): string {
  return join(home, "memory", appId);
}
