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

OS secure storage retains sessions; cold offline reopen accepts a last-verified identity for
at most eight hours, capped by subscription expiry. Server reauthorization still controls
postings. This is not biometric/app-PIN authentication.

Still required: full whole-app multi-user acceptance, storage-full UX and actual thermal printing, signed
release/store distribution and production endpoint/TLS validation. Arabic 80mm PDF receipts use
a bundled OFL Amiri font and the OS print dialog; printer hardware is not certified. API base URL must be supplied via MEQWAT_API; the default is a
placeholder. No credentials or production endpoints are embedded.


## Android release
Android sources are tracked; CI generates only missing wrapper/icon scaffolding. Tested
build configuration uses Gradle 8.14.3, AGP 8.11.1, Kotlin 2.2.20 and Java 17. Review the
`com.meqwat.mobile` application ID before first publication. Release builds require a private
`android/key.properties` (storeFile, storePassword, keyAlias, keyPassword); it and keystores
are ignored. Never put signing credentials into chat or source control. There is no debug-key
fallback for release. Supply `--dart-define=MEQWAT_API=https://YOUR_AUTHORIZED_ORIGIN`.

Latest executed hosted evidence: see `docs/audit/COMPLETION-STATUS.md` in the repository root.


## Checkout and recovery
- Tap a product to add one unit; long-press it or tap its cart line to enter an exact fractional quantity (three decimals). Zero removes a line.
- Sale, purchase and debt payment success means **durably queued**, not posted. Server results and conflicts remain visible in the outbox.
- Debt dialogs retain input on storage failure. A successful save followed by a failed refresh must be reconciled from the outbox, not entered again.
- Unposted conflicts may be cancelled with a reason through the server. Their original local records remain; corrections are a new entry. Already-posted documents cannot be cancelled by this mechanism.


## Invoice settlements
Debt payment dialogs default to oldest-invoice-first and offer manual allocation. Allocation
choices are saved with the outbox operation; the server revalidates outstanding amounts on
sync. Payment history exposes immutable allocations, full compensating reversals and
owner-only historical reconciliation with a reason. Online actions preserve retry IDs.
Historical discrepancies are surfaced, not assigned to invoices silently. No consignment
or full general ledger is in the approved scope. Separate branch stock/cash remains pending.
