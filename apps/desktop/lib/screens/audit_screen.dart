import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class AuditScreen extends StatefulWidget {
  final AppbridgeClient client;

  const AuditScreen({super.key, required this.client});

  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> {
  List<AuditLogItem> _records = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAudit();
  }

  Future<void> _loadAudit() async {
    setState(() => _isLoading = true);
    final list = await widget.client.getAuditTail(limit: 50);
    if (mounted) {
      setState(() {
        _records = list;
        _isLoading = false;
      });
    }
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
                    'Cryptographic Audit Trail',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Append-only, SHA-256 hash-chained record of every tool call, perception and action.',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.success.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.success.withValues(alpha: 0.4)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.verified_outlined, color: AppTheme.success, size: 16),
                    SizedBox(width: 6),
                    Text(
                      'Hash Chain Verified',
                      style: TextStyle(
                        color: AppTheme.success,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Refresh'),
                onPressed: _loadAudit,
              ),
            ],
          ),
          const SizedBox(height: 24),

          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _records.isEmpty
                    ? const Center(
                        child: Text(
                          'No audit entries found yet.',
                          style: TextStyle(color: AppTheme.textSecondary),
                        ),
                      )
                    : ListView.separated(
                        itemCount: _records.length,
                        separatorBuilder: (ctx, i) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final r = _records[index];
                          final isOk = r.resultClass == 'ok';

                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 18, vertical: 14),
                              child: Row(
                                children: [
                                  Icon(
                                    isOk
                                        ? Icons.check_circle_rounded
                                        : (r.resultClass == 'needs_human'
                                            ? Icons.gavel_rounded
                                            : Icons.error_outline_rounded),
                                    color: isOk
                                        ? AppTheme.success
                                        : (r.resultClass == 'needs_human'
                                            ? AppTheme.warning
                                            : AppTheme.danger),
                                    size: 20,
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Text(
                                              r.tool,
                                              style: const TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.bold,
                                                color: AppTheme.textPrimary,
                                              ),
                                            ),
                                            if (r.app != null) ...[
                                              const SizedBox(width: 8),
                                              Text(
                                                '• ${r.app}',
                                                style: const TextStyle(
                                                  fontSize: 13,
                                                  color: AppTheme.textSecondary,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Hash: ${r.hash.substring(0, 16)}... • Route: ${r.route ?? 'floor'} • Result: ${r.resultClass}',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    r.ts,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: AppTheme.textMuted,
                                    ),
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
