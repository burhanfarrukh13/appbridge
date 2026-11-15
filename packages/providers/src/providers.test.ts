import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectHardware } from "./hardware.js";
import { negotiateCapabilities } from "./negotiate.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

describe("AI Providers & Capability Negotiation", () => {
  it("detects local hardware and recommends tier and performance profile", () => {
    const hw = detectHardware();
    assert.ok(hw.cpu_cores >= 1);
    assert.ok(hw.total_ram_gb > 0);
    assert.ok(["tier1-cpu", "tier2-mid", "tier3-best"].includes(hw.recommended_tier));
    assert.ok(["fast", "balanced", "best"].includes(hw.recommended_profile));
  });

  it("steers small context models to task mode and capable models to tool mode", () => {
    const smallModel = negotiateCapabilities({
      vision: false,
      tool_calling: false,
      context_tokens: 4096,
      streaming: false,
      json_mode: true,
    });
    assert.equal(smallModel.mode, "task_mode");
    assert.equal(smallModel.send_images, false);

    const capableModel = negotiateCapabilities({
      vision: true,
      tool_calling: true,
      context_tokens: 128000,
      streaming: true,
      json_mode: true,
    });
    assert.equal(capableModel.mode, "tool_mode");
    assert.equal(capableModel.send_images, true);
    assert.ok(capableModel.max_elements_in_scene >= 100);
  });

  it("enforces local-only egress mode by rejecting remote endpoints", () => {
    assert.throws(
      () => {
        new OpenAICompatibleProvider({
          baseUrl: "https://api.external-cloud.example/v1",
          egressMode: "local-only",
        });
      },
      /Policy violation: egress.mode is 'local-only'/
    );

    // Loopback endpoint is allowed under local-only mode
    const localProvider = new OpenAICompatibleProvider({
      baseUrl: "http://127.0.0.1:11434/v1",
      egressMode: "local-only",
    });
    assert.equal(localProvider.is_local, true);
  });
});
