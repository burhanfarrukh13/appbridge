import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_POLICY } from "@appbridge/core";
import { ApprovalStore } from "./approvals.js";
import { ActionFirewall } from "./firewall.js";

async function harness() {
  const dir = await mkdtemp(join(tmpdir(), "appbridge-firewall-"));
  const approvals = new ApprovalStore(join(dir, "approvals.json"));
  const firewall = new ActionFirewall({
    policy: {
      ...DEFAULT_POLICY,
      "external-effect": "approve",
      write: "approve",
    },
    approvals,
    approvalTtlSeconds: 600,
  });
  return { approvals, firewall };
}

test("external effects need a human grant and one-shot grants are consumed", async () => {
  const { firewall, approvals } = await harness();

  const first = await firewall.authorize({
    effect: "external-effect",
    app: "demo",
    target: "Button:Send",
  });
  assert.equal(first.decision, "approve");
  assert.ok(first.approval?.id.startsWith("ap_"));

  const stillBlocked = await firewall.authorize({
    effect: "external-effect",
    app: "demo",
    target: "Button:Send",
  });
  assert.equal(stillBlocked.decision, "approve");

  await approvals.decide(first.approval?.id as string, "granted", "once", 600);
  const granted = await firewall.authorize({
    effect: "external-effect",
    app: "demo",
    target: "Button:Send",
  });
  assert.equal(granted.decision, "allow");

  const consumed = await firewall.authorize({
    effect: "external-effect",
    app: "demo",
    target: "Button:Send",
  });
  assert.equal(consumed.decision, "approve");
});

test("time-boxed grants cover matching targets only", async () => {
  const { firewall, approvals } = await harness();
  const request = await firewall.authorize({ effect: "write", app: "demo", target: "clipboard" });
  await approvals.decide(request.approval?.id as string, "granted", "session", 600);

  assert.equal((await firewall.authorize({ effect: "write", app: "demo", target: "clipboard" })).decision, "allow");
  assert.equal((await firewall.authorize({ effect: "write", app: "demo", target: "other" })).decision, "approve");
});

test("credential and privileged effects are handed to the human, never approved for the AI", async () => {
  const { firewall } = await harness();
  const credential = await firewall.authorize({ effect: "credential", app: "demo", target: "Edit:Password" });
  assert.equal(credential.decision, "handoff");
  const privileged = await firewall.authorize({ effect: "privileged", app: "demo" });
  assert.equal(privileged.decision, "handoff");
});

test("read and navigate stay allowed without approvals", async () => {
  const { firewall } = await harness();
  assert.equal((await firewall.authorize({ effect: "read" })).decision, "allow");
  assert.equal((await firewall.authorize({ effect: "navigate" })).decision, "allow");
});

test("concurrent approval requests across processes do not lose updates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "appbridge-approvals-"));
  const file = join(dir, "approvals.json");
  const stores = [new ApprovalStore(file), new ApprovalStore(file), new ApprovalStore(file)];
  const created = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      stores[index % stores.length]!.request({
        effect: "external-effect",
        app: "demo",
        target: `target-${index}`,
        reason: "concurrency test",
        ttlSeconds: 600,
      }),
    ),
  );
  const ids = new Set(created.map((record) => record.id));
  assert.equal(ids.size, 15);
  const listed = await stores[1]!.list();
  assert.equal(listed.length, 15);
  const state = JSON.parse(await readFile(file, "utf8")) as { requests: unknown[] };
  assert.equal(state.requests.length, 15);
  await assert.rejects(readFile(`${file}.lock`, "utf8"));
});
