import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/models.dart';

class AppbridgeClient {
  String baseUrl = 'http://127.0.0.1:8787';
  String token = '';
  bool isConnected = false;

  AppbridgeClient() {
    _tryLoadLocalToken();
  }

  void _tryLoadLocalToken() {
    try {
      final userProfile =
          Platform.environment['USERPROFILE'] ??
          Platform.environment['HOME'] ??
          '';
      if (userProfile.isNotEmpty) {
        final tokenFile = File('$userProfile/.appbridge/gateway-token');
        if (tokenFile.existsSync()) {
          token = tokenFile.readAsStringSync().trim();
        }
      }
    } catch (_) {
      // Ignore if running in sandbox or web
    }
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (token.isNotEmpty) 'Authorization': 'Bearer $token',
  };

  /// Check if the gateway is running.
  Future<bool> checkHealth() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/healthz'))
          .timeout(const Duration(seconds: 3));
      isConnected = response.statusCode == 200;
      return isConnected;
    } catch (_) {
      isConnected = false;
      return false;
    }
  }

  /// Start the Appbridge backend daemon locally if not already running.
  Future<bool> startLocalDaemon({
    String workingDir = 'D:\\claude\\appbridge',
  }) async {
    if (await checkHealth()) return true;

    try {
      await Process.start(
        'node',
        ['packages/cli/dist/index.js', 'serve', '--port', '8787'],
        workingDirectory: workingDir,
        mode: ProcessStartMode.detached,
      );

      // Wait up to 6 seconds for gateway to bind and create token
      for (int i = 0; i < 12; i++) {
        await Future.delayed(const Duration(milliseconds: 500));
        _tryLoadLocalToken();
        if (await checkHealth()) {
          return true;
        }
      }
    } catch (_) {
      // Process start failed
    }
    return false;
  }

  /// Fetch bridge status (kill switch, policy, uptime, etc.)
  Future<BridgeStatus?> getStatus() async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/v1/status'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        return BridgeStatus.fromJson(data);
      }
    } catch (_) {}
    return null;
  }

  /// Toggle Kill Switch (halt or resume).
  Future<bool> setHalt(bool halt) async {
    try {
      final endpoint = halt ? '/v1/halt' : '/v1/resume';
      final res = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: _headers,
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Call a bridge tool.
  Future<Map<String, dynamic>> callTool(
    String tool, [
    Map<String, dynamic>? args,
  ]) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/v1/tools/$tool'),
        headers: _headers,
        body: jsonEncode(args ?? {}),
      );
      if (res.body.isNotEmpty) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
    return {'ok': false};
  }

  /// List open applications / top-level windows.
  Future<List<WindowApp>> listApps() async {
    final result = await callTool('apps.list');
    if (result['ok'] == true) {
      final data = result['data'] as Map<String, dynamic>?;
      final windows = data?['windows'] as List? ?? [];
      return windows
          .map((w) => WindowApp.fromJson(w as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Learn an open app into App Memory (generates Playbook v0).
  Future<Map<String, dynamic>> learnApp(String windowTitle) async {
    return callTool('apps.describe', {'window_title': windowTitle});
  }

  /// Focus a window.
  Future<bool> focusWindow(String windowId, [String? title]) async {
    final args = <String, dynamic>{};
    if (windowId.trim().isNotEmpty) args['window_id'] = windowId.trim();
    if (title != null && title.trim().isNotEmpty)
      args['window_title'] = title.trim();
    final res = await callTool('window.focus', args);
    return res['ok'] == true;
  }

  /// Inspect elements of a window.
  Future<List<SceneElement>> describeWindow(String windowTitle) async {
    final res = await callTool('screen.describe', {
      'window_title': windowTitle,
      'include_ocr': true,
    });
    if (res['ok'] == true) {
      final data = res['data'] as Map<String, dynamic>?;
      final scene = data?['scene'] as Map<String, dynamic>?;
      final elements = scene?['elements'] as List? ?? [];
      return elements
          .map((e) => SceneElement.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// List pending approvals from the Action Firewall.
  Future<List<ApprovalItem>> listApprovals() async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/v1/approvals'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final inner = data['data'] as Map<String, dynamic>?;
        final list = inner?['approvals'] as List? ?? [];
        return list
            .map((a) => ApprovalItem.fromJson(a as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  /// Decide on an approval (Approve Once, Approve for 30m, Deny).
  Future<bool> decideApproval(
    String id,
    String decision, {
    String scope = 'once',
    int ttlSeconds = 1800,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/v1/approvals/$id/decide'),
        headers: _headers,
        body: jsonEncode({
          'decision': decision,
          'scope': scope,
          'ttl_seconds': ttlSeconds,
        }),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// List AI client integrations.
  Future<List<ClientIntegration>> listClients() async {
    // We provide client detection directly via standard client definitions
    return [
      ClientIntegration(
        id: 'antigravity',
        name: 'Google Antigravity',
        kind: 'json',
        detected: _checkPathExists('~/.gemini/config'),
        configPath: '~/.gemini/config/mcp_config.json',
        note: 'Writes to shared mcp_config.json for automatic agentic tools.',
      ),
      ClientIntegration(
        id: 'vscode',
        name: 'Visual Studio Code',
        kind: 'json',
        detected: _checkPathExists('%APPDATA%/Code'),
        configPath: '%APPDATA%/Code/User/mcp.json',
        note: 'Configures servers.appbridge with stdio transport.',
      ),
      ClientIntegration(
        id: 'claude-desktop',
        name: 'Claude Desktop',
        kind: 'json',
        detected: _checkPathExists('%APPDATA%/Claude'),
        configPath: '%APPDATA%/Claude/claude_desktop_config.json',
        note: 'Writes mcpServers.appbridge configuration.',
      ),
      ClientIntegration(
        id: 'cursor',
        name: 'Cursor IDE',
        kind: 'json',
        detected: _checkPathExists('~/.cursor'),
        configPath: '~/.cursor/mcp.json',
        note: 'Writes mcpServers.appbridge directly into Cursor.',
      ),
      ClientIntegration(
        id: 'codex',
        name: 'Codex CLI / IDE',
        kind: 'toml',
        detected: _checkPathExists('~/.codex'),
        configPath: '~/.codex/config.toml',
        note: 'Appends [mcp_servers.appbridge] block after backing up config.',
      ),
      ClientIntegration(
        id: 'generic',
        name: 'Other MCP Clients',
        kind: 'manual',
        detected: true,
        note:
            'Connect via stdio command: "node packages/cli/dist/index.js mcp".',
      ),
    ];
  }

  bool _checkPathExists(String rawPath) {
    try {
      final home =
          Platform.environment['USERPROFILE'] ??
          Platform.environment['HOME'] ??
          '';
      var expanded = rawPath.replaceFirst('~', home);
      expanded = expanded.replaceAll(
        '%APPDATA%',
        Platform.environment['APPDATA'] ?? '',
      );
      return Directory(expanded).existsSync() || File(expanded).existsSync();
    } catch (_) {
      return false;
    }
  }

  /// List saved skills for an application.
  Future<List<SkillSummaryItem>> listSkills(String appId) async {
    final res = await callTool('memory.store.list', {'app_id': appId});
    if (res['ok'] == true) {
      final data = res['data'] as Map<String, dynamic>?;
      final list = data?['summaries'] as List? ?? [];
      return list
          .map((s) => SkillSummaryItem.fromJson(s as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Run a compiled skill.
  Future<Map<String, dynamic>> runSkill(
    String skillId, {
    String? appId,
    Map<String, dynamic>? params,
  }) async {
    final args = <String, dynamic>{'skill_id': skillId};
    if (appId != null) args['app_id'] = appId;
    if (params != null) args['params'] = params;
    return callTool('skill.run', args);
  }

  /// Teach Mode: Start recording interaction steps.
  Future<Map<String, dynamic>> recordStart({
    required String appId,
    required String windowTitle,
    required String name,
    String description = '',
  }) async {
    return callTool('skill.record_start', {
      'app_id': appId,
      'window_title': windowTitle,
      'name': name,
      'description': description,
    });
  }

  /// Teach Mode: Record an action event.
  Future<Map<String, dynamic>> recordEvent(Map<String, dynamic> event) async {
    return callTool('skill.record_event', event);
  }

  /// Teach Mode: Stop recording and compile skill.
  Future<Map<String, dynamic>> recordStop({
    Map<String, dynamic>? params,
  }) async {
    return callTool('skill.record_stop', {'params': params ?? {}});
  }

  /// Update a single effect policy through the running gateway.
  Future<bool> setPolicy(String effect, String action) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/v1/settings/policy'),
            headers: _headers,
            body: jsonEncode({'effect': effect, 'action': action}),
          )
          .timeout(const Duration(seconds: 5));
      if (response.body.isEmpty) return false;
      final result = jsonDecode(response.body) as Map<String, dynamic>;
      return response.statusCode == 200 && result['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  /// Get hardware / AI provider info.
  Future<HardwareProfile?> getHardwareInfo() async {
    final res = await callTool('providers.detect');
    if (res['ok'] == true) {
      final data = res['data'] as Map<String, dynamic>?;
      if (data != null) return HardwareProfile.fromJson(data);
    }
    return null;
  }

  /// Connect an AI client by writing its MCP config file.
  Future<Map<String, dynamic>> connectClient(
    String clientId, {
    String workingDir = 'D:\\claude\\appbridge',
  }) async {
    try {
      final res = await Process.run('node', [
        'packages/cli/dist/index.js',
        'connect',
        '--client',
        clientId,
      ], workingDirectory: workingDir);
      if (res.exitCode == 0) {
        return {'ok': true, 'output': res.stdout.toString()};
      } else {
        return {'ok': false, 'error': res.stderr.toString()};
      }
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }

  /// Restore configuration backup for an AI client.
  Future<Map<String, dynamic>> undoClient(
    String clientId, {
    String workingDir = 'D:\\claude\\appbridge',
  }) async {
    try {
      final res = await Process.run('node', [
        'packages/cli/dist/index.js',
        'connect',
        '--undo',
        clientId,
      ], workingDirectory: workingDir);
      if (res.exitCode == 0) {
        return {'ok': true, 'output': res.stdout.toString()};
      } else {
        return {'ok': false, 'error': res.stderr.toString()};
      }
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }

  /// Tail audit log records.
  Future<List<AuditLogItem>> getAuditTail({int limit = 50}) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/v1/audit?limit=$limit'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final inner = data['data'] as Map<String, dynamic>?;
        final records = inner?['records'] as List? ?? [];
        return records
            .map((r) => AuditLogItem.fromJson(r as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}
    return [];
  }
}
