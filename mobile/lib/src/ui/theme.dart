import 'package:flutter/material.dart';

/// Dark navy marine palette. A dedicated low-glare night palette follows in Captain Mode.
class JigColors {
  static const navy = Color(0xFF06121F);
  static const panel = Color(0xFF0C2236);
  static const panelBorder = Color(0xFF1B3A57);
  static const ocean = Color(0xFF1E88E5);
  static const cyan = Color(0xFF4FC3F7);
  static const text = Color(0xFFE6F1FA);
  static const muted = Color(0xFF8FA9C0);
  static const good = Color(0xFF4CAF50);
  static const fair = Color(0xFFFFC107);
  static const poor = Color(0xFFFF7043);
  static const none = Color(0xFFE53935);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: JigColors.ocean,
    brightness: Brightness.dark,
    surface: JigColors.panel,
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: JigColors.navy,
    useMaterial3: true,
    fontFamily: 'Roboto',
    textTheme: const TextTheme().apply(bodyColor: JigColors.text, displayColor: JigColors.text),
  );
}
