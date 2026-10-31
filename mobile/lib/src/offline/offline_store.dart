import 'dart:typed_data';

import 'package:hive_ce/hive_ce.dart';

/// Persists downloaded offline packages (IndexedDB on web, files on mobile).
///
/// The verified ZIP is stored as-is and re-verified when loaded, so a corrupted
/// local copy can never be shown as valid data.
class OfflineStore {
  OfflineStore._(this._meta, this._blobs);

  static const _metaBox = 'offline_meta';
  static const _blobBox = 'offline_blobs';

  final Box<Map> _meta;
  final LazyBox<Uint8List> _blobs;

  static Future<OfflineStore> open() async =>
      OfflineStore._(await Hive.openBox<Map>(_metaBox), await Hive.openLazyBox<Uint8List>(_blobBox));

  List<StoredPackage> list() =>
      _meta.values.map((m) => StoredPackage.fromMap(m.cast<String, dynamic>())).toList()
        ..sort((a, b) => a.slug.compareTo(b.slug));

  Future<void> save(StoredPackage meta, Uint8List zip) async {
    await _blobs.put(meta.slug, zip);
    await _meta.put(meta.slug, meta.toMap());
  }

  Future<Uint8List?> zipFor(String slug) => _blobs.get(slug);

  Future<void> delete(String slug) async {
    await _blobs.delete(slug);
    await _meta.delete(slug);
  }
}

class StoredPackage {
  StoredPackage({
    required this.slug,
    required this.regionSlug,
    required this.name,
    required this.sha256,
    required this.sizeBytes,
    required this.datasetVersion,
    required this.dataUpdatedAt,
    required this.downloadedAt,
  });

  factory StoredPackage.fromMap(Map<String, dynamic> m) => StoredPackage(
    slug: m['slug'] as String,
    regionSlug: m['region_slug'] as String,
    name: m['name'] as String,
    sha256: m['sha256'] as String,
    sizeBytes: m['size_bytes'] as int,
    datasetVersion: m['dataset_version'] as String,
    dataUpdatedAt: DateTime.parse(m['data_updated_at'] as String),
    downloadedAt: DateTime.parse(m['downloaded_at'] as String),
  );

  final String slug;
  final String regionSlug;
  final String name;
  final String sha256;
  final int sizeBytes;
  final String datasetVersion;
  final DateTime dataUpdatedAt;
  final DateTime downloadedAt;

  Map<String, dynamic> toMap() => {
    'slug': slug,
    'region_slug': regionSlug,
    'name': name,
    'sha256': sha256,
    'size_bytes': sizeBytes,
    'dataset_version': datasetVersion,
    'data_updated_at': dataUpdatedAt.toIso8601String(),
    'downloaded_at': downloadedAt.toIso8601String(),
  };
}
