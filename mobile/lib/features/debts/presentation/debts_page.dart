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

  void _paymentDialog(BuildContext context, Map<String, dynamic> party, String kind, String actionLabel) {
    final amountCtrl = TextEditingController(text: party['balance'].toString());
    showDialog<void>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('$actionLabel — ${party['name']}'),
        content: TextField(
          controller: amountCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'المبلغ (ر.ي)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () {
              final amount = amountCtrl.text.trim();
              if (amount.isNotEmpty) {
                context.read<DebtsBloc>().add(DebtPaymentSubmitted(
                      kind: kind,
                      partyId: party['id'].toString(),
                      amount: amount,
                      label: '$actionLabel ${party['name']} — $amount ر.ي',
                    ));
              }
              Navigator.pop(dialogCtx);
            },
            child: Text(actionLabel),
          ),
        ],
      ),
    );
  }
}
