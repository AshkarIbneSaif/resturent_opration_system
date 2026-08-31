# Restaurant Operations System (ROS)

A working restaurant POS/operations platform — not a mockup. Every screen
here talks to a real backend, a real database, and enforces real
server-side authorization.

## What's implemented

**Backend** (`/backend`) — feature-complete for the MVP core order
lifecycle, 60 automated tests, all passing:
- Auth (bcrypt + JWT), granular permission system, login/audit logging
- Restaurant identity, tables, full menu management (categories, items,
  variants, modifiers, kitchen availability)
- Order lifecycle state machine, item-level kitchen states, real-time
  events (Socket.IO), idempotent order submission
- Billing, atomic payment recording (partial payment supported), 80mm
  receipt data pipeline + text renderer
- Sales / product performance / waiter performance / order-statistics
  reports, computed from real transactional data
- Read-only audit trail
- Full-database backup/export and restore/import (`/backup/export`,
  `/backup/import`), gated behind the `backup.restore` permission and the
  critical-action passphrase

**Frontend** (`/frontend`) — all six role interfaces:
- Waiter POS (tables → menu/cart → send to kitchen → track status →
  request bill)
- Kitchen Display System (live queue, per-item status, elapsed-time
  urgency indicator)
- Cashier POS (search by Order ID, generate bill, record payment, view
  receipt)
- Manager Dashboard (menu + table management, live price editing)
- Owner Dashboard (sales overview, staff management, restaurant identity
  as a critical action, audit log viewer, full data export/import)
- Takeout POS (customer info, menu/cart, no table required)

## Backup & restore

The Owner Dashboard's **Data** tab (and `GET /backup/export` /
`POST /backup/import` directly) can export the entire live database as a
single downloadable `.sqlite` file, and restore one back. This is a
byte-exact export of the raw SQLite file `persist()` already writes to
disk — not a hand-rolled JSON dump — so it round-trips every table, every
foreign key, and every password hash exactly, with none of the risk a
custom JSON serializer would carry (silently coercing a boolean, dropping
a column added later, etc.).

- **Export** requires the `backup.restore` permission (Owner by default)
  and is audit-logged (`DATABASE_EXPORTED`).
- **Restore** is a critical action — it requires both the
  `backup.restore` permission and the critical-action passphrase — because
  it replaces every table in the live database, including user accounts
  and password hashes, with the contents of the uploaded file. The
  frontend forces a re-login immediately after a successful restore, since
  the account that performed it may no longer exist (or exist with
  different credentials) in the restored data.
- Before any restore is applied, the candidate file is validated in
  isolation (SQLite header check, then a check that it contains ROS's
  core tables) — a corrupt or unrelated upload is rejected before it ever
  touches the live database. The server also writes a timestamped
  safety copy of the outgoing database to `backend/backups/` before every
  restore, as a last-resort recovery path (not exposed through the API).
- What this **doesn't** cover: merging two independently-operated
  branches' data together (it's a whole-database swap, same trade-off
  already accepted for sql.js generally — see below), and a browsable
  history of past backups (only the most recent pre-restore safety copy is
  kept on disk).

## Known scope gaps (documented, not hidden)

- **Database**: this environment had no reachable PostgreSQL server, so
  the backend runs on **sql.js** (SQLite compiled to WebAssembly) via
  Drizzle ORM. This was a deliberate choice over `better-sqlite3`, which
  requires a native C++ compile step (node-gyp) that fails on machines
  without a C++ toolchain installed — most commonly Windows without
  Visual Studio Build Tools. sql.js needs **zero native compilation** —
  `npm install` just works everywhere Node runs. The trade-off: sql.js
  keeps the whole database in memory and has no built-in file durability
  of its own, so this backend manually persists it to `dev.db` after
  every write (see `backend/src/api/middleware/persistence.ts` and the
  explicit `persist()` calls in the payment/counter services). This was
  verified by hard-killing the running server mid-order and confirming
  the data survived a restart. Switching to PostgreSQL for a real
  deployment (see the note in `backend/src/infra/db/schema.ts`) replaces
  this file entirely with a real server connection regardless, so this
  trade-off only matters for local/dev use, which is what it's for.
- **Thermal printing**: the receipt pipeline stops at a printer-agnostic
  text renderer (`/receipts/customer/:orderId/text`). Actual ESC/POS
  byte-stream output to real 80mm hardware isn't implemented — there's no
  printer to test against, and your own `OPEN_QUESTIONS.md` leaves the
  exact printer model undecided.
- **Offline resilience** and the Phase 9 hardening pass (security review,
  load testing, etc.) are not implemented. (Backup/restore, previously
  listed here too, now is — see "Backup & restore" above.)
- Variants/modifiers exist fully in the backend and data model but aren't
  wired into the Waiter/Takeout cart UI yet (only base items are
  orderable from the frontend right now).

## Running it locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # edit AUTH_SECRET etc. for anything beyond local testing
npm run migrate
npm run bootstrap             # prints a one-time OWNER password if you don't set one — see below
npm run seed:demo             # optional — adds demo tables/menu/staff
npm run dev
```

**Windows PowerShell users**: `cp` isn't a PowerShell command — use `copy .env.example .env` instead.
To set a specific owner password instead of the auto-generated one, set the
env var first, then run bootstrap, in whichever syntax your shell uses:

```powershell
# PowerShell
$env:OWNER_BOOTSTRAP_PASSWORD = "Owner123!"
npm run bootstrap
```

```bash
# macOS/Linux/WSL
OWNER_BOOTSTRAP_PASSWORD=Owner123! npm run bootstrap
```

Backend listens on `http://localhost:4000` by default.

Run the test suite: `npm test` (or `npx vitest run`) — 60 tests.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL, defaults to http://localhost:4000 — on Windows PowerShell use `copy` instead of `cp`
npm run dev
```

Frontend dev server runs on `http://localhost:5173`.

### Demo accounts (if you ran `seedDemo.ts`)

| Role    | Username | Password     |
|---------|----------|--------------|
| Owner   | owner    | Owner123!    |
| Manager | manager  | Manager123!  |
| Waiter  | waiter   | Waiter123!   |
| Kitchen | kitchen  | Kitchen123!  |
| Cashier | cashier  | Cashier123!  |
| Takeout | takeout  | Takeout123!  |

8 tables (01–08) and 7 menu items across Burgers/Sides/Drinks are
pre-seeded.

## Suggested test flow

1. Log in as `waiter` → pick a table → add items → **Send to Kitchen**.
2. Log in as `kitchen` (separate browser/incognito tab) → watch the order
   appear in the queue → **Start** → **Mark Ready** on each item.
3. Back as `waiter` → **My Orders** shows live status. Once all items are
   ready, tap **Mark Served**, then **Request Bill**.
4. Log in as `cashier` → search by the Order ID shown on the waiter
   screen → **Generate Bill** → **Record Payment** → see the rendered
   receipt inline.
5. Log in as `owner` → **Overview** tab shows the sales total update in
   real time; **Audit** tab shows every action just taken.

## Repo structure

```
backend/    Express + TypeScript + Drizzle ORM (SQLite) + Socket.IO
frontend/   React + TypeScript + Vite + Tailwind + React Query
```

Both are independent git repos (`git log` in each for full history of
what was built and when).
