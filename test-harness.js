/* ============================================================================
   BCCWE Invoicing System — regression harness
   ----------------------------------------------------------------------------
   Run with:  node test-harness.js
   No dependencies beyond Node built-ins + the vendored Babel (public/vendor).

   The app has no build step — every public/app/*.jsx file is compiled in the
   browser by Babel Standalone and shares one global scope. That makes two
   things worth checking without a browser or a database:

     1. Every JSX file still compiles with the SAME Babel the browser uses
        (a syntax slip white-screens the whole app).
     2. The security-critical server.js helpers behave correctly. These are
        pure functions, so we EXTRACT the real source out of server.js by
        brace-matching and exercise it against an in-memory store — no live
        MySQL needed, and no risk of a re-typed copy drifting from the code.

   Exit code is non-zero if anything fails, so this can gate a deploy.
   ============================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
let PASS = 0, FAIL = 0;
const FAILURES = [];
function ok(cond, label) { if (cond) { PASS++; } else { FAIL++; FAILURES.push(label); console.log("  ✗ " + label); } }
function section(name) { console.log("\n" + name); }

// ---- helpers to pull real definitions out of server.js -----------------------
const SERVER = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
function extractFn(src, name) {
  const re = new RegExp("(async\\s+)?function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("function not found: " + name);
  let i = src.indexOf("{", m.index), depth = 0, end = -1;
  for (let k = i; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  return src.slice(m.index, end);
}
function extractConst(src, name) {
  const re = new RegExp("const\\s+" + name + "\\s*=");
  const m = re.exec(src);
  if (!m) throw new Error("const not found: " + name);
  let k = src.indexOf("=", m.index) + 1, depth = 0;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) { k++; break; }
  }
  return src.slice(m.index, k);
}

// ============================================================================
// 1. Every app JSX file compiles with the browser's Babel
// ============================================================================
function testJsxCompiles() {
  section("JSX compiles (browser Babel)");
  const sandbox = { self: {}, navigator: { userAgent: "node" }, document: {}, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/babel.min.js"), "utf8"), sandbox, { filename: "babel.min.js" });
  const Babel = sandbox.Babel;
  ok(!!(Babel && Babel.transform), "Babel Standalone loaded");
  if (!Babel || !Babel.transform) return;
  const dir = path.join(ROOT, "public/app");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx")).sort();
  ok(files.length > 0, "found JSX files to check");
  for (const f of files) {
    try {
      Babel.transform(fs.readFileSync(path.join(dir, f), "utf8"), { presets: ["react"], filename: f });
      ok(true, "compiles: app/" + f);
    } catch (e) {
      ok(false, "compiles: app/" + f + " — " + e.message.split("\n")[0]);
    }
  }
}

// ============================================================================
// 2. server.js secret redaction / preserve / fill
// ============================================================================
async function testSecrets() {
  section("Server secret handling (redact / preserve / fill)");
  let STORE = {};
  const getCollectionSafe = async (n) => STORE[n] || null;
  const body =
    extractFn(SERVER, "redactForClient") + "\n" +
    extractFn(SERVER, "preserveUserSecrets") + "\n" +
    extractFn(SERVER, "fillSmtpSecret") + "\n" +
    extractFn(SERVER, "fillWaToken") + "\n" +
    "return { redactForClient, preserveUserSecrets, fillSmtpSecret, fillWaToken };";
  const { redactForClient, preserveUserSecrets, fillSmtpSecret, fillWaToken } =
    new Function("getCollectionSafe", body)(getCollectionSafe);

  const state = {
    users: [{ id: "u1", name: "A", password: "staffpw" }],
    smtpProfiles: [{ id: "sp1", host: "mail.x", user: "a@x", password: "smtppw" }],
    waConfig: { enabled: true, phoneId: "123", token: "EAAG" },
    invoices: [{ no: "INV-1" }],
  };
  const red = redactForClient(JSON.parse(JSON.stringify(state)));
  ok(red.users[0].password === "", "redact: user password blanked");
  ok(red.smtpProfiles[0].password === "", "redact: smtp password blanked");
  ok(red.waConfig.token === "", "redact: wa token blanked");
  ok(red.smtpProfiles[0].host === "mail.x" && red.waConfig.phoneId === "123", "redact: non-secret fields kept");
  ok(red.invoices[0].no === "INV-1", "redact: non-secret collections untouched");

  STORE.users = [{ id: "u1", name: "A", email: "a@x", password: "staffpw" }];
  ok((await preserveUserSecrets("users", [{ id: "u1", password: "" }]))[0].password === "staffpw", "preserve: blank user pw refilled");
  ok((await preserveUserSecrets("users", [{ id: "u1", password: "new" }]))[0].password === "new", "preserve: real user pw passes");

  STORE.smtpProfiles = [{ id: "sp1", host: "mail.x", user: "a@x", password: "smtppw" }];
  ok((await preserveUserSecrets("smtpProfiles", [{ id: "sp1", password: "" }]))[0].password === "smtppw", "preserve: blank smtp pw refilled by id");
  ok((await preserveUserSecrets("smtpProfiles", [{ host: "mail.x", user: "A@X", password: "" }]))[0].password === "smtppw", "preserve: smtp pw refilled by host+user");
  ok((await preserveUserSecrets("smtpProfiles", [{ id: "sp1", password: "chg" }]))[0].password === "chg", "preserve: real smtp pw passes");

  STORE.waConfig = { phoneId: "123", token: "EAAG" };
  ok((await preserveUserSecrets("waConfig", { phoneId: "123", token: "" })).token === "EAAG", "preserve: blank wa token refilled");
  ok((await preserveUserSecrets("waConfig", { phoneId: "123", token: "new" })).token === "new", "preserve: real wa token passes");

  ok((await fillSmtpSecret({ id: "sp1", password: "" })).password === "smtppw", "fill: smtp by id");
  ok((await fillSmtpSecret({ host: "mail.x", user: "a@x", password: "" })).password === "smtppw", "fill: smtp by host+user");
  ok((await fillSmtpSecret({ id: "sp1", password: "typed" })).password === "typed", "fill: smtp keeps supplied pw");
  ok((await fillWaToken("")) === "EAAG", "fill: wa token from store");
  ok((await fillWaToken("x")) === "x", "fill: wa keeps supplied token");
}

// ============================================================================
// 3. server.js write authorization
// ============================================================================
async function testAuthz() {
  section("Server write authorization");
  const roles = [
    { id: "r_admin", name: "Admin", perms: { settings: { users: true, company: true, email: true }, accounting: { coa: true } } },
    { id: "r_manager", name: "Manager", perms: { settings: { users: true, company: true, email: true }, accounting: { coa: true } } },
    { id: "r_sales", name: "Sales Person", perms: { settings: {}, accounting: {} } },
  ];
  const getCollectionSafe = async (n) => (n === "roles" ? roles : null);
  const body =
    extractFn(SERVER, "isAdminSession") + "\n" +
    extractFn(SERVER, "isClientSession") + "\n" +
    extractConst(SERVER, "CLIENT_WRITABLE") + "\n" +
    extractConst(SERVER, "SENSITIVE_WRITES") + "\n" +
    extractFn(SERVER, "authorizeWrites") + "\n" +
    "return { authorizeWrites, isAdminSession, isClientSession };";
  const { authorizeWrites, isAdminSession, isClientSession } =
    new Function("getCollectionSafe", "console", body)(getCollectionSafe, { warn() {} });

  const all = { invoices: 1, orders: 1, auditLog: 1, roles: 1, users: 1, accounts: 1, TAX: 1, company: 1, companies: 1, modules: 1, smtpProfiles: 1, waConfig: 1 };
  const keys = (o) => Object.keys(o).sort();

  ok(isAdminSession({ isOwner: true }) && isAdminSession({ role: "Admin" }), "detect: owner/admin");
  ok(isClientSession({ roleId: "r_client" }) && isClientSession({ clientId: "c1" }), "detect: client");
  ok(!isClientSession({ isOwner: true }), "detect: owner is not client");

  ok((await authorizeWrites({ isOwner: true, role: "Admin" }, all)).dropped.length === 0, "owner: nothing dropped");
  const mgr = await authorizeWrites({ role: "Manager", roleId: "r_manager" }, all);
  ok(mgr.dropped.sort().join(",") === "modules,roles", "manager: only roles+modules dropped");
  const sales = await authorizeWrites({ role: "Sales Person", roleId: "r_sales" }, all);
  ok(keys(sales.allowed).includes("invoices") && keys(sales.allowed).includes("orders"), "sales: business data kept");
  ok(!keys(sales.allowed).some((k) => ["roles", "users", "accounts", "TAX", "company", "companies", "modules", "smtpProfiles", "waConfig"].includes(k)), "sales: all sensitive dropped");
  const client = await authorizeWrites({ roleId: "r_client", clientId: "c1" }, all);
  ok(keys(client.allowed).join(",") === "orders", "client: only orders allowed");
  ok((await authorizeWrites({ roleId: "r_client", clientId: "c1" }, { orders: [{ id: "o1" }] })).dropped.length === 0, "client: order save passes clean");
}

// ============================================================================
// 4. Inline-edit (EditCell) commit math — mirrors screens-b.jsx EditCell.commit
// ============================================================================
function testEditCell() {
  section("Inline-edit commit math (mirrors screens-b.jsx EditCell)");
  function commit(val, value, opts) {
    opts = opts || {};
    const n = parseFloat(val);
    if (isNaN(n)) return { saved: false };
    if (!opts.allowNeg && n < 0) return { saved: false };
    const r = opts.integer ? Math.round(n) : Math.round(n * 100) / 100;
    const tol = opts.integer ? 0.5 : 0.005;
    if (Math.abs(r - (value || 0)) < tol) return { saved: false };
    return { saved: true, r };
  }
  ok(commit("12", 7, { allowNeg: true, integer: true }).r === 12, "stock 7→12");
  ok(commit("-3", 5, { allowNeg: true, integer: true }).r === -3, "stock allows negative (oversell)");
  ok(commit("7", 7, { allowNeg: true, integer: true }).saved === false, "stock unchanged → no save");
  ok(commit("12.6", 7, { allowNeg: true, integer: true }).r === 13, "stock rounds to whole");
  ok(commit("-1", 10, {}).saved === false, "price cannot go negative");
  ok(commit("12.50", 10, {}).r === 12.5, "price edit");
  ok(commit("10.00", 10, {}).saved === false, "price unchanged → no save");
}

// ============================================================================
// 5. Inventory export — re-imports cleanly + real xlsx.js builds a workbook
// ============================================================================
function testInventoryExport() {
  section("Inventory export (round-trip + xlsx pipeline)");

  // (a) The export's import-field headers must map back to the Import-CSV keys
  //     even though the export appends extra computed columns.
  const uiSrc = fs.readFileSync(path.join(ROOT, "public/app/ui.jsx"), "utf8");
  const gridToObjects = new Function(extractFn(uiSrc, "gridToObjects") + "\nreturn gridToObjects;")();
  const importCols = [
    { key: "code", label: "Item Code", required: true }, { key: "name", label: "Description" },
    { key: "cat", label: "Category" }, { key: "supplier", label: "Supplier" },
    { key: "cost", label: "Cost Price" }, { key: "price", label: "Sales Price" },
    { key: "stock", label: "Stock" }, { key: "bonus", label: "Bonus" }, { key: "alert", label: "Stock Alert" },
  ];
  const header = ["Item Code", "Description", "Category", "Supplier", "Cost Price", "Sales Price", "Stock",
    "Bonus", "Stock Alert", "Avg Cost", "Last Cost", "Unit Margin", "Margin %", "Stock Value (cost)",
    "Retail Value", "Purchased", "Status"];
  const row = ["ABC-1", "Widget", "Part", "Acme Supply", "2.50", "12.00", "40", "4", "10",
    "2.55", "2.60", "9.50", "79", "102.00", "480.00", "2026-05-01", "In stock"];
  const objs = gridToObjects([header, row], importCols);
  ok(objs.length === 1 && objs[0].code === "ABC-1" && objs[0].supplier === "Acme Supply",
    "export re-imports: text fields map by label past computed columns");
  ok(objs[0].cost === "2.50" && objs[0].price === "12.00" && objs[0].stock === "40" && objs[0].alert === "10",
    "export re-imports: numeric fields land on the right keys (not shifted)");

  // (b) The real xlsx.js builds a valid workbook from an export-shaped payload.
  let captured = null;
  const sb = {
    console, TextEncoder, TextDecoder, Uint8Array, Array, Math, String, Number, Date, JSON, isNaN, parseFloat, parseInt,
    Blob: function (parts) { captured = parts && parts[0]; this.size = captured ? captured.length : 0; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, style: {}, setAttribute() {} }), body: { appendChild() {}, removeChild() {} } },
    setTimeout: (fn) => fn(),
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/app/xlsx.js"), "utf8"), sb, { filename: "xlsx.js" });
  ok(typeof sb.window.exportXlsx === "function", "xlsx: exportXlsx exposed");
  const cols = header.map((label, i) => ({ key: "k" + i, label, type: i >= 4 && i <= 14 ? "number" : undefined }));
  const data = [{}, {}].map((_, r) => { const o = {}; cols.forEach((c, i) => { o[c.key] = c.type === "number" ? r + i : "v" + i; }); return o; });
  let threw = null;
  try {
    sb.window.exportXlsx("BCCWE-Inventory", "Inventory", cols, data, { title: "T", subtitle: "2 products", totals: { k13: 102, k14: 480 } });
  } catch (e) { threw = e; }
  ok(!threw, "xlsx: exportXlsx runs without throwing" + (threw ? " (" + threw.message + ")" : ""));
  ok(captured && captured.length > 0 && captured[0] === 0x50 && captured[1] === 0x4b, "xlsx: produced a ZIP-signature workbook");
}

// ============================================================================
// 6. Accounting engine — Balance Sheet balances, ledger ties, month periods
//    Runs the REAL screens-c.jsx (Babel-transformed) on a synthetic dataset.
// ============================================================================
function testAccountingEngine() {
  section("Accounting engine (balance identity, ledger ties, month periods)");

  // Synthetic books: an invoice (partly paid via a payment record), an expense
  // with GST+PST, a cash register sale, a received+part-paid purchase order,
  // a manual opening-balance journal entry, and live stock for the 1300 snapshot.
  const BCCWE = {
    today: "2026-08-15",
    accounts: [
      { code: "1000", name: "Cash", type: "Asset" }, { code: "1010", name: "Bank", type: "Asset" },
      { code: "1200", name: "A/R", type: "Asset" }, { code: "1300", name: "Inventory", type: "Asset" },
      { code: "2000", name: "A/P", type: "Liability" }, { code: "2100", name: "GST", type: "Liability" },
      { code: "2110", name: "PST", type: "Liability" }, { code: "2200", name: "Deposits", type: "Liability" },
      { code: "3000", name: "Owner", type: "Equity" }, { code: "3900", name: "Retained", type: "Equity" },
      { code: "4000", name: "Sales", type: "Revenue" }, { code: "4010", name: "Wholesale", type: "Revenue" },
      { code: "4100", name: "Service", type: "Revenue" }, { code: "4200", name: "Restock", type: "Revenue" },
      { code: "5000", name: "COGS", type: "Expense" }, { code: "5100", name: "WriteOff", type: "Expense" },
      { code: "6100", name: "Rent", type: "Expense" },
    ],
    clients: [{ id: "c1", type: "Retail" }],
    invoices: [{ no: "INV-1", clientId: "c1", date: "2026-08-01", due: "2026-08-31", subtotal: 100, gst: 5, pst: 7, total: 112, paid: 60, payMethod: "Debit", lines: [{ code: "A", qty: 1, price: 100, cost: 40, disc: 0 }] }],
    payments: [{ inv: "INV-1", amount: 60, date: "2026-08-02", acct: "1010" }],
    creditNotes: [],
    cashSales: [{ date: "2026-08-04", method: "Cash", subtotal: 50, gst: 2.5, pst: 3.5, total: 56, paid: 56, cogs: 20 }],
    expenses: [{ date: "2026-08-03", category: "Rent", desc: "Aug rent", amount: 500, tax: "both", acct: "6100", paidFrom: "1010" }],
    purchaseOrders: [{ po: "PO-1", date: "2026-08-05", payment: { amount: 30, account: "1010" }, qtyReceived: 2, landedUnit: 25 }],
    journal: [{ manual: true, date: "2026-08-06", memo: "Opening bank", lines: [{ acct: "1010", dr: 1000, cr: 0 }, { acct: "3000", dr: 0, cr: 1000 }] }],
    inventory: [{ code: "A", stock: 3, cost: 40 }],
    TAX: { modes: { both: { gst: 0.05, pst: 0.07 }, gst: { gst: 0.05, pst: 0 }, none: { gst: 0, pst: 0 } } },
    expenseCategories: [], orders: [],
  };

  // Load Babel and transform the real screens-c.jsx, then run it with stubs.
  const bsand = { self: {}, navigator: { userAgent: "node" }, document: {}, console };
  bsand.window = bsand;
  vm.createContext(bsand);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/babel.min.js"), "utf8"), bsand, { filename: "babel.min.js" });
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-c.jsx"), "utf8");
  const js = bsand.Babel.transform(src, { presets: ["react"], filename: "screens-c.jsx" }).code;

  const ctx = {
    console, BCCWE,
    deriveLines: (inv) => inv.lines || [],
    poLines: (po) => [{ qtyReceived: po.qtyReceived || 0, landedUnit: po.landedUnit }],
    inRange: (d, r) => d >= r.from && d <= r.to,
    React: { createElement: () => null, Fragment: {} },
    useState: () => [null, () => {}], useEffect: () => {}, useMemo: (f) => f(), useRef: () => ({}),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: "screens-c.js" });
  ok(typeof ctx.liveAccountBalances === "function" && typeof ctx.balanceSheetData === "function" && typeof ctx.ledgerLines === "function",
    "engine functions loaded from real screens-c.jsx");

  const bal = ctx.liveAccountBalances("all");
  const typeOf = {}; BCCWE.accounts.forEach((a) => { typeOf[a.code] = a.type; });
  const sumType = (t) => BCCWE.accounts.filter((a) => a.type === t).reduce((s, a) => s + (bal[a.code] || 0), 0);
  // The identity the Balance Sheet display relies on: assets = liabilities +
  // equity + (revenue − expenses). Guaranteed by the 3900 plug.
  const gap = sumType("Asset") - (sumType("Liability") + sumType("Equity") + (sumType("Revenue") - sumType("Expense")));
  ok(Math.abs(gap) < 0.01, "identity: assets = liabs + equity + earnings (gap " + gap.toFixed(4) + ")");

  // The actual display fix: balanceSheetData folds earnings into 3900 so the
  // published statement balances.
  const d = ctx.balanceSheetData("all");
  ok(Math.abs(d.tA - (d.tL + d.tE)) < 0.02, "balance sheet: assets " + d.tA.toFixed(2) + " = L+E " + (d.tL + d.tE).toFixed(2));
  ok(d.tA > 0, "balance sheet: non-trivial dataset (assets " + d.tA.toFixed(2) + ")");

  // Ledger lines tie to derived balances for normal accounts (not 1300/3900).
  const lines = ctx.ledgerLines("all");
  ["1000", "1010", "1200", "2000", "2100", "2110", "4000", "5000", "6100"].forEach((code) => {
    const dn = typeOf[code] === "Asset" || typeOf[code] === "Expense";
    const net = (lines[code] || []).reduce((s, l) => s + (dn ? l.dr - l.cr : l.cr - l.dr), 0);
    ok(Math.abs(net - (bal[code] || 0)) < 0.02, "ledger ties " + code + " (lines " + net.toFixed(2) + " vs derived " + (bal[code] || 0).toFixed(2) + ")");
  });

  // Drill-down source links: invoice postings and PO postings carry route refs.
  ok((lines["4000"] || []).some((l) => l.ref === "invoiceview/INV-1"), "revenue line links to its invoice");
  ok((lines["1010"] || []).some((l) => l.ref === "invoiceview/INV-1"), "payment line links to its invoice");
  ok((lines["2000"] || []).some((l) => l.ref === "po/PO-1"), "payable line links to its purchase order");

  // Reconciliation line keys: identical lines get distinct, deterministic keys.
  const dupLines = [
    { date: "2026-08-01", memo: "Payment — INV-1", dr: 60, cr: 0 },
    { date: "2026-08-01", memo: "Payment — INV-1", dr: 60, cr: 0 },
    { date: "2026-08-02", memo: "Expense — Rent", dr: 0, cr: 535 },
  ];
  const keyed1 = ctx.reconKeyedLines(dupLines);
  const keyed2 = ctx.reconKeyedLines(dupLines);
  ok(keyed1.length === 3 && new Set(keyed1.map((l) => l.key)).size === 3, "recon keys: duplicates get distinct keys");
  ok(keyed1.every((l, i) => l.key === keyed2[i].key), "recon keys: deterministic across recomputes");

  // Supplier payables rows mirror the 2000 A/P balance.
  const ap = ctx.supplierPayableRows("all");
  ok(ap.length === 1 && ap[0].ref === "PO-1" && Math.abs(ap[0].bal - 20) < 0.005,
    "supplier payables: PO-1 received 50, paid 30 → owing 20");
  ok(Math.abs(ap.reduce((s, r) => s + r.bal, 0) - (bal["2000"] || 0)) < 0.02,
    "supplier payables total ties to account 2000");

  // Tax-filing period overlap detection.
  ok(ctx.rangesOverlap({ from: "2026-01-01", to: "2026-03-31" }, { from: "2026-03-01", to: "2026-03-31" }), "overlap: quarter vs its last month");
  ok(!ctx.rangesOverlap({ from: "2026-01-01", to: "2026-01-31" }, { from: "2026-02-01", to: "2026-02-28" }), "overlap: adjacent months do not overlap");
  ok(ctx.rangesOverlap({ from: "2026-02-01", to: "2026-02-28" }, { from: "2026-02-28", to: "2026-03-31" }), "overlap: shared boundary day counts");

  // Month period ("m:YYYY-MM") — extract the real periodRange from ui.jsx.
  const uiSrc = fs.readFileSync(path.join(ROOT, "public/app/ui.jsx"), "utf8");
  const pr = new Function("BCCWE", "monthLabel", "shortDate",
    extractFn(uiSrc, "periodRange") + "\nreturn periodRange;")(
    { today: "2026-08-15" }, (m) => m, (d) => d);
  const feb = pr("m:2026-02");
  ok(feb.from === "2026-02-01" && feb.to === "2026-02-28", "month period: Feb 2026 → " + feb.from + "…" + feb.to);
  const leap = pr("m:2024-02");
  ok(leap.to === "2024-02-29", "month period: leap Feb 2024 ends on the 29th");
  const aug = pr("m:2026-08");
  ok(aug.from === "2026-08-01" && aug.to === "2026-08-31", "month period: Aug 2026 full month");
}

// ============================================================================
// 7. Returns / exchanges / defective goods / expenses
//    Every scenario is checked BOTH ways: the P&L (storeFinance) must agree
//    with the ledger (liveAccountBalances), so the Income Statement and the
//    Balance Sheet can never tell different stories.
// ============================================================================
function testReturnsExchangesExpenses() {
  section("Returns / exchanges / defective / expenses");

  const bsand = { self: {}, navigator: { userAgent: "node" }, document: {}, console };
  bsand.window = bsand; vm.createContext(bsand);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/babel.min.js"), "utf8"), bsand, { filename: "babel.min.js" });
  const js = bsand.Babel.transform(fs.readFileSync(path.join(ROOT, "public/app/screens-c.jsx"), "utf8"), { presets: ["react"], filename: "screens-c.jsx" }).code;

  const ACCTS = [
    { code: "1000", name: "Cash", type: "Asset" }, { code: "1010", name: "Bank", type: "Asset" },
    { code: "1200", name: "AR", type: "Asset" }, { code: "1300", name: "Inventory", type: "Asset" },
    { code: "2000", name: "AP", type: "Liability" }, { code: "2100", name: "GST", type: "Liability" },
    { code: "2110", name: "PST", type: "Liability" }, { code: "2200", name: "Deposits", type: "Liability" },
    { code: "3000", name: "Owner", type: "Equity" }, { code: "3900", name: "RE", type: "Equity" },
    { code: "4000", name: "Sales", type: "Revenue" }, { code: "4010", name: "Wholesale", type: "Revenue" },
    { code: "4100", name: "Service", type: "Revenue" }, { code: "4200", name: "Restocking", type: "Revenue" },
    { code: "5000", name: "COGS", type: "Expense" }, { code: "5100", name: "Defective loss", type: "Expense" },
    { code: "6100", name: "Rent", type: "Expense" },
  ];
  const run = (D) => {
    const ctx = { console, BCCWE: D, deriveLines: (i) => i.lines || [], poLines: (p) => p.lines || [],
      clientName: (id) => ((D.clients || []).find((c) => c.id === id) || {}).name || id,
      inRange: (d, r) => d >= r.from && d <= r.to, React: { createElement: () => null, Fragment: {} },
      useState: () => [null, () => {}], useEffect: () => {}, useMemo: (f) => f(), useRef: () => ({}) };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx, { filename: "screens-c.js" });
    return ctx;
  };
  const base = () => ({ today: "2026-08-15", accounts: JSON.parse(JSON.stringify(ACCTS)),
    clients: [{ id: "c1", type: "Retail" }], payments: [], creditNotes: [], cashSales: [], expenses: [],
    purchaseOrders: [], journal: [], defectiveProducts: [], expenseCategories: [],
    inventory: [{ code: "A", stock: 10, cost: 40 }, { code: "B", stock: 5, cost: 55 }],
    TAX: { modes: { both: { gst: 0.05, pst: 0.07 }, none: { gst: 0, pst: 0 } } }, invoices: [] });
  // One sale: item A, cost 40, sold for 100 + tax.
  const SALE = { no: "I1", clientId: "c1", date: "2026-08-01", subtotal: 100, gst: 5, pst: 7, total: 112, paid: 112, payMethod: "Debit", lines: [{ code: "A", qty: 1, price: 100, cost: 40 }] };
  const CN = (extra) => Object.assign({ no: "CN1", type: "Return", retDisp: "Inventory", origInv: "I1", date: "2026-08-10",
    subtotal: -100, gst: -5, pst: -7, total: -112, refund: 112, refundPaid: 112, refundAccount: "1010",
    items: [{ code: "A", qty: 1, price: 100, cost: 40 }] }, extra || {});

  // --- return to inventory: fully reverses the sale ---
  let D = base(); D.invoices = [SALE]; D.creditNotes = [CN()]; D.inventory[0].stock = 11;
  let fin = run(D).storeFinance("all", null);
  ok(Math.abs(fin.revenue) < 0.005 && Math.abs(fin.cogs) < 0.005, "return to inventory reverses revenue and COGS");

  // --- REGRESSION: editing an item's cost must NOT restate past returns ---
  D = base(); D.invoices = [SALE]; D.creditNotes = [CN()]; D.inventory[0].cost = 60; // cost edited later
  fin = run(D).storeFinance("all", null);
  ok(Math.abs(fin.cogs) < 0.005, "return uses the cost snapshotted at sale, not the item's current cost (COGS " + fin.cogs.toFixed(2) + ")");

  // --- defective return: cost reclassified COGS → write-off, total expense unchanged ---
  D = base(); D.invoices = [SALE];
  D.creditNotes = [CN({ retDisp: "Defected" })];
  D.defectiveProducts = [{ date: "2026-08-10", code: "A", qty: 1, costLoss: 40, ref: "CN1", kind: "defective" }];
  fin = run(D).storeFinance("all", null);
  ok(Math.abs(fin.writeOff - 40) < 0.005, "defective return records a 40.00 write-off");
  ok(Math.abs((fin.cogs + fin.writeOff) - 40) < 0.005, "defective return keeps total cost at 40 (reclassified, not doubled)");

  // --- exchange: goods back reverse COGS, replacement out adds its own ---
  D = base(); D.invoices = [SALE];
  D.creditNotes = [CN({ no: "EX1", type: "Exchange", subtotal: 30, gst: 1.5, pst: 2.1, total: 33.6, refund: 0, refundPaid: 0, collect: 33.6,
    exchangeItems: [{ code: "B", qty: 1, price: 130, cost: 55 }] })];
  fin = run(D).storeFinance("all", null);
  ok(Math.abs(fin.revenue - 130) < 0.005, "exchange revenue = original 100 + upgrade 30");
  ok(Math.abs(fin.cogs - 55) < 0.005, "exchange COGS = replacement 55 (returned unit's 40 reversed)");

  // --- REGRESSION: a stock write-off must not credit the bank ---
  D = base();
  D.expenses = [{ date: "2026-08-05", category: "Defective Stock", acct: "5100", amount: 200, method: "Stock adjustment", stockLoss: true, tax: "none" }];
  let ctx = run(D); let bal = ctx.liveAccountBalances("all");
  ok(Math.abs(bal["1010"] || 0) < 0.005, "stock write-off leaves the bank untouched (non-cash) — bank " + (bal["1010"] || 0).toFixed(2));
  ok(Math.abs((bal["5100"] || 0) - 200) < 0.005, "stock write-off still charges the loss account 200.00");
  // legacy record (no stockLoss flag, only the method) must behave the same
  D = base(); D.expenses = [{ date: "2026-08-05", category: "Defective Stock", acct: "5100", amount: 200, method: "Stock adjustment", tax: "none" }];
  ok(Math.abs(run(D).liveAccountBalances("all")["1010"] || 0) < 0.005, "legacy write-off (method only) also leaves the bank untouched");
  // a category flagged stockLoss also counts, even with another method
  D = base(); D.expenseCategories = [{ name: "Lost Stock", acct: "5100", stockLoss: "lost" }];
  D.expenses = [{ date: "2026-08-05", category: "Lost Stock", acct: "5100", amount: 90, method: "Bank", tax: "none", paidFrom: "1010" }];
  ok(Math.abs(run(D).liveAccountBalances("all")["1010"] || 0) < 0.005, "category flagged stockLoss is non-cash too");

  // --- a real cash expense still moves money ---
  D = base(); D.expenses = [{ date: "2026-08-05", category: "Rent", acct: "6100", amount: 500, method: "Bank", tax: "both", paidFrom: "1010" }];
  ctx = run(D); bal = ctx.liveAccountBalances("all"); fin = ctx.storeFinance("all", null);
  ok(Math.abs((bal["1010"] || 0) + 560) < 0.005, "cash expense takes 560.00 (500 + GST 25 + PST 35) out of the bank");
  ok(Math.abs((bal["6100"] || 0) - 535) < 0.005, "expense cost includes non-recoverable PST (535.00)");
  ok(Math.abs(fin.gstITC - 25) < 0.005, "GST on the expense is claimed as a 25.00 input tax credit");

  // --- REGRESSION: money posted to a code missing from the chart must not vanish ---
  D = base();
  D.expenses = [{ date: "2026-08-05", category: "Custom", acct: "7777", amount: 300, method: "Bank", tax: "none", paidFrom: "1010" }];
  ctx = run(D); bal = ctx.liveAccountBalances("all");
  const shown = ctx.reportAccounts(bal);
  ok(shown.some((a) => a.code === "7777" && a.unmapped), "unmapped account 7777 still appears in the reports");
  let tdr = 0, tcr = 0;
  shown.forEach((a) => { const b = bal[a.code] || 0; if (a.type === "Asset" || a.type === "Expense") tdr += b; else tcr += b; });
  ok(Math.abs(tdr - tcr) < 0.02, "trial balance still balances with an unmapped account (dr " + tdr.toFixed(2) + " vs cr " + tcr.toFixed(2) + ")");

  // --- REGRESSION: Income by Client must cover every sales channel ---
  D = base();
  D.clients = [{ id: "c1", name: "Acme", type: "Retail" }];
  D.invoices = [SALE];
  D.cashSales = [{ date: "2026-08-04", clientId: "c1", method: "Cash", subtotal: 200, gst: 10, pst: 14, total: 224, paid: 224, cogs: 80 }];
  D.creditNotes = [CN({ subtotal: -30, gst: -1.5, pst: -2.1, total: -33.6, refund: 33.6, refundPaid: 33.6, clientId: "c1", items: [{ code: "A", qty: 1, price: 30, cost: 40 }] })];
  ctx = run(D);
  const cRows = ctx.clientRevenueRows("all", null);
  const cTotal = cRows.reduce((s, r) => s + r.v, 0);
  fin = ctx.storeFinance("all", null);
  ok(Math.abs(cTotal - fin.revenue) < 0.02, "Income by Client ties to P&L revenue incl. register sales and returns (" + cTotal.toFixed(2) + " vs " + fin.revenue.toFixed(2) + ")");
  ok(cRows.length === 1 && Math.abs(cRows[0].v - 270) < 0.02, "client row nets invoice 100 + register 200 − return 30 = 270.00");
  // walk-in register sales are grouped, not dropped
  D = base(); D.clients = [{ id: "c1", name: "Acme" }];
  D.cashSales = [{ date: "2026-08-04", clientId: null, method: "Cash", subtotal: 75, gst: 0, pst: 0, total: 75, paid: 75, cogs: 30 }];
  const wRows = run(D).clientRevenueRows("all", null);
  ok(wRows.length === 1 && wRows[0].walkin && Math.abs(wRows[0].v - 75) < 0.005, "walk-in register sales appear as their own row (75.00)");

  // --- REGRESSION: A/R aging must tie to account 1200 on the Balance Sheet ---
  D = base();
  D.clients = [{ id: "c1", name: "Acme" }];
  D.invoices = [{ no: "I1", clientId: "c1", date: "2026-07-01", due: "2026-07-31", subtotal: 500, gst: 0, pst: 0, total: 500, paid: 200, payMethod: "Debit", lines: [] }];
  D.cashSales = [{ date: "2026-08-01", clientId: "c1", method: "Debit · partial", subtotal: 300, gst: 0, pst: 0, total: 300, paid: 100, owed: 200, cogs: 0 }];
  ctx = run(D);
  // the app's own helpers live in screens-detail.jsx; mirror them for the stub
  ctx.invStatus = (i) => ((i.total || 0) - (i.paid || 0) > 0.005 ? "Partially Paid" : "Paid");
  ctx.invOpenBalance = (i) => Math.max(0, (i.total || 0) - (i.paid || 0));
  const arRows = ctx.receivableRows("all");
  const arTotal = arRows.reduce((s, r) => s + r.bal, 0);
  bal = ctx.liveAccountBalances("all");
  ok(arRows.length === 2, "A/R aging lists BOTH the unpaid invoice and the register on-account sale");
  ok(Math.abs(arTotal - (bal["1200"] || 0)) < 0.02, "A/R aging total ties to account 1200 (" + arTotal.toFixed(2) + " vs " + (bal["1200"] || 0).toFixed(2) + ")");

  // --- the whole point: P&L must equal the ledger on every mix ---
  const mixes = {
    "sale": (x) => { x.invoices = [SALE]; },
    "return": (x) => { x.invoices = [SALE]; x.creditNotes = [CN()]; },
    "return + restocking fee": (x) => { x.invoices = [SALE]; x.creditNotes = [CN({ total: -102, restockingFee: 10, refund: 102, refundPaid: 102 })]; },
    "defective": (x) => { x.invoices = [SALE]; x.creditNotes = [CN({ retDisp: "Defected" })];
      x.defectiveProducts = [{ date: "2026-08-10", code: "A", qty: 1, costLoss: 40, ref: "CN1", kind: "defective" }]; },
    "exchange": (x) => { x.invoices = [SALE]; x.creditNotes = [CN({ no: "EX1", type: "Exchange", subtotal: 30, gst: 1.5, pst: 2.1, total: 33.6, refund: 0, refundPaid: 0, collect: 33.6, exchangeItems: [{ code: "B", qty: 1, price: 130, cost: 55 }] })]; },
    "register sale": (x) => { x.cashSales = [{ date: "2026-08-04", method: "Cash", subtotal: 50, gst: 2.5, pst: 3.5, total: 56, paid: 56, cogs: 20 }]; },
    "register return + defective": (x) => { x.cashSales = [{ date: "2026-08-06", method: "Cash refund", subtotal: -80, gst: -4, pst: -5.6, total: -89.6, paid: -89.6, cogs: -30, defLoss: 30 }]; },
    "write-off + cash expense": (x) => {
      x.expenses = [{ date: "2026-08-05", category: "Rent", acct: "6100", amount: 500, method: "Bank", tax: "both", paidFrom: "1010" },
                    { date: "2026-08-07", category: "Defective Stock", acct: "5100", amount: 120, method: "Stock adjustment", stockLoss: true, tax: "none" }]; },
    "all of it together": (x) => {
      x.invoices = [SALE];
      x.creditNotes = [CN({ subtotal: -40, gst: -2, pst: -2.8, total: -34.8, restockingFee: 10, refund: 34.8, refundPaid: 34.8, items: [{ code: "A", qty: 1, price: 40, cost: 40 }] })];
      x.cashSales = [{ date: "2026-08-04", method: "Cash", subtotal: 50, gst: 2.5, pst: 3.5, total: 56, paid: 56, cogs: 20 }];
      x.expenses = [{ date: "2026-08-05", category: "Rent", acct: "6100", amount: 500, method: "Bank", tax: "both", paidFrom: "1010" },
                    { date: "2026-08-07", category: "Defective Stock", acct: "5100", amount: 120, method: "Stock adjustment", stockLoss: true, tax: "none" }]; },
  };
  Object.entries(mixes).forEach(([name, build]) => {
    const X = base(); build(X);
    const c = run(X);
    const f = c.storeFinance("all", null), b = c.liveAccountBalances("all");
    const accts = c.reportAccounts(b);
    const sum = (t) => accts.filter((a) => a.type === t).reduce((s, a) => s + (b[a.code] || 0), 0);
    const ledgerNet = sum("Revenue") - sum("Expense");
    ok(Math.abs(f.netIncome - ledgerNet) < 0.02,
      "P&L ties to the ledger — " + name + " (P&L " + f.netIncome.toFixed(2) + " vs ledger " + ledgerNet.toFixed(2) + ")");
  });
}

// ============================================================================
// 8. Tax split for tax-inclusive imported invoices
//    The rule that must never break: the invoice TOTAL is unchanged, because
//    the customer already paid it. Only the subtotal/tax split changes.
// ============================================================================
function testTaxSplit() {
  section("Tax split (imported tax-inclusive invoices)");

  const bsand = { self: {}, navigator: { userAgent: "node" }, document: {}, console };
  bsand.window = bsand; vm.createContext(bsand);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/babel.min.js"), "utf8"), bsand, { filename: "babel.min.js" });
  const js = bsand.Babel.transform(fs.readFileSync(path.join(ROOT, "public/app/screens-a.jsx"), "utf8"), { presets: ["react"], filename: "screens-a.jsx" }).code;

  const mk = (invoices, creditNotes) => ({
    today: "2026-08-15", clients: [{ id: "c1", name: "AJ" }], cashSales: [], payments: [], itemSales: [],
    TAX: { modes: { none: { label: "No tax", gst: 0, pst: 0 }, gst: { label: "GST 5%", gst: 0.05, pst: 0 }, both: { label: "GST+PST", gst: 0.05, pst: 0.07 } } },
    invoices: invoices || [], creditNotes: creditNotes || [],
  });
  const run = (D) => {
    const ctx = { console, BCCWE: D, storeMatch: () => true, inRange: (d, r) => d >= r.from && d <= r.to,
      storeLabel: () => "All", fmt: (n) => "$" + (+n).toFixed(2), clientName: () => "AJ",
      React: { createElement: () => null, Fragment: {} }, useState: (v) => [v, () => {}],
      useEffect: () => {}, useMemo: (f) => f(), useRef: () => ({}) };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx, { filename: "screens-a.js" });
    return ctx;
  };
  const inv = (no, total, extra) => Object.assign({ no, clientId: "c1", date: "2026-08-12", kind: "sale",
    subtotal: total, gst: 0, pst: 0, total, paid: total, tax: "none" }, extra || {});

  // The user's exact example: $500 + 5% arrived as a $525 total with no tax.
  let ctx = run(mk([inv("A", 525)]));
  let t = ctx.taxSplitPlan("all", "gst", null).targets[0];
  ok(Math.abs(t.after.sub - 500) < 0.005 && Math.abs(t.after.gst - 25) < 0.005, "$525 incl. 5% → $500.00 + $25.00 GST");

  // The invariant, across many awkward amounts and both tax modes.
  const amounts = [525, 9198, 736.31, 0.99, 1, 33.33, 12345.67, 99999.99, 745.5, 871.5, 630, 226.81, 46881.53];
  ["gst", "both"].forEach((mode) => {
    const D = mk(amounts.map((a, i) => inv("I" + mode + i, a)));
    const plan = run(D).taxSplitPlan("all", mode, null);
    ok(plan.targets.length === amounts.length, mode + ": every untaxed invoice is picked up");
    const allExact = plan.targets.every((x) => Math.abs((x.after.sub + x.after.gst + x.after.pst) - x.before.total) < 0.005);
    ok(allExact, mode + ": subtotal + tax === original total for all " + amounts.length + " amounts (nothing paid changes)");
    const rate = mode === "gst" ? 0.05 : 0.12;
    const allBackedOut = plan.targets.every((x) => Math.abs(x.after.sub * (1 + rate) - x.before.total) < 0.02);
    ok(allBackedOut, mode + ": subtotal × (1 + rate) returns the original total");
    if (mode === "both") {
      const splitRight = plan.targets.every((x) => Math.abs(x.after.gst * (0.07 / 0.05) - x.after.pst) < 0.02);
      ok(splitRight, "both: the carved-out tax divides between GST and PST in rate proportion");
    }
  });

  // Skips: invoices that already record tax, and order/deposit invoices.
  ctx = run(mk([
    inv("TAXED", 105, { subtotal: 100, gst: 5, tax: "gst" }),
    inv("ORDER", 200, { kind: "order" }),
    inv("PLAIN", 525),
  ]));
  const nos = ctx.taxSplitPlan("all", "gst", null).targets.map((x) => x.rec.no);
  ok(nos.length === 1 && nos[0] === "PLAIN", "skips already-taxed invoices and order deposits (picked: " + nos.join(",") + ")");

  // Idempotent: after applying the split the invoice no longer qualifies.
  const D2 = mk([inv("B", 525)]);
  const c2 = run(D2);
  const p2 = c2.taxSplitPlan("all", "gst", null).targets[0];
  Object.assign(D2.invoices[0], { subtotal: p2.after.sub, gst: p2.after.gst, pst: p2.after.pst, tax: "gst" });
  ok(c2.taxSplitPlan("all", "gst", null).targets.length === 0, "running it twice changes nothing (already split)");

  // Credit notes follow their invoice so the netting stays right.
  ctx = run(mk([inv("C", 525)], [{ no: "CN1", origInv: "C", clientId: "c1", date: "2026-08-13", subtotal: -105, gst: 0, pst: 0, total: -105 }]));
  const tg = ctx.taxSplitPlan("all", "gst", null).targets;
  const cn = tg.find((x) => x.kind === "credit");
  ok(!!cn, "a return against a restated invoice is restated too");
  ok(Math.abs((cn.after.sub + cn.after.gst + cn.after.pst) - (-105)) < 0.005, "credit-note total also unchanged (−105.00)");
  ok(cn.after.sub < 0 && cn.after.gst < 0, "credit-note split stays negative");
  // A credit note whose invoice is NOT being restated must be left alone.
  ctx = run(mk([inv("D", 105, { subtotal: 100, gst: 5, tax: "gst" })], [{ no: "CN2", origInv: "D", clientId: "c1", date: "2026-08-13", subtotal: -105, gst: 0, pst: 0, total: -105 }]));
  ok(ctx.taxSplitPlan("all", "gst", null).targets.length === 0, "a return is not touched when its invoice isn't being restated");

  // --- Targeting an explicit list of invoice numbers (mixed tax rates) ---
  // Some invoices were charged 12% and the rest 5%, so the list must be exact.
  const padded = ["01712", "01659", "00105", "00004", "00007", "01777"];
  ctx = run(mk(padded.map((no) => inv(no, 112))));
  let lp = ctx.taxSplitPlan("all", "both", null, ctx.parseInvNoList("1712, 1659\n105 4 7"));
  ok(lp.targets.length === 5, "list mode targets exactly the listed invoices (" + lp.targets.length + " of 6)");
  ok(!lp.targets.some((t) => t.rec.no === "01777"), "an invoice not on the list is left alone");
  ok(lp.targets.map((t) => t.rec.no).indexOf("00004") >= 0 && lp.targets.map((t) => t.rec.no).indexOf("00007") >= 0,
    "leading zeros don't matter — 4 and 7 find 00004 and 00007");
  const t112 = lp.targets[0];
  ok(Math.abs(t112.after.sub - 100) < 0.005 && Math.abs(t112.after.gst - 5) < 0.005 && Math.abs(t112.after.pst - 7) < 0.005,
    "$112 incl. 12% → $100.00 + $5.00 GST + $7.00 PST");
  ok(lp.targets.every((t) => Math.abs((t.after.sub + t.after.gst + t.after.pst) - t.before.total) < 0.005),
    "list mode: every total unchanged");

  // Entries that match nothing are reported, never silently ignored.
  lp = ctx.taxSplitPlan("all", "both", null, ctx.parseInvNoList("1712 999999"));
  ok(lp.unmatched.length === 1 && lp.unmatched[0] === "999999", "a number matching no invoice is reported as not found");
  ok(lp.targets.length === 1, "the rest of the list still processes");

  // An ambiguous entry is refused rather than guessed at.
  ctx = run(mk([inv("INV-4", 112), inv("CASH-4", 112)]));
  lp = ctx.taxSplitPlan("all", "both", null, ctx.parseInvNoList("4"));
  ok(lp.targets.length === 0 && lp.ambiguous.length === 1, "an entry matching two invoices is refused, not guessed");
  ok(lp.ambiguous[0].matches.length === 2, "both candidates are named so the full number can be typed");

  // A listed invoice that already records tax is skipped and reported.
  ctx = run(mk([inv("00050", 105, { subtotal: 100, gst: 5, tax: "gst" })]));
  lp = ctx.taxSplitPlan("all", "both", null, ctx.parseInvNoList("50"));
  ok(lp.targets.length === 0 && lp.alreadyTaxed.length === 1, "a listed invoice that already has tax is skipped and reported");

  // Line rescaling: prices become pre-tax and still add up to the new subtotal.
  ctx = run(mk([]));
  let lines = [{ code: "A", qty: 1, price: 525, disc: 0 }];
  ctx.taxSplitLines(lines, 525, 500);
  ok(Math.abs(lines[0].price - 500) < 0.005, "single line 525.00 → 500.00");
  lines = [{ code: "A", qty: 3, price: 2000, disc: 0 }, { code: "B", qty: 2, price: 1599, disc: 0 }];
  ctx.taxSplitLines(lines, 9198, 8760);
  let sum = lines.reduce((s, l) => s + l.qty * l.price * (1 - (l.disc || 0) / 100), 0);
  ok(Math.abs(sum - 8760) < 0.005, "multi-line prices still add up to the new subtotal (" + sum.toFixed(2) + ")");
  // An amount that cannot divide evenly must still reconcile to the cent.
  lines = [{ code: "A", qty: 3, price: 33.33, disc: 0 }, { code: "B", qty: 7, price: 1.11, disc: 10 }];
  const oldSum = lines.reduce((s, l) => s + l.qty * l.price * (1 - (l.disc || 0) / 100), 0);
  ctx.taxSplitLines(lines, oldSum, +(oldSum / 1.05).toFixed(2));
  sum = lines.reduce((s, l) => s + l.qty * l.price * (1 - (l.disc || 0) / 100), 0);
  ok(Math.abs(sum - +(oldSum / 1.05).toFixed(2)) < 0.011, "awkward amounts with a discount still reconcile within a cent");
}

(async function main() {
  console.log("BCCWE regression harness");
  try {
    testJsxCompiles();
    await testSecrets();
    await testAuthz();
    testEditCell();
    testInventoryExport();
    testAccountingEngine();
    testReturnsExchangesExpenses();
    testTaxSplit();
  } catch (e) {
    console.error("\nHarness error:", e.message);
    process.exit(2);
  }
  console.log("\n----------------------------------------");
  console.log(`${PASS} passed, ${FAIL} failed`);
  if (FAIL) { console.log("Failures:\n  - " + FAILURES.join("\n  - ")); }
  process.exit(FAIL ? 1 : 0);
})();
