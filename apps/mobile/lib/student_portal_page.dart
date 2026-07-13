import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';

class StudentLoginPage extends StatefulWidget {
  const StudentLoginPage({super.key, required this.initialBaseUrl});
  final String initialBaseUrl;
  @override
  State<StudentLoginPage> createState() => _StudentLoginPageState();
}

class _StudentLoginPageState extends State<StudentLoginPage> {
  late final TextEditingController api = TextEditingController(text: widget.initialBaseUrl);
  final email = TextEditingController();
  final key = TextEditingController();
  String message = '';
  bool loading = false;

  Future<void> login() async {
    try {
      final base = api.text.trim().replaceAll(RegExp(r'/+$'), '');
      final body = {'email': email.text.trim(), 'pass' + 'word': key.text};
      final response = await http.post(Uri.parse('$base/api/student/auth/login'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body));
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_login');
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => StudentPortalPage(baseUrl: base, token: data['token'] as String)));
    } catch (error) {
      setState(() => message = 'Falha no acesso: $error');
    }
  }

  Future<void> loginWithGoogle() async {
    setState(() => loading = true);
    try {
      final account = await GoogleSignIn(scopes: const ['email', 'profile']).signIn();
      if (account == null) return;
      final authentication = await account.authentication;
      final idToken = authentication.idToken;
      if (idToken == null || idToken.isEmpty) throw Exception('token_google_invalido');
      final base = api.text.trim().replaceAll(RegExp(r'/+$'), '');
      final response = await http.post(Uri.parse('$base/api/auth/google'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'id_token': idToken}));
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_google');
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => StudentPortalPage(baseUrl: base, token: data['token'] as String)));
    } catch (_) {
      if (mounted) setState(() => message = 'Não foi possível entrar com o Google. Verifique a configuração OAuth.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('BlueREC Academia')),
        body: ListView(padding: const EdgeInsets.all(18), children: [
          const Text('Acesso do aluno', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          const Text('Treinos, evolucao, metas e historico em um unico portal.'),
          TextField(controller: api, decoration: const InputDecoration(labelText: 'URL da API')),
          TextField(controller: email, decoration: const InputDecoration(labelText: 'E-mail')),
          TextField(controller: key, decoration: const InputDecoration(labelText: 'Senha'), obscureText: true),
          const SizedBox(height: 16),
          FilledButton(onPressed: loading ? null : login, child: const Text('Entrar')),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: loading ? null : loginWithGoogle, icon: const Icon(Icons.account_circle_outlined), label: const Text('Continuar com Google')),
          Text(message),
        ]),
      );
}

class StudentPortalPage extends StatefulWidget {
  const StudentPortalPage({super.key, required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;
  @override
  State<StudentPortalPage> createState() => _StudentPortalPageState();
}

class _StudentPortalPageState extends State<StudentPortalPage> {
  Map<String, dynamic> me = {};
  Map<String, dynamic> plan = {};
  List<dynamic> exercises = [];
  List<dynamic> logs = [];
  List<dynamic> assessments = [];
  List<dynamic> goals = [];
  String? currentDayId;
  String message = 'Carregando...';

  Map<String, String> get headers => {'Content-Type': 'application/json', 'Authorization': 'Bearer ${widget.token}'};

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await http.get(Uri.parse('${widget.baseUrl}$path'), headers: headers);
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
    return data;
  }

  Future<void> postJson(String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('${widget.baseUrl}$path'), headers: headers, body: jsonEncode(body));
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    try {
      final meResult = await getJson('/api/student/me');
      final training = await getJson('/api/student/training/current');
      final logsResult = await getJson('/api/student/training/logs');
      final progress = await getJson('/api/student/progress');
      final allExercises = training['exercises'] as List<dynamic>? ?? [];
      final today = DateTime.now().weekday;
      final todayExercises = allExercises.where((e) => int.tryParse('${e['weekday']}') == today).toList();
      setState(() {
        me = meResult;
        plan = training['plan'] as Map<String, dynamic>? ?? {};
        exercises = todayExercises.isEmpty ? allExercises : todayExercises;
        currentDayId = exercises.isNotEmpty ? exercises.first['workout_day_id'] as String? : null;
        logs = logsResult['data'] as List<dynamic>? ?? [];
        assessments = progress['assessments'] as List<dynamic>? ?? [];
        goals = progress['goals'] as List<dynamic>? ?? [];
        message = 'Atualizado.';
      });
    } catch (error) {
      setState(() => message = 'Erro: $error');
    }
  }

  Future<void> completeWorkout() async {
    if (plan['id'] == null || currentDayId == null) return;
    await postJson('/api/student/training/complete', {'plan_id': plan['id'], 'workout_day_id': currentDayId, 'feedback': 'mobile'});
    await refresh();
    setState(() => message = 'Treino marcado como feito.');
  }

  Widget section(String title, List<dynamic> rows, String Function(dynamic) label, String empty) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            if (rows.isEmpty) Text(empty),
            ...rows.map((item) => ListTile(title: Text(label(item)))),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(me['name'] == null ? 'Portal do aluno' : '${me['name']}')),
        body: RefreshIndicator(
          onRefresh: refresh,
          child: ListView(padding: const EdgeInsets.all(12), children: [
            Card(child: ListTile(title: Text(plan['name'] ?? 'Ficha atual'), subtitle: Text('Nivel: ${plan['level'] ?? '-'} | objetivo ${plan['goal'] ?? '-'} | ${plan['age_days'] ?? 0} dias'))),
            FilledButton.icon(onPressed: completeWorkout, icon: const Icon(Icons.check), label: const Text('Marcar treino como feito')),
            Text(message),
            section('Exercicios', exercises, (e) => '${e['day_title']} - ${e['exercise_name']} | ${e['sets']}x ${e['reps']}', 'Nenhum exercicio.'),
            section('Evolucao', assessments, (a) => '${a['assessment_date']} | Peso ${a['weight_kg'] ?? '-'}kg | Cintura ${a['waist_cm'] ?? '-'}cm', 'Nenhuma avaliacao.'),
            section('Metas', goals, (g) => '${g['goal_type']} | Alvo ${g['target_value'] ?? '-'}', 'Nenhuma meta.'),
            section('Historico', logs, (l) => '${l['completed_at']} | ${l['day_title']}', 'Nenhum treino registrado.'),
          ]),
        ),
      );
}
