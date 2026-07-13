import 'dart:async';
import 'dart:convert';

import 'package:academia_mobile/evolution_page.dart';
import 'package:academia_mobile/scan_gym_qr_page.dart';
import 'package:academia_mobile/student_classes_page.dart';
import 'package:academia_mobile/student_tools_page.dart';
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
  Map<String, dynamic> accountOverview = {};
  Map<String, dynamic>? trainingPlan;
  List<dynamic> exercises = [];
  List<dynamic> trainingLogs = [];
  List<dynamic> assessments = [];
  List<dynamic> goals = [];
  String? currentDayId;
  String? qrPayload;
  String? accessCode;
  DateTime? credentialExpiresAt;
  Timer? countdownTimer;
  String message = 'Carregando seus dados...';
  bool loading = true;
  bool generatingCredential = false;
  bool completingWorkout = false;

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  bool get accessAllowed => access['allowed'] == true;

  int get remainingSeconds {
    if (credentialExpiresAt == null) return 0;
    final value = credentialExpiresAt!.difference(DateTime.now()).inSeconds;
    return value < 0 ? 0 : value;
  }

  String get formattedAccessCode {
    final value = (accessCode ?? '').replaceAll(RegExp(r'\D'), '');
    if (value.length != 6) return '--- ---';
    return '${value.substring(0, 3)} ${value.substring(3)}';
  }

  @override
  void initState() {
    super.initState();
    _refresh();
    countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final remaining = remainingSeconds;
      if (credentialExpiresAt != null && remaining <= 0) {
        setState(() {
          qrPayload = null;
          accessCode = null;
          credentialExpiresAt = null;
        });
      } else if (credentialExpiresAt != null) {
        setState(() {});
      }
      if (accessAllowed && remaining <= 3 && !generatingCredential) {
        unawaited(_generateCredential(silent: true));
      }
    });
  }

  @override
  void dispose() {
    countdownTimer?.cancel();
    super.dispose();
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, [
    Map<String, dynamic>? requestBody,
  ]) async {
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
      Map<String, dynamic> overview = {};
      try {
        overview = await _request('GET', '/api/student/account/overview');
      } catch (_) {
        overview = {};
      }

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
        accountOverview = overview;
        trainingPlan = currentPlan;
        exercises = currentExercises;
        trainingLogs = logs;
        assessments = progressAssessments;
        goals = progressGoals;
        currentDayId = workoutDayId;
        message = access['message']?.toString() ?? 'Dados atualizados.';
        if (!accessAllowed) {
          qrPayload = null;
          accessCode = null;
          credentialExpiresAt = null;
        }
      });
      await _ensureCredential();
    } catch (error) {
      if (mounted) setState(() => message = 'Erro ao carregar: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _ensureCredential() async {
    if (!accessAllowed || generatingCredential) return;
    if (qrPayload != null && accessCode != null && remainingSeconds > 5) return;
    await _generateCredential(silent: true);
  }

  Future<void> _generateCredential({bool silent = false}) async {
    if (generatingCredential || !accessAllowed) return;
    setState(() {
      generatingCredential = true;
      if (!silent) message = 'Gerando credencial segura...';
    });

    try {
      final result = await _request('POST', '/api/student/access/credential', {});
      final newAccess = result['access'] as Map<String, dynamic>? ?? {};
      final generated = result['generated'] == true;
      if (!mounted) return;
      setState(() {
        access = newAccess;
        if (generated) {
          qrPayload = result['qr_payload'] as String?;
          accessCode = result['access_code']?.toString();
          credentialExpiresAt = DateTime.parse(result['expires_at'] as String).toLocal();
          message = newAccess['status'] == 'grace_period'
              ? 'Acesso em carência. Regularize a pendência para evitar bloqueio.'
              : 'Credencial atualizada automaticamente.';
        } else {
          qrPayload = null;
          accessCode = null;
          credentialExpiresAt = null;
          message = newAccess['message']?.toString() ?? 'Acesso não liberado.';
        }
      });
    } catch (error) {
      if (mounted && !silent) setState(() => message = 'Não foi possível gerar a credencial: $error');
    } finally {
      if (mounted) setState(() => generatingCredential = false);
    }
  }

  Future<void> _completeWorkout() async {
    if (trainingPlan?['id'] == null || currentDayId == null) return;
    setState(() => completingWorkout = true);
    try {
      await _request('POST', '/api/student/training/complete', {
        'plan_id': trainingPlan!['id'],
        'workout_day_id': currentDayId,
        'feedback': 'Concluído pelo aplicativo',
      });
      await _refresh();
      if (mounted) setState(() => message = 'Treino marcado como concluído. Parabéns!');
    } catch (error) {
      if (mounted) setState(() => message = 'Não foi possível concluir o treino: $error');
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

  void _openTools(int tab) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => StudentToolsPage(
          baseUrl: widget.baseUrl,
          token: widget.token,
          initialTab: tab,
        ),
      ),
    ).then((_) => _refresh());
  }

  void _openPage(Widget page) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => page)).then((_) => _refresh());
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
        return 'Acesso em carência';
      default:
        return 'Acesso bloqueado';
    }
  }

  Widget _section(
    String title,
    IconData icon,
    List<dynamic> items,
    String Function(dynamic) label,
    String empty,
  ) {
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

  Widget _shortcut(IconData icon, String label, int tab, {String? badge}) {
    return SizedBox(
      width: 165,
      child: OutlinedButton.icon(
        onPressed: () => _openTools(tab),
        icon: Badge(
          isLabelVisible: badge != null && badge != '0',
          label: Text(badge ?? ''),
          child: Icon(icon),
        ),
        label: Text(label),
      ),
    );
  }

  Widget _pageShortcut(IconData icon, String label, Widget page) {
    return SizedBox(
      width: 165,
      child: OutlinedButton.icon(
        onPressed: () => _openPage(page),
        icon: Icon(icon),
        label: Text(label),
      ),
    );
  }

  Widget _credentialCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Text('Minha entrada', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            const Text(
              'Apresente o QR Code ao leitor da catraca ou digite o código de 6 números. Os dois mudam automaticamente.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            if (qrPayload != null && accessCode != null) ...[
              Semantics(
                label: 'QR Code temporário para entrada na academia',
                child: QrImageView(
                  data: qrPayload!,
                  version: QrVersions.auto,
                  size: 240,
                  backgroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              const Text('Código temporário', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              SelectableText(
                formattedAccessCode,
                style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 5),
              ),
              const SizedBox(height: 8),
              Text(
                generatingCredential ? 'Atualizando credencial...' : 'Muda em $remainingSeconds segundos',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: credentialExpiresAt == null ? null : (remainingSeconds / 30).clamp(0.0, 1.0),
              ),
            ] else if (generatingCredential)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 80),
                child: CircularProgressIndicator(),
              )
            else
              const SizedBox(
                height: 180,
                child: Center(child: Icon(Icons.qr_code_2, size: 110)),
              ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: accessAllowed
                  ? () => _openPage(ScanGymQrPage(baseUrl: widget.baseUrl, token: widget.token))
                  : null,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Ler QR da catraca'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final overdueDays = access['overdue_days'] ?? 0;
    final frequency = accountOverview['frequency'] as Map<String, dynamic>? ?? {};
    final unread = accountOverview['unread_notifications']?.toString() ?? '0';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Área do aluno'),
        actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              profile['name'] == null ? 'Bem-vindo' : 'Olá, ${profile['name']}',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _shortcut(Icons.card_membership, 'Meu plano', 0),
                _shortcut(Icons.payments, 'Pagamentos', 1),
                _shortcut(Icons.history, 'Minhas entradas', 2),
                _shortcut(Icons.notifications, 'Notificações', 3, badge: unread),
                _pageShortcut(Icons.event, 'Aulas', StudentClassesPage(baseUrl: widget.baseUrl, token: widget.token)),
                _pageShortcut(Icons.show_chart, 'Minha evolução', EvolutionPage(baseUrl: widget.baseUrl, token: widget.token)),
              ],
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
                        Icon(accessAllowed ? Icons.verified : Icons.block, color: statusColor),
                        const SizedBox(width: 8),
                        Text(statusTitle, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: statusColor)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(access['message']?.toString() ?? message),
                    if (overdueDays > 0) ...[
                      const SizedBox(height: 6),
                      Text('Dias de atraso: $overdueDays de ${access['grace_days'] ?? 10} dias de carência.'),
                    ],
                    if (access['membership_ends_at'] != null) Text('Vigência da matrícula: ${access['membership_ends_at']}'),
                    const SizedBox(height: 8),
                    Text('Frequência: ${frequency['week_checkins'] ?? 0} entrada(s) nesta semana e ${frequency['month_checkins'] ?? 0} neste mês.'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            _credentialCard(),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.fitness_center),
                        SizedBox(width: 8),
                        Text('Treino atual', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(trainingPlan?['name']?.toString() ?? 'Nenhum treino ativo'),
                    if (trainingPlan != null)
                      Text('Nível: ${trainingPlan?['level'] ?? '-'} | Objetivo: ${trainingPlan?['goal'] ?? '-'} | ${trainingPlan?['age_days'] ?? 0} dias'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: currentDayId == null || completingWorkout ? null : _completeWorkout,
                      icon: const Icon(Icons.check_circle),
                      label: Text(completingWorkout ? 'Salvando...' : 'Marcar treino como concluído'),
                    ),
                  ],
                ),
              ),
            ),
            _section(
              'Exercícios de hoje',
              Icons.list_alt,
              exercises,
              (item) => '${item['exercise_name'] ?? '-'} | ${item['sets'] ?? '-'}x ${item['reps'] ?? '-'} | descanso ${item['rest_seconds'] ?? '-'}s',
              'Nenhum exercício para hoje.',
            ),
            _section(
              'Evolução física',
              Icons.monitor_heart,
              assessments,
              (item) => '${item['assessment_date'] ?? '-'} | Peso ${item['weight_kg'] ?? '-'} kg | Cintura ${item['waist_cm'] ?? '-'} cm',
              'Nenhuma avaliação registrada.',
            ),
            _section(
              'Metas',
              Icons.flag,
              goals,
              (item) => '${item['goal_type'] ?? 'Meta'} | Alvo ${item['target_value'] ?? '-'} | ${item['status'] ?? '-'}',
              'Nenhuma meta registrada.',
            ),
            _section(
              'Histórico de treinos',
              Icons.history,
              trainingLogs,
              (item) => '${item['completed_at'] ?? '-'} | ${item['day_title'] ?? item['plan_name'] ?? 'Treino'}',
              'Nenhum treino concluído.',
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
