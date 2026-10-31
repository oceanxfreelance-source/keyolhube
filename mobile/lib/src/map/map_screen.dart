import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../api/api_client.dart';
import '../auth/account_sheet.dart';
import '../auth/auth_controller.dart';
import '../bathymetry/bathymetry_api.dart';
import '../bathymetry/depth_info.dart';
import '../location/gps_fix.dart';
import '../location/location_service.dart';
import '../offline/offline_repository.dart';
import '../offline/offline_screen.dart';
import '../offline/offline_style.dart';
import '../ui/gps_panel.dart';
import '../ui/theme.dart';
import '../util/geo.dart';
import 'basemap_repository.dart';
import 'contour_labels.dart';
import 'depth_sheet.dart';
import 'layers_sheet.dart';
import 'measurement.dart';
import 'overlay_layer.dart';

const _emptyCollection = {'type': 'FeatureCollection', 'features': <dynamic>[]};

// Maldives defaults, used when the map is built offline (no server config).
const _defaultLat = 4.1755, _defaultLon = 73.5093, _defaultZoom = 6.0;

/// What the map is currently showing.
class _MapSource {
  _MapSource.online(LoadedBasemap b)
    : styleJson = b.styleJson,
      info = b.info,
      layers = b.info.layers,
      offline = false;

  _MapSource.offline(this.styleJson, this.layers) : info = null, offline = true;

  final String styleJson;
  final BasemapInfo? info;
  final List<OverlayLayer> layers;
  final bool offline;
}

class MapScreen extends StatefulWidget {
  const MapScreen({
    super.key,
    required this.basemaps,
    required this.auth,
    required this.location,
    required this.bathymetry,
    required this.offline,
  });

  final BasemapRepository basemaps;
  final AuthController auth;
  final LocationService location;
  final BathymetryApi bathymetry;
  final OfflineRepository offline;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  _MapSource? _source;
  Object? _loadError;
  bool _loading = true;

  MapLibreMapController? _map;
  bool _styleReady = false;
  bool _follow = false;
  bool _centeredOnFirstFix = false;
  double _bearing = 0;

  Measurement? _measure; // non-null while measuring
  bool _busyTap = false;

  @override
  void initState() {
    super.initState();
    widget.location.addListener(_onLocation);
    widget.auth.addListener(_onAuthChanged);
    widget.location.start();
    widget.offline.loadAll();
    _loadMap();
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
      if (_loadError is SignInRequired || (_source?.info?.requiresSignIn ?? false)) _loadMap();
    }
    setState(() {});
  }

  // --- Loading ------------------------------------------------------------------------

  Future<void> _loadMap() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final b = await widget.basemaps.load(signedIn: widget.auth.isSignedIn);
      _setSource(_MapSource.online(b));
    } catch (e) {
      _loadError = e;
      // Server unreachable: fall back to downloaded packages when we have them.
      if (e is ApiException && e.isNetworkError) await _useOfflineData();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool> _useOfflineData() async {
    await widget.offline.loadAll();
    final pkgs = widget.offline.loaded;
    if (pkgs.isEmpty) return false;
    final built = buildOfflineStyle(pkgs);
    _setSource(_MapSource.offline(built.styleJson, built.layers));
    return true;
  }

  void _setSource(_MapSource s) {
    if (!mounted) return;
    setState(() {
      _source = s;
      _styleReady = false;
      _centeredOnFirstFix = false;
    });
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
    final source = _source;
    if (c == null || source == null) return;
    await _addContourLabels(c, source);
    await c.addGeoJsonSource('measure', _emptyCollection);
    await c.addLineLayer(
      'measure',
      'measure-line',
      const LineLayerProperties(lineColor: '#FFEB3B', lineWidth: 3, lineDasharray: [2, 1]),
      enableInteraction: false,
    );
    await c.addCircleLayer(
      'measure',
      'measure-points',
      const CircleLayerProperties(
        circleRadius: 5,
        circleColor: '#FFEB3B',
        circleStrokeColor: '#06121F',
        circleStrokeWidth: 2,
      ),
      enableInteraction: false,
    );
    await c.addGeoJsonSource('tap-marker', _emptyCollection);
    await c.addCircleLayer(
      'tap-marker',
      'tap-marker',
      const CircleLayerProperties(
        circleRadius: 9,
        circleColor: 'rgba(0,0,0,0)',
        circleStrokeColor: '#FFFFFF',
        circleStrokeWidth: 2.5,
      ),
      enableInteraction: false,
    );
    await c.addGeoJsonSource('gps-accuracy', _emptyCollection);
    await c.addGeoJsonSource('gps-position', _emptyCollection);
    await c.addFillLayer(
      'gps-accuracy',
      'gps-accuracy-fill',
      const FillLayerProperties(fillColor: '#4FC3F7', fillOpacity: 0.18, fillOutlineColor: '#4FC3F7'),
      enableInteraction: false,
    );
    await c.addCircleLayer(
      'gps-position',
      'gps-position-halo',
      const CircleLayerProperties(circleRadius: 14, circleColor: '#4FC3F7', circleOpacity: 0.25),
      enableInteraction: false,
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
      enableInteraction: false,
    );
    _styleReady = true;
    for (final l in source.layers) {
      await _applyLayer(l);
    }
    await _drawPosition();
    await _drawMeasure();
    _maybeCenter(); // a fix may have arrived before the map was ready
  }

  /// Contour depth labels as icons (no font server), added for online or offline contours.
  Future<void> _addContourLabels(MapLibreMapController c, _MapSource source) async {
    final contours = source.layers.where((l) => l.slug == 'bathymetry-contours').firstOrNull;
    if (contours == null) return;
    for (final d in contourLevels) {
      await c.addImage(contourLabelImage(d), await renderContourLabel('$d m'));
    }
    const props = SymbolLayerProperties(
      iconImage: contourLabelExpression,
      iconSize: 0.5, // rendered at 2x for sharpness
      symbolPlacement: 'line',
      symbolSpacing: 320,
      iconRotationAlignment: 'viewport',
      iconAllowOverlap: false,
    );
    final labelIds = <String>[];
    if (source.offline) {
      for (final lineId in List.of(contours.styleLayerIds)) {
        final id = '$lineId-labels';
        await c.addSymbolLayer(lineId, id, props, minzoom: 8, enableInteraction: false);
        labelIds.add(id);
      }
    } else {
      await c.addSymbolLayer(
        'bathymetry-contours',
        'bathymetry-contour-labels',
        props,
        sourceLayer: 'contours',
        minzoom: 8,
      );
      labelIds.add('bathymetry-contour-labels');
    }
    for (final id in labelIds) {
      if (!contours.styleLayerIds.contains(id)) contours.styleLayerIds.add(id);
    }
  }

  Future<void> _applyLayer(OverlayLayer l) async {
    final c = _map;
    if (c == null || !_styleReady) return;
    // setLayerProperties sends every property, nulls included; a null `visibility` resets the
    // layer to visible. So apply opacity first and visibility last.
    if (l.supportsOpacity) {
      for (final id in l.styleLayerIds) {
        await c.setLayerProperties(
          id,
          RasterLayerProperties(rasterOpacity: l.opacity, rasterFadeDuration: 0),
        );
      }
    }
    for (final id in l.styleLayerIds) {
      await c.setLayerVisibility(id, l.visible);
    }
  }

  // --- GPS ----------------------------------------------------------------------------

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
      _snack('No GPS fix yet');
      return;
    }
    setState(() => _follow = !_follow);
    if (_follow) _centerOn(fix, zoom: math.max(_map?.cameraPosition?.zoom ?? 12, 12));
  }

  // --- Map taps: measurement, feature info, depth -------------------------------------

  Future<void> _onMapClick(math.Point<double> point, LatLng at) async {
    final m = _measure;
    if (m != null) {
      setState(() => m.add(at.latitude, at.longitude));
      await _drawMeasure();
      return;
    }
    if (_busyTap) return;
    _busyTap = true;
    try {
      await _showTapMarker(at);
      if (await _tryFeatureAt(point)) return;
      await _showDepthAt(at);
    } finally {
      _busyTap = false;
    }
  }

  Future<void> _showTapMarker(LatLng? at) async {
    if (_map == null || !_styleReady) return;
    await _map!.setGeoJsonSource('tap-marker', {
      'type': 'FeatureCollection',
      'features': [
        if (at != null)
          {
            'type': 'Feature',
            'properties': <String, dynamic>{},
            'geometry': {
              'type': 'Point',
              'coordinates': [at.longitude, at.latitude],
            },
          },
      ],
    });
  }

  Future<bool> _tryFeatureAt(math.Point<double> point) async {
    final source = _source;
    final c = _map;
    if (source == null || c == null) return false;
    final featureLayer = source.layers.where((l) => l.slug == 'bathymetry-features' && l.visible).firstOrNull;
    if (featureLayer == null) return false;
    final hits = await c.queryRenderedFeatures(point, featureLayer.styleLayerIds, null);
    if (hits.isEmpty) return false;
    final props = ((hits.first as Map)['properties'] as Map).cast<String, dynamic>();
    try {
      final info = source.offline || props['explanation'] != null
          ? FeatureInfo.fromJson(props)
          : await widget.bathymetry.feature((props['id'] as num).toInt());
      await _sheet(FeatureSheet(info: info));
    } on ApiException catch (e) {
      _snack('Could not load feature details: ${e.message}');
    }
    return true;
  }

  Future<void> _showDepthAt(LatLng at) async {
    DepthInfo? info;
    String? problem;
    if (_source?.offline ?? true) {
      info = widget.offline.packageCovering(at.latitude, at.longitude)?.depthAt(at.latitude, at.longitude);
      if (info == null) problem = 'No downloaded bathymetry covers this point';
    } else {
      try {
        info = await widget.bathymetry.depthAt(at.latitude, at.longitude);
        if (info == null) problem = 'Outside the bathymetry coverage';
      } on ApiException catch (e) {
        // Lost connection: answer from a downloaded package if one covers the point.
        info = widget.offline.packageCovering(at.latitude, at.longitude)?.depthAt(at.latitude, at.longitude);
        if (info == null) {
          problem = e.statusCode == 503 ? 'Bathymetry is not available on the server yet' : e.message;
        }
      }
    }
    if (info != null) {
      await _sheet(DepthSheet(info: info));
    } else {
      _snack(problem ?? 'No depth available');
    }
    await _showTapMarker(null);
  }

  Future<void> _drawMeasure() async {
    if (_map == null || !_styleReady) return;
    await _map!.setGeoJsonSource('measure', (_measure ?? Measurement()).toGeoJson());
  }

  void _toggleMeasure() {
    setState(() => _measure = _measure == null ? Measurement() : null);
    _drawMeasure();
  }

  // --- Sheets and screens -------------------------------------------------------------

  Future<void> _sheet(Widget child) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: JigColors.panel,
    builder: (_) => child,
  );

  void _openAccount() => _sheet(AccountSheet(auth: widget.auth));

  void _openLayers() => _sheet(
    LayersSheet(
      layers: _source?.layers ?? const [],
      offline: _source?.offline ?? false,
      onChanged: _applyLayer,
    ),
  );

  Future<void> _openOffline() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OfflineScreen(repo: widget.offline, auth: widget.auth, onSignIn: _openAccount),
      ),
    );
    // Offline style reflects the current set of packages.
    if (_source?.offline ?? false) await _useOfflineData();
    if (_source == null) await _useOfflineData();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  // --- UI -----------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: _mapOrState()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: Column(
                children: [
                  _topBar(),
                  const Spacer(),
                  if (_measure != null) _measurePanel(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(child: GpsPanel(location: widget.location)),
                      const SizedBox(width: 12),
                      _mapButtons(),
                    ],
                  ),
                  _attribution(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Required credits, shown as plain text under the panel instead of a box over the map.
  Widget _attribution() {
    final s = _source;
    final parts = <String>[
      if (s?.info != null) s!.info!.attribution,
      if (s != null && s.layers.isNotEmpty) 'Bathymetry: GEBCO 2026 Grid',
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        parts.join(' · '),
        key: const Key('attribution'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 9.5, color: Color(0xCCFFFFFF), shadows: [Shadow(blurRadius: 3)]),
      ),
    );
  }

  Widget _mapOrState() {
    final s = _source;
    if (s != null) {
      return MapLibreMap(
        key: ValueKey(s.styleJson.hashCode),
        styleString: s.styleJson,
        initialCameraPosition: CameraPosition(
          target: LatLng(s.info?.defaultLat ?? _defaultLat, s.info?.defaultLon ?? _defaultLon),
          zoom: s.info?.defaultZoom ?? _defaultZoom,
        ),
        onMapCreated: _onMapCreated,
        onStyleLoadedCallback: _onStyleLoaded,
        onMapClick: _onMapClick,
        // Taps on data features still reach onMapClick (feature info is queried there).
        featureTapsTriggersMapClick: true,
        trackCameraPosition: true,
        rotateGesturesEnabled: true,
        compassEnabled: false, // replaced by the north-up button, consistent across platforms
        // Native shows a small (i) button; on web the control is hidden by CSS and the
        // credits are shown as text under the GPS panel.
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
        isNetworkError ? '$message\nNo offline data downloaded yet.' : message,
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
                : FilledButton.tonal(onPressed: _loadMap, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    final s = _source;
    final info = s?.info;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (s != null && s.offline)
          Flexible(
            child: GestureDetector(
              onTap: _loadMap,
              child: Container(
                key: const Key('offline-banner'),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: JigColors.fair, borderRadius: BorderRadius.circular(20)),
                child: Text(
                  'OFFLINE · retry',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.black, fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
        const Spacer(),
        if (info != null && info.isDevelopmentOnly)
          Tooltip(
            message: info.licenceNote,
            child: Container(
              key: const Key('dev-licence-badge'),
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: JigColors.fair.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'DEV IMAGERY',
                style: TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        const SizedBox(width: 8),
        _roundButton(key: 'layers-button', icon: Icons.layers, tooltip: 'Map layers', onPressed: _openLayers),
        const SizedBox(width: 8),
        _roundButton(
          key: 'offline-button',
          icon: Icons.download_for_offline,
          tooltip: 'Offline data',
          onPressed: _openOffline,
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

  Widget _measurePanel() {
    final m = _measure!;
    final bearing = m.lastLegBearing;
    return Container(
      key: const Key('measure-panel'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
      decoration: BoxDecoration(
        color: JigColors.panel.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFFEB3B)),
      ),
      child: Row(
        children: [
          const Icon(Icons.straighten, color: Color(0xFFFFEB3B)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              m.points.length < 2
                  ? 'Tap the map to add points'
                  : '${formatDistance(m.totalMetres)}${bearing == null ? '' : ' · last leg ${bearing.toStringAsFixed(0).padLeft(3, '0')}°T'}',
              key: const Key('measure-distance'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            tooltip: 'Undo point',
            onPressed: m.points.isEmpty
                ? null
                : () {
                    setState(m.undo);
                    _drawMeasure();
                  },
            icon: const Icon(Icons.undo),
          ),
          IconButton(
            tooltip: 'Clear',
            onPressed: m.points.isEmpty
                ? null
                : () {
                    setState(m.clear);
                    _drawMeasure();
                  },
            icon: const Icon(Icons.delete_sweep),
          ),
        ],
      ),
    );
  }

  Widget _mapButtons() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      _roundButton(
        key: 'measure-button',
        icon: Icons.straighten,
        tooltip: _measure == null ? 'Measure distance' : 'Stop measuring',
        active: _measure != null,
        onPressed: _toggleMeasure,
      ),
      const SizedBox(height: 10),
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
          width: 48,
          height: 48,
          child: Center(child: child ?? Icon(icon, color: JigColors.text)),
        ),
      ),
    ),
  );
}
