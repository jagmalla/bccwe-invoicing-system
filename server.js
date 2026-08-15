const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// Behind A2/cPanel (Passenger + Apache) the real visitor IP arrives in
// X-Forwarded-For; trusting the proxy makes req.ip return it.
app.set("trust proxy", true);

// 25mb: saves post the whole dataset; hitting the cap must be loud, not silent.
// The client shows "data exceeds the server's size limit" on a 413.
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

/*
 * Database configuration.
 *
 * Easiest for beginners: copy "db-config.example.json" to "db-config.json"
 * and fill in your 4 values (the database name, username, password your web
 * host gave you, and usually leave host as "localhost").
 *
 * Advanced / cloud hosts: you can instead set environment variables
 * DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME and skip the file.
 */
function loadDbConfig() {
  const configPath = path.join(__dirname, "db-config.json");
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      console.error("Could not read db-config.json:", e.message);
    }
  }
  return {
    host: process.env.DB_HOST || fileConfig.host || "localhost",
    port: Number(process.env.DB_PORT || fileConfig.port || 3306),
    user: process.env.DB_USER || fileConfig.user,
    password: process.env.DB_PASSWORD || fileConfig.password,
    database: process.env.DB_NAME || fileConfig.database,
    adminPassword: process.env.ADMIN_PASSWORD || fileConfig.adminPassword || "",
  };
}

const dbConfig = loadDbConfig();

let pool;

async function initDb() {
  pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    charset: "utf8mb4",
  });

  // Each "collection" (clients, invoices, inventory, ...) is stored as one
  // JSON document keyed by name. LONGTEXT holds large JSON safely.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      name VARCHAR(191) PRIMARY KEY,
      data LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Login account (single owner login). Kept in its own table so it is never
  // exposed through /api/state and never wiped by a data reset.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth (
      id INT PRIMARY KEY,
      userId VARCHAR(191) NOT NULL,
      passHash TEXT NOT NULL,
      salt VARCHAR(64) NOT NULL,
      email VARCHAR(191) DEFAULT '',
      mustChange TINYINT DEFAULT 1,
      idLocked TINYINT DEFAULT 0,
      resetCode VARCHAR(16) DEFAULT '',
      resetExpires BIGINT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [rows] = await pool.query("SELECT id FROM auth WHERE id = 1");
  if (rows.length === 0) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passHash = hashPw("password", salt);
    await pool.query(
      "INSERT INTO auth (id, userId, passHash, salt, email, mustChange, idLocked) VALUES (1, 'admin', ?, ?, '', 1, 0)",
      [passHash, salt]
    );
    console.log("Seeded default login → ID: admin / Password: password (change on first login)");
  }
}

// ---- password hashing + sessions ----
function hashPw(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}
// Constant-time compare of two hex hash strings (avoids leaking, via response
// timing, how much of a hash matched).
function hashEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function getAuth() {
  return pool.query("SELECT * FROM auth WHERE id = 1").then(function (r) { return r[0][0]; });
}
// In-memory session tokens (cleared on server restart -> users simply log in again).
const sessions = new Map(); // token -> { userId, name, role, isOwner, expires }
const resetCodes = new Map(); // lower(id/email) -> { code, exp } for staff resets
const resetTries = new Map(); // lower(id/email) -> failed reset-code attempts (brute-force guard)
const adminFails = new Map(); // ip -> { count, until } for the /admin uploader (brute-force guard)
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours
function newSession(info) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Object.assign({ expires: Date.now() + SESSION_TTL }, info));
  return token;
}
function validToken(token) {
  const s = token && sessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expires) { sessions.delete(token); return false; }
  return true;
}
function requireAuth(req, res, next) {
  // The tab-close save uses navigator.sendBeacon, which cannot set headers —
  // it carries the same session token as a ?t= query parameter instead.
  const token = req.headers["x-auth-token"] || (req.query && req.query.t) || "";
  if (validToken(token)) { req.authSession = sessions.get(token); return next(); }
  res.status(401).json({ error: "auth_required" });
}

// ---- server-side write authorization ----
// The client can be tampered with, so the browser's role checks are not enough:
// re-check every write here. Two principals matter most — a Client-portal login
// (least trusted, external) and any non-admin trying to rewrite security
// definitions or settings they don't have permission for.
function isAdminSession(s) {
  return !!(s && (s.isOwner === true
    || String(s.role || "").toLowerCase() === "admin"
    || s.roleId === "r_admin" || s.roleId === "r_owner"));
}
function isClientSession(s) {
  if (!s || s.isOwner) return false;
  if (s.roleId === "r_client" || String(s.role || "").toLowerCase() === "client") return true;
  return !!s.clientId;
}
// Client-portal logins may only ever write their own orders. Everything else a
// client "saves" (audit/download logs picked up by the autosave net) is dropped.
const CLIENT_WRITABLE = new Set(["orders"]);
// Collections a non-admin may write only with the matching permission. "admin"
// means owner/Admin only (security definitions no role's permissions grant).
const SENSITIVE_WRITES = {
  roles: "admin",
  modules: "admin",
  users: ["settings", "users"],
  company: ["settings", "company"],
  companies: ["settings", "company"],
  TAX: ["settings", "company"],
  smtpProfiles: ["settings", "email"],
  waConfig: ["settings", "email"],
  accounts: ["accounting", "coa"],
};
// Split a save body into the collections this session is allowed to write and
// the ones it isn't. Non-2xx would make the client retry the whole batch
// forever, so we DROP disallowed collections and still return ok.
async function authorizeWrites(session, body) {
  const allowed = {}, dropped = [];
  const isClient = isClientSession(session);
  const isAdmin = isAdminSession(session);
  let rolesCache = null;
  if (!isClient && !isAdmin) rolesCache = (await getCollectionSafe("roles")) || [];
  for (const [name, data] of Object.entries(body || {})) {
    let ok;
    if (isClient) {
      ok = CLIENT_WRITABLE.has(name);
    } else if (isAdmin) {
      ok = true;
    } else {
      const rule = SENSITIVE_WRITES[name];
      if (!rule) ok = true;
      else if (rule === "admin") ok = false;
      else {
        const role = rolesCache.find(function (r) { return r.id === (session && session.roleId); });
        const perms = role && role.perms;
        ok = !!(perms && perms[rule[0]] && perms[rule[0]][rule[1]]);
      }
    }
    if (ok) allowed[name] = data; else dropped.push(name);
  }
  if (dropped.length) {
    console.warn("Blocked unauthorized write to [" + dropped.join(", ") + "] by " +
      ((session && (session.userId || session.name)) || "unknown") + " (role " + ((session && session.role) || "?") + ")");
  }
  return { allowed, dropped };
}

async function saveCollection(name, data) {
  await pool.query(
    "INSERT INTO collections (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
    [name, JSON.stringify(data)]
  );
}

async function getAllState() {
  const [rows] = await pool.query("SELECT name, data FROM collections");
  const state = {};
  for (const row of rows) {
    // One corrupt/truncated blob must not brick the ENTIRE app load — skip the
    // bad collection (logged loudly) and serve everything else.
    try {
      state[row.name] = JSON.parse(row.data);
    } catch (e) {
      console.error("Skipping corrupt collection '" + row.name + "': " + e.message);
    }
  }
  return state;
}

// Read a single collection (used server-side, e.g. SMTP profiles for password reset).
async function getCollectionSafe(name) {
  try {
    const [rows] = await pool.query("SELECT data FROM collections WHERE name = ?", [name]);
    return rows.length ? JSON.parse(rows[0].data) : null;
  } catch (e) { return null; }
}

// Strip every secret from the full-state payload sent to the browser. These are
// only ever needed server-side (SMTP send, WhatsApp send, login checks), so the
// client never needs them — previously ANY logged-in user could read every staff
// password, SMTP password and WhatsApp token straight out of /api/state and sign
// in as an admin or hijack the mail/WhatsApp accounts.
function redactForClient(state) {
  if (!state) return state;
  if (Array.isArray(state.users)) {
    state.users = state.users.map(function (u) { return Object.assign({}, u, { password: "" }); });
  }
  if (Array.isArray(state.smtpProfiles)) {
    state.smtpProfiles = state.smtpProfiles.map(function (p) { return Object.assign({}, p, { password: "" }); });
  }
  if (state.waConfig && typeof state.waConfig === "object" && !Array.isArray(state.waConfig)) {
    state.waConfig = Object.assign({}, state.waConfig, { token: "" });
  }
  return state;
}
// The client saves collections back with their secrets blanked (redacted above).
// Re-fill each blank secret from the stored value so a normal save never wipes a
// staff password, SMTP password or WhatsApp token. A non-blank value (a real
// change the user just typed) passes through untouched.
async function preserveUserSecrets(name, data) {
  if (name === "users" && Array.isArray(data)) {
    const existing = (await getCollectionSafe("users")) || [];
    const findExisting = function (u) {
      return existing.find(function (e) {
        return (u.id && e.id === u.id)
          || (u.email && e.email && String(e.email).toLowerCase() === String(u.email).toLowerCase())
          || (u.name && e.name && String(e.name).toLowerCase() === String(u.name).toLowerCase());
      });
    };
    data.forEach(function (u) {
      if (u && (u.password === "" || u.password == null)) {
        const e = findExisting(u);
        if (e && e.password) u.password = e.password;
      }
    });
    return data;
  }
  if (name === "smtpProfiles" && Array.isArray(data)) {
    const existing = (await getCollectionSafe("smtpProfiles")) || [];
    data.forEach(function (p) {
      if (p && (p.password === "" || p.password == null)) {
        const e = existing.find(function (x) {
          return (p.id && x.id === p.id)
            || (p.host && p.user && x.host === p.host && String(x.user).toLowerCase() === String(p.user).toLowerCase());
        });
        if (e && e.password) p.password = e.password;
      }
    });
    return data;
  }
  if (name === "waConfig" && data && typeof data === "object" && !Array.isArray(data)) {
    if (data.token === "" || data.token == null) {
      const e = (await getCollectionSafe("waConfig")) || {};
      if (e.token) data.token = e.token;
    }
    return data;
  }
  return data;
}

// Fill a possibly-redacted SMTP password from the stored profile, so the browser
// never has to hold it. Match the stored profile by id first, then by host+user.
// A non-blank incoming password (a profile being configured) is used as-is.
async function fillSmtpSecret(profile) {
  const p = Object.assign({}, profile || {});
  if (p.password) return p;
  const stored = (await getCollectionSafe("smtpProfiles")) || [];
  const match = stored.find(function (s) {
    return (p.id && s.id === p.id)
      || (p.host && p.user && s.host === p.host && String(s.user).toLowerCase() === String(p.user).toLowerCase());
  });
  if (match && match.password) p.password = match.password;
  return p;
}
// Fill a possibly-redacted WhatsApp token from the stored config.
async function fillWaToken(token) {
  if (token) return token;
  const wc = (await getCollectionSafe("waConfig")) || {};
  return wc.token || "";
}

app.get("/api/state", requireAuth, async (_req, res) => {
  try {
    const state = await getAllState();
    if (Object.keys(state).length === 0) {
      return res.json({ empty: true });
    }
    res.json(redactForClient(state));
  } catch (e) {
    console.error("GET /api/state failed:", e.message);
    res.status(500).json({ error: "database_error", message: e.message });
  }
});

app.post("/api/save/:collection", requireAuth, async (req, res) => {
  try {
    const { allowed } = await authorizeWrites(req.authSession, { [req.params.collection]: req.body });
    if (!(req.params.collection in allowed)) {
      return res.status(403).json({ error: "not_authorized" });
    }
    await saveCollection(req.params.collection, await preserveUserSecrets(req.params.collection, req.body));
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/save failed:", e.message);
    res.status(500).json({ error: "database_error", message: e.message });
  }
});

app.post("/api/save-bulk", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { allowed } = await authorizeWrites(req.authSession, req.body);
    await conn.beginTransaction();
    for (const [name, data] of Object.entries(allowed)) {
      const merged = await preserveUserSecrets(name, data);
      await conn.query(
        "INSERT INTO collections (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
        [name, JSON.stringify(merged)]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("POST /api/save-bulk failed:", e.message);
    res.status(500).json({ error: "database_error", message: e.message });
  } finally {
    conn.release();
  }
});

app.post("/api/state", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { allowed } = await authorizeWrites(req.authSession, req.body);
    await conn.beginTransaction();
    for (const [name, data] of Object.entries(allowed)) {
      const merged = await preserveUserSecrets(name, data);
      await conn.query(
        "INSERT INTO collections (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
        [name, JSON.stringify(merged)]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("POST /api/state failed:", e.message);
    res.status(500).json({ error: "database_error", message: e.message });
  } finally {
    conn.release();
  }
});

// ---- Atomic document-number allocation ----
// Two devices minting numbers from their own in-memory counters is how
// duplicate invoice numbers happen. This allocates them server-side inside a
// transaction (SELECT ... FOR UPDATE serializes concurrent requests), so every
// device gets a unique number no matter how many are open at once.
// Factored out of the route so it can be unit-tested with a stubbed connection.
async function allocateDocNumber(conn, kind, companyId) {
  const readLocked = async (name) => {
    const [rows] = await conn.query("SELECT data FROM collections WHERE name = ? FOR UPDATE", [name]);
    if (!rows.length) return null;
    try { return JSON.parse(rows[0].data); } catch (e) { return null; }
  };
  const write = (name, data) => conn.query(
    "INSERT INTO collections (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
    [name, JSON.stringify(data)]
  );
  if (kind === "invoice") {
    const companies = await readLocked("companies");
    if (Array.isArray(companies) && companies.length) {
      const co = companies.find((c) => c.id === companyId)
        || companies.find((c) => c.active !== false) || companies[0];
      const n = co.nextInvoiceNo || 1001;
      co.nextInvoiceNo = n + 1;
      await write("companies", companies);
      return { ok: true, no: (co.invPrefix || "INV-") + n, next: co.nextInvoiceNo, companyId: co.id };
    }
    // No stores configured — fall back to the flat counter.
    let n = (await readLocked("nextInvoiceNo")) || 1001;
    await write("nextInvoiceNo", n + 1);
    return { ok: true, no: "INV-" + n, next: n + 1 };
  }
  if (kind === "po" || kind === "order") {
    // Dedicated counters row; seeded once from the highest existing reference
    // so allocation continues the visible sequence.
    const counters = (await readLocked("counters")) || {};
    if (!counters[kind]) {
      const src = (await readLocked(kind === "po" ? "purchaseOrders" : "orders")) || [];
      let max = kind === "po" ? 342 : 1009;
      (Array.isArray(src) ? src : []).forEach((r) => {
        const m = /(\d+)$/.exec(String(r.ref || r.po || r.id || ""));
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      counters[kind] = max + 1;
    }
    const n = counters[kind];
    counters[kind] = n + 1;
    await write("counters", counters);
    return { ok: true, no: (kind === "po" ? "PO-" : "ORD-") + n, next: n + 1 };
  }
  return { ok: false, error: "unknown kind" };
}

app.post("/api/allocate-number", requireAuth, async (req, res) => {
  const kind = String((req.body && req.body.kind) || "");
  const companyId = String((req.body && req.body.companyId) || "");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await allocateDocNumber(conn, kind, companyId);
    if (out.ok) { await conn.commit(); return res.json(out); }
    await conn.rollback();
    res.status(400).json(out);
  } catch (e) {
    try { await conn.rollback(); } catch (e2) {}
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    conn.release();
  }
});

// ---- Admin: in-app updater for design files ----
// Lets the owner upload new design files (.jsx, .css, .js) from a browser.
// Protected by an admin password. Only writes into public/app/, never
// touches server.js, the database config, index.html, or the data layer.
const APP_DIR = path.join(__dirname, "public", "app");
const BACKUP_DIR = path.join(__dirname, "public", "app", "_backups");
const ALLOWED_EXT = [".jsx", ".css", ".js"];
const PROTECTED_FILES = ["data.js"]; // never allow overwriting the save logic

function isSafeFilename(name) {
  // plain basename only, no path parts, allowed extension, not protected
  if (!name || name.indexOf("/") !== -1 || name.indexOf("\\") !== -1) return false;
  if (name.indexOf("..") !== -1) return false;
  if (path.basename(name) !== name) return false;
  if (PROTECTED_FILES.indexOf(name) !== -1) return false;
  return ALLOWED_EXT.indexOf(path.extname(name).toLowerCase()) !== -1;
}

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/api/admin/upload", (req, res) => {
  const ip = String(req.ip || "");
  const f0 = adminFails.get(ip);
  if (f0 && f0.count >= 5 && f0.until > Date.now()) {
    return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  }
  if (!dbConfig.adminPassword) {
    return res.status(403).json({ error: "Admin password is not set on the server. Set adminPassword in db-config.json." });
  }
  // Constant-time comparison + rate limiting so the admin password can't be
  // brute-forced (it can overwrite any app .jsx, i.e. run code in every browser).
  const given = Buffer.from(String(req.body.password || ""));
  const expected = Buffer.from(String(dbConfig.adminPassword));
  const okPw = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!okPw) {
    const f = adminFails.get(ip) || { count: 0, until: 0 };
    f.count += 1; f.until = Date.now() + 10 * 60 * 1000; adminFails.set(ip, f);
    return res.status(401).json({ error: "Wrong admin password." });
  }
  adminFails.delete(ip);
  const files = Array.isArray(req.body.files) ? req.body.files : [];
  if (files.length === 0) {
    return res.status(400).json({ error: "No files were sent." });
  }

  const accepted = [];
  const rejected = [];
  for (const f of files) {
    if (!f || !isSafeFilename(f.name) || typeof f.content !== "string") {
      rejected.push({ name: f && f.name, reason: "Not an allowed file (only .jsx, .css, .js; data.js is protected)." });
    }
  }
  if (rejected.length > 0) {
    return res.status(400).json({ error: "Some files were not allowed.", rejected });
  }

  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const f of files) {
      const target = path.join(APP_DIR, f.name);
      // Back up the existing version first
      if (fs.existsSync(target)) {
        fs.copyFileSync(target, path.join(BACKUP_DIR, f.name + "." + stamp + ".bak"));
      }
      fs.writeFileSync(target, f.content, "utf8");
      accepted.push(f.name);
    }
    res.json({ ok: true, updated: accepted, backupId: stamp });
  } catch (e) {
    console.error("Upload failed:", e.message);
    res.status(500).json({ error: "Could not save files: " + e.message });
  }
});

// ---- Invoice file attachments ----
// Files are stored on disk in uploads/ (never in the database JSON, so they
// don't bloat state saves). The invoice record keeps only { id, name, size }.
const UPLOAD_DIR = path.join(__dirname, "uploads");
const ATTACH_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
const ATTACH_MAX = 5 * 1024 * 1024; // 5 MB per file

app.post("/api/upload-attachment", requireAuth, (req, res) => {
  try {
    const name = String((req.body && req.body.name) || "");
    const data = String((req.body && req.body.data) || "");
    const ext = path.extname(name).toLowerCase();
    if (!ATTACH_EXT.includes(ext)) {
      return res.status(400).json({ ok: false, error: "Only PDF and image files (" + ATTACH_EXT.join(", ") + ") can be attached." });
    }
    const buf = Buffer.from(data, "base64");
    if (!buf.length) return res.status(400).json({ ok: false, error: "Empty file." });
    if (buf.length > ATTACH_MAX) return res.status(400).json({ ok: false, error: "File is over the 5 MB limit." });
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const id = crypto.randomBytes(8).toString("hex") + ext; // server-generated name — no path input from the client
    fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
    res.json({ ok: true, id, size: buf.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Could not save the file: " + e.message });
  }
});

app.get("/api/attachment/:id", requireAuth, (req, res) => {
  const id = String(req.params.id || "");
  // Strict allow-list of the exact shape we generate — blocks any path tricks.
  if (!/^[a-f0-9]{16}\.[a-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad_id" });
  const file = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "not_found" });
  res.sendFile(file);
});

// ---- Email (real SMTP sending via nodemailer) ----
// Builds a transporter from a sender profile. enc: "SSL" -> implicit TLS (465),
// "TLS"/STARTTLS -> 587, "None" -> plain. Port 465 always uses secure.
function makeTransport(p) {
  p = p || {};
  const port = Number(p.port) || 587;
  const enc = String(p.enc || "").toUpperCase();
  const secure = port === 465 || enc === "SSL";
  return nodemailer.createTransport({
    host: p.host,
    port: port,
    secure: secure,
    auth: p.user ? { user: p.user, pass: p.password || p.pass || "" } : undefined,
    requireTLS: enc === "TLS" && !secure,
    tls: { rejectUnauthorized: false }, // tolerate shared-host / self-signed certs
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
}

// Really connect + authenticate against the SMTP server (no sending).
app.post("/api/test-smtp", requireAuth, async (req, res) => {
  try {
    const t = makeTransport(await fillSmtpSecret(req.body));
    await t.verify();
    res.json({ ok: true, message: "Connected and signed in successfully." });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Actually send an email through the sender profile's SMTP account.
app.post("/api/send-mail", requireAuth, async (req, res) => {
  const b = req.body || {};
  try {
    const p = await fillSmtpSecret(b.profile || {});
    if (!p.host || !p.user) {
      return res.json({ ok: false, error: "This sender profile is missing its SMTP host or username." });
    }
    const t = makeTransport(p);
    const fromAddr = p.from || p.user;
    const attachments = (b.attachments || [])
      .filter((a) => a && a.filename && a.content)
      .map((a) => ({ filename: a.filename, content: a.content, encoding: a.encoding || "base64" }));
    const info = await t.sendMail({
      from: p.fromName ? '"' + p.fromName + '" <' + fromAddr + ">" : fromAddr,
      to: (b.to || []).join(", "),
      cc: (b.cc || []).join(", "),
      replyTo: p.replyTo || undefined,
      subject: b.subject || "(no subject)",
      text: b.text || undefined,
      html: b.html || undefined,
      attachments: attachments,
    });
    res.json({ ok: true, code: "250", note: (info.response || "Accepted") + (attachments.length ? " · " + attachments.length + " attachment(s)" : "") });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Report the caller's IP so the front-end can stamp it onto activity-log entries.
app.get("/api/whoami", (req, res) => {
  let ip = req.ip || (req.connection && req.connection.remoteAddress) || "";
  ip = String(ip).replace(/^::ffff:/, ""); // unwrap IPv4-mapped IPv6
  if (ip === "::1") ip = "127.0.0.1";
  res.json({ ip: ip });
});

// ---- Authentication endpoints ----
app.post("/api/login", async (req, res) => {
  try {
    const id = String((req.body && req.body.userId) || "").trim();
    const password = (req.body && req.body.password) || "";
    const idLc = id.toLowerCase();

    // 1) Owner / admin account (auth table).
    const a = await getAuth();
    if (a && idLc === String(a.userId).toLowerCase() && hashEqual(hashPw(password, a.salt), a.passHash)) {
      // If the owner account also has a staff/role record, honour that role so
      // permissions follow the assigned role (e.g. owner account used as a salesperson).
      const usersA = (await getCollectionSafe("users")) || [];
      const rolesA = (await getCollectionSafe("roles")) || [];
      const self = usersA.find(function (x) {
        if (x.active === false || x.isOwner) return false; // skip the auto-generated owner record
        return String(x.email || "").toLowerCase() === idLc || String(x.name || "").toLowerCase() === idLc
          || (a.email && a.email && String(x.email || "").toLowerCase() === String(a.email).toLowerCase());
      });
      let info = { userId: a.userId, name: a.userId, role: "Admin", isOwner: true, uid: "u_owner" };
      if (self) {
        const rn = (rolesA.find(function (r) { return r.id === self.role; }) || {}).name || self.role || "User";
        info = { userId: a.userId, name: self.name || a.userId, role: rn, roleId: self.role, isOwner: true, uid: self.id, clientId: self.clientId || "" };
      }
      const token = newSession(info);
      return res.json(Object.assign({ ok: true, token, mustChange: !!a.mustChange, idLocked: !!a.idLocked, email: a.email || "" }, info));
    }

    // 2) Staff users created in Settings → Users (matched by email or name + password).
    const users = (await getCollectionSafe("users")) || [];
    const roles = (await getCollectionSafe("roles")) || [];
    const u = users.find(function (x) {
      // Never authenticate the auto-generated owner record (it carries a blank
      // password), and never let a blank/absent stored password match — together
      // these allowed a full admin takeover by logging in with an empty password.
      if (x.active === false || x.isOwner) return false;
      if (!x.password) return false;
      const match = idLc === String(x.email || "").toLowerCase() || idLc === String(x.name || "").toLowerCase() || idLc === String(x.username || "").toLowerCase();
      return match && String(x.password) === String(password);
    });
    if (u) {
      const roleName = (roles.find(function (r) { return r.id === u.role; }) || {}).name || u.role || "User";
      const token = newSession({ userId: u.email || u.name, name: u.name, role: roleName, roleId: u.role, isOwner: false, userRef: u.id, clientId: u.clientId || "" });
      return res.json({ ok: true, token, userId: u.email || u.name, name: u.name, role: roleName, roleId: u.role, isOwner: false, uid: u.id, clientId: u.clientId || "", mustChange: false, idLocked: true, email: u.email || "" });
    }

    res.status(401).json({ ok: false, error: "Incorrect user ID or password." });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/session", requireAuth, async (req, res) => {
  const s = sessions.get(req.headers["x-auth-token"]) || {};
  if (s.isOwner) {
    const a = await getAuth();
    return res.json({ ok: true, userId: s.userId || a.userId, name: s.name || a.userId, role: s.role || "Admin", roleId: s.roleId, isOwner: true, uid: s.uid || "u_owner", clientId: s.clientId || "", mustChange: !!a.mustChange, idLocked: !!a.idLocked, email: a.email || "" });
  }
  res.json({ ok: true, userId: s.userId, name: s.name, role: s.role, roleId: s.roleId, isOwner: false, uid: s.userRef || "", clientId: s.clientId || "", mustChange: false, idLocked: true, email: s.email || "" });
});

// First-login (and any allowed) credential change: sets new userId (only while
// unlocked), password and email; then locks the userId and clears mustChange.
app.post("/api/change-credentials", requireAuth, async (req, res) => {
  try {
    const { newUserId, newPassword, email } = req.body || {};
    const a = await getAuth();
    if (!a.mustChange) {
      return res.status(400).json({ ok: false, error: "Account is already set up. Use Change Password instead." });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters." });
    }
    let userId = a.userId;
    if (!a.idLocked && newUserId && String(newUserId).trim()) userId = String(newUserId).trim();
    const salt = crypto.randomBytes(16).toString("hex");
    const passHash = hashPw(newPassword, salt);
    await pool.query(
      "UPDATE auth SET userId = ?, passHash = ?, salt = ?, email = ?, mustChange = 0, idLocked = 1 WHERE id = 1",
      [userId, passHash, salt, String(email || a.email || "")]
    );
    res.json({ ok: true, userId: userId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Change password later (from the Account menu); requires the current password.
app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const a = await getAuth();
    if (!hashEqual(hashPw(currentPassword, a.salt), a.passHash)) {
      return res.status(400).json({ ok: false, error: "Current password is incorrect." });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: "New password must be at least 6 characters." });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("UPDATE auth SET passHash = ?, salt = ? WHERE id = 1", [hashPw(newPassword, salt), salt]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Forgot password: email a 6-digit reset code to the saved email, sent through
// the app's default SMTP sender profile (must be configured in Settings).
// Forgot password: email a 6-digit code to the account's recovery email,
// sent through the app's default SMTP profile. Works for the owner account
// AND for staff users created in Settings.
app.post("/api/forgot-password", async (req, res) => {
  try {
    const given = String((req.body && req.body.userId) || "").trim().toLowerCase();
    if (!given) return res.json({ ok: false, error: "Enter your user ID or email." });

    const profiles = await getCollectionSafe("smtpProfiles");
    const prof = (profiles || []).find((p) => p.isDefault) || (profiles || [])[0];
    if (!prof || !prof.host || !prof.user) {
      return res.json({ ok: false, error: "Email is not configured yet — set up SMTP under Settings → Email first." });
    }

    // Figure out who this is and the email to send to.
    const a = await getAuth();
    let targetEmail = "", isOwner = false;
    if (given === String(a.userId).toLowerCase() || (a.email && given === String(a.email).toLowerCase())) {
      targetEmail = a.email; isOwner = true;
    } else {
      const users = (await getCollectionSafe("users")) || [];
      const u = users.find((x) => x.active !== false && (given === String(x.email || "").toLowerCase() || given === String(x.name || "").toLowerCase()));
      if (u) targetEmail = u.email;
    }
    // Do not reveal whether an account exists (avoids account enumeration):
    // respond with the same generic success message as a real send.
    if (!targetEmail) return res.json({ ok: true, message: "If an account matches, a reset code was emailed to the address on file." });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (isOwner) await pool.query("UPDATE auth SET resetCode = ?, resetExpires = ? WHERE id = 1", [code, Date.now() + 30 * 60 * 1000]);
    else resetCodes.set(given, { code: code, exp: Date.now() + 30 * 60 * 1000 });

    const t = makeTransport(prof);
    await t.sendMail({
      from: prof.fromName ? '"' + prof.fromName + '" <' + (prof.from || prof.user) + ">" : (prof.from || prof.user),
      to: targetEmail,
      subject: "Your BCCWE password reset code",
      html: '<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#1c2530">' +
        "<p>Hello,</p><p>Your password reset code is:</p>" +
        '<p style="font-size:26px;font-weight:800;letter-spacing:3px;color:#ea580c">' + code + "</p>" +
        "<p>It expires in 30 minutes. If you didn't request this, you can ignore this email.</p></div>",
    });
    res.json({ ok: true, message: "If an account matches, a reset code was emailed to the address on file." });
  } catch (e) {
    res.json({ ok: false, error: "Could not send the email: " + e.message });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const given = String((req.body && req.body.userId) || "").trim().toLowerCase();
    const code = String((req.body && req.body.code) || "");
    const newPassword = (req.body && req.body.newPassword) || "";
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: "New password must be at least 6 characters." });
    }
    const a = await getAuth();
    // Owner account
    if (given === String(a.userId).toLowerCase() || (a.email && given === String(a.email).toLowerCase())) {
      const t = resetTries.get(given) || 0;
      if (!a.resetCode || code !== String(a.resetCode) || Date.now() > Number(a.resetExpires)) {
        resetTries.set(given, t + 1);
        // Invalidate the code after too many wrong guesses so it can't be brute-forced.
        if (t + 1 >= 5) { await pool.query("UPDATE auth SET resetCode = '', resetExpires = 0 WHERE id = 1"); resetTries.delete(given); }
        return res.status(400).json({ ok: false, error: "Invalid or expired reset code." });
      }
      resetTries.delete(given);
      const salt = crypto.randomBytes(16).toString("hex");
      await pool.query("UPDATE auth SET passHash = ?, salt = ?, resetCode = '', resetExpires = 0 WHERE id = 1", [hashPw(newPassword, salt), salt]);
      return res.json({ ok: true });
    }
    // Staff user
    const rc = resetCodes.get(given);
    const ts = resetTries.get(given) || 0;
    if (!rc || code !== rc.code || Date.now() > rc.exp) {
      resetTries.set(given, ts + 1);
      if (ts + 1 >= 5) { resetCodes.delete(given); resetTries.delete(given); }
      return res.status(400).json({ ok: false, error: "Invalid or expired reset code." });
    }
    resetTries.delete(given);
    const users = (await getCollectionSafe("users")) || [];
    const u = users.find((x) => given === String(x.email || "").toLowerCase() || given === String(x.name || "").toLowerCase());
    if (!u) return res.status(400).json({ ok: false, error: "Account not found." });
    u.password = newPassword;
    await saveCollection("users", users);
    resetCodes.delete(given);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/logout", (req, res) => {
  const token = req.headers["x-auth-token"] || "";
  sessions.delete(token);
  res.json({ ok: true });
});

// ---- WhatsApp Business API (Meta Cloud API) ----
// Verify the token + phone number ID without sending a message.
app.post("/api/test-whatsapp", requireAuth, async (req, res) => {
  try {
    const phoneId = (req.body || {}).phoneId;
    const token = await fillWaToken((req.body || {}).token);
    if (!token || !phoneId) return res.json({ ok: false, error: "Enter the API token and phone number ID." });
    const r = await fetch("https://graph.facebook.com/v20.0/" + encodeURIComponent(phoneId) + "?fields=display_phone_number,verified_name", {
      headers: { Authorization: "Bearer " + token },
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && !j.error) {
      return res.json({ ok: true, message: "Connected: " + (j.verified_name || "WhatsApp") + " (" + (j.display_phone_number || phoneId) + ")" });
    }
    res.json({ ok: false, error: (j && j.error && j.error.message) || ("HTTP " + r.status) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Send a WhatsApp text message via the Cloud API.
app.post("/api/send-whatsapp", requireAuth, async (req, res) => {
  try {
    const { phoneId, to, message } = req.body || {};
    const token = await fillWaToken((req.body || {}).token);
    if (!token || !phoneId) return res.json({ ok: false, error: "WhatsApp API is not configured." });
    const num = String(to || "").replace(/\D/g, "");
    if (!num) return res.json({ ok: false, error: "No destination phone number." });
    const r = await fetch("https://graph.facebook.com/v20.0/" + encodeURIComponent(phoneId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: num, type: "text", text: { preview_url: false, body: message || "" } }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && !j.error) {
      return res.json({ ok: true, id: (j.messages && j.messages[0] && j.messages[0].id) || "" });
    }
    res.json({ ok: false, error: (j && j.error && j.error.message) || ("HTTP " + r.status) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`BCCWE Invoicing System running at http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("\nCould not connect to the MySQL database.");
    console.error("Check your db-config.json values (database name, user, password).");
    console.error("Details:", e.message, "\n");
    process.exit(1);
  });
