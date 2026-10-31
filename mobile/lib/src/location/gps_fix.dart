import '../util/units.dart';

/// A single position fix from the device's GNSS receiver.
///
/// Fields that the platform did not report (or reported as invalid) are null,
/// so the UI can show "—" instead of a misleading zero.
class GpsFix {
  const GpsFix({
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    this.accuracyMetres,
    this.speedMetresPerSecond,
    this.courseDegrees,
    this.altitudeMetres,
  });

  final double latitude;
  final double longitude;
  final DateTime timestamp; // UTC
  final double? accuracyMetres;
  final double? speedMetresPerSecond;
  final double? courseDegrees; // course over ground, true north
  final double? altitudeMetres;

  /// Below this speed, GNSS course is dominated by noise and is not shown.
  static const double minSpeedForCourseKnots = 0.5;

  double? get speedOverGroundKnots =>
      speedMetresPerSecond == null ? null : knotsFromMetresPerSecond(speedMetresPerSecond!);

  double? get courseOverGround {
    final sog = speedOverGroundKnots;
    if (courseDegrees == null || sog == null || sog < minSpeedForCourseKnots) return null;
    return courseDegrees;
  }

  /// Build from raw platform values, discarding sentinel/invalid readings
  /// (negative or NaN values are how platforms signal "unavailable").
  factory GpsFix.fromRaw({
    required double latitude,
    required double longitude,
    required DateTime timestamp,
    double? accuracy,
    double? speed,
    double? heading,
    double? altitude,
    bool altitudeValid = true,
  }) {
    double? valid(double? v, {double min = 0, double? maxExclusive}) {
      if (v == null || v.isNaN || v.isInfinite || v < min) return null;
      if (maxExclusive != null && v >= maxExclusive) return null;
      return v;
    }

    return GpsFix(
      latitude: latitude,
      longitude: longitude,
      timestamp: timestamp.toUtc(),
      accuracyMetres: valid(accuracy),
      speedMetresPerSecond: valid(speed),
      courseDegrees: valid(heading, maxExclusive: 360),
      altitudeMetres: altitudeValid && altitude != null && !altitude.isNaN ? altitude : null,
    );
  }
}

enum GpsQuality { none, poor, fair, good }

GpsQuality qualityFor(GpsFix? fix, {required DateTime now}) {
  if (fix == null) return GpsQuality.none;
  if (now.difference(fix.timestamp) > const Duration(seconds: 15)) return GpsQuality.none;
  final acc = fix.accuracyMetres;
  if (acc == null || acc > 50) return GpsQuality.poor;
  if (acc > 15) return GpsQuality.fair;
  return GpsQuality.good;
}
