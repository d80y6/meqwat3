import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../data/auth_repository.dart';

/* --------------------------------- events -------------------------------- */
sealed class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

class AuthLoginRequested extends AuthEvent {
  const AuthLoginRequested({required this.email, required this.password});
  final String email;
  final String password;
  @override
  List<Object?> get props => [email, password];
}

class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

class AuthSessionChecked extends AuthEvent {
  const AuthSessionChecked();
}

/* --------------------------------- states -------------------------------- */
sealed class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated({required this.name, required this.role, this.tenantName});
  final String name;
  final String role;
  final String? tenantName;
  @override
  List<Object?> get props => [name, role, tenantName];
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.error});
  final String? error;
  @override
  List<Object?> get props => [error];
}

/* ---------------------------------- bloc --------------------------------- */
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc({required this.repository}) : super(const AuthInitial()) {
    on<AuthSessionChecked>(_onCheck);
    on<AuthLoginRequested>(_onLogin);
    on<AuthLogoutRequested>(_onLogout);
  }

  final AuthRepository repository;

  Future<void> _onCheck(AuthSessionChecked event, Emitter<AuthState> emit) async {
    try {
      final me = await repository.me();
      emit(_fromMe(me));
    } catch (_) {
      emit(const AuthUnauthenticated());
    }
  }

  Future<void> _onLogin(AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    try {
      await repository.login(event.email.trim(), event.password);
      final me = await repository.me();
      emit(_fromMe(me));
    } on ApiException catch (e) {
      emit(AuthUnauthenticated(error: e.message));
    } catch (_) {
      emit(const AuthUnauthenticated(error: 'تعذر الاتصال بالخادم'));
    }
  }

  Future<void> _onLogout(AuthLogoutRequested event, Emitter<AuthState> emit) async {
    try { await repository.logout(); } finally { emit(const AuthUnauthenticated()); }
  }

  AuthState _fromMe(Map<String, dynamic> me) {
    final user = (me['user'] as Map<String, dynamic>?) ?? {};
    final tenant = me['tenant'] as Map<String, dynamic>?;
    return AuthAuthenticated(
      name: user['name']?.toString() ?? '',
      role: user['role']?.toString() ?? '',
      tenantName: tenant?['name']?.toString(),
    );
  }
}
