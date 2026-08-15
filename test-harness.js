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

(async function main() {
  console.log("BCCWE regression harness");
  try {
    testJsxCompiles();
    await testSecrets();
    await testAuthz();
    testEditCell();
    testInventoryExport();
    testAccountingEngine();
  } catch (e) {
    console.error("\nHarness error:", e.message);
    process.exit(2);
  }
  console.log("\n----------------------------------------");
  console.log(`${PASS} passed, ${FAIL} failed`);
  if (FAIL) { console.log("Failures:\n  - " + FAILURES.join("\n  - ")); }
  process.exit(FAIL ? 1 : 0);
})();
