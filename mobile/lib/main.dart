import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/config/app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(JigMapApp(config: AppConfig.fromEnvironment()));
}
