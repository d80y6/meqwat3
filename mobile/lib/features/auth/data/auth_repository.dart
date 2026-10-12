import '../../../core/api/api_client.dart';

/// Authentication against the same cookie-session API as the web app.
/// The ApiClient holds the session cookies in memory for the app's lifetime.
class AuthRepository {
  AuthRepository({required this.api});
  final ApiClient api;

  Future<void> login(String email, String password) => api.login(email, password);

  Future<Map<String, dynamic>> me() => api.get('/api/auth/me');

  Future<void> logout() async {
    try {
      await api.post('/api/auth/logout', {});
    } catch (_) {
      // Local logout proceeds even if the network call fails.
    }
  }
}
