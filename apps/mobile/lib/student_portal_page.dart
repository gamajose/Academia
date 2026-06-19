import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Aluno')),
        body: ListView(padding: const EdgeInsets.all(18), children: [
          const Text('Area do aluno', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          TextField(controller: api, decoration: const InputDecoration(labelText: 'URL da API')),
          TextField(controller: email, decoration: const InputDecoration(labelText: 'E-mail')),
          TextField(controller: key, decoration: const InputDecoration(labelText: 'Chave de acesso'), obscureText: true),
          const SizedBox(height: 16),
          FilledButton(onPressed: login, child: const Text('Entrar')),
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
            Card(child: ListTile(title: Text(plan['name'] ?? 'Ficha atual'), subtitle: Text('Nivel: ${plan['level'] ?? '-'} | ${plan['age_days'] ?? 0} dias'))),
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
