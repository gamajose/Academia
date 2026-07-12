import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class _ApiSession {
  const _ApiSession(this.baseUrl, this.token);
  final String baseUrl;
  final String token;

  Map<String, String> get headers => {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'};

  Future<Map<String, dynamic>> request(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$baseUrl$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(body ?? {}))
        : await http.get(uri, headers: headers);
    final result = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(result['error'] ?? 'erro_requisicao');
    return result;
  }
}

String _date(dynamic value) {
  if (value == null) return '-';
  final text = value.toString();
  if (text.length < 10) return text;
  final parts = text.substring(0, 10).split('-');
  return parts.length == 3 ? '${parts[2]}/${parts[1]}/${parts[0]}' : text;
}

String _dateTime(dynamic value) {
  final date = value == null ? null : DateTime.tryParse(value.toString())?.toLocal();
  if (date == null) return value?.toString() ?? '-';
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(date.day)}/${two(date.month)}/${date.year} ${two(date.hour)}:${two(date.minute)}';
}

String _money(dynamic cents) {
  final value = (num.tryParse('$cents') ?? 0) / 100;
  return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
}

class MemberWorkspacePage extends StatefulWidget {
  const MemberWorkspacePage({super.key, required this.baseUrl, required this.token, required this.memberId, required this.role});
  final String baseUrl;
  final String token;
  final String memberId;
  final String role;

  @override
  State<MemberWorkspacePage> createState() => _MemberWorkspacePageState();
}

class _MemberWorkspacePageState extends State<MemberWorkspacePage> {
  late final _ApiSession api = _ApiSession(widget.baseUrl, widget.token);
  Map<String, dynamic> data = {};
  bool loading = true;
  String message = 'Carregando ficha...';
  bool get isManager => widget.role == 'owner' || widget.role == 'admin';

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (mounted) setState(() => loading = true);
    try {
      final result = await api.request('GET', '/api/members/workspace?member_id=${widget.memberId}');
      if (!mounted) return;
      setState(() {
        data = result;
        message = 'Atualizado.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> editMember() async {
    final member = data['member'] as Map<String, dynamic>? ?? {};
    final staff = data['available_staff'] as List<dynamic>? ?? [];
    final fields = <String, TextEditingController>{
      'name': TextEditingController(text: '${member['name'] ?? ''}'),
      'email': TextEditingController(text: '${member['email'] ?? ''}'),
      'phone': TextEditingController(text: '${member['phone'] ?? ''}'),
      'document': TextEditingController(text: '${member['document'] ?? ''}'),
      'birth_date': TextEditingController(text: member['birth_date']?.toString().substring(0, 10) ?? ''),
      'address': TextEditingController(text: '${member['address'] ?? ''}'),
      'emergency_name': TextEditingController(text: '${member['emergency_name'] ?? ''}'),
      'emergency_phone': TextEditingController(text: '${member['emergency_phone'] ?? ''}'),
      'objective': TextEditingController(text: '${member['objective'] ?? ''}'),
      'allergies': TextEditingController(text: '${member['allergies'] ?? ''}'),
      'medical_notes': TextEditingController(text: '${member['medical_notes'] ?? ''}'),
      'nutrition_notes': TextEditingController(text: '${member['nutrition_notes'] ?? ''}'),
      'notes': TextEditingController(text: '${member['notes'] ?? ''}'),
    };
    String? assignedStaff = member['assigned_staff_id']?.toString();
    String status = member['status']?.toString() == 'inactive' ? 'inactive' : 'active';
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: const Text('Ficha completa do aluno'),
          content: SizedBox(
            width: 620,
            child: SingleChildScrollView(
              child: Column(children: [
                for (final entry in fields.entries)
                  TextField(
                    controller: entry.value,
                    maxLines: ['medical_notes', 'nutrition_notes', 'notes'].contains(entry.key) ? 3 : 1,
                    decoration: InputDecoration(labelText: const {
                      'name': 'Nome completo', 'email': 'E-mail', 'phone': 'Telefone', 'document': 'CPF ou documento',
                      'birth_date': 'Nascimento (AAAA-MM-DD)', 'address': 'Endereco', 'emergency_name': 'Contato de emergencia',
                      'emergency_phone': 'Telefone de emergencia', 'objective': 'Objetivo', 'allergies': 'Alergias',
                      'medical_notes': 'Restricoes e observacoes medicas', 'nutrition_notes': 'Observacoes nutricionais',
                      'notes': 'Observacoes internas'
                    }[entry.key]),
                  ),
                DropdownButtonFormField<String?>(
                  initialValue: assignedStaff,
                  decoration: const InputDecoration(labelText: 'Professor responsavel'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('Sem professor definido')),
                    ...staff.map((item) => DropdownMenuItem<String?>(value: item['id']?.toString(), child: Text('${item['name']} (${item['role']})'))),
                  ],
                  onChanged: (value) => updateDialog(() => assignedStaff = value),
                ),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: const [DropdownMenuItem(value: 'active', child: Text('Ativo')), DropdownMenuItem(value: 'inactive', child: Text('Inativo'))],
                  onChanged: (value) => updateDialog(() => status = value ?? 'active'),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar')),
          ],
        ),
      ),
    );
    final payload = <String, dynamic>{'member_id': widget.memberId, for (final entry in fields.entries) entry.key: entry.value.text.trim(), 'assigned_staff_id': assignedStaff, 'status': status};
    for (final controller in fields.values) { controller.dispose(); }
    if (save != true || '${payload['name']}'.isEmpty) return;
    await api.request('POST', '/api/members/workspace/update', payload);
    await refresh();
  }

  Future<void> editTrainingProfile() async {
    final profile = data['training_profile'] as Map<String, dynamic>? ?? {};
    final level = TextEditingController(text: '${profile['level'] ?? 'iniciante'}');
    final goal = TextEditingController(text: '${profile['goal'] ?? ''}');
    final restrictions = TextEditingController(text: '${profile['restrictions'] ?? ''}');
    final days = TextEditingController(text: '${profile['training_days_per_week'] ?? 3}');
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Perfil de treino'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: level, decoration: const InputDecoration(labelText: 'Nivel')),
        TextField(controller: goal, decoration: const InputDecoration(labelText: 'Objetivo')),
        TextField(controller: restrictions, decoration: const InputDecoration(labelText: 'Restricoes'), maxLines: 3),
        TextField(controller: days, decoration: const InputDecoration(labelText: 'Dias por semana'), keyboardType: TextInputType.number),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar'))],
    ));
    final payload = {'member_id': widget.memberId, 'level': level.text.trim(), 'goal': goal.text.trim(), 'restrictions': restrictions.text.trim(), 'training_days_per_week': int.tryParse(days.text)};
    level.dispose(); goal.dispose(); restrictions.dispose(); days.dispose();
    if (save != true) return;
    await api.request('POST', '/api/members/training-profile', payload);
    await refresh();
  }

  void openWorkout([String? planId]) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => WorkoutBuilderPage(baseUrl: widget.baseUrl, token: widget.token, memberId: widget.memberId, planId: planId))).then((_) => refresh());
  }

  Widget summaryTab() {
    final member = data['member'] as Map<String, dynamic>? ?? {};
    final memberships = data['memberships'] as List<dynamic>? ?? [];
    final current = memberships.isEmpty ? null : memberships.first as Map<String, dynamic>;
    final profile = data['training_profile'] as Map<String, dynamic>?;
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${member['name'] ?? ''}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        Text('${member['email'] ?? '-'} | ${member['phone'] ?? '-'}'),
        const Divider(),
        Text('Objetivo: ${member['objective'] ?? profile?['goal'] ?? '-'}'),
        Text('Professor: ${member['assigned_staff_name'] ?? 'Nao definido'}'),
        Text('Plano: ${current?['plan_name'] ?? 'Sem matricula'}'),
        Text('Vigencia: ${_date(current?['starts_at'])} ate ${_date(current?['ends_at'])}'),
        Text('Status: ${member['status'] ?? '-'}'),
      ]))),
      Card(child: ListTile(leading: const Icon(Icons.health_and_safety), title: const Text('Saude e seguranca'), subtitle: Text('Alergias: ${member['allergies'] ?? '-'}\nObservacoes medicas: ${member['medical_notes'] ?? '-'}\nEmergencia: ${member['emergency_name'] ?? member['emergency_contact'] ?? '-'} ${member['emergency_phone'] ?? ''}'), isThreeLine: true)),
      Card(child: ListTile(leading: const Icon(Icons.fitness_center), title: const Text('Perfil de treino'), subtitle: Text('Nivel: ${profile?['level'] ?? '-'} | ${profile?['training_days_per_week'] ?? '-'} dias/semana\nRestricoes: ${profile?['restrictions'] ?? '-'}'), trailing: IconButton(onPressed: editTrainingProfile, icon: const Icon(Icons.edit)))),
      if (isManager) FilledButton.icon(onPressed: editMember, icon: const Icon(Icons.edit), label: const Text('Editar ficha completa')),
    ]);
  }

  Widget workoutTab() {
    final plans = data['workout_plans'] as List<dynamic>? ?? [];
    return ListView(padding: const EdgeInsets.all(12), children: [
      Align(alignment: Alignment.centerRight, child: FilledButton.icon(onPressed: () => openWorkout(), icon: const Icon(Icons.add), label: const Text('Nova ficha'))),
      ...plans.map((raw) {
        final item = raw as Map<String, dynamic>;
        return Card(child: ListTile(leading: const Icon(Icons.assignment), title: Text('${item['name']}'), subtitle: Text('Status: ${item['status']} | ${item['workout_days']} dia(s) | ${item['exercise_count']} exercicio(s)\nRevisao: ${_date(item['review_due_at'])}'), trailing: const Icon(Icons.chevron_right), onTap: () => openWorkout(item['id']?.toString()), isThreeLine: true));
      }),
    ]);
  }

  Widget listTab(String key, Widget Function(Map<String, dynamic>) tile) {
    final items = data[key] as List<dynamic>? ?? [];
    return items.isEmpty ? const Center(child: Text('Nenhum registro.')) : ListView(padding: const EdgeInsets.all(12), children: items.map((raw) => tile(raw as Map<String, dynamic>)).toList());
  }

  @override
  Widget build(BuildContext context) {
    final member = data['member'] as Map<String, dynamic>? ?? {};
    return DefaultTabController(
      length: 6,
      child: Scaffold(
        appBar: AppBar(title: Text(member['name']?.toString() ?? 'Ficha do aluno'), actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))], bottom: const TabBar(isScrollable: true, tabs: [Tab(text: 'Resumo'), Tab(text: 'Treino'), Tab(text: 'Avaliacoes'), Tab(text: 'Frequencia'), Tab(text: 'Financeiro'), Tab(text: 'Metas')])),
        body: Stack(children: [
          TabBarView(children: [
            summaryTab(), workoutTab(),
            listTab('assessments', (item) => Card(child: ListTile(leading: const Icon(Icons.monitor_heart), title: Text('Avaliacao ${_date(item['assessment_date'])}'), subtitle: Text('Peso: ${item['weight_kg'] ?? '-'} kg | Gordura: ${item['body_fat_percent'] ?? '-'}% | Cintura: ${item['waist_cm'] ?? '-'} cm')))),
            listTab('checkins', (item) => Card(child: ListTile(leading: const Icon(Icons.door_front_door), title: Text(_dateTime(item['checked_at'])), subtitle: Text('${item['device_name'] ?? item['source'] ?? '-'} | ${item['access_status'] ?? 'registrado'}')))),
            listTab('payments', (item) => Card(child: ListTile(leading: Icon(item['status'] == 'paid' ? Icons.check_circle : Icons.warning_amber), title: Text('${_money(item['amount_cents'])} - ${item['status']}'), subtitle: Text('Vencimento: ${_date(item['due_date'])}${item['paid_at'] == null ? '' : '\nPago: ${_dateTime(item['paid_at'])}'}')))),
            listTab('goals', (item) => Card(child: ListTile(leading: const Icon(Icons.flag), title: Text('${item['goal_type'] ?? 'Meta'}'), subtitle: Text('Alvo: ${item['target_value'] ?? '-'} | Status: ${item['status'] ?? '-'} | Prazo: ${_date(item['target_date'])}')))),
          ]),
          if (loading) const LinearProgressIndicator(),
          Positioned(left: 8, right: 8, bottom: 4, child: Text(message, textAlign: TextAlign.center)),
        ]),
      ),
    );
  }
}

class WorkoutBuilderPage extends StatefulWidget {
  const WorkoutBuilderPage({super.key, required this.baseUrl, required this.token, required this.memberId, this.planId});
  final String baseUrl;
  final String token;
  final String memberId;
  final String? planId;

  @override
  State<WorkoutBuilderPage> createState() => _WorkoutBuilderPageState();
}

class _WorkoutBuilderPageState extends State<WorkoutBuilderPage> {
  late final _ApiSession api = _ApiSession(widget.baseUrl, widget.token);
  String? planId;
  Map<String, dynamic> plan = {};
  List<dynamic> days = [];
  List<dynamic> exercises = [];
  List<dynamic> library = [];
  bool loading = false;
  String message = 'Configure a ficha.';

  @override
  void initState() {
    super.initState();
    planId = widget.planId;
    if (planId != null) refreshPlan();
  }

  Future<void> refreshPlan() async {
    if (planId == null) return;
    setState(() => loading = true);
    try {
      final result = await api.request('GET', '/api/training/workspace/detail?plan_id=$planId');
      if (!mounted) return;
      setState(() {
        plan = result['plan'] as Map<String, dynamic>? ?? {};
        days = result['days'] as List<dynamic>? ?? [];
        exercises = result['exercises'] as List<dynamic>? ?? [];
        library = result['library'] as List<dynamic>? ?? [];
        message = 'Ficha atualizada.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> savePlan() async {
    final name = TextEditingController(text: '${plan['name'] ?? ''}');
    final level = TextEditingController(text: '${plan['level'] ?? 'iniciante'}');
    final goal = TextEditingController(text: '${plan['goal'] ?? ''}');
    final starts = TextEditingController(text: plan['starts_at']?.toString().substring(0, 10) ?? DateTime.now().toIso8601String().substring(0, 10));
    final review = TextEditingController(text: plan['review_due_at']?.toString().substring(0, 10) ?? '');
    final trainingDays = TextEditingController(text: '${plan['training_days_per_week'] ?? 3}');
    final notes = TextEditingController(text: '${plan['general_notes'] ?? ''}');
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text(planId == null ? 'Nova ficha' : 'Editar ficha'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Nome da ficha')),
        TextField(controller: level, decoration: const InputDecoration(labelText: 'Nivel')),
        TextField(controller: goal, decoration: const InputDecoration(labelText: 'Objetivo')),
        TextField(controller: starts, decoration: const InputDecoration(labelText: 'Inicio (AAAA-MM-DD)')),
        TextField(controller: review, decoration: const InputDecoration(labelText: 'Revisao prevista (AAAA-MM-DD)')),
        TextField(controller: trainingDays, decoration: const InputDecoration(labelText: 'Dias por semana'), keyboardType: TextInputType.number),
        TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacoes gerais'), maxLines: 3),
      ])),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar'))],
    ));
    final payload = {'plan_id': planId, 'member_id': widget.memberId, 'name': name.text.trim(), 'level': level.text.trim(), 'goal': goal.text.trim(), 'starts_at': starts.text.trim(), 'review_due_at': review.text.trim(), 'training_days_per_week': int.tryParse(trainingDays.text), 'general_notes': notes.text.trim(), 'status': 'active'};
    name.dispose(); level.dispose(); goal.dispose(); starts.dispose(); review.dispose(); trainingDays.dispose(); notes.dispose();
    if (save != true || '${payload['name']}'.isEmpty) return;
    final result = await api.request('POST', '/api/training/workspace/plan', payload);
    planId = result['id']?.toString();
    await refreshPlan();
  }

  Future<void> saveDay([Map<String, dynamic>? existing]) async {
    if (planId == null) return;
    final title = TextEditingController(text: '${existing?['title'] ?? ''}');
    final weekday = TextEditingController(text: '${existing?['weekday'] ?? 1}');
    final notes = TextEditingController(text: '${existing?['notes'] ?? ''}');
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text(existing == null ? 'Adicionar dia' : 'Editar dia'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: title, decoration: const InputDecoration(labelText: 'Titulo')), TextField(controller: weekday, decoration: const InputDecoration(labelText: 'Dia da semana (1-7)'), keyboardType: TextInputType.number), TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacoes'))]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar'))],
    ));
    final payload = {'plan_id': planId, 'workout_day_id': existing?['id'], 'title': title.text.trim(), 'weekday': int.tryParse(weekday.text), 'notes': notes.text.trim()};
    title.dispose(); weekday.dispose(); notes.dispose();
    if (save != true || '${payload['title']}'.isEmpty) return;
    await api.request('POST', '/api/training/workspace/day', payload);
    await refreshPlan();
  }

  Future<void> saveExercise(Map<String, dynamic> day, [Map<String, dynamic>? existing]) async {
    if (library.isEmpty) return;
    String? exerciseId = existing?['exercise_id']?.toString() ?? library.first['id']?.toString();
    String? substituteId = existing?['substitute_exercise_id']?.toString();
    final sets = TextEditingController(text: '${existing?['sets'] ?? 3}');
    final reps = TextEditingController(text: '${existing?['reps'] ?? '10-12'}');
    final loadController = TextEditingController(text: '${existing?['suggested_load'] ?? existing?['load_hint'] ?? ''}');
    final rest = TextEditingController(text: '${existing?['rest_seconds'] ?? 60}');
    final cadence = TextEditingController(text: '${existing?['cadence'] ?? ''}');
    final method = TextEditingController(text: '${existing?['training_method'] ?? ''}');
    final progression = TextEditingController(text: '${existing?['progression_rule'] ?? ''}');
    final notes = TextEditingController(text: '${existing?['notes'] ?? ''}');
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (dialogContext, updateDialog) => AlertDialog(
      title: Text(existing == null ? 'Adicionar exercicio' : 'Editar exercicio'),
      content: SizedBox(width: 600, child: SingleChildScrollView(child: Column(children: [
        DropdownButtonFormField<String>(initialValue: exerciseId, decoration: const InputDecoration(labelText: 'Exercicio'), items: library.map((item) => DropdownMenuItem(value: item['id']?.toString(), child: Text('${item['name']} - ${item['muscle_group']}'))).toList(), onChanged: (value) => updateDialog(() => exerciseId = value)),
        TextField(controller: sets, decoration: const InputDecoration(labelText: 'Series'), keyboardType: TextInputType.number),
        TextField(controller: reps, decoration: const InputDecoration(labelText: 'Repeticoes')),
        TextField(controller: loadController, decoration: const InputDecoration(labelText: 'Carga sugerida')),
        TextField(controller: rest, decoration: const InputDecoration(labelText: 'Descanso em segundos'), keyboardType: TextInputType.number),
        TextField(controller: cadence, decoration: const InputDecoration(labelText: 'Cadencia')),
        TextField(controller: method, decoration: const InputDecoration(labelText: 'Metodo')),
        TextField(controller: progression, decoration: const InputDecoration(labelText: 'Regra de progressao'), maxLines: 2),
        DropdownButtonFormField<String?>(initialValue: substituteId, decoration: const InputDecoration(labelText: 'Exercicio substituto'), items: [const DropdownMenuItem<String?>(value: null, child: Text('Nenhum')), ...library.map((item) => DropdownMenuItem<String?>(value: item['id']?.toString(), child: Text('${item['name']}')))], onChanged: (value) => updateDialog(() => substituteId = value)),
        TextField(controller: notes, decoration: const InputDecoration(labelText: 'Instrucoes e observacoes'), maxLines: 3),
      ]))),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Salvar'))],
    )));
    final payload = {'workout_exercise_id': existing?['id'], 'workout_day_id': day['id'], 'exercise_id': exerciseId, 'sets': int.tryParse(sets.text), 'reps': reps.text.trim(), 'suggested_load': loadController.text.trim(), 'rest_seconds': int.tryParse(rest.text), 'cadence': cadence.text.trim(), 'training_method': method.text.trim(), 'progression_rule': progression.text.trim(), 'substitute_exercise_id': substituteId, 'notes': notes.text.trim(), 'order_index': existing?['order_index'] ?? 1};
    sets.dispose(); reps.dispose(); loadController.dispose(); rest.dispose(); cadence.dispose(); method.dispose(); progression.dispose(); notes.dispose();
    if (save != true || exerciseId == null) return;
    await api.request('POST', '/api/training/workspace/exercise', payload);
    await refreshPlan();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(planId == null ? 'Nova ficha de treino' : '${plan['name'] ?? 'Ficha de treino'}'), actions: [IconButton(onPressed: savePlan, icon: const Icon(Icons.save)), if (planId != null) IconButton(onPressed: refreshPlan, icon: const Icon(Icons.refresh))]),
      floatingActionButton: planId == null ? FloatingActionButton.extended(onPressed: savePlan, icon: const Icon(Icons.add), label: const Text('Criar ficha')) : FloatingActionButton.extended(onPressed: () => saveDay(), icon: const Icon(Icons.add), label: const Text('Adicionar dia')),
      body: Stack(children: [
        ListView(padding: const EdgeInsets.all(12), children: [
          if (planId == null) const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('Crie a ficha primeiro. Depois adicione os dias e exercicios.'))),
          if (planId != null) Card(child: ListTile(title: Text('${plan['name'] ?? ''}'), subtitle: Text('Objetivo: ${plan['goal'] ?? '-'} | Revisao: ${plan['review_due_at'] ?? '-'}\n${plan['general_notes'] ?? ''}'), trailing: IconButton(onPressed: savePlan, icon: const Icon(Icons.edit)), isThreeLine: true)),
          ...days.map((rawDay) {
            final day = rawDay as Map<String, dynamic>;
            final dayExercises = exercises.where((raw) => (raw as Map<String, dynamic>)['workout_day_id'] == day['id']).toList();
            return Card(child: ExpansionTile(title: Text('${day['weekday']} - ${day['title']}'), subtitle: Text('${dayExercises.length} exercicio(s)'), trailing: IconButton(onPressed: () => saveDay(day), icon: const Icon(Icons.edit)), children: [
              ...dayExercises.map((raw) {
                final item = raw as Map<String, dynamic>;
                return ListTile(title: Text('${item['exercise_name']}'), subtitle: Text('${item['sets']}x ${item['reps']} | Carga: ${item['suggested_load'] ?? item['load_hint'] ?? '-'} | Descanso: ${item['rest_seconds']}s\nCadencia: ${item['cadence'] ?? '-'} | Metodo: ${item['training_method'] ?? '-'}\nProgressao: ${item['progression_rule'] ?? '-'}'), isThreeLine: true, trailing: IconButton(onPressed: () => saveExercise(day, item), icon: const Icon(Icons.edit)));
              }),
              Padding(padding: const EdgeInsets.all(8), child: OutlinedButton.icon(onPressed: () => saveExercise(day), icon: const Icon(Icons.add), label: const Text('Adicionar exercicio'))),
            ]));
          }),
          const SizedBox(height: 80),
          Text(message, textAlign: TextAlign.center),
        ]),
        if (loading) const LinearProgressIndicator(),
      ]),
    );
  }
}
