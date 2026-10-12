import 'package:equatable/equatable.dart';

enum PosStatus { loading, ready, checkingOut, syncing, failure }

class PosState extends Equatable {
  const PosState({
    this.status = PosStatus.loading,
    this.products = const [],
    this.customers = const [],
    this.pendingCount = 0,
    this.conflicts = const [],
    this.message,
    this.lastInvoiceNo,
  });

  final PosStatus status;
  final List<Map<String, Object?>> products;
  final List<Map<String, Object?>> customers;

  /// Locally queued, NOT yet server-confirmed — always shown distinctly.
  final int pendingCount;

  /// Server-rejected operations awaiting cashier review.
  final List<Map<String, Object?>> conflicts;

  final String? message;
  final int? lastInvoiceNo;

  PosState copyWith({
    PosStatus? status,
    List<Map<String, Object?>>? products,
    List<Map<String, Object?>>? customers,
    int? pendingCount,
    List<Map<String, Object?>>? conflicts,
    String? message,
    int? lastInvoiceNo,
    bool clearMessage = false,
  }) {
    return PosState(
      status: status ?? this.status,
      products: products ?? this.products,
      customers: customers ?? this.customers,
      pendingCount: pendingCount ?? this.pendingCount,
      conflicts: conflicts ?? this.conflicts,
      message: clearMessage ? null : (message ?? this.message),
      lastInvoiceNo: lastInvoiceNo ?? this.lastInvoiceNo,
    );
  }

  @override
  List<Object?> get props => [status, products, customers, pendingCount, conflicts, message, lastInvoiceNo];
}
