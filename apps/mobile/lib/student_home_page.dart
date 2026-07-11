import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StudentHomePage extends StatefulWidget {
  const StudentHomePage({
    super.key,
    required this.baseUrl,
    required this.token,
    required this.loginPageBuilder,
  });

  final String baseUrl;
  final String token;
  final Widget Function() loginPageBuilder;

  @override
  State<StudentHomePage> createState() => _StudentHomePageState();
}

class _StudentHomePageState extends State<StudentHomePage> {
  Map<String, dynamic> profile = {};
  Map<String, dynamic> access = {};
  Map<String, dynamic>? trainingPlan;
  List<dynamic> exercises = [];
  List<dynamic> trainingLogs = [];
  List<dynamic> assessments = [];
  List<dynamic> goals = [];
  String? currentDayId;
  String? qrPayload;
  DateTime? qrExpiresAt;
  Timer? countdownTimer;
  String message = 'Carregando seus dados...';
  bool loading = true;
  bool generating = false;
  bool completingWorkout = false;

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  @override
  void initState() {
    super.initState();
    _refresh();
    countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (qrExpiresAt != null && DateTime.now().isAfter(qrExpiresAt!)) {
        setState(() {
          qrPayload = null;
          qrExpiresAt = null;
          message = 'O QR Code expirou. Gere um novo para entrar.';
        });
      } else if (qrExpiresAt != null) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    countdownTimer?.cancel();
    super.dispose();
  }

  Future<Map<String, dynamic>> _request(String method, String path, [Map<String, dynamic>? requestBody]) async {
    final uri = Uri.parse('${widget.baseUrl}$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(requestBody ?? {}))
        : await http.get(uri, headers: headers);
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(data['error'] ?? data['message'] ?? 'erro_requisicao');
    }
    return data;
  }

  Future<void> _refresh() async {
    if (mounted) setState(() => loading = true);
    try {
      final profileResult = await _request('GET', '/api/student/me');
      final accessResult = await _request('GET', '/api/student/access/status');

      Map<String, dynamic>? currentPlan;
      List<dynamic> currentExercises = [];
      List<dynamic> logs = [];
      List<dynamic> progressAssessments = [];
      List<dynamic> progressGoals = [];
      String? workoutDayId;

      try {
        final training = await _request('GET', '/api/student/training/current');
        currentPlan = training['plan'] as Map<String, dynamic>?;
        final allExercises = training['exercises'] as List<dynamic>? ?? [];
        final today = DateTime.now().weekday;
        final todayExercises = allExercises.where((item) => int.tryParse('${item['weekday']}') == today).toList();
        currentExercises = todayExercises.isEmpty ? allExercises : todayExercises;
        workoutDayId = currentExercises.isEmpty ? null : currentExercises.first['workout_day_id'] as String?;
      } catch (_) {
        currentPlan = null;
      }

      try {
        final logsResult = await _request('GET', '/api/student/training/logs');
        logs = logsResult['data'] as List<dynamic>? ?? [];
      } catch (_) {
        logs = [];
      }

      try {
        final progress = await _request('GET', '/api/student/progress');
        progressAssessments = progress['assessments'] as List<dynamic>? ?? [];
        progressGoals = progress['goals'] as List<dynamic>? ?? [];
      } catch (_) {
        progressAssessments = [];
        progressGoals = [];
      }

      if (!mounted) return;
      setState(() {
        profile = profileResult;
        access = accessResult['access'] as Map<String, dynamic>? ?? {};
        trainingPlan = currentPlan;
        exercises = currentExercises;
        trainingLogs = logs;
        assessments = progressAssessments;
        goals = progressGoals;
        currentDayId = workoutDayId;
        message = access['message']?.toString() ?? 'Dados atualizados.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro ao carregar: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _generateQr() async {
    setState(() {
      generating = true;
      qrPayload = null;
      qrExpiresAt = null;
      message = 'Gerando QR Code seguro...';
    });

    try {
      final result = await _request('POST', '/api/student/access/qr', {});
      final newAccess = result['access'] as Map<String, dynamic>? ?? {};
      final generated = result['generated'] == true;
      if (!mounted) return;
      setState(() {
        access = newAccess;
        if (generated) {
          qrPayload = result['qr_payload'] as String;
          qrExpiresAt = DateTime.parse(result['expires_at'] as String).toLocal();
          message = newAccess['status'] == 'grace_period'
              ? 'Acesso em carencia. Apresente o QR ao leitor e regularize a pendencia.'
              : 'Apresente este QR Code ao leitor da catraca.';
        } else {
          message = newAccess['message']?.toString() ?? 'Acesso nao liberado.';
        }
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Nao foi possivel gerar o QR: $error');
    } finally {
      if (mounted) setState(() => generating = false);
    }
  }

  Future<void> _completeWorkout() async {
    if (trainingPlan?['id'] == null || currentDayId == null) return;
    setState(() => completingWorkout = true);
    try {
      await _request('POST', '/api/student/training/complete', {
        'plan_id': trainingPlan!['id'],
        'workout_day_id': currentDayId,
        'feedback': 'Concluido pelo aplicativo',
      });
      await _refresh();
      if (mounted) setState(() => message = 'Treino marcado como concluido. Parabens!');
    } catch (error) {
      if (mounted) setState(() => message = 'Nao foi possivel concluir o treino: $error');
    } finally {
      if (mounted) setState(() => completingWorkout = false);
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('sessionRole');
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => widget.loginPageBuilder()),
      (_) => false,
    );
  }

  int get remainingSeconds {
    if (qrExpiresAt == null) return 0;
    final value = qrExpiresAt!.difference(DateTime.now()).inSeconds;
    return value < 0 ? 0 : value;
  }

  Color get statusColor {
    switch (access['status']) {
      case 'current':
        return Colors.green;
      case 'grace_period':
        return Colors.orange;
      default:
        return Colors.red;
    }
  }

  String get statusTitle {
    switch (access['status']) {
      case 'current':
        return 'Acesso liberado';
      case 'grace_period':
        return 'Acesso em carencia';
      default:
        return 'Acesso bloqueado';
    }
  }

  Widget _section(String title, IconData icon, List<dynamic> items, String Function(dynamic) label, String empty) {
    return Card(
      child: ExpansionTile(
        leading: Icon(icon),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(items.isEmpty ? empty : '${items.length} registro(s)'),
        children: items.isEmpty
            ? [Padding(padding: const EdgeInsets.all(16), child: Text(empty))]
            : items.map((item) => ListTile(title: Text(label(item)))).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allowed = access['allowed'] == true;
    final overdueDays = access['overdue_days'] ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Area do aluno'),
        actions: [
          IconButton(onPressed: loading ? null : _refresh, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              profile['name'] == null ? 'Bem-vindo' : 'Ola, ${profile['name']}',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(allowed ? Icons.verified : Icons.block, color: statusColor),
                        const SizedBox(width: 8),
                        Text(statusTitle, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: statusColor)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(access['message']?.toString() ?? message),
                    if (overdueDays > 0) ...[
                      const SizedBox(height: 6),
                      Text('Dias de atraso: $overdueDays de ${access['grace_days'] ?? 10} dias de carencia.'),
                    ],
                    if (access['membership_ends_at'] != null)
                      Text('Vigencia da matricula: ${access['membership_ends_at']}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('Meu QR Code de entrada', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('O codigo e temporario, pessoal e funciona somente uma vez.'),
                    const SizedBox(height: 16),
                    if (qrPayload != null) ...[
                      Semantics(
                        label: 'QR Code temporario para acesso a academia',
                        child: QrImageView(
                          data: qrPayload!,
                          version: QrVersions.auto,
                          size: 240,
                          backgroundColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('Expira em $remainingSeconds segundos', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ] else
                      const SizedBox(height: 180, child: Center(child: Icon(Icons.qr_code_2, size: 120))),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: allowed && !generating ? _generateQr : null,
                      icon: const Icon(Icons.qr_code),
                      label: Text(generating ? 'Gerando...' : qrPayload == null ? 'Gerar QR Code' : 'Gerar novo QR Code'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(children: [Icon(Icons.fitness_center), SizedBox(width: 8), Text('Treino atual', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))]),
                    const SizedBox(height: 8),
                    Text(trainingPlan?['name']?.toString() ?? 'Nenhum treino ativo'),
                    if (trainingPlan != null)
                      Text('Nivel: ${trainingPlan?['level'] ?? '-'} | Objetivo: ${trainingPlan?['goal'] ?? '-'} | ${trainingPlan?['age_days'] ?? 0} dias'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: currentDayId == null || completingWorkout ? null : _completeWorkout,
                      icon: const Icon(Icons.check_circle),
                      label: Text(completingWorkout ? 'Salvando...' : 'Marcar treino como concluido'),
                    ),
                  ],
                ),
              ),
            ),
            _section(
              'Exercicios de hoje',
              Icons.list_alt,
              exercises,
              (item) => '${item['exercise_name'] ?? '-'} | ${item['sets'] ?? '-'}x ${item['reps'] ?? '-'} | descanso ${item['rest_seconds'] ?? '-'}s',
              'Nenhum exercicio para hoje.',
            ),
            _section(
              'Evolucao fisica',
              Icons.monitor_heart,
              assessments,
              (item) => '${item['assessment_date'] ?? '-'} | Peso ${item['weight_kg'] ?? '-'} kg | Cintura ${item['waist_cm'] ?? '-'} cm',
              'Nenhuma avaliacao registrada.',
            ),
            _section(
              'Metas',
              Icons.flag,
              goals,
              (item) => '${item['goal_type'] ?? 'Meta'} | Alvo ${item['target_value'] ?? '-'} | ${item['status'] ?? '-'}',
              'Nenhuma meta registrada.',
            ),
            _section(
              'Historico de treinos',
              Icons.history,
              trainingLogs,
              (item) => '${item['completed_at'] ?? '-'} | ${item['day_title'] ?? item['plan_name'] ?? 'Treino'}',
              'Nenhum treino concluido.',
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}
