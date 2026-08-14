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

function Inventory({ go, pushToast }) {
  const D = BCCWE;
  const [tab, setTab] = useState("stock");
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
  const lowCount = D.inventory.filter((i) => i.stock <= i.alert).length;

  // ---- CRUD handlers ----
  function saveItem(data, original) {
    if (original) {
      Object.assign(original, data);
      pushToast && pushToast("Saved changes to " + data.code);
    } else {
      D.inventory.push({ ...data });
      pushToast && pushToast("Added " + data.code + " to inventory");
    }
    bump(); close();
  }
  function deleteItem(item) {
    const idx = D.inventory.indexOf(item);
    if (idx >= 0) D.inventory.splice(idx, 1);
    pushToast && pushToast("Deleted " + item.code + " from inventory");
    bump(); close();
  }
  function recordPurchase(p) {
    const it = itemByCode(p.code);
    const poNo = "PO-" + (342 + D.purchaseOrders.length);
    if (it) {
      if (p.cost > 0) it.cost = p.cost;
      if (p.price > 0) it.price = p.price;
      if (p.supplier) it.supplier = p.supplier;
      if (p.alert >= 0) it.alert = p.alert;
      it.bonus = (it.bonus || 0) + p.bonusQty;
      if (p.status === "Received") it.stock += p.qty + p.bonusQty;
      if (p.status === "Received") { it.purchased = D.today; delete it.stockState; }
    }
    D.purchaseOrders.unshift({
      po: poNo, supplier: p.supplier, date: D.today,
      items: (it ? it.name : p.code) + " ×" + p.qty + (p.bonusQty ? " (+" + p.bonusQty + " bonus)" : ""),
      tracking: p.tracking || "—", total: +(p.qty * p.cost).toFixed(2), status: p.status,
    });
    pushToast && pushToast(p.status === "Received"
      ? "Stock received — " + (p.qty + p.bonusQty) + " units of " + p.code
      : "Purchase order " + poNo + " logged (" + p.status + ")");
    bump(); close();
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
      const data = {
        code, name: o.name || code, cat: o.cat || "Uncategorized",
        supplier: supplierIdByName(o.supplier),
        cost: num(o.cost, 0), price: num(o.price, 0),
        stock: num(o.stock, 0), bonus: num(o.bonus, 0), alert: num(o.alert, 0),
      };
      const existing = itemByCode(code);
      if (existing) Object.assign(existing, data);
      else D.inventory.push(data);
      n++;
    });
    bump();
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
      <PageHead title="Inventory" sub={D.inventory.length + " items · " + fmt(stockValue) + " at cost · " + lowCount + " low"}
        actions={<>
          <Btn variant="ghost" icon="download" onClick={() => setModal({ type: "import" })}>Import CSV</Btn>
          <Btn variant="ghost" icon="truck" onClick={() => setModal({ type: "purchase" })}>New purchase</Btn>
          <Btn variant="primary" icon="plus" onClick={() => setModal({ type: "add" })}>Add item</Btn>
        </>} />

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
      </div>

      {tab === "stock" && (
        <Card pad={false}>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search item or code…" value={q} onChange={(e) => { setQ(e.target.value); resetPage(); }} /></div>
            <div className="seg-filters">{cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => { setCat(c); resetPage(); }}>{c}</button>)}</div>
            <div className="seg-filters move-filters">{["All", "Fast", "Steady", "Slow", "Not moving", "Dead"].map((mf) => <button key={mf} className={"chip" + (moveFilter === mf ? " on" : "")} onClick={() => { setMoveFilter(mf); resetPage(); }}>{mf}</button>)}</div>
            <SortControl sort={sort} setSort={(v) => { setSort(v); resetPage(); }} defs={invtSorts} />
          </div>
          <table className="data-table">
            <thead><tr><th>Item code</th><th>Description</th><th>Supplier</th><th className="r">Cost</th><th className="r">Price</th><th className="r">Margin</th><th className="r">Stock</th><th>Purchased</th><th>Movement</th><th>Status</th><th /></tr></thead>
            <tbody>
              {slice.map((i) => {
                const low = i.stock <= i.alert;
                const margin = i.price - i.cost;
                const mpct = i.price ? Math.round((margin / i.price) * 100) : 0;
                const st = window.STOCK.state(i);
                return (
                  <tr key={i.code} className={st === "dead" ? "row-dead" : st === "notmoving" ? "row-aging" : ""}>
                    <td className="mono strong">{i.code}</td>
                    <td>{i.name}<em className="cat-tag">{i.cat}</em></td>
                    <td className="muted">{supplierName(i.supplier)}</td>
                    <td className="r mono">{fmt(i.cost)}</td>
                    <td className="r mono">{fmt(i.price)}</td>
                    <td className="r mono"><span className="pos">{fmt(margin)}</span> <em className="mpct">{mpct}%</em></td>
                    <td className="r mono strong">{i.stock}</td>
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
      {tab === "orders" && (
        <Card pad={false}>
          <table className="data-table">
            <thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th>Items</th><th>Tracking #</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {D.purchaseOrders.map((p) => (
                <tr key={p.po}>
                  <td className="mono strong">{p.po}</td>
                  <td>{supplierName(p.supplier)}</td>
                  <td className="muted">{shortDate(p.date)}</td>
                  <td>{p.items}</td>
                  <td className="mono muted">{p.tracking}</td>
                  <td className="r mono">{fmt(p.total)}</td>
                  <td><Badge tone={statusTone(p.status)} dot>{p.status}</Badge></td>
                  <td className="row-acts">{p.status !== "Received" && <Btn variant="ghost" size="sm" icon="check" onClick={() => { p.status = "Received"; pushToast && pushToast(p.po + " marked received"); bump(); }}>Receive</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(modal && modal.type === "add") && <ItemFormModal onSave={(d) => saveItem(d, null)} onClose={close} />}
      {(modal && modal.type === "edit") && <ItemFormModal item={modal.item} onSave={(d) => saveItem(d, modal.item)} onClose={close} />}
      {(modal && modal.type === "view") && <ItemViewModal item={modal.item} onClose={close} onEdit={() => setModal({ type: "edit", item: modal.item })} />}
      {(modal && modal.type === "delete") && <DeleteItemModal item={modal.item} onConfirm={() => deleteItem(modal.item)} onClose={close} />}
      {(modal && modal.type === "purchase") && <PurchaseModal onSave={recordPurchase} onClose={close} />}
      {(modal && modal.type === "import") && <ImportModal {...importCfg} pushToast={pushToast} onClose={close} />}
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
function ItemFormModal({ item, onSave, onClose }) {
  const D = BCCWE;
  const editing = !!item;
  const [f, setF] = useState(() => ({
    code: item ? item.code : "",
    name: item ? item.name : "",
    cat: item ? item.cat : "",
    supplier: item ? item.supplier : (D.suppliers[0] && D.suppliers[0].id) || "",
    cost: item ? item.cost : "",
    price: item ? item.price : "",
    stock: item ? item.stock : "",
    bonus: item ? item.bonus : "",
    alert: item ? item.alert : "",
    purchased: item ? (item.purchased || D.today) : D.today,
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const cats = Array.from(new Set(D.inventory.map((i) => i.cat)));

  const codeClash = !editing && !!itemByCode(f.code.trim());
  const valid = f.code.trim() && f.name.trim() && !codeClash;

  function submit() {
    if (!valid) return;
    const num = (v) => Math.max(0, parseFloat(v) || 0);
    onSave({
      code: f.code.trim(), name: f.name.trim(), cat: f.cat.trim() || "Uncategorized",
      supplier: f.supplier, cost: num(f.cost), price: num(f.price),
      stock: Math.round(num(f.stock)), bonus: Math.round(num(f.bonus)), alert: Math.round(num(f.alert)),
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
      <div className="meta-grid">
        <Field label="Item code" required hint={codeClash ? "⚠ Code already exists" : "Unique SKU"}>
          <input value={f.code} disabled={editing} placeholder="e.g. IPH-13-128-A"
            className={codeClash ? "err" : ""} onChange={(e) => set("code", e.target.value)} />
        </Field>
        <Field label="Category">
          <input list="cat-list" value={f.cat} placeholder="Phone / Part…" onChange={(e) => set("cat", e.target.value)} />
          <datalist id="cat-list">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Supplier">
          <select value={f.supplier} onChange={(e) => set("supplier", e.target.value)}>
            {D.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
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
      <div className="meta-grid">
        <Field label="Stock on hand"><input type="number" min="0" value={f.stock} placeholder="0" onChange={(e) => set("stock", e.target.value)} /></Field>
        <Field label="Bonus stock" hint="Adds to stock, not cost basis"><input type="number" min="0" value={f.bonus} placeholder="0" onChange={(e) => set("bonus", e.target.value)} /></Field>
        <Field label="Stock alert" hint="Low-stock threshold"><input type="number" min="0" value={f.alert} placeholder="0" onChange={(e) => set("alert", e.target.value)} /></Field>
      </div>
      <Field label="Purchase date" hint="Used for stock-aging — when this batch was received"><input type="date" value={f.purchased} onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()} onChange={(e) => set("purchased", e.target.value)} /></Field>
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

/* ---------------- Inventory — new purchase / stock receipt ---------------- */
function PurchaseModal({ onSave, onClose }) {
  const D = BCCWE;
  const first = D.inventory[0];
  const [f, setF] = useState(() => ({
    code: first ? first.code : "",
    qty: "", bonusQty: "",
    cost: first ? String(first.cost) : "",
    price: first ? String(first.price) : "",
    supplier: first ? first.supplier : (D.suppliers[0] && D.suppliers[0].id) || "",
    alert: first ? String(first.alert) : "",
    tracking: "", status: "Received",
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  function pickItem(code) {
    const it = itemByCode(code);
    setF((s) => ({ ...s, code, cost: it ? String(it.cost) : s.cost, price: it ? String(it.price) : s.price, supplier: it ? it.supplier : s.supplier, alert: it ? String(it.alert) : s.alert }));
  }

  const qty = Math.max(0, Math.round(parseFloat(f.qty) || 0));
  const bonusQty = Math.max(0, Math.round(parseFloat(f.bonusQty) || 0));
  const cost = Math.max(0, parseFloat(f.cost) || 0);
  const valid = f.code && qty > 0;
  const total = qty * cost;

  function submit() {
    if (!valid) return;
    onSave({
      code: f.code, qty, bonusQty, cost, price: Math.max(0, parseFloat(f.price) || 0),
      supplier: f.supplier, alert: Math.max(0, Math.round(parseFloat(f.alert) || 0)),
      tracking: f.tracking.trim(), status: f.status,
    });
  }

  return (
    <Modal title="New purchase / stock receipt" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Record purchase</Btn>
      </>}>
      <p className="import-lead">Receive stock against an existing item. <strong>Received</strong> purchases add quantity + bonus to stock immediately; <strong>Placed</strong> / <strong>In Transit</strong> log a purchase order without updating stock until received.</p>
      <div className="meta-grid">
        <Field label="Item code" required>
          <select value={f.code} onChange={(e) => pickItem(e.target.value)}>
            {D.inventory.map((i) => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier">
          <select value={f.supplier} onChange={(e) => set("supplier", e.target.value)}>
            {D.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => set("status", e.target.value)}>
            {["Received", "Placed", "In Transit"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="meta-grid">
        <Field label="Purchase quantity" required><input type="number" min="0" value={f.qty} placeholder="0" onChange={(e) => set("qty", e.target.value)} /></Field>
        <Field label="Bonus quantity" hint="Free units — no cost basis"><input type="number" min="0" value={f.bonusQty} placeholder="0" onChange={(e) => set("bonusQty", e.target.value)} /></Field>
        <Field label="Stock alert"><input type="number" min="0" value={f.alert} placeholder="0" onChange={(e) => set("alert", e.target.value)} /></Field>
      </div>
      <div className="meta-grid">
        <Field label="Cost price"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={f.cost} placeholder="0.00" onChange={(e) => set("cost", e.target.value)} /></div></Field>
        <Field label="Sales price"><div className="input-prefix"><span>$</span><input type="number" min="0" step="0.01" value={f.price} placeholder="0.00" onChange={(e) => set("price", e.target.value)} /></div></Field>
        <Field label="Tracking #"><input value={f.tracking} placeholder="Optional" onChange={(e) => set("tracking", e.target.value)} /></Field>
      </div>
      <div className="purchase-summary">
        <div><span>Units to stock</span><strong className="mono">{f.status === "Received" ? "+" + (qty + bonusQty) : "0 (until received)"}</strong></div>
        <div><span>Purchase total</span><strong className="mono">{fmt(total)}</strong></div>
        <div className="ps-range">{f.status}</div>
      </div>
    </Modal>
  );
}

/* ---------------- Inventory — product detail / analytics view ---------------- */
function ItemViewModal({ item, onClose, onEdit }) {
  const D = BCCWE;
  const sales = D.itemSales.filter((s) => s.code === item.code);
  const units = sales.reduce((s, r) => s + r.qty, 0);
  const revenue = units * item.price;
  const cogs = units * item.cost;
  const profit = units * (item.price - item.cost);
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

  const low = item.stock <= item.alert;
  const facts = [
    ["Category", item.cat],
    ["Supplier", supplierName(item.supplier)],
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
    m.units += s.qty; m.revenue += s.qty * it.price; m.profit += s.qty * (it.price - it.cost);
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
      v += s.qty * (it.price - it.cost);
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
    </div>
  );
}

/* ---------------- Sales (with / without invoice) ---------------- */
function Sales({ go, pushToast }) {
  const D = BCCWE;
  const [tab, setTab] = useState("quick");
  const [, force] = useState(0);
  const kindTone = { Sale: "green", Return: "red", Exchange: "blue" };

  return (
    <div>
      <PageHead title="Sales" sub="Point-of-sale entry — with or without an invoice"
        actions={<Btn variant="primary" icon="invoice" onClick={() => go("invoice")}>Sale with invoice</Btn>} />

      <div className="tabs">
        <button className={"tab" + (tab === "quick" ? " on" : "")} onClick={() => setTab("quick")}>Quick sale (no invoice)</button>
        <button className={"tab" + (tab === "log" ? " on" : "")} onClick={() => setTab("log")}>Today's register <em>{D.cashSales.length}</em></button>
      </div>

      {tab === "quick" ? (
        <QuickSale pushToast={pushToast} onRecorded={() => { setTab("log"); force((x) => x + 1); }} />
      ) : (
        <Card pad={false}>
          <table className="data-table">
            <thead><tr><th>Time</th><th>Type</th><th>Client</th><th>Item / service</th><th>Salesperson</th><th>Method</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {D.cashSales.map((s) => (
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
  const histFor = (code) => BCCWE.itemSales
    .filter((s) => s.clientId === clientId && s.code === code)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
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

function QuickSale({ pushToast, onRecorded }) {
  const D = BCCWE;
  const catalog = [...D.inventory, ...D.services];
  const [kind, setKind] = useState("Sale");
  const [type, setType] = useState("Retail");
  const [clientId, setClientId] = useState((D.clients.find((c) => c.id !== "c3") || D.clients[0]).id);
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
  const customerPays = total >= 0;

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
  const settleDir = total > 0.005 ? "charge" : total < -0.005 ? "refund" : "even";
  const canRecord = (useOut && outLines.some((l) => l.desc)) || (useIn && inLines.some((l) => l.desc));

  // ---- settlement: how the balance is collected (sale) or refunded (return/exchange) ----
  const activeClientId = useIn ? clientId : (saleClientId !== "walkin" ? saleClientId : null);
  const activeClient = activeClientId ? D.clients.find((c) => c.id === activeClientId) : null;
  const chargeTotal = settleDir === "charge" ? r2(total) : 0;
  const refundTotalAmt = settleDir === "refund" ? r2(-total) : 0;
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
    return J;
  }
  const regJ = buildRegJournal();
  const jDr = regJ.reduce((s, j) => s + j.dr, 0);
  const jCr = regJ.reduce((s, j) => s + j.cr, 0);

  function record() {
    if (useOut) outLines.forEach((l) => { const it = itemByCode(l.code); if (it) it.stock = Math.max(0, it.stock - l.qty); });
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
    D.cashSales.unshift({ id: "cs" + Date.now(), date: D.today, client: clientLabel, type, kind, retDisp, item: label, total: +total.toFixed(2), method: methodLabel, sales: "u_kev", settle: settleDir, paid: r2(collected), owed: r2(onAccount) });
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
    pushToast && pushToast(kind + " recorded — " + settleMsg + " · journal posted" + extra);
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
        <Card title="New register entry">
          <div className="qs-kind">
            {["Sale", "Return", "Exchange"].map((k) => (
              <button key={k} className={"qs-kbtn" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
          <div className="meta-grid">
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
        <div className="rail-total"><span>{settleDir === "refund" ? "Refund to customer" : settleDir === "even" ? "No balance due" : "Customer pays"}</span><strong className={settleDir === "refund" ? "neg" : ""}>{fmt(Math.abs(total))}</strong></div>

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

function Expenses({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [defModal, setDefModal] = useState(false);

  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };

  // ---- entry form state ----
  const [cat, setCat] = useState(D.expenseCategories[0].name);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(D.today);
  const [method, setMethod] = useState("Cash");
  const [sales, setSales] = useState(D.salespeople[0].id);
  const [tax, setTax] = useState("none");
  const [desc, setDesc] = useState("");
  const [receipt, setReceipt] = useState("");
  const [stockLines, setStockLines] = useState([{ id: 1, code: D.inventory[0].code, qty: 1 }]);
  const fileRef = useRef(null);

  // row actions modal: { type: 'view'|'edit'|'delete', exp }
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);
  function saveEdit(data, original) {
    Object.assign(original, data);
    pushToast && pushToast("Updated expense — " + fmt(original.amount) + " · " + original.category);
    bump(); close();
  }
  function removeExpense(exp) {
    const idx = D.expenses.indexOf(exp);
    if (idx >= 0) D.expenses.splice(idx, 1);
    pushToast && pushToast("Deleted expense — " + fmt(exp.amount) + " · " + exp.category);
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
      id: "e" + Date.now(), date: data.date, category, acct,
      desc: data.reason + " · " + data.lines.length + " item" + (data.lines.length === 1 ? "" : "s") + " · " + ref,
      amount: +totalCost.toFixed(2), method: "Stock adjustment", tax: "none", sales: data.sales, receipt: "",
    });
    pushToast && pushToast("Expense invoice " + ref + " recorded — " + fmt(totalCost) + " written off · inventory reduced");
    bump(); setDefModal(false);
  }

  const catDef = D.expenseCategories.find((c) => c.name === cat) || D.expenseCategories[0];
  const isStockLoss = !!catDef.stockLoss;
  const amt = parseFloat(amount) || 0;

  const setSL = (id, patch) => setStockLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addSL = () => setStockLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: D.inventory[0].code, qty: 1 }]);
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
        id: "e" + Date.now(), date, category: cat, acct: catDef.acct,
        desc: (desc.trim() ? desc.trim() + " · " : "") + stockBuilt.length + " item" + (stockBuilt.length === 1 ? "" : "s") + " · " + ref,
        amount: +stockCost.toFixed(2), method: "Stock adjustment", tax: "none", sales, receipt: "",
      });
      pushToast && pushToast(cat + " written off — " + fmt(stockCost) + " · inventory reduced " + stockUnits + " unit" + (stockUnits === 1 ? "" : "s"));
      setStockLines([{ id: 1, code: D.inventory[0].code, qty: 1 }]); setDesc("");
      bump();
      return;
    }
    D.expenses.unshift({
      id: "e" + Date.now(),
      date, category: cat, acct: catDef.acct,
      desc: desc.trim(), amount: +amt.toFixed(2),
      method, tax, sales, receipt,
    });
    pushToast && pushToast("Expense recorded — " + fmt(amt) + " · " + cat + " → " + catDef.acct + " " + acctName(catDef.acct));
    setAmount(""); setDesc(""); setReceipt("");
    if (fileRef.current) fileRef.current.value = "";
    bump();
  }

  const total = D.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHead title="Expenses" sub={D.expenses.length + " logged · " + fmt(total) + " total"}
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
            <Field label={isStockLoss ? "Logged by" : "Salesperson"} hint={isStockLoss ? "Who recorded this write-off" : "Who incurred this expense"}>
              <select value={sales} onChange={(e) => setSales(e.target.value)}>
                {D.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {!isStockLoss && <Field label="Payment method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{EXP_METHODS.map((x) => <option key={x}>{x}</option>)}</select></Field>}
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
          {!isStockLoss && (
            <div className="exp-receipt-row">
              {receipt ? (
                <span className="receipt-chip"><Icon name="receipt" size={15} /> {receipt}<button className="rc-x" title="Remove receipt" onClick={() => { setReceipt(""); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="x" size={13} /></button></span>
              ) : (
                <button className="upload" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="download" size={15} /> Attach receipt</button>
              )}
              <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => { const f = e.target.files[0]; if (f) setReceipt(f.name); }} />
            </div>
          )}
          <div className="exp-foot">
            <span className="exp-foot-note">{canSave ? (isStockLoss ? "Will write off " + fmt(stockCost) + " to " + catDef.acct + " · reduce inventory" : "Will post " + fmt(amt) + " to " + catDef.acct) : (isStockLoss ? "Add at least one product to save" : "Enter an amount to save")}</span>
            <Btn variant="primary" icon="check" disabled={!canSave} onClick={save}>{isStockLoss ? "Post write-off" : "Save expense"}</Btn>
          </div>
        </Card>

        <Card title="Recent expenses" sub={D.expenses.length + " entries"} pad={false}>
          <div className="exp-table-scroll">
            <table className="data-table compact">
              <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Salesperson</th><th>Method</th><th>Receipt</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {D.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{shortDate(e.date)}</td>
                    <td><span className="jcode">{e.acct}</span> {e.category}</td>
                    <td className="muted">{e.desc || "—"}</td>
                    <td>{personName(e.sales)}</td>
                    <td className="muted">{e.method}</td>
                    <td>{e.receipt ? <span className="rcpt-yes" title={e.receipt}><Icon name="receipt" size={14} /> Attached</span> : <span className="muted">—</span>}</td>
                    <td className="r mono">{fmt(e.amount)}</td>
                    <td className="row-acts">
                      <button className="icon-btn" title="View details" onClick={() => setModal({ type: "view", exp: e })}><Icon name="eye" size={15} /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setModal({ type: "edit", exp: e })}><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setModal({ type: "delete", exp: e })}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="6">Total</td><td className="r mono strong">{fmt(total)}</td><td /></tr></tfoot>
            </table>
          </div>
        </Card>
      </div>

      <ExpenseReview />

      {(modal && modal.type === "view") && <ExpenseViewModal exp={modal.exp} onClose={close} onEdit={() => setModal({ type: "edit", exp: modal.exp })} />}
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
          <span className="receipt-chip"><Icon name="receipt" size={15} /> {f.receipt}<button className="rc-x" title="Remove receipt" onClick={() => { set("receipt", ""); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="x" size={13} /></button></span>
        ) : (
          <button className="upload" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="download" size={15} /> Attach receipt</button>
        )}
        <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => { const file = e.target.files[0]; if (file) set("receipt", file.name); }} />
      </div>
    </Modal>
  );
}

/* ---------------- Expenses — view detail modal ---------------- */
function ExpenseViewModal({ exp, onClose, onEdit }) {
  const D = BCCWE;
  const acctName = (code) => { const a = D.accounts.find((x) => x.code === code); return a ? a.name : code; };
  const taxLabel = (D.TAX.modes[exp.tax] && D.TAX.modes[exp.tax].label) || exp.tax;
  const m = D.TAX.modes[exp.tax] || { gst: 0, pst: 0 };
  const taxAmt = +(exp.amount * (m.gst + m.pst)).toFixed(2);
  const facts = [
    ["Type", exp.category],
    ["Ledger account", exp.acct + " · " + acctName(exp.acct)],
    ["Date", shortDate(exp.date)],
    ["Salesperson", personName(exp.sales)],
    ["Payment method", exp.method],
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
        <div className="exp-view-receipt"><Icon name="receipt" size={16} /> <span>{exp.receipt}</span></div>
      )}
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
  const [sales, setSales] = useState(D.salespeople[0].id);
  const [kind, setKind] = useState("defective");
  const [reason, setReason] = useState(DEFECT_REASONS[0]);
  const [lines, setLines] = useState([{ id: 1, code: D.inventory[0].code, qty: 1 }]);

  const set = (id, patch) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => setLines((ls) => [...ls, { id: Math.floor(Math.random() * 1e9), code: D.inventory[0].code, qty: 1 }]);
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

Object.assign(window, { Inventory, Sales, Expenses });
