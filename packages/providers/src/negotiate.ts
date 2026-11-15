import type { ModelCapabilities } from "./types.js";
import type { Scene } from "@appbridge/core";

export type RecommendedMode = "task_mode" | "tool_mode";

export interface NegotiatedStrategy {
  mode: RecommendedMode;
  send_images: boolean;
  use_tools: boolean;
  max_elements_in_scene: number;
  instructions: string;
}

/**
 * Negotiate optimal perception and operational strategy based on AI model capabilities (plan 12.1).
 */
export function negotiateCapabilities(caps: ModelCapabilities): NegotiatedStrategy {
  // Models with small context (<16k tokens) or without tool calling perform better in Task Mode
  const isSmallModel = caps.context_tokens < 16384 || !caps.tool_calling;
  const mode: RecommendedMode = isSmallModel ? "task_mode" : "tool_mode";

  // Only send screenshots if model has vision AND large enough context
  const sendImages = caps.vision && caps.context_tokens >= 8192;

  // Adapt scene density based on token budget
  let maxElements = 40;
  if (caps.context_tokens >= 64000) maxElements = 200;
  else if (caps.context_tokens >= 32000) maxElements = 100;

  const instructions = isSmallModel
    ? "Small or text-only model detected. Steering to Task Mode where the built-in Task Pilot runs fine-grained perception and verification."
    : "Capable model detected. Tool Mode enabled for fine-grained perceive-and-act steps.";

  return {
    mode,
    send_images: sendImages,
    use_tools: caps.tool_calling,
    max_elements_in_scene: maxElements,
    instructions,
  };
}
