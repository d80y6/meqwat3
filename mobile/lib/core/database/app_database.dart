import 'dart:convert';
import 'dart:collection';
import 'package:uuid/uuid.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Local SQLite store: read-cache for catalog/parties + the transactional
/// OUTBOX. The outbox is the source of truth while offline; rows move
/// pending → synced (deleted) / conflict (kept with the server's message).
class AppDatabase {
  AppDatabase(this._db);
  final Database _db;
  String? tenantId;
  String? userId;
  String? get ownerKey => tenantId == null ? null : '$tenantId:$userId';

  Future<void> bindOwner(String tenant, String user) async {
    if (ownerKey == '$tenant:$user') return;
    tenantId = tenant; userId = user;
    // Catalog caches contain no financial postings; never show another login's cache.
    await _db.transaction((tx) async { await tx.delete('products'); await tx.delete('customers'); });
  }
  void clearOwner() { tenantId = null; userId = null; }
  bool _owned(Map<String, Object?> row) {
    if (ownerKey == null) return false;
    try { return (jsonDecode(row['payload'] as String) as Map)['_queueOwner'] == ownerKey; }
    catch (_) { return false; }
  }

  static Future<AppDatabase> open() async {
    final dir = await getDatabasesPath();
    final db = await openDatabase(
      p.join(dir, 'meqwat.db'),
      version: 2,
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) await _createV2(db);
      },
      onCreate: (db, _) async {
        await _createV2(db);
        await db.execute('''
          CREATE TABLE products(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
            sale_price TEXT NOT NULL, cost_price TEXT NOT NULL,
            stock_qty TEXT NOT NULL, track_stock INTEGER NOT NULL DEFAULT 1
          )''');
        await db.execute('''
          CREATE TABLE customers(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT,
            balance TEXT NOT NULL DEFAULT '0', credit_limit TEXT NOT NULL DEFAULT '0'
          )''');
        await db.execute('''
          CREATE TABLE outbox(
            client_mutation_id TEXT PRIMARY KEY,
            type TEXT NOT NULL,               -- sale | purchase | payment
            payload TEXT NOT NULL,            -- JSON, mirrors POST /api bodies
            label TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',  -- pending | conflict | error
            error TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )''');
        await db.execute('''
          CREATE TABLE confirmed_sales(
            id TEXT PRIMARY KEY, invoice_no INTEGER, total TEXT NOT NULL,
            origin_mutation_id TEXT, confirmed_at TEXT NOT NULL
          )''');
      },
    );
    return AppDatabase(db);
  }

  static Future<void> _createV2(Database db) async {
    await db.execute('CREATE TABLE request_keys(owner TEXT NOT NULL, signature TEXT NOT NULL, mutation_id TEXT NOT NULL, PRIMARY KEY(owner,signature))');
    await db.execute('CREATE TABLE response_cache(owner TEXT NOT NULL, path TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,path))');
  }
  String _signature(String path, Map<String,dynamic> body) {
    dynamic sorted(dynamic value) {
      if (value is Map) return SplayTreeMap<String,dynamic>.from(value.map((k,v)=>MapEntry(k.toString(),sorted(v))));
      if (value is List) return value.map(sorted).toList();
      return value;
    }
    return jsonEncode({'path':path,'body':sorted(body)});
  }
  Future<String> requestId(String path, Map<String,dynamic> body) async {
    final owner=ownerKey;if(owner==null)throw StateError('Login required');
    final signature=_signature(path,body);
    return _db.transaction((tx) async {
      final rows=await tx.query('request_keys',where:'owner=? AND signature=?',whereArgs:[owner,signature]);
      if(rows.isNotEmpty)return rows.first['mutation_id'] as String;
      final id=const Uuid().v4();
      await tx.insert('request_keys',{'owner':owner,'signature':signature,'mutation_id':id});return id;
    });
  }
  Future<void> confirmRequest(String owner,String path,Map<String,dynamic> body) async {
    await _db.delete('request_keys',where:'owner=? AND signature=?',whereArgs:[owner,_signature(path,body)]);
  }
  Future<void> cacheResponse(String owner,String path,Map<String,dynamic> data) async {
    if(owner!=ownerKey)return;
    await _db.insert('response_cache',{'owner':owner,'path':path,'payload':jsonEncode(data)},conflictAlgorithm:ConflictAlgorithm.replace);
  }
  Future<Map<String,dynamic>?> cachedResponse(String path) async {
    if(ownerKey==null)return null;
    final rows=await _db.query('response_cache',where:'owner=? AND path=?',whereArgs:[ownerKey,path]);
    return rows.isEmpty?null:jsonDecode(rows.first['payload'] as String) as Map<String,dynamic>;
  }
  Future<void> retryConflict(String id) async {
    final rows=await _db.query('outbox',where:'client_mutation_id=?',whereArgs:[id]);
    if(rows.isEmpty||!_owned(rows.first))throw StateError('Queue owner mismatch');
    // Same immutable payload and ID only. Corrected operations must be reviewed as new operations.
    await _db.update('outbox',{'status':'pending','error':null},where:'client_mutation_id=?',whereArgs:[id]);
  }

  Database get raw => _db;

  /* ------------------------------- cache ------------------------------- */
  Future<void> replaceProducts(List<Map<String, Object?>> rows) async {
    final b = _db.batch();
    b.delete('products');
    for (final r in rows) b.insert('products', r, conflictAlgorithm: ConflictAlgorithm.replace);
    await b.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> products() async => ownerKey == null ? [] : await _db.query('products', orderBy: 'name');

  /* ------------------------------- outbox ------------------------------ */
  Future<void> enqueueOutbox(Map<String, Object?> row) async {
    if (ownerKey == null) throw StateError('Login required before queuing');
    final payload = jsonDecode(row['payload'] as String) as Map<String, dynamic>;
    payload['_queueOwner'] = ownerKey;
    await _db.insert('outbox', {...row, 'payload': jsonEncode(payload)}, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  Future<List<Map<String, Object?>>> pendingOutbox() async {
    final rows = await _db.query('outbox', where: "status IN ('pending','error')", orderBy: 'created_at');
    // Legacy ownerless rows are retained for manual recovery, never auto-replayed.
    return rows.where(_owned).take(100).toList();
  }
  Future<List<Map<String, Object?>>> allOutbox() async =>
    (await _db.query('outbox', orderBy: 'created_at DESC')).where(_owned).toList();

  Future<void> confirmOutbox(String id,Map<String,dynamic>? result) async {
    final owner=ownerKey;
    await _db.transaction((tx) async {
      final rows=await tx.query('outbox',where:'client_mutation_id=?',whereArgs:[id]);
      if(owner==null||owner!=ownerKey||rows.isEmpty||!_owned(rows.first))throw StateError('Queue owner mismatch');
      if(result?['invoiceNo']!=null)await tx.insert('confirmed_sales',{
        'id':result!['id'],'invoice_no':result['invoiceNo'],'total':result['totalAmount'],
        'origin_mutation_id':id,'confirmed_at':DateTime.now().toIso8601String(),
      },conflictAlgorithm:ConflictAlgorithm.ignore);
      await tx.delete('outbox',where:'client_mutation_id=?',whereArgs:[id]);
    });
  }

  Future<void> deleteOutbox(String mutationId) =>
      _db.delete('outbox', where: 'client_mutation_id = ?', whereArgs: [mutationId]);

  Future<void> markOutbox(String mutationId, String status, String? error) async {
    final rows = await _db.rawQuery(
      'SELECT attempts FROM outbox WHERE client_mutation_id = ?',
      [mutationId],
    );
    final attempts = rows.isEmpty ? 0 : (rows.first['attempts'] as int? ?? 0);
    await _db.update(
      'outbox',
      {'status': status, 'error': error, 'attempts': attempts + 1},
      where: 'client_mutation_id = ?',
      whereArgs: [mutationId],
    );
  }

  Future<void> recordConfirmed(Map<String, Object?> row) =>
      _db.insert('confirmed_sales', row, conflictAlgorithm: ConflictAlgorithm.ignore);

  Future<int> pendingCount() async => (await allOutbox()).where((r) => r['status'] == 'pending' || r['status'] == 'error').length;
}
