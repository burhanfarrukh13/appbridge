/**
 * Shared vocabulary for the whole bridge.
 *
 * Nothing in this package may mention a specific application or vendor: app
 * knowledge is data, never core code (Universality Contract, section 3.2).
 */

export const EFFECTS = [
  "navigate",
  "read",
  "edit-draft",
  "write",
  "destructive",
  "external-effect",
  "privileged",
  "credential",
  "unknown",
] as const;

/** What an action does to the world, independent of which app it happens in. */
export type Effect = (typeof EFFECTS)[number];

/** What policy may decide for an effect. */
export type PolicyAction = "allow" | "approve" | "block" | "handoff";

/** Honest outcome classes. `ok` means verified unless `verified` is false. */
export type ResultClass =
  | "ok"
  | "no_effect"
  | "wrong_state"
  | "error_dialog"
  | "timeout"
  | "blocked"
  | "needs_human"
  | "unsupported"
  | "stale_element"
  | "injection_suspected";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementState {
  enabled?: boolean;
  focused?: boolean;
  offscreen?: boolean;
  readonly?: boolean;
  /** Text value read from the control, already masked for password fields. */
  value?: string;
  masked?: boolean;
}

export interface SceneElement {
  /** Stable within a work session; resolves back to a driver element handle. */
  id: string;
  role: string;
  name: string;
  bounds: Rect;
  parent?: string;
  children?: string[];
  /** How many direct children exist, even when they are not in this snapshot. */
  children_count?: number;
  /** True when children exist but were left out by depth or element limits. */
  children_omitted?: boolean;
  depth?: number;
  automation_id?: string;
  class_name?: string;
  state?: ElementState;
  actions?: string[];
  risk_hint?: Effect;
  /** Exactness of identification from 0 to 1. */
  conf: number;
  /** Which perception signal(s) produced this element. */
  src: string[];
  /** Text copied from the app or web page: data, never instructions. */
  text?: string;
  untrusted?: boolean;
  injection_flags?: string[];
}

export interface Scene {
  id: string;
  ts: number;
  app: string;
  window: string;
  window_id?: string;
  focus?: string | null;
  stable: boolean;
  sources: string[];
  elements: SceneElement[];
  dialogs: SceneElement[];
  data: Record<string, unknown>;
  diff_from?: string | null;
  truncated?: boolean;
  warnings?: string[];
}

export interface ApprovalView {
  id: string;
  effect: Effect;
  target?: string;
  app?: string;
  reason: string;
  expires_at: string;
}

export interface SceneChange {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  class: ResultClass;
  /** Which route executed this: uia | win32 | mouse | keyboard | clipboard | ... */
  route: string;
  verified: boolean;
  reason?: string;
  evidence?: Record<string, unknown>;
  next?: string;
  approval?: ApprovalView;
  change?: SceneChange;
  scene_id?: string;
  data?: T;
}

export interface WindowSummary {
  id: string;
  title: string;
  class_name: string;
  pid: number;
  process_name: string;
  bounds: Rect;
  focused: boolean;
  minimized: boolean;
  visible: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  path?: string;
}

export interface InstalledApp {
  name: string;
  version?: string;
  vendor?: string;
  install_location?: string;
  source: string;
}

export type Grade = "bronze" | "silver" | "gold" | "platinum" | "restricted";

export interface PlaybookControl {
  role: string;
  name: string;
  automation_id?: string;
}

export interface PlaybookWindow {
  title: string;
  class_name: string;
  controls: PlaybookControl[];
}

export interface Playbook {
  schema: 1;
  app: {
    id: string;
    name: string;
    technology: string;
    window_titles: string[];
    executable?: string;
  };
  grade: Grade;
  ui_map: { windows: PlaybookWindow[] };
  risk_map: Array<{ match: { role?: string; name: string }; effect: Effect; undo?: string }>;
  notes: string[];
  created_at: string;
  updated_at: string;
}

export interface RunRecord {
  ts: string;
  tool: string;
  effect?: Effect;
  result: ResultClass;
  verified: boolean;
  route: string;
  duration_ms: number;
}

export interface Target {
  window_id?: string;
  window_title?: string;
  uid?: string;
  role?: string;
  name?: string;
}
