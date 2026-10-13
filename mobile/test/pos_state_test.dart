import 'package:flutter_test/flutter_test.dart';
import 'package:meqwat_mobile/core/sync/sync_repository.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_event.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_state.dart';

void main() {
  group('PosState', () {
    test('defaults to loading with empty queue stats', () {
      const s = PosState();
      expect(s.status, PosStatus.loading);
      expect(s.pendingCount, 0);
      expect(s.conflicts, isEmpty);
    });

    test('copyWith updates queue stats and keeps the rest', () {
      const s = PosState(status: PosStatus.ready, pendingCount: 1);
      final s2 = s.copyWith(pendingCount: 3, message: 'تم');
      expect(s2.status, PosStatus.ready);
      expect(s2.pendingCount, 3);
      expect(s2.message, 'تم');
      final s3 = s2.copyWith(clearMessage: true);
      expect(s3.message, isNull);
      expect(s3.pendingCount, 3);
    });

    test('states with same values are equal (Equatable)', () {
      const a = PosState(status: PosStatus.ready, pendingCount: 2);
      const b = PosState(status: PosStatus.ready, pendingCount: 2);
      expect(a, b);
    });
  });

  group('PosEvent', () {
    test('checkout event carries payload for equality', () {
      const e1 = PosCheckoutRequested(items: [
        {'productId': 'p1', 'qty': '2'}
      ], paidAmount: '100');
      const e2 = PosCheckoutRequested(items: [
        {'productId': 'p1', 'qty': '2'}
      ], paidAmount: '100');
      expect(e1, e2);
    });
  });

  group('SyncOutcome', () {
    test('defaults to zero counters', () {
      const o = SyncOutcome();
      expect(o.applied + o.duplicates + o.conflicts + o.failed, 0);
    });
  });
}
