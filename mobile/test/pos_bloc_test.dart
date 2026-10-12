import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:meqwat_mobile/core/sync/sync_repository.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_bloc.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_event.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_state.dart';
import 'package:meqwat_mobile/features/pos/data/pos_repository.dart';
import 'package:mocktail/mocktail.dart';

class MockPosRepository extends Mock implements PosRepository {}
class MockSyncRepository extends Mock implements SyncRepository {}

void main() {
  group('PosBloc offline-first checkout', () {
    late MockPosRepository repo;
    late MockSyncRepository sync;

    setUp(() {
      repo = MockPosRepository();
      sync = MockSyncRepository();
      when(() => repo.cachedProducts()).thenAnswer((_) async => []);
      when(() => repo.pendingCount()).thenAnswer((_) async => 1);
      when(() => repo.conflicts()).thenAnswer((_) async => []);
      when(() => repo.refreshCatalog()).thenAnswer((_) async {});
      when(() => repo.queueSale(
            items: any(named: 'items'),
            paidAmount: any(named: 'paidAmount'),
            customerId: any(named: 'customerId'),
            discount: any(named: 'discount'),
            label: any(named: 'label'),
          )).thenAnswer((_) async => 'mutation-1');
      when(() => sync.syncNow()).thenAnswer((_) async => const SyncOutcome());
    });

    blocTest<PosBloc, PosState>(
      'checkout queues locally first and keeps the sale visibly pending',
      build: () => PosBloc(repository: repo, sync: sync),
      seed: () => const PosState(status: PosStatus.ready),
      act: (bloc) => bloc.add(const PosCheckoutRequested(
        items: [{'productId': 'p1', 'qty': '2', 'unitPrice': '8000'}],
        paidAmount: '16000',
      )),
      wait: const Duration(milliseconds: 300),
      verify: (_) {
        // The sale hit the outbox (queueSale) and the pending count is tracked.
        verify(() => repo.queueSale(
              items: any(named: 'items'),
              paidAmount: '16000',
              customerId: any(named: 'customerId'),
              discount: any(named: 'discount'),
              label: any(named: 'label'),
            )).called(1);
      },
      expect: () => [
        // checkingOut → queue stats (pending=1) → saved-locally → sync attempt → ready
        isA<PosState>().having((s) => s.status, 'status', PosStatus.checkingOut),
        isA<PosState>().having((s) => s.pendingCount, 'pending', 1),
        isA<PosState>()
            .having((s) => s.status, 'status', PosStatus.ready)
            .having((s) => s.pendingCount, 'pending', 1),
        isA<PosState>().having((s) => s.status, 'status', PosStatus.syncing),
        isA<PosState>()
            .having((s) => s.status, 'status', PosStatus.ready)
            .having((s) => s.pendingCount, 'pending', 1),
      ],
    );
  });
}
