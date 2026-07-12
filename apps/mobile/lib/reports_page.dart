import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  int days = 30;
  Map<String, dynamic> summary = {};
  List<dynamic> daily = [];
  List<dynamic> plans = [];
  List<dynamic> overdue = [];
  List<dynamic> hours = [];
  bool loading = true;
  String message = 'Carregando relatorios...';

  Map<String, String> get headers => {'Content-Type': 'application/json', 'Authorization': 'Bearer ${widget.token}'};

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (mounted) setState(() => loading = true);
    try {
      final response = await http.get(Uri.parse('${widget.baseUrl}/api/reports/overview?days=$days'), headers: headers);
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
      if (!mounted) return;
      setState(() {
        summary = data['summary'] as Map<String, dynamic>? ?? {};
        daily = data['daily'] as List<dynamic>? ?? [];
        plans = data['plans'] as List<dynamic>? ?? [];
        overdue = data['overdue_members'] as List<dynamic>? ?? [];
        hours = data['checkins_by_hour'] as List<dynamic>? ?? [];
        message = 'Relatorio atualizado.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String money(dynamic cents) {
    final value = (num.tryParse('$cents') ?? 0) / 100;
    return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  Widget metric(String title, dynamic value, IconData icon, {bool currency = false}) {
    return SizedBox(
      width: 170,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(currency ? money(value) : '${value ?? 0}', style: const TextStyle(fontSize: 24)),
          ]),
        ),
      ),
    );
  }

  List<double> dailyCheckins() => daily.map((raw) => double.tryParse('${(raw as Map<String, dynamic>)['checkins']}') ?? 0).toList();
  List<double> dailyRevenue() => daily.map((raw) => (double.tryParse('${(raw as Map<String, dynamic>)['received_cents']}') ?? 0) / 100).toList();

  Widget chartCard(String title, List<double> values, String suffix) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          SizedBox(
            height: 190,
            width: double.infinity,
            child: values.isEmpty ? const Center(child: Text('Sem dados.')) : CustomPaint(painter: _BarChartPainter(values)),
          ),
          const SizedBox(height: 8),
          Text('Maior valor: ${values.isEmpty ? 0 : values.reduce(math.max).toStringAsFixed(1)} $suffix'),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Relatorios gerenciais'),
        actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 7, label: Text('7 dias')),
                ButtonSegment(value: 30, label: Text('30 dias')),
                ButtonSegment(value: 90, label: Text('90 dias')),
              ],
              selected: {days},
              onSelectionChanged: (value) {
                setState(() => days = value.first);
                refresh();
              },
            ),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              metric('Alunos ativos', summary['active_members'], Icons.people),
              metric('Novos alunos', summary['new_members'], Icons.person_add),
              metric('Check-ins', summary['checkins'], Icons.login),
              metric('Recebido', summary['received_cents'], Icons.payments, currency: true),
              metric('Em aberto', summary['outstanding_cents'], Icons.warning_amber, currency: true),
              metric('Aulas reservadas', summary['class_reservations'], Icons.event_available),
            ]),
            chartCard('Entradas por dia', dailyCheckins(), 'entradas'),
            chartCard('Receita por dia', dailyRevenue(), 'reais'),
            const Text('Planos mais utilizados', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            ...plans.map((raw) {
              final item = raw as Map<String, dynamic>;
              return Card(child: ListTile(leading: const Icon(Icons.card_membership), title: Text('${item['name']}'), trailing: Text('${item['memberships']} aluno(s)')));
            }),
            const SizedBox(height: 12),
            const Text('Alunos inadimplentes', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            if (overdue.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Nenhum aluno inadimplente.'))),
            ...overdue.map((raw) {
              final item = raw as Map<String, dynamic>;
              return Card(child: ListTile(leading: const Icon(Icons.warning, color: Colors.red), title: Text('${item['name']}'), subtitle: Text('${item['invoices']} parcela(s) | mais antiga: ${item['oldest_due_date']}'), trailing: Text(money(item['total_cents']))));
            }),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _BarChartPainter extends CustomPainter {
  const _BarChartPainter(this.values);
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    final maxValue = math.max(1.0, values.reduce(math.max));
    final gap = 3.0;
    final width = math.max(2.0, (size.width - gap * (values.length - 1)) / values.length);
    final barPaint = Paint()..color = Colors.blue..style = PaintingStyle.fill;
    final gridPaint = Paint()..color = Colors.grey.withValues(alpha: 0.25)..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }
    for (var i = 0; i < values.length; i++) {
      final height = values[i] / maxValue * (size.height - 8);
      final left = i * (width + gap);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(left, size.height - height, width, height), const Radius.circular(3)),
        barPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BarChartPainter oldDelegate) => oldDelegate.values != values;
}
