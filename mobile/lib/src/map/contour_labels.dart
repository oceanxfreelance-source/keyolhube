import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

/// Every isobath level the server can produce (matches CONTOUR_DEPTHS_M).
const contourLevels = [
  10,
  20,
  30,
  50,
  75,
  100,
  150,
  200,
  300,
  400,
  500,
  750,
  1000,
  1500,
  2000,
  2500,
  3000,
  4000,
  5000,
];

String contourLabelImage(int depth) => 'depth-label-$depth';

/// Renders a small "100 m" label as PNG. Used as a MapLibre icon so labels need
/// no glyph/font server and work offline.
Future<Uint8List> renderContourLabel(String text, {double pixelRatio = 2}) async {
  final tp = TextPainter(
    text: TextSpan(
      text: text,
      style: const TextStyle(color: Color(0xFFE0F7FA), fontSize: 10, fontWeight: FontWeight.w600),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  final w = tp.width + 8, h = tp.height + 2;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder)..scale(pixelRatio);
  canvas.drawRRect(
    RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, w, h), const Radius.circular(3)),
    Paint()..color = const Color(0xB306121F),
  );
  tp.paint(canvas, const Offset(4, 1));
  final image = await recorder.endRecording().toImage((w * pixelRatio).ceil(), (h * pixelRatio).ceil());
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

/// Symbol-layer `icon-image` expression selecting the label for a feature's depth.
const List<Object> contourLabelExpression = [
  'concat',
  'depth-label-',
  [
    'to-string',
    ['get', 'depth_m'],
  ],
];
