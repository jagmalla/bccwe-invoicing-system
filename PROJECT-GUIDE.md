# BCCWE Invoicing System — Complete Project Guide

> **Purpose of this file:** hand this document to any developer or AI and they
> will understand the *entire* project — what it is, how it is built, every
> file, every data structure, all the business rules, and how to run, host, and
> modify it. Written to be understandable by a beginner ("a dummy").

---

## 0. Where the code lives (for Claude / any AI)

- **GitHub repository:** `jagmalla/bccwe-invoicing-system`
- **URL:** https://github.com/jagmalla/bccwe-invoicing-system
- **Default branch:** `main`
- To get the files, clone it:
  ```bash
  git clone https://github.com/jagmalla/bccwe-invoicing-system
  ```
- The repo intentionally does **not** contain `node_modules/` (run `npm install`)
  or `db-config.json` (holds secrets — create it from `db-config.example.json`).

---

## 1. What this app is (plain English)

BCCWE is a **web-based business management + invoicing system** for a small
retail/repair shop (the demo company is a phone & laptop repair store in Surrey,
BC, Canada). One owner logs in from a browser and can:

- Create **invoices** (with Canadian GST/PST tax) and email or WhatsApp them.
- Run a **Point of Sale (POS)** for quick walk-in cash sales.
- Track **inventory** (stock levels, cost, price, purchase orders, receiving).
- Handle **returns and exchanges** (with refunds and restocking fees).
- Record **expenses** and **client orders**.
- See full **accounting** — General Ledger, Trial Balance, Profit & Loss,
  Balance Sheet, Tax report, A/R aging — all generated automatically from the
  transactions.
- Manage **clients, suppliers, staff users, roles/permissions**, and multiple
  **stores**.
- Run everything in **CAD**, with BC tax rules (GST 5% + PST 7%).

Everything is stored in a **MySQL database** on the server. The interface is a
single-page app that runs in the browser.

---

## 2. Technology stack

| Layer | Technology |
|-------|-----------|
| Backend server | **Node.js** + **Express** (`server.js`) |
| Database | **MySQL** (via `mysql2` driver) |
| Email sending | **nodemailer** (SMTP) |
| WhatsApp sending | Meta WhatsApp Cloud API (via `fetch`) |
| Frontend | **React 18** (loaded from local vendor files) |
| Frontend build | **NONE at build time** — JSX is compiled *in the browser* by **Babel Standalone** |
| PDF generation | `jspdf` + `html2canvas` (client-side) |
| Barcodes | `JsBarcode` (client-side) |
| Styling | Plain CSS (`public/app/styles.css`) |

### ⚠️ The single most important architectural fact

**There is no webpack/vite/build step for the frontend.** The `.jsx` files are
served as-is to the browser, and **Babel runs in the browser** to compile them
on the fly. Look at `public/index.html`: every screen file is loaded as
`<script type="text/babel" src="app/xxx.jsx">`.

Consequences you MUST understand before editing:

1. **All JSX files share one global scope** (like old-school `<script>` tags).
   A `function Foo(){}` or `const BAR = …` declared at the top level of one file
   is visible to all the other files. There are **no `import`/`export`
   statements** between app files.
2. Components/functions are explicitly published to `window` at the bottom of
   each file, e.g. `Object.assign(window, { Inventory, Sales, … })`, so the
   router can reach them.
3. React hooks are pulled off the global React once, in `ui.jsx`:
   `const { useState, useMemo, useRef, useEffect } = React;`
4. The global data object is `window.BCCWE`, usually aliased inside a component
   as `const D = BCCWE;`.
5. **Cache-busting:** every script tag in `index.html` ends with `?v=YYYYMMDDx`
   (currently `?v=20260620k`). When you change a file, you **must bump this
   version string** or browsers will serve the old cached copy. All 19 tags use
   the same version — change them together.
6. Because Babel compiles at runtime, a syntax error shows up only when that
   screen loads (not at deploy time). There is a `ScreenErrorBoundary` that
   catches render crashes so one broken screen doesn't blank the whole app.

---

## 3. Folder / file map

```
bccwe-invoicing-system/
├── server.js                 # The entire Node/Express backend + all API routes
├── package.json              # Dependencies + "npm start" → node server.js
├── package-lock.json
├── db-config.example.json    # Template for DB credentials (copy to db-config.json)
├── db-config.json            # ← YOU create this on the host. NOT in git (secret).
├── DEPLOY-A2.md              # Step-by-step hosting guide (A2 Hosting / cPanel)
├── PROJECT-GUIDE.md          # ← this file
├── .gitignore                # ignores node_modules/, db-config.json, _backups/
├── public/
│   ├── index.html            # Loads React + Babel + every app script (versioned)
│   ├── admin.html            # Password-protected page to hot-upload new .jsx/.css
│   ├── vendor/               # Local copies of libraries (no CDN dependency)
│   │   ├── react.production.min.js
│   │   ├── react-dom.production.min.js
│   │   ├── babel.min.js
│   │   ├── html2canvas.min.js
│   │   ├── jspdf.umd.min.js
│   │   └── JsBarcode.all.min.js
│   └── app/                  # ALL application code (JSX + JS)
│       ├── data.js           # Data model, seed data, persistence, helpers  ★core
│       ├── ui.jsx            # Shared UI kit + formatting/tax helpers        ★core
│       ├── app.jsx           # App shell, sidebar nav, router, mount point   ★core
│       ├── auth-ui.jsx       # Login / first-time setup / forgot-password screens
│       ├── invoice-generator.jsx  # Create/edit invoice screen + Email modal
│       ├── screens-a.jsx     # Dashboard, Invoice History, People (clients/suppliers)
│       ├── screens-b.jsx     # Inventory, Sales, POS quick-sale, Purchase orders  ★big
│       ├── screens-c.jsx     # Accounting (Ledger) + Reports + finance engine
│       ├── screens-detail.jsx# Invoice detail page, Client account, Unpaid, returns
│       ├── screens-orders.jsx# Client Orders screen
│       ├── screens-settings.jsx # Settings: company, tax, users, roles, email, etc.
│       ├── screens-pos.jsx   # Full POS (cart) screen
│       ├── screens-shop.jsx  # "New Order" catalogue/shop screen
│       ├── screens-stores.jsx# Multi-store management
│       ├── screens-mail.jsx  # Sent-mail log + email/download log cards
│       ├── screens-logs.jsx  # Activity (audit) log viewer
│       ├── screens-barcodes.jsx # Barcode label generator/modal
│       ├── xlsx.js           # Tiny spreadsheet (CSV/XLSX) import/export helper
│       └── styles.css        # All styling
├── screenshots/              # Design reference images (not used at runtime)
├── spec_document.xml,        # Original design spec (reference only)
│   spec_text.txt
└── "BCCWE Invoicing System.html", .thumbnail   # design export leftovers (unused)
```

★ = the files to read first to understand the system.

---

## 4. How the frontend and backend talk (the data flow)

The frontend never talks SQL. It keeps **one big JavaScript object** in memory,
`window.BCCWE`, split into "collections" (arrays): `clients`, `invoices`,
`inventory`, `journal`, etc. The backend stores each collection as **one JSON
blob** in a single MySQL table.

### The database is just 2 tables

```sql
collections ( name VARCHAR PRIMARY KEY, data LONGTEXT )   -- one row per collection
auth        ( id, userId, passHash, salt, email, mustChange, idLocked, resetCode, resetExpires )
```

- `collections`: `name` = "clients", "invoices", etc.; `data` = the whole array
  as a JSON string. So the *entire* app state is a couple dozen JSON rows.
- `auth`: a single row (`id=1`) holding the owner login. Kept separate so it is
  never exposed by `/api/state` and never wiped by a data reset.

### Loading (on page open) — see bottom of `data.js`

1. `data.js` first defines all the **seed/demo data** and helpers.
2. Then the persistence block runs: it reads the saved login token from
   `localStorage`, calls `GET /api/session` to validate it, and if valid calls
   `GET /api/state`.
3. `/api/state` returns every collection. Those **overwrite** the seed data:
   `Object.keys(state).forEach(k => window.BCCWE[k] = state[k])`. So **the
   database always wins**; the seed data only shows on a brand-new empty DB.
4. If the DB is empty, it seeds a blank dataset (keeps setup like tax/accounts,
   clears business records) via `freshDefaults()` and POSTs it back.

### Saving (whenever data changes)

The frontend calls one of these helpers (all defined in `data.js`):

- `window.persist("clients", "invoices", …)` — debounced 300ms save of the named
  collections via `POST /api/save-bulk`. Used everywhere for normal edits.
- `window.persistNow(...names)` — returns a `Promise<boolean>`; saves immediately
  and reports success/failure. Used for the **"save or stay"** pattern: on POS /
  invoice / purchase screens, if the save fails (no connection) the code **rolls
  back** the in-memory change and keeps the user on the page so nothing is lost.
- An **automatic full-state safety net** also saves everything on a timer and
  when the browser tab is hidden/closed.
- `window.__dataLoaded` gates all saving — nothing is ever saved until real data
  has finished loading (prevents overwriting the DB with seed data).

**Auth on every request:** `data.js` wraps `window.fetch` so every `/api/…`
call automatically includes the `x-auth-token` header from the saved token.

---

## 5. The data model — every collection in `window.BCCWE`

All money is CAD. Dates are `"YYYY-MM-DD"` strings. `BCCWE.today` is the live date.

| Collection | What it holds | Key fields (shape) |
|-----------|---------------|--------------------|
| `company` | Default store letterhead | name, tagline, addr1/2, phone, email, web, gst, pst, logo, `show{}` (which fields print) |
| `companies` | **Stores** (multi-store) | id, name, taxDefault, invPrefix, nextInvoiceNo, address fields, active |
| `TAX` | Tax modes | `modes.{none,gst,pst,both}` each with gst/pst rates + `comps[]` (which ledger acct each tax posts to); `order[]` |
| `salespeople` | Staff for the "salesperson" dropdown | id, name, initials, role |
| `clients` | Customers | id, name, type (Retail/Wholesale), contact, phone, terms, emails[], defaultEmail, exempt, balance, taxDefault, addr, taxNumber, notes, companyId |
| `suppliers` | Vendors | id, name, contact, phone, addr, terms, balance |
| `inventory` | Stock items | code, name, cat, subcat, supplier, cost, price, stock, bonus, alert (low-stock threshold), purchased, kind (Product/Service), stockState |
| `services` | Non-stock labour lines | code, name, price |
| `accounts` | Chart of accounts (ledger) | code, name, type (Asset/Liability/Equity/Revenue/Expense), balance |
| `invoices` | Sales + order invoices | no, clientId, date, due, sales, tax, subtotal, gst, pst, total, paid, status, kind ("sale"/"order"), companyId, lines[]/items, notes, refunded |
| `creditNotes` | Returns & exchanges | no, type (Return/Exchange), retDisp (Inventory/Defected), clientId, origInv, tax, subtotal/gst/pst/total (negative for returns), refund, restockingFee, status, items[] |
| `payments` | Invoice payments received | id, date, inv, clientId, amount, method, acct |
| `expenses` | Business expenses | id, date, category, acct, desc, amount, method, tax, sales, receipt |
| `expenseCategories` | Expense type → ledger acct map | name, acct, (stockLoss: defective/lost) |
| `cashSales` | POS / quick sales (non-invoice) | id, date, client, type, kind (Sale/Return/Exchange), item, total, method, sales, companyId, retDisp |
| `journal` | Double-entry journal entries | id, date, memo, lines[] `{acct,name,dr,cr}` |
| `purchaseOrders` | **Purchase orders / stock receipts** | see §8 below (grouped: lines[], charges{}, payment{}, logs[]) |
| `orderDiscrepancies` | Receiving shortfalls | id, ref, date, code, name, supplier, ordered, received, short, kind (short/missing), note |
| `orders` | Client orders (quote/order flow) | order records |
| `defectiveProducts` | Written-off/lost stock | date, code, name, qty, costLoss, reason, ref, kind (defective/lost) |
| `itemSales` | Generated sales history per item | code, clientId, date, qty (drives analytics/movement) |
| `smtpProfiles` | Email sender accounts | id, host, port, enc, user, password, from, fromName, replyTo, isDefault |
| `mailLog` | Sent-email log | id, ts, to[], subject, status, docNo, clientId |
| `downloadLog` | PDF download log | kind, file, docNo, clientId, ts |
| `auditLog` | Activity log | action, entity, table, rec, detail, user, ip, ts |
| `modules` | Permission definitions | id, label, info, perms[] — the master list of every permission |
| `roles` | Roles + their granted perms | id, name, tone, system, perms{} |
| `users` | Staff/login users | id, name, email, username, password, role (roleId), active, isOwner, clientId, companies[] |
| `prefs` | App preferences | assorted toggles (e.g. price suggestions) |
| `waConfig` | WhatsApp API config | enabled, token, phoneId |
| `catTree` | Category → subcategory tree | name, subs[] |
| `clientPrices` | Per-client special prices | map |
| `nextInvoiceNo`, `nextOrderNo` | Counters | numbers |

---

## 6. Authentication & sessions (in `server.js`)

- **One owner account** lives in the `auth` table. On first ever run it is
  seeded as **ID `admin` / password `password`** (mustChange = 1). First login
  forces the user to set a new ID (once), password, and recovery email; then the
  ID is locked.
- **Staff users** are created in Settings → Users and live in the `users`
  collection. They log in with email/username + password.
- **Login flow** (`POST /api/login`):
  1. Try the owner `auth` row (scrypt-hashed password + salt).
     - If the owner's email/name also matches a staff `users` record, that
       record's **role is adopted**, so permissions follow the assigned role
       even for the owner account.
  2. Otherwise match an active staff user by email/username/name + password.
  3. On success, a random **session token** is created in memory (12-hour TTL)
     and returned; the browser saves it in `localStorage` as `bccwe_token`.
- Sessions live in a server-side in-memory `Map` (cleared on server restart →
  users just log in again). `requireAuth` middleware protects the data APIs.
- **Password reset**: `POST /api/forgot-password` emails a 6-digit code (via the
  default SMTP profile) to the account's recovery email; `POST /api/reset-password`
  consumes it. Works for both owner and staff.
- `hashPw` = Node `crypto.scryptSync(password, salt, 64)`.

---

## 7. Roles & permissions (RBAC)

- The **master list** of every possible permission is `BCCWE.modules` in
  `data.js` — each module (dashboard, invoice, history, orders, people,
  inventory, sales, expenses, accounting, reports, settings, …) lists its
  individual permission toggles (add, update, delete, view_cost, view_own vs
  view_all "scope" radios, etc.).
- **Roles** (`BCCWE.roles`, seeded in `data.js`):
  | id | name | notes |
  |----|------|-------|
  | `r_admin` | Admin | all permissions |
  | `r_owner` | Owner | all permissions (ranks just below admin) |
  | `r_manager` | Manager | broad |
  | `r_super` | Supervisor | mid |
  | `r_sales` | Sales Person | limited |
  | `r_client` | Client | customer-portal-only |
- **Role ranking** (`screens-settings.jsx`): `ROLE_RANK = {r_admin:100, r_owner:95,
  r_manager:70, r_super:50, r_sales:30, r_client:10}`. A user can only see/manage
  users and assign roles **at or below their own rank**. Owner account with no
  role record = rank 1000 (full).
- **Admin tier** (`window.STORES.isAdmin()` / `bccweIsAdmin`): true for
  `r_admin`, `r_owner`, or a bare owner with no role. Admins see everything.
- **Nav gating** (`navAllowed` in `app.jsx`): non-admin roles only see sidebar
  modules where their role has at least one permission. `stores`, `mail`, `logs`
  are **admin-only**. `pos`/`neworder`/`return`/`exchange` map to the `sales`/
  `orders` add permissions.
- **Client users** (`r_client`): a client login is tied to a `clientId`. They
  see a **restricted customer view** — only their own orders/catalogue, their
  own prices, no costs or sensitive data. Helpers: `window.isClientUser()`,
  `window.sessionClientId()`, `window.sessionUid()`.

---

## 8. Purchase Orders & Receiving (the most recently built area)

This is the most detailed subsystem — read `screens-b.jsx`.

### Order record shape (grouped: one record = one order)
```js
{
  po: "PO-358", ref: "PO-358", date: "2026-06-21",
  supplier: "s1", status: "Placed" | "In Transit" | "Received" | "Partial",
  tracking: "…",
  charges: { shipping: 150, customs: 100, other: 0 },   // landed costs
  payment: { mode: "none"|"deposit"|"advance"|"full", amount: 0, account: "1010" },
  lines: [ { code, name, qty, bonusQty, cost, price, alert,
             landedUnit, charge, qtyReceived } ],
  items: "iPhone 11 ×20, …",                            // text summary
  total: 1240.00,
  qtyReceived: 0,
  logs: [ { ts, user, detail } ],                       // change log
}
```
Older/legacy records are "flat" (single item: `code, qty, bonusQty, landedUnit`).
The helper `poFlatLines(filterFn)` and `poLines(po)` normalize both shapes.

### Two views (Inventory → Purchase orders tab)
- **All orders** (default): one row per order, with a **+** button to expand and
  see the line items. Each order has View (opens full page) and Receive.
- **All items ordered**: every line flattened into one table.

### Order detail page (route `#po/<ref>`) — `OrderDetailPage`
Opens like an invoice: supplier ("who ordered"), date, ordered-by, payment mode/
amount, per-item table (qty, bonus, purchase cost, sale price, line total),
landed charges, total, and a **change log** at the bottom. Buttons: Back, Edit,
Download PDF (with **print options** checkboxes: purchase price, sale price,
shipping cost, other details, change logs), Receive.

### Editing an order — `OrderEditModal` + `poEditDiff()`
Editing writes a **detailed diff** to the log, e.g. `iPhone 11: qty 20 → 18`,
`Shipping $150.00 → $120.00`, `Supplier Costco → Apple`. The log shows exactly
what changed, per field and per item, old → new.

### Receiving — `ReceiveOrderPage` (route `#receive/<ref>`)
Clicking **Receive** opens a dedicated page (not a blind full-receipt). For each
line there is a **quantity box pre-filled with the outstanding amount**, plus a
**"Receive complete order"** button that fills every box to full so you can just
Submit. Lower a box (or set 0) when fewer/none arrived.
- Shortfalls become **order discrepancies**; the order status goes to **Partial**;
  short/missing items are **colour-coded** (amber = short, red = missing) on the
  order page, in the orders list (expandable sub-rows), and in a new **"Order
  discrepancies"** register under Inventory → Stock losses.
- Receiving adds units to stock using **moving-average cost** (see §10) and folds
  in bonus units. Partial receipts accumulate; the order flips to **Received**
  once everything arrives.

---

## 9. Multi-store system

- Stores live in `BCCWE.companies` (seeded: `co_cash` "Cash"/no-tax and `co_inv`
  "Invoice"/GST). Each has its own invoice **prefix + counter** so stores number
  independently (`nextInvNoForStore`, `bumpStoreInvoiceNo`).
- `window.STORES` helper (in `data.js`) is the API: `isAdmin()`, `allowed()`,
  `allowedIds()`, `matches(rec, filter)`, `profile(id)`, `nameOf(id)`,
  `defaultId()`, `initialFilter()`, `canSeeAll()`.
- The top-bar **store switcher** filters everything by store. Only admins/owners
  get the combined **"All stores"** option; staff see only their assigned stores
  (`users[].companies`).
- Records carry a `companyId`; reports/lists filter with `STORES.matches`.

---

## 10. Business rules & calculations

- **Tax:** BC — GST 5% + PST 7%. Modes: none / gst / pst / both. Each tax
  component posts to its own liability account (GST Payable 2100, PST Payable
  2110). A client's `taxDefault` and `exempt` flag pick the default mode.
- **Inventory costing = moving average.** When stock is received:
  `newCost = (prevStock*prevCost + receivedUnits*landedUnit) / (prevStock+receivedUnits)`.
  **Bonus units fold into cost** (e.g. buy 9 @ $10 + 1 free = 10 units for $90 →
  avg $9). **Landed charges** (shipping/customs/other) are allocated across items
  by value and included in `landedUnit`. Helper `itemAvgCost(item)` computes avg
  and last cost from received POs.
- **Negative stock allowed:** selling more than on hand drives stock negative
  (across ALL item kinds), so oversells are visible rather than blocked.
- **Returns / Exchanges** (`InvoiceReturnModal` in `screens-detail.jsx`): choose
  return vs exchange, per-item quantities, disposition (restock to Inventory or
  write off as Defected), **restocking fee** (kept as income → account 4200),
  and refund treatment (with/without tax; paid now / partial / owed).
- **Restocking fee income** posts to account **4200**; **Customer Deposits** use
  **2200**; deposits on "order" invoices convert to payment when the order
  becomes a sale.
- **Save-or-stay:** POS, invoice, purchase, quick return/exchange all use
  `persistNow()` with snapshot rollback — if the server is unreachable the change
  is undone and the user stays on the page (no data loss).

---

## 11. The accounting engine (`screens-c.jsx`)

The books are **derived from transactions**, not stored as static balances:

- `storeFinance(filter)` — revenue, COGS, tax collected, expenses, restocking
  fee income, etc., for a store (or "all").
- `storeBalances(filter)` — A/R, deposits, payables, cash, etc.
- `liveAccountBalances(filter)` — rebuilds every account balance from journal +
  transactions; the **Trial Balance** plugs any rounding difference to Retained
  Earnings (3900) so debits always equal credits.
- Reports (`Reports` component): **Profit & Loss**, **Balance Sheet**, **Trial
  Balance**, **Tax report**, **A/R Aging**, **Client report** — all store-filtered.
- **Chart of accounts** is seeded in `data.js` (`accounts`): 1000s assets, 2000s
  liabilities, 3000s equity, 4000s revenue, 5000s COGS/losses, 6000s expenses.

---

## 12. Screens (routes) overview

Routing is **hash-based** (`#dashboard`, `#invoiceview/INV-1047`). `app.jsx`
splits the hash into `base/param` and renders the matching component.

| Route (hash) | Component | Purpose |
|--------------|-----------|---------|
| `dashboard` | Dashboard | KPIs, charts, notifications |
| `pos` | POS | Full cart point-of-sale |
| `neworder` | ClientShop | Catalogue "new order" flow |
| `invoice` / `invoice/<no>` | InvoiceGenerator | Create/edit an invoice |
| `invoiceview/<no>` | InvoiceDetail | View invoice, payments, returns, PDF |
| `history` | InvoiceHistory | All invoices + returns/exchanges |
| `orders` | Orders | Client orders |
| `people` | People | Clients & suppliers |
| `client/<id>` | ClientAccount | One client's statement |
| `inventory` | Inventory | Stock, sales&profit, stock losses, aging, **purchase orders**, categories |
| `purchase` | PurchasePage | New multi-item purchase / stock receipt |
| `po/<ref>` | OrderDetailPage | Full purchase-order page |
| `receive/<ref>` | ReceiveOrderPage | Per-item receiving with discrepancies |
| `sales` | Sales | Register of quick/cash sales |
| `return` / `exchange` | QuickSale | Quick return / exchange |
| `expenses` | Expenses | Expense entry & list |
| `accounting` | Accounting | General Ledger |
| `unpaid` | UnpaidInvoices | Outstanding A/R |
| `reports` | Reports | P&L, Balance Sheet, Trial Balance, Tax, Aging |
| `mail` | SentMail | Email log (admin) |
| `logs` | AuditLog | Activity log (admin) |
| `stores` | Stores | Manage stores (admin) |
| `settings` | Settings | Company, tax, users, roles, email/SMTP, WhatsApp, data reset |

---

## 13. Server API endpoints (`server.js`)

All data endpoints require the `x-auth-token` header (added automatically by the
patched `fetch`).

| Method + path | Purpose |
|---------------|---------|
| `GET /api/state` | Return every collection (the whole dataset) |
| `POST /api/state` | Replace many collections (transactional) — used for seeding |
| `POST /api/save/:collection` | Save one collection |
| `POST /api/save-bulk` | Save several collections at once (normal saves) |
| `POST /api/login` | Log in (owner or staff) → returns token + session info |
| `GET /api/session` | Validate token, return session/account status |
| `POST /api/logout` | Drop the session token |
| `POST /api/change-credentials` | First-login: set new ID/password/email |
| `POST /api/change-password` | Change password (needs current password) |
| `POST /api/forgot-password` | Email a 6-digit reset code via default SMTP |
| `POST /api/reset-password` | Consume the code, set new password |
| `POST /api/test-smtp` | Verify an SMTP profile (connect + auth, no send) |
| `POST /api/send-mail` | Send email (with base64 PDF attachments) |
| `POST /api/test-whatsapp` | Verify WhatsApp Cloud API token/phone |
| `POST /api/send-whatsapp` | Send a WhatsApp text message |
| `GET /api/whoami` | Return caller IP (stamped on audit-log entries) |
| `GET /admin` | Serve `admin.html` (hot code-upload page) |
| `POST /api/admin/upload` | Upload new `.jsx/.css/.js` into `public/app/` (admin password; backs up old versions; `data.js` is protected) |
| `GET /{*path}` | Serve `index.html` (SPA catch-all) |

---

## 14. How to run it locally

```bash
git clone https://github.com/jagmalla/bccwe-invoicing-system
cd bccwe-invoicing-system
npm install
cp db-config.example.json db-config.json      # then edit it
# start MySQL locally, create an empty database, put its name/user/password in db-config.json
node server.js
# open http://localhost:3000
# first login: ID "admin" / password "password" → you'll be forced to change it
```

`db-config.json` fields:
```json
{ "host": "localhost", "port": 3306,
  "user": "…", "password": "…", "database": "…",
  "adminPassword": "…strong password for the /admin code-upload page…" }
```
(You can use env vars instead: `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, ADMIN_PASSWORD`.)

The app **auto-creates its tables** on first start. No SQL to run manually.

---

## 15. How to host it (shared hosting / cPanel / A2)

Full click-by-click steps are in **`DEPLOY-A2.md`**. Summary:

1. **Create a MySQL database** in cPanel (note the DB name, user, password; give
   the user ALL PRIVILEGES).
2. **Upload** the project (a ZIP **without** `node_modules`) and extract so
   `server.js` sits at the app root.
3. **Setup Node.js App** in cPanel → point the startup file to `server.js`,
   mode Production, pick the newest Node version.
4. Create **`db-config.json`** next to `server.js` with your DB credentials.
5. Click **Run NPM Install**, then **Start**. Open the site.
6. First login `admin` / `password`, then set your own credentials.

Any host that runs Node.js + MySQL works (Render, Railway, a VPS, etc.) — just
set the env vars or `db-config.json` and run `node server.js`.

---

## 16. Rules & conventions for editing the code (read before changing anything)

1. **Bump the cache version.** After editing any file in `public/app/`, change
   the `?v=20260620k` string on ALL script/link tags in `public/index.html`
   (they must match). Otherwise users keep the cached old file.
2. **No imports between app files.** Everything is global. To use a component in
   the router, add it to the file's bottom `Object.assign(window, { … })`.
3. **`data.js` is special and protected** — it holds the save/load logic. The
   `/admin` uploader refuses to overwrite it. Edit it only via git.
4. **Persist after changing data.** After mutating `BCCWE.<collection>`, call
   `window.persist("<collection>", …)` (or `persistNow` for save-or-stay).
5. **Use the shared helpers** (`ui.jsx`): `fmt()` money, `shortDate()`,
   `statusTone()`, `Badge`, `Btn`, `Card`, `Modal`, `Field`, `Icon`, `Empty`,
   `itemByCode`, `supplierName`, `clientName`, tax helpers, etc.
6. **Match the surrounding style** — plain function components, `const D = BCCWE`,
   hooks from the global (`useState`, `useMemo`, `useRef`, `useEffect`).
7. **Guard against crashes** — screens are wrapped in `ScreenErrorBoundary`, but
   still null-check data (`(D.x || [])`), since the DB may hold partial data.
8. **Testing:** there is a jsdom smoke harness (`test-harness.js`) that server-
   renders every route/modal/finance function and checks the trial balance
   balances. It's not shipped in the repo by default; if present, run
   `node test-harness.js`. Otherwise, load each screen in a browser after edits.
9. **Secrets never go in git:** `db-config.json` (DB + admin password) is
   gitignored. Keep it that way.
10. **Commits:** the project has been committed with GPG signing disabled
    (`git -c commit.gpgsign=false commit`).

---

## 17. Quick "where do I change X?" index

| I want to… | Go to |
|------------|-------|
| Add/adjust a screen's layout | the relevant `screens-*.jsx` |
| Change the sidebar menu / routes | `app.jsx` (`NAV`, `GROUPS`, the `base === …` list) |
| Change tax rates or add a tax mode | `data.js` → `TAX` |
| Change the chart of accounts | `data.js` → `accounts` |
| Change roles/permissions definitions | `data.js` → `modules`, `roles`; ranking in `screens-settings.jsx` |
| Change how the books are computed | `screens-c.jsx` (`storeFinance`/`liveAccountBalances`) |
| Change invoice PDF/letterhead | `data.js` PDF helpers + `screens-detail.jsx` invoice paper |
| Change purchase-order / receiving behaviour | `screens-b.jsx` (`PurchasePage`, `OrderDetailPage`, `ReceiveOrderPage`, `receiveOrder`, `poLines`, `poEditDiff`) |
| Change login / password / reset behaviour | `server.js` (auth routes) + `auth-ui.jsx` |
| Change what saves to the DB | `data.js` persistence block; `server.js` save routes |
| Add a shared UI widget or helper | `ui.jsx` |

---

*End of guide. Repo: `github.com/jagmalla/bccwe-invoicing-system` (branch `main`).*
