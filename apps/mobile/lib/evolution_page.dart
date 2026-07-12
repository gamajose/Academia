import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class EvolutionPage extends StatefulWidget {
  const EvolutionPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<EvolutionPage> createState() => _EvolutionPageState();
}

class _EvolutionPageState extends State<EvolutionPage> {
  List<dynamic> assessments = [];
  List<dynamic> goals = [];
  bool loading = true;
  String message = 'Carregando evolucao...';

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (mounted) setState(() => loading = true);
    try {
      final response = await http.get(Uri.parse('${widget.baseUrl}/api/student/progress'), headers: headers);
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
      if (!mounted) return;
      setState(() {
        assessments = data['assessments'] as List<dynamic>? ?? [];
        goals = data['goals'] as List<dynamic>? ?? [];
        message = 'Evolucao atualizada.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  List<double> values(String field) {
    return assessments
        .reversed
        .map((raw) => double.tryParse('${(raw as Map<String, dynamic>)[field]}'))
        .whereType<double>()
        .toList();
  }

  String changeText(List<double> data, String suffix) {
    if (data.length < 2) return 'Dados insuficientes';
    final change = data.last - data.first;
    final sign = change > 0 ? '+' : '';
    return '$sign${change.toStringAsFixed(1)} $suffix desde a primeira avaliacao';
  }

  Widget chartCard(String title, String field, String suffix, IconData icon) {
    final data = values(field);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [Icon(icon), const SizedBox(width: 8), Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))]),
            const SizedBox(height: 8),
            Text(data.isEmpty ? 'Sem dados' : '${data.last.toStringAsFixed(1)} $suffix', style: const TextStyle(fontSize: 28)),
            Text(changeText(data, suffix)),
            const SizedBox(height: 12),
            SizedBox(
              height: 180,
              width: double.infinity,
              child: data.length < 2
                  ? const Center(child: Text('Registre ao menos duas avaliacoes para gerar o grafico.'))
                  : CustomPaint(painter: _LineChartPainter(data)),
            ),
          ],
        ),
      ),
    );
  }

  double? progressFor(Map<String, dynamic> goal) {
    final target = double.tryParse('${goal['target_value']}');
    final current = double.tryParse('${goal['current_value']}');
    if (target == null || target == 0 || current == null) return null;
    return (current / target).clamp(0, 1);
  }

  Widget goalCard(dynamic raw) {
    final goal = raw as Map<String, dynamic>;
    final progress = progressFor(goal);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [const Icon(Icons.flag), const SizedBox(width: 8), Expanded(child: Text('${goal['goal_type'] ?? 'Meta'}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))), Chip(label: Text('${goal['status'] ?? '-'}'))]),
            Text('Atual: ${goal['current_value'] ?? '-'} | Alvo: ${goal['target_value'] ?? '-'}'),
            if (goal['target_date'] != null) Text('Prazo: ${goal['target_date']}'),
            if (progress != null) ...[
              const SizedBox(height: 10),
              LinearProgressIndicator(value: progress),
              const SizedBox(height: 4),
              Text('${(progress * 100).toStringAsFixed(0)}% concluido'),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Minha evolucao'),
        actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            chartCard('Peso', 'weight_kg', 'kg', Icons.monitor_weight),
            chartCard('Gordura corporal', 'body_fat_percent', '%', Icons.percent),
            chartCard('Cintura', 'waist_cm', 'cm', Icons.straighten),
            const SizedBox(height: 12),
            const Text('Minhas metas', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            if (goals.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Nenhuma meta cadastrada.'))),
            ...goals.map(goalCard),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _LineChartPainter extends CustomPainter {
  const _LineChartPainter(this.values);
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    final range = maxValue == minValue ? 1.0 : maxValue - minValue;
    final linePaint = Paint()..color = Colors.blue..strokeWidth = 3..style = PaintingStyle.stroke;
    final gridPaint = Paint()..color = Colors.grey.withValues(alpha: 0.25)..strokeWidth = 1;
    final pointPaint = Paint()..color = Colors.blue..style = PaintingStyle.fill;
    final path = Path();

    for (var i = 0; i <= 4; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    for (var i = 0; i < values.length; i++) {
      final x = values.length == 1 ? size.width / 2 : size.width * i / (values.length - 1);
      final y = size.height - ((values[i] - minValue) / range * (size.height - 16)) - 8;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
      canvas.drawCircle(Offset(x, y), 4, pointPaint);
    }
    canvas.drawPath(path, linePaint);
  }

  @override
  bool shouldRepaint(covariant _LineChartPainter oldDelegate) => oldDelegate.values != values;
}
