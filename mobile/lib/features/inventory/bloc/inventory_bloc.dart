import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../data/inventory_repository.dart';

/* --------------------------------- events -------------------------------- */
sealed class InventoryEvent extends Equatable {
  const InventoryEvent();
  @override
  List<Object?> get props => [];
}

class InventoryStarted extends InventoryEvent {
  const InventoryStarted();
}

class InventoryRefreshRequested extends InventoryEvent {
  const InventoryRefreshRequested();
}

class SpoilageSubmitted extends InventoryEvent {
  const SpoilageSubmitted({required this.productId, required this.qty, this.notes});
  final String productId;
  final String qty;
  final String? notes;
  @override
  List<Object?> get props => [productId, qty, notes];
}

class CountAdjustmentSubmitted extends InventoryEvent {
  const CountAdjustmentSubmitted({required this.productId, required this.countedQty, this.notes});
  final String productId;
  final String countedQty;
  final String? notes;
  @override
  List<Object?> get props => [productId, countedQty, notes];
}

/* --------------------------------- states -------------------------------- */
enum InventoryStatus { loading, ready, failure }

class InventoryState extends Equatable {
  const InventoryState({this.status = InventoryStatus.loading, this.stock = const [], this.movements = const [], this.message});
  final InventoryStatus status;
  final List<Map<String, dynamic>> stock;
  final List<Map<String, dynamic>> movements;
  final String? message;

  InventoryState copyWith({InventoryStatus? status, List<Map<String, dynamic>>? stock, List<Map<String, dynamic>>? movements, String? message}) {
    return InventoryState(
      status: status ?? this.status,
      stock: stock ?? this.stock,
      movements: movements ?? this.movements,
      message: message,
    );
  }

  @override
  List<Object?> get props => [status, stock, movements, message];
}

/* ---------------------------------- bloc --------------------------------- */
class InventoryBloc extends Bloc<InventoryEvent, InventoryState> {
  InventoryBloc({required this.repository}) : super(const InventoryState()) {
    on<InventoryStarted>(_load);
    on<InventoryRefreshRequested>(_load);
    on<SpoilageSubmitted>(_onSpoilage);
    on<CountAdjustmentSubmitted>(_onAdjustment);
  }

  final InventoryRepository repository;

  Future<void> _load(InventoryEvent event, Emitter<InventoryState> emit) async {
    try {
      final data = await repository.fetch();
      emit(state.copyWith(status: InventoryStatus.ready, stock: data.stock, movements: data.movements));
    } on ApiException catch (e) {
      emit(state.copyWith(status: InventoryStatus.failure, message: e.message));
    } catch (_) {
      emit(state.copyWith(status: InventoryStatus.failure, message: 'تعذر تحميل المخزون — تحقق من الاتصال'));
    }
  }

  Future<void> _onSpoilage(SpoilageSubmitted event, Emitter<InventoryState> emit) async {
    try {
      final res = await repository.recordSpoilage(productId: event.productId, qty: event.qty, notes: event.notes);
      emit(state.copyWith(message: 'سُجّل الهالك — المخزون الجديد ${res['newStock']}'));
      add(const InventoryRefreshRequested());
    } on ApiException catch (e) {
      emit(state.copyWith(message: e.message));
    } catch (_) {
      emit(state.copyWith(message: 'تسجيل الهالك يتطلب اتصالاً بالإنترنت'));
    }
  }

  Future<void> _onAdjustment(CountAdjustmentSubmitted event, Emitter<InventoryState> emit) async {
    try {
      final res = await repository.recordCount(productId: event.productId, countedQty: event.countedQty, notes: event.notes);
      emit(state.copyWith(message: 'تمت تسوية الجرد — المخزون ${res['newStock']}'));
      add(const InventoryRefreshRequested());
    } on ApiException catch (e) {
      emit(state.copyWith(message: e.message));
    } catch (_) {
      emit(state.copyWith(message: 'التسوية تتطلب اتصالاً بالإنترنت'));
    }
  }
}
