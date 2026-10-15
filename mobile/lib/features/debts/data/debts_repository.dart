import 'dart:convert';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/money/money.dart';
import '../../../core/database/app_database.dart';

/// Debts & liabilities. Payments are queued through the same outbox as
/// sales (type "payment") so debt collection works offline and syncs
/// idempotently — the cashier sees them as pending until confirmed.
class DebtsRepository {
  DebtsRepository({required this.api, required this.db});

  final ApiClient api;
  final AppDatabase db;
  final _uuid = const Uuid();

  Future<({List<Map<String, dynamic>> customers, List<Map<String, dynamic>> suppliers})> fetchDebtors() async {
    final c = await api.collection('/api/customers?debt=1');
    final s = await api.collection('/api/suppliers?debt=1');
    return (
      customers: c,
      suppliers: s,
    );
  }

  Future<String> queuePayment({
    required String kind, // customer_payment | supplier_payment
    String? customerId,
    String? supplierId,
    required String amount,
    required String label,
    String? allocationMode,List<Map<String,dynamic>>? allocations,
  }) async {
    if(Money.cents(amount)<=0)throw const FormatException('المبلغ يجب أن يكون موجباً');
    final mutationId = _uuid.v4();
    await db.enqueueOutbox({
      'client_mutation_id': mutationId,
      'type': 'payment',
      'payload': jsonEncode({
        'kind': kind,
        if(allocationMode!=null)'allocationMode':allocationMode,
        if(allocations!=null)'allocations':allocations,
        'customerId': customerId,
        'supplierId': supplierId,
        'amount': amount,
        'source': 'flutter-offline',
      }),
      'label': label,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });
    return mutationId;
  }

  Future<int> pendingCount() => db.pendingCount();
}
