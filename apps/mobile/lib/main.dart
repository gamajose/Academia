import 'dart:async';
import 'dart:convert';

import 'package:academia_mobile/access_control_page.dart';
import 'package:academia_mobile/alerts_page.dart';
import 'package:academia_mobile/assessments_page.dart';
import 'package:academia_mobile/member_workspace_page.dart';
import 'package:academia_mobile/revenue_page.dart';
import 'package:academia_mobile/student_home_page.dart';
import 'package:academia_mobile/training_page.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  runApp(const AcademiaApp());
}

class AcademiaApp extends StatelessWidget {
  const AcademiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Academia Lobo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xffb91c1c)),
        useMaterial3: true,
      ),
      home: const LoginPage(),
    );
  }
}

class ApiClient {
  ApiClient(this.baseUrl, this.token);

  final String baseUrl;
  final String? token;

  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(Uri.parse('$baseUrl$path'), headers: _headers());
    return _decode(response);
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('$baseUrl$path'), headers: _headers(), body: jsonEncode(body));
    return _decode(response);
  }

  Map<String, String> _headers() {
    return {
      'Content-Type': 'application/json',
      if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Map<String, dynamic> _decode(http.Response response) {
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'erro_requisicao');
    }
    return data;
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final apiController = TextEditingController(text: 'http://10.0.2.2:3004');
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  String message = '';
  bool loading = false;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final prefs = await SharedPreferences.getInstance();
    apiController.text = prefs.getString('apiBaseUrl') ?? apiController.text;
    final token = prefs.getString('token');
    final baseUrl = prefs.getString('apiBaseUrl');
    final role = prefs.getString('sessionRole');
    if (token != null && baseUrl != null && role != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openHome(baseUrl, token, role);
      });
    }
  }

  void _openHome(String baseUrl, String token, String role) {
    final page = role == 'student'
        ? StudentHomePage(
            baseUrl: baseUrl,
            token: token,
            loginPageBuilder: () => const LoginPage(),
          )
        : DashboardPage(baseUrl: baseUrl, token: token, role: role);
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => page));
  }

  Future<void> _login() async {
    setState(() {
      loading = true;
      message = 'Identificando seu perfil...';
    });

    try {
      final baseUrl = apiController.text.trim().replaceAll(RegExp(r'/$'), '');
      final api = ApiClient(baseUrl, null);
      final credentials = {
        'email': emailController.text.trim(),
        'password': passwordController.text,
      };

      Map<String, dynamic> result;
      Map<String, dynamic> identity;
      try {
        result = await api.post('/api/auth/login', credentials);
        identity = result['user'] as Map<String, dynamic>? ?? {};
      } catch (_) {
        result = await api.post('/api/student/auth/login', credentials);
        identity = result['student'] as Map<String, dynamic>? ?? {};
      }

      final role = identity['role']?.toString() ?? 'student';
      final token = result['token'] as String;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('apiBaseUrl', baseUrl);
      await prefs.setString('token', token);
      await prefs.setString('sessionRole', role);
      if (!mounted) return;
      _openHome(baseUrl, token, role);
    } catch (error) {
      if (mounted) setState(() => message = 'Falha no login: credenciais invalidas ou servidor indisponivel.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Academia Lobo')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text('Acesse sua conta', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('O aplicativo identifica automaticamente se voce e aluno, professor ou administrador.'),
          const SizedBox(height: 16),
          TextField(controller: apiController, decoration: const InputDecoration(labelText: 'URL da API')),
          TextField(controller: emailController, decoration: const InputDecoration(labelText: 'E-mail')),
          TextField(controller: passwordController, decoration: const InputDecoration(labelText: 'Senha'), obscureText: true),
          const SizedBox(height: 16),
          FilledButton(onPressed: loading ? null : _login, child: Text(loading ? 'Entrando...' : 'Entrar')),
          const SizedBox(height: 12),
          Text(message),
        ],
      ),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.baseUrl, required this.token, required this.role});

  final String baseUrl;
  final String token;
  final String role;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  late final ApiClient api;
  Timer? syncTimer;
  Map<String, dynamic> summary = {};
  List<dynamic> members = [];
  List<dynamic> checkins = [];
  String message = 'Carregando...';

  bool get isManager => widget.role == 'owner' || widget.role == 'admin';
  String get panelTitle => isManager ? 'Painel administrativo' : 'Painel do professor';

  @override
  void initState() {
    super.initState();
    api = ApiClient(widget.baseUrl, widget.token);
    _refresh();
    syncTimer = Timer.periodic(const Duration(seconds: 30), (_) => _refresh(silent: true));
  }

  @override
  void dispose() {
    syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    try {
      final dashboard = await api.get('/api/dashboard/summary');
      final membersResult = await api.get('/api/members');
      final checkinsResult = await api.get('/api/checkins/recent');
      if (!mounted) return;
      setState(() {
        summary = dashboard;
        members = membersResult['data'] as List<dynamic>? ?? [];
        checkins = checkinsResult['data'] as List<dynamic>? ?? [];
        if (!silent) message = 'Atualizado.';
      });
    } catch (error) {
      if (!silent && mounted) setState(() => message = 'Erro ao carregar: $error');
    }
  }

  Future<void> _quickCheckin(String memberId) async {
    try {
      await api.post('/api/checkins', {'member_id': memberId, 'source': 'mobile'});
      await _refresh();
      if (mounted) setState(() => message = 'Check-in registrado.');
    } catch (error) {
      if (mounted) setState(() => message = 'Erro no check-in: $error');
    }
  }

  void _openMember(Map<String, dynamic> member) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MemberWorkspacePage(
          baseUrl: widget.baseUrl,
          token: widget.token,
          memberId: member['id']?.toString() ?? '',
          role: widget.role,
        ),
      ),
    ).then((_) => _refresh());
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('sessionRole');
    syncTimer?.cancel();
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginPage()));
  }

  Widget _card(String title, dynamic value) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('${value ?? 0}', style: const TextStyle(fontSize: 28)),
        ]),
      ),
    );
  }

  Widget actionButton(IconData icon, String label, Widget page) {
    return FilledButton.icon(
      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
      icon: Icon(icon),
      label: Text(label),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(panelTitle),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)), IconButton(onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              _card('Alunos', summary['active_members']),
              _card('Matriculas', summary['active_memberships']),
              _card('Check-ins hoje', summary['today_checkins']),
              if (isManager) _card('Pendencias', summary['pending_payments']),
            ]),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              actionButton(Icons.warning_amber, 'Alertas', AlertsPage(baseUrl: widget.baseUrl, token: widget.token)),
              actionButton(Icons.fitness_center, 'Treinos', TrainingPage(baseUrl: widget.baseUrl, token: widget.token)),
              actionButton(Icons.monitor_heart, 'Avaliacoes', AssessmentsPage(baseUrl: widget.baseUrl, token: widget.token)),
              if (isManager) actionButton(Icons.payments, 'Financeiro', RevenuePage(baseUrl: widget.baseUrl, token: widget.token)),
              if (isManager) actionButton(Icons.door_front_door, 'Controle de acesso', AccessControlPage(baseUrl: widget.baseUrl, token: widget.token)),
            ]),
            const SizedBox(height: 12),
            Text('$message Sincronizacao automatica a cada 30s.'),
            const Divider(),
            const Text('Alunos', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...members.map((raw) {
              final member = raw as Map<String, dynamic>;
              return Card(
                child: ListTile(
                  leading: CircleAvatar(child: Text('${member['name'] ?? '?'}'.substring(0, 1))),
                  title: Text(member['name'] ?? ''),
                  subtitle: Text(member['status'] ?? ''),
                  onTap: () => _openMember(member),
                  trailing: Wrap(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(onPressed: () => _openMember(member), icon: const Icon(Icons.folder_shared)),
                    IconButton(onPressed: member['status'] == 'active' ? () => _quickCheckin(member['id']) : null, icon: const Icon(Icons.login)),
                  ]),
                ),
              );
            }),
            const Divider(),
            const Text('Ultimos check-ins', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...checkins.map((item) => ListTile(title: Text(item['member_name'] ?? ''), subtitle: Text(item['checked_at'] ?? ''))),
          ],
        ),
      ),
    );
  }
}
