import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class ConnectScreen extends StatefulWidget {
  final AppbridgeClient client;

  const ConnectScreen({super.key, required this.client});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  List<ClientIntegration> _clients = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadClients();
  }

  Future<void> _loadClients() async {
    setState(() => _isLoading = true);
    final list = await widget.client.listClients();
    if (mounted) {
      setState(() {
        _clients = list;
        _isLoading = false;
      });
    }
  }

  Future<void> _connectClient(ClientIntegration item) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Configuring ${item.name}... Creating backup first.')),
    );
    final res = await widget.client.connectClient(item.id);
    if (!mounted) return;
    if (res['ok'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text('Successfully configured ${item.name}! Restart your AI client to load tools.'),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Error configuring ${item.name}: ${res['error'] ?? 'unknown error'}'),
        ),
      );
    }
  }

  Future<void> _undoClient(ClientIntegration item) async {
    final res = await widget.client.undoClient(item.id);
    if (!mounted) return;
    if (res['ok'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text('Restored previous configuration backup for ${item.name}.'),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Could not restore backup: ${res['error'] ?? 'no backup found'}'),
        ),
      );
    }
  }

  void _copyMcpConfig() {
    const config = '''
{
  "mcpServers": {
    "appbridge": {
      "command": "node",
      "args": ["packages/cli/dist/index.js", "mcp"]
    }
  }
}
''';
    Clipboard.setData(const ClipboardData(text: config));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('MCP configuration copied to clipboard!')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'AI Connect Hub',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'One-click integration with your favorite AI developer tools and desktop clients.',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
              const Spacer(),
              OutlinedButton.icon(
                icon: const Icon(Icons.copy_rounded, size: 16),
                label: const Text('Copy MCP Config'),
                onPressed: _copyMcpConfig,
              ),
              const SizedBox(width: 12),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Refresh'),
                onPressed: _loadClients,
              ),
            ],
          ),
          const SizedBox(height: 24),

          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : GridView.builder(
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 420,
                      mainAxisExtent: 210,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                    ),
                    itemCount: _clients.length,
                    itemBuilder: (context, index) {
                      final item = _clients[index];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: AppTheme.primary.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.smart_toy_outlined,
                                      color: AppTheme.primary,
                                      size: 22,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.name,
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            color: AppTheme.textPrimary,
                                          ),
                                        ),
                                        Text(
                                          'Format: ${item.kind.toUpperCase()}',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: item.detected
                                          ? AppTheme.success.withValues(alpha: 0.15)
                                          : AppTheme.surface,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: item.detected
                                            ? AppTheme.success.withValues(alpha: 0.5)
                                            : AppTheme.border,
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          item.detected
                                              ? Icons.check_circle_rounded
                                              : Icons.help_outline_rounded,
                                          size: 12,
                                          color: item.detected
                                              ? AppTheme.success
                                              : AppTheme.textMuted,
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          item.detected ? 'Detected' : 'Not Found',
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: item.detected
                                                ? AppTheme.success
                                                : AppTheme.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Expanded(
                                child: Text(
                                  item.note,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textSecondary,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  if (item.kind != 'manual') ...[
                                    OutlinedButton(onPressed: () => _undoClient(item), child: const Text('Undo', style: TextStyle(fontSize: 12)),),
                                    const SizedBox(width: 8),
                                    ElevatedButton.icon(
                                      icon: const Icon(Icons.flash_on_rounded, size: 16),
                                      label: const Text('Connect', style: TextStyle(fontSize: 12)),
                                      onPressed: () => _connectClient(item),
                                    ),
                                  ] else ...[
                                    ElevatedButton.icon(
                                      icon: const Icon(Icons.copy_rounded, size: 16),
                                      label: const Text('Copy Config', style: TextStyle(fontSize: 12)),
                                      onPressed: _copyMcpConfig,
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
