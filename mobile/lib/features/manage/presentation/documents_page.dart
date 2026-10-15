import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
import '../../../core/money/money.dart';
/// Read-only posted documents; corrections are explicit server-authorized returns.
class DocumentsPage extends StatefulWidget{
 const DocumentsPage({super.key,this.purchase=false,this.canReturn=false});final bool purchase,canReturn;
 @override
 State<DocumentsPage> createState()=>_DocumentsPageState();
}
class _DocumentsPageState extends State<DocumentsPage>{
 List<Map<String,dynamic>> _rows=[];String? _error;bool _loading=true;
 String get _path=>widget.purchase?'/api/purchases':'/api/sales';
 @override
 void initState(){super.initState();_load();}
 Future<void> _load()async{try{final rows=await context.read<ApiClient>().collection(_path);if(mounted)setState(()=>_rows=rows);}catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_loading=false);}}
 String _receipt(Map<String,dynamic> row)=>[
  'مقوات — ${widget.purchase?'شراء':'بيع'} #${row['invoiceNo']??row['id']}',
  '${row['saleDate']??row['purchaseDate']}',
  for(final i in row['items'] as List) '${i['productName']} · ${i['qty']} × ${i['unitPrice']??i['unitCost']} = ${i['total']}',
  'الإجمالي ${row['totalAmount']} · الخصم ${row['discount']??'0'} · المدفوع ${row['paidAmount']}',
  'المرتجع ${row['returnedAmount']??'0'}',
 ].join('\n');
 Future<void> _return(Map<String,dynamic> row)async{await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>ReturnForm(row:row,purchase:widget.purchase)));await _load();}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.purchase?'فواتير الشراء':'سجل المبيعات'),actions:[IconButton(onPressed:_load,icon:const Icon(Icons.refresh))]),body:_loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.all(12),children:[
  if(_error!=null)Text(_error!),for(final r in _rows)Card(child:ExpansionTile(title:Text('#${r['invoiceNo']??r['id']} · ${r['totalAmount']} ر.ي'),subtitle:Text('${r['customerName']??r['supplierName']??'نقدي'}'),children:[Padding(padding:const EdgeInsets.all(12),child:SelectableText(_receipt(r))),
   TextButton(onPressed:()=>Clipboard.setData(ClipboardData(text:_receipt(r))),child:const Text('نسخ الإيصال')),
   if(widget.canReturn)TextButton(onPressed:()=>_return(r),child:const Text('إرجاع بنود (لا تعديل للفاتورة الأصلية)')),
  ])),
 ]));
}
class ReturnForm extends StatefulWidget{
 const ReturnForm({super.key,required this.row,required this.purchase});final Map<String,dynamic> row;final bool purchase;
 @override
 State<ReturnForm> createState()=>_ReturnFormState();
}
class _ReturnFormState extends State<ReturnForm>{
 final _qty=<String,TextEditingController>{};String _method='debt';bool _restock=true,_busy=false;String? _error;
 @override
 void initState(){super.initState();for(final i in widget.row['items'] as List){_qty[i['id'] as String]=TextEditingController(text:'0');}}
 @override
 void dispose(){for(final c in _qty.values){c.dispose();}super.dispose();}
 Future<void> _save()async{
  setState(()=>_busy=true);
  try{final items=<Map<String,dynamic>>[];for(final entry in _qty.entries){final qty=entry.value.text;Money.line(qty,'1');if(BigInt.parse(qty.replaceAll('.',''))>BigInt.zero)items.add({(widget.purchase?'purchaseItemId':'saleItemId'):entry.key,'qty':qty,if(!widget.purchase)'restock':_restock});}
   await context.read<ApiClient>().post('/api/${widget.purchase?'purchases':'sales'}/${widget.row['id']}/return',{'items':items,'refundMethod':_method});if(mounted)Navigator.pop(context);
  }catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_busy=false);}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('مرتجع')),body:ListView(padding:const EdgeInsets.all(20),children:[
  if(_error!=null)Text(_error!),const Text('المرتجع يحتاج اتصالاً وتحقق الخادم. قيود التسوية الأصلية مطبقة.'),
  for(final i in widget.row['items'] as List)TextField(controller:_qty[i['id']],keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:'${i['productName']} — الأصل ${i['qty']} / المرتجع ${i['returnedQty']??'0'}')),
  DropdownButtonFormField(value:_method,items:const [DropdownMenuItem(value:'debt',child:Text('تخفيض الدين')),DropdownMenuItem(value:'cash',child:Text('استرداد نقدي'))],onChanged:(v)=>setState(()=>_method=v!)),
  if(!widget.purchase)SwitchListTile(value:_restock,onChanged:(v)=>setState(()=>_restock=v),title:const Text('إعادة للمخزون (أوقفه للهالك)')),
  FilledButton(onPressed:_busy?null:_save,child:const Text('تأكيد المرتجع')),
 ]));
}
