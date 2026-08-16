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

  // --- Re-splitting invoices already split at the WRONG rate (5% → 12%) ---
  const at5 = (no, total) => {
    const sub = Math.round((total / 1.05) * 100) / 100;
    return inv(no, total, { subtotal: sub, gst: Math.round((total - sub) * 100) / 100, pst: 0, tax: "gst",
      lines: [{ code: "A", qty: 1, price: sub, disc: 0 }] });
  };
  ctx = run(mk([at5("01712", 112), at5("01659", 224)]));
  const nums = ctx.parseInvNoList("1712 1659");
  let noRedo = ctx.taxSplitPlan("all", "both", null, nums, false);
  ok(noRedo.targets.length === 0 && noRedo.alreadyTaxed.length === 2, "without the re-split option, already-taxed invoices are still skipped");
  let redo = ctx.taxSplitPlan("all", "both", null, nums, true);
  ok(redo.targets.length === 2, "with the re-split option, they are picked up");
  const rt = redo.targets[0];
  ok(Math.abs(rt.after.sub - 100) < 0.005 && Math.abs(rt.after.gst - 5) < 0.005 && Math.abs(rt.after.pst - 7) < 0.005,
    "$112 split at 5% re-splits to $100.00 + $5.00 GST + $7.00 PST");
  ok(redo.targets.every((t) => Math.abs((t.after.sub + t.after.gst + t.after.pst) - t.before.total) < 0.005),
    "re-split: totals still unchanged");
  ok(redo.targets.every((t) => (t.before.gst || 0) > 0), "re-split preview carries the previous tax for comparison");
  // Applying then re-running must be a no-op (guards against double application).
  const D3 = mk([at5("01712", 112)]);
  const c3 = run(D3);
  const a3 = c3.taxSplitPlan("all", "both", null, ctx.parseInvNoList("1712"), true).targets[0].after;
  Object.assign(D3.invoices[0], { subtotal: a3.sub, gst: a3.gst, pst: a3.pst, tax: "both" });
  const rerun = c3.taxSplitPlan("all", "both", null, ctx.parseInvNoList("1712"), true);
  ok(rerun.targets.length === 0 && rerun.alreadyCorrect.length === 1, "re-running after a re-split changes nothing");
  // An untaxed invoice in the same list is handled normally alongside re-splits.
  ctx = run(mk([at5("01712", 112), inv("01800", 112)]));
  redo = ctx.taxSplitPlan("all", "both", null, ctx.parseInvNoList("1712 1800"), true);
  ok(redo.targets.length === 2 && redo.targets.every((t) => Math.abs(t.after.sub - 100) < 0.005),
    "a mixed list (one already split, one untaxed) both land at $100.00 + 12%");

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

// ============================================================================
// 9. Purchase orders, deposits, overpayments, per-store filtering
// ============================================================================
function testPurchasingAndStores() {
  section("Purchasing / deposits / per-store");

  const bsand = { self: {}, navigator: { userAgent: "node" }, document: {}, console };
  bsand.window = bsand; vm.createContext(bsand);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/babel.min.js"), "utf8"), bsand, { filename: "babel.min.js" });
  const js = bsand.Babel.transform(fs.readFileSync(path.join(ROOT, "public/app/screens-c.jsx"), "utf8"), { presets: ["react"], filename: "screens-c.jsx" }).code;
  // the REAL poLines, so PO shapes are interpreted exactly as the app does
  const bsrc = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");
  const poLines = new Function("itemByCode", /function poLines\(po\)[\s\S]*?\n}/.exec(bsrc)[0] + "\nreturn poLines;")(() => null);

  const ACCTS = [
    { code: "1000", name: "Cash", type: "Asset" }, { code: "1010", name: "Bank", type: "Asset" },
    { code: "1200", name: "AR", type: "Asset" }, { code: "1300", name: "Inventory", type: "Asset" },
    { code: "2000", name: "AP", type: "Liability" }, { code: "2100", name: "GST", type: "Liability" },
    { code: "2110", name: "PST", type: "Liability" }, { code: "2200", name: "Deposits", type: "Liability" },
    { code: "3900", name: "RE", type: "Equity" }, { code: "4000", name: "Sales", type: "Revenue" },
    { code: "5000", name: "COGS", type: "Expense" },
  ];
  const STORES = {
    all: () => [{ id: "co_cash", name: "Cash", active: true }, { id: "co_inv", name: "Invoice", active: true }],
    active() { return this.all(); }, defaultId() { return "co_cash"; },
    idOf(r) { return (r && r.companyId) || this.defaultId(); },
    matches(r, f) { return (!f || f === "all") ? true : this.idOf(r) === f; },
    nameOf(id) { return id === "co_inv" ? "Invoice" : "Cash"; },
  };
  const run = (D) => {
    const ctx = { console, BCCWE: D, deriveLines: (i) => i.lines || [], poLines,
      inRange: (d, r) => d >= r.from && d <= r.to, React: { createElement: () => null, Fragment: {} },
      useState: () => [null, () => {}], useEffect: () => {}, useMemo: (f) => f(), useRef: () => ({}) };
    ctx.window = ctx; ctx.window.STORES = STORES; vm.createContext(ctx); vm.runInContext(js, ctx, { filename: "screens-c.js" });
    return ctx;
  };
  const base = () => ({ today: "2026-08-15", accounts: JSON.parse(JSON.stringify(ACCTS)),
    clients: [{ id: "c1", type: "Retail" }], payments: [], creditNotes: [], cashSales: [], expenses: [],
    journal: [], defectiveProducts: [], expenseCategories: [], purchaseOrders: [], inventory: [],
    TAX: { modes: { both: { gst: 0.05, pst: 0.07 }, none: { gst: 0, pst: 0 } } }, invoices: [] });

  // REGRESSION: free "bonus" units must not shrink what the supplier is owed.
  // 10 @ $10 with 2 free and $12 freight = $112 billed, even though the landed
  // cost per unit is spread over 12 units.
  let D = base();
  const landed = +(((10 * 10) + 12) / 12).toFixed(2);
  D.purchaseOrders = [{ po: "PO-1", ref: "PO-1", date: "2026-08-01", supplier: "s1", status: "Received",
    payment: { mode: "unpaid", amount: 0, account: "1010" },
    lines: [{ code: "A", qty: 10, bonusQty: 2, cost: 10, landedUnit: landed, charge: 12, qtyReceived: 10 }],
    total: 112 }];
  D.inventory = [{ code: "A", stock: 12, cost: landed }];
  let ctx = run(D); let bal = ctx.liveAccountBalances("all");
  ok(Math.abs((bal["2000"] || 0) - 112) < 0.02, "A/P is the supplier's bill $112.00 even with 2 free units (was $93.30)");
  ok(Math.abs(ctx.supplierPayableRows("all").reduce((s, r) => s + r.bal, 0) - (bal["2000"] || 0)) < 0.02,
    "supplier-payables report still ties to account 2000");

  // Legacy single-line orders (no lines[]) must reach the same answer.
  D = base();
  D.purchaseOrders = [{ po: "PO-2", date: "2026-08-01", supplier: "s1", status: "Received",
    code: "A", qty: 10, bonusQty: 2, landedUnit: landed, qtyReceived: 10, total: 112 }];
  ok(Math.abs((run(D).liveAccountBalances("all")["2000"] || 0) - 112) < 0.02, "legacy PO with bonus units also bills $112.00");

  // No bonus, and partial receipts, must be unaffected by the fix.
  D = base();
  D.purchaseOrders = [{ po: "PO-3", ref: "PO-3", date: "2026-08-01", supplier: "s1", status: "Received",
    payment: { mode: "unpaid", amount: 0, account: "1010" },
    lines: [{ code: "A", qty: 10, bonusQty: 0, cost: 10, landedUnit: 11.2, charge: 12, qtyReceived: 10 }], total: 112 }];
  ok(Math.abs((run(D).liveAccountBalances("all")["2000"] || 0) - 112) < 0.02, "no bonus units: A/P unchanged at $112.00");
  D = base();
  D.purchaseOrders = [{ po: "PO-4", ref: "PO-4", date: "2026-08-01", supplier: "s1", status: "Received",
    payment: { mode: "unpaid", amount: 0, account: "1010" },
    lines: [{ code: "A", qty: 10, bonusQty: 0, cost: 10, landedUnit: 10, charge: 0, qtyReceived: 6 }], total: 100 }];
  ok(Math.abs((run(D).liveAccountBalances("all")["2000"] || 0) - 60) < 0.02, "partial receipt bills only what arrived ($60.00)");
  // Paying the supplier clears the payable and leaves the bank.
  D = base();
  D.purchaseOrders = [{ po: "PO-5", ref: "PO-5", date: "2026-08-01", supplier: "s1", status: "Received",
    payment: { mode: "paid", amount: 112, account: "1010" },
    lines: [{ code: "A", qty: 10, bonusQty: 2, cost: 10, landedUnit: landed, charge: 12, qtyReceived: 10 }], total: 112 }];
  ctx = run(D); bal = ctx.liveAccountBalances("all");
  ok(Math.abs(bal["2000"] || 0) < 0.02 && Math.abs((bal["1010"] || 0) + 112) < 0.02,
    "paying the supplier in full clears A/P and takes $112.00 from the bank");

  // --- Deleting a purchase order must reverse EXACTLY what receiving added ---
  const bsrc2 = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");
  const grab = (name) => {
    const m = new RegExp("function\\s+" + name + "\\s*\\(").exec(bsrc2);
    let i = bsrc2.indexOf("{", m.index), d = 0, end = -1;
    for (let k = i; k < bsrc2.length; k++) { if (bsrc2[k] === "{") d++; else if (bsrc2[k] === "}") { d--; if (!d) { end = k + 1; break; } } }
    return bsrc2.slice(m.index, end);
  };
  let INV = [];
  const poDeleteEffect = new Function("poLines", "itemByCode", "poBilledValue",
    grab("poDeleteEffect") + "\nreturn poDeleteEffect;")(poLines, (c) => INV.find((x) => x.code === c), () => 0);
  // the receiving screen's own rule for granting free units
  const receiveLine = (l, got) => {
    const out0 = Math.max(0, (l.qty || 0) - (l.qtyReceived || 0));
    return got + (got >= out0 && out0 > 0 ? (l.bonusQty || 0) : 0);
  };
  [["full receipt with bonus", { qty: 10, bonusQty: 2 }, 10],
   ["partial receipt (no bonus granted)", { qty: 10, bonusQty: 2 }, 6],
   ["full receipt, no bonus", { qty: 10, bonusQty: 0 }, 10],
   ["nothing received", { qty: 10, bonusQty: 2 }, 0]].forEach(([label, line, got]) => {
    const l = Object.assign({ code: "A", qtyReceived: 0 }, line);
    const added = receiveLine(l, got);
    l.qtyReceived = got;
    INV = [{ code: "A", stock: added, cost: 10 }];
    const eff = poDeleteEffect({ po: "PO-D", ref: "PO-D", lines: [l], status: "Received" });
    ok(eff.units === added, "PO delete reverses exactly what receiving added — " + label + " (added " + added + ", removes " + eff.units + ")");
  });
  INV = [{ code: "A", stock: 3, cost: 10 }];
  ok(poDeleteEffect({ po: "PO-E", ref: "PO-E", lines: [{ code: "A", qty: 10, bonusQty: 0, qtyReceived: 10 }], status: "Received" }).negatives.length === 1,
    "PO delete warns when the units have already been sold on (stock would go negative)");
  INV = [{ code: "A", stock: 5, cost: 10 }];
  const pseudo = poDeleteEffect({ po: "OPEN-A-x1", code: "A", qty: 5, bonusQty: 0, qtyReceived: 5, landedUnit: 10, total: 50, status: "Received" });
  ok(pseudo.units === 5 && pseudo.owing === 0 && pseudo.pay === 0,
    "deleting an opening-stock record reverses its stock but clears no supplier payable");

  // Order deposits: money held as a liability, no revenue until it becomes a sale.
  D = base();
  D.invoices = [{ no: "ORD-1", kind: "order", clientId: "c1", date: "2026-08-01", subtotal: 1000, gst: 50, pst: 70, total: 1120, paid: 200, payMethod: "Debit", lines: [{ code: "A", qty: 1, price: 1000, cost: 400 }] }];
  ctx = run(D); bal = ctx.liveAccountBalances("all");
  ok(Math.abs((bal["2200"] || 0) - 200) < 0.02 && Math.abs(ctx.storeFinance("all", null).revenue) < 0.02,
    "an order deposit is a liability, not revenue");
  ok(Math.abs(bal["1200"] || 0) < 0.02, "an unconverted order creates no receivable");
  // Once converted the liability releases and the sale is booked.
  D.invoices[0].kind = "sale";
  ctx = run(D); bal = ctx.liveAccountBalances("all");
  ok(Math.abs(bal["2200"] || 0) < 0.02 && Math.abs(ctx.storeFinance("all", null).revenue - 1000) < 0.02,
    "converting the order releases the deposit and books the revenue");
  ok(Math.abs((bal["1200"] || 0) - 920) < 0.02, "the balance after the deposit stays receivable ($920.00)");

  // --- Refunding a deposit on a cancelled order ---
  D = base();
  D.invoices = [{ no: "ORD-1", kind: "order", clientId: "c1", date: "2026-08-01", subtotal: 1000, gst: 50, pst: 70, total: 1120, paid: 200, payMethod: "Debit", lines: [],
    depositRefund: 200, depositRefundAccount: "1010", depositRefundDate: "2026-08-20" }];
  ctx = run(D); bal = ctx.liveAccountBalances("all");
  ok(Math.abs(bal["2200"] || 0) < 0.02, "refunding a deposit releases the customer-deposit liability");
  ok(Math.abs(bal["1010"] || 0) < 0.02, "refunding a deposit takes the money back out of the bank");
  let LL = ctx.ledgerLines("all");
  ok((LL["2200"] || []).length === 2 && Math.abs((LL["2200"] || []).reduce((s, l) => s + (l.cr - l.dr), 0)) < 0.02,
    "deposit and its refund both appear on the ledger and net to zero");
  ok((LL["1010"] || []).length === 2 && Math.abs((LL["1010"] || []).reduce((s, l) => s + (l.dr - l.cr), 0)) < 0.02,
    "the bank shows money in and back out");
  // partial refund keeps the remainder held
  D = base();
  D.invoices = [{ no: "ORD-2", kind: "order", clientId: "c1", date: "2026-08-01", subtotal: 1000, gst: 50, pst: 70, total: 1120, paid: 200, payMethod: "Debit", lines: [],
    depositRefund: 50, depositRefundAccount: "1000" }];
  bal = run(D).liveAccountBalances("all");
  ok(Math.abs((bal["2200"] || 0) - 150) < 0.02, "a partial deposit refund leaves the rest held ($150.00)");
  ok(Math.abs((bal["1000"] || 0) + 50) < 0.02, "a partial refund leaves from the chosen account");

  // --- Closing a purchase order short ---
  const shortPO = (extra) => {
    const X = base();
    X.purchaseOrders = [Object.assign({ po: "PO-S", ref: "PO-S", date: "2026-08-01", supplier: "s1", status: "Partial",
      payment: { mode: "paid", amount: 112, account: "1010" },
      lines: [{ code: "A", qty: 10, bonusQty: 0, cost: 10, landedUnit: 11.2, charge: 12, qtyReceived: 6 }], total: 112 }, extra || {})];
    X.inventory = [{ code: "A", stock: 6, cost: 11.2 }];
    return X;
  };
  bal = run(shortPO()).liveAccountBalances("all");
  ok(Math.abs((bal["2000"] || 0) + 44.8) < 0.02, "paying 112 for 67.20 of delivered goods leaves 44.80 owed BY the supplier");
  bal = run(shortPO({ status: "Closed short", shortClosedAt: "2026-08-31" })).liveAccountBalances("all");
  ok(Math.abs((bal["2000"] || 0) + 44.8) < 0.02 && Math.abs(bal["5110"] || 0) < 0.02,
    "closing short WITHOUT a write-off keeps the money owed by the supplier");
  ctx = run(shortPO({ status: "Closed short", shortClosedAt: "2026-08-31", shortWriteOff: 44.8, shortWriteOffAcct: "5110" }));
  bal = ctx.liveAccountBalances("all");
  ok(Math.abs(bal["2000"] || 0) < 0.02, "writing off the shortfall clears the supplier balance");
  ok(Math.abs((bal["5110"] || 0) - 44.8) < 0.02, "the written-off 44.80 is charged as a loss");
  ok(ctx.supplierPayableRows("all").length === 0, "the A/P report drops the closed order, matching the balance");
  LL = ctx.ledgerLines("all");
  ok(Math.abs((LL["2000"] || []).reduce((s, l) => s + (l.cr - l.dr), 0) - (bal["2000"] || 0)) < 0.02,
    "the write-off's ledger lines tie to the payable balance");
  const acctsW = ctx.reportAccounts(bal);
  const sumW = (t) => acctsW.filter((a) => a.type === t).reduce((s, a) => s + (bal[a.code] || 0), 0);
  ok(Math.abs(sumW("Asset") - (sumW("Liability") + sumW("Equity") + (sumW("Revenue") - sumW("Expense")))) < 0.02,
    "the books still balance after a short-close write-off");

  // Overpayment is held as customer credit, not negative A/R.
  D = base();
  D.invoices = [{ no: "I1", kind: "sale", clientId: "c1", date: "2026-08-01", subtotal: 100, gst: 5, pst: 7, total: 112, paid: 150, payMethod: "Debit", lines: [{ code: "A", qty: 1, price: 100, cost: 40 }] }];
  bal = run(D).liveAccountBalances("all");
  ok(Math.abs((bal["2200"] || 0) - 38) < 0.02 && Math.abs(bal["1200"] || 0) < 0.02,
    "overpayment becomes a $38.00 customer credit, A/R stays at zero");

  // Per-store: a return belongs to the store of the invoice it came from.
  D = base();
  D.invoices = [
    { no: "I1", companyId: "co_cash", kind: "sale", clientId: "c1", date: "2026-08-01", subtotal: 100, gst: 5, pst: 7, total: 112, paid: 112, payMethod: "Debit", lines: [{ code: "A", qty: 1, price: 100, cost: 40 }] },
    { no: "I2", companyId: "co_inv", kind: "sale", clientId: "c1", date: "2026-08-02", subtotal: 200, gst: 10, pst: 14, total: 224, paid: 224, payMethod: "Debit", lines: [{ code: "A", qty: 2, price: 100, cost: 40 }] },
  ];
  D.creditNotes = [{ no: "CN1", type: "Return", retDisp: "Inventory", origInv: "I1", date: "2026-08-10", subtotal: -100, gst: -5, pst: -7, total: -112, refund: 112, refundPaid: 112, refundAccount: "1010", items: [{ code: "A", qty: 1, price: 100, cost: 40 }] }];
  ctx = run(D);
  const cash = ctx.storeFinance("co_cash", null), other = ctx.storeFinance("co_inv", null), all = ctx.storeFinance("all", null);
  ok(Math.abs(cash.revenue) < 0.02, "the return lands in its invoice's store (Cash nets to zero)");
  ok(Math.abs(other.revenue - 200) < 0.02, "the other store is unaffected by that return");
  ok(Math.abs((cash.revenue + other.revenue) - all.revenue) < 0.02, "per-store revenue adds up to the combined view");
}

// ============================================================================
// 10. Barcodes — real GS1 check digits, in-house generation, validation
// ============================================================================
function testBarcodes() {
  section("Barcodes (EAN-8 / EAN-13 / UPC-A)");
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");
  const grab = (n) => {
    const m = new RegExp("function\\s+" + n + "\\s*\\(").exec(src);
    let i = src.indexOf("{", m.index), d = 0, e = -1;
    for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
    return src.slice(m.index, e);
  };
  const grabVar = (n) => {
    const m = new RegExp("var\\s+" + n + "\\s*=").exec(src);
    let k = src.indexOf("=", m.index) + 1, d = 0;
    for (; k < src.length; k++) { const c = src[k]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) { k++; break; } }
    return src.slice(m.index, k);
  };
  let INVENTORY = [];
  const H = new Function("BCCWE",
    grab("ean8Check") + "\n" + grab("gs1Check") + "\n" + grab("ean13Check") + "\n" + grab("upcaCheck") + "\n" +
    grabVar("BARCODE_TYPES") + "\n" + grab("barcodeProblem") + "\n" + grab("genEan8") + "\n" +
    grab("barcodeOf") + "\n" + grab("barcodeTypeOf") + "\n" + grab("itemByBarcode") + "\n" +
    "return {ean8Check,ean13Check,upcaCheck,barcodeProblem,genEan8,barcodeOf,barcodeTypeOf,itemByBarcode};"
  )({ get inventory() { return INVENTORY; } });

  // Check digits must match REAL published barcodes, or scanners reject the label.
  [["96385074", "EAN-8 reference"], ["55123457", "EAN-8"], ["20886509", "EAN-8"]].forEach(([bc, l]) => {
    ok(H.ean8Check(bc.slice(0, 7)) === bc.slice(-1), l + " " + bc + " check digit");
  });
  [["4006381333931", "EAN-13 (Faber-Castell reference)"], ["5901234123457", "EAN-13"], ["9780201379624", "ISBN-13"]].forEach(([bc, l]) => {
    ok(H.ean13Check(bc.slice(0, 12)) === bc.slice(-1), l + " check digit");
  });
  [["036000291452", "UPC-A reference"], ["012345678905", "UPC-A"]].forEach(([bc, l]) => {
    ok(H.upcaCheck(bc.slice(0, 11)) === bc.slice(-1), l + " check digit");
  });

  // Generated in-house codes.
  INVENTORY = [];
  const gen = [];
  for (let i = 0; i < 500; i++) { const v = H.genEan8(); gen.push(v); INVENTORY.push({ code: "X" + i, barcode: v }); }
  ok(gen.every((v) => /^\d{8}$/.test(v)), "generated barcodes are 8 digits");
  ok(gen.every((v) => v[0] === "2"), "generated barcodes use the GS1 restricted-circulation prefix 2 (never clash with real products)");
  ok(gen.every((v) => H.ean8Check(v.slice(0, 7)) === v.slice(-1)), "generated barcodes carry a valid check digit");
  ok(new Set(gen).size === gen.length, "500 generated barcodes are all unique");

  // Validation.
  ok(!!H.barcodeProblem("12345678", "EAN8"), "a wrong EAN-8 check digit is rejected");
  ok(!H.barcodeProblem("96385074", "EAN8"), "a valid EAN-8 is accepted");
  ok(!!H.barcodeProblem("9638507", "EAN8"), "a short EAN-8 is rejected");
  ok(!H.barcodeProblem("4006381333931", "EAN13"), "a real EAN-13 is accepted");
  ok(!!H.barcodeProblem("4006381333930", "EAN13"), "a bad EAN-13 check digit is rejected");
  ok(!H.barcodeProblem("036000291452", "UPC"), "a real UPC-A is accepted");
  ok(!H.barcodeProblem("ABC-123", "CODE128"), "Code 128 accepts letters and dashes");
  ok(!!H.barcodeProblem("ABC", "EAN8"), "letters are rejected for a digits-only symbology");
  ok(!H.barcodeProblem("", "EAN8"), "a blank barcode is allowed (not every item has one yet)");

  // Scanning.
  INVENTORY = [{ code: "IPH-13", barcode: "20886509", name: "iPhone" }, { code: "55123457", name: "legacy item" }];
  ok(H.itemByBarcode("20886509").code === "IPH-13", "scanning a barcode finds its product");
  ok(H.itemByBarcode("55123457").code === "55123457", "scanning falls back to the item code for older products");
  ok(H.itemByBarcode("99999999") === null, "an unknown number matches nothing");
  ok(H.barcodeTypeOf({ barcode: "4006381333931" }) === "EAN13" && H.barcodeTypeOf({ barcode: "036000291452" }) === "UPC",
    "symbology is inferred from the number's length when not set");
  // A product with a barcode must print THAT, not its item code.
  ok(H.barcodeOf({ code: "1-USB-CAR-CHARGER", barcode: "22897701" }) === "22897701",
    "a product with a barcode prints the barcode, not the item code");

  // The real encoder decides what a label can carry: an item code cannot be an
  // EAN-8, which is why such labels silently printed as Code 128 text and
  // scanned back as the item code.
  const mkCanvas = () => ({
    getContext: () => ({ canvas: { width: 0, height: 0 }, fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }),
      save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} }),
    setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
    toDataURL: () => "data:image/png;base64,AA==", nodeName: "CANVAS", width: 0, height: 0, style: {},
  });
  const jctx = { console, document: { createElement: mkCanvas, createElementNS: mkCanvas },
    navigator: { userAgent: "node" }, Math, String, Number, Array, Object, JSON, parseInt, parseFloat, isNaN, Error, TypeError, RegExp, Date };
  jctx.window = jctx; jctx.self = jctx; vm.createContext(jctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/vendor/JsBarcode.all.min.js"), "utf8"), jctx, { filename: "JsBarcode.js" });
  const JsBarcode = jctx.window.JsBarcode || jctx.JsBarcode;
  ok(typeof JsBarcode === "function", "the vendored JsBarcode loads");
  const renders = (v, f) => { try { JsBarcode(mkCanvas(), v, { format: f, width: 2, height: 60, displayValue: true }); return true; } catch (e) { return false; } };
  ok(renders("22897701", "EAN8"), "a generated barcode really renders as an EAN-8 symbol");
  ok(!renders("1-USB-CAR-CHARGER", "EAN8"), "an item code cannot render as EAN-8 (so it must never be sent as one)");
  ok(renders("4006381333931", "EAN13"), "a real EAN-13 renders as EAN-13");
  ok(!renders("12345678", "EAN8"), "the encoder itself refuses a bad check digit");
}

// ============================================================================
// 11. Inventory view settings (columns / list behaviour)
// ============================================================================
function testInventorySettings() {
  section("Inventory settings (columns, list behaviour)");
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");
  const grab = (n) => {
    const m = new RegExp("function\\s+" + n + "\\s*\\(").exec(src);
    let i = src.indexOf("{", m.index), d = 0, e = -1;
    for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
    return src.slice(m.index, e);
  };
  const grabVar = (n) => {
    const m = new RegExp("var\\s+" + n + "\\s*=").exec(src);
    let k = src.indexOf("=", m.index) + 1, d = 0;
    for (; k < src.length; k++) { const c = src[k]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) { k++; break; } }
    return src.slice(m.index, k);
  };
  let PREFS = {};
  const H = new Function("BCCWE",
    grabVar("INV_COLUMNS") + "\n" + grabVar("INV_DEFAULT_COLS") + "\n" + grab("invSettings") + "\n" + grab("invColOn") +
    "\nreturn {INV_COLUMNS,INV_DEFAULT_COLS,invSettings,invColOn};")({ get prefs() { return PREFS; } });
  const shownKeys = () => H.INV_COLUMNS.filter((c) => c.always || H.invSettings().cols[c.key]).map((c) => c.key);

  PREFS = {};
  ok(JSON.stringify(shownKeys()) === JSON.stringify(["code", "name", "avgCost", "lastCost", "price", "margin", "stock", "purchased", "movement", "status"]),
    "with nothing saved, the columns match the existing table exactly (no surprise change)");
  ok(H.invSettings().pageSize === 25 && H.invSettings().flagNegative === true && H.invSettings().hideZero === false,
    "default list behaviour: 25 per page, negatives flagged, nothing hidden");

  PREFS = { invView: { cols: {} } };
  ok(H.invColOn("code") && H.invColOn("name"), "item code and description stay on even if every box is cleared");
  ok(!H.invColOn("barcode"), "optional columns follow the saved setting");

  PREFS = { invView: { cols: { code: 1, name: 1, barcode: 1, supplier: 1, store: 1, stockValue: 1, alert: 1 } } };
  const k2 = shownKeys();
  ok(k2.includes("barcode") && k2.includes("supplier") && k2.includes("store") && k2.includes("stockValue") && k2.includes("alert"),
    "barcode, supplier, store, stock value and alert level can all be shown");
  ok(!k2.includes("movement") && !k2.includes("margin"), "unticked columns are hidden");

  PREFS = { invView: { cols: {}, hideZero: true, flagNegative: false, pageSize: 100, density: "compact" } };
  const s = H.invSettings();
  ok(s.hideZero === true && s.flagNegative === false && s.pageSize === 100 && s.density === "compact",
    "hide-zero, negative flagging, page size and density all persist");
  const items = [{ code: "A", stock: 5 }, { code: "B", stock: 0 }, { code: "C", stock: -100 }, { code: "S", stock: 0, kind: "Service" }];
  const visible = items.filter((i) => !s.hideZero || (i.stock || 0) !== 0 || i.kind === "Service").map((i) => i.code);
  ok(JSON.stringify(visible) === JSON.stringify(["A", "C", "S"]),
    "hide-zero drops empty stock but keeps negatives (which need attention) and services");

  // Two dialogs write prefs.barcode: Inventory > Settings (name/price/number/type)
  // and the label print dialog (sheet layout). Neither may clobber the other's keys.
  const bsrc = fs.readFileSync(path.join(ROOT, "public/app/screens-barcodes.jsx"), "utf8");
  const invSave = /D\.prefs\.barcode = Object\.assign\(\{\}, bc,/.test(src);
  const lblSave = /D\.prefs\.barcode = Object\.assign\(\{\}, D\.prefs\.barcode \|\| \{\},/.test(bsrc);
  ok(invSave, "the inventory settings dialog merges into prefs.barcode instead of replacing it");
  ok(lblSave, "the label print dialog merges too, so saving a sheet layout can't wipe showNumber/defaultType");

  // showNumber must reach the encoder, and default to ON when never set.
  const numOn = /displayValue: showNum/.test(bsrc) && /showNumber === false/.test(bsrc);
  ok(numOn, "the barcode image honours 'show the number under the bars', defaulting to on");
}

function testCsvTemplate() {
  section("CSV import template (round-trips through the app's own parser)");
  const usrc = fs.readFileSync(path.join(ROOT, "public/app/ui.jsx"), "utf8");
  const grab = (n) => {
    const m = new RegExp("function\\s+" + n + "\\s*\\(").exec(usrc);
    let pd = 0, close = -1;
    for (let k = usrc.indexOf("(", m.index); k < usrc.length; k++) {
      if (usrc[k] === "(") pd++; else if (usrc[k] === ")") { pd--; if (!pd) { close = k; break; } }
    }
    let i = usrc.indexOf("{", close), d = 0, e = -1;
    for (let k = i; k < usrc.length; k++) { if (usrc[k] === "{") d++; else if (usrc[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
    return usrc.slice(m.index, e);
  };
  // Pull downloadCsvTemplate out of the component, plus the real CSV reader it
  // must feed — the template is worthless if the importer can't read it back.
  const body = grab("ImportModal");
  const tpl = /function downloadCsvTemplate\(\)[\s\S]*?\n  \}/.exec(body)[0];
  let saved = null;
  const env = new Function("columns", "sample", "entityFile", "Blob", "URL", "document", "setTimeout",
    tpl + "\nreturn downloadCsvTemplate;");

  const columns = [
    { key: "no", label: "Invoice #", required: true },
    { key: "client", label: "Client Name", required: true },
    { key: "notes", label: "Notes" },
  ];
  const sample = [
    { no: "INV-1", client: 'Acme, "The" Co.', notes: "line one\nline two" },   // comma, quotes, newline
    { no: "INV-2", client: "Café Étoile", notes: "" },                          // accents
  ];
  const fn = env(columns, sample, "TEST",
    function Blob(parts) { saved = parts.join(""); },
    { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
    { createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }),
      body: { appendChild() {}, removeChild() {} } },
    () => {});
  fn();
  ok(typeof saved === "string" && saved.length > 0, "the template produces a file");
  ok(saved.charCodeAt(0) === 0xFEFF, "it starts with a BOM so Excel keeps accented names intact");

  // Now read it back with the SHIPPING parser, not a copy of one.
  const parseSrc = /function parseCsvGrid\([\s\S]*?\n\}/.exec(usrc)[0];
  const gridSrc = /function gridToObjects\([\s\S]*?\n\}/.exec(usrc)[0];
  const P = new Function(parseSrc + "\n" + gridSrc + "\nreturn { parseCsvGrid, gridToObjects };")();
  const objs = P.gridToObjects(P.parseCsvGrid(saved), columns);
  ok(objs.length === 2, "the importer reads back exactly the rows the template wrote");
  ok(objs[0].client === 'Acme, "The" Co.',
    "a client name containing a comma and quotes survives the round trip");
  ok(objs[0].notes === "line one\nline two", "a value containing a line break survives too");
  ok(objs[1].client === "Café Étoile", "accented characters survive the BOM-prefixed file");

  const header = saved.replace(/^﻿/, "").split("\n")[0];
  ok(header === 'Invoice #,Client Name,Notes',
    "the header row is exactly the labels the import screen lists, in order");
}

function testInlineCategory() {
  section("Inline category edit (double-click in the stock list)");
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");

  // The save path: cat and subcat are written together, so the two can never
  // drift apart, and the audit line records both.
  const m = /function\s+inlineCategory\s*\(/.exec(src);
  let i = src.indexOf("{", m.index), d = 0, e = -1;
  for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
  const fn = src.slice(m.index, e);
  const audits = [], toasts = [];
  const run = new Function("window", "BCCWE", "pushToast", "bump", "fmt",
    fn + "\nreturn inlineCategory;")(
    { logAudit: (...a) => audits.push(a), persist: () => {} },
    {}, (t) => toasts.push(t), () => {}, (n) => String(n));

  let it = { code: "P1", cat: "Phone", subcat: "Screens" };
  run(it, "Laptop", "");
  ok(it.cat === "Laptop" && it.subcat === "",
    "changing the category clears a sub-category that belonged to the old one");
  ok(/Phone › Screens → Laptop/.test(audits[0][4]), "the audit line records what it was and what it became");

  it = { code: "P2", cat: "", subcat: "" };
  run(it, "Part", "Battery");
  ok(it.cat === "Part" && it.subcat === "Battery", "a category and sub-category are set together");
  ok(/Uncategorized → Part › Battery/.test(audits[1][4]), "an empty category reads as Uncategorized in the log, not blank");

  it = { code: "P3", cat: "Part", subcat: "Battery" };
  run(it, "", "");
  ok(it.cat === "" && it.subcat === "", "a product can be put back to uncategorized");

  // The picker itself: sub-options must come from the chosen category.
  const c = /function\s+CatEditCell\s*\(/.exec(src);
  // Its parameters are destructured, so the first "{" is the parameter list —
  // the body starts after the ")" that closes it.
  let pd = 0, close = -1;
  for (let k = src.indexOf("(", c.index); k < src.length; k++) {
    if (src[k] === "(") pd++; else if (src[k] === ")") { pd--; if (!pd) { close = k; break; } }
  }
  let ci = src.indexOf("{", close), cd = 0, ce = -1;
  for (let k = ci; k < src.length; k++) { if (src[k] === "{") cd++; else if (src[k] === "}") { cd--; if (!cd) { ce = k + 1; break; } } }
  const cell = src.slice(c.index, ce);
  ok(/setSub\(""\);/.test(cell) && /a sub-category never survives its parent changing/.test(cell),
    "picking a new category resets the sub-category in the editor too, not just on save");
  ok(/if \(!subsOf\(v\)\.length\) commit\(v, ""\);/.test(cell),
    "a category with no sub-categories saves on the spot instead of waiting for a second pick");
  ok(/boxRef\.current\.contains\(e\.relatedTarget\)/.test(cell),
    "moving between the two selects does not count as leaving, so a half-made choice is not saved early");
  ok(/if \(\(c \|\| ""\) === \(item\.cat \|\| ""\) && \(s \|\| ""\) === \(item\.subcat \|\| ""\)\) return;/.test(cell),
    "re-picking the same category saves nothing — no pointless audit entry or write");
  ok(/if \(!canEdit\) return shown;/.test(cell),
    "a user without edit rights sees the category but cannot double-click it");
}

function testSortHeaders() {
  section("Sortable column headers");
  // Match whichever bracket opens the literal — HIST_COLUMNS is an array, the
  // sort maps are objects — or an array's first element is grabbed as the whole.
  const block = (src, decl) => {
    const m = new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).exec(src);
    const ob = src.indexOf("{", m.index), ar = src.indexOf("[", m.index);
    const open = (ar !== -1 && ar < ob) ? "[" : "{";
    const close = open === "[" ? "]" : "}";
    let k = open === "[" ? ar : ob, d = 0, e = -1;
    for (let i = k; i < src.length; i++) { if (src[i] === open) d++; else if (src[i] === close) { d--; if (!d) { e = i + 1; break; } } }
    return src.slice(k, e);
  };
  // Sort definitions each start "id: { label:", which is enough to list the ids
  // without evaluating the getter functions (they close over component scope).
  const defIds = (txt) => (txt.match(/(\w+):\s*\{\s*label:/g) || []).map((s) => s.split(":")[0].trim());

  const a = fs.readFileSync(path.join(ROOT, "public/app/screens-a.jsx"), "utf8");
  const b = fs.readFileSync(path.join(ROOT, "public/app/screens-b.jsx"), "utf8");
  const cases = [
    ["Invoice History", defIds(block(a, "const invSorts =")), new Function("return " + block(a, "const HIST_SORTS ="))()],
    ["Inventory", defIds(block(b, "const invtSorts =")), new Function("return " + block(b, "const INV_SORTS ="))()],
  ];

  cases.forEach(([name, ids, map]) => {
    const missing = [];
    Object.keys(map).forEach((col) => (map[col] || []).forEach((id) => { if (!ids.includes(id)) missing.push(col + "→" + id); }));
    ok(!missing.length, name + ": every header's sort id exists in the sort defs"
      + (missing.length ? " — missing " + missing.join(", ") : ""));
    const badDir = Object.keys(map).filter((col) => !(map[col] || []).every((id) => /_(asc|desc)$/.test(id)));
    ok(!badDir.length, name + ": every sort id ends in _asc or _desc, which is how the arrow picks its direction"
      + (badDir.length ? " — " + badDir.join(", ") : ""));
    const notPair = Object.keys(map).filter((col) => {
      const l = map[col] || [];
      return l.length !== 2 || !l.some((x) => /_asc$/.test(x)) || !l.some((x) => /_desc$/.test(x));
    });
    ok(!notPair.length, name + ": every sortable header offers both directions"
      + (notPair.length ? " — " + notPair.join(", ") : ""));
  });

  // The click cycle: no sort → ids[0] → ids[1] → back to ids[0].
  const usrc = fs.readFileSync(path.join(ROOT, "public/app/ui.jsx"), "utf8");
  ok(/const onClick = \(\) => setSort\(idx >= 0 \? list\[\(idx \+ 1\) % list\.length\] : list\[0\]\);/.test(usrc),
    "a first click uses the column's preferred direction, and further clicks cycle rather than dead-end");
  ok(/if \(!list\.length\) return <th className=\{className\}>\{label\}<\/th>;/.test(usrc),
    "a column with no sort defined renders as a plain header, so nothing looks clickable unless it is");

  // Columns that exist in the table but have no sort — worth knowing, not fatal.
  const histCols = (block(a, "var HIST_COLUMNS =").match(/key:\s*"(\w+)"/g) || []).map((s) => s.split('"')[1]);
  const histMap = new Function("return " + block(a, "const HIST_SORTS ="))();
  const noSort = histCols.filter((c) => !histMap[c]);
  ok(JSON.stringify(noSort) === JSON.stringify(["age", "pono", "tax"]),
    "only age, P.O. # and tax are left unsortable in Invoice History (derived display columns)");
}

function testNavColours() {
  section("Sidebar menu colours");
  const src = fs.readFileSync(path.join(ROOT, "public/app/app.jsx"), "utf8");
  const m = /const\s+NAV\s*=\s*\[/.exec(src);
  let k = src.indexOf("[", m.index), d = 0, e = -1;
  for (let i = k; i < src.length; i++) { if (src[i] === "[") d++; else if (src[i] === "]") { d--; if (!d) { e = i + 1; break; } } }
  const NAV = new Function("return " + src.slice(k, e))();
  const GROUPS = new Function("return " + (() => {
    const g = /const\s+GROUPS\s*=\s*\[/.exec(src);
    let a = src.indexOf("[", g.index), dd = 0, ee = -1;
    for (let i = a; i < src.length; i++) { if (src[i] === "[") dd++; else if (src[i] === "]") { dd--; if (!dd) { ee = i + 1; break; } } }
    return src.slice(a, ee);
  })())();

  ok(NAV.every((n) => /^#[0-9a-f]{6}$/i.test(n.tone || "")),
    "every menu item has a colour, written as a full 6-digit hex so the +\"20\" alpha suffix is valid");

  // Items shown together must not share a colour, or the colour stops
  // identifying anything. Three items use the same "history" glyph.
  let clash = "";
  GROUPS.forEach((g) => {
    const seen = {};
    g.ids.forEach((id) => {
      const n = NAV.find((x) => x.id === id);
      if (!n) return;
      if (seen[n.tone]) clash = g.title + ": " + seen[n.tone] + " / " + id;
      seen[n.tone] = id;
    });
  });
  ok(!clash, "no two items in the same menu group share a colour" + (clash ? " — " + clash : ""));

  const hist = NAV.filter((n) => n.icon === "history").map((n) => n.tone);
  ok(new Set(hist).size === hist.length,
    "the items sharing the 'history' glyph are told apart by colour");

  // A pale icon on a pale chip would be unreadable.
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000; };
  ok(NAV.every((n) => lum(n.tone) < 170),
    "every menu colour is dark enough to read against its own pale chip");

  ok(GROUPS.every((g) => g.ids.every((id) => NAV.some((n) => n.id === id))),
    "every id listed in a menu group actually exists in NAV");
}

function testSalesAssign() {
  section("Bulk salesperson assignment (imported invoices)");
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-a.jsx"), "utf8");
  const m = /function\s+salesAssignTargets\s*\(/.exec(src);
  let i = src.indexOf("{", m.index), d = 0, e = -1;
  for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
  const fn = src.slice(m.index, e);

  const DB = {
    invoices: [
      { no: "A1", date: "2026-05-10", sales: "", companyId: "s1" },      // imported, no salesperson
      { no: "A2", date: "2026-05-11", companyId: "s1" },                 // imported, field absent entirely
      { no: "A3", date: "2026-05-12", sales: "u_kev", companyId: "s1" },
      { no: "A4", date: "2026-07-01", sales: "", companyId: "s2" },      // other store, other month
    ],
    creditNotes: [{ no: "C1", date: "2026-05-13", sales: "", companyId: "s1" }],
    cashSales: [
      { id: "R1", date: "2026-05-14", sales: "", companyId: "s1" },
      { id: "R2", date: "2026-05-15", sales: "u_priya", companyId: "s1" },
    ],
  };
  const BC = { get invoices() { return DB.invoices; }, get creditNotes() { return DB.creditNotes; }, get cashSales() { return DB.cashSales; } };
  const WIN = {
    STORES: { idOf: (r) => r.companyId || "s1" },
  };
  const inRange = (ds, r) => !r || (ds >= r.from && ds <= r.to);
  const T = new Function("BCCWE", "window", "inRange", "cnStoreId",
    fn + "\nreturn salesAssignTargets;")(BC, WIN, inRange, (c) => c.companyId || "s1");

  let p = T({ scope: "none" });
  ok(p.total === 5, "'no salesperson' finds every unassigned document across invoices, returns and register");
  ok(p.invoices.map((r) => r.no).join(",") === "A1,A2,A4",
    "a missing `sales` field counts as unassigned, same as an empty one");
  ok(!p.invoices.some((r) => r.no === "A3") && !p.register.some((r) => r.id === "R2"),
    "documents that already have a salesperson are left alone");

  p = T({ scope: "none", store: "s1" });
  ok(p.invoices.length === 2 && !p.invoices.some((r) => r.no === "A4"),
    "limiting to a store excludes another store's documents");

  p = T({ scope: "none", range: { from: "2026-05-01", to: "2026-05-31" } });
  ok(p.total === 4 && !p.invoices.some((r) => r.no === "A4"),
    "limiting to a period excludes documents dated outside it");

  p = T({ scope: "none", kinds: { invoices: true, credits: false, register: false } });
  ok(p.total === 3 && p.credits.length === 0 && p.register.length === 0,
    "unticking a document type removes it from the plan entirely");

  p = T({ scope: "person", fromId: "u_kev" });
  ok(p.total === 1 && p.invoices[0].no === "A3",
    "reassigning by person picks only that person's documents");

  p = T({ scope: "all" });
  ok(p.total === 7, "'every document' includes the ones that already have a salesperson");

  // The plan must be the exact records, so applying it cannot touch anything else.
  p = T({ scope: "none", store: "s1", range: { from: "2026-05-01", to: "2026-05-31" } });
  const before = JSON.stringify(DB);
  p.invoices.concat(p.credits, p.register).forEach((r) => { r.sales = "u_new"; });
  ok(DB.invoices.find((r) => r.no === "A3").sales === "u_kev"
    && DB.invoices.find((r) => r.no === "A4").sales === ""
    && DB.cashSales.find((r) => r.id === "R2").sales === "u_priya",
    "applying the plan changes only the matched records — nothing outside it moves");
  ok(DB.invoices.find((r) => r.no === "A1").sales === "u_new"
    && DB.creditNotes[0].sales === "u_new" && DB.cashSales[0].sales === "u_new",
    "every matched record across all three collections does get assigned");
  ok(before !== JSON.stringify(DB), "the plan holds live records, not copies (so the assignment sticks)");
}

function testHistorySettings() {
  section("Invoice history settings (columns, list behaviour, defaults)");
  const src = fs.readFileSync(path.join(ROOT, "public/app/screens-a.jsx"), "utf8");
  const grab = (n) => {
    const m = new RegExp("function\\s+" + n + "\\s*\\(").exec(src);
    let i = src.indexOf("{", m.index), d = 0, e = -1;
    for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
    return src.slice(m.index, e);
  };
  const grabVar = (n) => {
    const m = new RegExp("var\\s+" + n + "\\s*=").exec(src);
    let k = src.indexOf("=", m.index) + 1, d = 0;
    for (; k < src.length; k++) { const c = src[k]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) { k++; break; } }
    return src.slice(m.index, k);
  };
  let PREFS = {}, TODAY = "2026-08-16";
  const H = new Function("BCCWE",
    grabVar("HIST_COLUMNS") + "\n" + grabVar("HIST_DEFAULT_COLS") + "\n" + grab("histSettings") + "\n" +
    grab("histColOn") + "\n" + grab("histOverdueDays") +
    "\nreturn {HIST_COLUMNS,HIST_DEFAULT_COLS,histSettings,histColOn,histOverdueDays};"
  )({ get prefs() { return PREFS; }, get today() { return TODAY; } });
  const shown = () => H.HIST_COLUMNS.filter((c) => c.always || H.histSettings().cols[c.key]).map((c) => c.key);

  PREFS = {};
  ok(JSON.stringify(shown()) === JSON.stringify(["doc", "type", "client", "date", "due", "sales", "store", "total", "balance", "status"]),
    "the default columns are the original nine plus Store, which now shows unless turned off");
  ok(H.histColOn("store"), "Store is on by default");
  ok(H.histSettings().storeColors === true, "rows are colour-coded by store by default");
  const d = H.histSettings();
  ok(d.pageSize === 8 && d.defPeriod === "all" && d.defSort === "date_desc" && d.flagOverdue === true
    && d.outstandingOnly === false && d.showTotals === true,
    "defaults keep today's behaviour: 8 rows, all time, newest first, nothing hidden");

  PREFS = { histView: { cols: {} } };
  ok(H.histColOn("doc") && H.histColOn("client") && H.histColOn("total"),
    "document #, client and total stay on even if every box is cleared");
  ok(!H.histColOn("status") && !H.histColOn("store"), "optional columns follow the saved setting");

  PREFS = { histView: { cols: { store: 1, pono: 1, subtotal: 1, tax: 1, paid: 1, age: 1 } } };
  const k = shown();
  ok(["store", "pono", "subtotal", "tax", "paid", "age"].every((x) => k.includes(x)),
    "store, P.O. #, pre-tax amount, tax, paid and age can all be shown");
  ok(k[0] === "doc" && k.indexOf("client") < k.indexOf("total"),
    "columns keep their defined order rather than the order they were ticked");

  PREFS = { histView: { cols: {}, pageSize: "All", density: "compact", flagOverdue: false, outstandingOnly: true, showTotals: false, defPeriod: "month", defSort: "balance_desc" } };
  const s = H.histSettings();
  ok(s.pageSize === "All" && s.density === "compact" && s.flagOverdue === false && s.outstandingOnly === true
    && s.showTotals === false && s.defPeriod === "month" && s.defSort === "balance_desc",
    "every list-behaviour and opening-view choice persists");

  // "Money still owed only" must keep partially-paid documents and drop settled ones.
  const docs = [
    { doc: "A", balance: 500 }, { doc: "B", balance: 0 },
    { doc: "C", balance: 0.004 }, { doc: "D", balance: 12.5 },
  ];
  const left = docs.filter((r) => !s.outstandingOnly || (r.balance || 0) > 0.005).map((r) => r.doc);
  ok(JSON.stringify(left) === JSON.stringify(["A", "D"]),
    "'money still owed only' drops settled documents, including ones a rounding cent away from zero");

  // Overdue flagging: only unpaid sales past their due date.
  ok(H.histOverdueDays({ txn: "Sale", due: "2026-08-01", balance: 100 }) === 15,
    "an unpaid invoice 15 days past its due date reports 15 days late");
  ok(H.histOverdueDays({ txn: "Sale", due: "2026-08-01", balance: 0 }) === null,
    "a PAID invoice past its due date is never flagged overdue");
  ok(H.histOverdueDays({ txn: "Sale", due: "2026-09-30", balance: 100 }) === null,
    "an invoice not yet due is not flagged");
  ok(H.histOverdueDays({ txn: "Return", due: "2026-08-01", balance: 100 }) === null
    && H.histOverdueDays({ txn: "Sale", due: null, balance: 100 }) === null,
    "returns and register sales (no due date) are never flagged overdue");

  // ---- store colours (shared helper in ui.jsx) ----
  const usrc = fs.readFileSync(path.join(ROOT, "public/app/ui.jsx"), "utf8");
  const grabU = (n, kind) => {
    const m = new RegExp((kind || "function") + "\\s+" + n + "\\s*[=(]").exec(usrc);
    if (kind === "var") {
      let k = usrc.indexOf("=", m.index) + 1, d = 0;
      for (; k < usrc.length; k++) { const c = usrc[k]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) { k++; break; } }
      return usrc.slice(m.index, k);
    }
    let i = usrc.indexOf("{", m.index), d = 0, e = -1;
    for (let k = i; k < usrc.length; k++) { if (usrc[k] === "{") d++; else if (usrc[k] === "}") { d--; if (!d) { e = k + 1; break; } } }
    return usrc.slice(m.index, e);
  };
  let CO = [];
  const C = new Function("BCCWE", grabU("STORE_PALETTE", "var") + "\n" + grabU("storeColor") +
    "\nreturn {STORE_PALETTE,storeColor};")({ get companies() { return CO; } });

  CO = [{ id: "co_cash", name: "Cash" }, { id: "co_inv", name: "Invoice" }];
  const a = C.storeColor("co_cash"), b = C.storeColor("co_inv");
  ok(a && b && a.key !== b.key, "two stores get two different colours");
  ok(JSON.stringify(C.storeColor("co_cash")) === JSON.stringify(a),
    "a store's colour is stable — the same store gives the same colour every time");
  ok(C.storeColor("co_nope") === null && C.storeColor("") === null && C.storeColor(null) === null,
    "an unknown or missing store gets no colour rather than a wrong one");

  CO = [{ id: "co_cash", name: "Cash", color: "rose" }, { id: "co_inv", name: "Invoice" }];
  ok(C.storeColor("co_cash").key === "rose", "a colour set on the store record overrides the automatic one");
  ok(C.storeColor("co_inv").key === b.key, "overriding one store does not shift another store's colour");

  CO = [{ id: "x", name: "X", color: "chartreuse" }];
  ok(C.storeColor("x") !== null && C.storeColor("x").key !== "chartreuse",
    "an unrecognised saved colour falls back to a real one instead of breaking the row");

  // More stores than palette entries must still all get a colour.
  CO = Array.from({ length: 11 }, (_, i) => ({ id: "s" + i, name: "S" + i }));
  const all = CO.map((s) => C.storeColor(s.id));
  ok(all.every((x) => x && x.soft && x.ink && x.tint), "every store gets a colour even past the end of the palette");

  // The ROW tint is not the pill colour: a whole table of it must stay close to
  // white, or a single-store view reads as a solid colour block.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  ok(C.STORE_PALETTE.every((p) => rgb(p.tint).every((v) => v >= 248)),
    "every row tint is very light (no channel below 248) so a full table of it stays readable");
  // …but not SO light that it stops being a tint at all.
  ok(C.STORE_PALETTE.every((p) => rgb(p.tint).some((v) => v <= 253)),
    "each tint still carries some colour — a pure-white tint would differentiate nothing");
  ok(C.STORE_PALETTE.every((p) => {
    const t = rgb(p.tint), s = rgb(p.soft);
    return t[0] + t[1] + t[2] > s[0] + s[1] + s[2];
  }), "the row tint is lighter than the pill colour, not the same value reused");
  ok(C.STORE_PALETTE.every((p) => rgb(p.ink).reduce((a, v) => a + v, 0) < 420),
    "the ink stays dark enough to read as text and as the row's left edge");
  ok(new Set(all.slice(0, C.STORE_PALETTE.length).map((x) => x.key)).size === C.STORE_PALETTE.length,
    "the first stores each get a distinct colour before any repeat");
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
    testPurchasingAndStores();
    testBarcodes();
    testInventorySettings();
    testHistorySettings();
    testSalesAssign();
    testNavColours();
    testSortHeaders();
    testInlineCategory();
    testCsvTemplate();
  } catch (e) {
    console.error("\nHarness error:", e.message);
    process.exit(2);
  }
  console.log("\n----------------------------------------");
  console.log(`${PASS} passed, ${FAIL} failed`);
  if (FAIL) { console.log("Failures:\n  - " + FAILURES.join("\n  - ")); }
  process.exit(FAIL ? 1 : 0);
})();
