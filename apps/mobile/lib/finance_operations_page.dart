import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class FinanceOperationsPage extends StatefulWidget {
  const FinanceOperationsPage({super.key, required this.baseUrl, required this.token});
  final String baseUrl;
  final String token;

  @override
  State<FinanceOperationsPage> createState() => _FinanceOperationsPageState();
}

class _FinanceOperationsPageState extends State<FinanceOperationsPage> {
  Map<String, dynamic> overview = {};
  List<dynamic> receivables = [];
  List<dynamic> cashSessions = [];
  List<dynamic> leads = [];
  bool loading = true;
  String message = 'Carregando financeiro...';

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
      final results = await Future.wait([
        request('GET', '/api/finance/operations/overview'),
        request('GET', '/api/finance/receivables?status=open'),
        request('GET', '/api/finance/cash'),
        request('GET', '/api/sales/leads?status=all'),
      ]);
      if (!mounted) return;
      setState(() {
        overview = results[0];
        receivables = results[1]['data'] as List<dynamic>? ?? [];
        cashSessions = results[2]['data'] as List<dynamic>? ?? [];
        leads = results[3]['data'] as List<dynamic>? ?? [];
        message = 'Atualizado.';
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

  String dateOnly(dynamic value) {
    if (value == null) return '-';
    final text = value.toString();
    if (text.length < 10) return text;
    final parts = text.substring(0, 10).split('-');
    return parts.length == 3 ? '${parts[2]}/${parts[1]}/${parts[0]}' : text;
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
            Text(currency ? money(value) : '${value ?? 0}', style: const TextStyle(fontSize: 23)),
          ]),
        ),
      ),
    );
  }

  Future<void> settle(Map<String, dynamic> item) async {
    final amount = TextEditingController(text: '${item['amount_cents'] ?? 0}');
    final discount = TextEditingController(text: '${item['discount_cents'] ?? 0}');
    final fee = TextEditingController(text: '${item['fee_cents'] ?? 0}');
    final notes = TextEditingController();
    String method = 'pix';
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: Text('Receber de ${item['member_name']}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: amount, decoration: const InputDecoration(labelText: 'Valor final em centavos'), keyboardType: TextInputType.number),
            TextField(controller: discount, decoration: const InputDecoration(labelText: 'Desconto em centavos'), keyboardType: TextInputType.number),
            TextField(controller: fee, decoration: const InputDecoration(labelText: 'Multa e juros em centavos'), keyboardType: TextInputType.number),
            DropdownButtonFormField<String>(
              initialValue: method,
              decoration: const InputDecoration(labelText: 'Forma de pagamento'),
              items: const [
                DropdownMenuItem(value: 'pix', child: Text('PIX')),
                DropdownMenuItem(value: 'cash', child: Text('Dinheiro')),
                DropdownMenuItem(value: 'credit_card', child: Text('Cartao de credito')),
                DropdownMenuItem(value: 'debit_card', child: Text('Cartao de debito')),
                DropdownMenuItem(value: 'bank_transfer', child: Text('Transferencia')),
                DropdownMenuItem(value: 'other', child: Text('Outro')),
              ],
              onChanged: (value) => updateDialog(() => method = value ?? 'other'),
            ),
            TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacao')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Receber e emitir recibo')),
          ],
        ),
      ),
    );
    final payload = {
      'payment_id': item['id'],
      'amount_cents': int.tryParse(amount.text),
      'discount_cents': int.tryParse(discount.text),
      'fee_cents': int.tryParse(fee.text),
      'method': method,
      'notes': notes.text.trim(),
    };
    amount.dispose(); discount.dispose(); fee.dispose(); notes.dispose();
    if (save != true) return;
    try {
      final result = await request('POST', '/api/finance/payments/settle', payload);
      if (!mounted) return;
      final receipt = result['receipt'] as Map<String, dynamic>? ?? {};
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Pagamento recebido'),
          content: SelectableText('Recibo: ${receipt['receipt_number'] ?? '-'}\nValor: ${money(receipt['amount_cents'])}'),
          actions: [FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Concluir'))],
        ),
      );
      await refresh();
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $error')));
    }
  }

  Future<void> agreement(Map<String, dynamic> item) async {
    final total = TextEditingController(text: '${item['amount_cents'] ?? 0}');
    final installments = TextEditingController(text: '2');
    final firstDue = TextEditingController(text: DateTime.now().add(const Duration(days: 7)).toIso8601String().substring(0, 10));
    final notes = TextEditingController();
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Renegociar ${item['member_name']}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: total, decoration: const InputDecoration(labelText: 'Total negociado em centavos'), keyboardType: TextInputType.number),
          TextField(controller: installments, decoration: const InputDecoration(labelText: 'Quantidade de parcelas'), keyboardType: TextInputType.number),
          TextField(controller: firstDue, decoration: const InputDecoration(labelText: 'Primeiro vencimento (AAAA-MM-DD)')),
          TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacao')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Criar acordo')),
        ],
      ),
    );
    final payload = {
      'member_id': item['member_id'],
      'negotiated_total_cents': int.tryParse(total.text),
      'installment_count': int.tryParse(installments.text),
      'first_due_date': firstDue.text.trim(),
      'notes': notes.text.trim(),
    };
    total.dispose(); installments.dispose(); firstDue.dispose(); notes.dispose();
    if (save != true) return;
    await request('POST', '/api/finance/agreements', payload);
    await refresh();
  }

  Future<void> openCash() async {
    final opening = TextEditingController(text: '0');
    final notes = TextEditingController();
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Abrir caixa'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: opening, decoration: const InputDecoration(labelText: 'Saldo inicial em centavos'), keyboardType: TextInputType.number),
        TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacao')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Abrir'))],
    ));
    final payload = {'opening_balance_cents': int.tryParse(opening.text), 'notes': notes.text.trim()};
    opening.dispose(); notes.dispose();
    if (save != true) return;
    await request('POST', '/api/finance/cash/open', payload);
    await refresh();
  }

  Future<void> addMovement(String type) async {
    final amount = TextEditingController();
    final description = TextEditingController();
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text(type == 'expense' ? 'Registrar despesa' : type == 'withdrawal' ? 'Registrar retirada' : 'Registrar reforco'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: amount, decoration: const InputDecoration(labelText: 'Valor em centavos'), keyboardType: TextInputType.number),
        TextField(controller: description, decoration: const InputDecoration(labelText: 'Descricao')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Registrar'))],
    ));
    final payload = {'movement_type': type, 'amount_cents': int.tryParse(amount.text), 'description': description.text.trim()};
    amount.dispose(); description.dispose();
    if (save != true) return;
    await request('POST', '/api/finance/cash/movement', payload);
    await refresh();
  }

  Future<void> closeCash() async {
    final closing = TextEditingController();
    final notes = TextEditingController();
    final save = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Fechar caixa'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: closing, decoration: const InputDecoration(labelText: 'Saldo contado em centavos'), keyboardType: TextInputType.number),
        TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observacao')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Fechar'))],
    ));
    final payload = {'closing_balance_cents': int.tryParse(closing.text), 'notes': notes.text.trim()};
    closing.dispose(); notes.dispose();
    if (save != true) return;
    final result = await request('POST', '/api/finance/cash/close', payload);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Diferenca de caixa: ${money(result['difference_cents'])}')));
    await refresh();
  }

  Future<void> updateLead(Map<String, dynamic> lead, String status) async {
    await request('POST', '/api/sales/leads/update', {'lead_id': lead['id'], 'status': status});
    await refresh();
  }

  Widget financeTab() {
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          metric('Recebido hoje', overview['received_today_cents'], Icons.today, currency: true),
          metric('Recebido no mes', overview['received_month_cents'], Icons.calendar_month, currency: true),
          metric('A receber', overview['receivable_cents'], Icons.account_balance_wallet, currency: true),
          metric('Parcelas vencidas', overview['overdue_count'], Icons.warning),
          metric('Acordos ativos', overview['active_agreements'], Icons.handshake),
        ]),
        const SizedBox(height: 12),
        const Text('Contas a receber', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        if (receivables.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Nenhuma pendencia.'))),
        ...receivables.map((raw) {
          final item = raw as Map<String, dynamic>;
          return Card(child: ListTile(
            leading: Icon((item['overdue_days'] ?? 0) > 0 ? Icons.warning_amber : Icons.schedule),
            title: Text('${item['member_name']} - ${money(item['amount_cents'])}'),
            subtitle: Text('Vencimento: ${dateOnly(item['due_date'])} | Atraso: ${item['overdue_days']} dia(s)'),
            trailing: PopupMenuButton<String>(
              onSelected: (value) => value == 'settle' ? settle(item) : agreement(item),
              itemBuilder: (_) => const [PopupMenuItem(value: 'settle', child: Text('Receber')), PopupMenuItem(value: 'agreement', child: Text('Renegociar'))],
            ),
          ));
        }),
      ]),
    );
  }

  Widget cashTab() {
    final open = cashSessions.where((raw) => (raw as Map<String, dynamic>)['status'] == 'open').cast<Map<String, dynamic>>().toList();
    return ListView(padding: const EdgeInsets.all(12), children: [
      if (open.isEmpty)
        FilledButton.icon(onPressed: openCash, icon: const Icon(Icons.lock_open), label: const Text('Abrir caixa'))
      else ...[
        Card(child: ListTile(title: const Text('Caixa aberto'), subtitle: Text('Saldo inicial: ${money(open.first['opening_balance_cents'])}\nMovimentos: ${money(open.first['movements_cents'])}'), isThreeLine: true)),
        Wrap(spacing: 8, runSpacing: 8, children: [
          OutlinedButton.icon(onPressed: () => addMovement('expense'), icon: const Icon(Icons.remove), label: const Text('Despesa')),
          OutlinedButton.icon(onPressed: () => addMovement('withdrawal'), icon: const Icon(Icons.output), label: const Text('Retirada')),
          OutlinedButton.icon(onPressed: () => addMovement('deposit'), icon: const Icon(Icons.add), label: const Text('Reforco')),
          FilledButton.icon(onPressed: closeCash, icon: const Icon(Icons.lock), label: const Text('Fechar caixa')),
        ]),
      ],
      const SizedBox(height: 14),
      const Text('Historico de caixas', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      ...cashSessions.map((raw) {
        final item = raw as Map<String, dynamic>;
        return Card(child: ListTile(title: Text('Caixa ${item['status']}'), subtitle: Text('Abertura: ${item['opened_at']}\nFechamento: ${item['closed_at'] ?? '-'} | Esperado: ${money(item['expected_balance_cents'])}')));
      }),
    ]);
  }

  Widget leadsTab() {
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        Text('${overview['new_leads'] ?? 0} novo(s) interesse(s)', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        ...leads.map((raw) {
          final item = raw as Map<String, dynamic>;
          return Card(child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person_search)),
            title: Text('${item['name']} - ${item['plan_name'] ?? 'Sem plano'}'),
            subtitle: Text('${item['phone'] ?? item['email'] ?? '-'}\nObjetivo: ${item['objective'] ?? '-'} | Status: ${item['status']}'),
            isThreeLine: true,
            trailing: PopupMenuButton<String>(
              onSelected: (status) => updateLead(item, status),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'contacted', child: Text('Marcar contato')),
                PopupMenuItem(value: 'converted', child: Text('Marcar convertido')),
                PopupMenuItem(value: 'lost', child: Text('Marcar perdido')),
              ],
            ),
          ));
        }),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Financeiro e vendas'),
          actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))],
          bottom: const TabBar(tabs: [Tab(icon: Icon(Icons.payments), text: 'Financeiro'), Tab(icon: Icon(Icons.point_of_sale), text: 'Caixa'), Tab(icon: Icon(Icons.person_search), text: 'Leads')]),
        ),
        body: Stack(children: [
          TabBarView(children: [financeTab(), cashTab(), leadsTab()]),
          if (loading) const LinearProgressIndicator(),
          Positioned(left: 8, right: 8, bottom: 4, child: Text(message, textAlign: TextAlign.center)),
        ]),
      ),
    );
  }
}
