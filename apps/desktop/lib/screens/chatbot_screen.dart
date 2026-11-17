import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/appbridge_client.dart';
import '../services/appbridge_agent_service.dart';
import '../theme/app_theme.dart';

// ---------------------------------------------------------------------------
// Chat message with action execution steps
// ---------------------------------------------------------------------------

class AgentChatMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime at;
  final String? thinking;
  final List<AgentActionStep> steps;
  final bool isExecuting;

  AgentChatMessage({
    required this.role,
    required this.content,
    required this.at,
    this.thinking,
    List<AgentActionStep>? steps,
    this.isExecuting = false,
  }) : steps = steps ?? [];

  AgentChatMessage copyWith({
    String? content,
    String? thinking,
    List<AgentActionStep>? steps,
    bool? isExecuting,
  }) =>
      AgentChatMessage(
        role: role,
        content: content ?? this.content,
        at: at,
        thinking: thinking ?? this.thinking,
        steps: steps ?? this.steps,
        isExecuting: isExecuting ?? this.isExecuting,
      );
}

// ---------------------------------------------------------------------------
// Chatbot Screen — Native Appbridge Agent
// ---------------------------------------------------------------------------

class ChatbotScreen extends StatefulWidget {
  final AppbridgeClient client;

  const ChatbotScreen({super.key, required this.client});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  late final AppbridgeAgentService _agentService;
  final List<AgentChatMessage> _messages = [];
  bool _sending = false;
  bool _showSettings = false;
  String _currentStatus = '';
  String? _currentThinking;
  int _elapsedSeconds = 0;
  Timer? _elapsedTimer;

  List<String> _localModels = [];
  bool _isLocalDaemonRunning = false;
  bool _scanningLocalModels = false;

  final TextEditingController _inputCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  final FocusNode _inputFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _agentService = AppbridgeAgentService(bridgeClient: widget.client);
    _refreshLocalModels();
  }

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _inputFocus.dispose();
    super.dispose();
  }

  Future<void> _refreshLocalModels() async {
    setState(() => _scanningLocalModels = true);
    final running = await _agentService.isLocalOllamaRunning();
    final models = await _agentService.discoverLocalModels();
    if (mounted) {
      setState(() {
        _isLocalDaemonRunning = running;
        _localModels = models;
        _scanningLocalModels = false;
      });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty || _sending) return;

    _inputCtrl.clear();
    _elapsedSeconds = 0;
    _elapsedTimer?.cancel();
    _elapsedTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsedSeconds++);
    });

    setState(() {
      _sending = true;
      _currentStatus = 'Analyzing request...';
      _currentThinking = null;
      _messages.add(AgentChatMessage(
        role: 'user',
        content: text,
        at: DateTime.now(),
      ));
      // Placeholder for assistant response
      _messages.add(AgentChatMessage(
        role: 'assistant',
        content: '',
        at: DateTime.now(),
        isExecuting: true,
      ));
    });
    _scrollToBottom();

    final currentSteps = <AgentActionStep>[];
    String finalContent = '';
    String? thinkingContent;

    try {
      final history = _messages
          .where((m) => m.content.isNotEmpty)
          .map((m) => {'role': m.role, 'content': m.content})
          .toList();

      await for (final event in _agentService.executeTask(
        userGoal: text,
        history: history,
      )) {
        final type = event['type'] as String? ?? '';

        if (type == 'status') {
          setState(() {
            _currentStatus = event['message'] as String? ?? '';
          });
        } else if (type == 'thinking') {
          thinkingContent = event['content'] as String?;
          setState(() {
            _currentThinking = thinkingContent;
          });
        } else if (type == 'step_start') {
          final stepJson = event['step'] as Map<String, dynamic>;
          final step = AgentActionStep(
            tool: stepJson['tool'] as String,
            args: stepJson['args'] as Map<String, dynamic>? ?? {},
            description: stepJson['description'] as String? ?? '',
            status: 'running',
          );
          currentSteps.add(step);
          _updateLastMessage(steps: List.from(currentSteps));
        } else if (type == 'step_complete') {
          final stepJson = event['step'] as Map<String, dynamic>;
          final tool = stepJson['tool'] as String;
          final idx = currentSteps.lastIndexWhere((s) => s.tool == tool && s.status == 'running');
          if (idx >= 0) {
            currentSteps[idx].status = stepJson['status'] as String? ?? 'success';
            currentSteps[idx].resultSummary = stepJson['resultSummary'] as String?;
          }
          _updateLastMessage(steps: List.from(currentSteps));
        } else if (type == 'complete') {
          finalContent = event['reply'] as String? ?? '';
          _updateLastMessage(
            content: finalContent,
            thinking: thinkingContent,
            steps: List.from(currentSteps),
            isExecuting: false,
          );
        }
      }
    } catch (e) {
      _updateLastMessage(
        content: 'Error while executing task: $e',
        steps: List.from(currentSteps),
        isExecuting: false,
      );
    } finally {
      _elapsedTimer?.cancel();
      setState(() {
        _sending = false;
        _currentStatus = '';
        _currentThinking = null;
        _elapsedSeconds = 0;
      });
      _scrollToBottom();
      _inputFocus.requestFocus();
    }
  }

  void _updateLastMessage({
    String? content,
    String? thinking,
    List<AgentActionStep>? steps,
    bool? isExecuting,
  }) {
    setState(() {
      final idx = _messages.lastIndexWhere((m) => m.role == 'assistant');
      if (idx >= 0) {
        _messages[idx] = _messages[idx].copyWith(
          content: content,
          thinking: thinking,
          steps: steps,
          isExecuting: isExecuting,
        );
      }
    });
    _scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildHeader(),
        if (_currentThinking != null) _buildThinkingBanner(_currentThinking!),
        if (_showSettings)
          Expanded(child: _buildSettingsView())
        else
          Expanded(
            child: _messages.isEmpty ? _buildEmptyState() : _buildMessageList(),
          ),
        if (!_showSettings) _buildInputBar(),
      ],
    );
  }

  // --- Header ---
  Widget _buildHeader() {
    final cfg = _agentService.config;

    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(bottom: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        children: [
          const Icon(Icons.smart_toy_rounded, size: 22, color: AppTheme.purple),
          const SizedBox(width: 10),
          const Text(
            'Appbridge AI Assistant',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(width: 12),
          // Mode badge
          if (cfg.isLocalMode)
            _badge('💻 Local Ollama', AppTheme.cyan)
          else
            _badge('☁️ Ollama Cloud', AppTheme.primary),
          const SizedBox(width: 6),
          // Model badges
          _badge('🧠 ${cfg.thinkingModel}', AppTheme.purple),
          const SizedBox(width: 6),
          _badge('⚡ ${cfg.actionModel}', AppTheme.primary),
          const Spacer(),
          // Live status text with elapsed timer
          if (_sending) ...[
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.purple),
            ),
            const SizedBox(width: 8),
            Text(
              _currentStatus.isNotEmpty
                  ? '$_currentStatus (${_elapsedSeconds}s)'
                  : 'Waiting for response (${_elapsedSeconds}s)...',
              style: const TextStyle(fontSize: 12, color: AppTheme.purple),
            ),
            const SizedBox(width: 12),
          ],
          IconButton(
            tooltip: _showSettings ? 'Back to Chat' : 'Agent & Model Settings',
            icon: Icon(
              _showSettings ? Icons.chat_rounded : Icons.tune_rounded,
              color: _showSettings ? AppTheme.primary : AppTheme.textSecondary,
            ),
            onPressed: () {
              setState(() => _showSettings = !_showSettings);
              if (_showSettings) _refreshLocalModels();
            },
          ),
        ],
      ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withAlpha(70)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
      ),
    );
  }

  Widget _buildThinkingBanner(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.purple.withAlpha(25),
        border: const Border(bottom: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        children: [
          const Icon(Icons.psychology_rounded, size: 16, color: AppTheme.purple),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '🧠 Thinking: $text',
              style: const TextStyle(fontSize: 11, color: AppTheme.purple),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  // --- Empty state ---
  Widget _buildEmptyState() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.purple.withAlpha(25),
              ),
              child: const Icon(Icons.rocket_launch_rounded,
                  size: 48, color: AppTheme.purple),
            ),
            const SizedBox(height: 20),
            Text(
              'Hello, ${_agentService.config.userAddress}!',
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _agentService.config.isLocalMode
                  ? 'Running locally via Ollama (${_agentService.config.actionModel}). I can control apps, focus windows, click elements, and message contacts.'
                  : 'Running via Ollama Cloud (${_agentService.config.actionModel}). I can control apps, focus windows, click elements, and message contacts.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                _suggestionChip('💬 Message Azka CA Lhr on WhatsApp: "khana khaa lia"'),
                _suggestionChip('📂 List all open applications and windows'),
                _suggestionChip('🔍 Focus Chrome and search for news'),
                _suggestionChip('📋 Read current clipboard content'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _suggestionChip(String label) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      backgroundColor: AppTheme.card,
      side: const BorderSide(color: AppTheme.border),
      onPressed: () {
        _inputCtrl.text = label.substring(2).trim();
        _inputFocus.requestFocus();
      },
    );
  }

  // --- Message list ---
  Widget _buildMessageList() {
    return ListView.builder(
      controller: _scrollCtrl,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      itemCount: _messages.length,
      itemBuilder: (ctx, i) => _buildMessageItem(_messages[i]),
    );
  }

  Widget _buildMessageItem(AgentChatMessage msg) {
    final isUser = msg.role == 'user';

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppTheme.purple.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.smart_toy_rounded,
                  size: 18, color: AppTheme.purple),
            ),
            const SizedBox(width: 12),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                // If assistant executed steps, show Action Card
                if (!isUser && msg.steps.isNotEmpty)
                  _buildActionStepsCard(msg.steps),

                // Main message bubble
                if (msg.content.isNotEmpty || msg.isExecuting)
                  Container(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.7,
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isUser ? AppTheme.primary : AppTheme.card,
                      borderRadius: BorderRadius.circular(12).copyWith(
                        topRight: isUser ? const Radius.circular(2) : null,
                        topLeft: !isUser ? const Radius.circular(2) : null,
                      ),
                      border: isUser ? null : Border.all(color: AppTheme.border),
                    ),
                    child: msg.isExecuting && msg.content.isEmpty
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: AppTheme.purple),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                _currentStatus.isNotEmpty
                                    ? '$_currentStatus (${_elapsedSeconds}s)'
                                    : 'Thinking & executing (${_elapsedSeconds}s)...',
                                style: const TextStyle(
                                    fontSize: 13, color: AppTheme.textSecondary),
                              ),
                            ],
                          )
                        : SelectableText(
                            msg.content,
                            style: TextStyle(
                              fontSize: 14,
                              height: 1.5,
                              color: isUser ? Colors.white : AppTheme.textPrimary,
                            ),
                          ),
                  ),

                // Copy button & timestamp for assistant
                if (!isUser && !msg.isExecuting && msg.content.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, left: 4),
                    child: Row(
                      children: [
                        Text(
                          _formatTime(msg.at),
                          style: const TextStyle(
                              fontSize: 10, color: AppTheme.textMuted),
                        ),
                        const SizedBox(width: 8),
                        InkWell(
                          onTap: () => Clipboard.setData(
                              ClipboardData(text: msg.content)),
                          child: const Icon(Icons.copy_rounded,
                              size: 13, color: AppTheme.textMuted),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 12),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.person_rounded,
                  size: 18, color: Colors.white),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActionStepsCard(List<AgentActionStep> steps) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.card.withAlpha(150),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.terminal_rounded, size: 14, color: AppTheme.cyan),
              const SizedBox(width: 6),
              Text(
                'Actions Executed (${steps.length})',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.cyan,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...steps.map((step) => _buildStepRow(step)),
        ],
      ),
    );
  }

  Widget _buildStepRow(AgentActionStep step) {
    final isRunning = step.status == 'running';
    final isSuccess = step.status == 'success';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (isRunning)
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.warning),
            )
          else
            Icon(
              isSuccess ? Icons.check_circle_rounded : Icons.cancel_rounded,
              size: 14,
              color: isSuccess ? AppTheme.success : AppTheme.danger,
            ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: AppTheme.border),
            ),
            child: Text(
              step.tool,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                color: AppTheme.purple,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              step.resultSummary ?? step.description,
              style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  // --- Input Bar ---
  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: _inputCtrl,
              focusNode: _inputFocus,
              maxLines: 5,
              minLines: 1,
              enabled: !_sending,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                hintText: 'Tell Appbridge what to do in your apps (e.g. message Azka on WhatsApp)...',
              ),
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: _sending ? null : _send,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(44, 44),
              padding: EdgeInsets.zero,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send_rounded, size: 20),
          ),
        ],
      ),
    );
  }

  // --- Settings View ---
  Widget _buildSettingsView() {
    final cfg = _agentService.config;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.tune_rounded, size: 24, color: AppTheme.primary),
                const SizedBox(width: 10),
                const Text(
                  'Agent & Ollama Settings',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const Spacer(),
                OutlinedButton.icon(
                  onPressed: () {
                    final imported = AgentConfig.loadFromEnv();
                    setState(() {
                      _agentService.config = imported;
                    });
                    _refreshLocalModels();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Agent settings reloaded from environment.'),
                        backgroundColor: AppTheme.success,
                      ),
                    );
                  },
                  icon: const Icon(Icons.download_rounded, size: 16),
                  label: const Text('Reload settings'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Switch seamlessly between local Ollama models and Ollama Cloud.',
              style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 20),

            // Mode Selector Toggle (Local vs Cloud)
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          cfg.isLocalMode = true;
                          cfg.ollamaBaseUrl = 'http://localhost:11434/api';
                          if (_localModels.isNotEmpty) {
                            cfg.actionModel = _localModels.first;
                            if (_localModels.length > 1) {
                              cfg.thinkingModel = _localModels[1];
                            }
                          }
                        });
                        _refreshLocalModels();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: cfg.isLocalMode ? AppTheme.cardHover : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.computer_rounded,
                                size: 16,
                                color: cfg.isLocalMode ? AppTheme.cyan : AppTheme.textMuted),
                            const SizedBox(width: 8),
                            Text(
                              '💻 Local Ollama (Downloaded)',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: cfg.isLocalMode ? FontWeight.w600 : FontWeight.normal,
                                color: cfg.isLocalMode ? AppTheme.textPrimary : AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          cfg.isLocalMode = false;
                          cfg.ollamaBaseUrl = 'https://ollama.com/api';
                          cfg.actionModel = 'gemma4:31b';
                          cfg.thinkingModel = 'qwen3:30b-a3b';
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: !cfg.isLocalMode ? AppTheme.cardHover : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.cloud_rounded,
                                size: 16,
                                color: !cfg.isLocalMode ? AppTheme.primary : AppTheme.textMuted),
                            const SizedBox(width: 8),
                            Text(
                              '☁️ Ollama Cloud',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: !cfg.isLocalMode ? FontWeight.w600 : FontWeight.normal,
                                color: !cfg.isLocalMode ? AppTheme.textPrimary : AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // If Local Mode, show local models library card
            if (cfg.isLocalMode) ...[
              _settingsCard(
                title: 'Installed Local Models',
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _isLocalDaemonRunning ? AppTheme.success : AppTheme.warning,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isLocalDaemonRunning
                            ? 'Ollama service active (http://localhost:11434)'
                            : 'Ollama service not running',
                        style: TextStyle(
                          fontSize: 12,
                          color: _isLocalDaemonRunning ? AppTheme.success : AppTheme.warning,
                        ),
                      ),
                      const Spacer(),
                      if (!_isLocalDaemonRunning)
                        TextButton.icon(
                          onPressed: () async {
                            final ok = await _agentService.startLocalOllama();
                            setState(() => _isLocalDaemonRunning = ok);
                          },
                          icon: const Icon(Icons.play_arrow_rounded, size: 14),
                          label: const Text('Start Service', style: TextStyle(fontSize: 12)),
                        ),
                      IconButton(
                        tooltip: 'Rescan local models',
                        icon: _scanningLocalModels
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.refresh_rounded, size: 18),
                        onPressed: _refreshLocalModels,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Click any downloaded model to assign it to Action or Thinking:',
                    style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 8),
                  if (_localModels.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.surface,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'No local models detected. Pull one via terminal (e.g. "ollama pull llama3.2").',
                        style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                      ),
                    )
                  else
                    Column(
                      children: _localModels.map((m) {
                        final isAction = cfg.actionModel == m;
                        final isThinking = cfg.thinkingModel == m;

                        return Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: (isAction || isThinking)
                                ? AppTheme.purple.withAlpha(20)
                                : AppTheme.surface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: (isAction || isThinking)
                                  ? AppTheme.purple.withAlpha(80)
                                  : AppTheme.border,
                            ),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.storage_rounded, size: 16, color: AppTheme.cyan),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  m,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                    color: AppTheme.textPrimary,
                                  ),
                                ),
                              ),
                              ActionChip(
                                label: Text(
                                  isAction ? '⚡ Action Active' : 'Set as ⚡ Action',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isAction ? Colors.white : AppTheme.primary,
                                  ),
                                ),
                                backgroundColor: isAction ? AppTheme.primary : AppTheme.card,
                                side: BorderSide(color: AppTheme.primary.withAlpha(80)),
                                onPressed: () => setState(() => cfg.actionModel = m),
                              ),
                              const SizedBox(width: 6),
                              ActionChip(
                                label: Text(
                                  isThinking ? '🧠 Thinking Active' : 'Set as 🧠 Thinking',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isThinking ? Colors.white : AppTheme.purple,
                                  ),
                                ),
                                backgroundColor: isThinking ? AppTheme.purple : AppTheme.card,
                                side: BorderSide(color: AppTheme.purple.withAlpha(80)),
                                onPressed: () => setState(() => cfg.thinkingModel = m),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            // Connection card
            _settingsCard(
              title: cfg.isLocalMode ? 'Local Ollama Connection' : 'Ollama Cloud Connection',
              children: [
                _textField(
                  label: 'Ollama Base URL',
                  value: cfg.ollamaBaseUrl,
                  onChanged: (v) => cfg.ollamaBaseUrl = v,
                ),
                if (!cfg.isLocalMode) ...[
                  const SizedBox(height: 12),
                  _textField(
                    label: 'Ollama API Key (Cloud)',
                    value: cfg.ollamaApiKey,
                    obscure: true,
                    hint: 'Set in %USERPROFILE%\\.appbridge\\agent.env',
                    onChanged: (v) => cfg.ollamaApiKey = v,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),

            // Models card
            _settingsCard(
              title: 'Multi-Model Pipeline',
              children: [
                _textField(
                  label: '⚡ Action Model (Executes app actions)',
                  value: cfg.actionModel,
                  onChanged: (v) => cfg.actionModel = v,
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  value: cfg.useThinking,
                  onChanged: (v) => setState(() => cfg.useThinking = v),
                  title: const Text('Enable Strategic Thinking Model',
                      style: TextStyle(fontSize: 14, color: AppTheme.textPrimary)),
                  subtitle: const Text(
                      'Plans tool calls and identifies open windows before acting',
                      style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                  activeThumbColor: AppTheme.purple,
                  contentPadding: EdgeInsets.zero,
                ),
                if (cfg.useThinking) ...[
                  const SizedBox(height: 8),
                  _textField(
                    label: '🧠 Thinking Model (Strategic planner)',
                    value: cfg.thinkingModel,
                    onChanged: (v) => cfg.thinkingModel = v,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),

            // Execution Performance & Timeout
            _settingsCard(
              title: 'Performance & Local Model Waiting',
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Response Timeout (Seconds)',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.textPrimary),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Current: ${cfg.timeoutSeconds}s (recommended 300s for local models)',
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: 80,
                      child: TextFormField(
                        initialValue: '${cfg.timeoutSeconds}',
                        keyboardType: TextInputType.number,
                        style: const TextStyle(fontSize: 13),
                        onChanged: (v) {
                          final numVal = int.tryParse(v);
                          if (numVal != null && numVal > 0) {
                            cfg.timeoutSeconds = numVal;
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ),
            const SizedBox(height: 16),

            // User Identity
            _settingsCard(
              title: 'User Identity & Honorific',
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _textField(
                        label: 'User Name',
                        value: cfg.userName,
                        onChanged: (v) => cfg.userName = v,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _textField(
                        label: 'Honorific',
                        value: cfg.userHonorific,
                        onChanged: (v) => cfg.userHonorific = v,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  setState(() => _showSettings = false);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Agent settings updated.'),
                      backgroundColor: AppTheme.success,
                    ),
                  );
                },
                icon: const Icon(Icons.check_rounded),
                label: const Text('Done'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _settingsCard({required String title, required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _textField({
    required String label,
    required String value,
    required ValueChanged<String> onChanged,
    bool obscure = false,
    String? hint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppTheme.textSecondary)),
        const SizedBox(height: 6),
        TextFormField(
          initialValue: value,
          obscureText: obscure,
          style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: hint,
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ],
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
