import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../location/gps_fix.dart';
import '../location/location_service.dart';
import '../util/time_format.dart';
import '../util/units.dart';
import 'theme.dart';

/// Live GNSS readout: position, accuracy, SOG, COG and fix age.
class GpsPanel extends StatefulWidget {
  const GpsPanel({super.key, required this.location});
  final LocationService location;

  @override
  State<GpsPanel> createState() => _GpsPanelState();
}

class _GpsPanelState extends State<GpsPanel> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Re-render every second so the fix age (and staleness) is always current.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.location,
      builder: (context, _) {
        final loc = widget.location;
        final now = DateTime.now().toUtc();
        final fix = loc.lastFix;
        return Container(
          key: const Key('gps-panel'),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: JigColors.panel.withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: JigColors.panelBorder),
          ),
          child: fix == null ? _statusOnly(loc) : _readout(loc, fix, now),
        );
      },
    );
  }

  Widget _statusOnly(LocationService loc) {
    // Browsers offer no API to open site settings, so on web we explain and offer a retry.
    final (String message, String? action) = switch (loc.status) {
      LocationStatus.initial || LocationStatus.checking => ('Checking location services…', null),
      LocationStatus.acquiring || LocationStatus.tracking => ('Waiting for GPS fix…', null),
      LocationStatus.serviceDisabled => (
        'Location services are turned off',
        kIsWeb ? 'Retry' : 'Open settings',
      ),
      LocationStatus.permissionDenied => ('Location permission not granted', 'Allow location'),
      LocationStatus.permissionDeniedForever =>
        kIsWeb
            ? ('Location blocked for this site. Allow it in the browser\'s site settings.', 'Retry')
            : ('Location permission blocked. Enable it in system settings.', 'Open settings'),
      LocationStatus.error => ('GPS error: ${loc.errorMessage ?? 'unknown'}', 'Retry'),
    };
    return Row(
      children: [
        Icon(Icons.gps_not_fixed, color: _qualityColor(GpsQuality.none)),
        const SizedBox(width: 12),
        Expanded(child: Text(message, key: const Key('gps-status'))),
        if (action != null)
          TextButton(
            onPressed: () => action == 'Open settings' ? loc.openSettings() : loc.start(),
            child: Text(action),
          ),
      ],
    );
  }

  Widget _readout(LocationService loc, GpsFix fix, DateTime now) {
    final quality = qualityFor(fix, now: now);
    final age = now.difference(fix.timestamp);
    final sog = fix.speedOverGroundKnots;
    final cog = fix.courseOverGround;
    final stale = quality == GpsQuality.none;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(stale ? Icons.gps_off : Icons.gps_fixed, color: _qualityColor(quality), size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                stale ? 'GPS SIGNAL LOST' : 'GPS ${quality.name.toUpperCase()}',
                key: const Key('gps-quality'),
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _qualityColor(quality),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Fix ${formatMaldivesClock(fix.timestamp)} · ${formatAge(age)}',
              key: const Key('gps-fix-time'),
              style: TextStyle(color: stale ? JigColors.none : JigColors.muted, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '${formatDegreesMinutes(fix.latitude, isLatitude: true)}   '
          '${formatDegreesMinutes(fix.longitude, isLatitude: false)}',
          key: const Key('gps-position'),
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w600,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _metric('SOG', sog == null ? '—' : '${sog.toStringAsFixed(1)} kn', key: 'gps-sog'),
            _metric('COG', cog == null ? '—' : '${cog.toStringAsFixed(0).padLeft(3, '0')}°', key: 'gps-cog'),
            _metric(
              'ACCURACY',
              fix.accuracyMetres == null ? '—' : '±${fix.accuracyMetres!.toStringAsFixed(0)} m',
              key: 'gps-accuracy',
            ),
          ],
        ),
        if (loc.status == LocationStatus.error)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Location error: ${loc.errorMessage}', style: const TextStyle(color: JigColors.poor)),
          ),
      ],
    );
  }

  Widget _metric(String label, String value, {required String key}) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: JigColors.muted, fontSize: 11, letterSpacing: 1)),
        Text(
          value,
          key: Key(key),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );

  Color _qualityColor(GpsQuality q) => switch (q) {
    GpsQuality.good => JigColors.good,
    GpsQuality.fair => JigColors.fair,
    GpsQuality.poor => JigColors.poor,
    GpsQuality.none => JigColors.none,
  };
}
