import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
import '../../../core/money/money.dart';
class CashPage extends StatefulWidget{
 const CashPage({super.key});
 @override
 State<CashPage> createState()=>_CashPageState();
}
class _CashPageState extends State<CashPage>{
 List<Map<String,dynamic>> _registers=[],_shifts=[],_expenses=[];String? _error;bool _loading=true;
 @override
 void initState(){super.initState();_load();}
 Future<void> _load()async{try{final api=context.read<ApiClient>();final regs=await api.get('/api/registers');final shifts=await api.collection('/api/shifts');final expenses=await api.collection('/api/expenses');if(mounted)setState((){_registers=(regs['registers'] as List).cast<Map<String,dynamic>>();_shifts=shifts;_expenses=expenses;});}catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_loading=false);}}
 Future<void> _form(String action,{String? path,Map<String,dynamic>? shift})async{await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>CashForm(action:action,registers:_registers,shifts:_shifts.where((s)=>s['status']=='open').toList(),shift:shift)));await _load();}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('الصناديق والورديات'),actions:[IconButton(onPressed:_load,icon:const Icon(Icons.refresh))]),body:_loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.all(16),children:[
  if(_error!=null)Text(_error!),Wrap(spacing:8,children:[FilledButton(onPressed:()=>_form('open'),child:const Text('فتح وردية')),FilledButton(onPressed:()=>_form('expense'),child:const Text('مصروف')),TextButton(onPressed:()=>_form('register'),child:const Text('صندوق جديد'))]),
  for(final s in _shifts)Card(child:ListTile(title:Text('${s['registerName']} · ${s['status']}'),subtitle:Text('الافتتاح ${s['openingCash']} · المتوقع ${s['expectedNow']??s['expectedCash']} · الفرق ${s['difference']??'—'}'),trailing:s['status']=='open'?TextButton(onPressed:()=>_form('close',shift:s),child:const Text('إغلاق')):null)),
  const Text('المصروفات — القيم الموقّعة من دفتر النقد'),for(final e in _expenses)ListTile(title:Text('${e['description']}'),trailing:Text('${e['amount']} ر.ي')),
 ]));
}
class CashForm extends StatefulWidget{
 const CashForm({super.key,required this.action,required this.registers,required this.shifts,this.shift});final String action;final List<Map<String,dynamic>> registers,shifts;final Map<String,dynamic>? shift;
 @override
 State<CashForm> createState()=>_CashFormState();
}
class _CashFormState extends State<CashForm>{
 final _amount=TextEditingController(text:'0'),_description=TextEditingController();String? _registerId,_shiftId,_error;bool _busy=false;
 @override
 void dispose(){_amount.dispose();_description.dispose();super.dispose();}
 Future<void> _save()async{
  setState(()=>_busy=true);
  try{final api=context.read<ApiClient>();final amount=Money.format(Money.cents(_amount.text));Map<String,dynamic> result;
   switch(widget.action){
    case 'register':result=await api.post('/api/registers',{'name':_description.text});break;
    case 'open':if(_registerId==null)throw const FormatException('اختر الصندوق');result=await api.post('/api/shifts',{'registerId':_registerId,'openingCash':amount});break;
    case 'close':result=await api.post('/api/shifts/${widget.shift!['id']}/close',{'countedCash':amount});break;
    default:result=await api.post('/api/expenses',{'amount':amount,'description':_description.text,'shiftId':_shiftId});
   }
   if(!mounted)return;
   if(widget.action=='close')await showDialog<void>(context:context,builder:(ctx)=>AlertDialog(title:const Text('المطابقة'),content:Text('متوقع ${result['expectedCash']} · معدود ${result['countedCash']} · فرق ${result['difference']}'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('تم'))]));
   if(mounted)Navigator.pop(context);
  }catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_busy=false);}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('حركة صندوق')),body:ListView(padding:const EdgeInsets.all(20),children:[
  if(_error!=null)Text(_error!),if(widget.shift!=null)Text('النقد المتوقع الآن ${widget.shift!['expectedNow']}'),
  if(widget.action=='open')DropdownButtonFormField<String>(value:_registerId,items:widget.registers.map((r)=>DropdownMenuItem(value:r['id'] as String,child:Text(r['name'].toString()))).toList(),onChanged:(v)=>setState(()=>_registerId=v),decoration:const InputDecoration(labelText:'الصندوق')),
  if(widget.action=='expense')DropdownButtonFormField<String>(value:_shiftId,items:[const DropdownMenuItem(value:null,child:Text('بدون وردية')),...widget.shifts.map((s)=>DropdownMenuItem(value:s['id'] as String,child:Text(s['registerName'].toString())))],onChanged:(v)=>setState(()=>_shiftId=v),decoration:const InputDecoration(labelText:'الوردية')),
  if(widget.action!='register')TextField(controller:_amount,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:widget.action=='close'?'النقد المعدود':'المبلغ')),
  if(widget.action=='register'||widget.action=='expense')TextField(controller:_description,decoration:InputDecoration(labelText:widget.action=='register'?'اسم الصندوق':'وصف المصروف')),
  FilledButton(onPressed:_busy?null:_save,child:const Text('حفظ على الخادم')),
 ]));
}
