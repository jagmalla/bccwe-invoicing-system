/* ============================================================
   BCCWE — Detail screens: Unpaid Invoices, Invoice Detail, Client Account
   ============================================================ */

/* derive believable line items for historical invoices (new ones carry real lines) */
function deriveLines(inv) {
  if (inv.lines && inv.lines.length) return inv.lines;
  const sub = inv.subtotal;
  const pool = BCCWE.inventory.filter((i) => i.price <= sub + 0.001).sort((a, b) => b.price - a.price);
  const primary = pool[0];
  if (!primary) return [{ desc: "Items & services", code: "", qty: 1, price: sub, disc: 0, cost: 0 }];
  const qty = Math.max(1, Math.floor(sub / primary.price));
  const pTotal = +(qty * primary.price).toFixed(2);
  const lines = [{ desc: primary.name, code: primary.code, qty, price: primary.price, disc: 0, cost: primary.cost }];
  const rem = +(sub - pTotal).toFixed(2);
  if (rem > 0.5) lines.push({ desc: "Repair & service labour", code: "SVC-LBR", qty: 1, price: rem, disc: 0, cost: 0 });
  return lines;
}

function invNetPaid(inv) {
  return +(((inv.paid || 0) - (inv.refunded || 0))).toFixed(2);
}
function invStatus(inv) {
  const net = invNetPaid(inv);
  const bal = +(inv.total - net).toFixed(2);
  if (net <= 0.005) return inv.status === "Overdue" ? "Overdue" : "Unpaid";
  if (net > inv.total + 0.005) return "Overpaid";
  if (bal <= 0.005) return "Paid";
  return "Partially Paid";
}

function invPayments(inv) {
  const recs = BCCWE.payments.filter((p) => p.inv === inv.no);
  if (recs.length) return recs;
  if (inv.paid > 0.005) return [{ id: "auto", date: inv.date, inv: inv.no, clientId: inv.clientId, amount: inv.paid, method: inv.payMethod || "—", acct: "1010" }];
  return [];
}

/* ---------------- Unpaid Invoices ---------------- */
function UnpaidInvoices({ go }) {
  const D = BCCWE;
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("All");
  const [sort, setSort] = useState("age_desc");
  const today = new Date(D.today);

  const unpaidSorts = {
    age_desc: { label: "Age — oldest first", get: (i) => i.age, dir: "desc" },
    balance_desc: { label: "Balance — high to low", get: (i) => i.total - i.paid, dir: "desc" },
    balance_asc: { label: "Balance — low to high", get: (i) => i.total - i.paid, dir: "asc" },
    due_asc: { label: "Due date — earliest", get: (i) => new Date(i.due).getTime(), dir: "asc" },
    no_desc: { label: "Invoice # — high to low", get: (i) => parseInt(i.no.replace(/\D/g, "")) || 0, dir: "desc" },
    client_asc: { label: "Client — A to Z", get: (i) => clientName(i.clientId), dir: "asc" },
  };

  const open = D.invoices.filter((i) => invStatus(i) !== "Paid" && i.total - i.paid > 0.005);
  const withAge = open.map((i) => {
    const age = Math.floor((today - new Date(i.due)) / 86400000);
    const b = age <= 0 ? "Current" : age <= 30 ? "1–30" : age <= 60 ? "31–60" : age <= 90 ? "61–90" : "90+";
    return { ...i, age, bucket: b };
  });
  const rows = applySort(withAge.filter((i) =>
    (bucket === "All" || i.bucket === bucket) &&
    (!q || (i.no + clientName(i.clientId)).toLowerCase().includes(q.toLowerCase()))), sort, unpaidSorts);

  const totalDue = rows.reduce((s, i) => s + (i.total - i.paid), 0);
  const overdueDue = withAge.filter((i) => i.age > 0).reduce((s, i) => s + (i.total - i.paid), 0);

  const buckets = ["Current", "1–30", "31–60", "61–90", "90+"];
  const bucketTotals = {};
  buckets.forEach((b) => { bucketTotals[b] = withAge.filter((i) => i.bucket === b).reduce((s, i) => s + (i.total - i.paid), 0); });

  return (
    <div>
      <PageHead title="Unpaid Invoices" sub={open.length + " open · " + fmt(withAge.reduce((s, i) => s + (i.total - i.paid), 0)) + " receivable · " + fmt(overdueDue) + " overdue"}
        actions={<>
          <Btn variant="ghost" icon="download">Export</Btn>
          <Btn variant="primary" icon="plus" onClick={() => go("invoice")}>New invoice</Btn>
        </>} />

      <div className="aging-row" style={{ marginBottom: 20 }}>
        {buckets.map((b) => (
          <button key={b} className={"aging-cell as-btn" + (b !== "Current" && bucketTotals[b] > 0 ? " warn" : "") + (bucket === b ? " on" : "")}
            onClick={() => setBucket(bucket === b ? "All" : b)}>
            <span className="ag-lbl">{b} days</span>
            <span className="ag-val mono">{fmt(bucketTotals[b])}</span>
          </button>
        ))}
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input placeholder="Search invoice # or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="seg-filters">
            {["All", ...buckets].map((b) => <button key={b} className={"chip" + (bucket === b ? " on" : "")} onClick={() => setBucket(b)}>{b === "All" ? "All" : b + " days"}</button>)}
          </div>
          <SortControl sort={sort} setSort={setSort} defs={unpaidSorts} />
        </div>
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Due</th><th>Age</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Balance</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.no}>
                <td><button className="link mono strong" onClick={() => go("invoiceview/" + i.no)}>{i.no}</button></td>
                <td><button className="link" onClick={() => go("client/" + i.clientId)}>{clientName(i.clientId)}</button></td>
                <td className="muted">{shortDate(i.date)}</td>
                <td className="muted">{shortDate(i.due)}</td>
                <td className={i.age > 0 ? "neg mono" : "muted mono"}>{i.age > 0 ? i.age + "d" : "—"}</td>
                <td className="r mono">{fmt(i.total)}</td>
                <td className="r mono muted">{i.paid > 0 ? fmt(i.paid) : "—"}</td>
                <td className="r mono strong">{fmt(i.total - i.paid)}</td>
                <td><Badge tone={statusTone(invStatus(i))} dot>{invStatus(i)}</Badge></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="9"><Empty icon="check" text="No unpaid invoices in this view" /></td></tr>}
          </tbody>
          <tfoot><tr><td colSpan="7">Balance outstanding ({rows.length})</td><td className="r mono strong">{fmt(totalDue)}</td><td /></tr></tfoot>
        </table>
      </Card>
    </div>
  );
}

/* ---------------- Invoice Detail ---------------- */
function InvoiceDetail({ no, go, pushToast }) {
  const D = BCCWE;
  const [, force] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [priceSuggest, setPriceSuggest] = useState(false);
  const inv = D.invoices.find((i) => i.no === no);
  if (!inv) return <div><PageHead title="Invoice not found" actions={<Btn variant="ghost" icon="chevron" onClick={() => go("history")}>Back</Btn>} /><Card><Empty text={"No invoice " + no} /></Card></div>;

  const C = D.company;
  const client = D.clients.find((c) => c.id === inv.clientId);
  const lines = deriveLines(inv);
  const lineTotal = (l) => l.qty * l.price * (1 - (l.disc || 0) / 100);
  const m = D.TAX.modes[inv.tax];
  const status = invStatus(inv);
  const refunded = inv.refunded || 0;
  const netPaid = invNetPaid(inv);
  const bal = Math.max(0, +(inv.total - netPaid).toFixed(2));
  const creditKept = netPaid > inv.total + 0.005 ? +(netPaid - inv.total).toFixed(2) : 0;
  const pays = invPayments(inv);
  const je = D.journal.find((j) => j.memo.includes(inv.no));
  // recent purchases of an item by this invoice's client (for price suggestions)
  const priceHist = (code) => D.itemSales
    .filter((s) => s.clientId === inv.clientId && s.code === code)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  function recordPayment(amount, method) {
    inv.paid = +(inv.paid + amount).toFixed(2);
    inv.status = invStatus(inv);
    D.payments.unshift({ id: "p" + Date.now(), date: D.today, inv: inv.no, clientId: inv.clientId, amount, method, acct: method === "Cash" ? "1000" : "1010" });
    if (client) client.balance = Math.max(0, +(client.balance - amount).toFixed(2));
    setPayOpen(false);
    pushToast && pushToast("Payment of " + fmt(amount) + " recorded on " + inv.no);
    force((x) => x + 1);
  }

  function emailInvoice() {
    if (!client && !(D.prefs.defaultInvoiceEmail)) { pushToast && pushToast("No email on file — add one on the client"); return; }
    setEmailOpen(true);
  }
  function downloadInvoice() {
    const paper = document.querySelector(".inv-paper-card .inv-paper") || document.querySelector(".inv-paper");
    window.logDownload({ kind: "PDF", file: inv.no + ".pdf", docNo: inv.no, clientId: inv.clientId });
    pushToast && pushToast("Generating " + inv.no + ".pdf…");
    window.downloadInvoicePdf(paper, inv.no + ".pdf", (r) => {
      pushToast && pushToast(r === "fallback" ? "Use “Save as PDF” in the print dialog" : inv.no + ".pdf downloaded");
    });
  }

  return (
    <div>
      <PageHead title={"Invoice " + inv.no} sub={clientName(inv.clientId) + " · " + shortDate(inv.date)}
        actions={<>
          <Btn variant="ghost" icon="chevron" onClick={() => go("history")}>Back</Btn>
          <button type="button"
            className={"price-sugg-toggle" + (priceSuggest ? " on" : "")}
            aria-pressed={priceSuggest}
            onClick={() => setPriceSuggest((v) => !v)}
            title="Team only — recent purchase prices for this client. Never shown to the customer, on the PDF, or in email.">
            <Icon name="history" size={14} />
            {priceSuggest ? "Price suggestions on" : "Price suggestions"}
          </button>
          <Btn variant="ghost" icon="mail" onClick={emailInvoice}>Email</Btn>
          <Btn variant="ghost" icon="download" onClick={downloadInvoice}>Download PDF</Btn>
          <Btn variant="ghost" icon="edit" onClick={() => go("invoice")}>Edit</Btn>
          {bal > 0.005 && <Btn variant="primary" icon="money" onClick={() => setPayOpen(true)}>Record payment</Btn>}
        </>} />

      <div className="detail-grid">
        <div className="card inv-paper-card">
          <div className="inv-paper">
            <div className="ip-top">
              <div className="ip-brand">
                <div className="ip-logo">BC<span>CWE</span></div>
                <div className="ip-co">
                  <strong>{C.name}</strong><span>{C.tagline}</span>
                  <span>{C.addr1}</span><span>{C.addr2}</span><span>{C.phone} · {C.email}</span>
                </div>
              </div>
              <div className="ip-meta">
                <h2>INVOICE</h2>
                <table><tbody>
                  <tr><td>Invoice #</td><th>{inv.no}</th></tr>
                  <tr><td>Date</td><th>{shortDate(inv.date)}</th></tr>
                  <tr><td>Due</td><th>{shortDate(inv.due)}</th></tr>
                  <tr><td>Status</td><th><Badge tone={statusTone(status)}>{status}</Badge></th></tr>
                </tbody></table>
              </div>
            </div>
            <div className="ip-parties">
              <div>
                <span className="ip-lbl">Bill to</span>
                <strong><span className="link" onClick={() => go("client/" + inv.clientId)} style={{ cursor: "pointer" }}>{client ? client.name : "—"}</span></strong>
                <span>{client && client.contact !== "—" ? client.contact : ""}</span>
                <span>{client && client.phone !== "—" ? client.phone : ""}</span>
                <span>{client && client.defaultEmail}</span>
              </div>
              <div className="ip-right">
                <span className="ip-lbl">Salesperson</span><strong>{personName(inv.sales)}</strong>
                <span className="ip-lbl" style={{ marginTop: 10 }}>Tax treatment</span>
                <strong>{m.label} ({Math.round((m.gst + m.pst) * 100)}%)</strong>
              </div>
            </div>
            <table className="ip-lines">
              <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Disc</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {lines.map((l, idx) => {
                  const hist = priceSuggest && l.code ? priceHist(l.code) : null;
                  return (
                  <React.Fragment key={idx}>
                  <tr><td><strong>{l.desc || "—"}</strong>{l.code && <em className="ip-code">{l.code}</em>}</td>
                    <td className="r">{l.qty}</td><td className="r">{fmt(l.price)}</td><td className="r">{l.disc ? l.disc + "%" : "—"}</td><td className="r">{fmt(lineTotal(l))}</td></tr>
                  {hist && (
                    <tr className="ip-hist-row"><td colSpan="5">
                      <div className="ret-hist ig-hist">
                        <div className="ret-hist-head"><Icon name="history" size={12} /> Sold to {clientName(inv.clientId)}{hist.length ? " — last " + hist.length + " purchase" + (hist.length === 1 ? "" : "s") : ""}</div>
                        {hist.length ? (
                          <ul className="ret-hist-list">
                            {hist.map((h, i) => {
                              const net = h.price * (1 - (h.disc || 0) / 100);
                              return (
                                <li key={i}>
                                  <span className="rh-date muted">{shortDate(h.date)}</span>
                                  <span className="rh-qty">×{h.qty}</span>
                                  <span className="rh-price mono">{fmt(net)}<em>/ea</em></span>
                                  {h.disc > 0
                                    ? <span className="rh-disc">{h.disc}% off <s className="mono">{fmt(h.price)}</s></span>
                                    : <span className="rh-disc muted">no discount</span>}
                                </li>
                              );
                            })}
                          </ul>
                        ) : <div className="ret-hist-empty">No prior purchases of this item by this client on record.</div>}
                      </div>
                    </td></tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div className="ip-foot">
              <div className="ip-notes">
                <span className="ip-lbl">Notes</span>
                <p>{inv.notes || "Thank you for your business. Repairs carry a 90-day workmanship warranty."}</p>
                <span className="ip-lbl">{C.gst} · {C.pst}</span>
              </div>
              <div className="ip-totals">
                <div><span>Subtotal</span><span>{fmt(inv.subtotal)}</span></div>
                {inv.gst > 0 && <div><span>GST 5%</span><span>{fmt(inv.gst)}</span></div>}
                {inv.pst > 0 && <div><span>PST 7%</span><span>{fmt(inv.pst)}</span></div>}
                <div className="ip-grand"><span>Total CAD</span><span>{fmt(inv.total)}</span></div>
                {inv.paid > 0 && <div><span>Paid</span><span>-{fmt(inv.paid)}</span></div>}
                {refunded > 0 && <div className="ip-bal ip-refund"><span>Refund paid</span><span>{fmt(refunded)}</span></div>}
                {creditKept > 0
                  ? <div className="ip-bal"><span>Credit on account</span><span>{fmt(creditKept)}</span></div>
                  : <div className="ip-bal"><span>Balance due</span><span>{fmt(bal)}</span></div>}
              </div>
            </div>
          </div>
        </div>

        <aside className="invgen-rail">
          <div className="rail-card">
            <h3>Status</h3>
            <div className="trow"><span>Invoice total</span><span className="num">{fmt(inv.total)}</span></div>
            <div className="trow"><span>Amount paid</span><span className="num pos">{fmt(inv.paid)}</span></div>
            {refunded > 0 && <div className="trow"><span>Refund issued</span><span className="num">-{fmt(refunded)}</span></div>}
            <div className="rail-total" style={{ borderBottom: "none" }}>
              <span>{creditKept > 0 ? "Credit on account" : "Balance due"}</span>
              <strong>{fmt(creditKept > 0 ? creditKept : bal)}</strong>
            </div>
            <div style={{ marginTop: 6 }}><Badge tone={statusTone(status)} dot>{status}</Badge></div>
            {bal > 0.005 && <Btn variant="primary" full icon="money" onClick={() => setPayOpen(true)}>Record payment</Btn>}
          </div>

          <div className="rail-card">
            <h3>Payment history</h3>
            {pays.length ? (
              <ul className="pay-hist">
                {pays.map((p) => (
                  <li key={p.id}><div><strong>{fmt(p.amount)}</strong><span>{p.method}</span></div><span className="muted mono">{shortDate(p.date)}</span></li>
                ))}
              </ul>
            ) : <p className="rail-note">No payments recorded yet.</p>}
          </div>

          {je && (
            <div className="rail-card journal">
              <div className="journal-head"><h3>Journal entry</h3><Badge tone="green" dot>Posted</Badge></div>
              <p className="rail-note mono" style={{ marginBottom: 8 }}>{je.id}</p>
              <table className="jtable">
                <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
                <tbody>{je.lines.map((l, i) => <tr key={i}><td><span className="jcode">{l.acct}</span> {l.name}</td><td className="r">{l.dr ? fmtPlain(l.dr) : ""}</td><td className="r">{l.cr ? fmtPlain(l.cr) : ""}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </aside>
      </div>

      {payOpen && <RecordPaymentModal inv={inv} bal={bal} onClose={() => setPayOpen(false)} onRecord={recordPayment} />}
      {emailOpen && <EmailModal client={client} invNo={inv.no} total={inv.total} onClose={() => setEmailOpen(false)} pushToast={pushToast} />}

      <EmailLogCard filter={(m) => m.docNo === inv.no} emptyText={"Invoice " + inv.no + " has not been emailed yet"} />
      <DownloadLogCard filter={(d) => d.docNo === inv.no} emptyText={"No downloads of " + inv.no + " yet"} />
    </div>
  );
}

function RecordPaymentModal({ inv, bal, onClose, onRecord }) {
  const [amount, setAmount] = useState(bal.toFixed(2));
  const [method, setMethod] = useState("E-Transfer");
  return (
    <Modal title={"Record payment — " + inv.no} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!(+amount > 0)} onClick={() => onRecord(+(+amount).toFixed(2), method)}>Record {fmt(+amount || 0)}</Btn>
      </>}>
      <div className="email-modal">
        <p className="rail-note">Outstanding balance <strong>{fmt(bal)}</strong>. Posts: DR {method === "Cash" ? "Cash on Hand" : "Bank"} · CR Accounts Receivable.</p>
        <Field label="Amount received"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div></Field>
        <Field label="Method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{["E-Transfer", "Cash", "Debit", "Credit Card", "Cheque", "Bank"].map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

/* ---------------- Client Account ---------------- */
function ClientAccount({ id, go, pushToast }) {
  const D = BCCWE;
  const [, force] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const client = D.clients.find((c) => c.id === id);
  if (!client) return <div><PageHead title="Client not found" actions={<Btn variant="ghost" icon="chevron" onClick={() => go("people")}>Back</Btn>} /></div>;

  const invs = D.invoices.filter((i) => i.clientId === id);
  const pays = D.payments.filter((p) => p.clientId === id);
  const totalInvoiced = invs.reduce((s, i) => s + i.total, 0);
  const totalPaid = invs.reduce((s, i) => s + invNetPaid(i), 0);
  const outstanding = +(totalInvoiced - totalPaid).toFixed(2);
  const openCount = invs.filter((i) => invStatus(i) !== "Paid" && i.total - invNetPaid(i) > 0.005).length;

  return (
    <div>
      <PageHead title={client.name} sub={client.type + " client · " + client.terms + (client.contact !== "—" ? " · " + client.contact : "")}
        actions={<>
          <Btn variant="ghost" icon="chevron" onClick={() => go("people")}>Back</Btn>
          <Btn variant="ghost" icon="edit" onClick={() => setEditOpen(true)}>Edit client</Btn>
          <Btn variant="ghost" icon="mail" onClick={() => setStmtOpen(true)}>Email statement</Btn>
          <Btn variant="primary" icon="plus" onClick={() => go("invoice")}>New invoice</Btn>
        </>} />

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="invoice" size={18} /></span></div><div className={"kpi-val" + (outstanding > 0 ? "" : " pos")}>{fmt(outstanding)}</div><div className="kpi-label">Outstanding A/R</div><div className={"kpi-sub" + (openCount ? " warn" : "")}>{openCount} open invoice{openCount === 1 ? "" : "s"}</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="money" size={18} /></span></div><div className="kpi-val">{fmt(totalInvoiced)}</div><div className="kpi-label">Total invoiced</div><div className="kpi-sub">{invs.length} invoices</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="check" size={18} /></span></div><div className="kpi-val pos">{fmt(totalPaid)}</div><div className="kpi-label">Total paid</div><div className="kpi-sub">{pays.length} payments</div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-ico"><Icon name="receipt" size={18} /></span></div><div className="kpi-val">{D.TAX.modes[client.taxDefault] ? Math.round((D.TAX.modes[client.taxDefault].gst + D.TAX.modes[client.taxDefault].pst) * 100) + "%" : "—"}</div><div className="kpi-label">Default tax</div><div className="kpi-sub">{client.exempt ? "Tax-exempt" : D.TAX.modes[client.taxDefault].label}</div></div>
      </div>

      <div className="exp-grid">
        <Card title="Account details">
          <ul className="acct-meta">
            <li><span>Client type</span><strong><Badge tone={client.type === "Wholesale" ? "blue" : "slate"}>{client.type}</Badge></strong></li>
            <li><span>Contact</span><strong>{client.contact}</strong></li>
            <li><span>Phone</span><strong>{client.phone}</strong></li>
            {client.phone2 && <li><span>Secondary phone</span><strong>{client.phone2}</strong></li>}
            {client.addr && <li className="acct-addr"><span>Address</span><strong>{client.addr}</strong></li>}
            {client.taxNumber && <li><span>Tax number</span><strong className="mono">{client.taxNumber}</strong></li>}
            <li><span>Payment terms</span><strong>{client.terms}</strong></li>
            <li><span>Tax treatment</span><strong>{client.exempt ? "Exempt (No Tax)" : D.TAX.modes[client.taxDefault].label}</strong></li>
            <li className="acct-emails"><span>Email addresses</span><div>{client.emails.length ? client.emails.map((e) => <em key={e}>{e}{client.defaultEmail === e && <Badge tone="blue">default</Badge>}</em>) : <strong className="muted">None on file</strong>}</div></li>
            {client.notes && <li className="acct-notes"><span>Internal comments <Badge tone="amber">staff only</Badge></span><div className="acct-note-body">{client.notes}</div></li>}
          </ul>
        </Card>

        <Card title="Receivables summary">
          <ul className="acct-meta">
            <li><span>Current balance</span><strong className="mono">{fmt(outstanding)}</strong></li>
            <li><span>Open invoices</span><strong className="mono">{openCount}</strong></li>
            <li><span>Lifetime invoiced</span><strong className="mono">{fmt(totalInvoiced)}</strong></li>
            <li><span>Lifetime paid</span><strong className="mono">{fmt(totalPaid)}</strong></li>
            <li><span>Avg. invoice</span><strong className="mono">{fmt(invs.length ? totalInvoiced / invs.length : 0)}</strong></li>
          </ul>
        </Card>
      </div>

      <Card title={"Invoices (" + invs.length + ")"} pad={false}>
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Salesperson</th><th className="r">Total</th><th className="r">Balance</th><th>Status</th></tr></thead>
          <tbody>
            {invs.map((i) => (
              <tr key={i.no}>
                <td><button className="link mono strong" onClick={() => go("invoiceview/" + i.no)}>{i.no}</button></td>
                <td className="muted">{shortDate(i.date)}</td>
                <td className="muted">{shortDate(i.due)}</td>
                <td>{personName(i.sales)}</td>
                <td className="r mono">{fmt(i.total)}</td>
                <td className="r mono">{i.total - invNetPaid(i) > 0.005 ? fmt(i.total - invNetPaid(i)) : "—"}</td>
                <td><Badge tone={statusTone(invStatus(i))} dot>{invStatus(i)}</Badge></td>
              </tr>
            ))}
            {!invs.length && <tr><td colSpan="7"><Empty icon="invoice" text="No invoices yet for this client" /></td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title={"Payment history (" + pays.length + ")"} pad={false}>
        <table className="data-table compact">
          <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Posted to</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {pays.map((p) => (
              <tr key={p.id}>
                <td className="muted">{shortDate(p.date)}</td>
                <td><button className="link mono" onClick={() => go("invoiceview/" + p.inv)}>{p.inv}</button></td>
                <td className="muted">{p.method}</td>
                <td className="muted"><span className="jcode">{p.acct}</span> {p.acct === "1000" ? "Cash" : "Bank"}</td>
                <td className="r mono">{fmt(p.amount)}</td>
              </tr>
            ))}
            {!pays.length && <tr><td colSpan="5"><Empty icon="money" text="No payments recorded" /></td></tr>}
          </tbody>
        </table>
      </Card>
      <EmailLogCard filter={(m) => m.clientId === id} showDoc emptyText={"No emails sent to " + client.name + " yet"} />
      <DownloadLogCard filter={(d) => d.clientId === id} showDoc emptyText={"No downloads for " + client.name + " yet"} />
      {editOpen && <EditClientModal client={client} onClose={() => setEditOpen(false)}
        onSave={(patch) => { Object.assign(client, patch); setEditOpen(false); force((x) => x + 1); pushToast && pushToast(client.name + " updated"); }} />}
      {stmtOpen && <EmailStatementModal client={client} invoices={invs} onClose={() => setStmtOpen(false)} pushToast={pushToast} />}
    </div>
  );
}

function EditClientModal({ client, onClose, onSave }) {
  const [name, setName] = useState(client.name || "");
  const [type, setType] = useState(client.type || "Retail");
  const [contact, setContact] = useState(client.contact === "—" ? "" : (client.contact || ""));
  const [phone, setPhone] = useState(client.phone === "—" ? "" : (client.phone || ""));
  const [phone2, setPhone2] = useState(client.phone2 || "");
  const [addr, setAddr] = useState(client.addr || "");
  const [taxNumber, setTaxNumber] = useState(client.taxNumber || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [terms, setTerms] = useState(client.terms || "Due on receipt");
  const [exempt, setExempt] = useState(!!client.exempt);
  const [taxDefault, setTaxDefault] = useState(client.taxDefault || defaultTaxForType(client.type));
  const [taxTouched, setTaxTouched] = useState(false);
  const [emailsStr, setEmailsStr] = useState((client.emails || []).join(", "));
  const [defaultEmail, setDefaultEmail] = useState(client.defaultEmail || "");

  function changeType(v) {
    setType(v);
    if (!taxTouched) setTaxDefault(defaultTaxForType(v));
  }
  const emails = emailsStr.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const valid = name.trim().length > 0;
  function submit() {
    if (!valid) return;
    const def = emails.includes(defaultEmail) ? defaultEmail : (emails[0] || "");
    onSave({
      name: name.trim(), type,
      contact: contact.trim() || "—",
      phone: phone.trim() || "—",
      phone2: phone2.trim(),
      addr: addr.trim(),
      taxNumber: taxNumber.trim(),
      notes: notes.trim(),
      terms, exempt,
      taxDefault: exempt ? "none" : taxDefault,
      emails, defaultEmail: def,
    });
  }
  return (
    <Modal title={"Edit client — " + client.name} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={submit} disabled={!valid}>Save changes</Btn>
      </>}>
      <div className="add-client-grid">
        <Field label="Client / business name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => changeType(e.target.value)}>
            <option>Retail</option>
            <option>Wholesale</option>
          </select>
        </Field>
        <Field label="Contact name"><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Primary contact" /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(604) 555-0000" /></Field>
        <Field label="Secondary phone"><input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optional" /></Field>
        <Field label="Tax number" hint="Client's GST / PST / business number"><input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="e.g. 12345 6789 RT0001" /></Field>
        <Field label="Payment terms">
          <select value={terms} onChange={(e) => setTerms(e.target.value)}>
            {["Due on receipt", "Net 15", "Net 30", "Net 45", "Net 60"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Default tax" hint={exempt ? "Overridden — exempt client bills No Tax" : (type === "Wholesale" ? "Auto: GST only for wholesale" : "Auto: GST + PST for retail")}>
          <select value={taxDefault} disabled={exempt} onChange={(e) => { setTaxDefault(e.target.value); setTaxTouched(true); }}>
            {BCCWE.TAX.order.map((k) => <option key={k} value={k}>{BCCWE.TAX.modes[k].label}</option>)}
          </select>
        </Field>
        <Field label="Email addresses" hint="Separate multiple with commas — emails go to all listed" full>
          <input value={emailsStr} onChange={(e) => setEmailsStr(e.target.value)} placeholder="name@example.com, ap@example.com" />
        </Field>
        <Field label="Default email" hint="The address invoices go to by default">
          <select value={defaultEmail} onChange={(e) => setDefaultEmail(e.target.value)}>
            <option value="">— none —</option>
            {emails.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Address" full>
          <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Street, City, Province, Postal code" />
        </Field>
        <Field label="Internal comments" hint="Only visible to your team — never shown to the client" full>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes about this client, visible to staff only" />
        </Field>
      </div>
      <label className="ac-check">
        <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} />
        <span>Tax-exempt client (wholesale / export) — invoices default to “No Tax”.</span>
      </label>
    </Modal>
  );
}

function EmailStatementModal({ client, invoices, onClose, pushToast }) {
  const D = BCCWE;
  const emails = client.emails || [];
  const backup = D.prefs.ccEmail || "";
  // recipients: default the client's default email (or first on file)
  const initialTo = client.defaultEmail || emails[0] || "";
  const [recips, setRecips] = useState(() => new Set(initialTo ? [initialTo] : []));
  const [extra, setExtra] = useState("");
  const [profile, setProfile] = useState((D.smtpProfiles.find((x) => x.isDefault) || D.smtpProfiles[0]).id);

  // invoice selection: default to invoices with an open balance
  const [sel, setSel] = useState(() => {
    const s = new Set();
    invoices.forEach((i) => { if (i.total - invNetPaid(i) > 0.005) s.add(i.no); });
    if (!s.size) invoices.forEach((i) => s.add(i.no)); // fall back to all if nothing open
    return s;
  });

  function toggleRecip(e) { setRecips((p) => { const n = new Set(p); n.has(e) ? n.delete(e) : n.add(e); return n; }); }
  function toggleInv(no) { setSel((p) => { const n = new Set(p); n.has(no) ? n.delete(no) : n.add(no); return n; }); }
  const allSel = invoices.length > 0 && sel.size === invoices.length;
  function toggleAll() { setSel(allSel ? new Set() : new Set(invoices.map((i) => i.no))); }

  const extraClean = extra.trim();
  const recipients = [...recips, ...(extraClean ? [extraClean] : [])].filter(Boolean);
  const selInvoices = invoices.filter((i) => sel.has(i.no));
  const canSend = recipients.length > 0 && selInvoices.length > 0;

  function send() {
    if (!canSend) return;
    const prof = D.smtpProfiles.find((x) => x.id === profile) || D.smtpProfiles[0];
    const attachments = selInvoices.map((i) => i.no + ".pdf");
    window.sendEmail({
      kind: "statement", subject: "Account statement \u2014 " + client.name + " (" + selInvoices.length + " invoice" + (selInvoices.length === 1 ? "" : "s") + ")",
      docNo: "", clientId: client.id, profileId: prof.id,
      to: recipients, cc: backup ? [backup] : [], attachments,
    }, (status) => pushToast && pushToast("Statement to " + client.name + " \u2014 " + status + (status === "Delivered" ? " \u00b7 " + attachments.length + " invoice(s) attached" : " \u00b7 see Sent Mail")));
    pushToast && pushToast("Sending " + selInvoices.length + " invoice(s) to " + recipients.length + " recipient(s)\u2026");
    onClose();
  }

  return (
    <Modal title={"Email statement \u2014 " + client.name} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="send" disabled={!canSend} onClick={send}>Send ({selInvoices.length})</Btn>
      </>}>
      <div className="email-modal">
        <Field label="Send from profile">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {D.smtpProfiles.map((p) => <option key={p.id} value={p.id}>{p.fromName} — {p.from}</option>)}
          </select>
        </Field>

        <span className="field-label" style={{ marginTop: 6 }}>Send to</span>
        {emails.length ? emails.map((e) => (
          <label key={e} className="email-pick">
            <input type="checkbox" checked={recips.has(e)} onChange={() => toggleRecip(e)} />
            <span>{e}</span>
            {client.defaultEmail === e && <Badge tone="blue">default</Badge>}
          </label>
        )) : <p className="rail-note">No email on file for this client — add one below.</p>}
        <Field label="Add another recipient (accountant, owner…)">
          <input type="email" placeholder="name@example.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>

        <div className="stmt-pick-head">
          <span className="field-label">Invoices to attach</span>
          <button className="link" onClick={toggleAll}>{allSel ? "Clear all" : "Select all"}</button>
        </div>
        <div className="stmt-inv-list">
          <table className="data-table compact">
            <thead><tr><th className="stmt-ck"></th><th>Invoice</th><th>Date</th><th className="r">Total</th><th className="r">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const bal = i.total - invNetPaid(i);
                return (
                  <tr key={i.no} className={sel.has(i.no) ? "stmt-row-on" : ""} onClick={() => toggleInv(i.no)} style={{ cursor: "pointer" }}>
                    <td className="stmt-ck"><input type="checkbox" checked={sel.has(i.no)} onChange={() => toggleInv(i.no)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="mono strong">{i.no}</td>
                    <td className="muted">{shortDate(i.date)}</td>
                    <td className="r mono">{fmt(i.total)}</td>
                    <td className="r mono">{bal > 0.005 ? fmt(bal) : "—"}</td>
                    <td><Badge tone={statusTone(invStatus(i))} dot>{invStatus(i)}</Badge></td>
                  </tr>
                );
              })}
              {!invoices.length && <tr><td colSpan="6"><Empty icon="invoice" text="No invoices to send for this client" /></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="rail-note">{selInvoices.length} of {invoices.length} invoice{invoices.length === 1 ? "" : "s"} selected — a PDF of each will be attached.</p>

        {backup && (
          <div className="cc-row cc-fixed">
            <Icon name="check" size={15} />
            <div className="cc-meta"><strong>Always copied to {backup}</strong><span>System backup email — a copy of every email is kept here · change in Settings</span></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

Object.assign(window, { UnpaidInvoices, InvoiceDetail, ClientAccount });
