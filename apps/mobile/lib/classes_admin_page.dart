import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class ClassesAdminPage extends StatefulWidget {
  const ClassesAdminPage({super.key, required this.baseUrl, required this.token, required this.isManager});
  final String baseUrl;
  final String token;
  final bool isManager;

  @override
  State<ClassesAdminPage> createState() => _ClassesAdminPageState();
}

class _ClassesAdminPageState extends State<ClassesAdminPage> {
  List<dynamic> classes = [];
  List<dynamic> sessions = [];
  bool loading = true;
  String message = 'Carregando aulas...';

  Map<String, String> get headers => {'Content-Type': 'application/json', 'Authorization': 'Bearer ${widget.token}'};

  Future<Map<String, dynamic>> request(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('${widget.baseUrl}$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(body ?? {}))
        : await http.get(uri, headers: headers);
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
    if (mounted) setState(() => loading = true);
    try {
      final result = await Future.wait([
        request('GET', '/api/classes'),
        request('GET', '/api/classes/sessions/upcoming'),
      ]);
      if (!mounted) return;
      setState(() {
        classes = result[0]['data'] as List<dynamic>? ?? [];
        sessions = result[1]['data'] as List<dynamic>? ?? [];
        message = 'Agenda atualizada.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String dateTimeText(dynamic value) {
    final date = value == null ? null : DateTime.tryParse(value.toString())?.toLocal();
    if (date == null) return '-';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year} ${two(date.hour)}:${two(date.minute)}';
  }

  Future<void> createClass() async {
    final name = TextEditingController();
    final description = TextEditingController();
    final room = TextEditingController();
    final capacity = TextEditingController(text: '20');
    final duration = TextEditingController(text: '60');
    final level = TextEditingController(text: 'Livre');
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Nova modalidade'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Nome da aula')),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Descricao'), maxLines: 3),
            TextField(controller: room, decoration: const InputDecoration(labelText: 'Sala')),
            TextField(controller: capacity, decoration: const InputDecoration(labelText: 'Capacidade'), keyboardType: TextInputType.number),
            TextField(controller: duration, decoration: const InputDecoration(labelText: 'Duracao em minutos'), keyboardType: TextInputType.number),
            TextField(controller: level, decoration: const InputDecoration(labelText: 'Nivel')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Criar')),
        ],
      ),
    );
    final payload = {
      'name': name.text.trim(),
      'description': description.text.trim(),
      'room': room.text.trim(),
      'capacity': int.tryParse(capacity.text),
      'duration_minutes': int.tryParse(duration.text),
      'level': level.text.trim(),
    };
    name.dispose(); description.dispose(); room.dispose(); capacity.dispose(); duration.dispose(); level.dispose();
    if (save != true || '${payload['name']}'.isEmpty) return;
    await request('POST', '/api/classes', payload);
    await refresh();
  }

  Future<void> createSession() async {
    if (classes.isEmpty) return;
    String? classId = classes.first['id']?.toString();
    final startsAt = TextEditingController(text: DateTime.now().add(const Duration(days: 1)).toIso8601String().substring(0, 16));
    final capacity = TextEditingController(text: '${classes.first['capacity'] ?? 20}');
    final notes = TextEditingController();
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: const Text('Agendar aula'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: classId,
                decoration: const InputDecoration(labelText: 'Modalidade'),
                items: classes.map((item) => DropdownMenuItem(value: item['id']?.toString(), child: Text('${item['name']}'))).toList(),
                onChanged: (value) => updateDialog(() => classId = value),
              ),
              TextField(controller: startsAt, decoration: const InputDecoration(labelText: 'Inicio (AAAA-MM-DDTHH:MM)')),
              TextField(controller: capacity, decoration: const InputDecoration(labelText: 'Capacidade'), keyboardType: TextInputType.number),
              TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacoes')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Agendar')),
          ],
        ),
      ),
    );
    final payload = {'class_id': classId, 'starts_at': startsAt.text.trim(), 'capacity': int.tryParse(capacity.text), 'notes': notes.text.trim()};
    startsAt.dispose(); capacity.dispose(); notes.dispose();
    if (save != true || classId == null) return;
    await request('POST', '/api/classes/sessions', payload);
    await refresh();
  }

  Future<void> openRoster(Map<String, dynamic> session) async {
    final result = await request('GET', '/api/classes/session/roster?session_id=${session['session_id']}');
    final roster = result['data'] as List<dynamic>? ?? [];
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Presenca - ${session['name']}'),
        content: SizedBox(
          width: 560,
          child: roster.isEmpty
              ? const Text('Nenhuma reserva.')
              : StatefulBuilder(
                  builder: (dialogContext, updateDialog) => ListView(
                    shrinkWrap: true,
                    children: roster.map((raw) {
                      final item = raw as Map<String, dynamic>;
                      return ListTile(
                        title: Text('${item['member_name']}'),
                        subtitle: Text('${item['status']} | ${item['phone'] ?? '-'}'),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(
                            tooltip: 'Presente',
                            onPressed: () async {
                              await request('POST', '/api/classes/session/attendance', {'reservation_id': item['id'], 'status': 'attended'});
                              item['status'] = 'attended';
                              updateDialog(() {});
                            },
                            icon: const Icon(Icons.check_circle, color: Colors.green),
                          ),
                          IconButton(
                            tooltip: 'Ausente',
                            onPressed: () async {
                              await request('POST', '/api/classes/session/attendance', {'reservation_id': item['id'], 'status': 'absent'});
                              item['status'] = 'absent';
                              updateDialog(() {});
                            },
                            icon: const Icon(Icons.cancel, color: Colors.red),
                          ),
                        ]),
                      );
                    }).toList(),
                  ),
                ),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Fechar'))],
      ),
    );
    await refresh();
  }

  Widget sessionCard(dynamic raw) {
    final item = raw as Map<String, dynamic>;
    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.event)),
        title: Text('${item['name']}'),
        subtitle: Text('${dateTimeText(item['starts_at'])} | ${item['room'] ?? '-'}\nConfirmados: ${item['confirmed']}/${item['capacity']} | Espera: ${item['waitlist']} | Presentes: ${item['attended']}'),
        isThreeLine: true,
        trailing: IconButton(onPressed: () => openRoster(item), icon: const Icon(Icons.groups)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Aulas e agenda'), actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))]),
      floatingActionButton: FloatingActionButton.extended(onPressed: createSession, icon: const Icon(Icons.add), label: const Text('Agendar aula')),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Row(children: [
              const Expanded(child: Text('Proximas aulas', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold))),
              if (widget.isManager) OutlinedButton.icon(onPressed: createClass, icon: const Icon(Icons.add), label: const Text('Nova modalidade')),
            ]),
            const SizedBox(height: 8),
            if (sessions.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Nenhuma aula agendada.'))),
            ...sessions.map(sessionCard),
            const SizedBox(height: 80),
            Text(message, textAlign: TextAlign.center),
            if (loading) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
