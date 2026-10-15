import 'dart:convert';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/database/app_database.dart';

/// POS data layer. Checkout NEVER calls the sales endpoint directly: the
/// operation is persisted to the outbox first (works fully offline), and
/// SyncRepository confirms it with the server afterwards.
class PosRepository {
  PosRepository({required this.api, required this.db});

  final ApiClient api;
  final AppDatabase db;
  final _uuid = const Uuid();

  Future<void> refreshCatalog() async {
    final owner = db.ownerKey;
    final items = await api.collection('/api/products?active=1');
    if (owner == null || owner != db.ownerKey) throw StateError('Session changed');
    await db.replaceProducts(items.map((p) => {
          'id': p['id'],
          'name': p['name'],
          'unit': p['unit'],
          'sale_price': p['salePrice'],
          'cost_price': p['costPrice'],
          'stock_qty': p['stockQty'],
          'track_stock': (p['trackStock'] == true) ? 1 : 0,
        }).toList());
  }

  Future<List<Map<String, Object?>>> cachedProducts() => db.products();
  Future<int> pendingCount() => db.pendingCount();

  Future<List<Map<String, Object?>>> conflicts() async {
    final rows = await db.allOutbox();
    return rows.where((r) => r['status'] == 'conflict').toList();
  }

  /// Persist a sale to the outbox. Returns the stable mutation id.
  Future<String> queueSale({
    required List<Map<String, dynamic>> items,
    required String paidAmount,
    String? customerId,
    String? shiftId, String? registerId,
    String discount = '0',
    required String label,
  }) async {
    final mutationId = _uuid.v4();
    await db.enqueueOutbox({
      'client_mutation_id': mutationId,
      'type': 'sale',
      'payload': jsonEncode({
        'customerId': customerId, 'shiftId': shiftId, 'registerId': registerId,
        'items': items,
        'discount': discount,
        'paidAmount': paidAmount,
        'source': 'flutter-offline',
      }),
      'label': label,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });
    return mutationId;
  }
}
