import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
class ReportsPage extends StatefulWidget{
 const ReportsPage({super.key});
 @override
 State<ReportsPage> createState()=>_ReportsPageState();
}
class _ReportsPageState extends State<ReportsPage>{
 Map<String,dynamic>? _data;String? _error;DateTimeRange? _range;bool _busy=false;
 @override
 void initState(){super.initState();_load();}
 Future<void> _load()async{setState(()=>_busy=true);try{String day(DateTime d)=>d.toIso8601String().substring(0,10);final query=_range==null?'':'?from=${day(_range!.start)}&to=${day(_range!.end)}';final data=await context.read<ApiClient>().get('/api/reports$query');if(mounted)setState(()=>_data=data);}catch(e){if(mounted)setState(()=>_error=e.toString());}finally{if(mounted)setState(()=>_busy=false);}}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('التقارير'),actions:[IconButton(onPressed:_busy?null:_load,icon:const Icon(Icons.refresh))]),body:ListView(padding:const EdgeInsets.all(20),children:[
  FilledButton(onPressed:()async{final range=await showDateRangePicker(context:context,firstDate:DateTime(2020),lastDate:DateTime(2100));if(range!=null&&mounted){setState(()=>_range=range);await _load();}},child:const Text('الفترة — حسب توقيت المتجر +03')),
  if(_busy)const LinearProgressIndicator(),if(_error!=null)Text(_error!),if(_data!=null)...[
   const Text('الربح إجمالي قبل المصروفات، وليس قوائم مالية معتمدة.'),
   for(final entry in {'إجمالي المبيعات':(_data!['sales'] as Map)['gross'],'الخصومات':(_data!['sales'] as Map)['discounts'],'المرتجعات':(_data!['sales'] as Map)['returns'],'التكلفة':_data!['cogs'],'إجمالي الربح':_data!['grossProfit'],'خسارة الهالك':(_data!['spoilage'] as Map)['value']}.entries)Card(child:ListTile(title:Text(entry.key),trailing:Text('${entry.value} ر.ي'))),
   const Text('حركات دفتر النقد'),for(final entry in _data!['ledger'] as List)ListTile(title:Text('${entry['type']}'),trailing:Text('${entry['total']} ر.ي')),
   const Text('الأصناف الأكثر مبيعاً'),for(final entry in _data!['topProducts'] as List)ListTile(title:Text('${entry['name']}'),subtitle:Text('الكمية ${entry['qtySold']} · الإيراد ${entry['revenue']} · الربح ${entry['profit']}')),
  ],
 ]));
}
