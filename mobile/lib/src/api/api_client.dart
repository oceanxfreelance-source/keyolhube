import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  /// null when the server could not be reached at all.
  final int? statusCode;
  final String message;

  bool get isNetworkError => statusCode == null;

  @override
  String toString() => statusCode == null ? message : '$message (HTTP $statusCode)';
}

/// Supplies the current access token and can refresh it once after a 401.
abstract class TokenProvider {
  String? get accessToken;
  Future<bool> refresh();
}

class ApiClient {
  ApiClient(this.config, {http.Client? httpClient, this.timeout = const Duration(seconds: 15)})
    : _http = httpClient ?? http.Client();

  final AppConfig config;
  final http.Client _http;
  final Duration timeout;
  TokenProvider? tokens;

  Future<dynamic> get(String path, {bool auth = false}) => _send('GET', path, auth: auth);

  Future<dynamic> post(String path, {Object? body, bool auth = false}) =>
      _send('POST', path, body: body, auth: auth);

  /// Returns the raw body (used for style JSON handed straight to MapLibre).
  Future<String> getRaw(String path, {bool auth = false}) async {
    final resp = await _request('GET', path, auth: auth);
    return resp.body;
  }

  /// Download binary content (signed in), reporting progress as (received, total?).
  Future<Uint8List> getBytes(String path, {bool auth = true, void Function(int, int?)? onProgress}) async {
    final req = http.Request('GET', config.api(path));
    final token = tokens?.accessToken;
    if (auth && token != null) req.headers['Authorization'] = 'Bearer $token';
    http.StreamedResponse resp;
    try {
      resp = await _http.send(req).timeout(timeout);
    } catch (_) {
      throw ApiException(null, 'Cannot reach the JigMap server (${config.apiBaseUrl})');
    }
    if (resp.statusCode == 401 && auth && tokens != null && await tokens!.refresh()) {
      return getBytes(path, auth: auth, onProgress: onProgress);
    }
    if (resp.statusCode >= 400) {
      throw ApiException(resp.statusCode, _detail(await http.Response.fromStream(resp)));
    }
    final builder = BytesBuilder(copy: false);
    var received = 0;
    await for (final chunk in resp.stream) {
      builder.add(chunk);
      received += chunk.length;
      onProgress?.call(received, resp.contentLength);
    }
    return builder.takeBytes();
  }

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = false}) async {
    final resp = await _request(method, path, body: body, auth: auth);
    if (resp.body.isEmpty) return null;
    return jsonDecode(resp.body);
  }

  Future<http.Response> _request(
    String method,
    String path, {
    Object? body,
    bool auth = false,
    bool retried = false,
  }) async {
    final req = http.Request(method, config.api(path))..headers['Accept'] = 'application/json';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final token = tokens?.accessToken;
    if (auth && token != null) req.headers['Authorization'] = 'Bearer $token';

    http.Response resp;
    try {
      resp = await http.Response.fromStream(await _http.send(req).timeout(timeout));
    } on TimeoutException {
      throw ApiException(null, 'The JigMap server did not respond in time');
    } catch (e) {
      throw ApiException(null, 'Cannot reach the JigMap server (${config.apiBaseUrl})');
    }

    if (resp.statusCode == 401 && auth && !retried && token != null && tokens != null) {
      if (await tokens!.refresh()) {
        return _request(method, path, body: body, auth: auth, retried: true);
      }
    }
    if (resp.statusCode >= 400) throw ApiException(resp.statusCode, _detail(resp));
    return resp;
  }

  static String _detail(http.Response resp) {
    try {
      final decoded = jsonDecode(resp.body);
      final detail = decoded is Map ? decoded['detail'] : null;
      if (detail is String) return detail;
      if (detail is List && detail.isNotEmpty && detail.first is Map) {
        return (detail.first as Map)['msg']?.toString() ?? 'Request failed';
      }
    } catch (_) {}
    return 'Request failed';
  }
}
