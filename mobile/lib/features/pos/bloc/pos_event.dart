import 'package:equatable/equatable.dart';

sealed class PosEvent extends Equatable {
  const PosEvent();
  @override
  List<Object?> get props => [];
}

class PosStarted extends PosEvent {
  const PosStarted();
}

/// Local-first checkout: enqueues into the SQLite outbox, then attempts an
/// immediate sync if connectivity is available.
class PosCheckoutRequested extends PosEvent {
  const PosCheckoutRequested({
    required this.items,
    required this.paidAmount,
    this.customerId,
    this.shiftId, this.registerId,
    this.discount = '0',
  });

  /// [{productId, qty, unitPrice}]
  final List<Map<String, dynamic>> items;
  final String paidAmount;
  final String? customerId;
  final String? shiftId, registerId;
  final String discount;

  @override
  List<Object?> get props => [items, paidAmount, customerId, discount, shiftId, registerId];
}

class PosSyncRequested extends PosEvent {
  const PosSyncRequested();
}

class PosRefreshCatalog extends PosEvent {
  const PosRefreshCatalog();
}
