import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/api/api_client.dart';
import 'core/database/app_database.dart';
import 'core/sync/sync_repository.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/pos/bloc/pos_bloc.dart';
import 'features/pos/bloc/pos_event.dart';
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
  final api = ApiClient(
    baseUrl: const String.fromEnvironment(
      'MEQWAT_API',
      defaultValue: 'https://app.meqwat.example',
    ),
  );
  final sync = SyncRepository(api: api, db: db);
  final posRepo = PosRepository(api: api, db: db);
  runApp(MeqwatApp(api: api, sync: sync, posRepo: posRepo));
}

class MeqwatApp extends StatelessWidget {
  const MeqwatApp({
    super.key,
    required this.api,
    required this.sync,
    required this.posRepo,
  });

  final ApiClient api;
  final SyncRepository sync;
  final PosRepository posRepo;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: sync),
        RepositoryProvider.value(value: posRepo),
        RepositoryProvider.value(value: api),
      ],
      child: BlocProvider(
        create: (_) =>
            PosBloc(repository: posRepo, sync: sync)..add(const PosStarted()),
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
            colorScheme:
                ColorScheme.fromSeed(seedColor: const Color(0xFF346B31)),
            fontFamily: 'IBM Plex Sans Arabic',
          ),
          home: const _AuthGate(),
        ),
      ),
    );
  }
}

/// Shows the login screen until the API session is established, then the
/// POS. The session itself lives in httpOnly cookies handled by ApiClient.
class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  bool _loggedIn = false;

  @override
  Widget build(BuildContext context) {
    if (!_loggedIn) {
      return LoginPage(
        onLoggedIn: () {
          setState(() => _loggedIn = true);
          context.read<PosBloc>().add(const PosRefreshCatalog());
        },
      );
    }
    return const PosPage();
  }
}
