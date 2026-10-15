import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:meqwat_mobile/core/auth/session_vault.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 setUp(()=>FlutterSecureStorage.setMockInitialValues({}));
 test('origin scoped cookie/profile persist and logout removes both',()async{
  final vault=SessionVault('https://one.example');
  await vault.saveCookie('meqwat_at=fixture');
  await vault.verifiedIdentity({'user':{'id':'u','tenantId':'t'}});
  final reopened=SessionVault('https://one.example');
  expect(await reopened.cookie(),'meqwat_at=fixture');
  expect((await reopened.offlineIdentity())?['user'],{'id':'u','tenantId':'t'});
  expect(await SessionVault('https://other.example').offlineIdentity(),isNull);
  await vault.clear();expect(await reopened.cookie(),isNull);expect(await reopened.offlineIdentity(),isNull);
 });
 test('offline identity never outlives subscription end',()async{
  final vault=SessionVault('https://one.example');await vault.saveCookie('fixture');
  await vault.verifiedIdentity({'user':{'id':'u'},'subscription':{'endsAt':DateTime.now().subtract(const Duration(seconds:1)).toIso8601String()}});
  expect(await vault.offlineIdentity(),isNull);
 });
 test('concurrent persistence preserves cookie and identity',()async{
  final vault=SessionVault('https://one.example');await Future.wait([vault.saveCookie('fixture'),vault.verifiedIdentity({'user':{'id':'u'}})]);
  expect(await vault.cookie(),'fixture');expect(await vault.offlineIdentity(),isNotNull);
 });
}
