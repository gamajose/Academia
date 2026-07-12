import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class AccessControlPage extends StatefulWidget {
  const AccessControlPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<AccessControlPage> createState() => _AccessControlPageState();
}

class _AccessControlPageState extends State<AccessControlPage> {
  Map<String, dynamic> stats = {};
  List<dynamic> devices = [];
  List<dynamic> decisions = [];
  bool loading = true;
  String message = 'Carregando controle de acesso...';

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
      final data = await request('GET', '/api/access/overview');
      if (!mounted) return;
      setState(() {
        stats = data['stats'] as Map<String, dynamic>? ?? {};
        devices = data['devices'] as List<dynamic>? ?? [];
        decisions = data['decisions'] as List<dynamic>? ?? [];
        message = 'Atualizado.';
      });
    } catch (error) {
      if (mounted) setState(() => message = 'Erro ao carregar: $error');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String dateTimeText(dynamic value) {
    final date = value == null ? null : DateTime.tryParse(value.toString())?.toLocal();
    if (date == null) return value?.toString() ?? '-';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year} ${two(date.hour)}:${two(date.minute)}';
  }

  void showError(Object error) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $error')));
  }

  Widget statCard(String title, dynamic value, IconData icon) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text('${value ?? 0}', style: const TextStyle(fontSize: 26)),
          ]),
        ),
      ),
    );
  }

  Future<void> toggleDevice(Map<String, dynamic> device) async {
    try {
      await request('POST', '/api/access/devices/toggle', {
        'device_id': device['id'],
        'is_active': device['is_active'] != true,
      });
      await refresh();
    } catch (error) {
      showError(error);
    }
  }

  Future<void> sendCommand(Map<String, dynamic> device, String command) async {
    try {
      final result = await request('POST', '/api/access/devices/command', {
        'device_id': device['id'],
        'command': command,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Comando ${result['command']} enviado por 30 segundos.')));
      await refresh();
    } catch (error) {
      showError(error);
    }
  }

  Future<void> rotateKey(Map<String, dynamic> device) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Trocar chave da catraca?'),
        content: Text('A chave atual de ${device['name']} deixara de funcionar imediatamente.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Trocar chave')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final result = await request('POST', '/api/access/devices/rotate-key', {'device_id': device['id']});
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => AlertDialog(
          title: const Text('Nova chave gerada'),
          content: SelectableText('${result['api_key']}\n\nGuarde agora. Ela nao sera exibida novamente.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Chave salva'))],
        ),
      );
      await refresh();
    } catch (error) {
      showError(error);
    }
  }

  Future<void> sendNotification() async {
    final title = TextEditingController();
    final body = TextEditingController();
    String type = 'info';
    final shouldSend = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Enviar notificacao'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'Titulo')),
              TextField(controller: body, decoration: const InputDecoration(labelText: 'Mensagem'), maxLines: 4),
              DropdownButtonFormField<String>(
                initialValue: type,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: const [
                  DropdownMenuItem(value: 'info', child: Text('Informacao')),
                  DropdownMenuItem(value: 'payment_due', child: Text('Financeiro')),
                  DropdownMenuItem(value: 'training', child: Text('Treino')),
                  DropdownMenuItem(value: 'membership', child: Text('Plano')),
                ],
                onChanged: (value) => setDialogState(() => type = value ?? 'info'),
              ),
              const SizedBox(height: 8),
              const Text('A mensagem sera enviada para todos os alunos ativos.'),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Enviar')),
          ],
        ),
      ),
    );

    final titleText = title.text.trim();
    final bodyText = body.text.trim();
    title.dispose();
    body.dispose();
    if (shouldSend != true || titleText.isEmpty || bodyText.isEmpty) return;

    try {
      final result = await request('POST', '/api/notifications', {
        'title': titleText,
        'message': bodyText,
        'type': type,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${result['created'] ?? 0} notificacao(oes) criada(s).')));
    } catch (error) {
      showError(error);
    }
  }

  Widget deviceCard(dynamic raw) {
    final device = raw as Map<String, dynamic>;
    final online = device['online'] == true;
    final active = device['is_active'] == true;
    final status = online ? 'Online' : active ? 'Sem comunicacao' : 'Desativada';
    final statusColor = online ? Colors.green : active ? Colors.orange : Colors.grey;

    return Card(
      child: ExpansionTile(
        leading: CircleAvatar(backgroundColor: statusColor, child: Icon(online ? Icons.wifi : Icons.wifi_off, color: Colors.white)),
        title: Text(device['name']?.toString() ?? 'Catraca'),
        subtitle: Text('$status | ultima comunicacao ${dateTimeText(device['last_seen_at'])}'),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          Align(alignment: Alignment.centerLeft, child: Text('Codigo: ${device['code'] ?? '-'}')),
          Align(alignment: Alignment.centerLeft, child: Text('Ultimo acesso: ${device['last_member_name'] ?? '-'}')),
          Align(alignment: Alignment.centerLeft, child: Text('Comandos pendentes: ${device['pending_commands'] ?? 0}')),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton.icon(onPressed: active ? () => sendCommand(device, 'test') : null, icon: const Icon(Icons.network_check), label: const Text('Testar')),
            FilledButton.icon(onPressed: active ? () => sendCommand(device, 'unlock') : null, icon: const Icon(Icons.lock_open), label: const Text('Abrir')),
            OutlinedButton.icon(onPressed: () => toggleDevice(device), icon: Icon(active ? Icons.pause_circle : Icons.play_circle), label: Text(active ? 'Desativar' : 'Ativar')),
            OutlinedButton.icon(onPressed: () => rotateKey(device), icon: const Icon(Icons.key), label: const Text('Trocar chave')),
          ]),
        ],
      ),
    );
  }

  Widget decisionTile(dynamic raw) {
    final item = raw as Map<String, dynamic>;
    final allowed = item['allowed'] == true;
    return Card(
      child: ListTile(
        leading: Icon(allowed ? Icons.check_circle : Icons.cancel, color: allowed ? Colors.green : Colors.red),
        title: Text('${item['member_name'] ?? 'Aluno'} - ${allowed ? 'Liberado' : 'Bloqueado'}'),
        subtitle: Text('${dateTimeText(item['decided_at'])} | ${item['device_name'] ?? 'Sem leitor'}\n${item['message'] ?? item['reason'] ?? ''}'),
        isThreeLine: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Controle de acesso'),
        actions: [
          IconButton(onPressed: sendNotification, icon: const Icon(Icons.campaign)),
          IconButton(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              statCard('Tentativas hoje', stats['attempts_today'], Icons.qr_code_scanner),
              statCard('Liberados', stats['allowed_today'], Icons.check_circle),
              statCard('Bloqueados', stats['denied_today'], Icons.block),
              statCard('Em carencia', stats['grace_today'], Icons.warning_amber),
            ]),
            const SizedBox(height: 12),
            const Text('Catracas e leitores', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            if (devices.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Nenhum leitor cadastrado.'))),
            ...devices.map(deviceCard),
            const SizedBox(height: 16),
            const Text('Acessos recentes', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            if (decisions.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Nenhuma tentativa registrada.'))),
            ...decisions.take(50).map(decisionTile),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (loading) const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}
