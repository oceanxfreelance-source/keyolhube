import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jigmap/src/offline/bathymetry_package.dart';

/// Fixture: an offline package built by the backend from a real GEBCO 2026 excerpt (Malé atolls).
void main() {
  final zip = File('test/fixtures/male_package.zip').readAsBytesSync();
  final expected = jsonDecode(File('test/fixtures/male_package_expected.json').readAsStringSync()) as Map;

  test('verifies and decodes a real package', () {
    final pkg = BathymetryPackage.fromZip(zip, expectedSha256: expected['sha256'] as String);
    expect(pkg.grid.width, 120);
    expect(pkg.grid.height, 120);
    expect(pkg.dataset['version'], 'GEBCO_2026');
    expect(pkg.disclaimer, contains('NOT a nautical chart'));
    expect((jsonDecode(pkg.contoursGeoJson)['features'] as List).length, expected['contours']);
    expect((jsonDecode(pkg.featuresGeoJson)['features'] as List).length, expected['features']);
  });

  test('local depth lookup matches the server grid cell values', () {
    final pkg = BathymetryPackage.fromZip(zip);
    for (final c in (expected['cells'] as List).cast<Map>()) {
      final info = pkg.depthAt((c['lat'] as num).toDouble(), (c['lon'] as num).toDouble())!;
      expect(info.elevationM, (c['elev'] as num).toDouble());
      expect(info.tid, c['tid']);
      expect(info.fromOfflinePackage, 'test-male');
      expect(info.isDirectMeasurement, isFalse); // TID 40 = satellite-gravity prediction
    }
    expect(pkg.depthAt(10, 73.5), isNull); // outside the package
  });

  test('wrong archive checksum is rejected', () {
    expect(
      () => BathymetryPackage.fromZip(zip, expectedSha256: 'f' * 64),
      throwsA(isA<PackageIntegrityError>()),
    );
  });

  test('a tampered file inside the archive is rejected', () {
    final archive = ZipDecoder().decodeBytes(zip);
    final out = Archive();
    for (final f in archive.files) {
      var data = Uint8List.fromList(f.content as List<int>);
      if (f.name == 'elevation.i16') {
        data = Uint8List.fromList(data)..[10] ^= 0xFF;
      }
      out.addFile(ArchiveFile(f.name, data.length, data));
    }
    final tampered = Uint8List.fromList(ZipEncoder().encode(out));
    expect(() => BathymetryPackage.fromZip(tampered), throwsA(isA<PackageIntegrityError>()));
  });
}
