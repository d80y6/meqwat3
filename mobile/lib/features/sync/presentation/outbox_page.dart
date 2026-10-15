import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/sync/sync_repository.dart';
class OutboxPage extends StatefulWidget {
 const OutboxPage({super.key});
 @override
 State<OutboxPage> createState()=>_OutboxPageState();
}
class _OutboxPageState extends State<OutboxPage> {
 List<Map<String,Object?>> _rows=[];bool _busy=false;String? _error;
 @override
 void initState(){super.initState();_load();}
 Future<void> _load() async {final rows=await context.read<SyncRepository>().db.allOutbox();if(mounted)setState(()=>_rows=rows);}
 Future<void> _sync([String? id]) async {
   setState(()=>_busy=true);
   try{final sync=context.read<SyncRepository>();if(id!=null)await sync.db.retryConflict(id);await sync.syncNow();await _load();}
   catch(_){if(mounted)setState(()=>_error='تعذرت المزامنة — لم يتم حذف العمليات');}
   finally{if(mounted)setState(()=>_busy=false);}
 }
 Future<void> _cancel(Map<String,Object?> row) async {
   final reason=TextEditingController();
   final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('إلغاء عملية غير مؤكدة'),content:TextField(controller:reason,decoration:const InputDecoration(labelText:'سبب الإلغاء والتصحيح')),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('رجوع')),TextButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('تحقق وألغِ'))]));
   final note=reason.text;reason.dispose();if(confirmed!=true||!mounted)return;
   setState(()=>_busy=true);
   try{final sync=context.read<SyncRepository>();final owner=sync.db.ownerKey;final result=await sync.api.post('/api/sync/cancel',{'clientMutationId':row['client_mutation_id'],'tenantId':sync.db.tenantId,'userId':sync.db.userId,'type':row['type'],'reason':note});
     if(owner!=sync.db.ownerKey)throw StateError('Session changed');
     if(result['status']=='cancelled'){await sync.db.markOutbox(row['client_mutation_id'] as String,'cancelled',note);if(mounted)setState(()=>_error='أُلغيت قبل الترحيل. يمكنك إدخال التصحيح كعملية جديدة؛ النسخة الأصلية محفوظة هنا.');}
     else{if(mounted)setState(()=>_error='العملية مسجلة على الخادم — لم تُلغَ. راجع سجل الفواتير/المدفوعات ولا تعِد إدخالها.');}
     await _load();
   }catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_busy=false);}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('العمليات المحلية'),actions:[IconButton(onPressed:_busy?null:()=>_sync(),icon:const Icon(Icons.sync))]),body:ListView(padding:const EdgeInsets.all(16),children:[
  const Text('المعلقة ليست فواتير مؤكدة. أصلح سبب التعارض قبل إعادة نفس العملية. لا تُعد إدخالها كعملية جديدة إذا كانت نتيجة الإرسال مجهولة.'),
  if(_error!=null)Text(_error!),
  for(final row in _rows)Card(child:ExpansionTile(title:Text(row['label'].toString()),subtitle:Text('${row['status']} · ${row['error']??''}'),children:[
   SelectableText('${row['client_mutation_id']}\n${row['payload']}'),
   if(row['status']!='cancelled')TextButton(onPressed:_busy?null:()=>_cancel(row),child:const Text('إلغاء غير المرحّل بأمان / إدخال تصحيح')),
   if(row['status']=='conflict')TextButton(onPressed:_busy?null:()=>_sync(row['client_mutation_id'] as String),child:const Text('إعادة نفس العملية بعد معالجة السبب')),
  ])),
 ]));
}
