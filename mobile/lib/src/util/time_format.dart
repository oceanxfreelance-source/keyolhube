/// Maldives Time (MVT) is UTC+5 all year, with no daylight saving. Times are
/// stored and transported in UTC and converted only for display.
library;

const Duration maldivesUtcOffset = Duration(hours: 5);

DateTime toMaldivesTime(DateTime instant) => instant.toUtc().add(maldivesUtcOffset);

String _two(int v) => v.toString().padLeft(2, '0');

/// `HH:mm:ss MVT`
String formatMaldivesClock(DateTime instant) {
  final t = toMaldivesTime(instant);
  return '${_two(t.hour)}:${_two(t.minute)}:${_two(t.second)} MVT';
}

/// Short human age, e.g. `3 s ago`, `4 min ago`.
String formatAge(Duration age) {
  if (age.isNegative) return 'just now';
  if (age.inSeconds < 60) return '${age.inSeconds} s ago';
  if (age.inMinutes < 60) return '${age.inMinutes} min ago';
  return '${age.inHours} h ago';
}
