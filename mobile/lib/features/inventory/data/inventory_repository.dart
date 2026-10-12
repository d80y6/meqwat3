import '../../../core/api/api_client.dart';

/// Inventory reads come from the server (daily stock & movements); the
/// spoilage/count POST is online-only today — offline sales/purchases queue
/// via the outbox, stock actions require connectivity and say so clearly.
class InventoryRepository {
  InventoryRepository({required this.api});
  final ApiClient api;

  Future<({List<Map<String, dynamic>> stock, List<Map<String, dynamic>> movements})> fetch({String? day}) async {
    final query = StringBuffer('/api/inventory?limit=60');
    if (day != null) query.write('&day=$day');
    final data = await api.get(query.toString());
    return (
      stock: (data['stock'] as List).cast<Map<String, dynamic>>(),
      movements: (data['movements'] as List).cast<Map<String, dynamic>>(),
    );
  }

  Future<Map<String, dynamic>> recordSpoilage({required String productId, required String qty, String? notes}) {
    return api.post('/api/inventory', {'productId': productId, 'type': 'spoilage', 'qty': qty, 'notes': notes});
  }

  Future<Map<String, dynamic>> recordCount({required String productId, required String countedQty, String? notes}) {
    return api.post('/api/inventory', {'productId': productId, 'type': 'adjustment', 'qty': countedQty, 'notes': notes});
  }
}
