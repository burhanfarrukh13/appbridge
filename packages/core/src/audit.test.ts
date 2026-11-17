import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuditLog, verifyAuditLog } from "./audit.js";
import {
  normalizeConfig,
  DEFAULT_CONFIG,
  defaultConfigToml,
  persistPolicySetting,
} from "./config.js";
import { parse } from "smol-toml";
import { argsDigest, slugify, stableStringify } from "./ids.js";

test("audit chain verifies and detects tampering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "appbridge-audit-"));
  const file = join(dir, "audit.jsonl");
  const log = new AuditLog(file);
  await log.append({ actor: "test", tool: "ui.click", args_digest: argsDigest({ x: 1 }), result: "ok" });
  await log.append({ actor: "test", tool: "ui.type", args_digest: argsDigest({ text: "hi" }), result: "no_effect" });

  const good = await verifyAuditLog(file);
  assert.equal(good.ok, true);
  assert.equal(good.entries, 2);

  const text = await readFile(file, "utf8");
  const lines = text.trim().split("\n");
  const tampered = JSON.parse(lines[1] as string) as Record<string, unknown>;
  tampered["result"] = "ok";
  await writeFile(file, `${lines[0]}\n${JSON.stringify(tampered)}\n`, "utf8");

  const bad = await verifyAuditLog(file);
  assert.equal(bad.ok, false);
  assert.equal(bad.broken_at, 2);
});

test("config normalizes defaults and rejects bad policy values", () => {
  const config = normalizeConfig({ policy: { write: "allow" } });
  assert.equal(config.policy.write, "allow");
  assert.equal(normalizeConfig({}).policy.write, "allow");
  assert.equal(config.policy.destructive, DEFAULT_CONFIG.policy.destructive);
  assert.equal(DEFAULT_CONFIG.policy["external-effect"], "approve");
  assert.equal(DEFAULT_CONFIG.policy.unknown, "approve");
  assert.equal(DEFAULT_CONFIG.policy.credential, "handoff");
  assert.equal(config.scene.max_elements, DEFAULT_CONFIG.scene.max_elements);
  assert.equal(config.scene.ocr, "auto");
  assert.ok(config.filesystem.roots.length > 0);
  assert.equal(config.terminal.timeout_ms, DEFAULT_CONFIG.terminal.timeout_ms);
  assert.equal(normalizeConfig(parse(defaultConfigToml())).filesystem.roots[0], process.cwd());
  assert.equal(normalizeConfig({ scene: { ocr: "on" } }).scene.ocr, "on");
  assert.throws(() => normalizeConfig({ filesystem: { roots: [""] } }), /filesystem\.roots/);
  assert.throws(() => normalizeConfig({ policy: { write: "yolo" } }), /invalid config/);
  assert.throws(() => normalizeConfig({ scene: { max_elements: 1 } }), /invalid config/);
  assert.throws(() => normalizeConfig({ scene: { ocr: "sometimes" } }), /invalid config/);
});

test("tools.deny accepts tool and group names and rejects typos", () => {
  assert.deepEqual(normalizeConfig({}).tools.deny, []);
  assert.deepEqual(
    normalizeConfig({ tools: { deny: ["terminal.run", " Terminal ", "app.launch", "terminal.run"] } })
      .tools.deny,
    ["terminal.run", "terminal", "app.launch"],
  );
  assert.throws(() => normalizeConfig({ tools: { deny: "terminal" } }), /tools\.deny/);
  assert.throws(() => normalizeConfig({ tools: { deny: ["terminal run"] } }), /tools\.deny\[0\]/);
  assert.throws(() => normalizeConfig({ tools: { deny: ["terminal.run/../x"] } }), /tools\.deny\[0\]/);
  assert.throws(() => normalizeConfig({ tools: { deny: ["*"] } }), /tools\.deny\[0\]/);
  assert.throws(() => normalizeConfig({ tools: { deny: ["terminal..run"] } }), /tools\.deny\[0\]/);
});

test("policy setting persistence uses TOML keys and preserves other config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "appbridge-config-"));
  const file = join(dir, "config.toml");
  await writeFile(file, defaultConfigToml(), "utf8");

  persistPolicySetting(file, "external-effect", "approve");
  persistPolicySetting(file, "edit-draft", "block");

  const parsed = parse(await readFile(file, "utf8")) as {
    policy: Record<string, string>;
    filesystem: { roots: string[] };
  };
  assert.equal(parsed.policy["external-effect"], "approve");
  assert.equal(parsed.policy["edit-draft"], "block");
  assert.equal(parsed.filesystem.roots[0], process.cwd());
});

test("stable stringify is order independent and slugify keeps unicode", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
  assert.equal(slugify("Sticky Notes"), "sticky-notes");
  assert.equal(slugify("Ünïcode App 2"), "unicode-app-2");
});
