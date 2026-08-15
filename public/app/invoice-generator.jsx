/* ============================================================
   BCCWE — Invoice Generator (fully working)
   ============================================================ */
function InvoiceGenerator({ onSaved, pushToast, editNo, defaultStore }) {
  const D = BCCWE;
  const catalog = useMemo(() => {
    const inv = D.inventory.map((i) => ({ code: i.code, name: i.name, price: i.price, cost: i.cost, kind: "good" }));
    const svc = D.services.map((s) => ({ code: s.code, name: s.name, price: s.price, cost: 0, kind: "service" }));
    return [...inv, ...svc];
  }, []);

  // When editing, prefill from the existing invoice.
  const edit = editNo ? D.invoices.find((i) => i.no === editNo) : null;
  const editLines = edit ? (typeof deriveLines === "function" ? deriveLines(edit) : (edit.lines || [])) : null;

  // ---- Store (company) the invoice belongs to ----
  const allowedStores = useMemo(() => (window.STORES ? window.STORES.allowed() : []), []);
  const initStore = edit
    ? (edit.companyId || (window.STORES ? window.STORES.idOf(edit) : ""))
    : (defaultStore && allowedStores.some((c) => c.id === defaultStore)
        ? defaultStore
        : ((allowedStores[0] && allowedStores[0].id) || (window.STORES ? window.STORES.defaultId() : "")));
  const initStoreObj = window.STORES ? window.STORES.byId(initStore) : null;
  const [companyId, setCompanyId] = useState(initStore);
  const [invNoTouched, setInvNoTouched] = useState(!!edit);
  const storeObj = (window.STORES ? window.STORES.byId(companyId) : null) || initStoreObj;

  const [invNo, setInvNo] = useState(edit ? edit.no : (window.nextInvNoForStore ? window.nextInvNoForStore(initStore) : "INV-" + D.nextInvoiceNo));
  const [date, setDate] = useState(edit ? edit.date : D.today);
  const [due, setDue] = useState(() => {
    if (edit) return edit.due || D.today;
    const d = new Date(D.today + "T00:00:00"); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [clientId, setClientId] = useState(edit ? (edit.clientId || "") : "");
  const _isAdmin = !!(window.STORES && window.STORES.isAdmin());
  const _myId = (window.sessionUid && window.sessionUid()) || (window.__session && window.__session.userId) || "";
  const [salesId, setSalesId] = useState(edit ? (edit.sales || "") : ((!_isAdmin && _myId) ? _myId : ((D.salespeople[0] && D.salespeople[0].id) || "")));
  const [taxMode, setTaxMode] = useState(edit ? (edit.tax || "both") : ((initStoreObj && initStoreObj.taxDefault) || "both"));
  const [terms, setTerms] = useState(edit ? (edit.terms || "Due on receipt") : "Due on receipt");
  const [docKind, setDocKind] = useState(edit ? (edit.kind || "sale") : "sale"); // sale | order
  const [notes, setNotes] = useState(edit ? (edit.notes || "") : "Thank you for your business. Repairs carry a 90-day workmanship warranty.");
  const [lines, setLines] = useState(
    edit && editLines && editLines.length
      ? editLines.map((l, i) => ({ id: i + 1, code: l.code || "", desc: l.desc || "", qty: l.qty || 1, price: l.price || 0, cost: l.cost || 0, disc: l.disc || 0 }))
      : [{ id: 1, code: "", desc: "", qty: 1, price: 0, cost: 0, disc: 0 }]
  );
  const [payAmt, setPayAmt] = useState(edit ? (edit.paid || 0) : 0);
  const [payMethod, setPayMethod] = useState(edit ? (edit.payMethod || "E-Transfer") : "E-Transfer");
  const [poNo, setPoNo] = useState(edit ? (edit.poNo || "") : "");
  const [attachments, setAttachments] = useState(edit && Array.isArray(edit.attachments) ? edit.attachments.slice() : []);
  const [attachBusy, setAttachBusy] = useState(false);
  const attachRef = useRef(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientName, setAddClientName] = useState("");
  const [overpayMode, setOverpayMode] = useState("refund");
  const [priceSuggest, setPriceSuggest] = useState(true);
  const [pricePrompt, setPricePrompt] = useState(null);
  const [, bump] = useState(0);
  const force = () => bump((x) => x + 1);
  const [discMode, setDiscMode] = useState(edit && edit.discMode ? edit.discMode : "amount");
  const [discVal, setDiscVal] = useState(edit && edit.discVal != null ? edit.discVal : 0);
  const [discTiming, setDiscTiming] = useState(edit && edit.discTiming ? edit.discTiming : "before");
  const [charges, setCharges] = useState(edit && edit.charges ? edit.charges.map((c) => ({ id: c.id || Date.now() + Math.random(), label: c.label, amount: c.amount, taxable: !!c.taxable })) : []);

  function addCharge() {
    setCharges((cs) => [...cs, { id: Date.now(), label: "Shipping", amount: 0, taxable: true }]);
  }
  function updateCharge(id, patch) {
    setCharges((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCharge(id) {
    setCharges((cs) => cs.filter((c) => c.id !== id));
  }

  const client = D.clients.find((c) => c.id === clientId);
  const uid = useRef(2);

  function setClient(id) {
    setClientId(id);
    setPricePrompt(null);
    const c = D.clients.find((x) => x.id === id);
    if (!c) return;
    // Switch to the client's default store if they have one we can access.
    let storeId = companyId;
    if (!edit && c.companyId && allowedStores.some((s) => s.id === c.companyId)) {
      storeId = c.companyId;
      setCompanyId(storeId);
      if (!invNoTouched && window.nextInvNoForStore) setInvNo(window.nextInvNoForStore(storeId));
    }
    const st = window.STORES ? window.STORES.byId(storeId) : null;
    // Tax precedence: exempt → No Tax; else the client's default; else the store's default.
    setTaxMode(c.exempt ? "none" : (c.taxDefault || (st && st.taxDefault) || "both"));
    if (c.terms) changeTerms(c.terms);
  }

  function changeTerms(v) {
    setTerms(v);
    const m = /Net\s+(\d+)/i.exec(v);
    const days = m ? parseInt(m[1], 10) : 0;
    const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + days);
    setDue(d.toISOString().slice(0, 10));
  }

  function changeStore(id) {
    setCompanyId(id);
    const st = window.STORES ? window.STORES.byId(id) : null;
    // Switching store re-allocates the number from that store's own sequence/prefix.
    if (!edit && window.nextInvNoForStore) { setInvNo(window.nextInvNoForStore(id)); setInvNoTouched(false); }
    const c = D.clients.find((x) => x.id === clientId);
    // Apply the store's default tax unless the client carries its own default.
    if (c && c.exempt) setTaxMode("none");
    else if (c && c.taxDefault) setTaxMode(c.taxDefault);
    else setTaxMode((st && st.taxDefault) || "both");
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
    const taxableCharges = charges.reduce((s, c) => s + (c.taxable ? (Number(c.amount) || 0) : 0), 0);
    const nonTaxCharges = charges.reduce((s, c) => s + (!c.taxable ? (Number(c.amount) || 0) : 0), 0);
    const taxableBase = taxable + taxableCharges;
    const gst = taxableBase * m.gst;
    const pst = taxableBase * m.pst;
    let total = taxableBase + gst + pst + nonTaxCharges;
    if (!before) total = Math.max(0, total - invDisc);
    const cogs = lines.reduce((s, l) => s + l.qty * (l.cost || 0), 0);
    return { subtotal, gross, discount, invDisc, before, gst, pst, total, cogs, taxableCharges, nonTaxCharges };
  }, [lines, taxMode, discMode, discVal, discTiming, charges]);

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
    const chargesRev = (calc.taxableCharges || 0) + (calc.nonTaxCharges || 0);
    if (chargesRev > 0.005) J.push({ acct: "4000", name: "Shipping & Other Charges", dr: 0, cr: chargesRev });
    if (calc.invDisc > 0.005) J.push({ acct: "4900", name: "Sales Discounts", dr: calc.invDisc, cr: 0 });
    taxPostings(D.TAX.modes[taxMode], calc.gst, calc.pst).forEach((c) => J.push({ acct: c.acct, name: c.acctName, dr: 0, cr: c.amount }));
    if (calc.cogs > 0) J.push({ acct: "1300", name: "Inventory", dr: 0, cr: calc.cogs });
    return J;
  }, [calc, revAcct, goodsRev, svcRev]);

  const jDr = journal.reduce((s, j) => s + j.dr, 0);
  const jCr = journal.reduce((s, j) => s + j.cr, 0);
  const balanced = Math.abs(jDr - jCr) < 0.01;
  // last purchases of an item by the current client (for price suggestions)
  const priceHist = (code) => { try { return (window.clientPurchaseHistory && window.clientPurchaseHistory(clientId, code, 3)) || []; } catch (e) { return []; } };

  async function save() {
    // Allocate the number SERVER-SIDE at save time — an atomic DB increment, so
    // two devices can never issue the same invoice number (the on-screen number
    // was only a preview from this device's counter). Falls back to the local
    // counter when offline; either way a local duplicate check runs last.
    let finalNo = invNo;
    let serverAlloc = null;
    if (!edit) {
      if (!invNoTouched && window.allocateNumber) {
        serverAlloc = await window.allocateNumber("invoice", companyId);
        if (serverAlloc) {
          finalNo = serverAlloc.no;
          const co = window.STORES && window.STORES.byId(serverAlloc.companyId || companyId);
          if (co && serverAlloc.next) co.nextInvoiceNo = serverAlloc.next; // mirror the server's counter
        }
      }
      if (D.invoices.some((i) => i.no === finalNo)) {
        if (invNoTouched) { pushToast("Invoice # " + finalNo + " already exists — choose a different number."); return; }
        let guard = 0;
        while (D.invoices.some((i) => i.no === finalNo) && guard++ < 500) {
          const m = /^(.*?)(\d+)$/.exec(finalNo);
          finalNo = m ? m[1] + (parseInt(m[2], 10) + 1) : finalNo + "-2";
        }
      }
    }
    const rec = {
      no: edit ? edit.no : finalNo, // never rename on edit — payments/credit notes/mail reference the number
      companyId, clientId, date, due, terms, kind: docKind, sales: salesId, tax: taxMode,
      subtotal: calc.subtotal, gst: calc.gst, pst: calc.pst, total: calc.total,
      // Persist the invoice-level discount so editing restores it (previously it
      // reset to zero on edit, silently re-inflating the total on the next save).
      discMode, discVal: Number(discVal) || 0, discTiming, invDisc: calc.invDisc,
      poNo: poNo.trim(), attachments,
      paid: Number(payAmt) || 0, refunded: edit ? (edit.refunded || 0) : refund, status, notes, payMethod,
      lines: lines.map((l) => ({ desc: l.desc, code: l.code, qty: l.qty, price: l.price, disc: l.disc, cost: l.cost })),
      charges: charges.map((c) => ({ id: c.id, label: c.label, amount: Number(c.amount) || 0, taxable: !!c.taxable })),
    };
    // Stock moves for any stocked inventory item (incl. services tracked in inventory). May go negative.
    const stockable = (code) => D.inventory.find((x) => x.code === code) || null;
    const failMsg = "Couldn't save — no connection to the server. Your entry is kept on this screen; please try again.";

    if (edit) {
      const idx = D.invoices.findIndex((i) => i.no === edit.no);
      const prev = idx >= 0 ? D.invoices[idx] : null;
      // Only adjust stock for invoices created WITH real line data. A legacy
      // (line-less) invoice never recorded which units were sold, so its
      // original stock decrement is unknown — the previous code built oldQ as
      // empty and decremented the full (invented) prefill quantities, silently
      // removing stock for units that were never actually recorded.
      const hadRealLines = !!(prev && prev.lines && prev.lines.length);
      const oldQ = {}; (hadRealLines ? prev.lines : []).forEach((l) => { if (l.code) oldQ[l.code] = (oldQ[l.code] || 0) + (l.qty || 0); });
      const newQ = {}; lines.forEach((l) => { if (l.code && l.qty > 0) newQ[l.code] = (newQ[l.code] || 0) + l.qty; });
      const adj = [];
      if (docKind !== "order" && hadRealLines) Object.keys(Object.assign({}, oldQ, newQ)).forEach((code) => {
        const it = stockable(code); if (!it) return;
        const delta = (newQ[code] || 0) - (oldQ[code] || 0);
        if (delta) { it.stock -= delta; adj.push([it, delta]); }
      });
      if (idx >= 0) D.invoices[idx] = Object.assign({}, D.invoices[idx], rec);
      window.logAudit("UPDATE", "Invoice", "invoices", invNo, "Edited invoice — total " + fmt(calc.total) + (clientId ? " · " + (clientName(clientId) || "") : ""));
      const ok = window.persistNow ? await window.persistNow("invoices", "inventory") : true;
      if (!ok) { if (idx >= 0 && prev) D.invoices[idx] = prev; adj.forEach(([it, d]) => { it.stock += d; }); pushToast(failMsg); return; }
      pushToast(invNo + " updated");
      onSaved && onSaved(invNo);
      return;
    }

    const addedSales = [];
    // Orders aren't sales until converted — don't record item sales for them
    // (they were polluting price history and per-item analytics).
    // `inv` ties each row to its invoice, so deleting that invoice can remove
    // exactly its rows instead of matching on values.
    if (clientId && docKind !== "order") lines.forEach((l) => { if (l.code && l.qty > 0) { const e = { date, inv: (edit ? edit.no : finalNo), code: l.code, clientId, qty: l.qty, price: l.price, disc: l.disc || 0, cost: l.cost || 0 }; D.itemSales.unshift(e); addedSales.push(e); } });
    const adj = [];
    if (docKind !== "order") lines.forEach((l) => { if (l.code && l.qty > 0) { const it = stockable(l.code); if (it) { it.stock -= l.qty; adj.push([it, l.qty]); } } });
    D.invoices.unshift(rec);
    window.logAudit("CREATE", "Invoice", "invoices", rec.no, "Created invoice — total " + fmt(calc.total) + (storeObj ? " · " + storeObj.name : "") + (clientId ? " to " + (clientName(clientId) || "") : ""));
    // Bump the LOCAL counters only when the server didn't allocate (offline
    // fallback) — a server allocation already advanced the real counter, and
    // the local mirror was updated from its response.
    const bumped = !serverAlloc && !invNoTouched && window.bumpStoreInvoiceNo;
    if (bumped) window.bumpStoreInvoiceNo(companyId);
    if (!serverAlloc) D.nextInvoiceNo += 1;
    const ok = window.persistNow ? await window.persistNow("invoices", "companies", "itemSales", "inventory") : true;
    if (!ok) {
      D.invoices = D.invoices.filter((i) => i !== rec);
      addedSales.forEach((e) => { const i = D.itemSales.indexOf(e); if (i >= 0) D.itemSales.splice(i, 1); });
      adj.forEach(([it, q]) => { it.stock += q; });
      // Server-allocated numbers stay consumed (a gap, never a duplicate).
      if (!serverAlloc) D.nextInvoiceNo -= 1;
      if (bumped) { const c = window.STORES.byId(companyId); if (c) c.nextInvoiceNo = (c.nextInvoiceNo || 1001) - 1; }
      pushToast(failMsg);
      return;
    }
    pushToast(rec.no + " saved · journal posted (" + fmt(calc.total) + ")");
    const waClient = D.clients.find((c) => c.id === clientId);
    if (waClient && window.waNumber(waClient)) {
      if (window.confirm("Send invoice " + rec.no + " to " + waClient.name + " on WhatsApp?")) {
        const mode = window.sendWhatsApp(waClient, window.invoiceWaMessage(rec, waClient), function (r) {
          pushToast && pushToast(r && r.ok ? "Invoice sent to WhatsApp" : "WhatsApp: " + ((r && r.error) || "failed"));
        });
        if (mode === "api") pushToast && pushToast("Sending to WhatsApp…");
      }
    }
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
      <PageHead title={edit ? "Edit invoice " + edit.no : (docKind === "order" ? "Order Invoice" : "Invoice Generator")}
        sub={edit ? "Editing an existing invoice — changes overwrite the saved invoice." : (docKind === "order" ? "Create an order invoice — collect a deposit now, convert to a sale later." : "Create an invoice — line items pull from inventory, totals and journal entries post live.")}
        actions={<>
          <Btn variant="ghost" icon="mail" onClick={() => setShowEmail(true)}>Email</Btn>
          <Btn variant="ghost" icon="download" onClick={() => setShowPreview(true)}>Preview / PDF</Btn>
          <Btn variant="primary" icon="check" onClick={save} disabled={!clientId || !balanced || calc.total <= 0}>{edit ? "Update invoice" : (docKind === "order" ? "Save order invoice" : "Save invoice")}</Btn>
        </>} />

      <div className="invgen-grid">
        {/* LEFT — builder */}
        <div className="invgen-main">
          <Card title="Invoice details" className="invoice-meta-card">
            {!edit && (
              <div className="miniseg" style={{ marginBottom: 12, maxWidth: 420 }}>
                <button type="button" className={"miniseg-btn" + (docKind === "sale" ? " on" : "")} onClick={() => setDocKind("sale")}>Sales invoice</button>
                <button type="button" className={"miniseg-btn" + (docKind === "order" ? " on" : "")} onClick={() => setDocKind("order")}>Order invoice (deposit)</button>
              </div>
            )}
            {docKind === "order" && (
              <div className="inline-note" style={{ marginBottom: 12 }}><Icon name="alert" size={15} /> Order invoice — any amount received is held as a <strong>customer deposit</strong> (not revenue). Convert it to a sales invoice later to post the sale.</div>
            )}
            <div className="meta-grid">
              <div className="field">
                <span className="field-label">Bill to<em>*</em></span>
                <ClientPicker clients={D.clients} value={clientId}
                  onChange={setClient} onAddNew={(name) => { setAddClientName(name || ""); setShowAddClient(true); }} />
              </div>
              <Field label="Salesperson">
                <select value={salesId} onChange={(e) => setSalesId(e.target.value)} disabled={!_isAdmin} title={!_isAdmin ? "You can only post under your own login" : ""}>
                  {D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Store" hint={allowedStores.length > 1 ? "Which business this invoice belongs to" : "This invoice's business"}>
                {allowedStores.length > 1 ? (
                  <select value={companyId} onChange={(e) => changeStore(e.target.value)}>
                    {allowedStores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <input value={(storeObj && storeObj.name) || ""} readOnly className="ro" />
                )}
              </Field>
              <Field label="Invoice #" hint="Auto-allocated — override allowed">
                <input value={invNo} readOnly={!!edit} title={edit ? "The invoice number can't be changed when editing" : undefined} onChange={(e) => { if (edit) return; setInvNo(e.target.value); setInvNoTouched(true); }} />
              </Field>
              <Field label="P.O./S.O. #" hint="Customer purchase/sales order reference (optional)">
                <input value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="e.g. PO-4521" />
              </Field>
              <Field label="Invoice date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="Terms" hint="Sets the due date automatically">
                <select value={terms} onChange={(e) => changeTerms(e.target.value)}>
                  {["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            {client && client.exempt && (
              <div className="inline-note"><Icon name="alert" size={15} /> This client is flagged <strong>tax-exempt</strong> — tax mode pre-set to “No Tax”. Override per line below if needed.</div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line, #e6eaf0)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span className="field-label" style={{ margin: 0 }}>Attachments <span className="muted" style={{ fontWeight: 400 }}>· archived copy of the source invoice (PDF/image, max 5 MB each)</span></span>
                <input ref={attachRef} type="file" hidden multiple accept=".pdf,image/*"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (!files.length) return;
                    setAttachBusy(true);
                    for (const f of files) {
                      try { const a = await window.uploadInvoiceAttachment(f); setAttachments((ls) => [...ls, a]); }
                      catch (err) { pushToast && pushToast("Attach failed — " + (err.message || f.name)); }
                    }
                    setAttachBusy(false);
                  }} />
                <Btn variant="ghost" size="sm" icon="plus" disabled={attachBusy} onClick={() => attachRef.current && attachRef.current.click()}>{attachBusy ? "Uploading…" : "Attach file"}</Btn>
              </div>
              {attachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {attachments.map((a, i) => (
                    <span key={a.id || i} className="cat-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
                      <button type="button" className="link" title="Download" onClick={() => window.downloadAttachmentFile(a, pushToast)}>{a.name}</button>
                      <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} title="Remove from invoice"
                        onClick={() => setAttachments((ls) => ls.filter((x) => x !== a))}><Icon name="x" size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
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

          <Card title="Extra charges" sub="Add shipping, surcharges or other charges. Taxable charges are taxed; non-taxable charges are added after tax."
            actions={<button type="button" className="line-add" onClick={addCharge}><Icon name="plus" size={14} /> Add charge</button>}>
            {charges.length === 0 ? (
              <p className="rail-note">No extra charges. Use “Add charge” for shipping, surcharges, etc.</p>
            ) : (
              <div className="charges-list">
                {charges.map((c) => (
                  <div className="charge-row" key={c.id}>
                    <input type="text" value={c.label} placeholder="Charge label (e.g. Shipping)"
                      onChange={(e) => updateCharge(c.id, { label: e.target.value })} />
                    <div className="input-prefix">
                      <span>$</span>
                      <input type="number" min="0" step="0.01" value={c.amount}
                        onChange={(e) => updateCharge(c.id, { amount: Math.max(0, +e.target.value) })} />
                    </div>
                    <label className="charge-tax">
                      <input type="checkbox" checked={!!c.taxable}
                        onChange={(e) => updateCharge(c.id, { taxable: e.target.checked })} />
                      <span>Taxable</span>
                    </label>
                    <button className="icon-btn line-del" onClick={() => removeCharge(c.id)} title="Remove"><Icon name="trash" size={15} /></button>
                  </div>
                ))}
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

            <Card title={docKind === "order" ? "Deposit received" : "Payment received"} sub={docKind === "order" ? "Held as a customer deposit until converted to a sale." : "Record a full or partial payment now (optional)."}>
              <div className="pay-grid">
                <Field label={docKind === "order" ? "Deposit amount" : "Amount received"}>
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
            {charges.filter((c) => c.taxable).map((c) => (
              <Row key={c.id} k={(c.label || "Charge") + " (taxable)"} v={fmt(Number(c.amount) || 0)} />
            ))}
            {taxComponents(D.TAX.modes[taxMode]).map((c) => {
              const amt = c.bucket === "pst" ? calc.pst : calc.gst;
              return <Row key={c.name + c.acct} k={c.name + " (" + (Math.round(c.rate * 1000) / 10) + "%)"} v={fmt(amt)} muted={amt === 0} />;
            })}
            {calc.invDisc > 0.005 && !calc.before && <Row k={"Discount" + (discMode === "percent" ? " (" + discVal + "%)" : "") + " · post-tax"} v={"-" + fmt(calc.invDisc)} muted />}
            {charges.filter((c) => !c.taxable).map((c) => (
              <Row key={c.id} k={(c.label || "Charge") + " (no tax)"} v={fmt(Number(c.amount) || 0)} />
            ))}
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
            <Btn variant="primary" full icon="check" onClick={save} disabled={!balanced || calc.total <= 0}>{edit ? "Update invoice" : (docKind === "order" ? "Save order invoice" : "Save invoice")}</Btn>
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

      {showPreview && <InvoicePreview {...{ invNo, poNo, date, due, client, lines, calc, taxMode, discMode, discVal, notes, payAmt, balance, refund, credit, status, lineTotal, salesId, company: storeObj, onEmail: () => { setShowPreview(false); setShowEmail(true); }, onClose: () => setShowPreview(false) }} />}
      {showEmail && <EmailModal client={client} invNo={invNo} total={calc.total}
        invData={{ no: invNo, companyId, clientId, date, due, status, subtotal: calc.subtotal, gst: calc.gst, pst: calc.pst, total: calc.total, paid: Number(payAmt) || 0, invDisc: calc.invDisc, discTiming, lines: lines.map((l) => ({ desc: l.desc, code: l.code, qty: l.qty, price: l.price, disc: l.disc, cost: l.cost })) }}
        onClose={() => setShowEmail(false)} pushToast={pushToast} />}
      {showAddClient && (
        <AddClientModal
          initialName={addClientName}
          onClose={() => setShowAddClient(false)}
          onCreate={(c) => {
            D.clients.push(c);
            window.logAudit("CREATE", "Client", "clients", c.name, "Added client " + c.name);
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
    <div className={"client-picker" + (open ? " cp-open" : "")} ref={ref}>
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
  const [countryCode, setCountryCode] = useState("+1");
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
  const [companyId, setCompanyId] = useState("");
  const stores = (BCCWE.companies || []).filter((c) => c.active !== false);
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
      countryCode: countryCode.trim() || "+1",
      phone2: phone2.trim(),
      addr: addr.trim(),
      taxNumber: taxNumber.trim(),
      notes: notes.trim(),
      terms,
      emails,
      defaultEmail: emails[0] || "",
      exempt, balance: 0,
      taxDefault: exempt ? "none" : taxDefault,
      companyId,
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
        <Field label="Country code">
          <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+1" />
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
        {stores.length > 1 && (
          <Field label="Default store" hint="Auto-selected when invoicing this client — changeable per invoice">
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">— no default —</option>
              {stores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
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

function InvoicePreview({ invNo, poNo, date, due, client, lines, calc, taxMode, discMode, discVal, notes, payAmt, balance, refund, credit, status, lineTotal, salesId, company, onEmail, onClose }) {
  const C = company || BCCWE.company;
  const on = (k) => (C.show ? C.show[k] !== false : true);
  const m = BCCWE.TAX.modes[taxMode];
  return (
    <Modal title={"Invoice preview — " + invNo} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" icon="mail" onClick={onEmail || onClose}>Email to client</Btn>
        <Btn variant="primary" icon="download" onClick={() => window.downloadInvoicePdf(document.getElementById("inv-paper"), invNo + ".pdf")}>Download PDF</Btn>
      </>}>
      <div className="inv-paper" id="inv-paper">
        <div className="ip-top">
          <div className="ip-brand">
            {C.logo && on("logo")
              ? <div className="ip-logo" style={{ padding: 0, overflow: "hidden" }}><img src={C.logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
              : <div className="ip-logo">{(C.name || "BC").slice(0, 2).toUpperCase()}</div>}
            <div className="ip-co">
              <strong>{C.name}</strong>
              {on("tagline") && C.tagline && <span>{C.tagline}</span>}
              {on("address") && <span>{C.addr1}</span>}
              {on("address") && <span>{C.addr2}</span>}
              <span>{[on("phone") && C.phone, on("email") && C.email].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <div className="ip-meta">
            <h2>INVOICE</h2>
            <table>
              <tbody>
                <tr><td>Invoice #</td><th>{invNo}</th></tr>
                {poNo ? <tr><td>P.O./S.O. #</td><th>{poNo}</th></tr> : null}
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
            <span className="ip-lbl">{[on("gst") && C.gst, on("pst") && C.pst].filter(Boolean).join(" · ")}</span>
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

function EmailModal({ client, invNo, total, invData, onClose, pushToast }) {
  const emails = client && client.emails && client.emails.length ? client.emails : [];
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
            const finish = (b64) => {
              window.sendEmail({
                kind: "invoice", subject: "Invoice " + invNo + " from BCCWE", docNo: invNo,
                clientId: client ? client.id : "", profileId: prof.id,
                to: recipients, cc: [], attachments: [fileName],
                attachmentData: b64 ? [{ filename: fileName, content: b64 }] : [],
              }, (status) => pushToast("Invoice " + invNo + " — " + status + (status === "Delivered" ? " · PDF attached to " + recipients.length + " recipient(s)" : " · see Sent Mail")));
              pushToast(b64
                ? "Attaching " + fileName + " · sending to " + recipients.length + " recipient(s)…"
                : "Sending to " + recipients.length + " recipient(s) (PDF could not be generated)…");
              onClose();
            };
            // Fall back to building the PDF straight from the invoice data when
            // there is no on-screen paper (e.g. emailing from the generator,
            // where the preview modal isn't mounted) — previously this sent the
            // email with NO attachment despite promising one.
            const fromData = () => {
              if (invData && window.invoicePdfBase64FromData) {
                try { finish(window.invoicePdfBase64FromData(invData) || ""); } catch (e) { finish(""); }
              } else finish("");
            };
            if (paper && window.invoicePdfBase64) window.invoicePdfBase64(paper).then(finish).catch(fromData);
            else fromData();
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
