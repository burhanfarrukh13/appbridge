import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DeviceDriver,
  TreeResult,
  OcrResult,
  CaptureResult,
  DriverElement,
  WindowActionOptions,
  Point,
  ClickOptions,
  TreeOptions,
} from "@appbridge/floor";
import type { WindowSummary, Rect } from "@appbridge/core";
import { DEFAULT_CONFIG } from "@appbridge/core";
import { Bridge } from "./bridge.js";

class FakeDriver implements DeviceDriver {
  readonly platform = "fake";

  window: WindowSummary = {
    id: "w1",
    title: "Test Application Window",
    process_name: "testapp",
    pid: 1234,
    class_name: "TestWindowClass",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    visible: true,
    focused: true,
    minimized: false,
  };

  elements: DriverElement[] = [
    {
      uid: "e1",
      parent: null,
      depth: 0,
      role: "window",
      name: "Test Application Window",
      automationId: "MainWindow",
      className: "Window",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      enabled: true,
      focused: true,
      offscreen: false,
      patterns: ["window"],
      value: null,
      masked: false,
      password: false,
    },
    {
      uid: "e2",
      parent: "e1",
      depth: 1,
      role: "button",
      name: "Next",
      automationId: "btnNext",
      className: "Button",
      bounds: { x: 50, y: 50, width: 100, height: 30 },
      enabled: true,
      focused: false,
      offscreen: false,
      patterns: ["invoke"],
      value: null,
      masked: false,
      password: false,
    },
    {
      uid: "e3",
      parent: "e1",
      depth: 1,
      role: "edit",
      name: "Search Query",
      automationId: "txtSearch",
      className: "Edit",
      bounds: { x: 50, y: 100, width: 200, height: 30 },
      enabled: true,
      focused: false,
      offscreen: false,
      patterns: ["value"],
      value: "hello",
      masked: false,
      password: false,
    },
  ];

  async ping() { return { ok: true, platform: "fake" }; }
  async listWindows() { return [this.window]; }
  async getTree(options: TreeOptions): Promise<TreeResult> {
    let elements = this.elements;
    if (options.rootUid) {
      const keep = new Set([options.rootUid]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const element of this.elements) {
          if (element.parent && keep.has(element.parent) && !keep.has(element.uid)) {
            keep.add(element.uid);
            grew = true;
          }
        }
      }
      elements = this.elements
        .filter((element) => keep.has(element.uid))
        .map((element) =>
          element.uid === options.rootUid ? { ...element, parent: null, depth: 0 } : element,
        );
    }
    return {
      window: this.window,
      elements,
      truncated: false,
      total: elements.length,
    };
  }
  async focusWindow(windowId: string) { return this.window; }
  async windowAction(windowId: string, action: WindowActionOptions) {}
  async invoke(uid: string) {
    this.window.title = "Test Application Window (Next Screen)";
    return { pattern: "Invoke", route: "test" };
  }
  async setValue(uid: string, value: string) {
    const el = this.elements.find(e => e.uid === uid);
    if (el) el.value = value;
    return { pattern: "Value", route: "test" };
  }
  async focusElement(uid: string) {}
  async click(options: ClickOptions) {
    this.window.title = "Test Application Window (Clicked)";
  }
  async move(point: Point) {}
  async drag(from: Point, to: Point) {}
  async scroll(point: Point | undefined, direction: "up" | "down" | "left" | "right", amount: number) {}
  async typeText(text: string) {}
  async key(codes: number[]) {}
  async elementAt(point: Point) { return null; }
  async capture(options: { windowId?: string; region?: Rect; scale?: number }): Promise<CaptureResult> {
    return { png: Buffer.from("fake-png"), width: 800, height: 600, bounds: this.window.bounds };
  }
  async ocr(options: { windowId?: string; region?: Rect; scale?: number }): Promise<OcrResult> {
    return { lines: [], text: "", language: "en-US", languages: ["en-US"], width: 800, height: 600, bounds: this.window.bounds, elapsed_ms: 1 };
  }
  async ocrLanguages() { return { languages: ["en-US"], max_dimension: 4096 }; }
  async clipboardGet() { return "test-clipboard-content"; }
  async clipboardSet(text: string) {}
  async listProcesses() { return [{ pid: 1234, name: "testapp", path: "C:\\test\\testapp.exe" }]; }
  async listInstalledApps() { return []; }
  async launchApp(path: string, args?: string[]) { return 9999; }
  async close() {}
}

describe("Bridge Gateway with FakeDriver", () => {
  let tempHome: string;
  let bridge: Bridge;

  it("initializes Bridge and perceives structured scene", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "ab-test-"));
    bridge = new Bridge({ home: tempHome, driver: new FakeDriver() });

    const sceneResult = await bridge.describe({ window_title: "Test Application Window" });
    assert.equal(sceneResult.ok, true);
    assert.equal(sceneResult.class, "ok");
    const sceneData = sceneResult.data as { scene: { elements: unknown[] } };
    assert.ok(sceneData.scene.elements);
    assert.equal(sceneData.scene.elements.length, 3);
  });

  it("drills into a subtree and rejects stale roots", async () => {
    const full = await bridge.describe({ window_title: "Test Application Window" });
    const scene = (full.data as { scene: { elements: Array<{ id: string; role: string }> } }).scene;
    const root = scene.elements.find((element) => element.role === "window");
    assert.ok(root);

    const drilled = await bridge.describe({ window_title: "Test Application Window", root: root.id });
    assert.equal(drilled.ok, true);
    const drilledScene = (drilled.data as {
      scene: { elements: Array<{ id: string; parent?: string }>; data: Record<string, unknown> };
    }).scene;
    assert.equal(drilledScene.elements.length, 3);
    assert.equal(drilledScene.data["root"], root.id);
    assert.equal(drilledScene.elements[0]?.parent, undefined);

    const stale = await bridge.describe({ window_title: "Test Application Window", root: "e999" });
    assert.equal(stale.ok, false);
    assert.match(stale.reason ?? "", /not in the current scene/);
  });

  it("compiles and runs a Skill through the gateway", async () => {
    const compileRes = await bridge.skillCompile({
      app_id: "testapp",
      window_title: "Test Application Window",
      name: "Click Next",
      description: "Clicks the Next button",
      events: [
        {
          ts: new Date().toISOString(),
          tool: "ui.click",
          app_id: "testapp",
          window_title: "Test Application Window",
          target: { role: "button", name: "Next" },
        },
      ],
    });

    assert.equal(compileRes.ok, true);
    const runRes = await bridge.skillRun({ app_id: "testapp", skill_id: "click-next" });
    assert.equal(runRes.ok, true);
  });

  it("records interactions in Teach mode and compiles them into a runnable skill", async () => {
    // 1. Start recording
    const startRes = await bridge.callTool("skill.record_start", {
      app_id: "testapp",
      window_title: "Test Application Window",
      name: "Recorded Next Step",
      description: "Recorded skill test",
    });
    assert.equal(startRes.ok, true);

    // 2. Record an event
    const eventRes = await bridge.callTool("skill.record_event", {
      act: "click",
      target: { role: "button", name: "Next" },
    });
    assert.equal(eventRes.ok, true);

    // 3. Stop recording and compile
    const stopRes = await bridge.callTool("skill.record_stop", {});
    assert.equal(stopRes.ok, true);

    // 4. Verify skill was saved and is listed
    const listRes = await bridge.callTool("memory.store.list", { app_id: "testapp" });
    assert.equal(listRes.ok, true);
    const summaries = (listRes.data as { summaries: Array<{ id: string }> }).summaries;
    assert.ok(summaries.some((s) => s.id === "recorded-next-step"));
  });

  it("provides scoped file access and approves only critical terminal commands", async () => {
    const root = join(tempHome, "workspace-files");
    mkdirSync(root);
    writeFileSync(join(root, "notes.txt"), "alpha\nbeta\n", "utf8");
    const localBridge = new Bridge({
      home: join(tempHome, "local-bridge"),
      driver: new FakeDriver(),
      config: {
        ...DEFAULT_CONFIG,
        filesystem: { ...DEFAULT_CONFIG.filesystem, roots: [root] },
      },
    });

    const listed = await localBridge.callTool("filesystem.list");
    assert.equal(listed.ok, true);
    const read = await localBridge.callTool("filesystem.read", { path: "notes.txt" });
    assert.equal(read.ok, true);
    assert.equal((read.data as { content: string }).content, "alpha\nbeta\n");
    assert.equal((read.data as { untrusted: boolean }).untrusted, true);
    const search = await localBridge.callTool("filesystem.search", { query: "beta" });
    assert.equal(search.ok, true);
    assert.ok((search.data as { matches: unknown[] }).matches.length > 0);

    const outside = await localBridge.callTool("filesystem.read", {
      path: join(tempHome, "outside.txt"),
    });
    assert.equal(outside.ok, false);
    const traversal = await localBridge.callTool("filesystem.read", {
      path: join(root, "..", "outside.txt"),
    });
    assert.equal(traversal.ok, false);

    const written = await localBridge.callTool("filesystem.write", {
      path: "new.txt",
      content: "created by approved write",
    });
    assert.equal(written.ok, true);
    assert.equal((written.data as { verified: boolean }).verified, true);

    const longFile = Array.from({ length: 2205 }, (_, index) => `line-${index}`).join("\n");
    writeFileSync(join(root, "long.txt"), longFile, "utf8");
    const edited = await localBridge.callTool("filesystem.edit", {
      path: "long.txt",
      old_text: "line-0",
      new_text: "updated",
    });
    assert.equal(edited.ok, true);
    const tail = await localBridge.callTool("filesystem.read", {
      path: "long.txt",
      start_line: 2205,
      max_lines: 1,
    });
    assert.equal((tail.data as { content: string }).content, "line-2204");

    const policyUpdate = await localBridge.updatePolicy("external-effect", "approve");
    assert.equal(policyUpdate.ok, true);
    assert.equal(localBridge.config.policy["external-effect"], "approve");
    assert.match(readFileSync(localBridge.paths.config, "utf8"), /"external-effect" = "approve"/);

    const terminals = (await localBridge.callTool("terminal.list")).data as { shells: string[] };
    const shell = terminals.shells.find((candidate) => candidate !== "wsl");
    if (shell) {
      const routineCommand = await localBridge.callTool("terminal.run", {
        shell,
        command: "echo appbridge-safe-test",
      });
      assert.equal(routineCommand.ok, true);
      assert.ok((routineCommand.data as { stdout: string }).stdout.includes("appbridge-safe-test"));

      const criticalCommand = await localBridge.callTool("terminal.run", {
        shell,
        command: "Remove-Item important.txt",
      });
      assert.equal(criticalCommand.class, "needs_human");
      assert.ok(criticalCommand.approval?.id);
    }

    await localBridge.close();
  });

  it("handles credential dialog by forcing human handoff", async () => {
    const fakeDriver = new FakeDriver();
    fakeDriver.elements.push({
      uid: "d_cred",
      parent: "e1",
      depth: 1,
      role: "Dialog",
      name: "User Account Control",
      automationId: "CredDialog",
      className: "#32770",
      bounds: { x: 100, y: 100, width: 300, height: 200 },
      enabled: true,
      focused: true,
      offscreen: false,
      patterns: ["window"],
      value: null,
      masked: false,
      password: false,
    });
    fakeDriver.elements.push({
      uid: "d_edit",
      parent: "d_cred",
      depth: 2,
      role: "Edit",
      name: "Enter administrator password",
      automationId: "txtPwd",
      className: "Edit",
      bounds: { x: 120, y: 130, width: 200, height: 25 },
      enabled: true,
      focused: true,
      offscreen: false,
      patterns: ["value"],
      value: null,
      masked: false,
      password: true,
    });

    const bridgeCred = new Bridge({ home: tempHome, driver: fakeDriver });
    const dialogHandleRes = await bridgeCred.dialogHandle({});
    assert.equal(dialogHandleRes.ok, false);
    assert.equal(dialogHandleRes.class, "needs_human");
    assert.ok(dialogHandleRes.reason?.includes("credential"));

    await bridge.close();
    await bridgeCred.close();
    rmSync(tempHome, { recursive: true, force: true });
  });
});
