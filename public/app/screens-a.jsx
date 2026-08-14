/* ============================================================
   BCCWE — Dashboard, Invoice History, People
   ============================================================ */

/* ---------------- Dashboard ---------------- */
function ClientDashboard({ go }) {
  const D = BCCWE;
  const clientId = window.sessionClientId ? window.sessionClientId() : "";
  const client = D.clients.find((c) => c.id === clientId);
  const myInvoices = D.invoices.filter((i) => i.clientId === clientId);
  const myOrders = (D.orders || []).filter((o) => o.clientId === clientId);
  const outstanding = myInvoices.reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.paid || 0)), 0);
  const openOrders = myOrders.filter((o) => ["Ordering", "Ordered", "In Transit"].includes(o.status));
  return (
    <div>
      <PageHead title={"Welcome" + (client ? ", " + client.name : "")} sub={"Your account · " + shortDate(D.today)}
        actions={(typeof navAllowed !== "function" || navAllowed("neworder")) ? <Btn variant="primary" icon="cart" onClick={() => go("neworder")}>Place new order</Btn> : null} />
      <div className="kpi-row tri">
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="invoice" size={18} /></span></div><div className="kpi-val">{fmt(outstanding)}</div><div className="kpi-label">Outstanding balance</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="order" size={18} /></span></div><div className="kpi-val">{openOrders.length}</div><div className="kpi-label">Open orders</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="history" size={18} /></span></div><div className="kpi-val">{myInvoices.length}</div><div className="kpi-label">Your invoices</div></div>
      </div>
      <Card title="Your recent invoices" className="span2" actions={<Btn variant="ghost" size="sm" onClick={() => go("history")}>View all</Btn>}>
        <table className="mini-table">
          <thead><tr><th>Invoice</th><th>Date</th><th className="r">Total</th><th>Status</th></tr></thead>
          <tbody>
            {myInvoices.slice(0, 8).map((i) => (
              <tr key={i.no}><td className="mono">{i.no}</td><td className="muted">{shortDate(i.date)}</td><td className="r mono">{fmt(i.total)}</td><td><Badge tone={statusTone(i.status)} dot>{i.status}</Badge></td></tr>
            ))}
            {!myInvoices.length && <tr><td colSpan="4"><Empty icon="invoice" text="No invoices yet" /></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Dashboard({ go, store }) {
  const D = BCCWE;
  if (window.isClientUser && window.isClientUser()) return <ClientDashboard go={go} />;
  const sf = store || "all";
  const match = (r) => !window.STORES || window.STORES.matches(r, sf);
  const invs = D.invoices.filter(match);
  const sales = (D.cashSales || []).filter(match);
  const outstanding = invs.filter((i) => i.status !== "Paid").reduce((s, i) => s + (i.total - i.paid), 0);
  const overdue = invs.filter((i) => i.status === "Overdue").reduce((s, i) => s + (i.total - i.paid), 0);
  // Revenue this month = invoices + cash sales dated in the current month.
  const ym = (D.today || "").slice(0, 7);
  const mtdRevenue =
    invs.filter((i) => (i.date || "").slice(0, 7) === ym).reduce((s, i) => s + (i.total || 0), 0) +
    sales.filter((s2) => (s2.date || "").slice(0, 7) === ym).reduce((s, c) => s + (c.total || 0), 0);
  const _bal = (typeof storeBalances === "function") ? storeBalances(sf) : { cash: 0 };
  const _fin = (typeof storeFinance === "function") ? storeFinance(sf) : { gst: 0, pst: 0 };
  const cashPos = _bal.cash;
  const gstDue = _fin.gst;
  const pstDue = _fin.pst;
  const lowStock = D.inventory.filter((i) => i.kind !== "Service" && (i.alert || 0) > 0 && i.stock <= i.alert);
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

  // Real last-12-weeks revenue (invoices + cash sales); flat when there's no data yet.
  const _now = new Date((D.today || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const spark = new Array(12).fill(0);
  const _addWeek = (dateStr, amt) => {
    if (!dateStr) return;
    const w = Math.floor((_now - new Date(dateStr + "T00:00:00")) / (7 * 86400000));
    if (w >= 0 && w < 12) spark[11 - w] += amt || 0;
  };
  invs.forEach((i) => _addWeek(i.date, i.total));
  sales.forEach((c) => _addWeek(c.date, c.total));
  const max = Math.max(...spark, 1);

  return (
    <div>
      <PageHead title="Dashboard" sub={"Welcome, " + ((window.__session && window.__session.userId) || "there") + " · " + shortDate(D.today) + " · Surrey, BC"}
        actions={<>
          {(typeof navAllowed !== "function" || navAllowed("pos")) && <Btn variant="ghost" icon="cart" onClick={() => go("pos")}>Open POS</Btn>}
          {(typeof navAllowed === "function" && navAllowed("neworder") && !(window.STORES && window.STORES.isAdmin())) && <Btn variant="primary" icon="order" onClick={() => go("neworder")}>New order</Btn>}
          {(typeof navAllowed !== "function" || navAllowed("invoice")) && <Btn variant="primary" icon="plus" onClick={() => go("invoice")}>New invoice</Btn>}
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
function InvoiceHistory({ go, pushToast, store }) {
  const D = BCCWE;
  const sf = store || "all";
  const _clientId = window.sessionClientId ? window.sessionClientId() : "";
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
  const [emailInv, setEmailInv] = useState(null);
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
    const sale = D.invoices.map((i) => ({ ...i, txn: i.kind === "order" ? "Order" : "Sale", doc: i.no, balance: i.total - i.paid }));
    const credits = D.creditNotes.map((c) => ({ ...c, txn: c.type, doc: c.no, due: null, paid: 0, balance: 0 }));
    const register = D.cashSales.map((s) => ({
      ...s, txn: s.kind, doc: s.ref || ("REG-" + String(s.id).replace(/\D/g, "").slice(-5)),
      register: true, clientLabel: s.client, regClientId: s.clientId || null, clientId: null, no: null, origInv: null, due: null,
      paid: s.total, balance: 0, subtotal: s.total, status: s.total < 0 ? "Refunded" : "Paid",
    }));
    let all = [...sale, ...credits, ...register];
    // A client login only ever sees its own documents.
    if (_clientId) all = all.filter((r) => (r.register ? r.regClientId : r.clientId) === _clientId);
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
      if (sf !== "all" && window.STORES) {
        const rs = r.txn === "Sale" ? (r.companyId || window.STORES.idOf(r))
          : (r.txn === "Return" || r.txn === "Exchange") ? cnStoreId(r)
          : window.STORES.idOf(r);
        if (rs !== sf) return false;
      }
      if (!inRange(r.date, range)) return false;
      if (q) {
        const hay = (r.doc + " " + clientName(r.clientId)).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return applySort(filtered, sort, invSorts);
  }, [q, statusSel, txnSel, sales, sort, period, from, to, sf, _clientId, D.invoices.length, D.creditNotes.length, D.cashSales.length]);

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
  function downloadInvoicePdf(inv) {
    try {
      const b64 = window.invoicePdfBase64FromData(inv);
      if (!b64) { pushToast && pushToast("Could not generate PDF"); return; }
      const a = document.createElement("a");
      a.href = "data:application/pdf;base64," + b64;
      a.download = inv.no + ".pdf";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (window.logDownload) window.logDownload({ kind: "PDF", file: inv.no + ".pdf", docNo: inv.no, clientId: inv.clientId });
      pushToast && pushToast("Downloaded " + inv.no + ".pdf");
    } catch (e) { pushToast && pushToast("Could not generate PDF"); }
  }
  function sendWa(inv) {
    const client = BCCWE.clients.find((c) => c.id === inv.clientId);
    if (!client) { pushToast && pushToast("No client on this invoice"); return; }
    const mode = window.sendWhatsApp(client, window.invoiceWaMessage(inv, client), function (r) {
      pushToast && pushToast(r && r.ok ? "Invoice sent to WhatsApp" : "WhatsApp: " + ((r && r.error) || "failed"));
    });
    if (mode === "") pushToast && pushToast("This client has no phone number");
    else if (mode === "api") pushToast && pushToast("Sending to WhatsApp…");
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
                          <button className="icon-btn" title="Email invoice" onClick={() => { const iv = isSale ? r : D.invoices.find((x) => x.no === target); if (iv) setEmailInv(iv); }}><Icon name="mail" size={15} /></button>
                          {isSale && <button className="icon-btn" title="Send to WhatsApp" onClick={() => sendWa(r)}><Icon name="send" size={15} /></button>}
                          <button className="icon-btn" title="Download" onClick={() => downloadInvoicePdf(isSale ? r : { ...r, no: target })}><Icon name="download" size={15} /></button>
                          {isSale && <button className="icon-btn" title="Return / Exchange" onClick={() => go("invoiceview/" + r.no)}><Icon name="history" size={15} /></button>}
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
      {emailInv && (
        <EmailModal client={D.clients.find((c) => c.id === emailInv.clientId)} invNo={emailInv.no} total={emailInv.total}
          onClose={() => setEmailInv(null)} pushToast={pushToast} />
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
    const fileName = spec.filename.endsWith(".xlsx") ? spec.filename : spec.filename + ".xlsx";
    let attachmentData = [];
    try {
      const b64 = window.xlsxBase64(spec.sheet, spec.cols, spec.data, spec.opts);
      if (b64) attachmentData = [{ filename: fileName, content: b64 }];
    } catch (e) { /* if generation fails, the email still sends without the file */ }
    window.sendEmail({ kind: "history", subject: "Invoice history — " + range.label, docNo: "", clientId: "", profileId: prof.id, to: recipients, cc: [], message: msg, attachments: [fileName], attachmentData },
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
  const [pq, setPq] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [loginClient, setLoginClient] = useState(null);
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
  const pqLower = pq.trim().toLowerCase();
  const clientsAll = applySort(D.clients.map((c) => ({ ...c, prev: (agg[c.id] && agg[c.id].rev) || 0, pprof: (agg[c.id] && agg[c.id].prof) || 0 })), csort, clientSorts);
  const suppliersAll = applySort(D.suppliers, ssort, supplierSorts);
  const clients = pqLower
    ? clientsAll.filter((c) => {
        const hay = [c.name, c.defaultEmail, (c.emails || []).join(" "), c.phone, c.contact].join(" ").toLowerCase();
        return hay.includes(pqLower);
      })
    : clientsAll;
  const suppliers = pqLower
    ? suppliersAll.filter((s) => [s.name, s.contact, s.phone].join(" ").toLowerCase().includes(pqLower))
    : suppliersAll;

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
      window.logAudit("IMPORT", "Client", "clients", "clients.csv", "Imported " + objs.length + " clients from CSV");
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
      window.logAudit("IMPORT", "Supplier", "suppliers", "suppliers.csv", "Imported " + objs.length + " suppliers from CSV");
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
            <div className="search">
              <Icon name="search" size={16} />
              <input placeholder="Search clients…" value={pq} onChange={(e) => setPq(e.target.value)} />
            </div>
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
            <thead><tr><th>Client</th><th>Type</th><th>Contact</th><th>Terms</th><th className="r">Revenue ({range.label})</th><th className="r">Profit</th><th className="r">A/R balance</th><th>Login</th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const hasLogin = (D.users || []).some((u) => u.clientId === c.id);
                return (
                <tr key={c.id}>
                  <td className="strong"><button className="link" onClick={() => go("client/" + c.id)}>{c.name}</button></td>
                  <td><Badge tone={c.type === "Wholesale" ? "blue" : "slate"}>{c.type}</Badge></td>
                  <td className="muted">{c.contact}</td>
                  <td className="muted">{c.terms}</td>
                  <td className="r mono">{c.prev > 0 ? fmt(c.prev) : "—"}</td>
                  <td className="r mono">{c.pprof > 0 ? <span className="pos strong">{fmt(c.pprof)}</span> : "—"}</td>
                  <td className="r mono">{c.balance > 0 ? fmt(c.balance) : "—"}</td>
                  <td>{bccweIsAdmin() ? <Btn variant={hasLogin ? "ghost" : "default"} size="sm" icon="lock" onClick={() => setLoginClient(c)}>{hasLogin ? "Manage" : "Create"}</Btn> : (hasLogin ? <Badge tone="green" dot>Has login</Badge> : <span className="muted">—</span>)}</td>
                </tr>
                );
              })}
              {!clients.length && <tr><td colSpan="8"><Empty icon="user" text="No clients match this search" /></td></tr>}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card pad={false}>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={16} />
              <input placeholder="Search suppliers…" value={pq} onChange={(e) => setPq(e.target.value)} />
            </div>
            <SortControl sort={ssort} setSort={setSsort} defs={supplierSorts} />
          </div>
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
              {!suppliers.length && <tr><td colSpan="6"><Empty icon="user" text="No suppliers match this search" /></td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      {showImport && (
        <ImportModal {...activeImport} pushToast={pushToast} onClose={() => setShowImport(false)} />
      )}
      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)}
          onCreate={(c) => { D.clients.push(c); window.logAudit("CREATE", "Client", "clients", c.name, "Added client " + c.name + " · " + (c.type || "")); setShowAddClient(false); setRev((r) => r + 1); pushToast && pushToast(c.name + " added to clients"); }} />
      )}
      {showAddSupplier && (
        <AddSupplierModal onClose={() => setShowAddSupplier(false)}
          onCreate={(s) => { D.suppliers.push(s); window.logAudit("CREATE", "Supplier", "suppliers", s.name, "Added supplier " + s.name); setShowAddSupplier(false); setRev((r) => r + 1); pushToast && pushToast(s.name + " added to suppliers"); }} />
      )}
      {loginClient && (
        <ClientLoginModal client={loginClient} pushToast={pushToast}
          onClose={() => setLoginClient(null)}
          onSaved={() => { setLoginClient(null); setRev((r) => r + 1); }} />
      )}
    </div>
  );
}

// Create / manage a client's portal login from the Clients page. A client login
// is a user with role "Client" linked to this client record (kept separate from
// staff). They sign in to browse the catalogue and place / track their orders.
function ClientLoginModal({ client, onClose, onSaved, pushToast }) {
  const D = BCCWE;
  const existing = (D.users || []).find((u) => u.clientId === client.id);
  const gen = () => (typeof genPassword === "function" ? genPassword() : "client" + Math.floor(Math.random() * 9000 + 1000));
  const [email, setEmail] = useState(existing ? existing.email : (client.defaultEmail || (client.emails && client.emails[0]) || ""));
  const [password, setPassword] = useState(existing ? existing.password : gen());
  const [active, setActive] = useState(existing ? existing.active !== false : true);
  const [show, setShow] = useState(true);
  const clientRole = (D.roles || []).find((r) => r.id === "r_client") || (D.roles || []).find((r) => r.name === "Client");
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const valid = emailRe.test(email) && (password || "").trim().length >= 6;

  function save() {
    if (!valid) return;
    if (existing) {
      existing.email = email.trim(); existing.password = password.trim(); existing.active = active;
      existing.role = (clientRole && clientRole.id) || existing.role; existing.clientId = client.id;
      window.logAudit("UPDATE", "Client login", "users", client.name, "Updated client login for " + client.name);
      pushToast && pushToast("Login updated for " + client.name);
    } else {
      D.users = D.users || [];
      D.users.push({
        id: "u_" + Date.now().toString(36), name: client.name,
        initials: (typeof initialsOf === "function" ? initialsOf(client.name) : client.name.slice(0, 2).toUpperCase()),
        email: email.trim(), role: (clientRole && clientRole.id) || "r_client",
        clientId: client.id, password: password.trim(), active, companies: [],
      });
      window.logAudit("CREATE", "Client login", "users", client.name, "Created client login for " + client.name);
      pushToast && pushToast("Login created for " + client.name);
    }
    if (window.persist) window.persist("users");
    onSaved && onSaved();
  }
  function removeLogin() {
    if (!existing) return;
    D.users = (D.users || []).filter((u) => u !== existing);
    window.logAudit("DELETE", "Client login", "users", client.name, "Removed client login for " + client.name);
    if (window.persist) window.persist("users");
    pushToast && pushToast("Login removed for " + client.name);
    onSaved && onSaved();
  }

  return (
    <Modal title={(existing ? "Manage login — " : "Create login — ") + client.name} onClose={onClose}
      footer={<>
        {existing && <Btn variant="ghost" icon="trash" onClick={removeLogin}>Remove login</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={save}>{existing ? "Save login" : "Create login"}</Btn>
      </>}>
      <p className="rail-note" style={{ marginBottom: 12 }}>This signs <strong>{client.name}</strong> in as a <strong>Client</strong> — they only see the catalogue and their own orders. Share the email &amp; password with them.</p>
      <Field label="Login email" required>
        <input type="email" value={email} placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" required hint="At least 6 characters">
        <div className="pw-field">
          <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="pw-btn" type="button" onClick={() => setShow((v) => !v)} title={show ? "Hide" : "Show"}><Icon name="eye" size={15} /></button>
          <button className="pw-btn" type="button" onClick={() => { setPassword(gen()); setShow(true); }} title="Generate"><Icon name="settings" size={15} /></button>
        </div>
      </Field>
      <label className="toggle-row" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div><strong>Login active</strong><span>Inactive logins can't sign in</span></div>
      </label>
    </Modal>
  );
}

function AddSupplierModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
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
      countryCode: countryCode.trim() || "+1",
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
        <Field label="Country code"><input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+1" /></Field>
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