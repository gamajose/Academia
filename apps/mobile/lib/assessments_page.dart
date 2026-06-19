import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class AssessmentsPage extends StatefulWidget {
  const AssessmentsPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<AssessmentsPage> createState() => _AssessmentsPageState();
}

class _AssessmentsPageState extends State<AssessmentsPage> {
  List<dynamic> members = [];
  List<dynamic> assessments = [];
  List<dynamic> goals = [];
  String? selectedMemberId;
  Map<String, dynamic>? summary;
  String message = 'Carregando avaliações...';

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
      final memberResult = await getJson('/api/members');
      final assessmentResult = await getJson('/api/assessments');
      final goalResult = await getJson('/api/goals');
      setState(() {
        members = memberResult['data'] as List<dynamic>? ?? [];
        assessments = assessmentResult['data'] as List<dynamic>? ?? [];
        goals = goalResult['data'] as List<dynamic>? ?? [];
        selectedMemberId ??= members.isNotEmpty ? members.first['id'] as String : null;
        message = 'Avaliações atualizadas.';
      });
      if (selectedMemberId != null) await loadSummary(selectedMemberId!);
    } catch (error) {
      setState(() => message = 'Erro ao carregar avaliações: $error');
    }
  }

  Future<void> loadSummary(String memberId) async {
    try {
      final result = await getJson('/api/assessments/summary?member_id=$memberId');
      setState(() => summary = result);
    } catch (error) {
      setState(() => message = 'Erro no resumo: $error');
    }
  }

  Future<void> quickAssessment() async {
    if (selectedMemberId == null) return;
    final weight = TextEditingController();
    final fat = TextEditingController();
    final waist = TextEditingController();
    final notes = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Nova avaliação rápida'),
        content: SingleChildScrollView(
          child: Column(children: [
            TextField(controller: weight, decoration: const InputDecoration(labelText: 'Peso kg'), keyboardType: TextInputType.number),
            TextField(controller: fat, decoration: const InputDecoration(labelText: 'Gordura %'), keyboardType: TextInputType.number),
            TextField(controller: waist, decoration: const InputDecoration(labelText: 'Cintura cm'), keyboardType: TextInputType.number),
            TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observações')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              await postJson('/api/assessments', {
                'member_id': selectedMemberId,
                'weight_kg': weight.text,
                'body_fat_percent': fat.text,
                'waist_cm': waist.text,
                'notes': notes.text,
              });
              if (!mounted) return;
              Navigator.pop(context);
              await refresh();
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
  }

  Widget summaryCard() {
    final current = summary?['current'];
    final delta = summary?['delta'];
    if (current == null) return const Card(child: ListTile(title: Text('Nenhuma avaliação para o aluno selecionado.')));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Resumo comparativo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          Text('Data: ${current['assessment_date']}'),
          Text('Peso: ${current['weight_kg'] ?? '-'} kg | variação ${delta?['weight_kg'] ?? '-'}'),
          Text('Gordura: ${current['body_fat_percent'] ?? '-'}% | variação ${delta?['body_fat_percent'] ?? '-'}'),
          Text('Cintura: ${current['waist_cm'] ?? '-'} cm | variação ${delta?['waist_cm'] ?? '-'}'),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredAssessments = selectedMemberId == null ? assessments : assessments.where((a) => a['member_id'] == selectedMemberId).toList();
    final filteredGoals = selectedMemberId == null ? goals : goals.where((g) => g['member_id'] == selectedMemberId).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Avaliações'), actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))]),
      floatingActionButton: FloatingActionButton.extended(onPressed: quickAssessment, icon: const Icon(Icons.add), label: const Text('Avaliação')),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text(message),
            DropdownButton<String>(
              isExpanded: true,
              value: selectedMemberId,
              hint: const Text('Selecione o aluno'),
              items: members.map((m) => DropdownMenuItem<String>(value: m['id'], child: Text(m['name'] ?? 'Aluno'))).toList(),
              onChanged: (value) async {
                setState(() => selectedMemberId = value);
                if (value != null) await loadSummary(value);
              },
            ),
            summaryCard(),
            const Divider(),
            const Text('Metas', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...filteredGoals.map((g) => ListTile(title: Text(g['goal_type'] ?? ''), subtitle: Text('Alvo: ${g['target_value'] ?? '-'} | Data: ${g['target_date'] ?? '-'} | ${g['status']}'))),
            const Divider(),
            const Text('Histórico de avaliações', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...filteredAssessments.map((a) => ListTile(title: Text('${a['assessment_date']}'), subtitle: Text('Peso ${a['weight_kg'] ?? '-'}kg | Gordura ${a['body_fat_percent'] ?? '-'}% | Cintura ${a['waist_cm'] ?? '-'}cm'))),
          ],
        ),
      ),
    );
  }
}
