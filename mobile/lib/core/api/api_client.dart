import 'dart:convert';
import '../database/app_database.dart';
import '../auth/session_vault.dart';
import 'package:uuid/uuid.dart';
import 'package:http/http.dart' as http;

/// Thin client for the Meqwat API. Auth uses the same httpOnly cookie
/// session as the web app (access JWT + rotating refresh token); on 401 we
/// refresh once and retry — mirroring the web client's contract.
class ApiException implements Exception {
  ApiException(this.message, {this.status, this.code});
  final String message;
  final int? status;
  final String? code;
  @override
  String toString() => 'ApiException($status): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, this.store, this.vault, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final AppDatabase? store;
  final SessionVault? vault;
  bool offlineSession=false;
  final http.Client _client;
  String? _cookie;
  Future<bool>? _refreshing;
  int _generation = 0;
  Future<void> clearSession() async { _cookie = null; _generation++; _refreshing = null; offlineSession=false; await vault?.clear(); }
  Future<void> restoreSession() async {try{_cookie=await vault?.cookie();}catch(_){_cookie=null;}}


  Future<void> login(String email, String password) async {
    await clearSession();
    final generation = _generation;
    final res = await _client.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (generation != _generation) throw ApiException('تغيرت الجلسة');
    await _storeCookie(res);
    _unwrap(res);
  }

  Future<Map<String, dynamic>> get(String path) async => _request('GET', path);
  Future<Map<String,dynamic>> cachedGet(String path) async {
    final owner=store?.ownerKey;
    try {
      final data=await get(path);
      if(owner!=null)await store!.cacheResponse(owner,path,data);
      return data;
    } catch(e) {
      if(e is ApiException && e.status != null && e.status! < 500) rethrow;
      final cached=await store?.cachedResponse(path);
      if(cached!=null)return cached;
      rethrow;
    }
  }
  Future<List<Map<String,dynamic>>> collection(String path) async {
    final all=<Map<String,dynamic>>[];
    var offset=0;
    while(true) {
      final data=await cachedGet('$path${path.contains('?')?'&':'?'}limit=200&offset=$offset');
      final items=(data['items'] as List).cast<Map<String,dynamic>>();all.addAll(items);
      offset+=items.length;
      if(items.isEmpty || (data['total'] is num ? offset >= (data['total'] as num) : items.length<200))return all;
      if(offset>100000)throw ApiException('كتالوج كبير جداً — استخدم البحث');
    }
  }
  Future<Map<String,dynamic>> patch(String path,Map<String,dynamic> body) => _request('PATCH',path,body:body);
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    if(body.containsKey('clientMutationId')) return _request('POST',path,body:body);
    final durable=RegExp(r'^/api/(inventory|payments|expenses)$').hasMatch(path) || RegExp(r'^/api/(sales|purchases)/[^/]+/return$').hasMatch(path);
    final owner=store?.ownerKey;
    if(durable && owner==null)throw ApiException('جلسة متجر مطلوبة لحفظ العملية');
    final generation=_generation;
    final id=durable?await store!.requestId(path,body):const Uuid().v4();
    if(generation!=_generation||(durable&&owner!=store?.ownerKey))throw ApiException('تغيرت الجلسة قبل إرسال العملية');
    try {
      final result=await _request('POST',path,body:{...body,'clientMutationId':id});
      if(durable)await store!.confirmRequest(owner!,path,body);
      return result;
    } on ApiException catch(e) {
      if(durable && e.status!=null && e.status!>=400 && e.status!<500 && e.status!=409)await store!.confirmRequest(owner!,path,body);
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body, bool retried = false}) async {
    final generation = _generation;
    final sentCookie = _cookie;
    final req = http.Request(method, Uri.parse('$baseUrl$path'));
    req.headers['Content-Type'] = 'application/json';
    if (_cookie != null) req.headers['Cookie'] = _cookie!;
    if (body != null) req.body = jsonEncode(body);
    final streamed = await _client.send(req);
    final res = await http.Response.fromStream(streamed);
    if (generation != _generation) throw ApiException('تغيرت الجلسة');
    await _storeCookie(res);
    if (res.statusCode == 401 && !retried && (!path.contains('/api/auth/') || path == '/api/auth/me')) {
      if(sentCookie!=_cookie && _cookie!=null)return _request(method,path,body:body,retried:true);
      final okRefresh = await _refresh();
      if (okRefresh) return _request(method, path, body: body, retried: true);
    }
    return _unwrap(res);
  }

  Future<bool> _refresh() {
    if (_refreshing != null) return _refreshing!;
    final generation = _generation;
    final future = _performRefresh(generation);
    _refreshing = future;
    future.whenComplete(() { if (generation == _generation) _refreshing = null; });
    return future;
  }
  Future<bool> _performRefresh(int generation) async {
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/api/auth/refresh'),
        headers: {if (_cookie != null) 'Cookie': _cookie!},
      );
      if (generation != _generation) return false;
      await _storeCookie(res);
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<void> _storeCookie(http.Response res) async {
    final raw = res.headers['set-cookie'];
    if (raw != null && raw.isNotEmpty) {
      final pairs = <String,String>{};
      for (final match in RegExp(r'(meqwat_at|meqwat_rt)=([^;,\s]*)').allMatches(_cookie ?? '')) {
        pairs[match.group(1)!] = match.group(2)!;
      }
      for (final match in RegExp(r'(meqwat_at|meqwat_rt)=([^;,\s]*)').allMatches(raw)) {
        if (match.group(2)!.isEmpty) { pairs.remove(match.group(1)); }
        else { pairs[match.group(1)!] = match.group(2)!; }
      }
      _cookie = pairs.entries.map((e) => '${e.key}=${e.value}').join('; ');
      await vault?.saveCookie(_cookie!.isEmpty?null:_cookie);
    }
  }

  Map<String, dynamic> _unwrap(http.Response res) {
    Map<String, dynamic> json;
    try {
      json = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('استجابة غير صالحة من الخادم', status: res.statusCode);
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && json['ok'] == true) {
      return (json['data'] as Map<String, dynamic>?) ?? {};
    }
    throw ApiException(json['error']?.toString() ?? 'خطأ في الاتصال', status: res.statusCode, code: json['code']?.toString());
  }
}
