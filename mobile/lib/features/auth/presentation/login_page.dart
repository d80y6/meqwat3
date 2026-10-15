import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import 'password_page.dart';

/// Email/password login against POST /api/auth/login (same session
/// contract as the web app). Errors from the server are shown verbatim.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLoggedIn});

  final VoidCallback onLoggedIn;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'أدخل بريداً إلكترونياً صحيحاً');
      return;
    }
    if (_password.text.isEmpty) {
      setState(() => _error = 'أدخل كلمة المرور');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<ApiClient>().login(email, _password.text);
      if (!mounted) return;
      final me=await context.read<ApiClient>().get('/api/auth/me');
      if (!mounted) return;
      final user=me['user'] as Map<String,dynamic>;
      if(user['mustChangePassword']==true){
        await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>const PasswordPage(change:true)));
        if(mounted)setState(()=>_error='سجّل الدخول بكلمة المرور الجديدة');
        return;
      }
      if(user['tenantId']==null)throw ApiException('تطبيق المتجر لا يدعم حساب مدير المنصة');
      widget.onLoggedIn();
    } on ApiException catch (e) {
      if(mounted)setState(() => _error = e.message);
    } catch (_) {
      if(mounted)setState(() => _error = 'تعذّر الاتصال بالخادم — تحقق من الشبكة');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.eco,
                      size: 56, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(height: 12),
                  Text('منصة مقوات',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  const Text('تسجيل الدخول إلى متجرك'),
                  const SizedBox(height: 24),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(
                      labelText: 'البريد الإلكتروني',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(
                      labelText: 'كلمة المرور',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                  TextButton(onPressed:_loading?null:()=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>const PasswordPage())),child:const Text('نسيت كلمة المرور')),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('تسجيل الدخول'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
