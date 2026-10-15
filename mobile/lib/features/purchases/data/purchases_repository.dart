import 'dart:convert';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/database/app_database.dart';

class PurchasesRepository {
  PurchasesRepository({required this.api, required this.db});
  final ApiClient api;
  final AppDatabase db;
  final _uuid = const Uuid();

  Future<List<Map<String,dynamic>>> suppliers() => api.collection('/api/suppliers');
  Future<List<Map<String,dynamic>>> products() => api.collection('/api/products?active=1');
  Future<List<Map<String,dynamic>>> purchases() => api.collection('/api/purchases');

  Future<void> queuePurchase({
    required String supplierId,
    required List<Map<String, dynamic>> items,
    required String paidAmount,
    String? notes,
    required String label,
  }) async {
    final mutationId = _uuid.v4();
    await db.enqueueOutbox({
      'client_mutation_id': mutationId,
      'type': 'purchase',
      'payload': jsonEncode({
        'supplierId': supplierId,
        'items': items,
        'paidAmount': paidAmount,
        'notes': notes,
        'source': 'flutter-offline',
      }),
      'label': label,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<int> pendingCount() => db.pendingCount();
  Future<List<Map<String, Object?>>> pending() => db.pendingOutbox();
}
