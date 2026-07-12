import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class StudentClassesPage extends StatefulWidget {
  const StudentClassesPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<StudentClassesPage> createState() => _StudentClassesPageState();
}

class _StudentClassesPageState extends State<StudentClassesPage> {
  List<dynamic> sessions = [];
  bool loading = true;
  String message = 'Carregando agenda...';

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

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
      final result = await request('GET', '/api/student/classes');
      if (!mounted) return;
      setState(() {
        sessions = result['data'] as List<dynamic>? ?? [];
        message = 'Agenda atualizada.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro ao carregar: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String dateTimeText(dynamic value) {
    final date = value == null ? null : DateTime.tryParse(value.toString())?.toLocal();
    if (date == null) return '-';
    String two(int number) => number.toString().padLeft(2, '0');
    const weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    return '${weekdays[date.weekday - 1]}, ${two(date.day)}/${two(date.month)} ${two(date.hour)}:${two(date.minute)}';
  }

  Future<void> reserve(Map<String, dynamic> item) async {
    try {
      final result = await request('POST', '/api/student/classes/reserve', {'session_id': item['session_id']});
      if (!mounted) return;
      final status = result['status'] == 'waitlist' ? 'Voce entrou na lista de espera.' : 'Reserva confirmada.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(status)));
      await refresh();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $error')));
    }
  }

  Future<void> cancel(Map<String, dynamic> item) async {
    try {
      await request('POST', '/api/student/classes/cancel', {'session_id': item['session_id']});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
      await refresh();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $error')));
    }
  }

  Widget sessionCard(dynamic raw) {
    final item = raw as Map<String, dynamic>;
    final reservation = item['reservation_status']?.toString();
    final reserved = num.tryParse('${item['reserved']}')?.toInt() ?? 0;
    final capacity = num.tryParse('${item['capacity']}')?.toInt() ?? 0;
    final canReserve = reservation == null || reservation == 'cancelled';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.groups),
                const SizedBox(width: 8),
                Expanded(child: Text('${item['name']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
                if (reservation != null && reservation != 'cancelled') Chip(label: Text(reservation == 'waitlist' ? 'Lista de espera' : 'Reservado')),
              ],
            ),
            const SizedBox(height: 8),
            Text(dateTimeText(item['starts_at'])),
            Text('Professor: ${item['instructor_name'] ?? 'A definir'}'),
            Text('Sala: ${item['room'] ?? '-'} | Nivel: ${item['level'] ?? 'Livre'}'),
            Text('Vagas: $reserved/$capacity'),
            if (item['description'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${item['description']}')),
            const SizedBox(height: 12),
            if (canReserve)
              FilledButton.icon(
                onPressed: () => reserve(item),
                icon: const Icon(Icons.event_available),
                label: Text(item['has_spots'] == true ? 'Reservar vaga' : 'Entrar na fila'),
              )
            else
              OutlinedButton.icon(
                onPressed: () => cancel(item),
                icon: const Icon(Icons.event_busy),
                label: const Text('Cancelar reserva'),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Aulas e agenda'),
        actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            const Text('Proximas aulas', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (sessions.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('Nenhuma aula disponivel.'))),
            ...sessions.map(sessionCard),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
