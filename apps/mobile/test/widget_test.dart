import 'package:academia_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('exibe as opções de acesso do aplicativo',
      (WidgetTester tester) async {
    await tester.pumpWidget(const AcademiaApp());

    expect(find.text('Acesse sua conta'), findsOneWidget);
    expect(find.text('Continuar com Google'), findsOneWidget);
    expect(find.text('Criar conta'), findsOneWidget);
  });
}
