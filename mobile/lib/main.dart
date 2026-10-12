import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/api/api_client.dart';
import 'core/database/app_database.dart';
import 'core/sync/sync_repository.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/debts/bloc/debts_bloc.dart';
import 'features/debts/data/debts_repository.dart';
import 'features/debts/presentation/debts_page.dart';
import 'features/inventory/bloc/inventory_bloc.dart';
import 'features/inventory/data/inventory_repository.dart';
import 'features/inventory/presentation/inventory_page.dart';
import 'features/pos/bloc/pos_bloc.dart';
import 'features/pos/bloc/pos_event.dart';
import 'features/pos/data/pos_repository.dart';
import 'features/pos/presentation/pos_page.dart';

/// Meqwat mobile — offline-first client for qat shops.
///
/// Clean architecture + BLoC:
///   presentation → bloc (events/states) → repositories →
///   data sources (ApiClient over HTTPS, AppDatabase over SQLite).
/// Sales/payments are written to the local SQLite outbox FIRST with a
/// stable clientMutationId, then synced via POST /api/sync; the server
/// deduplicates on that id, so retries are always safe.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = await AppDatabase.open();
  final api = ApiClient(baseUrl: const String.fromEnvironment('MEQWAT_API', defaultValue: 'https://app.meqwat.example'));
  final sync = SyncRepository(api: api, db: db);
  runApp(MeqwatApp(
    authRepo: AuthRepository(api: api),
    posRepo: PosRepository(api: api, db: db),
    inventoryRepo: InventoryRepository(api: api),
    debtsRepo: DebtsRepository(api: api, db: db),
    sync: sync,
  ));
}

class MeqwatApp extends StatelessWidget {
  const MeqwatApp({
    super.key,
    required this.authRepo,
    required this.posRepo,
    required this.inventoryRepo,
    required this.debtsRepo,
    required this.sync,
  });

  final AuthRepository authRepo;
  final PosRepository posRepo;
  final InventoryRepository inventoryRepo;
  final DebtsRepository debtsRepo;
  final SyncRepository sync;

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AuthBloc(repository: authRepo)..add(const AuthSessionChecked())),
        BlocProvider(create: (_) => PosBloc(repository: posRepo, sync: sync)..add(const PosStarted())),
        BlocProvider(create: (_) => InventoryBloc(repository: inventoryRepo)..add(const InventoryStarted())),
        BlocProvider(create: (_) => DebtsBloc(repository: debtsRepo, sync: sync)..add(const DebtsStarted())),
      ],
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
        ),
        home: BlocBuilder<AuthBloc, AuthState>(
          builder: (context, state) {
            if (state is AuthAuthenticated) return const HomeShell();
            if (state is AuthInitial) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            return const LoginPage();
          },
        ),
      ),
    );
  }
}

/// Authenticated shell: POS / Inventory / Debts bottom navigation.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [PosPage(), InventoryPage(), DebtsPage()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.point_of_sale), label: 'نقطة البيع'),
          NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'المخزون'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'الديون'),
        ],
      ),
      floatingActionButton: _index == 0
          ? FloatingActionButton.small(
              heroTag: 'logout',
              tooltip: 'تسجيل الخروج',
              onPressed: () => context.read<AuthBloc>().add(const AuthLogoutRequested()),
              child: const Icon(Icons.logout),
            )
          : null,
    );
  }
}
