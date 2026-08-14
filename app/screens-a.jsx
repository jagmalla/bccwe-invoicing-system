/* ============================================================
   BCCWE — Dashboard, Invoice History, People
   ============================================================ */

/* ---------------- Dashboard ---------------- */
function Dashboard({ go }) {
  const D = BCCWE;
  const outstanding = D.invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + (i.total - i.paid), 0);
  const overdue = D.invoices.filter((i) => i.status === "Overdue").reduce((s, i) => s + (i.total - i.paid), 0);
  const mtdRevenue = 18420.5;
  const cashPos = D.accounts.find((a) => a.code === "1010").balance + D.accounts.find((a) => a.code === "1000").balance;
  const gstDue = D.accounts.find((a) => a.code === "2100").balance;
  const pstDue = D.accounts.find((a) => a.code === "2110").balance;
  const lowStock = D.inventory.filter((i) => i.stock <= i.alert);
  const agingStock = D.inventory
    .map((i) => ({ i, age: window.STOCK.ageDays(i), state: window.STOCK.state(i) }))
    .filter((r) => r.state !== "active")
    .sort((a, b) => b.age - a.age);

  const kpis = [
    { label: "Revenue — month to date", value: fmt(mtdRevenue), delta: "+12.4%", up: true, ico: "money" },
    { label: "Outstanding receivables", value: fmt(outstanding), sub: fmt(overdue) + " overdue", ico: "invoice", warn: overdue > 0 },
    { label: "Cash & bank", value: fmt(cashPos), sub: "2 accounts", ico: "ledger" },
    { label: "GST + PST payable", value: fmt(gstDue + pstDue), sub: "Next remittance Jul 31", ico: "receipt" },
  ];

  const spark = [8, 11, 9, 14, 12, 17, 15, 19, 16, 21, 18, 24];
  const max = Math.max(...spark);

  return (
    <div>
      <PageHead title="Dashboard" sub={"Good afternoon, Harman · " + shortDate(D.today) + " · Surrey, BC"}
        actions={<>
          <Btn variant="ghost" icon="receipt" onClick={() => go("sales")}>Quick sale</Btn>
          <Btn variant="primary" icon="plus" onClick={() => go("invoice")}>New invoice</Btn>
        </>} />

      <div className="kpi-row">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top">
              <span className="kpi-ico"><Icon name={k.ico} size={18} /></span>
              {k.delta && <span className={"kpi-delta " + (k.up ? "up" : "down")}><Icon name={k.up ? "arrowUp" : "arrowDown"} size={13} />{k.delta}</span>}
            </div>
            <div className="kpi-val">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            {k.sub && <div className={"kpi-sub" + (k.warn ? " warn" : "")}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <Card title="Revenue trend" sub="Last 12 weeks · invoiced + cash sales"
          actions={<Badge tone="green" dot>On track</Badge>}>
          <div className="spark">
            {spark.map((v, i) => (
              <div className="spark-bar" key={i} style={{ height: (v / max) * 100 + "%" }} title={fmt(v * 1000)}>
                <i style={{ height: ((v - (i ? spark[i - 1] : v) + 6) / 12) * 0 + "%" }} />
              </div>
            ))}
          </div>
          <div className="spark-x"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div>
        </Card>

        <Card title="Cash position" sub="Where money sits right now">
          <ul className="acctlist">
            {D.accounts.filter((a) => ["1000", "1010", "1200", "1300"].includes(a.code)).map((a) => (
              <li key={a.code}>
                <span className="ac-code">{a.code}</span>
                <span className="ac-name">{a.name}</span>
                <span className="ac-bal">{fmt(a.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent invoices" sub="Latest activity" className="span2"
          actions={<Btn variant="ghost" size="sm" onClick={() => go("history")}>View all</Btn>}>
          <table className="mini-table">
            <thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>
              {D.invoices.slice(0, 6).map((i) => (
                <tr key={i.no}>
                  <td><button className="link mono" onClick={() => go("invoiceview/" + i.no)}>{i.no}</button></td>
                  <td><button className="link" onClick={() => go("client/" + i.clientId)}>{clientName(i.clientId)}</button></td>
                  <td className="muted">{shortDate(i.date)}</td>
                  <td className="r mono">{fmt(i.total)}</td>
                  <td><Badge tone={statusTone(i.status)} dot>{i.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Low-stock alerts" sub={lowStock.length + " items at or below threshold"}
          actions={<Btn variant="ghost" size="sm" onClick={() => go("inventory")}>Inventory</Btn>}>
          {lowStock.length ? (
            <ul className="stocklist">
              {lowStock.slice(0, 6).map((i) => (
                <li key={i.code}>
                  <span className="st-warn"><Icon name="alert" size={14} /></span>
                  <span className="st-name">{i.name}</span>
                  <span className="st-qty">{i.stock} left <em>/ {i.alert}</em></span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="box" text="All stock above threshold" />}
        </Card>

        <Card title="Aging &amp; dead stock" sub={agingStock.length + " item" + (agingStock.length === 1 ? "" : "s") + " sitting too long"}
          actions={<Btn variant="ghost" size="sm" onClick={() => go("inventory")}>Review</Btn>}>
          {agingStock.length ? (
            <ul className="stocklist">
              {agingStock.slice(0, 6).map((r) => (
                <li key={r.i.code}>
                  <span className={r.state === "dead" ? "st-warn dead" : "st-warn"}><Icon name={r.state === "dead" ? "alert" : "clock"} size={14} /></span>
                  <span className="st-name">{r.i.name}</span>
                  <span className="st-qty">{r.age}d <em>{r.state === "dead" ? "dead" : "idle"}</em></span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="box" text="Everything is moving" />}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Invoice History ---------------- */
function InvoiceHistory({ go, pushToast }) {
  const D = BCCWE;
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState(["All"]);
  const [txnSel, setTxnSel] = useState(["All"]);
  const [sales, setSales] = useState("All");

  function toggleSel(sel, setSel, val) {
    setPage(0);
    if (val === "All") { setSel(["All"]); return; }
    let next = sel.filter((x) => x !== "All");
    next = next.includes(val) ? next.filter((x) => x !== val) : [...next, val];
    setSel(next.length ? next : ["All"]);
  }
  const [sort, setSort] = useState("date_desc");
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  const [showEmail, setShowEmail] = useState(false);
  const range = periodRange(period, from, to);
  const PER = 8;

  const invSorts = {
    date_desc: { label: "Date — newest first", get: (r) => new Date(r.date).getTime(), dir: "desc" },
    date_asc: { label: "Date — oldest first", get: (r) => new Date(r.date).getTime(), dir: "asc" },
    no_desc: { label: "Invoice # — high to low", get: (r) => parseInt(r.no.replace(/\D/g, "")) || 0, dir: "desc" },
    no_asc: { label: "Invoice # — low to high", get: (r) => parseInt(r.no.replace(/\D/g, "")) || 0, dir: "asc" },
    total_desc: { label: "Amount — high to low", get: (r) => r.total, dir: "desc" },
    total_asc: { label: "Amount — low to high", get: (r) => r.total, dir: "asc" },
    balance_desc: { label: "Balance — high to low", get: (r) => r.total - r.paid, dir: "desc" },
    client_asc: { label: "Client — A to Z", get: (r) => clientName(r.clientId), dir: "asc" },
  };

  const rows = useMemo(() => {
    const sale = D.invoices.map((i) => ({ ...i, txn: "Sale", doc: i.no, balance: i.total - i.paid }));
    const credits = D.creditNotes.map((c) => ({ ...c, txn: c.type, doc: c.no, due: null, paid: 0, balance: 0 }));
    const register = D.cashSales.map((s) => ({
      ...s, txn: s.kind, doc: s.ref || ("REG-" + String(s.id).replace(/\D/g, "").slice(-5)),
      register: true, clientLabel: s.client, clientId: null, no: null, origInv: null, due: null,
      paid: s.total, balance: 0, subtotal: s.total, status: s.total < 0 ? "Refunded" : "Paid",
    }));
    const all = [...sale, ...credits, ...register];
    const txnActive = !txnSel.includes("All") && txnSel.length;
    const statusActive = !statusSel.includes("All") && statusSel.length;
    const filtered = all.filter((r) => {
      if (txnActive) {
        const ok = (txnSel.includes("Sales") && r.txn === "Sale")
          || (txnSel.includes("Returns") && r.txn === "Return")
          || (txnSel.includes("Exchanges") && r.txn === "Exchange");
        if (!ok) return false;
      }
      if (statusActive && r.txn === "Sale" && !statusSel.includes(r.status)) return false;
      if (sales !== "All" && r.sales !== sales) return false;
      if (!inRange(r.date, range)) return false;
      if (q) {
        const hay = (r.doc + " " + clientName(r.clientId)).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return applySort(filtered, sort, invSorts);
  }, [q, statusSel, txnSel, sales, sort, period, from, to, D.invoices.length, D.creditNotes.length, D.cashSales.length]);

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const slice = rows.slice(page * PER, page * PER + PER);
  const totals = rows.reduce((a, i) => { a.total += i.total; a.due += (i.balance || 0); a.sub += (i.subtotal || 0); return a; }, { total: 0, due: 0, sub: 0 });

  function buildExportSpec() {
    const cols = [
      { key: "no", label: "Document #", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "client", label: "Client name", type: "text" },
      { key: "date", label: "Date", type: "text" },
      { key: "amount", label: "Amount (pre-tax)", type: "number" },
      { key: "tax", label: "Taxes charged", type: "text" },
      { key: "total", label: "Total amount", type: "number" },
    ];
    const data = rows.map((r) => ({
      no: r.doc,
      type: r.txn,
      client: clientName(r.clientId),
      date: shortDate(r.date),
      amount: +(r.subtotal || 0).toFixed(2),
      tax: (D.TAX.modes[r.tax] && D.TAX.modes[r.tax].label) || "—",
      total: +(r.total || 0).toFixed(2),
    }));
    const safe = String(range.label).replace(/[^\w]+/g, "-");
    return {
      filename: "BCCWE-Transactions-" + safe, sheet: "Transactions", cols, data,
      opts: {
        title: "BCCWE — Transaction Export",
        subtitle: "Period: " + range.label + "  ·  " + data.length + " records (sales, returns, exchanges)",
        totals: { amount: +totals.sub.toFixed(2), total: +totals.total.toFixed(2) },
      },
    };
  }
  function exportExcel() {
    const s = buildExportSpec();
    exportXlsx(s.filename, s.sheet, s.cols, s.data, s.opts);
  }

  return (
    <div>
      <PageHead title="Invoice History" sub={rows.length + " transactions · " + range.label + " · " + fmt(totals.due) + " outstanding"}
        actions={<>
          <Btn variant="ghost" icon="download">Import CSV</Btn>
          <Btn variant="ghost" icon="mail" onClick={() => setShowEmail(true)}>Email</Btn>
          <Btn variant="ghost" icon="download" onClick={exportExcel}>Export Excel</Btn>
          <Btn variant="primary" icon="plus" onClick={() => go("invoice")}>New invoice</Btn>
        </>} />

      <Card pad={false}>
        <div className="toolbar">
          <PeriodFilter period={period} setPeriod={(v) => { setPeriod(v); setPage(0); }} from={from} to={to}
            setFrom={(v) => { setFrom(v); setPage(0); }} setTo={(v) => { setTo(v); setPage(0); }} />
        </div>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Search # or client…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <div className="check-filters">
            {["All", "Sales", "Returns", "Exchanges"].map((t) => (
              <label key={t} className={"check" + (txnSel.includes(t) ? " on" : "")}>
                <input type="checkbox" checked={txnSel.includes(t)} onChange={() => toggleSel(txnSel, setTxnSel, t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
          {(txnSel.includes("All") || txnSel.includes("Sales")) && (
            <div className="check-filters">
              {["All", "Unpaid", "Partially Paid", "Paid", "Overdue"].map((s) => (
                <label key={s} className={"check" + (statusSel.includes(s) ? " on" : "")}>
                  <input type="checkbox" checked={statusSel.includes(s)} onChange={() => toggleSel(statusSel, setStatusSel, s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          )}
          <select className="tool-select" value={sales} onChange={(e) => { setSales(e.target.value); setPage(0); }}>
            <option value="All">All salespeople</option>
            {D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <SortControl sort={sort} setSort={(v) => { setSort(v); setPage(0); }} defs={invSorts} />
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Document</th><th>Type</th><th>Client</th><th>Date</th><th>Due</th><th>Salesperson</th>
              <th className="r">Total</th><th className="r">Balance</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const isSale = r.txn === "Sale";
              const bal = isSale ? r.total - r.paid : 0;
              const typeTone = r.txn === "Return" ? "red" : r.txn === "Exchange" ? "blue" : "slate";
              const target = isSale ? r.no : r.origInv;
              return (
                <tr key={r.doc}>
                  <td>{r.register
                    ? <span className="mono strong">{r.doc} <em className="cat-tag">register</em></span>
                    : <button className="link mono strong" onClick={() => target && go("invoiceview/" + target)}>{r.doc}</button>}</td>
                  <td><Badge tone={typeTone}>{saleKindLabel(r)}</Badge></td>
                  <td>{r.register
                    ? <span>{r.clientLabel} <em className="cat-tag">{r.type}</em></span>
                    : <button className="link" onClick={() => go("client/" + r.clientId)}>{clientName(r.clientId)}</button>}</td>
                  <td className="muted">{shortDate(r.date)}</td>
                  <td className="muted">{r.due ? shortDate(r.due) : "—"}</td>
                  <td>{personName(r.sales)}</td>
                  <td className={"r mono" + (r.total < 0 ? " neg" : "")}>{fmt(r.total)}</td>
                  <td className="r mono">{isSale && bal > 0.005 ? fmt(bal) : "—"}</td>
                  <td><Badge tone={statusTone(r.status)} dot>{r.status}</Badge></td>
                  <td className="row-acts">
                    {r.register
                      ? <button className="icon-btn" title="Register entry — no invoice document" disabled><Icon name="receipt" size={15} /></button>
                      : <>
                          <button className="icon-btn" title={isSale ? "View invoice" : "View original " + (r.origInv || "")} onClick={() => target && go("invoiceview/" + target)}><Icon name={isSale ? "edit" : "history"} size={15} /></button>
                          <button className="icon-btn" title="Email"><Icon name="mail" size={15} /></button>
                          <button className="icon-btn" title="Download"><Icon name="download" size={15} /></button>
                        </>}
                  </td>
                </tr>
              );
            })}
            {!slice.length && <tr><td colSpan="10"><Empty icon="invoice" text="No transactions match this view" /></td></tr>}
          </tbody>
        </table>

        <div className="table-foot">
          <span className="muted">Showing {slice.length} of {rows.length} · Net total {fmt(totals.total)}</span>
          <div className="pager">
            <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="chevron" size={16} style={{ transform: "scaleX(-1)" }} /></button>
            <span>Page {page + 1} / {pages}</span>
            <button className="icon-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><Icon name="chevron" size={16} /></button>
          </div>
        </div>
      </Card>
      {showEmail && (
        <EmailHistoryModal spec={buildExportSpec()} range={range} go={go}
          onClose={() => setShowEmail(false)} pushToast={pushToast} />
      )}
    </div>
  );
}

function EmailHistoryModal({ spec, range, go, onClose, pushToast }) {
  const D = BCCWE;
  const acct = D.prefs.accountantEmail || "";
  const acctName = D.prefs.accountantName || "Accountant";
  const [useAcct, setUseAcct] = useState(!!acct);
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState("Hi,\n\nPlease find attached our invoice history for " + range.label + " (" + spec.data.length + " invoices).\n\nThank you.");
  const backup = D.prefs.backupEmail || "";
  const recipients = [];
  if (useAcct && acct) recipients.push(acct);
  extra.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).forEach((e) => recipients.push(e));
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const valid = recipients.length > 0 && recipients.every((e) => emailRe.test(e));

  function downloadCopy() { exportXlsx(spec.filename, spec.sheet, spec.cols, spec.data, spec.opts); window.logDownload({ kind: "XLSX", file: spec.filename + ".xlsx", docNo: "", clientId: "" }); }
  function send() {
    if (!valid) return;
    const prof = D.smtpProfiles.find((x) => x.isDefault) || D.smtpProfiles[0];
    window.sendEmail({ kind: "history", subject: "Invoice history — " + range.label, docNo: "", clientId: "", profileId: prof.id, to: recipients, cc: [], attachments: [spec.filename + ".xlsx"] },
      (status) => pushToast("Invoice history " + status.toLowerCase()));
    pushToast("Sending invoice history to " + recipients.length + (recipients.length === 1 ? " recipient" : " recipients") + "…");
    onClose();
  }
  return (
    <Modal title="Email invoice history" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="send" disabled={!valid} onClick={send}>Send email</Btn>
      </>}>
      <div className="attach-chip">
        <Icon name="report" size={17} />
        <div className="attach-meta"><strong>{spec.filename}.xlsx</strong><span>{spec.data.length} invoices · {range.label}</span></div>
        <button className="link" onClick={downloadCopy}>Download copy</button>
      </div>
      <span className="field-label" style={{ marginTop: 16 }}>Recipients</span>
      {acct ? (
        <label className="email-pick">
          <input type="checkbox" checked={useAcct} onChange={() => setUseAcct((v) => !v)} />
          <span>{acctName} · {acct}</span>
          <Badge tone="blue">accountant</Badge>
        </label>
      ) : (
        <p className="rail-note">No accountant email saved. <button className="link" onClick={() => { onClose(); go("settings"); }}>Add one in Settings</button> or enter a recipient below.</p>
      )}
      <Field label="Add recipients" hint="Separate multiple emails with commas">
        <input type="text" placeholder="name@example.com, owner@example.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      <Field label="Message">
        <textarea rows="4" value={msg} onChange={(e) => setMsg(e.target.value)} />
      </Field>
      {backup && (
        <div className="cc-row cc-fixed">
          <Icon name="check" size={15} />
          <div className="cc-meta"><strong>Always copied to {backup}</strong><span>System backup email — a copy of every email is kept here · change in Settings</span></div>
        </div>
      )}
      {!valid && recipients.length > 0 && <p className="rail-note" style={{ color: "var(--red)" }}>One or more email addresses look invalid.</p>}
    </Modal>
  );
}
function People({ go, pushToast }) {
  const D = BCCWE;
  const [tab, setTab] = useState("clients");
  const [showImport, setShowImport] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [, setRev] = useState(0);
  const [csort, setCsort] = useState("profit_desc");
  const [ssort, setSsort] = useState("name_asc");
  const [period, setPeriod] = useState("year");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  const [cfocus, setCfocus] = useState("all");
  const range = periodRange(period, from, to);

  const agg = {};
  D.itemSales.forEach((s) => {
    if (!inRange(s.date, range)) return;
    const it = itemByCode(s.code); if (!it) return;
    const a = agg[s.clientId] || (agg[s.clientId] = { rev: 0, prof: 0 });
    a.rev += s.qty * it.price; a.prof += s.qty * (it.price - it.cost);
  });

  const clientSorts = {
    profit_desc: { label: "Profit (period) — high to low", get: (c) => c.pprof, dir: "desc" },
    profit_asc: { label: "Profit (period) — low to high", get: (c) => c.pprof, dir: "asc" },
    revenue_desc: { label: "Revenue (period) — high to low", get: (c) => c.prev, dir: "desc" },
    name_asc: { label: "Name — A to Z", get: (c) => c.name, dir: "asc" },
    name_desc: { label: "Name — Z to A", get: (c) => c.name, dir: "desc" },
    balance_desc: { label: "A/R balance — high to low", get: (c) => c.balance, dir: "desc" },
    type_asc: { label: "Type — Retail/Wholesale", get: (c) => c.type, dir: "asc" },
  };
  const supplierSorts = {
    name_asc: { label: "Name — A to Z", get: (s) => s.name, dir: "asc" },
    name_desc: { label: "Name — Z to A", get: (s) => s.name, dir: "desc" },
    balance_desc: { label: "A/P balance — high to low", get: (s) => s.balance, dir: "desc" },
    balance_asc: { label: "A/P balance — low to high", get: (s) => s.balance, dir: "asc" },
    terms_asc: { label: "Terms — A to Z", get: (s) => s.terms, dir: "asc" },
  };
  const clients = applySort(D.clients.map((c) => ({ ...c, prev: (agg[c.id] && agg[c.id].rev) || 0, pprof: (agg[c.id] && agg[c.id].prof) || 0 })), csort, clientSorts);
  const suppliers = applySort(D.suppliers, ssort, supplierSorts);

  const clientImport = {
    title: "Import clients",
    entityFile: "BCCWE-clients",
    columns: [
      { key: "name", label: "Name", required: true, hint: "Business or person" },
      { key: "type", label: "Type", hint: "Retail or Wholesale" },
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "terms", label: "Terms", hint: "e.g. Net 30" },
      { key: "exempt", label: "Tax-exempt", hint: "Yes / No" },
    ],
    sample: [
      { name: "Example Retail Co.", type: "Retail", contact: "Jane Doe", phone: "(604) 555-0000", email: "jane@example.com", terms: "Due on receipt", exempt: "No" },
      { name: "Example Wholesale Ltd.", type: "Wholesale", contact: "John Smith", phone: "(778) 555-0001", email: "ap@examplewholesale.com", terms: "Net 30", exempt: "Yes" },
    ],
    onImport: (objs) => {
      objs.forEach((o, i) => {
        const exempt = /^(y|yes|true|1)/i.test(o.exempt || "");
        const ctype = /whole/i.test(o.type || "") ? "Wholesale" : "Retail";
        D.clients.push({
          id: "c" + Date.now().toString(36) + i,
          name: o.name, type: ctype,
          contact: o.contact || "—", phone: o.phone || "—",
          terms: o.terms || (ctype === "Wholesale" ? "Net 30" : "Due on receipt"),
          emails: o.email ? [o.email] : [], defaultEmail: o.email || "",
          exempt, balance: 0, taxDefault: exempt ? "none" : defaultTaxForType(ctype),
        });
      });
      setRev((r) => r + 1);
      return objs.length;
    },
  };
  const supplierImport = {
    title: "Import suppliers",
    entityFile: "BCCWE-suppliers",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "addr", label: "Address" },
      { key: "terms", label: "Terms", hint: "e.g. Net 30 / COD" },
    ],
    sample: [
      { name: "Example Parts Supply", contact: "Sales Desk", phone: "(604) 555-0200", addr: "100 Industrial Ave, Surrey BC", terms: "Net 30" },
      { name: "Example Components Inc.", contact: "Alex Lee", phone: "(778) 555-0222", addr: "500 Boundary Rd, Burnaby BC", terms: "COD" },
    ],
    onImport: (objs) => {
      objs.forEach((o, i) => {
        D.suppliers.push({
          id: "s" + Date.now().toString(36) + i,
          name: o.name, contact: o.contact || "—", phone: o.phone || "—",
          addr: o.addr || "—", terms: o.terms || "Net 30", balance: 0,
        });
      });
      setRev((r) => r + 1);
      return objs.length;
    },
  };
  const activeImport = tab === "clients" ? clientImport : supplierImport;

  const cbuckets = timeBuckets(range).map((bk) => {
    let v = 0;
    D.itemSales.forEach((s) => {
      if (!bk.test(s.date)) return;
      if (cfocus !== "all" && s.clientId !== cfocus) return;
      const it = itemByCode(s.code); if (!it) return;
      v += s.qty * (it.price - it.cost);
    });
    return { label: bk.label, value: v };
  });

  return (
    <div>
      <PageHead title="People" sub="Clients and suppliers"
        actions={<>
          <Btn variant="ghost" icon="download" onClick={() => setShowImport(true)}>Import</Btn>
          <Btn variant="primary" icon="plus" onClick={() => tab === "clients" ? setShowAddClient(true) : setShowAddSupplier(true)}>{tab === "clients" ? "Add client" : "Add supplier"}</Btn>
        </>} />
      <div className="tabs">
        <button className={"tab" + (tab === "clients" ? " on" : "")} onClick={() => setTab("clients")}>Clients <em>{D.clients.length}</em></button>
        <button className={"tab" + (tab === "suppliers" ? " on" : "")} onClick={() => setTab("suppliers")}>Suppliers <em>{D.suppliers.length}</em></button>
      </div>

      {tab === "clients" ? (
        <Card pad={false}>
          <div className="toolbar">
            <PeriodFilter period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
            <SortControl sort={csort} setSort={setCsort} defs={clientSorts} />
          </div>
          <div className="chart-wrap">
            <div className="chart-head">
              <h4>Client profit trend{cfocus !== "all" ? " — " + clientName(cfocus) : " — all clients"}</h4>
              <select value={cfocus} onChange={(e) => setCfocus(e.target.value)}>
                <option value="all">All clients</option>
                {D.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <ProfitTrendChart buckets={cbuckets} caption="Clients gross profit" />
          </div>
          <table className="data-table">
            <thead><tr><th>Client</th><th>Type</th><th>Contact</th><th>Terms</th><th className="r">Revenue ({range.label})</th><th className="r">Profit</th><th className="r">A/R balance</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="strong"><button className="link" onClick={() => go("client/" + c.id)}>{c.name}</button></td>
                  <td><Badge tone={c.type === "Wholesale" ? "blue" : "slate"}>{c.type}</Badge></td>
                  <td className="muted">{c.contact}</td>
                  <td className="muted">{c.terms}</td>
                  <td className="r mono">{c.prev > 0 ? fmt(c.prev) : "—"}</td>
                  <td className="r mono">{c.pprof > 0 ? <span className="pos strong">{fmt(c.pprof)}</span> : "—"}</td>
                  <td className="r mono">{c.balance > 0 ? fmt(c.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card pad={false}>
          <div className="toolbar"><SortControl sort={ssort} setSort={setSsort} defs={supplierSorts} /></div>
          <table className="data-table">
            <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Address</th><th>Terms</th><th className="r">A/P balance</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.name}</td>
                  <td className="muted">{s.contact}</td>
                  <td className="muted">{s.phone}</td>
                  <td className="muted">{s.addr}</td>
                  <td className="muted">{s.terms}</td>
                  <td className="r mono">{s.balance > 0 ? fmt(s.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {showImport && (
        <ImportModal {...activeImport} pushToast={pushToast} onClose={() => setShowImport(false)} />
      )}
      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)}
          onCreate={(c) => { D.clients.push(c); setShowAddClient(false); setRev((r) => r + 1); pushToast && pushToast(c.name + " added to clients"); }} />
      )}
      {showAddSupplier && (
        <AddSupplierModal onClose={() => setShowAddSupplier(false)}
          onCreate={(s) => { D.suppliers.push(s); setShowAddSupplier(false); setRev((r) => r + 1); pushToast && pushToast(s.name + " added to suppliers"); }} />
      )}
    </div>
  );
}

function AddSupplierModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [terms, setTerms] = useState("Net 30");
  const valid = name.trim().length > 0;
  function submit() {
    if (!valid) return;
    onCreate({
      id: "s" + Date.now().toString(36),
      name: name.trim(),
      contact: contact.trim() || "—",
      phone: phone.trim() || "—",
      addr: addr.trim() || "—",
      terms, balance: 0,
    });
  }
  return (
    <Modal title="Add new supplier" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={submit} disabled={!valid}>Add supplier</Btn>
      </>}>
      <div className="add-client-grid">
        <Field label="Supplier name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pacific Parts Distribution" autoFocus />
        </Field>
        <Field label="Contact name"><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Primary contact" /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(604) 555-0000" /></Field>
        <Field label="Payment terms">
          <select value={terms} onChange={(e) => setTerms(e.target.value)}>
            {["COD", "Net 15", "Net 30", "Net 45", "Net 60"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Address"><input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Street, City, BC" /></Field>
      </div>
    </Modal>
  );
}

Object.assign(window, { Dashboard, InvoiceHistory, People });