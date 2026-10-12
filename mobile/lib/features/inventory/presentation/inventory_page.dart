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
                    subtitle: Text('التكلفة ${p['costPrice']} ر.ي'),
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
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('تسجيل هالك — ${product['name']}'),
        content: TextField(
          controller: qtyCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'الكمية (${product['unit']})'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final qty = qtyCtrl.text.trim();
              if (qty.isNotEmpty) {
                context.read<InventoryBloc>().add(SpoilageSubmitted(productId: product['id'].toString(), qty: qty));
              }
              Navigator.pop(dialogCtx);
            },
            child: const Text('تسجيل'),
          ),
        ],
      ),
    );
  }
}
