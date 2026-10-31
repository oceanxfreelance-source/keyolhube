import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'auth_controller.dart';

/// Sign in / create account / signed-in profile.
class AccountSheet extends StatefulWidget {
  const AccountSheet({super.key, required this.auth});
  final AuthController auth;

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _registering = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_registering) {
        await widget.auth.register(_email.text.trim(), _password.text, fullName: _name.text.trim());
      } else {
        await widget.auth.signIn(_email.text.trim(), _password.text);
      }
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: user != null ? _profile(user) : _signInForm(),
    );
  }

  Widget _profile(UserProfile user) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        user.fullName?.isNotEmpty == true ? user.fullName! : user.email,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 4),
      Text('${user.email} · ${user.role}', key: const Key('account-email')),
      const SizedBox(height: 24),
      FilledButton.tonal(
        key: const Key('sign-out'),
        onPressed: () async {
          await widget.auth.signOut();
          if (mounted) Navigator.of(context).pop();
        },
        child: const Text('Sign out'),
      ),
    ],
  );

  Widget _signInForm() => Form(
    key: _form,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _registering ? 'Create your JigMap account' : 'Sign in to JigMap',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        if (_registering)
          TextFormField(
            key: const Key('field-name'),
            controller: _name,
            decoration: const InputDecoration(labelText: 'Name (optional)'),
          ),
        TextFormField(
          key: const Key('field-email'),
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(labelText: 'Email'),
          validator: (v) => v != null && RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())
              ? null
              : 'Enter a valid email',
        ),
        TextFormField(
          key: const Key('field-password'),
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'Password',
            helperText: _registering ? 'At least 10 characters' : null,
          ),
          validator: (v) => (v == null || v.isEmpty)
              ? 'Enter your password'
              : (_registering && v.length < 10)
              ? 'At least 10 characters'
              : null,
          onFieldSubmitted: (_) => _submit(),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              _error!,
              key: const Key('auth-error'),
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        const SizedBox(height: 20),
        FilledButton(
          key: const Key('auth-submit'),
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(_registering ? 'Create account' : 'Sign in'),
        ),
        TextButton(
          key: const Key('auth-toggle'),
          onPressed: _busy ? null : () => setState(() => _registering = !_registering),
          child: Text(_registering ? 'I already have an account' : 'Create an account'),
        ),
      ],
    ),
  );
}
