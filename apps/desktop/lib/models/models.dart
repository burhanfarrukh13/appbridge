/// Data models for the Appbridge desktop client.
library;

class BridgeStatus {
  final bool ok;
  final bool halted;
  final String? haltReason;
  final Map<String, dynamic> policy;
  final int pendingApprovalsCount;
  final int uptimeSeconds;
  final String actor;

  BridgeStatus({
    required this.ok,
    required this.halted,
    this.haltReason,
    required this.policy,
    required this.pendingApprovalsCount,
    required this.uptimeSeconds,
    required this.actor,
  });

  factory BridgeStatus.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? json;
    final killSwitch = data['kill_switch'] as Map<String, dynamic>? ?? {};
    final session = data['session'] as Map<String, dynamic>? ?? {};
    final pending = data['pending_approvals'] as List? ?? [];

    return BridgeStatus(
      ok: json['ok'] == true,
      halted: killSwitch['active'] == true,
      haltReason: killSwitch['reason'] as String?,
      policy: (data['policy'] as Map<String, dynamic>?) ?? {},
      pendingApprovalsCount: pending.length,
      uptimeSeconds: (session['uptime_seconds'] as num?)?.toInt() ?? 0,
      actor: (session['actor'] as String?) ?? 'ai-client',
    );
  }
}

class WindowApp {
  final String id;
  final String title;
  final String processName;
  final int pid;
  final String className;
  final bool focused;
  final bool minimized;
  final bool visible;
  final Map<String, dynamic> bounds;

  WindowApp({
    required this.id,
    required this.title,
    required this.processName,
    required this.pid,
    required this.className,
    required this.focused,
    required this.minimized,
    required this.visible,
    required this.bounds,
  });

  factory WindowApp.fromJson(Map<String, dynamic> json) {
    return WindowApp(
      id: (json['id'] ?? json['window_id'] ?? '').toString(),
      title: (json['title'] ?? json['window_title'] ?? '').toString(),
      processName: (json['process_name'] ?? json['app'] ?? '').toString(),
      pid: (json['pid'] as num?)?.toInt() ?? 0,
      className: (json['class_name'] ?? '').toString(),
      focused: json['focused'] == true,
      minimized: json['minimized'] == true,
      visible: json['visible'] != false,
      bounds: (json['bounds'] as Map<String, dynamic>?) ?? {},
    );
  }
}

class ApprovalItem {
  final String id;
  final String effect;
  final String app;
  final String target;
  final String status;
  final String createdAt;
  final String expiresAt;
  final String route;

  ApprovalItem({
    required this.id,
    required this.effect,
    required this.app,
    required this.target,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    required this.route,
  });

  factory ApprovalItem.fromJson(Map<String, dynamic> json) {
    return ApprovalItem(
      id: (json['id'] ?? '').toString(),
      effect: (json['effect'] ?? 'write').toString(),
      app: (json['app'] ?? '').toString(),
      target: (json['target'] ?? '').toString(),
      status: (json['status'] ?? 'pending').toString(),
      createdAt: (json['created_at'] ?? '').toString(),
      expiresAt: (json['expires_at'] ?? '').toString(),
      route: (json['route'] ?? '').toString(),
    );
  }
}

class ClientIntegration {
  final String id;
  final String name;
  final String kind;
  final bool detected;
  final String? configPath;
  final String note;

  ClientIntegration({
    required this.id,
    required this.name,
    required this.kind,
    required this.detected,
    this.configPath,
    required this.note,
  });

  factory ClientIntegration.fromJson(Map<String, dynamic> json) {
    return ClientIntegration(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      kind: (json['kind'] ?? 'json').toString(),
      detected: json['detected'] == true,
      configPath: json['config_path'] as String?,
      note: (json['note'] ?? '').toString(),
    );
  }
}

class SkillSummaryItem {
  final String id;
  final String appId;
  final String name;
  final String description;
  final int stepsCount;
  final String risk;
  final int runs;
  final int successes;
  final String? lastRunAt;

  SkillSummaryItem({
    required this.id,
    required this.appId,
    required this.name,
    required this.description,
    required this.stepsCount,
    required this.risk,
    required this.runs,
    required this.successes,
    this.lastRunAt,
  });

  factory SkillSummaryItem.fromJson(Map<String, dynamic> json) {
    final stats = (json['stats'] as Map<String, dynamic>?) ?? {};
    return SkillSummaryItem(
      id: (json['id'] ?? '').toString(),
      appId: (json['app_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      stepsCount: (json['steps'] as List?)?.length ?? 0,
      risk: (json['risk'] ?? 'unknown').toString(),
      runs: (stats['runs'] as num?)?.toInt() ?? 0,
      successes: (stats['successes'] as num?)?.toInt() ?? 0,
      lastRunAt: stats['last_run_at'] as String?,
    );
  }
}

class AuditLogItem {
  final String id;
  final String ts;
  final String tool;
  final String resultClass;
  final String? app;
  final String? route;
  final String hash;
  final String? note;

  AuditLogItem({
    required this.id,
    required this.ts,
    required this.tool,
    required this.resultClass,
    this.app,
    this.route,
    required this.hash,
    this.note,
  });

  factory AuditLogItem.fromJson(Map<String, dynamic> json) {
    return AuditLogItem(
      id: (json['id'] ?? '').toString(),
      ts: (json['ts'] ?? '').toString(),
      tool: (json['tool'] ?? '').toString(),
      resultClass: (json['result'] ?? '').toString(),
      app: json['app'] as String?,
      route: json['route'] as String?,
      hash: (json['hash'] ?? '').toString(),
      note: json['note'] as String?,
    );
  }
}

class SceneElement {
  final String id;
  final String role;
  final String name;
  final String? automationId;
  final bool enabled;
  final bool focused;
  final String? riskHint;
  final bool untrusted;

  SceneElement({
    required this.id,
    required this.role,
    required this.name,
    this.automationId,
    required this.enabled,
    required this.focused,
    this.riskHint,
    required this.untrusted,
  });

  factory SceneElement.fromJson(Map<String, dynamic> json) {
    return SceneElement(
      id: (json['id'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      automationId: json['automation_id'] as String?,
      enabled: json['enabled'] != false,
      focused: json['focused'] == true,
      riskHint: json['risk_hint'] as String?,
      untrusted: json['untrusted'] == true,
    );
  }
}

class HardwareProfile {
  final String platform;
  final int cpuCores;
  final double totalRamGb;
  final bool gpuDetected;
  final String gpuBackend;
  final String tier;
  final String profile;
  final bool patientMode;

  HardwareProfile({
    required this.platform,
    required this.cpuCores,
    required this.totalRamGb,
    required this.gpuDetected,
    required this.gpuBackend,
    required this.tier,
    required this.profile,
    required this.patientMode,
  });

  factory HardwareProfile.fromJson(Map<String, dynamic> json) {
    return HardwareProfile(
      platform: (json['platform'] ?? '').toString(),
      cpuCores: (json['cpu_cores'] as num?)?.toInt() ?? 0,
      totalRamGb: (json['total_ram_gb'] as num?)?.toDouble() ?? 0.0,
      gpuDetected: json['gpu_detected'] == true,
      gpuBackend: (json['gpu_backend'] ?? 'cpu').toString(),
      tier: (json['recommended_tier'] ?? 'tier1-cpu').toString(),
      profile: (json['recommended_profile'] ?? 'fast').toString(),
      patientMode: json['patient_mode'] == true,
    );
  }
}
