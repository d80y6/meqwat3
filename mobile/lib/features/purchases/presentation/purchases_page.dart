import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/purchases_bloc.dart';

class PurchasesPage extends StatefulWidget {
  const PurchasesPage({super.key});
  @override State<PurchasesPage> createState() => _PurchasesPageState();
}

class _PurchasesPageState extends State<PurchasesPage> {
  String? _supplierId;
  final List<Map<String, String>> _lines = [{'productId': '', 'qty': '1', 'unitCost': ''}];
  final _paid = TextEditingController(text: '0');
  final _notes = TextEditingController();

  @override void dispose() { _paid.dispose(); _notes.dispose(); super.dispose(); }

  @override Widget build(BuildContext context) {
    return BlocConsumer<PurchasesBloc, PurchasesState>(
      listener: (context, s) { if (s.message != null) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.message!))); },
      builder: (context, state) {
        if (state.status == PurchasesStatus.loading) return const Center(child: CircularProgressIndicator());
        if (state.status == PurchasesStatus.failure) return Center(child: Text(state.message ?? 'خطأ'));
        return Scaffold(
          appBar: AppBar(
            title: const Text('المشتريات'),
            actions: [
              if (state.pendingCount > 0) Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Chip(label: Text('${state.pendingCount} معلّقة'), backgroundColor: Colors.amber.shade100)),
              IconButton(icon: const Icon(Icons.sync), onPressed: () => context.read<PurchasesBloc>().add(const PurchasesSyncRequested())),
              IconButton(icon: const Icon(Icons.refresh), onPressed: () => context.read<PurchasesBloc>().add(const PurchasesRefreshed())),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Card(child: ExpansionTile(title: const Text('فاتورة شراء جديدة'), children: [
                Padding(padding: const EdgeInsets.all(12), child: Column(children: [
                  DropdownButtonFormField<String>(value: _supplierId, decoration: const InputDecoration(labelText: 'المورّد'), items: state.suppliers.map((s) => DropdownMenuItem(value: s['id'] as String, child: Text(s['name'] as String))).toList(), onChanged: (v) => setState(() => _supplierId = v)),
                  const SizedBox(height: 8),
                  ..._lines.asMap().entries.map((e) {
                    final i = e.key; final l = e.value;
                    return Row(children: [
                      Expanded(flex: 3, child: DropdownButtonFormField<String>(value: l['productId']!.isEmpty ? null : l['productId'], hint: const Text('الصنف'), items: state.products.map((p) => DropdownMenuItem(value: p['id'] as String, child: Text(p['name'] as String, overflow: TextOverflow.ellipsis))).toList(), onChanged: (v) => setState(() => _lines[i]['productId'] = v ?? ''))),
                      const SizedBox(width: 6),
                      Expanded(child: TextFormField(initialValue: l['qty'], decoration: const InputDecoration(labelText: 'الكمية'), keyboardType: TextInputType.number, onChanged: (v) => _lines[i]['qty'] = v)),
                      const SizedBox(width: 6),
                      Expanded(child: TextFormField(initialValue: l['unitCost'], decoration: const InputDecoration(labelText: 'السعر'), keyboardType: TextInputType.number, onChanged: (v) => _lines[i]['unitCost'] = v)),
                      IconButton(icon: const Icon(Icons.delete, color: Colors.red), onPressed: () => setState(() => _lines.removeAt(i))),
                    ]);
                  }),
                  Align(alignment: Alignment.centerRight, child: TextButton.icon(icon: const Icon(Icons.add), label: const Text('إضافة بند'), onPressed: () => setState(() => _lines.add({'productId': '', 'qty': '1', 'unitCost': ''})))),
                  TextFormField(controller: _paid, decoration: const InputDecoration(labelText: 'المدفوع الآن (ر.ي)'), keyboardType: TextInputType.number),
                  TextFormField(controller: _notes, decoration: const InputDecoration(labelText: 'ملاحظات')),
                  const SizedBox(height: 12),
                  SizedBox(width: double.infinity, child: FilledButton(onPressed: state.status == PurchasesStatus.saving ? null : () {
                    if (_supplierId == null) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اختر المورّد'))); return; }
                    final valid = _lines.where((l) => l['productId']!.isNotEmpty && (num.tryParse(l['qty']!) ?? 0) > 0).toList();
                    if (valid.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('أضف صنفاً واحداً على الأقل'))); return; }
                    context.read<PurchasesBloc>().add(PurchaseQueued(supplierId: _supplierId!, items: valid, paidAmount: _paid.text, notes: _notes.text.isEmpty ? null : _notes.text));
                    setState(() { _lines..clear()..add({'productId': '', 'qty': '1', 'unitCost': ''}); _paid.text = '0'; _notes.clear(); });
                  }, child: const Text('حفظ فاتورة الشراء (حتى دون اتصال)'))),
                  const SizedBox(height: 4),
                  const Text('حتى دون اتصال تُحفظ الفاتورة بمعرّف ثابت وتُزامَن تلقائياً — تمنع التكرار.', style: TextStyle(fontSize: 11, color: Colors.grey)),
                ])),
              ])),
              const SizedBox(height: 12),
              const Text('آخر فواتير الشراء', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              if (state.purchases.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('لا توجد مشتريات بعد'))),
              ...state.purchases.map((p) => Card(child: ListTile(title: Text(p['supplierName'] as String), subtitle: Text('${p['totalAmount']} ر.ي — المدفوع ${p['paidAmount']} — المتبقي ${p['remaining']}'), trailing: Text((p['purchaseDate'] as String).substring(0, 10))))),
            ],
          ),
        );
      },
    );
  }
}
