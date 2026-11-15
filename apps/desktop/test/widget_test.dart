import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:appbridge_desktop/main.dart';

void main() {
  testWidgets('AppbridgeApp renders on desktop', (WidgetTester tester) async {
    // Set standard desktop viewport
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const AppbridgeApp());
    await tester.pump();

    // Verify main brand title and navigation rail items exist
    expect(find.text('Appbridge'), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Open Apps'), findsOneWidget);
    expect(find.text('Approvals'), findsOneWidget);
    expect(find.text('AI Connect'), findsOneWidget);
    expect(find.text('Skills Studio'), findsOneWidget);
    expect(find.text('Audit Log'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Chatbot'), findsOneWidget);
  });
}
