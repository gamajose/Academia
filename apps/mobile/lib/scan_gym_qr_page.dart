import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';

class ScanGymQrPage extends StatefulWidget {
  const ScanGymQrPage({super.key, required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  @override
  State<ScanGymQrPage> createState() => _ScanGymQrPageState();
}

class _ScanGymQrPageState extends State<ScanGymQrPage> {
  final MobileScannerController controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool processing = false;
  Map<String, dynamic>? result;
  String message = 'Aponte a camera para o QR Code exibido pela academia.';

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  Future<void> redeem(String payload) async {
    if (processing) return;
    setState(() {
      processing = true;
      message = 'Validando sua entrada...';
    });
    await controller.stop();

    try {
      final response = await http.post(
        Uri.parse('${widget.baseUrl}/api/student/access/redeem-challenge'),
        headers: headers,
        body: jsonEncode({'qr_payload': payload}),
      );
      final data = jsonDecode(response.body.isEmpty ? '{}' : response.body) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        result = data;
        message = data['message']?.toString() ??
            ((data['allowed'] == true) ? 'Entrada liberada. Bom treino!' : 'Acesso nao liberado.');
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        result = {'allowed': false};
        message = 'Nao foi possivel validar o QR Code: $error';
      });
    } finally {
      if (mounted) setState(() => processing = false);
    }
  }

  void onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) return;
    redeem(value);
  }

  Future<void> scanAgain() async {
    setState(() {
      result = null;
      processing = false;
      message = 'Aponte a camera para o QR Code exibido pela academia.';
    });
    await controller.start();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final allowed = result?['allowed'] == true;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ler QR da academia'),
        actions: [
          IconButton(
            onPressed: () => controller.toggleTorch(),
            icon: const Icon(Icons.flashlight_on),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: result == null
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(controller: controller, onDetect: onDetect),
                      Center(
                        child: Container(
                          width: 250,
                          height: 250,
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.white, width: 4),
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                      ),
                      if (processing) const ColoredBox(color: Colors.black54, child: Center(child: CircularProgressIndicator())),
                    ],
                  )
                : Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(allowed ? Icons.check_circle : Icons.cancel, size: 100, color: allowed ? Colors.green : Colors.red),
                              const SizedBox(height: 16),
                              Text(allowed ? 'Entrada liberada' : 'Acesso bloqueado', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 10),
                              Text(message, textAlign: TextAlign.center),
                              const SizedBox(height: 18),
                              FilledButton.icon(onPressed: scanAgain, icon: const Icon(Icons.qr_code_scanner), label: const Text('Ler outro QR Code')),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
