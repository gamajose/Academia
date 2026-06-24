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
      title: 'Academia Lobo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xffb91c1c)),
        useMaterial3: true,
        cardTheme: const CardThemeData(margin: EdgeInsets.symmetric(vertical: 8), elevation: 1),
      ),
      home: const StudentLoginPage(initialBaseUrl: 'http://10.0.2.2:3004'),
    );
  }
}
