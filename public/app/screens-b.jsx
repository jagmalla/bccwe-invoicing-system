/* ============================================================
   BCCWE — Inventory, Sales, Expenses
   ============================================================ */

/* ---------------- Inventory ---------------- */
const PAGE_SIZES = [10, 25, 50, 100, "All"];

function MoveBadge({ item }) {
  const mv = window.STOCK.movement(item);
  const tone = mv.label === "Fast" ? "green" : mv.label === "Steady" ? "blue" : mv.label === "Slow" ? "amber" : "slate";
  return <Badge tone={tone} dot>{mv.label}{mv.u90 ? " · " + mv.perMonth + "/mo" : ""}</Badge>;
}
function AgeCell({ item }) {
  const S = window.STOCK, age = S.ageDays(item);
  return <span className={"age-cell" + (age >= S.AGE_DEAD ? " dead" : age >= S.AGE_NOTMOVING ? " old" : "")}>{item.purchased ? shortDate(item.purchased) : "—"}<em className="age-days">{age}d</em></span>;
}

// Layered average cost of the stock on hand: walk received purchases newest
// first, covering the current quantity, and weight each layer's landed cost.
// e.g. 12 in stock, last receipt 10 @ $1 + prior 2 @ $2 ⇒ $14 / 12 = $1.17 avg.
// Flatten purchase orders into individual item lines, handling both the new
// grouped shape ({lines:[...]}) and legacy flat records ({code, qty, ...}).
function poFlatLines(filterFn) {
  const out = [];
  (BCCWE.purchaseOrders || []).forEach((po) => {
    if (Array.isArray(po.lines)) {
      po.lines.forEach((l) => out.push(Object.assign({}, l, { po: po.po, ref: po.ref || po.po, date: po.date, status: po.status, supplier: po.supplier })));
    } else {
      out.push({ code: po.code, name: po.items, qty: po.qty, bonusQty: po.bonusQty, cost: po.landedUnit, price: 0, landedUnit: po.landedUnit, qtyReceived: po.qtyReceived, po: po.po, ref: po.po, date: po.date, status: po.status, supplier: po.supplier });
    }
  });
  return filterFn ? out.filter(filterFn) : out;
}
function itemAvgCost(item) {
  const stock = Math.max(0, item.stock || 0);
  // Include Partial receipts — their received units are already in stock at
  // their landed cost, so skipping them made avg/last diverge from the moving
  // average actually applied at receive time.
  const recs = poFlatLines((p) => p.code === item.code && (p.status === "Received" || p.status === "Partial") && ((p.qtyReceived == null) || p.qtyReceived > 0))
    .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = recs.length && recs[0].landedUnit != null ? recs[0].landedUnit : (item.cost || 0);
  if (stock <= 0) return { avg: item.cost || 0, last, layers: [] };
  let remaining = stock, totalCost = 0, counted = 0;
  const layers = [];
  for (let k = 0; k < recs.length && remaining > 0; k++) {
    const p = recs[k];
    // Bonus units only fold in once the line is fully received (that's when the
    // receive flow adds them to stock).
    const gotAll = p.qtyReceived == null || p.qtyReceived >= (p.qty || 0);
    const have = ((p.qtyReceived != null ? p.qtyReceived : p.qty) || 0) + (gotAll ? (p.bonusQty || 0) : 0);
    const qty = Math.min(remaining, have);
    const unit = p.landedUnit != null ? p.landedUnit : (item.cost || 0);
    if (qty > 0) { totalCost += qty * unit; counted += qty; remaining -= qty; layers.push({ qty, unit, date: p.date }); }
  }
  if (remaining > 0) { totalCost += remaining * (item.cost || 0); counted += remaining; } // stock beyond purchase history
  const avg = counted > 0 ? +(totalCost / counted).toFixed(2) : (item.cost || 0);
  return { avg, last, layers, totalValue: +totalCost.toFixed(2) };
}

// Double-click-to-edit money cell (admin only) for quick bulk price/cost work
// on the stock list — no modal round-trip. Enter or clicking away saves; Esc
// cancels. Non-admins just see the plain value.
function EditCell({ canEdit, value, display, title, onSave, allowNeg, integer }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  if (!canEdit) return <>{display}</>;
  if (!editing) {
    return (
      <span className="editcell" title={title || "Double-click to edit"}
        onDoubleClick={() => { setVal(String(value != null ? value : 0)); setEditing(true); }}>
        {display}
      </span>
    );
  }
  const commit = () => {
    if (!editing) return;
    setEditing(false);
    const n = parseFloat(val);
    if (isNaN(n)) return;                     // invalid input → keep the old value
    if (!allowNeg && n < 0) return;           // negatives not permitted for this field
    const r = integer ? Math.round(n) : Math.round(n * 100) / 100;
    const tol = integer ? 0.5 : 0.005;
    if (Math.abs(r - (value || 0)) < tol) return; // unchanged
    onSave(r);
  };
  return (
    <input ref={ref} type="number" min={allowNeg ? undefined : "0"} step={integer ? "1" : "0.01"} value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setEditing(false); }}
      style={{ width: 80, textAlign: "right", padding: "4px 6px", border: "1.5px solid #ea580c", borderRadius: 6, font: "inherit", background: "#fff" }} />
  );
}

// Restricted product list for client logins: name + their reference price only.
// No cost, supplier, stock, margin or other sensitive data.
function ClientCatalog() {
  const D = BCCWE;
  const clientId = window.sessionClientId ? window.sessionClientId() : "";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const refPrice = (code) => {
    const h = window.clientPurchaseHistory ? window.clientPurchaseHistory(clientId, code, 1) : [];
    if (h.length) return +(h[0].price * (1 - (h[0].disc || 0) / 100)).toFixed(2);
    const it = D.inventory.find((i) => i.code === code); return it ? it.price : 0;
  };
  const everBought = (code) => clientId && window.clientPurchaseHistory && window.clientPurchaseHistory(clientId, code, 1).length > 0;
  const cats = ["All", ...Array.from(new Set(D.inventory.map((i) => i.cat).filter(Boolean)))];
  const ql = q.trim().toLowerCase();
  const list = D.inventory.filter((i) => (cat === "All" || i.cat === cat) && (!ql || (i.name + " " + i.cat).toLowerCase().includes(ql)));
  return (
    <div>
      <PageHead title="Products" sub="Browse products and your prices" />
      <div className="shop-note" style={{ marginBottom: 12 }}><Icon name="alert" size={14} /> Prices shown are for reference based on your history and may change.</div>
      <Card pad={false}>
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="seg-filters">{cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
        </div>
        <table className="data-table">
          <thead><tr><th>Product</th><th>Category</th><th className="r">Your price</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.code}>
                <td className="strong">{i.name}</td>
                <td className="muted">{i.cat}{i.subcat ? " › " + i.subcat : ""}</td>
                <td className="r mono">{fmt(refPrice(i.code))}{!everBought(i.code) && <em className="shop-ref" style={{ marginLeft: 4 }}>ref</em>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="3"><Empty icon="box" text="No products found" /></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Inventory({ go, pushToast, initTab }) {
  if (window.isClientUser && window.isClientUser()) return <ClientCatalog />;
  const D = BCCWE;
  // initTab lets the Purchase Orders menu item open this screen on that tab.
  const [tab, setTab] = useState(initTab || "stock");
  const [poView, setPoView] = useState("orders"); // orders | items
  const [poExpand, setPoExpand] = useState({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("code_asc");
  const [moveFilter, setMoveFilter] = useState("All");
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  // modal: { type: 'add'|'edit'|'view'|'delete'|'import'|'purchase', item? }
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);

  // pagination
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const invtSorts = {
    code_asc: { label: "Item code — A to Z", get: (i) => i.code, dir: "asc" },
    name_asc: { label: "Name — A to Z", get: (i) => i.name, dir: "asc" },
    profit_desc: { label: "Unit margin — high to low", get: (i) => i.price - i.cost, dir: "desc" },
    profit_asc: { label: "Unit margin — low to high", get: (i) => i.price - i.cost, dir: "asc" },
    price_desc: { label: "Price — high to low", get: (i) => i.price, dir: "desc" },
    price_asc: { label: "Price — low to high", get: (i) => i.price, dir: "asc" },
    stock_asc: { label: "Stock — low to high", get: (i) => i.stock, dir: "asc" },
    stock_desc: { label: "Stock — high to low", get: (i) => i.stock, dir: "desc" },
    age_desc: { label: "Oldest stock first", get: (i) => window.STOCK.ageDays(i), dir: "desc" },
    move_desc: { label: "Fastest moving", get: (i) => window.STOCK.movement(i).perMonth, dir: "desc" },
    move_asc: { label: "Slowest moving", get: (i) => window.STOCK.movement(i).perMonth, dir: "asc" },
  };

  const cats = ["All", ...Array.from(new Set(D.inventory.map((i) => i.cat)))];
  const moveOk = (i) => {
    if (moveFilter === "All") return true;
    const st = window.STOCK.state(i);
    if (moveFilter === "Not moving") return st === "notmoving";
    if (moveFilter === "Dead") return st === "dead";
    return window.STOCK.movement(i).label === moveFilter;
  };
  const rows = applySort(D.inventory.filter((i) =>
    (cat === "All" || i.cat === cat) && moveOk(i) &&
    (!q || (i.name + i.code).toLowerCase().includes(q.toLowerCase()))), sort, invtSorts);

  const per = pageSize === "All" ? rows.length || 1 : pageSize;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const curPage = Math.min(page, pages - 1);
  const slice = rows.slice(curPage * per, curPage * per + per);
  const resetPage = () => setPage(0);

  const stockValue = D.inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const retailValue = D.inventory.reduce((s, i) => s + i.stock * i.price, 0);
  const lowCount = D.inventory.filter((i) => i.kind !== "Service" && (i.alert || 0) > 0 && i.stock <= i.alert).length;

  // ---- CRUD handlers ----
  // Quick double-click editing of cost/price straight in the table — admin only.
  const _canInlineEdit = !!(window.STORES && window.STORES.isAdmin());
  function inlineUpdate(item, field, v) {
    const old = item[field] || 0;
    item[field] = v;
    const label = field === "price" ? "Price" : field === "cost" ? "Cost" : "Stock";
    const money = field !== "stock";
    const show = (n) => money ? fmt(n) : String(n);
    window.logAudit("UPDATE", "Product", "inventory_items", item.code,
      label + " " + item.code + " " + show(old) + " → " + show(v) + " (quick edit)");
    if (window.persist) window.persist("inventory");
    pushToast && pushToast(item.code + " " + label.toLowerCase() + " " + show(old) + " → " + show(v));
    bump();
  }

  // Export EVERY product to a spreadsheet in one click. The first nine columns
  // use the exact Import-CSV headers, so an exported file re-imports cleanly
  // (extra computed columns are ignored on import); the rest are read-only
  // reporting fields. Exports all products, not just the current filter/page.
  function exportInventory() {
    const items = D.inventory.slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const cols = [
      { key: "code", label: "Item Code" },
      { key: "name", label: "Description" },
      { key: "cat", label: "Category" },
      { key: "supplier", label: "Supplier" },
      { key: "cost", label: "Cost Price", type: "number" },
      { key: "price", label: "Sales Price", type: "number" },
      { key: "stock", label: "Stock", type: "number" },
      { key: "bonus", label: "Bonus", type: "number" },
      { key: "alert", label: "Stock Alert", type: "number" },
      { key: "avgCost", label: "Avg Cost", type: "number" },
      { key: "lastCost", label: "Last Cost", type: "number" },
      { key: "margin", label: "Unit Margin", type: "number" },
      { key: "marginPct", label: "Margin %", type: "number" },
      { key: "stockValue", label: "Stock Value (cost)", type: "number" },
      { key: "retailValue", label: "Retail Value", type: "number" },
      { key: "purchased", label: "Purchased" },
      { key: "status", label: "Status" },
    ];
    let totCost = 0, totRetail = 0;
    const data = items.map((i) => {
      const ac = (typeof itemAvgCost === "function") ? itemAvgCost(i) : { avg: i.cost || 0, last: i.cost || 0 };
      const isService = i.kind === "Service";
      const stock = isService ? 0 : (i.stock || 0);
      const margin = (i.price || 0) - (i.cost || 0);
      const marginPct = i.price ? Math.round((margin / i.price) * 100) : 0;
      const stockValue = +(stock * (ac.avg || 0)).toFixed(2);
      const retailValue = +(stock * (i.price || 0)).toFixed(2);
      totCost += stockValue; totRetail += retailValue;
      let status = "Service";
      if (!isService) {
        const low = (i.alert || 0) > 0 && stock <= i.alert;
        const st = window.STOCK ? window.STOCK.state(i) : "active";
        const flags = [];
        if (low) flags.push("Low");
        if (st === "dead") flags.push("Dead");
        else if (st === "notmoving") flags.push("Not moving");
        status = flags.length ? flags.join(" · ") : "In stock";
      }
      return {
        code: i.code, name: i.name || "", cat: i.cat || "", supplier: supplierName(i.supplier),
        cost: +(i.cost || 0).toFixed(2), price: +(i.price || 0).toFixed(2),
        stock, bonus: i.bonus || 0, alert: i.alert || 0,
        avgCost: +(ac.avg || 0).toFixed(2), lastCost: +(ac.last || 0).toFixed(2),
        margin: +margin.toFixed(2), marginPct,
        stockValue, retailValue,
        purchased: i.purchased || "", status,
      };
    });
    exportXlsx("BCCWE-Inventory", "Inventory", cols, data, {
      title: "BCCWE — Inventory (all products)",
      subtitle: items.length + " products · " + fmt(totCost) + " at cost · " + fmt(totRetail) + " retail",
      totals: { stockValue: +totCost.toFixed(2), retailValue: +totRetail.toFixed(2) },
    });
    window.logDownload && window.logDownload({ kind: "XLSX", file: "BCCWE-Inventory.xlsx", docNo: "", clientId: "" });
    window.logAudit && window.logAudit("DOWNLOAD", "Inventory", "inventory_items", "BCCWE-Inventory.xlsx", "Exported " + items.length + " products to Excel");
    pushToast && pushToast("Exported " + items.length + " products");
  }

  function saveItem(data, original) {
    // Record stock entered on the item form as a purchase, so it shows up in the
    // item's purchase history with its quantity (and builds a cost layer).
    const logStockPO = (qty, bonus, label) => {
      if ((qty || 0) <= 0 && (bonus || 0) <= 0) return;
      D.purchaseOrders.unshift({
        po: (original ? "ADJ-" : "OPEN-") + data.code + "-" + Date.now().toString(36).slice(-4),
        supplier: data.supplier || "", date: data.purchased || D.today,
        code: data.code, qty: qty || 0, bonusQty: bonus || 0, landedUnit: data.cost || 0,
        qtyReceived: qty || 0, status: "Received",
        total: +((qty || 0) * (data.cost || 0)).toFixed(2),
        items: data.name + " ×" + (qty || 0) + (bonus ? " (+" + bonus + " bonus)" : "") + " · " + label,
      });
    };
    if (original) {
      const prevStock = original.stock || 0, prevBonus = original.bonus || 0;
      Object.assign(original, data);
      const addStock = (data.stock || 0) - prevStock, addBonus = (data.bonus || 0) - prevBonus;
      if (addStock > 0 || addBonus > 0) logStockPO(Math.max(0, addStock), Math.max(0, addBonus), "stock added");
      pushToast && pushToast("Saved changes to " + data.code);
      window.logAudit("UPDATE", "Product", "inventory_items", data.code, "Edited product " + data.name + " · cost " + fmt(data.cost) + " / price " + fmt(data.price) + " · stock " + data.stock);
    } else {
      D.inventory.push({ ...data });
      logStockPO(data.stock || 0, data.bonus || 0, "opening stock");
      pushToast && pushToast("Added " + data.code + " to inventory");
      window.logAudit("CREATE", "Product", "inventory_items", data.code, "Added product " + data.name + " · cost " + fmt(data.cost) + " / price " + fmt(data.price));
    }
    if (window.persist) window.persist("inventory", "purchaseOrders");
    bump(); close();
  }
  function deleteItem(item) {
    const idx = D.inventory.indexOf(item);
    if (idx >= 0) D.inventory.splice(idx, 1);
    pushToast && pushToast("Deleted " + item.code + " from inventory");
    window.logAudit("DELETE", "Product", "inventory_items", item.code, "Deleted product " + item.code + " · " + item.name);
    bump(); close();
  }
  function recordPurchase(p) {
    const it = itemByCode(p.code);
    const poNo = "PO-" + (342 + D.purchaseOrders.length);
    const landedUnit = p.landedUnit != null ? p.landedUnit : p.cost; // base cost + allocated charges
    if (it) {
      if (p.price > 0) it.price = p.price;
      if (p.supplier) it.supplier = p.supplier;
      if (p.alert >= 0) it.alert = p.alert;
      it.bonus = (it.bonus || 0) + p.bonusQty;
      if (p.status === "Received") {
        // Moving-average cost; landed charges + free bonus units fold into "our cost".
        const units = p.qty + (p.bonusQty || 0);
        const prevStock = Math.max(0, it.stock || 0), prevCost = it.cost || 0;
        const denom = prevStock + units;
        it.cost = denom > 0 ? +(((prevStock * prevCost) + (units * landedUnit)) / denom).toFixed(2) : landedUnit;
        it.stock += units;
        it.purchased = D.today; delete it.stockState;
      } else if (p.cost > 0) {
        it.cost = p.cost; // not received yet — keep base cost until landed
      }
    }
    D.purchaseOrders.unshift({
      po: poNo, supplier: p.supplier, date: D.today,
      items: (it ? it.name : p.code) + " ×" + p.qty + (p.bonusQty ? " (+" + p.bonusQty + " bonus)" : ""),
      code: p.code, qty: p.qty, bonusQty: p.bonusQty || 0, landedUnit: landedUnit,
      qtyReceived: p.status === "Received" ? p.qty : 0,
      tracking: p.tracking || "—", total: +((p.qty * p.cost) + (p.charges || 0)).toFixed(2), status: p.status,
    });
    if (window.persist) window.persist("purchaseOrders", "inventory");
    pushToast && pushToast(p.status === "Received"
      ? "Stock received — " + (p.qty + p.bonusQty) + " units of " + p.code
      : "Purchase order " + poNo + " logged (" + p.status + ")");
    window.logAudit("POST", "Purchase", "purchaseOrders", poNo, p.status === "Received"
      ? "Received " + (p.qty + p.bonusQty) + " units of " + p.code + " · " + fmt(p.qty * p.cost)
      : "Logged purchase order " + poNo + " for " + p.code + " ×" + p.qty + " (" + p.status + ")");
    bump(); close();
  }
  // Multi-item purchase: one PO row per line; landed charges split across lines by value.
  function recordPurchaseMulti(p) {
    const lines = (p.lines || []).filter((l) => l.code && (l.qty || 0) > 0);
    if (!lines.length) return;
    const totalCharges = (p.shipping || 0) + (p.customs || 0) + (p.other || 0);
    const totalValue = lines.reduce((s, l) => s + l.qty * l.cost, 0);
    const base = "PO-" + (342 + D.purchaseOrders.length);
    let recvUnits = 0;
    lines.forEach((l, i) => {
      const it = itemByCode(l.code);
      const lineValue = l.qty * l.cost;
      const share = totalCharges > 0 ? (totalValue > 0 ? totalCharges * (lineValue / totalValue) : totalCharges / lines.length) : 0;
      const units = l.qty + (l.bonusQty || 0);
      const landedUnit = units > 0 ? +(((l.qty * l.cost) + share) / units).toFixed(2) : l.cost;
      if (it) {
        if (l.price > 0) it.price = l.price;
        if (p.supplier) it.supplier = p.supplier;
        if (l.alert != null && l.alert !== "" && l.alert >= 0) it.alert = l.alert;
        it.bonus = (it.bonus || 0) + (l.bonusQty || 0);
        if (p.status === "Received") {
          const prevStock = Math.max(0, it.stock || 0), prevCost = it.cost || 0;
          const denom = prevStock + units;
          it.cost = denom > 0 ? +(((prevStock * prevCost) + (units * landedUnit)) / denom).toFixed(2) : landedUnit;
          it.stock += units; it.purchased = D.today; delete it.stockState;
          recvUnits += units;
        } else if (l.cost > 0) it.cost = l.cost;
      }
      const po = lines.length > 1 ? base + "-" + (i + 1) : base;
      D.purchaseOrders.unshift({
        po, supplier: p.supplier, date: D.today,
        items: (it ? it.name : l.code) + " ×" + l.qty + (l.bonusQty ? " (+" + l.bonusQty + " bonus)" : ""),
        code: l.code, qty: l.qty, bonusQty: l.bonusQty || 0, landedUnit: landedUnit,
        qtyReceived: p.status === "Received" ? l.qty : 0,
        tracking: p.tracking || "—", total: +(lineValue + share).toFixed(2), status: p.status,
      });
    });
    if (window.persist) window.persist("purchaseOrders", "inventory");
    pushToast && pushToast(p.status === "Received"
      ? "Purchase received — " + lines.length + " item" + (lines.length === 1 ? "" : "s") + " · " + recvUnits + " units added"
      : "Purchase order " + base + " logged (" + p.status + ") · " + lines.length + " item" + (lines.length === 1 ? "" : "s"));
    window.logAudit("POST", "Purchase", "purchaseOrders", base, (p.status === "Received" ? "Received " : "Logged ") + lines.length + " item purchase · " + fmt(totalValue + totalCharges));
    bump(); close();
  }
  function receivePO(po, recvQty) {
    const qty = Math.max(0, Math.round(recvQty));
    const it = itemByCode(po.code);
    if (it) {
      const landed = po.landedUnit != null ? po.landedUnit : (it.cost || 0);
      const units = qty + (po.bonusQty || 0);
      const prevStock = Math.max(0, it.stock || 0), prevCost = it.cost || 0;
      const denom = prevStock + units;
      it.cost = denom > 0 ? +(((prevStock * prevCost) + (units * landed)) / denom).toFixed(2) : landed;
      it.stock = (it.stock || 0) + units;
      it.purchased = D.today; delete it.stockState;
    }
    po.status = "Received"; po.qtyReceived = qty;
    pushToast && pushToast(po.po + " received · " + (qty + (po.bonusQty || 0)) + " unit(s) added" + (po.code ? " to " + po.code : ""));
    window.logAudit("POST", "Purchase", "purchaseOrders", po.po, "Received PO " + po.po + " · " + qty + " unit(s) into inventory");
    if (window.persist) window.persist("purchaseOrders", "inventory");
    bump(); close();
  }
  function receiveOrder(po) {
    if (!po) return;
    if (po.status === "Received") { pushToast && pushToast((po.ref || po.po) + " is already received"); return; }
    go("receive/" + (po.ref || po.po));
  }
  // What deleting a purchase order will undo — computed up front so the
  // confirmation can state it plainly and the delete can apply exactly that.
  function poDeleteEffect(po) {
    const lines = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    const received = lines.map((l) => {
      const got = l.qtyReceived || 0, ordered = l.qty || 0;
      // Free bonus units are only granted when a line arrives IN FULL (see the
      // receiving screen), so a short receipt never added them — and deleting
      // it must not take them back out.
      const bonus = (ordered > 0 && got >= ordered) ? (l.bonusQty || 0) : 0;
      return { code: l.code, units: got + bonus, name: l.name || l.code };
    }).filter((x) => x.code && x.units > 0);
    const units = received.reduce((s, x) => s + x.units, 0);
    // Any line that would push an item's stock below zero (units already sold on).
    const negatives = received.filter((x) => {
      const it = itemByCode(x.code);
      return it && (it.stock || 0) - x.units < 0;
    });
    const pay = (po.payment && +po.payment.amount) || 0;
    // Opening-stock / adjustment pseudo-orders carry no supplier bill — the
    // books skip them, so deleting one clears no payable.
    const pseudo = /^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""));
    const owing = (!pseudo && typeof poBilledValue === "function") ? +(poBilledValue(po) - pay).toFixed(2) : 0;
    return { received, units, negatives, pay: pseudo ? 0 : pay, owing };
  }
  // Close a part-delivered order that will never be completed. Anything already
  // paid for goods that never arrived (and the freight spent on them) is written
  // off, instead of sitting on the books forever as money the supplier owes.
  async function closePOShort(po, writeOff) {
    const ref = po.ref || po.po;
    const snap = {};
    try { snap.purchaseOrders = JSON.parse(JSON.stringify(D.purchaseOrders || [])); } catch (e) {}
    po.status = "Closed short";
    po.shortClosedAt = D.today;
    if (writeOff > 0.005) { po.shortWriteOff = +writeOff.toFixed(2); po.shortWriteOffAcct = "5110"; }
    (po.lines || []).forEach((l) => { if ((l.qtyReceived || 0) < (l.qty || 0)) l.closedShort = true; });
    window.logAudit("POST", "Purchase", "purchaseOrders", ref,
      "Closed order " + ref + " short" + (writeOff > 0.005 ? " · wrote off " + fmt(writeOff) + " of undelivered goods" : " · nothing to write off"));
    const ok = window.persistNow ? await window.persistNow("purchaseOrders") : true;
    if (!ok) {
      if (snap.purchaseOrders) D.purchaseOrders = snap.purchaseOrders;
      pushToast && pushToast("Couldn't save — no connection. Nothing was changed; please try again.");
    } else {
      pushToast && pushToast(ref + " closed short" + (writeOff > 0.005 ? " · " + fmt(writeOff) + " written off" : ""));
    }
    close(); bump();
  }
  async function deletePO(po) {
    const ref = po.ref || po.po;
    const eff = poDeleteEffect(po);
    const snapKeys = ["purchaseOrders", "inventory"];
    const snap = {};
    try { snapKeys.forEach((k) => { snap[k] = JSON.parse(JSON.stringify(D[k] || [])); }); } catch (e) {}
    // Take the received units back out of stock. The moving-average cost is NOT
    // recalculated — the receipts that formed it are gone, so the current cost
    // stays as the best estimate (the confirmation says so).
    eff.received.forEach((x) => {
      const it = itemByCode(x.code);
      if (it) it.stock = (it.stock || 0) - x.units;
    });
    const idx = D.purchaseOrders.findIndex((p) => p === po);
    if (idx >= 0) D.purchaseOrders.splice(idx, 1);
    window.logAudit("DELETE", "Purchase", "purchaseOrders", ref,
      "Deleted purchase order " + ref + " · " + supplierName(po.supplier)
      + (eff.units ? " · " + eff.units + " unit(s) removed from stock" : "")
      + (eff.pay ? " · supplier payment " + fmt(eff.pay) + " reversed" : "")
      + (Math.abs(eff.owing) > 0.005 ? " · payable " + fmt(eff.owing) + " cleared" : ""));
    const ok = window.persistNow ? await window.persistNow("purchaseOrders", "inventory") : true;
    if (!ok) {
      snapKeys.forEach((k) => { if (snap[k]) D[k] = snap[k]; });
      pushToast && pushToast("Couldn't save — no connection. Nothing was deleted; please try again.");
    } else {
      pushToast && pushToast("Purchase order " + ref + " deleted" + (eff.units ? " · " + eff.units + " unit(s) removed from stock" : ""));
    }
    close(); bump();
  }
  function moveState(item, st) {
    if (st === "active") delete item.stockState; else item.stockState = st;
    pushToast && pushToast(item.code + (st === "dead" ? " → Dead stock" : st === "notmoving" ? " → Not moving" : " restored to active stock"));
    bump();
  }
  function importItems(objs) {
    let n = 0;
    objs.forEach((o) => {
      const code = (o.code || "").trim();
      if (!code) return;
      const num = (v, d) => { const x = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(x) ? d : x; };
      const existing = itemByCode(code);
      if (existing) {
        // For EXISTING items only overwrite fields the row actually supplies —
        // a price-only update CSV must not zero stock/cost or reset the
        // category/supplier (which the old blanket Object.assign did).
        const patch = {};
        if ((o.name || "").trim()) patch.name = o.name.trim();
        if ((o.cat || "").trim()) patch.cat = o.cat.trim();
        if ((o.supplier || "").trim()) patch.supplier = supplierIdByName(o.supplier);
        if (String(o.cost || "").trim() !== "") patch.cost = num(o.cost, existing.cost || 0);
        if (String(o.price || "").trim() !== "") patch.price = num(o.price, existing.price || 0);
        if (String(o.stock || "").trim() !== "") patch.stock = Math.round(num(o.stock, existing.stock || 0));
        if (String(o.bonus || "").trim() !== "") patch.bonus = Math.round(num(o.bonus, existing.bonus || 0));
        if (String(o.alert || "").trim() !== "") patch.alert = Math.round(num(o.alert, existing.alert || 0));
        Object.assign(existing, patch);
      } else {
        D.inventory.push({
          code, name: o.name || code, cat: o.cat || "Uncategorized",
          supplier: supplierIdByName(o.supplier),
          cost: num(o.cost, 0), price: num(o.price, 0),
          stock: Math.round(num(o.stock, 0)), bonus: Math.round(num(o.bonus, 0)), alert: Math.round(num(o.alert, 0)),
        });
      }
      n++;
    });
    bump();
    window.logAudit("IMPORT", "Product", "inventory_items", n + " items", "Imported " + n + " inventory item" + (n === 1 ? "" : "s") + " from CSV");
    if (window.persist) window.persist("inventory");
    return n;
  }

  const importCfg = {
    title: "Import inventory",
    entityFile: "BCCWE-inventory",
    columns: [
      { key: "code", label: "Item Code", required: true, hint: "Unique SKU" },
      { key: "name", label: "Description" },
      { key: "cat", label: "Category", hint: "Phone / Part / Accessory…" },
      { key: "supplier", label: "Supplier", hint: "Matched by name" },
      { key: "cost", label: "Cost Price" },
      { key: "price", label: "Sales Price" },
      { key: "stock", label: "Stock" },
      { key: "bonus", label: "Bonus" },
      { key: "alert", label: "Stock Alert" },
    ],
    sample: [
      { code: "EX-CABLE-1M", name: "USB-C Cable 1m", cat: "Accessory", supplier: "Pacific Parts Distribution", cost: "2.50", price: "12.00", stock: "40", bonus: "4", alert: "10" },
      { code: "EX-SCRN-X", name: "Example Screen Assembly", cat: "Part", supplier: "Surrey Screen Supply", cost: "55.00", price: "139.00", stock: "8", bonus: "0", alert: "5" },
    ],
    onImport: importItems,
  };

  return (
    <div>
      {/* Opened from the Purchase Orders menu item, this screen leads with the
          orders rather than the stock list. Same page, purchase-focused framing. */}
      {initTab === "orders" ? (() => {
        const pend = (D.purchaseOrders || []).filter((p) => p.status !== "Received").length;
        const owing = (typeof supplierPayableRows === "function")
          ? supplierPayableRows("all").reduce((s, r) => s + r.bal, 0) : 0;
        return (
          <PageHead title="Purchase Orders"
            sub={(D.purchaseOrders || []).length + " orders · " + pend + " awaiting delivery" + (Math.abs(owing) > 0.005 ? " · " + fmt(owing) + " owed to suppliers" : "")}
            actions={<>
              <Btn variant="ghost" icon="box" onClick={() => go("inventory")}>Inventory</Btn>
              <Btn variant="primary" icon="truck" onClick={() => go("purchase")}>New purchase</Btn>
            </>} />
        );
      })() : (
      <PageHead title="Inventory" sub={D.inventory.length + " items · " + fmt(stockValue) + " at cost · " + lowCount + " low"}
        actions={<>
          <Btn variant="ghost" icon="receipt" onClick={() => setModal({ type: "barcodes" })}>Print barcodes</Btn>
          <Btn variant="ghost" icon="download" onClick={() => setModal({ type: "import" })}>Import CSV</Btn>
          <Btn variant="ghost" icon="download" onClick={exportInventory}>Export</Btn>
          <Btn variant="ghost" icon="truck" onClick={() => go("purchase")}>New purchase</Btn>
          <Btn variant="primary" icon="plus" onClick={() => setModal({ type: "add" })}>Add item</Btn>
        </>} />
      )}

      <div className="kpi-row tri">
        <MiniStat label="Inventory at cost" value={fmt(stockValue)} ico="box" />
        <MiniStat label="Retail value" value={fmt(retailValue)} ico="money" />
        <MiniStat label="Potential margin" value={fmt(retailValue - stockValue)} ico="ledger" tone="green" />
      </div>

      <div className="tabs">
        <button className={"tab" + (tab === "stock" ? " on" : "")} onClick={() => setTab("stock")}>Stock on hand</button>
        <button className={"tab" + (tab === "profit" ? " on" : "")} onClick={() => setTab("profit")}>Sales &amp; profit</button>
        <button className={"tab" + (tab === "defective" ? " on" : "")} onClick={() => setTab("defective")}>Stock losses <em>{D.defectiveProducts.length}</em></button>
        <button className={"tab" + (tab === "aging" ? " on" : "")} onClick={() => setTab("aging")}>Stock aging <em>{D.inventory.filter((i) => window.STOCK.state(i) !== "active").length}</em></button>
        <button className={"tab" + (tab === "orders" ? " on" : "")} onClick={() => setTab("orders")}>Purchase orders <em>{D.purchaseOrders.length}</em></button>
        <button className={"tab" + (tab === "categories" ? " on" : "")} onClick={() => setTab("categories")}>Categories <em>{(D.catTree || []).length}</em></button>
      </div>

      {tab === "categories" && <CategoriesPanel pushToast={pushToast} />}

      {tab === "stock" && (
        <Card pad={false}>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search item or code…" value={q} onChange={(e) => { setQ(e.target.value); resetPage(); }} /></div>
            <div className="seg-filters">{cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => { setCat(c); resetPage(); }}>{c}</button>)}</div>
            <div className="seg-filters move-filters">{["All", "Fast", "Steady", "Slow", "Not moving", "Dead"].map((mf) => <button key={mf} className={"chip" + (moveFilter === mf ? " on" : "")} onClick={() => { setMoveFilter(mf); resetPage(); }}>{mf}</button>)}</div>
            <SortControl sort={sort} setSort={(v) => { setSort(v); resetPage(); }} defs={invtSorts} />
          </div>
          <table className="data-table">
            <thead><tr><th>Item code</th><th>Description</th><th className="r">Avg. cost</th><th className="r">Last cost</th><th className="r">Price</th><th className="r">Margin</th><th className="r">Stock</th><th>Purchased</th><th>Movement</th><th>Status</th><th /></tr></thead>
            <tbody>
              {slice.map((i) => {
                const low = i.kind !== "Service" && (i.alert || 0) > 0 && i.stock <= i.alert;
                const margin = i.price - i.cost;
                const mpct = i.price ? Math.round((margin / i.price) * 100) : 0;
                const st = window.STOCK.state(i);
                return (
                  <tr key={i.code} className={st === "dead" ? "row-dead" : st === "notmoving" ? "row-aging" : ""}>
                    <td className="mono strong">{i.code}</td>
                    <td>{i.name}<em className="cat-tag">{i.cat}</em></td>
                    <td className="r mono"><EditCell canEdit={_canInlineEdit} value={i.cost} display={fmt(itemAvgCost(i).avg)} title="Double-click to edit cost" onSave={(v) => inlineUpdate(i, "cost", v)} /></td>
                    <td className="r mono"><EditCell canEdit={_canInlineEdit} value={i.cost} display={fmt(itemAvgCost(i).last)} title="Double-click to edit cost" onSave={(v) => inlineUpdate(i, "cost", v)} /></td>
                    <td className="r mono"><EditCell canEdit={_canInlineEdit} value={i.price} display={fmt(i.price)} title="Double-click to edit price" onSave={(v) => inlineUpdate(i, "price", v)} /></td>
                    <td className="r mono"><span className="pos">{fmt(margin)}</span> <em className="mpct">{mpct}%</em></td>
                    <td className="r mono strong"><EditCell canEdit={_canInlineEdit && i.kind !== "Service"} value={i.stock} display={i.stock} title="Double-click to edit stock" onSave={(v) => inlineUpdate(i, "stock", v)} allowNeg integer /></td>
                    <td><AgeCell item={i} /></td>
                    <td><MoveBadge item={i} /></td>
                    <td className="stk-status">
                      {low && <Badge tone="red" dot>Low</Badge>}
                      {st === "notmoving" && <Badge tone="amber" dot>Not moving</Badge>}
                      {st === "dead" && <Badge tone="red" dot>Dead</Badge>}
                      {!low && st === "active" && <Badge tone="green" dot>In stock</Badge>}
                    </td>
                    <td className="row-acts">
                      <button className="icon-btn" title="View details" onClick={() => setModal({ type: "view", item: i })}><Icon name="eye" size={15} /></button>
                      <button className="icon-btn" title="Print barcode" onClick={() => setModal({ type: "barcodes", code: i.code })}><Icon name="receipt" size={15} /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setModal({ type: "edit", item: i })}><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setModal({ type: "delete", item: i })}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                );
              })}
              {!slice.length && <tr><td colSpan="11"><Empty icon="box" text="No items match your search" /></td></tr>}
            </tbody>
          </table>
          <div className="table-foot">
            <label className="pagesize">Show
              <select value={String(pageSize)} onChange={(e) => { const v = e.target.value; setPageSize(v === "All" ? "All" : +v); resetPage(); }}>
                {PAGE_SIZES.map((s) => <option key={s} value={String(s)}>{s}</option>)}
              </select>
              per page · {rows.length} item{rows.length === 1 ? "" : "s"}
            </label>
            {pageSize !== "All" && pages > 1 && (
              <div className="pager">
                <button className="icon-btn" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}><Icon name="chevron" size={16} style={{ transform: "scaleX(-1)" }} /></button>
                <span>Page {curPage + 1} / {pages}</span>
                <button className="icon-btn" disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)}><Icon name="chevron" size={16} /></button>
              </div>
            )}
          </div>
        </Card>
      )}
      {tab === "profit" && <InventoryProfit />}
      {tab === "aging" && <StockAging pushToast={pushToast} onMove={moveState} setModal={setModal} />}
      {tab === "defective" && <DefectiveProducts />}
      {tab === "orders" && (() => {
        const flat = poFlatLines();
        return (
        <Card pad={false}>
          <div className="toolbar">
            <div className="seg-filters">
              <button className={"chip" + (poView === "orders" ? " on" : "")} onClick={() => setPoView("orders")}>All orders</button>
              <button className={"chip" + (poView === "items" ? " on" : "")} onClick={() => setPoView("items")}>All items ordered</button>
            </div>
            <span className="muted">{poView === "orders" ? D.purchaseOrders.length + " orders" : flat.length + " line items"}</span>
          </div>
          {poView === "orders" ? (
            <table className="data-table">
              <thead><tr><th /><th>Order #</th><th>Supplier</th><th>Date</th><th className="r">Items</th><th className="r">Total</th><th>Payment</th><th>Status</th><th /></tr></thead>
              <tbody>
                {D.purchaseOrders.map((p) => {
                  const lines = Array.isArray(p.lines) ? p.lines : [{ code: p.code, name: p.items, qty: p.qty, cost: p.landedUnit, price: 0, bonusQty: p.bonusQty }];
                  const ref = p.ref || p.po;
                  const open = !!poExpand[ref];
                  const pay = p.payment && p.payment.mode && p.payment.mode !== "none" ? (p.payment.mode + " " + fmt(p.payment.amount || 0)) : "—";
                  const recvDone = p.status === "Received" || p.status === "Partial";
                  const hasDisc = recvDone && lines.some((l) => (l.qtyReceived || 0) < (l.qty || 0));
                  return (
                  <React.Fragment key={ref}>
                    <tr className={hasDisc ? "po-row-disc" : ""}>
                      <td><button className="icon-btn" onClick={() => setPoExpand((m) => Object.assign({}, m, { [ref]: !open }))} title={open ? "Collapse" : "Expand"}>{open ? "−" : "+"}</button></td>
                      <td><button className="link mono strong" onClick={() => go("po/" + ref)}>{ref}</button></td>
                      <td>{supplierName(p.supplier)}</td>
                      <td className="muted">{shortDate(p.date)}</td>
                      <td className="r">{lines.length}</td>
                      <td className="r mono">{fmt(p.total != null ? p.total : lines.reduce((s, l) => s + (l.qty || 0) * (l.cost || l.landedUnit || 0), 0))}</td>
                      <td className="muted">{pay}</td>
                      <td><Badge tone={statusTone(p.status)} dot>{p.status}</Badge>{hasDisc && <Badge tone="red" dot>Discrepancy</Badge>}</td>
                      <td className="row-acts">
                        <button className="icon-btn" title="Open order" onClick={() => go("po/" + ref)}><Icon name="eye" size={15} /></button>
                        {p.status !== "Received" && p.status !== "Closed short" && <Btn variant="ghost" size="sm" icon="check" onClick={() => receiveOrder(p)}>Receive</Btn>}
                        {_canInlineEdit && hasDisc && p.status !== "Closed short" &&
                          <button className="icon-btn" title="Close this order short — the rest will never arrive" onClick={() => setModal({ type: "closepo", po: p })}><Icon name="check" size={15} /></button>}
                        {_canInlineEdit && <button className="icon-btn danger" title="Delete this purchase order" onClick={() => setModal({ type: "delpo", po: p })}><Icon name="trash" size={15} /></button>}
                      </td>
                    </tr>
                    {open && lines.map((l, li) => {
                      const short = recvDone && (l.qtyReceived || 0) < (l.qty || 0);
                      return (
                      <tr key={ref + "-" + li} className={"po-subrow" + (short ? (l.qtyReceived === 0 ? " po-line-missing" : " po-line-short") : "")}>
                        <td />
                        <td colSpan="2" className="muted">{l.name || l.code} <em className="cat-tag">{l.code}</em></td>
                        <td className="r muted">×{l.qty}{l.bonusQty ? " (+" + l.bonusQty + ")" : ""}{recvDone ? " · recv " + (l.qtyReceived || 0) : ""}</td>
                        <td className="r mono">{fmt(l.cost || l.landedUnit || 0)} <em className="muted">cost</em></td>
                        <td className="r mono">{fmt(l.price || 0)} <em className="muted">sale</em></td>
                        <td colSpan="3" className="r mono">{short ? <strong>{l.qtyReceived === 0 ? "Missing" : "Short " + ((l.qty || 0) - l.qtyReceived)}</strong> : fmt((l.qty || 0) * (l.cost || l.landedUnit || 0))}</td>
                      </tr>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
                {!D.purchaseOrders.length && <tr><td colSpan="9"><Empty icon="truck" text="No purchase orders yet" /></td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead><tr><th>Order #</th><th>Item</th><th>Supplier</th><th>Date</th><th className="r">Qty</th><th className="r">Unit cost</th><th className="r">Line total</th><th>Status</th></tr></thead>
              <tbody>
                {flat.map((l, i) => (
                  <tr key={i}>
                    <td><button className="link mono" onClick={() => go("po/" + (l.ref || l.po))}>{l.ref || l.po}</button></td>
                    <td>{l.name || l.code} <em className="cat-tag">{l.code}</em></td>
                    <td className="muted">{supplierName(l.supplier)}</td>
                    <td className="muted">{shortDate(l.date)}</td>
                    <td className="r">{l.qty}{l.bonusQty ? " (+" + l.bonusQty + ")" : ""}</td>
                    <td className="r mono">{fmt(l.cost || l.landedUnit || 0)}</td>
                    <td className="r mono">{fmt((l.qty || 0) * (l.cost || l.landedUnit || 0))}</td>
                    <td><Badge tone={statusTone(l.status)} dot>{l.status}</Badge></td>
                  </tr>
                ))}
                {!flat.length && <tr><td colSpan="8"><Empty icon="truck" text="No items ordered yet" /></td></tr>}
              </tbody>
            </table>
          )}
        </Card>
        );
      })()}

      {(modal && modal.type === "add") && <ItemFormModal onSave={(d) => saveItem(d, null)} onClose={close} />}
      {(modal && modal.type === "edit") && <ItemFormModal item={modal.item} onSave={(d) => saveItem(d, modal.item)} onClose={close} />}
      {(modal && modal.type === "view") && <ItemViewModal item={modal.item} onClose={close} onEdit={() => setModal({ type: "edit", item: modal.item })} />}
      {(modal && modal.type === "delete") && <DeleteItemModal item={modal.item} onConfirm={() => deleteItem(modal.item)} onClose={close} />}
      {(modal && modal.type === "receivepo") && <ReceivePOModal po={modal.order} onConfirm={receivePO} onClose={close} />}
      {(modal && modal.type === "closepo") && (() => {
        const po = modal.po, ref = po.ref || po.po;
        const lines = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
        const shortLines = lines.filter((l) => (l.qtyReceived || 0) < (l.qty || 0));
        const pay = (po.payment && +po.payment.amount) || 0;
        const billed = (typeof poBilledValue === "function") ? poBilledValue(po) : 0;
        // Negative payable = money already paid for goods that never came.
        const owedToUs = +(pay - billed).toFixed(2);
        return (
          <Modal title={"Close order " + ref + " short"} onClose={close}
            footer={<>
              <Btn variant="ghost" onClick={close}>Cancel</Btn>
              {owedToUs > 0.005 && <Btn variant="ghost" icon="check" onClick={() => closePOShort(po, 0)}>Close · supplier will refund</Btn>}
              <Btn variant="primary" icon="check" onClick={() => closePOShort(po, Math.max(0, owedToUs))}>
                {owedToUs > 0.005 ? "Close · write off " + fmt(owedToUs) : "Close order"}
              </Btn>
            </>}>
            <p style={{ marginBottom: 12 }}>
              Marks <strong>{ref}</strong> ({supplierName(po.supplier)}) as finished even though{" "}
              {shortLines.length} item{shortLines.length === 1 ? "" : "s"} never fully arrived. Stock already received stays as it is.
            </p>
            <table className="data-table" style={{ marginBottom: 12 }}>
              <thead><tr><th>Item</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Never arrived</th></tr></thead>
              <tbody>
                {shortLines.map((l, i) => (
                  <tr key={i}><td>{l.name || l.code}</td><td className="r mono">{l.qty || 0}</td>
                    <td className="r mono">{l.qtyReceived || 0}</td>
                    <td className="r mono strong">{(l.qty || 0) - (l.qtyReceived || 0)}</td></tr>
                ))}
              </tbody>
            </table>
            {owedToUs > 0.005 ? (
              <>
                <div className="inline-note" style={{ marginTop: 0 }}>
                  <Icon name="alert" size={15} /> You paid <strong>{fmt(pay)}</strong> but only <strong>{fmt(billed)}</strong> of goods arrived,
                  so <strong>{fmt(owedToUs)}</strong> is currently sitting on the books as money this supplier owes you.
                </div>
                <ul className="rail-note" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
                  <li><strong>Write it off</strong> — the {fmt(owedToUs)} becomes a loss (5110 Loss on Lost / Missing Stock) and the supplier balance clears. Use this when the money and goods are gone for good.</li>
                  <li><strong>Supplier will refund</strong> — the order closes but the {fmt(owedToUs)} stays on the books as owed to you, until they refund or send the goods.</li>
                </ul>
              </>
            ) : (
              <div className="inline-note" style={{ marginTop: 0 }}>
                <Icon name="check" size={15} /> Nothing was overpaid on this order, so closing it changes no money — it just stops showing as awaiting delivery.
              </div>
            )}
          </Modal>
        );
      })()}
      {(modal && modal.type === "delpo") && (() => {
        const po = modal.po, ref = po.ref || po.po, eff = poDeleteEffect(po);
        return (
          <Modal title={"Delete purchase order " + ref} onClose={close}
            footer={<>
              <Btn variant="ghost" onClick={close}>Cancel</Btn>
              <Btn variant="danger" icon="trash" onClick={() => deletePO(po)}>Delete permanently</Btn>
            </>}>
            <p style={{ marginBottom: 12 }}>
              This permanently removes <strong>{ref}</strong> ({supplierName(po.supplier)} · {fmt(po.total || 0)}). It cannot be undone.
            </p>
            <ul className="rail-note" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
              {eff.units > 0
                ? <li><strong>{eff.units} unit{eff.units === 1 ? "" : "s"}</strong> come back out of stock ({eff.received.map((x) => x.code + " ×" + x.units).join(", ")})</li>
                : <li>Nothing was received on this order, so stock is unaffected</li>}
              {Math.abs(eff.owing) > 0.005 && <li><strong>{fmt(eff.owing)}</strong> owed to this supplier is cleared from Accounts Payable</li>}
              {eff.pay > 0.005 && <li>The recorded supplier payment of <strong>{fmt(eff.pay)}</strong> is reversed — money goes back into {(po.payment && po.payment.account) === "1000" ? "Cash on Hand" : "the bank"}</li>}
              <li>It disappears from purchase history, the A/P report and item cost history</li>
            </ul>
            {eff.negatives.length > 0 && (
              <div className="inline-note">
                <Icon name="alert" size={15} /> Some of these units have already been sold, so stock will go negative on{" "}
                <strong>{eff.negatives.map((x) => x.code).join(", ")}</strong>. Fix the count on the stock list afterwards.
              </div>
            )}
            {eff.pay > 0.005 && (
              <div className="inline-note">
                <Icon name="alert" size={15} /> If you really paid this supplier, deleting the order removes that payment from your books too.
                Delete only if the order was entered by mistake.
              </div>
            )}
            <div className="inline-note">
              <Icon name="alert" size={15} /> Item costs are not recalculated — the average cost this order contributed stays as it is.
              Check the item's cost afterwards if this order changed it.
            </div>
          </Modal>
        );
      })()}
      {(modal && modal.type === "import") && <ImportModal {...importCfg} pushToast={pushToast} onClose={close} />}
      {(modal && modal.type === "barcodes") && <BarcodeModal items={D.inventory} initialCode={modal.code} pushToast={pushToast} onClose={close} />}
    </div>
  );
}

/* ---------------- Inventory — stock aging & movement ---------------- */
function StockAging({ pushToast, onMove, setModal }) {
  const D = BCCWE, S = window.STOCK;
  const [view, setView] = useState("notmoving"); // notmoving | dead | fast | all
  const [q, setQ] = useState("");
  const enrich = D.inventory.map((i) => ({ i, age: S.ageDays(i), mv: S.movement(i), state: S.state(i), sug: S.suggested(i), value: +(i.stock * i.cost).toFixed(2) }));
  const match = (r) => !q || (r.i.name + r.i.code).toLowerCase().includes(q.toLowerCase());
  const notMoving = enrich.filter((r) => r.state === "notmoving");
  const dead = enrich.filter((r) => r.state === "dead");
  const fast = enrich.filter((r) => r.mv.label === "Fast" || r.mv.label === "Steady");
  const tiedCapital = [...notMoving, ...dead].reduce((s, r) => s + r.value, 0);
  const filtered = enrich.filter((r) => {
    if (!match(r)) return false;
    if (view === "all") return true;
    if (view === "fast") return r.mv.label === "Fast" || r.mv.label === "Steady";
    return r.state === view;
  }).sort((a, b) => view === "fast" ? b.mv.perMonth - a.mv.perMonth : b.age - a.age);
  const views = [["notmoving", "Not moving", notMoving.length], ["dead", "Dead stock", dead.length], ["fast", "Fast movers", fast.length], ["all", "All stock", enrich.length]];

  return (
    <div>
      <div className="kpi-row tri">
        <MiniStat label={"Not moving (" + S.AGE_NOTMOVING + "+ days)"} value={notMoving.length + (notMoving.length === 1 ? " item" : " items")} ico="clock" tone="amber" />
        <MiniStat label={"Dead stock (" + S.AGE_DEAD + "+ days)"} value={dead.length + (dead.length === 1 ? " item" : " items")} ico="alert" tone="red" />
        <MiniStat label="Capital tied in slow / dead" value={fmt(tiedCapital)} ico="box" />
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input placeholder="Search item or code…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="seg-filters">{views.map(([v, lbl, n]) => <button key={v} className={"chip" + (view === v ? " on" : "")} onClick={() => setView(v)}>{lbl}<em className="chip-n">{n}</em></button>)}</div>
        </div>
        <table className="data-table">
          <thead><tr><th>Item</th><th>Purchased</th><th className="r">In stock</th><th className="r">Sold 90d</th><th>Movement</th><th className="r">Tied capital</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.i.code} className={r.state === "dead" ? "row-dead" : r.state === "notmoving" ? "row-aging" : ""}>
                <td><button className="link strong mono" onClick={() => setModal({ type: "view", item: r.i })}>{r.i.code}</button><em className="cat-tag">{r.i.name}</em></td>
                <td><AgeCell item={r.i} /></td>
                <td className="r mono strong">{r.i.stock}</td>
                <td className="r mono">{r.mv.u90}</td>
                <td><MoveBadge item={r.i} /></td>
                <td className="r mono">{fmt(r.value)}</td>
                <td>{r.state === "dead" ? <Badge tone="red" dot>Dead</Badge> : r.state === "notmoving" ? <Badge tone="amber" dot>Not moving</Badge> : <Badge tone="green" dot>Active</Badge>}{r.i.stockState ? <em className="ov-tag" title="Set manually">manual</em> : null}</td>
                <td className="row-acts aging-acts">
                  {r.state === "active" && <Btn variant="ghost" size="sm" icon="clock" onClick={() => onMove(r.i, "notmoving")}>Flag not moving</Btn>}
                  {r.state === "notmoving" && <>
                    <Btn variant="ghost" size="sm" icon="alert" onClick={() => onMove(r.i, "dead")}>{r.sug === "dead" ? "Move to dead ✓" : "Move to dead"}</Btn>
                    <Btn variant="ghost" size="sm" icon="check" onClick={() => onMove(r.i, "active")}>Restore</Btn>
                  </>}
                  {r.state === "dead" && <Btn variant="ghost" size="sm" icon="check" onClick={() => onMove(r.i, "active")}>Restore</Btn>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan="8"><Empty icon="box" text={view === "fast" ? "No fast movers match" : "Nothing here — this group is clear"} /></td></tr>}
          </tbody>
        </table>
      </Card>
      <p className="aging-hint"><Icon name="clock" size={14} /> Items auto-flag as <strong>Not moving</strong> once they pass {S.AGE_NOTMOVING} days in stock with little or no movement, and become <strong>Dead stock</strong> candidates after {S.AGE_DEAD} days unsold. Receiving new stock resets an item’s age. Use the actions to override manually.</p>
    </div>
  );
}

/* ---------------- Inventory — add / edit item form ---------------- */
// Generate a valid 8-digit EAN-8 barcode (7 random digits + checksum) that is
// unique among existing inventory codes — usable as a scannable barcode.
function ean8Check(d7) {
  var sum = 0;
  for (var i = 0; i < 7; i++) sum += (+d7[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}
function gen8Code() {
  var existing = (BCCWE.inventory || []).map(function (i) { return String(i.code); });
  for (var t = 0; t < 80; t++) {
    var d7 = "";
    for (var i = 0; i < 7; i++) d7 += Math.floor(Math.random() * 10);
    var code = d7 + ean8Check(d7);
    if (existing.indexOf(code) === -1) return code;
  }
  return String(Date.now()).slice(-8);
}

/* ---------------- Inventory — categories & sub-categories ---------------- */
function CategoriesPanel({ pushToast }) {
  const D = BCCWE;
  if (!Array.isArray(D.catTree)) D.catTree = (D.categories || []).map((n) => ({ name: n, subs: [] }));
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState({}); // { catName: text }
  const [imp, setImp] = useState(false);

  const categoryImport = {
    title: "Import categories & sub-categories",
    entityFile: "BCCWE-categories",
    columns: [
      { key: "category", label: "Category", required: true, hint: "Main category name" },
      { key: "subcategory", label: "Sub-category", hint: "Optional — one per row" },
    ],
    sample: [
      { category: "Phone", subcategory: "Apple" },
      { category: "Phone", subcategory: "Samsung" },
      { category: "Accessory", subcategory: "Case" },
    ],
    onImport: (objs) => {
      let n = 0;
      objs.forEach((o) => {
        const cat = (o.category || "").trim(); if (!cat) return;
        let c = D.catTree.find((x) => x.name.toLowerCase() === cat.toLowerCase());
        if (!c) { c = { name: cat, subs: [] }; D.catTree.push(c); n++; }
        const sub = (o.subcategory || "").trim();
        if (sub && !c.subs.some((s) => s.toLowerCase() === sub.toLowerCase())) { c.subs.push(sub); n++; }
      });
      D.categories = D.catTree.map((x) => x.name);
      if (window.persist) window.persist("catTree", "categories");
      window.logAudit("IMPORT", "Category", "catTree", "categories.csv", "Imported " + objs.length + " category rows");
      bump();
      return n;
    },
  };

  const syncFlat = () => { D.categories = D.catTree.map((c) => c.name); };
  const save = () => { syncFlat(); if (window.persist) window.persist("catTree", "categories"); };
  const usedCount = (name) => (D.inventory || []).filter((i) => i.cat === name).length;

  function addCat() {
    const n = newCat.trim();
    if (!n) return;
    if (D.catTree.some((c) => c.name.toLowerCase() === n.toLowerCase())) { pushToast && pushToast("Category already exists"); return; }
    D.catTree.push({ name: n, subs: [] });
    window.logAudit("CREATE", "Category", "catTree", n, "Added category " + n);
    setNewCat(""); save(); bump();
  }
  function renameCat(c) {
    const n = (window.prompt("Rename category", c.name) || "").trim();
    if (!n || n === c.name) return;
    (D.inventory || []).forEach((i) => { if (i.cat === c.name) i.cat = n; });
    c.name = n; window.logAudit("UPDATE", "Category", "catTree", n, "Renamed category to " + n); save(); window.persist && window.persist("inventory"); bump();
  }
  function delCat(c) {
    if (usedCount(c.name) > 0) { pushToast && pushToast("Can't delete — " + usedCount(c.name) + " item(s) use " + c.name); return; }
    D.catTree = D.catTree.filter((x) => x !== c);
    window.logAudit("DELETE", "Category", "catTree", c.name, "Deleted category " + c.name);
    save(); bump();
  }
  function addSub(c) {
    const n = ((newSub[c.name] || "")).trim();
    if (!n) return;
    if (c.subs.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    c.subs.push(n); setNewSub((m) => Object.assign({}, m, { [c.name]: "" }));
    window.logAudit("CREATE", "Sub-category", "catTree", c.name + " › " + n, "Added sub-category " + n + " to " + c.name);
    save(); bump();
  }
  function delSub(c, s) { c.subs = c.subs.filter((x) => x !== s); save(); bump(); }

  return (
    <Card title="Categories & sub-categories" sub="Each main category can hold many sub-categories. Used when adding inventory."
      actions={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Btn variant="ghost" size="sm" icon="download" onClick={() => setImp(true)}>Import</Btn>
        <div className="input-prefix" style={{ width: 240 }}>
          <input value={newCat} placeholder="New category name" onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} />
          <Btn variant="primary" size="sm" icon="plus" onClick={addCat}>Add</Btn>
        </div>
      </div>}>
      <div className="cat-manage">
        {(D.catTree || []).map((c) => (
          <div className="cat-block" key={c.name}>
            <div className="cat-block-head">
              <strong>{c.name}</strong>
              <span className="muted">{usedCount(c.name)} item{usedCount(c.name) === 1 ? "" : "s"}</span>
              <div className="cat-block-acts">
                <button className="icon-btn" title="Rename" onClick={() => renameCat(c)}><Icon name="edit" size={14} /></button>
                <button className="icon-btn danger" title="Delete" onClick={() => delCat(c)}><Icon name="trash" size={14} /></button>
              </div>
            </div>
            <div className="cat-subs">
              {c.subs.map((s) => (
                <span className="cat-sub-chip" key={s}>{s}<button onClick={() => delSub(c, s)} title="Remove"><Icon name="x" size={11} /></button></span>
              ))}
              <span className="cat-sub-add">
                <input value={newSub[c.name] || ""} placeholder="+ sub-category"
                  onChange={(e) => setNewSub((m) => Object.assign({}, m, { [c.name]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addSub(c)} />
              </span>
            </div>
          </div>
        ))}
        {!(D.catTree || []).length && <Empty text="No categories yet — add one above." />}
      </div>
      {imp && <ImportModal {...categoryImport} pushToast={pushToast} onClose={() => setImp(false)} />}
    </Card>
  );
}

function ItemFormModal({ item, onSave, onClose }) {
  const D = BCCWE;
  const editing = !!item;
  const [f, setF] = useState(() => ({
    code: item ? item.code : gen8Code(),
    name: item ? item.name : "",
    kind: item ? (item.kind || "Product") : "Product",
    cat: item ? item.cat : "",
    subcat: item ? (item.subcat || "") : "",
    supplier: item ? item.supplier : (D.suppliers[0] && D.suppliers[0].id) || "",
    cost: item ? item.cost : "",
    price: item ? item.price : "",
    stock: item ? item.stock : "",
    bonus: item ? item.bonus : "",
    alert: item ? item.alert : "",
    purchased: item ? (item.purchased || D.today) : D.today,
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [, setCatRev] = useState(0);
  if (!Array.isArray(D.catTree)) D.catTree = (D.categories || []).map((n) => ({ name: n, subs: [] }));
  function addCategory() {
    const name = (window.prompt("New category name") || "").trim();
    if (!name) return;
    if (!D.catTree.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      D.catTree.push({ name, subs: [] });
      D.categories = D.catTree.map((c) => c.name);
      window.persist && window.persist("catTree", "categories");
      setCatRev((r) => r + 1);
    }
    set("cat", name); set("subcat", "");
  }
  function addSubcategory() {
    if (!f.cat) { window.alert("Pick a category first"); return; }
    const name = (window.prompt("New sub-category for " + f.cat) || "").trim();
    if (!name) return;
    let c = D.catTree.find((x) => x.name === f.cat);
    if (!c) { c = { name: f.cat, subs: [] }; D.catTree.push(c); }
    if (!c.subs.some((s) => s.toLowerCase() === name.toLowerCase())) c.subs.push(name);
    D.categories = D.catTree.map((x) => x.name);
    window.persist && window.persist("catTree", "categories");
    setCatRev((r) => r + 1);
    set("subcat", name);
  }
  const catOpts = Array.from(new Set([...D.catTree.map((c) => c.name), ...D.inventory.map((i) => i.cat), f.cat].filter(Boolean)));
  const subOpts = (D.catTree.find((c) => c.name === f.cat) || {}).subs || [];

  const codeClash = !editing && !!itemByCode(f.code.trim());
  const valid = f.code.trim() && f.name.trim() && !codeClash;

  const isService = f.kind === "Service";
  function submit() {
    if (!valid) return;
    const num = (v) => Math.max(0, parseFloat(v) || 0);
    // Stock keeps its SIGN: oversells legitimately drive stock negative, and
    // clamping to 0 here silently erased the oversell AND fabricated a phantom
    // "stock added" purchase (0 − (−5) = +5) on every unrelated edit.
    const numStock = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : Math.round(x); };
    onSave(isService ? {
      // Services are non-physical: no supplier, stock, alert or purchase date,
      // so they never trigger low-stock notifications.
      code: f.code.trim(), name: f.name.trim(), kind: "Service",
      cat: f.cat.trim() || "Service", subcat: f.subcat || "",
      supplier: "", cost: num(f.cost), price: num(f.price),
      stock: 0, bonus: 0, alert: 0, purchased: "",
    } : {
      code: f.code.trim(), name: f.name.trim(), kind: "Product",
      cat: f.cat.trim() || "Uncategorized", subcat: f.subcat || "",
      supplier: f.supplier, cost: num(f.cost), price: num(f.price),
      stock: numStock(f.stock), bonus: Math.round(num(f.bonus)), alert: Math.round(num(f.alert)),
      purchased: f.purchased || D.today,
    });
  }

  const margin = (parseFloat(f.price) || 0) - (parseFloat(f.cost) || 0);
  const mpct = parseFloat(f.price) ? Math.round((margin / parseFloat(f.price)) * 100) : 0;

  return (
    <Modal title={editing ? "Edit item — " + item.code : "Add inventory item"} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Add item"}</Btn>
      </>}>
      <div className="miniseg" style={{ marginBottom: 14, maxWidth: 360 }}>
        <button type="button" className={"miniseg-btn" + (!isService ? " on" : "")} onClick={() => set("kind", "Product")}>Product (stocked)</button>
        <button type="button" className={"miniseg-btn" + (isService ? " on" : "")} onClick={() => set("kind", "Service")}>Service (non-stocked)</button>
      </div>
      <div className="meta-grid">
        <Field label={isService ? "Service code" : "Item code"} required hint={codeClash ? "⚠ Code already exists" : "Unique SKU"}>
          <input value={f.code} disabled={editing} placeholder={isService ? "e.g. SVC-DIAG" : "e.g. IPH-13-128-A"}
            className={codeClash ? "err" : ""} onChange={(e) => set("code", e.target.value)} />
        </Field>
        <Field label="Category">
          <div className="input-prefix">
            <select value={f.cat} onChange={(e) => { set("cat", e.target.value); set("subcat", ""); }} style={{ flex: 1 }}>
              {!f.cat && <option value="">Select category…</option>}
              {catOpts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Btn variant="ghost" size="sm" onClick={addCategory}>+ New</Btn>
          </div>
        </Field>
        <Field label="Sub-category" hint={f.cat ? "" : "Pick a category first"}>
          <div className="input-prefix">
            <select value={f.subcat} onChange={(e) => set("subcat", e.target.value)} style={{ flex: 1 }}>
              <option value="">{subOpts.length ? "— none —" : "No sub-categories"}</option>
              {subOpts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Btn variant="ghost" size="sm" onClick={addSubcategory}>+ New</Btn>
          </div>
        </Field>
        {!isService && (
          <Field label="Supplier">
            <select value={f.supplier} onChange={(e) => set("supplier", e.target.value)}>
              {D.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="Description" required>
        <input value={f.name} placeholder="Full product description" onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="meta-grid">
        <Field label="Cost price"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={f.cost} placeholder="0.00" onChange={(e) => set("cost", e.target.value)} /></div></Field>
        <Field label="Sales price"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={f.price} placeholder="0.00" onChange={(e) => set("price", e.target.value)} /></div></Field>
        <Field label="Unit margin" hint={(parseFloat(f.price) ? mpct + "% margin" : "—")}>
          <input className="readout" value={fmt(margin)} readOnly tabIndex={-1} />
        </Field>
      </div>
      {isService ? (
        <p className="rail-note"><Icon name="check" size={14} /> Services aren't stocked — no supplier, stock levels, purchase date or low-stock alerts apply.</p>
      ) : (
        <>
          <div className="meta-grid">
            <Field label="Stock on hand"><input type="number" value={f.stock} placeholder="0" onChange={(e) => set("stock", e.target.value)} /></Field>
            <Field label="Bonus stock" hint="Adds to stock, not cost basis"><input type="number" min="0" value={f.bonus} placeholder="0" onChange={(e) => set("bonus", e.target.value)} /></Field>
            <Field label="Stock alert" hint="Low-stock threshold"><input type="number" min="0" value={f.alert} placeholder="0" onChange={(e) => set("alert", e.target.value)} /></Field>
          </div>
          <Field label="Purchase date" hint="Used for stock-aging — when this batch was received"><input type="date" value={f.purchased} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} onChange={(e) => set("purchased", e.target.value)} /></Field>
        </>
      )}
    </Modal>
  );
}

/* ---------------- Inventory — delete confirm ---------------- */
function DeleteItemModal({ item, onConfirm, onClose }) {
  return (
    <Modal title="Delete item?" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" icon="trash" onClick={onConfirm}>Delete item</Btn>
      </>}>
      <p className="confirm-lead">Permanently remove <strong className="mono">{item.code}</strong> — {item.name} from inventory?</p>
      <div className="inline-note"><Icon name="alert" size={15} />This removes the item from the catalog. It does not reverse past sales or journal entries. {item.stock > 0 && <strong>&nbsp;{item.stock} unit{item.stock === 1 ? "" : "s"} currently in stock will be removed.</strong>}</div>
    </Modal>
  );
}

/* ---------------- Inventory — new multi-item purchase (full page) ---------------- */
function PurchasePage({ go, pushToast, store }) {
  const D = BCCWE;
  const [supplier, setSupplier] = useState((D.suppliers[0] && D.suppliers[0].id) || "");
  const [status, setStatus] = useState("Received");
  const [tracking, setTracking] = useState("");
  const [paymentMode, setPaymentMode] = useState("none"); // none | deposit | advance | full
  const [paidAmt, setPaidAmt] = useState("");
  const [payAccount, setPayAccount] = useState("1010");
  const [shipping, setShipping] = useState("");
  const [customs, setCustoms] = useState("");
  const [other, setOther] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [lines, setLines] = useState([]); // { code, name, qty, bonusQty, cost, price, alert }

  const cats = ["All", ...Array.from(new Set(D.inventory.map((i) => i.cat).filter(Boolean)))];
  const ql = q.trim().toLowerCase();
  const catalog = D.inventory.filter((i) => (cat === "All" || i.cat === cat) && (!ql || (i.name + " " + i.code).toLowerCase().includes(ql)));

  function addItem(it) {
    setLines((ls) => {
      const ex = ls.find((l) => l.code === it.code);
      if (ex) return ls.map((l) => (l.code === it.code ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { code: it.code, name: it.name, qty: 1, bonusQty: 0, cost: it.cost || 0, price: it.price || 0, alert: it.alert || 0 }];
    });
  }
  const setLine = (code, patch) => setLines((ls) => ls.map((l) => (l.code === code ? { ...l, ...patch } : l)));
  const rmLine = (code) => setLines((ls) => ls.filter((l) => l.code !== code));

  const charges = (parseFloat(shipping) || 0) + (parseFloat(customs) || 0) + (parseFloat(other) || 0);
  const goods = lines.reduce((s, l) => s + (l.qty || 0) * (parseFloat(l.cost) || 0), 0);
  const units = lines.reduce((s, l) => s + (l.qty || 0) + (l.bonusQty || 0), 0);
  const total = goods + charges;
  const picked = lines.filter((l) => l.code && (l.qty || 0) > 0);
  const valid = picked.length > 0;

  async function record() {
    if (!valid) return;
    const ship = Math.max(0, parseFloat(shipping) || 0), cust = Math.max(0, parseFloat(customs) || 0), oth = Math.max(0, parseFloat(other) || 0);
    const totalCharges = ship + cust + oth;
    const pls = picked.map((l) => ({
      code: l.code, name: l.name, qty: Math.max(0, Math.round(l.qty || 0)), bonusQty: Math.max(0, Math.round(l.bonusQty || 0)),
      cost: Math.max(0, parseFloat(l.cost) || 0), price: Math.max(0, parseFloat(l.price) || 0), alert: Math.max(0, Math.round(parseFloat(l.alert) || 0)),
    }));
    const totalValue = pls.reduce((s, l) => s + l.qty * l.cost, 0);
    // snapshot for rollback if the save fails
    const snap = {};
    try { ["inventory", "purchaseOrders"].forEach((k) => { snap[k] = JSON.parse(JSON.stringify(D[k] || [])); }); } catch (e) {}
    // Server-side atomic ref allocation (two devices can't mint the same PO-#);
    // array-length fallback only when offline, then a local duplicate check.
    let base = "PO-" + (342 + D.purchaseOrders.length);
    if (window.allocateNumber) { const a = await window.allocateNumber("po"); if (a) base = a.no; }
    let _g = 0;
    while (D.purchaseOrders.some((p) => (p.ref || p.po) === base) && _g++ < 500) {
      const m = /^(.*?)(\d+)$/.exec(base);
      base = m ? m[1] + (parseInt(m[2], 10) + 1) : base + "-2";
    }
    let recvUnits = 0;
    const orderLines = pls.map((l) => {
      const it = itemByCode(l.code);
      const lineValue = l.qty * l.cost;
      const share = totalCharges > 0 ? (totalValue > 0 ? totalCharges * (lineValue / totalValue) : totalCharges / pls.length) : 0;
      const u = l.qty + l.bonusQty;
      const landedUnit = u > 0 ? +(((l.qty * l.cost) + share) / u).toFixed(2) : l.cost;
      if (it) {
        if (l.price > 0) it.price = l.price;
        if (supplier) it.supplier = supplier;
        if (l.alert >= 0) it.alert = l.alert;
        it.bonus = (it.bonus || 0) + l.bonusQty;
        if (status === "Received") {
          const prevStock = Math.max(0, it.stock || 0), prevCost = it.cost || 0;
          const denom = prevStock + u;
          it.cost = denom > 0 ? +(((prevStock * prevCost) + (u * landedUnit)) / denom).toFixed(2) : landedUnit;
          it.stock += u; it.purchased = D.today; delete it.stockState;
          recvUnits += u;
        } else if (l.cost > 0) it.cost = l.cost;
      }
      return { code: l.code, name: (it ? it.name : l.code), qty: l.qty, bonusQty: l.bonusQty, cost: l.cost, price: l.price, alert: l.alert, landedUnit: landedUnit, charge: +share.toFixed(2), qtyReceived: status === "Received" ? l.qty : 0 };
    });
    const me = window.currentUser ? window.currentUser() : { name: "" };
    const nowTs = D.today + " " + new Date().toTimeString().slice(0, 5);
    D.purchaseOrders.unshift({
      po: base, ref: base, date: D.today, supplier: supplier, status: status,
      tracking: tracking.trim() || "—",
      charges: { shipping: ship, customs: cust, other: oth },
      payment: { mode: paymentMode, amount: Math.max(0, parseFloat(paidAmt) || 0), account: payAccount },
      lines: orderLines,
      items: orderLines.map((l) => l.name + " ×" + l.qty).join(", "),
      total: +(totalValue + totalCharges).toFixed(2),
      qtyReceived: status === "Received" ? 1 : 0,
      logs: [{ ts: nowTs, user: me.name || "—", detail: "Purchase order created — " + orderLines.length + " item(s) · total " + fmt(totalValue + totalCharges) + " · " + status }],
    });
    const ok = window.persistNow ? await window.persistNow("inventory", "purchaseOrders") : true;
    if (!ok) {
      ["inventory", "purchaseOrders"].forEach((k) => { if (snap[k]) D[k] = snap[k]; });
      pushToast && pushToast("Couldn't save — no connection. Your purchase is kept on screen; please try again.");
      return;
    }
    window.logAudit("POST", "Purchase", "purchaseOrders", base, (status === "Received" ? "Received " : "Logged ") + pls.length + " item purchase · " + fmt(totalValue + totalCharges));
    pushToast && pushToast(status === "Received"
      ? "Purchase received — " + pls.length + " item" + (pls.length === 1 ? "" : "s") + " · " + recvUnits + " units added"
      : "Purchase order " + base + " logged (" + status + ")");
    go && go("inventory");
  }

  return (
    <div>
      <PageHead title="New purchase / stock receipt" sub="Add one or more products, set quantities and costs. Landed charges split across items by value."
        actions={<>
          <Btn variant="ghost" icon="chevron" onClick={() => go("inventory")}>Back</Btn>
          <Btn variant="primary" icon="check" disabled={!valid} onClick={record}>Record purchase ({picked.length})</Btn>
        </>} />

      <Card title="Purchase details">
        <div className="meta-grid">
          <Field label="Supplier">
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              {D.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status" hint="Received adds stock now; Placed / In Transit logs until received">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["Received", "Placed", "In Transit"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Tracking #"><input value={tracking} placeholder="Optional" onChange={(e) => setTracking(e.target.value)} /></Field>
        </div>
        <div className="meta-grid">
          <Field label="Payment to supplier">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="none">Not paid</option>
              <option value="deposit">Deposit</option>
              <option value="advance">Advance</option>
              <option value="full">Paid in full</option>
            </select>
          </Field>
          {paymentMode !== "none" && (
            <Field label="Amount paid"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={paidAmt} placeholder="0.00" onChange={(e) => setPaidAmt(e.target.value)} /></div></Field>
          )}
          {paymentMode !== "none" && (
            <Field label="Paid from">
              <select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                {(D.accounts || []).filter((a) => a.type === "Asset").map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      </Card>

      <div className="purchase-page-grid">
        <Card title="Add products" sub="Tap a product to add it to the purchase" pad={false}>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search product or code…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="seg-filters">{cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
          </div>
          <div className="pos-products" style={{ padding: "0 16px 16px" }}>
            {catalog.map((it) => (
              <button key={it.code} className="pos-tile" onClick={() => addItem(it)} title="Add to purchase">
                <span className="pos-tile-name">{it.name}</span>
                <span className="pos-tile-meta"><span className="mono">cost {fmt(it.cost)}</span><em>{it.stock} in stock</em></span>
              </button>
            ))}
            {!catalog.length && <Empty text="No products match." />}
          </div>
        </Card>

        <Card title={"Items on this purchase (" + lines.length + ")"} pad={false}>
          <div className="purchase-lines">
            {lines.length ? (
              <table className="data-table">
                <thead><tr><th>Product</th><th className="r">Qty</th><th className="r">Bonus</th><th className="r">Unit cost</th><th className="r">Sale price</th><th className="r">Alert</th><th className="r">Line cost</th><th /></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.code}>
                      <td><strong>{l.name}</strong><em className="cat-tag" style={{ marginLeft: 6 }}>{l.code}</em></td>
                      <td className="r"><input className="r purch-in" type="number" min="0" value={l.qty} onChange={(e) => setLine(l.code, { qty: Math.max(0, +e.target.value) })} /></td>
                      <td className="r"><input className="r purch-in" type="number" min="0" value={l.bonusQty} onChange={(e) => setLine(l.code, { bonusQty: Math.max(0, +e.target.value) })} /></td>
                      <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.cost} onChange={(e) => setLine(l.code, { cost: e.target.value })} /></td>
                      <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLine(l.code, { price: e.target.value })} /></td>
                      <td className="r"><input className="r purch-in" type="number" min="0" value={l.alert} onChange={(e) => setLine(l.code, { alert: e.target.value })} /></td>
                      <td className="r mono">{fmt((l.qty || 0) * (parseFloat(l.cost) || 0))}</td>
                      <td><button className="icon-btn" onClick={() => rmLine(l.code)} title="Remove"><Icon name="trash" size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div style={{ padding: 24 }}><Empty icon="box" text="No items yet — add products from the left." /></div>}
          </div>

          <div className="purchase-foot">
            <div className="store-form-sec" style={{ margin: "0 0 8px" }}>Landed charges — split across items by value</div>
            <div className="purch-charges">
              <label>Shipping<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={shipping} placeholder="0" onChange={(e) => setShipping(e.target.value)} /></div></label>
              <label>Customs &amp; taxes<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={customs} placeholder="0" onChange={(e) => setCustoms(e.target.value)} /></div></label>
              <label>Other<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={other} placeholder="0" onChange={(e) => setOther(e.target.value)} /></div></label>
            </div>
            <div className="purchase-summary" style={{ marginTop: 12 }}>
              <div><span>Goods</span><strong className="mono">{fmt(goods)}</strong></div>
              <div><span>Charges</span><strong className="mono">{fmt(charges)}</strong></div>
              <div><span>Units to stock</span><strong className="mono">{status === "Received" ? "+" + units : "0 (until received)"}</strong></div>
              <div><span>Purchase total</span><strong className="mono">{fmt(total)}</strong></div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}




/* ---------------- Purchase order — normalize lines (grouped or legacy flat) ---------------- */
function poLines(po) {
  if (!po) return [];
  if (Array.isArray(po.lines)) return po.lines;
  const it = itemByCode(po.code);
  return [{ code: po.code, name: (it ? it.name : po.items) || po.code, qty: po.qty, bonusQty: po.bonusQty || 0, cost: po.landedUnit, price: it ? it.price : 0, landedUnit: po.landedUnit, qtyReceived: po.qtyReceived }];
}

/* ---------------- Purchase order — build a human-readable edit diff ---------------- */
function poEditDiff(order, patch) {
  const out = [];
  const money = (v) => fmt(+v || 0);
  if (patch.supplier !== undefined && patch.supplier !== order.supplier)
    out.push("Supplier " + supplierName(order.supplier) + " → " + supplierName(patch.supplier));
  if (patch.status !== undefined && patch.status !== order.status)
    out.push("Status " + (order.status || "—") + " → " + patch.status);
  if (patch.date !== undefined && patch.date !== order.date)
    out.push("Date " + shortDate(order.date) + " → " + shortDate(patch.date));
  const oldTrack = order.tracking || "—", newTrack = patch.tracking || "—";
  if (patch.tracking !== undefined && newTrack !== oldTrack)
    out.push("Tracking " + oldTrack + " → " + newTrack);
  // charges
  const oc = order.charges || {}, nc = patch.charges || {};
  [["shipping", "Shipping"], ["customs", "Customs & taxes"], ["other", "Other"]].forEach(([k, lbl]) => {
    if (patch.charges !== undefined && (+(oc[k] || 0)) !== (+(nc[k] || 0)))
      out.push(lbl + " " + money(oc[k]) + " → " + money(nc[k]));
  });
  // payment
  const op = order.payment || { mode: "none", amount: 0 }, np = patch.payment || op;
  const payLbl = { none: "Not paid", advance: "Advance", deposit: "Deposit", full: "Paid in full" };
  if (patch.payment !== undefined && op.mode !== np.mode)
    out.push("Payment " + (payLbl[op.mode] || "Not paid") + " → " + (payLbl[np.mode] || "Not paid"));
  if (patch.payment !== undefined && (+(op.amount || 0)) !== (+(np.amount || 0)))
    out.push("Amount paid " + money(op.amount) + " → " + money(np.amount));
  // lines — compare by index (edit modal preserves order)
  const oldLines = poLines(order);
  const newLines = patch.lines || oldLines;
  newLines.forEach((nl, i) => {
    const ol = oldLines[i];
    if (!ol) { out.push("Added item " + (nl.name || nl.code)); return; }
    const name = nl.name || nl.code || ("item " + (i + 1));
    const oldCost = ol.cost != null ? ol.cost : (ol.landedUnit || 0);
    const newCost = nl.cost != null ? nl.cost : (nl.landedUnit || 0);
    if ((+(ol.qty || 0)) !== (+(nl.qty || 0))) out.push(name + ": qty " + (ol.qty || 0) + " → " + (nl.qty || 0));
    if ((+(ol.bonusQty || 0)) !== (+(nl.bonusQty || 0))) out.push(name + ": bonus " + (ol.bonusQty || 0) + " → " + (nl.bonusQty || 0));
    if ((+oldCost) !== (+newCost)) out.push(name + ": cost " + money(oldCost) + " → " + money(newCost));
    if ((+(ol.price || 0)) !== (+(nl.price || 0))) out.push(name + ": sale price " + money(ol.price) + " → " + money(nl.price));
  });
  return out;
}

/* ---------------- Purchase order — full detail page (opens like an invoice) ---------------- */
function OrderDetailPage({ po: ref, go, pushToast }) {
  const D = BCCWE;
  const [, force] = useState(0);
  const bump = () => force((x) => x + 1);
  const [editOpen, setEditOpen] = useState(false);
  const [opt, setOpt] = useState({ logs: true, salePrice: true, purchasePrice: true, shipping: true, other: true });
  const order = (D.purchaseOrders || []).find((p) => (p.ref || p.po) === ref);
  if (!order) return <div><PageHead title="Order not found" actions={<Btn variant="ghost" icon="chevron" onClick={() => go("inventory")}>Back</Btn>} /><Card><Empty text={"No purchase order " + ref} /></Card></div>;

  const C = D.company || {};
  const lines = poLines(order);
  const supObj = (D.suppliers || []).find((s) => s.id === order.supplier);
  const charges = order.charges || {};
  const shipping = charges.shipping || 0, customs = charges.customs || 0, otherChg = charges.other || 0;
  const payment = order.payment || { mode: "none", amount: 0 };
  const payLabel = { none: "Not paid", advance: "Advance", deposit: "Deposit", full: "Paid in full" };
  const logs = order.logs || [];
  const orderedBy = (logs[0] && logs[0].user) || "—";
  const lineCost = (l) => (l.qty || 0) * (l.cost != null ? l.cost : (l.landedUnit || 0));
  const goodsTotal = lines.reduce((s, l) => s + lineCost(l), 0);
  const chargesTotal = shipping + customs + otherChg;
  const grand = order.total != null ? order.total : +(goodsTotal + chargesTotal).toFixed(2);
  const ref0 = order.ref || order.po;

  function receive() { go("receive/" + ref0); }

  function download() {
    const paper = document.querySelector(".po-paper-card .po-paper");
    if (!paper) return;
    window.logDownload && window.logDownload({ kind: "PDF", file: ref0 + ".pdf", docNo: ref0 });
    pushToast && pushToast("Generating " + ref0 + ".pdf…");
    window.downloadInvoicePdf(paper, ref0 + ".pdf", (r) => {
      pushToast && pushToast(r === "fallback" ? "Use “Save as PDF” in the print dialog" : ref0 + ".pdf downloaded");
    });
  }

  function saveEdit(patch) {
    const changes = poEditDiff(order, patch);
    if (!changes.length) { setEditOpen(false); pushToast && pushToast("No changes made"); return; }
    const hadReceipts = poLines(order).some((l) => (l.qtyReceived || 0) > 0);
    Object.assign(order, patch);
    // Re-derive each line's landed cost from the EDITED cost + charges (same
    // allocation as PurchasePage: charges shared by line value, bonus units
    // dilute). Previously landedUnit kept its stale value, so a later receive
    // stocked the goods at the old cost no matter what was edited.
    if (Array.isArray(order.lines)) {
      const ch = order.charges || {};
      const totalCharges = (+ch.shipping || 0) + (+ch.customs || 0) + (+ch.other || 0);
      const totalValue = order.lines.reduce((s, l) => s + (l.qty || 0) * (l.cost || 0), 0);
      order.lines.forEach((l) => {
        const lineValue = (l.qty || 0) * (l.cost || 0);
        const share = totalCharges > 0 ? (totalValue > 0 ? totalCharges * (lineValue / totalValue) : totalCharges / order.lines.length) : 0;
        const u = (l.qty || 0) + (l.bonusQty || 0);
        l.charge = +share.toFixed(2);
        l.landedUnit = u > 0 ? +((lineValue + share) / u).toFixed(2) : (l.cost || 0);
      });
    }
    order.items = poLines(order).map((l) => (l.name || l.code) + " ×" + l.qty).join(", ");
    order.total = +(poLines(order).reduce((s, l) => s + (l.qty || 0) * (l.cost != null ? l.cost : (l.landedUnit || 0)), 0) + ((order.charges && (order.charges.shipping || 0) + (order.charges.customs || 0) + (order.charges.other || 0)) || 0)).toFixed(2);
    if (hadReceipts) {
      changes.push("note: stock already received keeps its previous cost — only future receipts use the new landed cost");
      pushToast && pushToast("Heads-up: already-received stock keeps its old cost; the new numbers apply to future receipts.");
    }
    const meNow = window.currentUser ? window.currentUser() : { name: "—" };
    (order.logs = order.logs || []).push({ ts: D.today + " " + new Date().toTimeString().slice(0, 5), user: (meNow && meNow.name) || "—", detail: "Order edited — " + changes.join("; ") });
    window.logAudit("UPDATE", "Purchase", "purchaseOrders", ref0, "Edited order " + ref0 + " — " + changes.join("; "));
    if (window.persist) window.persist("purchaseOrders");
    setEditOpen(false);
    pushToast && pushToast(ref0 + " updated · " + changes.length + " change" + (changes.length === 1 ? "" : "s"));
    bump();
  }

  const receivingDone = order.status === "Received" || order.status === "Partial";
  const anyReceived = receivingDone;
  const lineTone = (l) => (!receivingDone ? "" : l.qtyReceived === 0 ? "po-line-missing" : (l.qtyReceived || 0) < (l.qty || 0) ? "po-line-short" : "po-line-ok");
  const discrepancies = receivingDone ? lines.filter((l) => (l.qtyReceived || 0) < (l.qty || 0)) : [];

  const OptCk = ({ k, label }) => (
    <label className="po-opt"><input type="checkbox" checked={opt[k]} onChange={(e) => setOpt((o) => Object.assign({}, o, { [k]: e.target.checked }))} /><span>{label}</span></label>
  );

  return (
    <div>
      <PageHead title={"Purchase order " + ref0} sub={supplierName(order.supplier) + " · " + shortDate(order.date)}
        actions={<>
          <Btn variant="ghost" icon="chevron" onClick={() => go("inventory")}>Back</Btn>
          <Btn variant="ghost" icon="edit" onClick={() => setEditOpen(true)}>Edit</Btn>
          <Btn variant="ghost" icon="download" onClick={download}>Download PDF</Btn>
          {order.status !== "Received" && <Btn variant="primary" icon="check" onClick={receive}>Receive into inventory</Btn>}
        </>} />

      <div className="po-print-opts">
        <span className="field-label" style={{ margin: 0 }}>Print / PDF options</span>
        <OptCk k="purchasePrice" label="Purchase price" />
        <OptCk k="salePrice" label="Sale price" />
        <OptCk k="shipping" label="Shipping cost" />
        <OptCk k="other" label="Other details" />
        <OptCk k="logs" label="Change logs" />
      </div>

      {discrepancies.length > 0 && (
        <div className="po-discrep-banner">
          <Icon name="alert" size={16} />
          <div>
            <strong>Order discrepancy — {discrepancies.length} item{discrepancies.length === 1 ? "" : "s"} not fully received</strong>
            <span>{discrepancies.map((l) => (l.name || l.code) + " (" + (l.qtyReceived || 0) + " of " + (l.qty || 0) + (l.qtyReceived === 0 ? ", missing" : ", short " + ((l.qty || 0) - (l.qtyReceived || 0))) + ")").join(" · ")}</span>
          </div>
          {order.status !== "Received" && <Btn variant="ghost" size="sm" icon="check" onClick={receive}>Receive more</Btn>}
        </div>
      )}

      <div className="detail-grid">
        <div className="card po-paper-card">
          <div className="inv-paper po-paper">
            <div className="ip-top">
              <div className="ip-brand">
                {C.logo
                  ? <div className="ip-logo" style={{ padding: 0, overflow: "hidden" }}><img src={C.logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
                  : <div className="ip-logo">{(C.name || "BC").slice(0, 2).toUpperCase()}</div>}
                <div className="ip-co">
                  <strong>{C.name || "BCCWE"}</strong>
                  {C.addr1 && <span>{C.addr1}</span>}
                  {C.addr2 && <span>{C.addr2}</span>}
                  {[C.phone, C.email].filter(Boolean).length ? <span>{[C.phone, C.email].filter(Boolean).join(" · ")}</span> : null}
                </div>
              </div>
              <div className="ip-meta">
                <h2>PURCHASE ORDER</h2>
                <table><tbody>
                  <tr><td>Order #</td><th>{ref0}</th></tr>
                  <tr><td>Date</td><th>{shortDate(order.date)}</th></tr>
                  <tr><td>Status</td><th><Badge tone={statusTone(order.status)}>{order.status}</Badge></th></tr>
                  {opt.other && order.tracking && order.tracking !== "—" && <tr><td>Tracking</td><th className="mono">{order.tracking}</th></tr>}
                </tbody></table>
              </div>
            </div>

            <div className="ip-parties">
              <div>
                <span className="ip-lbl">Supplier</span>
                <strong>{supplierName(order.supplier)}</strong>
                {supObj && supObj.contact && <span>{supObj.contact}</span>}
                {supObj && supObj.phone && <span>{supObj.phone}</span>}
                {supObj && supObj.email && <span>{supObj.email}</span>}
              </div>
              <div className="ip-right">
                <span className="ip-lbl">Ordered by</span><strong>{orderedBy}</strong>
                <span className="ip-lbl" style={{ marginTop: 10 }}>Payment</span>
                <strong>{payLabel[payment.mode] || "Not paid"}{payment.mode && payment.mode !== "none" && payment.amount ? " · " + fmt(payment.amount) : ""}</strong>
              </div>
            </div>

            <table className="ip-lines">
              <thead><tr>
                <th>Item</th><th className="r">Qty</th>
                {anyReceived && <th className="r">Received</th>}
                <th className="r">Bonus</th>
                {opt.purchasePrice && <th className="r">Unit cost</th>}
                {opt.salePrice && <th className="r">Sale price</th>}
                {opt.purchasePrice && <th className="r">Line total</th>}
              </tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={lineTone(l)}>
                    <td><strong>{l.name || l.code}</strong>{l.code && <em className="ip-code">{l.code}</em>}</td>
                    <td className="r">{l.qty}</td>
                    {anyReceived && <td className="r">{l.qtyReceived == null ? "—" : l.qtyReceived < (l.qty || 0) ? <strong>{l.qtyReceived}{l.qtyReceived === 0 ? " · missing" : " · short " + ((l.qty || 0) - l.qtyReceived)}</strong> : l.qtyReceived}</td>}
                    <td className="r">{l.bonusQty ? "+" + l.bonusQty : "—"}</td>
                    {opt.purchasePrice && <td className="r">{fmt(l.cost != null ? l.cost : (l.landedUnit || 0))}</td>}
                    {opt.salePrice && <td className="r">{fmt(l.price || 0)}</td>}
                    {opt.purchasePrice && <td className="r">{fmt(lineCost(l))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ip-foot">
              <div className="ip-notes">
                {opt.other && <><span className="ip-lbl">Order summary</span><p>{lines.length} item(s) · {lines.reduce((s, l) => s + (l.qty || 0), 0)} unit(s){lines.reduce((s, l) => s + (l.bonusQty || 0), 0) ? " + " + lines.reduce((s, l) => s + (l.bonusQty || 0), 0) + " bonus" : ""}</p></>}
              </div>
              <div className="ip-totals">
                {opt.purchasePrice && <div><span>Goods</span><span>{fmt(goodsTotal)}</span></div>}
                {opt.shipping && shipping > 0 && <div><span>Shipping</span><span>{fmt(shipping)}</span></div>}
                {opt.other && customs > 0 && <div><span>Customs &amp; taxes</span><span>{fmt(customs)}</span></div>}
                {opt.other && otherChg > 0 && <div><span>Other</span><span>{fmt(otherChg)}</span></div>}
                <div className="ip-grand"><span>Total CAD</span><span>{fmt(grand)}</span></div>
                {payment.mode && payment.mode !== "none" && payment.amount > 0 && <div><span>{payLabel[payment.mode]}</span><span>-{fmt(payment.amount)}</span></div>}
                {payment.mode && payment.mode !== "none" && payment.amount > 0 && <div className="ip-bal"><span>Balance to supplier</span><span>{fmt(Math.max(0, grand - payment.amount))}</span></div>}
              </div>
            </div>

            {opt.logs && logs.length > 0 && (
              <div className="po-paper-logs">
                <span className="ip-lbl">Change log</span>
                <ul>{logs.map((g, i) => <li key={i}><span className="mono muted">{g.ts}</span> <strong>{g.user}</strong> — {g.detail}</li>)}</ul>
              </div>
            )}
          </div>
        </div>

        <aside className="invgen-rail">
          <div className="rail-card">
            <h3>Order summary</h3>
            <div className="trow"><span>Goods</span><span className="num">{fmt(goodsTotal)}</span></div>
            {chargesTotal > 0 && <div className="trow"><span>Charges</span><span className="num">{fmt(chargesTotal)}</span></div>}
            <div className="rail-total" style={{ borderBottom: "none" }}><span>Total</span><strong>{fmt(grand)}</strong></div>
            <div style={{ marginTop: 6 }}><Badge tone={statusTone(order.status)} dot>{order.status}</Badge></div>
            {order.status !== "Received" && <Btn variant="primary" full icon="check" onClick={receive}>Receive into inventory</Btn>}
          </div>

          <div className="rail-card">
            <h3>Details</h3>
            <ul className="acct-meta">
              <li><span>Supplier</span><strong>{supplierName(order.supplier)}</strong></li>
              <li><span>Ordered by</span><strong>{orderedBy}</strong></li>
              <li><span>Date</span><strong>{shortDate(order.date)}</strong></li>
              <li><span>Tracking</span><strong className="mono">{order.tracking || "—"}</strong></li>
              <li><span>Payment</span><strong>{payLabel[payment.mode] || "Not paid"}{payment.amount ? " · " + fmt(payment.amount) : ""}</strong></li>
            </ul>
          </div>

          <div className="rail-card">
            <h3>Change log</h3>
            {logs.length ? (
              <ul className="pay-hist">
                {logs.slice().reverse().map((g, i) => (
                  <li key={i}><div><strong>{g.user}</strong><span className="rail-note" style={{ marginTop: 2 }}>{g.detail}</span></div><span className="muted mono">{g.ts}</span></li>
                ))}
              </ul>
            ) : <p className="rail-note">No changes logged yet.</p>}
          </div>
        </aside>
      </div>

      {editOpen && <OrderEditModal order={order} onClose={() => setEditOpen(false)} onSave={saveEdit} />}
    </div>
  );
}

function OrderEditModal({ order, onClose, onSave }) {
  const D = BCCWE;
  const [supplier, setSupplier] = useState(order.supplier || "");
  const [status, setStatus] = useState(order.status || "Placed");
  const [date, setDate] = useState(order.date || D.today);
  const [tracking, setTracking] = useState(order.tracking === "—" ? "" : (order.tracking || ""));
  const ch = order.charges || {};
  const [shipping, setShipping] = useState(ch.shipping || 0);
  const [customs, setCustoms] = useState(ch.customs || 0);
  const [other, setOther] = useState(ch.other || 0);
  const pay = order.payment || { mode: "none", amount: 0, account: "1010" };
  const [payMode, setPayMode] = useState(pay.mode || "none");
  const [payAmt, setPayAmt] = useState(pay.amount || 0);
  const [payAcct, setPayAcct] = useState(pay.account || "1010");
  const [lines, setLines] = useState(() => poLines(order).map((l) => Object.assign({}, l)));
  // Once ANY stock has been received, the status is owned by the receive flow —
  // hand-flipping it to "Received" here never moved stock and killed the
  // Receive button, and "Partial" wasn't even in the option list (blank select).
  const hasReceipts = poLines(order).some((l) => (l.qtyReceived || 0) > 0) || order.status === "Received" || order.status === "Partial";

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, patch) : l)));

  function submit() {
    const cleanLines = lines.map((l) => Object.assign({}, l, {
      // Quantity can never drop below what was already received.
      qty: Math.max(l.qtyReceived || 0, Math.max(0, parseFloat(l.qty) || 0)),
      bonusQty: Math.max(0, parseFloat(l.bonusQty) || 0),
      cost: Math.max(0, parseFloat(l.cost) || 0),
      price: Math.max(0, parseFloat(l.price) || 0),
    }));
    onSave({
      supplier, status: hasReceipts ? order.status : status, date,
      tracking: tracking.trim() || "—",
      charges: { shipping: +shipping || 0, customs: +customs || 0, other: +other || 0 },
      payment: { mode: payMode, amount: payMode === "none" ? 0 : (+payAmt || 0), account: payAcct },
      lines: cleanLines,
    });
  }

  return (
    <Modal title={"Edit order — " + (order.ref || order.po)} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={submit}>Save changes</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Supplier">
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            {D.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Status" hint={hasReceipts ? "Set automatically by receiving" : "Use “Receive into inventory” to book stock"}>
          {hasReceipts
            ? <input value={order.status} readOnly className="ro" title="This order has received stock — status is set by the receive flow" />
            : <select value={status === "Received" ? "Placed" : status} onChange={(e) => setStatus(e.target.value)}>
                {["Placed", "In Transit"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>}
        </Field>
        <Field label="Order date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Tracking #"><input value={tracking} placeholder="Optional" onChange={(e) => setTracking(e.target.value)} /></Field>
      </div>

      <div className="store-form-sec" style={{ margin: "12px 0 6px" }}>Items ordered</div>
      <table className="data-table compact">
        <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Bonus</th><th className="r">Unit cost</th><th className="r">Sale price</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><strong>{l.name || l.code}</strong>{l.code ? <em className="cat-tag" style={{ marginLeft: 6 }}>{l.code}</em> : null}</td>
              <td className="r"><input className="r purch-in" type="number" min={l.qtyReceived || 0} value={l.qty} title={(l.qtyReceived || 0) > 0 ? (l.qtyReceived + " already received — quantity can't go below that") : undefined} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
              <td className="r"><input className="r purch-in" type="number" min="0" value={l.bonusQty || 0} onChange={(e) => setLine(i, { bonusQty: e.target.value })} /></td>
              <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.cost != null ? l.cost : (l.landedUnit || 0)} onChange={(e) => setLine(i, { cost: e.target.value })} /></td>
              <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.price || 0} onChange={(e) => setLine(i, { price: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="store-form-sec" style={{ margin: "12px 0 6px" }}>Landed charges</div>
      <div className="purch-charges">
        <label>Shipping<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} /></div></label>
        <label>Customs &amp; taxes<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={customs} onChange={(e) => setCustoms(e.target.value)} /></div></label>
        <label>Other<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={other} onChange={(e) => setOther(e.target.value)} /></div></label>
      </div>

      <div className="meta-grid" style={{ marginTop: 12 }}>
        <Field label="Payment to supplier">
          <select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
            <option value="none">Not paid</option>
            <option value="deposit">Deposit</option>
            <option value="advance">Advance</option>
            <option value="full">Paid in full</option>
          </select>
        </Field>
        {payMode !== "none" && <Field label="Amount paid"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div></Field>}
        {payMode !== "none" && (
          <Field label="Paid from">
            <select value={payAcct} onChange={(e) => setPayAcct(e.target.value)}>
              {(D.accounts || []).filter((a) => a.type === "Asset").map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Purchase order — receive page (per-item quantities & discrepancies) ---------------- */
function ReceiveOrderPage({ po: ref, go, pushToast }) {
  const D = BCCWE;
  const order = (D.purchaseOrders || []).find((p) => (p.ref || p.po) === ref);
  if (!order) return <div><PageHead title="Order not found" actions={<Btn variant="ghost" icon="chevron" onClick={() => go("inventory")}>Back</Btn>} /><Card><Empty text={"No purchase order " + ref} /></Card></div>;
  // Guard the deep link: a fully received order has nothing left to receive —
  // a stale tab could previously re-apply the whole receipt a second time.
  if (order.status === "Received") return (
    <div>
      <PageHead title={"Receive order " + (order.ref || order.po)}
        actions={<Btn variant="ghost" icon="chevron" onClick={() => go("po/" + (order.ref || order.po))}>Back to order</Btn>} />
      <Card><Empty icon="check" text="This order is already fully received — there is nothing left to receive." /></Card>
    </div>
  );
  const ref0 = order.ref || order.po;
  const srcLines = poLines(order);
  // outstanding = ordered minus already received
  const outstanding = (l) => Math.max(0, (l.qty || 0) - (l.qtyReceived || 0));
  // prefill each row with what's still outstanding (full order on first receive)
  const [recv, setRecv] = useState(() => srcLines.map((l) => String(outstanding(l))));
  const [note, setNote] = useState("");

  const num = (v) => Math.max(0, Math.round(parseFloat(v) || 0));
  // Receiving is capped at the outstanding amount — over-typing can't over-stock.
  const gotFor = (l, i) => Math.min(num(recv[i]), outstanding(l));
  const setRow = (i, v) => setRecv((a) => a.map((x, j) => (j === i ? v : x)));
  const fillAll = () => setRecv(srcLines.map((l) => String(outstanding(l))));
  const clearAll = () => setRecv(srcLines.map(() => "0"));

  const totalUnits = srcLines.reduce((s, l, i) => s + gotFor(l, i), 0);
  const anyShort = srcLines.some((l, i) => gotFor(l, i) < outstanding(l));

  async function submit() {
    if (totalUnits <= 0 && !window.confirm("You haven't entered any received quantities. Mark the whole order as nothing received?")) return;
    // Snapshot everything this touches — a failed save must roll all of it back
    // (previously this fired a debounced persist and navigated away blind).
    const snapKeys = ["purchaseOrders", "inventory", "orderDiscrepancies"];
    const snap = {};
    try { snapKeys.forEach((k) => { snap[k] = JSON.parse(JSON.stringify(D[k] || [])); }); } catch (e) {}
    let added = 0;
    const recvLog = [];
    srcLines.forEach((l, i) => {
      const out0 = outstanding(l); // capture BEFORE mutating — the log denominator
      const got = gotFor(l, i);
      const it = itemByCode(l.code);
      const landed = l.landedUnit != null ? l.landedUnit : (l.cost || 0);
      // bonus comes proportionally — full bonus only if the full outstanding qty arrived
      const bonus = got >= out0 && out0 > 0 ? (l.bonusQty || 0) : 0;
      const units = got + bonus;
      added += units;
      if (it && units > 0) {
        const prevStock = Math.max(0, it.stock || 0), prevCost = it.cost || 0;
        const denom = prevStock + units;
        it.cost = denom > 0 ? +(((prevStock * prevCost) + (units * landed)) / denom).toFixed(2) : landed;
        it.stock = (it.stock || 0) + units;
        it.purchased = D.today; delete it.stockState;
      }
      // accumulate onto any prior receipts
      const before = l.qtyReceived || 0;
      l.qtyReceived = before + got;
      const short = (l.qty || 0) - l.qtyReceived;
      if (l.qtyReceived >= (l.qty || 0)) { delete l.discrepancy; }
      else { l.discrepancy = { ordered: l.qty || 0, received: l.qtyReceived, short, kind: l.qtyReceived === 0 ? "missing" : "short" }; }
      recvLog.push((l.name || l.code) + " " + got + "/" + out0 + (short > 0 ? " (short " + short + ")" : ""));
    });

    // also write back to legacy flat orders
    if (!Array.isArray(order.lines)) order.qtyReceived = srcLines[0] ? srcLines[0].qtyReceived : 0;

    const fullyReceived = srcLines.every((l) => (l.qtyReceived || 0) >= (l.qty || 0));
    order.status = fullyReceived ? "Received" : "Partial";
    order.hasDiscrepancy = srcLines.some((l) => (l.qtyReceived || 0) < (l.qty || 0));

    // Refresh the discrepancy register for THIS order: drop earlier rows and
    // write only what is STILL short. Previously every partial receive stacked
    // a new row per line, so the same shortfall was counted multiple times and
    // resolved rows never cleared.
    D.orderDiscrepancies = (D.orderDiscrepancies || []).filter((d) => d.ref !== ref0);
    srcLines.forEach((l) => {
      const short = (l.qty || 0) - (l.qtyReceived || 0);
      if (short > 0) {
        D.orderDiscrepancies.unshift({
          id: "disc" + Date.now() + "-" + (l.code || ""), ref: ref0, date: D.today,
          code: l.code, name: l.name || l.code, supplier: order.supplier,
          ordered: l.qty || 0, received: l.qtyReceived || 0, short,
          kind: (l.qtyReceived || 0) === 0 ? "missing" : "short", note: note.trim() || "",
        });
      }
    });

    const meNow = window.currentUser ? window.currentUser() : { name: "—" };
    (order.logs = order.logs || []).push({
      ts: D.today + " " + new Date().toTimeString().slice(0, 5), user: (meNow && meNow.name) || "—",
      detail: "Received " + added + " unit(s) — " + recvLog.join("; ") + (note.trim() ? " · note: " + note.trim() : ""),
    });
    window.logAudit("POST", "Purchase", "purchaseOrders", ref0, "Received order " + ref0 + " · " + added + " unit(s)" + (anyShort ? " · discrepancy" : ""));
    const ok = window.persistNow ? await window.persistNow("purchaseOrders", "inventory", "orderDiscrepancies") : true;
    if (!ok) {
      snapKeys.forEach((k) => { if (snap[k]) D[k] = snap[k]; });
      pushToast && pushToast("Couldn't save — no connection. Nothing was received; please try again.");
      setRecv((a) => a.slice()); // re-render against the restored data
      return;
    }
    pushToast && pushToast(ref0 + (fullyReceived ? " fully received" : " partially received") + " · " + added + " unit(s) added");
    go("po/" + ref0);
  }

  const stepBtn = { width: 28, height: 32, border: "1px solid #d4dae2", background: "#fff", borderRadius: 7, cursor: "pointer", fontWeight: 700, lineHeight: 1 };

  return (
    <div>
      <PageHead title={"Receive order " + ref0} sub={supplierName(order.supplier) + " · " + shortDate(order.date) + " · set the quantity actually received per item"}
        actions={<>
          <Btn variant="ghost" icon="chevron" onClick={() => go("po/" + ref0)}>Back</Btn>
          <Btn variant="ghost" icon="check" onClick={fillAll}>Receive complete order</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Submit receipt ({totalUnits})</Btn>
        </>} />

      <Card pad={false}>
        <div className="toolbar">
          <p className="rail-note" style={{ margin: 0 }}>Quantities are pre-filled with the full outstanding amount. Lower a box if fewer arrived, or set it to 0 if the item didn't arrive — shortfalls are flagged as a discrepancy.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="link" type="button" onClick={fillAll}>Select all (full)</button>
            <button className="link" type="button" onClick={clearAll}>Clear all</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Item</th><th className="r">Ordered</th><th className="r">Already received</th><th className="r">Bonus</th><th style={{ textAlign: "center" }}>Receiving now</th><th>Result</th></tr></thead>
          <tbody>
            {srcLines.map((l, i) => {
              const out = outstanding(l);
              const got = gotFor(l, i);
              const tone = got >= out ? "po-line-ok" : got === 0 ? "po-line-missing" : "po-line-short";
              return (
                <tr key={i} className={tone}>
                  <td><strong>{l.name || l.code}</strong>{l.code ? <em className="cat-tag" style={{ marginLeft: 6 }}>{l.code}</em> : null}</td>
                  <td className="r">{l.qty || 0}</td>
                  <td className="r muted">{l.qtyReceived || 0}</td>
                  <td className="r">{l.bonusQty ? "+" + l.bonusQty : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                      <button type="button" style={stepBtn} onClick={() => setRow(i, String(Math.max(0, got - 1)))}>−</button>
                      <input type="number" min="0" max={out} value={recv[i]} onChange={(e) => setRow(i, e.target.value)} style={{ width: 64, textAlign: "center" }} />
                      <button type="button" style={stepBtn} onClick={() => setRow(i, String(Math.min(out, got + 1)))}>+</button>
                    </div>
                  </td>
                  <td>
                    {got >= out
                      ? <Badge tone="green" dot>Complete</Badge>
                      : got === 0
                        ? <Badge tone="red" dot>Missing</Badge>
                        : <Badge tone="amber" dot>Short {out - got}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="purchase-foot">
          <Field label="Discrepancy note (optional)" hint="Reason for any shortfall — saved with the order and the discrepancy record">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 units damaged in transit, backordered…" />
          </Field>
          <div className="purchase-summary" style={{ marginTop: 12 }}>
            <div><span>Units to stock</span><strong className="mono">+{totalUnits}</strong></div>
            <div><span>Discrepancies</span><strong className="mono">{srcLines.filter((l, i) => gotFor(l, i) < outstanding(l)).length}</strong></div>
            <div><span>Result</span><strong>{srcLines.every((l, i) => gotFor(l, i) >= outstanding(l)) ? "Fully received" : "Partial / discrepancy"}</strong></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReceivePOModal({ po, onConfirm, onClose }) {
  const ordered = po.qty || 0;
  const [qty, setQty] = useState(String(ordered));
  const n = Math.max(0, Math.round(parseFloat(qty) || 0));
  const it = itemByCode(po.code);
  const diff = n - ordered;
  return (
    <Modal title={"Receive " + po.po} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={() => onConfirm(po, n)}>Confirm receipt</Btn>
      </>}>
      <p className="rail-note">Receiving adds stock to <strong>{po.code || "—"}</strong>{it ? " — " + it.name : ""}. Adjust the quantity if you received more or fewer than ordered.</p>
      <div className="meta-grid">
        <Field label="Ordered"><input value={ordered} readOnly className="ro" /></Field>
        <Field label="Quantity received" hint={diff === 0 ? "Exact" : diff > 0 ? "+" + diff + " over" : diff + " short"}>
          <input type="number" min="0" value={qty} autoFocus onChange={(e) => setQty(e.target.value)} />
        </Field>
        {po.bonusQty ? <Field label="Bonus units"><input value={po.bonusQty} readOnly className="ro" /></Field> : null}
      </div>
      <div className="purchase-summary" style={{ marginTop: 10 }}>
        <div><span>Stock added</span><strong className="mono">+{n + (po.bonusQty || 0)}</strong></div>
        {it ? <div><span>New stock level</span><strong className="mono">{(it.stock || 0) + n + (po.bonusQty || 0)}</strong></div> : null}
      </div>
    </Modal>
  );
}

/* ---------------- Inventory — product detail / analytics view ---------------- */
function ItemViewModal({ item, onClose, onEdit }) {
  const D = BCCWE;
  const sales = D.itemSales.filter((s) => s.code === item.code);
  const units = sales.reduce((s, r) => s + r.qty, 0);
  // Recorded sale figures, not the current list price/cost.
  const revenue = sales.reduce((s, r) => s + r.qty * ((r.price != null ? r.price : item.price) * (1 - ((r.disc || 0) / 100))), 0);
  const cogs = sales.reduce((s, r) => s + r.qty * (r.cost != null ? r.cost : item.cost), 0);
  const profit = revenue - cogs;
  const margin = item.price - item.cost;
  const mpct = item.price ? Math.round((margin / item.price) * 100) : 0;

  // by-customer aggregation
  const byClient = {};
  sales.forEach((s) => {
    const a = byClient[s.clientId] || (byClient[s.clientId] = { id: s.clientId, units: 0, revenue: 0, profit: 0 });
    a.units += s.qty; a.revenue += s.qty * item.price; a.profit += s.qty * (item.price - item.cost);
  });
  const clientRows = Object.values(byClient).sort((a, b) => b.profit - a.profit);
  const best = clientRows[0];
  const maxProfit = Math.max(1, ...clientRows.map((c) => c.profit));

  // trend over the item's active range
  const dates = sales.map((s) => s.date).sort();
  const range = dates.length ? { from: dates[0], to: dates[dates.length - 1], label: shortDate(dates[0]) + " – " + shortDate(dates[dates.length - 1]) } : null;
  const buckets = range ? timeBuckets(range).map((bk) => {
    let v = 0;
    sales.forEach((s) => { if (bk.test(s.date)) v += s.qty * (item.price - item.cost); });
    return { label: bk.label, value: v };
  }) : [];

  const low = item.kind !== "Service" && (item.alert || 0) > 0 && item.stock <= item.alert;
  const ci = itemAvgCost(item);
  const poRecs = poFlatLines((p) => p.code === item.code && p.status === "Received").slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const facts = [
    ["Category", item.cat + (item.subcat ? " › " + item.subcat : "")],
    ["Average cost (on hand)", fmt(ci.avg)],
    ["Latest purchase cost", fmt(ci.last)],
    ["Cost price", fmt(item.cost)],
    ["Sales price", fmt(item.price)],
    ["Unit margin", fmt(margin) + "  ·  " + mpct + "%"],
    ["Stock on hand", item.stock + (low ? "  ⚠ low" : "")],
    ["Purchased", item.purchased ? shortDate(item.purchased) + "  ·  " + window.STOCK.ageDays(item) + "d in stock" : "—"],
    ["Movement (90d)", window.STOCK.movement(item).label + (window.STOCK.movement(item).u90 ? "  ·  " + window.STOCK.movement(item).u90 + " sold · " + window.STOCK.movement(item).perMonth + "/mo" : "")],
    ["Bonus stock", item.bonus ? "+" + item.bonus : "—"],
    ["Alert threshold", String(item.alert)],
    ["Stock value (cost)", fmt(item.stock * item.cost)],
    ["Retail value", fmt(item.stock * item.price)],
  ];

  return (
    <Modal title={item.code} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn variant="primary" icon="edit" onClick={onEdit}>Edit item</Btn>
      </>}>
      <div className="iv-head">
        <div>
          <h4 className="iv-name">{item.name}</h4>
          <span className="cat-tag">{item.cat}</span>
        </div>
        <div className="iv-head-badges">
          {low && <Badge tone="red" dot>Low stock</Badge>}
          {window.STOCK.state(item) === "notmoving" && <Badge tone="amber" dot>Not moving</Badge>}
          {window.STOCK.state(item) === "dead" && <Badge tone="red" dot>Dead stock</Badge>}
          {!low && window.STOCK.state(item) === "active" && <Badge tone="green" dot>In stock</Badge>}
        </div>
      </div>

      <div className="iv-facts">
        {facts.map(([k, v]) => (
          <div className="iv-fact" key={k}><span>{k}</span><strong className="mono">{v}</strong></div>
        ))}
      </div>

      {item.kind !== "Service" && (
        <div style={{ marginTop: 8 }}>
          <h5 className="iv-sec">Purchase history — average cost of stock on hand</h5>
          <div className="period-summary">
            <div><span>Average cost</span><strong className="mono">{fmt(ci.avg)}</strong></div>
            <div><span>Latest cost</span><strong className="mono">{fmt(ci.last)}</strong></div>
            <div><span>Stock value</span><strong className="mono">{fmt(ci.totalValue || item.stock * item.cost)}</strong></div>
          </div>
          {poRecs.length ? (
            <table className="data-table compact" style={{ marginTop: 10 }}>
              <thead><tr><th>Date</th><th>PO #</th><th className="r">Qty</th><th className="r">Unit cost</th><th className="r">Total</th></tr></thead>
              <tbody>
                {poRecs.map((p) => { const u = p.landedUnit != null ? p.landedUnit : item.cost; const q = (p.qtyReceived != null ? p.qtyReceived : p.qty) || 0; return (
                  <tr key={p.po}><td className="muted">{shortDate(p.date)}</td><td className="mono">{p.po}</td><td className="r">{q}</td><td className="r mono">{fmt(u)}</td><td className="r mono">{fmt(q * u)}</td></tr>
                ); })}
              </tbody>
            </table>
          ) : <p className="rail-note" style={{ marginTop: 8 }}>No recorded purchases yet — receive a purchase order to build cost layers.</p>}
        </div>
      )}

      <h5 className="iv-sec">Lifetime sales performance</h5>
      <div className="period-summary">
        <div><span>Units sold</span><strong className="mono">{units}</strong></div>
        <div><span>Revenue</span><strong className="mono">{fmt(revenue)}</strong></div>
        <div><span>Cost of goods</span><strong className="mono">{fmt(cogs)}</strong></div>
        <div><span>Gross profit</span><strong className="mono pos">{fmt(profit)}</strong></div>
        <div><span>Avg margin</span><strong className="mono">{mpct}%</strong></div>
      </div>

      {best ? (
        <div className="iv-best">
          <span className="iv-best-ico"><Icon name="user" size={18} /></span>
          <div>
            <span className="iv-best-lbl">Most profitable customer for this product</span>
            <strong>{clientName(best.id)}</strong>
          </div>
          <div className="iv-best-nums">
            <div><span>Units</span><strong className="mono">{best.units}</strong></div>
            <div><span>Revenue</span><strong className="mono">{fmt(best.revenue)}</strong></div>
            <div><span>Profit</span><strong className="mono pos">{fmt(best.profit)}</strong></div>
          </div>
        </div>
      ) : (
        <Empty icon="cart" text="No sales recorded for this product yet" />
      )}

      {clientRows.length > 0 && <>
        <h5 className="iv-sec">Customers by profit</h5>
        <table className="data-table">
          <thead><tr><th>Customer</th><th className="r">Units</th><th className="r">Revenue</th><th className="r">Profit</th></tr></thead>
          <tbody>
            {clientRows.map((c) => (
              <tr key={c.id}>
                <td className="strong">{clientName(c.id)}</td>
                <td className="r mono">{c.units}</td>
                <td className="r mono">{fmt(c.revenue)}</td>
                <td className="r"><div className="profit-cell"><span className="mono pos strong">{fmt(c.profit)}</span><div className="profit-bar"><i style={{ width: (c.profit / maxProfit) * 100 + "%" }} /></div></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {buckets.length > 1 && <>
        <h5 className="iv-sec">Gross profit trend</h5>
        <div style={{ padding: "0 4px 4px" }}>
          <ProfitTrendChart buckets={buckets} caption={item.code + " gross profit"} />
        </div>
      </>}
    </Modal>
  );
}

/* ---------------- Inventory — Sales & profit by period ---------------- */
function InventoryProfit() {
  const D = BCCWE;
  const [period, setPeriod] = useState("year");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  const [sort, setSort] = useState("profit_desc");
  const [focus, setFocus] = useState("all");
  const range = periodRange(period, from, to);

  const profitSorts = {
    profit_desc: { label: "Profit — high to low", get: (r) => r.profit, dir: "desc" },
    profit_asc: { label: "Profit — low to high", get: (r) => r.profit, dir: "asc" },
    revenue_desc: { label: "Revenue — high to low", get: (r) => r.revenue, dir: "desc" },
    units_desc: { label: "Units sold — high to low", get: (r) => r.units, dir: "desc" },
    margin_desc: { label: "Unit margin — high to low", get: (r) => r.price - r.cost, dir: "desc" },
    name_asc: { label: "Name — A to Z", get: (r) => r.name, dir: "asc" },
  };

  const agg = {};
  D.itemSales.forEach((s) => {
    if (!inRange(s.date, range)) return;
    const it = itemByCode(s.code); if (!it) return;
    const m = agg[s.code] || (agg[s.code] = { code: s.code, name: it.name, cat: it.cat, price: it.price, cost: it.cost, units: 0, revenue: 0, profit: 0 });
    // Use the RECORDED sale price/discount/cost, not the live catalogue values —
    // otherwise "historical" revenue changes whenever a price is edited.
    const price = (s.price != null ? s.price : it.price) * (1 - ((s.disc || 0) / 100));
    const cost = s.cost != null ? s.cost : it.cost;
    m.units += s.qty; m.revenue += s.qty * price; m.profit += s.qty * (price - cost);
  });
  const rows = applySort(Object.values(agg), sort, profitSorts);
  const tU = rows.reduce((s, r) => s + r.units, 0);
  const tR = rows.reduce((s, r) => s + r.revenue, 0);
  const tC = rows.reduce((s, r) => s + (r.revenue - r.profit), 0);
  const tP = rows.reduce((s, r) => s + r.profit, 0);
  const max = Math.max(1, ...rows.map((r) => r.profit));

  const buckets = timeBuckets(range).map((bk) => {
    let v = 0;
    D.itemSales.forEach((s) => {
      if (!bk.test(s.date)) return;
      if (focus !== "all" && s.code !== focus) return;
      const it = itemByCode(s.code); if (!it) return;
      const price = (s.price != null ? s.price : it.price) * (1 - ((s.disc || 0) / 100));
      const cost = s.cost != null ? s.cost : it.cost;
      v += s.qty * (price - cost);
    });
    return { label: bk.label, value: v };
  });

  return (
    <Card pad={false}>
      <div className="toolbar">
        <PeriodFilter period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <SortControl sort={sort} setSort={setSort} defs={profitSorts} />
      </div>
      <div className="chart-wrap">
        <div className="chart-head">
          <h4>Gross profit trend{focus !== "all" ? " — " + focus : " — all products"}</h4>
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="all">All products</option>
            {D.inventory.map((i) => <option key={i.code} value={i.code}>{i.code} · {i.name}</option>)}
          </select>
        </div>
        <ProfitTrendChart buckets={buckets} caption="Products gross profit" />
      </div>
      <div className="period-summary">
        <div><span>Units sold</span><strong className="mono">{tU}</strong></div>
        <div><span>Revenue</span><strong className="mono">{fmt(tR)}</strong></div>
        <div><span>Cost of goods</span><strong className="mono">{fmt(tC)}</strong></div>
        <div><span>Gross profit</span><strong className="mono pos">{fmt(tP)}</strong></div>
        <div className="ps-range">{range.label}</div>
      </div>
      <table className="data-table">
        <thead><tr><th>Item</th><th className="r">Units sold</th><th className="r">Revenue</th><th className="r">Cost</th><th className="r">Profit</th><th className="r">Margin</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const mpct = r.revenue ? Math.round((r.profit / r.revenue) * 100) : 0;
            return (
              <tr key={r.code}>
                <td><span className="mono strong">{r.code}</span><em className="cat-tag">{r.cat}</em><div className="muted" style={{ fontSize: 12 }}>{r.name}</div></td>
                <td className="r mono">{r.units}</td>
                <td className="r mono">{fmt(r.revenue)}</td>
                <td className="r mono muted">{fmt(r.revenue - r.profit)}</td>
                <td className="r"><div className="profit-cell"><span className="mono pos strong">{fmt(r.profit)}</span><div className="profit-bar"><i style={{ width: (r.profit / max) * 100 + "%" }} /></div></div></td>
                <td className="r mono">{mpct}%</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan="6"><Empty icon="box" text="No sales recorded in this period" /></td></tr>}
        </tbody>
        <tfoot><tr><td>Totals ({rows.length} items)</td><td className="r mono strong">{tU}</td><td className="r mono strong">{fmt(tR)}</td><td className="r mono">{fmt(tC)}</td><td className="r mono strong pos">{fmt(tP)}</td><td className="r mono">{tR ? Math.round((tP / tR) * 100) : 0}%</td></tr></tfoot>
      </table>
    </Card>
  );
}

/* ---------------- Defective products (write-off / loss register) ---------------- */
function DefectiveProducts() {
  const D = BCCWE;
  const [sort, setSort] = useState("date_desc");
  const [kindF, setKindF] = useState("all");
  const defSorts = {
    date_desc: { label: "Date — newest first", get: (r) => new Date(r.date).getTime(), dir: "desc" },
    loss_desc: { label: "Loss — high to low", get: (r) => r.costLoss, dir: "desc" },
    qty_desc: { label: "Qty — high to low", get: (r) => r.qty, dir: "desc" },
    name_asc: { label: "Item — A to Z", get: (r) => r.name, dir: "asc" },
  };
  const all = D.defectiveProducts;
  const kindOf = (r) => r.kind || "defective";
  const filtered = kindF === "all" ? all : all.filter((r) => kindOf(r) === kindF);
  const rows = applySort(filtered, sort, defSorts);
  const sumLoss = (k) => all.filter((r) => k === "all" || kindOf(r) === k).reduce((s, r) => s + r.costLoss, 0);
  const sumUnits = (k) => all.filter((r) => k === "all" || kindOf(r) === k).reduce((s, r) => s + r.qty, 0);
  const totalLoss = rows.reduce((s, r) => s + r.costLoss, 0);
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div>
      <div className="kpi-row tri" style={{ marginBottom: 18 }}>
        <MiniStat label="Defective loss" value={fmt(sumLoss("defective"))} ico="alert" />
        <MiniStat label="Lost / missing loss" value={fmt(sumLoss("lost"))} ico="search" />
        <MiniStat label="Total stock loss" value={fmt(sumLoss("all"))} ico="money" />
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <div className="check-filters">
            {[["all", "All"], ["defective", "Defective"], ["lost", "Lost / missing"]].map(([k, lbl]) => (
              <button key={k} className={"chip" + (kindF === k ? " on" : "")} onClick={() => setKindF(k)}>{lbl} <em style={{ fontStyle: "normal", opacity: .65 }}>{sumUnits(k)}</em></button>
            ))}
          </div>
          <SortControl sort={sort} setSort={setSort} defs={defSorts} />
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Item code</th><th>Description</th><th>Reason</th><th className="r">Qty</th><th className="r">Loss (cost)</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{shortDate(r.date)}</td>
                <td className="mono muted">{r.ref}</td>
                <td>{kindOf(r) === "lost" ? <Badge tone="amber" dot>Lost</Badge> : <Badge tone="red" dot>Defective</Badge>}</td>
                <td className="mono strong">{r.code}</td>
                <td>{r.name}</td>
                <td className="muted">{r.reason}</td>
                <td className="r mono">{r.qty}</td>
                <td className="r mono neg">{fmt(r.costLoss)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="8"><Empty icon="check" text="No stock losses logged" /></td></tr>}
          </tbody>
          <tfoot><tr><td colSpan="6">Total — {kindF === "all" ? "all losses" : kindF === "lost" ? "lost / missing" : "defective"}</td><td className="r mono strong">{totalUnits}</td><td className="r mono strong neg">{fmt(totalLoss)}</td></tr></tfoot>
        </table>
      </Card>

      <OrderDiscrepancies />
    </div>
  );
}

/* ---------------- Purchase-order receiving discrepancies (short / missing) ---------------- */
function OrderDiscrepancies() {
  const D = BCCWE;
  const rows = (D.orderDiscrepancies || []).slice();
  return (
    <div style={{ marginTop: 18 }}>
    <Card title={"Order discrepancies (" + rows.length + ")"} sub="Items short or missing when a purchase order was received" pad={false}>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Order #</th><th>Item code</th><th>Description</th><th>Supplier</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Short</th><th>Type</th><th>Note</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.kind === "missing" ? "po-line-missing" : "po-line-short"}>
              <td className="muted">{shortDate(r.date)}</td>
              <td className="mono">{r.ref}</td>
              <td className="mono strong">{r.code}</td>
              <td>{r.name}</td>
              <td className="muted">{supplierName(r.supplier)}</td>
              <td className="r mono">{r.ordered}</td>
              <td className="r mono">{r.received}</td>
              <td className="r mono neg">{r.short}</td>
              <td>{r.kind === "missing" ? <Badge tone="red" dot>Missing</Badge> : <Badge tone="amber" dot>Short</Badge>}</td>
              <td className="muted">{r.note || "—"}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="10"><Empty icon="check" text="No receiving discrepancies — every received order matched its purchase order" /></td></tr>}
        </tbody>
      </table>
    </Card>
    </div>
  );
}

/* ---------------- Sales (with / without invoice) ---------------- */
function Sales({ go, pushToast, store }) {
  const D = BCCWE;
  const sf = store || "all";
  const [tab, setTab] = useState("quick");
  const [, force] = useState(0);
  const kindTone = { Sale: "green", Return: "red", Exchange: "blue" };
  const register = D.cashSales.filter((s) => !window.STORES || window.STORES.matches(s, sf));

  return (
    <div>
      <PageHead title="Sales" sub="Point-of-sale entry — with or without an invoice"
        actions={<Btn variant="primary" icon="invoice" onClick={() => go("invoice")}>Sale with invoice</Btn>} />

      <div className="tabs">
        <button className={"tab" + (tab === "quick" ? " on" : "")} onClick={() => setTab("quick")}>Quick sale (no invoice)</button>
        <button className={"tab" + (tab === "log" ? " on" : "")} onClick={() => setTab("log")}>Today's register <em>{register.length}</em></button>
      </div>

      {tab === "quick" ? (
        <QuickSale pushToast={pushToast} store={sf} onRecorded={() => { setTab("log"); force((x) => x + 1); }} />
      ) : (
        <Card pad={false}>
          <table className="data-table">
            <thead><tr><th>Time</th><th>Type</th><th>Client</th><th>Item / service</th><th>Salesperson</th><th>Method</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {register.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{shortDate(s.date)}</td>
                  <td><Badge tone={kindTone[s.kind]} dot>{saleKindLabel(s)}</Badge></td>
                  <td>{s.client} <em className="cat-tag">{s.type}</em></td>
                  <td>{s.item}</td>
                  <td className="muted">{personName(s.sales)}</td>
                  <td className="muted">{s.method}</td>
                  <td className={"r mono " + (s.total < 0 ? "neg" : "")}>{fmt(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* Reusable compact line editor — works in narrow exchange columns too */
function SaleLineEditor({ lines, setLines, withDisp, accent, clientId }) {
  const catalog = [...BCCWE.inventory, ...BCCWE.services];
  const upd = (id, p) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const pick = (id, name) => {
    const h = catalog.find((c) => c.name === name);
    upd(id, h ? { desc: h.name, code: h.code || "", price: h.price } : { desc: name });
  };
  const add = () => setLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: "", desc: "", qty: 1, price: 0, disp: "restock" }]);
  const rm = (id) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  const lt = (l) => l.qty * l.price;
  const histFor = (code) => { try { return (window.clientPurchaseHistory && window.clientPurchaseHistory(clientId, code, 3)) || []; } catch (e) { return []; } };
  return (
    <div className="qsl">
      {lines.map((l) => {
        const hist = withDisp && clientId && l.code ? histFor(l.code) : null;
        return (
        <div className={"qsl-row" + (withDisp && l.disp === "defective" ? " is-def" : "")} key={l.id}>
          <div className="qsl-top">
            <input list="catalog" value={l.desc} placeholder="Search inventory or describe…" onChange={(e) => pick(l.id, e.target.value)} />
            <button className="icon-btn line-del" onClick={() => rm(l.id)} title="Remove line"><Icon name="trash" size={15} /></button>
          </div>
          {l.code && <span className="qsl-code">{l.code}</span>}
          <div className="qsl-bot">
            <label className="qsl-f qsl-qty">Qty<input type="number" min="0" value={l.qty} onChange={(e) => upd(l.id, { qty: Math.max(0, +e.target.value) })} /></label>
            <label className="qsl-f qsl-price">Unit price<div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={l.price} onChange={(e) => upd(l.id, { price: Math.max(0, +e.target.value) })} /></div></label>
            {withDisp && (
              <label className="qsl-f qsl-disp">Disposition
                <select value={l.disp} onChange={(e) => upd(l.id, { disp: e.target.value })} className={l.disp === "defective" ? "def" : "restock"}>
                  <option value="restock">↑ Restock to inventory</option>
                  <option value="defective">⚠ Defective → loss</option>
                </select>
              </label>
            )}
            <span className="qsl-amt">{fmt(lt(l))}</span>
          </div>
          {hist && (
            <div className="ret-hist">
              <div className="ret-hist-head"><Icon name="history" size={12} /> Sold to {clientName(clientId)}{hist.length ? " — last " + hist.length + " purchase" + (hist.length === 1 ? "" : "s") : ""}</div>
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
                        <button className="rh-use" title="Use this price" onClick={() => upd(l.id, { price: +net.toFixed(2) })}>Use price</button>
                      </li>
                    );
                  })}
                </ul>
              ) : <div className="ret-hist-empty">No prior purchases of this item by this client on record.</div>}
            </div>
          )}
        </div>
        );
      })}
      <button className="qsl-add" onClick={add}><Icon name="plus" size={14} /> Add line</button>
    </div>
  );
}

function QuickSale({ pushToast, onRecorded, store, lockKind }) {
  const tagStore = (store && store !== "all") ? store : (window.STORES ? window.STORES.defaultId() : "");
  const D = BCCWE;
  const allowedStores = window.STORES ? window.STORES.allowed() : [];
  const [companyId, setCompanyId] = useState(tagStore || (allowedStores[0] && allowedStores[0].id) || "");
  const catalog = [...D.inventory, ...D.services];
  const [kind, setKind] = useState(lockKind || "Sale");
  const [type, setType] = useState("Retail");
  const [clientId, setClientId] = useState(((D.clients.find((c) => c.id !== "c3") || D.clients[0] || {}).id) || "");
  const [saleClientId, setSaleClientId] = useState("walkin");
  const [taxMode, setTaxMode] = useState("both");
  const [method, setMethod] = useState("Debit");
  const [outLines, setOutLines] = useState([
    { id: 1, code: "", desc: "", qty: 1, price: 0, disp: "restock" },
  ]);
  const [inLines, setInLines] = useState([
    { id: 11, code: "", desc: "", qty: 1, price: 0, disp: "defective" },
  ]);
  const [payMode, setPayMode] = useState("full");      // full | partial | unpaid (customer owes us)
  const [tendered, setTendered] = useState("");          // amount collected now when partial
  const [refundMode, setRefundMode] = useState("payout"); // payout | applybalance (we owe customer)
  const [feeMode, setFeeMode] = useState("none");        // none | percent | amount (restocking fee)
  const [feeVal, setFeeVal] = useState("");

  const useOut = kind === "Sale" || kind === "Exchange";
  const useIn = kind === "Return" || kind === "Exchange";
  const m = D.TAX.modes[taxMode];
  const lt = (l) => l.qty * l.price;
  const outSub = useOut ? outLines.reduce((s, l) => s + lt(l), 0) : 0;
  const inSub = useIn ? inLines.reduce((s, l) => s + lt(l), 0) : 0;

  // defective loss + restock counts from returned lines
  const restockUnits = useIn ? inLines.filter((l) => l.disp === "restock").reduce((s, l) => s + l.qty, 0) : 0;
  const defLines = useIn ? inLines.filter((l) => l.disp === "defective") : [];
  const defLoss = defLines.reduce((s, l) => { const it = itemByCode(l.code); return s + l.qty * (it ? it.cost : l.price * 0.5); }, 0);
  const defUnits = defLines.reduce((s, l) => s + l.qty, 0);

  // money: net of given (out) minus returned (in)
  const netSub = outSub - inSub;
  const gst = netSub * m.gst, pst = netSub * m.pst, total = netSub + gst + pst;
  // Restocking fee on returned value — kept by us (income), reduces the refund.
  const fee = useIn ? (feeMode === "percent" ? +(inSub * (Number(feeVal) || 0) / 100).toFixed(2)
    : feeMode === "amount" ? Math.min(inSub, Number(feeVal) || 0) : 0) : 0;
  const grand = +(total + fee).toFixed(2);
  const customerPays = grand >= 0;

  // cost of goods moved (for COGS / inventory / loss postings)
  const isSvc = (l) => String(l.code || "").startsWith("SVC");
  const costOut = useOut ? outLines.reduce((s, l) => { const it = itemByCode(l.code); return s + (it ? it.cost : 0) * l.qty; }, 0) : 0;
  const costRestock = useIn ? inLines.filter((l) => l.disp === "restock").reduce((s, l) => { const it = itemByCode(l.code); return s + (it ? it.cost : 0) * l.qty; }, 0) : 0;
  // revenue split — goods vs services, net of returns
  const outGoods = useOut ? outLines.filter((l) => !isSvc(l)).reduce((s, l) => s + l.qty * l.price, 0) : 0;
  const inGoods = useIn ? inLines.filter((l) => !isSvc(l)).reduce((s, l) => s + l.qty * l.price, 0) : 0;
  const netGoods = outGoods - inGoods;
  const netSvc = (outSub - outGoods) - (inSub - inGoods);
  const r2 = (n) => +(+n).toFixed(2);
  const cashAcct = method === "Cash" ? "1000" : "1010";
  const cashName = method === "Cash" ? "Cash on Hand" : "Bank — Operating";
  const settleDir = grand > 0.005 ? "charge" : grand < -0.005 ? "refund" : "even";
  const canRecord = (useOut && outLines.some((l) => l.desc)) || (useIn && inLines.some((l) => l.desc));

  // ---- settlement: how the balance is collected (sale) or refunded (return/exchange) ----
  const activeClientId = useIn ? clientId : (saleClientId !== "walkin" ? saleClientId : null);
  const activeClient = activeClientId ? D.clients.find((c) => c.id === activeClientId) : null;
  const chargeTotal = settleDir === "charge" ? r2(grand) : 0;
  const refundTotalAmt = settleDir === "refund" ? r2(-grand) : 0;
  let collected = chargeTotal, onAccount = 0;
  if (settleDir === "charge") {
    if (payMode === "partial") { collected = r2(Math.min(Math.max(0, parseFloat(tendered) || 0), chargeTotal)); onAccount = r2(chargeTotal - collected); }
    else if (payMode === "unpaid") { collected = 0; onAccount = chargeTotal; }
    else { collected = chargeTotal; onAccount = 0; }
  }
  let refundCash = refundTotalAmt, refundToBalance = 0;
  if (settleDir === "refund" && refundMode === "applybalance" && activeClient) { refundToBalance = refundTotalAmt; refundCash = 0; }

  function buildRegJournal() {
    const J = [];
    const revAcct = type === "Wholesale" ? "4010" : "4000";
    const revName = type === "Wholesale" ? "Sales Revenue — Wholesale" : "Sales Revenue — Retail";
    if (settleDir === "charge") {
      if (collected > 0.005) J.push({ acct: cashAcct, name: cashName, dr: r2(collected), cr: 0 });
      if (onAccount > 0.005) J.push({ acct: "1200", name: "Accounts Receivable", dr: r2(onAccount), cr: 0 });
    } else if (settleDir === "refund") {
      if (refundCash > 0.005) J.push({ acct: cashAcct, name: cashName, dr: 0, cr: r2(refundCash) });
      if (refundToBalance > 0.005) J.push({ acct: "1200", name: "Accounts Receivable", dr: 0, cr: r2(refundToBalance) });
    }
    if (netGoods > 0.005) J.push({ acct: revAcct, name: revName, dr: 0, cr: r2(netGoods) });
    else if (netGoods < -0.005) J.push({ acct: revAcct, name: revName, dr: r2(-netGoods), cr: 0 });
    if (netSvc > 0.005) J.push({ acct: "4100", name: "Service & Repair Revenue", dr: 0, cr: r2(netSvc) });
    else if (netSvc < -0.005) J.push({ acct: "4100", name: "Service & Repair Revenue", dr: r2(-netSvc), cr: 0 });
    taxPostings(m, gst, pst).forEach((c) => {
      if (c.amount > 0.005) J.push({ acct: c.acct, name: c.acctName, dr: 0, cr: r2(c.amount) });
      else if (c.amount < -0.005) J.push({ acct: c.acct, name: c.acctName, dr: r2(-c.amount), cr: 0 });
    });
    const cogsNet = costOut - (costRestock + defLoss);
    if (cogsNet > 0.005) J.push({ acct: "5000", name: "Cost of Goods Sold", dr: r2(cogsNet), cr: 0 });
    else if (cogsNet < -0.005) J.push({ acct: "5000", name: "Cost of Goods Sold", dr: 0, cr: r2(-cogsNet) });
    const invNet = costRestock - costOut;
    if (invNet > 0.005) J.push({ acct: "1300", name: "Inventory", dr: r2(invNet), cr: 0 });
    else if (invNet < -0.005) J.push({ acct: "1300", name: "Inventory", dr: 0, cr: r2(-invNet) });
    if (defLoss > 0.005) J.push({ acct: "5100", name: "Loss on Defective Goods", dr: r2(defLoss), cr: 0 });
    if (fee > 0.005) J.push({ acct: "4200", name: "Restocking Fee Income", dr: 0, cr: r2(fee) });
    return J;
  }
  const regJ = buildRegJournal();
  const jDr = regJ.reduce((s, j) => s + j.dr, 0);
  const jCr = regJ.reduce((s, j) => s + j.cr, 0);

  async function record() {
    // Snapshot everything this touches so we can roll back if the save fails.
    const _snapKeys = ["inventory", "defectiveProducts", "clients", "cashSales", "journal", "accounts", "itemSales"];
    const _snap = {};
    try { _snapKeys.forEach((k) => { _snap[k] = JSON.parse(JSON.stringify(D[k] || [])); }); } catch (e) {}
    if (useOut) outLines.forEach((l) => { const it = itemByCode(l.code); if (it) it.stock = it.stock - l.qty; });
    if (useIn) inLines.forEach((l) => {
      const it = itemByCode(l.code);
      if (l.disp === "restock") { if (it) it.stock += l.qty; }
      else {
        const cost = it ? it.cost : l.price * 0.5;
        D.defectiveProducts.unshift({ date: D.today, code: l.code || "—", name: l.desc || "Returned item", qty: l.qty, costLoss: +(l.qty * cost).toFixed(2), reason: "Returned defective", ref: "RET-" + Math.floor(Math.random() * 800 + 200), kind: "defective" });
      }
    });
    const label = kind === "Exchange" ? (inLines[0] ? inLines[0].desc : "item") + " → " + (outLines[0] ? outLines[0].desc : "item")
      : (useOut ? outLines[0] && outLines[0].desc : inLines[0] && inLines[0].desc) || "item";
    const clientLabel = useIn ? clientName(clientId)
      : (saleClientId !== "walkin" ? clientName(saleClientId) : (type === "Wholesale" ? "Wholesale" : "Walk-in"));
    // disposition summary for Returns / Exchanges
    let retDisp = null;
    if (useIn) {
      const hasDef = inLines.some((l) => l.disp === "defective" && (l.desc || l.code));
      const hasRes = inLines.some((l) => l.disp === "restock" && (l.desc || l.code));
      retDisp = hasDef && hasRes ? "Mixed" : hasDef ? "Defected" : "Inventory";
    }
    const methodLabel = settleDir === "even" ? "Even exchange"
      : settleDir === "refund" ? (refundToBalance > 0.005 ? "Applied to balance" : method + " refund")
      : payMode === "unpaid" ? "On account (unpaid)"
      : payMode === "partial" ? method + " · partial (" + fmt(onAccount) + " on account)"
      : method;
    if (activeClient) {
      if (settleDir === "charge" && onAccount > 0.005) activeClient.balance = r2((activeClient.balance || 0) + onAccount);
      else if (settleDir === "refund" && refundToBalance > 0.005) activeClient.balance = Math.max(0, r2((activeClient.balance || 0) - refundToBalance));
    }
    // Record line sales so price suggestions reflect register sales too
    // (cost-at-sale captured for profit analytics).
    if (activeClientId && useOut) outLines.forEach((l) => { if (l.code && l.qty > 0) D.itemSales.unshift({ date: D.today, code: l.code, clientId: activeClientId, qty: l.qty, price: l.price, disc: 0, cost: (itemByCode(l.code) || {}).cost || 0 }); });
    // Restocked returns net the item's sales history (negative rows) so
    // per-item units/revenue/profit stop counting goods that came back.
    if (activeClientId && useIn) inLines.forEach((l) => { if (l.code && l.qty > 0 && l.disp === "restock") D.itemSales.unshift({ date: D.today, code: l.code, clientId: activeClientId, qty: -l.qty, price: l.price, disc: 0, cost: (itemByCode(l.code) || {}).cost || 0 }); });
    D.cashSales.unshift({ id: "cs" + Date.now(), companyId: companyId || tagStore, clientId: activeClientId || null, date: D.today, client: clientLabel, type, kind, retDisp, item: label, total: +grand.toFixed(2), subtotal: r2(netSub), gst: r2(gst), pst: r2(pst), cogs: r2(costOut - costRestock), defLoss: r2(defLoss), restockingFee: r2(fee), method: methodLabel, sales: ((window.sessionUid && window.sessionUid()) || (window.__session && window.__session.userId) || ""), settle: settleDir, paid: r2(collected), owed: r2(onAccount), lines: useOut ? outLines.filter((l) => l.code && l.qty > 0).map((l) => ({ code: l.code, name: l.desc, qty: l.qty, price: l.price, cost: (itemByCode(l.code) || {}).cost || 0 })) : [] });
    // post a balanced journal entry and adjust account balances
    if (regJ.length) {
      const jid = "JE-" + Math.floor(Math.random() * 9000 + 1000);
      D.journal.unshift({ id: jid, date: D.today, memo: kind + " (register) — " + clientLabel + (label ? " · " + label : ""), lines: regJ });
      regJ.forEach((l) => { const a = D.accounts.find((x) => x.code === l.acct); if (a) { const incDr = a.type === "Asset" || a.type === "Expense"; a.balance = +(a.balance + (incDr ? l.dr - l.cr : l.cr - l.dr)).toFixed(2); } });
    }
    const extra = defUnits ? " · " + defUnits + " defective logged as loss (" + fmt(defLoss) + ")" : restockUnits ? " · " + restockUnits + " restocked" : "";
    const settleMsg = settleDir === "refund"
      ? (refundToBalance > 0.005 ? "credited " + fmt(refundTotalAmt) + " to " + (activeClient ? activeClient.name + "'s" : "the") + " balance" : "refunded " + fmt(refundTotalAmt) + " via " + method)
      : settleDir === "charge"
      ? (onAccount > 0.005 ? "collected " + fmt(collected) + " · " + fmt(onAccount) + " on account" : "collected " + fmt(collected) + " via " + method)
      : "no balance due";
    const ok = window.persistNow ? await window.persistNow("cashSales", "inventory", "defectiveProducts", "journal", "accounts", "clients", "itemSales") : true;
    if (!ok) {
      _snapKeys.forEach((k) => { if (_snap[k]) D[k] = _snap[k]; }); // restore — nothing was saved
      pushToast && pushToast("Couldn't save — no connection. Your entry is kept on screen; please try again.");
      return;
    }
    pushToast && pushToast(kind + " recorded — " + settleMsg + " · journal posted" + extra);
    window.logAudit("CREATE", kind === "Return" ? "Return" : kind === "Exchange" ? "Exchange" : "Cash sale", "sales", "cs" + Date.now(), kind + " " + fmt(Math.abs(total)) + " · " + clientLabel + (label ? " · " + label : ""));
    onRecorded && onRecorded();
  }

  const outEditor = (
    <Card title={"Items sold (" + outLines.filter((l) => l.desc).length + ")"} sub="Items / services going to the customer." pad={false}>
      <SaleLineEditor lines={outLines} setLines={setOutLines} />
    </Card>
  );
  const inEditor = (
    <Card title={"Returned items (" + inLines.filter((l) => l.desc).length + ")"} sub="Each line: restock to inventory, or flag defective (loss). Pick the client to see their purchase history." pad={false}>
      <SaleLineEditor lines={inLines} setLines={setInLines} withDisp clientId={clientId} />
    </Card>
  );

  return (
    <div className="quicksale">
      <div>
        <Card title={lockKind ? lockKind : "New register entry"}>
          {!lockKind && (
            <div className="qs-kind">
              {["Sale", "Return", "Exchange"].map((k) => (
                <button key={k} className={"qs-kbtn" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{k}</button>
              ))}
            </div>
          )}
          <div className="meta-grid">
            {allowedStores.length > 1 && (
              <Field label="Store / company" hint="Which company this entry belongs to">
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  {allowedStores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {useIn && (
              <Field label={kind === "Exchange" ? "Client (exchanging)" : "Client (returning)"} required hint="Search by name — who is bringing the item back">
                <ClientPicker clients={D.clients} value={clientId} onChange={setClientId}
                  onAddNew={() => pushToast && pushToast("Add new clients from the People page")} />
              </Field>
            )}
            {kind === "Sale" && (
              <Field label="Client" hint="Search by name — leave as walk-in if not a registered client">
                <ClientPicker clients={[{ id: "walkin", name: "Walk-in customer", type: "Retail" }, ...D.clients.filter((c) => c.id !== "c3")]}
                  value={saleClientId} onChange={setSaleClientId}
                  onAddNew={() => pushToast && pushToast("Add new clients from the People page")} />
              </Field>
            )}
            <Field label="Client type">
              <select value={type} onChange={(e) => setType(e.target.value)}><option>Retail</option><option>Wholesale</option></select>
            </Field>
            <Field label={kind === "Return" ? "Refund method" : kind === "Exchange" ? "Settlement method" : "Payment method"} hint={kind === "Sale" ? "How the customer pays" : kind === "Return" ? "How the refund is given" : "Used if money is owed either way"}>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>{["Cash", "Debit", "Credit Card", "E-Transfer"].map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
          </div>
        </Card>

        {kind === "Sale" && outEditor}
        {kind === "Return" && inEditor}
        {kind === "Exchange" && (
          <div className="exch-cols">
            <div className="exch-col exch-in">
              <div className="exch-cap"><Icon name="arrowDown" size={15} /> Returned by customer</div>
              <Card pad={false}><SaleLineEditor lines={inLines} setLines={setInLines} withDisp clientId={clientId} /></Card>
            </div>
            <div className="exch-col exch-out">
              <div className="exch-cap out"><Icon name="arrowUp" size={15} /> Given to customer</div>
              <Card pad={false}><SaleLineEditor lines={outLines} setLines={setOutLines} /></Card>
            </div>
          </div>
        )}

        <Card title="Tax treatment">
          <div className="taxseg">
            {D.TAX.order.map((k) => {
              const tm = D.TAX.modes[k];
              return (
                <button key={k} className={"taxbtn" + (taxMode === k ? " on" : "")} onClick={() => setTaxMode(k)}>
                  <span className="taxbtn-rate">{Math.round((tm.gst + tm.pst) * 100)}%</span>
                  <span className="taxbtn-label">{tm.label}</span>
                  <span className="taxbtn-hint">{tm.hint}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <datalist id="catalog">{catalog.map((i) => <option key={i.code} value={i.name} />)}</datalist>
      </div>

      <div className="rail-card totals qs-total">
        <h3>{kind} summary</h3>
        {kind === "Exchange" && <>
          <div className="trow"><span>Given to customer</span><span className="num">{fmt(outSub)}</span></div>
          <div className="trow"><span>Returned by customer</span><span className="num neg">-{fmt(inSub)}</span></div>
        </>}
        {kind !== "Exchange" && <div className="trow"><span>{useOut ? "Items sold" : "Items returned"}</span><span className="num">{fmt(netSub)}</span></div>}
        <div className="trow"><span className={gst ? "" : "muted"}>GST 5%</span><span className="num">{fmt(gst)}</span></div>
        <div className="trow"><span className={pst ? "" : "muted"}>PST 7%</span><span className="num">{fmt(pst)}</span></div>
        {useIn && (
          <div className="qs-fee" style={{ marginTop: 8 }}>
            <span className="settle-lbl">Restocking fee (kept as income)</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <select value={feeMode} onChange={(e) => setFeeMode(e.target.value)} style={{ flex: 1 }}>
                <option value="none">No fee</option>
                <option value="percent">% of returned</option>
                <option value="amount">Fixed amount</option>
              </select>
              {feeMode !== "none" && (
                <div className="input-prefix sm" style={{ width: 110 }}><span>{feeMode === "percent" ? "%" : "$"}</span><input type="number" min="0" step="0.01" value={feeVal} placeholder="0" onChange={(e) => setFeeVal(e.target.value)} /></div>
              )}
            </div>
            {fee > 0.005 && <div className="trow" style={{ marginTop: 6 }}><span>Less restocking fee</span><span className="num">{fmt(fee)}</span></div>}
          </div>
        )}
        <div className="rail-total"><span>{settleDir === "refund" ? "Refund to customer" : settleDir === "even" ? "No balance due" : "Customer pays"}</span><strong className={settleDir === "refund" ? "neg" : ""}>{fmt(Math.abs(grand))}</strong></div>

        {settleDir === "charge" && (
          <div className="settle-box">
            <span className="settle-lbl">How is the customer paying?</span>
            <div className="settle-seg">
              {[["full", "Paid in full"], ["partial", "Partial"], ["unpaid", "Unpaid"]].map(([v, lbl]) => (
                <button key={v} className={"settle-segbtn" + (payMode === v ? " on" : "")} onClick={() => setPayMode(v)}>{lbl}</button>
              ))}
            </div>
            {payMode === "partial" && (
              <label className="settle-method">
                <span>Amount paid now</span>
                <div className="input-prefix sm"><span>$</span><input type="number" min="0" step="0.01" value={tendered} placeholder={chargeTotal.toFixed(2)} onChange={(e) => setTendered(e.target.value)} /></div>
              </label>
            )}
            {payMode !== "unpaid" && (
              <label className="settle-method">
                <span>Paid via</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>{["Cash", "Debit", "Credit Card", "E-Transfer"].map((x) => <option key={x}>{x}</option>)}</select>
              </label>
            )}
            <div className="settle-line"><span>Collected now</span><strong className="mono">{fmt(collected)}</strong></div>
            {onAccount > 0.005 && <div className="settle-line warn"><span>On account (owes us)</span><strong className="mono">{fmt(onAccount)}</strong></div>}
            {onAccount > 0.005 && (activeClient
              ? <div className="settle-note"><Icon name="ledger" size={12} /> Adds to {activeClient.name}’s balance → A/R 1200</div>
              : <div className="settle-note warn"><Icon name="alert" size={12} /> Pick a registered client to carry this balance on account</div>)}
          </div>
        )}
        {settleDir === "refund" && (
          <div className="settle-box">
            <span className="settle-lbl">How is the {kind === "Exchange" ? "difference" : "refund"} settled?</span>
            <div className="settle-seg">
              <button className={"settle-segbtn" + (refundMode === "payout" ? " on" : "")} onClick={() => setRefundMode("payout")}>Pay customer</button>
              <button className={"settle-segbtn" + (refundMode === "applybalance" ? " on" : "")} onClick={() => setRefundMode("applybalance")} disabled={!activeClient} title={activeClient ? "" : "Select a registered client first"}>Apply to balance</button>
            </div>
            {refundMode === "payout" || !activeClient ? (
              <label className="settle-method">
                <span>Refund via</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>{["Cash", "Debit", "Credit Card", "E-Transfer"].map((x) => <option key={x}>{x}</option>)}</select>
              </label>
            ) : null}
            <div className="settle-line"><span>{refundToBalance > 0.005 ? "Credited to balance" : "Refunded to customer"}</span><strong className="mono neg">{fmt(refundTotalAmt)}</strong></div>
            {refundToBalance > 0.005 && activeClient && (
              <div className="settle-note"><Icon name="ledger" size={12} /> {activeClient.name} owes {fmt(activeClient.balance || 0)} → reduces to {fmt(Math.max(0, r2((activeClient.balance || 0) - refundTotalAmt)))}</div>
            )}
          </div>
        )}

        {useIn && (restockUnits > 0 || defUnits > 0) && (
          <div className="disp-summary">
            {restockUnits > 0 && <div className="disp-line ok"><Icon name="arrowUp" size={14} /> Restock to inventory <strong>+{restockUnits} unit{restockUnits === 1 ? "" : "s"}</strong></div>}
            {defUnits > 0 && <div className="disp-line bad"><Icon name="alert" size={14} /> Defective → loss <strong>{fmt(defLoss)}</strong></div>}
          </div>
        )}

        <div className="reg-journal">
          <div className="reg-journal-head"><span>Posts to accounts</span><Badge tone={Math.abs(jDr - jCr) < 0.01 ? "green" : "red"} dot>{Math.abs(jDr - jCr) < 0.01 ? "Balanced" : "Check"}</Badge></div>
          <table className="reg-jtable"><tbody>
            {regJ.map((j, i) => (
              <tr key={i}><td><span className="jcode">{j.acct}</span> {j.name}</td><td className="r mono">{j.dr ? fmt(j.dr) : ""}</td><td className="r mono">{j.cr ? fmt(j.cr) : ""}</td></tr>
            ))}
            {!regJ.length && <tr><td colSpan="3" className="muted">Add items to preview the journal entry.</td></tr>}
          </tbody></table>
        </div>
        <Btn variant="primary" full icon="check" disabled={!canRecord} onClick={record}>Record {kind.toLowerCase()}</Btn>
      </div>
    </div>
  );
}

/* ---------------- Expenses ---------------- */
const EXP_METHODS = ["Bank", "Cash", "Credit Card", "Debit", "E-Transfer"];

function Expenses({ pushToast, store }) {
  const D = BCCWE;
  const sf = store || "all";
  const tagStore = (sf && sf !== "all") ? sf : (window.STORES ? window.STORES.defaultId() : "");
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [defModal, setDefModal] = useState(false);
  const [expQ, setExpQ] = useState("");

  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };

  // ---- entry form state ----
  const [cat, setCat] = useState(((D.expenseCategories[0] && D.expenseCategories[0].name) || ""));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(D.today);
  const [method, setMethod] = useState("Cash");
  const _isAdmin = !!(window.STORES && window.STORES.isAdmin());
  const _myId = (window.sessionUid && window.sessionUid()) || (window.__session && window.__session.userId) || "";
  // Who this user may log an expense for: themselves + their subordinates by
  // role rank. Admin → anyone; Owner → everyone except admins.
  const _rankByName = { Admin: 100, Owner: 95, Manager: 70, Supervisor: 50, "Sales Person": 30, "Team Member": 30, Accountant: 40, Client: 10 };
  const _spRank = (sp) => { const u = (D.users || []).find((x) => x.id === sp.id); if (u && typeof ROLE_RANK !== "undefined" && ROLE_RANK[u.role] != null) return ROLE_RANK[u.role]; return _rankByName[sp.role] != null ? _rankByName[sp.role] : 0; };
  const _myRank = (typeof bccweRank === "function") ? bccweRank() : 0;
  const eligibleLoggers = D.salespeople.filter((sp) => {
    if (sp.id === _myId) return true;
    if (_isAdmin) return true;
    const r = _spRank(sp);
    if (r >= 100) return false;       // never log for an admin unless you are one
    return r < _myRank;               // only strict subordinates
  });
  const [sales, setSales] = useState((!_isAdmin && _myId) ? _myId : ((D.salespeople[0] && D.salespeople[0].id) || ""));
  const [tax, setTax] = useState("none");
  const [desc, setDesc] = useState("");
  const [receipt, setReceipt] = useState("");
  const assetAccounts = D.accounts.filter((a) => a.type === "Asset");
  const defaultPaidFrom = (assetAccounts.find((a) => a.code === "1010") || assetAccounts[0] || {}).code || "";
  const [paidFrom, setPaidFrom] = useState(defaultPaidFrom);
  const [stockLines, setStockLines] = useState([{ id: 1, code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]);
  const fileRef = useRef(null);

  // row actions modal: { type: 'view'|'edit'|'delete', exp }
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);
  const [rcptView, setRcptView] = useState(null);
  function saveEdit(data, original) {
    Object.assign(original, data);
    pushToast && pushToast("Updated expense — " + fmt(original.amount) + " · " + original.category);
    window.logAudit("UPDATE", "Expense", "expenses", original.id, "Edited expense " + original.category + " · " + fmt(original.amount));
    bump(); close();
  }
  function removeExpense(exp) {
    const idx = D.expenses.indexOf(exp);
    if (idx >= 0) D.expenses.splice(idx, 1);
    pushToast && pushToast("Deleted expense — " + fmt(exp.amount) + " · " + exp.category);
    window.logAudit("DELETE", "Expense", "expenses", exp.id, "Deleted expense " + exp.category + " · " + fmt(exp.amount));
    bump(); close();
  }

  // Defective / lost-stock expense invoice: writes off buying cost + updates inventory
  function recordDefectiveInvoice(data) {
    const kind = data.kind === "lost" ? "lost" : "defective";
    const ref = (kind === "lost" ? "LOST-" : "DEF-") + Math.floor(Math.random() * 900 + 100);
    const acct = kind === "lost" ? "5110" : "5100";
    const category = kind === "lost" ? "Lost Stock" : "Defective Stock";
    let totalCost = 0;
    data.lines.forEach((l) => {
      const it = itemByCode(l.code);
      if (it) it.stock = Math.max(0, it.stock - l.qty);
      totalCost += l.qty * l.cost;
      D.defectiveProducts.unshift({ date: data.date, code: l.code, name: l.name, qty: l.qty, costLoss: +(l.qty * l.cost).toFixed(2), reason: data.reason, ref, kind });
    });
    D.expenses.unshift({
      id: "e" + Date.now(), companyId: tagStore, date: data.date, category, acct,
      desc: data.reason + " · " + data.lines.length + " item" + (data.lines.length === 1 ? "" : "s") + " · " + ref,
      // Non-cash: the cost leaves INVENTORY (stock reduced above), not the bank.
      amount: +totalCost.toFixed(2), method: "Stock adjustment", stockLoss: true, tax: "none", sales: data.sales, receipt: "",
    });
    pushToast && pushToast("Expense invoice " + ref + " recorded — " + fmt(totalCost) + " written off · inventory reduced");
    window.logAudit("POST", "Stock loss", "expenses", ref, category + " write-off " + fmt(totalCost) + " · " + data.lines.length + " item" + (data.lines.length === 1 ? "" : "s") + " · inventory reduced");
    bump(); setDefModal(false);
  }

  const catDef = D.expenseCategories.find((c) => c.name === cat) || D.expenseCategories[0];
  const isStockLoss = !!catDef.stockLoss;
  const amt = parseFloat(amount) || 0;

  const setSL = (id, patch) => setStockLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addSL = () => setStockLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]);
  const rmSL = (id) => setStockLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  const stockBuilt = stockLines.map((l) => {
    const it = itemByCode(l.code);
    return { code: l.code, name: it ? it.name : l.code, cost: it ? it.cost : 0, stock: it ? it.stock : 0, qty: Math.max(1, Math.round(l.qty || 1)) };
  });
  const stockCost = stockBuilt.reduce((s, b) => s + b.cost * b.qty, 0);
  const stockUnits = stockBuilt.reduce((s, b) => s + b.qty, 0);
  const overStock = stockBuilt.some((b) => b.qty > b.stock);
  const canSave = isStockLoss ? (stockBuilt.length > 0 && stockCost > 0) : amt > 0;

  function save() {
    if (!canSave) return;
    if (isStockLoss) {
      const kind = catDef.stockLoss; // 'defective' | 'lost'
      const ref = (kind === "lost" ? "LOST-" : "DEF-") + Math.floor(Math.random() * 900 + 100);
      stockBuilt.forEach((b) => {
        const it = itemByCode(b.code); if (it) it.stock = Math.max(0, it.stock - b.qty);
        D.defectiveProducts.unshift({ date, code: b.code, name: b.name, qty: b.qty, costLoss: +(b.cost * b.qty).toFixed(2), reason: desc.trim() || (kind === "lost" ? "Lost / missing stock" : "Defective stock"), ref, kind });
      });
      D.expenses.unshift({
        id: "e" + Date.now(), companyId: tagStore, date, category: cat, acct: catDef.acct,
        desc: (desc.trim() ? desc.trim() + " · " : "") + stockBuilt.length + " item" + (stockBuilt.length === 1 ? "" : "s") + " · " + ref,
        // stockLoss marks a non-cash expense: the cost comes OUT OF INVENTORY
        // (stock was reduced above), so the ledger must not also credit cash/bank.
        amount: +stockCost.toFixed(2), method: "Stock adjustment", stockLoss: true, tax: "none", sales, receipt: "",
      });
      pushToast && pushToast(cat + " written off — " + fmt(stockCost) + " · inventory reduced " + stockUnits + " unit" + (stockUnits === 1 ? "" : "s"));
      window.logAudit("POST", "Stock loss", "expenses", ref, cat + " write-off " + fmt(stockCost) + " · " + stockUnits + " unit" + (stockUnits === 1 ? "" : "s") + " · inventory reduced");
      setStockLines([{ id: 1, code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]); setDesc("");
      bump();
      return;
    }
    const inc = (code, delta) => { const a = D.accounts.find((x) => x.code === code); if (a) a.balance = +((a.balance || 0) + delta).toFixed(2); };
    inc(catDef.acct, +amt);
    inc(paidFrom, -amt);
    D.expenses.unshift({
      id: "e" + Date.now(), companyId: tagStore,
      date, category: cat, acct: catDef.acct,
      desc: desc.trim(), amount: +amt.toFixed(2),
      method, tax, sales, receipt, paidFrom,
    });
    pushToast && pushToast("Expense recorded — " + fmt(amt) + " · " + cat + " → " + catDef.acct + " " + acctName(catDef.acct));
    window.logAudit("CREATE", "Expense", "expenses", cat, "Recorded expense " + cat + " · " + fmt(amt) + " → " + catDef.acct + " " + acctName(catDef.acct));
    setAmount(""); setDesc(""); setReceipt("");
    if (fileRef.current) fileRef.current.value = "";
    bump();
  }

  const expStoreList = D.expenses.filter((e) => !window.STORES || window.STORES.matches(e, sf));
  const eql = (expQ || "").trim().toLowerCase();
  const expList = eql
    ? expStoreList.filter((e) => [e.category, e.desc, e.method, e.acct, personName(e.sales)].join(" ").toLowerCase().includes(eql))
    : expStoreList;
  const total = expList.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHead title="Expenses" sub={expList.length + " logged · " + fmt(total) + " total"}
        actions={<Btn variant="primary" icon="box" onClick={() => setDefModal(true)}>Stock write-off invoice</Btn>} />

      <div className="exp-grid">
        <Card title="Record an expense" sub="Choose a type, enter the amount, and save — each type posts to its own ledger account.">
          <div className="meta-grid">
            <Field label="Type of expense" required hint={isStockLoss ? "Auto-costed write-off → " + catDef.acct + " · " + acctName(catDef.acct) : "Posts to " + catDef.acct + " · " + acctName(catDef.acct)}>
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                {D.expenseCategories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            {!isStockLoss && <Field label="Amount" required><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} /></div></Field>}
            <Field label="Date"><input type="date" value={date} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={isStockLoss ? "Logged by" : "Logged by"} hint={_isAdmin ? "Admin can log for anyone" : "You can log for yourself and your team"}>
              <select value={sales} onChange={(e) => setSales(e.target.value)}>
                {eligibleLoggers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {!isStockLoss && <Field label="Payment method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{EXP_METHODS.map((x) => <option key={x}>{x}</option>)}</select></Field>}
            {!isStockLoss && <Field label="Paid from" hint="Asset account the money comes from">
              <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
                {assetAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </Field>}
            {!isStockLoss && <Field label="Tax"><select value={tax} onChange={(e) => setTax(e.target.value)}>{D.TAX.order.map((k) => <option key={k} value={k}>{D.TAX.modes[k].label}</option>)}</select></Field>}
          </div>
          {isStockLoss && (
            <div className="stockloss-block">
              <div className={"stockloss-tag " + catDef.stockLoss}>
                <Icon name={catDef.stockLoss === "lost" ? "search" : "alert"} size={14} />
                {catDef.stockLoss === "lost"
                  ? "Lost / missing stock — units that disappeared (shrinkage, miscount). Posts to 5110."
                  : "Defective stock — damaged or DOA units that can’t be sold. Posts to 5100."}
              </div>
              <span className="field-label" style={{ marginTop: 14, display: "block" }}>Products {catDef.stockLoss === "lost" ? "lost" : "defective"} <em style={{ color: "var(--ink-3)", fontWeight: 500 }}>— cost auto-filled from purchase price</em></span>
              <div className="ord-lines">
                {stockBuilt.map((b, i) => {
                  const l = stockLines[i];
                  const over = b.qty > b.stock;
                  return (
                    <div className="ord-line def-line" key={l.id}>
                      <select value={l.code} onChange={(e) => setSL(l.id, { code: e.target.value })}>
                        {D.inventory.map((it) => <option key={it.code} value={it.code}>{it.code} — {it.name}</option>)}
                      </select>
                      <span className="def-cost mono">{fmt(b.cost)}<em>/ea · {b.stock} in stock</em></span>
                      <label className="ord-qty">Qty<input type="number" min="1" className={over ? "err" : ""} value={l.qty} onChange={(e) => setSL(l.id, { qty: +e.target.value })} /></label>
                      <span className="ord-amt mono neg">{fmt(b.cost * b.qty)}</span>
                      <button className="icon-btn line-del" onClick={() => rmSL(l.id)} title="Remove line"><Icon name="trash" size={15} /></button>
                    </div>
                  );
                })}
                <button className="qsl-add" onClick={addSL}><Icon name="plus" size={14} /> Add product</button>
              </div>
              <div className="purchase-summary">
                <div><span>Products</span><strong className="mono">{stockBuilt.length}</strong></div>
                <div><span>Units written off</span><strong className="mono">{stockUnits}</strong></div>
                <div><span>Expense (cost basis)</span><strong className="mono neg">{fmt(stockCost)}</strong></div>
                <div className="ps-range">→ {catDef.acct} {catDef.stockLoss === "lost" ? "Lost stock" : "Defective"}</div>
              </div>
              {overStock && <div className="inline-note"><Icon name="alert" size={15} />One or more lines exceed stock on hand — inventory will be reduced to zero, not below.</div>}
            </div>
          )}
          <Field label={isStockLoss ? "Reason / note" : "Description"} hint={isStockLoss ? "Optional — e.g. water damage, failed at stock count" : "Optional — what was this for?"}><input value={desc} placeholder={isStockLoss ? "Optional reason…" : "Optional note…"} onChange={(e) => setDesc(e.target.value)} /></Field>
          {!isStockLoss && (() => {
            const rcName = receipt && (receipt.name || receipt);
            return (
              <div className="exp-receipt-row">
                {receipt ? (
                  <span className="receipt-chip"><Icon name="receipt" size={15} /> {rcName}
                    {receipt.dataUrl && <button className="rc-x" title="View receipt" style={{ marginLeft: 4 }} onClick={() => setRcptView(receipt)}><Icon name="eye" size={13} /></button>}
                    <button className="rc-x" title="Remove receipt" onClick={() => { setReceipt(""); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="x" size={13} /></button>
                  </span>
                ) : (
                  <button className="upload" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="download" size={15} /> Attach receipt</button>
                )}
                <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => { const f = e.target.files[0]; if (f) window.compressImage(f).then(function (res) { setReceipt(res); }); }} />
              </div>
            );
          })()}
          <div className="exp-foot">
            <span className="exp-foot-note">{canSave ? (isStockLoss ? "Will write off " + fmt(stockCost) + " to " + catDef.acct + " · reduce inventory" : "Will post " + fmt(amt) + " to " + catDef.acct) : (isStockLoss ? "Add at least one product to save" : "Enter an amount to save")}</span>
            <Btn variant="primary" icon="check" disabled={!canSave} onClick={save}>{isStockLoss ? "Post write-off" : "Save expense"}</Btn>
          </div>
        </Card>

        <Card title="Recent expenses" sub={expList.length + " entries"} pad={false}
          actions={<div className="search" style={{ minWidth: 220 }}><Icon name="search" size={15} /><input placeholder="Search expenses…" value={expQ} onChange={(e) => setExpQ(e.target.value)} /></div>}>
          <div className="exp-table-scroll">
            <table className="data-table compact">
              <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Salesperson</th><th>Method</th><th>Paid from</th><th>Receipt</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {expList.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{shortDate(e.date)}</td>
                    <td><span className="jcode">{e.acct}</span> {e.category}</td>
                    <td className="muted">{e.desc || "—"}</td>
                    <td>{personName(e.sales)}</td>
                    <td className="muted">{e.method}</td>
                    <td className="muted">{(() => { const a = D.accounts.find((x) => x.code === e.paidFrom); return a ? a.name : "—"; })()}</td>
                    <td>{e.receipt
                      ? (e.receipt.dataUrl
                        ? <button className="rcpt-yes" title="View receipt" style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setRcptView(e.receipt)}><Icon name="receipt" size={14} /> View</button>
                        : <span className="rcpt-yes" title={e.receipt.name || e.receipt}><Icon name="receipt" size={14} /> Attached</span>)
                      : <span className="muted">—</span>}</td>
                    <td className="r mono">{fmt(e.amount)}</td>
                    <td className="row-acts">
                      <button className="icon-btn" title="View details" onClick={() => setModal({ type: "view", exp: e })}><Icon name="eye" size={15} /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setModal({ type: "edit", exp: e })}><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setModal({ type: "delete", exp: e })}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="7">Total</td><td className="r mono strong">{fmt(total)}</td><td /></tr></tfoot>
            </table>
          </div>
        </Card>
      </div>

      <ExpenseReview />

      {rcptView && <ReceiptViewModal receipt={rcptView} onClose={() => setRcptView(null)} />}
      {(modal && modal.type === "view") && <ExpenseViewModal exp={modal.exp} onClose={close} onEdit={() => setModal({ type: "edit", exp: modal.exp })} onViewReceipt={(r) => setRcptView(r)} />}
      {(modal && modal.type === "edit") && <ExpenseFormModal exp={modal.exp} onSave={(d) => saveEdit(d, modal.exp)} onClose={close} />}
      {(modal && modal.type === "delete") && <ExpenseDeleteModal exp={modal.exp} onConfirm={() => removeExpense(modal.exp)} onClose={close} />}
      {defModal && <DefectiveExpenseModal onSave={recordDefectiveInvoice} onClose={() => setDefModal(false)} />}
    </div>
  );
}

/* ---------------- Expenses — edit form modal ---------------- */
function ExpenseFormModal({ exp, onSave, onClose }) {
  const D = BCCWE;
  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };
  const [f, setF] = useState(() => ({
    category: exp.category, amount: String(exp.amount), date: exp.date,
    sales: exp.sales, method: exp.method, tax: exp.tax, desc: exp.desc || "", receipt: exp.receipt || "",
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fileRef = useRef(null);
  const catDef = D.expenseCategories.find((c) => c.name === f.category) || D.expenseCategories[0];
  const amt = parseFloat(f.amount) || 0;
  const valid = amt > 0;

  function submit() {
    if (!valid) return;
    onSave({
      category: f.category, acct: catDef.acct, amount: +amt.toFixed(2), date: f.date,
      sales: f.sales, method: f.method, tax: f.tax, desc: f.desc.trim(), receipt: f.receipt,
    });
  }

  return (
    <Modal title="Edit expense" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Save changes</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Type of expense" required hint={"Posts to " + catDef.acct + " · " + acctName(catDef.acct)}>
          <select value={f.category} onChange={(e) => set("category", e.target.value)}>
            {D.expenseCategories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Amount" required><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={f.amount} placeholder="0.00" onChange={(e) => set("amount", e.target.value)} /></div></Field>
        <Field label="Date"><input type="date" value={f.date} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Salesperson">
          <select value={f.sales} onChange={(e) => set("sales", e.target.value)}>
            {D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Payment method"><select value={f.method} onChange={(e) => set("method", e.target.value)}>{EXP_METHODS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Tax"><select value={f.tax} onChange={(e) => set("tax", e.target.value)}>{D.TAX.order.map((k) => <option key={k} value={k}>{D.TAX.modes[k].label}</option>)}</select></Field>
      </div>
      <Field label="Description" hint="Optional"><input value={f.desc} placeholder="Optional note…" onChange={(e) => set("desc", e.target.value)} /></Field>
      <div className="exp-receipt-row">
        {f.receipt ? (
          <span className="receipt-chip"><Icon name="receipt" size={15} /> {f.receipt && (f.receipt.name || f.receipt)}<button className="rc-x" title="Remove receipt" onClick={() => { set("receipt", ""); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="x" size={13} /></button></span>
        ) : (
          <button className="upload" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="download" size={15} /> Attach receipt</button>
        )}
        <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => { const file = e.target.files[0]; if (file) window.compressImage(file).then(function (res) { set("receipt", res); }); }} />
      </div>
    </Modal>
  );
}

/* ---------------- Expenses — view detail modal ---------------- */
function ExpenseViewModal({ exp, onClose, onEdit, onViewReceipt }) {
  const D = BCCWE;
  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };
  const rcName = exp.receipt && (exp.receipt.name || exp.receipt);
  const taxLabel = (D.TAX.modes[exp.tax] && D.TAX.modes[exp.tax].label) || exp.tax;
  const m = D.TAX.modes[exp.tax] || { gst: 0, pst: 0 };
  const taxAmt = +(exp.amount * (m.gst + m.pst)).toFixed(2);
  const facts = [
    ["Type", exp.category],
    ["Ledger account", exp.acct + " · " + acctName(exp.acct)],
    ["Date", shortDate(exp.date)],
    ["Salesperson", personName(exp.sales)],
    ["Payment method", exp.method],
    ["Paid from", (() => { const a = D.accounts.find((x) => x.code === exp.paidFrom); return a ? a.code + " · " + a.name : "—"; })()],
    ["Tax treatment", taxLabel],
    ["Tax portion", fmt(taxAmt)],
    ["Amount", fmt(exp.amount)],
  ];
  return (
    <Modal title={exp.category + " — " + fmt(exp.amount)} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn variant="primary" icon="edit" onClick={onEdit}>Edit expense</Btn>
      </>}>
      <div className="iv-head">
        <div>
          <h4 className="iv-name">{exp.desc || "(No description)"}</h4>
          <span className="cat-tag">{exp.acct} · {acctName(exp.acct)}</span>
        </div>
        {exp.receipt ? <Badge tone="green" dot>Receipt attached</Badge> : <Badge tone="slate" dot>No receipt</Badge>}
      </div>
      <div className="iv-facts">
        {facts.map(([k, v]) => (
          <div className="iv-fact" key={k}><span>{k}</span><strong className="mono">{v}</strong></div>
        ))}
      </div>
      {exp.receipt && (
        <div className="exp-view-receipt"><Icon name="receipt" size={16} /> <span>{rcName}</span>
          {exp.receipt && exp.receipt.dataUrl && <Btn variant="ghost" size="sm" icon="eye" onClick={() => onViewReceipt && onViewReceipt(exp.receipt)}>View receipt</Btn>}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Expenses — receipt viewer ---------------- */
function ReceiptViewModal({ receipt, onClose }) {
  const isImage = receipt.type ? /^image\//.test(receipt.type) : true;
  return (
    <Modal title={"Receipt — " + (receipt.name || "attachment")} onClose={onClose} wide
      footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}>
      {isImage
        ? <img src={receipt.dataUrl} alt={receipt.name || "receipt"} style={{ maxWidth: "100%", display: "block", margin: "0 auto", borderRadius: 8 }} />
        : <div className="exp-view-receipt"><Icon name="receipt" size={16} /> <a href={receipt.dataUrl} download={receipt.name} target="_blank" rel="noopener noreferrer">Open / download {receipt.name || "file"}</a></div>}
    </Modal>
  );
}

/* ---------------- Expenses — delete confirm ---------------- */
function ExpenseDeleteModal({ exp, onConfirm, onClose }) {
  return (
    <Modal title="Delete expense?" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" icon="trash" onClick={onConfirm}>Delete expense</Btn>
      </>}>
      <p className="confirm-lead">Permanently delete this expense — <strong>{exp.category}</strong> of <strong className="mono">{fmt(exp.amount)}</strong> from {shortDate(exp.date)}{exp.desc ? " (“" + exp.desc + "”)" : ""}?</p>
      <div className="inline-note"><Icon name="alert" size={15} />This removes the record from the expense log and review totals. It cannot be undone.</div>
    </Modal>
  );
}

/* ---------------- Expenses — defective / lost stock write-off invoice ---------------- */
const DEFECT_REASONS = ["Defective / DOA", "Damaged in handling", "Lost / Missing", "Expired / Obsolete", "Customer return — not resalable", "Other"];

function DefectiveExpenseModal({ onSave, onClose }) {
  const D = BCCWE;
  const [date, setDate] = useState(D.today);
  const [sales, setSales] = useState(((D.salespeople[0] && D.salespeople[0].id) || ""));
  const [kind, setKind] = useState("defective");
  const [reason, setReason] = useState(DEFECT_REASONS[0]);
  const [lines, setLines] = useState([{ id: 1, code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]);

  const set = (id, patch) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => setLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: ((D.inventory[0] && D.inventory[0].code) || ""), qty: 1 }]);
  const rm = (id) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));

  const built = lines.map((l) => {
    const it = itemByCode(l.code);
    return { code: l.code, name: it ? it.name : l.code, cost: it ? it.cost : 0, stock: it ? it.stock : 0, qty: Math.max(1, Math.round(l.qty || 1)) };
  });
  const totalCost = built.reduce((s, b) => s + b.cost * b.qty, 0);
  const totalUnits = built.reduce((s, b) => s + b.qty, 0);
  const overStock = built.some((b) => b.qty > b.stock);
  const valid = built.length > 0;

  function submit() {
    if (!valid) return;
    onSave({ date, sales, kind, reason, lines: built.map((b) => ({ code: b.code, name: b.name, cost: b.cost, qty: b.qty })) });
  }

  return (
    <Modal title="New stock write-off invoice" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Post write-off {fmt(totalCost)}</Btn>
      </>}>
      <p className="import-lead">Add damaged, defective or lost products. The system posts their <strong>original buying cost</strong> as an expense and <strong>reduces inventory</strong> by the same units.</p>
      <div className="qs-kind" style={{ marginBottom: 16 }}>
        {[["defective", "Defective — → 5100"], ["lost", "Lost / missing — → 5110"]].map(([k, lbl]) => (
          <button key={k} className={"qs-kbtn" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{lbl}</button>
        ))}
      </div>
      <div className="meta-grid">
        <Field label="Date"><input type="date" value={date} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reason" required>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{DEFECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <Field label="Logged by">
          <select value={sales} onChange={(e) => setSales(e.target.value)}>{D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
      </div>
      <span className="field-label" style={{ marginTop: 14, display: "block" }}>Products to write off</span>
      <div className="ord-lines">
        {built.map((b, i) => {
          const l = lines[i];
          const over = b.qty > b.stock;
          return (
            <div className="ord-line def-line" key={l.id}>
              <select value={l.code} onChange={(e) => set(l.id, { code: e.target.value })}>
                {D.inventory.map((it) => <option key={it.code} value={it.code}>{it.code} — {it.name}</option>)}
              </select>
              <span className="def-cost mono">{fmt(b.cost)}<em>/ea · {b.stock} in stock</em></span>
              <label className="ord-qty">Qty<input type="number" min="1" className={over ? "err" : ""} value={l.qty} onChange={(e) => set(l.id, { qty: +e.target.value })} /></label>
              <span className="ord-amt mono neg">{fmt(b.cost * b.qty)}</span>
              <button className="icon-btn line-del" onClick={() => rm(l.id)} title="Remove line"><Icon name="trash" size={15} /></button>
            </div>
          );
        })}
        <button className="qsl-add" onClick={add}><Icon name="plus" size={14} /> Add product</button>
      </div>
      <div className="purchase-summary">
        <div><span>Products</span><strong className="mono">{built.length}</strong></div>
        <div><span>Units written off</span><strong className="mono">{totalUnits}</strong></div>
        <div><span>Expense (cost basis)</span><strong className="mono neg">{fmt(totalCost)}</strong></div>
        <div className="ps-range">→ {kind === "lost" ? "5110 Lost stock" : "5100 Defective"}</div>
      </div>
      {overStock && <div className="inline-note"><Icon name="alert" size={15} />One or more lines exceed stock on hand — inventory will be reduced to zero, not below.</div>}
      <div className="inline-note"><Icon name="check" size={15} />Posts: DR {kind === "lost" ? "5110 Loss on Lost / Missing Stock" : "5100 Loss on Defective Goods"} · CR 1300 Inventory. Each item is also added to the {kind === "lost" ? "lost" : "defective"} stock register.</div>
    </Modal>
  );
}

/* ---------------- Expenses — review / analytics ---------------- */
function ExpenseReview() {
  const D = BCCWE;
  const [period, setPeriod] = useState("year");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  const range = periodRange(period, from, to);

  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };
  const rows = D.expenses.filter((e) => inRange(e.date, range));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const count = rows.length;
  const avg = count ? total / count : 0;

  // by category
  const catAgg = {};
  rows.forEach((e) => { (catAgg[e.category] || (catAgg[e.category] = { name: e.category, acct: e.acct, amount: 0, count: 0 })).amount += e.amount; catAgg[e.category].count++; });
  const cats = Object.values(catAgg).sort((a, b) => b.amount - a.amount);
  const top = cats[0];
  const catMax = Math.max(1, ...cats.map((c) => c.amount));

  // by salesperson
  const spAgg = {};
  rows.forEach((e) => { (spAgg[e.sales] || (spAgg[e.sales] = { id: e.sales, amount: 0, count: 0 })).amount += e.amount; spAgg[e.sales].count++; });
  const sps = Object.values(spAgg).sort((a, b) => b.amount - a.amount);
  const spMax = Math.max(1, ...sps.map((s) => s.amount));

  // monthly buckets
  const buckets = timeBuckets(range).map((bk) => {
    let v = 0; rows.forEach((e) => { if (bk.test(e.date)) v += e.amount; });
    return { label: bk.label, value: v };
  });
  const bMax = Math.max(1, ...buckets.map((b) => b.value));
  const money0 = (v) => "$" + Math.round(v).toLocaleString("en-CA");

  return (
    <Card title="Expense review" sub="Spending breakdown to guide future management" className="exp-review" pad={false}>
      <div className="toolbar">
        <PeriodFilter period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      <div className="period-summary">
        <div><span>Total spend</span><strong className="mono neg">{fmt(total)}</strong></div>
        <div><span>Entries</span><strong className="mono">{count}</strong></div>
        <div><span>Avg per entry</span><strong className="mono">{fmt(avg)}</strong></div>
        <div><span>Largest type</span><strong className="mono">{top ? top.name + " · " + fmt(top.amount) : "—"}</strong></div>
        <div className="ps-range">{range.label}</div>
      </div>

      {count === 0 ? <div style={{ padding: 16 }}><Empty icon="receipt" text="No expenses recorded in this period" /></div> : (
        <div className="exp-review-body">
          <div className="exp-review-grid">
            <div className="exp-panel">
              <h5 className="iv-sec">Spending by type</h5>
              <div className="exp-bars">
                {cats.map((c) => (
                  <div className="exp-bar-row" key={c.name}>
                    <span className="exp-bar-name" title={c.acct + " · " + acctName(c.acct)}>{c.name}</span>
                    <div className="exp-bar-track"><i className="exp-bar-fill" style={{ width: (c.amount / catMax) * 100 + "%" }} /></div>
                    <span className="exp-bar-val">{fmt(c.amount)}<em className="exp-bar-pct">{Math.round((c.amount / total) * 100)}%</em></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="exp-panel">
              <h5 className="iv-sec">Monthly trend</h5>
              <div className="ebar-chart">
                {buckets.map((b, i) => (
                  <div className="ebar-col" key={i}>
                    <span className="ebar-val">{b.value ? money0(b.value) : ""}</span>
                    <div className="ebar" style={{ height: (b.value / bMax) * 100 + "%" }} title={b.label + ": " + fmt(b.value)} />
                  </div>
                ))}
              </div>
              <div className="ebar-x">{buckets.map((b, i) => <span key={i}>{b.label}</span>)}</div>
            </div>
          </div>

          <h5 className="iv-sec" style={{ padding: "0 18px" }}>Spending by salesperson</h5>
          <table className="data-table compact">
            <thead><tr><th>Salesperson</th><th className="r">Entries</th><th className="r">Total spend</th><th>Share</th></tr></thead>
            <tbody>
              {sps.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{personName(s.id)}</td>
                  <td className="r mono">{s.count}</td>
                  <td className="r mono">{fmt(s.amount)}</td>
                  <td><div className="exp-bar-track" style={{ maxWidth: 220 }}><i className="exp-bar-fill alt" style={{ width: (s.amount / spMax) * 100 + "%" }} /></div></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="r mono strong">{count}</td><td className="r mono strong">{fmt(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, ico, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span className="kpi-ico"><Icon name={ico} size={18} /></span></div>
      <div className={"kpi-val" + (tone === "green" ? " pos" : "")}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

Object.assign(window, { Inventory, Sales, Expenses, QuickSale, PurchasePage, OrderDetailPage, ReceiveOrderPage });
