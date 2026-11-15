import 'dart:async';
import 'package:flutter/material.dart';
import 'models/models.dart';
import 'services/appbridge_client.dart';
import 'theme/app_theme.dart';
import 'widgets/kill_switch_header.dart';
import 'screens/dashboard_screen.dart';
import 'screens/apps_screen.dart';
import 'screens/approvals_screen.dart';
import 'screens/connect_screen.dart';
import 'screens/skills_screen.dart';
import 'screens/audit_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/chatbot_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AppbridgeApp());
}

class AppbridgeApp extends StatelessWidget {
  const AppbridgeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Appbridge • Universal AI Desktop Bridge',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const MainShell(),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  final AppbridgeClient _client = AppbridgeClient();
  BridgeStatus? _status;
  bool _isConnected = false;
  int _selectedIndex = 0;
  Timer? _pollingTimer;

  @override
  void initState() {
    super.initState();
    _refresh();
    // Poll every 3 seconds to keep approvals & kill switch reactive
    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (_) => _refresh(silent: true));
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    final connected = await _client.checkHealth();
    BridgeStatus? status;
    if (connected) {
      status = await _client.getStatus();
    }
    if (mounted) {
      setState(() {
        _isConnected = connected;
        _status = status;
      });
    }
  }

  Future<void> _toggleHalt() async {
    final currentHalted = _status?.halted ?? false;
    final success = await _client.setHalt(!currentHalted);
    if (success) {
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: !currentHalted ? AppTheme.danger : AppTheme.success,
            content: Text(!currentHalted
                ? 'EMERGENCY STOP ENGAGED: All AI operations frozen.'
                : 'AUTOMATION RESUMED: Bridge active.'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pendingCount = _status?.pendingApprovalsCount ?? 0;

    return Scaffold(
      body: Column(
        children: [
          // Kill Switch Header
          KillSwitchHeader(
            status: _status,
            isConnected: _isConnected,
            onToggleHalt: _toggleHalt,
            onRefresh: _refresh,
          ),

          // Main Body with Sidebar + Content
          Expanded(
            child: Row(
              children: [
                // Navigation Rail
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: (index) => setState(() => _selectedIndex = index),
                  backgroundColor: AppTheme.surface,
                  minWidth: 72,
                  extended: false,
                  destinations: [
                    const NavigationRailDestination(
                      icon: Icon(Icons.dashboard_outlined),
                      selectedIcon: Icon(Icons.dashboard_rounded, color: AppTheme.primary),
                      label: Text('Dashboard'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.desktop_windows_outlined),
                      selectedIcon: Icon(Icons.desktop_windows_rounded, color: AppTheme.primary),
                      label: Text('Open Apps'),
                    ),
                    NavigationRailDestination(
                      icon: Badge(
                        isLabelVisible: pendingCount > 0,
                        label: Text('$pendingCount'),
                        backgroundColor: AppTheme.warning,
                        textColor: Colors.black,
                        child: const Icon(Icons.gavel_outlined),
                      ),
                      selectedIcon: Badge(
                        isLabelVisible: pendingCount > 0,
                        label: Text('$pendingCount'),
                        backgroundColor: AppTheme.warning,
                        textColor: Colors.black,
                        child: const Icon(Icons.gavel_rounded, color: AppTheme.primary),
                      ),
                      label: const Text('Approvals'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.link_outlined),
                      selectedIcon: Icon(Icons.link_rounded, color: AppTheme.primary),
                      label: Text('AI Connect'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.school_outlined),
                      selectedIcon: Icon(Icons.school_rounded, color: AppTheme.purple),
                      label: Text('Skills Studio'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.history_edu_outlined),
                      selectedIcon: Icon(Icons.history_edu_rounded, color: AppTheme.primary),
                      label: Text('Audit Log'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.settings_outlined),
                      selectedIcon: Icon(Icons.settings_rounded, color: AppTheme.primary),
                      label: Text('Settings'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.smart_toy_outlined),
                      selectedIcon: Icon(Icons.smart_toy_rounded, color: AppTheme.purple),
                      label: Text('Chatbot'),
                    ),
                  ],
                ),
                const VerticalDivider(width: 1),

                // Screen Views
                Expanded(
                  child: IndexedStack(
                    index: _selectedIndex,
                    children: [
                      DashboardScreen(
                        client: _client,
                        status: _status,
                        isConnected: _isConnected,
                        onNavigate: (i) => setState(() => _selectedIndex = i),
                        onRefresh: _refresh,
                      ),
                      AppsScreen(client: _client),
                      ApprovalsScreen(
                        client: _client,
                        onRefreshStatus: _refresh,
                      ),
                      ConnectScreen(client: _client),
                      SkillsScreen(client: _client),
                      AuditScreen(client: _client),
                      SettingsScreen(
                        client: _client,
                        status: _status,
                        onRefresh: _refresh,
                      ),
                      ChatbotScreen(client: _client),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
