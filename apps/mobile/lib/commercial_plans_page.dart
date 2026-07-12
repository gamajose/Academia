import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class CommercialPlansPage extends StatefulWidget {
  const CommercialPlansPage({super.key, required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;

  @override
  State<CommercialPlansPage> createState() => _CommercialPlansPageState();
}

class _CommercialPlansPageState extends State<CommercialPlansPage> {
  List<dynamic> plans = [];
  bool loading = true;
  String message = 'Carregando planos...';

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
      final result = await request('GET', '/api/plans/commercial');
      if (!mounted) return;
      setState(() {
        plans = result['data'] as List<dynamic>? ?? [];
        message = 'Planos atualizados.';
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

  Future<void> editPlan(Map<String, dynamic> plan) async {
    final name = TextEditingController(text: '${plan['name'] ?? ''}');
    final description = TextEditingController(text: '${plan['description'] ?? ''}');
    final price = TextEditingController(text: '${plan['price_cents'] ?? 0}');
    final duration = TextEditingController(text: '${plan['duration_days'] ?? 30}');
    final enrollment = TextEditingController(text: '${plan['enrollment_fee_cents'] ?? 0}');
    final cancellation = TextEditingController(text: '${plan['cancellation_fee_cents'] ?? 0}');
    final trial = TextEditingController(text: '${plan['trial_days'] ?? 0}');
    final services = TextEditingController(text: (plan['services_included'] as List<dynamic>? ?? []).join(', '));
    final allowedHours = TextEditingController(text: '${(plan['access_rules'] as Map<String, dynamic>?)?['hours'] ?? ''}');
    final allowedUnits = TextEditingController(text: ((plan['access_rules'] as Map<String, dynamic>?)?['units'] as List<dynamic>? ?? []).join(', '));
    String billingPeriod = '${plan['billing_period'] ?? 'monthly'}';
    bool autoRenew = plan['auto_renew'] == true;
    bool featured = plan['is_featured'] == true;
    bool active = plan['is_active'] != false;

    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: Text('Editar ${plan['name']}'),
          content: SizedBox(
            width: 620,
            child: SingleChildScrollView(
              child: Column(children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Nome comercial')),
                TextField(controller: description, decoration: const InputDecoration(labelText: 'Descricao'), maxLines: 3),
                TextField(controller: price, decoration: const InputDecoration(labelText: 'Valor em centavos'), keyboardType: TextInputType.number),
                TextField(controller: enrollment, decoration: const InputDecoration(labelText: 'Taxa de matricula em centavos'), keyboardType: TextInputType.number),
                TextField(controller: cancellation, decoration: const InputDecoration(labelText: 'Multa de cancelamento em centavos'), keyboardType: TextInputType.number),
                TextField(controller: duration, decoration: const InputDecoration(labelText: 'Duracao em dias'), keyboardType: TextInputType.number),
                TextField(controller: trial, decoration: const InputDecoration(labelText: 'Periodo de teste em dias'), keyboardType: TextInputType.number),
                DropdownButtonFormField<String>(
                  initialValue: billingPeriod,
                  decoration: const InputDecoration(labelText: 'Periodicidade'),
                  items: const [
                    DropdownMenuItem(value: 'monthly', child: Text('Mensal')),
                    DropdownMenuItem(value: 'quarterly', child: Text('Trimestral')),
                    DropdownMenuItem(value: 'semiannual', child: Text('Semestral')),
                    DropdownMenuItem(value: 'annual', child: Text('Anual')),
                  ],
                  onChanged: (value) => updateDialog(() => billingPeriod = value ?? 'monthly'),
                ),
                TextField(controller: services, decoration: const InputDecoration(labelText: 'Servicos incluidos, separados por virgula')),
                TextField(controller: allowedHours, decoration: const InputDecoration(labelText: 'Horarios permitidos')),
                TextField(controller: allowedUnits, decoration: const InputDecoration(labelText: 'Unidades permitidas, separadas por virgula')),
                SwitchListTile(value: autoRenew, onChanged: (value) => updateDialog(() => autoRenew = value), title: const Text('Renovacao automatica')),
                SwitchListTile(value: featured, onChanged: (value) => updateDialog(() => featured = value), title: const Text('Destacar na pagina de vendas')),
                SwitchListTile(value: active, onChanged: (value) => updateDialog(() => active = value), title: const Text('Plano ativo')),
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

    final payload = {
      'plan_id': plan['id'],
      'name': name.text.trim(),
      'description': description.text.trim(),
      'price_cents': int.tryParse(price.text),
      'duration_days': int.tryParse(duration.text),
      'enrollment_fee_cents': int.tryParse(enrollment.text),
      'cancellation_fee_cents': int.tryParse(cancellation.text),
      'trial_days': int.tryParse(trial.text),
      'billing_period': billingPeriod,
      'services_included': services.text.split(',').map((item) => item.trim()).where((item) => item.isNotEmpty).toList(),
      'access_rules': {
        'hours': allowedHours.text.trim(),
        'units': allowedUnits.text.split(',').map((item) => item.trim()).where((item) => item.isNotEmpty).toList(),
      },
      'auto_renew': autoRenew,
      'is_featured': featured,
      'is_active': active,
    };
    name.dispose(); description.dispose(); price.dispose(); duration.dispose(); enrollment.dispose(); cancellation.dispose(); trial.dispose(); services.dispose(); allowedHours.dispose(); allowedUnits.dispose();
    if (save != true || '${payload['name']}'.isEmpty) return;
    await request('POST', '/api/plans/commercial', payload);
    await refresh();
  }

  Widget planCard(dynamic raw) {
    final item = raw as Map<String, dynamic>;
    final services = item['services_included'] as List<dynamic>? ?? [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(item['is_featured'] == true ? Icons.star : Icons.card_membership),
            const SizedBox(width: 8),
            Expanded(child: Text('${item['name']}', style: const TextStyle(fontSize: 21, fontWeight: FontWeight.bold))),
            Chip(label: Text(item['is_active'] == true ? 'Ativo' : 'Inativo')),
          ]),
          Text('${money(item['price_cents'])} | ${item['duration_days']} dias | ${item['billing_period']}'),
          if (item['description'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${item['description']}')),
          if (services.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Inclui: ${services.join(', ')}')),
          Text('Matricula: ${money(item['enrollment_fee_cents'])} | Cancelamento: ${money(item['cancellation_fee_cents'])}'),
          Text('Teste: ${item['trial_days']} dias | Renovacao automatica: ${item['auto_renew'] == true ? 'Sim' : 'Nao'}'),
          const SizedBox(height: 10),
          FilledButton.icon(onPressed: () => editPlan(item), icon: const Icon(Icons.edit), label: const Text('Editar plano')),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Planos comerciais'), actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))]),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            const Text('Configuracao de venda e acesso', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (plans.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Nenhum plano cadastrado.'))),
            ...plans.map(planCard),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
