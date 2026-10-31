import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_ce/hive_ce.dart';
import 'package:jigmap/src/offline/offline_store.dart';

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('jigmap-hive');
    Hive.init(dir.path);
  });

  tearDown(() async {
    await Hive.close();
    await dir.delete(recursive: true);
  });

  test('saves, lists, reads back and deletes packages', () async {
    final store = await OfflineStore.open();
    final zip = Uint8List.fromList(List.generate(5000, (i) => i % 256));
    final meta = StoredPackage(
      slug: 'bathymetry-maldives-central-abc',
      regionSlug: 'maldives-central',
      name: 'Central Maldives',
      sha256: 'a' * 64,
      sizeBytes: zip.length,
      datasetVersion: 'GEBCO_2026',
      dataUpdatedAt: DateTime.utc(2026, 4, 22),
      downloadedAt: DateTime.utc(2026, 10, 31),
    );
    await store.save(meta, zip);
    expect(store.list().single.regionSlug, 'maldives-central');
    expect(await store.zipFor(meta.slug), zip);
    await store.delete(meta.slug);
    expect(store.list(), isEmpty);
    expect(await store.zipFor(meta.slug), isNull);
  });
}
