/* ============================================================
   BCCWE — Point of Sale (POS)
   Fast counter sales: tap products into a cart, take payment,
   stock + books update live. Records a cash sale (store-tagged).
   ============================================================ */
function POS({ pushToast, go }) {
  const D = BCCWE;
  const allowedStores = (window.STORES ? window.STORES.allowed() : []);
  const [companyId, setCompanyId] = useState((allowedStores[0] && allowedStores[0].id) || (window.STORES ? window.STORES.defaultId() : ""));
  const storeObj = window.STORES ? window.STORES.byId(companyId) : null;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [cart, setCart] = useState([]); // {code,name,price,cost,qty}
  const [clientId, setClientId] = useState("");
  const [taxMode, setTaxMode] = useState((storeObj && storeObj.taxDefault) || "none");
  const [method, setMethod] = useState("Cash");

  const cats = ["All", ...Array.from(new Set(D.inventory.map((i) => i.cat).filter(Boolean)))];
  const ql = q.trim().toLowerCase();
  const items = D.inventory.filter((i) =>
    (cat === "All" || i.cat === cat) &&
    (!ql || (i.name + " " + i.code).toLowerCase().includes(ql)));

  function changeStore(id) {
    setCompanyId(id);
    const st = window.STORES ? window.STORES.byId(id) : null;
    setTaxMode((st && st.taxDefault) || "none");
  }
  function addToCart(it) {
    setCart((c) => {
      const ex = c.find((l) => l.code === it.code);
      if (ex) return c.map((l) => (l.code === it.code ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { code: it.code, name: it.name, price: it.price, cost: it.cost || 0, qty: 1 }];
    });
  }
  const setLine = (code, patch) => setCart((c) => c.map((l) => (l.code === code ? { ...l, ...patch } : l)));
  const rmLine = (code) => setCart((c) => c.filter((l) => l.code !== code));

  const m = D.TAX.modes[taxMode] || { gst: 0, pst: 0 };
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const gst = +(subtotal * m.gst).toFixed(2);
  const pst = +(subtotal * m.pst).toFixed(2);
  const total = +(subtotal + gst + pst).toFixed(2);
  const cogs = +cart.reduce((s, l) => s + l.qty * (l.cost || 0), 0).toFixed(2);
  const units = cart.reduce((s, l) => s + l.qty, 0);
  const client = D.clients.find((c) => c.id === clientId);

  async function checkout() {
    if (!cart.length || total <= 0) return;
    const u = window.currentUser ? window.currentUser() : { id: "" };
    const adj = [], addedSales = [];
    cart.forEach((l) => {
      const it = D.inventory.find((x) => x.code === l.code);
      if (it) { it.stock = (it.stock || 0) - l.qty; adj.push([it, l.qty]); } // may go negative if oversold
      if (clientId) { const e = { date: D.today, code: l.code, clientId, qty: l.qty, price: l.price, disc: 0 }; D.itemSales.unshift(e); addedSales.push(e); }
    });
    const label = cart.length === 1 ? cart[0].name : (cart[0].name + " +" + (cart.length - 1) + " more");
    const sale = {
      id: "cs" + Date.now(), companyId, clientId: clientId || null,
      client: client ? client.name : "Walk-in", type: client ? client.type : "Retail",
      kind: "Sale", item: label, date: D.today,
      lines: cart.map((l) => ({ code: l.code, name: l.name, qty: l.qty, price: l.price, cost: l.cost || 0 })),
      subtotal: +subtotal.toFixed(2), gst, pst, total, cogs,
      method, sales: u.id || "", paid: total, owed: 0,
    };
    D.cashSales.unshift(sale);
    // Post the balanced journal entry and update account balances — the header
    // promises "stock + books update live", but previously no journal was ever
    // posted for POS sales, so the ledger silently diverged by all POS volume.
    const r2 = (n) => +(+n).toFixed(2);
    const isSvc = (l) => String(l.code || "").startsWith("SVC");
    const goodsRev = r2(cart.filter((l) => !isSvc(l)).reduce((s, l) => s + l.qty * l.price, 0));
    const svcRev = r2(subtotal - goodsRev);
    const cashAcct = method === "Cash" ? "1000" : "1010";
    const revAcct = client && client.type === "Wholesale" ? "4010" : "4000";
    const J = [];
    J.push({ acct: cashAcct, name: cashAcct === "1000" ? "Cash on Hand" : "Bank — Operating", dr: total, cr: 0 });
    if (goodsRev > 0.005) J.push({ acct: revAcct, name: revAcct === "4010" ? "Sales Revenue — Wholesale" : "Sales Revenue — Retail", dr: 0, cr: goodsRev });
    if (svcRev > 0.005) J.push({ acct: "4100", name: "Service & Repair Revenue", dr: 0, cr: svcRev });
    taxPostings(m, gst, pst).forEach((c) => { if (c.amount > 0.005) J.push({ acct: c.acct, name: c.acctName, dr: 0, cr: r2(c.amount) }); });
    if (cogs > 0.005) { J.push({ acct: "5000", name: "Cost of Goods Sold", dr: cogs, cr: 0 }); J.push({ acct: "1300", name: "Inventory", dr: 0, cr: cogs }); }
    const accSnap = JSON.parse(JSON.stringify(D.accounts || []));
    const je = { id: "JE-" + Math.floor(Math.random() * 9000 + 1000), date: D.today, memo: "Sale (POS) — " + (client ? client.name : "Walk-in") + " · " + label, lines: J };
    D.journal.unshift(je);
    J.forEach((l) => { const a = D.accounts.find((x) => x.code === l.acct); if (a) { const incDr = a.type === "Asset" || a.type === "Expense"; a.balance = +(a.balance + (incDr ? l.dr - l.cr : l.cr - l.dr)).toFixed(2); } });
    window.logAudit("CREATE", "POS sale", "sales", "POS", "POS sale " + fmt(total) + " · " + units + " unit" + (units === 1 ? "" : "s") + (storeObj ? " · " + storeObj.name : ""));
    const ok = window.persistNow ? await window.persistNow("cashSales", "inventory", "itemSales", "journal", "accounts") : true;
    if (!ok) {
      D.cashSales = D.cashSales.filter((s) => s !== sale);
      D.journal = D.journal.filter((j) => j !== je);
      D.accounts = accSnap;
      addedSales.forEach((e) => { const i = D.itemSales.indexOf(e); if (i >= 0) D.itemSales.splice(i, 1); });
      adj.forEach(([it, q]) => { it.stock += q; });
      pushToast && pushToast("Couldn't save — no connection. Your sale is kept on screen; please try again.");
      return;
    }
    pushToast && pushToast("Sale complete — " + fmt(total) + " · " + units + " item" + (units === 1 ? "" : "s"));
    setCart([]); setClientId("");
  }

  return (
    <div>
      <PageHead title="Point of Sale" sub={"Tap products to build a sale" + (storeObj ? " · " + storeObj.name : "")}
        actions={allowedStores.length > 1 ? (
          <div className="store-switch"><Icon name="store" size={15} />
            <select value={companyId} onChange={(e) => changeStore(e.target.value)}>
              {allowedStores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : null} />

      <div className="pos-grid">
        <div className="pos-catalog">
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search product or code…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="seg-filters">{cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
          </div>
          <div className="pos-products">
            {items.map((it) => (
              <button key={it.code} className="pos-tile" onClick={() => addToCart(it)} disabled={it.stock <= 0} title={it.stock <= 0 ? "Out of stock" : "Add to cart"}>
                <span className="pos-tile-name">{it.name}</span>
                <span className="pos-tile-meta"><span className="mono">{fmt(it.price)}</span><em className={it.stock <= (it.alert || 0) ? "low" : ""}>{it.stock} in stock</em></span>
              </button>
            ))}
            {!items.length && <Empty text="No products match." />}
          </div>
        </div>

        <aside className="pos-cart">
          <h3>Cart <span>{units} item{units === 1 ? "" : "s"}</span></h3>
          <div className="pos-cart-lines">
            {cart.length ? cart.map((l) => (
              <div className="pos-cart-line" key={l.code}>
                <div className="pcl-main"><strong>{l.name}</strong><span className="mono">{fmt(l.qty * l.price)}</span></div>
                <div className="pcl-ctrl">
                  <button onClick={() => setLine(l.code, { qty: Math.max(1, l.qty - 1) })}>−</button>
                  <input type="number" min="1" value={l.qty} onChange={(e) => setLine(l.code, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                  <button onClick={() => setLine(l.code, { qty: l.qty + 1 })}>+</button>
                  <span className="mono pcl-price">@ {fmt(l.price)}</span>
                  <button className="pcl-rm" onClick={() => rmLine(l.code)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            )) : <p className="rail-note">Cart is empty — tap a product to add it.</p>}
          </div>

          <div className="pos-fields">
            <Field label="Customer (optional)">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Walk-in</option>
                {D.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Tax">
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value)}>
                {D.TAX.order.map((k) => <option key={k} value={k}>{D.TAX.modes[k].label}</option>)}
              </select>
            </Field>
            <Field label="Payment">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {["Cash", "Debit", "Credit Card", "E-Transfer"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>

          <div className="pos-totals">
            <div><span>Subtotal</span><span className="mono">{fmt(subtotal)}</span></div>
            {gst > 0 && <div><span>GST</span><span className="mono">{fmt(gst)}</span></div>}
            {pst > 0 && <div><span>PST</span><span className="mono">{fmt(pst)}</span></div>}
            <div className="pos-grand"><span>Total</span><span className="mono">{fmt(total)}</span></div>
          </div>
          <Btn variant="primary" full icon="money" disabled={!cart.length || total <= 0} onClick={checkout}>Charge {fmt(total)}</Btn>
          {cart.length > 0 && <button className="link pos-clear" onClick={() => setCart([])}>Clear cart</button>}
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { POS });
