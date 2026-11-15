import 'package:flutter_test/flutter_test.dart';
import 'package:appbridge_desktop/services/appbridge_agent_service.dart';
import 'package:appbridge_desktop/services/appbridge_client.dart';

void main() {
  group('AppbridgeAgentService Tests', () {
    test('AgentConfig defaults, timeouts, and cipher env loading', () {
      final config = AgentConfig.loadFromEnv();
      expect(config.userAddress, isNotEmpty);
      expect(config.thinkingModel, isNotEmpty);
      expect(config.actionModel, isNotEmpty);
      expect(config.maxSteps, greaterThan(0));
      expect(config.timeoutSeconds, greaterThanOrEqualTo(300));
    });

    test('AgentActionStep serialization', () {
      final step = AgentActionStep(
        tool: 'app.message',
        args: {'app': 'WhatsApp', 'contact': 'Azka CA Lhr', 'message': 'khana khaa lia'},
        description: 'Send WhatsApp message to Azka CA Lhr',
        status: 'running',
      );

      final json = step.toJson();
      expect(json['tool'], 'app.message');
      expect(json['args']['contact'], 'Azka CA Lhr');
      expect(json['status'], 'running');
    });

    test('Agent service initial configuration & local mode toggle', () {
      final client = AppbridgeClient();
      final service = AppbridgeAgentService(
        bridgeClient: client,
        initialConfig: AgentConfig(
          userName: 'Qureshi',
          userHonorific: 'sahb',
          actionModel: 'qwen2.5-coder:14b',
          thinkingModel: 'qwen3.5:9b',
          isLocalMode: true,
          timeoutSeconds: 300,
          autoApprove: true,
        ),
      );

      expect(service.config.userAddress, 'Qureshi sahb');
      expect(service.config.autoApprove, isTrue);
      expect(service.config.isLocalMode, isTrue);
      expect(service.config.actionModel, 'qwen2.5-coder:14b');
      expect(service.config.thinkingModel, 'qwen3.5:9b');
      expect(service.config.timeoutSeconds, 300);
    });

    test('Local models discovery returns non-empty list on Windows', () async {
      final client = AppbridgeClient();
      final service = AppbridgeAgentService(bridgeClient: client);
      final models = await service.discoverLocalModels();
      expect(models, isNotEmpty);
      // Verify qwen2.5-coder:14b or qwen3.5:9b were found from disk
      expect(models.any((m) => m.contains('qwen')), isTrue);
    });
  });
}
