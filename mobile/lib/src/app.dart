import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'auth/auth_controller.dart';
import 'config/app_config.dart';
import 'location/location_service.dart';
import 'map/basemap_repository.dart';
import 'map/map_screen.dart';
import 'ui/theme.dart';

class JigMapApp extends StatefulWidget {
  const JigMapApp({super.key, required this.config});
  final AppConfig config;

  @override
  State<JigMapApp> createState() => _JigMapAppState();
}

class _JigMapAppState extends State<JigMapApp> {
  late final ApiClient _api = ApiClient(widget.config);
  late final AuthController _auth = AuthController(_api)..restore();
  late final LocationService _location = LocationService();
  late final BasemapRepository _basemaps = BasemapRepository(_api);

  @override
  void dispose() {
    _auth.dispose();
    _location.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'JigMap Maldives',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: MapScreen(basemaps: _basemaps, auth: _auth, location: _location),
    );
  }
}
