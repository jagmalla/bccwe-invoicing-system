/* ============================================================
   BCCWE — App shell, navigation, router, mount
   ============================================================ */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "pos", label: "POS", icon: "cart" },
  { id: "neworder", label: "New Order", icon: "order" },
  { id: "invoice", label: "Invoice Generator", icon: "invoice" },
  { id: "return", label: "Return", icon: "history" },
  { id: "exchange", label: "Exchange", icon: "history" },
  { id: "history", label: "Invoice History", icon: "history" },
  { id: "orders", label: "Client Orders", icon: "order" },
  { id: "people", label: "Clients & Suppliers", icon: "people" },
  { id: "inventory", label: "Inventory", icon: "box" },
  { id: "purchaseorders", label: "Purchase Orders", icon: "truck" },
  { id: "sales", label: "Sales", icon: "cart" },
  { id: "expenses", label: "Expenses", icon: "receipt" },
  { id: "accounting", label: "Accounting", icon: "ledger" },
  { id: "unpaid", label: "Unpaid Invoices", icon: "alert" },
  { id: "reports", label: "Reports", icon: "report" },
  { id: "mail", label: "Sent Mail", icon: "mail" },
  { id: "logs", label: "Activity Logs", icon: "history" },
  { id: "stores", label: "Stores", icon: "store" },
  { id: "settings", label: "Settings", icon: "settings" },
];
const GROUPS = [
  { title: "Operate", ids: ["dashboard", "purchaseorders", "orders", "people"] },
  { title: "Sales", ids: ["pos", "invoice", "history", "return", "exchange"] },
  { title: "Trade", ids: ["inventory", "expenses"] },
  { title: "Finance", ids: ["accounting", "unpaid", "reports"] },
  { title: "Admin", ids: ["mail", "logs", "stores", "settings"] },
];

// Whether the signed-in user's role may see a given nav module. Admins/owners
// see everything; other roles only see modules their role grants a permission in.
function navAllowed(id) {
  if (window.STORES && window.STORES.isAdmin()) return true;
  const sess = window.__session || {};
  const roles = BCCWE.roles || [];
  const role = roles.find((r) => r.id === sess.roleId) || roles.find((r) => r.name === sess.role);
  const perms = role && role.perms;
  if (!perms) return true; // no role info on record — don't lock the user out
  if (id === "stores" || id === "mail" || id === "logs") return false; // admin-only utilities
  if (id === "pos") return !!(perms.sales && perms.sales.add);          // POS = can add a sale
  if (id === "neworder") return !!(perms.orders && perms.orders.add);   // New Order = can add an order
  // Purchase orders live on the Inventory screen, so they follow its permission.
  if (id === "purchaseorders") return !!(perms.inventory && (perms.inventory.orders || perms.inventory.view));
  if (id === "return" || id === "exchange") return !!(perms.sales && (perms.sales.add || perms.sales.ret_all || perms.sales.ret_own));
  const mp = perms[id];
  if (!mp) return true; // module not in the permission model — allow
  return Object.keys(mp).some((k) => mp[k]);
}

// Catches render errors in any screen so one failing view never blanks the
// whole app. Keyed by route, so navigating elsewhere automatically recovers.
class ScreenErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err: err }; }
  componentDidCatch(err, info) { try { console.error("Screen error:", err, info); } catch (e) {} }
  render() {
    if (this.state.err) {
      return (
        <div className="card" style={{ padding: 24, maxWidth: 640, margin: "20px auto" }}>
          <h3 style={{ marginBottom: 8 }}>Something went wrong on this screen</h3>
          <p className="muted" style={{ marginBottom: 12 }}>The rest of the app is fine — use the menu to go elsewhere, or reload.</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#b3322d", background: "#fbe7e6", padding: 10, borderRadius: 8, marginBottom: 14 }}>{String(this.state.err && (this.state.err.message || this.state.err))}</pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>Reload app</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function buildNotifications() {
  const D = BCCWE;
  const today = D.today;
  const out = [];
  (D.invoices || []).forEach((i) => {
    const bal = +(i.total - (i.paid || 0)).toFixed(2);
    if (bal > 0.005 && i.due && i.due < today) {
      out.push({ id: "ov-" + i.no, icon: "alert", tone: "red", title: "Invoice " + i.no + " is overdue",
        detail: clientName(i.clientId) + " · " + fmt(bal) + " due " + shortDate(i.due), route: "invoiceview/" + i.no, ts: i.due });
    }
  });
  (D.mailLog || []).filter((m) => m.status === "Bounced").forEach((m) => {
    out.push({ id: "bn-" + m.id, icon: "mail", tone: "red", title: "Email bounced",
      detail: (m.subject || "Email") + " · " + ((m.to && m.to[0]) || ""), route: "mail", ts: m.ts });
  });
  (D.inventory || []).filter((it) => it.kind !== "Service" && (it.alert || 0) > 0 && it.stock <= it.alert).forEach((it) => {
    out.push({ id: "ls-" + it.code, icon: "box", tone: "amber", title: "Low stock — " + it.name,
      detail: it.stock + " left · reorder at " + it.alert, route: "inventory", ts: "" });
  });
  const order = { red: 0, amber: 1, slate: 2 };
  return out.sort((a, b) => (order[a.tone] - order[b.tone]) || String(b.ts).localeCompare(String(a.ts)));
}

function NotificationsBell({ go }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const ref = useRef(null);
  const items = useMemo(() => buildNotifications(), [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  function toggle() { setOpen((o) => { const n = !o; if (n) setRead(true); return n; }); }
  const unread = !read && items.length > 0;
  return (
    <div className="notif" ref={ref}>
      <button className="icon-btn bell" onClick={toggle} aria-label="Notifications">
        <Icon name="bell" size={18} />
        {unread && <i className="bell-dot" />}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            <span>{items.length ? items.length + " need attention" : "All clear"}</span>
          </div>
          <div className="notif-list">
            {items.length ? items.map((n) => (
              <button key={n.id} className="notif-item" onClick={() => { go(n.route); setOpen(false); }}>
                <span className={"notif-ico tone-" + n.tone}><Icon name={n.icon} size={15} /></span>
                <span className="notif-body">
                  <strong>{n.title}</strong>
                  <span>{n.detail}</span>
                </span>
              </button>
            )) : (
              <div className="notif-empty"><Icon name="check" size={22} /><span>Nothing needs your attention</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "dashboard");
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  // The active store starts from the one chosen at login (remembered for this
  // browser session); fall back to the user's default view.
  const [store, setStore] = useState(() => {
    try { const s = sessionStorage.getItem("bccwe_store"); if (s) return s; } catch (e) {}
    return window.STORES ? window.STORES.initialFilter() : "all";
  });
  // Remember the store when switched mid-session too, so it survives a reload
  // and stays in sync with the login choice.
  const changeStore = (v) => { setStore(v); try { sessionStorage.setItem("bccwe_store", v); } catch (e) {} };
  const storeOpts = window.STORES ? window.STORES.allowed() : [];
  const canAll = window.STORES ? window.STORES.canSeeAll() : true;
  const showStoreSwitcher = storeOpts.length > 1 || (canAll && storeOpts.length >= 1);
  const go = (r) => { setRoute(r); location.hash = r; setNavOpen(false); window.scrollTo(0, 0); };
  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const pushToast = (msg) => setToast(msg);

  const [base, ...restSeg] = route.split("/");
  const param = restSeg.join("/"); // ids may contain "/" — keep every segment
  // Purchase-order detail routes highlight Purchase Orders, since that is now
  // where they are reached from.
  const navActive = base === "invoiceview" ? "history" : base === "client" ? "people"
    : (base === "purchase" || base === "po" || base === "receive") ? "purchaseorders" : base;
  const active = NAV.find((n) => n.id === navActive) || NAV[0];
  const crumbLabel = base === "invoiceview" ? "Invoice " + param
    : base === "client" ? ((BCCWE.clients.find((c) => c.id === param) || {}).name || "Client")
    : active.label;
  const crumbIcon = base === "invoiceview" ? "invoice" : base === "client" ? "people" : active.icon;

  return (
    <div className="app">
      <div className={"nav-scrim" + (navOpen ? " show" : "")} onClick={() => setNavOpen(false)} />
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="brand">
          <div className="brand-logo">BC<span>CWE</span></div>
          <div className="brand-meta">
            <strong>BCCWE</strong>
            <span>Invoicing System</span>
          </div>
        </div>
        <nav className="nav">
          {GROUPS.map((g) => {
            const ids = g.ids.filter((id) => navAllowed(id));
            if (!ids.length) return null;
            return (
              <div className="nav-group" key={g.title}>
                <span className="nav-group-title">{g.title}</span>
                {ids.map((id) => {
                  const n = NAV.find((x) => x.id === id);
                  return (
                    <button key={id} className={"nav-item" + (route === id ? " on" : "")} onClick={() => go(id)}>
                      <Icon name={n.icon} size={18} />
                      <span>{n.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="tax-pill"><span className="dot" /> BC · GST 5% + PST 7%</div>
          <div className="ver">CAD · Surrey, BC · v1.0</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen((v) => !v)} aria-label="Menu"><Icon name="menu" size={20} /></button>
            <Icon name={crumbIcon} size={16} />
            <span>{crumbLabel}</span>
          </div>
          <div className="topbar-right">
            {showStoreSwitcher && (() => {
              // The switcher wears the active store's colour, so which store you
              // are working in is visible without reading the name.
              const sc = store === "all" ? null : storeColor(store);
              return (
              <div className={"store-switch" + (sc ? " tinted" : "")} title="Filter everything by store"
                style={sc ? { background: sc.soft, color: sc.ink } : undefined}>
                <Icon name="store" size={15} />
                <select value={store} onChange={(e) => changeStore(e.target.value)}>
                  {canAll && <option value="all">All stores</option>}
                  {storeOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              );
            })()}
            <div className="period">Fiscal period · Jun 2026</div>
            <NotificationsBell go={go} />
            <AccountMenu />
          </div>
        </header>

        <main className="content">
          <ScreenErrorBoundary key={route}>
          {/* Gate on the route's governing module (navActive maps detail routes
              like invoiceview→history, client→people, purchase/po/receive→inventory)
              so these pages can't be reached by typing the hash when the role has
              no permission — previously only sidebar-listed routes were gated. */}
          {!navAllowed(navActive) ? (
            <Card><Empty text="You don't have access to this section." /></Card>
          ) : <>
          {base === "dashboard" && <Dashboard go={go} store={store} />}
          {base === "pos" && <POS pushToast={pushToast} go={go} />}
          {base === "neworder" && <ClientShop pushToast={pushToast} go={go} />}
          {base === "invoice" && <InvoiceGenerator key={param || "new"} editNo={param} defaultStore={store !== "all" ? store : ""} onSaved={(no) => go(no ? "invoiceview/" + no : "history")} pushToast={pushToast} />}
          {base === "history" && <InvoiceHistory go={go} pushToast={pushToast} store={store} />}
          {base === "orders" && <Orders go={go} pushToast={pushToast} />}
          {base === "unpaid" && <UnpaidInvoices go={go} store={store} />}
          {base === "invoiceview" && <InvoiceDetail no={param} go={go} pushToast={pushToast} />}
          {base === "client" && <ClientAccount id={param} go={go} pushToast={pushToast} />}
          {base === "people" && <People go={go} pushToast={pushToast} />}
          {base === "inventory" && <Inventory go={go} pushToast={pushToast} />}
          {/* Same screen, opened straight on its Purchase orders tab. */}
          {base === "purchaseorders" && <Inventory key="po" go={go} pushToast={pushToast} initTab="orders" />}
          {base === "purchase" && <PurchasePage go={go} pushToast={pushToast} store={store} />}
          {base === "po" && <OrderDetailPage po={param} go={go} pushToast={pushToast} />}
          {base === "receive" && <ReceiveOrderPage po={param} go={go} pushToast={pushToast} />}
          {base === "sales" && <Sales go={go} pushToast={pushToast} store={store} />}
          {base === "return" && <QuickSale lockKind="Return" store={store} pushToast={pushToast} onRecorded={() => {}} />}
          {base === "exchange" && <QuickSale lockKind="Exchange" store={store} pushToast={pushToast} onRecorded={() => {}} />}
          {base === "expenses" && <Expenses pushToast={pushToast} store={store} />}
          {base === "accounting" && <Accounting store={store} pushToast={pushToast} />}
          {base === "reports" && <Reports store={store} pushToast={pushToast} go={go} />}
          {base === "mail" && <SentMail go={go} pushToast={pushToast} />}
          {base === "logs" && <AuditLog pushToast={pushToast} />}
          {base === "stores" && <Stores pushToast={pushToast} />}
          {base === "settings" && <Settings pushToast={pushToast} />}
          </>}
          </ScreenErrorBoundary>
        </main>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// Shown when login succeeded but /api/state failed (DB outage, server error).
// Booting the app would show the seed/demo books as if they were real data —
// a hard stop with a retry is the only honest option.
function LoadFailedScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f4f1", fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,.12)", padding: "34px 36px", maxWidth: 440, textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "#fbe7e6", color: "#b3322d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Icon name="alert" size={26} />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 19, color: "#1c2530" }}>Can't load your data</h2>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: "#5a6877", lineHeight: 1.55 }}>
          You're logged in, but the server couldn't return your business data
          (error {String(window.__loadFailed)}). Nothing has been changed or lost —
          this is usually a brief database hiccup on the host.
        </p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
      </div>
    </div>
  );
}

// After signing in, ask which store to work in. The chosen store becomes the
// active filter, so new invoices/sales/returns are filed under it — and it can
// still be switched anytime from the top bar. Only shown when there is a real
// choice to make (two or more stores available).
function StorePicker({ onPick }) {
  const stores = window.STORES ? window.STORES.allowed() : [];
  const canAll = window.STORES ? window.STORES.canSeeAll() : false;
  const who = (window.__session && (window.__session.name || window.__session.userId)) || "";
  const taxLabel = (t) => t === "both" ? "GST 5% + PST 7%" : t === "gst" ? "GST 5%" : t === "pst" ? "PST 7%" : "Tax-free";
  const card = { width: 460, maxWidth: "94vw", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "var(--sh-lg)", padding: "26px 26px 22px" };
  const opt = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "13px 15px", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, cursor: "pointer", transition: "border-color .14s, background .14s", textAlign: "left" };
  const dot = { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0 };
  const hoverIn = (e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; };
  const hoverOut = (e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "var(--surface)"; };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--canvas)", padding: 24 }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center" }}><Icon name="store" size={21} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, color: "var(--ink)" }}>Choose a store</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>{who ? "Welcome, " + who : "Which store are you working in?"}</p>
          </div>
        </div>
        <p style={{ margin: "12px 0 16px", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
          New invoices, sales and returns will be filed under the store you pick. You can switch stores anytime from the top bar.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stores.map((s) => {
            const sc = storeColor(s.id);
            return (
            <button key={s.id} style={sc ? Object.assign({}, opt, { borderColor: sc.line }) : opt}
              onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => onPick(s.id)}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={sc ? Object.assign({}, dot, { background: sc.soft, color: sc.ink }) : dot}><Icon name="store" size={19} /></span>
                <span>
                  <strong style={{ display: "block", fontSize: 15, color: "var(--ink)" }}>{s.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{taxLabel(s.taxDefault)} · invoices {(s.invPrefix || "INV")}-…</span>
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
            );
          })}
          {canAll && stores.length > 1 && (
            <button style={Object.assign({}, opt, { borderStyle: "dashed" })} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => onPick("all")}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={Object.assign({}, dot, { background: "var(--slate-soft)", color: "var(--slate)" })}><Icon name="box" size={19} /></span>
                <span>
                  <strong style={{ display: "block", fontSize: 15, color: "var(--ink)" }}>All stores</strong>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Combined view · new invoices default to {stores[0] ? stores[0].name : "the first store"}</span>
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Gate the whole app behind login. data.js has already validated any saved
// token and set window.__authed / window.__session during boot.
function Root() {
  const [storePicked, setStorePicked] = useState(() => {
    try { return sessionStorage.getItem("bccwe_store") || ""; } catch (e) { return ""; }
  });
  if (!window.__authed) return <LoginScreen />;
  if (window.__session && window.__session.mustChange) return <ForceChange />;
  if (window.__loadFailed) return <LoadFailedScreen />;
  // Ask which store to work in, but only when there's a genuine choice (2+ stores)
  // and one hasn't been picked yet this session.
  const opts = window.STORES ? window.STORES.allowed() : [];
  if (!storePicked && opts.length >= 2) {
    return <StorePicker onPick={(id) => { try { sessionStorage.setItem("bccwe_store", id); } catch (e) {} setStorePicked(id); }} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
