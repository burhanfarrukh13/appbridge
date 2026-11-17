import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class DashboardScreen extends StatelessWidget {
  final AppbridgeClient client;
  final BridgeStatus? status;
  final bool isConnected;
  final Function(int) onNavigate;
  final VoidCallback onRefresh;

  const DashboardScreen({
    super.key,
    required this.client,
    required this.status,
    required this.isConnected,
    required this.onNavigate,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final pendingCount = status?.pendingApprovalsCount ?? 0;
    final isHalted = status?.halted ?? false;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting & Quick Hero Banner
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.primary.withValues(alpha: 0.15),
                  AppTheme.purple.withValues(alpha: 0.1),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Universal AI Desktop Bridge',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Let any AI model (Claude, Antigravity, Cursor, Codex) safely perceive and operate your desktop apps with complete human oversight and local security controls.',
                        style: TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        children: [
                          ElevatedButton.icon(
                            icon: const Icon(Icons.link_rounded, size: 18),
                            label: const Text('Connect an AI Client'),
                            onPressed: () => onNavigate(3), // Connect tab
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.apps_rounded, size: 18),
                            label: const Text('View Open Apps'),
                            onPressed: () => onNavigate(1), // Apps tab
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.school_rounded, size: 18),
                            label: const Text('Teach a New Skill'),
                            onPressed: () => onNavigate(4), // Skills tab
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 24),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppTheme.card,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.primary.withValues(alpha: 0.5), width: 2),
                  ),
                  child: const Icon(
                    Icons.security_rounded,
                    size: 48,
                    color: AppTheme.primary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // Status Metric Cards
          LayoutBuilder(
            builder: (context, constraints) {
              final isNarrow = constraints.maxWidth < 800;
              final cards = [
                _buildMetricCard(
                  title: 'Firewall Protection',
                  value: isHalted ? 'HALTED' : 'ACTIVE',
                  subtitle: isHalted
                      ? 'Kill switch active'
                      : 'All actions verified locally',
                  icon: isHalted ? Icons.lock_rounded : Icons.verified_user_rounded,
                  color: isHalted ? AppTheme.danger : AppTheme.success,
                  onTap: () {},
                ),
                _buildMetricCard(
                  title: 'Pending Approvals',
                  value: '$pendingCount',
                  subtitle: pendingCount == 0
                      ? 'No pending human decisions'
                      : 'Actions awaiting your approval',
                  icon: Icons.gavel_rounded,
                  color: pendingCount > 0 ? AppTheme.warning : AppTheme.textSecondary,
                  onTap: () => onNavigate(2), // Approvals tab
                ),
                _buildMetricCard(
                  title: 'AI Tool Surface',
                  value: '37 Tools',
                  subtitle: 'MCP + REST gateway ready',
                  icon: Icons.auto_awesome_rounded,
                  color: AppTheme.cyan,
                  onTap: () => onNavigate(3), // Connect tab
                ),
                _buildMetricCard(
                  title: 'Audit Chain',
                  value: '100% Verified',
                  subtitle: 'SHA-256 tamper-proof log',
                  icon: Icons.history_edu_rounded,
                  color: AppTheme.purple,
                  onTap: () => onNavigate(5), // Audit tab
                ),
              ];

              if (isNarrow) {
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: cards
                      .map((c) => SizedBox(
                            width: (constraints.maxWidth - 12) / 2,
                            child: c,
                          ))
                      .toList(),
                );
              }

              return Row(
                children: cards
                    .map((c) => Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: c,
                          ),
                        ))
                    .toList(),
              );
            },
          ),
          const SizedBox(height: 32),

          // How It Works / User Guidance Section
          const Text(
            'How Appbridge Works for You',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final isNarrow = constraints.maxWidth < 750;
              final guideCards = [
                _buildGuideCard(
                  step: '1',
                  title: 'Connect Your AI',
                  description:
                      'Go to the Connect tab and click "Connect" next to Claude, Antigravity, or VS Code. No configuration files to edit.',
                  icon: Icons.electrical_services_rounded,
                  color: AppTheme.primary,
                ),
                _buildGuideCard(
                  step: '2',
                  title: 'Teach & Automate',
                  description:
                      'Select any open application on your desktop and record routine tasks. Appbridge compiles them into reusable, verified Skills.',
                  icon: Icons.touch_app_rounded,
                  color: AppTheme.purple,
                ),
                _buildGuideCard(
                  step: '3',
                  title: 'Stay Safe Always',
                  description:
                      'Actions that need approval pause for your decision. Use the big red button anytime to stop further automation.',
                  icon: Icons.shield_rounded,
                  color: AppTheme.success,
                ),
              ];

              if (isNarrow) {
                return Column(
                  children: guideCards
                      .map((g) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: g,
                          ))
                      .toList(),
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: guideCards
                    .map((g) => Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: g,
                          ),
                        ))
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMetricCard({
    required String title,
    required String value,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppTheme.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Icon(icon, color: color, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuideCard({
    required String step,
    required String title,
    required String description,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  step,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: color,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: AppTheme.textPrimary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            description,
            style: const TextStyle(
              fontSize: 13,
              color: AppTheme.textSecondary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
