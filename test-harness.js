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

(async function main() {
  console.log("BCCWE regression harness");
  try {
    testJsxCompiles();
    await testSecrets();
    await testAuthz();
    testEditCell();
  } catch (e) {
    console.error("\nHarness error:", e.message);
    process.exit(2);
  }
  console.log("\n----------------------------------------");
  console.log(`${PASS} passed, ${FAIL} failed`);
  if (FAIL) { console.log("Failures:\n  - " + FAILURES.join("\n  - ")); }
  process.exit(FAIL ? 1 : 0);
})();
