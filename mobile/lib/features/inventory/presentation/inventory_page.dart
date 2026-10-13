import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/inventory_bloc.dart';

class InventoryPage extends StatelessWidget {
  const InventoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('المخزون والهالك'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: () => context.read<InventoryBloc>().add(const InventoryRefreshRequested()),
          ),
        ],
      ),
      body: BlocConsumer<InventoryBloc, InventoryState>(
        listener: (context, state) {
          if (state.message != null) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message!)));
          }
        },
        builder: (context, state) {
          if (state.status == InventoryStatus.loading) return const Center(child: CircularProgressIndicator());
          if (state.status == InventoryStatus.failure) {
            return Center(child: Text(state.message ?? 'حدث خطأ'));
          }
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              const Text('أرصدة المخزون', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              ...state.stock.map((p) {
                final qty = num.tryParse(p['stockQty'].toString()) ?? 0;
                final low = qty <= (num.tryParse(p['lowStockThreshold'].toString()) ?? 0);
                return Card(
                  child: ListTile(
                    title: Text(p['name'].toString()),
                    subtitle: Text('التكلفة ${p['costPrice']} ر.ي • المسجل ${p['stockQty']} ${p['unit']}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Chip(
                          label: Text('$qty ${p['unit']}'),
                          backgroundColor: low ? Colors.red.shade100 : Colors.green.shade100,
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                          tooltip: 'تسجيل هالك',
                          onPressed: () => _spoilageDialog(context, p),
                        ),
                        IconButton(
                          icon: const Icon(Icons.rule, color: Colors.amber),
                          tooltip: 'جرد فعلي',
                          onPressed: () => _countDialog(context, p),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 16),
              const Text('آخر حركات المخزون', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              ...state.movements.map((m) => ListTile(
                    dense: true,
                    title: Text('${m['productName']} — ${m['type']}'),
                    trailing: Text('${m['qty']} ← ${m['balanceAfter']}'),
                  )),
            ],
          );
        },
      ),
    );
  }

  void _spoilageDialog(BuildContext context, Map<String, dynamic> product) {
    final qtyCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('تسجيل هالك — ${product['name']}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: qtyCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'الكمية (${product['unit']})'),
          ),
          const SizedBox(height: 8),
          TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'سبب (اختياري)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final qty = qtyCtrl.text.trim();
              if (qty.isNotEmpty) {
                context.read<InventoryBloc>().add(SpoilageSubmitted(productId: product['id'].toString(), qty: qty, notes: notesCtrl.text.trim().isEmpty ? null : notesCtrl.text.trim()));
              }
              Navigator.pop(dialogCtx);
            },
            child: const Text('تسجيل'),
          ),
        ],
      ),
    );
  }

  void _countDialog(BuildContext context, Map<String, dynamic> product) {
    final qtyCtrl = TextEditingController(text: product['stockQty'].toString());
    final notesCtrl = TextEditingController();
    final current = product['stockQty'].toString();
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('جرد فعلي — ${product['name']}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('المسجل حالياً: $current ${product['unit']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 8),
          TextField(
            controller: qtyCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'الكمية المعدودة (${product['unit']})'),
          ),
          const SizedBox(height: 8),
          TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'ملاحظات الجرد')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final qty = qtyCtrl.text.trim();
              if (qty.isNotEmpty) {
                context.read<InventoryBloc>().add(CountAdjustmentSubmitted(productId: product['id'].toString(), countedQty: qty, notes: notesCtrl.text.trim().isEmpty ? null : notesCtrl.text.trim()));
              }
              Navigator.pop(dialogCtx);
            },
            child: const Text('اعتماد الجرد'),
          ),
        ],
      ),
    );
  }
}
