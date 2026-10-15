import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Cookies and a bounded last-verified identity live in OS secure storage, never SQLite.
/// Offline authorization is provisional; the server rechecks every queued posting.
class SessionVault {
  SessionVault(String origin,{FlutterSecureStorage? storage}):_key='meqwat.session.v1:$origin',_storage=storage??const FlutterSecureStorage();
  final String _key;
  final FlutterSecureStorage _storage;
  Future<void> _pending=Future<void>.value();
  Future<Map<String,dynamic>> _read() async {
    final value=await _storage.read(key:_key);
    return value==null?<String,dynamic>{}:jsonDecode(value) as Map<String,dynamic>;
  }
  Future<void> _update(void Function(Map<String,dynamic>) edit) {
    final work=_pending.then((_)async{final state=await _read();edit(state);await _storage.write(key:_key,value:jsonEncode(state));});
    _pending=work.catchError((Object _) {});
    return work;
  }
  Future<String?> cookie()async{await _pending;return (await _read())['cookie'] as String?;}
  Future<void> saveCookie(String? cookie)=>_update((state){state['cookie']=cookie;});
  Future<void> verifiedIdentity(Map<String,dynamic> profile) => _update((state){
    var expiry=DateTime.now().toUtc().add(const Duration(hours:8));
    final subscription=profile['subscription'] as Map?;
    final end=DateTime.tryParse(subscription?['endsAt']?.toString()??'');
    if(end!=null&&end.isBefore(expiry))expiry=end;
    state['identity']=profile;state['offlineUntil']=expiry.toIso8601String();
  });
  Future<Map<String,dynamic>?> offlineIdentity()async{
    await _pending;final state=await _read();
    final expiry=DateTime.tryParse(state['offlineUntil']?.toString()??'');
    if(expiry==null||!DateTime.now().toUtc().isBefore(expiry)||state['cookie']==null)return null;
    return state['identity'] as Map<String,dynamic>?;
  }
  Future<void> clear(){final work=_pending.then((_)=>_storage.delete(key:_key));_pending=work.catchError((Object _){});return work;}
}
