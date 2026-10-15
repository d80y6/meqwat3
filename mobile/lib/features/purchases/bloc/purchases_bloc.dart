import '../../../core/money/money.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../../../core/sync/sync_repository.dart';
import '../data/purchases_repository.dart';

sealed class PurchasesEvent extends Equatable {
  const PurchasesEvent();
  @override List<Object?> get props => [];
}
class PurchasesStarted extends PurchasesEvent { const PurchasesStarted(); }
class PurchasesRefreshed extends PurchasesEvent { const PurchasesRefreshed(); }
class PurchaseQueued extends PurchasesEvent {
  const PurchaseQueued({required this.supplierId, required this.items, required this.paidAmount, this.notes});
  final String supplierId;
  final List<Map<String, dynamic>> items;
  final String paidAmount;
  final String? notes;
  @override List<Object?> get props => [supplierId, items, paidAmount, notes];
}
class PurchasesSyncRequested extends PurchasesEvent { const PurchasesSyncRequested(); }

enum PurchasesStatus { loading, ready, saving, syncing, failure }

class PurchasesState extends Equatable {
  const PurchasesState({
    this.status = PurchasesStatus.loading,
    this.purchases = const [],
    this.suppliers = const [],
    this.products = const [],
    this.pendingCount = 0,
    this.message,
    this.savedCount=0,
  });
  final PurchasesStatus status;
  final List<Map<String, dynamic>> purchases;
  final List<Map<String, dynamic>> suppliers;
  final List<Map<String, dynamic>> products;
  final int pendingCount;
  final String? message;
  final int savedCount;
  PurchasesState copyWith({PurchasesStatus? status, List<Map<String, dynamic>>? purchases, List<Map<String, dynamic>>? suppliers, List<Map<String, dynamic>>? products, int? pendingCount, String? message, bool clearMessage = false, int? savedCount}) =>
    PurchasesState(savedCount:savedCount??this.savedCount,status: status ?? this.status, purchases: purchases ?? this.purchases, suppliers: suppliers ?? this.suppliers, products: products ?? this.products, pendingCount: pendingCount ?? this.pendingCount, message: clearMessage ? null : (message ?? this.message));
  @override List<Object?> get props => [status, purchases, suppliers, products, pendingCount, message, savedCount];
}

class PurchasesBloc extends Bloc<PurchasesEvent, PurchasesState> {
  PurchasesBloc({required this.repository, required this.sync}) : super(const PurchasesState()) {
    on<PurchasesStarted>(_onStarted);
    on<PurchasesRefreshed>(_onRefresh);
    on<PurchaseQueued>(_onQueued);
    on<PurchasesSyncRequested>(_onSync);
  }
  final PurchasesRepository repository;
  final SyncRepository sync;
  bool _saving=false;

  Future<void> _onStarted(PurchasesStarted e, Emitter<PurchasesState> emit) async {
    emit(state.copyWith(status: PurchasesStatus.loading));
    try {
      final results = await Future.wait([repository.purchases(), repository.suppliers(), repository.products()]);
      emit(state.copyWith(status: PurchasesStatus.ready, purchases: results[0], suppliers: results[1], products: results[2], pendingCount: await repository.pendingCount(), clearMessage: true));
    } on ApiException catch (ex) {
      emit(state.copyWith(status: PurchasesStatus.failure, message: ex.message));
    } catch (_) {
      emit(state.copyWith(status: PurchasesStatus.failure, message: 'تعذر تحميل المشتريات'));
    }
  }
  Future<void> _onRefresh(PurchasesRefreshed e, Emitter<PurchasesState> emit) async {
    try {
      final results = await Future.wait([repository.purchases(), repository.suppliers(), repository.products()]);
      emit(state.copyWith(status: PurchasesStatus.ready, purchases: results[0], suppliers: results[1], products: results[2], pendingCount: await repository.pendingCount(), clearMessage: true));
    } catch (_) {
      // offline: keep cached
    }
  }
  Future<void> _onQueued(PurchaseQueued e, Emitter<PurchasesState> emit) async {
    if(_saving)return;_saving=true;
    emit(state.copyWith(status: PurchasesStatus.saving));
    try {
      final total=e.items.fold<int>(0,(sum,i)=>sum+Money.line(i['qty'].toString(),i['unitCost'].toString()));
      if(Money.cents(e.paidAmount)>total)throw const FormatException('المدفوع أكبر من الإجمالي');
      await repository.queuePurchase(supplierId:e.supplierId,items:e.items,paidAmount:e.paidAmount,notes:e.notes,label:'فاتورة شراء — ${Money.format(total)}');
      emit(state.copyWith(status:PurchasesStatus.ready,savedCount:state.savedCount+1,message:'حُفظت الفاتورة محلياً'));
      add(const PurchasesSyncRequested());
    }catch(e){emit(state.copyWith(status:PurchasesStatus.ready,message:'لم تُحفظ الفاتورة — احتفظ بالبنود: $e'));}
    finally{_saving=false;}
  }
  Future<void> _onSync(PurchasesSyncRequested e, Emitter<PurchasesState> emit) async {
    emit(state.copyWith(status: PurchasesStatus.syncing));
    try {
      final out = await sync.syncNow();
      final results = await Future.wait([repository.purchases(), repository.suppliers()]);
      emit(state.copyWith(status: PurchasesStatus.ready, purchases: results[0], suppliers: results[1], pendingCount: await repository.pendingCount(), message: out.conflicts > 0 ? '${out.conflicts} عملية متعارضة' : (out.applied + out.duplicates > 0 ? 'تمت مزامنة ${out.applied + out.duplicates} فاتورة شراء' : null), clearMessage: out.applied + out.duplicates == 0 && out.conflicts == 0));
    } catch (_) {
      emit(state.copyWith(status: PurchasesStatus.ready, message: 'تعذّرت المزامنة — العمليات محفوظة', pendingCount: await repository.pendingCount()));
    }
  }
}
