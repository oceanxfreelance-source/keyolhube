import 'package:flutter/material.dart';

import '../ui/theme.dart';
import 'overlay_layer.dart';

String _date(DateTime? d) => d == null
    ? 'unknown'
    : '${d.toUtc().year}-${d.toUtc().month.toString().padLeft(2, '0')}-${d.toUtc().day.toString().padLeft(2, '0')}';

class LayersSheet extends StatefulWidget {
  const LayersSheet({super.key, required this.layers, required this.onChanged, required this.offline});

  final List<OverlayLayer> layers;
  final void Function(OverlayLayer) onChanged;
  final bool offline;

  @override
  State<LayersSheet> createState() => _LayersSheetState();
}

class _LayersSheetState extends State<LayersSheet> {
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Text('Map layers', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            widget.offline
                ? 'Offline: showing downloaded data only. Satellite imagery is not available offline.'
                : 'Bathymetry is GEBCO regional data (~460 m cells). Not for navigation.',
            style: const TextStyle(color: JigColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          if (widget.layers.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('No data layers are available yet (bathymetry not ingested on the server).'),
            ),
          for (final l in widget.layers) _tile(l),
        ],
      ),
    );
  }

  Widget _tile(OverlayLayer l) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          key: Key('layer-${l.slug}'),
          contentPadding: EdgeInsets.zero,
          title: Text(l.name),
          subtitle: Text(
            '${dataKindLabel(l.dataKind)} · source data ${_date(l.dataUpdatedAt)}'
            '${l.description == null ? '' : '\n${l.description}'}',
            style: const TextStyle(fontSize: 12, color: JigColors.muted),
          ),
          value: l.visible,
          onChanged: (v) {
            setState(() => l.visible = v);
            widget.onChanged(l);
          },
        ),
        if (l.supportsOpacity && l.visible)
          Row(
            children: [
              const Text('Opacity', style: TextStyle(fontSize: 12, color: JigColors.muted)),
              Expanded(
                child: Slider(
                  key: Key('opacity-${l.slug}'),
                  value: l.opacity,
                  min: 0.1,
                  max: 1,
                  divisions: 9,
                  label: '${(l.opacity * 100).round()}%',
                  onChanged: (v) {
                    setState(() => l.opacity = v);
                    widget.onChanged(l);
                  },
                ),
              ),
            ],
          ),
      ],
    ),
  );
}
