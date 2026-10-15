import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import 'debts_page.dart' show DebtPaymentDialog;

class PaymentHistoryPage extends StatefulWidget {
 const PaymentHistoryPage({super.key,required this.api,required this.isOwner});
 final ApiClient api;
 final bool isOwner;
 @override
 State<PaymentHistoryPage> createState()=>_PaymentHistoryPageState();
}
class _PaymentHistoryPageState extends State<PaymentHistoryPage> {
 late Future<List<Map<String,dynamic>>> rows=widget.api.collection('/api/payments');
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('سجل السداد والتخصيص'),actions:[IconButton(onPressed:()=>setState(()=>rows=widget.api.collection('/api/payments')),icon:const Icon(Icons.refresh))]),body:FutureBuilder(future:rows,builder:(context,snapshot){
  if(snapshot.hasError)return Center(child:Text(snapshot.error.toString()));
  if(!snapshot.hasData)return const Center(child:CircularProgressIndicator());
  return ListView(children:snapshot.data!.map((p)=>ListTile(title:Text('${p['partyName']??p['kind']} — ${p['amount']} ر.ي'),subtitle:Text('${p['kind']} • ${p['createdAt']}'),onTap:()=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>_PaymentDetail(api:widget.api,id:p['id'] as String,isOwner:widget.isOwner))))).toList());
 }));
}
class _PaymentDetail extends StatefulWidget {
 const _PaymentDetail({required this.api,required this.id,required this.isOwner});
 final ApiClient api;
 final String id;
 final bool isOwner;
 @override
 State<_PaymentDetail> createState()=>_PaymentDetailState();
}
class _PaymentDetailState extends State<_PaymentDetail> {
 late Future<Map<String,dynamic>> data=widget.api.cachedGet('/api/payments/${widget.id}');
 final reason=TextEditingController();
 bool busy=false;
 @override
 void dispose(){reason.dispose();super.dispose();}
 Future<void> reverse()async{
  setState(()=>busy=true);
  try{await widget.api.post('/api/payments/${widget.id}/reverse',{'reason':reason.text.trim()});if(mounted)setState(()=>data=widget.api.get('/api/payments/${widget.id}'));}
  catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString())));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('تفاصيل السداد')),body:FutureBuilder(future:data,builder:(context,snapshot){
  if(snapshot.hasError)return Center(child:Text(snapshot.error.toString()));
  if(!snapshot.hasData)return const Center(child:CircularProgressIndicator());
  final d=snapshot.data!,p=d['payment'] as Map<String,dynamic>,allocations=d['allocations'] as List;
  final eligible=['customer_payment','supplier_payment'].contains(p['kind'])&&p['saleId']==null&&p['purchaseId']==null&&d['reversal']==null;
  return ListView(padding:const EdgeInsets.all(16),children:[
   Text('${p['amount']} ر.ي • ${p['method']}'),Text('${p['notes']??''}'),
   if(d['reversal']!=null)const Text('السداد معكوس؛ الأصل محفوظ'),
   for(final a in allocations)ListTile(title:Text('فاتورة ${a['saleId']??a['purchaseId']}'),subtitle:Text('${a['amount']} ر.ي')),
   if(eligible&&allocations.isEmpty)const Text('سداد تاريخي غير مخصص؛ يلزم توثيق مراجعة المالك'),
   if(eligible&&allocations.isEmpty&&widget.isOwner)FilledButton(onPressed:()async{
    await showDialog<void>(context:context,barrierDismissible:false,builder:(_)=>DebtPaymentDialog(api:widget.api,party:{'id':p['customerId']??p['supplierId'],'name':'مراجعة تاريخية','balance':'0'},kind:p['kind'] as String,label:'تخصيص سداد تاريخي',paymentId:widget.id,amount:p['amount'] as String));
    if(mounted)setState(()=>data=widget.api.get('/api/payments/${widget.id}'));
   },child:const Text('مراجعة التخصيص')),
   if(eligible&&allocations.isNotEmpty)...[
    const Text('العكس قيد جديد الآن، ولا يعدل وردية سابقة. لا تعكس سداداً استُخدم لمرتجع.'),
    TextField(controller:reason,enabled:!busy,maxLength:500,decoration:const InputDecoration(labelText:'سبب العكس')),
    FilledButton(onPressed:busy?null:reverse,child:Text(busy?'جارٍ الحفظ…':'عكس السداد بالكامل')),
   ],
  ]);
 }));
}
