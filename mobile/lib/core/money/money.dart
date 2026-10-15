/// Exact decimal arithmetic shared by mobile drafts and outbound payloads.
/// Never parse money through double/num or silently round user input.
class Money {
  static BigInt _scaled(String value, int scale, BigInt max) {
    final s = value.trim();
    if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(s) || s.length > 40) {
      throw const FormatException('أدخل مبلغاً عشرياً غير سالب');
    }
    final parts = s.split('.');
    final fraction = (parts.length == 2 ? parts[1] : '').replaceFirst(RegExp(r'0+$'), '');
    if (fraction.length > scale) throw const FormatException('دقة المبلغ أو الكمية غير صالحة');
    final n = BigInt.parse(parts[0]) * BigInt.from(10).pow(scale) + BigInt.parse(fraction.padRight(scale, '0'));
    if (n > max) throw const FormatException('القيمة تتجاوز الحد المسموح');
    return n;
  }
  static int quantity(String value) => _scaled(value,3,BigInt.parse('999999999999')).toInt();
  static String formatQuantity(int millis) {
    if(millis<0 || millis>999999999999)throw const FormatException('الكمية تتجاوز الحد');
    return '${millis ~/ 1000}.${(millis % 1000).toString().padLeft(3,'0')}';
  }
  static int cents(String value) => _scaled(value, 2, BigInt.parse('99999999999999')).toInt();
  static String format(int cents) {
    if (cents.abs() > 99999999999999) throw const FormatException('القيمة تتجاوز الحد المسموح');
    return '${cents < 0 ? '-' : ''}${cents.abs() ~/ 100}.${(cents.abs() % 100).toString().padLeft(2, '0')}';
  }
  static int line(String qty, String price) {
    final q = _scaled(qty, 3, BigInt.parse('999999999999'));
    final result = (q * BigInt.from(cents(price)) + BigInt.from(500)) ~/ BigInt.from(1000);
    if (result > BigInt.parse('99999999999999')) throw const FormatException('الإجمالي يتجاوز الحد');
    return result.toInt();
  }
}
