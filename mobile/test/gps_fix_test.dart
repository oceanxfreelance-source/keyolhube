import 'package:flutter_test/flutter_test.dart';
import 'package:jigmap/src/location/gps_fix.dart';

void main() {
  final t = DateTime.utc(2026, 10, 31, 8);

  test('invalid platform readings become null, not zero', () {
    final fix = GpsFix.fromRaw(
      latitude: 4.17,
      longitude: 73.5,
      timestamp: t,
      accuracy: -1,
      speed: -1,
      heading: -1,
      altitude: double.nan,
    );
    expect(fix.accuracyMetres, isNull);
    expect(fix.speedOverGroundKnots, isNull);
    expect(fix.courseOverGround, isNull);
    expect(fix.altitudeMetres, isNull);
  });

  test('COG hidden when nearly stationary, shown when underway', () {
    final drifting = GpsFix.fromRaw(latitude: 4, longitude: 73, timestamp: t, speed: 0.1, heading: 270);
    expect(drifting.courseOverGround, isNull);
    final underway = GpsFix.fromRaw(latitude: 4, longitude: 73, timestamp: t, speed: 5, heading: 270);
    expect(underway.speedOverGroundKnots, closeTo(9.72, 0.01));
    expect(underway.courseOverGround, 270);
  });

  test('quality grades and staleness', () {
    GpsFix f(double acc) => GpsFix.fromRaw(latitude: 4, longitude: 73, timestamp: t, accuracy: acc);
    expect(qualityFor(null, now: t), GpsQuality.none);
    expect(qualityFor(f(5), now: t), GpsQuality.good);
    expect(qualityFor(f(30), now: t), GpsQuality.fair);
    expect(qualityFor(f(80), now: t), GpsQuality.poor);
    expect(qualityFor(f(5), now: t.add(const Duration(seconds: 20))), GpsQuality.none);
  });
}
