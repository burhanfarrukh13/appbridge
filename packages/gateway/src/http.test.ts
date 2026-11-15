import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bridge } from "./bridge.js";
import { startHttpGateway, stopHttpGateway } from "./http.js";
import { APPBRIDGE_VERSION } from "./version.js";

test("gateway endpoints report the workspace package version", async () => {
  const home = mkdtempSync(join(tmpdir(), "appbridge-version-http-"));
  const bridge = new Bridge({ home });
  const gateway = await startHttpGateway(bridge, { port: 0, host: "127.0.0.1" });
  try {
    const health = await fetch(`${gateway.url}/healthz`);
    const healthBody = (await health.json()) as { version?: unknown };
    assert.equal(healthBody.version, APPBRIDGE_VERSION);

    const openapi = await fetch(`${gateway.url}/v1/openapi.json`, {
      headers: { authorization: `Bearer ${gateway.token}` },
    });
    const document = (await openapi.json()) as { info?: { version?: unknown } };
    assert.equal(document.info?.version, APPBRIDGE_VERSION);
  } finally {
    await stopHttpGateway(gateway);
    await bridge.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("authenticated settings endpoint persists and applies one policy", async () => {
  const home = mkdtempSync(join(tmpdir(), "appbridge-policy-http-"));
  const bridge = new Bridge({ home });
  const gateway = await startHttpGateway(bridge, { port: 0, host: "127.0.0.1" });
  try {
    const response = await fetch(`${gateway.url}/v1/settings/policy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${gateway.token}`,
      },
      body: JSON.stringify({ effect: "external-effect", action: "approve" }),
    });
    assert.equal(response.status, 200);
    assert.equal(bridge.config.policy["external-effect"], "approve");

    const invalid = await fetch(`${gateway.url}/v1/settings/policy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${gateway.token}`,
      },
      body: JSON.stringify({ effect: "external-effect", action: "unknown-action" }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(bridge.config.policy["external-effect"], "approve");
  } finally {
    await stopHttpGateway(gateway);
    await bridge.close();
    rmSync(home, { recursive: true, force: true });
  }
});
