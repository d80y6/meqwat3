import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../../../core/sync/sync_repository.dart';
import '../data/debts_repository.dart';

/* --------------------------------- events -------------------------------- */
sealed class DebtsEvent extends Equatable {
  const DebtsEvent();
  @override
  List<Object?> get props => [];
}

class DebtsStarted extends DebtsEvent {
  const DebtsStarted();
}

class DebtsRefreshRequested extends DebtsEvent {
  const DebtsRefreshRequested();
}

class DebtPaymentSubmitted extends DebtsEvent {
  const DebtPaymentSubmitted({required this.kind, required this.partyId, required this.amount, required this.label});
  final String kind;
  final String partyId;
  final String amount;
  final String label;
  @override
  List<Object?> get props => [kind, partyId, amount, label];
}

/* --------------------------------- states -------------------------------- */
enum DebtsStatus { loading, ready, failure }

class DebtsState extends Equatable {
  const DebtsState({
    this.status = DebtsStatus.loading,
    this.customers = const [],
    this.suppliers = const [],
    this.pendingCount = 0,
    this.message,
  });
  final DebtsStatus status;
  final List<Map<String, dynamic>> customers;
  final List<Map<String, dynamic>> suppliers;
  final int pendingCount;
  final String? message;

  DebtsState copyWith({
    DebtsStatus? status,
    List<Map<String, dynamic>>? customers,
    List<Map<String, dynamic>>? suppliers,
    int? pendingCount,
    String? message,
  }) {
    return DebtsState(
      status: status ?? this.status,
      customers: customers ?? this.customers,
      suppliers: suppliers ?? this.suppliers,
      pendingCount: pendingCount ?? this.pendingCount,
      message: message,
    );
  }

  @override
  List<Object?> get props => [status, customers, suppliers, pendingCount, message];
}

/* ---------------------------------- bloc --------------------------------- */
class DebtsBloc extends Bloc<DebtsEvent, DebtsState> {
  DebtsBloc({required this.repository, required this.sync}) : super(const DebtsState()) {
    on<DebtsStarted>(_load);
    on<DebtsRefreshRequested>(_load);
    on<DebtPaymentSubmitted>(_onPayment);
  }

  final DebtsRepository repository;
  final SyncRepository sync;

  Future<void> _load(DebtsEvent event, Emitter<DebtsState> emit) async {
    try {
      final data = await repository.fetchDebtors();
      emit(state.copyWith(
        status: DebtsStatus.ready,
        customers: data.customers,
        suppliers: data.suppliers,
        pendingCount: await repository.pendingCount(),
      ));
    } on ApiException catch (e) {
      emit(state.copyWith(status: DebtsStatus.failure, message: e.message));
    } catch (_) {
      emit(state.copyWith(status: DebtsStatus.failure, message: 'تعذر التحميل — تحقق من الاتصال'));
    }
  }

  Future<void> _onPayment(DebtPaymentSubmitted event, Emitter<DebtsState> emit) async {
    await repository.queuePayment(
      kind: event.kind,
      customerId: event.kind == 'customer_payment' ? event.partyId : null,
      supplierId: event.kind == 'supplier_payment' ? event.partyId : null,
      amount: event.amount,
      label: event.label,
    );
    emit(state.copyWith(pendingCount: await repository.pendingCount(), message: 'حُفظ السداد محلياً — سيُرحَّل عند الاتصال'));
    // Best-effort immediate sync; failures leave the op safely queued.
    try {
      await sync.syncNow();
      add(const DebtsRefreshRequested());
    } catch (_) {
      emit(state.copyWith(pendingCount: await repository.pendingCount()));
    }
  }
}
