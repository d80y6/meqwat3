import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/api/api_client.dart';
import 'core/database/app_database.dart';
import 'core/sync/sync_repository.dart';
import 'features/pos/bloc/pos_bloc.dart';
import 'features/pos/data/pos_repository.dart';
import 'features/pos/presentation/pos_page.dart';

/// Meqwat mobile — offline-first POS client.
///
/// Architecture (clean architecture + BLoC):
///   presentation (pages/widgets) → bloc (events/states) → repositories →
///   data sources (ApiClient over HTTPS, AppDatabase over SQLite).
/// Every sale/purchase/payment is written to the local SQLite outbox FIRST
/// with a stable clientMutationId, then synced via POST /api/sync. The
/// server deduplicates on that id, so retries are always safe.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = await AppDatabase.open();
  final api = ApiClient(baseUrl: const String.fromEnvironment('MEQWAT_API', defaultValue: 'https://app.meqwat.example'));
  final sync = SyncRepository(api: api, db: db);
  final posRepo = PosRepository(api: api, db: db);
  runApp(MeqwatApp(db: db, sync: sync, posRepo: posRepo));
}

class MeqwatApp extends StatelessWidget {
  const MeqwatApp({super.key, required this.db, required this.sync, required this.posRepo});

  final AppDatabase db;
  final SyncRepository sync;
  final PosRepository posRepo;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: sync),
        RepositoryProvider.value(value: posRepo),
      ],
      child: BlocProvider(
        create: (_) => PosBloc(repository: posRepo, sync: sync)..add(const PosStarted()),
        child: MaterialApp(
          title: 'مقوات',
          debugShowCheckedModeBanner: false,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF346B31)),
            fontFamily: 'IBM Plex Sans Arabic',
          ),
          home: const PosPage(),
        ),
      ),
    );
  }
}
