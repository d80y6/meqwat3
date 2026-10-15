import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:meqwat_mobile/core/api/api_client.dart';
void main(){
 test('expired me calls share a single refresh and retry',() async {
  var refreshes=0;var refreshed=false;
  final transport=MockClient((request) async {
   if(request.url.path=='/api/auth/refresh'){
    refreshes++;await Future<void>.delayed(const Duration(milliseconds:20));refreshed=true;
    return http.Response(jsonEncode({'ok':true,'data':{}}),200,headers:{'set-cookie':'meqwat_at=fresh; Path=/; HttpOnly'});
   }
   if(!refreshed)return http.Response(jsonEncode({'ok':false,'error':'expired'}),401);
   return http.Response(jsonEncode({'ok':true,'data':{'user':{'id':'test'}}}),200);
  });
  final api=ApiClient(baseUrl:'https://isolated.example',client:transport);
  final results=await Future.wait([api.get('/api/auth/me'),api.get('/api/auth/me')]);
  expect(refreshes,1);expect(results.length,2);
 });
 test('cookie response arriving after logout cannot restore a session',() async {
  final api=ApiClient(baseUrl:'https://isolated.example',client:MockClient((request) async {
    await Future<void>.delayed(const Duration(milliseconds:20));return http.Response('{"ok":true,"data":{}}',200,headers:{'set-cookie':'meqwat_at=old'});
  }));
  final pending=api.get('/api/products');api.clearSession();await expectLater(pending,throwsA(isA<ApiException>()));
 });
}
