import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

const Map<String, String> _policyLabels = {
  'navigate': 'Navigation',
  'read': 'Read data',
  'edit-draft': 'Workspace edits',
  'write': 'Save or apply changes',
  'destructive': 'Destructive actions',
  'external-effect': 'External effects',
  'privileged': 'Privileged actions',
  'credential': 'Credentials',
  'unknown': 'Unclassified actions',
};

const Map<String, String> _policyActions = {
  'allow': 'Allow automatically',
  'approve': 'Ask for approval',
  'block': 'Always block',
  'handoff': 'Hand off to me',
};

const List<_PolicySetting> _policySettings = [
  _PolicySetting(
    'navigate',
    'Open apps, switch windows, and move through screens.',
    'allow',
    AppTheme.primary,
  ),
  _PolicySetting(
    'read',
    'Read screens, files, clipboard content, and search results.',
    'allow',
    AppTheme.cyan,
  ),
  _PolicySetting(
    'edit-draft',
    'Create or edit local files and run routine build/test work.',
    'allow',
    AppTheme.primary,
  ),
  _PolicySetting(
    'write',
    'Save or apply changes in an app.',
    'allow',
    AppTheme.warning,
  ),
  _PolicySetting(
    'destructive',
    'Delete data, run destructive commands, or make hard-to-reverse changes.',
    'approve',
    AppTheme.danger,
  ),
  _PolicySetting(
    'external-effect',
    'Send, publish, upload, purchase, or otherwise affect another person or service.',
    'allow',
    AppTheme.warning,
  ),
  _PolicySetting(
    'privileged',
    'Administrator or system-level actions.',
    'handoff',
    AppTheme.purple,
  ),
  _PolicySetting(
    'credential',
    'Enter passwords, authentication codes, or other credentials.',
    'handoff',
    AppTheme.purple,
  ),
  _PolicySetting(
    'unknown',
    'Actions the bridge cannot confidently classify.',
    'allow',
    AppTheme.textSecondary,
  ),
];

class _PolicySetting {
  final String effect;
  final String description;
  final String defaultAction;
  final Color color;

  const _PolicySetting(
    this.effect,
    this.description,
    this.defaultAction,
    this.color,
  );
}

class SettingsScreen extends StatefulWidget {
  final AppbridgeClient client;
  final BridgeStatus? status;
  final VoidCallback onRefresh;

  const SettingsScreen({
    super.key,
    required this.client,
    required this.status,
    required this.onRefresh,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlCtrl;
  late TextEditingController _tokenCtrl;
  bool _obscureToken = true;
  final Set<String> _updatingPolicies = {};
  final Map<String, String> _policyOverrides = {};

  Future<void> _updatePolicy(String effect, String action) async {
    setState(() => _updatingPolicies.add(effect));
    final ok = await widget.client.setPolicy(effect, action);
    if (!mounted) return;
    setState(() {
      _updatingPolicies.remove(effect);
      if (ok) _policyOverrides[effect] = action;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: ok ? AppTheme.success : AppTheme.danger,
        content: Text(
          ok
              ? '${_policyLabels[effect]} policy saved.'
              : 'Could not save ${_policyLabels[effect]} policy. Check the gateway connection.',
        ),
      ),
    );
    if (ok) widget.onRefresh();
  }

  @override
  void initState() {
    super.initState();
    _urlCtrl = TextEditingController(text: widget.client.baseUrl);
    _tokenCtrl = TextEditingController(text: widget.client.token);
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _tokenCtrl.dispose();
    super.dispose();
  }

  void _saveSettings() {
    widget.client.baseUrl = _urlCtrl.text.trim();
    widget.client.token = _tokenCtrl.text.trim();
    widget.onRefresh();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: AppTheme.success,
        content: Text('Settings saved successfully.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final policy = <String, dynamic>{
      if (widget.status != null) ...widget.status!.policy,
      ..._policyOverrides,
    };

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Settings & Safety Governance',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Configure your local gateway connection, inspection thresholds and safety policies.',
            style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 28),

          // Connection Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Local Gateway Connection',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Loopback REST surface communicating with the native Windows Floor.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: _urlCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Gateway Base URL',
                            prefixIcon: Icon(Icons.link_rounded, size: 18),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        flex: 3,
                        child: TextField(
                          controller: _tokenCtrl,
                          obscureText: _obscureToken,
                          decoration: InputDecoration(
                            labelText:
                                'Bearer Token (~/.appbridge/gateway-token)',
                            prefixIcon: const Icon(Icons.key_rounded, size: 18),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureToken
                                    ? Icons.visibility_off_rounded
                                    : Icons.visibility_rounded,
                              ),
                              onPressed: () => setState(
                                () => _obscureToken = !_obscureToken,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton.icon(
                        icon: const Icon(Icons.play_circle_outline, size: 18),
                        label: const Text('Start Core Daemon'),
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          final ok = await widget.client.startLocalDaemon();
                          if (mounted) {
                            messenger.showSnackBar(
                              SnackBar(
                                backgroundColor: ok
                                    ? AppTheme.success
                                    : AppTheme.danger,
                                content: Text(
                                  ok
                                      ? 'Daemon started and connected!'
                                      : 'Failed to start daemon automatically.',
                                ),
                              ),
                            );
                            widget.onRefresh();
                          }
                        },
                      ),
                      const SizedBox(width: 10),
                      ElevatedButton(
                        onPressed: _saveSettings,
                        child: const Text('Save Changes'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Policy Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Approval & Action Policies',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Choose how the AI handles each kind of action. Changes are saved to the local gateway and apply immediately.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  for (
                    var index = 0;
                    index < _policySettings.length;
                    index++
                  ) ...[
                    _buildPolicyRow(
                      _policySettings[index],
                      (policy[_policySettings[index].effect] ??
                              _policySettings[index].defaultAction)
                          .toString(),
                    ),
                    if (index < _policySettings.length - 1)
                      const Divider(height: 1),
                  ],
                  const SizedBox(height: 12),
                  const Text(
                    'Allow runs automatically · Ask requires approval · Block denies the action · Hand off pauses for you to perform it.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Hardware & Environment
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Hardware & AI Model Tiering',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Capabilities detected on this Windows workstation.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Row(
                    children: [
                      Expanded(
                        child: Text(
                          'GPU Acceleration: DirectML (Native Windows)',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          'AI Performance Profile: Balanced / Fast',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Egress Mode: Local-Only (Air-Gapped Safe)',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          'Universality Contract: 100% Zero-Vendor Lock-in',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPolicyRow(_PolicySetting setting, String value) {
    final selected = _policyActions.containsKey(value)
        ? value
        : setting.defaultAction;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _policyLabels[setting.effect] ?? setting.effect,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: setting.color,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  setting.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 20),
          SizedBox(
            width: 210,
            child: _updatingPolicies.contains(setting.effect)
                ? const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : DropdownButtonFormField<String>(
                    key: ValueKey('policy-${setting.effect}'),
                    value: selected,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Behavior',
                      isDense: true,
                    ),
                    items: _policyActions.entries
                        .map(
                          (entry) => DropdownMenuItem<String>(
                            value: entry.key,
                            child: Text(
                              entry.value,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (next) {
                      if (next != null && next != selected) {
                        _updatePolicy(setting.effect, next);
                      }
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
