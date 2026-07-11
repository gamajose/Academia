import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class StudentToolsPage extends StatefulWidget {
  const StudentToolsPage({
    super.key,
    required this.baseUrl,
    required this.token,
    this.initialTab = 0,
  });

  final String baseUrl;
  final String token;
  final int initialTab;

  @override
  State<StudentToolsPage> createState() => _StudentToolsPageState();
}

class _StudentToolsPageState extends State<StudentToolsPage> with SingleTickerProviderStateMixin {
  late final TabController tabs;
  Map<String, dynamic> overview = {};
  List<dynamic> payments = [];
  List<dynamic> checkins = [];
  List<dynamic> notifications = [];
  bool loading = true;
  String message = 'Carregando...';

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  @override
  void initState() {
    super.initState();
    final initial = widget.initialTab < 0 ? 0 : widget.initialTab > 3 ? 3 : widget.initialTab;
    tabs = TabController(length: 4, vsync: this, initialIndex: initial);
    refresh();
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> request(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('${widget.baseUrl}$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(body ?? {}))
        : await http.get(uri, headers: headers);
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) throw Exception(data['error'] ?? 'erro_requisicao');
    return data;
  }

  Future<void> refresh() async {
    if (mounted) setState(() => loading = true);
    try {
      final result = await Future.wait([
        request('GET', '/api/student/account/overview'),
        request('GET', '/api/student/payments?limit=100'),
        request('GET', '/api/student/checkins?limit=100'),
        request('GET', '/api/student/notifications'),
      ]);
      if (!mounted) return;
      setState(() {
        overview = result[0];
        payments = result[1]['data'] as List<dynamic>? ?? [];
        checkins = result[2]['data'] as List<dynamic>? ?? [];
        notifications = result[3]['data'] as List<dynamic>? ?? [];
        message = 'Atualizado.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro ao carregar: $error');
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

  String dateTimeText(dynamic value) {
    final date = value == null ? null : DateTime.tryParse(value.toString())?.toLocal();
    if (date == null) return value?.toString() ?? '-';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year} ${two(date.hour)}:${two(date.minute)}';
  }

  Widget infoCard(String title, List<Widget> children, {IconData? icon}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [if (icon != null) Icon(icon), if (icon != null) const SizedBox(width: 8), Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))]),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget planView() {
    final membership = overview['membership'] as Map<String, dynamic>?;
    final plan = membership?['plan'] as Map<String, dynamic>?;
    final financial = overview['financial'] as Map<String, dynamic>? ?? {};
    final pending = financial['pending_payment'] as Map<String, dynamic>?;
    final frequency = overview['frequency'] as Map<String, dynamic>? ?? {};
    final status = financial['status']?.toString() ?? 'current';
    final statusColor = status == 'current' ? Colors.green : status == 'blocked' ? Colors.red : Colors.orange;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        infoCard('Meu plano', [
          Text(plan?['name']?.toString() ?? 'Nenhum plano ativo', style: const TextStyle(fontSize: 18)),
          Text('Inicio: ${dateOnly(membership?['starts_at'])}'),
          Text('Termino: ${dateOnly(membership?['ends_at'])}'),
          Text('Duracao: ${plan?['duration_days'] ?? '-'} dias'),
          Text('Valor de referencia: ${money(plan?['price_cents'])}'),
        ], icon: Icons.card_membership),
        infoCard('Situacao financeira', [
          Text(status == 'current' ? 'Em dia' : status == 'blocked' ? 'Acesso bloqueado' : 'Pendente / em carencia', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: statusColor)),
          if (pending == null) const Text('Nenhuma mensalidade pendente.') else ...[
            Text('Valor: ${money(pending['amount_cents'])}'),
            Text('Vencimento: ${dateOnly(pending['due_date'])}'),
            Text('Dias de atraso: ${pending['overdue_days'] ?? 0}'),
            if (pending['block_on'] != null) Text('Data do bloqueio: ${dateOnly(pending['block_on'])}'),
          ],
        ], icon: Icons.account_balance_wallet),
        infoCard('Minha frequencia', [
          Text('Entradas nesta semana: ${frequency['week_checkins'] ?? 0}'),
          Text('Entradas neste mes: ${frequency['month_checkins'] ?? 0}'),
          Text('Ultima entrada: ${dateTimeText(frequency['last_checkin_at'])}'),
        ], icon: Icons.insights),
      ],
    );
  }

  Widget paymentsView() {
    return payments.isEmpty
        ? const Center(child: Text('Nenhum pagamento registrado.'))
        : RefreshIndicator(
            onRefresh: refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: payments.length,
              itemBuilder: (_, index) {
                final item = payments[index] as Map<String, dynamic>;
                final status = item['status']?.toString() ?? '-';
                final overdue = num.tryParse('${item['overdue_days']}') ?? 0;
                return Card(
                  child: ListTile(
                    leading: Icon(status == 'paid' ? Icons.check_circle : overdue > 0 ? Icons.warning_amber : Icons.schedule, color: status == 'paid' ? Colors.green : overdue > 0 ? Colors.red : Colors.orange),
                    title: Text('${money(item['amount_cents'])} - ${status.toUpperCase()}'),
                    subtitle: Text('Vencimento: ${dateOnly(item['due_date'])}${item['paid_at'] == null ? '' : '\nPago em: ${dateTimeText(item['paid_at'])}'}${item['method'] == null ? '' : '\nForma: ${item['method']}'}${overdue <= 0 ? '' : '\nAtraso: $overdue dia(s)'}'),
                    isThreeLine: true,
                  ),
                );
              },
            ),
          );
  }

  Widget checkinsView() {
    return checkins.isEmpty
        ? const Center(child: Text('Nenhuma entrada registrada.'))
        : RefreshIndicator(
            onRefresh: refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: checkins.length,
              itemBuilder: (_, index) {
                final item = checkins[index] as Map<String, dynamic>;
                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.door_front_door)),
                    title: Text(dateTimeText(item['checked_at'])),
                    subtitle: Text('${item['device_name'] ?? 'Entrada manual'}\nOrigem: ${item['source'] ?? '-'}${item['access_status'] == null ? '' : '\nSituacao: ${item['access_status']}'}'),
                    isThreeLine: true,
                  ),
                );
              },
            ),
          );
  }

  Future<void> markAllRead() async {
    await request('POST', '/api/student/notifications/read', {'all': true});
    await refresh();
  }

  IconData notificationIcon(String type) {
    if (type.contains('payment')) return Icons.payments;
    if (type == 'access_blocked') return Icons.block;
    if (type == 'training') return Icons.fitness_center;
    if (type == 'membership') return Icons.card_membership;
    return Icons.notifications;
  }

  Widget notificationsView() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(children: [Expanded(child: Text('${notifications.length} notificacao(oes)', style: const TextStyle(fontWeight: FontWeight.bold))), TextButton.icon(onPressed: markAllRead, icon: const Icon(Icons.done_all), label: const Text('Marcar lidas'))]),
        ),
        Expanded(
          child: notifications.isEmpty
              ? const Center(child: Text('Nenhuma notificacao.'))
              : RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: notifications.length,
                    itemBuilder: (_, index) {
                      final item = notifications[index] as Map<String, dynamic>;
                      final unread = item['read_at'] == null;
                      return Card(
                        child: ListTile(
                          leading: Icon(notificationIcon(item['type']?.toString() ?? 'info')),
                          title: Text(item['title']?.toString() ?? 'Notificacao', style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.normal)),
                          subtitle: Text('${item['message'] ?? ''}${item['created_at'] == null ? '' : '\n${dateTimeText(item['created_at'])}'}'),
                          isThreeLine: item['created_at'] != null,
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Minha conta'),
        actions: [IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh))],
        bottom: TabBar(
          controller: tabs,
          isScrollable: true,
          tabs: const [
            Tab(icon: Icon(Icons.card_membership), text: 'Plano'),
            Tab(icon: Icon(Icons.payments), text: 'Pagamentos'),
            Tab(icon: Icon(Icons.history), text: 'Entradas'),
            Tab(icon: Icon(Icons.notifications), text: 'Notificacoes'),
          ],
        ),
      ),
      body: Stack(
        children: [
          TabBarView(controller: tabs, children: [planView(), paymentsView(), checkinsView(), notificationsView()]),
          if (loading) const LinearProgressIndicator(),
          Positioned(left: 12, right: 12, bottom: 4, child: Text(message, textAlign: TextAlign.center)),
        ],
      ),
    );
  }
}
