import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class FirstAccessStatus {
  const FirstAccessStatus({
    required this.completed,
    required this.accountType,
    required this.profile,
  });

  final bool completed;
  final String accountType;
  final Map<String, dynamic> profile;
}

class RegisteredSession {
  const RegisteredSession(
      {required this.baseUrl, required this.token, required this.role});

  final String baseUrl;
  final String token;
  final String role;
}

Map<String, String> _headers(String? token) => {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

Map<String, dynamic> _decode(http.Response response) {
  final data = jsonDecode(response.body.isEmpty ? '{}' : response.body)
      as Map<String, dynamic>;
  if (response.statusCode >= 400)
    throw Exception(data['error'] ?? 'erro_requisicao');
  return data;
}

Future<FirstAccessStatus> loadFirstAccessStatus(
    String baseUrl, String token) async {
  final response = await http.get(
    Uri.parse('$baseUrl/api/student/onboarding'),
    headers: _headers(token),
  );
  final data = _decode(response);
  return FirstAccessStatus(
    completed: data['completed'] == true,
    accountType: data['account_type']?.toString() ?? 'student',
    profile: data['profile'] as Map<String, dynamic>? ?? {},
  );
}

class FirstAccessOnboardingPage extends StatefulWidget {
  const FirstAccessOnboardingPage({
    super.key,
    required this.baseUrl,
    required this.token,
    required this.status,
    required this.nextPageBuilder,
  });

  final String baseUrl;
  final String token;
  final FirstAccessStatus status;
  final Widget Function(String name) nextPageBuilder;

  @override
  State<FirstAccessOnboardingPage> createState() =>
      _FirstAccessOnboardingPageState();
}

class _FirstAccessOnboardingPageState extends State<FirstAccessOnboardingPage> {
  late final TextEditingController nameController;
  late final TextEditingController birthYearController;
  late final TextEditingController weightController;
  late final TextEditingController heightController;
  final focusNode = FocusNode();
  int step = 0;
  bool saving = false;
  String message = '';

  @override
  void initState() {
    super.initState();
    final profile = widget.status.profile;
    nameController =
        TextEditingController(text: profile['name']?.toString() ?? '');
    birthYearController = TextEditingController(
      text: (profile['birth_date']?.toString().length ?? 0) >= 4
          ? profile['birth_date'].toString().substring(0, 4)
          : '',
    );
    weightController =
        TextEditingController(text: _numberText(profile['weight_kg']));
    heightController =
        TextEditingController(text: _numberText(profile['height_cm']));
    WidgetsBinding.instance
        .addPostFrameCallback((_) => focusNode.requestFocus());
  }

  String _numberText(dynamic value) {
    if (value == null) return '';
    final number = num.tryParse(value.toString());
    if (number == null) return '';
    return number == number.roundToDouble()
        ? number.toInt().toString()
        : number.toString();
  }

  @override
  void dispose() {
    nameController.dispose();
    birthYearController.dispose();
    weightController.dispose();
    heightController.dispose();
    focusNode.dispose();
    super.dispose();
  }

  TextEditingController get currentController => [
        nameController,
        birthYearController,
        weightController,
        heightController
      ][step];

  String? _validationMessage() {
    if (step == 0 && nameController.text.trim().length < 2)
      return 'Informe seu nome.';
    if (step == 1) {
      final year = int.tryParse(birthYearController.text.trim());
      final currentYear = DateTime.now().year;
      if (year == null || year < currentYear - 120 || year > currentYear)
        return 'Informe um ano válido.';
    }
    if (step == 2) {
      final weight =
          double.tryParse(weightController.text.trim().replaceAll(',', '.'));
      if (weight == null || weight < 10 || weight > 500)
        return 'Informe um peso válido.';
    }
    if (step == 3) {
      final height =
          double.tryParse(heightController.text.trim().replaceAll(',', '.'));
      if (height == null || height < 50 || height > 250)
        return 'Informe uma altura válida.';
    }
    return null;
  }

  Future<void> _advance() async {
    final validation = _validationMessage();
    if (validation != null) {
      setState(() => message = validation);
      return;
    }
    if (step < 3) {
      setState(() {
        step += 1;
        message = '';
      });
      focusNode.requestFocus();
      return;
    }
    await _save();
  }

  Future<void> _save() async {
    setState(() {
      saving = true;
      message = '';
    });
    try {
      final year = int.parse(birthYearController.text.trim());
      final response = await http.put(
        Uri.parse('${widget.baseUrl}/api/student/onboarding'),
        headers: _headers(widget.token),
        body: jsonEncode({
          'name': nameController.text.trim(),
          'birth_date': '${year.toString().padLeft(4, '0')}-01-01',
          'weight_kg': weightController.text.trim().replaceAll(',', '.'),
          'height_cm': heightController.text.trim().replaceAll(',', '.'),
        }),
      );
      _decode(response);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('studentName', nameController.text.trim());
      await prefs.setBool('firstAccessCompleted', true);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
            builder: (_) => widget.nextPageBuilder(nameController.text.trim())),
      );
    } catch (_) {
      if (mounted)
        setState(
            () => message = 'Não foi possível salvar agora. Tente novamente.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _back() {
    if (step == 0) return;
    setState(() {
      step -= 1;
      message = '';
    });
    focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final titles = [
      'Qual é o seu nome?',
      'Em que ano você nasceu?',
      'Qual é o seu peso atual?',
      'Qual é a sua altura?'
    ];
    final hints = ['Seu nome', 'Ex.: 1998', 'Ex.: 72,5 kg', 'Ex.: 175 cm'];
    final icons = [
      Icons.person_outline,
      Icons.cake_outlined,
      Icons.monitor_weight_outlined,
      Icons.height
    ];
    final keyboards = [
      TextInputType.name,
      TextInputType.number,
      const TextInputType.numberWithOptions(decimal: true),
      const TextInputType.numberWithOptions(decimal: true)
    ];
    final suffixes = ['', '', 'kg', 'cm'];
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (step > 0)
                    IconButton(
                        onPressed: saving ? null : _back,
                        icon: const Icon(Icons.arrow_back)),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                          value: (step + 1) / 4, minHeight: 7),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text('${step + 1}/4',
                      style: Theme.of(context).textTheme.labelLarge),
                ],
              ),
              const Spacer(),
              Icon(icons[step],
                  size: 54, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 22),
              Text(titles[step],
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Text(
                step == 1
                    ? 'Usaremos o ano para calcular sua idade.'
                    : 'Essa informação ajuda a personalizar sua experiência.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 28),
              TextField(
                key: ValueKey(step),
                controller: currentController,
                focusNode: focusNode,
                keyboardType: keyboards[step],
                textInputAction:
                    step == 3 ? TextInputAction.done : TextInputAction.next,
                inputFormatters: step == 0
                    ? [LengthLimitingTextInputFormatter(160)]
                    : step == 1
                        ? [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(4)
                          ]
                        : [
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9,.]')),
                            LengthLimitingTextInputFormatter(6)
                          ],
                decoration: InputDecoration(
                  hintText: hints[step],
                  suffixText: suffixes[step].isEmpty ? null : suffixes[step],
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16)),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
                ),
                onSubmitted: (_) {
                  if (!saving) _advance();
                },
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: message.isEmpty
                    ? const SizedBox(height: 42)
                    : Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(message,
                            key: ValueKey(message),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      ),
              ),
              const Spacer(),
              FilledButton(
                onPressed: saving ? null : _advance,
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(54)),
                child: Text(saving
                    ? 'Salvando...'
                    : step == 3
                        ? 'Concluir'
                        : 'Continuar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CreateStudentAccountPage extends StatefulWidget {
  const CreateStudentAccountPage({super.key, required this.initialBaseUrl});

  final String initialBaseUrl;

  @override
  State<CreateStudentAccountPage> createState() =>
      _CreateStudentAccountPageState();
}

class _CreateStudentAccountPageState extends State<CreateStudentAccountPage> {
  late final baseUrlController =
      TextEditingController(text: widget.initialBaseUrl);
  final emailController = TextEditingController();
  final phoneController = TextEditingController();
  final passwordController = TextEditingController();
  final confirmationController = TextEditingController();
  bool saving = false;
  String message = '';

  @override
  void dispose() {
    baseUrlController.dispose();
    emailController.dispose();
    phoneController.dispose();
    passwordController.dispose();
    confirmationController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final email = emailController.text.trim().toLowerCase();
    final password = passwordController.text;
    final validPassword = password.length >= 8 &&
        RegExp(r'[A-Z]').hasMatch(password) &&
        RegExp(r'[0-9]').hasMatch(password);
    if (!email.contains('@') ||
        !validPassword ||
        password != confirmationController.text) {
      setState(() => message =
          'Confira o e-mail. A senha precisa ter 8 caracteres, uma maiúscula e um número.');
      return;
    }
    setState(() {
      saving = true;
      message = '';
    });
    try {
      final baseUrl =
          baseUrlController.text.trim().replaceAll(RegExp(r'/+$'), '');
      var provisionalName =
          email.split('@').first.replaceAll(RegExp(r'[._-]+'), ' ').trim();
      if (provisionalName.length < 2) provisionalName = 'Novo aluno';
      final response = await http.post(
        Uri.parse('$baseUrl/api/student/auth/register-visitor'),
        headers: _headers(null),
        body: jsonEncode({
          'name': provisionalName,
          'email': email,
          'phone': phoneController.text.trim(),
          'password': passwordController.text,
          'password_confirmation': confirmationController.text,
        }),
      );
      final data = _decode(response);
      if (!mounted) return;
      Navigator.pop(
        context,
        RegisteredSession(
          baseUrl: baseUrl,
          token: data['token'] as String,
          role: data['student']?['role']?.toString() ?? 'visitor',
        ),
      );
    } catch (error) {
      final duplicate = error.toString().contains('email_ja_cadastrado');
      if (mounted)
        setState(() => message = duplicate
            ? 'Este e-mail já possui uma conta.'
            : 'Não foi possível criar a conta agora.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Criar conta')),
        body: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Text('Comece por aqui',
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const Text(
                'Depois, vamos completar seu perfil em quatro passos rápidos.'),
            const SizedBox(height: 24),
            TextField(
                controller: baseUrlController,
                decoration: const InputDecoration(labelText: 'URL da API')),
            const SizedBox(height: 12),
            TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'E-mail')),
            const SizedBox(height: 12),
            TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration:
                    const InputDecoration(labelText: 'Telefone (opcional)')),
            const SizedBox(height: 12),
            TextField(
                controller: passwordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Senha')),
            const SizedBox(height: 12),
            TextField(
                controller: confirmationController,
                obscureText: true,
                decoration:
                    const InputDecoration(labelText: 'Confirmar senha')),
            const SizedBox(height: 18),
            FilledButton(
                onPressed: saving ? null : _register,
                child: Text(saving ? 'Criando...' : 'Criar conta')),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ),
      );
}

class VisitorAccountPage extends StatelessWidget {
  const VisitorAccountPage({
    super.key,
    required this.name,
    required this.loginPageBuilder,
  });

  final String name;
  final Widget Function() loginPageBuilder;

  Future<void> _logout(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('sessionRole');
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(context,
        MaterialPageRoute(builder: (_) => loginPageBuilder()), (_) => false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('BlueREC Academia'),
          actions: [
            IconButton(
                onPressed: () => _logout(context),
                icon: const Icon(Icons.logout),
                tooltip: 'Sair')
          ],
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle,
                    size: 72, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 18),
                Text('Tudo pronto, $name!',
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                const Text(
                    'Seu perfil foi criado. Quando sua matrícula for ativada, os recursos de treino, evolução e acesso serão liberados.',
                    textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      );
}
