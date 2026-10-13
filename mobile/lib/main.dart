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
import 'features/purchases/bloc/purchases_bloc.dart';
import 'features/purchases/data/purchases_repository.dart';
import 'features/purchases/presentation/purchases_page.dart';

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
  final purchasesRepo = PurchasesRepository(api: api, db: db);
  final inventoryRepo = InventoryRepository(api: api);
  final debtsRepo = DebtsRepository(api: api, db: db);
  final authRepo = AuthRepository(api: api);
  runApp(MeqwatApp(
    api: api,
    sync: sync,
    posRepo: posRepo,
    purchasesRepo: purchasesRepo,
    inventoryRepo: inventoryRepo,
    debtsRepo: debtsRepo,
    authRepo: authRepo,
  ));
}

class MeqwatApp extends StatelessWidget {
  const MeqwatApp({
    super.key,
    required this.api,
    required this.sync,
    required this.posRepo,
    required this.purchasesRepo,
    required this.inventoryRepo,
    required this.debtsRepo,
    required this.authRepo,
  });

  final ApiClient api;
  final SyncRepository sync;
  final PosRepository posRepo;
  final PurchasesRepository purchasesRepo;
  final InventoryRepository inventoryRepo;
  final DebtsRepository debtsRepo;
  final AuthRepository authRepo;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: sync),
        RepositoryProvider.value(value: posRepo),
        RepositoryProvider.value(value: purchasesRepo),
        RepositoryProvider.value(value: inventoryRepo),
        RepositoryProvider.value(value: debtsRepo),
        RepositoryProvider.value(value: api),
        RepositoryProvider.value(value: authRepo),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider(create: (_) => AuthBloc(repository: authRepo)..add(const AuthSessionChecked())),
          BlocProvider(create: (_) => PosBloc(repository: posRepo, sync: sync)..add(const PosStarted())),
          BlocProvider(create: (_) => PurchasesBloc(repository: purchasesRepo, sync: sync)..add(const PurchasesStarted())),
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
            fontFamily: 'IBM Plex Sans Arabic',
          ),
          home: const AuthGate(),
        ),
      ),
    );
  }
}

/// Shows the login screen until the API session is established, then the tabbed home.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        if (state is AuthAuthenticated) return const HomeShell();
        if (state is AuthLoading || state is AuthInitial) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return LoginPage(
          onLoggedIn: () {
            context.read<AuthBloc>().add(const AuthSessionChecked());
            context.read<PosBloc>().add(const PosRefreshCatalog());
            context.read<PurchasesBloc>().add(const PurchasesStarted());
            context.read<InventoryBloc>().add(const InventoryRefreshRequested());
            context.read<DebtsBloc>().add(const DebtsRefreshRequested());
          },
        );
      },
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = const [PosPage(), PurchasesPage(), InventoryPage(), DebtsPage()];
    return Scaffold(
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              DrawerHeader(
                decoration: const BoxDecoration(color: Color(0xFF346B31)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.store, color: Colors.white, size: 36),
                    const SizedBox(height: 8),
                    BlocBuilder<AuthBloc, AuthState>(
                      builder: (context, state) {
                        final name = state is AuthAuthenticated ? state.name : 'مقوات';
                        final role = state is AuthAuthenticated ? state.role : '';
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                            Text(role, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('تسجيل خروج'),
                onTap: () {
                  Navigator.pop(context);
                  context.read<AuthBloc>().add(const AuthLogoutRequested());
                },
              ),
              const Divider(),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text('مقوات v1.0.0 — عمل دون اتصال آمن', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) {
          setState(() => _index = i);
          if (i == 2) context.read<InventoryBloc>().add(const InventoryRefreshRequested());
          if (i == 3) context.read<DebtsBloc>().add(const DebtsRefreshRequested());
          if (i == 1) context.read<PurchasesBloc>().add(const PurchasesStarted());
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.shopping_cart), label: 'البيع'),
          NavigationDestination(icon: Icon(Icons.shopping_cart_checkout), label: 'المشتريات'),
          NavigationDestination(icon: Icon(Icons.inventory_2), label: 'المخزون'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: 'الديون'),
        ],
      ),
    );
  }
}
