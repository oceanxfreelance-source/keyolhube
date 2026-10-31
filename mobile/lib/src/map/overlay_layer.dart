/// A data overlay the user can toggle, with its provenance.
class OverlayLayer {
  OverlayLayer({
    required this.slug,
    required this.name,
    required this.styleLayerIds,
    required this.dataKind,
    required this.description,
    required this.attribution,
    required this.dataUpdatedAt,
    required this.visible,
    required this.opacity,
    required this.supportsOpacity,
  });

  factory OverlayLayer.fromJson(Map<String, dynamic> j) => OverlayLayer(
    slug: j['slug'] as String,
    name: j['name'] as String,
    styleLayerIds: (j['style_layer_ids'] as List).cast<String>(),
    dataKind: j['data_kind'] as String,
    description: j['description'] as String?,
    attribution: j['attribution'] as String?,
    dataUpdatedAt: j['data_updated_at'] == null ? null : DateTime.parse(j['data_updated_at'] as String),
    visible: j['default_visible'] as bool,
    opacity: (j['default_opacity'] as num).toDouble(),
    supportsOpacity: j['supports_opacity'] as bool,
  );

  final String slug;
  final String name;
  final List<String> styleLayerIds; // includes client-added layers (e.g. contour labels)
  final String dataKind;
  final String? description;
  final String? attribution;
  final DateTime? dataUpdatedAt;
  final bool supportsOpacity;
  bool visible;
  double opacity;
}

String dataKindLabel(String kind) => switch (kind) {
  'observation' => 'Observation',
  'forecast' => 'Forecast',
  'reanalysis' => 'Reanalysis',
  'historical_compilation' => 'Historical compilation',
  'imagery_mosaic' => 'Imagery mosaic',
  'derived_analysis' => 'Derived analysis (computed)',
  'prediction' => 'Prediction',
  _ => kind,
};
