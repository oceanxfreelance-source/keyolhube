import '../api/api_client.dart';
import 'overlay_layer.dart';

class BasemapInfo {
  BasemapInfo({
    required this.id,
    required this.name,
    required this.attribution,
    required this.licenceStatus,
    required this.licenceNote,
    required this.requiresSignIn,
    required this.defaultLat,
    required this.defaultLon,
    required this.defaultZoom,
    required this.layers,
  });

  factory BasemapInfo.fromConfig(Map<String, dynamic> cfg) {
    final b = cfg['basemap'] as Map<String, dynamic>;
    final r = cfg['region'] as Map<String, dynamic>;
    final c = r['default_center'] as Map<String, dynamic>;
    return BasemapInfo(
      id: b['id'] as String,
      name: b['name'] as String,
      attribution: b['attribution'] as String,
      licenceStatus: b['licence_status'] as String,
      licenceNote: b['licence_note'] as String,
      requiresSignIn: b['requires_sign_in'] as bool,
      defaultLat: (c['lat'] as num).toDouble(),
      defaultLon: (c['lon'] as num).toDouble(),
      defaultZoom: (r['default_zoom'] as num).toDouble(),
      layers: [
        for (final l in (cfg['layers'] as List? ?? const []))
          OverlayLayer.fromJson(l as Map<String, dynamic>),
      ],
    );
  }

  final String id;
  final String name;
  final String attribution;
  final String licenceStatus;
  final String licenceNote;
  final bool requiresSignIn;
  final double defaultLat;
  final double defaultLon;
  final double defaultZoom;

  /// Data overlays published by the server (bathymetry etc.), with provenance.
  final List<OverlayLayer> layers;

  bool get isDevelopmentOnly => licenceStatus == 'development_only';
}

class LoadedBasemap {
  LoadedBasemap(this.info, this.styleJson);
  final BasemapInfo info;
  final String styleJson;
}

class SignInRequired implements Exception {
  SignInRequired(this.info);
  final BasemapInfo info;
}

/// Loads the basemap configuration and MapLibre style from the JigMap API.
class BasemapRepository {
  BasemapRepository(this._api);
  final ApiClient _api;

  Future<LoadedBasemap> load({required bool signedIn}) async {
    final info = BasemapInfo.fromConfig(await _api.get('/map/config') as Map<String, dynamic>);
    if (info.requiresSignIn && !signedIn) throw SignInRequired(info);
    final style = await _api.getRaw('/map/style.json', auth: info.requiresSignIn);
    return LoadedBasemap(info, style);
  }
}
