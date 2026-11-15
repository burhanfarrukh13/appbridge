import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  appbridgeHome,
  ensureHome,
  memoryDirFor,
  slugify,
  type Playbook,
  type RunRecord,
  type Scene,
} from "@appbridge/core";
import { fingerprintTechnology } from "./fingerprint.js";

export interface PlaybookSummary {
  id: string;
  name: string;
  technology: string;
  grade: string;
  control_count: number;
  window_titles: string[];
  updated_at: string;
}

const RISK_EFFECTS = new Set(["destructive", "external-effect", "write", "credential"]);

/** Build a first Playbook from what perception already knows. Read-only. */
export function playbookFromScene(scene: Scene, notes: string[] = []): Playbook {
  const appId = slugify(scene.app || scene.window);
  const now = new Date().toISOString();
  const className = typeof scene.data["class_name"] === "string" ? (scene.data["class_name"] as string) : "";
  const controls = scene.elements
    .filter((element) => element.name.trim().length > 0 && (element.actions?.length ?? 0) > 0)
    .slice(0, 150)
    .map((element) => ({
      role: element.role,
      name: element.name,
      automation_id: element.automation_id,
    }));

  const seenRisks = new Set<string>();
  const riskMap: Playbook["risk_map"] = [];
  for (const element of scene.elements) {
    if (!element.risk_hint || !RISK_EFFECTS.has(element.risk_hint)) continue;
    const key = `${element.role}|${element.name}`;
    if (seenRisks.has(key)) continue;
    seenRisks.add(key);
    riskMap.push({ match: { role: element.role, name: element.name }, effect: element.risk_hint });
    if (riskMap.length >= 100) break;
  }

  return {
    schema: 1,
    app: {
      id: appId,
      name: scene.app || scene.window,
      technology: fingerprintTechnology({ className, processName: scene.app }),
      window_titles: scene.window ? [scene.window] : [],
    },
    grade: "bronze",
    ui_map: {
      windows: [{ title: scene.window, class_name: className, controls }],
    },
    risk_map: riskMap,
    notes: [
      "Playbook v0: read-only UI map captured by perception. No Skills compiled yet.",
      ...notes,
    ],
    created_at: now,
    updated_at: now,
  };
}

/** Local App Memory: per-app Playbook plus run history (plan section 9). */
export class MemoryStore {
  readonly home: string;

  constructor(home: string = appbridgeHome()) {
    this.home = ensureHome(home).home;
  }

  private dir(appId: string): string {
    return memoryDirFor(appId, this.home);
  }

  async listApps(): Promise<PlaybookSummary[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(join(this.home, "memory"));
    } catch {
      return [];
    }
    const summaries: PlaybookSummary[] = [];
    for (const entry of entries) {
      const playbook = await this.get(entry);
      if (!playbook) continue;
      summaries.push({
        id: playbook.app.id,
        name: playbook.app.name,
        technology: playbook.app.technology,
        grade: playbook.grade,
        control_count: playbook.ui_map.windows.reduce((sum, window) => sum + window.controls.length, 0),
        window_titles: playbook.app.window_titles,
        updated_at: playbook.updated_at,
      });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(appId: string): Promise<Playbook | null> {
    const file = join(this.dir(appId), "playbook.json");
    if (!existsSync(file)) return null;
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as Playbook;
      if (!parsed || parsed.schema !== 1 || !parsed.app?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async find(query: string): Promise<Playbook | null> {
    const direct = await this.get(slugify(query));
    if (direct) return direct;
    const needle = query.trim().toLowerCase();
    for (const summary of await this.listApps()) {
      if (summary.name.toLowerCase().includes(needle) || summary.id.includes(slugify(query))) {
        return this.get(summary.id);
      }
    }
    return null;
  }

  async save(playbook: Playbook): Promise<void> {
    const dir = this.dir(playbook.app.id);
    await mkdir(dir, { recursive: true });
    playbook.updated_at = new Date().toISOString();
    await writeFile(join(dir, "playbook.json"), `${JSON.stringify(playbook, null, 2)}\n`, "utf8");
  }

  async recordRun(appId: string, run: RunRecord): Promise<void> {
    const dir = this.dir(appId);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "history.jsonl"), `${JSON.stringify(run)}\n`, "utf8");
  }

  async recordRunForQuery(query: string, run: RunRecord): Promise<void> {
    const playbook = await this.find(query);
    if (playbook) await this.recordRun(playbook.app.id, run);
  }
}
