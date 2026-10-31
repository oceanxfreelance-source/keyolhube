import 'dart:math' as math;

import '../util/geo.dart';

const double metresPerNauticalMile = 1852.0;

/// Initial great-circle bearing from point 1 to point 2, degrees true (0..360).
double initialBearing(double lat1, double lon1, double lat2, double lon2) {
  double rad(double d) => d * math.pi / 180;
  final y = math.sin(rad(lon2 - lon1)) * math.cos(rad(lat2));
  final x =
      math.cos(rad(lat1)) * math.sin(rad(lat2)) -
      math.sin(rad(lat1)) * math.cos(rad(lat2)) * math.cos(rad(lon2 - lon1));
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// A multi-point distance measurement drawn on the map.
class Measurement {
  final List<(double lat, double lon)> points = [];

  void add(double lat, double lon) => points.add((lat, lon));

  void undo() {
    if (points.isNotEmpty) points.removeLast();
  }

  void clear() => points.clear();

  double get totalMetres {
    var total = 0.0;
    for (var i = 1; i < points.length; i++) {
      total += distanceMetres(points[i - 1].$1, points[i - 1].$2, points[i].$1, points[i].$2);
    }
    return total;
  }

  double? get lastLegBearing {
    if (points.length < 2) return null;
    final a = points[points.length - 2], b = points.last;
    return initialBearing(a.$1, a.$2, b.$1, b.$2);
  }

  Map<String, dynamic> toGeoJson() => {
    'type': 'FeatureCollection',
    'features': [
      if (points.length >= 2)
        {
          'type': 'Feature',
          'properties': <String, dynamic>{},
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              for (final p in points) [p.$2, p.$1],
            ],
          },
        },
      for (final p in points)
        {
          'type': 'Feature',
          'properties': <String, dynamic>{},
          'geometry': {
            'type': 'Point',
            'coordinates': [p.$2, p.$1],
          },
        },
    ],
  };
}

String formatDistance(double metres) {
  final nm = metres / metresPerNauticalMile;
  final km = metres / 1000;
  if (metres < 1000) return '${nm.toStringAsFixed(2)} NM · ${metres.toStringAsFixed(0)} m';
  return '${nm.toStringAsFixed(nm < 10 ? 2 : 1)} NM · ${km.toStringAsFixed(km < 10 ? 2 : 1)} km';
}
