import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appbridgeHome,
  ensureHome,
  memoryDirFor,
  slugify,
  type Effect,
  type Scene,
  type SceneElement,
} from "@appbridge/core";

/**
 * Declarative Skills: data, not code. A Skill is compiled from a recorded
 * trajectory or written by hand, then executed with fresh perception and the
 * same Action Firewall as every other action.
 */
export interface SkillExpectation {
  window_title_contains?: string;
  element_appears?: { role?: string; name: string };
  element_disappears?: { role?: string; name: string };
  value_equals?: { id: string; value: string };
  file_exists?: string;
}

export interface SkillSelector {
  role?: string;
  name?: string;
  automation_id?: string;
  /** Zero-based choice when the same role+name appears more than once. */
  index?: number;
}

export type SkillParamType = "string" | "number" | "boolean" | "path";

export interface SkillParamSpec {
  type: SkillParamType;
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export type SkillParamValue = string | number | boolean;

interface StepBase {
  note?: string;
  expect?: SkillExpectation;
  timeout_ms?: number;
}

export type SkillStep =
  | (StepBase & { act: "click"; target: SkillSelector; button?: "left" | "right" | "middle"; count?: number })
  | (StepBase & { act: "type"; target?: SkillSelector; text: string; submit?: boolean })
  | (StepBase & { act: "key"; combo: string })
  | (StepBase & { act: "set_value"; target: SkillSelector; value: string })
  | (StepBase & { act: "scroll"; target?: SkillSelector; direction: "up" | "down" | "left" | "right"; amount?: number })
  | (StepBase & {
      act: "wait_for";
      role?: string;
      name?: string;
      window_title_contains?: string;
    })
  | (StepBase & { act: "expect"; expect: SkillExpectation })
  | (StepBase & { act: "focus_window"; title?: string })
  | (StepBase & {
      act: "dialog";
      action: "choose" | "choose_path" | "cancel";
      button?: string;
      path?: string;
      dialog_id?: string;
    });

export interface SkillStats {
  runs: number;
  successes: number;
  last_run_at?: string;
  last_result?: "ok" | "failed";
}

export interface Skill {
  schema: 1;
  id: string;
  app_id: string;
  name: string;
  description: string;
  window_titles: string[];
  params: Record<string, SkillParamSpec>;
  /** Informational only: the Action Firewall re-classifies every executed action. */
  risk: Effect;
  steps: SkillStep[];
  source: "manual" | "recorded" | "imported";
  created_at: string;
  updated_at: string;
  verified_at?: string;
  stats: SkillStats;
}

export interface SkillSummary {
  id: string;
  app_id: string;
  name: string;
  description: string;
  steps: number;
  source: string;
  runs: number;
  successes: number;
  updated_at: string;
}

export interface RecordedEvent {
  ts: string;
  tool: string;
  app_id: string;
  window_title: string;
  window_class?: string;
  target?: SkillSelector;
  text?: string;
  value?: string;
  combo?: string;
  button?: "left" | "right" | "middle";
  count?: number;
  submit?: boolean;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  expect?: SkillExpectation;
}

export interface CompileInput {
  app_id: string;
  app_name?: string;
  window_title: string;
  name: string;
  description?: string;
  params?: Record<string, SkillParamSpec>;
  events: RecordedEvent[];
}

export interface CompiledSkillResult {
  skill?: Skill;
  skipped: string[];
  errors: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function selectorHasIdentity(selector: SkillSelector): boolean {
  return Boolean(selector.automation_id || selector.role || selector.name);
}

/** A stable selector for a scene element; never stores a per-run uid. */
export function selectorForElement(scene: Scene, element: SceneElement): SkillSelector | null {
  if (!element.name.trim() && !element.automation_id) return null;
  const selector: SkillSelector = { role: element.role, name: element.name };
  if (element.automation_id) selector.automation_id = element.automation_id;
  const siblings = scene.elements.filter(
    (candidate) => candidate.role === element.role && candidate.name === element.name,
  );
  if (siblings.length > 1) selector.index = siblings.findIndex((candidate) => candidate.id === element.id);
  return selector;
}

export function resolveSkillSelector(
  scene: Scene,
  selector: SkillSelector,
): { element?: SceneElement; error?: string; candidates?: SceneElement[] } {
  if (!selectorHasIdentity(selector)) {
    return { error: "selector needs a name, role or automation_id" };
  }
  const role = selector.role?.trim().toLowerCase();
  const name = selector.name?.trim().toLowerCase();
  let matches = scene.elements.filter((element) => {
    if (selector.automation_id && element.automation_id !== selector.automation_id) return false;
    if (role && element.role.trim().toLowerCase() !== role) return false;
    if (name && element.name.trim().toLowerCase() !== name) return false;
    return true;
  });
  if (matches.length === 0 && name && !selector.automation_id) {
    // Fallback: substring match if exact match fails
    matches = scene.elements.filter((element) => {
      if (role && element.role.trim().toLowerCase() !== role) return false;
      const elName = element.name.trim().toLowerCase();
      return elName.includes(name) || name.includes(elName);
    });
  }
  if (matches.length === 0) {
    return { error: `no element matches ${JSON.stringify(selector)}`, candidates: [] };
  }
  if (selector.index !== undefined) {
    if (!Number.isInteger(selector.index) || selector.index < 0 || selector.index >= matches.length) {
      return { error: `selector index ${selector.index} is out of range (${matches.length} matches)` };
    }
    return { element: matches[selector.index] };
  }
  if (matches.length > 1 && !selector.automation_id) {
    return {
      error: `selector is ambiguous (${matches.length} matches: ${matches
        .slice(0, 5)
        .map((element) => `${element.id} ${element.role}:${element.name}`)
        .join(", ")}); add automation_id or index`,
      candidates: matches,
    };
  }
  return { element: matches[0] };
}

export function prepareSkillParams(
  skill: Skill,
  input: unknown,
): { values: Record<string, SkillParamValue>; errors: string[] } {
  const errors: string[] = [];
  const values: Record<string, SkillParamValue> = {};
  if (input !== undefined && !isRecord(input)) {
    return { values, errors: ["params must be a JSON object"] };
  }
  const provided = isRecord(input) ? input : {};
  for (const key of Object.keys(provided)) {
    if (!(key in skill.params)) errors.push(`unknown parameter ${JSON.stringify(key)}`);
  }
  for (const [name, spec] of Object.entries(skill.params)) {
    let raw: unknown = provided[name];
    if (raw === undefined) raw = spec.default;
    if (raw === undefined || raw === null || raw === "") {
      if (spec.required !== false) errors.push(`missing required parameter ${JSON.stringify(name)}`);
      continue;
    }
    if (spec.type === "number") {
      const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(value)) {
        errors.push(`parameter ${JSON.stringify(name)} must be a number`);
        continue;
      }
      values[name] = value;
      continue;
    }
    if (spec.type === "boolean") {
      if (typeof raw === "boolean") values[name] = raw;
      else if (raw === "true") values[name] = true;
      else if (raw === "false") values[name] = false;
      else errors.push(`parameter ${JSON.stringify(name)} must be true or false`);
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`parameter ${JSON.stringify(name)} must be a string`);
      continue;
    }
    if (spec.type === "path" && (raw.length === 0 || /[\r\n\0]/.test(raw))) {
      errors.push(`parameter ${JSON.stringify(name)} is not a usable path`);
      continue;
    }
    if (raw.length > 20000) {
      errors.push(`parameter ${JSON.stringify(name)} is too long`);
      continue;
    }
    values[name] = raw;
  }
  return { values, errors };
}

/** Replace ${name} placeholders; unresolved placeholders are an error, not a silent blank. */
export function substituteParams(template: string, values: Record<string, SkillParamValue>): string {
  return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`unresolved parameter placeholder \${${key}}`);
    return String(values[key]);
  });
}

export function substituteExpectation(
  expectation: SkillExpectation | undefined,
  values: Record<string, SkillParamValue>,
): SkillExpectation | undefined {
  if (!expectation) return undefined;
  const copy = JSON.parse(JSON.stringify(expectation)) as Record<string, unknown>;
  const replace = (value: unknown): unknown =>
    typeof value === "string" ? substituteParams(value, values) : value;
  if (isRecord(copy["element_appears"])) {
    copy["element_appears"] = {
      ...copy["element_appears"],
      name: replace((copy["element_appears"] as Record<string, unknown>)["name"]),
    };
  }
  if (isRecord(copy["element_disappears"])) {
    copy["element_disappears"] = {
      ...copy["element_disappears"],
      name: replace((copy["element_disappears"] as Record<string, unknown>)["name"]),
    };
  }
  if (isRecord(copy["value_equals"])) {
    copy["value_equals"] = {
      ...copy["value_equals"],
      value: replace((copy["value_equals"] as Record<string, unknown>)["value"]),
    };
  }
  for (const key of ["window_title_contains", "file_exists"]) {
    if (typeof copy[key] === "string") copy[key] = replace(copy[key]);
  }
  return copy as SkillExpectation;
}

export function compileSkill(input: CompileInput): CompiledSkillResult {
  const errors: string[] = [];
  const skipped: string[] = [];
  const name = input.name?.trim();
  if (!name) errors.push("skill name is required");
  if (!input.app_id?.trim()) errors.push("app_id is required");
  if (!input.window_title?.trim()) errors.push("window_title is required");

  const steps: SkillStep[] = [];
  for (const event of input.events) {
    const base: StepBase = {};
    if (event.expect) base.expect = event.expect;
    switch (event.tool) {
      case "ui.click": {
        if (!event.target) {
          skipped.push("click without a target element");
          break;
        }
        if (event.window_class === "#32770" && event.window_title !== input.window_title) {
          steps.push({
            act: "dialog",
            action: "choose",
            button: event.target.name,
            note: `recorded in dialog ${JSON.stringify(event.window_title)}`,
          });
          break;
        }
        steps.push({
          act: "click",
          target: event.target,
          ...(event.button ? { button: event.button } : {}),
          ...(event.count ? { count: event.count } : {}),
          ...base,
        });
        break;
      }
      case "ui.type": {
        if (!event.text) {
          skipped.push("type without text");
          break;
        }
        steps.push({
          act: "type",
          ...(event.target ? { target: event.target } : {}),
          text: event.text,
          ...(event.submit ? { submit: true } : {}),
          ...base,
        });
        break;
      }
      case "ui.key": {
        if (!event.combo) {
          skipped.push("key without a combo");
          break;
        }
        steps.push({ act: "key", combo: event.combo, ...base });
        break;
      }
      case "ui.set_value": {
        if (!event.target || event.value === undefined) {
          skipped.push("set_value without a target or value");
          break;
        }
        steps.push({ act: "set_value", target: event.target, value: event.value, ...base });
        break;
      }
      case "ui.scroll": {
        if (!event.direction) {
          skipped.push("scroll without a direction");
          break;
        }
        steps.push({
          act: "scroll",
          ...(event.target ? { target: event.target } : {}),
          direction: event.direction,
          ...(event.amount ? { amount: event.amount } : {}),
          ...base,
        });
        break;
      }
      case "window.focus": {
        if (!event.window_title) {
          skipped.push("focus without a window title");
          break;
        }
        steps.push({ act: "focus_window", title: event.window_title });
        break;
      }
      default:
        skipped.push(`unsupported recorded tool ${JSON.stringify(event.tool)}`);
    }
  }

  if (steps.length === 0) errors.push("no executable steps were recorded");
  if (errors.length > 0) return { skipped, errors };

  const timestamp = nowIso();
  const skill: Skill = {
    schema: 1,
    id: slugify(name),
    app_id: slugify(input.app_id),
    name,
    description: input.description?.trim() || `Recorded in ${input.window_title}`,
    window_titles: [input.window_title],
    params: input.params ?? {},
    risk: "unknown",
    steps,
    source: "recorded",
    created_at: timestamp,
    updated_at: timestamp,
    stats: { runs: 0, successes: 0 },
  };
  const validation = validateSkill(skill);
  if (!validation.ok) return { skipped, errors: validation.errors };
  return { skill, skipped, errors };
}

export function validateSkill(skill: Skill): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (skill.schema !== 1) errors.push("skill schema must be 1");
  if (!skill.id?.trim()) errors.push("skill id is required");
  if (!skill.app_id?.trim()) errors.push("skill app_id is required");
  if (!skill.name?.trim()) errors.push("skill name is required");
  if (!Array.isArray(skill.steps) || skill.steps.length === 0) errors.push("skill needs at least one step");
  if (!isRecord(skill.params)) errors.push("skill params must be an object");
  if (skill.steps.length > 200) errors.push("skill has more than 200 steps");
  for (const [index, step] of skill.steps.entries()) {
    const label = `step ${index + 1}`;
    if (!step || typeof step !== "object" || typeof step.act !== "string") {
      errors.push(`${label} is not an action`);
      continue;
    }
    if ("target" in step && step.target && !selectorHasIdentity(step.target)) {
      errors.push(`${label} target has no name, role or automation_id`);
    }
    if (step.act === "type" && (!step.text || typeof step.text !== "string")) {
      errors.push(`${label} type step needs text`);
    }
    if (step.act === "key" && (!step.combo || typeof step.combo !== "string")) {
      errors.push(`${label} key step needs a combo`);
    }
    if (step.act === "set_value" && typeof step.value !== "string") {
      errors.push(`${label} set_value step needs a value`);
    }
    if (step.act === "dialog" && !["choose", "choose_path", "cancel"].includes(step.action)) {
      errors.push(`${label} has an unknown dialog action`);
    }
    if (step.act === "dialog" && step.action === "choose" && !step.button) {
      errors.push(`${label} dialog choose needs a button name`);
    }
    if (step.act === "dialog" && step.action === "choose_path" && !step.path) {
      errors.push(`${label} dialog choose_path needs a path`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Parsed from a local JSON file; returns null for unrelated or malformed data. */
export function parseSkill(raw: unknown): Skill | null {
  if (!isRecord(raw) || raw["schema"] !== 1 || !Array.isArray(raw["steps"])) return null;
  const skill = raw as unknown as Skill;
  return validateSkill(skill).ok ? skill : null;
}

export class SkillStore {
  readonly home: string;

  constructor(home: string = appbridgeHome()) {
    this.home = ensureHome(home).home;
  }

  private dir(appId: string): string {
    return join(memoryDirFor(slugify(appId), this.home), "skills");
  }

  async list(appId: string): Promise<SkillSummary[]> {
    const dir = this.dir(appId);
    if (!existsSync(dir)) return [];
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const summaries: SkillSummary[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const skill = await this.get(appId, entry.slice(0, -5));
      if (!skill) continue;
      summaries.push({
        id: skill.id,
        app_id: skill.app_id,
        name: skill.name,
        description: skill.description,
        steps: skill.steps.length,
        source: skill.source,
        runs: skill.stats?.runs ?? 0,
        successes: skill.stats?.successes ?? 0,
        updated_at: skill.updated_at,
      });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(appId: string, skillId: string): Promise<Skill | null> {
    const file = join(this.dir(appId), `${slugify(skillId)}.json`);
    if (!existsSync(file)) return null;
    try {
      return parseSkill(JSON.parse(await readFile(file, "utf8")));
    } catch {
      return null;
    }
  }

  async find(appId: string, query: string): Promise<Skill | null> {
    const direct = await this.get(appId, query);
    if (direct) return direct;
    const needle = query.trim().toLowerCase();
    for (const summary of await this.list(appId)) {
      if (summary.name.toLowerCase() === needle || summary.name.toLowerCase().includes(needle)) {
        return this.get(appId, summary.id);
      }
    }
    return null;
  }

  async exists(appId: string, skillId: string): Promise<boolean> {
    return existsSync(join(this.dir(appId), `${slugify(skillId)}.json`));
  }

  async save(skill: Skill): Promise<void> {
    const validation = validateSkill(skill);
    if (!validation.ok) throw new Error(`invalid skill: ${validation.errors.join("; ")}`);
    skill.updated_at = nowIso();
    const dir = this.dir(skill.app_id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${skill.id}.json`), `${JSON.stringify(skill, null, 2)}\n`, "utf8");
  }

  async recordRun(appId: string, skillId: string, ok: boolean): Promise<void> {
    const skill = await this.get(appId, skillId);
    if (!skill) return;
    skill.stats = skill.stats ?? { runs: 0, successes: 0 };
    skill.stats.runs += 1;
    if (ok) skill.stats.successes += 1;
    skill.stats.last_run_at = nowIso();
    skill.stats.last_result = ok ? "ok" : "failed";
    await this.save(skill);
  }
}
