import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:jigmap/src/offline/bathymetry_package.dart';
import 'package:jigmap/src/offline/offline_style.dart';

void main() {
  test('offline style contains packaged contours and features, no imagery', () {
    final pkg = BathymetryPackage.fromZip(File('test/fixtures/male_package.zip').readAsBytesSync());
    final built = buildOfflineStyle([pkg]);
    final style = jsonDecode(built.styleJson) as Map<String, dynamic>;
    expect(style['version'], 8);
    final sources = style['sources'] as Map;
    expect(sources.keys, containsAll(['offline-contours-test-male', 'offline-features-test-male']));
    expect(sources.values.every((s) => (s as Map)['type'] == 'geojson'), isTrue);
    expect(built.layers.map((l) => l.slug), ['bathymetry-contours', 'bathymetry-features']);
    expect(built.layers.last.visible, isFalse);
    expect(built.layers.first.dataUpdatedAt, DateTime.utc(2026, 4, 22, 14, 24, 55));
  });
}
