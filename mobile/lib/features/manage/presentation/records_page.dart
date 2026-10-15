import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

/// Native CRUD for master data only. Never edits posted invoices or balances.
class RecordsPage extends StatefulWidget {
 const RecordsPage({super.key,required this.resource,required this.title});
 final String resource,title;
 @override
 State<RecordsPage> createState()=>_RecordsPageState();
}
class _RecordsPageState extends State<RecordsPage> {
 List<Map<String,dynamic>> _rows=[];String _search='';String? _error;bool _loading=true;
 @override
 void initState(){super.initState();_load();}
 Future<void> _load()async{
  try{final rows=await context.read<ApiClient>().collection('/api/${widget.resource}');if(mounted)setState(()=>_rows=rows);}
  catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_loading=false);}
 }
 Future<void> _edit([Map<String,dynamic>? row])async{
  final saved=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>RecordForm(resource:widget.resource,row:row)));
  if(saved==true)await _load();
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.title),actions:[IconButton(onPressed:_load,icon:const Icon(Icons.refresh)),IconButton(onPressed:()=>_edit(),icon:const Icon(Icons.add))]),body:_loading?const Center(child:CircularProgressIndicator()):Column(children:[
  if(_error!=null)Text(_error!),TextField(decoration:const InputDecoration(labelText:'بحث في جميع النتائج المحملة'),onChanged:(s)=>setState(()=>_search=s)),
  Expanded(child:ListView(children:_rows.where((r)=>'${r['name']} ${r['email']??''} ${r['phone']??''}'.contains(_search)).map((r)=>ListTile(title:Text('${r['name']}'),subtitle:Text('${r['email']??r['phone']??''}${r['balance']!=null?' · الرصيد ${r['balance']}':''}'),trailing:const Icon(Icons.edit),onTap:()=>_edit(r))).toList())),
 ]));
}
class RecordForm extends StatefulWidget {
 const RecordForm({super.key,required this.resource,this.row});final String resource;final Map<String,dynamic>? row;
 @override
 State<RecordForm> createState()=>_RecordFormState();
}
class _RecordFormState extends State<RecordForm>{
 final _controllers=<String,TextEditingController>{};bool _busy=false;String? _error;String _role='cashier';bool _active=true;
 Map<String,String> get _fields=>switch(widget.resource){
  'products'=>{'name':'الاسم','salePrice':'سعر البيع','costPrice':'التكلفة','unit':'الوحدة',if(widget.row==null)'openingQty':'كمية افتتاحية'},
  'users'=>{'name':'الاسم',if(widget.row==null)'email':'البريد','phone':'الهاتف','password':widget.row==null?'كلمة مرور مؤقتة':'كلمة مرور جديدة (اختياري)'},
  'customers'=>{'name':'الاسم','phone':'الهاتف','address':'العنوان','creditLimit':'حد الائتمان','notes':'ملاحظات'},
  _=>{'name':'الاسم','phone':'الهاتف','address':'العنوان','notes':'ملاحظات'},
 };
 @override
 void initState(){super.initState();for(final key in _fields.keys){_controllers[key]=TextEditingController(text:widget.row?[key]?.toString()??(['salePrice','costPrice','creditLimit','openingQty'].contains(key)?'0':key=='unit'?'حزمة':''));}_role=widget.row?['role'] as String? ?? 'cashier';_active=widget.row?['isActive']!=false;}
 @override
 void dispose(){for(final c in _controllers.values){c.dispose();}super.dispose();}
 Future<void> _save()async{
  setState(()=>_busy=true);final api=context.read<ApiClient>();
  try{
   final body=<String,dynamic>{for(final e in _controllers.entries)if(e.key!='password'||e.value.text.isNotEmpty)e.key:e.value.text};
   if(widget.resource=='users')body['role']=_role;
   if(widget.row!=null&&(widget.resource=='users'||widget.resource=='products'))body['isActive']=_active;
   if(widget.row==null){await api.post('/api/${widget.resource}',body);}else{await api.patch('/api/${widget.resource}/${widget.row!['id']}',body);}
   if(mounted)Navigator.pop(context,true);
  }catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_busy=false);}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.row==null?'إضافة':'تعديل')),body:ListView(padding:const EdgeInsets.all(20),children:[
  if(_error!=null)Text(_error!),for(final e in _fields.entries)Padding(padding:const EdgeInsets.only(bottom:12),child:TextField(controller:_controllers[e.key],obscureText:e.key=='password',decoration:InputDecoration(labelText:e.value))),
  if(widget.resource=='users')DropdownButtonFormField(value:_role,items:['tenant_owner','manager','cashier'].map((r)=>DropdownMenuItem(value:r,child:Text(r))).toList(),onChanged:(v)=>setState(()=>_role=v!)),
  if(widget.row!=null&&(widget.resource=='users'||widget.resource=='products'))SwitchListTile(title:const Text('نشط'),value:_active,onChanged:(v)=>setState(()=>_active=v)),
  FilledButton(onPressed:_busy?null:_save,child:const Text('حفظ على الخادم')),
 ]));
}
