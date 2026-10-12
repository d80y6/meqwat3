import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Local SQLite store: read-cache for catalog/parties + the transactional
/// OUTBOX. The outbox is the source of truth while offline; rows move
/// pending → synced (deleted) / conflict (kept with the server's message).
class AppDatabase {
  AppDatabase(this._db);
  final Database _db;

  static Future<AppDatabase> open() async {
    final dir = await getDatabasesPath();
    final db = await openDatabase(
      p.join(dir, 'meqwat.db'),
      version: 1,
      onCreate: (db, _) async {
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

  Database get raw => _db;

  /* ------------------------------- cache ------------------------------- */
  Future<void> replaceProducts(List<Map<String, Object?>> rows) async {
    final b = _db.batch();
    b.delete('products');
    for (final r in rows) b.insert('products', r, conflictAlgorithm: ConflictAlgorithm.replace);
    await b.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> products() => _db.query('products', orderBy: 'name');

  /* ------------------------------- outbox ------------------------------ */
  Future<void> enqueueOutbox(Map<String, Object?> row) =>
      _db.insert('outbox', row, conflictAlgorithm: ConflictAlgorithm.ignore);

  Future<List<Map<String, Object?>>> pendingOutbox() => _db.query(
        'outbox',
        where: "status != 'conflict'",
        orderBy: 'created_at',
      );

  Future<List<Map<String, Object?>>> allOutbox() =>
      _db.query('outbox', orderBy: 'created_at DESC');

  Future<void> deleteOutbox(String mutationId) =>
      _db.delete('outbox', where: 'client_mutation_id = ?', whereArgs: [mutationId]);

  Future<void> markOutbox(String mutationId, String status, String? error) => _db.update(
        'outbox',
        {'status': status, 'error': error, 'attempts': Sqflite.firstIntValue(await _db.rawQuery(
              'SELECT attempts FROM outbox WHERE client_mutation_id = ?', [mutationId]))! + 1},
        where: 'client_mutation_id = ?',
        whereArgs: [mutationId],
      );

  Future<void> recordConfirmed(Map<String, Object?> row) =>
      _db.insert('confirmed_sales', row, conflictAlgorithm: ConflictAlgorithm.ignore);

  Future<int> pendingCount() async {
    final r = await _db.rawQuery("SELECT COUNT(*) c FROM outbox WHERE status != 'conflict'");
    return Sqflite.firstIntValue(r) ?? 0;
  }
}
