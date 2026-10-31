import 'package:flutter/material.dart';

import '../bathymetry/depth_info.dart';
import '../ui/theme.dart';
import '../util/units.dart';

const _notForNavigation =
    'NOT FOR NAVIGATION. GEBCO is a regional ~460 m grid; real depths at reefs, thilas and channels '
    'can differ by tens of metres. Use official charts and your echo sounder.';

class DepthSheet extends StatelessWidget {
  const DepthSheet({super.key, required this.info});
  final DepthInfo info;

  @override
  Widget build(BuildContext context) {
    final depth = info.depthM;
    final confidenceColour = info.isDirectMeasurement ? JigColors.good : JigColors.fair;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${formatDegreesMinutes(info.lat, isLatitude: true)}  ${formatDegreesMinutes(info.lon, isLatitude: false)}',
              style: const TextStyle(color: JigColors.muted),
            ),
            const SizedBox(height: 6),
            Text(
              depth == null ? 'Land / above sea level in grid' : '≈ ${depth.toStringAsFixed(0)} m deep',
              key: const Key('depth-value'),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
            ),
            Text(
              'Grid cell average (~${info.cellSizeM.toStringAsFixed(0)} m)'
              '${info.slopeDeg == null ? '' : ' · slope ${info.slopeDeg!.toStringAsFixed(1)}°'}',
              style: const TextStyle(color: JigColors.muted),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  info.isDirectMeasurement ? Icons.verified : Icons.info_outline,
                  size: 18,
                  color: confidenceColour,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Source here: ${info.tidLabel}'
                    '${info.isDirectMeasurement ? ' (measured)' : ' (not directly measured; lower confidence)'}',
                    key: const Key('depth-source'),
                    style: TextStyle(color: confidenceColour),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${info.datasetVersion} · historical compilation'
              '${info.sourceLastModified == null ? '' : ' · released ${info.sourceLastModified!.toUtc().toIso8601String().substring(0, 10)}'}'
              '${info.fromOfflinePackage == null ? '' : ' · from offline package'}',
              key: const Key('depth-provenance'),
              style: const TextStyle(color: JigColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            const _Warning(_notForNavigation),
          ],
        ),
      ),
    );
  }
}

class FeatureSheet extends StatelessWidget {
  const FeatureSheet({super.key, required this.info});
  final FeatureInfo info;

  @override
  Widget build(BuildContext context) {
    final facts = <String>[
      '~${info.depthM.toStringAsFixed(0)} m deep',
      if (info.reliefM != null) 'rises ~${info.reliefM!.toStringAsFixed(0)} m',
      if (info.maxSlopeDeg != null) 'slope ~${info.maxSlopeDeg!.toStringAsFixed(0)}°',
      if (info.depthRangeM != null)
        'depth ${info.depthRangeM![0].toStringAsFixed(0)}–${info.depthRangeM![1].toStringAsFixed(0)} m nearby',
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(info.title, key: const Key('feature-title'), style: Theme.of(context).textTheme.titleLarge),
            const Text(
              'Computed from the GEBCO grid · derived analysis, not a verified structure',
              style: TextStyle(color: JigColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            Text(facts.join(' · '), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Text(info.explanation, key: const Key('feature-explanation')),
            const SizedBox(height: 12),
            const _Warning(_notForNavigation),
          ],
        ),
      ),
    );
  }
}

class _Warning extends StatelessWidget {
  const _Warning(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: JigColors.poor.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: JigColors.poor.withValues(alpha: 0.5)),
    ),
    child: Text(text, style: const TextStyle(fontSize: 12)),
  );
}
