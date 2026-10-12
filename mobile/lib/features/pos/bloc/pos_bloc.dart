import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/sync/sync_repository.dart';
import '../data/pos_repository.dart';
import 'pos_event.dart';
import 'pos_state.dart';

/// POS business logic. The bloc never treats a locally-queued sale as
/// confirmed: states keep `pendingCount` and `conflicts` separate from
/// server data so the UI can always distinguish them.
class PosBloc extends Bloc<PosEvent, PosState> {
  PosBloc({required this.repository, required this.sync}) : super(const PosState()) {
    on<PosStarted>(_onStarted);
    on<PosRefreshCatalog>(_onRefreshCatalog);
    on<PosCheckoutRequested>(_onCheckout);
    on<PosSyncRequested>(_onSync);
  }

  final PosRepository repository;
  final SyncRepository sync;

  Future<void> _emitQueueStats(Emitter<PosState> emit) async {
    emit(state.copyWith(
      pendingCount: await repository.pendingCount(),
      conflicts: await repository.conflicts(),
    ));
  }

  Future<void> _onStarted(PosStarted event, Emitter<PosState> emit) async {
    emit(state.copyWith(products: await repository.cachedProducts()));
    await _emitQueueStats(emit);
    emit(state.copyWith(status: PosStatus.ready));
    add(const PosRefreshCatalog());
  }

  Future<void> _onRefreshCatalog(PosRefreshCatalog event, Emitter<PosState> emit) async {
    try {
      await repository.refreshCatalog();
      emit(state.copyWith(products: await repository.cachedProducts(), clearMessage: true));
    } catch (_) {
      // Offline: silently keep the cached catalog.
    }
  }

  Future<void> _onCheckout(PosCheckoutRequested event, Emitter<PosState> emit) async {
    emit(state.copyWith(status: PosStatus.checkingOut));
    final totalQty = event.items.fold<num>(0, (s, i) => s + (num.tryParse(i['qty'].toString()) ?? 0));
    await repository.queueSale(
      items: event.items,
      paidAmount: event.paidAmount,
      customerId: event.customerId,
      discount: event.discount,
      label: 'فاتورة بيع — $totalQty صنف',
    );
    await _emitQueueStats(emit);
    emit(state.copyWith(
      status: PosStatus.ready,
      message: 'حُفظت الفاتورة محلياً — ستُرحَّل عند توفر الاتصال',
    ));
    add(const PosSyncRequested());
  }

  Future<void> _onSync(PosSyncRequested event, Emitter<PosState> emit) async {
    emit(state.copyWith(status: PosStatus.syncing));
    try {
      final out = await sync.syncNow();
      await _emitQueueStats(emit);
      await repository.refreshCatalog().catchError((_) {});
      emit(state.copyWith(
        products: await repository.cachedProducts(),
        status: PosStatus.ready,
        message: out.conflicts > 0
            ? '${out.conflicts} عملية متعارضة تحتاج مراجعة'
            : (out.applied + out.duplicates > 0 ? 'تمت مزامنة ${out.applied + out.duplicates} فاتورة' : null),
        clearMessage: out.applied + out.duplicates == 0 && out.conflicts == 0,
      ));
    } catch (_) {
      await _emitQueueStats(emit);
      emit(state.copyWith(status: PosStatus.ready, message: 'تعذّرت المزامنة — العمليات محفوظة محلياً'));
    }
  }
}
