import type { ActionResult, ResultClass, SceneChange } from "./types.js";

export function okResult<T>(
  data: T,
  extra: Partial<Omit<ActionResult<T>, "ok" | "class" | "data">> = {},
): ActionResult<T> {
  return {
    ok: true,
    class: "ok",
    route: extra.route ?? "core",
    verified: extra.verified ?? false,
    ...extra,
    data,
  };
}

export function failResult(
  resultClass: ResultClass,
  reason: string,
  extra: Partial<Omit<ActionResult, "ok" | "class" | "reason">> = {},
): ActionResult {
  return {
    ok: false,
    class: resultClass,
    route: extra.route ?? "core",
    verified: false,
    reason,
    ...extra,
  };
}

export function changeSummary(change: SceneChange | undefined): string {
  if (!change) return "no scene comparison";
  const parts: string[] = [];
  if (change.added.length) parts.push(`added: ${change.added.slice(0, 6).join(", ")}`);
  if (change.removed.length) parts.push(`removed: ${change.removed.slice(0, 6).join(", ")}`);
  if (change.changed.length) parts.push(`changed: ${change.changed.slice(0, 6).join(", ")}`);
  return parts.length ? parts.join("; ") : "no visible change";
}
