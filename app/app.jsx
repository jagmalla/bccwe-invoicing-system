/* ============================================================
   BCCWE — App shell, navigation, router, mount
   ============================================================ */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "invoice", label: "Invoice Generator", icon: "invoice" },
  { id: "history", label: "Invoice History", icon: "history" },
  { id: "orders", label: "Client Orders", icon: "order" },
  { id: "people", label: "Clients & Suppliers", icon: "people" },
  { id: "inventory", label: "Inventory", icon: "box" },
  { id: "sales", label: "Sales", icon: "cart" },
  { id: "expenses", label: "Expenses", icon: "receipt" },
  { id: "accounting", label: "Accounting", icon: "ledger" },
  { id: "unpaid", label: "Unpaid Invoices", icon: "alert" },
  { id: "reports", label: "Reports", icon: "report" },
  { id: "mail", label: "Sent Mail", icon: "mail" },
  { id: "logs", label: "Activity Logs", icon: "history" },
  { id: "settings", label: "Settings", icon: "settings" },
];
const GROUPS = [
  { title: "Operate", ids: ["dashboard", "invoice", "history", "orders", "people"] },
  { title: "Trade", ids: ["inventory", "sales", "expenses"] },
  { title: "Finance", ids: ["accounting", "unpaid", "reports"] },
  { title: "Admin", ids: ["mail", "logs", "settings"] },
];

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
  (D.inventory || []).filter((it) => it.stock <= it.alert).forEach((it) => {
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
  const go = (r) => { setRoute(r); location.hash = r; setNavOpen(false); window.scrollTo(0, 0); };
  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const pushToast = (msg) => setToast(msg);

  const [base, param] = route.split("/");
  const navActive = base === "invoiceview" ? "history" : base === "client" ? "people" : base;
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
          {GROUPS.map((g) => (
            <div className="nav-group" key={g.title}>
              <span className="nav-group-title">{g.title}</span>
              {g.ids.map((id) => {
                const n = NAV.find((x) => x.id === id);
                return (
                  <button key={id} className={"nav-item" + (route === id ? " on" : "")} onClick={() => go(id)}>
                    <Icon name={n.icon} size={18} />
                    <span>{n.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
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
            <div className="period">Fiscal period · Jun 2026</div>
            <NotificationsBell go={go} />
            <div className="me">
              <span className="avatar">HG</span>
              <div className="me-meta"><strong>Harman Gill</strong><span>Admin</span></div>
            </div>
          </div>
        </header>

        <main className="content">
          {base === "dashboard" && <Dashboard go={go} />}
          {base === "invoice" && <InvoiceGenerator onSaved={() => go("history")} pushToast={pushToast} />}
          {base === "history" && <InvoiceHistory go={go} pushToast={pushToast} />}
          {base === "orders" && <Orders go={go} pushToast={pushToast} />}
          {base === "unpaid" && <UnpaidInvoices go={go} />}
          {base === "invoiceview" && <InvoiceDetail no={param} go={go} pushToast={pushToast} />}
          {base === "client" && <ClientAccount id={param} go={go} pushToast={pushToast} />}
          {base === "people" && <People go={go} pushToast={pushToast} />}
          {base === "inventory" && <Inventory go={go} pushToast={pushToast} />}
          {base === "sales" && <Sales go={go} pushToast={pushToast} />}
          {base === "expenses" && <Expenses pushToast={pushToast} />}
          {base === "accounting" && <Accounting />}
          {base === "reports" && <Reports />}
          {base === "mail" && <SentMail go={go} pushToast={pushToast} />}
          {base === "logs" && <AuditLog pushToast={pushToast} />}
          {base === "settings" && <Settings pushToast={pushToast} />}
        </main>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
