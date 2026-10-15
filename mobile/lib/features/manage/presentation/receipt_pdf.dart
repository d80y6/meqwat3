import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// System print/share flow; actual printer compatibility requires hardware acceptance.
Future<Uint8List> buildReceiptPdf(Map<String,dynamic> row,{required bool purchase}) async {
  final font=pw.Font.ttf(await rootBundle.load('assets/fonts/Amiri-Regular.ttf'));
  final document=pw.Document();
  pw.Widget text(String value,{double size=12})=>pw.Text(value,textDirection:pw.TextDirection.rtl,style:pw.TextStyle(font:font,fontSize:size));
  document.addPage(pw.MultiPage(pageFormat:const PdfPageFormat(80*PdfPageFormat.mm,240*PdfPageFormat.mm,marginAll:4*PdfPageFormat.mm),build:(_)=>[
    text('مقوات — نسخة فاتورة ${purchase?'شراء':'بيع'}',size:18),
    text('رقم ${row['invoiceNo']??row['id']}'),
    text('${row['saleDate']??row['purchaseDate']}'),
    text('${row['customerName']??row['supplierName']??'نقدي'}'),pw.Divider(),
    for(final item in row['items'] as List)text('${item['productName']}\n${item['qty']} × ${item['unitPrice']??item['unitCost']} = ${item['total']} ر.ي'),
    pw.Divider(),text('الإجمالي ${row['totalAmount']} ر.ي'),text('الخصم ${row['discount']??'0'} ر.ي'),text('المدفوع ${row['paidAmount']} ر.ي'),text('المرتجعات ${row['returnedAmount']??'0'} ر.ي'),
  ]));
  return document.save();
}

Future<void> printReceipt(Map<String,dynamic> row,{required bool purchase}) async {
  final bytes=await buildReceiptPdf(row,purchase:purchase);
  await Printing.layoutPdf(name:'meqwat-${row['invoiceNo']??row['id']}.pdf',format:const PdfPageFormat(80*PdfPageFormat.mm,240*PdfPageFormat.mm),onLayout:(_ )async=>bytes);
}
