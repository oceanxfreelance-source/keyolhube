/// Build-time configuration, supplied with `--dart-define`.
///
/// No provider credentials live in the app: satellite imagery keys stay on
/// the API server, which issues short-lived tile tokens.
class AppConfig {
  const AppConfig({required this.apiBaseUrl});

  /// e.g. `--dart-define=API_BASE_URL=https://api.jigmap.mv`
  /// Android emulator reaches the host machine at 10.0.2.2.
  factory AppConfig.fromEnvironment() => const AppConfig(
    apiBaseUrl: String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8000'),
  );

  final String apiBaseUrl;

  Uri api(String path) => Uri.parse('$apiBaseUrl/api/v1$path');
}
