import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
/// Native forms share the server's reset/change lifecycle. No tokens are persisted.
class PasswordPage extends StatefulWidget {
  const PasswordPage({super.key,this.change=false});
  final bool change;
  @override
  State<PasswordPage> createState()=>_PasswordPageState();
}
class _PasswordPageState extends State<PasswordPage> {
  final _email=TextEditingController(),_token=TextEditingController(),_current=TextEditingController(),_password=TextEditingController();
  bool _busy=false,_reset=false;String? _message;
  @override
  void dispose(){_email.dispose();_token.dispose();_current.dispose();_password.dispose();super.dispose();}
  Future<void> _submit() async {
    setState(()=>_busy=true);
    final api=context.read<ApiClient>();
    try {
      if(widget.change){await api.post('/api/auth/change-password',{'currentPassword':_current.text,'password':_password.text});api.clearSession();}
      else if(_reset){final input=_token.text.trim();final token=Uri.tryParse(input)?.queryParameters['token']??input;await api.post('/api/auth/reset-password',{'token':token,'password':_password.text});api.clearSession();}
      else {await api.post('/api/auth/forgot-password',{'email':_email.text.trim()});}
      if(mounted)setState(()=>_message=widget.change||_reset?'تم تغيير كلمة المرور — ارجع لتسجيل الدخول':'إذا كان البريد مسجلاً فستصلك تعليمات الاستعادة');
    } catch(e){if(mounted)setState(()=>_message=e is ApiException?e.message:'تعذر الاتصال');}
    finally{if(mounted)setState(()=>_busy=false);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.change?'تغيير كلمة المرور':'استعادة كلمة المرور')),body:ListView(padding:const EdgeInsets.all(20),children:[
    if(_message!=null)Text(_message!),
    if(widget.change)TextField(controller:_current,obscureText:true,decoration:const InputDecoration(labelText:'كلمة المرور الحالية')),
    if(!widget.change&&!_reset)TextField(controller:_email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'البريد الإلكتروني')),
    if(!widget.change&&_reset)TextField(controller:_token,decoration:const InputDecoration(labelText:'رابط أو رمز الاستعادة من البريد')),
    if(widget.change||_reset)TextField(controller:_password,obscureText:true,decoration:const InputDecoration(labelText:'كلمة المرور الجديدة')),
    const SizedBox(height:16),FilledButton(onPressed:_busy?null:_submit,child:Text(_busy?'جارٍ التنفيذ':'متابعة')),
    if(!widget.change)TextButton(onPressed:_busy?null:()=>setState(()=>_reset=!_reset),child:Text(_reset?'طلب رابط جديد':'لدي رابط استعادة')),
  ]));
}
