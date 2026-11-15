import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "@appbridge/core";
import {
  compileSkill,
  prepareSkillParams,
  substituteParams,
  substituteExpectation,
  resolveSkillSelector,
  validateSkill,
  type Skill,
  type CompileInput,
} from "./skills.js";

describe("Skills Compilation & Execution Engine", () => {
  it("compiles recorded events into a valid declarative skill", () => {
    const input: CompileInput = {
      app_id: "test-editor",
      window_title: "Document 1 - TestEditor",
      name: "Save Document",
      description: "Saves current document using menu shortcut",
      params: {
        path: { type: "path", required: true, description: "Target file path" },
      },
      events: [
        {
          ts: new Date().toISOString(),
          tool: "ui.click",
          app_id: "test-editor",
          window_title: "Document 1 - TestEditor",
          target: { role: "menuitem", name: "File" },
        },
        {
          ts: new Date().toISOString(),
          tool: "ui.type",
          app_id: "test-editor",
          window_title: "Document 1 - TestEditor",
          text: "${path}",
          submit: true,
        },
      ],
    };

    const res = compileSkill(input);
    assert.equal(res.errors.length, 0);
    assert.ok(res.skill);
    assert.equal(res.skill.name, "Save Document");
    assert.equal(res.skill.steps.length, 2);
    assert.equal(validateSkill(res.skill).ok, true);
  });

  it("substitutes parameters into strings and expectations", () => {
    const params = { filename: "report.pdf", count: 42 };
    const substituted = substituteParams("Exporting ${filename} with ${count} items", params);
    assert.equal(substituted, "Exporting report.pdf with 42 items");

    const expectation = {
      window_title_contains: "Report - ${filename}",
      element_appears: { name: "Saved ${filename}" },
    };
    const subExpect = substituteExpectation(expectation, params);
    assert.equal(subExpect?.window_title_contains, "Report - report.pdf");
    assert.equal(subExpect?.element_appears?.name, "Saved report.pdf");
  });

  it("validates and parses parameter inputs correctly", () => {
    const skill: Skill = {
      schema: 1,
      id: "test-skill",
      app_id: "test-app",
      name: "Test Skill",
      description: "Test description",
      window_titles: ["Window"],
      params: {
        folder: { type: "path", required: true },
        retries: { type: "number", default: 3 },
        dry_run: { type: "boolean", default: false },
      },
      risk: "read",
      steps: [{ act: "key", combo: "ENTER" }],
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: { runs: 0, successes: 0 },
    };

    const valid = prepareSkillParams(skill, { folder: "C:\\Reports", dry_run: "true" });
    assert.equal(valid.errors.length, 0);
    assert.equal(valid.values["folder"], "C:\\Reports");
    assert.equal(valid.values["retries"], 3);
    assert.equal(valid.values["dry_run"], true);

    const missing = prepareSkillParams(skill, {});
    assert.ok(missing.errors.some((e) => e.includes("missing required parameter \"folder\"")));
  });

  it("resolves skill selectors against a scene with disambiguation", () => {
    const scene: Scene = {
      id: "s1",
      ts: Date.now(),
      app: "Test.exe",
      window: "Test",
      stable: true,
      sources: ["uia"],
      elements: [
        { id: "e1", role: "button", name: "Submit", bounds: { x: 0, y: 0, width: 50, height: 20 }, actions: ["invoke"], src: ["uia"], conf: 0.95 },
        { id: "e2", role: "button", name: "Submit", bounds: { x: 100, y: 0, width: 50, height: 20 }, actions: ["invoke"], src: ["uia"], conf: 0.95 },
      ],
      dialogs: [],
      data: {},
    };

    // Ambiguous without index or automation_id
    const amb = resolveSkillSelector(scene, { role: "button", name: "Submit" });
    assert.ok(amb.error?.includes("ambiguous"));

    // Resolved with index
    const first = resolveSkillSelector(scene, { role: "button", name: "Submit", index: 0 });
    assert.equal(first.element?.id, "e1");

    const second = resolveSkillSelector(scene, { role: "button", name: "Submit", index: 1 });
    assert.equal(second.element?.id, "e2");
  });
});
