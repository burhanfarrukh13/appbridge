import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppPackManager, sanitizeText } from "./packs.js";
import { MemoryStore } from "./store.js";
import { SkillStore } from "./skills.js";
import type { Playbook } from "@appbridge/core";

describe("App Packs Exporter & Importer", () => {
  it("sanitizes text by masking secret keys and user home directories", () => {
    const raw = `Bearer token: 1234567890abcdef123456 in C:\\Users\\johndoe\\project`;
    const res = sanitizeText(raw);
    assert.ok(res.clean.includes("[REDACTED_SECRET]"));
    assert.ok(res.clean.includes("[USER_HOME]"));
    assert.ok(res.count >= 2);
  });

  it("exports an app pack and imports it into a new store", async () => {
    const home1 = mkdtempSync(join(tmpdir(), "pack-test1-"));
    const home2 = mkdtempSync(join(tmpdir(), "pack-test2-"));

    const memory1 = new MemoryStore(home1);
    const skills1 = new SkillStore(home1);

    const playbook: Playbook = {
      schema: 1,
      app: { id: "sampleapp", name: "SampleApp", technology: "win32", window_titles: ["Sample Window"] },
      grade: "silver",
      ui_map: { windows: [{ title: "Sample Window", class_name: "Window", controls: [{ role: "button", name: "OK" }] }] },
      risk_map: [{ match: { role: "button", name: "Delete" }, effect: "destructive" }],
      notes: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await memory1.save(playbook);

    await skills1.save({
      schema: 1,
      id: "click-ok",
      app_id: "sampleapp",
      name: "Click OK",
      description: "Clicks the OK button",
      window_titles: ["Sample Window"],
      params: {},
      risk: "write",
      steps: [{ act: "click", target: { role: "button", name: "OK" } }],
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: { runs: 1, successes: 1 },
    });

    const packManager1 = new AppPackManager(home1);
    const exportRes = await packManager1.exportPack({ app_id: "sampleapp" });
    assert.ok(exportRes.pack_dir);
    assert.equal(exportRes.manifest.app_id, "sampleapp");
    assert.equal(exportRes.manifest.skills_count, 1);

    // Import into second home
    const packManager2 = new AppPackManager(home2);
    const importRes = await packManager2.importPack(exportRes.pack_dir);
    assert.equal(importRes.ok, true);
    assert.equal(importRes.skills_imported, 1);

    const importedSkill = await packManager2.skills.get("sampleapp", "click-ok");
    assert.ok(importedSkill);
    assert.equal(importedSkill?.source, "imported");

    rmSync(home1, { recursive: true, force: true });
    rmSync(home2, { recursive: true, force: true });
  });
});
