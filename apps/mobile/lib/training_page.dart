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
    final response = await http.get(
      Uri.parse('${widget.baseUrl}$path'),
      headers: headers,
    );
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body)
        as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'erro_requisicao');
    }
    return data;
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await http.post(
      Uri.parse('${widget.baseUrl}$path'),
      headers: headers,
      body: jsonEncode(body),
    );
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body)
        as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? 'erro_requisicao');
    }
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
      final detail = await getJson(
        '/api/training/plans/detail?plan_id=$planId',
      );
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
      final review = await postJson('/api/training/plans/review', {
        'plan_id': planId,
      });
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Análise com IA'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        label: Text(
                          review['source'] == 'local_generative'
                              ? 'IA local'
                              : 'Motor de regras',
                        ),
                      ),
                      Chip(
                        label: Text(
                          'Confiança ${((review['confidence'] as num? ?? 0) * 100).round()}%',
                        ),
                      ),
                      if (review['requires_human_review'] == true)
                        const Chip(
                          avatar: Icon(Icons.warning_amber, size: 18),
                          label: Text('Revisão humana necessária'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    review['summary']?.toString() ?? '',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Sinais e evidências',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  ...(review['signals'] as List<dynamic>? ?? []).map(
                    (item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        item['severity'] == 'critical'
                            ? Icons.error_outline
                            : item['severity'] == 'attention'
                                ? Icons.warning_amber
                                : Icons.info_outline,
                      ),
                      title: Text(item['description']?.toString() ?? ''),
                      subtitle: Text(
                        (item['evidence'] as List<dynamic>? ?? []).join(' • '),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Sugestões',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  ...(review['suggestions'] as List<dynamic>? ?? []).map(
                    (item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.tips_and_updates_outlined),
                      title: Text(item['suggested_action']?.toString() ?? ''),
                      subtitle: Text(item['reason']?.toString() ?? ''),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Mensagem após aprovação: ${review['student_message'] ?? ''}',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Notas do profissional: ${review['trainer_notes'] ?? ''}',
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await postJson('/api/training/plans/review/reject', {
                  'review_id': review['id'],
                  'reason': 'Rejeitada no aplicativo',
                });
                if (dialogContext.mounted) Navigator.pop(dialogContext);
                if (mounted) setState(() => message = 'Análise rejeitada.');
              },
              child: const Text('Rejeitar'),
            ),
            FilledButton(
              onPressed: () async {
                await postJson('/api/training/plans/review/approve', {
                  'review_id': review['id'],
                });
                if (dialogContext.mounted) Navigator.pop(dialogContext);
                if (mounted) setState(() => message = 'Análise aprovada.');
              },
              child: const Text('Aprovar'),
            ),
          ],
        ),
      );
    } catch (error) {
      setState(() => message = 'Erro na analise: $error');
    }
  }

  Widget exerciseTile(dynamic item) {
    final video = item['video_url'];
    final primaryMuscle =
        item['muscle_group_primary'] ?? item['muscle_group'] ?? '-';
    final secondaryMuscle = item['muscle_group_secondary'];
    final mediaUrl =
        video == null || video == '' ? null : _mediaUrl(video.toString());
    final isGif = mediaUrl != null &&
        RegExp(r'\.gif(?:[?#].*)?$', caseSensitive: false).hasMatch(mediaUrl);
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            title: Text(item['exercise_name'] ?? item['name'] ?? ''),
            subtitle: Text(
              'Principal: $primaryMuscle${secondaryMuscle == null || secondaryMuscle == '' ? '' : '\nSecundarios: $secondaryMuscle'}\nSeries: ${item['sets'] ?? '-'} | Reps: ${item['reps'] ?? '-'} | Descanso: ${item['rest_seconds'] ?? '-'}s\n${item['instructions'] ?? ''}${video == null || video == '' ? '' : '\nDemonstração disponível'}',
            ),
            isThreeLine: true,
          ),
          if (isGif)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  mediaUrl,
                  height: 190,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('Não foi possível carregar a demonstração.'),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _mediaUrl(String source) {
    final parsed = Uri.tryParse(source);
    if (parsed != null && parsed.hasScheme) return source;
    return '${widget.baseUrl}${source.startsWith('/') ? source : '/$source'}';
  }

  @override
  Widget build(BuildContext context) {
    final plan = selectedDetail?['plan'];
    final detailExercises =
        selectedDetail?['exercises'] as List<dynamic>? ?? [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Treinos'),
        actions: [
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text(message),
            const SizedBox(height: 12),
            const Text(
              'Fichas dos alunos',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            ...plans.map(
              (plan) => Card(
                child: ListTile(
                  title: Text('${plan['member_name']} - ${plan['name']}'),
                  subtitle: Text(
                    'Nivel: ${plan['level']} | Idade da ficha: ${plan['age_days'] ?? 0} dias',
                  ),
                  trailing: Wrap(
                    spacing: 8,
                    children: [
                      IconButton(
                        onPressed: () => loadPlanDetail(plan['id']),
                        icon: const Icon(Icons.visibility),
                      ),
                      IconButton(
                        onPressed: () => reviewPlan(plan['id']),
                        icon: const Icon(Icons.auto_awesome),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (plan != null) ...[
              const Divider(),
              Text(
                'Ficha aberta: ${plan['name']}',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Nivel: ${plan['level']} | Objetivo: ${plan['goal'] ?? '-'}',
              ),
              const SizedBox(height: 8),
              ...detailExercises.map(exerciseTile),
            ],
            const Divider(),
            const Text(
              'Biblioteca de exercicios',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            ...exercises.take(30).map((item) => exerciseTile(item)),
          ],
        ),
      ),
    );
  }
}
