import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:jigmap/src/location/location_service.dart';
import 'package:jigmap/src/ui/gps_panel.dart';

/// Test double for the platform channel. It only feeds positions the test
/// explicitly pushes; the app itself never fabricates positions.
class FakeGeolocator extends GeolocatorPlatform {
  FakeGeolocator({this.serviceEnabled = true, this.permission = LocationPermission.whileInUse});

  bool serviceEnabled;
  LocationPermission permission;
  final controller = StreamController<Position>.broadcast();

  @override
  Future<bool> isLocationServiceEnabled() async => serviceEnabled;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async => permission;
  @override
  Stream<Position> getPositionStream({LocationSettings? locationSettings}) => controller.stream;

  int currentPositionCalls = 0;
  Position? currentPosition;
  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) async {
    currentPositionCalls++;
    if (currentPosition == null) throw TimeoutException('no fix');
    return currentPosition!;
  }
}

Position _pos({required DateTime at}) => Position(
  latitude: 4.1755,
  longitude: 73.5093,
  timestamp: at,
  accuracy: 6,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 92,
  headingAccuracy: 0,
  speed: 3.6,
  speedAccuracy: 0.2,
);

/// Stream events are delivered in a microtask after the current frame, so
/// pump twice: once to deliver, once to rebuild.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

Future<void> _pump(WidgetTester tester, LocationService svc) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: GpsPanel(location: svc)),
    ),
  );
  await svc.start();
  await tester.pump();
}

void main() {
  testWidgets('shows services-disabled state with a working action', (tester) async {
    final svc = LocationService(geolocator: FakeGeolocator(serviceEnabled: false));
    await _pump(tester, svc);
    expect(svc.status, LocationStatus.serviceDisabled);
    expect(find.text('Location services are turned off'), findsOneWidget);
    expect(find.text('Open settings'), findsOneWidget);
    svc.dispose();
  });

  testWidgets('shows permission denied', (tester) async {
    final svc = LocationService(geolocator: FakeGeolocator(permission: LocationPermission.denied));
    await _pump(tester, svc);
    expect(find.text('Location permission not granted'), findsOneWidget);
    svc.dispose();
  });

  testWidgets('waits for a fix, then shows position, SOG, COG and accuracy', (tester) async {
    final geo = FakeGeolocator();
    final svc = LocationService(geolocator: geo, zeroMeansUnreported: false);
    await _pump(tester, svc);
    expect(find.text('Waiting for GPS fix…'), findsOneWidget);

    geo.controller.add(_pos(at: DateTime.now().toUtc()));
    await _settle(tester);
    expect(find.byKey(const Key('gps-position')), findsOneWidget);
    expect(find.text("04°10.530'N   073°30.558'E"), findsOneWidget);
    expect(find.text('7.0 kn'), findsOneWidget); // 3.6 m/s
    expect(find.text('092°'), findsOneWidget);
    expect(find.text('±6 m'), findsOneWidget);
    expect(find.text('GPS GOOD'), findsOneWidget);
    svc.dispose();
    await geo.controller.close();
  });

  testWidgets('web-style zero speed/heading without accuracy is shown as unreported', (tester) async {
    final geo = FakeGeolocator();
    final svc = LocationService(geolocator: geo, zeroMeansUnreported: true);
    await _pump(tester, svc);
    geo.controller.add(
      Position(
        latitude: 4.1755,
        longitude: 73.5093,
        timestamp: DateTime.now().toUtc(),
        accuracy: 8,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      ),
    );
    await _settle(tester);
    expect(svc.lastFix!.speedOverGroundKnots, isNull);
    expect(find.byKey(const Key('gps-sog')), findsOneWidget);
    expect(find.text('0.0 kn'), findsNothing);
    svc.dispose();
    await geo.controller.close();
  });

  testWidgets('an old fix is flagged as signal lost, never shown as current', (tester) async {
    final geo = FakeGeolocator();
    final svc = LocationService(geolocator: geo, zeroMeansUnreported: false);
    await _pump(tester, svc);
    geo.controller.add(_pos(at: DateTime.now().toUtc().subtract(const Duration(minutes: 2))));
    await _settle(tester);
    expect(find.text('GPS SIGNAL LOST'), findsOneWidget);
    expect(find.textContaining('2 min ago'), findsOneWidget);
    svc.dispose();
    await geo.controller.close();
  });

  testWidgets('a quiet stream triggers an explicit fresh-fix request', (tester) async {
    final geo = FakeGeolocator();
    final svc = LocationService(geolocator: geo, zeroMeansUnreported: false);
    await _pump(tester, svc);
    geo.controller.add(_pos(at: DateTime.now().toUtc().subtract(const Duration(seconds: 30))));
    await _settle(tester);
    expect(find.text('GPS SIGNAL LOST'), findsOneWidget);

    geo.currentPosition = _pos(at: DateTime.now().toUtc());
    await tester.pump(LocationService.refreshAfter);
    await _settle(tester);
    expect(geo.currentPositionCalls, 1);
    expect(find.text('GPS GOOD'), findsOneWidget);
    svc.dispose();
    await geo.controller.close();
  });
}
