/// Unit conversions and formatting used across navigation displays.
library;

const double metresPerSecondToKnots = 1.9438444924406; // 3600 / 1852

double knotsFromMetresPerSecond(double mps) => mps * metresPerSecondToKnots;

/// Formats a decimal-degree coordinate as degrees and decimal minutes,
/// the convention used on marine GPS units, e.g. `4°10.530'N`.
String formatDegreesMinutes(double value, {required bool isLatitude}) {
  final hemisphere = isLatitude ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  final abs = value.abs();
  var degrees = abs.floor();
  var minutes = (abs - degrees) * 60;
  if (double.parse(minutes.toStringAsFixed(3)) >= 60) {
    degrees += 1;
    minutes = 0;
  }
  final degWidth = isLatitude ? 2 : 3;
  return '${degrees.toString().padLeft(degWidth, '0')}°${minutes.toStringAsFixed(3).padLeft(6, '0')}\'$hemisphere';
}
