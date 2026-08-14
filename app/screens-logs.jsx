/* ============================================================
   BCCWE — Activity Logs (audit trail): who, what, when, IP
   Search + action / user filters + date range
   ============================================================ */

const LOG_ACTIONS = ["CREATE", "UPDATE", "DELETE", "EMAIL", "DOWNLOAD", "IMPORT", "POST", "LOGIN"];
function actionTone(a) {
  return ({
    CREATE: "green", UPDATE: "amber", DELETE: "red", EMAIL: "blue",
    DOWNLOAD: "slate", IMPORT: "blue", POST: "blue", LOGIN: "slate",
  })[a] || "neutral";
}
function logDate(ts) { return (ts || "").slice(0, 10); }
function logTime(ts) { return (ts || "").slice(11); }

function AuditLog({ pushToast }) {
  const D = BCCWE;
  const all = D.auditLog || [];
  const [q, setQ] = useState("");
  const [actSel, setActSel] = useState("All");
  const [userSel, setUserSel] = useState("All");
  const [entitySel, setEntitySel] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const PER = 12;

  const users = useMemo(() => Array.from(new Set(all.map((a) => a.user))).sort(), [all]);
  const entities = useMemo(() => Array.from(new Set(all.map((a) => a.entity).filter(Boolean))).sort(), [all]);

  function reset() { setQ(""); setActSel("All"); setUserSel("All"); setEntitySel("All"); setFrom(""); setTo(""); setPage(0); }

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter((a) => {
      if (actSel !== "All" && a.action !== actSel) return false;
      if (userSel !== "All" && a.user !== userSel) return false;
      if (entitySel !== "All" && a.entity !== entitySel) return false;
      const d = logDate(a.ts);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (ql) {
        const hay = [a.user, a.role, a.action, a.entity, a.rec, a.detail, a.ip, a.ts].join(" ").toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [all, q, actSel, userSel, entitySel, from, to]);

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const curPage = Math.min(page, pages - 1);
  const slice = rows.slice(curPage * PER, curPage * PER + PER);
  const filtered = rows.length !== all.length;

  function exportCsv() {
    const cols = [
      { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "user", label: "User" },
      { key: "role", label: "Role" }, { key: "action", label: "Action" }, { key: "entity", label: "Entity" },
      { key: "rec", label: "Record" }, { key: "detail", label: "Change detail" }, { key: "ip", label: "IP address" },
    ];
    const data = rows.map((a) => ({ date: logDate(a.ts), time: logTime(a.ts), user: a.user, role: a.role || "", action: a.action, entity: a.entity || "", rec: a.rec, detail: a.detail, ip: a.ip || "" }));
    exportXlsx("BCCWE-Activity-Log", "Activity log", cols, data, { title: "BCCWE — Activity Log", subtitle: data.length + " entries" });
    window.logDownload && window.logDownload({ kind: "XLSX", file: "BCCWE-Activity-Log.xlsx", docNo: "", clientId: "" });
    pushToast && pushToast("Activity log exported — " + data.length + " entries");
  }

  return (
    <div>
      <PageHead title="Activity Logs"
        sub={rows.length + (filtered ? " of " + all.length : "") + " events · who changed what, when, and from where"}
        actions={<Btn variant="ghost" icon="download" onClick={exportCsv}>Export log</Btn>} />

      <Card pad={false}>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Search user, record, change, IP…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <div className="seg-filters">
            {["All", ...LOG_ACTIONS].map((a) => (
              <button key={a} className={"chip" + (actSel === a ? " on" : "")} onClick={() => { setActSel(a); setPage(0); }}>
                {a === "All" ? "All actions" : a.charAt(0) + a.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar log-toolbar2">
          <label className="log-filter">
            <span>User</span>
            <select value={userSel} onChange={(e) => { setUserSel(e.target.value); setPage(0); }}>
              <option value="All">All users</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="log-filter">
            <span>Type</span>
            <select value={entitySel} onChange={(e) => { setEntitySel(e.target.value); setPage(0); }}>
              <option value="All">All record types</option>
              {entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label className="log-filter log-dates">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          </label>
          <label className="log-filter log-dates">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </label>
          {filtered && <button className="link log-clear" onClick={reset}>Clear filters</button>}
        </div>

        <table className="data-table compact log-table">
          <thead>
            <tr>
              <th>Date &amp; time</th><th>User</th><th>Action</th><th>What changed</th><th>Record</th><th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((a, i) => (
              <tr key={i}>
                <td className="nowrap"><span className="mono">{logDate(a.ts)}</span> <span className="muted mono">{logTime(a.ts)}</span></td>
                <td><div className="log-user"><strong>{a.user}</strong>{a.role && <span className="muted">{a.role}</span>}</div></td>
                <td><Badge tone={actionTone(a.action)}>{a.action}</Badge></td>
                <td><span className="log-entity">{a.entity}</span><span className="muted"> · {a.detail}</span></td>
                <td><span className="mono">{a.rec}</span></td>
                <td className="muted mono">{a.ip || "—"}</td>
              </tr>
            ))}
            {!slice.length && <tr><td colSpan="6"><Empty icon="history" text="No activity matches these filters" /></td></tr>}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="table-foot">
            <span className="muted">Showing {slice.length} of {rows.length} events</span>
            <div className="pager">
              <button className="icon-btn" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}><Icon name="chevron" size={16} style={{ transform: "scaleX(-1)" }} /></button>
              <span>Page {curPage + 1} / {pages}</span>
              <button className="icon-btn" disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)}><Icon name="chevron" size={16} /></button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

Object.assign(window, { AuditLog });
