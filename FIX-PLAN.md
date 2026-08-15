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
- [x] Committed regression harness (`test-harness.js`, run `node test-harness.js`, no deps): (a) compiles
      every `public/app/*.jsx` with the vendored browser Babel — a syntax slip white-screens the app;
      (b) extracts the real security-critical `server.js` helpers (secret redact/preserve/fill, write
      authorization) and exercises them against an in-memory store — no live MySQL; (c) checks the
      inline-edit commit math. 51 checks, all green. Gates a deploy via its exit code.

### Phase 1 — Stop the bleeding: save reliability & data loss  · CRITICAL  *(done)*
Root cause: saves fail or mislead, and a failed load shows demo data as real.
- [x] **Tab-close/hide save was always rejected (401).** `data.js` → both exit paths now carry the
      session token (`?t=` on the beacon — server accepts it in `requireAuth`; header on the sync-XHR),
      and `_lastSnapshot` advances ONLY on confirmed success, so a failed attempt is retried by the 2s
      net. Tab-hide now also fires the normal confirming async save. *(done — verified in harness.)*
- [x] **`persist()`/autoSave swallowed HTTP errors.** `data.js` → all paths check `res.ok`; failures
      re-mark collections dirty, show the red badge, and retry; **401 opens an in-place re-login
      overlay** that restores the session *without a reload*, keeping unsaved work, then saves it
      immediately. This is the fix for Passenger idle-restarts killing sessions mid-shift. *(done —
      harness: failed save retries next tick; confirmed save stops; 401 opens overlay.)*
- [x] **Failed `GET /api/state` silently booted the demo books.** `data.js` sets `__loadFailed`;
      `app.jsx` renders a hard "Can't load your data" screen with retry — the app never shows seed
      data as real, and saving stays disabled so nothing can overwrite the DB. *(done)*
- [x] **One corrupt collection bricked the whole load.** `server.js` → per-row try/catch; the bad
      blob is skipped and logged, everything else loads. *(done)*
- [x] **10 MB body limit vs. whole-state saves.** `server.js` → raised to 25 MB; the client now shows
      a specific "data exceeds the server's size limit" error on 413 instead of failing quietly.
      *(done — per-collection saves come with Phase 2.)*
- [x] **`persistNow` raced the 2s autosave** (was listed under Phase 2) → the autosave net is
      suspended while a save-or-stay transaction is in flight. *(done — harness-verified.)*
- **Verify:** harness executed the REAL `data.js` in a stubbed browser: fail→retry, success→stop,
      change→one save, 401→overlay, persistNow lock — all pass. **Browser test recommended:** stop the
      Node app mid-edit → red badge appears; start it → relogin overlay → work saved.

### Phase 2 — Numbering & concurrency  · CRITICAL/HIGH  *(done)*
Root cause: numbers allocated in-memory + full-state last-writer-wins.
- [x] **Full-snapshot autosave clobbered concurrent sessions.** `data.js` → the autosave (and the exit
      save) now sends ONLY collections whose JSON differs from the last CONFIRMED save (per-collection
      `_lastSaved` map; `persist`/`persistNow` update it too). Two devices working in different areas
      no longer overwrite each other at all. *(done — harness on real data.js: one change → payload
      contains exactly that one collection.)* *Residual (documented): two devices editing the SAME
      collection concurrently still last-write-wins on that collection — full merge/versioning is out
      of scope for this architecture.*
- [x] **Duplicate invoice / PO / order numbers.** `server.js` → new `POST /api/allocate-number`:
      numbers are allocated atomically in the DB (`SELECT … FOR UPDATE` serializes devices) — invoices
      per-store (prefix + counter), PO/order via a `counters` collection seeded from the highest
      existing reference. Clients allocate at SAVE time (the on-screen number is a preview), mirror
      the returned counter, fall back to local counters offline, and always run a local duplicate
      check (manual numbers are blocked with a toast if taken). All four minting sites patched:
      invoice generator, PurchasePage, Orders, client-shop checkout. Failed saves leave a burned
      number (gap), never a duplicate. *(done — allocator harness: 7/7 incl. per-store prefixes,
      seeding past PO-358, fresh-DB fallback.)*
- [x] **`persistNow` rollback raced the 2 s autosave** → done in Phase 1 (autosave suspended while a
      save-or-stay transaction is in flight). *Audit-log-after-confirm is still a nice-to-have.*
- **Verify:** harnesses green (14/14). **Browser test recommended:** two devices, create invoices
      simultaneously → distinct numbers; edit different areas on each → both survive.

### Phase 3 — Security & access control  · CRITICAL *(done — all deferred items now closed)*
- [x] **Blank-password admin takeover.** `server.js` → the staff-login branch now skips `isOwner` records
      and rejects any blank/absent stored password. *(done — verified: blank-pw owner login blocked, real
      staff login still works.)* **This is the important one — it was an unauthenticated takeover.**
- [x] **`/api/state` ships secrets to any logged-in user.** `server.js` → `redactForClient` now blanks
      `users[].password`, `smtpProfiles[].password` AND `waConfig.token` in the payload; `preserveUserSecrets`
      re-fills each on write so a save can't wipe them. Secret handling moved server-side: `send-mail`/`test-smtp`
      fill the SMTP password from the stored profile (`fillSmtpSecret`, matched by id then host+user);
      `send-whatsapp`/`test-whatsapp` fill the token from the stored config (`fillWaToken`). The browser now sends
      the profile id / blank secret; the client guards were updated to not require the (now-hidden) secret.
      *(done — 20 harness checks against the real extracted functions: redact, preserve-refill, real-change
      passthrough, and fill-by-id/host+user all correct. Recommend one live send test on staging.)*
- [x] **Detail routes reachable by hash regardless of role.** `app.jsx` → the render gate now checks the route's
      governing module (`navActive`: invoiceview→history, client→people, purchase/po/receive→inventory). *(done)*
- [x] **Password-reset code brute-forceable.** `server.js` → the code is invalidated after 5 wrong attempts
      (owner and staff paths). *(done)*
- [x] **`/api/admin/upload` hardening** — now uses `crypto.timingSafeEqual` and per-IP rate limiting (5 tries →
      10-min lockout). `server.js`. *(done)*
- [x] **No server-side write authorization.** `server.js` → `requireAuth` now attaches the session and every
      write path (`/api/save/:collection`, `/api/save-bulk`, `/api/state`) runs `authorizeWrites`: a **Client**
      login may write only `orders`; `roles`/`modules` are owner/Admin-only; and `users`/`accounts`/`TAX`/
      `company`/`companies`/`smtpProfiles`/`waConfig` require the matching role permission (`settings.users`,
      `settings.company`, `settings.email`, `accounting.coa`), read from the stored `roles`. Disallowed
      collections are dropped (never a non-2xx, which the client would retry forever) and logged. This respects
      the granular Manager/Supervisor rights instead of a blunt admin-only gate. *(done — 14 harness checks:
      owner/admin pass all; Manager drops only roles+modules; Sales drops all sensitive; Client keeps only orders;
      a real client order save passes clean.)*
- [x] **Client portal defaulted to another (wholesale) client & leaked prices** / **Orders showed staff actions to
      client users.** `screens-shop.jsx` → the client is now resolved via `sessionClientId()` (the old lookup
      matched `user.id` against `session.userId`, which is the email/name, so it never matched and defaulted to
      `D.clients[0]`); the client selector is hidden for client logins and never falls back to another client.
      `screens-orders.jsx` → lifecycle actions (Mark paid/Ordered/In Transit/Receive/Resolve), Add/Edit/Delete
      order, and — importantly — the **Private (staff-only) comments tab** are all hidden from client logins.
- [x] **`send-mail` / `send-whatsapp` secret exposure.** Closed together with the redaction work above — the
      token/password no longer travels to the browser at all; the server fills it from the stored config. Staff
      email/WhatsApp still work unchanged; a Client login can't reach these flows (portal has no such UI, and
      writes are authorized server-side).
- [ ] **Staff per-store access is ineffective** (session-field mismatch + empty `companies:[]` treated as
      "all"). `data.js:481-488` → look up by `s.uid`; decide `[]` = none vs all.
- [x] *(Lower)* **Account enumeration on forgot-password** — the "no such account" branch now returns the same
      generic "if an account matches, a code was emailed" message as a real send. **Timing-unsafe owner-password
      compares** — login and change-password now compare the scrypt hashes with `crypto.timingSafeEqual`
      (`hashEqual` helper). *(done)*
- [ ] *(Lower, still open)* deactivated staff keep access till session TTL; `Math.random()` reset code (fine for
      a 2-user shop, but `crypto.randomInt` would be stronger). Staff-role users (not clients) can still POST
      non-sensitive business collections via the raw API — the blob-store model can't do per-row ownership without
      a schema change; the untrusted **client** principal is fully constrained above.
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

### Phase 7 — Returns & exchanges correctness  · CRITICAL/HIGH  *(done)*
- [x] **No cumulative prior-return check → the same invoice could be fully returned repeatedly.** `screens-detail.jsx`
      → each line is capped at `sold − alreadyReturned` (summed from prior credit notes); fully-returned lines are
      disabled. *(done — verified: sold 5, returned 3 → max 2; fully returned → 0.)*
- [x] **Refund computed on undiscounted price** → customer over-refunded. `screens-detail.jsx` → refund uses the
      price net of line discount, and prorates any invoice-level discount. *(done — $100 @20% now refunds $89.60, not $112.)*
- [x] **Refunded invoices grew a phantom balance due and flipped to Unpaid/Partial.** `screens-detail.jsx` → new
      `invEffectiveTotal` (= total + Σ credit-note totals) and `invOpenBalance`; status/balance/Unpaid all use them.
      *(done — verified by harness across 5 scenarios incl. paid-refund, owed-refund, exchange-up.)*
- [x] **Exchange "collect from customer" money is never recorded.** `screens-detail.jsx` → an exchange-up now records
      the collected amount as a payment on the invoice (account-selectable), so it reaches the books. *(done)*
- [x] **Full refund written to `inv.refunded` even when unpaid/partial.** `screens-detail.jsx` → `inv.refunded` now
      accumulates only `refundPaid` (the amount actually paid out), for exchanges as well as returns. *(done)*
- [x] **Return/exchange saves were fire-and-forget with no rollback.** `screens-detail.jsx` → `recordReturn` now
      snapshots the touched collections, `await persistNow`, and restores on failure. *(done)*
- [x] Also: `UnpaidInvoices` excludes order (deposit) invoices and uses the return-aware open balance everywhere.
- **Verify:** *(harness-verified)* status/balance across paid/owed-refund/exchange scenarios; cap and discount-refund
      math checked by hand. **Browser smoke-test recommended** for the modal UX (disabled rows, "N left" hint).

### Phase 8 — Inventory / purchase orders / receiving / POS  · HIGH/MEDIUM  *(done)*
- [x] **Stock movement/aging read a stale demo closure.** `data.js` → helpers now read the LIVE `BCCWE.itemSales`
      (the closure array is replaced by the DB load) and ignore negative rows. *(done)*
- [x] **Aging clock anchored to hardcoded `2026-06-14`.** `data.js` → `stockNow()` uses the live local date; the seed
      anchor stays only for demo data. *(done)*
- [x] **POS checkout posts no journal / accounts.** `screens-pos.jsx` → posts the same balanced entry as the register
      (cash / revenue split goods-vs-service / GST-PST / COGS-inventory), updates `accounts`, and includes
      `journal,accounts` in persistNow + rollback. *(done)*
- [x] **Discrepancy records duplicated on every re-receive, never cleared.** `screens-b.jsx` → each receive replaces
      the order's rows in the register with the CURRENT outstanding state; fully received → cleared. *(done)*
- [x] **Editing a PO's cost/charges didn't update `landedUnit`.** `screens-b.jsx` `saveEdit` → landed cost + charge
      share re-derived per line from the edited numbers (same allocation as PurchasePage); explicit heads-up logged and
      toasted that already-received stock keeps its old cost. *(done)*
- [x] **Editing an oversold item zeroed negative stock + fabricated a phantom ADJ purchase.** `screens-b.jsx` →
      stock keeps its sign in the item form. *(done)*
- [x] **Over-receiving unbounded; `/receive` reachable on received orders.** `screens-b.jsx` → receiving is capped at
      the outstanding amount (input max + clamp) and a fully received order shows "nothing left to receive". *(done)*
- [x] **CSV import overwrote existing stock/cost/category with defaults.** `screens-b.jsx` → existing items only take
      fields the row actually supplies; import now persists immediately. *(done)*
- [x] **Purchases/receipts never touched the books.** `screens-c.jsx` → new purchase-order pass: received goods accrue
      supplier A/P (2000) at landed value, order payments leave cash; ADJ/OPEN opening-stock pseudo-orders excluded;
      Balance Sheet shows Accounts payable / supplier prepayments. *(done — harness: A/P $25 = 5×$11 − $30 deposit ✓)*
- [x] **`itemAvgCost` ignored Partial receipts.** `screens-b.jsx` → partial layers count (bonus only once complete);
      "Last cost" column now actually shows the last landed cost, not the average. *(done — harness ✓)*
- [x] **Order edit could flip to "Received" with no stock movement / couldn't show "Partial" / qty below received.**
      `screens-b.jsx` → status is locked once any stock is received (receive flow owns it); "Received" removed from the
      hand-set options; qty clamped ≥ qtyReceived. `screens-orders.jsx` → editing preserves `qtyReceived` by code. *(done)*
- [x] Receiving is save-or-stay (`persistNow` + snapshot rollback); receive log shows the right denominator; register
      salesperson no longer falls back to a hardcoded demo id.
- [ ] **Deferred:** freight share of never-received units on a closed-short order isn't expensed anywhere (needs a
      close-out flow); PurchasePage itself still doesn't post its journal at order time (the engine pass above covers
      the books' end state).
- **Verify (browser):** partial-receive an order twice → ONE discrepancy row set, correct stock/cost; POS sale appears
      in the General Journal and CoA; price-only CSV leaves stock/cost intact; edit a received PO → status stays.

### Phase 9 — Reports & dashboard display  · MEDIUM  *(done)*
- [x] **Dashboard "Revenue MTD"** now pre-tax, excludes order deposits, nets returns (invoice + register + CN). *(done)*
- [x] **"Outstanding"/"Overdue" KPIs** use the return-aware `invOpenBalance`, exclude orders, and derive overdue
      from `due < today` (the stored status was frozen). GST/PST tile now nets input tax credits. *(done)*
- [x] **Revenue-trend tooltip 1000× inflation** fixed; the trend uses net pre-tax revenue; month labels derived
      from real dates (were hardcoded Mar–Jun). *(done)*
- [x] **InvoiceHistory register rows** keep the real pre-tax subtotal and collected/owed split; partially-paid
      register sales show "Partially Paid". *(done)*
- [x] **People "A/R balance"** derived from invoices (return-aware), not the unmaintained stored field. *(done)*
- [x] **Sales-by-item / People / item-view analytics** use the RECORDED price/discount/cost-at-sale (all itemSales
      writers now capture `cost`); restocked returns write negative rows so units/revenue/profit net out. *(done)*
- [x] *(Lower)* fabricated KPI decorations removed ("+12.4%", "2 accounts", fake remittance date).
- **Verify (browser):** dashboard MTD vs a hand-computed month; People A/R matches ClientAccount.

### Phase 10 — Config hygiene & settings safety  · MEDIUM/LOW  *(done)*
- [x] **Demo identity purged.** `freshDefaults()` blanks the demo backup/CC/accountant emails and fake GST/PST
      numbers, and keeps setup (categories/catTree/services) instead of wiping it. **Plus a load-time scrub for
      EXISTING databases**: the exact seed values (`records@bccwe.ca` CC, `accounts@bccwe.ca`, demo GST/PST) are
      removed on next load — the silent CC on every outgoing invoice is dead. *(done)*
- [x] **"No Tax" edit trap** — the editor now seeds 0% for a zero-tax mode instead of a 5% GST default, so opening
      and saving it no longer converts exempt clients to taxed. *(done)*
- [x] **Store-delete guard** counts fallback ownership (invoices/sales/POs with no `companyId` that default to the
      store). *(done)*
- [x] **Custom roles carry a persisted rank** (inherited from the copied role; legacy unranked = manager level, not
      0) — closes the assign-a-powerful-custom-role escalation. *(done)*
- [x] **Download log** attributed to the real signed-in user; log ids collision-proofed. *(done)*
- [x] **`modules` (permission definitions) is code, not data** — kept from code on load and never persisted, so new
      permissions ship to existing installs. `TAX`/roles stay user-editable data. *(done — harness-verified.)*
- [x] *(Lower)* owner deactivate no-op is now blocked with an explanation; BOM fixed earlier; multi-segment route
      params preserved; same-ms log id collisions fixed. Seed-data nits left as-is (demo only).
- **Verify (browser):** fresh-start → no demo CC/tax numbers, dropdowns populated; open+save "No Tax" → still 0%.

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

---

## Accounting build-out (requested 2026-08-15, after the remediation)

Review findings: account edit/new/delete missing; "New account" & "Manual journal entry" buttons dead;
General ledger tab rendered FAKE hardcoded rows; no periods anywhere; Reports period chips decorative;
Reports export buttons dead; Balance Sheet thin (3 lines) and blind to manual entries; journal untouched
by the engine (no way to post opening balances); group-name typos ("Liabilitys").

### Phase A — Account management  *(done)*
- [x] Edit account (rename; type editable for custom accounts, fixed for system), New-account modal
      (unique numeric code), delete with guards (system accounts / non-zero balance / referenced by tax
      or expense mappings / journal history → blocked). Admin-only; audit-logged. Plurals fixed.

### Phase B — Manual journal entries + opening balances  *(done)*
- [x] Manual journal entry modal: date, memo, Dr/Cr lines with account picker, must balance to post;
      entries flagged `manual:true`, deletable (reverses effect). persistNow + rollback.
- [x] Engine reads MANUAL journal entries only (system-generated register/POS entries stay display-only —
      their effects are already derived; folding them in would double-count). Applied after the inventory
      snapshot so valuation adjustments stick. *(harness: bank trued 2,058,327.82 → 45,000; equipment
      appears; TB still balances; system JEs ignored.)*
- [x] "Set opening balances" guided flow: type each asset/liability account's REAL balance; one balanced
      adjustment posts, offset to 3000 Owner's Equity — the migration-day tool.

### Phase C — Real Balance Sheet + real Ledger  *(Balance Sheet done; ledger detail partial)*
- [x] Balance Sheet rebuilt from the full derived account balances — every asset/liability/equity account
      (Equipment, A/P, manual entries, opening balances), totals, equation check, "as of" date. Used by
      Reports AND as a new "Balance sheet" tab inside Accounting.
- [x] Fake ledger rows removed — the ledger now lists REAL recorded journal lines for the account
      (register/POS/manual) with an honest note that invoice/expense activity posts straight to the
      derived balance.
- [x] Full per-account transaction detail: new `ledgerLines()` mirrors every engine posting as dated
      lines — invoices/payments (per payment record), returns/refunds, expenses (with ITC), register/POS,
      purchase orders, manual entries — with running balance, period filter and opening-balance row.
      *(harness: lines TIE to the derived balance for every account except the documented 1300/3900.)*

### Phase D — Periods & exports  *(done)*
- [x] Reports period selector is REAL: This month / Last month / This year / All time / Custom filters the
      P&L, Tax report and Income-by-client (`storeFinance(filter, range)`); BS/TB/Aging labeled as-of-today.
- [x] Journal tab: search (id/memo/account) + show-more pagination.
- [x] "Excel/CSV" exports the active report (P&L, BS, TB, Tax, Aging, Income-by-client) via exportXlsx;
      "Export PDF" renders the on-screen report. Both were dead buttons.
- [x] Bonus: AgingReport correctness (was still using stored status + raw total−paid and included order
      invoices) → return-aware `invOpenBalance`, live `invStatus`, orders excluded — matching Unpaid.
- [x] Income-by-client now pre-tax, order-excluding, period-aware — consistent with the P&L.
