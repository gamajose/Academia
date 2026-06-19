import 'dart:async';
import 'dart:convert';

import 'package:academia_mobile/alerts_page.dart';
import 'package:academia_mobile/assessments_page.dart';
import 'package:academia_mobile/revenue_page.dart';
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
      title: 'Academia Platform',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
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
    if (token != null && baseUrl != null) {
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => DashboardPage(baseUrl: baseUrl, token: token)));
    }
  }

  Future<void> _login() async {
    setState(() {
      loading = true;
      message = 'Validando acesso...';
    });

    try {
      final baseUrl = apiController.text.trim();
      final api = ApiClient(baseUrl, null);
      final result = await api.post('/api/auth/login', {
        'email': emailController.text.trim(),
        'password': passwordController.text,
      });
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('apiBaseUrl', baseUrl);
      await prefs.setString('token', result['token'] as String);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => DashboardPage(baseUrl: baseUrl, token: result['token'] as String)));
    } catch (error) {
      setState(() => message = 'Falha no login: $error');
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Academia Platform')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text('App mobile operacional', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
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
  const DashboardPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

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
      setState(() => message = 'Check-in registrado.');
    } catch (error) {
      setState(() => message = 'Erro no check-in: $error');
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
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
        title: const Text('Painel Mobile'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)), IconButton(onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              _card('Alunos', summary['active_members']),
              _card('Matrículas', summary['active_memberships']),
              _card('Check-ins hoje', summary['today_checkins']),
              _card('Pendências', summary['pending_payments']),
            ]),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              actionButton(Icons.warning_amber, 'Alertas', AlertsPage(baseUrl: widget.baseUrl, token: widget.token)),
              actionButton(Icons.fitness_center, 'Treinos', TrainingPage(baseUrl: widget.baseUrl, token: widget.token)),
              actionButton(Icons.monitor_heart, 'Avaliações', AssessmentsPage(baseUrl: widget.baseUrl, token: widget.token)),
              actionButton(Icons.payments, 'Financeiro', RevenuePage(baseUrl: widget.baseUrl, token: widget.token)),
            ]),
            const SizedBox(height: 12),
            Text('$message Sincronizacao automatica a cada 30s.'),
            const Divider(),
            const Text('Check-in rápido', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...members.map((member) => ListTile(
                  title: Text(member['name'] ?? ''),
                  subtitle: Text(member['status'] ?? ''),
                  trailing: FilledButton(onPressed: member['status'] == 'active' ? () => _quickCheckin(member['id']) : null, child: const Text('Check-in')),
                )),
            const Divider(),
            const Text('Últimos check-ins', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...checkins.map((item) => ListTile(title: Text(item['member_name'] ?? ''), subtitle: Text(item['checked_at'] ?? ''))),
          ],
        ),
      ),
    );
  }
}
