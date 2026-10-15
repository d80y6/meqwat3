import '../../../core/api/api_client.dart';
import '../../../core/database/app_database.dart';

/// Authentication against the same cookie-session API as the web app.
/// The ApiClient holds the session cookies in memory for the app's lifetime.
class AuthRepository {
  AuthRepository({required this.api, required this.db});
  final AppDatabase db;
  final ApiClient api;

  Future<void> login(String email, String password) => api.login(email, password);

  Future<Map<String, dynamic>> me() async {
    final result = await api.get('/api/auth/me');
    final user = result['user'] as Map<String, dynamic>;
    if (user['mustChangePassword'] == true) throw ApiException('غيّر كلمة المرور المؤقتة من موقع المتجر أولاً');
    if (user['tenantId'] == null) throw ApiException('حساب متجر مطلوب');
    await db.bindOwner(user['tenantId'] as String, user['id'] as String);
    return result;
  }

  Future<void> logout() async {
    try {
      await api.post('/api/auth/logout', {});
    } catch (_) {
      // Local logout proceeds even if the network call fails.
    } finally { api.clearSession(); db.clearOwner(); }
  }
}
