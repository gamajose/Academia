import 'package:academia_mobile/student_portal_page.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(const AcademiaStudentApp());
}

class AcademiaStudentApp extends StatelessWidget {
  const AcademiaStudentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Academia Aluno',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.green), useMaterial3: true),
      home: const StudentLoginPage(initialBaseUrl: 'http://10.0.2.2:3004'),
    );
  }
}
