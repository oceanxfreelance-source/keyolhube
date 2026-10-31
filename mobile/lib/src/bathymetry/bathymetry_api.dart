import '../api/api_client.dart';
import 'depth_info.dart';

class BathymetryApi {
  BathymetryApi(this._api);
  final ApiClient _api;

  /// Null when the point is outside the dataset coverage.
  Future<DepthInfo?> depthAt(double lat, double lon) async {
    try {
      final j = await _api.get(
        '/bathymetry/depth?lat=${lat.toStringAsFixed(6)}&lon=${lon.toStringAsFixed(6)}',
      );
      return DepthInfo.fromApi(j as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<FeatureInfo> feature(int id) async =>
      FeatureInfo.fromJson(await _api.get('/bathymetry/features/$id') as Map<String, dynamic>);
}
