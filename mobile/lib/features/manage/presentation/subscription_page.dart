import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
class SubscriptionPage extends StatefulWidget{
 const SubscriptionPage({super.key});
 @override
 State<SubscriptionPage> createState()=>_SubscriptionPageState();
}
class _SubscriptionPageState extends State<SubscriptionPage>{
 Map<String,dynamic>? _me,_data;String? _plan,_message;final _phone=TextEditingController();bool _busy=false;
 @override
 void initState(){super.initState();_load();}
 @override
 void dispose(){_phone.dispose();super.dispose();}
 Future<void> _load()async{try{final api=context.read<ApiClient>();final me=await api.get('/api/auth/me'),data=await api.get('/api/subscription-requests');if(mounted)setState((){_me=me;_data=data;});}catch(e){if(mounted)setState(()=>_message=e.toString());}}
 Future<void> _request()async{setState(()=>_busy=true);try{await context.read<ApiClient>().post('/api/subscription-requests',{'planId':_plan,'phone':_phone.text,'businessName':(_me!['tenant'] as Map)['name']});if(mounted)setState(()=>_message='تم تقديم الطلب — لا يُعد دفعاً أو موافقة');await _load();}catch(e){if(mounted)setState(()=>_message=e.toString());}finally{if(mounted)setState(()=>_busy=false);}}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('الاشتراك')),body:ListView(padding:const EdgeInsets.all(20),children:[
  if(_message!=null)Text(_message!),if(_me!=null)Text('الحالي: ${(_me!['subscription'] as Map?)?['planName']??'—'} · ${(_me!['subscription'] as Map?)?['status']??'—'} · حتى ${(_me!['subscription'] as Map?)?['endsAt']??'—'}'),
  if(_data!=null)...[
   DropdownButtonFormField<String>(value:_plan,items:(_data!['plans'] as List).map((p)=>DropdownMenuItem(value:p['id'] as String,child:Text('${p['name']} · ${p['priceMonthly']} ر.ي'))).toList(),onChanged:(v)=>setState(()=>_plan=v),decoration:const InputDecoration(labelText:'الباقة المطلوبة')),
   TextField(controller:_phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'رقم التواصل')),
   FilledButton(onPressed:_busy||_plan==null?null:_request,child:const Text('طلب تغيير / تجديد')),
   for(final r in _data!['requests'] as List)ListTile(title:Text('${r['businessName']}'),subtitle:Text('${r['status']} · ${r['createdAt']}')),
  ],
 ]));
}
