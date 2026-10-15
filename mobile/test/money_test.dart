import 'package:flutter_test/flutter_test.dart';
import 'package:meqwat_mobile/core/money/money.dart';
void main() {
  test('minor units never produce float payloads', () {
    expect(Money.format(Money.cents('0.10') + Money.cents('0.20')), '0.30');
    expect(Money.line('0.333', '100'), 3330);
    expect(Money.format(Money.line('3', '4500.50')), '13501.50');
    expect(Money.format(Money.cents('0.30') - Money.cents('0.10')), '0.20');
  });
  test('invalid precision and exponent input rejected', () {
    for (final value in ['0.001','1e3','-1','NaN','']) {
      expect(() => Money.cents(value), throwsFormatException);
    }
    expect(() => Money.line('1.0001','1'), throwsFormatException);
  });
}
