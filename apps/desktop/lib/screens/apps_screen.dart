import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class AppsScreen extends StatefulWidget {
  final AppbridgeClient client;

  const AppsScreen({super.key, required this.client});

  @override
  State<AppsScreen> createState() => _AppsScreenState();
}

class _AppsScreenState extends State<AppsScreen> {
  List<WindowApp> _windows = [];
  bool _isLoading = true;
  String _filter = '';

  @override
  void initState() {
    super.initState();
    _loadWindows();
  }

  Future<void> _loadWindows() async {
    setState(() => _isLoading = true);
    final list = await widget.client.listApps();
    if (mounted) {
      setState(() {
        _windows = list;
        _isLoading = false;
      });
    }
  }

  Future<void> _learnApp(WindowApp app) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Learning ${app.title}... Generating Playbook.')),
    );
    final res = await widget.client.learnApp(app.title);
    if (!mounted) return;
    if (res['ok'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text('Learned ${app.title}! Playbook saved to App Memory.'),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Could not learn app: ${res['reason'] ?? 'Unknown error'}'),
        ),
      );
    }
  }

  Future<void> _focusWindow(WindowApp app) async {
    final ok = await widget.client.focusWindow(app.id, app.title);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok
              ? 'Brought ${app.title} to foreground.'
              : 'Could not focus window (background window lock).'),
        ),
      );
    }
  }

  Future<void> _inspectWindow(WindowApp app) async {
    showDialog(
      context: context,
      builder: (ctx) => const Center(child: CircularProgressIndicator()),
    );
    final elements = await widget.client.describeWindow(app.title);
    if (!mounted) return;
    Navigator.of(context).pop(); // dismiss loading

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.card,
        title: Row(
          children: [
            const Icon(Icons.account_tree_outlined, color: AppTheme.cyan),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'UI Elements: ${app.title}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        content: SizedBox(
          width: 700,
          height: 500,
          child: elements.isEmpty
              ? const Center(
                  child: Text(
                    'No accessibility elements found for this window.',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                )
              : ListView.separated(
                  itemCount: elements.length,
                  separatorBuilder: (ctx, i) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final el = elements[index];
                    return ListTile(
                      dense: true,
                      leading: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.surface,
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Text(
                          el.role.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.primary,
                          ),
                        ),
                      ),
                      title: Text(
                        el.name.isEmpty ? '(Unnamed Control)' : el.name,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: el.name.isEmpty
                              ? AppTheme.textMuted
                              : AppTheme.textPrimary,
                        ),
                      ),
                      subtitle: Text(
                        'ID: ${el.id}${el.automationId != null ? ' • AutoID: ${el.automationId}' : ''}',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                      ),
                      trailing: el.riskHint != null
                          ? Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: el.riskHint == 'destructive'
                                    ? AppTheme.danger.withValues(alpha: 0.2)
                                    : AppTheme.warning.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                el.riskHint!.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: el.riskHint == 'destructive'
                                      ? AppTheme.danger
                                      : AppTheme.warning,
                                ),
                              ),
                            )
                          : (el.untrusted
                              ? const Text(
                                  'OCR TEXT',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: AppTheme.textMuted,
                                    fontWeight: FontWeight.bold,
                                  ),
                                )
                              : null),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _windows.where((w) {
      if (_filter.isEmpty) return true;
      final q = _filter.toLowerCase();
      return w.title.toLowerCase().contains(q) ||
          w.processName.toLowerCase().contains(q);
    }).toList();

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
                    'Open Applications & Windows',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Visible desktop windows ready for AI perception, inspection and interaction.',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
              const Spacer(),
              // Search input
              SizedBox(
                width: 250,
                height: 40,
                child: TextField(
                  onChanged: (val) => setState(() => _filter = val),
                  decoration: const InputDecoration(
                    hintText: 'Search windows or apps...',
                    prefixIcon: Icon(Icons.search_rounded, size: 18),
                    contentPadding: EdgeInsets.symmetric(vertical: 0, horizontal: 12),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Refresh'),
                onPressed: _loadWindows,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Apps List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.desktop_windows_outlined,
                                size: 56, color: AppTheme.textMuted),
                            const SizedBox(height: 16),
                            Text(
                              _filter.isEmpty
                                  ? 'No visible desktop windows found.'
                                  : 'No windows match "$_filter".',
                              style: const TextStyle(
                                  fontSize: 16, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (ctx, i) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final app = filtered[index];
                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 16),
                              child: Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: app.focused
                                          ? AppTheme.primary.withValues(alpha: 0.2)
                                          : AppTheme.surface,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: app.focused
                                            ? AppTheme.primary
                                            : AppTheme.border,
                                      ),
                                    ),
                                    child: Icon(
                                      Icons.window_rounded,
                                      color: app.focused
                                          ? AppTheme.primary
                                          : AppTheme.textSecondary,
                                      size: 24,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                app.title.isEmpty
                                                    ? '(Untitled Window)'
                                                    : app.title,
                                                style: const TextStyle(
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.bold,
                                                  color: AppTheme.textPrimary,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            if (app.focused) ...[
                                              const SizedBox(width: 8),
                                              Container(
                                                padding: const EdgeInsets.symmetric(
                                                    horizontal: 8, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: AppTheme.primary
                                                      .withValues(alpha: 0.2),
                                                  borderRadius:
                                                      BorderRadius.circular(4),
                                                ),
                                                child: const Text(
                                                  'FOCUSED',
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.bold,
                                                    color: AppTheme.primary,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Process: ${app.processName} • PID: ${app.pid} • ID: ${app.id}',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: AppTheme.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 20),
                                  // Quick Action Buttons
                                  OutlinedButton.icon(
                                    icon: const Icon(Icons.visibility_rounded, size: 16),
                                    label: const Text('Inspect'),
                                    onPressed: () => _inspectWindow(app),
                                  ),
                                  const SizedBox(width: 8),
                                  OutlinedButton.icon(
                                    icon: const Icon(Icons.psychology_outlined,
                                        size: 16, color: AppTheme.purple),
                                    label: const Text('Learn (Memory)',
                                        style: TextStyle(color: AppTheme.purple)),
                                    onPressed: () => _learnApp(app),
                                  ),
                                  const SizedBox(width: 8),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.arrow_upward_rounded, size: 16),
                                    label: const Text('Focus'),
                                    onPressed: () => _focusWindow(app),
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
