import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/money/money.dart';
import '../../../core/api/api_client.dart';
import '../../sync/presentation/outbox_page.dart';
import '../bloc/pos_bloc.dart';
import '../bloc/pos_event.dart';
import '../bloc/pos_state.dart';

/// Daily qat POS screen: big tap targets, bilingual-independent of
/// connectivity. The amber banner distinguishes locally-pending sales from
/// server-confirmed ones at all times.
class PosPage extends StatefulWidget {
  const PosPage({super.key});

  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> {
  final _discount=TextEditingController(text:'0'),_paid=TextEditingController();
  String? _customerId,_shiftId;
  List<Map<String,dynamic>> _customers=[],_shifts=[];
  @override
  void initState(){super.initState();_choices();}
  Future<void> _choices() async {
    try {final api=context.read<ApiClient>();final customers=await api.collection('/api/customers');final shifts=await api.cachedGet('/api/shifts?status=open&limit=200');
      if(mounted)setState((){_customers=customers;_shifts=(shifts['items'] as List).cast<Map<String,dynamic>>();if(!_shifts.any((s)=>s['id']==_shiftId))_shiftId=null;if(!_customers.any((c)=>c['id']==_customerId))_customerId=null;});
    } catch(_){ /* Keep choices from this loaded session when offline. */ }
  }
  @override
  void dispose(){_discount.dispose();_paid.dispose();super.dispose();}
  String? _lastQueuedId;
  bool _submitting = false;
  final Map<String, int> _cart = {}; // productId -> qty

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('نقطة البيع'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'مزامنة الآن',
            onPressed: () => context.read<PosBloc>().add(const PosSyncRequested()),
          ),
        ],
      ),
      body: BlocConsumer<PosBloc, PosState>(
        listener: (context, state) {
          if (state.queuedId != null && state.queuedId != _lastQueuedId) {
            setState(() { _cart.clear(); _discount.text='0'; _paid.clear(); _customerId=null; _lastQueuedId = state.queuedId; _submitting = false; });
          } else if (state.status == PosStatus.failure) {
            setState(() => _submitting = false);
          }
          if (state.message != null) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message!)));
          }
        },
        builder: (context, state) {
          if (state.status == PosStatus.loading) {
            return const Center(child: CircularProgressIndicator());
          }
          return Column(
            children: [
              if (state.pendingCount > 0)
                MaterialBanner(
                  backgroundColor: Colors.amber.shade100,
                  leading: const Icon(Icons.cloud_upload_outlined),
                  content: Text('${state.pendingCount} فاتورة محلية بانتظار التأكيد من الخادم'),
                  actions: [
                    TextButton(
                      onPressed: () => context.read<PosBloc>().add(const PosSyncRequested()),
                      child: const Text('مزامنة'),
                    ),
                  ],
                ),
              if (state.conflicts.isNotEmpty)
                MaterialBanner(
                  backgroundColor: Colors.red.shade100,
                  leading: const Icon(Icons.warning_amber),
                  content: Text('${state.conflicts.length} عملية رفضها الخادم (تعارض) — راجعها مع المدير'),
                  actions: [TextButton(onPressed: () => Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>const OutboxPage())), child: const Text('عرض'))],
                ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2, childAspectRatio: 1.5, crossAxisSpacing: 10, mainAxisSpacing: 10,
                  ),
                  itemCount: state.products.length,
                  itemBuilder: (context, i) {
                    final p = state.products[i];
                    final out = p['track_stock'] == 1 && (num.tryParse(p['stock_qty'].toString()) ?? 0) <= 0;
                    return Card(
                      child: InkWell(
                        onTap: out || _submitting ? null : () => setState(() => _cart[p['id'] as String] = (_cart[p['id']] ?? 0) + 1),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p['name'].toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
                              const Spacer(),
                              Text('${p['sale_price']} ر.ي', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
                              Text(out ? 'نفد المخزون' : 'المتاح ${p['stock_qty']} ${p['unit']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              _cartBar(context, state),
            ],
          );
        },
      ),
    );
  }

  Widget _cartBar(BuildContext context, PosState state) {
    final total = _cart.entries.fold<int>(0, (sum, e) {
      final p = state.products.firstWhere(
        (x) => x['id'] == e.key,
        orElse: () => <String, Object?>{},
      );
      return sum + Money.line(e.value.toString(), p['sale_price']?.toString() ?? '0');
    });
    return SafeArea(child:Padding(padding:const EdgeInsets.all(12),child:Column(mainAxisSize:MainAxisSize.min,children:[
      if(_cart.isNotEmpty)SizedBox(height:80,child:ListView(children:_cart.entries.map((e)=>ListTile(dense:true,title:Text('${state.products.firstWhere((p)=>p['id']==e.key)['name']} × ${e.value}'),trailing:IconButton(icon:const Icon(Icons.remove_circle_outline),onPressed:_submitting?null:()=>setState(()=>_cart.remove(e.key))))).toList())),
      Row(children:[Expanded(child:DropdownButtonFormField<String>(value:_customerId,isExpanded:true,decoration:const InputDecoration(labelText:'العميل (مطلوب للآجل)'),items:[const DropdownMenuItem(value:null,child:Text('نقدي')),..._customers.map((c)=>DropdownMenuItem(value:c['id'] as String,child:Text(c['name'].toString())))],onChanged:_submitting?null:(v)=>setState(()=>_customerId=v))),
        IconButton(onPressed:_submitting?null:_choices,icon:const Icon(Icons.refresh))]),
      DropdownButtonFormField<String>(value:_shiftId,isExpanded:true,decoration:const InputDecoration(labelText:'الوردية / الصندوق'),items:[const DropdownMenuItem(value:null,child:Text('بدون وردية')),..._shifts.map((s)=>DropdownMenuItem(value:s['id'] as String,child:Text(s['registerName'].toString())))],onChanged:_submitting?null:(v)=>setState(()=>_shiftId=v)),
      Row(children:[Expanded(child:TextField(controller:_discount,enabled:!_submitting,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:const InputDecoration(labelText:'الخصم'))),const SizedBox(width:10),Expanded(child:TextField(controller:_paid,enabled:!_submitting,keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:const InputDecoration(labelText:'المدفوع (فارغ = كامل الصافي)')))]),
      Row(children:[Expanded(child:Text('الإجمالي قبل الخصم ${Money.format(total)} ر.ي')),FilledButton.icon(icon:const Icon(Icons.point_of_sale),label:const Text('إتمام البيع'),onPressed:_cart.isEmpty||_submitting?null:(){
        try {
          final discount=Money.cents(_discount.text.isEmpty?'0':_discount.text);
          if(discount>total)throw const FormatException('الخصم أكبر من الإجمالي');
          final paid=_paid.text.isEmpty?total-discount:Money.cents(_paid.text);
          if(paid>total-discount)throw const FormatException('المدفوع أكبر من الصافي');
          if(paid<total-discount&&_customerId==null)throw const FormatException('اختر العميل للبيع الآجل');
          final matches=_shifts.where((s)=>s['id']==_shiftId);final selected=matches.isEmpty?null:matches.first;
          final items=_cart.entries.map((e){final p=state.products.firstWhere((p)=>p['id']==e.key);return <String,dynamic>{'productId':e.key,'qty':e.value.toString(),'unitPrice':p['sale_price']};}).toList();
          setState(()=>_submitting=true);
          context.read<PosBloc>().add(PosCheckoutRequested(items:items,paidAmount:Money.format(paid),discount:Money.format(discount),customerId:_customerId,shiftId:selected?['id'] as String?,registerId:selected?['registerId'] as String?));
        } on FormatException catch(e){ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.message)));}
      })]),
    ])));
  }
}
