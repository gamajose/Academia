import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class TrainingPage extends StatefulWidget {
  const TrainingPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<TrainingPage> createState() => _TrainingPageState();
}

class _TrainingPageState extends State<TrainingPage> {
  List<dynamic> members = [];
  List<dynamic> plans = [];
  List<dynamic> exercises = [];
  Map<String, dynamic>? selectedDetail;
  String message = 'Carregando treinos...';

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await http.get(Uri.parse('${widget.baseUrl}$path'), headers: headers);
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
    return data;
  }

  Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('${widget.baseUrl}$path'), headers: headers, body: jsonEncode(body));
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
    return data;
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    try {
      final membersResult = await getJson('/api/members');
      final plansResult = await getJson('/api/training/plans');
      final exercisesResult = await getJson('/api/training/exercises');
      setState(() {
        members = membersResult['data'] as List<dynamic>? ?? [];
        plans = plansResult['data'] as List<dynamic>? ?? [];
        exercises = exercisesResult['data'] as List<dynamic>? ?? [];
        message = 'Treinos atualizados.';
      });
    } catch (error) {
      setState(() => message = 'Erro ao carregar treinos: $error');
    }
  }

  Future<void> loadPlanDetail(String planId) async {
    try {
      final detail = await getJson('/api/training/plans/detail?plan_id=$planId');
      setState(() {
        selectedDetail = detail;
        message = 'Ficha aberta.';
      });
    } catch (error) {
      setState(() => message = 'Erro ao abrir ficha: $error');
    }
  }

  Future<void> reviewPlan(String planId) async {
    try {
      final review = await postJson('/api/training/plans/review', {'plan_id': planId});
      final suggestions = (review['suggestions'] as List<dynamic>? ?? []).map((item) => item['reason']).join('\n');
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Analise da ficha'),
          content: Text('${review['recommendation']}\n\n$suggestions'),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
        ),
      );
    } catch (error) {
      setState(() => message = 'Erro na analise: $error');
    }
  }

  Widget exerciseTile(dynamic item) {
    final video = item['video_url'];
    return Card(
      child: ListTile(
        title: Text(item['exercise_name'] ?? item['name'] ?? ''),
        subtitle: Text('Series: ${item['sets'] ?? '-'} | Reps: ${item['reps'] ?? '-'} | Descanso: ${item['rest_seconds'] ?? '-'}s\n${item['instructions'] ?? ''}${video == null || video == '' ? '' : '\nVideo: $video'}'),
        isThreeLine: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final plan = selectedDetail?['plan'];
    final detailExercises = selectedDetail?['exercises'] as List<dynamic>? ?? [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Treinos'),
        actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text(message),
            const SizedBox(height: 12),
            const Text('Fichas dos alunos', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...plans.map((plan) => Card(
                  child: ListTile(
                    title: Text('${plan['member_name']} - ${plan['name']}'),
                    subtitle: Text('Nivel: ${plan['level']} | Idade da ficha: ${plan['age_days'] ?? 0} dias'),
                    trailing: Wrap(spacing: 8, children: [
                      IconButton(onPressed: () => loadPlanDetail(plan['id']), icon: const Icon(Icons.visibility)),
                      IconButton(onPressed: () => reviewPlan(plan['id']), icon: const Icon(Icons.auto_awesome)),
                    ]),
                  ),
                )),
            if (plan != null) ...[
              const Divider(),
              Text('Ficha aberta: ${plan['name']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              Text('Nivel: ${plan['level']} | Objetivo: ${plan['goal'] ?? '-'}'),
              const SizedBox(height: 8),
              ...detailExercises.map(exerciseTile),
            ],
            const Divider(),
            const Text('Biblioteca de exercicios', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...exercises.take(30).map((item) => exerciseTile(item)),
          ],
        ),
      ),
    );
  }
}
