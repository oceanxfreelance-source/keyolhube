import 'package:flutter/material.dart';
import 'package:hive_ce_flutter/hive_ce_flutter.dart';

import 'src/app.dart';
import 'src/config/app_config.dart';
import 'src/offline/offline_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter('jigmap');
  final store = await OfflineStore.open();
  runApp(JigMapApp(config: AppConfig.fromEnvironment(), offlineStore: store));
}
