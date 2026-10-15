import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'package:meqwat_mobile/core/database/app_database.dart';
import 'package:meqwat_mobile/core/auth/session_vault.dart';
void main(){
 IntegrationTestWidgetsFlutterBinding.ensureInitialized();
 testWidgets('real SQLite reopen, owner isolation, durable keys and OS secure storage',(tester)async{
  await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Isolated persistence acceptance'))));
  final path=p.join(await getDatabasesPath(),'meqwat.db');await deleteDatabase(path);
  var db=await AppDatabase.open();
  await db.bindOwner('tenant-a','user-a');
  await db.enqueueOutbox({'client_mutation_id':'fixture-sale-a','type':'sale','payload':jsonEncode({'items':[]}), 'label':'synthetic','status':'pending','created_at':DateTime.now().toIso8601String()});
  final key=await db.requestId('/api/inventory',{'productId':'p','qty':'1','type':'spoilage'});
  await db.cacheResponse(db.ownerKey!,'/api/products',{'items':[{'id':'a-only'}]});
  await db.raw.close();db=await AppDatabase.open();await db.bindOwner('tenant-b','user-b');
  expect(await db.pendingOutbox(),isEmpty);expect(await db.cachedResponse('/api/products'),isNull);
  await db.bindOwner('tenant-a','user-a');expect((await db.pendingOutbox()).single['client_mutation_id'],'fixture-sale-a');
  expect(await db.requestId('/api/inventory',{'qty':'1','type':'spoilage','productId':'p'}),key);
  expect((await db.cachedResponse('/api/products'))?['items'],[{'id':'a-only'}]);
  await db.raw.insert('outbox',{'client_mutation_id':'legacy-unowned','type':'sale','payload':'{}','label':'legacy','status':'pending','created_at':'2020-01-01'});
  expect((await db.allOutbox()).length,1);
  expect((await db.raw.query('outbox')).length,2); // quarantined, not deleted
  final vault=SessionVault('https://device-fixture.invalid');await vault.saveCookie('test-cookie-not-a-credential');await vault.verifiedIdentity({'user':{'id':'user-a','tenantId':'tenant-a'}});
  final reopened=SessionVault('https://device-fixture.invalid');expect(await reopened.cookie(),'test-cookie-not-a-credential');expect(await reopened.offlineIdentity(),isNotNull);
  await vault.clear();expect(await reopened.cookie(),isNull);
  await db.raw.close();await deleteDatabase(path);
 });
}
