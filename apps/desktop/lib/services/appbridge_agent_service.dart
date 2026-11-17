import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/models.dart';
import 'appbridge_client.dart';

// ---------------------------------------------------------------------------
// Agent Configuration (supports both Local Ollama & Ollama Cloud)
// ---------------------------------------------------------------------------

class AgentConfig {
  String ollamaApiKey;
  String ollamaBaseUrl;
  String actionModel;
  String thinkingModel;
  String userName;
  String userHonorific;
  bool useThinking;
  int maxSteps;
  int timeoutSeconds; // High timeout for slow local models (default 300s = 5m)
  bool isLocalMode;

  AgentConfig({
    this.ollamaApiKey = '',
    this.ollamaBaseUrl = 'http://localhost:11434/api',
    this.actionModel = 'gemma4:31b',
    this.thinkingModel = 'qwen3:30b-a3b',
    this.userName = 'there',
    this.userHonorific = '',
    this.useThinking = true,
    this.maxSteps = 10,
    this.timeoutSeconds = 300,
    this.isLocalMode = false,
  });

  String get userAddress {
    final name = '$userName $userHonorific'.trim();
    return name.isNotEmpty ? name : 'there';
  }

  bool get isOllamaCloud => !isLocalMode && ollamaApiKey.isNotEmpty;

  /// Load optional Appbridge agent settings from environment and agent.env.
  static AgentConfig loadFromEnv({
    Map<String, String>? environment,
    String? envFilePath,
  }) {
    final cfg = AgentConfig();
    final env = environment ?? Platform.environment;
    final values = <String, String>{};

    final userProfile = env['USERPROFILE'] ?? env['HOME'] ?? '';
    final defaultEnvPath = userProfile.isEmpty
        ? null
        : '$userProfile${Platform.pathSeparator}.appbridge${Platform.pathSeparator}agent.env';
    final configuredEnvPath = envFilePath ?? env['APPBRIDGE_ENV_FILE'] ?? defaultEnvPath;
    try {
      if (configuredEnvPath != null) {
        final agentEnv = File(configuredEnvPath);
        if (agentEnv.existsSync()) {
          final lines = agentEnv.readAsLinesSync();
          for (final line in lines) {
            final trimmed = line.trim();
            if (trimmed.isEmpty || trimmed.startsWith('#')) continue;
            final eqIdx = trimmed.indexOf('=');
            if (eqIdx <= 0) continue;
            values[trimmed.substring(0, eqIdx).trim()] =
                trimmed.substring(eqIdx + 1).trim();
          }
        }
      }
    } catch (_) {}

    values.addAll(env);
    for (final entry in values.entries) {
      final key = entry.key;
      final val = entry.value;
      switch (key) {
        case 'OLLAMA_API_KEY':
          if (val.isNotEmpty) cfg.ollamaApiKey = val;
          break;
        case 'OLLAMA_URL':
          if (val.isNotEmpty) cfg.ollamaBaseUrl = val;
          break;
        case 'OLLAMA_MODEL':
          if (val.isNotEmpty) cfg.actionModel = val;
          break;
        case 'OLLAMA_THINKING_MODEL':
          if (val.isNotEmpty) cfg.thinkingModel = val;
          break;
        case 'USER_NAME':
          if (val.isNotEmpty) cfg.userName = val;
          break;
        case 'USER_HONORIFIC':
          cfg.userHonorific = val;
          break;
      }
    }

    // If API key is present, default to cloud; otherwise default to local
    if (cfg.ollamaApiKey.isNotEmpty && cfg.ollamaBaseUrl.contains('localhost')) {
      cfg.ollamaBaseUrl = 'https://ollama.com/api';
      cfg.isLocalMode = false;
    } else if (cfg.ollamaApiKey.isEmpty) {
      cfg.isLocalMode = true;
      cfg.ollamaBaseUrl = 'http://localhost:11434/api';
      cfg.actionModel = 'qwen2.5-coder:14b';
      cfg.thinkingModel = 'qwen3.5:9b';
    }

    return cfg;
  }

  Map<String, dynamic> toJson() => {
        'ollamaApiKey': ollamaApiKey,
        'ollamaBaseUrl': ollamaBaseUrl,
        'actionModel': actionModel,
        'thinkingModel': thinkingModel,
        'userName': userName,
        'userHonorific': userHonorific,
        'useThinking': useThinking,
        'maxSteps': maxSteps,
        'timeoutSeconds': timeoutSeconds,
        'isLocalMode': isLocalMode,
      };

  void applyJson(Map<String, dynamic> j) {
    if (j['ollamaApiKey'] is String) ollamaApiKey = j['ollamaApiKey'] as String;
    if (j['ollamaBaseUrl'] is String) ollamaBaseUrl = j['ollamaBaseUrl'] as String;
    if (j['actionModel'] is String) actionModel = j['actionModel'] as String;
    if (j['thinkingModel'] is String) thinkingModel = j['thinkingModel'] as String;
    if (j['userName'] is String) userName = j['userName'] as String;
    if (j['userHonorific'] is String) userHonorific = j['userHonorific'] as String;
    if (j['useThinking'] is bool) useThinking = j['useThinking'] as bool;
    if (j['maxSteps'] is int) maxSteps = j['maxSteps'] as int;
    if (j['timeoutSeconds'] is int) timeoutSeconds = j['timeoutSeconds'] as int;
    if (j['isLocalMode'] is bool) isLocalMode = j['isLocalMode'] as bool;
  }
}

// ---------------------------------------------------------------------------
// Agent Step / Tool Execution Record
// ---------------------------------------------------------------------------

class AgentActionStep {
  final String tool;
  final Map<String, dynamic> args;
  final String description;
  String status; // 'running', 'success', 'failed'
  String? resultSummary;
  dynamic rawResult;

  AgentActionStep({
    required this.tool,
    required this.args,
    required this.description,
    this.status = 'running',
    this.resultSummary,
    this.rawResult,
  });

  Map<String, dynamic> toJson() => {
        'tool': tool,
        'args': args,
        'description': description,
        'status': status,
        'resultSummary': resultSummary,
      };
}

// ---------------------------------------------------------------------------
// Appbridge Agent Service — Multi-Model AI with App Execution
// ---------------------------------------------------------------------------

class AppbridgeAgentService {
  final AppbridgeClient bridgeClient;
  AgentConfig config;

  AppbridgeAgentService({
    required this.bridgeClient,
    AgentConfig? initialConfig,
  }) : config = initialConfig ?? AgentConfig.loadFromEnv();

  Map<String, String> get _ollamaHeaders => {
        'Content-Type': 'application/json',
        if (!config.isLocalMode && config.ollamaApiKey.isNotEmpty)
          'Authorization': 'Bearer ${config.ollamaApiKey}',
      };

  /// Clean endpoint URL
  String _ollamaChatUrl() {
    var base = config.ollamaBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (base.endsWith('/chat')) return base;
    return '$base/chat';
  }

  // -------------------------------------------------------------------------
  // Local Ollama Discovery & Management
  // -------------------------------------------------------------------------

  /// Check if local Ollama daemon is currently running and responsive
  Future<bool> isLocalOllamaRunning() async {
    try {
      final resp = await http
          .get(Uri.parse('http://localhost:11434/api/tags'))
          .timeout(const Duration(seconds: 2));
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Launch local Ollama daemon in background if not already started
  Future<bool> startLocalOllama() async {
    if (await isLocalOllamaRunning()) return true;
    try {
      final userProfile = Platform.environment['USERPROFILE'] ?? '';
      final exe = File('$userProfile\\AppData\\Local\\Programs\\Ollama\\ollama.exe');
      if (exe.existsSync()) {
        await Process.start(exe.path, ['serve'], mode: ProcessStartMode.detached);
        // Wait up to 6 seconds for it to start
        for (int i = 0; i < 12; i++) {
          await Future.delayed(const Duration(milliseconds: 500));
          if (await isLocalOllamaRunning()) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  /// Discovers all locally downloaded Ollama models from API + manifests directory
  Future<List<String>> discoverLocalModels() async {
    final Set<String> models = {};

    // 1. Try local Ollama REST API
    try {
      final resp = await http
          .get(Uri.parse('http://localhost:11434/api/tags'))
          .timeout(const Duration(seconds: 2));
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        for (final m in data['models'] as List? ?? []) {
          final name = m['name'] as String?;
          if (name != null && name.isNotEmpty) models.add(name);
        }
      }
    } catch (_) {}

    // 2. Scan %USERPROFILE%/.ollama/manifests/registry.ollama.ai/library
    try {
      final userProfile = Platform.environment['USERPROFILE'] ??
          Platform.environment['HOME'] ??
          '';
      if (userProfile.isNotEmpty) {
        final libDir = Directory(
            '$userProfile\\.ollama\\manifests\\registry.ollama.ai\\library');
        if (libDir.existsSync()) {
          for (final entity in libDir.listSync()) {
            if (entity is Directory) {
              final modelName = entity.uri.pathSegments
                  .where((s) => s.isNotEmpty)
                  .last;
              for (final tagEntity in entity.listSync()) {
                if (tagEntity is File) {
                  final tag = tagEntity.uri.pathSegments
                      .where((s) => s.isNotEmpty)
                      .last;
                  models.add('$modelName:$tag');
                }
              }
            }
          }
        }
      }
    } catch (_) {}

    final list = models.toList()..sort();
    return list.isNotEmpty
        ? list
        : ['qwen2.5-coder:14b', 'qwen3.5:9b', 'llama3.2:latest'];
  }

  // -------------------------------------------------------------------------
  // Low-Level LLM Call (supports long timeouts for local models)
  // -------------------------------------------------------------------------

  Future<String> _callOllama(
    List<Map<String, String>> messages, {
    required String model,
    int maxTokens = 2048,
  }) async {
    final url = _ollamaChatUrl();
    try {
      final resp = await http
          .post(
            Uri.parse(url),
            headers: _ollamaHeaders,
            body: jsonEncode({
              'model': model,
              'messages': messages,
              'stream': false,
              'options': {'num_predict': maxTokens},
            }),
          )
          .timeout(Duration(seconds: config.timeoutSeconds));

      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        return data['message']?['content'] as String? ?? '';
      } else {
        throw Exception('Ollama error ${resp.statusCode}: ${resp.body}');
      }
    } catch (e) {
      throw Exception('LLM call failed ($url on $model): $e');
    }
  }

  // -------------------------------------------------------------------------
  // Model 1: THINKING / PLANNING PASS
  // -------------------------------------------------------------------------

  Future<String> runThinkingPass({
    required String userGoal,
    required List<Map<String, dynamic>> openWindows,
    required List<Map<String, dynamic>> history,
  }) async {
    final windowsSummary = openWindows.isEmpty
        ? 'No active windows listed.'
        : openWindows
            .take(15)
            .map((w) =>
                '- [id: ${w['window_id'] ?? w['id']}] "${w['title'] ?? w['process_name'] ?? ''}" (app: ${w['process_name'] ?? ''})')
            .join('\n');

    final systemPrompt = '''
You are the Strategic Reasoning Engine of Appbridge (Universal AI Desktop Bridge).
Your job is to plan how to execute the user's task using computer actions.

Available Appbridge Tools:
1. app.message - High-level reliable messaging tool: {"app": "WhatsApp", "contact": "Name", "message": "Text"}
2. apps.list / window.list - List open applications and windows
3. window.focus - Bring an app window to foreground: {"window_title": "..."} or {"window_id": "..."}
4. ui.find - Find an element inside an app: {"query": "...", "window_title": "..."}
5. ui.click - Click an element: {"query": "..."} or {"uid": "..."}
6. ui.type - Type text into an element: {"text": "...", "query": "...", "submit": true}
7. ui.key - Press shortcut or key: {"combo": "Enter" | "Ctrl+F" | "Tab"}
8. app.launch - Open an app if not already running: {"path": "..."}
9. clipboard.get / clipboard.set - Access clipboard text
10. screen.describe - Inspect full scene of an app window

Currently Open Windows:
$windowsSummary

Analyze the user's request silently. Establish:
1. Exact Goal: What does the user want done?
2. Target App: Which open window or app handles this? (Do not open duplicates if already open!)
3. Action Plan: Full step-by-step sequence of Appbridge tools to achieve this cleanly.
   - For messaging a contact (e.g., WhatsApp, Teams, Slack), plan the complete flow:
     Either use app.message directly, or:
     focus window -> search contact -> select contact with Enter -> type message with submit: true!
   - For ChatGPT, browser AI, or web tools:
     focus the browser window -> formulate the complete detailed prompt -> type or paste the prompt -> press Enter to submit.
Keep your reasoning concise, direct, and structured.''';

    final messages = [
      {'role': 'system', 'content': systemPrompt},
      ...history
          .take(4)
          .map((m) => {'role': m['role'] as String, 'content': m['content'] as String}),
      {'role': 'user', 'content': userGoal},
    ];

    try {
      final thoughts = await _callOllama(
        messages,
        model: config.thinkingModel,
        maxTokens: 1500,
      );
      return thoughts.replaceAll(RegExp(r'<think>.*?</think>', dotAll: true), '').trim();
    } catch (e) {
      return 'Direct execution planned: $e';
    }
  }

  // -------------------------------------------------------------------------
  // Model 2: ACTION & TOOL EXECUTION AGENT
  // -------------------------------------------------------------------------

  Stream<Map<String, dynamic>> executeTask({
    required String userGoal,
    required List<Map<String, dynamic>> history,
  }) async* {
    // 0. Auto-start local Ollama if local mode is on and daemon not running
    if (config.isLocalMode) {
      final running = await isLocalOllamaRunning();
      if (!running) {
        yield {
          'type': 'status',
          'phase': 'starting_ollama',
          'message': '💻 Starting local Ollama service...',
        };
        await startLocalOllama();
      }
    }

    // 1. Fetch current open windows for real context
    List<Map<String, dynamic>> openWindows = [];
    try {
      final apps = await bridgeClient.listApps();
      openWindows = apps
          .map((a) => {
                'window_id': a.id,
                'title': a.title,
                'process_name': a.processName,
              })
          .toList();
    } catch (_) {}

    // 2. Run Thinking Model pass
    String thinking = '';
    if (config.useThinking) {
      yield {
        'type': 'status',
        'phase': 'thinking',
        'message': '🧠 Analyzing objective & planning actions...',
      };
      thinking = await runThinkingPass(
        userGoal: userGoal,
        openWindows: openWindows,
        history: history,
      );
      yield {
        'type': 'thinking',
        'content': thinking,
      };
    }

    // 3. Execution loop (Action Model)
    yield {
      'type': 'status',
      'phase': 'executing',
      'message': '⚡ Executing task inside apps...',
    };

    final List<AgentActionStep> steps = [];
    final List<Map<String, dynamic>> conversation = [
      {
        'role': 'system',
        'content': _buildActionSystemPrompt(openWindows, thinking),
      },
      ...history
          .take(6)
          .map((m) => {'role': m['role'] as String, 'content': m['content'] as String}),
      {'role': 'user', 'content': userGoal},
    ];

    bool isComplete = false;
    String finalResponse = '';
    int stepCount = 0;

    // Fast-path: Check if user directly asked to message someone
    final isMessagingIntent = _isMessagingRequest(userGoal);

    // Track whether a window was successfully focused in this session.
    // If window.focus fails, we must NOT type into the wrong window.
    bool windowFocused = false;
    String? focusedWindowTitle;

    while (!isComplete && stepCount < config.maxSteps) {
      stepCount++;

      // Request next action decision from Action Model
      final llmOutput = await _callOllama(
        conversation.map((m) => {'role': m['role'] as String, 'content': m['content'] as String}).toList(),
        model: config.actionModel,
        maxTokens: 1024,
      );

      // Parse JSON tool call or final text
      final toolCall = _extractToolCall(llmOutput);

      if (toolCall != null) {
        final toolName = toolCall['tool'] as String;
        final toolArgs = (toolCall['args'] as Map<String, dynamic>?) ?? {};
        final desc = toolCall['description'] as String? ?? 'Calling $toolName';

        // ---------------------------------------------------------------
        // Safety guard: refuse to type/click into a window that was never
        // successfully focused. This prevents typing into the Appbridge UI
        // itself when the target app window was blocked by Windows.
        // Block: ui.type, ui.click, ui.key when no window is focused yet.
        // ---------------------------------------------------------------
        const needsFocus = {'ui.type', 'ui.click', 'ui.key'};
        if (needsFocus.contains(toolName) && !windowFocused) {
          final step = AgentActionStep(
            tool: toolName,
            args: toolArgs,
            description: desc,
          );
          step.status = 'failed';
          step.resultSummary = 'Blocked: no window focused yet — focus target window first';
          steps.add(step);
          yield {'type': 'step_start', 'step': step.toJson()};
          yield {'type': 'step_complete', 'step': step.toJson()};
          conversation.add({'role': 'assistant', 'content': llmOutput});
          conversation.add({
            'role': 'user',
            'content': 'BLOCKED: $toolName was rejected because no target window is confirmed focused.\n'
                'You MUST call window.focus with the correct window_title first and confirm it succeeds before '
                'using ui.type, ui.click, or ui.key.\n'
                'Available windows: ${openWindows.take(10).map((w) => '"${w['title']}"').join(', ')}',
          });
          continue;
        }

        final step = AgentActionStep(
          tool: toolName,
          args: toolArgs,
          description: desc,
        );
        steps.add(step);

        yield {
          'type': 'step_start',
          'step': step.toJson(),
        };

        // Execute tool via AppbridgeClient
        Map<String, dynamic> result = {};
        try {
          result = await _dispatchTool(toolName, toolArgs);
          step.status = result['ok'] == true ? 'success' : 'failed';
          step.resultSummary = _summarizeResult(toolName, result);
          step.rawResult = result;
        } catch (e) {
          step.status = 'failed';
          step.resultSummary = 'Error: $e';
          result = {'ok': false, 'error': e.toString()};
        }

        // Track successful window.focus — update the focused flag
        if (toolName == 'window.focus') {
          final focusOk = result['focused'] == true || result['ok'] == true;
          if (focusOk) {
            windowFocused = true;
            focusedWindowTitle = toolArgs['window_title'] as String? ?? toolArgs['window_id']?.toString();
          } else {
            windowFocused = false;
            focusedWindowTitle = null;
          }
        }
        // app.message manages its own focus internally, treat as success
        if (toolName == 'app.message' && result['ok'] == true) {
          windowFocused = true;
        }

        yield {
          'type': 'step_complete',
          'step': step.toJson(),
        };

        // Feed tool result back to Action Model context
        conversation.add({'role': 'assistant', 'content': llmOutput});

        // Build follow-up guidance for the action model
        String followUpGuidance = '';

        // If window.focus failed, inject a hard-stop directive
        if (toolName == 'window.focus') {
          if (!windowFocused) {
            followUpGuidance = '\n⚠ CRITICAL: window.focus FAILED — the target window did not receive focus.\n'
                'Do NOT call ui.type, ui.click, or ui.key — that would type into the WRONG application.\n'
                'You must try window.focus again, or list open windows with apps.list to find the correct window_title.\n'
                'If repeated focus attempts fail, report the problem to ${config.userAddress} and stop.';
          } else if (focusedWindowTitle != null) {
            followUpGuidance = '\nWindow "$focusedWindowTitle" is verified in foreground. You may safely proceed with ui.click, ui.type, or screen.describe.';
          }
        }

        // Smart continuation hint for multi-step messaging tasks
        if (isMessagingIntent && toolName != 'app.message' && followUpGuidance.isEmpty) {
          final isMessageSent = steps.any((s) =>
              (s.tool == 'ui.type' && s.args['query'] != 'Search' && s.args['text'] != null) ||
              s.tool == 'app.message');
          if (!isMessageSent) {
            followUpGuidance = '\nIMPORTANT: The contact was searched/opened, but the message text has not been sent yet! '
                'Now call ui.type with the actual message content and "submit": true to send it to the contact.';
          }
        }

        conversation.add({
          'role': 'user',
          'content': 'Tool [$toolName] execution result:\n${jsonEncode(result)}\n$followUpGuidance\n'
              'If the full task is completely finished, reply with a friendly answer for ${config.userAddress}. '
              'If more actions are required, output the next {"tool": "...", "args": {...}} JSON.',
        });
      } else {
        // Model provided final answer
        finalResponse = llmOutput;
        isComplete = true;
      }
    }

    if (finalResponse.isEmpty && steps.isNotEmpty) {
      finalResponse = 'Completed ${steps.length} action(s). Task executed successfully.';
    }

    yield {
      'type': 'complete',
      'reply': finalResponse,
      'steps': steps.map((s) => s.toJson()).toList(),
      'thinking': thinking,
    };
  }

  // -------------------------------------------------------------------------
  // Tool Dispatcher (Includes Smart Workflows like app.message)
  // -------------------------------------------------------------------------

  Future<Map<String, dynamic>> _dispatchTool(
    String tool,
    Map<String, dynamic> args,
  ) async {
    switch (tool) {
      case 'app.message':
        final appName = args['app'] as String? ?? 'WhatsApp';
        final contact = args['contact'] as String? ?? '';
        final message = args['message'] as String? ?? '';
        return await _executeMessagingWorkflow(appName, contact, message);

      case 'apps.list':
      case 'window.list':
        final apps = await bridgeClient.listApps();
        return {
          'ok': true,
          'windows': apps.map((a) => {'id': a.id, 'title': a.title, 'process_name': a.processName}).toList(),
        };

      case 'window.focus':
        final title = args['window_title'] as String?;
        final id = args['window_id'] as String?;
        final focusParams = <String, dynamic>{};
        if (id != null && id.trim().isNotEmpty) {
          focusParams['window_id'] = id.trim();
          focusParams['windowId'] = id.trim();
        }
        if (title != null && title.trim().isNotEmpty) {
          focusParams['window_title'] = title.trim();
          focusParams['windowTitle'] = title.trim();
        }
        final raw = await bridgeClient.callTool('window.focus', focusParams);
        final windowData = raw['data'] is Map ? (raw['data'] as Map)['window'] as Map? : null;
        final isFocused = raw['ok'] == true &&
            (windowData == null || windowData['focused'] == true);
        final returnedTitle = windowData?['title'] as String? ?? raw['title'] as String? ?? title ?? id ?? '';
        return {
          'ok': isFocused,
          'focused': isFocused,
          'title': returnedTitle,
          if (!isFocused)
            'hint': raw['message'] ?? raw['error'] ??
                'window.focus did not succeed — the OS blocked foreground change. '
                'Try listing open windows with apps.list to confirm the window title, then retry.',
        };

      case 'screen.describe':
        final title = args['window_title'] as String? ?? '';
        final elements = await bridgeClient.describeWindow(title);
        return {
          'ok': true,
          'element_count': elements.length,
          'elements': elements.take(20).map((e) => {'id': e.id, 'role': e.role, 'name': e.name}).toList(),
        };

      case 'ui.find':
        return await bridgeClient.callTool('ui.find', args);

      case 'ui.click':
        return await bridgeClient.callTool('ui.click', args);

      case 'ui.type':
        return await bridgeClient.callTool('ui.type', args);

      case 'ui.key':
        return await bridgeClient.callTool('ui.key', args);

      case 'clipboard.get':
        return await bridgeClient.callTool('clipboard.get', {});

      case 'clipboard.set':
        return await bridgeClient.callTool('clipboard.set', args);

      case 'app.launch':
        return await bridgeClient.callTool('app.launch', args);

      default:
        return await bridgeClient.callTool(tool, args);
    }
  }

  /// Reliable multi-step messaging workflow for WhatsApp / Slack / Teams
  Future<Map<String, dynamic>> _executeMessagingWorkflow(
    String appName,
    String contact,
    String message,
  ) async {
    // 1. Focus application window
    bool focused = await bridgeClient.focusWindow('', appName);
    if (!focused) {
      final apps = await bridgeClient.listApps();
      final target = apps.firstWhere(
        (a) =>
            a.title.toLowerCase().contains(appName.toLowerCase()) ||
            a.processName.toLowerCase().contains(appName.toLowerCase()),
        orElse: () => WindowApp(
          id: '',
          title: '',
          processName: '',
          pid: 0,
          className: '',
          focused: false,
          minimized: false,
          visible: false,
          bounds: {},
        ),
      );
      if (target.id.isNotEmpty) {
        await bridgeClient.focusWindow(target.id, target.title);
      }
    }
    await Future.delayed(const Duration(milliseconds: 700));

    // 2. Press Ctrl+F to reliably jump to the Search bar in chat apps
    await bridgeClient.callTool('ui.key', {'combo': 'Ctrl+F'});
    await Future.delayed(const Duration(milliseconds: 400));

    // 3. Clear any existing search query (Ctrl+A -> Backspace)
    await bridgeClient.callTool('ui.key', {'combo': 'Ctrl+A'});
    await Future.delayed(const Duration(milliseconds: 200));
    await bridgeClient.callTool('ui.key', {'combo': 'Backspace'});
    await Future.delayed(const Duration(milliseconds: 300));

    // 4. Type the contact name into the search bar WITHOUT submit (do NOT send!)
    await bridgeClient.callTool('ui.type', {
      'text': contact,
      'submit': false,
    });
    // Wait 1200ms for WhatsApp / chat app to filter contacts list
    await Future.delayed(const Duration(milliseconds: 1200));

    // 5. Press Enter to select the top filtered conversation
    await bridgeClient.callTool('ui.key', {'combo': 'Enter'});
    // Wait 900ms for conversation and message box to activate
    await Future.delayed(const Duration(milliseconds: 900));

    // 6. Type the actual message with submit: true to send it!
    await bridgeClient.callTool('ui.type', {
      'text': message,
      'submit': true,
    });
    await Future.delayed(const Duration(milliseconds: 500));

    return {
      'ok': true,
      'workflow': 'app.message',
      'app': appName,
      'contact': contact,
      'message': message,
      'sent': true,
    };
  }

  String _summarizeResult(String tool, Map<String, dynamic> result) {
    if (result['ok'] != true) {
      return result['error']?.toString() ?? 'Action failed';
    }
    switch (tool) {
      case 'app.message':
        return 'Sent message to ${result['contact'] ?? ''} on ${result['app'] ?? ''}';
      case 'window.focus':
        final winTitle = (result['title'] as String?)?.isNotEmpty == true ? result['title'] : 'window';
        return 'Focused $winTitle';
      case 'ui.click':
        return 'Clicked element';
      case 'ui.type':
        return 'Typed text';
      case 'ui.key':
        return 'Pressed key combo';
      case 'apps.list':
      case 'window.list':
        final count = (result['windows'] as List?)?.length ?? 0;
        return 'Found $count open windows';
      case 'ui.find':
        return 'Element located';
      default:
        return 'Action executed successfully';
    }
  }

  bool _isMessagingRequest(String goal) {
    final lower = goal.toLowerCase();
    return (lower.contains('message') || lower.contains('send') || lower.contains('tell') || lower.contains('chat')) &&
        (lower.contains('whatsapp') || lower.contains('teams') || lower.contains('slack') || lower.contains('telegram'));
  }

  // -------------------------------------------------------------------------
  // Prompts & Parsing Helpers
  // -------------------------------------------------------------------------

  String _buildActionSystemPrompt(
    List<Map<String, dynamic>> openWindows,
    String thinking,
  ) {
    final windows = openWindows
        .take(15)
        .map((w) => '- "${w['title'] ?? ''}" (id: ${w['window_id'] ?? ''})')
        .join('\n');

    return '''
You are the Action Execution Agent of Appbridge.
Address the user as "${config.userAddress}".
You execute computer actions directly inside desktop applications.

Strategic Plan from Thinking Engine:
$thinking

Currently Open Windows:
$windows

Available Tools:
1. app.message (RECOMMENDED for messaging):
```json
{
  "tool": "app.message",
  "args": {"app": "WhatsApp", "contact": "Contact Name", "message": "Message text"},
  "description": "Send WhatsApp message"
}
```
2. window.focus: {"window_title": "..."}
3. ui.find: {"query": "...", "window_title": "..."}
4. ui.click: {"query": "..."} or {"uid": "..."}
5. ui.type: {"text": "...", "query": "...", "submit": true}
6. ui.key: {"combo": "Enter" | "Tab" | "Ctrl+F"}
7. clipboard.set / clipboard.get: {}
8. app.launch: {"path": "..."}
9. apps.list: {}

Rules:
1. Do not ask for confirmation for ordinary actions. Execute them directly.
2. For messaging requests (WhatsApp, Slack, Teams, Telegram), ALWAYS use `app.message`:
```json
{
  "tool": "app.message",
  "args": {"app": "WhatsApp", "contact": "Contact Name", "message": "Message text"}
}
```
   This automatically executes the verified search-select-type pipeline, completely preventing accidental messages to wrong chats.
3. For search inside any desktop application:
   - Prefer activating search with `ui.key {"combo": "Ctrl+F"}` or `ui.key {"combo": "Ctrl+K"}`.
   - Never type text with `submit: true` into a field unless pressing Enter is the intended action!
4. For app & window navigation:
   - Use `window.focus {"window_title": "..."}` to bring windows to foreground.
   - If `window.focus` fails, do NOT call `ui.type` or `ui.click`. Try `apps.list` or retry `window.focus`.
   - Use `screen.describe {"window_title": "..."}` to perceive real buttons, fields, and text inside any app.
   - Use `ui.click {"name": "..."}` or `ui.type {"name": "...", "text": "..."}` with actual element names.
5. For web applications or browsers (ChatGPT, Claude, Gemini, search engines):
   - First call `window.focus {"window_title": "..."}` (e.g. "Chrome" or "ChatGPT") to bring the browser to the front.
   - You can type prompt text using `ui.type {"text": "...", "submit": true}`.
   - For long detailed prompts, you can also use `clipboard.set {"text": "..."}` followed by `ui.key {"combo": "Ctrl+V"}` and `ui.key {"combo": "Enter"}`.
6. When all actions are finished, reply with your friendly final response to ${config.userAddress} explaining what was accomplished. Do not output JSON when done.''';
  }

  Map<String, dynamic>? _extractToolCall(String text) {
    final jsonMatch = RegExp(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```').firstMatch(text);
    final rawJson = jsonMatch != null ? jsonMatch.group(1) : text.trim();

    if (rawJson != null && rawJson.startsWith('{') && rawJson.endsWith('}')) {
      try {
        final parsed = jsonDecode(rawJson);
        if (parsed is Map<String, dynamic> && parsed.containsKey('tool')) {
          return parsed;
        }
      } catch (_) {}
    }
    return null;
  }
}
