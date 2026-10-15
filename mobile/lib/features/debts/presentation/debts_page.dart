import 'dart:async';
import '../../../core/money/money.dart';
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
    builder:(_)=>_DebtPaymentDialog(bloc:context.read<DebtsBloc>(),party:party,kind:kind,label:actionLabel),
  );
}
class _DebtPaymentDialog extends StatefulWidget {
  const _DebtPaymentDialog({required this.bloc,required this.party,required this.kind,required this.label});
  final DebtsBloc bloc;
  final Map<String,dynamic> party;
  final String kind,label;
  @override
  State<_DebtPaymentDialog> createState()=>_DebtPaymentDialogState();
}
class _DebtPaymentDialogState extends State<_DebtPaymentDialog> {
  late final amountCtrl=TextEditingController(text:widget.party['balance'].toString());
  bool saving=false;
  String? error;
  @override
  void dispose(){amountCtrl.dispose();super.dispose();}
  Future<void> submit()async{
    final amount=amountCtrl.text.trim();
    try {
      if(Money.cents(amount)<=0 || Money.cents(amount)>Money.cents(widget.party['balance'].toString()))throw const FormatException();
    } catch(_) {setState(()=>error='أدخل مبلغاً موجباً لا يتجاوز الرصيد');return;}
    setState((){saving=true;error=null;});
    final saved=Completer<bool>();
    widget.bloc.add(DebtPaymentSubmitted(kind:widget.kind,partyId:widget.party['id'].toString(),amount:amount,label:'${widget.label} ${widget.party['name']} — $amount ر.ي',saved:saved));
    final accepted=await saved.future;
    if(!mounted)return;
    if(accepted){Navigator.pop(context);}
    else{setState((){saving=false;error='لم يُحفظ السداد. راجع الطابور ثم أعد المحاولة.';});}
  }
  @override
  Widget build(BuildContext context)=>PopScope(canPop:!saving,child:AlertDialog(
    title:Text('${widget.label} — ${widget.party['name']}'),
    content:TextField(controller:amountCtrl,enabled:!saving,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:'المبلغ (ر.ي)',errorText:error)),
    actions:[TextButton(onPressed:saving?null:()=>Navigator.pop(context),child:const Text('إلغاء')),FilledButton(onPressed:saving?null:submit,child:Text(saving?'جارٍ الحفظ…':widget.label))],
  ));
}
