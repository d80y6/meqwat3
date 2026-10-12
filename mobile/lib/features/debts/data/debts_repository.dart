import 'dart:convert';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
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
    final c = await api.get('/api/customers?debt=1&limit=200');
    final s = await api.get('/api/suppliers?debt=1&limit=200');
    return (
      customers: (c['items'] as List).cast<Map<String, dynamic>>(),
      suppliers: (s['items'] as List).cast<Map<String, dynamic>>(),
    );
  }

  Future<String> queuePayment({
    required String kind, // customer_payment | supplier_payment
    String? customerId,
    String? supplierId,
    required String amount,
    required String label,
  }) async {
    final mutationId = _uuid.v4();
    await db.enqueueOutbox({
      'client_mutation_id': mutationId,
      'type': 'payment',
      'payload': jsonEncode({
        'kind': kind,
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
