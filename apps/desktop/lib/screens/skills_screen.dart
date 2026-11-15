import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/appbridge_client.dart';
import '../theme/app_theme.dart';

class SkillsScreen extends StatefulWidget {
  final AppbridgeClient client;

  const SkillsScreen({super.key, required this.client});

  @override
  State<SkillsScreen> createState() => _SkillsScreenState();
}

class _SkillsScreenState extends State<SkillsScreen> {
  List<SkillSummaryItem> _skills = [];
  List<WindowApp> _windows = [];
  bool _isLoading = true;
  bool _isRecording = false;
  String _recordingSessionId = '';
  int _recordedEventsCount = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final windows = await widget.client.listApps();
    final skills = await widget.client.listSkills('');
    if (mounted) {
      setState(() {
        _windows = windows;
        _skills = skills;
        _isLoading = false;
      });
    }
  }

  Future<void> _startRecordingDialog() async {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String? selectedWindow = _windows.isNotEmpty ? _windows.first.title : null;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDlgState) => AlertDialog(
          backgroundColor: AppTheme.card,
          title: const Row(
            children: [
              Icon(Icons.fiber_manual_record_rounded, color: AppTheme.danger),
              SizedBox(width: 10),
              Text('Teach Mode • Record New Skill'),
            ],
          ),
          content: SizedBox(
            width: 480,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Select the target application and record the sequence of clicks or keystrokes to automate.',
                  style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 16),
                const Text('Target Window:',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  initialValue: selectedWindow,
                  isExpanded: true,
                  items: _windows
                      .map((w) => DropdownMenuItem(
                            value: w.title,
                            child: Text(w.title.isEmpty ? '(Untitled)' : w.title,
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (val) => setDlgState(() => selectedWindow = val),
                  decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12)),
                ),
                const SizedBox(height: 14),
                const Text('Skill Name:',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Export Monthly Report to PDF',
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Description (Optional):',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                TextField(
                  controller: descCtrl,
                  decoration: const InputDecoration(
                    hintText: 'What this automated task accomplishes',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
              icon: const Icon(Icons.fiber_manual_record, size: 16),
              label: const Text('Start Recording'),
              onPressed: () {
                if (nameCtrl.text.trim().isNotEmpty && selectedWindow != null) {
                  Navigator.of(ctx).pop(true);
                }
              },
            ),
          ],
        ),
      ),
    );

    if (result == true && selectedWindow != null) {
      final res = await widget.client.recordStart(
        appId: 'desktop_app',
        windowTitle: selectedWindow!,
        name: nameCtrl.text.trim(),
        description: descCtrl.text.trim(),
      );

      if (res['ok'] == true) {
        setState(() {
          _isRecording = true;
          _recordingSessionId = res['data']?['session_id'] ?? 'rec-active';
          _recordedEventsCount = 0;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: AppTheme.danger,
              content: Text('Recording started! Perform actions or add steps below.'),
            ),
          );
        }
      }
    }
  }

  Future<void> _addEvent(String act, String label) async {
    final res = await widget.client.recordEvent({
      'act': act,
      'target': {'name': label},
    });
    if (res['ok'] == true) {
      setState(() => _recordedEventsCount++);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Recorded step: $act on "$label"')),
        );
      }
    }
  }

  Future<void> _stopRecording() async {
    final res = await widget.client.recordStop();
    setState(() {
      _isRecording = false;
      _recordedEventsCount = 0;
    });
    if (mounted) {
      if (res['ok'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: AppTheme.success,
            content: Text('Skill compiled successfully and saved to App Memory!'),
          ),
        );
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppTheme.danger,
            content: Text('Compilation issue: ${res['reason'] ?? 'Check steps'}'),
          ),
        );
      }
    }
  }

  Future<void> _runSkill(SkillSummaryItem skill) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Executing skill "${skill.name}"...')),
    );
    final res = await widget.client.runSkill(skill.id, appId: skill.appId);
    if (!mounted) return;
    if (res['ok'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text('Skill "${skill.name}" executed and verified successfully!'),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Skill execution: ${res['class'] ?? res['reason'] ?? 'Failed'}'),
        ),
      );
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
                    'Skills Studio & Teach Mode',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Teach tasks once by demonstration. The AI compiles them into reusable, verified workflows.',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
              const Spacer(),
              if (!_isRecording) ...[
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
                  icon: const Icon(Icons.fiber_manual_record, size: 16),
                  label: const Text('Record New Skill'),
                  onPressed: _startRecordingDialog,
                ),
              ] else ...[
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
                  icon: const Icon(Icons.check_rounded, size: 16),
                  label: Text('Save Skill ($_recordedEventsCount Steps)'),
                  onPressed: _stopRecording,
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),

          // Active Recording Banner
          if (_isRecording) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.danger),
              ),
              child: Row(
                children: [
                  const Icon(Icons.fiber_manual_record, color: AppTheme.danger, size: 24),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Teach Mode Active • Recording Trajectory',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.danger,
                          ),
                        ),
                        Text(
                          'Session: $_recordingSessionId • Events Captured: $_recordedEventsCount',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.mouse_outlined, size: 16),
                    label: const Text('Record Click Step'),
                    onPressed: () => _addEvent('click', 'Submit Button'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.keyboard_outlined, size: 16),
                    label: const Text('Record Key Step'),
                    onPressed: () => _addEvent('key', 'ENTER'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],

          // Skills Catalog
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _skills.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.auto_stories_outlined,
                                size: 56, color: AppTheme.textMuted),
                            const SizedBox(height: 16),
                            const Text(
                              'No skills recorded yet.',
                              style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.textPrimary),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Click "Record New Skill" above to teach your first automated task.',
                              style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        itemCount: _skills.length,
                        separatorBuilder: (ctx, i) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final item = _skills[index];
                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: AppTheme.purple.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.smart_button_rounded,
                                      color: AppTheme.purple,
                                      size: 24,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
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
                                        const SizedBox(height: 4),
                                        Text(
                                          item.description.isEmpty
                                              ? 'No description'
                                              : item.description,
                                          style: const TextStyle(
                                              fontSize: 13, color: AppTheme.textSecondary),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'App: ${item.appId} • Steps: ${item.stepsCount} • Runs: ${item.runs} (${item.successes} successful)',
                                          style: const TextStyle(
                                              fontSize: 11, color: AppTheme.textMuted),
                                        ),
                                      ],
                                    ),
                                  ),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.play_arrow_rounded, size: 18),
                                    label: const Text('Run Skill'),
                                    onPressed: () => _runSkill(item),
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
