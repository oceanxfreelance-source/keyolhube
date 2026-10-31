import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';

class UserProfile {
  UserProfile({required this.id, required this.email, required this.role, this.fullName});

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
    id: j['id'] as String,
    email: j['email'] as String,
    role: j['role'] as String,
    fullName: j['full_name'] as String?,
  );

  final String id;
  final String email;
  final String role;
  final String? fullName;
}

/// Persists the refresh token in platform secure storage (Keychain / Keystore).
/// The access token is kept in memory only.
class AuthController extends ChangeNotifier implements TokenProvider {
  AuthController(this._api, {FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage() {
    _api.tokens = this;
  }

  static const _refreshKey = 'jigmap.refresh_token';

  final ApiClient _api;
  final FlutterSecureStorage _storage;

  String? _accessToken;
  UserProfile? user;
  bool restoring = true;

  bool get isSignedIn => user != null;

  @override
  String? get accessToken => _accessToken;

  /// Restore a previous session at startup. Network failure leaves the user
  /// signed out for now without discarding the stored refresh token.
  Future<void> restore() async {
    try {
      if (await _storage.read(key: _refreshKey) != null && await refresh()) {
        await _loadProfile();
      }
    } catch (_) {
      // Stay signed out; the token is retained for the next attempt.
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<void> register(String email, String password, {String? fullName}) async {
    await _api.post(
      '/auth/register',
      body: {
        'email': email,
        'password': password,
        if (fullName != null && fullName.isNotEmpty) 'full_name': fullName,
      },
    );
    await signIn(email, password);
  }

  Future<void> signIn(String email, String password) async {
    final tokens = await _api.post('/auth/login', body: {'email': email, 'password': password});
    await _store(tokens as Map<String, dynamic>);
    await _loadProfile();
    notifyListeners();
  }

  Future<void> signOut() async {
    final refreshToken = await _storage.read(key: _refreshKey);
    if (refreshToken != null) {
      try {
        await _api.post('/auth/logout', body: {'refresh_token': refreshToken});
      } on ApiException {
        // Revocation failed (e.g. offline); local sign-out still proceeds.
      }
    }
    await _storage.delete(key: _refreshKey);
    _accessToken = null;
    user = null;
    notifyListeners();
  }

  @override
  Future<bool> refresh() async {
    final refreshToken = await _storage.read(key: _refreshKey);
    if (refreshToken == null) return false;
    try {
      final tokens = await _api.post('/auth/refresh', body: {'refresh_token': refreshToken});
      await _store(tokens as Map<String, dynamic>);
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await _storage.delete(key: _refreshKey);
        _accessToken = null;
        user = null;
        notifyListeners();
      }
      return false;
    }
  }

  Future<void> _store(Map<String, dynamic> tokens) async {
    _accessToken = tokens['access_token'] as String;
    await _storage.write(key: _refreshKey, value: tokens['refresh_token'] as String);
  }

  Future<void> _loadProfile() async {
    final me = await _api.get('/auth/me', auth: true);
    user = UserProfile.fromJson(me as Map<String, dynamic>);
  }
}
