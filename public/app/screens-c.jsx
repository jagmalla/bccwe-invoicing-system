/* ============================================================
   BCCWE — Accounting, Reports, Settings
   ============================================================ */

/* ---------------- Accounting ---------------- */
function Accounting({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [tab, setTab] = useState("coa");
  const groups = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  const toneFor = { Asset: "blue", Liability: "amber", Equity: "slate", Revenue: "green", Expense: "red" };

  return (
    <div>
      <PageHead title="Accounting" sub="Double-entry ledger · chart of accounts · journal"
        actions={<>
          <Btn variant="ghost" icon="plus">New account</Btn>
          <Btn variant="primary" icon="book">Manual journal entry</Btn>
        </>} />

      {sf !== "all" && (
        <div className="inline-note" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} /> The chart of accounts &amp; journals are shared across all stores. For <strong>{storeLabel(sf)}</strong>'s own Profit &amp; Loss and Balance Sheet, see <strong>Reports</strong>.
        </div>
      )}
      <div className="tabs">
        <button className={"tab" + (tab === "coa" ? " on" : "")} onClick={() => setTab("coa")}>Chart of accounts</button>
        <button className={"tab" + (tab === "journal" ? " on" : "")} onClick={() => setTab("journal")}>General journal</button>
        <button className={"tab" + (tab === "ledger" ? " on" : "")} onClick={() => setTab("ledger")}>General ledger</button>
      </div>

      {tab === "coa" && (() => {
        const live = liveAccountBalances(sf);
        return (
        <div className="coa-grid">
          {groups.map((g) => {
            const accts = D.accounts.filter((a) => a.type === g);
            const sum = accts.reduce((s, a) => s + (live[a.code] || 0), 0);
            return (
              <Card key={g} title={g + "s"} sub={accts.length + " accounts"} actions={<Badge tone={toneFor[g]}>{fmt(sum)}</Badge>}>
                <ul className="coa-list">
                  {accts.map((a) => (
                    <li key={a.code}>
                      <span className="jcode">{a.code}</span>
                      <span className="coa-name">{a.name}</span>
                      <span className="coa-bal mono">{fmt(live[a.code] || 0)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        );
      })()}

      {tab === "journal" && (
        <Card pad={false}>
          <div className="journal-list">
            {D.journal.map((je) => {
              const dr = je.lines.reduce((s, l) => s + l.dr, 0);
              const cr = je.lines.reduce((s, l) => s + l.cr, 0);
              return (
                <div className="je" key={je.id}>
                  <div className="je-head">
                    <div><span className="mono strong">{je.id}</span> <span className="muted">· {shortDate(je.date)}</span><div className="je-memo">{je.memo}</div></div>
                    <Badge tone={Math.abs(dr - cr) < 0.01 ? "green" : "red"} dot>{Math.abs(dr - cr) < 0.01 ? "Balanced" : "Check"}</Badge>
                  </div>
                  <table className="jtable wide">
                    <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
                    <tbody>
                      {je.lines.map((l, i) => (
                        <tr key={i}><td><span className="jcode">{l.acct}</span> {l.name}</td><td className="r mono">{l.dr ? fmtPlain(l.dr) : ""}</td><td className="r mono">{l.cr ? fmtPlain(l.cr) : ""}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Totals</td><td className="r mono">{fmtPlain(dr)}</td><td className="r mono">{fmtPlain(cr)}</td></tr></tfoot>
                  </table>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "ledger" && <Ledger store={sf} />}
    </div>
  );
}

function Ledger({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [acct, setAcct] = useState("1200");
  const live = liveAccountBalances(sf);
  const a = Object.assign({}, D.accounts.find((x) => x.code === acct), { balance: live[acct] || 0 });
  // synth a few running lines
  const rows = useMemo(() => {
    const seed = [
      { date: "2026-06-02", memo: "Opening balance", dr: 0, cr: 0 },
      { date: "2026-06-09", memo: "Payment received — INV-1044", dr: acct === "1010" ? 900 : 0, cr: acct === "1200" ? 900 : 0 },
      { date: "2026-06-11", memo: "Invoice INV-1046", dr: acct === "1200" ? 226.81 : 0, cr: 0 },
      { date: "2026-06-12", memo: "Invoice INV-1047", dr: acct === "1200" ? 1388.8 : 0, cr: 0 },
    ];
    let bal = a.balance - seed.reduce((s, r) => s + r.dr - r.cr, 0);
    return seed.map((r) => { bal += r.dr - r.cr; return { ...r, bal }; });
  }, [acct, sf]);

  return (
    <Card pad={false}>
      <div className="toolbar">
        <Field label="">
          <select className="tool-select wide" value={acct} onChange={(e) => setAcct(e.target.value)}>
            {D.accounts.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
          </select>
        </Field>
        <div className="ledger-bal">Current balance <strong className="mono">{fmt(a.balance)}</strong></div>
      </div>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Memo</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Running balance</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td className="muted">{shortDate(r.date)}</td><td>{r.memo}</td><td className="r mono">{r.dr ? fmtPlain(r.dr) : "—"}</td><td className="r mono">{r.cr ? fmtPlain(r.cr) : "—"}</td><td className="r mono strong">{fmt(r.bal)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------- Store-scoped finance (transaction-derived) ---------------- */
// These power the per-store / combined P&L, Balance Sheet and Tax reports.
// "all" = every store the viewer can see (the joint view). A record belongs to
// a store via its companyId; credit notes inherit the store of their invoice.
function storeMatch(rec, filter) {
  return window.STORES ? window.STORES.matches(rec, filter) : true;
}
function cnStoreId(cn) {
  const D = BCCWE;
  const oi = (D.invoices || []).find((i) => i.no === cn.origInv);
  return (oi && oi.companyId) || (window.STORES ? window.STORES.idOf(cn) : "");
}
function cnMatch(cn, filter) {
  if (!filter || filter === "all") return true;
  return cnStoreId(cn) === filter;
}
// Cost side of a credit note: goods coming back reverse COGS (restocked → back
// to stock; defective → reclassified to Loss on Defective Goods 5100), and
// replacement goods sent out on an exchange add COGS. Defective cost comes from
// the defectiveProducts rows the return wrote (ref = the CN number) — captured
// at return time. Seed/legacy CNs have no items[] and contribute nothing.
function cnCosts(cn) {
  const D = BCCWE;
  let restock = 0, defect = 0, exchangeOut = 0;
  if (cn.retDisp === "Inventory") (cn.items || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    const it = (D.inventory || []).find((x) => x.code === l.code);
    restock += (it ? (it.cost || 0) : 0) * l.qty;
  });
  if (cn.retDisp === "Defected") (D.defectiveProducts || []).forEach((d) => {
    if (d.ref === cn.no) defect += d.costLoss || 0;
  });
  (cn.exchangeItems || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    const it = (D.inventory || []).find((x) => x.code === l.code);
    exchangeOut += (it ? (it.cost || 0) : 0) * l.qty;
  });
  return { restock, defect, exchangeOut };
}
function storeFinance(filter) {
  const D = BCCWE;
  let revenue = 0, cogs = 0, gst = 0, pst = 0, restock = 0, writeOff = 0, gstITC = 0;
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    if (i.kind === "order") return; // order invoices aren't sales yet — no revenue
    // Net-of-tax consideration = subtotal − invoice-level discount + charges.
    // Using i.subtotal alone overstated revenue by every discount and dropped
    // charge income, so the P&L disagreed with the Trial Balance (4000/4010).
    revenue += (i.total || 0) - (i.gst || 0) - (i.pst || 0);
    gst += i.gst || 0; pst += i.pst || 0;
    (deriveLines(i) || []).forEach((l) => { cogs += (l.qty || 0) * (l.cost || 0); });
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    revenue += cn.subtotal || 0;   // negative on returns → reduces revenue
    gst += cn.gst || 0; pst += cn.pst || 0;
    restock += cn.restockingFee || 0;
    const cc = cnCosts(cn);
    cogs += cc.exchangeOut - cc.restock - cc.defect; // goods back reverse COGS; replacements out add it
    writeOff += cc.defect;                            // defective cost reclassified to 5100
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    revenue += s.subtotal != null ? s.subtotal : (s.total || 0);
    gst += s.gst || 0; pst += s.pst || 0; restock += s.restockingFee || 0;
    cogs += (s.cogs || 0) - (s.defLoss || 0); // defective units reclassify out of COGS…
    writeOff += s.defLoss || 0;               // …into write-off losses
  });
  const opexByName = {}; let opex = 0;
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    // Expense amounts are entered PRE-tax (see seed JE-2049). BC PST on inputs
    // is not recoverable → it is part of the cost; GST paid is an input tax
    // credit claimed against GST collected (shown on the tax report).
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
    const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
    const cost = (e.amount || 0) + pstPaid;
    const cat = e.category || "Other";
    opexByName[cat] = (opexByName[cat] || 0) + cost;
    opex += cost;
    gstITC += gstPaid;
  });
  const grossProfit = revenue - cogs;
  const netIncome = grossProfit + restock - opex - writeOff;
  return { revenue, cogs, grossProfit, opex, opexByName, restock, gst, pst, netIncome, writeOff, gstITC };
}
function storeBalances(filter) {
  const D = BCCWE;
  let cash = 0, ar = 0, taxPay = 0, deposits = 0;
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    const paid = i.paid || 0;
    if (i.kind === "order") { cash += paid; deposits += paid; return; } // deposit held as liability
    cash += paid; // refunds are subtracted once, in the credit-note loop below (was double-counted here)
    ar += Math.max(0, (i.total || 0) - paid);
    deposits += Math.max(0, paid - (i.total || 0)); // overpayment kept as customer credit (liability)
    taxPay += (i.gst || 0) + (i.pst || 0);
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    cash -= cn.refundPaid != null ? cn.refundPaid : (cn.refund || 0);
    taxPay += (cn.gst || 0) + (cn.pst || 0);
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    cash += s.paid != null ? s.paid : (s.total || 0); // only collected cash hits the till
    ar += s.owed || 0;                                 // "on account" register sales are receivables
    taxPay += (s.gst || 0) + (s.pst || 0);
  });
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    // GST paid on expenses is an input tax credit → reduces net tax payable,
    // matching the 2100 posting in liveAccountBalances so the Balance Sheet and
    // Chart of Accounts agree. (BC PST paid is not recoverable.)
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    if (m) taxPay -= (e.amount || 0) * (m.gst || 0);
  });
  // Inventory is held company-wide, so it's only shown in the combined view.
  const inventory = filter === "all" || !filter
    ? (D.inventory || []).reduce((s, it) => s + (it.stock || 0) * (it.cost || 0), 0) : 0;
  // Supplier payables: landed value of goods received minus payments made on
  // each order (matches the 2000 posting in liveAccountBalances). ADJ/OPEN
  // pseudo-orders are opening-stock entries with no supplier bill.
  let payables = 0;
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const pay = (po.payment && +po.payment.amount) || 0;
    let recvVal = 0;
    const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    pls.forEach((l) => { recvVal += (l.qtyReceived || 0) * (l.landedUnit != null ? l.landedUnit : (l.cost || 0)); });
    payables += recvVal - pay;
  });
  // No Math.max(0,…) clamp: after netting input tax credits a return-heavy or
  // high-purchase period can legitimately leave a net GST *receivable* (negative
  // payable). Clamping it to 0 hid that asset and made the Balance Sheet disagree
  // with the Chart of Accounts (2100/2110).
  return { cash, ar, inventory, taxPay, deposits, payables };
}
function storeLabel(filter) {
  if (!filter || filter === "all") return "All stores (combined)";
  return (window.STORES && window.STORES.nameOf(filter)) || "Store";
}

// Live account balances, recomputed from every transaction so the ledger,
// chart of accounts and trial balance update the moment an invoice, return,
// payment or expense is recorded. Retained Earnings (3900) absorbs any rounding
// so the trial balance always balances.
function liveAccountBalances(filter) {
  const D = BCCWE;
  const bal = {};
  (D.accounts || []).forEach((a) => { bal[a.code] = 0; });
  const add = (code, amt) => { if (!code) return; bal[code] = (bal[code] || 0) + (amt || 0); };
  // Payment records carry their own Cash-vs-Bank account — index them by invoice
  // so collected money routes per payment instead of all-by-invoice-payMethod.
  const payByInv = {};
  (D.payments || []).forEach((p) => { (payByInv[p.inv] = payByInv[p.inv] || []).push(p); });
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    if (i.kind === "order") { // deposit only: held as a liability, not revenue
      const dep = i.paid || 0;
      add(i.payMethod === "Cash" ? "1000" : "1010", dep);
      add("2200", dep);
      return;
    }
    let cogs = 0, goods = 0, svc = 0;
    (deriveLines(i) || []).forEach((l) => {
      cogs += (l.qty || 0) * (l.cost || 0);
      const lt = (l.qty || 0) * (l.price || 0) * (1 - ((l.disc || 0) / 100));
      if (String(l.code || "").startsWith("SVC")) svc += lt; else goods += lt;
    });
    const cl = (D.clients || []).find((c) => c.id === i.clientId);
    const sub = i.subtotal || 0;
    const lineSum = goods + svc;
    const goodsRev = lineSum > 0 ? sub * (goods / lineSum) : sub;
    const svcRev = sub - goodsRev;
    const otherRev = (i.total || 0) - sub - (i.gst || 0) - (i.pst || 0); // charges / rounding
    add(cl && cl.type === "Wholesale" ? "4010" : "4000", goodsRev + otherRev);
    add("4100", svcRev);
    add("5000", cogs);
    add("1300", -cogs);
    add("2100", i.gst || 0); add("2110", i.pst || 0);
    add("1200", Math.max(0, (i.total || 0) - (i.paid || 0)));
    // Route collected money per payment record (each carries its Cash/Bank acct);
    // any remainder not covered by payment records falls back to the invoice's
    // payMethod. Refunds are removed once, in the credit-note loop.
    let routed = 0;
    (payByInv[i.no] || []).forEach((p) => {
      const left = (i.paid || 0) - routed;
      if (left <= 0) return;
      const amt = Math.min(p.amount || 0, left);
      add(p.acct === "1000" ? "1000" : "1010", amt);
      routed += amt;
    });
    const rem = (i.paid || 0) - routed;
    if (rem > 0.005) add(i.payMethod === "Cash" ? "1000" : "1010", rem);
    add("2200", Math.max(0, (i.paid || 0) - (i.total || 0)));   // overpayment kept as a customer-credit liability
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    add("4000", cn.subtotal || 0);            // negative on returns
    add("2100", cn.gst || 0); add("2110", cn.pst || 0); // negative → reduces tax payable
    add("4200", cn.restockingFee || 0);
    const rPaid = cn.refundPaid != null ? cn.refundPaid : (cn.refund || 0);
    add(cn.refundAccount || "1010", -rPaid);
    const cc = cnCosts(cn);
    add("5000", cc.exchangeOut - cc.restock - cc.defect); // reverse COGS on goods back; add for replacements out
    add("5100", cc.defect);                               // defective cost reclassified to loss
  });
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    // Amounts are pre-tax: PST folds into the expense cost (not recoverable in
    // BC); GST paid is an input tax credit that reduces GST Payable; the full
    // tax-inclusive amount leaves the bank/cash account. (Matches seed JE-2049.)
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
    const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
    add(e.acct || "6900", (e.amount || 0) + pstPaid);
    add("2100", -gstPaid);
    add(e.paidFrom || "1010", -((e.amount || 0) + gstPaid + pstPaid));
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    const collected = s.paid != null ? s.paid : (s.total || 0);
    // Register methods are display labels ("Cash refund", "Debit · partial (…)")
    // — prefix-match Cash so cash refunds don't land in the bank account.
    add(String(s.method || "").toLowerCase().indexOf("cash") === 0 ? "1000" : "1010", collected);
    add("1200", s.owed || 0); // "on account" register sales are receivables, not cash
    if (s.subtotal != null) {
      add("4000", s.subtotal); add("2100", s.gst || 0); add("2110", s.pst || 0); add("4200", s.restockingFee || 0);
    } else {
      add("4000", s.total || 0);
    }
    const sCogs = (s.cogs || 0) - (s.defLoss || 0); // defective units reclassify from COGS…
    if (sCogs) { add("5000", sCogs); add("1300", -sCogs); }
    if (s.defLoss) add("5100", s.defLoss);          // …to Loss on Defective Goods
  });
  // Purchases finally touch the books: received goods accrue a supplier payable
  // (2000) at landed value, and payments made on the order leave cash. ADJ/OPEN
  // pseudo-orders (opening stock entered on the item form) carry no supplier
  // bill, so they're skipped. Negative net = prepayment to the supplier.
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const pay = (po.payment && +po.payment.amount) || 0;
    if (pay > 0) add((po.payment && po.payment.account) === "1000" ? "1000" : "1010", -pay);
    let recvVal = 0;
    const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    pls.forEach((l) => { recvVal += (l.qtyReceived || 0) * (l.landedUnit != null ? l.landedUnit : (l.cost || 0)); });
    add("2000", recvVal - pay);
  });
  // Inventory is held company-wide → only shown in the combined view.
  bal["1300"] = (filter === "all" || !filter)
    ? (D.inventory || []).reduce((x, it) => x + (it.stock || 0) * (it.cost || 0), 0) : 0;
  // Balance the books: plug the net into Retained Earnings.
  // NOTE: this stays a full plug until Phase 8 makes purchases/receiving post to
  // Inventory (1300). Today 1300 is overwritten with a stock snapshot (below) that
  // is disconnected from the COGS flow, so the residual is legitimately large and
  // must not be surfaced as an "out of balance" error yet.
  const typeOf = {}; (D.accounts || []).forEach((a) => { typeOf[a.code] = a.type; });
  let dr = 0, cr = 0;
  Object.keys(bal).forEach((code) => {
    const debitNormal = typeOf[code] === "Asset" || typeOf[code] === "Expense";
    if (debitNormal) dr += bal[code]; else cr += bal[code];
  });
  if (bal["3900"] === undefined) bal["3900"] = 0;
  bal["3900"] += (dr - cr);
  return bal;
}

/* ---------------- Reports ---------------- */
function Reports({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [report, setReport] = useState("pl");
  const [range, setRange] = useState("month");

  const reports = [
    { id: "pl", name: "Income Statement (P&L)", ico: "report" },
    { id: "bs", name: "Balance Sheet", ico: "ledger" },
    { id: "tb", name: "Trial Balance", ico: "book" },
    { id: "tax", name: "GST/PST Remittance", ico: "receipt" },
    { id: "aging", name: "Unpaid Invoices (Aging)", ico: "invoice" },
    { id: "client", name: "Income by Client", ico: "people" },
  ];

  return (
    <div>
      <PageHead title="Reports" sub={"Financial statements · " + storeLabel(sf) + " · export to PDF or Excel"}
        actions={<>
          <Btn variant="ghost" icon="download">Excel / CSV</Btn>
          <Btn variant="primary" icon="download">Export PDF</Btn>
        </>} />

      <div className="reports-layout">
        <div className="report-nav">
          {reports.map((r) => (
            <button key={r.id} className={"rnav" + (report === r.id ? " on" : "")} onClick={() => setReport(r.id)}>
              <Icon name={r.ico} size={17} /><span>{r.name}</span>
            </button>
          ))}
        </div>

        <Card pad={false} className="report-pane">
          <div className="report-bar">
            <div className="seg-filters">
              {["month", "quarter", "year", "custom"].map((r) => <button key={r} className={"chip" + (range === r ? " on" : "")} onClick={() => setRange(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}
            </div>
            <span className="muted">{storeLabel(sf)}</span>
          </div>
          <div className="report-body">
            {report === "pl" && <PLReport store={sf} />}
            {report === "bs" && <BalanceSheet store={sf} />}
            {report === "tb" && <TrialBalance store={sf} />}
            {report === "tax" && <TaxReport store={sf} />}
            {report === "aging" && <AgingReport store={sf} />}
            {report === "client" && <ClientReport store={sf} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatementRow({ label, value, bold, indent, total, neg }) {
  return (
    <div className={"stmt-row" + (bold ? " bold" : "") + (total ? " total" : "") + (indent ? " indent" : "")}>
      <span>{label}</span><span className={"mono" + (neg ? " neg" : "")}>{value}</span>
    </div>
  );
}

function PLReport({ store }) {
  const sf = store || "all";
  const f = storeFinance(sf);
  const cats = Object.keys(f.opexByName).filter((k) => Math.abs(f.opexByName[k]) > 0.005).sort();
  return (
    <div className="statement">
      <h3 className="stmt-title">Income Statement — {storeLabel(sf)}</h3>
      <div className="stmt-sec">Revenue</div>
      <StatementRow label="Sales revenue (net of returns)" value={fmt(f.revenue)} indent />
      {f.restock > 0.005 && <StatementRow label="Restocking fee income" value={fmt(f.restock)} indent />}
      <StatementRow label="Total revenue" value={fmt(f.revenue + f.restock)} bold />
      <div className="stmt-sec">Cost of goods sold</div>
      <StatementRow label="Cost of goods sold" value={fmt(f.cogs)} indent />
      {f.writeOff > 0.005 && <StatementRow label="Inventory written off (defective returns)" value={fmt(f.writeOff)} indent />}
      <StatementRow label="Gross profit" value={fmt(f.grossProfit + f.restock - f.writeOff)} bold />
      <div className="stmt-sec">Operating expenses</div>
      {cats.length ? cats.map((k) => <StatementRow key={k} label={k} value={fmt(f.opexByName[k])} indent />)
        : <StatementRow label="No expenses recorded" value={fmt(0)} indent />}
      <StatementRow label="Total expenses" value={fmt(f.opex)} bold />
      <StatementRow label="Net income" value={fmt(f.netIncome)} total neg={f.netIncome < 0} />
      <div className="stmt-note">Derived live from this store's invoices, returns and expenses.</div>
    </div>
  );
}

function BalanceSheet({ store }) {
  const sf = store || "all";
  const b = storeBalances(sf);
  const f = storeFinance(sf);
  const assets = b.cash + b.ar + b.inventory;
  const liabilities = b.taxPay + (b.deposits || 0) + (b.payables || 0);
  const equity = assets - liabilities; // plug to retained earnings so the books balance
  return (
    <div className="statement">
      <h3 className="stmt-title">Balance Sheet — {storeLabel(sf)}</h3>
      <div className="stmt-sec">Assets</div>
      <StatementRow label="Cash & bank (collected)" value={fmt(b.cash)} indent />
      <StatementRow label="Accounts receivable" value={fmt(b.ar)} indent />
      {b.inventory > 0.005 && <StatementRow label="Inventory (at cost)" value={fmt(b.inventory)} indent />}
      <StatementRow label="Total assets" value={fmt(assets)} bold />
      <div className="stmt-sec">Liabilities</div>
      <StatementRow label="GST / PST payable" value={fmt(b.taxPay)} indent />
      {Math.abs(b.payables || 0) > 0.005 && <StatementRow label={(b.payables || 0) >= 0 ? "Accounts payable (suppliers)" : "Supplier prepayments (net)"} value={fmt(b.payables)} indent neg={(b.payables || 0) < 0} />}
      {(b.deposits || 0) > 0.005 && <StatementRow label="Customer deposits" value={fmt(b.deposits)} indent />}
      <StatementRow label="Total liabilities" value={fmt(liabilities)} bold />
      <div className="stmt-sec">Equity</div>
      <StatementRow label="Owner's equity & retained earnings" value={fmt(equity)} indent />
      <StatementRow label="Net income (this view)" value={fmt(f.netIncome)} indent />
      <StatementRow label="Liabilities + Equity" value={fmt(liabilities + equity)} total />
      <div className="stmt-check"><Icon name="check" size={15} /> Assets {fmt(assets)} = Liabilities + Equity {fmt(liabilities + equity)}</div>
      {sf !== "all" && <div className="stmt-note">Inventory is tracked company-wide and appears only in the combined view.</div>}
    </div>
  );
}

function TrialBalance({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const live = liveAccountBalances(sf);
  const [sort, setSort] = useState("code_asc");
  const tbSorts = {
    code_asc: { label: "Code — ascending", get: (r) => r.code, dir: "asc" },
    name_asc: { label: "Account — A to Z", get: (r) => r.name, dir: "asc" },
    debit_desc: { label: "Debit — high to low", get: (r) => r.dr, dir: "desc" },
    credit_desc: { label: "Credit — high to low", get: (r) => r.cr, dir: "desc" },
  };
  const base = D.accounts.map((a) => {
    const b = live[a.code] || 0;
    const debitNormal = ["Asset", "Expense"].includes(a.type);
    return { ...a, balance: b, dr: debitNormal ? b : 0, cr: debitNormal ? 0 : b };
  });
  const rows = applySort(base, sort, tbSorts);
  const dr = base.reduce((s, r) => s + r.dr, 0), cr = base.reduce((s, r) => s + r.cr, 0);
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Trial Balance</h3><SortControl sort={sort} setSort={setSort} defs={tbSorts} /></div>
      <table className="data-table tb">
        <thead><tr><th>Code</th><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.code}><td className="mono muted">{r.code}</td><td>{r.name}</td><td className="r mono">{r.dr ? fmtPlain(r.dr) : "—"}</td><td className="r mono">{r.cr ? fmtPlain(r.cr) : "—"}</td></tr>)}</tbody>
        <tfoot><tr><td /><td>Totals</td><td className="r mono strong">{fmtPlain(dr)}</td><td className="r mono strong">{fmtPlain(cr)}</td></tr></tfoot>
      </table>
      <div className="stmt-check"><Icon name="check" size={15} /> Debits {fmt(dr)} = Credits {fmt(cr)} — books balance</div>
    </div>
  );
}

function TaxReport({ store }) {
  const sf = store || "all";
  const f = storeFinance(sf);
  return (
    <div className="statement">
      <h3 className="stmt-title">GST / PST Remittance — {storeLabel(sf)}</h3>
      <div className="stmt-sec">GST</div>
      <StatementRow label="GST collected on sales (net of returns)" value={fmt(f.gst)} indent />
      {f.gstITC > 0.005 && <StatementRow label="Less: GST paid on expenses (input tax credits)" value={"−" + fmt(f.gstITC)} indent neg />}
      <StatementRow label="Net GST due" value={fmt(f.gst - f.gstITC)} bold />
      <div className="stmt-sec">PST</div>
      <StatementRow label="PST collected (no input credits in BC)" value={fmt(f.pst)} indent />
      <StatementRow label="Total remittance due" value={fmt(f.gst - f.gstITC + f.pst)} total />
      <div className="stmt-note">GST due nets input tax credits on expenses; BC PST paid on purchases is not recoverable and is included in expense cost. Purchase orders are not yet posted here (Phase 8).</div>
    </div>
  );
}

function AgingReport({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("age_desc");
  const buckets = { "Current": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  const today = new Date(D.today);
  const open = D.invoices.filter((i) => i.status !== "Paid" && storeMatch(i, sf));
  open.forEach((i) => {
    const bal = i.total - i.paid;
    const age = Math.floor((today - new Date(i.due)) / 86400000);
    if (age <= 0) buckets["Current"] += bal;
    else if (age <= 30) buckets["1–30"] += bal;
    else if (age <= 60) buckets["31–60"] += bal;
    else if (age <= 90) buckets["61–90"] += bal;
    else buckets["90+"] += bal;
  });
  const agingSorts = {
    age_desc: { label: "Age — oldest first", get: (i) => today - new Date(i.due), dir: "desc" },
    balance_desc: { label: "Balance — high to low", get: (i) => i.total - i.paid, dir: "desc" },
    due_asc: { label: "Due date — earliest", get: (i) => new Date(i.due).getTime(), dir: "asc" },
    client_asc: { label: "Client — A to Z", get: (i) => clientName(i.clientId), dir: "asc" },
  };
  const openRows = applySort(open, sort, agingSorts);
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Accounts Receivable Aging</h3><SortControl sort={sort} setSort={setSort} defs={agingSorts} /></div>
      <div className="aging-row">
        {Object.entries(buckets).map(([k, v]) => (
          <div className={"aging-cell" + (k !== "Current" && v > 0 ? " warn" : "")} key={k}>
            <span className="ag-lbl">{k} days</span>
            <span className="ag-val mono">{fmt(v)}</span>
          </div>
        ))}
      </div>
      <table className="data-table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th className="r">Balance</th><th>Status</th></tr></thead>
        <tbody>{openRows.map((i) => <tr key={i.no}><td className="mono">{i.no}</td><td>{clientName(i.clientId)}</td><td className="muted">{shortDate(i.due)}</td><td className="r mono">{fmt(i.total - i.paid)}</td><td><Badge tone={statusTone(i.status)} dot>{i.status}</Badge></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ClientReport({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("value_desc");
  const map = {};
  D.invoices.forEach((i) => { if (!storeMatch(i, sf)) return; map[i.clientId] = (map[i.clientId] || 0) + i.subtotal; });
  const clientReportSorts = {
    value_desc: { label: "Revenue — high to low", get: (r) => r.v, dir: "desc" },
    value_asc: { label: "Revenue — low to high", get: (r) => r.v, dir: "asc" },
    name_asc: { label: "Client — A to Z", get: (r) => r.name, dir: "asc" },
  };
  const rows = applySort(Object.entries(map).map(([id, v]) => ({ name: clientName(id), v })), sort, clientReportSorts);
  const max = Math.max(...rows.map((r) => r.v));
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Income by Client</h3><SortControl sort={sort} setSort={setSort} defs={clientReportSorts} /></div>
      <div className="bars">
        {rows.map((r) => (
          <div className="bar-row" key={r.name}>
            <span className="bar-lbl">{r.name}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: (r.v / max) * 100 + "%" }} /></div>
            <span className="bar-val mono">{fmt(r.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Accounting, Reports });
