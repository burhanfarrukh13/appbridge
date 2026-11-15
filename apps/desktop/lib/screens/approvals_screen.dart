import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class ApprovalsScreen extends StatefulWidget {
  final AppbridgeClient client;
  final VoidCallback onRefreshStatus;

  const ApprovalsScreen({
    super.key,
    required this.client,
    required this.onRefreshStatus,
  });

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  List<ApprovalItem> _approvals = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadApprovals();
  }

  Future<void> _loadApprovals() async {
    setState(() => _isLoading = true);
    final items = await widget.client.listApprovals();
    if (mounted) {
      setState(() {
        _approvals = items;
        _isLoading = false;
      });
    }
  }

  Future<void> _handleDecision(ApprovalItem item, String decision,
      {String scope = 'once'}) async {
    final ok = await widget.client.decideApproval(
      item.id,
      decision,
      scope: scope,
      ttlSeconds: scope == 'session' ? 1800 : 60,
    );
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: decision == 'granted' ? AppTheme.success : AppTheme.danger,
          content: Text(
            decision == 'granted'
                ? 'Action approved (${scope == 'once' ? 'single use' : '30-minute session'}). AI can proceed.'
                : 'Action denied. AI has been blocked from executing this step.',
          ),
        ),
      );
      _loadApprovals();
      widget.onRefreshStatus();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Failed to submit approval decision.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = _approvals.where((a) => a.status == 'pending').toList();
    final history = _approvals.where((a) => a.status != 'pending').toList();

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
                    'Action Firewall & Approvals',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Sensitive actions (Delete, Send, Pay, Close) require your explicit human permission.',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Refresh'),
                onPressed: _loadApprovals,
              ),
            ],
          ),
          const SizedBox(height: 24),

          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : pending.isEmpty && history.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: AppTheme.success.withValues(alpha: 0.1),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.check_circle_outline_rounded,
                                size: 56,
                                color: AppTheme.success,
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'All Clear — No Pending Approvals',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'When an AI client attempts an irreversible action, it will appear here for your approval.',
                              style: TextStyle(
                                fontSize: 14,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView(
                        children: [
                          if (pending.isNotEmpty) ...[
                            Row(
                              children: [
                                const Icon(Icons.warning_amber_rounded,
                                    color: AppTheme.warning, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  'Awaiting Your Decision (${pending.length})',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.warning,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            ...pending.map((item) => _buildApprovalCard(item)),
                            const SizedBox(height: 24),
                          ],
                          if (history.isNotEmpty) ...[
                            const Text(
                              'Recent Approval History',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 12),
                            ...history.map((item) => _buildHistoryCard(item)),
                          ],
                        ],
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildApprovalCard(ApprovalItem item) {
    Color riskColor = AppTheme.warning;
    if (item.effect == 'destructive') riskColor = AppTheme.danger;
    if (item.effect == 'write') riskColor = AppTheme.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: riskColor.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: riskColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    item.effect.toUpperCase(),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: riskColor,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'Application: ${item.app.isEmpty ? 'Unknown App' : item.app}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const Spacer(),
                Text(
                  'ID: ${item.id}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Target Action: ${item.target.isEmpty ? '(No target specified)' : item.target}',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Route: ${item.route} • Requested at: ${item.createdAt}',
              style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.success,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.check_rounded, size: 18),
                  label: const Text('Approve Once'),
                  onPressed: () => _handleDecision(item, 'granted', scope: 'once'),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  icon: const Icon(Icons.timer_outlined, size: 18, color: AppTheme.primary),
                  label: const Text('Approve for 30m',
                      style: TextStyle(color: AppTheme.primary)),
                  onPressed: () =>
                      _handleDecision(item, 'granted', scope: 'session'),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: AppTheme.danger.withValues(alpha: 0.6)),
                  ),
                  icon: const Icon(Icons.close_rounded, size: 18, color: AppTheme.danger),
                  label: const Text('Deny Action',
                      style: TextStyle(color: AppTheme.danger)),
                  onPressed: () => _handleDecision(item, 'denied'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryCard(ApprovalItem item) {
    final granted = item.status == 'granted';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        dense: true,
        leading: Icon(
          granted ? Icons.check_circle_outline : Icons.cancel_outlined,
          color: granted ? AppTheme.success : AppTheme.danger,
        ),
        title: Text(
          '${item.app} • ${item.target}',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          'Decision: ${item.status.toUpperCase()} • Route: ${item.route}',
          style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
        ),
        trailing: Text(
          item.createdAt,
          style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
        ),
      ),
    );
  }
}
