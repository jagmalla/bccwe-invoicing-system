/* ============================================================
   BCCWE — Invoice Generator (fully working)
   ============================================================ */
function InvoiceGenerator({ onSaved, pushToast }) {
  const D = BCCWE;
  const catalog = useMemo(() => {
    const inv = D.inventory.map((i) => ({ code: i.code, name: i.name, price: i.price, cost: i.cost, kind: "good" }));
    const svc = D.services.map((s) => ({ code: s.code, name: s.name, price: s.price, cost: 0, kind: "service" }));
    return [...inv, ...svc];
  }, []);

  const [invNo, setInvNo] = useState("INV-" + D.nextInvoiceNo);
  const [date, setDate] = useState(D.today);
  const [due, setDue] = useState(() => {
    const d = new Date(D.today + "T00:00:00"); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [clientId, setClientId] = useState("");
  const [salesId, setSalesId] = useState("u_priya");
  const [taxMode, setTaxMode] = useState("both");
  const [notes, setNotes] = useState("Thank you for your business. Repairs carry a 90-day workmanship warranty.");
  const [lines, setLines] = useState([
    { id: 1, code: "", desc: "", qty: 1, price: 0, cost: 0, disc: 0 },
  ]);
  const [payAmt, setPayAmt] = useState(0);
  const [payMethod, setPayMethod] = useState("E-Transfer");
  const [showPreview, setShowPreview] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientName, setAddClientName] = useState("");
  const [overpayMode, setOverpayMode] = useState("refund");
  const [priceSuggest, setPriceSuggest] = useState(false);
  const [pricePrompt, setPricePrompt] = useState(null);
  const [, bump] = useState(0);
  const force = () => bump((x) => x + 1);
  const [discMode, setDiscMode] = useState("amount");
  const [discVal, setDiscVal] = useState(0);
  const [discTiming, setDiscTiming] = useState("before");

  const client = D.clients.find((c) => c.id === clientId);
  const uid = useRef(2);

  function setClient(id) {
    setClientId(id);
    setPricePrompt(null);
    const c = D.clients.find((x) => x.id === id);
    if (c) setTaxMode(c.exempt ? "none" : c.taxDefault || "both");
  }

  // customer-specific default prices, keyed by client + item code
  const cpKey = (id, code) => id + "|" + code;
  const getDefaultPrice = (code) => (clientId && code ? D.clientPrices[cpKey(clientId, code)] : null) || null;
  function setDefaultPrice(code, price, disc) {
    if (!clientId || !code) return;
    D.clientPrices[cpKey(clientId, code)] = { price: +(+price).toFixed(2), disc: +(disc || 0), date: D.today };
    setPricePrompt(null);
    force();
    pushToast && pushToast("Default price for " + code + " set to " + fmt(+(+price).toFixed(2)) + " for " + clientName(clientId));
  }
  function clearDefaultPrice(code) {
    if (!clientId || !code) return;
    delete D.clientPrices[cpKey(clientId, code)];
    force();
    pushToast && pushToast("Default price for " + code + " cleared for " + clientName(clientId));
  }
  function maybePromptDefault(l) {
    if (!clientId || !l.code) { setPricePrompt(null); return; }
    const cur = { price: +(+l.price).toFixed(2), disc: +(l.disc || 0) };
    const def = getDefaultPrice(l.code);
    if (def && Math.abs(def.price - cur.price) < 0.005 && (def.disc || 0) === cur.disc) { setPricePrompt(null); return; }
    const cat = catalog.find((c) => c.code === l.code);
    if (!def && cat && Math.abs(cat.price - cur.price) < 0.005 && cur.disc === 0) { setPricePrompt(null); return; }
    setPricePrompt({ lineId: l.id, code: l.code, desc: l.desc, price: cur.price, disc: cur.disc });
  }

  function updateLine(id, patch) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function pickItem(id, name) {
    const hit = catalog.find((c) => c.name === name);
    if (hit) {
      const def = clientId ? D.clientPrices[cpKey(clientId, hit.code)] : null;
      updateLine(id, { desc: hit.name, code: hit.code, price: def ? def.price : hit.price, cost: hit.cost, disc: def ? (def.disc || 0) : 0 });
    } else updateLine(id, { desc: name });
  }
  function addLine() {
    setLines((ls) => [...ls, { id: uid.current++, code: "", desc: "", qty: 1, price: 0, cost: 0, disc: 0 }]);
  }
  function removeLine(id) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  }

  const lineTotal = (l) => l.qty * l.price * (1 - (l.disc || 0) / 100);

  const calc = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
    const gross = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const discount = gross - subtotal;
    const m = D.TAX.modes[taxMode];
    const taxRate = m.gst + m.pst;
    const before = discTiming === "before";
    const baseForDisc = before ? subtotal : subtotal * (1 + taxRate);
    let invDisc = discMode === "percent"
      ? baseForDisc * (Number(discVal) || 0) / 100
      : (Number(discVal) || 0);
    invDisc = Math.max(0, Math.min(invDisc, baseForDisc));
    const taxable = before ? Math.max(0, subtotal - invDisc) : subtotal;
    const gst = taxable * m.gst;
    const pst = taxable * m.pst;
    let total = taxable + gst + pst;
    if (!before) total = Math.max(0, total - invDisc);
    const cogs = lines.reduce((s, l) => s + l.qty * (l.cost || 0), 0);
    return { subtotal, gross, discount, invDisc, before, gst, pst, total, cogs };
  }, [lines, taxMode, discMode, discVal, discTiming]);

  const rawBalance = calc.total - (Number(payAmt) || 0);
  const balance = Math.max(0, rawBalance);
  const overpaid = rawBalance < -0.005 ? -rawBalance : 0;
  const refund = overpaid > 0 && overpayMode === "refund" ? overpaid : 0;
  const credit = overpaid > 0 && overpayMode === "credit" ? overpaid : 0;
  const status = (Number(payAmt) || 0) <= 0 ? "Unpaid"
    : rawBalance > 0.005 ? "Partially Paid"
    : overpaid > 0 ? (overpayMode === "refund" ? "Paid" : "Overpaid") : "Paid";

  const revAcct = client && client.type === "Wholesale" ? "4010" : "4000";
  const revName = client && client.type === "Wholesale" ? "Sales Revenue — Wholesale" : "Sales Revenue — Retail";
  const goodsRev = lines.filter((l) => !l.code.startsWith("SVC")).reduce((s, l) => s + lineTotal(l), 0);
  const svcRev = calc.subtotal - goodsRev;

  const journal = useMemo(() => {
    const J = [];
    J.push({ acct: "1200", name: "Accounts Receivable", dr: calc.total, cr: 0 });
    if (calc.cogs > 0) J.push({ acct: "5000", name: "Cost of Goods Sold", dr: calc.cogs, cr: 0 });
    if (goodsRev > 0) J.push({ acct: revAcct, name: revName, dr: 0, cr: goodsRev });
    if (svcRev > 0.005) J.push({ acct: "4100", name: "Service & Repair Revenue", dr: 0, cr: svcRev });
    if (calc.invDisc > 0.005) J.push({ acct: "4900", name: "Sales Discounts", dr: calc.invDisc, cr: 0 });
    taxPostings(D.TAX.modes[taxMode], calc.gst, calc.pst).forEach((c) => J.push({ acct: c.acct, name: c.acctName, dr: 0, cr: c.amount }));
    if (calc.cogs > 0) J.push({ acct: "1300", name: "Inventory", dr: 0, cr: calc.cogs });
    return J;
  }, [calc, revAcct, goodsRev, svcRev]);

  const jDr = journal.reduce((s, j) => s + j.dr, 0);
  const jCr = journal.reduce((s, j) => s + j.cr, 0);
  const balanced = Math.abs(jDr - jCr) < 0.01;
  // last purchases of an item by the current client (for price suggestions)
  const priceHist = (code) => D.itemSales
    .filter((s) => s.clientId === clientId && s.code === code)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  function save() {
    const rec = {
      no: invNo, clientId, date, due, sales: salesId, tax: taxMode,
      subtotal: calc.subtotal, gst: calc.gst, pst: calc.pst, total: calc.total,
      paid: Number(payAmt) || 0, refunded: refund, status, notes, payMethod,
      lines: lines.map((l) => ({ desc: l.desc, code: l.code, qty: l.qty, price: l.price, disc: l.disc, cost: l.cost })),
    };
    D.invoices.unshift(rec);
    D.nextInvoiceNo += 1;
    pushToast(invNo + " saved · journal posted (" + fmt(calc.total) + ")");
    onSaved && onSaved();
  }

  const dataList = (
    <datalist id="catalog">
      {catalog.map((c) => <option key={c.code} value={c.name} />)}
    </datalist>
  );

  return (
    <div className="invgen">
      {dataList}
      <PageHead title="Invoice Generator"
        sub="Create an invoice — line items pull from inventory, totals and journal entries post live."
        actions={<>
          <Btn variant="ghost" icon="mail" onClick={() => setShowEmail(true)}>Email</Btn>
          <Btn variant="ghost" icon="download" onClick={() => setShowPreview(true)}>Preview / PDF</Btn>
          <Btn variant="primary" icon="check" onClick={save} disabled={!clientId || !balanced || calc.total <= 0}>Save invoice</Btn>
        </>} />

      <div className="invgen-grid">
        {/* LEFT — builder */}
        <div className="invgen-main">
          <Card title="Invoice details" className="invoice-meta-card">
            <div className="meta-grid">
              <div className="field">
                <span className="field-label">Bill to<em>*</em></span>
                <ClientPicker clients={D.clients} value={clientId}
                  onChange={setClient} onAddNew={(name) => { setAddClientName(name || ""); setShowAddClient(true); }} />
              </div>
              <Field label="Salesperson">
                <select value={salesId} onChange={(e) => setSalesId(e.target.value)}>
                  {D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Invoice #" hint="Auto-allocated — override allowed">
                <input value={invNo} onChange={(e) => setInvNo(e.target.value)} />
              </Field>
              <Field label="Invoice date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="Terms">
                <input value={client ? client.terms : ""} readOnly className="ro" />
              </Field>
            </div>
            {client && client.exempt && (
              <div className="inline-note"><Icon name="alert" size={15} /> This client is flagged <strong>tax-exempt</strong> — tax mode pre-set to “No Tax”. Override per line below if needed.</div>
            )}
          </Card>

          <Card title="Line items" pad={false}
            actions={
              <button type="button"
                className={"price-sugg-toggle" + (priceSuggest ? " on" : "")}
                aria-pressed={priceSuggest}
                onClick={() => setPriceSuggest((v) => !v)}
                title="Team only — recent purchase prices for this client. Never shown to the customer, on the PDF, or in email.">
                <Icon name="history" size={14} />
                {priceSuggest ? "Price suggestions on" : "Price suggestions"}
              </button>
            }>
            <div className="lines">
              <div className="lines-head">
                <span>Item / description</span>
                <span className="r">Qty</span>
                <span className="r">Unit price</span>
                <span className="r">Disc %</span>
                <span className="r">Amount</span>
                <span />
              </div>
              {lines.map((l) => {
                const recent = l.code ? priceHist(l.code) : null;
                const def = l.code ? getDefaultPrice(l.code) : null;
                const prompt = pricePrompt && pricePrompt.lineId === l.id ? pricePrompt : null;
                return (
                <React.Fragment key={l.id}>
                <div className="line-row">
                  <div className="line-desc">
                    <input list="catalog" value={l.desc} placeholder="Type to search inventory or describe…"
                      onChange={(e) => pickItem(l.id, e.target.value)} />
                    {l.code && <span className="line-code">{l.code}{def && <><em className="line-deftag" title={"Custom price set for " + clientName(clientId)}>· custom price</em>{(() => { const cat = catalog.find((c) => c.code === l.code); return cat ? <em className="line-systag" title="System list price — applied to new customers">Default {fmt(cat.price)}</em> : null; })()}</>}</span>}
                  </div>
                  <input className="r" type="number" min="0" value={l.qty}
                    onChange={(e) => updateLine(l.id, { qty: Math.max(0, +e.target.value) })} />
                  <input className="r" type="number" min="0" step="0.01" value={l.price}
                    onChange={(e) => updateLine(l.id, { price: Math.max(0, +e.target.value) })}
                    onBlur={() => maybePromptDefault(l)} />
                  <input className="r" type="number" min="0" max="100" value={l.disc}
                    onChange={(e) => updateLine(l.id, { disc: Math.min(100, Math.max(0, +e.target.value)) })}
                    onBlur={() => maybePromptDefault(l)} />
                  <span className="r line-amt">{fmt(lineTotal(l))}</span>
                  <button className="icon-btn line-del" onClick={() => removeLine(l.id)} title="Remove"><Icon name="trash" size={15} /></button>
                </div>
                {prompt && (
                  <div className="price-default-prompt">
                    <Icon name="alert" size={14} />
                    <span>Set <strong>{fmt(prompt.price)}{prompt.disc > 0 ? " · " + prompt.disc + "% off" : ""}</strong> as the default price for <strong>{prompt.desc || prompt.code}</strong> for <strong>{clientName(clientId)}</strong>?</span>
                    <button className="pdp-set" onClick={() => setDefaultPrice(prompt.code, prompt.price, prompt.disc)}>Set default</button>
                    <button className="pdp-dismiss" onClick={() => setPricePrompt(null)}>Not now</button>
                  </div>
                )}
                {priceSuggest && recent && (
                  <div className="ret-hist ig-hist">
                    <div className="ret-hist-head"><Icon name="history" size={12} /> {clientName(clientId)}{def ? " — custom default + recent purchases" : (recent.length ? " — last " + recent.length + " purchase" + (recent.length === 1 ? "" : "s") : "")}</div>
                    {(def || recent.length) ? (
                      <ul className="ret-hist-list">
                        {def && (() => {
                          const net = def.price * (1 - (def.disc || 0) / 100);
                          return (
                            <li className="rh-default">
                              <span className="rh-date"><span className="rh-deftag">Default</span></span>
                              <span className="rh-qty" />
                              <span className="rh-price mono">{fmt(net)}<em>/ea</em></span>
                              {def.disc > 0
                                ? <span className="rh-disc">{def.disc}% off <s className="mono">{fmt(def.price)}</s></span>
                                : <span className="rh-disc muted">no discount</span>}
                              <button className="rh-use" title="Apply this client's default price" onClick={() => updateLine(l.id, { price: +def.price.toFixed(2), disc: def.disc || 0 })}>Use price</button>
                              <button className="rh-clear" title="Remove the custom default price" onClick={() => clearDefaultPrice(l.code)}>Clear</button>
                            </li>
                          );
                        })()}
                        {recent.slice(0, def ? 2 : 3).map((h, i) => {
                          const net = h.price * (1 - (h.disc || 0) / 100);
                          return (
                            <li key={i}>
                              <span className="rh-date muted">{shortDate(h.date)}</span>
                              <span className="rh-qty">×{h.qty}</span>
                              <span className="rh-price mono">{fmt(net)}<em>/ea</em></span>
                              {h.disc > 0
                                ? <span className="rh-disc">{h.disc}% off <s className="mono">{fmt(h.price)}</s></span>
                                : <span className="rh-disc muted">no discount</span>}
                              <button className="rh-use" title="Charge this price again" onClick={() => updateLine(l.id, { price: +net.toFixed(2), disc: 0 })}>Use price</button>
                              <button className="rh-setdef" title="Set this as the default price for this client" onClick={() => setDefaultPrice(l.code, +net.toFixed(2), 0)}>Set default</button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <div className="ret-hist-empty">No prior purchases of this item by this client on record.</div>}
                  </div>
                )}
                </React.Fragment>
                );
              })}
              <button className="line-add" onClick={addLine}><Icon name="plus" size={14} /> Add line</button>
            </div>
          </Card>

          <Card title="Invoice discount" sub="Apply an order-level discount on top of any per-line discounts.">
            <div className="disc-grid">
              <div className="field">
                <span className="field-label">Discount type</span>
                <div className="miniseg">
                  <button type="button" className={"miniseg-btn" + (discMode === "amount" ? " on" : "")} onClick={() => setDiscMode("amount")}>Amount ($)</button>
                  <button type="button" className={"miniseg-btn" + (discMode === "percent" ? " on" : "")} onClick={() => setDiscMode("percent")}>Percentage (%)</button>
                </div>
              </div>
              <Field label={discMode === "percent" ? "Discount percentage" : "Discount amount"}>
                {discMode === "percent" ? (
                  <div className="input-suffix">
                    <input type="number" min="0" max="100" step="0.1" value={discVal}
                      onChange={(e) => setDiscVal(Math.min(100, Math.max(0, +e.target.value)))} />
                    <span>%</span>
                  </div>
                ) : (
                  <div className="input-prefix">
                    <span>$</span>
                    <input type="number" min="0" step="0.01" value={discVal}
                      onChange={(e) => setDiscVal(Math.max(0, +e.target.value))} />
                  </div>
                )}
              </Field>
              <div className="field">
                <span className="field-label">Apply discount</span>
                <div className="miniseg">
                  <button type="button" className={"miniseg-btn" + (discTiming === "before" ? " on" : "")} onClick={() => setDiscTiming("before")}>Before tax</button>
                  <button type="button" className={"miniseg-btn" + (discTiming === "after" ? " on" : "")} onClick={() => setDiscTiming("after")}>After tax</button>
                </div>
              </div>
            </div>
            {calc.invDisc > 0.005 && (
              <div className="disc-readout">
                <span><strong>−{fmt(calc.invDisc)}</strong> discount</span>
                <span className="disc-dot" />
                <span>{calc.before
                  ? "Applied to subtotal · tax charged on " + fmt(Math.max(0, calc.subtotal - calc.invDisc))
                  : "Tax charged on " + fmt(calc.subtotal) + " · discount taken off the tax-inclusive total"}</span>
              </div>
            )}
          </Card>

          <div className="invgen-2col">
            <Card title="Tax treatment" sub="Choose one mode for this transaction (BC).">
              <div className="taxseg">
                {D.TAX.order.map((k) => {
                  const m = D.TAX.modes[k];
                  const rate = Math.round((m.gst + m.pst) * 100);
                  return (
                    <button key={k} className={"taxbtn" + (taxMode === k ? " on" : "")} onClick={() => setTaxMode(k)}>
                      <span className="taxbtn-rate">{rate}%</span>
                      <span className="taxbtn-label">{m.label}</span>
                      <span className="taxbtn-hint">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card title="Payment received" sub="Record a full or partial payment now (optional).">
              <div className="pay-grid">
                <Field label="Amount received">
                  <div className="input-prefix">
                    <span>$</span>
                    <input type="number" min="0" step="0.01" value={payAmt}
                      onChange={(e) => setPayAmt(Math.max(0, +e.target.value))} />
                  </div>
                </Field>
                <Field label="Method">
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {["E-Transfer", "Cash", "Debit", "Credit Card", "Cheque", "Bank"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <div className="pay-quick">
                  <button onClick={() => setPayAmt(+calc.total.toFixed(2))}>Pay in full</button>
                  <button onClick={() => setPayAmt(+(calc.total / 2).toFixed(2))}>50% deposit</button>
                  <button onClick={() => setPayAmt(0)}>Clear</button>
                </div>
              </div>
              {overpaid > 0 && (
                <div className="overpay">
                  <div className="overpay-head">
                    <Icon name="alert" size={15} />
                    <span>Customer paid <strong>{fmt(overpaid)}</strong> over the invoice total. How should the overpayment be handled?</span>
                  </div>
                  <div className="overpay-seg">
                    <button type="button" className={"opt" + (overpayMode === "credit" ? " on" : "")} onClick={() => setOverpayMode("credit")}>
                      <span className="opt-title">Keep as credit</span>
                      <span className="opt-hint">Held on the customer’s account</span>
                    </button>
                    <button type="button" className={"opt" + (overpayMode === "refund" ? " on" : "")} onClick={() => setOverpayMode("refund")}>
                      <span className="opt-title">Refund to customer</span>
                      <span className="opt-hint">Pay the difference back</span>
                    </button>
                  </div>
                </div>
              )}
              <div className="pay-status">
                <span>{refund > 0 ? "Refund issued" : credit > 0 ? "Credit on account" : "Balance due"} <strong>{fmt(overpaid > 0 ? overpaid : balance)}</strong></span>
                <Badge tone={statusTone(status)} dot>{status}</Badge>
              </div>
            </Card>
          </div>

          <Card title="Notes on invoice">
            <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </div>

        {/* RIGHT — summary rail */}
        <aside className="invgen-rail">
          <div className="rail-card totals">
            <h3>Summary</h3>
            <Row k="Subtotal" v={fmt(calc.subtotal)} />
            {calc.discount > 0.005 && <Row k="Line discounts" v={"-" + fmt(calc.discount)} muted />}
            {calc.invDisc > 0.005 && calc.before && <Row k={"Discount" + (discMode === "percent" ? " (" + discVal + "%)" : "")} v={"-" + fmt(calc.invDisc)} muted />}
            {taxComponents(D.TAX.modes[taxMode]).map((c) => {
              const amt = c.bucket === "pst" ? calc.pst : calc.gst;
              return <Row key={c.name + c.acct} k={c.name + " (" + (Math.round(c.rate * 1000) / 10) + "%)"} v={fmt(amt)} muted={amt === 0} />;
            })}
            {calc.invDisc > 0.005 && !calc.before && <Row k={"Discount" + (discMode === "percent" ? " (" + discVal + "%)" : "") + " · post-tax"} v={"-" + fmt(calc.invDisc)} muted />}
            <div className="rail-total">
              <span>Total <em>CAD</em></span>
              <strong>{fmt(calc.total)}</strong>
            </div>
            {Number(payAmt) > 0 && (
              <>
                <Row k={"Paid (" + payMethod + ")"} v={"-" + fmt(Number(payAmt))} pos />
                {refund > 0
                  ? <Row k="Refund issued to customer" v={fmt(refund)} bold />
                  : credit > 0
                  ? <Row k="Credit on account" v={fmt(credit)} bold />
                  : <Row k="Balance due" v={fmt(balance)} bold />}
              </>
            )}
            <Btn variant="primary" full icon="check" onClick={save} disabled={!balanced || calc.total <= 0}>Save invoice</Btn>
          </div>

          <div className="rail-card journal">
            <div className="journal-head">
              <h3>Journal preview</h3>
              <Badge tone={balanced ? "green" : "red"} dot>{balanced ? "Balanced" : "Out of balance"}</Badge>
            </div>
            <p className="rail-note">Auto-posted to the double-entry ledger on save.</p>
            <table className="jtable">
              <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
              <tbody>
                {journal.map((j, i) => (
                  <tr key={i}>
                    <td><span className="jcode">{j.acct}</span> {j.name}</td>
                    <td className="r">{j.dr ? fmtPlain(j.dr) : ""}</td>
                    <td className="r">{j.cr ? fmtPlain(j.cr) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Totals</td><td className="r">{fmtPlain(jDr)}</td><td className="r">{fmtPlain(jCr)}</td></tr></tfoot>
            </table>
            {Number(payAmt) > 0 && (
              <p className="rail-note pay-je">{refund > 0
                ? "+ Payment: DR " + (payMethod === "Cash" ? "Cash on Hand" : "Bank") + " " + fmtPlain(Number(payAmt)) + " · CR Accounts Receivable " + fmtPlain(calc.total) + ". Refund issued: DR Refunds to Customers " + fmtPlain(refund) + " · CR " + (payMethod === "Cash" ? "Cash on Hand" : "Bank") + " " + fmtPlain(refund)
                : credit > 0
                ? "+ Payment entry: DR " + (payMethod === "Cash" ? "Cash on Hand" : "Bank") + " " + fmtPlain(Number(payAmt)) + " · CR Accounts Receivable " + fmtPlain(calc.total) + " · CR Customer Credits on Account " + fmtPlain(credit)
                : "+ Payment entry: DR " + (payMethod === "Cash" ? "Cash on Hand" : "Bank") + " " + fmtPlain(Number(payAmt)) + " · CR Accounts Receivable " + fmtPlain(Number(payAmt))}</p>
            )}
          </div>
        </aside>
      </div>

      {showPreview && <InvoicePreview {...{ invNo, date, due, client, lines, calc, taxMode, notes, payAmt, balance, refund, credit, status, lineTotal, salesId, onClose: () => setShowPreview(false) }} />}
      {showEmail && <EmailModal client={client} invNo={invNo} total={calc.total} onClose={() => setShowEmail(false)} pushToast={pushToast} />}
      {showAddClient && (
        <AddClientModal
          initialName={addClientName}
          onClose={() => setShowAddClient(false)}
          onCreate={(c) => {
            D.clients.push(c);
            setClient(c.id);
            setShowAddClient(false);
            pushToast(c.name + " added to clients");
          }} />
      )}
    </div>
  );
}

function ClientPicker({ clients, value, onChange, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);
  const sel = clients.find((c) => c.id === value);
  useEffect(() => {
    if (!open) { setQuery(""); return; }
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    const t = setTimeout(() => searchRef.current && searchRef.current.focus(), 30);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); clearTimeout(t); };
  }, [open]);
  const ql = query.trim().toLowerCase();
  const filtered = ql
    ? clients.filter((c) => (c.name + " " + c.type + " " + (c.contact || "")).toLowerCase().includes(ql))
    : clients;
  return (
    <div className="client-picker" ref={ref}>
      <button type="button" className={"cp-trigger" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
        <span className="cp-val">
          {sel ? sel.name : <span className="cp-placeholder">Select a client</span>}
          {sel && <em className="cp-type">{sel.type}</em>}
        </span>
        <Icon name="chevDown" size={15} />
      </button>
      {open && (
        <div className="cp-menu" role="listbox">
          <div className="cp-search">
            <Icon name="search" size={15} />
            <input ref={searchRef} value={query} placeholder="Search clients…"
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="cp-add" onClick={() => { setOpen(false); onAddNew(query.trim()); }}>
            <Icon name="plus" size={15} /> Add new client{ql ? " “" + query.trim() + "”" : ""}
          </button>
          <div className="cp-list">
            {filtered.length ? filtered.map((c) => (
              <button type="button" key={c.id}
                className={"cp-opt" + (c.id === value ? " on" : "")}
                onClick={() => { onChange(c.id); setOpen(false); }}>
                <span className="cp-opt-name">{c.name}</span>
                <span className="cp-opt-type">{c.type}</span>
                {c.id === value && <Icon name="check" size={15} />}
              </button>
            )) : <div className="cp-empty">No clients match “{query.trim()}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function AddClientModal({ onClose, onCreate, initialName }) {
  const [name, setName] = useState(initialName || "");
  const [type, setType] = useState("Retail");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState("");
  const [addr, setAddr] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Due on receipt");
  const [exempt, setExempt] = useState(false);
  const [taxDefault, setTaxDefault] = useState(defaultTaxForType("Retail"));
  const [taxTouched, setTaxTouched] = useState(false);
  function changeType(v) {
    setType(v);
    if (!taxTouched) setTaxDefault(defaultTaxForType(v));
  }
  const valid = name.trim().length > 0;
  function submit() {
    if (!valid) return;
    const emails = [email.trim(), email2.trim()].filter(Boolean);
    onCreate({
      id: "c" + Date.now().toString(36),
      name: name.trim(), type,
      contact: contact.trim() || "—",
      phone: phone.trim() || "—",
      phone2: phone2.trim(),
      addr: addr.trim(),
      taxNumber: taxNumber.trim(),
      notes: notes.trim(),
      terms,
      emails,
      defaultEmail: emails[0] || "",
      exempt, balance: 0,
      taxDefault: exempt ? "none" : taxDefault,
    });
  }
  return (
    <Modal title="Add new client" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={submit} disabled={!valid}>Add client</Btn>
      </>}>
      <div className="add-client-grid">
        <Field label="Client / business name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Mobile Ltd." autoFocus />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => changeType(e.target.value)}>
            <option>Retail</option>
            <option>Wholesale</option>
          </select>
        </Field>
        <Field label="Contact name">
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Primary contact" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(604) 555-0000" />
        </Field>
        <Field label="Secondary phone">
          <input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Tax number" hint="Client's GST / PST / business number">
          <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="e.g. 12345 6789 RT0001" />
        </Field>
        <Field label="Primary email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Secondary email" hint="Emails can be sent to both addresses">
          <input type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} placeholder="second@example.com" />
        </Field>
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

function Row({ k, v, muted, bold, pos }) {
  return (
    <div className={"trow" + (bold ? " bold" : "")}>
      <span className={muted ? "muted" : ""}>{k}</span>
      <span className={"num" + (pos ? " pos" : "")}>{v}</span>
    </div>
  );
}

function InvoicePreview({ invNo, date, due, client, lines, calc, taxMode, notes, payAmt, balance, refund, credit, status, lineTotal, salesId, onClose }) {
  const C = BCCWE.company;
  const m = BCCWE.TAX.modes[taxMode];
  return (
    <Modal title={"Invoice preview — " + invNo} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" icon="mail" onClick={onClose}>Email to client</Btn>
        <Btn variant="primary" icon="download" onClick={() => window.downloadInvoicePdf(document.getElementById("inv-paper"), invNo + ".pdf")}>Download PDF</Btn>
      </>}>
      <div className="inv-paper" id="inv-paper">
        <div className="ip-top">
          <div className="ip-brand">
            <div className="ip-logo">BC<span>CWE</span></div>
            <div className="ip-co">
              <strong>{C.name}</strong>
              <span>{C.tagline}</span>
              <span>{C.addr1}</span><span>{C.addr2}</span>
              <span>{C.phone} · {C.email}</span>
            </div>
          </div>
          <div className="ip-meta">
            <h2>INVOICE</h2>
            <table>
              <tbody>
                <tr><td>Invoice #</td><th>{invNo}</th></tr>
                <tr><td>Date</td><th>{shortDate(date)}</th></tr>
                <tr><td>Due</td><th>{shortDate(due)}</th></tr>
                <tr><td>Status</td><th><Badge tone={statusTone(status)}>{status}</Badge></th></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="ip-parties">
          <div>
            <span className="ip-lbl">Bill to</span>
            <strong>{client ? client.name : "—"}</strong>
            <span>{client && client.contact !== "—" ? client.contact : ""}</span>
            <span>{client && client.phone !== "—" ? client.phone : ""}</span>
            <span>{client && client.defaultEmail}</span>
          </div>
          <div className="ip-right">
            <span className="ip-lbl">Salesperson</span>
            <strong>{personName(salesId)}</strong>
            <span className="ip-lbl" style={{ marginTop: 10 }}>Tax treatment</span>
            <strong>{m.label} ({Math.round(taxRateOf(m) * 100)}%)</strong>
          </div>
        </div>

        <table className="ip-lines">
          <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Disc</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.desc || "—"}</strong>{l.code && <em className="ip-code">{l.code}</em>}</td>
                <td className="r">{l.qty}</td>
                <td className="r">{fmt(l.price)}</td>
                <td className="r">{l.disc ? l.disc + "%" : "—"}</td>
                <td className="r">{fmt(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ip-foot">
          <div className="ip-notes">
            <span className="ip-lbl">Notes</span>
            <p>{notes}</p>
            <span className="ip-lbl">{C.gst} · {C.pst}</span>
          </div>
          <div className="ip-totals">
            <div><span>Subtotal</span><span>{fmt(calc.subtotal)}</span></div>
            {calc.discount > 0.005 && <div><span>Line discounts</span><span>-{fmt(calc.discount)}</span></div>}
            {calc.invDisc > 0.005 && calc.before && <div><span>Discount{discMode === "percent" ? " (" + discVal + "%)" : ""}</span><span>-{fmt(calc.invDisc)}</span></div>}
            {taxComponents(m).map((c) => {
              const amt = c.bucket === "pst" ? calc.pst : calc.gst;
              return amt > 0 ? <div key={c.name + c.acct}><span>{c.name} {Math.round(c.rate * 1000) / 10}%</span><span>{fmt(amt)}</span></div> : null;
            })}
            {calc.invDisc > 0.005 && !calc.before && <div><span>Discount{discMode === "percent" ? " (" + discVal + "%)" : ""} · post-tax</span><span>-{fmt(calc.invDisc)}</span></div>}
            <div className="ip-grand"><span>Total CAD</span><span>{fmt(calc.total)}</span></div>
            {Number(payAmt) > 0 && <div><span>Paid</span><span>-{fmt(Number(payAmt))}</span></div>}
            {Number(payAmt) > 0 && (refund > 0
              ? <div className="ip-bal ip-refund"><span>Refund paid</span><span>{fmt(refund)}</span></div>
              : credit > 0
              ? <div className="ip-bal"><span>Credit on account</span><span>{fmt(credit)}</span></div>
              : <div className="ip-bal"><span>Balance due</span><span>{fmt(balance)}</span></div>)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EmailModal({ client, invNo, total, onClose, pushToast }) {
  const emails = client && client.emails.length ? client.emails : [];
  const di = BCCWE.prefs.defaultInvoiceEmail || "";
  const [sel, setSel] = useState(() => { const n = new Set(); if (client && client.defaultEmail) n.add(client.defaultEmail); if (di) n.add(di); return n; });
  const [extra, setExtra] = useState("");
  const [profile, setProfile] = useState("sp1");
  const backup = BCCWE.prefs.backupEmail || "";
  function toggle(e) {
    setSel((s) => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n; });
  }
  const recipients = [...sel, ...(extra ? [extra] : [])];
  return (
    <Modal title={"Email invoice " + invNo} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="send" disabled={!recipients.length}
          onClick={() => {
            const prof = BCCWE.smtpProfiles.find((x) => x.id === profile) || BCCWE.smtpProfiles[0];
            const fileName = invNo + ".pdf";
            const paper = document.querySelector(".inv-paper-card .inv-paper") || document.getElementById("inv-paper") || document.querySelector(".inv-paper");
            const finish = (attUrl) => {
              window.sendEmail({
                kind: "invoice", subject: "Invoice " + invNo + " from BCCWE", docNo: invNo,
                clientId: client ? client.id : "", profileId: prof.id,
                to: recipients, cc: [], attachments: [fileName], attUrl: attUrl || "", attName: fileName,
              }, (status) => pushToast("Invoice " + invNo + " — " + status + (status === "Delivered" ? " · PDF attached to " + recipients.length + " recipient(s)" : " · see Sent Mail")));
              pushToast("Attaching " + fileName + " · sending to " + recipients.length + " recipient(s)…");
              onClose();
            };
            if (paper && window.invoicePdfBlobUrl) window.invoicePdfBlobUrl(paper).then(finish).catch(() => finish(""));
            else finish("");
          }}>
          Send ({recipients.length})
          }}>
          Send ({recipients.length})
        </Btn>
      </>}>
      <div className="email-modal">
        <p className="rail-note">A PDF of <strong>{invNo}</strong> ({fmt(total)}) will be generated and attached.</p>
        <Field label="Send from profile">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {BCCWE.smtpProfiles.map((p) => <option key={p.id} value={p.id}>{p.fromName} — {p.from}</option>)}
          </select>
        </Field>
        <span className="field-label" style={{ marginTop: 6 }}>Client email addresses</span>
        {emails.length ? emails.map((e) => (
          <label key={e} className="email-pick">
            <input type="checkbox" checked={sel.has(e)} onChange={() => toggle(e)} />
            <span>{e}</span>
            {client.defaultEmail === e && <Badge tone="blue">default</Badge>}
          </label>
        )) : <p className="rail-note">No email on file for this client — add one below.</p>}
        {di && (
          <label className="email-pick">
            <input type="checkbox" checked={sel.has(di)} onChange={() => toggle(di)} />
            <span>{di}</span>
            <Badge tone="green">default invoice email</Badge>
          </label>
        )}
        <Field label="Add another recipient (accountant, owner…)">
          <input type="email" placeholder="name@example.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
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

Object.assign(window, { InvoiceGenerator, EmailModal, ClientPicker });
