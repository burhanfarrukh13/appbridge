import type { Rect, WindowSummary } from "@appbridge/core";
import { NativeHost } from "./native-host.js";
import type {
  CaptureResult,
  ClickOptions,
  DeviceDriver,
  DriverElement,
  InstalledAppListing,
  OcrResult,
  Point,
  ProcessListing,
  TreeOptions,
  TreeResult,
  WindowActionOptions,
} from "./driver.js";

interface RawWindow {
  id: string;
  title: string;
  className: string;
  pid: number;
  processName: string;
  bounds: Rect;
  focused: boolean;
  minimized: boolean;
  visible: boolean;
}

interface RawTree {
  window: RawWindow;
  elements: DriverElement[];
  truncated: boolean;
  total: number;
}

function toWindow(raw: RawWindow): WindowSummary {
  return {
    id: raw.id,
    title: raw.title ?? "",
    class_name: raw.className ?? "",
    pid: raw.pid,
    process_name: raw.processName ?? "",
    bounds: raw.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
    focused: Boolean(raw.focused),
    minimized: Boolean(raw.minimized),
    visible: Boolean(raw.visible),
  };
}

function toElement(raw: DriverElement): DriverElement {
  return {
    uid: raw.uid,
    parent: raw.parent ?? null,
    depth: raw.depth ?? 0,
    role: raw.role ?? "",
    name: raw.name ?? "",
    automationId: raw.automationId ?? "",
    className: raw.className ?? "",
    bounds: raw.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
    enabled: Boolean(raw.enabled),
    focused: Boolean(raw.focused),
    offscreen: Boolean(raw.offscreen),
    patterns: Array.isArray(raw.patterns) ? raw.patterns : [],
    value: raw.value ?? null,
    masked: Boolean(raw.masked),
    password: Boolean(raw.password),
    childCount: typeof raw.childCount === "number" ? raw.childCount : undefined,
    hasChildren: raw.hasChildren === undefined ? undefined : Boolean(raw.hasChildren),
  };
}

/** Windows driver: UI Automation for semantics, Win32/input synthesis for actions. */
export class WindowsDriver implements DeviceDriver {
  readonly platform = "windows";
  private readonly host: NativeHost;

  constructor(host?: NativeHost) {
    this.host = host ?? new NativeHost();
  }

  async ping(): Promise<{ ok: boolean; platform: string; psVersion?: string }> {
    const result = await this.host.request<{ ok: boolean; platform: string; psVersion?: string }>(
      "ping",
      {},
      45000,
    );
    return result;
  }

  async listWindows(): Promise<WindowSummary[]> {
    const result = await this.host.request<{ windows: RawWindow[] }>("list_windows");
    return (result.windows ?? []).map(toWindow);
  }

  async getTree(options: TreeOptions): Promise<TreeResult> {
    const result = await this.host.request<RawTree>(
      "get_tree",
      {
        windowId: options.windowId,
        rootUid: options.rootUid,
        maxDepth: options.maxDepth,
        maxElements: options.maxElements,
        includeOffscreen: options.includeOffscreen,
      },
      30000,
    );
    return {
      window: toWindow(result.window),
      elements: (result.elements ?? []).map(toElement),
      truncated: Boolean(result.truncated),
      total: result.total ?? (result.elements ?? []).length,
    };
  }

  async focusWindow(windowId: string): Promise<WindowSummary> {
    const result = await this.host.request<RawWindow>("focus_window", { windowId });
    return toWindow(result);
  }

  async windowAction(windowId: string, action: WindowActionOptions): Promise<void> {
    await this.host.request("window_action", { windowId, ...action });
  }

  async invoke(uid: string): Promise<{ pattern: string; route: string }> {
    return this.host.request<{ pattern: string; route: string }>("invoke", { uid });
  }

  async setValue(uid: string, value: string): Promise<{ pattern: string; route: string }> {
    return this.host.request<{ pattern: string; route: string }>("set_value", { uid, value });
  }

  async focusElement(uid: string): Promise<void> {
    await this.host.request("focus_element", { uid });
  }

  async click(options: ClickOptions): Promise<void> {
    await this.host.request("click", {
      x: Math.round(options.x),
      y: Math.round(options.y),
      button: options.button ?? "left",
      count: options.count ?? 1,
    });
  }

  async move(point: Point): Promise<void> {
    await this.host.request("move", { x: Math.round(point.x), y: Math.round(point.y) });
  }

  async drag(from: Point, to: Point): Promise<void> {
    await this.host.request(
      "drag",
      {
        fromX: Math.round(from.x),
        fromY: Math.round(from.y),
        toX: Math.round(to.x),
        toY: Math.round(to.y),
      },
      30000,
    );
  }

  async scroll(
    point: Point | undefined,
    direction: "up" | "down" | "left" | "right",
    amount: number,
  ): Promise<void> {
    await this.host.request("scroll", {
      x: point ? Math.round(point.x) : undefined,
      y: point ? Math.round(point.y) : undefined,
      direction,
      amount,
    });
  }

  async typeText(text: string): Promise<void> {
    await this.host.request("type_text", { text }, 60000);
  }

  async key(codes: number[]): Promise<void> {
    await this.host.request("key", { codes });
  }

  async elementAt(point: Point): Promise<DriverElement | null> {
    try {
      const result = await this.host.request<DriverElement>("element_at", {
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
      return toElement(result);
    } catch {
      return null;
    }
  }

  async capture(options: { windowId?: string; region?: Rect; scale?: number }): Promise<CaptureResult> {
    const result = await this.host.request<{
      base64: string;
      width: number;
      height: number;
      bounds: Rect;
    }>("capture", { windowId: options.windowId, region: options.region, scale: options.scale ?? 1 }, 30000);
    return {
      png: Buffer.from(result.base64, "base64"),
      width: result.width,
      height: result.height,
      bounds: result.bounds,
    };
  }

  async ocr(options: { windowId?: string; region?: Rect; scale?: number }): Promise<OcrResult> {
    const result = await this.host.request<OcrResult>(
      "ocr",
      { windowId: options.windowId, region: options.region, scale: options.scale ?? 1 },
      90000,
    );
    return {
      lines: result.lines ?? [],
      text: result.text ?? "",
      language: result.language ?? "",
      languages: result.languages ?? [],
      width: result.width ?? 0,
      height: result.height ?? 0,
      bounds: result.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
      elapsed_ms: result.elapsed_ms ?? 0,
    };
  }

  async ocrLanguages(): Promise<{ languages: string[]; max_dimension: number }> {
    return this.host.request<{ languages: string[]; max_dimension: number }>("ocr_languages", {}, 30000);
  }

  async clipboardGet(): Promise<string> {
    const result = await this.host.request<{ text: string }>("clipboard_get");
    return result.text ?? "";
  }

  async clipboardSet(text: string): Promise<void> {
    await this.host.request("clipboard_set", { text });
  }

  async listProcesses(): Promise<ProcessListing[]> {
    const result = await this.host.request<{ processes: ProcessListing[] }>("process_list");
    return result.processes ?? [];
  }

  async listInstalledApps(): Promise<InstalledAppListing[]> {
    const result = await this.host.request<{ apps: InstalledAppListing[] }>("installed_apps", {}, 60000);
    return result.apps ?? [];
  }

  async launchApp(path: string, args: string[] = []): Promise<number> {
    const result = await this.host.request<{ pid: number }>("launch_app", { path, args });
    return result.pid;
  }

  async close(): Promise<void> {
    await this.host.close();
  }
}

/** Pick the driver for this machine, or report the honest limitation. */
export function createDriver(): DeviceDriver {
  if (process.platform === "win32") return new WindowsDriver();
  throw new Error(
    `Appbridge's Floor currently has a Windows driver only (this is ${process.platform}). ` +
      "The architecture is OS-neutral; macOS, Linux and Android drivers are later phases of the plan.",
  );
}
