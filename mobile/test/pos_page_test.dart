import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mocktail/mocktail.dart';
import 'package:meqwat_mobile/core/api/api_client.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_bloc.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_event.dart';
import 'package:meqwat_mobile/features/pos/bloc/pos_state.dart';
import 'package:meqwat_mobile/features/pos/presentation/pos_page.dart';
class MockPagePosBloc extends MockBloc<PosEvent,PosState> implements PosBloc {}
void main(){
 setUpAll(()=>registerFallbackValue(const PosStarted()));
 testWidgets('fractional quantity produces exact checkout payload and retains cart until acknowledgement',(tester)async{
  tester.view.physicalSize=const Size(430,900);tester.view.devicePixelRatio=1;
  addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
  final bloc=MockPagePosBloc();
  when(()=>bloc.state).thenReturn(const PosState(status:PosStatus.ready,products:[{'id':'fixture','name':'fractional-item','sale_price':'2.40','stock_qty':'10','track_stock':1,'unit':'unit'}]));
  final api=ApiClient(baseUrl:'https://isolated.example',client:MockClient((_)async=>http.Response('{"ok":true,"data":{"items":[],"total":0}}',200)));
  await tester.pumpWidget(RepositoryProvider.value(value:api,child:BlocProvider<PosBloc>.value(value:bloc,child:const MaterialApp(home:PosPage()))));
  await tester.pumpAndSettle();
  await tester.longPress(find.text('fractional-item'));await tester.pumpAndSettle();
  await tester.enterText(find.descendant(of:find.byType(AlertDialog),matching:find.byType(TextField)),'0.125');
  await tester.tap(find.text('تطبيق'));await tester.pumpAndSettle();
  await tester.tap(find.text('إتمام البيع'));await tester.pump();
  final event=verify(()=>bloc.add(captureAny())).captured.single as PosCheckoutRequested;
  expect(event.items.single['qty'],'0.125');expect(event.paidAmount,'0.30');
  expect(find.text('fractional-item × 0.125'),findsOneWidget);
  expect(tester.takeException(),isNull);
 });
}
