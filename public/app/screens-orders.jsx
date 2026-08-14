/* ============================================================
   BCCWE — Client Orders (online portal orders)
   Lifecycle: Ordering → Ordered → In Transit (+tracking)
              → Received (checklist + qty) → Discrepancy
   ============================================================ */

function orderSubtotal(o) { return o.lines.reduce((s, l) => s + l.qtyOrdered * l.price, 0); }
function orderUnits(o) { return o.lines.reduce((s, l) => s + l.qtyOrdered, 0); }
function orderReceived(o) { return o.lines.reduce((s, l) => s + (l.qtyReceived || 0), 0); }
function shortfallLines(o) { return o.lines.filter((l) => l.qtyOrdered > (l.qtyReceived || 0)); }
const ORDER_STATUS = ["Ordering", "Ordered", "In Transit", "Received", "Discrepancy"];

function Orders({ go, pushToast }) {
  const D = BCCWE;
  // A client login only sees its own orders; staff/admins see everything.
  const _clientId = window.sessionClientId ? window.sessionClientId() : "";
  const base = _clientId ? D.orders.filter((o) => o.clientId === _clientId) : D.orders;
  const [tab, setTab] = useState("all");
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [modal, setModal] = useState(null); // { type:'new'|'receive'|'view'|'transit', order? }
  const close = () => setModal(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("All");

  function persist() { bump(); }

  function markOrdered(o) { o.status = "Ordered"; o.note = "Order placed with supplier"; pushToast && pushToast(o.id + " marked as Ordered"); window.logAudit("UPDATE", "Order", "orders", o.id, "Order " + o.id + " marked Ordered"); persist(); }
  function markPaid(o) { o.paid = true; pushToast && pushToast(o.id + " marked as paid"); window.logAudit("UPDATE", "Order", "orders", o.id, "Order " + o.id + " marked paid"); persist(); }
  function setTransit(o, tracking) {
    o.status = "In Transit"; o.tracking = (tracking || "").trim();
    o.note = tracking ? "Shipped · tracking added" : "Shipped — no tracking yet";
    pushToast && pushToast(o.id + " is now In Transit" + (tracking ? " · " + tracking : ""));
    window.logAudit("UPDATE", "Order", "orders", o.id, "Order " + o.id + " marked In Transit");
    persist(); close();
  }
  function receiveOrder(o, received) {
    received.forEach((r) => {
      const line = o.lines.find((l) => l.code === r.code);
      if (!line) return;
      const qty = r.checked ? Math.max(0, Math.round(r.qty)) : 0;
      line.qtyReceived = qty;
      const it = itemByCode(r.code);
      if (it) it.stock += qty; // received units enter inventory
    });
    const short = o.lines.some((l) => (l.qtyReceived || 0) < l.qtyOrdered);
    o.status = short && o.paid ? "Discrepancy" : "Received";
    o.note = short ? "Short shipment — " + shortfallLines(o).reduce((s, l) => s + (l.qtyOrdered - (l.qtyReceived || 0)), 0) + " unit(s) outstanding" : "Delivered complete";
    pushToast && pushToast(o.status === "Discrepancy"
      ? o.id + " received with discrepancy — logged for follow-up"
      : o.id + " received in full · inventory updated");
    window.logAudit("POST", "Order", "orders", o.id, "Received order " + o.id + " into inventory");
    persist(); close();
  }
  function receiveRemaining(o) {
    o.lines.forEach((l) => {
      const gap = l.qtyOrdered - (l.qtyReceived || 0);
      if (gap > 0) { const it = itemByCode(l.code); if (it) it.stock += gap; l.qtyReceived = l.qtyOrdered; }
    });
    o.status = "Received"; o.note = "Discrepancy resolved — remaining units received";
    pushToast && pushToast(o.id + " discrepancy resolved · inventory updated");
    window.logAudit("POST", "Order", "orders", o.id, "Received order " + o.id + " into inventory");
    persist(); close();
  }
  function createOrder(data) {
    const id = "ORD-" + (D.nextOrderNo++);
    D.orders.unshift({
      id, clientId: data.clientId, placed: D.today, portal: data.portal,
      paid: data.paid, status: "Ordering", tracking: "",
      note: data.portal ? "Submitted via client portal" : "Created manually by staff",
      lines: data.lines,
      privateComments: data.privateNote ? [{ text: data.privateNote, at: D.today, by: "You" }] : [],
      clientComments: data.clientNote ? [{ text: data.clientNote, at: D.today, by: "You" }] : [],
    });
    pushToast && pushToast("New order " + id + " created");
    window.logAudit("CREATE", "Order", "orders", id, "Created client order · " + clientName(data.clientId));
    persist(); close();
  }
  function updateOrder(o, data) {
    o.clientId = data.clientId; o.paid = data.paid; o.lines = data.lines;
    pushToast && pushToast(o.id + " updated");
    window.logAudit("UPDATE", "Order", "orders", o.id, "Updated order " + o.id);
    persist(); close();
  }
  function deleteOrder(o) {
    D.orders = D.orders.filter((x) => x !== o);
    pushToast && pushToast(o.id + " deleted");
    window.logAudit("DELETE", "Order", "orders", o.id, "Deleted order " + o.id);
    persist(); close();
  }
  function addComment(o, kind, text) {
    const key = kind === "private" ? "privateComments" : "clientComments";
    if (!o[key]) o[key] = [];
    o[key].push({ text: text.trim(), at: D.today, by: "You" });
    pushToast && pushToast((kind === "private" ? "Private" : "Client") + " comment added to " + o.id);
    persist();
  }
  function removeComment(o, kind, idx) {
    const key = kind === "private" ? "privateComments" : "clientComments";
    if (o[key]) { o[key].splice(idx, 1); persist(); }
  }

  // ---- counts / kpis ----
  const inProgress = base.filter((o) => ["Ordering", "Ordered", "In Transit"].includes(o.status));
  const awaiting = base.filter((o) => o.status === "In Transit");
  const discOrders = base.filter((o) => o.paid && shortfallLines(o).length && (o.status === "Discrepancy" || o.status === "Received"));
  const discValue = discOrders.reduce((s, o) => s + shortfallLines(o).reduce((t, l) => t + (l.qtyOrdered - (l.qtyReceived || 0)) * l.price, 0), 0);

  const rows = base.filter((o) =>
    (statusF === "All" || o.status === statusF) &&
    (!q || (o.id + " " + clientName(o.clientId)).toLowerCase().includes(q.toLowerCase()))
  );

  const actionsFor = (o) => {
    if (o.status === "Ordering") return <>
      {!o.paid && <button className="icon-btn" title="Mark paid" onClick={() => markPaid(o)}><Icon name="money" size={15} /></button>}
      <Btn variant="primary" size="sm" icon="check" onClick={() => markOrdered(o)}>Mark Ordered</Btn>
    </>;
    if (o.status === "Ordered") return <Btn variant="primary" size="sm" icon="truck" onClick={() => setModal({ type: "transit", order: o })}>Mark In Transit</Btn>;
    if (o.status === "In Transit") return <Btn variant="primary" size="sm" icon="box" onClick={() => setModal({ type: "receive", order: o })}>Receive items</Btn>;
    if (o.status === "Discrepancy") return <Btn variant="ghost" size="sm" icon="check" onClick={() => setModal({ type: "view", order: o })}>Resolve</Btn>;
    return null;
  };

  return (
    <div>
      <PageHead title="Client Orders" sub={base.length + " orders · " + inProgress.length + " in progress · " + awaiting.length + " awaiting receipt"}
        actions={<>
          {(typeof navAllowed !== "function" || navAllowed("neworder")) && <Btn variant="primary" icon="cart" onClick={() => go("neworder")}>New order (catalog)</Btn>}
          <Btn variant="ghost" icon="plus" onClick={() => setModal({ type: "new" })}>Add order</Btn>
        </>} />

      <div className="portal-banner">
        <span className="pb-ico"><Icon name="user" size={17} /></span>
        <div className="pb-text"><strong>Client portal ordering</strong><span>Clients sign in online and submit their own orders. New submissions arrive here as <em>Ordering</em> — confirm and place them with your supplier, then track to delivery.</span></div>
        <span className="pb-dot"><i /> Portal live</span>
      </div>

      <div className="kpi-row">
        <MiniStat label="Open orders" value={inProgress.length} ico="order" />
        <MiniStat label="Awaiting receipt" value={awaiting.length} ico="truck" />
        <MiniStat label="Discrepancy items" value={discOrders.reduce((s, o) => s + shortfallLines(o).length, 0)} ico="alert" tone={discOrders.length ? "" : "green"} />
        <MiniStat label="Discrepancy value" value={fmt(discValue)} ico="money" />
      </div>

      <div className="tabs">
        <button className={"tab" + (tab === "all" ? " on" : "")} onClick={() => setTab("all")}>All orders <em>{base.length}</em></button>
        <button className={"tab" + (tab === "disc" ? " on" : "")} onClick={() => setTab("disc")}>Discrepancies <em>{discOrders.reduce((s, o) => s + shortfallLines(o).length, 0)}</em></button>
      </div>

      {tab === "all" ? (
        <Card pad={false}>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search order # or client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="seg-filters">
              {["All", ...ORDER_STATUS].map((s) => <button key={s} className={"chip" + (statusF === s ? " on" : "")} onClick={() => setStatusF(s)}>{s}</button>)}
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Order #</th><th>Client</th><th>Placed</th><th>Items</th><th>Tracking #</th><th className="r">Order value</th><th>Payment</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((o) => {
                const recv = orderReceived(o);
                const showRecv = ["Received", "Discrepancy"].includes(o.status);
                return (
                  <tr key={o.id}>
                    <td className="mono strong"><button className="link mono strong" onClick={() => setModal({ type: "view", order: o })}>{o.id}</button>{o.portal && <em className="cat-tag">portal</em>}</td>
                    <td><button className="link" onClick={() => go("client/" + o.clientId)}>{clientName(o.clientId)}</button></td>
                    <td className="muted">{shortDate(o.placed)}</td>
                    <td>{o.lines.length} line{o.lines.length === 1 ? "" : "s"} · {orderUnits(o)} unit{orderUnits(o) === 1 ? "" : "s"}{showRecv && <em className="cat-tag">{recv}/{orderUnits(o)} recv</em>}</td>
                    <td className="mono muted">{o.tracking || "—"}</td>
                    <td className="r mono">{fmt(orderSubtotal(o))}</td>
                    <td>{o.paid ? <Badge tone="green" dot>Paid</Badge> : <Badge tone="slate" dot>Unpaid</Badge>}</td>
                    <td><Badge tone={statusTone(o.status)} dot>{o.status}</Badge></td>
                    <td className="row-acts">
                      {actionsFor(o)}
                      <button className="icon-btn" title="Comments" onClick={() => setModal({ type: "view", order: o, focus: "comments" })}>
                        <Icon name="book" size={15} />
                        {(((o.privateComments || []).length) + ((o.clientComments || []).length)) > 0 && <em className="act-count">{((o.privateComments || []).length) + ((o.clientComments || []).length)}</em>}
                      </button>
                      <button className="icon-btn" title="Edit order" onClick={() => setModal({ type: "edit", order: o })}><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" title="Delete order" onClick={() => setModal({ type: "delete", order: o })}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan="9"><Empty icon="order" text="No orders match this view" /></td></tr>}
            </tbody>
          </table>
        </Card>
      ) : (
        <DiscrepancyView orders={discOrders} onResolve={receiveRemaining} onView={(o) => setModal({ type: "view", order: o })} />
      )}

      {(modal && modal.type === "new") && <OrderFormModal onSave={createOrder} onClose={close} />}
      {(modal && modal.type === "edit") && <OrderFormModal order={modal.order} onSave={(data) => updateOrder(modal.order, data)} onClose={close} />}
      {(modal && modal.type === "delete") && <DeleteOrderModal order={modal.order} onConfirm={() => deleteOrder(modal.order)} onClose={close} />}
      {(modal && modal.type === "transit") && <TransitModal order={modal.order} onSave={(t) => setTransit(modal.order, t)} onClose={close} />}
      {(modal && modal.type === "receive") && <ReceiveModal order={modal.order} onConfirm={(r) => receiveOrder(modal.order, r)} onClose={close} />}
      {(modal && modal.type === "view") && <OrderViewModal order={modal.order} focus={modal.focus} onClose={close}
        onAdvance={() => { const o = modal.order; if (o.status === "Ordering") markOrdered(o); else if (o.status === "Ordered") setModal({ type: "transit", order: o }); else if (o.status === "In Transit") setModal({ type: "receive", order: o }); }}
        onResolve={() => receiveRemaining(modal.order)} onPaid={() => markPaid(modal.order)}
        onEdit={() => setModal({ type: "edit", order: modal.order })} onDelete={() => setModal({ type: "delete", order: modal.order })}
        onAddComment={addComment} onRemoveComment={removeComment} go={go} />}
    </div>
  );
}

/* ---------------- Discrepancy register ---------------- */
function DiscrepancyView({ orders, onResolve, onView }) {
  const rows = [];
  orders.forEach((o) => shortfallLines(o).forEach((l) => rows.push({ o, l, short: l.qtyOrdered - (l.qtyReceived || 0) })));
  const totalShort = rows.reduce((s, r) => s + r.short, 0);
  const totalVal = rows.reduce((s, r) => s + r.short * r.l.price, 0);
  return (
    <Card pad={false}>
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13 }}>Items that were <strong>paid &amp; ordered</strong> but not received — short shipments awaiting supplier follow-up.</span>
      </div>
      <table className="data-table">
        <thead><tr><th>Order #</th><th>Client</th><th>Item</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Short</th><th className="r">Value short</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><button className="link mono strong" onClick={() => onView(r.o)}>{r.o.id}</button></td>
              <td>{clientName(r.o.clientId)}</td>
              <td><span className="mono">{r.l.code}</span><div className="muted" style={{ fontSize: 12 }}>{r.l.name}</div></td>
              <td className="r mono">{r.l.qtyOrdered}</td>
              <td className="r mono">{r.l.qtyReceived || 0}</td>
              <td className="r mono neg strong">{r.short}</td>
              <td className="r mono neg">{fmt(r.short * r.l.price)}</td>
              <td className="row-acts"><Btn variant="ghost" size="sm" icon="check" onClick={() => onResolve(r.o)}>Receive remaining</Btn></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="8"><Empty icon="check" text="No discrepancies — all paid orders fully received" /></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan="5">Total outstanding</td><td className="r mono strong neg">{totalShort}</td><td className="r mono strong neg">{fmt(totalVal)}</td><td /></tr></tfoot>}
      </table>
    </Card>
  );
}

/* ---------------- Add / edit order ---------------- */
function OrderFormModal({ order, onSave, onClose }) {
  const D = BCCWE;
  const isEdit = !!order;
  const portalClients = D.clients.filter((c) => c.id !== "c3");
  const [clientId, setClientId] = useState((order && order.clientId) || (portalClients[0] && portalClients[0].id));
  const [paid, setPaid] = useState(order ? !!order.paid : false);
  const [source, setSource] = useState(order ? (order.portal ? "portal" : "manual") : "manual");
  const [privateNote, setPrivateNote] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [lines, setLines] = useState(() =>
    (order ? order.lines.map((l, i) => ({ id: i + 1, code: l.code, qty: l.qtyOrdered }))
      : [{ id: 1, code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]));

  const upd = (id, code) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, code } : l)));
  const updQty = (id, qty) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, qty } : l)));
  const add = () => setLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]);
  const rm = (id) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));

  const built = lines.map((l) => { const it = itemByCode(l.code); return { code: l.code, name: it ? it.name : l.code, price: it ? it.price : 0, qty: Math.max(1, Math.round(l.qty || 1)) }; });
  const total = built.reduce((s, b) => s + b.price * b.qty, 0);
  const valid = clientId && built.length > 0;

  function submit() {
    if (!valid) return;
    onSave({
      clientId, paid, portal: source === "portal",
      privateNote: privateNote.trim(), clientNote: clientNote.trim(),
      lines: built.map((b) => ({ code: b.code, name: b.name, price: b.price, qtyOrdered: b.qty, qtyReceived: 0 })),
    });
  }

  return (
    <Modal title={isEdit ? "Edit order — " + order.id : "Add order"} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>{isEdit ? "Save changes" : "Create order"}</Btn>
      </>}>
      <p className="import-lead">{isEdit
        ? <>Update this order’s client, payment and lines. {order.status !== "Ordering" && <strong>Note: this order is already {order.status.toLowerCase()} — received quantities are unaffected.</strong>}</>
        : <>Create an order on behalf of a customer. It arrives in <strong>Ordering</strong> status, ready to confirm and place with your supplier.</>}</p>
      <div className="meta-grid">
        <Field label="Client" required>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {portalClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Payment" hint="Pre-paid or pay on delivery">
          <select value={paid ? "paid" : "unpaid"} onChange={(e) => setPaid(e.target.value === "paid")}>
            <option value="unpaid">Unpaid — pay on delivery</option>
            <option value="paid">Paid at checkout</option>
          </select>
        </Field>
        {!isEdit && (
          <Field label="Source" hint="Where the order originated">
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="manual">Manual — added by staff</option>
              <option value="portal">Client portal</option>
            </select>
          </Field>
        )}
      </div>
      <span className="field-label" style={{ marginTop: 14, display: "block" }}>Order lines</span>
      <div className="ord-lines">
        {lines.map((l) => {
          const it = itemByCode(l.code);
          return (
            <div className="ord-line" key={l.id}>
              <select value={l.code} onChange={(e) => upd(l.id, e.target.value)}>
                {D.inventory.map((i) => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
              </select>
              <label className="ord-qty">Qty<input type="number" min="1" value={l.qty || 1} onChange={(e) => updQty(l.id, +e.target.value)} /></label>
              <span className="ord-amt mono">{fmt((it ? it.price : 0) * Math.max(1, Math.round(l.qty || 1)))}</span>
              <button className="icon-btn line-del" onClick={() => rm(l.id)} title="Remove line"><Icon name="trash" size={15} /></button>
            </div>
          );
        })}
        <button className="qsl-add" onClick={add}><Icon name="plus" size={14} /> Add line</button>
      </div>
      {!isEdit && (
        <div className="meta-grid" style={{ marginTop: 14 }}>
          <Field label="Private comment" hint="Internal only — the client cannot see this">
            <textarea rows={2} value={privateNote} placeholder="e.g. Confirm stock with supplier before placing" onChange={(e) => setPrivateNote(e.target.value)} />
          </Field>
          <Field label="Client comment" hint="Shared with the client on their order">
            <textarea rows={2} value={clientNote} placeholder="e.g. Thanks for your order — we’ll update you on dispatch" onChange={(e) => setClientNote(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="purchase-summary">
        <div><span>Lines</span><strong className="mono">{built.length}</strong></div>
        <div><span>Units</span><strong className="mono">{built.reduce((s, b) => s + b.qty, 0)}</strong></div>
        <div><span>Order value</span><strong className="mono">{fmt(total)}</strong></div>
        <div className="ps-range">{paid ? "Paid at checkout" : "Unpaid"}</div>
      </div>
    </Modal>
  );
}

/* ---------------- Delete order ---------------- */
function DeleteOrderModal({ order, onConfirm, onClose }) {
  return (
    <Modal title="Delete order" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" icon="trash" onClick={onConfirm}>Delete order</Btn>
      </>}>
      <p className="confirm-lead">Permanently remove <strong className="mono">{order.id}</strong> for {clientName(order.clientId)}?</p>
      <div className="inline-note"><Icon name="alert" size={15} />This removes the order and its comments. {["Received", "Discrepancy"].includes(order.status) ? "Inventory already received is not reversed." : ""} This cannot be undone.</div>
    </Modal>
  );
}

/* ---------------- Mark In Transit (+ optional tracking) ---------------- */
function TransitModal({ order, onSave, onClose }) {
  const [tracking, setTracking] = useState(order.tracking || "");
  return (
    <Modal title={"Mark In Transit — " + order.id} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="truck" onClick={() => onSave(tracking)}>Mark In Transit</Btn>
      </>}>
      <p className="rail-note" style={{ marginBottom: 14 }}>The order has been placed and shipped. Add a tracking number now or later — it's optional.</p>
      <Field label="Tracking number" hint="Optional — carrier reference for this shipment">
        <input value={tracking} placeholder="e.g. 1Z 992A 0392 4471 8290" onChange={(e) => setTracking(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* ---------------- Receive items (checklist + editable qty) ---------------- */
function ReceiveModal({ order, onConfirm, onClose }) {
  const [rows, setRows] = useState(() => order.lines.map((l) => ({ code: l.code, name: l.name, ordered: l.qtyOrdered, price: l.price, checked: true, qty: l.qtyOrdered })));
  const set = (code, patch) => setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const recvTotal = rows.reduce((s, r) => s + (r.checked ? Math.max(0, Math.round(r.qty)) : 0), 0);
  const orderedTotal = rows.reduce((s, r) => s + r.ordered, 0);
  const short = rows.some((r) => (r.checked ? Math.max(0, Math.round(r.qty)) : 0) < r.ordered);

  return (
    <Modal title={"Receive items — " + order.id} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={() => onConfirm(rows)}>Confirm receipt</Btn>
      </>}>
      <p className="import-lead">Tick each product received and adjust the quantity if it differs from what was ordered. Received units are added to <strong>inventory</strong>{order.paid ? "; any shortfall on this paid order is logged as a discrepancy." : "."}</p>
      <table className="data-table receive-table">
        <thead><tr><th className="rc-check">Received</th><th>Item</th><th className="r">Ordered</th><th className="r">Receiving qty</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={r.checked ? "" : "rc-off"}>
              <td className="rc-check">
                <label className="rc-box"><input type="checkbox" checked={r.checked} onChange={(e) => set(r.code, { checked: e.target.checked })} /><span className="rc-mark"><Icon name="check" size={13} /></span></label>
              </td>
              <td><span className="mono strong">{r.code}</span><div className="muted" style={{ fontSize: 12 }}>{r.name}</div></td>
              <td className="r mono">{r.ordered}</td>
              <td className="r">
                <input className="rc-qty" type="number" min="0" disabled={!r.checked} value={r.checked ? r.qty : 0}
                  onChange={(e) => set(r.code, { qty: Math.max(0, +e.target.value) })} />
                {r.checked && Math.round(r.qty) !== r.ordered && <em className={"rc-flag " + (Math.round(r.qty) < r.ordered ? "neg" : "pos")}>{Math.round(r.qty) < r.ordered ? "short " + (r.ordered - Math.round(r.qty)) : "+" + (Math.round(r.qty) - r.ordered)}</em>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td /><td>Receiving {recvTotal} of {orderedTotal} units</td><td /><td className="r mono strong">{recvTotal}</td></tr></tfoot>
      </table>
      {short && <div className="inline-note"><Icon name="alert" size={15} />{order.paid ? "Short shipment on a paid order — outstanding units will appear under Discrepancies for supplier follow-up." : "Receiving fewer units than ordered. Only received units are added to inventory."}</div>}
    </Modal>
  );
}

/* ---------------- Order detail ---------------- */
function OrderViewModal({ order, focus, onClose, onAdvance, onResolve, onPaid, onEdit, onDelete, onAddComment, onRemoveComment, go }) {
  const o = order;
  const recv = orderReceived(o);
  const short = shortfallLines(o);
  const stepIdx = ORDER_STATUS.indexOf(o.status === "Discrepancy" ? "Received" : o.status);
  const steps = ["Ordering", "Ordered", "In Transit", "Received"];
  const facts = [
    ["Client", clientName(o.clientId)],
    ["Placed", shortDate(o.placed)],
    ["Source", o.portal ? "Client portal" : "Manual"],
    ["Payment", o.paid ? "Paid" : "Unpaid"],
    ["Tracking #", o.tracking || "—"],
    ["Order value", fmt(orderSubtotal(o))],
  ];
  const advanceLabel = { Ordering: "Mark as Ordered", Ordered: "Mark In Transit", "In Transit": "Receive items" }[o.status];

  return (
    <Modal title={o.id} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn variant="ghost" icon="trash" onClick={onDelete}>Delete</Btn>
        <Btn variant="ghost" icon="edit" onClick={onEdit}>Edit</Btn>
        {!o.paid && <Btn variant="ghost" icon="money" onClick={onPaid}>Mark paid</Btn>}
        {advanceLabel && <Btn variant="primary" icon="check" onClick={onAdvance}>{advanceLabel}</Btn>}
        {o.status === "Discrepancy" && <Btn variant="primary" icon="check" onClick={onResolve}>Receive remaining</Btn>}
      </>}>
      <div className="iv-head">
        <div><h4 className="iv-name">{clientName(o.clientId)}</h4><span className="cat-tag">{o.portal ? "Client portal order" : "Manual order"}</span></div>
        <Badge tone={statusTone(o.status)} dot>{o.status}</Badge>
      </div>

      <div className="ord-steps">
        {steps.map((s, i) => (
          <div key={s} className={"ord-step" + (i <= stepIdx ? " done" : "") + (i === stepIdx && o.status !== "Received" && o.status !== "Discrepancy" ? " cur" : "")}>
            <span className="ord-step-dot">{i < stepIdx || o.status === "Received" ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="ord-step-lbl">{s}</span>
          </div>
        ))}
      </div>
      {o.status === "Discrepancy" && <div className="inline-note" style={{ marginTop: 0 }}><Icon name="alert" size={15} />Paid &amp; ordered but short {short.reduce((s, l) => s + (l.qtyOrdered - (l.qtyReceived || 0)), 0)} unit(s). Listed under Discrepancies.</div>}

      <div className="iv-facts">
        {facts.map(([k, v]) => <div className="iv-fact" key={k}><span>{k}</span><strong className="mono">{v}</strong></div>)}
      </div>

      <h5 className="iv-sec">Order lines</h5>
      <table className="data-table">
        <thead><tr><th>Item</th><th className="r">Unit price</th><th className="r">Ordered</th>{(o.status === "Received" || o.status === "Discrepancy") && <th className="r">Received</th>}<th className="r">Line total</th></tr></thead>
        <tbody>
          {o.lines.map((l) => {
            const showRecv = o.status === "Received" || o.status === "Discrepancy";
            const lShort = l.qtyOrdered > (l.qtyReceived || 0);
            return (
              <tr key={l.code}>
                <td><span className="mono strong">{l.code}</span><div className="muted" style={{ fontSize: 12 }}>{l.name}</div></td>
                <td className="r mono">{fmt(l.price)}</td>
                <td className="r mono">{l.qtyOrdered}</td>
                {showRecv && <td className={"r mono" + (lShort ? " neg strong" : "")}>{l.qtyReceived || 0}{lShort ? " ⚠" : ""}</td>}
                <td className="r mono">{fmt(l.price * l.qtyOrdered)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td colSpan={(o.status === "Received" || o.status === "Discrepancy") ? 4 : 3}>{o.lines.length} lines · {orderUnits(o)} units{(o.status === "Received" || o.status === "Discrepancy") ? " · " + recv + " received" : ""}</td><td className="r mono strong">{fmt(orderSubtotal(o))}</td></tr></tfoot>
      </table>

      <OrderComments order={o} focus={focus} onAdd={onAddComment} onRemove={onRemoveComment} />
    </Modal>
  );
}

/* ---------------- Order comments (private + client-visible) ---------------- */
function OrderComments({ order, focus, onAdd, onRemove }) {
  const [kind, setKind] = useState("private");
  const [text, setText] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (focus === "comments" && ref.current) ref.current.focus(); }, [focus]);
  const list = kind === "private" ? (order.privateComments || []) : (order.clientComments || []);
  const submit = () => { if (text.trim()) { onAdd(order, kind, text); setText(""); } };

  return (
    <div className="ord-comments">
      <h5 className="iv-sec">Comments</h5>
      <div className="oc-tabs">
        <button className={"oc-tab" + (kind === "private" ? " on" : "")} onClick={() => setKind("private")}>
          <Icon name="lock" size={14} /> Private <em>{(order.privateComments || []).length}</em>
        </button>
        <button className={"oc-tab" + (kind === "client" ? " on" : "")} onClick={() => setKind("client")}>
          <Icon name="eye" size={14} /> Client-visible <em>{(order.clientComments || []).length}</em>
        </button>
      </div>
      <div className={"oc-banner oc-" + kind}>
        <Icon name={kind === "private" ? "lock" : "user"} size={14} />
        {kind === "private" ? "Internal notes — visible to staff only. The client never sees these." : "Visible to the client on their order in the portal."}
      </div>
      <div className="oc-list">
        {list.length === 0 && <div className="oc-empty">No {kind === "private" ? "private" : "client"} comments yet.</div>}
        {list.map((c, i) => (
          <div className="oc-item" key={i}>
            <div className="oc-meta"><strong>{c.by || "You"}</strong><span>{shortDate(c.at)}</span></div>
            <p className="oc-text">{c.text}</p>
            <button className="icon-btn oc-del" title="Delete comment" onClick={() => onRemove(order, kind, i)}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      <div className="oc-compose">
        <textarea ref={ref} rows={2} value={text} placeholder={kind === "private" ? "Add an internal note…" : "Write a message the client will see…"}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
        <Btn variant="primary" size="sm" icon="send" disabled={!text.trim()} onClick={submit}>Add {kind === "private" ? "private" : "client"} comment</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { Orders });
