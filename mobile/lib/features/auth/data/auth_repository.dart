import '../../../core/api/api_client.dart';
import '../../../core/database/app_database.dart';

/// Authentication against the same cookie-session API as the web app.
/// Secure OS storage retains cookies; bounded verified identity permits provisional offline reopen.
class AuthRepository {
  AuthRepository({required this.api, required this.db});
  final AppDatabase db;
  final ApiClient api;

  Future<void> login(String email, String password) => api.login(email, password);

  Future<Map<String, dynamic>> me() async {
    Map<String,dynamic> result;
    try {
      result=await api.get('/api/auth/me');api.offlineSession=false;
    }catch(e){
      if(e is ApiException && e.status!=null && e.status!<500)rethrow;
      final cached=await api.vault?.offlineIdentity();if(cached==null)rethrow;
      result=cached;api.offlineSession=true;
    }
    final user = result['user'] as Map<String, dynamic>;
    if (user['mustChangePassword'] == true) throw ApiException('غيّر كلمة المرور المؤقتة من شاشة الدخول أولاً');
    if (user['tenantId'] == null) throw ApiException('حساب متجر مطلوب');
    await db.bindOwner(user['tenantId'] as String, user['id'] as String);
    if(!api.offlineSession)await api.vault?.verifiedIdentity(result);
    return result;
  }

  Future<void> logout() async {
    try {
      await api.post('/api/auth/logout', {});
    } catch (_) {
      // Local logout proceeds even if the network call fails.
    } finally { db.clearOwner(); await api.clearSession(); }
  }
}
