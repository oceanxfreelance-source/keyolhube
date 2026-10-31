import 'package:flutter_test/flutter_test.dart';
import 'package:jigmap/src/map/measurement.dart';

void main() {
  test('one minute of latitude is ~1 NM', () {
    final m = Measurement()
      ..add(4.0, 73.5)
      ..add(4.0 + 1 / 60, 73.5);
    expect(m.totalMetres / metresPerNauticalMile, closeTo(1.0, 0.01));
    expect(m.lastLegBearing, closeTo(0, 0.01));
  });

  test('multi-leg total, bearing, undo and clear', () {
    final m = Measurement()
      ..add(4.0, 73.5)
      ..add(4.0, 73.6)
      ..add(3.9, 73.6);
    expect(m.lastLegBearing, closeTo(180, 0.01));
    final twoLegs = m.totalMetres;
    m.undo();
    expect(m.totalMetres, lessThan(twoLegs));
    expect(m.lastLegBearing, closeTo(90, 0.1));
    m.clear();
    expect(m.points, isEmpty);
    expect(m.lastLegBearing, isNull);
  });

  test('distance formatting', () {
    expect(formatDistance(926), '0.50 NM · 926 m');
    expect(formatDistance(18520), '10.0 NM · 18.5 km');
  });

  test('GeoJSON has a line once two points exist', () {
    final m = Measurement()..add(4, 73);
    expect((m.toGeoJson()['features'] as List).length, 1);
    m.add(4.1, 73.1);
    final f = m.toGeoJson()['features'] as List;
    expect((f.first as Map)['geometry']['type'], 'LineString');
  });
}
