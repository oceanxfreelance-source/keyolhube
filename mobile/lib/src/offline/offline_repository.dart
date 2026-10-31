import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'bathymetry_package.dart';
import 'offline_store.dart';

class RemotePackage {
  RemotePackage.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      slug = j['slug'] as String,
      name = j['name'] as String,
      sizeBytes = j['size_bytes'] as int,
      sha256 = j['sha256'] as String,
      dataUpdatedAt = DateTime.parse(j['data_updated_at'] as String),
      downloadUrl = j['download_url'] as String,
      regionSlug = (j['contents'] as Map)['region'] as String;

  final String id;
  final String slug;
  final String name;
  final int sizeBytes;
  final String sha256;
  final DateTime dataUpdatedAt;
  final String downloadUrl;
  final String regionSlug;
}

/// Lists, downloads, verifies and loads offline packages.
class OfflineRepository extends ChangeNotifier {
  OfflineRepository(this._api, this._store);

  final ApiClient _api;
  final OfflineStore _store;

  final Map<String, BathymetryPackage> _loaded = {};
  final Map<String, double> progress = {}; // slug -> 0..1 while downloading
  String? lastError;

  List<StoredPackage> get stored => _store.list();
  List<BathymetryPackage> get loaded => _loaded.values.toList();

  Future<List<RemotePackage>> fetchAvailable() async {
    final list = await _api.get('/offline/packages') as List<dynamic>;
    return list.map((e) => RemotePackage.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Loads and re-verifies every stored package into memory (for offline use).
  Future<void> loadAll() async {
    for (final meta in _store.list()) {
      if (_loaded.containsKey(meta.slug)) continue;
      final zip = await _store.zipFor(meta.slug);
      if (zip == null) continue;
      try {
        _loaded[meta.slug] = await compute(_decode, (zip, meta.sha256));
      } on PackageIntegrityError catch (e) {
        lastError = '${meta.name}: $e';
        await _store.delete(meta.slug);
      }
    }
    notifyListeners();
  }

  Future<void> download(RemotePackage pkg) async {
    progress[pkg.slug] = 0;
    lastError = null;
    notifyListeners();
    try {
      final bytes = await _api.getBytes(
        pkg.downloadUrl.replaceFirst('/api/v1', ''),
        onProgress: (got, total) {
          progress[pkg.slug] = (total ?? pkg.sizeBytes) > 0 ? got / (total ?? pkg.sizeBytes) : 0;
          notifyListeners();
        },
      );
      final decoded = await compute(_decode, (bytes, pkg.sha256));
      // Replace older packages for the same region.
      for (final old in _store.list().where((s) => s.regionSlug == pkg.regionSlug && s.slug != pkg.slug)) {
        await remove(old.slug, notify: false);
      }
      await _store.save(
        StoredPackage(
          slug: pkg.slug,
          regionSlug: pkg.regionSlug,
          name: pkg.name,
          sha256: pkg.sha256,
          sizeBytes: bytes.length,
          datasetVersion: decoded.dataset['version'] as String,
          dataUpdatedAt: pkg.dataUpdatedAt,
          downloadedAt: DateTime.now().toUtc(),
        ),
        bytes,
      );
      _loaded[pkg.slug] = decoded;
    } catch (e) {
      lastError = e is ApiException ? e.message : e.toString();
      rethrow;
    } finally {
      progress.remove(pkg.slug);
      notifyListeners();
    }
  }

  Future<void> remove(String slug, {bool notify = true}) async {
    await _store.delete(slug);
    _loaded.remove(slug);
    if (notify) notifyListeners();
  }

  BathymetryPackage? packageCovering(double lat, double lon) {
    for (final p in _loaded.values) {
      if (p.grid.cellOf(lat, lon) != null) return p;
    }
    return null;
  }
}

BathymetryPackage _decode((Uint8List, String) args) =>
    BathymetryPackage.fromZip(args.$1, expectedSha256: args.$2);
