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

## Current completion checkpoint

Native source includes POS customer/partial-payment/discount/shift selection; purchases;
role-aware navigation; master-data/user forms; sales/receipt viewing and returns;
registers/shifts/expenses; reports; subscription requests; password change/reset;
and a queue/conflict review screen. Actual server permissions remain authoritative.

Money uses integer minor units. POS/purchase forms clear only after SQLite acknowledgement.
Financial direct requests retain durable retry IDs. SQLite v2 adds owner-scoped request keys
and response caches; legacy ownerless operations are retained, not assigned to a new user.
Foreground sync retries every 30 seconds while HomeShell is alive, with a single-flight guard.
This is NOT an operating-system background service or a cold-offline login guarantee.

The local sandbox has no Flutter/Dart. Dart source has syntax-only parser checks; those are
not compilation or device evidence. GitHub CI is being exercised for dependency resolution,
analyze, tests and a debug APK. Do not distribute until the actual run passes and device
acceptance closes. Use the run status recorded in docs/audit/COMPLETION-STATUS.md.

Still required: secure persistent session/offline unlocking policy, durable device restart
and multi-user acceptance, storage-full/conflict repair UX, actual thermal printing, signed
release/store distribution and production endpoint/TLS validation. Receipt text copying is
not printer integration. API base URL must be supplied via MEQWAT_API; the default is a
placeholder. No credentials or production endpoints are embedded.
