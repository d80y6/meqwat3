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
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('العمليات المحلية'),actions:[IconButton(onPressed:_busy?null:()=>_sync(),icon:const Icon(Icons.sync))]),body:ListView(padding:const EdgeInsets.all(16),children:[
  const Text('المعلقة ليست فواتير مؤكدة. أصلح سبب التعارض قبل إعادة نفس العملية. لا تُعد إدخالها كعملية جديدة إذا كانت نتيجة الإرسال مجهولة.'),
  if(_error!=null)Text(_error!),
  for(final row in _rows)Card(child:ExpansionTile(title:Text(row['label'].toString()),subtitle:Text('${row['status']} · ${row['error']??''}'),children:[
   SelectableText('${row['client_mutation_id']}\n${row['payload']}'),
   if(row['status']=='conflict')TextButton(onPressed:_busy?null:()=>_sync(row['client_mutation_id'] as String),child:const Text('إعادة نفس العملية بعد معالجة السبب')),
  ])),
 ]));
}
