import 'dart:math' as math;

const double earthRadiusMetres = 6371008.8;

/// A GeoJSON Polygon approximating a circle of [radiusMetres] around a point.
/// Used for the GPS accuracy ring so it scales correctly with zoom.
Map<String, dynamic> circlePolygon(double lat, double lon, double radiusMetres, {int segments = 64}) {
  final latRad = lat * math.pi / 180;
  final lonRad = lon * math.pi / 180;
  final angular = radiusMetres / earthRadiusMetres;
  final ring = <List<double>>[];
  for (var i = 0; i <= segments; i++) {
    final bearing = 2 * math.pi * i / segments;
    final pLat = math.asin(
      math.sin(latRad) * math.cos(angular) + math.cos(latRad) * math.sin(angular) * math.cos(bearing),
    );
    final pLon =
        lonRad +
        math.atan2(
          math.sin(bearing) * math.sin(angular) * math.cos(latRad),
          math.cos(angular) - math.sin(latRad) * math.sin(pLat),
        );
    ring.add([pLon * 180 / math.pi, pLat * 180 / math.pi]);
  }
  return {
    'type': 'Polygon',
    'coordinates': [ring],
  };
}

/// Great-circle distance in metres (haversine).
double distanceMetres(double lat1, double lon1, double lat2, double lon2) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLon = rad(lon2 - lon1);
  final a =
      math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLon / 2), 2);
  return 2 * earthRadiusMetres * math.asin(math.sqrt(a));
}
