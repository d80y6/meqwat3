import 'dart:convert';
import '../api/api_client.dart';
import '../database/app_database.dart';

class SyncOutcome {
  const SyncOutcome({this.applied = 0, this.duplicates = 0, this.conflicts = 0, this.failed = 0});
  final int applied;
  final int duplicates;
  final int conflicts;
  final int failed;
}

/// Pushes the SQLite outbox to POST /api/sync and applies the server's
/// per-operation verdict — the exact same idempotency contract as the web:
///   applied   → committed now (remove from outbox, record as confirmed)
///   duplicate → committed earlier; safe retry (remove from outbox)
///   conflict  → business rule rejects it now (keep, surface to cashier)
///   error     → transient (keep as pending for the next attempt)
class SyncRepository {
  SyncRepository({required this.api, required this.db});
  final ApiClient api;
  final AppDatabase db;

  Future<SyncOutcome>? _running;
  Future<SyncOutcome> syncNow() {
    return _running ??= _syncBatch().whenComplete(() => _running=null);
  }
  Future<SyncOutcome> _syncBatch() async {
    final owner = db.ownerKey;
    if (owner == null) throw StateError('Login required');
    final me = await api.get('/api/auth/me');
    final user = me['user'] as Map<String, dynamic>;
    api.offlineSession=false;
    await api.vault?.verifiedIdentity(me);
    if (owner != "${user['tenantId']}:${user['id']}") throw StateError('Queue owner mismatch');
    final ops = await db.pendingOutbox();
    if (ops.isEmpty) return const SyncOutcome();

    final data = await api.post('/api/sync', {
      'tenantId': db.tenantId, 'userId': db.userId,
      'operations': ops.map((o) => {
            'clientMutationId': o['client_mutation_id'],
            'type': o['type'],
            'payload': jsonDecode(o['payload'] as String),
          }).toList(),
    });

    if (db.ownerKey != owner) throw StateError('Session changed during sync');
    var applied = 0, duplicates = 0, conflicts = 0, failed = 0;
    final results = (data['results'] as List).cast<Map<String, dynamic>>();
    for (final r in results) {
      final id = r['clientMutationId'] as String;
      final status = r['status'] as String?;
      if (status == 'applied' || status == 'duplicate') {
        await db.confirmOutbox(id,r['result'] as Map<String,dynamic>?);
        if(status=='applied'){applied++;}else{duplicates++;}
      } else if (status == 'conflict') {
        conflicts++;
        await db.markOutbox(id, 'conflict', r['error']?.toString());
      } else {
        failed++;
        await db.markOutbox(id, 'error', r['error']?.toString());
      }
    }
    return SyncOutcome(applied: applied, duplicates: duplicates, conflicts: conflicts, failed: failed);
  }
}
