import type { Effect, Scene, SceneElement } from "@appbridge/core";

/**
 * Generic dialog perception. This file contains no app names or per-app rules:
 * it recognizes dialog *shapes* (a file picker, a message box, a save prompt)
 * from roles, labels and geometry, which is what keeps the Floor universal.
 */
export type DialogKind =
  | "file_picker"
  | "save_changes"
  | "message_box"
  | "print"
  | "credential"
  | "unknown";

export type DialogAction = "choose" | "choose_path" | "cancel" | "handoff";

export interface DialogButton {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
}

export interface DialogField {
  id: string;
  name: string;
  role: string;
  value?: string;
}

export interface DialogInfo {
  id: string;
  window_id: string;
  window_title: string;
  title: string;
  role: string;
  class_name?: string;
  kind: DialogKind;
  confidence: number;
  buttons: DialogButton[];
  fields: DialogField[];
  danger: Effect | null;
  suggested_action: DialogAction;
  handoff: boolean;
  reason: string;
}

const BUTTON_ROLES = new Set(["button", "splitbutton"]);
const FIELD_ROLES = new Set(["edit", "combobox"]);

const DESTRUCTIVE_WORDS = [
  "delete",
  "remove",
  "erase",
  "overwrite",
  "replace",
  "discard",
  "reset",
  "uninstall",
  "format",
  "lose",
  "permanently",
  "all data",
  "clear all",
  "drop",
  "truncate",
  "don't save",
  "dont save",
  "nicht speichern",
  "ne pas enregistrer",
  "no guardar",
  "不保存",
];
const EXTERNAL_WORDS = [
  "send",
  "post",
  "publish",
  "pay",
  "purchase",
  "buy",
  "submit",
  "upload",
  "share",
  "transfer",
  "confirm order",
];
const CREDENTIAL_WORDS = [
  "password",
  "credential",
  "user account control",
  "administrator",
  "elevation",
  "sign in",
  "log in",
  "login",
  "security key",
  "unlock",
  "biometric",
  "verification code",
  "one-time code",
  "pin code",
];
const FILE_WORDS = [
  "file name",
  "filename",
  "folder",
  "path",
  "save as",
  "open",
  "select folder",
  "choose file",
  "look in",
];
const SAVE_CHANGES_WORDS = ["save changes", "unsaved changes", "do you want to save"];
const SIMPLE_BUTTONS = new Set([
  "ok",
  "cancel",
  "yes",
  "no",
  "close",
  "retry",
  "abort",
  "ignore",
  "continue",
  "apply",
  "help",
  "save",
  "discard",
  "don't save",
  "dont save",
  "open",
  "print",
  "cancelar",
  "annuler",
  "abbrechen",
  "annulla",
  "speichern",
  "enregistrer",
  "guardar",
  "salva",
  "ja",
  "nein",
  "oui",
  "non",
  "si",
  "sí",
  "确定",
  "取消",
  "保存",
  "是",
  "否",
]);

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  const haystack = normalize(text);
  return words.some((word) => haystack.includes(normalize(word)));
}

function hasButton(buttons: DialogButton[], words: string[]): boolean {
  return buttons.some((button) => words.some((word) => normalize(button.name).includes(normalize(word))));
}

function centerInside(element: SceneElement, root: SceneElement): boolean {
  const x = element.bounds.x + element.bounds.width / 2;
  const y = element.bounds.y + element.bounds.height / 2;
  return (
    x >= root.bounds.x &&
    x <= root.bounds.x + root.bounds.width &&
    y >= root.bounds.y &&
    y <= root.bounds.y + root.bounds.height
  );
}

function parentChain(scene: Scene, element: SceneElement): Set<string> {
  const parents = new Set<string>();
  const byId = new Map(scene.elements.map((candidate) => [candidate.id, candidate]));
  let current = element.parent;
  let guard = 0;
  while (current && guard < 100) {
    parents.add(current);
    current = byId.get(current)?.parent;
    guard += 1;
  }
  return parents;
}

function controlsFor(scene: Scene, dialog: SceneElement): { buttons: DialogButton[]; fields: DialogField[] } {
  const buttons: DialogButton[] = [];
  const fields: DialogField[] = [];
  for (const element of scene.elements) {
    if (element.id === dialog.id) continue;
    const inside =
      parentChain(scene, element).has(dialog.id) ||
      (dialog.bounds.width > 0 && dialog.bounds.height > 0 && centerInside(element, dialog));
    if (!inside) continue;
    const role = element.role.toLowerCase();
    if (BUTTON_ROLES.has(role)) {
      buttons.push({
        id: element.id,
        name: element.name,
        role: element.role,
        enabled: element.state?.enabled !== false,
      });
      continue;
    }
    if (FIELD_ROLES.has(role)) {
      const field: DialogField = { id: element.id, name: element.name, role: element.role };
      if (element.state?.value && !element.state.masked) field.value = element.state.value;
      fields.push(field);
    }
  }
  return { buttons, fields };
}

function classify(
  title: string,
  className: string,
  buttons: DialogButton[],
  fields: DialogField[],
): { kind: DialogKind; confidence: number; reason: string; danger: Effect | null } {
  const haystack = [title, className, ...buttons.map((button) => button.name), ...fields.map((field) => field.name)].join(" ");
  const destructive = hasAny(haystack, DESTRUCTIVE_WORDS);
  const external = hasAny(haystack, EXTERNAL_WORDS);
  const danger: Effect | null = destructive ? "destructive" : external ? "external-effect" : null;

  if (hasAny(haystack, CREDENTIAL_WORDS)) {
    return {
      kind: "credential",
      confidence: 0.95,
      reason: "This dialog asks for credentials or elevation. Appbridge never types these; hand it to the human.",
      danger: "credential",
    };
  }

  if (fields.length > 0 && (hasButton(buttons, ["open", "save", "select", "choose"]) || hasAny(title, FILE_WORDS))) {
    return {
      kind: "file_picker",
      confidence: 0.9,
      reason: "File or folder picker. Provide a full path; a Save action is approval-gated.",
      danger,
    };
  }

  const saveButton = hasButton(buttons, ["save", "speichern", "enregistrer", "guardar", "salva", "保存"]);
  const discardButton = hasButton(buttons, ["don't save", "dont save", "discard", "no", "nicht speichern", "不保存"]);
  if (
    (hasAny(title, SAVE_CHANGES_WORDS) && saveButton) ||
    (saveButton && discardButton && hasButton(buttons, ["cancel", "cancelar", "annuler", "abbrechen", "取消"]))
  ) {
    return {
      kind: "save_changes",
      confidence: 0.9,
      reason: "Unsaved changes. Choose Save, Don't Save or Cancel; discarding is approval-gated.",
      danger: discardButton ? "destructive" : danger,
    };
  }

  if (fields.length === 0 && hasButton(buttons, ["print", "drucken", "imprimer", "stampa", "打印"])) {
    return {
      kind: "print",
      confidence: 0.85,
      reason: "Print dialog. Choose a named button.",
      danger,
    };
  }

  if (fields.length === 0 && buttons.length > 0 && buttons.every((button) => SIMPLE_BUTTONS.has(normalize(button.name)))) {
    return {
      kind: "message_box",
      confidence: 0.8,
      reason: "Message box. Choose a named button; destructive wording is approval-gated.",
      danger,
    };
  }

  return {
    kind: "unknown",
    confidence: 0.4,
    reason: "Unrecognized dialog shape. Inspect it and hand off unless a known handler applies.",
    danger,
  };
}

/** Find dialog-shaped containers and describe their controls. */
export function detectDialogs(scene: Scene): DialogInfo[] {
  const primary = scene.elements.find(
    (element) => element.role === "Window" && normalize(element.name) === normalize(scene.window),
  );
  const candidates = scene.elements.filter((element) => {
    if (element.role.toLowerCase() === "dialog") return true;
    if (element.role.toLowerCase() === "window") {
      if (element.class_name === "#32770") return true;
      if (primary && element.id === primary.id) return false;
      return true;
    }
    return element.class_name === "#32770";
  });

  const dialogs: DialogInfo[] = [];
  for (const dialog of candidates.slice(0, 10)) {
    const { buttons, fields } = controlsFor(scene, dialog);
    const title = dialog.name.trim() || scene.window;
    const result = classify(title, dialog.class_name ?? "", buttons, fields);
    dialogs.push({
      id: dialog.id,
      window_id: scene.window_id ?? "",
      window_title: scene.window,
      title,
      role: dialog.role,
      class_name: dialog.class_name,
      kind: result.kind,
      confidence: result.confidence,
      buttons,
      fields,
      danger: result.danger,
      suggested_action:
        result.kind === "credential" || result.kind === "unknown"
          ? "handoff"
          : result.kind === "file_picker"
            ? "choose_path"
            : "choose",
      handoff: result.kind === "credential" || result.kind === "unknown",
      reason: result.reason,
    });
  }
  return dialogs;
}

/** Case-insensitive button lookup used by the handler. */
export function findDialogButton(dialog: DialogInfo, name: string): DialogButton | undefined {
  const needle = normalize(name);
  return (
    dialog.buttons.find((button) => normalize(button.name) === needle) ??
    dialog.buttons.find((button) => normalize(button.name).includes(needle))
  );
}

/** Pick a cancel-like button without ever guessing a destructive default. */
export function findCancelButton(dialog: DialogInfo): DialogButton | undefined {
  return findDialogButton(dialog, "cancel") ?? findDialogButton(dialog, "close") ?? findDialogButton(dialog, "no");
}
