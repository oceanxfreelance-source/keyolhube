import 'package:flutter_test/flutter_test.dart';
import 'package:jigmap/src/util/geo.dart';
import 'package:jigmap/src/util/time_format.dart';
import 'package:jigmap/src/util/units.dart';

void main() {
  test('m/s to knots', () {
    expect(knotsFromMetresPerSecond(1852 / 3600), closeTo(1.0, 1e-9));
    expect(knotsFromMetresPerSecond(5), closeTo(9.7192, 1e-4));
  });

  test('degrees-minutes formatting', () {
    expect(formatDegreesMinutes(4.1755, isLatitude: true), "04°10.530'N");
    expect(formatDegreesMinutes(73.5093, isLatitude: false), "073°30.558'E");
    expect(formatDegreesMinutes(-0.6913, isLatitude: true), "00°41.478'S");
    // Rounding up to 60.000 minutes rolls over to the next degree.
    expect(formatDegreesMinutes(4.9999999, isLatitude: true), "05°00.000'N");
  });

  test('Maldives time is UTC+5', () {
    final utc = DateTime.utc(2026, 10, 31, 20, 15, 9);
    expect(formatMaldivesClock(utc), '01:15:09 MVT');
    expect(toMaldivesTime(utc).day, 1);
  });

  test('age formatting', () {
    expect(formatAge(const Duration(seconds: 4)), '4 s ago');
    expect(formatAge(const Duration(minutes: 3)), '3 min ago');
    expect(formatAge(const Duration(hours: 2)), '2 h ago');
  });

  test('haversine distance Malé to Hulhulé airport ≈ 2 km', () {
    final d = distanceMetres(4.1755, 73.5093, 4.1918, 73.5290);
    expect(d, inInclusiveRange(2600, 2900));
  });

  test('accuracy circle polygon is closed and has the requested radius', () {
    final poly = circlePolygon(4.1755, 73.5093, 100);
    final ring = (poly['coordinates'] as List).first as List<List<double>>;
    expect(ring.first, ring.last);
    for (final p in ring) {
      expect(distanceMetres(4.1755, 73.5093, p[1], p[0]), closeTo(100, 0.5));
    }
  });
}
