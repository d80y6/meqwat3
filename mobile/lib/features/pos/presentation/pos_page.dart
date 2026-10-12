import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

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
                  actions: [TextButton(onPressed: () {}, child: const Text('عرض'))],
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
                        onTap: out ? null : () => setState(() => _cart[p['id'] as String] = (_cart[p['id']] ?? 0) + 1),
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
    final total = _cart.entries.fold<num>(0, (sum, e) {
      final p = state.products.firstWhere((x) => x['id'] == e.key, orElse: () => const {});
      return sum + e.value * (num.tryParse(p['sale_price']?.toString() ?? '0') ?? 0);
    });
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(child: Text('السلة: ${_cart.length} صنف — الإجمالي $total ر.ي')),
            FilledButton.icon(
              icon: const Icon(Icons.point_of_sale),
              label: const Text('إتمام البيع'),
              onPressed: _cart.isEmpty
                  ? null
                  : () {
                      final items = _cart.entries.map((e) {
                        final p = state.products.firstWhere((x) => x['id'] == e.key);
                        return {'productId': e.key, 'qty': e.value.toString(), 'unitPrice': p['sale_price']};
                      }).toList();
                      context.read<PosBloc>().add(PosCheckoutRequested(items: items, paidAmount: total.toString()));
                      setState(_cart.clear);
                    },
            ),
          ],
        ),
      ),
    );
  }
}
