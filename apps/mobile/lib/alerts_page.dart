import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class AlertsPage extends StatefulWidget {
  const AlertsPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<AlertsPage> createState() => _AlertsPageState();
}

class _AlertsPageState extends State<AlertsPage> {
  Map<String, dynamic> summary = {};
  List<dynamic> overdue = [];
  List<dynamic> memberships = [];
  List<dynamic> trainings = [];
  List<dynamic> assessments = [];
  String message = 'Carregando alertas...';

  Map<String, String> get headers => {'Authorization': 'Bearer ${widget.token}'};

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await http.get(Uri.parse('${widget.baseUrl}$path'), headers: headers);
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
      final result = await getJson('/api/alerts');
      setState(() {
        summary = result['summary'] as Map<String, dynamic>? ?? {};
        overdue = result['overdue_payments'] as List<dynamic>? ?? [];
        memberships = result['memberships_due_soon'] as List<dynamic>? ?? [];
        trainings = result['training_reviews_due'] as List<dynamic>? ?? [];
        assessments = result['assessments_due'] as List<dynamic>? ?? [];
        message = 'Alertas atualizados.';
      });
    } catch (error) {
      setState(() => message = 'Erro ao carregar alertas: $error');
    }
  }

  String cents(dynamic value) {
    final number = NumberFormatFallback.toDouble(value) / 100;
    return 'R\$ ${number.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  Widget metric(String title, dynamic value) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('${value ?? 0}', style: const TextStyle(fontSize: 28)),
        ]),
      ),
    );
  }

  Widget section(String title, List<dynamic> rows, String Function(dynamic) label, String empty) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          if (rows.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(empty)),
          ...rows.map((item) => ListTile(title: Text(label(item)))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alertas'), actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))]),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              metric('Total', summary['total']),
              metric('Financeiro', summary['overdue_payments']),
              metric('Matrículas', summary['memberships_due_soon']),
              metric('Treinos', summary['training_reviews_due']),
              metric('Avaliações', summary['assessments_due']),
            ]),
            const SizedBox(height: 8),
            Text(message),
            section('Pagamentos vencidos', overdue, (item) => '${item['member_name']} - ${cents(item['amount_cents'])} - ${item['days_overdue']} dias', 'Nenhum pagamento vencido.'),
            section('Matrículas vencendo', memberships, (item) => '${item['member_name']} - vence em ${item['days_remaining']} dias', 'Nenhuma matrícula vencendo.'),
            section('Fichas para revisar', trainings, (item) => '${item['member_name']} - ${item['plan_name']} - ${item['age_days']} dias', 'Nenhuma ficha para revisar.'),
            section('Avaliações pendentes', assessments, (item) => '${item['member_name']} - última: ${item['last_assessment_date'] ?? 'nunca'}', 'Nenhuma avaliação pendente.'),
          ],
        ),
      ),
    );
  }
}

class NumberFormatFallback {
  static double toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse('$value') ?? 0;
  }
}
