import { cpus, totalmem } from "node:os";

export type HardwareTier = "tier1-cpu" | "tier2-mid" | "tier3-best";
export type PerformanceProfile = "fast" | "balanced" | "best";

export interface HardwareInfo {
  platform: string;
  cpu_cores: number;
  total_ram_gb: number;
  gpu_detected: boolean;
  gpu_backend?: "directml" | "cuda" | "metal" | "vulkan" | "cpu";
  recommended_tier: HardwareTier;
  recommended_profile: PerformanceProfile;
  patient_mode: boolean;
}

/**
 * Detect local compute capabilities and configure performance profiles (plan section 15.2).
 * Fast / Balanced / Best quality with graceful CPU fallback.
 */
export function detectHardware(): HardwareInfo {
  const ramBytes = totalmem();
  const ramGb = Math.round((ramBytes / (1024 * 1024 * 1024)) * 10) / 10;
  const cores = cpus().length;
  const platform = process.platform;

  let gpuDetected = false;
  let backend: HardwareInfo["gpu_backend"] = "cpu";

  // Check common GPU indicator environment variables or OS flags
  if (process.env["CUDA_PATH"] || process.env["CUDA_VISIBLE_DEVICES"]) {
    gpuDetected = true;
    backend = "cuda";
  } else if (platform === "win32") {
    // Windows 10/11 supports DirectML natively for GPU acceleration
    gpuDetected = true;
    backend = "directml";
  } else if (platform === "darwin") {
    gpuDetected = true;
    backend = "metal";
  }

  let tier: HardwareTier = "tier1-cpu";
  let profile: PerformanceProfile = "fast";
  let patientMode = false;

  if (gpuDetected && ramGb >= 16) {
    tier = "tier3-best";
    profile = "best";
  } else if (ramGb >= 8) {
    tier = "tier2-mid";
    profile = "balanced";
  } else {
    tier = "tier1-cpu";
    profile = "fast";
    patientMode = true;
  }

  return {
    platform,
    cpu_cores: cores,
    total_ram_gb: ramGb,
    gpu_detected: gpuDetected,
    gpu_backend: backend,
    recommended_tier: tier,
    recommended_profile: profile,
    patient_mode: patientMode,
  };
}
