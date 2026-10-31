/// GEBCO TID category (mirrors the server's classification).
String tidCategory(int code) {
  if (code == 0) return 'land';
  if (code >= 10 && code <= 17) return 'direct_measurement';
  if (code >= 40 && code <= 48) return 'indirect_or_interpolated';
  return 'unknown_or_pre_generated';
}

/// Depth at a tapped point, from the API or from a downloaded package.
class DepthInfo {
  DepthInfo({
    required this.lat,
    required this.lon,
    required this.elevationM,
    required this.slopeDeg,
    required this.cellSizeM,
    required this.tid,
    required this.tidLabel,
    required this.tidCategory,
    required this.datasetVersion,
    required this.citation,
    required this.sourceLastModified,
    required this.disclaimer,
    this.fromOfflinePackage,
  });

  factory DepthInfo.fromApi(Map<String, dynamic> j) {
    final src = j['source'] as Map<String, dynamic>;
    final ds = j['dataset'] as Map<String, dynamic>;
    final q = j['query'] as Map<String, dynamic>;
    return DepthInfo(
      lat: (q['lat'] as num).toDouble(),
      lon: (q['lon'] as num).toDouble(),
      elevationM: (j['elevation_m'] as num).toDouble(),
      slopeDeg: (j['slope_deg'] as num?)?.toDouble(),
      cellSizeM: ((j['cell'] as Map)['size_m_approx'] as num).toDouble(),
      tid: src['tid'] as int,
      tidLabel: src['label'] as String,
      tidCategory: src['category'] as String,
      datasetVersion: ds['version'] as String,
      citation: ds['citation'] as String,
      sourceLastModified: ds['source_last_modified'] == null
          ? null
          : DateTime.parse(ds['source_last_modified'] as String),
      disclaimer: j['disclaimer'] as String,
    );
  }

  final double lat;
  final double lon;
  final double elevationM;
  final double? slopeDeg;
  final double cellSizeM;
  final int tid;
  final String tidLabel;
  final String tidCategory;
  final String datasetVersion;
  final String citation;
  final DateTime? sourceLastModified;
  final String disclaimer;
  final String? fromOfflinePackage;

  bool get isAboveSeaLevel => elevationM >= 0;
  double? get depthM => elevationM < 0 ? -elevationM : null;
  bool get isDirectMeasurement => tidCategory == 'direct_measurement';
}

/// A computed terrain candidate (drop-off, pinnacle, knoll, seamount).
class FeatureInfo {
  FeatureInfo({
    required this.kind,
    required this.depthM,
    required this.explanation,
    this.reliefM,
    this.maxSlopeDeg,
    this.depthRangeM,
    this.tidLabel,
  });

  factory FeatureInfo.fromJson(Map<String, dynamic> j) => FeatureInfo(
    kind: j['kind'] as String,
    depthM: (j['depth_m'] as num).toDouble(),
    reliefM: (j['relief_m'] as num?)?.toDouble(),
    maxSlopeDeg: (j['max_slope_deg'] as num?)?.toDouble(),
    depthRangeM: (j['depth_range_m'] as List?)?.map((e) => (e as num).toDouble()).toList(),
    explanation: j['explanation'] as String,
    tidLabel: (j['source'] as Map?)?['label'] as String?,
  );

  final String kind;
  final double depthM;
  final double? reliefM;
  final double? maxSlopeDeg;
  final List<double>? depthRangeM;
  final String explanation;
  final String? tidLabel;

  String get title => switch (kind) {
    'drop_off' => 'Drop-off candidate',
    'pinnacle' => 'Pinnacle candidate',
    'knoll' => 'Knoll candidate',
    'seamount' => 'Seamount candidate',
    _ => 'Terrain candidate',
  };
}
