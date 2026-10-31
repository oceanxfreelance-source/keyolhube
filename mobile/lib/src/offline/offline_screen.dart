import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../ui/theme.dart';
import 'offline_repository.dart';
import 'offline_store.dart';

String _mb(int bytes) => '${(bytes / 1e6).toStringAsFixed(1)} MB';
String _day(DateTime d) => d.toUtc().toIso8601String().substring(0, 10);

/// Download bathymetry packages before going offshore.
class OfflineScreen extends StatefulWidget {
  const OfflineScreen({super.key, required this.repo, required this.auth, required this.onSignIn});

  final OfflineRepository repo;
  final AuthController auth;
  final VoidCallback onSignIn;

  @override
  State<OfflineScreen> createState() => _OfflineScreenState();
}

class _OfflineScreenState extends State<OfflineScreen> {
  List<RemotePackage>? _remote;
  String? _remoteError;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _remoteError = null);
    try {
      final list = await widget.repo.fetchAvailable();
      if (mounted) setState(() => _remote = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _remoteError = e.message);
    }
  }

  Future<void> _download(RemotePackage p) async {
    try {
      await widget.repo.download(p);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${p.name} saved for offline use')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Download failed: ${widget.repo.lastError ?? 'unknown error'}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Offline data'), backgroundColor: JigColors.panel),
      body: ListenableBuilder(
        listenable: widget.repo,
        builder: (context, _) {
          final stored = {for (final s in widget.repo.stored) s.regionSlug: s};
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Download GEBCO bathymetry (contours, depth grid for tap-for-depth, drop-off and rise '
                  'candidates) before going offshore. GPS keeps working offline. Satellite imagery is not '
                  'included: its licence does not permit offline storage.',
                  style: TextStyle(color: JigColors.muted),
                ),
                const SizedBox(height: 12),
                if (!widget.auth.isSignedIn)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.login),
                      title: const Text('Sign in to download packages'),
                      trailing: FilledButton(onPressed: widget.onSignIn, child: const Text('Sign in')),
                    ),
                  ),
                if (_remoteError != null)
                  ListTile(
                    leading: const Icon(Icons.cloud_off, color: JigColors.fair),
                    title: const Text('Server unreachable'),
                    subtitle: Text('$_remoteError\nYour downloaded packages below still work offline.'),
                    trailing: TextButton(onPressed: _refresh, child: const Text('Retry')),
                  ),
                if (_remote == null && _remoteError == null) const LinearProgressIndicator(),
                for (final p in _remote ?? <RemotePackage>[]) _remoteTile(p, stored[p.regionSlug]),
                // Stored packages the server no longer lists (or while offline).
                for (final s in widget.repo.stored)
                  if (_remote == null || !_remote!.any((r) => r.regionSlug == s.regionSlug))
                    _storedOnlyTile(s),
                if (widget.repo.lastError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(widget.repo.lastError!, style: const TextStyle(color: JigColors.poor)),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _remoteTile(RemotePackage p, StoredPackage? local) {
    final progress = widget.repo.progress[p.slug];
    final upToDate = local != null && local.sha256 == p.sha256;
    final status = upToDate
        ? 'Downloaded ${_day(local.downloadedAt)} · data released ${_day(local.dataUpdatedAt)}'
        : local != null
        ? 'Update available (yours: data ${_day(local.dataUpdatedAt)})'
        : '${_mb(p.sizeBytes)} · data released ${_day(p.dataUpdatedAt)}';
    return Card(
      key: Key('pkg-${p.regionSlug}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          children: [
            ListTile(
              leading: Icon(
                upToDate ? Icons.offline_pin : Icons.download,
                color: upToDate ? JigColors.good : null,
              ),
              title: Text(p.name),
              subtitle: Text(status),
              trailing: progress != null
                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                  : upToDate
                  ? IconButton(
                      tooltip: 'Delete',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => widget.repo.remove(local.slug),
                    )
                  : FilledButton(
                      key: Key('download-${p.regionSlug}'),
                      onPressed: widget.auth.isSignedIn ? () => _download(p) : widget.onSignIn,
                      child: Text(local != null ? 'Update' : 'Download'),
                    ),
            ),
            if (progress != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: LinearProgressIndicator(value: progress),
              ),
          ],
        ),
      ),
    );
  }

  Widget _storedOnlyTile(StoredPackage s) => Card(
    child: ListTile(
      leading: const Icon(Icons.offline_pin, color: JigColors.good),
      title: Text(s.name),
      subtitle: Text(
        'Downloaded ${_day(s.downloadedAt)} · ${s.datasetVersion}, data released '
        '${_day(s.dataUpdatedAt)}',
      ),
      trailing: IconButton(
        tooltip: 'Delete',
        icon: const Icon(Icons.delete_outline),
        onPressed: () => widget.repo.remove(s.slug),
      ),
    ),
  );
}
