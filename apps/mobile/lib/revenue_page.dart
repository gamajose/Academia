import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class RevenuePage extends StatefulWidget {
  const RevenuePage({super.key, required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;
  @override
  State<RevenuePage> createState() => _RevenuePageState();
}

class _RevenuePageState extends State<RevenuePage> {
  Map<String, dynamic> summary = {};
  List<dynamic> rows = [];
  String status = 'Carregando...';

  String brl(dynamic cents) => 'R\$ ${((num.tryParse('$cents') ?? 0) / 100).toStringAsFixed(2)}';

  Future<void> refresh() async {
    try {
      final response = await http.get(
        Uri.parse('${widget.baseUrl}/api/reports/finance-advanced'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      );
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro');
      setState(() {
        summary = data['summary'] as Map<String, dynamic>? ?? {};
        rows = data['data'] as List<dynamic>? ?? [];
        status = 'Atualizado.';
      });
    } catch (error) {
      setState(() => status = 'Erro: $error');
    }
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Resumo financeiro'), actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))]),
        body: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Card(child: ListTile(title: const Text('A receber'), trailing: Text(brl(summary['pending_amount_cents'])))),
            Card(child: ListTile(title: const Text('Recebido'), trailing: Text(brl(summary['paid_amount_cents'])))),
            Text(status),
            const Divider(),
            ...rows.map((item) => ListTile(title: Text(item['member_name'] ?? ''), subtitle: Text('${item['status']} | ${item['due_date']}'), trailing: Text(brl(item['amount_cents'])))),
          ],
        ),
      );
}
