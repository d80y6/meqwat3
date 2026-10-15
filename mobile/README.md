> **Audit status: NOT CERTIFIED.** Source ownership/session fixes have not been compiled or device-tested in this sandbox (Flutter SDK unavailable). Ownerless legacy outboxes are retained but excluded from replay. See `../docs/audit/OPERATIONS.md`.

# Meqwat Mobile (Flutter)

Offline-first POS client for qat shops, built with clean architecture + BLoC.

## Structure
```
lib/
  main.dart                        app bootstrap, Arabic RTL, DI wiring
  core/
    api/api_client.dart            HTTP client (cookie session, refresh-on-401)
    database/app_database.dart     SQLite: catalog cache + transactional outbox
    sync/sync_repository.dart      outbox → POST /api/sync verdict handling
  features/
    pos/
      bloc/                        PosBloc / events / states
      data/pos_repository.dart     queue-first checkout
      presentation/pos_page.dart   product grid, cart, sync banners
```

## Offline contract (identical to the web app)
1. Checkout writes to the SQLite **outbox first** with a stable
   `clientMutationId` (UUID) — works with zero connectivity.
2. `SyncRepository` pushes pending ops to `POST /api/sync`; the server
   deduplicates on the mutation id, so retries never double-charge.
3. Per-op verdicts: `applied` / `duplicate` are removed locally (and sales
   recorded as confirmed); `conflict` stays visible for cashier review;
   `error` retries later.
4. Locally pending vs server-confirmed is always visually distinct
   (amber/red banners in the POS screen).

## Run
```bash
flutter pub get
flutter run --dart-define=MEQWAT_API=https://your-server.example
```

## Status / honesty note
This client implements the full offline sync contract against the
production API, with login + POS modules. It is **compiled by GitHub
Actions on every push** (`.github/workflows/ci.yml`: scaffold generation →
`flutter analyze` → `flutter test` → `flutter build apk --debug`, APK kept
as a build artifact) because the development sandbox has no Flutter SDK.
Inventory/debts mobile screens follow the same pattern and are the next
iteration (the web app has them fully).
