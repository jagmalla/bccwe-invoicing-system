/* ============================================================
   BCCWE — Settings: email, tax & company, users & roles, security
   ============================================================ */

function Settings({ pushToast }) {
  const [tab, setTab] = useState("email");
  return (
    <div>
      <PageHead title="Settings" sub="Company, tax, email and users" />
      <div className="tabs">
        {[["email", "Email (SMTP / POP)"], ["tax", "Tax & company"], ["users", "Users & roles"], ["security", "First-login & security"]].map(([id, l]) => (
          <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === "email" && <EmailSettings pushToast={pushToast} />}
      {tab === "tax" && <TaxSettings pushToast={pushToast} />}
      {tab === "users" && <UsersSettings pushToast={pushToast} />}
      {tab === "security" && <SecuritySettings />}
    </div>
  );
}

/* ---------------- Automatic monthly email to accountant ---------------- */
function ordinal(n) {
  if (n === "last") return "last day";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function nextAcctSend(day) {
  const t = new Date(BCCWE.today + "T00:00:00");
  const lastOf = (y, m) => new Date(y, m + 1, 0).getDate();
  const dayFor = (y, m) => day === "last" ? lastOf(y, m) : Math.min(day, lastOf(y, m));
  let y = t.getFullYear(), m = t.getMonth();
  let cand = new Date(y, m, dayFor(y, m));
  if (cand <= t) { m += 1; if (m > 11) { m = 0; y += 1; } cand = new Date(y, m, dayFor(y, m)); }
  return cand;
}

function AccountantSchedule({ pushToast }) {
  const D = BCCWE;
  const [, force] = useState(0);
  const sched = D.prefs.acctSchedule || null;
  const [mode, setMode] = useState("view"); // 'view' | 'form'
  const [confirmDel, setConfirmDel] = useState(false);
  const [draftDay, setDraftDay] = useState(sched ? sched.day : 1);
  const [draftTime, setDraftTime] = useState(sched ? (sched.time || "09:00") : "09:00");

  const acctName = D.prefs.accountantName || "";
  const acctEmail = D.prefs.accountantEmail || "";
  const hasAcct = !!acctEmail;

  function persist() { if (window.saveBCCWEPrefs) window.saveBCCWEPrefs(); }

  function openNew() { setDraftDay(1); setDraftTime("09:00"); setMode("form"); }
  function openEdit() { setDraftDay(sched.day); setDraftTime(sched.time || "09:00"); setMode("form"); }

  function save() {
    const wasNew = !sched;
    D.prefs.acctSchedule = { day: draftDay, time: draftTime, enabled: sched ? sched.enabled : true };
    persist(); setMode("view"); force((n) => n + 1);
    pushToast && pushToast(wasNew ? "Automatic monthly email scheduled" : "Schedule updated");
  }
  function remove() {
    D.prefs.acctSchedule = null;
    persist(); setConfirmDel(false); setMode("view"); force((n) => n + 1);
    pushToast && pushToast("Automatic email schedule deleted");
  }
  function toggleEnabled() {
    D.prefs.acctSchedule = { ...sched, enabled: !sched.enabled };
    persist(); force((n) => n + 1);
    pushToast && pushToast(sched.enabled ? "Automatic email paused" : "Automatic email resumed");
  }

  const dayOpts = [];
  for (let i = 1; i <= 28; i++) dayOpts.push(i);

  const next = sched ? nextAcctSend(sched.day) : null;
  const nextLabel = next ? next.toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <Card title="Automatic monthly email to accountant"
      sub="Schedule a recurring email of the invoice history to your accountant — sent automatically every month on the date you choose">
      {!hasAcct && (
        <div className="inline-note"><Icon name="alert" size={15} />Set an accountant name and email above before scheduling.</div>
      )}

      {mode === "form" ? (
        <div>
          <div className="meta-grid">
            <Field label="Send on day of month" required hint="Months without this day fall back to the last day">
              <select value={String(draftDay)} onChange={(e) => setDraftDay(e.target.value === "last" ? "last" : +e.target.value)}>
                {dayOpts.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
                <option value="last">Last day of month</option>
              </select>
            </Field>
            <Field label="Send time" hint="Local time the email goes out">
              <input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} />
            </Field>
            <Field label="Recipient">
              <input value={hasAcct ? (acctName ? acctName + " · " + acctEmail : acctEmail) : "No accountant email set"} readOnly className="ro" />
            </Field>
          </div>
          <div className="exp-foot">
            <span className="pos">Next send: {ordinal(draftDay)} of each month at {draftTime}</span>
            <div style={{ display: "flex", gap: 9 }}>
              {sched && <Btn variant="ghost" onClick={() => setMode("view")}>Cancel</Btn>}
              <Btn variant="primary" icon="check" disabled={!hasAcct} onClick={save}>{sched ? "Save changes" : "Schedule email"}</Btn>
            </div>
          </div>
        </div>
      ) : !sched ? (
        <div className="sched-empty">
          <div>
            <strong>No automatic email scheduled</strong>
            <p className="card-sub">Invoice history is only sent when you do it manually.</p>
          </div>
          <Btn variant="primary" icon="history" disabled={!hasAcct} onClick={openNew}>Set up automatic email</Btn>
        </div>
      ) : (
        <div className="sched-row">
          <span className="sched-ico"><Icon name="history" size={18} /></span>
          <div className="sched-body">
            <div className="sched-head">
              <strong>Every month on the {ordinal(sched.day)}</strong>
              <Badge tone={sched.enabled ? "green" : "slate"} dot>{sched.enabled ? "Active" : "Paused"}</Badge>
            </div>
            <p className="card-sub">
              Sends the invoice history to {acctName ? acctName + " · " : ""}{acctEmail || "—"} at {sched.time || "09:00"}.
              {sched.enabled && <> Next send: <strong style={{ color: "var(--ink)" }}>{nextLabel}</strong>.</>}
            </p>
          </div>
          <div className="sched-actions">
            <Btn variant="ghost" size="sm" onClick={toggleEnabled}>{sched.enabled ? "Pause" : "Resume"}</Btn>
            <Btn variant="ghost" size="sm" icon="edit" onClick={openEdit}>Edit</Btn>
            {confirmDel ? (
              <>
                <Btn variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>Keep</Btn>
                <Btn variant="danger" size="sm" icon="trash" onClick={remove}>Confirm delete</Btn>
              </>
            ) : (
              <Btn variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDel(true)}>Delete</Btn>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Email ---------------- */
function WhatsAppCard({ pushToast }) {
  const D = BCCWE;
  if (!D.waConfig) D.waConfig = { enabled: false, token: "", phoneId: "" };
  const wc = D.waConfig;
  const [, bump] = useState(0);
  const rr = () => bump((x) => x + 1);
  const [conn, setConn] = useState(null);
  const set = (k) => (e) => { wc[k] = e.target.value; rr(); };
  function save() { if (window.persist) window.persist("waConfig"); pushToast && pushToast("WhatsApp settings saved"); }
  function test() {
    if (!wc.token || !wc.phoneId) { setConn({ state: "fail", msg: "Enter the access token and phone number ID first." }); return; }
    setConn({ state: "testing" });
    if (window.persist) window.persist("waConfig");
    fetch("/api/test-whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: wc.token, phoneId: wc.phoneId }) })
      .then((r) => r.json())
      .then((r) => { setConn(r.ok ? { state: "ok", msg: r.message } : { state: "fail", msg: r.error || "Connection failed" }); pushToast && pushToast(r.ok ? "WhatsApp connected" : "WhatsApp test failed"); })
      .catch((e) => setConn({ state: "fail", msg: "Could not reach the server: " + (e && e.message) }));
  }
  return (
    <Card title="WhatsApp (automatic sending)" sub="Optional — connect a Meta WhatsApp Business (Cloud API) account to send automatically. Leave disabled to keep the free 'tap to send' link.">
      <label className="email-pick" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={!!wc.enabled} onChange={() => { wc.enabled = !wc.enabled; rr(); if (window.persist) window.persist("waConfig"); }} />
        <span>Enable automatic WhatsApp sending via the API</span>
      </label>
      <div className="meta-grid">
        <Field label="Permanent access token"><input type="password" value={wc.token || ""} onChange={set("token")} placeholder="EAAG…" /></Field>
        <Field label="Phone number ID"><input value={wc.phoneId || ""} onChange={set("phoneId")} placeholder="e.g. 102938475610293" /></Field>
      </div>
      {conn && <div className={"smtp-conn smtp-conn-" + conn.state}>{conn.state === "testing" ? "Testing connection…" : conn.msg}</div>}
      <div className="exp-foot" style={{ alignItems: "flex-start" }}>
        <span className="rail-note" style={{ maxWidth: 420 }}>Get these from Meta → WhatsApp → API Setup (token + Phone number ID). Note: free-form messages only reach customers who messaged you in the last 24h, otherwise Meta requires an approved template.</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" icon="send" onClick={test}>Test connection</Btn>
          <Btn variant="primary" icon="check" onClick={save}>Save</Btn>
        </div>
      </div>
    </Card>
  );
}

function EmailSettings({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [active, setActive] = useState(D.smtpProfiles[0] ? D.smtpProfiles[0].id : null);
  const [acctName, setAcctName] = useState(D.prefs.accountantName || "");
  const [acctEmail, setAcctEmail] = useState(D.prefs.accountantEmail || "");
  const [invEmail, setInvEmail] = useState(D.prefs.defaultInvoiceEmail || "");
  const [backupEmail, setBackupEmail] = useState(D.prefs.backupEmail || "");
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // working draft of the selected profile (edit form)
  const [draft, setDraft] = useState(null);
  // connection test state, keyed by profile id: { state:'idle'|'testing'|'ok'|'fail', msg }
  const [conn, setConn] = useState({});

  const p = D.smtpProfiles.find((x) => x.id === active);
  useEffect(() => { setDraft(p ? { ...p } : null); setConfirmDel(false); }, [active]);
  const cstate = (conn[active] || { state: "idle" });
  const dirty = p && draft && JSON.stringify({ ...p }) !== JSON.stringify(draft);

  function setField(k, v) { setDraft((d) => ({ ...d, [k]: v })); setConn((c) => ({ ...c, [active]: { state: "idle" } })); }

  function saveRecipient() {
    D.prefs.accountantName = acctName.trim();
    D.prefs.accountantEmail = acctEmail.trim();
    D.prefs.defaultInvoiceEmail = invEmail.trim();
    D.prefs.backupEmail = backupEmail.trim();
    D.prefs.ccEmail = backupEmail.trim(); // keep legacy field in sync
    if (window.saveBCCWEPrefs) window.saveBCCWEPrefs();
    setSaved(true); setTimeout(() => setSaved(false), 1800);
    pushToast && pushToast("Email recipients saved");
  }

  function addProfile() {
    const id = "sp" + Date.now().toString(36);
    D.smtpProfiles.push({ id, name: "New profile", from: "", fromName: "BCCWE", host: "", port: 587, enc: "TLS", user: "", replyTo: "", isDefault: D.smtpProfiles.length === 0 });
    if (window.saveBCCWESmtp) window.saveBCCWESmtp();
    setActive(id); bump();
    pushToast && pushToast("Sender profile added — enter its SMTP details");
  }

  function saveProfile() {
    const i = D.smtpProfiles.findIndex((x) => x.id === active);
    if (i < 0) return;
    D.smtpProfiles[i] = { ...draft, name: (draft.name || "").trim() || "Profile", port: +draft.port || 587 };
    if (window.saveBCCWESmtp) window.saveBCCWESmtp();
    bump();
    pushToast && pushToast("SMTP profile saved — " + D.smtpProfiles[i].fromName);
  }

  function deleteProfile() {
    if (D.smtpProfiles.length <= 1) { pushToast && pushToast("Keep at least one sender profile"); setConfirmDel(false); return; }
    const wasDefault = p.isDefault;
    const i = D.smtpProfiles.findIndex((x) => x.id === active);
    D.smtpProfiles.splice(i, 1);
    if (wasDefault && D.smtpProfiles[0]) D.smtpProfiles[0].isDefault = true;
    if (window.saveBCCWESmtp) window.saveBCCWESmtp();
    setActive(D.smtpProfiles[0].id);
    pushToast && pushToast("Sender profile deleted — " + p.fromName);
    bump();
  }

  function makeDefault() {
    D.smtpProfiles.forEach((x) => { x.isDefault = x.id === active; });
    if (window.saveBCCWESmtp) window.saveBCCWESmtp();
    bump();
    pushToast && pushToast(p.fromName + " is now the default sender");
  }

  function testConnection() {
    if (!draft.host || !draft.user) {
      setConn((c) => ({ ...c, [active]: { state: "fail", msg: "Enter the SMTP host and username first." } }));
      pushToast && pushToast("Enter host and username first");
      return;
    }
    setConn((c) => ({ ...c, [active]: { state: "testing" } }));
    // Really connect + authenticate against the SMTP server on the backend.
    fetch("/api/test-smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: draft.host, port: draft.port, enc: draft.enc,
        user: draft.user, password: draft.password,
      }),
    })
      .then((r) => r.json())
      .then((r) => {
        setConn((c) => ({ ...c, [active]: r.ok
          ? { state: "ok", msg: "Connected & authenticated · " + draft.host + " on port " + draft.port }
          : { state: "fail", msg: "Could not connect — " + (r.error || "check host, port, username and password") } }));
        pushToast && pushToast(r.ok ? "SMTP connection successful — " + draft.host : "SMTP connection failed — check your details");
      })
      .catch((e) => {
        setConn((c) => ({ ...c, [active]: { state: "fail", msg: "Could not reach the server: " + (e && e.message) } }));
        pushToast && pushToast("SMTP test failed — server unreachable");
      });
  }

  function sendTest() {
    const ok = draft.host && draft.user;
    if (!ok) { pushToast && pushToast("Enter host and username first"); return; }
    window.sendEmail({ kind: "test", subject: "BCCWE SMTP test — " + draft.fromName, docNo: "", clientId: "", profileId: active, to: [draft.user || draft.from], cc: [], attachments: [] },
      (status) => pushToast && pushToast("Test email " + status.toLowerCase() + " — see Sent Mail"));
    pushToast && pushToast("Sending test email to " + (draft.user || draft.from) + "…");
  }

  const connBadge = cstate.state === "testing" ? <Badge tone="amber" dot>Testing…</Badge>
    : cstate.state === "ok" ? <Badge tone="green" dot>Connected</Badge>
    : cstate.state === "fail" ? <Badge tone="red" dot>Connection failed</Badge>
    : <Badge tone="slate" dot>Not tested</Badge>;

  return (
    <div>
      <WhatsAppCard pushToast={pushToast} />
      <Card title="Email recipients" sub="Who gets copies of what — set once, applied to every email the system sends">
        <div className="rcpt-row">
          <div className="rcpt-head">
            <span className="rcpt-ico"><Icon name="mail" size={17} /></span>
            <div>
              <strong>System default backup email</strong>
              <p className="rcpt-desc">Always CC'd on <em>every</em> outgoing email — invoice, statement, receipt, test, anything. A permanent copy of all mail goes here for your records, no matter who the email is sent to.</p>
            </div>
          </div>
          <Field label="Backup email (copy of every email)" hint="This address is automatically copied on all mail sent by the system">
            <input type="email" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} placeholder="records@bccwe.ca" />
          </Field>
        </div>

        <div className="rcpt-row">
          <div className="rcpt-head">
            <span className="rcpt-ico"><Icon name="receipt" size={17} /></span>
            <div>
              <strong>Accountant</strong>
              <p className="rcpt-desc">Used only when you send statements to your accountant for tax filing — monthly, yearly or custom-date statements. This is <em>not</em> a system CC; the accountant is only emailed when you (or the monthly schedule below) send a statement.</p>
            </div>
          </div>
          <div className="meta-grid">
            <Field label="Accountant name"><input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="e.g. Dana Mehta" /></Field>
            <Field label="Accountant email" hint="Where statements go for tax filing"><input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} placeholder="accountant@firm.ca" /></Field>
          </div>
        </div>

        <div className="rcpt-row">
          <div className="rcpt-head">
            <span className="rcpt-ico"><Icon name="invoice" size={17} /></span>
            <div>
              <strong>Default invoice recipient</strong>
              <p className="rcpt-desc">The address new invoices are pre-filled to send to, so you don't retype it each time.</p>
            </div>
          </div>
          <Field label="Default invoice recipient" hint="Pre-selected on the email-invoice screen">
            <input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="accounts@bccwe.ca" />
          </Field>
        </div>

        <div className="exp-foot">
          <span className="pos">{saved ? "Saved ✓" : ""}</span>
          <Btn variant="primary" icon="check" onClick={saveRecipient}>Save recipients</Btn>
        </div>
      </Card>

      <AccountantSchedule pushToast={pushToast} />

      <div className="set-grid">
        <Card title="Sender profiles" sub="SMTP accounts used to send (sales@, accounts@). Click to view & edit." pad={false}>
          <ul className="profile-list">
            {D.smtpProfiles.map((sp) => (
              <li key={sp.id} className={active === sp.id ? "on" : ""} onClick={() => setActive(sp.id)}>
                <div><strong>{sp.fromName || "Untitled"}</strong><span>{sp.from || "no address yet"}</span></div>
                {sp.isDefault && <Badge tone="blue">default</Badge>}
              </li>
            ))}
            <li className="add" onClick={addProfile}><Icon name="plus" size={15} /> Add sender profile</li>
          </ul>
        </Card>
        {draft ? (
        <Card title={"SMTP — " + (draft.name || "Profile")} sub="Credentials are stored encrypted, never hardcoded"
          actions={connBadge}>
          <div className="meta-grid">
            <Field label="Profile name" hint="Internal label, e.g. Sales"><input value={draft.name || ""} onChange={(e) => setField("name", e.target.value)} /></Field>
            <Field label="SMTP host"><input value={draft.host || ""} placeholder="mail.yourdomain.ca" onChange={(e) => setField("host", e.target.value)} /></Field>
            <Field label="Port"><input value={draft.port} placeholder="465 / 587" onChange={(e) => setField("port", e.target.value)} /></Field>
            <Field label="Encryption"><select value={draft.enc} onChange={(e) => setField("enc", e.target.value)}><option>SSL</option><option>TLS</option><option>None</option></select></Field>
            <Field label="Username"><input value={draft.user || ""} onChange={(e) => setField("user", e.target.value)} /></Field>
            <Field label="Password"><input type="password" value={draft.password || ""} placeholder="••••••••••" onChange={(e) => setField("password", e.target.value)} /></Field>
            <Field label="From name"><input value={draft.fromName || ""} onChange={(e) => setField("fromName", e.target.value)} /></Field>
            <Field label="From email"><input value={draft.from || ""} onChange={(e) => setField("from", e.target.value)} /></Field>
            <Field label="Reply-to"><input value={draft.replyTo || ""} placeholder={draft.from} onChange={(e) => setField("replyTo", e.target.value)} /></Field>
          </div>

          <div className={"smtp-conn smtp-conn-" + cstate.state}>
            <Icon name={cstate.state === "ok" ? "check" : cstate.state === "fail" ? "alert" : cstate.state === "testing" ? "history" : "lock"} size={15} />
            <span>{cstate.state === "ok" ? cstate.msg
              : cstate.state === "fail" ? cstate.msg
              : cstate.state === "testing" ? "Connecting to " + (draft.host || "host") + " on port " + draft.port + "…"
              : "Run a connection test to confirm these credentials reach the SMTP server."}</span>
            <Btn variant="ghost" size="sm" icon="send" onClick={testConnection} disabled={cstate.state === "testing"}>{cstate.state === "testing" ? "Testing…" : "Test connection"}</Btn>
          </div>

          <div className="exp-foot smtp-foot">
            <div className="smtp-foot-l">
              {!p.isDefault && <Btn variant="ghost" size="sm" icon="check" onClick={makeDefault}>Set as default</Btn>}
              {confirmDel
                ? <span className="del-confirm"><span>Delete this profile?</span><Btn variant="danger" size="sm" icon="trash" onClick={deleteProfile}>Confirm</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>Cancel</Btn></span>
                : <Btn variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDel(true)}>Delete</Btn>}
            </div>
            <div className="smtp-foot-r">
              <Btn variant="ghost" icon="send" onClick={sendTest}>Send test email</Btn>
              <Btn variant="primary" icon="check" onClick={saveProfile} disabled={!dirty}>{dirty ? "Save settings" : "Saved"}</Btn>
            </div>
          </div>
        </Card>
        ) : <Card title="Sender profiles"><Empty icon="mail" text="Add a sender profile to send email" /></Card>}
      </div>
    </div>
  );
}

/* ---------------- Company information (with show-on-invoice toggles) ---------------- */
function CompanyInfoCard({ pushToast }) {
  const D = BCCWE;
  const c = D.company;
  if (!c.show) c.show = { logo: true, tagline: true, address: true, phone: true, email: true, web: true, gst: true, pst: true };
  const [, bump] = useState(0);
  const rerender = () => bump((x) => x + 1);
  const fileRef = useRef(null);
  const set = (k) => (e) => { c[k] = e.target.value; rerender(); };
  const toggle = (k) => () => { c.show[k] = !c.show[k]; rerender(); };
  function pickLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    window.compressImage(file, 400, 0.85).then(function (res) {
      c.logo = res.dataUrl; rerender();
      if (window.persist) window.persist("company");
      pushToast && pushToast("Logo updated");
    }).catch(function () { pushToast && pushToast("Could not read that image"); });
  }
  function save() { if (window.persist) window.persist("company"); pushToast && pushToast("Company details saved"); }

  const ShowChk = ({ k }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5a6877", whiteSpace: "nowrap", cursor: "pointer" }}>
      <input type="checkbox" checked={!!c.show[k]} onChange={toggle(k)} /> Show on invoice
    </label>
  );
  const RowWrap = (props) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
      <div style={{ flex: 1 }}>{props.children}</div>
      {props.showKey && <ShowChk k={props.showKey} />}
    </div>
  );

  return (
    <Card title="Company information" sub="Shown on invoices, statements and PDFs. Toggle which details appear on invoices.">
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, border: "1px solid #e6eaf0", background: "#fafbfd", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {c.logo ? <img src={c.logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%" }} /> : <Icon name="image" size={22} />}
        </div>
        <div>
          <Btn variant="ghost" size="sm" icon="download" onClick={() => fileRef.current && fileRef.current.click()}>Upload logo</Btn>
          {c.logo && <Btn variant="ghost" size="sm" icon="trash" onClick={() => { c.logo = ""; rerender(); if (window.persist) window.persist("company"); }}>Remove</Btn>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickLogo} />
          <div style={{ marginTop: 6 }}><ShowChk k="logo" /></div>
        </div>
      </div>

      <RowWrap><Field label="Business name"><input value={c.name || ""} onChange={set("name")} /></Field></RowWrap>
      <RowWrap showKey="tagline"><Field label="Tagline"><input value={c.tagline || ""} onChange={set("tagline")} /></Field></RowWrap>
      <RowWrap showKey="address"><Field label="Address line 1"><input value={c.addr1 || ""} onChange={set("addr1")} /></Field></RowWrap>
      <RowWrap showKey="address"><Field label="Address line 2"><input value={c.addr2 || ""} onChange={set("addr2")} /></Field></RowWrap>
      <RowWrap showKey="phone"><Field label="Phone"><input value={c.phone || ""} onChange={set("phone")} /></Field></RowWrap>
      <RowWrap showKey="email"><Field label="Email"><input value={c.email || ""} onChange={set("email")} /></Field></RowWrap>
      <RowWrap showKey="web"><Field label="Website"><input value={c.web || ""} onChange={set("web")} /></Field></RowWrap>
      <RowWrap showKey="gst"><Field label="GST number"><input value={c.gst || ""} onChange={set("gst")} /></Field></RowWrap>
      <RowWrap showKey="pst"><Field label="PST number"><input value={c.pst || ""} onChange={set("pst")} /></Field></RowWrap>

      <div className="exp-foot"><span /><Btn variant="primary" icon="check" onClick={save}>Save company details</Btn></div>
    </Card>
  );
}

/* ---------------- Tax & company ---------------- */
function TaxSettings({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [modal, setModal] = useState(null); // { mode:'add'|'edit', id? }
  const SYSTEM = ["none", "gst", "pst", "both"];

  function saveType(data, id) {
    if (id) {
      D.TAX.modes[id] = { ...D.TAX.modes[id], ...data, id };
      pushToast && pushToast("Tax type updated — " + data.label);
    } else {
      const newId = "tax_" + Date.now().toString(36);
      D.TAX.modes[newId] = { ...data, id: newId };
      D.TAX.order.push(newId);
      pushToast && pushToast("Tax type created — " + data.label);
    }
    if (window.saveBCCWETax) window.saveBCCWETax();
    bump(); setModal(null);
  }
  function delType(id) {
    delete D.TAX.modes[id];
    D.TAX.order = D.TAX.order.filter((k) => k !== id);
    if (window.saveBCCWETax) window.saveBCCWETax();
    pushToast && pushToast("Tax type removed");
    bump();
  }

  return (
    <div className="set-grid">
      <CompanyInfoCard pushToast={pushToast} />

      <Card title="Tax types" sub="Combine two taxes under one name — each is charged together but posts to its own agency account" pad={false}
        actions={<Btn variant="primary" size="sm" icon="plus" onClick={() => setModal({ mode: "add" })}>New tax type</Btn>}>
        <table className="data-table">
          <thead><tr><th>Tax type</th><th>Components &amp; agencies</th><th className="r">Combined</th><th /></tr></thead>
          <tbody>
            {D.TAX.order.map((k) => {
              const m = D.TAX.modes[k]; if (!m) return null;
              const sys = SYSTEM.indexOf(k) >= 0;
              const comps = taxComponents(m);
              return (
                <tr key={k}>
                  <td className="strong">{m.label} {sys && <em className="cat-tag">system</em>}{m.hint && <span className="tax-hint">{m.hint}</span>}</td>
                  <td>
                    {comps.length ? (
                      <ul className="tax-comp-list">
                        {comps.map((c, i) => (
                          <li key={i}>
                            <span className="tcl-rate mono">{Math.round(c.rate * 1000) / 10}%</span>
                            <span className="tcl-name">{c.name}</span>
                            <span className="tcl-agency muted">{c.agency || "—"}</span>
                            <span className="tcl-acct muted mono">→ {c.acct} {c.acctName}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="muted">No tax charged</span>}
                  </td>
                  <td className="r mono strong">{Math.round(taxRateOf(m) * 1000) / 10}%</td>
                  <td className="row-acts">
                    <button className="icon-btn" title="Edit" onClick={() => setModal({ mode: "edit", id: k })}><Icon name="edit" size={15} /></button>
                    <button className="icon-btn danger" title={sys ? "System type — cannot delete" : "Delete"} disabled={sys} onClick={() => delType(k)}><Icon name="trash" size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {modal && <TaxTypeModal mode={modal.mode} m={modal.id ? D.TAX.modes[modal.id] : null}
        onSave={(data) => saveType(data, modal.id)} onClose={() => setModal(null)} />}
    </div>
  );
}

function nextLiabilityCode() {
  const used = new Set((BCCWE.accounts || []).map((a) => String(a.code)));
  let n = 2120;
  while (used.has(String(n))) n += 10;
  return String(n);
}

function TaxComponentFields({ c, set, accents }) {
  const liab = (BCCWE.accounts || []).filter((a) => a.type === "Liability");
  return (
    <div className="taxcomp">
      <div className="meta-grid">
        <Field label="Tax name" required hint="e.g. GST, PST, City Tax"><input value={c.name} placeholder="Tax name" onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Rate"><div className="input-suffix"><input type="number" min="0" step="0.1" value={c.rate} onChange={(e) => set({ rate: e.target.value })} /><span>%</span></div></Field>
        <Field label="Collecting agency" hint="Who you remit this to"><input value={c.agency} placeholder="e.g. CRA, BC Min. of Finance" onChange={(e) => set({ agency: e.target.value })} /></Field>
      </div>
      <Field label="Posts to ledger account" hint="Each agency tracked in its own payable account">
        <select value={c.acct} onChange={(e) => {
          if (e.target.value === "__new") {
            const nm = prompt("New tax-payable account name (e.g. City Tax Payable):");
            if (nm && nm.trim()) {
              const code = nextLiabilityCode();
              BCCWE.accounts.push({ code, name: nm.trim(), type: "Liability", balance: 0 });
              set({ acct: code, acctName: nm.trim() });
            }
          } else {
            const a = liab.find((x) => String(x.code) === e.target.value);
            set({ acct: e.target.value, acctName: a ? a.name : "" });
          }
        }}>
          {liab.map((a) => <option key={a.code} value={String(a.code)}>{a.code} · {a.name}</option>)}
          <option value="__new">＋ New tax agency account…</option>
        </select>
      </Field>
    </div>
  );
}

function TaxTypeModal({ mode, m, onSave, onClose }) {
  const existing = m ? taxComponents(m) : [];
  const initA = existing[0] || { bucket: "gst", name: "GST", rate: 0.05, agency: "CRA — Federal (GST/HST)", acct: "2100", acctName: "GST Payable" };
  const initB = existing[1] || { bucket: "pst", name: "PST", rate: 0.07, agency: "BC Ministry of Finance (PST)", acct: "2110", acctName: "PST Payable" };
  const [label, setLabel] = useState(m ? m.label : "");
  const [hint, setHint] = useState(m ? m.hint || "" : "");
  const [compA, setCompA] = useState({ ...initA, rate: String(+(initA.rate * 100).toFixed(3)) });
  const [hasB, setHasB] = useState(existing.length > 1 || !m);
  const [compB, setCompB] = useState({ ...initB, rate: String(+(initB.rate * 100).toFixed(3)) });

  const rA = parseFloat(compA.rate) || 0;
  const rB = hasB ? (parseFloat(compB.rate) || 0) : 0;
  const valid = label.trim().length > 0 && compA.name.trim() && rA >= 0 && (!hasB || (compB.name.trim() && rB >= 0));

  function submit() {
    if (!valid) return;
    const comps = [{ bucket: "gst", name: compA.name.trim(), rate: +(rA / 100).toFixed(5), agency: compA.agency.trim(), acct: compA.acct, acctName: compA.acctName }];
    if (hasB) comps.push({ bucket: "pst", name: compB.name.trim(), rate: +(rB / 100).toFixed(5), agency: compB.agency.trim(), acct: compB.acct, acctName: compB.acctName });
    onSave({ label: label.trim(), hint: hint.trim(), gst: +(rA / 100).toFixed(5), pst: +(rB / 100).toFixed(5), comps });
  }

  return (
    <Modal title={mode === "edit" ? "Edit tax type" : "New combined tax type"} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>{mode === "edit" ? "Save changes" : "Create tax type"}</Btn>
      </>}>
      <Field label="Combined tax name" required hint="The name staff pick on an invoice — e.g. GST + PST, GST + City Tax">
        <input value={label} placeholder="e.g. GST + PST" onChange={(e) => setLabel(e.target.value)} />
      </Field>

      <div className="taxcomp-head"><span className="taxcomp-tag">Tax 1</span> Calculated and remitted on its own</div>
      <TaxComponentFields c={compA} set={(p) => setCompA((s) => ({ ...s, ...p }))} />

      {hasB ? (
        <>
          <div className="taxcomp-head">
            <span className="taxcomp-tag">Tax 2</span> A second tax, to a different agency
            <button className="link taxcomp-rm" onClick={() => setHasB(false)}>Remove</button>
          </div>
          <TaxComponentFields c={compB} set={(p) => setCompB((s) => ({ ...s, ...p }))} />
        </>
      ) : (
        <button className="taxcomp-add" onClick={() => setHasB(true)}><Icon name="plus" size={14} /> Add a second tax (different agency)</button>
      )}

      <div className="taxcomp-readout">
        <span>Combined rate charged to customer</span>
        <strong>{(Math.round((rA + rB) * 10) / 10)}%</strong>
      </div>
      <Field label="Notes / when to use" hint="Optional"><input value={hint} placeholder="e.g. Standard BC retail" onChange={(e) => setHint(e.target.value)} /></Field>
      <div className="inline-note"><Icon name="check" size={15} />Both taxes are charged together on the invoice but each posts to its own payable account, so you remit to each agency separately.</div>
    </Modal>
  );
}

/* ---------------- Users & roles ---------------- */
function UsersSettings({ pushToast }) {
  const D = BCCWE;
  const [seg, setSeg] = useState("users");
  return (
    <div>
      <div className="subtabs">
        <button className={"subtab" + (seg === "users" ? " on" : "")} onClick={() => setSeg("users")}>Users <em>{D.users.length}</em></button>
        <button className={"subtab" + (seg === "roles" ? " on" : "")} onClick={() => setSeg("roles")}>Roles &amp; permissions <em>{D.roles.length}</em></button>
      </div>
      {seg === "users" ? <UsersPanel pushToast={pushToast} /> : <RolesPanel pushToast={pushToast} />}
    </div>
  );
}

function roleById(id) { return BCCWE.roles.find((r) => r.id === id); }
function usersInRole(id) { return BCCWE.users.filter((u) => u.role === id).length; }

// Credential visibility by rank: a user can only view/manage accounts ranked
// below their own; the admin/owner login sees everyone. (#7)
var ROLE_RANK = { r_admin: 100, r_owner: 95, r_manager: 70, r_super: 50, r_sales: 30, r_client: 10 };
function bccweIsAdmin() { var s = window.__session || {}; if (s.roleId === "r_admin") return true; if (s.isOwner && !s.roleId) return true; return false; }
function bccweRank() { var s = window.__session || {}; if (s.roleId != null && ROLE_RANK[s.roleId] != null) return ROLE_RANK[s.roleId]; if (s.isOwner) return 1000; return 0; }
function bccweCanSeeCred(u) { if (bccweIsAdmin()) return true; return bccweRank() > (ROLE_RANK[u && u.role] != null ? ROLE_RANK[u.role] : 0); }
function initialsOf(name) { return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"; }

function UsersPanel({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [modal, setModal] = useState(null); // { type:'add'|'edit'|'view'|'delete', user? }
  const roleTone = (id) => { const r = roleById(id); return r ? r.tone : "slate"; };

  function syncSalesperson(u) {
    // Clients are customers, not staff — keep them out of the salesperson list.
    const isClient = u.role === "r_client" || ((roleById(u.role) || {}).name === "Client");
    const idx = D.salespeople.findIndex((s) => s.id === u.id);
    if (isClient) { if (idx >= 0) D.salespeople.splice(idx, 1); return; }
    const roleName = (roleById(u.role) || {}).name || "";
    if (idx >= 0) { D.salespeople[idx].name = u.name; D.salespeople[idx].initials = u.initials; D.salespeople[idx].role = roleName; }
    else D.salespeople.push({ id: u.id, name: u.name, initials: u.initials, role: roleName });
  }
  function saveUser(data, original) {
    if (original) {
      Object.assign(original, data);
      syncSalesperson(original);
      pushToast && pushToast("Updated user — " + original.name);
    } else {
      const u = { id: "u_" + Date.now().toString(36), last: "Never", active: true, ...data };
      D.users.push(u);
      syncSalesperson(u);
      pushToast && pushToast("User created — " + u.name);
    }
    if (window.saveBCCWERbac) window.saveBCCWERbac();
    bump(); setModal(null);
  }
  function deleteUser(u) {
    D.users = D.users.filter((x) => x !== u);
    const si = D.salespeople.findIndex((s) => s.id === u.id);
    if (si >= 0) D.salespeople.splice(si, 1);
    if (window.saveBCCWERbac) window.saveBCCWERbac();
    pushToast && pushToast("Deleted user — " + u.name);
    bump(); setModal(null);
  }
  function toggleActive(u) {
    u.active = !u.active;
    if (window.saveBCCWERbac) window.saveBCCWERbac();
    pushToast && pushToast(u.name + (u.active ? " activated" : " deactivated"));
    bump();
  }

  return (
    <Card title="Users" sub="Admin can add, view, edit, deactivate or delete any user — including their password" pad={false}
      actions={<Btn variant="primary" size="sm" icon="plus" onClick={() => setModal({ type: "add" })}>Add user</Btn>}>
      <table className="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Email</th><th>Status</th><th>Last active</th><th /></tr></thead>
        <tbody>
          {D.users.filter((u) => bccweIsAdmin() || u.id === (window.sessionUid && window.sessionUid()) || (ROLE_RANK[u.role] != null ? ROLE_RANK[u.role] : 0) < bccweRank()).map((u) => (
            <tr key={u.id}>
              <td><div className="user-cell"><span className="avatar sm">{u.initials}</span><strong>{u.name}</strong></div></td>
              <td><Badge tone={roleTone(u.role)}>{(roleById(u.role) || {}).name || "—"}</Badge></td>
              <td className="muted">{u.email}</td>
              <td>{u.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}</td>
              <td className="muted">{u.last}</td>
              <td className="row-acts">
                {bccweCanSeeCred(u) ? (
                  <>
                    <button className="icon-btn" title="View" onClick={() => setModal({ type: "view", user: u })}><Icon name="eye" size={15} /></button>
                    <button className="icon-btn" title="Edit" onClick={() => setModal({ type: "edit", user: u })}><Icon name="edit" size={15} /></button>
                    {bccweIsAdmin() && !u.isOwner && <button className="icon-btn danger" title="Delete" onClick={() => setModal({ type: "delete", user: u })}><Icon name="trash" size={15} /></button>}
                  </>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }} title="You don't have permission to view this account">🔒</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(modal && modal.type === "add") && <UserFormModal onSave={(d) => saveUser(d, null)} onClose={() => setModal(null)} />}
      {(modal && modal.type === "edit") && <UserFormModal user={modal.user} onSave={(d) => saveUser(d, modal.user)} onClose={() => setModal(null)} />}
      {(modal && modal.type === "view") && <UserViewModal user={modal.user} onClose={() => setModal(null)} onEdit={() => setModal({ type: "edit", user: modal.user })} onToggle={() => toggleActive(modal.user)} />}
      {(modal && modal.type === "delete") && <UserDeleteModal user={modal.user} onConfirm={() => deleteUser(modal.user)} onClose={() => setModal(null)} />}
    </Card>
  );
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = ""; for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + "@" + (new Date().getFullYear());
}

function UserFormModal({ user, onSave, onClose }) {
  const D = BCCWE;
  const editing = !!user;
  const [name, setName] = useState(user ? user.name : "");
  const [email, setEmail] = useState(user ? user.email : "");
  const [role, setRole] = useState(user ? user.role : (D.roles[0] && D.roles[0].id));
  const [password, setPassword] = useState(user ? user.password : genPassword());
  const [active, setActive] = useState(user ? user.active : true);
  const [companies, setCompanies] = useState(user && Array.isArray(user.companies) ? user.companies : []);
  const [clientId, setClientId] = useState(user ? (user.clientId || "") : "");
  const [show, setShow] = useState(false);
  const stores = (D.companies || []).filter((c) => c.active !== false);
  const isAdminRole = role === "r_admin" || role === "r_owner";
  const isClientRole = role === "r_client" || ((roleById(role) || {}).name === "Client");
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const valid = name.trim() && emailRe.test(email) && password.trim().length >= 6;
  function toggleCompany(id) {
    setCompanies((cs) => cs.indexOf(id) >= 0 ? cs.filter((x) => x !== id) : cs.concat([id]));
  }

  function submit() {
    if (!valid) return;
    onSave({ name: name.trim(), email: email.trim(), role, password: password.trim(), active, companies, clientId: isClientRole ? clientId : "", initials: initialsOf(name) });
  }

  return (
    <Modal title={editing ? "Edit user — " + user.name : "Add user"} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Create user"}</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Full name" required><input value={name} placeholder="First Last" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" required><input type="email" value={email} placeholder="name@bccwe.ca" onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role" required>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {D.roles.filter((r) => bccweIsAdmin() || (ROLE_RANK[r.id] != null ? ROLE_RANK[r.id] : 0) <= bccweRank()).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {isClientRole && (
          <Field label="Linked client" hint="Which client this login orders as — drives their pricing & orders">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— select client —</option>
              {(D.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="Password" required hint="Minimum 6 characters — admin can set or reset it">
        <div className="pw-field">
          <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="pw-btn" type="button" onClick={() => setShow((v) => !v)} title={show ? "Hide" : "Show"}><Icon name="eye" size={15} /></button>
          <button className="pw-btn" type="button" onClick={() => { setPassword(genPassword()); setShow(true); }} title="Generate new password"><Icon name="settings" size={15} /></button>
        </div>
      </Field>
      <label className="toggle-row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div><strong>Account active</strong><span>Inactive users cannot sign in</span></div>
      </label>
      {stores.length > 1 && (
        <div className="store-access-box">
          <span className="rap-lbl">Store access</span>
          {isAdminRole ? (
            <p className="rail-note">Admins and Owners can see every store and the combined view.</p>
          ) : (
            <>
              <p className="rail-note">Tick the stores this user may access. Leave all unticked to allow every store.</p>
              <div className="store-access-grid">
                {stores.map((c) => (
                  <label key={c.id} className="store-show-chk">
                    <input type="checkbox" checked={companies.indexOf(c.id) >= 0} onChange={() => toggleCompany(c.id)} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <div className="role-access-preview">
        <span className="rap-lbl">Access granted by this role</span>
        <div className="rap-chips">
          {D.modules.filter((m) => { const rr = roleById(role); return rr && moduleGrantCount(rr, m) > 0; }).map((m) => <span key={m.id} className="rap-chip">{m.label}</span>)}
          {D.modules.filter((m) => { const rr = roleById(role); return rr && moduleGrantCount(rr, m) > 0; }).length === 0 && <span className="muted">No modules — set permissions in the Roles tab</span>}
        </div>
      </div>
    </Modal>
  );
}

function UserViewModal({ user, onClose, onEdit, onToggle }) {
  const D = BCCWE;
  const role = roleById(user.role) || {};
  const allowed = D.modules.filter((m) => moduleGrantCount(role, m) > 0);
  const facts = [
    ["Full name", user.name],
    ["Email", user.email],
    ["Role", role.name || "—"],
    ["Status", user.active ? "Active" : "Inactive"],
    ["Password", "•".repeat(Math.min(12, (user.password || "").length))],
    ["Last active", user.last],
  ];
  return (
    <Modal title={user.name} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onToggle}>{user.active ? "Deactivate" : "Activate"}</Btn>
        <Btn variant="primary" icon="edit" onClick={onEdit}>Edit user</Btn>
      </>}>
      <div className="iv-head">
        <div className="user-cell"><span className="avatar">{user.initials}</span><div><h4 className="iv-name">{user.name}</h4><span className="cat-tag">{role.name}</span></div></div>
        {user.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="slate" dot>Inactive</Badge>}
      </div>
      <div className="iv-facts">
        {facts.map(([k, v]) => <div className="iv-fact" key={k}><span>{k}</span><strong className="mono">{v}</strong></div>)}
      </div>
      <h5 className="iv-sec">Modules this user can access ({allowed.length})</h5>
      <div className="rap-chips" style={{ padding: "0 2px" }}>
        {allowed.map((m) => <span key={m.id} className="rap-chip on">{m.label}</span>)}
        {!allowed.length && <Empty icon="lock" text="This role grants no module access" />}
      </div>
    </Modal>
  );
}

function UserDeleteModal({ user, onConfirm, onClose }) {
  return (
    <Modal title="Delete user?" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" icon="trash" onClick={onConfirm}>Delete user</Btn>
      </>}>
      <p className="confirm-lead">Permanently remove <strong>{user.name}</strong> ({user.email})?</p>
      <div className="inline-note"><Icon name="alert" size={15} />The user is removed from sign-in and the salesperson list. Past records keep their name. This cannot be undone.</div>
    </Modal>
  );
}

/* ---- Roles & permissions ---- */
function permOn(role, mid, pid) { return !!(((role.perms || {})[mid] || {})[pid]); }
function moduleGrantCount(role, m) { return m.perms.filter((p) => permOn(role, m.id, p.id)).length; }
function roleGrantTotal(role) { let n = 0; BCCWE.modules.forEach((m) => { n += moduleGrantCount(role, m); }); return n; }
function totalPerms() { let n = 0; BCCWE.modules.forEach((m) => { n += m.perms.length; }); return n; }
function deepClonePerms(p) { const o = {}; Object.keys(p || {}).forEach((k) => { o[k] = { ...p[k] }; }); return o; }

function RolesPanel({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [selId, setSelId] = useState(D.roles[0] && D.roles[0].id);
  const [collapsed, setCollapsed] = useState({});

  const role = D.roles.find((r) => r.id === selId) || D.roles[0];

  function persist() { if (window.saveBCCWERbac) window.saveBCCWERbac(); bump(); }
  // toggle a single permission; radio-group members are mutually exclusive
  function togglePerm(m, p) {
    const cur = (role.perms[m.id] || {});
    const next = { ...cur };
    if (p.radio) {
      const turningOn = !next[p.id];
      m.perms.forEach((q) => { if (q.radio === p.radio) next[q.id] = false; });
      next[p.id] = turningOn;
    } else {
      next[p.id] = !next[p.id];
    }
    role.perms = { ...role.perms, [m.id]: next };
    persist();
  }
  function setModule(m, on) {
    const next = {}; const seen = {};
    m.perms.forEach((p) => {
      if (p.radio) { next[p.id] = on && !seen[p.radio]; if (on) seen[p.radio] = true; }
      else next[p.id] = on;
    });
    role.perms = { ...role.perms, [m.id]: next };
    persist();
  }
  function setRoleAll(on) { role.perms = on ? D.allPerms() : D.blankPerms(); persist(); }
  function rename(r, name) { r.name = name; persist(); }
  function addRole(data) {
    const id = "r_" + Date.now().toString(36);
    D.roles.push({ id, name: data.name, tone: data.tone, system: false, perms: deepClonePerms(data.perms) });
    pushToast && pushToast("Role created — " + data.name);
    setAddOpen(false); setSelId(id); persist();
  }
  function deleteRole(r) {
    D.roles = D.roles.filter((x) => x !== r);
    if (selId === r.id) setSelId(D.roles[0] && D.roles[0].id);
    pushToast && pushToast("Role deleted — " + r.name);
    setDel(null); persist();
  }

  const total = totalPerms();
  const moduleAll = (m) => m.perms.every((p) => p.radio ? true : permOn(role, m.id, p.id)) && m.perms.some((p) => permOn(role, m.id, p.id));

  return (
    <div className="rp2">
      <div className="roles-head">
        <p className="roles-note">Pick a role, then switch individual functions on or off. <b>Select all</b> grants every function in a section. Round options are exclusive (e.g. view <em>all</em> vs <em>own only</em>). Changes apply to every user with that role.</p>
        <Btn variant="primary" size="sm" icon="plus" onClick={() => setAddOpen(true)}>Add role</Btn>
      </div>

      <div className="rp2-roles">
        {D.roles.map((r) => {
          const count = usersInRole(r.id);
          return (
            <button key={r.id} className={"rp2-rolepill" + (r.id === selId ? " on" : "")} onClick={() => setSelId(r.id)}>
              <span className={"role-dot tone-" + r.tone} />
              <span className="rp2-rolename">{r.name}</span>
              <em>{count}</em>
            </button>
          );
        })}
      </div>

      {role && (
        <div className="rp2-editor">
          <div className="rp2-edithead">
            <span className={"role-dot tone-" + role.tone} />
            <input className="role-name-input" value={role.name} onChange={(e) => rename(role, e.target.value)} />
            <span className="rp2-count">{usersInRole(role.id)} user{usersInRole(role.id) === 1 ? "" : "s"} · {roleGrantTotal(role)}/{total} granted</span>
            <div className="rp2-bulk">
              <button onClick={() => setRoleAll(true)}>Select all</button>
              <span>·</span>
              <button onClick={() => setRoleAll(false)}>Clear all</button>
            </div>
            <button className="icon-btn danger" title={usersInRole(role.id) ? "Reassign users before deleting" : (role.system ? "System role" : "Delete role")} disabled={usersInRole(role.id) > 0 || role.system} onClick={() => setDel(role)}><Icon name="trash" size={15} /></button>
          </div>

          <div className="permmods">
            {D.modules.map((m) => {
              const isCol = collapsed[m.id];
              const allOn = moduleAll(m);
              return (
                <section className="permmod" key={m.id}>
                  <header className="permmod-head">
                    <button className="permmod-title" onClick={() => setCollapsed((c) => ({ ...c, [m.id]: !c[m.id] }))}>
                      <Icon name={isCol ? "chevron" : "chevDown"} size={14} />
                      <span>{m.label}</span>
                      {m.info && <em className="permmod-info" title={m.info}>i</em>}
                    </button>
                    <span className="permmod-count">{moduleGrantCount(role, m)}/{m.perms.length}</span>
                    <label className="permmod-all">
                      <input type="checkbox" checked={allOn} onChange={(e) => setModule(m, e.target.checked)} />
                      <span>Select all</span>
                    </label>
                  </header>
                  {!isCol && (
                    <div className="permmod-body">
                      {m.perms.map((p) => {
                        const on = permOn(role, m.id, p.id);
                        return (
                          <label key={p.id} className={"permrow" + (on ? " on" : "") + (p.radio ? " radio" : "")}>
                            <input type={p.radio ? "radio" : "checkbox"} checked={on} onChange={() => togglePerm(m, p)} />
                            <span className="permrow-mark" />
                            <span className="permrow-label">{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {addOpen && <AddRoleModal onSave={addRole} onClose={() => setAddOpen(false)} />}
      {del && <RoleDeleteModal role={del} onConfirm={() => deleteRole(del)} onClose={() => setDel(null)} />}
    </div>
  );
}

function AddRoleModal({ onSave, onClose }) {
  const D = BCCWE;
  const [name, setName] = useState("");
  const [tone, setTone] = useState("slate");
  const [copyFrom, setCopyFrom] = useState("");
  const valid = name.trim().length > 0;
  const tones = [["slate", "Slate"], ["blue", "Blue"], ["green", "Green"], ["amber", "Amber"], ["red", "Red"]];
  function submit() {
    if (!valid) return;
    let perms = D.blankPerms();
    if (copyFrom) { const src = roleById(copyFrom); if (src) perms = JSON.parse(JSON.stringify(src.perms)); }
    onSave({ name: name.trim(), tone, perms });
  }
  return (
    <Modal title="Add role" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Create role</Btn>
      </>}>
      <Field label="Role name" required><input value={name} placeholder="e.g. Front Desk, Manager…" onChange={(e) => setName(e.target.value)} /></Field>
      <div className="meta-grid" style={{ marginTop: 14 }}>
        <Field label="Colour tag">
          <select value={tone} onChange={(e) => setTone(e.target.value)}>{tones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Copy permissions from" hint="Optional starting point">
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Start with no access</option>
            {D.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="inline-note"><Icon name="check" size={15} />Pick the new role above the permission list to switch exactly which functions it can access.</div>
    </Modal>
  );
}

function RoleDeleteModal({ role, onConfirm, onClose }) {
  return (
    <Modal title="Delete role?" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" icon="trash" onClick={onConfirm}>Delete role</Btn>
      </>}>
      <p className="confirm-lead">Delete the role <strong>{role.name}</strong>? This cannot be undone.</p>
    </Modal>
  );
}

/* ---------------- Security ---------------- */
function SecuritySettings() {
  return (
    <div className="set-grid">
      <Card title="First-login security flow" sub="One-time mandatory setup on first admin login">
        <ol className="flow-list">
          <li><span className="flow-n done"><Icon name="check" size={13} /></span><div><strong>Default credentials</strong><span>Ships with admin / password</span></div></li>
          <li><span className="flow-n done"><Icon name="check" size={13} /></span><div><strong>Change User ID (once)</strong><span>Permanent afterwards — field locks</span></div></li>
          <li><span className="flow-n done"><Icon name="check" size={13} /></span><div><strong>Set new password</strong><span>Cannot keep “password”</span></div></li>
          <li><span className="flow-n"><Icon name="lock" size={13} /></span><div><strong>Flag stored</strong><span>must_change = 0 · userid_locked = 1</span></div></li>
        </ol>
        <div className="inline-note"><Icon name="check" size={15} /> First-time setup completed for <strong>admin → harman.gill</strong>. User ID is now locked.</div>
      </Card>
      <Card title="Audit log" sub="Latest activity — see Logs for the full searchable history" pad={false}>
        <table className="data-table compact">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th></tr></thead>
          <tbody>
            {BCCWE.auditLog.slice(0, 6).map((a, i) => (
              <tr key={i}>
                <td className="muted mono">{a.ts}</td>
                <td>{a.user}</td>
                <td><Badge tone={a.action === "CREATE" ? "green" : a.action === "POST" ? "blue" : "slate"}>{a.action}</Badge></td>
                <td><span className="mono">{a.rec}</span> <span className="muted">· {a.detail}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

Object.assign(window, { Settings });
