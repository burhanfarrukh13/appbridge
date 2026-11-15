import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "@appbridge/core";
import {
  detectDialogs,
  findDialogButton,
  findCancelButton,
} from "./dialogs.js";

function mockScene(dialogElements: Scene["elements"]): Scene {
  return {
    id: "s1",
    ts: Date.now(),
    app: "TestApp.exe",
    window: "Test App Window",
    stable: true,
    sources: ["uia"],
    elements: dialogElements,
    dialogs: [],
    data: {},
  };
}

describe("Dialog Perception & Classification", () => {
  it("detects a standard message box and identifies buttons", () => {
    const scene = mockScene([
      {
        id: "d1",
        role: "dialog",
        name: "Confirm Action",
        bounds: { x: 100, y: 100, width: 400, height: 200 },
        actions: [],
        src: ["uia"],
        class_name: "#32770",
        conf: 0.95,
      },
      {
        id: "b1",
        role: "button",
        name: "OK",
        bounds: { x: 150, y: 220, width: 80, height: 30 },
        actions: ["invoke"],
        src: ["uia"],
        conf: 0.95,
      },
      {
        id: "b2",
        role: "button",
        name: "Cancel",
        bounds: { x: 250, y: 220, width: 80, height: 30 },
        actions: ["invoke"],
        src: ["uia"],
        conf: 0.95,
      },
    ]);

    const dialogs = detectDialogs(scene);
    assert.equal(dialogs.length, 1);
    const d = dialogs[0];
    assert.equal(d.title, "Confirm Action");
    assert.equal(d.buttons.length, 2);
    assert.equal(d.handoff, false);

    const okBtn = findDialogButton(d, "OK");
    assert.ok(okBtn);
    assert.equal(okBtn?.id, "b1");

    const cancelBtn = findCancelButton(d);
    assert.ok(cancelBtn);
    assert.equal(cancelBtn?.id, "b2");
  });

  it("classifies credential dialogs and flags them for human handoff", () => {
    const scene = mockScene([
      {
        id: "d2",
        role: "dialog",
        name: "User Account Control",
        bounds: { x: 100, y: 100, width: 500, height: 300 },
        actions: [],
        src: ["uia"],
        class_name: "#32770",
        conf: 0.95,
      },
      {
        id: "e1",
        role: "edit",
        name: "Enter administrator password",
        bounds: { x: 150, y: 150, width: 200, height: 30 },
        actions: ["set_value"],
        src: ["uia"],
        conf: 0.95,
      },
      {
        id: "b_yes",
        role: "button",
        name: "Yes",
        bounds: { x: 150, y: 220, width: 80, height: 30 },
        actions: ["invoke"],
        src: ["uia"],
        conf: 0.95,
      },
    ]);

    const dialogs = detectDialogs(scene);
    assert.equal(dialogs.length, 1);
    const d = dialogs[0];
    assert.equal(d.kind, "credential");
    assert.equal(d.handoff, true);
    assert.equal(d.suggested_action, "handoff");
  });

  it("classifies file picker dialogs with suggested action choose_path", () => {
    const scene = mockScene([
      {
        id: "d3",
        role: "dialog",
        name: "Save As",
        bounds: { x: 50, y: 50, width: 600, height: 400 },
        actions: [],
        src: ["uia"],
        conf: 0.95,
      },
      {
        id: "f1",
        role: "edit",
        name: "File name:",
        bounds: { x: 100, y: 320, width: 300, height: 25 },
        actions: ["set_value"],
        src: ["uia"],
        conf: 0.95,
      },
      {
        id: "b_save",
        role: "button",
        name: "Save",
        bounds: { x: 420, y: 320, width: 80, height: 25 },
        actions: ["invoke"],
        src: ["uia"],
        conf: 0.95,
      },
      {
        id: "b_cancel",
        role: "button",
        name: "Cancel",
        bounds: { x: 510, y: 320, width: 80, height: 25 },
        actions: ["invoke"],
        src: ["uia"],
        conf: 0.95,
      },
    ]);

    const dialogs = detectDialogs(scene);
    assert.equal(dialogs.length, 1);
    const d = dialogs[0];
    assert.equal(d.kind, "file_picker");
    assert.equal(d.suggested_action, "choose_path");
    assert.equal(d.fields.length, 1);
    assert.equal(d.buttons.length, 2);
  });
});
