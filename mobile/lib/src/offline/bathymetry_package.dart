import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';

import '../bathymetry/depth_info.dart';

class PackageIntegrityError implements Exception {
  PackageIntegrityError(this.message);
  final String message;
  @override
  String toString() => 'Offline package rejected: $message';
}

/// Geometry of the packaged depth grid (pixel-centre registered, row 0 = north).
class GridInfo {
  const GridInfo({
    required this.width,
    required this.height,
    required this.west,
    required this.north,
    required this.resDeg,
  });

  factory GridInfo.fromJson(Map<String, dynamic> j) => GridInfo(
    width: j['width'] as int,
    height: j['height'] as int,
    west: (j['west'] as num).toDouble(),
    north: (j['north'] as num).toDouble(),
    resDeg: (j['res_deg'] as num).toDouble(),
  );

  final int width;
  final int height;
  final double west;
  final double north;
  final double resDeg;

  double get east => west + width * resDeg;
  double get south => north - height * resDeg;

  /// (row, col) of the cell containing the point, or null when outside.
  (int, int)? cellOf(double lat, double lon) {
    final col = ((lon - west) / resDeg).floor();
    final row = ((north - lat) / resDeg).floor();
    if (row < 0 || col < 0 || row >= height || col >= width) return null;
    return (row, col);
  }
}

/// A verified, decoded GEBCO offline package (format version 1).
class BathymetryPackage {
  BathymetryPackage({
    required this.manifest,
    required this.grid,
    required this.elevation,
    required this.tid,
    required this.contoursGeoJson,
    required this.featuresGeoJson,
  });

  static const supportedFormat = 1;

  final Map<String, dynamic> manifest;
  final GridInfo grid;
  final Int16List elevation;
  final Uint8List tid;
  final String contoursGeoJson;
  final String featuresGeoJson;

  String get slug => (manifest['region'] as Map)['slug'] as String;
  String get regionName => (manifest['region'] as Map)['name'] as String;
  Map<String, dynamic> get dataset => manifest['dataset'] as Map<String, dynamic>;
  String get disclaimer => manifest['disclaimer'] as String;
  DateTime? get sourceLastModified {
    final v = dataset['source_last_modified'];
    return v == null ? null : DateTime.parse(v as String).toUtc();
  }

  DateTime get generatedAt => DateTime.parse(manifest['generated_at'] as String).toUtc();

  /// Verifies the archive (against [expectedSha256] when given) and every file
  /// inside it against the manifest, then decodes it.
  static BathymetryPackage fromZip(Uint8List zipBytes, {String? expectedSha256}) {
    if (expectedSha256 != null && sha256.convert(zipBytes).toString() != expectedSha256) {
      throw PackageIntegrityError('archive SHA-256 does not match the server');
    }
    final archive = ZipDecoder().decodeBytes(zipBytes, verify: true);
    final files = <String, Uint8List>{};
    for (final f in archive.files) {
      if (f.isFile) files[f.name] = Uint8List.fromList(f.content as List<int>);
    }
    final manifestBytes = files['manifest.json'];
    if (manifestBytes == null) throw PackageIntegrityError('manifest.json missing');
    final manifest = jsonDecode(utf8.decode(manifestBytes)) as Map<String, dynamic>;
    if (manifest['format_version'] != supportedFormat) {
      throw PackageIntegrityError('unsupported format ${manifest['format_version']}');
    }
    final declared = (manifest['files'] as Map).cast<String, dynamic>();
    declared.forEach((name, info) {
      final data = files[name];
      if (data == null) throw PackageIntegrityError('$name missing');
      if (sha256.convert(data).toString() != (info as Map)['sha256']) {
        throw PackageIntegrityError('$name checksum mismatch');
      }
    });
    final g = manifest['grid'] as Map<String, dynamic>;
    final grid = GridInfo.fromJson(g);
    final elevBytes = files[g['file']]!;
    if (elevBytes.length != grid.width * grid.height * 2) {
      throw PackageIntegrityError('elevation grid has unexpected size');
    }
    final elevation = Int16List(grid.width * grid.height);
    final bd = ByteData.sublistView(elevBytes);
    for (var i = 0; i < elevation.length; i++) {
      elevation[i] = bd.getInt16(i * 2, Endian.little);
    }
    return BathymetryPackage(
      manifest: manifest,
      grid: grid,
      elevation: elevation,
      tid: files[g['tid_file']]!,
      contoursGeoJson: utf8.decode(files['contours.geojson']!),
      featuresGeoJson: utf8.decode(files['features.geojson']!),
    );
  }

  /// Depth lookup from the downloaded grid (same cell rule as the server).
  DepthInfo? depthAt(double lat, double lon) {
    final cell = grid.cellOf(lat, lon);
    if (cell == null) return null;
    final (r, c) = cell;
    final elev = elevation[r * grid.width + c].toDouble();
    final code = tid[r * grid.width + c];
    final labels = (manifest['tid_labels'] as Map).cast<String, dynamic>();
    return DepthInfo(
      lat: lat,
      lon: lon,
      elevationM: elev,
      slopeDeg: null,
      cellSizeM: (grid.resDeg * 110574).roundToDouble(),
      tid: code,
      tidLabel: labels['$code'] as String? ?? 'TID $code',
      tidCategory: tidCategory(code),
      datasetVersion: dataset['version'] as String,
      citation: dataset['citation'] as String,
      sourceLastModified: sourceLastModified,
      disclaimer: disclaimer,
      fromOfflinePackage: slug,
    );
  }
}
