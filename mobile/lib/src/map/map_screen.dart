import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../api/api_client.dart';
import '../auth/account_sheet.dart';
import '../auth/auth_controller.dart';
import '../location/gps_fix.dart';
import '../location/location_service.dart';
import '../ui/gps_panel.dart';
import '../ui/theme.dart';
import '../util/geo.dart';
import 'basemap_repository.dart';

const _emptyCollection = {'type': 'FeatureCollection', 'features': <dynamic>[]};

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.basemaps, required this.auth, required this.location});

  final BasemapRepository basemaps;
  final AuthController auth;
  final LocationService location;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  LoadedBasemap? _basemap;
  Object? _loadError;
  bool _loading = true;

  MapLibreMapController? _map;
  bool _styleReady = false;
  bool _follow = false;
  bool _centeredOnFirstFix = false;
  double _bearing = 0;

  @override
  void initState() {
    super.initState();
    widget.location.addListener(_onLocation);
    widget.auth.addListener(_onAuthChanged);
    widget.location.start();
    _loadBasemap();
  }

  @override
  void dispose() {
    widget.location.removeListener(_onLocation);
    widget.auth.removeListener(_onAuthChanged);
    _map?.removeListener(_onCamera);
    super.dispose();
  }

  bool? _lastSignedIn;
  void _onAuthChanged() {
    final signedIn = widget.auth.isSignedIn;
    if (_lastSignedIn != signedIn && !widget.auth.restoring) {
      _lastSignedIn = signedIn;
      // A keyed provider needs a fresh, user-scoped style after sign-in/out.
      if (_loadError is SignInRequired || (_basemap?.info.requiresSignIn ?? false)) _loadBasemap();
    }
    setState(() {});
  }

  Future<void> _loadBasemap() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final b = await widget.basemaps.load(signedIn: widget.auth.isSignedIn);
      setState(() {
        _basemap = b;
        _styleReady = false;
        _centeredOnFirstFix = false;
      });
    } catch (e) {
      setState(() => _loadError = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onMapCreated(MapLibreMapController c) {
    _map = c;
    c.addListener(_onCamera);
  }

  void _onCamera() {
    final b = _map?.cameraPosition?.bearing ?? 0;
    if ((b - _bearing).abs() > 0.5) setState(() => _bearing = b);
  }

  Future<void> _onStyleLoaded() async {
    final c = _map;
    if (c == null) return;
    await c.addGeoJsonSource('gps-accuracy', _emptyCollection);
    await c.addGeoJsonSource('gps-position', _emptyCollection);
    await c.addFillLayer(
      'gps-accuracy',
      'gps-accuracy-fill',
      const FillLayerProperties(fillColor: '#4FC3F7', fillOpacity: 0.18, fillOutlineColor: '#4FC3F7'),
    );
    await c.addCircleLayer(
      'gps-position',
      'gps-position-halo',
      const CircleLayerProperties(circleRadius: 14, circleColor: '#4FC3F7', circleOpacity: 0.25),
    );
    await c.addCircleLayer(
      'gps-position',
      'gps-position-dot',
      const CircleLayerProperties(
        circleRadius: 7,
        circleColor: '#1E88E5',
        circleStrokeWidth: 3,
        circleStrokeColor: '#FFFFFF',
      ),
    );
    _styleReady = true;
    await _drawPosition();
    _maybeCenter(); // a fix may have arrived before the map was ready
  }

  void _onLocation() {
    _drawPosition();
    _maybeCenter();
  }

  /// Centre once on the first fix, then continuously only in follow mode.
  void _maybeCenter() {
    final fix = widget.location.lastFix;
    if (fix == null || _map == null || !_styleReady) return;
    if (_follow) {
      _centerOn(fix);
    } else if (!_centeredOnFirstFix) {
      _centeredOnFirstFix = true;
      _centerOn(fix, zoom: 12);
    }
  }

  Future<void> _drawPosition() async {
    final c = _map;
    final fix = widget.location.lastFix;
    if (c == null || !_styleReady || fix == null) return;
    final stale = qualityFor(fix, now: DateTime.now().toUtc()) == GpsQuality.none;
    await c.setGeoJsonSource('gps-position', {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'properties': {'stale': stale},
          'geometry': {
            'type': 'Point',
            'coordinates': [fix.longitude, fix.latitude],
          },
        },
      ],
    });
    final acc = fix.accuracyMetres;
    await c.setGeoJsonSource('gps-accuracy', {
      'type': 'FeatureCollection',
      'features': [
        if (acc != null && acc > 0)
          {
            'type': 'Feature',
            'properties': <String, dynamic>{},
            'geometry': circlePolygon(fix.latitude, fix.longitude, acc),
          },
      ],
    });
  }

  Future<void> _centerOn(GpsFix fix, {double? zoom}) async {
    final c = _map;
    if (c == null) return;
    final target = LatLng(fix.latitude, fix.longitude);
    await c.animateCamera(
      zoom == null ? CameraUpdate.newLatLng(target) : CameraUpdate.newLatLngZoom(target, zoom),
      duration: const Duration(milliseconds: 600),
    );
  }

  void _toggleFollow() {
    final fix = widget.location.lastFix;
    if (fix == null) {
      widget.location.start();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No GPS fix yet')));
      return;
    }
    setState(() => _follow = !_follow);
    if (_follow) _centerOn(fix, zoom: math.max(_map?.cameraPosition?.zoom ?? 12, 12));
  }

  void _openAccount() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: JigColors.panel,
      builder: (_) => AccountSheet(auth: widget.auth),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: _mapOrState()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  _topBar(),
                  const Spacer(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(child: GpsPanel(location: widget.location)),
                      const SizedBox(width: 12),
                      _mapButtons(),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mapOrState() {
    final b = _basemap;
    if (b != null) {
      return MapLibreMap(
        key: ValueKey(b.styleJson.hashCode),
        styleString: b.styleJson,
        initialCameraPosition: CameraPosition(
          target: LatLng(b.info.defaultLat, b.info.defaultLon),
          zoom: b.info.defaultZoom,
        ),
        onMapCreated: _onMapCreated,
        onStyleLoadedCallback: _onStyleLoaded,
        trackCameraPosition: true,
        rotateGesturesEnabled: true,
        compassEnabled: false, // replaced by the north-up button, consistent across platforms
        // Top-left, below the top bar (web: offset via CSS in web/index.html,
        // since the web plugin ignores margins).
        attributionButtonPosition: AttributionButtonPosition.topLeft,
        attributionButtonMargins: const math.Point(12, 80),
      );
    }
    if (_loading) return const Center(child: CircularProgressIndicator());
    final err = _loadError;
    final (String title, String detail, bool needsSignIn) = switch (err) {
      SignInRequired(:final info) => (
        'Sign in to load ${info.name}',
        'This imagery provider is licensed per user.',
        true,
      ),
      ApiException(:final message, :final isNetworkError) => (
        isNetworkError ? 'Map server unreachable' : 'Map unavailable',
        message,
        false,
      ),
      _ => ('Map unavailable', '$err', false),
    };
    return Center(
      key: const Key('map-error'),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.satellite_alt, size: 48, color: JigColors.muted),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(
              detail,
              style: const TextStyle(color: JigColors.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            needsSignIn
                ? FilledButton(onPressed: _openAccount, child: const Text('Sign in'))
                : FilledButton.tonal(onPressed: _loadBasemap, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    final info = _basemap?.info;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Spacer(),
        if (info != null && info.isDevelopmentOnly)
          Tooltip(
            message: info.licenceNote,
            child: Container(
              key: const Key('dev-licence-badge'),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: JigColors.fair.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'DEV IMAGERY LICENCE',
                style: TextStyle(color: Colors.black, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        const SizedBox(width: 8),
        _roundButton(
          key: 'account-button',
          icon: widget.auth.isSignedIn ? Icons.account_circle : Icons.login,
          tooltip: widget.auth.isSignedIn ? 'Account' : 'Sign in',
          onPressed: _openAccount,
        ),
      ],
    );
  }

  Widget _mapButtons() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      _roundButton(
        key: 'north-up',
        tooltip: 'North up',
        onPressed: () => _map?.animateCamera(CameraUpdate.bearingTo(0)),
        child: Transform.rotate(
          angle: -_bearing * math.pi / 180,
          child: const Icon(Icons.navigation, color: Colors.redAccent),
        ),
      ),
      const SizedBox(height: 10),
      _roundButton(
        key: 'follow-gps',
        icon: _follow ? Icons.my_location : Icons.location_searching,
        tooltip: _follow ? 'Stop following GPS' : 'Follow GPS position',
        active: _follow,
        onPressed: _toggleFollow,
      ),
    ],
  );

  Widget _roundButton({
    required String key,
    required String tooltip,
    required VoidCallback onPressed,
    IconData? icon,
    Widget? child,
    bool active = false,
  }) => Tooltip(
    message: tooltip,
    child: Material(
      color: active ? JigColors.ocean : JigColors.panel.withValues(alpha: 0.94),
      shape: const CircleBorder(side: BorderSide(color: JigColors.panelBorder)),
      child: InkWell(
        key: Key(key),
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Center(child: child ?? Icon(icon, color: JigColors.text)),
        ),
      ),
    ),
  );
}
