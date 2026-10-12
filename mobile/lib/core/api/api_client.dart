import 'dart:convert';
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
  ApiClient({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;
  String? _cookie;

  Future<void> login(String email, String password) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    _storeCookie(res);
    _unwrap(res);
  }

  Future<Map<String, dynamic>> get(String path) async => _request('GET', path);
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async =>
      _request('POST', path, body: body);

  Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body, bool retried = false}) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'));
    req.headers['Content-Type'] = 'application/json';
    if (_cookie != null) req.headers['Cookie'] = _cookie!;
    if (body != null) req.body = jsonEncode(body);
    final streamed = await _client.send(req);
    final res = await http.Response.fromStream(streamed);
    _storeCookie(res);
    if (res.statusCode == 401 && !retried && !path.contains('/api/auth/')) {
      final okRefresh = await _refresh();
      if (okRefresh) return _request(method, path, body: body, retried: true);
    }
    return _unwrap(res);
  }

  Future<bool> _refresh() async {
    try {
      final res = await _client.post(
        Uri.parse('$baseUrl/api/auth/refresh'),
        headers: {if (_cookie != null) 'Cookie': _cookie!},
      );
      _storeCookie(res);
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  void _storeCookie(http.Response res) {
    final raw = res.headers['set-cookie'];
    if (raw != null && raw.isNotEmpty) {
      // Keep name=value pairs only (drop attributes) for the Cookie header.
      _cookie = raw.split(',').map((c) => c.split(';').first.trim()).where((c) => c.contains('=')).join('; ');
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
