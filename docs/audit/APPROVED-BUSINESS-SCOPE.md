# Approved business scope — 2026-10-15

Explicit user decisions in this session:
1. Payments: default oldest-invoice-first allocation **and** authorized manual invoice selection.
2. Consignment: **not required**; purchased inventory only.
3. Branches: independent stock and cash, branch access permissions and auditable transfers.
4. Accounting: operational ledgers, not a full double-entry GL/fiscal-closing product.

Implementation must preserve immutable original invoices/payments and exact money,
atomic/idempotent allocations and reversals. Historical aggregate settlements must not
be silently assigned to invoices. Any historical migration needs explicit operator
reconciliation evidence. Current implementations and release evidence remain in
COMPLETION-STATUS.md; the scope decisions above are not a claim of completion.
