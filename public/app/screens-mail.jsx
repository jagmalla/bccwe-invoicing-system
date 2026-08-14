/* ============================================================
   BCCWE — Sent Mail (email log) + reusable email / download log cards
   ============================================================ */

function mailStatusTone(s) {
  return { Delivered: "green", Opened: "blue", Pending: "amber", Failed: "red", Bounced: "red" }[s] || "neutral";
}
function profileName(id) {
  const p = BCCWE.smtpProfiles.find((x) => x.id === id);
  return p ? p.fromName : "—";
}
function fmtTs(ts) {
  if (!ts) return "—";
  const [d, t] = ts.split(" ");
  return shortDate(d) + (t ? " · " + t : "");
}
const MAIL_KIND_LABEL = { invoice: "Invoice", statement: "Statement", history: "History export", order: "Order", receipt: "Receipt", test: "Test email" };

// re-render whenever the shared mail log changes (sends, resolves, resends)
function useMailRev() {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const h = () => setRev((r) => r + 1);
    window.addEventListener("bccwe-mail", h);
    return () => window.removeEventListener("bccwe-mail", h);
  }, []);
  return rev;
}

/* ---------------- Sent Mail screen ---------------- */
function SentMail({ go, pushToast }) {
  const D = BCCWE;
  useMailRev();
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState("All");
  const [profileSel, setProfileSel] = useState("All");
  const [open, setOpen] = useState(null); // mail entry being viewed

  const STATUSES = ["All", "Delivered", "Opened", "Pending", "Failed", "Bounced"];
  const counts = D.mailLog.reduce((a, m) => { a[m.status] = (a[m.status] || 0) + 1; return a; }, {});
  const problems = (counts.Failed || 0) + (counts.Bounced || 0);

  const rows = D.mailLog.filter((m) => {
    if (statusSel !== "All" && m.status !== statusSel) return false;
    if (profileSel !== "All" && m.profileId !== profileSel) return false;
    if (q) {
      const hay = (m.subject + " " + m.docNo + " " + clientName(m.clientId) + " " + m.to.join(" ") + " " + (m.attachments || []).join(" ")).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  function resend(m) {
    window.sendEmail({ kind: m.kind, subject: m.subject, docNo: m.docNo, clientId: m.clientId, profileId: m.profileId, to: m.to, cc: m.cc, attachments: m.attachments },
      (status) => pushToast && pushToast("Resent " + (m.docNo || "email") + " — " + status));
    pushToast && pushToast("Resending " + (m.docNo || "email") + "…");
    setOpen(null);
  }

  const kpis = [
    { label: "Emails sent", value: D.mailLog.length, ico: "mail" },
    { label: "Delivered", value: (counts.Delivered || 0) + (counts.Opened || 0), ico: "check", tone: "pos" },
    { label: "Opened", value: counts.Opened || 0, ico: "eye" },
    { label: "Failed / bounced", value: problems, ico: "alert", warn: problems > 0 },
  ];

  return (
    <div>
      <PageHead title="Sent Mail" sub="Every email the system has sent — invoices, statements, receipts and order updates, with live delivery status" />

      <div className="kpi-row">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top"><span className="kpi-ico"><Icon name={k.ico} size={18} /></span></div>
            <div className={"kpi-val" + (k.tone ? " " + k.tone : "")}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            {k.warn !== undefined && <div className={"kpi-sub" + (k.warn ? " warn" : "")}>{k.warn ? "Needs attention — resend" : "All clear"}</div>}
          </div>
        ))}
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input placeholder="Search subject, client, recipient or attachment…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="seg-filters">
            {STATUSES.map((s) => <button key={s} className={"chip" + (statusSel === s ? " on" : "")} onClick={() => setStatusSel(s)}>{s}{s !== "All" && counts[s] ? " · " + counts[s] : ""}</button>)}
          </div>
          <label className="sortctl">
            <Icon name="mail" size={15} />
            <span className="sortctl-lbl">Sender</span>
            <select value={profileSel} onChange={(e) => setProfileSel(e.target.value)}>
              <option value="All">All profiles</option>
              {D.smtpProfiles.map((p) => <option key={p.id} value={p.id}>{p.fromName}</option>)}
            </select>
          </label>
        </div>
        <table className="data-table">
          <thead><tr><th>Sent</th><th>Subject</th><th>To</th><th>Document</th><th>Sent from</th><th>Attachment</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="rowlink" onClick={() => setOpen(m)}>
                <td className="muted mono nowrap">{fmtTs(m.ts)}</td>
                <td><strong>{m.subject}</strong><em className="cat-tag">{MAIL_KIND_LABEL[m.kind] || m.kind}</em></td>
                <td className="muted">{m.to[0]}{m.to.length > 1 && <span className="cat-tag">+{m.to.length - 1}</span>}</td>
                <td>{m.docNo ? <button className="link mono" onClick={(e) => { e.stopPropagation(); go(m.docNo.startsWith("ORD") ? "orders" : "invoiceview/" + m.docNo); }}>{m.docNo}</button> : <span className="muted">—</span>}</td>
                <td className="muted">{profileName(m.profileId)}</td>
                <td>{(m.attachments && m.attachments.length) ? <span className="att-chip"><Icon name="invoice" size={12} />{m.attachments[0]}{m.attachments.length > 1 && " +" + (m.attachments.length - 1)}</span> : <span className="muted">—</span>}</td>
                <td><Badge tone={mailStatusTone(m.status)} dot>{m.status}</Badge></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7"><Empty icon="mail" text="No emails match this view" /></td></tr>}
          </tbody>
        </table>
      </Card>

      {open && <MailDetailModal m={open} onClose={() => setOpen(null)} onResend={resend} go={go} />}
    </div>
  );
}

function MailDetailModal({ m, onClose, onResend, go }) {
  const p = BCCWE.smtpProfiles.find((x) => x.id === m.profileId);
  const failed = m.status === "Failed" || m.status === "Bounced";
  return (
    <Modal title={m.subject} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        {m.docNo && !m.docNo.startsWith("ORD") && <Btn variant="ghost" icon="invoice" onClick={() => { onClose(); go("invoiceview/" + m.docNo); }}>Open {m.docNo}</Btn>}
        {failed && <Btn variant="primary" icon="send" onClick={() => onResend(m)}>Resend</Btn>}
      </>}>
      <div className="mail-detail">
        <div className={"mail-status mail-status-" + mailStatusTone(m.status)}>
          <Icon name={failed ? "alert" : m.status === "Opened" ? "eye" : m.status === "Pending" ? "history" : "check"} size={18} />
          <div>
            <strong>{m.status}{m.code ? " · " + m.code : ""}</strong>
            <span>{m.note}</span>
          </div>
        </div>
        <dl className="mail-meta">
          <div><dt>Sent</dt><dd>{fmtTs(m.ts)}</dd></div>
          <div><dt>From</dt><dd>{p ? p.fromName + " — " + p.from : "—"} <span className="cat-tag">{p ? p.name : ""}</span></dd></div>
          <div><dt>To</dt><dd>{m.to.join(", ")}</dd></div>
          {m.cc && m.cc.length > 0 && <div><dt>Cc</dt><dd>{m.cc.join(", ")}</dd></div>}
          <div><dt>Client</dt><dd>{m.clientId ? <button className="link" onClick={() => { onClose(); go("client/" + m.clientId); }}>{clientName(m.clientId)}</button> : "—"}</dd></div>
          {m.docNo && <div><dt>Document</dt><dd className="mono">{m.docNo}</dd></div>}
          {m.openedAt && <div><dt>Opened</dt><dd>{fmtTs(m.openedAt)}</dd></div>}
        </dl>
        <div className="mail-att">
          <span className="field-label">Attachment</span>
          {(m.attachments && m.attachments.length) ? m.attachments.map((a) => (
            m.attUrl
              ? <a key={a} className="att-chip lg att-dl" href={m.attUrl} download={m.attName || a} title="Download attached PDF"><Icon name="download" size={14} />{a}</a>
              : <span key={a} className="att-chip lg"><Icon name="invoice" size={14} />{a}</span>
          )) : <p className="rail-note">No attachment.</p>}
          <p className="rail-note">{m.attUrl ? "The PDF generated at send time is attached above — click to download the exact file that went to the client." : "Attachments are generated at send time — only the file name is retained in the log."}</p>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- reusable log cards (invoice detail, client account) ---------------- */
function EmailLogCard({ filter, showDoc, emptyText }) {
  const D = BCCWE;
  useMailRev();
  const rows = D.mailLog.filter(filter);
  return (
    <Card title={"Email log (" + rows.length + ")"} sub="Every send of this record, with delivery status" pad={false}>
      <table className="data-table compact">
        <thead><tr><th>Sent</th>{showDoc && <th>Document</th>}<th>Recipient</th><th>Sent from</th><th>Attachment</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="muted mono nowrap">{fmtTs(m.ts)}</td>
              {showDoc && <td className="mono">{m.docNo || "—"}</td>}
              <td>{m.to[0]}{m.to.length > 1 && <span className="cat-tag">+{m.to.length - 1}</span>}</td>
              <td className="muted">{profileName(m.profileId)}</td>
              <td>{(m.attachments && m.attachments.length) ? <span className="att-chip"><Icon name="invoice" size={12} />{m.attachments[0]}</span> : <span className="muted">—</span>}</td>
              <td><Badge tone={mailStatusTone(m.status)} dot>{m.status}</Badge></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={showDoc ? 6 : 5}><Empty icon="mail" text={emptyText || "No emails sent yet"} /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function DownloadLogCard({ filter, showDoc, emptyText }) {
  const D = BCCWE;
  useMailRev();
  const rows = D.downloadLog.filter(filter);
  return (
    <Card title={"Download log (" + rows.length + ")"} sub="PDF and export downloads" pad={false}>
      <table className="data-table compact">
        <thead><tr><th>When</th>{showDoc && <th>Document</th>}<th>File</th><th>Type</th><th>By</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="muted mono nowrap">{fmtTs(d.ts)}</td>
              {showDoc && <td className="mono">{d.docNo || "—"}</td>}
              <td><span className="att-chip"><Icon name="download" size={12} />{d.file}</span></td>
              <td className="muted">{d.kind}</td>
              <td className="muted">{d.user}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={showDoc ? 5 : 4}><Empty icon="download" text={emptyText || "No downloads yet"} /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

Object.assign(window, { SentMail, EmailLogCard, DownloadLogCard, mailStatusTone, profileName, fmtTs });
