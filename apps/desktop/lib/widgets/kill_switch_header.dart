import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class KillSwitchHeader extends StatelessWidget {
  final BridgeStatus? status;
  final bool isConnected;
  final VoidCallback onToggleHalt;
  final VoidCallback onRefresh;

  const KillSwitchHeader({
    super.key,
    required this.status,
    required this.isConnected,
    required this.onToggleHalt,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final isHalted = status?.halted ?? false;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: BoxDecoration(
        color: isHalted
            ? AppTheme.danger.withValues(alpha: 0.15)
            : AppTheme.surface,
        border: Border(
          bottom: BorderSide(
            color: isHalted
                ? AppTheme.danger.withValues(alpha: 0.5)
                : AppTheme.border,
            width: isHalted ? 2 : 1,
          ),
        ),
      ),
      child: Row(
        children: [
          // Brand & Connection status icon
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isConnected
                  ? AppTheme.primary.withValues(alpha: 0.2)
                  : AppTheme.danger.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.shield_outlined,
              color: isConnected ? AppTheme.primary : AppTheme.danger,
              size: 24,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Row(
                  children: [
                    Text(
                      'Appbridge',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    SizedBox(width: 8),
                    Text(
                      'v0.0.2',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isConnected ? AppTheme.success : AppTheme.danger,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        isConnected
                            ? (isHalted
                                ? 'Core Daemon Connected • AUTOMATION HALTED'
                                : 'Core Daemon Connected • Safe Mode')
                            : 'Daemon Offline (Connecting...)',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: isConnected
                              ? (isHalted ? AppTheme.danger : AppTheme.textSecondary)
                              : AppTheme.danger,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),

          // Approvals Alert Badge if any
          if ((status?.pendingApprovalsCount ?? 0) > 0) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.warning),
              ),
              child: Row(
                children: [
                  const Icon(Icons.gavel_rounded, color: AppTheme.warning, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    '${status!.pendingApprovalsCount} Approval${status!.pendingApprovalsCount > 1 ? 's' : ''} Needed',
                    style: const TextStyle(
                      color: AppTheme.warning,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
          ],

          // Refresh Button
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            color: AppTheme.textSecondary,
            tooltip: 'Refresh Status',
            onPressed: onRefresh,
          ),
          const SizedBox(width: 12),

          // Big Emergency Kill Switch Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: isHalted ? AppTheme.success : AppTheme.danger,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            icon: Icon(
              isHalted ? Icons.play_arrow_rounded : Icons.stop_circle_outlined,
              size: 20,
            ),
            label: Text(
              isHalted ? 'RESUME AUTOMATION' : 'EMERGENCY STOP',
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
              ),
            ),
            onPressed: onToggleHalt,
          ),
        ],
      ),
    );
  }
}
