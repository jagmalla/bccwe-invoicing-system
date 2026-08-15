/* ============================================================
   BCCWE — Client ordering portal ("New Order")
   Clients pick a category, enter quantities against a reference
   price (their last purchase, else the list price), add to cart,
   then check out to place an order.
   ============================================================ */
function ClientShop({ pushToast, go }) {
  const D = BCCWE;
  if (!Array.isArray(D.catTree)) D.catTree = (D.categories || []).map((n) => ({ name: n, subs: [] }));
  const isClient = window.isClientUser ? window.isClientUser() : false;
  // sessionClientId() reliably resolves the client this login represents (by uid,
  // email or name). The old lookup matched user.id against session.userId — but
  // session.userId is the email/name, so it never matched, `fixedClientId` was
  // always empty, and a client login defaulted to D.clients[0] — showing (and
  // ordering at) ANOTHER client's prices. Lock a client login to its own account.
  const fixedClientId = window.sessionClientId ? window.sessionClientId() : "";
  const [clientId, setClientId] = useState(fixedClientId || (isClient ? "" : ((D.clients[0] && D.clients[0].id) || "")));
  const [cat, setCat] = useState((D.catTree[0] && D.catTree[0].name) || "All");
  const [sub, setSub] = useState("All");
  const [qtys, setQtys] = useState({});      // { code: qty } for the current selection
  const [cart, setCart] = useState([]);       // { code, name, price, qty }

  const catObj = D.catTree.find((c) => c.name === cat);
  const subs = (catObj && catObj.subs) || [];

  function refPrice(code) {
    const hist = (D.itemSales || []).filter((s) => s.clientId === clientId && s.code === code)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (hist.length) { const h = hist[0]; return +(h.price * (1 - (h.disc || 0) / 100)).toFixed(2); }
    const it = D.inventory.find((i) => i.code === code);
    return it ? it.price : 0;
  }
  const everBought = (code) => (D.itemSales || []).some((s) => s.clientId === clientId && s.code === code);

  const list = D.inventory.filter((i) =>
    (cat === "All" || i.cat === cat) && (sub === "All" || (i.subcat || "") === sub));

  const setQ = (code, v) => setQtys((m) => Object.assign({}, m, { [code]: Math.max(0, parseInt(v, 10) || 0) }));

  function addToCart() {
    const picks = list.filter((i) => (qtys[i.code] || 0) > 0);
    if (!picks.length) { pushToast && pushToast("Enter a quantity first"); return; }
    setCart((c) => {
      const next = c.slice();
      picks.forEach((it) => {
        const qty = qtys[it.code];
        const ex = next.find((l) => l.code === it.code);
        if (ex) ex.qty += qty;
        else next.push({ code: it.code, name: it.name, price: refPrice(it.code), qty });
      });
      return next;
    });
    setQtys((m) => { const n = Object.assign({}, m); picks.forEach((p) => delete n[p.code]); return n; });
    pushToast && pushToast(picks.length + " product" + (picks.length === 1 ? "" : "s") + " added to cart");
  }
  const rmCart = (code) => setCart((c) => c.filter((l) => l.code !== code));
  const cartTotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const cartUnits = cart.reduce((s, l) => s + l.qty, 0);

  async function checkout() {
    if (!cart.length || !clientId) return;
    // Server-side atomic order number; local counter only as offline fallback.
    let no = "ORD-" + (D.nextOrderNo || 1000);
    const alloc = window.allocateNumber ? await window.allocateNumber("order") : null;
    if (alloc) { no = alloc.no; if (alloc.next) D.nextOrderNo = Math.max(D.nextOrderNo || 0, alloc.next); }
    let _g = 0;
    while (D.orders.some((o) => o.id === no) && _g++ < 500) {
      const m = /^(.*?)(\d+)$/.exec(no);
      no = m ? m[1] + (parseInt(m[2], 10) + 1) : no + "-2";
    }
    const order = {
      id: no, clientId, placed: D.today, portal: true, paid: false, status: "Ordering", tracking: "",
      note: "Placed via client portal",
      lines: cart.map((l) => ({ code: l.code, name: l.name, price: l.price, qtyOrdered: l.qty, qtyReceived: 0 })),
    };
    D.orders.unshift(order);
    if (!alloc) D.nextOrderNo = (D.nextOrderNo || 1000) + 1;
    window.logAudit("CREATE", "Order", "orders", no, "Placed order " + no + " · " + cartUnits + " unit" + (cartUnits === 1 ? "" : "s") + " · " + clientName(clientId));
    const ok = window.persistNow ? await window.persistNow("orders") : true;
    if (!ok) {
      D.orders = D.orders.filter((o) => o !== order);
      if (!alloc) D.nextOrderNo = (D.nextOrderNo || 1001) - 1; // server-allocated numbers stay consumed (gap, never duplicate)
      pushToast && pushToast("Couldn't place the order — no connection. Your cart is kept; please try again.");
      return;
    }
    pushToast && pushToast("Order " + no + " placed — we'll confirm shortly");
    setCart([]); setQtys({});
    go && go("orders");
  }

  return (
    <div>
      <PageHead title="New Order" sub="Choose a category, set quantities, add to cart, then check out."
        actions={!isClient && !fixedClientId ? (
          <Field label="">
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setCart([]); }}>
              {D.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        ) : null} />

      <div className="shop-grid">
        <div className="shop-cats">
          <span className="shop-cat-lbl">Categories</span>
          <button className={"shop-cat" + (cat === "All" ? " on" : "")} onClick={() => { setCat("All"); setSub("All"); }}>All products</button>
          {D.catTree.map((c) => (
            <button key={c.name} className={"shop-cat" + (cat === c.name ? " on" : "")} onClick={() => { setCat(c.name); setSub("All"); }}>{c.name}</button>
          ))}
        </div>

        <div className="shop-main">
          {subs.length > 0 && (
            <div className="seg-filters shop-subs">
              <button className={"chip" + (sub === "All" ? " on" : "")} onClick={() => setSub("All")}>All {cat}</button>
              {subs.map((s) => <button key={s} className={"chip" + (sub === s ? " on" : "")} onClick={() => setSub(s)}>{s}</button>)}
            </div>
          )}
          <div className="shop-note"><Icon name="alert" size={14} /> Not actual price, this is average price for reference. Prices may change.</div>
          <Card pad={false}>
            <table className="data-table">
              <thead><tr><th>Product</th><th className="r">Reference price</th><th className="r">In stock</th><th style={{ width: 120, textAlign: "center" }}>Quantity</th></tr></thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.code}>
                    <td><strong>{it.name}</strong><em className="cat-tag" style={{ marginLeft: 6 }}>{it.code}</em></td>
                    <td className="r mono">{fmt(refPrice(it.code))}{!everBought(it.code) && <em className="shop-ref" title="No prior purchase — list price shown"> ref</em>}</td>
                    <td className="r muted">{it.stock}</td>
                    <td style={{ textAlign: "center" }}>
                      <input type="number" min="0" value={qtys[it.code] || ""} placeholder="0"
                        onChange={(e) => setQ(it.code, e.target.value)} style={{ width: 72, textAlign: "center" }} />
                    </td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="4"><Empty text="No products in this category." /></td></tr>}
              </tbody>
            </table>
          </Card>
          <div style={{ marginTop: 12 }}>
            <Btn variant="primary" icon="cart" onClick={addToCart}>Add to cart</Btn>
          </div>
        </div>

        <aside className="shop-cart">
          <h3>Cart <span>{cartUnits} item{cartUnits === 1 ? "" : "s"}</span></h3>
          <div className="shop-cart-lines">
            {cart.length ? cart.map((l) => (
              <div className="shop-cart-line" key={l.code}>
                <div><strong>{l.name}</strong><span className="muted"> ×{l.qty}</span></div>
                <div className="scl-right"><span className="mono">{fmt(l.qty * l.price)}</span><button onClick={() => rmCart(l.code)}><Icon name="x" size={12} /></button></div>
              </div>
            )) : <p className="rail-note">Your cart is empty. Add products from any category, then check out.</p>}
          </div>
          {cart.length > 0 && (
            <div className="shop-cart-total"><span>Estimated total</span><strong className="mono">{fmt(cartTotal)}</strong></div>
          )}
          <Btn variant="primary" full icon="check" disabled={!cart.length || !clientId} onClick={checkout}>Place order</Btn>
          <p className="rail-note" style={{ marginTop: 8 }}>Final prices are confirmed by the seller after the order is placed.</p>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { ClientShop });
