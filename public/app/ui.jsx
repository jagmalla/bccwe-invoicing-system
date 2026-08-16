/* ============================================================
   BCCWE — Shared UI kit: helpers, icons, primitives
   ============================================================ */
const { useState, useMemo, useRef, useEffect } = React;

/* ---------- helpers ---------- */
function fmt(n) {
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-$" : "$") + s;
}
function fmtPlain(n) {
  return (Number(n) || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortDate(iso) {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}
function clientName(id) {
  const c = BCCWE.clients.find((x) => x.id === id);
  return c ? c.name : "—";
}
function personName(id) {
  const p = BCCWE.salespeople.find((x) => x.id === id);
  return p ? p.name : "—";
}
function supplierName(id) {
  const s = BCCWE.suppliers.find((x) => x.id === id);
  return s ? s.name : "—";
}
function supplierIdByName(name) {
  if (!name) return (BCCWE.suppliers[0] && BCCWE.suppliers[0].id) || "";
  const n = String(name).trim().toLowerCase();
  const s = BCCWE.suppliers.find((x) => x.name.toLowerCase() === n) || BCCWE.suppliers.find((x) => x.name.toLowerCase().includes(n));
  return s ? s.id : (BCCWE.suppliers[0] && BCCWE.suppliers[0].id) || "";
}

/* ---------- icon set (stroke, 24 grid) ---------- */
function Icon({ name, size = 18, className = "", style = {} }) {
  const paths = {
    dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
    invoice: "M6 2h9l5 5v15H6V2zm9 0v5h5 M9 12h6 M9 16h6 M9 8h2",
    history: "M3 3v6h6 M3.5 9a9 9 0 1 1 .5 6 M12 7v5l4 2",
    people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87 M16 3.13A4 4 0 0 1 16 11",
    box: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12l8.73-5.04 M12 22V12",
    cart: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6 M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    receipt: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z M8 7h8 M8 11h8 M8 15h5",
    ledger: "M3 3v18h18 M7 14l3-3 3 3 5-6",
    report: "M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    plus: "M12 5v14 M5 12h14",
    trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6",
    mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
    check: "M20 6 9 17l-5-5",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
    chevron: "M9 18l6-6-6-6",
    menu: "M3 12h18 M3 6h18 M3 18h18",
    chevDown: "M6 9l6 6 6-6",
    bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
    x: "M18 6 6 18 M6 6l12 12",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    send: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z",
    filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
    sort: "M3 7h11 M3 12h7 M3 17h4 M18 8v9 M18 17l3-3 M18 17l-3-3",
    lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4",
    money: "M2 5h20v14H2z M2 10h20 M6 15h4",
    truck: "M1 3h15v13H1z M16 8h4l3 3v5h-7 M5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    arrowUp: "M12 19V5 M5 12l7-7 7 7",
    arrowDown: "M12 5v14 M19 12l-7 7-7-7",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    order: "M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1z M9 4h6 M9 11l2 2 4-4",
    store: "M3 9l1.5-5h15L21 9 M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9 M3 9h18 M9 20v-6h6v6",
    image: "M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 16l-5-5L5 21",
  };
  const d = paths[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={(i === 0 ? seg : "M" + seg)} />
      ))}
    </svg>
  );
}

/* ---------- primitives ---------- */
function Badge({ tone = "neutral", children, dot }) {
  return <span className={"badge badge-" + tone}>{dot && <i className="badge-dot" />}{children}</span>;
}
function statusTone(s) {
  return { Paid: "green", "Partially Paid": "amber", Unpaid: "slate", Overdue: "red", Overpaid: "blue", Refunded: "blue", Exchanged: "blue",
    Placed: "slate", "In Transit": "blue", Received: "green", Partial: "amber", "Partially Received": "amber",
    Ordering: "amber", Ordered: "blue", Discrepancy: "red" }[s] || "neutral";
}
// Label for a register/credit transaction — Returns & Exchanges show their disposition
function saleKindLabel(s) {
  const k = s && (s.kind || s.txn);
  if (s && s.retDisp && (k === "Return" || k === "Exchange")) return k + " " + s.retDisp;
  return k || "";
}

function Btn({ children, variant = "default", icon, size, onClick, type, disabled, full }) {
  return (
    <button type={type || "button"} onClick={onClick} disabled={disabled}
      className={"btn btn-" + variant + (size ? " btn-" + size : "") + (full ? " btn-full" : "")}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
}

function Field({ label, children, hint, required, full }) {
  return (
    <label className={"field" + (full ? " field-full" : "")}>
      {label && <span className="field-label">{label}{required && <em>*</em>}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/* ---------- sorting ---------- */
function applySort(rows, sortId, defs) {
  const d = defs && defs[sortId];
  if (!d || !d.get) return rows;
  const arr = [...rows];
  arr.sort((a, b) => {
    const va = d.get(a), vb = d.get(b);
    if (typeof va === "string" || typeof vb === "string") {
      const c = String(va).localeCompare(String(vb), "en", { numeric: true });
      return d.dir === "asc" ? c : -c;
    }
    return d.dir === "asc" ? va - vb : vb - va;
  });
  return arr;
}

function SortControl({ sort, setSort, defs, label = "Sort" }) {
  return (
    <label className="sortctl">
      <Icon name="sort" size={15} />
      <span className="sortctl-lbl">{label}</span>
      <select value={sort} onChange={(e) => setSort(e.target.value)}>
        {Object.entries(defs).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}
      </select>
    </label>
  );
}

/* ---------- multi-select filter dropdown ----------
   A row of tick-boxes eats the whole toolbar once there are more than three or
   four. This collapses them into one control that states what is selected, and
   opens the same tick-boxes on click. `sel` is the existing array-of-strings
   with "All" as the reset value, so callers keep their toggle logic unchanged. */
function FilterDropdown({ icon, allLabel, options, sel, onToggle, width }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    // Close on an outside click or Escape — a filter panel left hanging over
    // the table is worse than the row of tick-boxes it replaced.
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const picked = (sel || []).filter((x) => x !== "All");
  const isAll = !picked.length;
  // Name what is actually selected rather than only counting it — "Unpaid +1"
  // says more than "2 selected" in the same space.
  const summary = isAll ? allLabel : picked[0] + (picked.length > 1 ? " +" + (picked.length - 1) : "");

  return (
    <div className={"filt-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button type="button" className={"filt-dd-btn" + (isAll ? "" : " on")}
        aria-expanded={open} title={isAll ? allLabel : picked.join(", ")}
        onClick={() => setOpen((v) => !v)}>
        {icon && <Icon name={icon} size={15} />}
        <span className="filt-dd-txt">{summary}</span>
        <Icon name="chevron" size={14} className="filt-dd-caret" />
      </button>
      {open && (
        <div className="filt-dd-panel" style={width ? { minWidth: width } : undefined}>
          <label className={"filt-dd-opt" + (isAll ? " on" : "")}>
            <input type="checkbox" checked={isAll} onChange={() => onToggle("All")} />
            <span>{allLabel}</span>
          </label>
          <div className="filt-dd-sep" />
          {options.map((o) => (
            <label key={o} className={"filt-dd-opt" + (picked.includes(o) ? " on" : "")}>
              <input type="checkbox" checked={picked.includes(o)} onChange={() => onToggle(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- period filtering ---------- */
/* ---------- store colours ----------
   Every store gets a colour so a combined list can be read at a glance instead
   of row by row. A store keeps its colour by position, so it stays the same
   between visits; setting `color` on the store record overrides that choice.
   `soft` is the row tint, `ink` the text/edge — both picked to stay readable. */
var STORE_PALETTE = [
  { key: "indigo", label: "Indigo", ink: "#3d4bb0", soft: "#eceefb", line: "#c6cdf2" },
  { key: "teal", label: "Teal", ink: "#0f766e", soft: "#e2f4f1", line: "#b2e0d9" },
  { key: "amber", label: "Amber", ink: "#9a5b06", soft: "#fbeeda", line: "#efd3a6" },
  { key: "rose", label: "Rose", ink: "#ad2f5f", soft: "#fbe9f0", line: "#f1c4d6" },
  { key: "green", label: "Green", ink: "#2c7a30", soft: "#e7f4e8", line: "#bcdebe" },
  { key: "violet", label: "Violet", ink: "#743bb0", soft: "#f2eafb", line: "#d9c3f1" },
  { key: "slate", label: "Slate", ink: "#47546a", soft: "#eef1f5", line: "#cbd3df" },
  { key: "brown", label: "Brown", ink: "#835530", soft: "#f5ece3", line: "#dfc9b5" },
];
function storeColor(companyId) {
  if (!companyId) return null;
  var list = (BCCWE.companies || []);
  var idx = -1, rec = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === companyId) { idx = i; rec = list[i]; break; }
  }
  if (!rec) return null;
  if (rec.color) {
    for (var j = 0; j < STORE_PALETTE.length; j++) {
      if (STORE_PALETTE[j].key === rec.color) return STORE_PALETTE[j];
    }
  }
  return STORE_PALETTE[idx % STORE_PALETTE.length];
}

function periodRange(period, from, to) {
  const today = BCCWE.today;
  const y = today.slice(0, 4), m = today.slice(0, 7);
  if (period === "month") return { from: m + "-01", to: today, label: monthLabel(m) };
  if (period === "lastmonth") {
    const d = new Date(today + "T00:00:00");
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    const pad = (n) => String(n).padStart(2, "0");
    const fromStr = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-01";
    const toStr = end.getFullYear() + "-" + pad(end.getMonth() + 1) + "-" + pad(end.getDate());
    return { from: fromStr, to: toStr, label: monthLabel(fromStr.slice(0, 7)) };
  }
  if (period === "year") return { from: y + "-01-01", to: today, label: y };
  if (period === "custom") return { from: from || "2000-01-01", to: to || today, label: shortDate(from) + " – " + shortDate(to) };
  // "m:YYYY-MM" — one specific calendar month (from the Month dropdown).
  if (period && period.slice(0, 2) === "m:") {
    const mm = period.slice(2);
    const d = new Date(mm + "-01T00:00:00");
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return { from: mm + "-01", to: end.getFullYear() + "-" + pad(end.getMonth() + 1) + "-" + pad(end.getDate()), label: monthLabel(mm) };
  }
  return { from: "2000-01-01", to: "2999-12-31", label: "All time" };
}
function monthLabel(m) {
  const d = new Date(m + "-01T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}
function inRange(dateStr, range) {
  return dateStr >= range.from && dateStr <= range.to;
}

/* ---------- client type → default tax ---------- */
function defaultTaxForType(type) {
  // Retail bills GST + PST; Wholesale bills GST only (PST often exempt for resale)
  return /whole/i.test(type || "") ? "gst" : "both";
}

/* ---------- tax components (for combined / multi-agency taxes) ----------
   A tax mode can combine two different taxes under one name. Each component
   keeps its own rate, collecting agency and ledger account, so a combined
   tax is calculated together but POSTED separately (separate remittances).
   Each component is tied to a bucket: "gst" (mode.gst) or "pst" (mode.pst). */
function taxComponents(mode) {
  if (!mode) return [];
  if (Array.isArray(mode.comps) && mode.comps.length) return mode.comps;
  const out = [];
  if (+mode.gst > 0) out.push({ bucket: "gst", name: "GST", rate: +mode.gst, agency: "CRA — Federal (GST/HST)", acct: "2100", acctName: "GST Payable" });
  if (+mode.pst > 0) out.push({ bucket: "pst", name: "PST", rate: +mode.pst, agency: "BC Ministry of Finance (PST)", acct: "2110", acctName: "PST Payable" });
  return out;
}
function taxRateOf(mode) {
  if (!mode) return 0;
  return (+mode.gst || 0) + (+mode.pst || 0);
}
// Posting lines for a sale's tax: maps each component to its bucket amount so
// each agency's account is credited (or debited, for returns) separately.
function taxPostings(mode, gstAmt, pstAmt) {
  return taxComponents(mode)
    .map((c) => ({ ...c, amount: c.bucket === "pst" ? pstAmt : gstAmt }))
    .filter((c) => Math.abs(c.amount || 0) > 0.005);
}
function itemByCode(code) {
  return BCCWE.inventory.find((i) => i.code === code);
}

function PeriodFilter({ period, setPeriod, from, to, setFrom, setTo }) {
  // Month dropdown: the current month plus the previous 12, newest first, so a
  // specific month is one click instead of a custom date range.
  const months = (() => {
    const out = [];
    const t = new Date(BCCWE.today + "T00:00:00");
    for (let k = 0; k <= 12; k++) {
      const d = new Date(t.getFullYear(), t.getMonth() - k, 1);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      out.push({ value: "m:" + key, label: monthLabel(key) });
    }
    return out;
  })();
  return (
    <div className="periodbar">
      <Icon name="history" size={15} />
      <span className="period-lbl">Period</span>
      <div className="seg-filters">
        {[["month", "This month"], ["lastmonth", "Last month"], ["year", "This year"], ["all", "All time"], ["custom", "Date Search"]].map(([id, l]) => (
          <button key={id} className={"chip" + (period === id ? " on" : "")} onClick={() => setPeriod(id)}>{l}</button>
        ))}
      </div>
      <select className="period-month" value={period.slice(0, 2) === "m:" ? period : ""} onChange={(e) => { if (e.target.value) setPeriod(e.target.value); }}>
        <option value="">Month…</option>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      {period === "custom" && (
        <div className="period-custom">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

/* split a date range into chart buckets: monthly when span >= 2 months, else weekly */
function timeBuckets(range) {
  const from = new Date(range.from + "T00:00:00"), to = new Date(range.to + "T00:00:00");
  const monthsSpan = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const out = [];
  if (monthsSpan >= 2) {
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    while (d <= to) {
      const key = d.toISOString().slice(0, 7);
      out.push({ label: d.toLocaleDateString("en-CA", { month: "short" }), test: (ds) => ds.slice(0, 7) === key });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  } else {
    let d = new Date(from);
    while (d <= to) {
      const s = new Date(d), e = new Date(d); e.setDate(e.getDate() + 6);
      const sk = s.toISOString().slice(0, 10), ek = e.toISOString().slice(0, 10);
      out.push({ label: s.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), test: (ds) => ds >= sk && ds <= ek });
      d.setDate(d.getDate() + 7);
    }
  }
  return out.length ? out : [{ label: "—", test: () => false }];
}

/* profit-over-time chart: faint bars + trend line/area overlay */
function ProfitTrendChart({ buckets, caption = "Gross profit" }) {
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const total = buckets.reduce((s, b) => s + b.value, 0);
  const cx = (i) => ((i + 0.5) / n) * 100;
  const pts = buckets.map((b, i) => [cx(i), 100 - (b.value / max) * 100]);
  const line = pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const area = cx(0).toFixed(2) + ",100 " + line + " " + cx(n - 1).toFixed(2) + ",100";
  const prev = n >= 2 ? buckets[n - 2].value : 0;
  const cur = n >= 1 ? buckets[n - 1].value : 0;
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const up = cur >= prev;
  const shortMoney = (v) => "$" + Math.round(v).toLocaleString("en-CA");

  return (
    <div className="trend">
      <div className="trend-head">
        <div><span className="trend-cap">{caption} · period total</span><strong>{fmt(total)}</strong></div>
        {pct !== null && n >= 2 && (
          <span className={"kpi-delta " + (up ? "up" : "down")}><Icon name={up ? "arrowUp" : "arrowDown"} size={13} />{Math.abs(pct)}% vs prev</span>
        )}
      </div>
      <div className="trend-plot">
        <div className="trend-grid"><i /><i /><i /><i /><i /></div>
        <div className="trend-bars">
          {buckets.map((b, i) => (
            <div className="tcol" key={i}>
              <div className="tbar" style={{ height: (b.value / max) * 100 + "%" }} title={b.label + ": " + fmt(b.value)}>
                <span className="tval">{shortMoney(b.value)}</span>
              </div>
            </div>
          ))}
        </div>
        <svg className="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={area} fill="var(--accent)" opacity="0.08" />
          <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="trend-x">{buckets.map((b, i) => <span key={i}>{b.label}</span>)}</div>
    </div>
  );
}

function Card({ title, sub, actions, children, pad = true, className = "" }) {
  return (
    <section className={"card " + className}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? "card-body" : ""}>{children}</div>
    </section>
  );
}

function PageHead({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className={"modal" + (wide ? " modal-wide" : "")} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

function Empty({ icon = "box", text }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p>{text}</p>
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div className="toast">
      <span className="toast-ico"><Icon name="check" size={16} /></span>
      {msg}
    </div>
  );
}

/* ---------- CSV parsing + import modal ---------- */
function parseCsvGrid(text) {
  // Excel saves CSV with a UTF-8 BOM — strip it, or the first header cell
  // becomes "﻿code" and every import fails with "No rows found".
  text = String(text).replace(/^\uFEFF/, "");
  // Tab-separated files (.tsv / Excel "Text (tab delimited)") use tabs, not
  // commas — detect from the first line so they parse into real columns.
  const firstLine = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const sep = (firstLine.split("\t").length > firstLine.split(",").length) ? "\t" : ",";
  const rows = []; let row = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') { inQ = true; }
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") { cur += ch; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function gridToObjects(grid, columns) {
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  columns.forEach((c) => {
    let i = header.indexOf(c.label.toLowerCase());
    if (i < 0) i = header.indexOf(c.key.toLowerCase());
    idx[c.key] = i;
  });
  const matched = columns.some((c) => idx[c.key] >= 0);
  const start = matched ? 1 : 0;
  return grid.slice(start).map((r) => {
    const o = {};
    columns.forEach((c, ci) => {
      const at = idx[c.key] >= 0 ? idx[c.key] : (matched ? -1 : ci);
      o[c.key] = at >= 0 ? (r[at] || "").trim() : "";
    });
    return o;
  }).filter((o) => columns.some((c) => c.required && o[c.key]));
}

// Optional prop `analyze(rows)` → { summary: [..lines], warnings: [..lines], block: bool,
// importLabel: "Import 3 invoices (12 lines)" } — used by imports that need a
// pre-commit preview (grouping counts, unmatched names, duplicates).
// `onImport(rows, analysis)` may return: a number ("N rows imported" toast),
// a string (toasted verbatim), a Promise of either, or false (stay open — the
// import failed and already toasted its own error).
function ImportModal({ title, entityFile, columns, sample, analyze, onImport, onClose, pushToast }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const analysis = useMemo(() => (parsed && analyze ? analyze(parsed) : null), [parsed]);

  function downloadTemplate() {
    exportXlsx(entityFile + "-import-template", "Template",
      columns.map((c) => ({ key: c.key, label: c.label, type: "text" })), sample);
  }

  function handleFile(file) {
    if (!file) return;
    setError(""); setParsed(null); setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const grid = parseCsvGrid(String(reader.result));
          const objs = gridToObjects(grid, columns);
          if (!objs.length) { setError("No rows found. Make sure the first row is the column header and at least one row has a “" + columns.find((c) => c.required).label + "”."); return; }
          setParsed(objs);
        } catch (e) { setError("Could not read that file — is it a valid CSV?"); }
      };
      reader.readAsText(file);
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setError("Excel workbook detected. To import, open it in Excel and choose File ▸ Save As ▸ CSV (.csv), then upload that file. Use the template button above for the exact columns.");
    } else {
      setError("Unsupported file type — please upload a .csv file.");
    }
  }

  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!parsed || !parsed.length || busy || (analysis && analysis.block)}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            Promise.resolve(onImport(parsed, analysis)).then((r) => {
              setBusy(false);
              if (r === false) return; // import failed — its own toast explains; stay open
              if (typeof r === "string") pushToast && pushToast(r);
              else pushToast && pushToast(r + " " + (r === 1 ? "row" : "rows") + " imported");
              onClose();
            }).catch(() => { setBusy(false); pushToast && pushToast("Import failed — nothing was changed."); });
          }}>
          {busy ? "Importing…"
            : analysis && analysis.importLabel ? analysis.importLabel
            : parsed ? "Import " + parsed.length + " " + (parsed.length === 1 ? "row" : "rows") : "Import"}
        </Btn>
      </>}>
      <p className="import-lead">Upload a <strong>.csv</strong> file. The first row must be a header with these columns — download the sample template to see the exact format.</p>
      <div className="import-cols">
        {columns.map((c) => (
          <div className="import-col" key={c.key}>
            <span className="ic-name">{c.label}{c.required && <em>*</em>}</span>
            {c.hint && <span className="ic-hint">{c.hint}</span>}
          </div>
        ))}
      </div>
      <Btn variant="default" size="sm" icon="download" onClick={downloadTemplate}>Download sample template (.xlsx)</Btn>
      <label className={"import-drop" + (dragOver ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden
          onChange={(e) => handleFile(e.target.files[0])} />
        <Icon name="download" size={22} />
        <span className="id-main">{fileName || "Drop a CSV here or click to browse"}</span>
        <span className="id-sub">.csv · first row = header</span>
      </label>
      {error && <div className="inline-note"><Icon name="alert" size={15} />{error}</div>}
      {analysis && analysis.summary && analysis.summary.length > 0 && (
        <div className="import-preview" style={{ marginBottom: 10 }}>
          {analysis.summary.map((s, i) => (
            <div className="ip-prev-head" key={i}><Icon name="check" size={15} /> <span>{s}</span></div>
          ))}
        </div>
      )}
      {analysis && analysis.warnings && analysis.warnings.map((w, i) => (
        <div className="inline-note" key={"w" + i}><Icon name="alert" size={15} />{w}</div>
      ))}
      {parsed && parsed.length > 0 && (
        <div className="import-preview">
          <div className="ip-prev-head"><Icon name="check" size={15} /> Parsed <strong>{parsed.length}</strong> {parsed.length === 1 ? "row" : "rows"} — preview</div>
          <table className="import-table">
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {parsed.slice(0, 4).map((o, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key}>{o[c.key] || "—"}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {parsed.length > 4 && <span className="ip-prev-more">+ {parsed.length - 4} more</span>}
        </div>
      )}
    </Modal>
  );
}

/* ---------- invoice file attachments (stored server-side in uploads/) ---------- */
// Upload one file → resolves { id, name, size } to store on the invoice record.
// Files are kept on the server's disk, NOT in the database JSON, so attachments
// never bloat the state saves. 5 MB per-file cap (server enforces it too).
function uploadInvoiceAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (file.size > 5 * 1024 * 1024) return reject(new Error(file.name + " is over the 5 MB limit"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.onload = () => {
      const uri = String(reader.result);
      const b64 = uri.slice(uri.indexOf("base64,") + 7);
      fetch("/api/upload-attachment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data: b64 }),
      }).then((r) => r.json()).then((j) => {
        if (j && j.ok) resolve({ id: j.id, name: file.name, size: file.size });
        else reject(new Error((j && j.error) || "Upload failed"));
      }).catch(reject);
    };
    reader.readAsDataURL(file);
  });
}
// Download an attachment via authenticated fetch (a plain <a href> link can't
// send the x-auth-token header, so we fetch the blob and save it).
function downloadAttachmentFile(att, pushToast) {
  fetch("/api/attachment/" + encodeURIComponent(att.id))
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = att.name || att.id;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch(() => { pushToast && pushToast("Could not download " + (att.name || "attachment")); });
}

Object.assign(window, {
  fmt, fmtPlain, shortDate, clientName, personName, supplierName, supplierIdByName,
  Icon, Badge, statusTone, Btn, Field, Card, PageHead, Modal, Empty, Toast, ImportModal,
  uploadInvoiceAttachment, downloadAttachmentFile,
  applySort, SortControl, periodRange, inRange, itemByCode, PeriodFilter, timeBuckets, ProfitTrendChart,
  defaultTaxForType, taxComponents, taxRateOf, taxPostings,
  saleKindLabel,
  useState, useMemo, useRef, useEffect,
});
