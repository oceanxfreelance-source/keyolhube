# JigMap Maldives: Flutter app

See the [root README](../README.md) for setup. Quick reference:

```bash
flutter pub get
```

```bash
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=http://localhost:8000
```

```bash
flutter analyze && flutter test
```

`API_BASE_URL` is the only build-time setting. No provider credentials are ever compiled into the app.
