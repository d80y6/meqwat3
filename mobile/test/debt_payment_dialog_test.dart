import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:meqwat_mobile/core/api/api_client.dart';
import 'package:meqwat_mobile/features/debts/bloc/debts_bloc.dart';
import 'package:meqwat_mobile/features/debts/presentation/debts_page.dart';
class MockDialogDebtBloc extends MockBloc<DebtsEvent,DebtsState> implements DebtsBloc {}
void main(){
 setUpAll(()=>registerFallbackValue(const DebtsStarted()));
 testWidgets('manual allocations are queued exactly and a storage failure keeps the input',(tester)async{
  tester.view.physicalSize=const Size(430,900);tester.view.devicePixelRatio=1;
  addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
  final bloc=MockDialogDebtBloc();
  when(()=>bloc.add(any())).thenAnswer((call){(call.positionalArguments.first as DebtPaymentSubmitted).saved!.complete(false);});
  final api=ApiClient(baseUrl:'https://isolated.example',client:MockClient((_)async=>http.Response('{"ok":true,"data":{"reconciled":true,"items":[{"id":"invoice","number":"1","outstanding":"0.30"}]}}',200)));
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:Builder(builder:(context)=>TextButton(onPressed:()=>showDialog<void>(context:context,builder:(_)=>DebtPaymentDialog(api:api,bloc:bloc,party:const {'id':'customer','name':'fixture','balance':'0.30'},kind:'customer_payment',label:'تحصيل')),child:const Text('open'))))));
  await tester.tap(find.text('open'));await tester.pumpAndSettle();
  await tester.tap(find.text('الأقدم أولاً'));await tester.pumpAndSettle();
  await tester.tap(find.text('اختيار يدوي').last);await tester.pumpAndSettle();
  await tester.enterText(find.byWidgetPredicate((w)=>w is TextField&&w.decoration?.labelText=='فاتورة 1'),'0.30');
  await tester.tap(find.text('تحصيل',skipOffstage:true).last);await tester.pumpAndSettle();
  final event=verify(()=>bloc.add(captureAny())).captured.single as DebtPaymentSubmitted;
  expect(event.amount,'0.30');expect(event.allocationMode,'manual');expect(event.allocations,[{'invoiceId':'invoice','amount':'0.30'}]);
  expect(find.byType(AlertDialog),findsOneWidget);expect(find.text('لم يُحفظ السداد. راجع الطابور ثم أعد المحاولة.'),findsOneWidget);
  expect(tester.takeException(),isNull);
 });
}
