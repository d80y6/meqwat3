import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:meqwat_mobile/core/sync/sync_repository.dart';
import 'package:meqwat_mobile/features/debts/bloc/debts_bloc.dart';
import 'package:meqwat_mobile/features/debts/data/debts_repository.dart';
class MockDebtsRepository extends Mock implements DebtsRepository {}
class MockDebtSync extends Mock implements SyncRepository {}
void main(){
 test('failed local payment save is not acknowledged and never synced',() async {
  final repo=MockDebtsRepository(),sync=MockDebtSync();
  when(()=>repo.queuePayment(kind:any(named:'kind'),customerId:any(named:'customerId'),supplierId:any(named:'supplierId'),amount:any(named:'amount'),label:any(named:'label'),allocationMode:any(named:'allocationMode'),allocations:any(named:'allocations'))).thenThrow(StateError('disk full'));
  final bloc=DebtsBloc(repository:repo,sync:sync);final saved=Completer<bool>();
  bloc.add(DebtPaymentSubmitted(kind:'customer_payment',partyId:'fixture',amount:'0.10',label:'fixture',saved:saved));
  expect(await saved.future,false);await bloc.close();verifyNever(()=>sync.syncNow());
 });
 test('durable payment acknowledgement survives a later count/read failure',() async {
  final repo=MockDebtsRepository(),sync=MockDebtSync();
  when(()=>repo.queuePayment(kind:any(named:'kind'),customerId:any(named:'customerId'),supplierId:any(named:'supplierId'),amount:any(named:'amount'),label:any(named:'label'),allocationMode:any(named:'allocationMode'),allocations:any(named:'allocations'))).thenAnswer((_)async=>'stored');
  when(()=>repo.pendingCount()).thenThrow(StateError('read failed'));
  final bloc=DebtsBloc(repository:repo,sync:sync);final saved=Completer<bool>();
  bloc.add(DebtPaymentSubmitted(kind:'customer_payment',partyId:'fixture',amount:'0.10',label:'fixture',saved:saved));
  expect(await saved.future,true);await bloc.close();
 });
}
