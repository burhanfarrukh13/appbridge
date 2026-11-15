import type { Rect, WindowSummary } from "@appbridge/core";

export interface DriverElement {
  uid: string;
  parent: string | null;
  depth: number;
  role: string;
  name: string;
  automationId: string;
  className: string;
  bounds: Rect;
  enabled: boolean;
  focused: boolean;
  offscreen: boolean;
  patterns: string[];
  value: string | null;
  masked: boolean;
  password: boolean;
  /** Direct children visible in this walk. */
  childCount?: number;
  /** True when this element has children that may not be in the result. */
  hasChildren?: boolean;
}

export interface TreeResult {
  window: WindowSummary;
  elements: DriverElement[];
  truncated: boolean;
  total: number;
}

export interface CaptureResult {
  png: Buffer;
  width: number;
  height: number;
  bounds: Rect;
}

export interface OcrWord {
  text: string;
  bounds: Rect;
}

export interface OcrLine {
  text: string;
  bounds: Rect;
  words?: OcrWord[];
}

export interface OcrResult {
  lines: OcrLine[];
  text: string;
  language: string;
  languages: string[];
  width: number;
  height: number;
  bounds: Rect;
  elapsed_ms: number;
}

export interface ProcessListing {
  pid: number;
  name: string;
  path: string;
}

export interface InstalledAppListing {
  name: string;
  version: string;
  vendor: string;
  install_location: string;
  source: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface ClickOptions extends Point {
  button?: "left" | "right" | "middle";
  count?: number;
}

export interface TreeOptions {
  windowId?: string;
  /** Walk only the subtree of this accessibility element (native uid). */
  rootUid?: string;
  maxDepth: number;
  maxElements: number;
  includeOffscreen: boolean;
}

export interface WindowActionOptions {
  action: "focus" | "minimize" | "maximize" | "restore" | "close" | "move_resize";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * One interface for the human-parity Floor. Windows is the first driver; other
 * platforms implement the same contract later without touching callers.
 */
export interface DeviceDriver {
  readonly platform: string;
  ping(): Promise<{ ok: boolean; platform: string; psVersion?: string }>;
  listWindows(): Promise<WindowSummary[]>;
  getTree(options: TreeOptions): Promise<TreeResult>;
  focusWindow(windowId: string): Promise<WindowSummary>;
  windowAction(windowId: string, action: WindowActionOptions): Promise<void>;
  invoke(uid: string): Promise<{ pattern: string; route: string }>;
  setValue(uid: string, value: string): Promise<{ pattern: string; route: string }>;
  focusElement(uid: string): Promise<void>;
  click(options: ClickOptions): Promise<void>;
  move(point: Point): Promise<void>;
  drag(from: Point, to: Point): Promise<void>;
  scroll(point: Point | undefined, direction: "up" | "down" | "left" | "right", amount: number): Promise<void>;
  typeText(text: string): Promise<void>;
  key(codes: number[]): Promise<void>;
  elementAt(point: Point): Promise<DriverElement | null>;
  capture(options: { windowId?: string; region?: Rect; scale?: number }): Promise<CaptureResult>;
  ocr(options: { windowId?: string; region?: Rect; scale?: number }): Promise<OcrResult>;
  ocrLanguages(): Promise<{ languages: string[]; max_dimension: number }>;
  clipboardGet(): Promise<string>;
  clipboardSet(text: string): Promise<void>;
  listProcesses(): Promise<ProcessListing[]>;
  listInstalledApps(): Promise<InstalledAppListing[]>;
  launchApp(path: string, args?: string[]): Promise<number>;
  close(): Promise<void>;
}
