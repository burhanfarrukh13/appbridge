import { access } from "node:fs/promises";
import type { Scene, SceneElement } from "@appbridge/core";

export interface ElementQuery {
  role?: string;
  name: string;
}

export interface Expectation {
  window_title_contains?: string;
  element_appears?: ElementQuery;
  element_disappears?: ElementQuery;
  value_equals?: { id: string; value: string };
  file_exists?: string;
}

export interface WaitOutcome {
  met: boolean;
  attempts: number;
  elapsed_ms: number;
  detail: string;
}

function matches(element: SceneElement, query: ElementQuery): boolean {
  if (query.role && element.role.toLowerCase() !== query.role.toLowerCase()) return false;
  const name = query.name.trim().toLowerCase();
  if (!name) return false;
  return element.name.trim().toLowerCase() === name;
}

export function checkExpectation(
  scene: Scene | undefined,
  expectation: Expectation | undefined,
): { met: boolean; detail: string } {
  if (!expectation) return { met: true, detail: "no expectation supplied" };
  if (!scene) return { met: false, detail: "no scene available" };

  if (expectation.window_title_contains) {
    const needle = expectation.window_title_contains.toLowerCase();
    if (!scene.window.toLowerCase().includes(needle)) {
      return { met: false, detail: `window title does not contain ${JSON.stringify(needle)}` };
    }
  }
  if (expectation.element_appears) {
    const found = scene.elements.some((element) => matches(element, expectation.element_appears as ElementQuery));
    if (!found) {
      return { met: false, detail: `element ${JSON.stringify(expectation.element_appears.name)} not present` };
    }
  }
  if (expectation.element_disappears) {
    const found = scene.elements.some((element) => matches(element, expectation.element_disappears as ElementQuery));
    if (found) {
      return { met: false, detail: `element ${JSON.stringify(expectation.element_disappears.name)} is still present` };
    }
  }
  if (expectation.value_equals) {
    const element = scene.elements.find((candidate) => candidate.id === expectation.value_equals?.id);
    if (!element) return { met: false, detail: `element ${expectation.value_equals.id} not in scene` };
    if ((element.state?.value ?? "") !== expectation.value_equals.value) {
      return { met: false, detail: `value is ${JSON.stringify(element.state?.value ?? "")}` };
    }
  }
  if (expectation.file_exists) {
    return { met: false, detail: "file expectation requires the filesystem check" };
  }
  return { met: true, detail: "expectation met" };
}

export async function checkFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Wait until a condition holds; never a fixed sleep pretending to be a check. */
export async function waitUntil(
  condition: () => Promise<{ met: boolean; detail: string }>,
  options: { timeoutMs: number; intervalMs: number; signal?: AbortSignal },
): Promise<WaitOutcome> {
  const started = Date.now();
  let attempts = 0;
  let detail = "condition not evaluated";
  while (Date.now() - started <= options.timeoutMs) {
    if (options.signal?.aborted) {
      return { met: false, attempts, elapsed_ms: Date.now() - started, detail: "aborted" };
    }
    attempts += 1;
    const result = await condition();
    detail = result.detail;
    if (result.met) {
      return { met: true, attempts, elapsed_ms: Date.now() - started, detail };
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
  return { met: false, attempts, elapsed_ms: Date.now() - started, detail };
}
