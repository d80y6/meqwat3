import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:meqwat_mobile/features/manage/presentation/receipt_pdf.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('Arabic receipt generates a PDF with a bundled offline font',()async{
  final bytes=await buildReceiptPdf({'id':'fixture','invoiceNo':1,'saleDate':'2026-10-15','customerName':'عميل تجريبي','items':[{'productName':'صنف تجريبي','qty':'1','unitPrice':'0.30','total':'0.30'}],'totalAmount':'0.30','discount':'0.10','paidAmount':'0.20','returnedAmount':'0.00'},purchase:false);
  expect(ascii.decode(bytes.take(5).toList()),'%PDF-');expect(bytes.length,greaterThan(1000));
 });
}
