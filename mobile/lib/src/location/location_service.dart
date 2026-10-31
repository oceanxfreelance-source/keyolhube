import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import 'gps_fix.dart';

enum LocationStatus {
  initial,
  checking,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
  acquiring, // permission granted, waiting for first fix
  tracking,
  error,
}

/// Streams real device GNSS fixes via the platform location services.
/// No positions are ever synthesised: until the device reports a fix,
/// [lastFix] is null.
class LocationService extends ChangeNotifier {
  LocationService({GeolocatorPlatform? geolocator, bool? zeroMeansUnreported})
    : _geo = geolocator ?? GeolocatorPlatform.instance,
      _zeroMeansUnreported = zeroMeansUnreported ?? kIsWeb;

  final GeolocatorPlatform _geo;

  /// The web plugin substitutes 0.0 when the browser reports no speed/heading
  /// (and never reports their accuracy). Treat those zeros as "unreported" so
  /// the UI shows "—" instead of a fabricated 0.0 kn.
  final bool _zeroMeansUnreported;
  StreamSubscription<Position>? _sub;
  Timer? _freshness;
  bool _polling = false;

  /// If the stream has been quiet this long, request a fresh fix explicitly.
  /// Browsers often only fire `watchPosition` when the position changes, so a
  /// stationary device would otherwise look like it has lost GPS.
  static const refreshAfter = Duration(seconds: 5);

  LocationStatus status = LocationStatus.initial;
  GpsFix? lastFix;
  String? errorMessage;

  bool get hasFix => lastFix != null;

  Future<void> start() async {
    await _sub?.cancel();
    _freshness?.cancel();
    _set(LocationStatus.checking);
    try {
      if (!await _geo.isLocationServiceEnabled()) {
        _set(LocationStatus.serviceDisabled);
        return;
      }
      var permission = await _geo.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await _geo.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        _set(LocationStatus.permissionDeniedForever);
        return;
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
        _set(LocationStatus.permissionDenied);
        return;
      }
      _set(LocationStatus.acquiring);
      _sub = _geo
          .getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.bestForNavigation,
              distanceFilter: 0,
            ),
          )
          .listen(_onPosition, onError: _onError);
      _freshness = Timer.periodic(refreshAfter, (_) => _refreshIfQuiet());
    } catch (e) {
      _onError(e);
    }
  }

  void _onPosition(Position p) {
    final speedUnreported = _zeroMeansUnreported && p.speed == 0 && p.speedAccuracy == 0;
    final headingUnreported = _zeroMeansUnreported && p.heading == 0 && p.headingAccuracy == 0;
    lastFix = GpsFix.fromRaw(
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp,
      accuracy: p.accuracy,
      speed: speedUnreported ? null : p.speed,
      heading: headingUnreported ? null : p.heading,
      altitude: p.altitude,
      altitudeValid: p.altitudeAccuracy > 0,
    );
    errorMessage = null;
    _set(LocationStatus.tracking);
  }

  Future<void> _refreshIfQuiet() async {
    final fix = lastFix;
    if (_polling || (fix != null && DateTime.now().toUtc().difference(fix.timestamp) < refreshAfter)) return;
    _polling = true;
    try {
      final settings = kIsWeb
          ? WebSettings(
              accuracy: LocationAccuracy.best,
              maximumAge: Duration.zero, // never accept a cached browser position
              timeLimit: const Duration(seconds: 10),
            )
          : const LocationSettings(accuracy: LocationAccuracy.best, timeLimit: Duration(seconds: 10));
      _onPosition(await _geo.getCurrentPosition(locationSettings: settings));
    } catch (_) {
      // No fresh fix available; the fix age shown in the UI reflects that.
    } finally {
      _polling = false;
    }
  }

  void _onError(Object e) {
    errorMessage = e.toString();
    // Keep the last fix (it carries its own timestamp) but flag the error.
    _set(e is PermissionDeniedException ? LocationStatus.permissionDenied : LocationStatus.error);
  }

  Future<void> openSettings() async {
    if (status == LocationStatus.serviceDisabled) {
      await _geo.openLocationSettings();
    } else {
      await _geo.openAppSettings();
    }
  }

  void _set(LocationStatus s) {
    status = s;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _freshness?.cancel();
    super.dispose();
  }
}
