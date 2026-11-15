import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:appbridge_desktop/models/models.dart';
import 'package:appbridge_desktop/screens/settings_screen.dart';
import 'package:appbridge_desktop/services/appbridge_client.dart';

class _FakeAppbridgeClient extends AppbridgeClient {
  String? updatedEffect;
  String? updatedAction;

  @override
  Future<bool> setPolicy(String effect, String action) async {
    updatedEffect = effect;
    updatedAction = action;
    return true;
  }
}

void main() {
  testWidgets('settings exposes each effect and saves an individual policy', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final client = _FakeAppbridgeClient();
    final status = BridgeStatus(
      ok: true,
      halted: false,
      policy: const {
        'navigate': 'allow',
        'read': 'allow',
        'edit-draft': 'allow',
        'write': 'allow',
        'destructive': 'approve',
        'external-effect': 'allow',
        'privileged': 'handoff',
        'credential': 'handoff',
        'unknown': 'allow',
      },
      pendingApprovalsCount: 0,
      uptimeSeconds: 0,
      actor: 'test',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SettingsScreen(
            client: client,
            status: status,
            onRefresh: () {},
          ),
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.text('Approval & Action Policies'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Navigation'), findsOneWidget);
    expect(find.text('Read data'), findsOneWidget);
    expect(find.text('Workspace edits'), findsOneWidget);
    expect(find.text('Save or apply changes'), findsOneWidget);
    expect(find.text('Destructive actions'), findsOneWidget);
    expect(find.text('External effects'), findsOneWidget);
    expect(find.text('Privileged actions'), findsOneWidget);
    expect(find.text('Credentials'), findsOneWidget);
    expect(find.text('Unclassified actions'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('policy-destructive')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Always block').last);
    await tester.pumpAndSettle();

    expect(client.updatedEffect, 'destructive');
    expect(client.updatedAction, 'block');
  });
}
