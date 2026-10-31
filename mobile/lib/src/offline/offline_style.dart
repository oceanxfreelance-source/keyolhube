import 'dart:convert';

import '../map/overlay_layer.dart';
import 'bathymetry_package.dart';

const _contourColour = [
  'interpolate',
  ['linear'],
  ['get', 'depth_m'],
  10,
  '#b2ebf2',
  50,
  '#4dd0e1',
  200,
  '#26c6da',
  1000,
  '#0097a7',
  3000,
  '#006064',
];

/// MapLibre style built entirely from downloaded packages (no network needed).
/// Satellite imagery is not included: offline imagery storage is not licensed.
({String styleJson, List<OverlayLayer> layers}) buildOfflineStyle(List<BathymetryPackage> packages) {
  final sources = <String, dynamic>{};
  final layers = <Map<String, dynamic>>[
    {
      'id': 'background',
      'type': 'background',
      'paint': {'background-color': '#0b2236'},
    },
  ];
  final contourIds = <String>[], featureIds = <String>[];
  for (final p in packages) {
    final c = 'offline-contours-${p.slug}', f = 'offline-features-${p.slug}';
    sources[c] = {'type': 'geojson', 'data': jsonDecode(p.contoursGeoJson)};
    sources[f] = {'type': 'geojson', 'data': jsonDecode(p.featuresGeoJson)};
    layers.add({
      'id': c,
      'type': 'line',
      'source': c,
      'layout': {'line-join': 'round'},
      'paint': {
        'line-color': _contourColour,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          0.6,
          10,
          1.2,
          14,
          2.0,
        ],
      },
    });
    layers.add({
      'id': f,
      'type': 'circle',
      'source': f,
      'minzoom': 6,
      'layout': {'visibility': 'none'},
      'paint': {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          3,
          12,
          7,
        ],
        'circle-color': [
          'match',
          ['get', 'kind'],
          'drop_off',
          '#ff9800',
          'seamount',
          '#e040fb',
          'knoll',
          '#7c4dff',
          '#00e5ff',
        ],
        'circle-stroke-color': '#06121f',
        'circle-stroke-width': 1.5,
      },
    });
    contourIds.add(c);
    featureIds.add(f);
  }
  final version = packages.isEmpty ? '' : packages.first.dataset['version'] as String;
  final updated = packages.isEmpty ? null : packages.first.sourceLastModified;
  final style = {'version': 8, 'name': 'JigMap offline', 'sources': sources, 'layers': layers};
  return (
    styleJson: jsonEncode(style),
    layers: [
      OverlayLayer(
        slug: 'bathymetry-contours',
        name: 'Depth contours ($version, offline)',
        styleLayerIds: contourIds,
        dataKind: 'derived_analysis',
        description: 'From downloaded packages.',
        attribution: null,
        dataUpdatedAt: updated,
        visible: true,
        opacity: 1,
        supportsOpacity: false,
      ),
      OverlayLayer(
        slug: 'bathymetry-features',
        name: 'Drop-off & rise candidates (offline)',
        styleLayerIds: featureIds,
        dataKind: 'derived_analysis',
        description: 'Computed candidates, not verified structures.',
        attribution: null,
        dataUpdatedAt: updated,
        visible: false,
        opacity: 1,
        supportsOpacity: false,
      ),
    ],
  );
}
