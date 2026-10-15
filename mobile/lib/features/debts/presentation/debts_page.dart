import 'dart:async';
import '../../../core/money/money.dart';
import '../../../core/api/api_client.dart';
import '../../auth/bloc/auth_bloc.dart';
import 'payment_history_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/debts_bloc.dart';

class DebtsPage extends StatelessWidget {
  const DebtsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الديون والمستحقات'),
        actions: [
          IconButton(icon:const Icon(Icons.history),tooltip:'سجل السداد والتخصيص',onPressed:(){
            final auth=context.read<AuthBloc>().state;
            Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>PaymentHistoryPage(api:context.read<ApiClient>(),isOwner:auth is AuthAuthenticated&&auth.role=='tenant_owner')));
          }),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: () => context.read<DebtsBloc>().add(const DebtsRefreshRequested()),
          ),
        ],
      ),
      body: BlocConsumer<DebtsBloc, DebtsState>(
        listener: (context, state) {
          if (state.message != null) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message!)));
          }
        },
        builder: (context, state) {
          if (state.status == DebtsStatus.loading) return const Center(child: CircularProgressIndicator());
          if (state.status == DebtsStatus.failure) return Center(child: Text(state.message ?? 'حدث خطأ'));
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (state.pendingCount > 0)
                Card(
                  color: Colors.amber.shade100,
                  child: ListTile(
                    leading: const Icon(Icons.cloud_upload_outlined),
                    title: Text('${state.pendingCount} عملية محلية بانتظار التأكيد من الخادم'),
                  ),
                ),
              const Text('ديون العملاء (لنا)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              if (state.customers.isEmpty) const Text('لا توجد ديون عملاء', style: TextStyle(color: Colors.grey)),
              ...state.customers.map((c) => _partyTile(context, c, 'customer_payment', 'تحصيل')),
              const SizedBox(height: 16),
              const Text('مستحقات المورّدين (علينا)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              if (state.suppliers.isEmpty) const Text('لا توجد مستحقات مورّدين', style: TextStyle(color: Colors.grey)),
              ...state.suppliers.map((s) => _partyTile(context, s, 'supplier_payment', 'سداد')),
            ],
          );
        },
      ),
    );
  }

  Widget _partyTile(BuildContext context, Map<String, dynamic> party, String kind, String actionLabel) {
    return Card(
      child: ListTile(
        title: Text(party['name'].toString()),
        subtitle: Text(party['phone']?.toString() ?? ''),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Chip(label: Text('${party['balance']} ر.ي'), backgroundColor: Colors.amber.shade100),
            const SizedBox(width: 4),
            FilledButton.tonal(
              onPressed: () => _paymentDialog(context, party, kind, actionLabel),
              child: Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _paymentDialog(BuildContext context, Map<String, dynamic> party, String kind, String actionLabel) => showDialog<void>(
    context:context,barrierDismissible:false,
    builder:(_)=>DebtPaymentDialog(api:context.read<ApiClient>(),bloc:context.read<DebtsBloc>(),party:party,kind:kind,label:actionLabel),
  );
}
class DebtPaymentDialog extends StatefulWidget {
  const DebtPaymentDialog({super.key,required this.api,this.bloc,required this.party,required this.kind,required this.label,this.paymentId,this.amount});
  final ApiClient api;
  final DebtsBloc? bloc;
  final Map<String,dynamic> party;
  final String kind,label;
  final String? paymentId,amount;
  @override
  State<DebtPaymentDialog> createState()=>_DebtPaymentDialogState();
}
class _DebtPaymentDialogState extends State<DebtPaymentDialog> {
  late final amountCtrl=TextEditingController(text:widget.amount??widget.party['balance'].toString());
  final reason=TextEditingController();
  final selections=<String,TextEditingController>{};
  List<Map<String,dynamic>> invoices=[];
  String mode='oldest';
  bool saving=false,unreconciled=false;
  String? error,hint;
  @override
  void initState(){super.initState();loadInvoices();}
  Future<void> loadInvoices()async{
    try {
      final data=await widget.api.cachedGet('/api/payments/invoices?kind=${widget.kind}&partyId=${widget.party['id']}');
      if(!mounted)return;
      setState((){invoices=(data['items'] as List).cast<Map<String,dynamic>>();unreconciled=data['reconciled']!=true;});
    } catch(_){if(mounted)setState(()=>hint='الفواتير غير متاحة؛ التخصيص التلقائي يتم عند المزامنة');}
  }
  @override
  void dispose(){amountCtrl.dispose();reason.dispose();for(final c in selections.values){c.dispose();}super.dispose();}
  Future<void> submit()async{
    final amount=amountCtrl.text.trim();
    List<Map<String,dynamic>>? allocations;
    try {
      if(Money.cents(amount)<=0 || (widget.paymentId==null && Money.cents(amount)>Money.cents(widget.party['balance'].toString())))throw const FormatException('أدخل مبلغاً موجباً لا يتجاوز الرصيد');
      if(mode=='manual'){
        allocations=selections.entries.where((e)=>e.value.text.trim().isNotEmpty&&Money.cents(e.value.text)>0).map((e)=><String,dynamic>{'invoiceId':e.key,'amount':e.value.text.trim()}).toList();
        if(allocations.fold<BigInt>(BigInt.zero,(s,a)=>s+BigInt.from(Money.cents(a['amount'] as String)))!=BigInt.from(Money.cents(amount)))throw const FormatException('مجموع التخصيصات يجب أن يساوي السداد');
      }
      if(widget.paymentId!=null && reason.text.trim().isEmpty)throw const FormatException('سبب المراجعة مطلوب');
    } on FormatException catch(e){setState(()=>error=e.message);return;}
    setState((){saving=true;error=null;});
    if(widget.paymentId!=null){
      try{await widget.api.post('/api/payments/${widget.paymentId}/allocate',{'allocationMode':mode,if(allocations!=null)'allocations':allocations,'reason':reason.text.trim()});if(mounted)Navigator.pop(context);}
      catch(e){if(mounted)setState((){saving=false;error=e.toString();});}
      return;
    }
    final saved=Completer<bool>();
    widget.bloc!.add(DebtPaymentSubmitted(kind:widget.kind,partyId:widget.party['id'].toString(),amount:amount,label:'${widget.label} ${widget.party['name']} — $amount ر.ي',saved:saved,allocationMode:mode,allocations:allocations));
    final accepted=await saved.future;
    if(!mounted)return;
    if(accepted){Navigator.pop(context);}
    else{setState((){saving=false;error='لم يُحفظ السداد. راجع الطابور ثم أعد المحاولة.';});}
  }
  @override
  Widget build(BuildContext context)=>PopScope(canPop:!saving,child:AlertDialog(
    title:Text('${widget.label} — ${widget.party['name']}'),
    content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
      if(hint!=null)Text(hint!),
      if(unreconciled&&widget.paymentId==null)const Text('الرصيد لا يطابق الفواتير؛ راجع تخصيص المدفوعات التاريخية أولاً.'),
      TextField(controller:amountCtrl,enabled:!saving&&widget.paymentId==null,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:'المبلغ (ر.ي)',errorText:error)),
      DropdownButtonFormField<String>(value:mode,decoration:const InputDecoration(labelText:'تخصيص الفواتير'),items:const [DropdownMenuItem(value:'oldest',child:Text('الأقدم أولاً')),DropdownMenuItem(value:'manual',child:Text('اختيار يدوي'))],onChanged:saving?null:(v)=>setState(()=>mode=v!)),
      if(mode=='manual')for(final invoice in invoices.where((i)=>!i['outstanding'].toString().startsWith('-')&&Money.cents(i['outstanding'].toString())>0))TextField(controller:selections.putIfAbsent(invoice['id'] as String,()=>TextEditingController()),enabled:!saving,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:'فاتورة ${invoice['number']}',helperText:'المتبقي ${invoice['outstanding']}')),
      if(widget.paymentId!=null)TextField(controller:reason,maxLength:500,enabled:!saving,decoration:const InputDecoration(labelText:'سبب المراجعة / مرجع المستند')),
    ])),
    actions:[TextButton(onPressed:saving?null:()=>Navigator.pop(context),child:const Text('إلغاء')),FilledButton(onPressed:saving||(unreconciled&&widget.paymentId==null)?null:submit,child:Text(saving?'جارٍ الحفظ…':widget.label))],
  ));
}
