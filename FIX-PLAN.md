# BCCWE Invoicing System — Step-by-Step Fix Plan

> Source: a 7-part parallel audit of the whole system (backend, persistence core,
> accounting engine, invoicing/tax, inventory/PO/POS, returns/detail/history,
> settings/roles). This file is the working checklist. We fix **one phase at a
> time**, commit, cache-bump, and smoke-test before moving on.

## What the audit found (after de-duplication)

Roughly **80+ distinct issues** across 7 subsystems. Severity mix:

- **~12 Critical** — data loss, security takeover, or money that is simply wrong.
- **~28 High** — wrong numbers on real workflows, permission bypasses, corruption on edit.
- **~30 Medium** — reporting/display errors, edge-case corruption, hygiene.
- **~15 Low** — cosmetic, dead code, minor drift.

Several findings were reported independently by **two or more** audit agents
(double-subtracted refunds, failed tab-close saves, duplicate invoice numbers,
the missing `4200` account, the order→sale stock bug). Those are high-confidence.

---

## Ground rules for the fix work

1. **One phase = one coherent, testable chunk = one commit** (or a tight set). No mega-commits.
2. **Cache-bump every time.** After editing anything in `public/app/`, bump `?v=20260620k`
   on **all 19 tags** in `public/index.html`. Otherwise browsers serve stale files.
3. **`data.js` is edited via git only** (the `/admin` uploader refuses it).
4. **No DB in this environment.** Verification is by (a) code reasoning, (b) optionally the
   jsdom `test-harness.js` the guide mentions, and (c) **you** smoke-testing each phase in a
   browser against a scratch database. We build a small harness in Phase 0 to make (b) real.
5. **Persist after mutating.** Use `persistNow()` (save-or-stay + rollback) for
   money/stock screens, `persist()` for light edits.

---

## Four root-cause decisions (make these first — each collapses many bugs into one fix)

Many findings are *symptoms* of the same root cause. Deciding these up front means we fix
the cause once instead of patching every symptom:

- **D1 — Money has ONE source of truth (the derived engine).**
  Today there are competing sources: derived `storeFinance`/`liveAccountBalances`, stored
  `accounts[].balance`, and incremental `clients[].balance`. They disagree. Decision:
  the derived engine in `screens-c.jsx` is the single truth; stored balances become display
  caches (or are removed). *Collapses ~8 findings.*

- **D2 — `today` is the LOCAL calendar date, everywhere.**
  `BCCWE.today` uses UTC, so evening transactions in BC are dated tomorrow. One helper fix
  cures date-stamping, A/R aging, month-to-date, and overdue math. *Collapses ~5 findings.*

- **D3 — Round money ONCE, at the moment a record is saved.**
  Tax/totals are stored unrounded and only rounded at display, so printed components don't
  sum to printed totals. One `round2()` applied at record creation. *Collapses ~4 findings.*

- **D4 — The server enforces auth and hides secrets; client RBAC is UX only.**
  The browser receives every secret and all authorization is client-side. Decision: the
  server strips secrets from `/api/state` and validates the session's role on writes. Client
  gating stays as convenience, not as the security boundary. *Collapses ~4 findings.*

### Decisions taken (2026-08-14)

- **Usage model = concurrent, small-scale.** 2 staff on up to 3–4 devices/tabs at once.
  Collisions are realistic → **Phase 2 uses server-side number allocation + per-collection
  saves**, sized for small scale (no heavy distributed-systems machinery).
- **Security depth = minimum-viable, done soon.** The app is on public shared hosting, so the
  blank-password takeover and `/api/state` secret exposure are internet-reachable regardless of
  user count. Phase 3 = fix takeover + exposure + route/portal gating; keep the no-build
  architecture. (Not deferred — scheduled right after the money work.)
- **Start = Phase 5 (money correctness), with Phase 4 foundations folded in** (local date +
  round-at-save), since Phase 5 depends on them.

---

## The phases

Each item: `[ ]` checkbox · short problem · file(s) · one-line fix.

### Phase 0 — Groundwork (no product code changes)
- [ ] Agree the four root-cause decisions + the two scope forks.
- [ ] Stand up a minimal jsdom smoke harness (`test-harness.js`) that can server-render key
      screens and run the finance functions on known data, so each later phase is checkable
      without a browser. (Guide §16.8 references this harness.)

### Phase 1 — Stop the bleeding: save reliability & data loss  · CRITICAL
Root cause: saves fail or mislead, and a failed load shows demo data as real.
- [ ] **Tab-close/hide save is always rejected (401).** `saveOnExit` uses `sendBeacon`/sync-XHR
      which never send `x-auth-token`; and `autoSave` marks state "saved" *before* the request,
      so a failure is never retried. `data.js:1457-1470, 1476-1479` → send token (keepalive fetch
      / token in beacon URL with server support), and only set `_lastSnapshot` on confirmed success.
- [ ] **`persist()`/autoSave swallow HTTP errors.** A 401/500 resolves the promise; nothing checks
      `res.ok`, retries, or forces re-login. `data.js:1355-1369` → check `res.ok`, surface failures,
      re-auth on 401.
- [ ] **Failed `GET /api/state` silently boots the seeded demo books.** `data.js:1329-1345` +
      `app.jsx:266-269` → on non-200, render a hard "cannot load your data" screen; never render `<App/>`.
- [ ] **One corrupt collection bricks the whole load.** `getAllState()` parses every row with no
      try/catch. `server.js:135-142` → per-row try/catch, skip+log the bad blob.
- [ ] **10 MB body limit vs. whole-state saves.** `server.js:15` → raise deliberately and/or move
      toward per-collection saves; surface a hard error when a save is rejected.
- **Verify:** simulate 401 and 500, hide the tab mid-edit → confirm no silent loss and a visible error.

### Phase 2 — Numbering & concurrency  · CRITICAL/HIGH *(depth depends on usage-model answer)*
Root cause: numbers allocated in-memory + full-state last-writer-wins.
- [ ] **Full-snapshot autosave clobbers concurrent sessions.** Two browsers each hold the whole
      dataset; a stale autosave overwrites another's new records. `data.js:1398-1406, 1484` +
      `server.js:175-194` → per-collection dirty saves and/or optimistic concurrency (version/updatedAt).
- [ ] **Duplicate invoice / PO / order numbers.** Counter read at mount, bumped only on save; two tabs
      get the same number; the number field is user-editable; no uniqueness check on save.
      `invoice-generator.jsx:28,256-257`, `screens-b.jsx:922,948` → allocate numbers server-side (or a
      single-writer guard if single-user), plus a `some(i=>i.no===n)` check at save.
- [ ] **`persistNow` rollback races the 2 s autosave** → phantom DB records + audit entries for
      rolled-back work. `data.js:1484`, `invoice-generator.jsx:255` → pause autosave while a
      `persistNow` is in flight; write audit log only *after* a confirmed save.
- **Verify:** two-tab test — create records in both, confirm none vanish and no number collides.

### Phase 3 — Security & access control  · CRITICAL *(depth depends on security answer)*
- [ ] **Blank-password admin takeover.** After the owner logs in once, an auto-seeded `u_owner`
      record has `password:""`; the staff-login branch matches it and `""===""` passes.
      `server.js:378-388` + `data.js:1524-1531` → in the staff branch skip `isOwner` records and
      reject empty passwords.
- [ ] **`/api/state` ships every secret to any logged-in user** (staff plaintext passwords, SMTP
      passwords, WhatsApp token) — a client-portal user can read them and log in as admin.
      `server.js:135-142,152-163` → strip `users[].password`, `smtpProfiles[].password`, `waConfig.token`.
- [ ] **No server-side write authorization.** Any token holder can `POST /api/save-bulk` to rewrite
      roles/users or wipe invoices. `server.js:175-215` → validate the session role against the
      collections being written.
- [ ] **Detail routes reachable by hash regardless of role.** The render gate only blocks routes whose
      `base` is a NAV id; `invoiceview`, `client`, `purchase`, `po`, `receive` render unconditionally.
      `app.jsx:226-254` → map each base to its module and gate on it; filter `InvoiceDetail`/`ClientAccount`
      by `sessionClientId()` for client users.
- [ ] **Client portal defaults to another (wholesale) client & leaks their prices.** `screens-shop.jsx:11-13`
      uses `session.userId` (email) to find the user, which never matches `u.id`. → use `sessionClientId()`
      and hide the client selector for client users.
- [ ] **Orders screen renders staff actions (Receive/Mark paid/Delete) for client users.**
      `screens-orders.jsx:114-123` → gate each action by the `orders` permission; hide for client users.
- [ ] **Password-reset code brute-forceable** (6 digits, 30 min, no attempt limit/rate limit).
      `server.js:456-532` → invalidate after ~5 tries, rate-limit, longer CSPRNG token.
- [ ] **`/api/admin/upload` hardening** — plaintext non-constant-time compare, no rate limit, can
      overwrite any `public/app/*.js` (stored XSS). `server.js:239-279` → `timingSafeEqual`, rate limit,
      optionally require an owner session.
- [ ] **`send-mail` / `send-whatsapp` abusable by any user.** `server.js:313-339,560-579` → restrict to
      admin/owner and/or constrain recipients.
- [ ] **Staff per-store access is ineffective** (session-field mismatch + empty `companies:[]` treated as
      "all"). `data.js:481-488` → look up by `s.uid`; decide `[]` = none vs all.
- [ ] *(Lower)* deactivated staff keep access till TTL; account enumeration on forgot-password; timing-unsafe
      compares; `Math.random()` reset code.
- **Verify:** attempt each bypass (blank pw, read `BCCWE.users` as client, hash to a detail route) → blocked.

### Phase 4 — Foundations: local date + round-at-save  · HIGH  *(decisions D2, D3)*
- [x] **`BCCWE.today` → local date.** `data.js:1348` → built from `getFullYear/getMonth/getDate`. *(done)*
- [ ] **`round2()` at record creation** for `gst/pst/total` (and line totals). Apply in
      `invoice-generator.jsx:158-181`, `screens-pos.jsx`, return/exchange math. → printed parts sum to total.
- **Verify:** create a record at 6 pm BC (dates as today) and one with odd cents (parts sum exactly).

### Phase 5 — Money correctness: cash, refunds, COGS, tax  · CRITICAL/HIGH  *(decision D1)*
- [x] **Refunds subtracted from cash twice** (invoice loop *and* credit-note loop). `screens-c.jsx:185,191,244,252`
      → now subtracted once, in the credit-note loop only. *(done)*
- [x] **Register "on account" sales counted as cash received; the receivable vanishes.**
      `screens-c.jsx:196,261` → cash uses `s.paid`; `s.owed` posts to A/R (1200). *(done)*
- [ ] **Live balances ignore `journal`, `payments`, and opening balances** — the ledger contradicts the
      journal shown beside it (e.g. INV-1044's $900 payment invisible). `screens-c.jsx:213-282` → fold
      journal + opening balances in, or reconcile `invoices.paid` against `payments` (and fix the seed).
- [ ] **COGS fabricated from *current* catalogue for line-less invoices** and drifts when costs change.
      `screens-detail.jsx:6-18` consumed at `screens-c.jsx:154,227` → store cost-at-sale on lines/`itemSales`;
      take COGS from the record or its journal, never a heuristic.
- [x] **Returns reduce revenue but never reverse COGS** (restocked goods). `screens-c.jsx` → new `cnCosts()` helper;
      restocked cost reverses COGS, defective cost reclassifies to 5100, exchange replacements add COGS, in both
      `storeFinance` and `liveAccountBalances`. *(done — verified by harness: sell@60 then restock-return → COGS 0.)*
- [x] **Write-off losses (`defectiveProducts`) reach no report.** → register writer now stores `defLoss`; engine
      reclassifies it from COGS into a P&L "Inventory written off" line and account 5100. The Expenses-screen
      write-off path already posts through `expenses` (5100/5110), so no double count. *(done)*
- [x] **Overpayment "kept as credit" becomes phantom equity.** `screens-c.jsx:186,243` → engine now posts the
      excess (`paid − total`) to Customer Deposits (2200) as a liability. *(engine done; the invoice-generator
      `credit` field that also needs persisting is a Phase 6 item.)*
- [x] **P&L revenue ignores invoice discount + charges; disagrees with Trial Balance.** `screens-c.jsx:152`
      → `revenue += total − gst − pst` (net-of-tax consideration). *(done)*
- [x] **Tax report has no input tax credits → GST remittance overstated.** `screens-c.jsx` → GST Remittance report
      now nets GST input tax credits on expenses; PST paid folds into expense cost (not recoverable in BC). Expense
      GST posts to 2100. *(done — PO purchase ITCs come with Phase 8.)*
- [x] **Cash-vs-bank routing** posted all of `inv.paid` by one method and misread register labels.
      `screens-c.jsx` → collected money now routes per `payments[].acct`; register cash matched by label prefix so
      cash refunds don't land in the bank account. *(done)*
- [x] **Seed the missing accounts `4200` (Restocking Fee Income) and `4900` (Sales Discounts)** the register
      and discount postings reference. `data.js` → added to the seed **and** a load-time top-up migrates existing DBs
      (since "DB always wins"). *(done)*
- [ ] **Make the Balance-Sheet / Trial-Balance check real.** The `3900` plug + `assets = liabilities + (assets−liabilities)`
      identity hide every error. `screens-c.jsx:279-280,376,392`. **Resequenced to AFTER Phase 8:** the check can only
      be honest once purchases/receiving post to Inventory (1300). Today 1300 is a stock snapshot disconnected from the
      COGS flow, so the residual is legitimately large; surfacing it now would show a false "out of balance". Keep the
      full plug until 1300 flows properly, then plug only sub-penny and warn on the rest.
- **Verify:** build a known set of transactions; confirm Trial Balance balances *without* the plug and P&L = TB.

### Phase 6 — Invoice creation & edit integrity  · CRITICAL/HIGH  *(done)*
- [x] **Invoice discount never persisted → totals silently re-inflate on edit.**
      `invoice-generator.jsx` → `discMode/discVal/discTiming/invDisc` persisted on the record and restored on edit;
      the invoice-detail paper now renders the discount line so subtotal ± discount + tax = total. *(done)*
- [x] **Preview crashes (`ReferenceError: discMode`) when a discount is set.**
      → `discMode/discVal` passed as props to `InvoicePreview`. *(done)*
- [x] **Editing a legacy (line-less) invoice decrements stock for invented lines.** `invoice-generator.jsx`
      → stock is only adjusted when the invoice has REAL stored lines; legacy edits skip stock (original decrement
      unknown), so no fabricated movement. *(done)*
- [x] **Order→sale conversion never decrements stock.** `screens-detail.jsx` → `convertOrder` now deducts stock,
      records item sales, and uses `persistNow` with snapshot rollback. *(done)*
- [x] **Renaming the invoice # on edit orphans payments / credit notes / mailLog.** `invoice-generator.jsx`
      → the number is locked on edit (record keeps `edit.no`; the field is read-only). *(done)*
- [x] **`itemSales` written for orders** → guarded on `docKind !== "order"` at create and added on conversion.
      *(Edit-time itemSales diffing is NOT done — itemSales rows carry no invoice reference, so they can't be located
      to update; noted as a data-model limitation for a later pass.)*
- [x] **Email from the generator never attaches the PDF; preview's "Email to client" only closed the modal.**
      `invoice-generator.jsx` → EmailModal falls back to `invoicePdfBase64FromData(invData)` when no on-screen paper
      exists; the preview's Email button now opens the email modal. *(done)*
- [x] **(Tier 3) Cost-at-sale.** Confirmed new invoices already store `cost` per line, so COGS uses the recorded
      cost, not the live catalogue. Only legacy line-less invoices still fabricate COGS (unfixable history). *(done)*
- **Verify:** discounted invoice round-trips save→edit→save unchanged (checked by logic: `calc.invDisc` recomputes
      identically from restored `discMode/discVal/discTiming`); preview opens with a discount; order conversion moves
      stock once. **Browser smoke-test recommended on the live site.**

### Phase 7 — Returns & exchanges correctness  · CRITICAL/HIGH
- [ ] **No cumulative prior-return check → the same invoice can be fully returned repeatedly** (unlimited refunds,
      double restock). `screens-detail.jsx:424-521` → clamp each line to `sold − alreadyReturned` from prior credit notes.
- [ ] **Refund computed on undiscounted price** → customer over-refunded. `screens-detail.jsx:446,451-452` → use
      net-of-discount price; prorate invoice-level discount.
- [ ] **Refunded invoices grow a phantom balance due and flip to Unpaid/Partial.** `screens-detail.jsx:20-30,144`
      → compare net paid against `total + Σ(cn.total)` (cn.total already negative).
- [ ] **Exchange "collect from customer" money is never recorded anywhere.** `screens-detail.jsx:456,176-212` →
      record collected/paid-out exchange cash as a payment the books read.
- [ ] **Full refund written to `inv.refunded` even when unpaid/partial** → cash reduced before money leaves.
      `screens-detail.jsx:205` → accumulate `refundPaid`, not the full `refund`.
- [ ] **Return/exchange saves fire-and-forget (`persist`, no rollback);** `recordPayment` persists nothing.
      `screens-detail.jsx:151-160,208` → snapshot + `await persistNow` + restore on failure.
- **Verify:** return the same invoice twice (second offers only remaining qty); discounted return refunds the paid amount; exchange collect lands in cash.

### Phase 8 — Inventory / purchase orders / receiving / POS  · HIGH/MEDIUM
- [ ] **Stock movement/aging read a stale demo closure, not live data.** `data.js:926-936` → read `window.BCCWE.itemSales`.
- [ ] **Aging clock anchored to hardcoded `2026-06-14`; ages never advance.** `data.js:117,922-929` → use live today.
- [ ] **POS checkout posts no journal / touches no accounts** — ledger diverges by all POS volume. `screens-pos.jsx:48-78`
      → build the same journal as QuickSale; include `journal,accounts` in save/rollback.
- [ ] **Discrepancy records duplicate on every re-receive and never clear.** `screens-b.jsx:1505-1516` → dedup by
      `ref+code`; remove when `short<=0`.
- [ ] **Editing a PO's cost/charges doesn't update `landedUnit`** → stock costed at stale value; post-receipt edits
      don't retro-adjust. `screens-b.jsx:1412,1476` → recompute landed on edit; warn when `qtyReceived>0`.
- [ ] **Editing an oversold item zeroes negative stock and fabricates a phantom purchase.** `screens-b.jsx:772,784,169-173`
      → preserve stock sign in the edit path; only log an ADJ PO on explicit increase.
- [ ] **Over-receiving is unbounded; the `/receive` route has no already-received guard.** `screens-b.jsx:1461-1490` →
      cap/confirm `got>outstanding`; guard fully-received orders.
- [ ] **Landed charges allocated on ordered qty but absorbed per received unit → freight vanishes on partials.**
      `screens-b.jsx:926-929,1476-1484` → re-derive per received units or expense the remainder on close-out.
- [ ] **CSV import overwrites existing stock/cost/category with defaults for absent columns.** `screens-b.jsx:300-316`
      → merge only columns present in the file.
- [ ] **Purchases/receipts never touch the books** (no DR Inventory / CR Cash or A/P). `screens-b.jsx:910-968` → post journals.
- [ ] **`itemAvgCost` ignores Partial receipts** → displayed avg/last diverges from applied cost. `screens-b.jsx:36` → include Partial lines.
- [ ] **Order edit can flip to "Received" with no stock movement and can't represent "Partial".** `screens-b.jsx:1395-1397`,
      `screens-orders.jsx:271` → derive status from receipts; preserve `qtyReceived`; validate `qty>=qtyReceived`.
- **Verify:** partial-receive an order twice (one discrepancy row, correct stock/cost); POS sale updates the ledger; price-only CSV leaves stock intact.

### Phase 9 — Reports & dashboard display  · MEDIUM
- [ ] **Dashboard "Revenue MTD" uses tax-inclusive totals, counts order deposits, ignores returns.** `screens-a.jsx:49-51,78-79`
      → sum subtotals, skip `kind==="order"`, subtract credit notes.
- [ ] **"Outstanding"/"Overdue" KPIs**: overpaid invoices subtract, orders included, overdue never recomputed.
      `screens-a.jsx:45-46` → `Math.max(0,…)`, exclude orders, derive overdue from `due<today && balance>0`.
- [ ] **Revenue-trend tooltip inflates values 1000×.** `screens-a.jsx:110` → `fmt(v)`.
- [ ] **InvoiceHistory register rows overwrite pre-tax subtotal with total and mark partial sales Paid.**
      `screens-a.jsx:226` → use `s.subtotal/s.paid/s.owed`.
- [ ] **People "A/R balance" reads an unmaintained `clients[].balance`.** `screens-a.jsx:668` → derive like ClientAccount.
- [ ] **Sales-by-item / People revenue use *current* price/cost, ignore recorded sale price & returns.**
      `screens-a.jsx:513-518`, `screens-b.jsx:1791-1795` → use `s.price*(1-(s.disc||0)/100)` and cost-at-sale; net returns.
- [ ] *(Lower)* hardcoded KPI deltas ("+12.4%"), three disagreeing cash figures, order-type filter/label.
- **Verify:** dashboard MTD vs. a hand-computed month; People balance matches ClientAccount.

### Phase 10 — Config hygiene & settings safety  · MEDIUM/LOW
- [ ] **`freshDefaults()` keeps demo identity → every outgoing email is CC'd to `records@bccwe.ca`** (a domain the
      user doesn't own) and real PDFs print fake GST/PST numbers; it also wipes `categories/catTree/services`.
      `data.js:800-808,956-957,1293-1308` → blank demo backup email / tax numbers / contact; keep setup lists.
- [ ] **Editing the "No Tax" mode silently converts it to 5% GST** for exempt clients. `screens-settings.jsx:587-606`
      → seed the editor from actual rates; forbid editing system-mode components.
- [ ] **Store-delete guard misses fallback-owned (no-`companyId`) invoices** → deleting the default store re-homes them.
      `screens-stores.jsx:26-35` → count `STORES.idOf(i)===s.id`; block deleting the default store while such records exist.
- [ ] **Custom roles are unranked (treated as rank 0)** → defeats the rank wall on assignment/visibility.
      `screens-settings.jsx:663,793` → persist a numeric rank; treat unknown conservatively.
- [ ] **Download-log entries attributed to demo user "Harman Gill".** `data.js:595` → default to `currentUser().name`.
- [ ] **Code-config (`modules`, `TAX` structure, role perms) is persisted and "DB always wins"** → frozen at first seed.
      `data.js:1330-1332` → exclude static config from persistence, or merge code over stored on load.
- [ ] *(Lower)* deactivating the owner does nothing; CSV UTF-8 BOM breaks import; `route.split` drops multi-segment ids;
      same-ms log id collisions; seed-data nits (`c4` balance, `CASE-IP14`, missing `companyId`).
- **Verify:** fresh-start a scratch DB → no demo email/tax numbers; category/service dropdowns populated; email has no stray CC.

---

## Suggested execution order & rationale

1. **Phase 1** first — until saves are reliable, any other fix can be lost. Highest ROI.
2. **Phase 3** (security) next — active takeover/exposure risk; independent of the money work.
3. **Phase 4** foundations (date + rounding) — small, and everything downstream depends on them.
4. **Phase 5** money correctness — the core "the books are wrong" bucket; depends on D1 + Phase 4.
5. **Phases 6 → 7 → 8** — the transactional workflows (invoice, returns, inventory), which feed Phase 5.
6. **Phase 2** concurrency — sized by the usage-model answer; can slot earlier if multi-user is confirmed.
7. **Phases 9 → 10** — reporting polish and hygiene, once the underlying data is correct.

Each phase ends with a commit, a cache-bump, and a browser smoke-test before the next begins.
