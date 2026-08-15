/* ============================================================
   BCCWE — Accounting, Reports, Settings
   ============================================================ */

/* ---------------- Accounting ---------------- */
const ACCT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const ACCT_PLURAL = { Asset: "Assets", Liability: "Liabilities", Equity: "Equity", Revenue: "Revenue", Expense: "Expenses" };
// Accounts the app itself posts to — never deletable, so postings always land.
const SYSTEM_ACCTS = ["1000", "1010", "1200", "1300", "2000", "2100", "2110", "2200", "3000", "3900", "4000", "4010", "4100", "4200", "4900", "5000", "5100", "5110", "6900"];

function Accounting({ store, pushToast }) {
  const D = BCCWE;
  const sf = store || "all";
  const [tab, setTab] = useState("coa");
  const [ledgerAcct, setLedgerAcct] = useState(""); // set when jumping in from the Balance-sheet tab
  const [modal, setModal] = useState(null); // {type:"acct",acct?} | {type:"mje"} | {type:"opening"}
  const [jq, setJq] = useState("");     // journal search
  const [jshow, setJshow] = useState(10); // journal pagination
  const [, _r] = useState(0);
  const bump = () => _r((x) => x + 1);
  const isAdmin = !!(window.STORES && window.STORES.isAdmin());
  const toneFor = { Asset: "blue", Liability: "amber", Equity: "slate", Revenue: "green", Expense: "red" };
  const jFiltered = (D.journal || []).filter((je) => {
    if (!jq.trim()) return true;
    const hay = (je.id + " " + je.memo + " " + (je.lines || []).map((l) => l.acct + " " + (l.name || "")).join(" ")).toLowerCase();
    return hay.includes(jq.trim().toLowerCase());
  });

  function saveAccount(data, original) {
    if (original) {
      const oldName = original.name;
      original.name = data.name;
      if (!SYSTEM_ACCTS.includes(String(original.code))) original.type = data.type;
      window.logAudit("UPDATE", "Account", "accounts", original.code, "Renamed account " + original.code + " “" + oldName + "” → “" + data.name + "”");
      pushToast && pushToast(original.code + " updated");
    } else {
      D.accounts.push({ code: data.code, name: data.name, type: data.type, balance: 0 });
      D.accounts.sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
      window.logAudit("CREATE", "Account", "accounts", data.code, "Added account " + data.code + " " + data.name + " (" + data.type + ")");
      pushToast && pushToast("Account " + data.code + " · " + data.name + " added");
    }
    if (window.persist) window.persist("accounts");
    setModal(null); bump();
  }
  function deleteAccount(a) {
    if (SYSTEM_ACCTS.includes(String(a.code))) { pushToast && pushToast("This is a system account the app posts to — it can't be deleted."); return; }
    const live = liveAccountBalances(sf)[a.code] || 0;
    if (Math.abs(live) > 0.005) { pushToast && pushToast("Can't delete " + a.code + " — its balance is " + fmt(live) + ". Move the balance with a journal entry first."); return; }
    const usedTax = Object.values(D.TAX.modes || {}).some((m) => (m.comps || []).some((c) => c.acct === a.code));
    const usedExp = (D.expenseCategories || []).some((c) => c.acct === a.code);
    const usedJournal = (D.journal || []).some((j) => (j.lines || []).some((l) => l.acct === a.code));
    if (usedTax || usedExp) { pushToast && pushToast("Can't delete " + a.code + " — it's mapped in " + (usedTax ? "tax settings" : "expense types") + "."); return; }
    if (usedJournal) { pushToast && pushToast("Can't delete " + a.code + " — journal entries reference it."); return; }
    if (!window.confirm("Delete account " + a.code + " " + a.name + "?")) return;
    D.accounts = D.accounts.filter((x) => x !== a);
    window.logAudit("DELETE", "Account", "accounts", a.code, "Deleted account " + a.code + " " + a.name);
    if (window.persist) window.persist("accounts");
    pushToast && pushToast("Deleted account " + a.code);
    bump();
  }
  async function saveManualJE(je) {
    D.journal.unshift(je);
    window.logAudit("CREATE", "Journal entry", "journal", je.id, "Manual journal entry " + je.id + " · " + je.memo + " · " + fmt(je.lines.reduce((s, l) => s + l.dr, 0)));
    const ok = window.persistNow ? await window.persistNow("journal") : true;
    if (!ok) {
      D.journal = D.journal.filter((j) => j !== je);
      pushToast && pushToast("Couldn't save — no connection. Nothing was posted.");
      bump(); return;
    }
    pushToast && pushToast(je.id + " posted — balances updated");
    setModal(null); bump();
  }
  async function deleteManualJE(je) {
    if (!window.confirm("Delete manual entry " + je.id + "? Its effect on the balances will be reversed.")) return;
    const prev = D.journal;
    D.journal = D.journal.filter((j) => j !== je);
    window.logAudit("DELETE", "Journal entry", "journal", je.id, "Deleted manual journal entry " + je.id + " · " + je.memo);
    const ok = window.persistNow ? await window.persistNow("journal") : true;
    if (!ok) { D.journal = prev; pushToast && pushToast("Couldn't save — no connection. The entry is unchanged."); bump(); return; }
    pushToast && pushToast(je.id + " deleted — balances updated");
    bump();
  }

  return (
    <div>
      <PageHead title="Accounting" sub="Double-entry ledger · chart of accounts · journal"
        actions={<>
          {isAdmin && <Btn variant="ghost" icon="ledger" onClick={() => setModal({ type: "opening" })}>Set opening balances</Btn>}
          {isAdmin && <Btn variant="ghost" icon="plus" onClick={() => setModal({ type: "acct" })}>New account</Btn>}
          {isAdmin && <Btn variant="primary" icon="book" onClick={() => setModal({ type: "mje" })}>Manual journal entry</Btn>}
        </>} />

      {sf !== "all" && (
        <div className="inline-note" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} /> The chart of accounts &amp; journals are shared across all stores. For <strong>{storeLabel(sf)}</strong>'s own Profit &amp; Loss and Balance Sheet, see <strong>Reports</strong>.
        </div>
      )}
      <div className="tabs">
        <button className={"tab" + (tab === "coa" ? " on" : "")} onClick={() => setTab("coa")}>Chart of accounts</button>
        <button className={"tab" + (tab === "balance" ? " on" : "")} onClick={() => setTab("balance")}>Balance sheet</button>
        <button className={"tab" + (tab === "journal" ? " on" : "")} onClick={() => setTab("journal")}>General journal</button>
        <button className={"tab" + (tab === "ledger" ? " on" : "")} onClick={() => setTab("ledger")}>General ledger</button>
        {acctCan("reconcile") && <button className={"tab" + (tab === "reconcile" ? " on" : "")} onClick={() => setTab("reconcile")}>Reconcile</button>}
      </div>

      {tab === "coa" && (() => {
        const live = liveAccountBalances(sf);
        return (
        <div className="coa-grid">
          {ACCT_TYPES.map((g) => {
            const accts = D.accounts.filter((a) => a.type === g);
            const sum = accts.reduce((s, a) => s + (live[a.code] || 0), 0);
            return (
              <Card key={g} title={ACCT_PLURAL[g]} sub={accts.length + " accounts"} actions={<Badge tone={toneFor[g]}>{fmt(sum)}</Badge>}>
                <ul className="coa-list">
                  {accts.map((a) => (
                    <li key={a.code}>
                      <span className="jcode">{a.code}</span>
                      <span className="coa-name">{a.name}</span>
                      <span className="coa-bal mono">{fmt(live[a.code] || 0)}</span>
                      {isAdmin && (
                        <span className="coa-acts">
                          <button className="icon-btn" title="Edit account" onClick={() => setModal({ type: "acct", acct: a })}><Icon name="edit" size={14} /></button>
                          {!SYSTEM_ACCTS.includes(String(a.code)) && <button className="icon-btn" title="Delete account" onClick={() => deleteAccount(a)}><Icon name="trash" size={14} /></button>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        );
      })()}

      {tab === "balance" && <BalanceSheet store={sf}
        onDrill={(spec) => { if (spec.codes && spec.codes.length) { setLedgerAcct(spec.codes[0]); setTab("ledger"); } }} />}

      {tab === "journal" && (
        <Card pad={false}>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={16} /><input placeholder="Search entry #, memo or account…" value={jq} onChange={(e) => { setJq(e.target.value); setJshow(10); }} /></div>
            <span className="muted">{jFiltered.length} entr{jFiltered.length === 1 ? "y" : "ies"}</span>
          </div>
          <div className="journal-list">
            {jFiltered.slice(0, jshow).map((je) => {
              const dr = je.lines.reduce((s, l) => s + l.dr, 0);
              const cr = je.lines.reduce((s, l) => s + l.cr, 0);
              return (
                <div className="je" key={je.id}>
                  <div className="je-head">
                    <div><span className="mono strong">{je.id}</span> <span className="muted">· {shortDate(je.date)}</span>{je.manual && <Badge tone="blue">Manual</Badge>}<div className="je-memo">{je.memo}</div></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge tone={Math.abs(dr - cr) < 0.01 ? "green" : "red"} dot>{Math.abs(dr - cr) < 0.01 ? "Balanced" : "Check"}</Badge>
                      {je.manual && isAdmin && <button className="icon-btn" title="Delete manual entry (reverses its effect)" onClick={() => deleteManualJE(je)}><Icon name="trash" size={14} /></button>}
                    </div>
                  </div>
                  <table className="jtable wide">
                    <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
                    <tbody>
                      {je.lines.map((l, i) => (
                        <tr key={i}><td><span className="jcode">{l.acct}</span> {l.name}</td><td className="r mono">{l.dr ? fmtPlain(l.dr) : ""}</td><td className="r mono">{l.cr ? fmtPlain(l.cr) : ""}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Totals</td><td className="r mono">{fmtPlain(dr)}</td><td className="r mono">{fmtPlain(cr)}</td></tr></tfoot>
                  </table>
                </div>
              );
            })}
            {!jFiltered.length && <Empty icon="book" text={jq ? "No entries match “" + jq + "”" : "No journal entries yet — register sales, POS sales and manual entries appear here"} />}
            {jFiltered.length > jshow && (
              <div style={{ padding: 14, textAlign: "center" }}>
                <Btn variant="ghost" size="sm" onClick={() => setJshow((n) => n + 20)}>Show more ({jFiltered.length - jshow} remaining)</Btn>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === "ledger" && <Ledger store={sf} key={ledgerAcct || "default"} initAcct={ledgerAcct} />}
      {tab === "reconcile" && acctCan("reconcile") && <Reconcile store={sf} pushToast={pushToast} />}

      {modal && modal.type === "acct" && <AccountFormModal acct={modal.acct} onSave={saveAccount} onClose={() => setModal(null)} />}
      {modal && modal.type === "mje" && <ManualJEModal onSave={saveManualJE} onClose={() => setModal(null)} />}
      {modal && modal.type === "opening" && <OpeningBalancesModal store={sf} onSave={saveManualJE} onClose={() => setModal(null)} />}
    </div>
  );
}

function Ledger({ store, initAcct }) {
  const D = BCCWE;
  const sf = store || "all";
  const [acct, setAcct] = useState(initAcct || "1010");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  const range = periodRange(period, from, to);
  const live = liveAccountBalances(sf);
  const a = D.accounts.find((x) => x.code === acct) || {};
  const debitNormal = a.type === "Asset" || a.type === "Expense";
  const special = acct === "1300" || acct === "3900"; // snapshot / plug — no flow lines
  const all = (ledgerLines(sf)[acct] || []);
  const signed = (l) => (debitNormal ? l.dr - l.cr : l.cr - l.dr);
  const opening = all.filter((l) => l.date < range.from).reduce((s, l) => s + signed(l), 0);
  const rows = all.filter((l) => inRange(l.date, range));
  let run = opening;
  const view = rows.map((l) => { run += signed(l); return { ...l, run }; });
  const linesTotal = all.reduce((s, l) => s + signed(l), 0);
  const derived = live[acct] || 0;
  const tie = Math.abs(linesTotal - derived) < 0.02;

  return (
    <Card pad={false}>
      <div className="toolbar">
        <Field label="">
          <select className="tool-select wide" value={acct} onChange={(e) => setAcct(e.target.value)}>
            {D.accounts.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
          </select>
        </Field>
        <PeriodFilter period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <div className="ledger-bal">Current balance <strong className="mono">{fmt(derived)}</strong></div>
      </div>
      {special && (
        <div className="inline-note" style={{ margin: "0 16px" }}>
          <Icon name="alert" size={15} /> {acct === "1300"
            ? "Inventory is valued as a live stock snapshot (units × cost) — only manual valuation adjustments appear as lines."
            : "Retained Earnings accumulates net income from all activity — only manual entries appear as lines."}
        </div>
      )}
      {!special && !tie && (
        <div className="inline-note" style={{ margin: "0 16px" }}>
          <Icon name="alert" size={15} /> Lines total {fmt(linesTotal)} vs derived balance {fmt(derived)} — small differences come from rounding on legacy records.
        </div>
      )}
      <table className="data-table">
        <thead><tr><th>Date</th><th>Memo</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Running balance</th></tr></thead>
        <tbody>
          {period !== "all" && (
            <tr><td className="muted">{shortDate(range.from)}</td><td className="muted">Opening balance</td><td className="r mono">—</td><td className="r mono">—</td><td className="r mono strong">{fmt(opening)}</td></tr>
          )}
          {view.map((r, i) => (
            <tr key={i}>
              <td className="muted">{shortDate(r.date)}</td>
              <td>{r.memo}</td>
              <td className="r mono">{r.dr > 0.005 ? fmtPlain(r.dr) : "—"}</td>
              <td className="r mono">{r.cr > 0.005 ? fmtPlain(r.cr) : "—"}</td>
              <td className="r mono strong">{fmt(r.run)}</td>
            </tr>
          ))}
          {!view.length && <tr><td colSpan="5"><Empty icon="book" text={"No activity for this account" + (period !== "all" ? " in " + range.label : "")} /></td></tr>}
        </tbody>
        {view.length > 0 && (
          <tfoot><tr><td /><td>Period activity ({view.length} line{view.length === 1 ? "" : "s"})</td>
            <td className="r mono">{fmtPlain(view.reduce((s, l) => s + l.dr, 0))}</td>
            <td className="r mono">{fmtPlain(view.reduce((s, l) => s + l.cr, 0))}</td>
            <td className="r mono strong">{fmt(run)}</td></tr></tfoot>
        )}
      </table>
    </Card>
  );
}

/* ---------------- Bank reconciliation ----------------
   Tick ledger lines against a bank/cash statement. Cleared lines are stored in
   the `reconciliations` collection (per account, by stable line key), so once a
   line is reconciled it stays reconciled across sessions and devices. */
function Reconcile({ store, pushToast }) {
  const D = BCCWE;
  const sf = store || "all";
  if (!D.reconciliations) D.reconciliations = [];
  const isAdmin = !!(window.STORES && window.STORES.isAdmin());
  const acctOpts = (D.accounts || []).filter((a) => a.type === "Asset" && a.code !== "1300");
  const [acct, setAcct] = useState("1010");
  const [stmtDate, setStmtDate] = useState(D.today);
  const [stmtBal, setStmtBal] = useState("");
  const [ticked, setTicked] = useState({});
  const [confirmDel, setConfirmDel] = useState("");
  const [, _r] = useState(0);
  const bump = () => _r((x) => x + 1);

  const allLines = reconKeyedLines(ledgerLines(sf)[acct] || []);
  const clearedKeys = {};
  D.reconciliations.forEach((r) => { if (r.acct === acct) (r.keys || []).forEach((k) => { clearedKeys[k] = r.id; }); });
  const inScope = allLines.filter((l) => l.date <= stmtDate);
  const signed = (l) => (l.dr || 0) - (l.cr || 0); // asset accounts are debit-normal
  const clearedPrev = inScope.filter((l) => clearedKeys[l.key]).reduce((s, l) => s + signed(l), 0);
  const open = inScope.filter((l) => !clearedKeys[l.key]);
  const tickedLines = open.filter((l) => ticked[l.key]);
  const tickedSum = tickedLines.reduce((s, l) => s + signed(l), 0);
  const clearedBal = clearedPrev + tickedSum;
  const stmtNum = parseFloat(stmtBal);
  const hasStmt = !isNaN(stmtNum);
  const diff = hasStmt ? +(stmtNum - clearedBal).toFixed(2) : 0;
  const canFinish = hasStmt && Math.abs(diff) < 0.005;
  const aName = (acctOpts.find((a) => a.code === acct) || {}).name || "";
  const past = D.reconciliations.filter((r) => r.acct === acct).sort((a, b) => String(b.stmtDate).localeCompare(String(a.stmtDate)));

  const switchAcct = (v) => { setAcct(v); setTicked({}); setStmtBal(""); setConfirmDel(""); };
  const tickAll = (on) => { const n = {}; if (on) open.forEach((l) => { n[l.key] = true; }); setTicked(n); };

  function finish() {
    if (!canFinish) return;
    const rec = {
      id: "rec_" + Date.now().toString(36),
      acct, stmtDate, stmtBalance: +stmtNum.toFixed(2),
      keys: tickedLines.map((l) => l.key),
      clearedTotal: +tickedSum.toFixed(2),
      at: D.today, by: sessionWho(), store: sf,
    };
    D.reconciliations.push(rec);
    if (window.persist) window.persist("reconciliations");
    window.logAudit && window.logAudit("POST", "Reconciliation", "reconciliations", acct,
      "Reconciled " + acct + " " + aName + " to " + fmt(stmtNum) + " as of " + stmtDate + " · " + tickedLines.length + " line(s) cleared");
    pushToast && pushToast(acct + " reconciled to " + fmt(stmtNum) + " — " + tickedLines.length + " line(s) cleared");
    setTicked({}); setStmtBal("");
    bump();
  }
  function removeRecon(id) {
    const i = D.reconciliations.findIndex((r) => r.id === id);
    if (i < 0) return;
    const r = D.reconciliations[i];
    D.reconciliations.splice(i, 1);
    if (window.persist) window.persist("reconciliations");
    window.logAudit && window.logAudit("DELETE", "Reconciliation", "reconciliations", r.acct,
      "Deleted reconciliation of " + r.acct + " as of " + r.stmtDate + " — " + (r.keys || []).length + " line(s) un-cleared");
    pushToast && pushToast("Reconciliation deleted — its lines are open again");
    setConfirmDel("");
    bump();
  }

  return (
    <div>
      <Card pad={false}>
        <div className="toolbar">
          <Field label="">
            <select className="tool-select wide" value={acct} onChange={(e) => switchAcct(e.target.value)}>
              {acctOpts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </Field>
          <Field label=""><input type="date" value={stmtDate} onChange={(e) => { setStmtDate(e.target.value); setTicked({}); }} title="Statement end date" /></Field>
          <Field label=""><input type="number" step="0.01" placeholder="Statement ending balance" value={stmtBal} onChange={(e) => setStmtBal(e.target.value)} style={{ width: 190 }} /></Field>
        </div>
        {sf !== "all" && <div className="inline-note" style={{ margin: "0 16px 10px" }}><Icon name="alert" size={15} /> A store filter is active — switch the top bar to “All stores” to reconcile the account's complete activity.</div>}
        <div className="recon-summary">
          <div className="recon-cell"><span>Reconciled before this</span><strong className="mono">{fmt(clearedPrev)}</strong></div>
          <div className="recon-cell"><span>Ticked now ({tickedLines.length})</span><strong className="mono">{fmt(tickedSum)}</strong></div>
          <div className="recon-cell"><span>Cleared balance</span><strong className="mono">{fmt(clearedBal)}</strong></div>
          <div className={"recon-cell" + (hasStmt ? (canFinish ? " ok" : " warn") : "")}>
            <span>{hasStmt ? "Difference vs statement" : "Enter the statement balance"}</span>
            <strong className="mono">{hasStmt ? fmt(diff) : "—"}</strong>
          </div>
          <Btn variant="primary" icon="check" disabled={!canFinish} onClick={finish}>
            {canFinish ? "Finish reconciliation" : "Difference must be $0.00"}
          </Btn>
        </div>
        <table className="data-table">
          <thead><tr>
            <th style={{ width: 34 }}><input type="checkbox" checked={open.length > 0 && tickedLines.length === open.length} onChange={(e) => tickAll(e.target.checked)} title="Tick all" /></th>
            <th>Date</th><th>Detail</th><th className="r">Money in</th><th className="r">Money out</th>
          </tr></thead>
          <tbody>
            {open.map((l) => (
              <tr key={l.key} className={ticked[l.key] ? "recon-on" : ""} onClick={() => setTicked((t) => Object.assign({}, t, { [l.key]: !t[l.key] }))} style={{ cursor: "pointer" }}>
                <td><input type="checkbox" checked={!!ticked[l.key]} onChange={() => {}} /></td>
                <td className="muted">{shortDate(l.date)}</td>
                <td>{l.memo}</td>
                <td className="r mono">{l.dr > 0.005 ? fmtPlain(l.dr) : "—"}</td>
                <td className="r mono">{l.cr > 0.005 ? fmtPlain(l.cr) : "—"}</td>
              </tr>
            ))}
            {!open.length && <tr><td colSpan="5"><Empty icon="check" text={"Nothing left to reconcile up to " + shortDate(stmtDate)} /></td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title={"Past reconciliations — " + acct + " · " + aName} pad={false}>
        <table className="data-table">
          <thead><tr><th>Statement date</th><th className="r">Statement balance</th><th className="r">Lines cleared</th><th>Done on</th><th>By</th><th /></tr></thead>
          <tbody>
            {past.map((r) => (
              <tr key={r.id}>
                <td>{shortDate(r.stmtDate)}</td>
                <td className="r mono">{fmt(r.stmtBalance)}</td>
                <td className="r mono">{(r.keys || []).length}</td>
                <td className="muted">{shortDate(r.at)}</td>
                <td className="muted">{r.by || "—"}</td>
                <td className="row-acts">
                  {isAdmin && (confirmDel === r.id
                    ? <span className="del-confirm"><Btn variant="danger" size="sm" icon="trash" onClick={() => removeRecon(r.id)}>Confirm</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirmDel("")}>Cancel</Btn></span>
                    : <button className="icon-btn danger" title="Delete (un-clears its lines)" onClick={() => setConfirmDel(r.id)}><Icon name="trash" size={15} /></button>)}
                </td>
              </tr>
            ))}
            {!past.length && <tr><td colSpan="6"><Empty icon="book" text="No reconciliations yet for this account" /></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ---- Account add/edit ---- */
function AccountFormModal({ acct, onSave, onClose }) {
  const D = BCCWE;
  const editing = !!acct;
  const sys = editing && SYSTEM_ACCTS.includes(String(acct.code));
  const [code, setCode] = useState(editing ? String(acct.code) : "");
  const [name, setName] = useState(editing ? acct.name : "");
  const [type, setType] = useState(editing ? acct.type : "Expense");
  const codeClash = !editing && D.accounts.some((a) => String(a.code) === code.trim());
  const valid = name.trim() && (editing || (code.trim() && !codeClash));
  return (
    <Modal title={editing ? "Edit account — " + acct.code : "New account"} onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={() => onSave({ code: code.trim(), name: name.trim(), type }, acct)}>{editing ? "Save changes" : "Add account"}</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Account code" required hint={editing ? "Codes can't change — postings reference them" : "e.g. 1600, 6950 — pick the range that matches the type"}>
          <input value={code} readOnly={editing} className={editing ? "ro" : ""} placeholder="e.g. 6950" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Type" hint={sys ? "System account — type is fixed" : "Where it sits on the statements"}>
          {sys ? <input value={type} readOnly className="ro" />
            : <select value={type} onChange={(e) => setType(e.target.value)}>{ACCT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>}
        </Field>
      </div>
      <Field label="Account name" required><input value={name} placeholder="e.g. Vehicle Expenses" onChange={(e) => setName(e.target.value)} /></Field>
      {codeClash && <div className="inline-note"><Icon name="alert" size={15} /> Account code {code.trim()} already exists.</div>}
    </Modal>
  );
}

/* ---- Manual journal entry ---- */
function ManualJEModal({ onSave, onClose }) {
  const D = BCCWE;
  const [date, setDate] = useState(D.today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([
    { id: 1, acct: "1010", dr: "", cr: "" },
    { id: 2, acct: "3000", dr: "", cr: "" },
  ]);
  const uid = useRef(3);
  const upd = (id, patch) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => setLines((ls) => [...ls, { id: uid.current++, acct: (D.accounts[0] || {}).code || "", dr: "", cr: "" }]);
  const rm = (id) => setLines((ls) => (ls.length > 2 ? ls.filter((l) => l.id !== id) : ls));
  const dr = lines.reduce((s, l) => s + (parseFloat(l.dr) || 0), 0);
  const cr = lines.reduce((s, l) => s + (parseFloat(l.cr) || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0.005;
  const valid = balanced && memo.trim() && date;
  function submit() {
    if (!valid) return;
    const nm = (c) => { const a = D.accounts.find((x) => x.code === c); return a ? a.name : c; };
    onSave({
      id: "MJE-" + Date.now().toString(36).toUpperCase().slice(-6),
      date, memo: memo.trim(), manual: true,
      lines: lines.filter((l) => (parseFloat(l.dr) || 0) > 0 || (parseFloat(l.cr) || 0) > 0)
        .map((l) => ({ acct: l.acct, name: nm(l.acct), dr: +(parseFloat(l.dr) || 0).toFixed(2), cr: +(parseFloat(l.cr) || 0).toFixed(2) })),
    });
  }
  return (
    <Modal title="Manual journal entry" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Post entry</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Date" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Memo / reason" required><input value={memo} placeholder="e.g. Bank balance correction, equipment purchase…" onChange={(e) => setMemo(e.target.value)} /></Field>
      </div>
      <table className="data-table compact">
        <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <select value={l.acct} onChange={(e) => upd(l.id, { acct: e.target.value })}>
                  {D.accounts.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
                </select>
              </td>
              <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.dr} placeholder="0.00" onChange={(e) => upd(l.id, { dr: e.target.value, cr: e.target.value ? "" : l.cr })} /></td>
              <td className="r"><input className="r purch-in" type="number" min="0" step="0.01" value={l.cr} placeholder="0.00" onChange={(e) => upd(l.id, { cr: e.target.value, dr: e.target.value ? "" : l.dr })} /></td>
              <td><button className="icon-btn" title="Remove line" onClick={() => rm(l.id)}><Icon name="x" size={14} /></button></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>Totals</td><td className="r mono">{fmtPlain(dr)}</td><td className="r mono">{fmtPlain(cr)}</td><td /></tr></tfoot>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <Btn variant="ghost" size="sm" icon="plus" onClick={add}>Add line</Btn>
        <Badge tone={balanced ? "green" : "red"} dot>{balanced ? "Balanced" : "Debits must equal credits"}</Badge>
      </div>
      <div className="inline-note" style={{ marginTop: 10 }}>
        <Icon name="check" size={15} /> Manual entries adjust the Chart of accounts, Trial balance and Balance sheet.
        The Income Statement stays transaction-based (invoices, sales, expenses).
      </div>
    </Modal>
  );
}

/* ---- Guided opening-balance adjustment (one balanced manual entry) ---- */
function OpeningBalancesModal({ store, onSave, onClose }) {
  const D = BCCWE;
  const live = liveAccountBalances(store || "all");
  const rows0 = D.accounts.filter((a) => a.type === "Asset" || a.type === "Liability")
    .map((a) => ({ code: a.code, name: a.name, type: a.type, current: +((live[a.code] || 0)).toFixed(2) }));
  const [date, setDate] = useState(D.today);
  const [vals, setVals] = useState(() => { const m = {}; rows0.forEach((r) => { m[r.code] = String(r.current); }); return m; });
  const deltas = rows0
    .map((r) => ({ ...r, target: parseFloat(vals[r.code]) || 0 }))
    .map((r) => ({ ...r, delta: +(r.target - r.current).toFixed(2) }))
    .filter((r) => Math.abs(r.delta) > 0.005);
  // Build the balanced entry: each account moves to its target; the net
  // difference offsets to 3000 Owner's Equity (the standard opening treatment).
  let net = 0; // running debits − credits
  const jl = [];
  deltas.forEach((r) => {
    if (r.type === "Asset") {
      if (r.delta > 0) jl.push({ acct: r.code, dr: r.delta, cr: 0 }); else jl.push({ acct: r.code, dr: 0, cr: -r.delta });
      net += r.delta;
    } else {
      if (r.delta > 0) jl.push({ acct: r.code, dr: 0, cr: r.delta }); else jl.push({ acct: r.code, dr: -r.delta, cr: 0 });
      net -= r.delta;
    }
  });
  if (Math.abs(net) > 0.005) jl.push(net > 0 ? { acct: "3000", dr: 0, cr: +net.toFixed(2) } : { acct: "3000", dr: +(-net).toFixed(2), cr: 0 });
  const valid = deltas.length > 0;
  function submit() {
    if (!valid) return;
    const nm = (c) => { const a = D.accounts.find((x) => x.code === c); return a ? a.name : c; };
    onSave({
      id: "MJE-" + Date.now().toString(36).toUpperCase().slice(-6),
      date, memo: "Opening balance adjustment", manual: true,
      lines: jl.map((l) => ({ acct: l.acct, name: nm(l.acct), dr: +(+l.dr).toFixed(2), cr: +(+l.cr).toFixed(2) })),
    });
  }
  return (
    <Modal title="Set opening balances" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>Post adjustment{deltas.length ? " (" + deltas.length + " account" + (deltas.length === 1 ? "" : "s") + ")" : ""}</Btn>
      </>}>
      <p className="import-lead">Type each account's <strong>real balance as of the date below</strong>. One balanced journal entry is posted
        moving every changed account to its target; the net difference goes to <strong>3000 Owner's Equity</strong>.
        Perfect after importing history — e.g. set Bank to what's actually in the bank.</p>
      <Field label="As of date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <table className="data-table compact" style={{ marginTop: 10 }}>
        <thead><tr><th>Account</th><th className="r">Current (derived)</th><th className="r">Actual balance</th><th className="r">Adjustment</th></tr></thead>
        <tbody>
          {rows0.map((r) => {
            const target = parseFloat(vals[r.code]) || 0;
            const delta = +(target - r.current).toFixed(2);
            return (
              <tr key={r.code} style={Math.abs(delta) > 0.005 ? { background: "var(--accent-soft, #fff4ec)" } : null}>
                <td><span className="jcode">{r.code}</span> {r.name}</td>
                <td className="r mono muted">{fmt(r.current)}</td>
                <td className="r"><input className="r purch-in" type="number" step="0.01" value={vals[r.code]} onChange={(e) => setVals((m) => ({ ...m, [r.code]: e.target.value }))} /></td>
                <td className="r mono">{Math.abs(delta) > 0.005 ? fmt(delta) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}

/* ---------------- Store-scoped finance (transaction-derived) ---------------- */
// These power the per-store / combined P&L, Balance Sheet and Tax reports.
// "all" = every store the viewer can see (the joint view). A record belongs to
// a store via its companyId; credit notes inherit the store of their invoice.
function storeMatch(rec, filter) {
  return window.STORES ? window.STORES.matches(rec, filter) : true;
}
function cnStoreId(cn) {
  const D = BCCWE;
  const oi = (D.invoices || []).find((i) => i.no === cn.origInv);
  return (oi && oi.companyId) || (window.STORES ? window.STORES.idOf(cn) : "");
}
function cnMatch(cn, filter) {
  if (!filter || filter === "all") return true;
  return cnStoreId(cn) === filter;
}
// Cost side of a credit note: goods coming back reverse COGS (restocked → back
// to stock; defective → reclassified to Loss on Defective Goods 5100), and
// replacement goods sent out on an exchange add COGS. Defective cost comes from
// the defectiveProducts rows the return wrote (ref = the CN number) — captured
// at return time. Seed/legacy CNs have no items[] and contribute nothing.
// Every account the REPORTS must show: the chart of accounts PLUS any code that
// carries a derived balance but is missing from the chart — a deleted account
// still referenced by transactions, a custom expense category pointing at an
// unknown code, or imported data. Reports used to iterate the chart only, so
// that money vanished from the Trial Balance and Balance Sheet and threw them
// out of balance by exactly the hidden amount.
function reportAccounts(bal) {
  const out = (BCCWE.accounts || []).slice();
  const known = {};
  out.forEach((a) => { known[a.code] = true; });
  Object.keys(bal || {}).forEach((code) => {
    if (known[code] || Math.abs(bal[code] || 0) < 0.005) return;
    const d = String(code).charAt(0);
    const type = d === "1" ? "Asset" : d === "2" ? "Liability" : d === "3" ? "Equity" : d === "4" ? "Revenue" : "Expense";
    out.push({ code: code, name: "Unmapped account " + code, type: type, unmapped: true });
  });
  return out.sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
}

// Is this expense a NON-CASH stock write-off (defective / lost stock)? Its cost
// comes out of inventory, so it must not also credit cash or bank. New records
// carry `stockLoss: true`; older ones are recognised by the "Stock adjustment"
// method the write-off screens have always written, or by a category flagged
// `stockLoss` in the expense-category setup.
function isStockLossExpense(e) {
  if (!e) return false;
  if (e.stockLoss) return true;
  if (String(e.method || "") === "Stock adjustment") return true;
  const cat = ((BCCWE.expenseCategories || []).find((c) => c.name === e.category)) || null;
  return !!(cat && cat.stockLoss);
}

function cnCosts(cn) {
  const D = BCCWE;
  // Unit cost for a credit-note line: ALWAYS prefer the cost snapshotted on the
  // line when the return was recorded. Falling back to the item's CURRENT cost
  // (the old behaviour, kept only for records saved before snapshots existed)
  // re-valued historical returns every time an item's cost was edited — the
  // books reversed more or less COGS than the original sale ever charged.
  const unitCost = (l) => {
    if (l && l.cost != null) return l.cost || 0;
    const it = (D.inventory || []).find((x) => x.code === (l && l.code));
    return it ? (it.cost || 0) : 0;
  };
  let restock = 0, defect = 0, exchangeOut = 0;
  if (cn.retDisp === "Inventory") (cn.items || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    restock += unitCost(l) * l.qty;
  });
  if (cn.retDisp === "Defected") (D.defectiveProducts || []).forEach((d) => {
    if (d.ref === cn.no) defect += d.costLoss || 0;
  });
  (cn.exchangeItems || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    exchangeOut += unitCost(l) * l.qty;
  });
  return { restock, defect, exchangeOut };
}
function storeFinance(filter, range) {
  const D = BCCWE;
  // Optional `range` {from,to} — when given, only records dated inside it count
  // (powers the Month/Quarter/Year period chips on Reports).
  const inR = (d) => !range || inRange(d || "", range);
  let revenue = 0, cogs = 0, gst = 0, pst = 0, restock = 0, writeOff = 0, gstITC = 0;
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter) || !inR(i.date)) return;
    if (i.kind === "order") return; // order invoices aren't sales yet — no revenue
    // Net-of-tax consideration = subtotal − invoice-level discount + charges.
    // Using i.subtotal alone overstated revenue by every discount and dropped
    // charge income, so the P&L disagreed with the Trial Balance (4000/4010).
    revenue += (i.total || 0) - (i.gst || 0) - (i.pst || 0);
    gst += i.gst || 0; pst += i.pst || 0;
    (deriveLines(i) || []).forEach((l) => { cogs += (l.qty || 0) * (l.cost || 0); });
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter) || !inR(cn.date)) return;
    revenue += cn.subtotal || 0;   // negative on returns → reduces revenue
    gst += cn.gst || 0; pst += cn.pst || 0;
    restock += cn.restockingFee || 0;
    const cc = cnCosts(cn);
    cogs += cc.exchangeOut - cc.restock - cc.defect; // goods back reverse COGS; replacements out add it
    writeOff += cc.defect;                            // defective cost reclassified to 5100
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter) || !inR(s.date)) return;
    revenue += s.subtotal != null ? s.subtotal : (s.total || 0);
    gst += s.gst || 0; pst += s.pst || 0; restock += s.restockingFee || 0;
    cogs += (s.cogs || 0) - (s.defLoss || 0); // defective units reclassify out of COGS…
    writeOff += s.defLoss || 0;               // …into write-off losses
  });
  const opexByName = {}; let opex = 0;
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter) || !inR(e.date)) return;
    // Expense amounts are entered PRE-tax (see seed JE-2049). BC PST on inputs
    // is not recoverable → it is part of the cost; GST paid is an input tax
    // credit claimed against GST collected (shown on the tax report).
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
    const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
    const cost = (e.amount || 0) + pstPaid;
    const cat = e.category || "Other";
    opexByName[cat] = (opexByName[cat] || 0) + cost;
    opex += cost;
    gstITC += gstPaid;
  });
  const grossProfit = revenue - cogs;
  const netIncome = grossProfit + restock - opex - writeOff;
  return { revenue, cogs, grossProfit, opex, opexByName, restock, gst, pst, netIncome, writeOff, gstITC };
}
function storeBalances(filter) {
  const D = BCCWE;
  let cash = 0, ar = 0, taxPay = 0, deposits = 0;
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    const paid = i.paid || 0;
    if (i.kind === "order") { cash += paid; deposits += paid; return; } // deposit held as liability
    cash += paid; // refunds are subtracted once, in the credit-note loop below (was double-counted here)
    ar += Math.max(0, (i.total || 0) - paid);
    deposits += Math.max(0, paid - (i.total || 0)); // overpayment kept as customer credit (liability)
    taxPay += (i.gst || 0) + (i.pst || 0);
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    cash -= cn.refundPaid != null ? cn.refundPaid : (cn.refund || 0);
    taxPay += (cn.gst || 0) + (cn.pst || 0);
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    cash += s.paid != null ? s.paid : (s.total || 0); // only collected cash hits the till
    ar += s.owed || 0;                                 // "on account" register sales are receivables
    taxPay += (s.gst || 0) + (s.pst || 0);
  });
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    // GST paid on expenses is an input tax credit → reduces net tax payable,
    // matching the 2100 posting in liveAccountBalances so the Balance Sheet and
    // Chart of Accounts agree. (BC PST paid is not recoverable.)
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    if (m) taxPay -= (e.amount || 0) * (m.gst || 0);
  });
  // Inventory is held company-wide, so it's only shown in the combined view.
  const inventory = filter === "all" || !filter
    ? (D.inventory || []).reduce((s, it) => s + (it.stock || 0) * (it.cost || 0), 0) : 0;
  // Supplier payables: landed value of goods received minus payments made on
  // each order (matches the 2000 posting in liveAccountBalances). ADJ/OPEN
  // pseudo-orders are opening-stock entries with no supplier bill.
  let payables = 0;
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const pay = (po.payment && +po.payment.amount) || 0;
    payables += poBilledValue(po) - pay;
  });
  // No Math.max(0,…) clamp: after netting input tax credits a return-heavy or
  // high-purchase period can legitimately leave a net GST *receivable* (negative
  // payable). Clamping it to 0 hid that asset and made the Balance Sheet disagree
  // with the Chart of Accounts (2100/2110).
  return { cash, ar, inventory, taxPay, deposits, payables };
}
function storeLabel(filter) {
  if (!filter || filter === "all") return "All stores (combined)";
  return (window.STORES && window.STORES.nameOf(filter)) || "Store";
}

// Granular accounting-module permission (admin always allowed; roles without a
// permission record are not locked out — same policy as navAllowed).
function acctCan(perm) {
  if (window.STORES && window.STORES.isAdmin()) return true;
  const sess = window.__session || {};
  const roles = BCCWE.roles || [];
  const role = roles.find((r) => r.id === sess.roleId) || roles.find((r) => r.name === sess.role);
  const p = role && role.perms && role.perms.accounting;
  if (!p) return true;
  return !!p[perm];
}
function sessionWho() {
  const s = window.__session || {};
  return s.name || s.userId || "";
}

// Stable identity for a derived ledger line, so a bank reconciliation can mark
// lines cleared even though the ledger is recomputed on every load. The key is
// the line's own facts plus an occurrence index (two identical payments on the
// same day get distinct keys deterministically, because ledgerLines sorts by
// date with a stable sort). If a source document is edited, its line's key
// changes and the line correctly reverts to "uncleared".
function reconKeyedLines(lines) {
  const seen = {};
  return (lines || []).map((l) => {
    const base = l.date + "|" + (l.memo || "") + "|" + (+l.dr || 0).toFixed(2) + "|" + (+l.cr || 0).toFixed(2);
    const n = (seen[base] = (seen[base] || 0) + 1);
    return Object.assign({}, l, { key: base + "|" + n });
  });
}

// What the supplier is actually owed for the goods RECEIVED on an order.
//
// Free "bonus" units are not billed — their cost is absorbed into the landed
// cost of the paid units, which makes `landedUnit` lower than the price per
// billed unit. Valuing the payable at landedUnit × received-qty therefore
// understated the bill by the whole bonus share (10 units at $10 with 2 free
// and $12 freight = $112 owed, but only $93.30 recorded), and the difference
// leaked into Retained Earnings as profit that was never made.
//
// Modern orders carry each line's base `cost` plus its allocated `charge`, so
// the bill is priced directly. Older single-line records don't separate the two,
// but do store the supplier total, so that is prorated by how much arrived.
function poBilledValue(po) {
  const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
  if (!pls || !pls.length) return 0;
  const detailed = pls.some((l) => l && l.charge != null) || pls.length > 1;
  if (detailed) {
    return pls.reduce((s, l) => {
      const qty = l.qty || 0, recv = l.qtyReceived || 0;
      if (recv <= 0) return s;
      const unit = l.cost != null ? l.cost : (l.landedUnit || 0);
      const pct = qty > 0 ? Math.min(1, recv / qty) : 0;
      return s + recv * unit + pct * (l.charge || 0);
    }, 0);
  }
  const l = pls[0];
  const qty = l.qty || 0, recv = l.qtyReceived || 0;
  if (recv <= 0) return 0;
  if (po.total != null && qty > 0) return (+po.total || 0) * Math.min(1, recv / qty);
  return recv * (l.landedUnit != null ? l.landedUnit : (l.cost || 0));
}

// Per-purchase-order open supplier balances — the same math that puts 2000
// Accounts Payable on the Balance Sheet, kept as rows so the A/P report and
// the balance always agree. Negative balance = prepayment to the supplier.
function supplierPayableRows(filter) {
  const D = BCCWE;
  const out = [];
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const pay = (po.payment && +po.payment.amount) || 0;
    const recvVal = poBilledValue(po);
    const bal = +(recvVal - pay).toFixed(2);
    if (Math.abs(bal) < 0.005) return;
    out.push({ ref: po.ref || po.po, supplier: po.supplier || "", date: po.date || "", recvVal: +recvVal.toFixed(2), paid: +pay.toFixed(2), bal });
  });
  return out;
}

// Do two date ranges {from,to} overlap? Used to warn when a GST/PST period
// being filed intersects a period already marked as filed.
function rangesOverlap(a, b) {
  return a.from <= b.to && b.from <= a.to;
}

// Live account balances, recomputed from every transaction so the ledger,
// chart of accounts and trial balance update the moment an invoice, return,
// payment or expense is recorded. Retained Earnings (3900) absorbs any rounding
// so the trial balance always balances.
function liveAccountBalances(filter) {
  const D = BCCWE;
  const bal = {};
  (D.accounts || []).forEach((a) => { bal[a.code] = 0; });
  const add = (code, amt) => { if (!code) return; bal[code] = (bal[code] || 0) + (amt || 0); };
  // Payment records carry their own Cash-vs-Bank account — index them by invoice
  // so collected money routes per payment instead of all-by-invoice-payMethod.
  const payByInv = {};
  (D.payments || []).forEach((p) => { (payByInv[p.inv] = payByInv[p.inv] || []).push(p); });
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    if (i.kind === "order") { // deposit only: held as a liability, not revenue
      const dep = i.paid || 0;
      add(i.payMethod === "Cash" ? "1000" : "1010", dep);
      add("2200", dep);
      return;
    }
    let cogs = 0, goods = 0, svc = 0;
    (deriveLines(i) || []).forEach((l) => {
      cogs += (l.qty || 0) * (l.cost || 0);
      const lt = (l.qty || 0) * (l.price || 0) * (1 - ((l.disc || 0) / 100));
      if (String(l.code || "").startsWith("SVC")) svc += lt; else goods += lt;
    });
    const cl = (D.clients || []).find((c) => c.id === i.clientId);
    const sub = i.subtotal || 0;
    const lineSum = goods + svc;
    const goodsRev = lineSum > 0 ? sub * (goods / lineSum) : sub;
    const svcRev = sub - goodsRev;
    const otherRev = (i.total || 0) - sub - (i.gst || 0) - (i.pst || 0); // charges / rounding
    add(cl && cl.type === "Wholesale" ? "4010" : "4000", goodsRev + otherRev);
    add("4100", svcRev);
    add("5000", cogs);
    add("1300", -cogs);
    add("2100", i.gst || 0); add("2110", i.pst || 0);
    add("1200", Math.max(0, (i.total || 0) - (i.paid || 0)));
    // Route collected money per payment record (each carries its Cash/Bank acct);
    // any remainder not covered by payment records falls back to the invoice's
    // payMethod. Refunds are removed once, in the credit-note loop.
    let routed = 0;
    (payByInv[i.no] || []).forEach((p) => {
      const left = (i.paid || 0) - routed;
      if (left <= 0) return;
      const amt = Math.min(p.amount || 0, left);
      add(p.acct === "1000" ? "1000" : "1010", amt);
      routed += amt;
    });
    const rem = (i.paid || 0) - routed;
    if (rem > 0.005) add(i.payMethod === "Cash" ? "1000" : "1010", rem);
    add("2200", Math.max(0, (i.paid || 0) - (i.total || 0)));   // overpayment kept as a customer-credit liability
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    add("4000", cn.subtotal || 0);            // negative on returns
    add("2100", cn.gst || 0); add("2110", cn.pst || 0); // negative → reduces tax payable
    add("4200", cn.restockingFee || 0);
    const rPaid = cn.refundPaid != null ? cn.refundPaid : (cn.refund || 0);
    add(cn.refundAccount || "1010", -rPaid);
    const cc = cnCosts(cn);
    add("5000", cc.exchangeOut - cc.restock - cc.defect); // reverse COGS on goods back; add for replacements out
    add("5100", cc.defect);                               // defective cost reclassified to loss
  });
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    // Amounts are pre-tax: PST folds into the expense cost (not recoverable in
    // BC); GST paid is an input tax credit that reduces GST Payable; the full
    // tax-inclusive amount leaves the bank/cash account. (Matches seed JE-2049.)
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
    const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
    add(e.acct || "6900", (e.amount || 0) + pstPaid);
    add("2100", -gstPaid);
    // A stock write-off is a NON-CASH expense: the value leaves inventory (the
    // 1300 snapshot already reflects the reduced stock), so no money leaves the
    // bank. Crediting cash here overstated bank outflow by every write-off.
    if (!isStockLossExpense(e)) add(e.paidFrom || "1010", -((e.amount || 0) + gstPaid + pstPaid));
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    const collected = s.paid != null ? s.paid : (s.total || 0);
    // Register methods are display labels ("Cash refund", "Debit · partial (…)")
    // — prefix-match Cash so cash refunds don't land in the bank account.
    add(String(s.method || "").toLowerCase().indexOf("cash") === 0 ? "1000" : "1010", collected);
    add("1200", s.owed || 0); // "on account" register sales are receivables, not cash
    if (s.subtotal != null) {
      add("4000", s.subtotal); add("2100", s.gst || 0); add("2110", s.pst || 0); add("4200", s.restockingFee || 0);
    } else {
      add("4000", s.total || 0);
    }
    const sCogs = (s.cogs || 0) - (s.defLoss || 0); // defective units reclassify from COGS…
    if (sCogs) { add("5000", sCogs); add("1300", -sCogs); }
    if (s.defLoss) add("5100", s.defLoss);          // …to Loss on Defective Goods
  });
  // Purchases finally touch the books: received goods accrue a supplier payable
  // (2000) at landed value, and payments made on the order leave cash. ADJ/OPEN
  // pseudo-orders (opening stock entered on the item form) carry no supplier
  // bill, so they're skipped. Negative net = prepayment to the supplier.
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const pay = (po.payment && +po.payment.amount) || 0;
    if (pay > 0) add((po.payment && po.payment.account) === "1000" ? "1000" : "1010", -pay);
    add("2000", poBilledValue(po) - pay);
  });
  // Inventory is held company-wide → only shown in the combined view.
  bal["1300"] = (filter === "all" || !filter)
    ? (D.inventory || []).reduce((x, it) => x + (it.stock || 0) * (it.cost || 0), 0) : 0;
  // MANUAL journal entries (posted from Accounting) are the one kind of journal
  // record the engine reads — opening balances and corrections. System-generated
  // entries (register/POS) are display records whose effects are already derived
  // from the transactions above; folding them in would double-count. Applied
  // after the 1300 snapshot so a deliberate inventory-valuation adjustment sticks.
  const _mTypeOf = {}; (D.accounts || []).forEach((a) => { _mTypeOf[a.code] = a.type; });
  (D.journal || []).forEach((je) => {
    if (!je || !je.manual) return;
    (je.lines || []).forEach((l) => {
      const debitNormal = _mTypeOf[l.acct] === "Asset" || _mTypeOf[l.acct] === "Expense";
      add(l.acct, debitNormal ? (l.dr || 0) - (l.cr || 0) : (l.cr || 0) - (l.dr || 0));
    });
  });
  // Balance the books: plug the net into Retained Earnings.
  // NOTE: this stays a full plug until Phase 8 makes purchases/receiving post to
  // Inventory (1300). Today 1300 is overwritten with a stock snapshot (below) that
  // is disconnected from the COGS flow, so the residual is legitimately large and
  // must not be surfaced as an "out of balance" error yet.
  // Normal side per account. A code that carries a balance but is NOT in the
  // chart (deleted account, custom category with an unknown code) was treated as
  // credit-normal here, so the Retained-Earnings plug was wrong by twice that
  // balance. Infer the side from the code's leading digit instead — the same
  // rule reportAccounts uses, so the engine and the statements agree.
  const typeOf = {}; (D.accounts || []).forEach((a) => { typeOf[a.code] = a.type; });
  const isDebitNormal = (code) => {
    const t = typeOf[code];
    if (t) return t === "Asset" || t === "Expense";
    const d = String(code).charAt(0);
    return d === "1" || d === "5" || d === "6" || d === "7" || d === "8" || d === "9";
  };
  let dr = 0, cr = 0;
  Object.keys(bal).forEach((code) => {
    if (isDebitNormal(code)) dr += bal[code]; else cr += bal[code];
  });
  if (bal["3900"] === undefined) bal["3900"] = 0;
  bal["3900"] += (dr - cr);
  return bal;
}

/* ---------------- Per-account ledger detail ---------------- */
// The SAME postings liveAccountBalances makes, emitted as dated lines so the
// General Ledger shows real activity with a running balance that TIES to the
// derived figure. Keep the two functions in lockstep when editing either.
// Exceptions that can't tie: 1300 (stock snapshot) and 3900 (the plug) — only
// their manual-entry lines appear.
function ledgerLines(filter) {
  const D = BCCWE;
  const out = {};
  // `ref` (optional) is a hash route to the source document ("invoiceview/INV-1047",
  // "po/PO-341") so drill-down views can link each line to where it came from.
  const push = (code, date, memo, dr, cr, ref) => {
    if (!code) return;
    dr = dr || 0; cr = cr || 0;
    if (Math.abs(dr) < 0.005 && Math.abs(cr) < 0.005) return;
    (out[code] = out[code] || []).push({ date: date || "", memo, dr, cr, ref: ref || "" });
  };
  // signed helper: positive → one side, negative → the other
  const pushS = (code, date, memo, amt, side, ref) => {
    if (amt >= 0) { side === "dr" ? push(code, date, memo, amt, 0, ref) : push(code, date, memo, 0, amt, ref); }
    else { side === "dr" ? push(code, date, memo, 0, -amt, ref) : push(code, date, memo, -amt, 0, ref); }
  };
  const payByInv = {};
  (D.payments || []).forEach((p) => { (payByInv[p.inv] = payByInv[p.inv] || []).push(p); });
  (D.invoices || []).forEach((i) => {
    if (!storeMatch(i, filter)) return;
    if (i.kind === "order") {
      const dep = i.paid || 0;
      push(i.payMethod === "Cash" ? "1000" : "1010", i.date, "Deposit — order " + i.no, dep, 0, "invoiceview/" + i.no);
      push("2200", i.date, "Customer deposit — " + i.no, 0, dep, "invoiceview/" + i.no);
      return;
    }
    let cogs = 0, goods = 0, svc = 0;
    (deriveLines(i) || []).forEach((l) => {
      cogs += (l.qty || 0) * (l.cost || 0);
      const lt = (l.qty || 0) * (l.price || 0) * (1 - ((l.disc || 0) / 100));
      if (String(l.code || "").startsWith("SVC")) svc += lt; else goods += lt;
    });
    const cl = (D.clients || []).find((c) => c.id === i.clientId);
    const sub = i.subtotal || 0;
    const lineSum = goods + svc;
    const goodsRev = lineSum > 0 ? sub * (goods / lineSum) : sub;
    const svcRev = sub - goodsRev;
    const otherRev = (i.total || 0) - sub - (i.gst || 0) - (i.pst || 0);
    const iref = "invoiceview/" + i.no;
    pushS(cl && cl.type === "Wholesale" ? "4010" : "4000", i.date, "Invoice " + i.no, goodsRev + otherRev, "cr", iref);
    pushS("4100", i.date, "Invoice " + i.no + " — services", svcRev, "cr", iref);
    push("5000", i.date, "COGS — " + i.no, cogs, 0, iref);
    push("2100", i.date, "GST — " + i.no, 0, i.gst || 0, iref);
    push("2110", i.date, "PST — " + i.no, 0, i.pst || 0, iref);
    push("1200", i.date, "Invoice " + i.no, i.total || 0, 0, iref);
    // Collected money: per payment record, remainder at the invoice date. A/R
    // credit is capped at the invoice total; any excess is a customer credit
    // (2200) — exactly the engine's clamps.
    const cap = i.paid || 0;
    let routed = 0, arLeft = i.total || 0;
    const applyPay = (amt, date, acct, memo) => {
      if (amt <= 0) return;
      push(acct, date, memo, amt, 0, iref);
      const arCr = Math.min(amt, arLeft); arLeft -= arCr;
      push("1200", date, memo, 0, arCr, iref);
      if (amt - arCr > 0.005) push("2200", date, "Customer credit — " + i.no, 0, amt - arCr, iref);
    };
    (payByInv[i.no] || []).forEach((p) => {
      const left = cap - routed; if (left <= 0) return;
      const amt = Math.min(p.amount || 0, left);
      applyPay(amt, p.date || i.date, p.acct === "1000" ? "1000" : "1010", "Payment — " + i.no);
      routed += amt;
    });
    if (cap - routed > 0.005) applyPay(cap - routed, i.date, i.payMethod === "Cash" ? "1000" : "1010", "Payment — " + i.no);
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, filter)) return;
    const lbl = (cn.type === "Exchange" ? "Exchange " : "Return ") + cn.no;
    pushS("4000", cn.date, lbl, cn.subtotal || 0, "cr");
    pushS("2100", cn.date, "GST — " + cn.no, cn.gst || 0, "cr");
    pushS("2110", cn.date, "PST — " + cn.no, cn.pst || 0, "cr");
    push("4200", cn.date, "Restocking fee — " + cn.no, 0, cn.restockingFee || 0);
    const rPaid = cn.refundPaid != null ? cn.refundPaid : (cn.refund || 0);
    push(cn.refundAccount || "1010", cn.date, "Refund — " + cn.no, 0, rPaid);
    const cc = cnCosts(cn);
    pushS("5000", cn.date, "COGS — " + cn.no, cc.exchangeOut - cc.restock - cc.defect, "dr");
    push("5100", cn.date, "Defective write-off — " + cn.no, cc.defect, 0);
  });
  (D.expenses || []).forEach((e) => {
    if (!storeMatch(e, filter)) return;
    const m = (D.TAX && D.TAX.modes && D.TAX.modes[e.tax]) || null;
    const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
    const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
    const lbl = "Expense — " + (e.desc || e.category || "");
    push(e.acct || "6900", e.date, lbl, (e.amount || 0) + pstPaid, 0);
    push("2100", e.date, "GST input credit — " + (e.category || ""), gstPaid, 0);
    // Non-cash write-off: value leaves inventory, not the bank (see engine note).
    if (!isStockLossExpense(e)) push(e.paidFrom || "1010", e.date, lbl, 0, (e.amount || 0) + gstPaid + pstPaid);
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, filter)) return;
    const lbl = (s.kind || "Sale") + " (register)" + (s.item ? " — " + s.item : "");
    const collected = s.paid != null ? s.paid : (s.total || 0);
    pushS(String(s.method || "").toLowerCase().indexOf("cash") === 0 ? "1000" : "1010", s.date, lbl, collected, "dr");
    push("1200", s.date, lbl + " · on account", s.owed || 0, 0);
    if (s.subtotal != null) {
      pushS("4000", s.date, lbl, s.subtotal, "cr");
      pushS("2100", s.date, "GST — register", s.gst || 0, "cr");
      pushS("2110", s.date, "PST — register", s.pst || 0, "cr");
      push("4200", s.date, "Restocking fee — register", 0, s.restockingFee || 0);
    } else {
      pushS("4000", s.date, lbl, s.total || 0, "cr");
    }
    pushS("5000", s.date, "COGS — register", (s.cogs || 0) - (s.defLoss || 0), "dr");
    push("5100", s.date, "Defective write-off — register", s.defLoss || 0, 0);
  });
  (D.purchaseOrders || []).forEach((po) => {
    if (!storeMatch(po, filter)) return;
    if (/^(ADJ|OPEN)-/.test(String(po.po || po.ref || ""))) return;
    const ref = po.ref || po.po;
    const poRef = "po/" + ref;
    const pay = (po.payment && +po.payment.amount) || 0;
    if (pay > 0) {
      push((po.payment && po.payment.account) === "1000" ? "1000" : "1010", po.date, "Supplier payment — " + ref, 0, pay, poRef);
      push("2000", po.date, "Supplier payment — " + ref, pay, 0, poRef);
    }
    push("2000", po.date, "Goods received — " + ref, 0, poBilledValue(po), poRef);
  });
  (D.journal || []).forEach((je) => {
    if (!je || !je.manual) return;
    (je.lines || []).forEach((l) => push(l.acct, je.date, "Manual — " + je.memo, l.dr || 0, l.cr || 0));
  });
  Object.keys(out).forEach((code) => out[code].sort((a, b) => String(a.date).localeCompare(String(b.date))));
  return out;
}

/* ---------------- Report drill-down ----------------
   Clicking a line on the P&L or Balance Sheet swaps the report pane for this
   view: every dated transaction behind that number, with links to the source
   invoice / purchase order, honouring the current store and period filters. */
function ReportDrill({ spec, store, range, onBack, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const subtitle = spec.asOf ? "as of " + shortDate(D.today) : (range ? range.label : "All time");

  // ---- Expense-record detail (P&L operating-expense rows) ----
  if (spec.kind === "expcat") {
    const modes = (D.TAX && D.TAX.modes) || {};
    const rows = (D.expenses || [])
      .filter((e) => storeMatch(e, sf)
        && (!spec.cat || (e.category || "Other") === spec.cat)
        && (!range || inRange(e.date || "", range)))
      .map((e) => {
        const m = modes[e.tax] || null;
        const gstPaid = m ? (e.amount || 0) * (m.gst || 0) : 0;
        const pstPaid = m ? (e.amount || 0) * (m.pst || 0) : 0;
        return { ...e, gstPaid, pstPaid, cost: (e.amount || 0) + pstPaid, paidTotal: (e.amount || 0) + gstPaid + pstPaid };
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const acctName = (code) => { const a = (D.accounts || []).find((x) => x.code === code); return a ? code + " · " + a.name : (code || "—"); };
    return (
      <div className="statement">
        <div className="drill-head">
          <Btn variant="ghost" size="sm" icon="chevron" onClick={onBack}>Back to report</Btn>
          <div><h3 className="stmt-title">{spec.title}</h3><span className="muted">{storeLabel(sf)} · {subtitle} · {rows.length} expense{rows.length === 1 ? "" : "s"}</span></div>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Description</th>{!spec.cat && <th>Category</th>}<th className="r">Pre-tax</th><th className="r">PST (in cost)</th><th className="r">GST credit</th><th className="r">Expense cost</th><th className="r">Paid</th><th>Paid from</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i}>
                <td className="muted">{shortDate(e.date)}</td>
                <td>{e.desc || e.category || "—"}</td>
                {!spec.cat && <td className="muted">{e.category || "Other"}</td>}
                <td className="r mono">{fmtPlain(e.amount || 0)}</td>
                <td className="r mono">{e.pstPaid > 0.005 ? fmtPlain(e.pstPaid) : "—"}</td>
                <td className="r mono">{e.gstPaid > 0.005 ? fmtPlain(e.gstPaid) : "—"}</td>
                <td className="r mono strong">{fmtPlain(e.cost)}</td>
                <td className="r mono">{fmtPlain(e.paidTotal)}</td>
                <td className="muted">{acctName(e.paidFrom || "1010")}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={spec.cat ? 8 : 9}><Empty icon="receipt" text="No expenses in this period" /></td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td /><td className="strong">Total</td>{!spec.cat && <td />}
              <td className="r mono">{fmtPlain(sum("amount"))}</td>
              <td className="r mono">{fmtPlain(sum("pstPaid"))}</td>
              <td className="r mono">{fmtPlain(sum("gstPaid"))}</td>
              <td className="r mono strong">{fmtPlain(sum("cost"))}</td>
              <td className="r mono">{fmtPlain(sum("paidTotal"))}</td><td /></tr></tfoot>
          )}
        </table>
        <div className="stmt-note">Expense cost includes BC PST (not recoverable); GST paid is claimed as an input tax credit on the GST/PST report. Manage records on the Expenses page.</div>
      </div>
    );
  }

  // ---- Ledger-line detail (accounts) ----
  const lines = ledgerLines(sf);
  const typeOf = {}; const nameOf = {};
  (D.accounts || []).forEach((a) => { typeOf[a.code] = a.type; nameOf[a.code] = a.name; });
  const codes = spec.codes || [];
  const multi = codes.length > 1;
  let rows = [];
  codes.forEach((code) => (lines[code] || []).forEach((l) => rows.push({ ...l, code })));
  if (!spec.asOf && range) rows = rows.filter((l) => inRange(l.date, range));
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Net per row: "dr" = debit-normal (costs, assets), otherwise credit-normal.
  // For the mixed net-income view credit-normal is also correct: expenses post
  // debits, so cr − dr is their negative contribution to income.
  const signOf = (l) => spec.mode === "dr" ? l.dr - l.cr : l.cr - l.dr;
  let run = 0;
  const view = rows.map((l) => { run += signOf(l); return { ...l, run }; });
  const totDr = rows.reduce((s, l) => s + l.dr, 0), totCr = rows.reduce((s, l) => s + l.cr, 0);
  const special = codes.filter((c) => c === "1300" || c === "3900");
  return (
    <div className="statement">
      <div className="drill-head">
        <Btn variant="ghost" size="sm" icon="chevron" onClick={onBack}>Back to report</Btn>
        <div><h3 className="stmt-title">{spec.title}</h3><span className="muted">{storeLabel(sf)} · {subtitle} · {view.length} line{view.length === 1 ? "" : "s"}</span></div>
      </div>
      {special.length > 0 && (
        <div className="inline-note" style={{ marginBottom: 10 }}>
          <Icon name="alert" size={15} /> {special.includes("1300")
            ? "1300 Inventory is valued as a live stock snapshot (units × cost) — only manual valuation adjustments appear as lines, so the lines below may not add up to the balance."
            : "3900 Retained Earnings accumulates net income from all activity — only manual entries appear as lines, so the lines below may not add up to the balance."}
        </div>
      )}
      <table className="data-table">
        <thead><tr><th>Date</th>{multi && <th>Account</th>}<th>Detail</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Running total</th></tr></thead>
        <tbody>
          {view.map((l, i) => (
            <tr key={i}>
              <td className="muted">{shortDate(l.date)}</td>
              {multi && <td className="muted">{l.code} · {nameOf[l.code] || ""}</td>}
              <td>{l.ref && go ? <button className="link" onClick={() => go(l.ref)}>{l.memo}</button> : l.memo}</td>
              <td className="r mono">{l.dr > 0.005 ? fmtPlain(l.dr) : "—"}</td>
              <td className="r mono">{l.cr > 0.005 ? fmtPlain(l.cr) : "—"}</td>
              <td className="r mono strong">{fmt(l.run)}</td>
            </tr>
          ))}
          {!view.length && <tr><td colSpan={multi ? 6 : 5}><Empty icon="book" text="No activity for this period" /></td></tr>}
        </tbody>
        {view.length > 0 && (
          <tfoot><tr><td />{multi && <td />}<td className="strong">Total ({view.length} line{view.length === 1 ? "" : "s"})</td>
            <td className="r mono">{fmtPlain(totDr)}</td>
            <td className="r mono">{fmtPlain(totCr)}</td>
            <td className="r mono strong">{fmt(run)}</td></tr></tfoot>
        )}
      </table>
      <div className="stmt-note">Every line is a real posting from an invoice, payment, return, register sale, expense, purchase order or manual journal entry. Click a linked detail to open the source document.</div>
    </div>
  );
}

/* ---------------- Reports ---------------- */
function Reports({ store, pushToast, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const [report, setReport] = useState("pl");
  // The period ACTUALLY filters now (previously the chips were decorative).
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState(D.today.slice(0, 4) + "-01-01");
  const [to, setTo] = useState(D.today);
  // Drill-down: a clicked P&L / Balance-Sheet line → the transactions behind it.
  const [drill, setDrill] = useState(null);
  useEffect(() => { setDrill(null); }, [sf]);
  const range = periodRange(period, from, to);
  const dated = report === "pl" || report === "tax" || report === "client"; // BS/TB/Aging are as-of-today

  const reports = [
    { id: "pl", name: "Income Statement (P&L)", ico: "report" },
    { id: "bs", name: "Balance Sheet", ico: "ledger" },
    { id: "tb", name: "Trial Balance", ico: "book" },
    { id: "tax", name: "GST/PST Remittance", ico: "receipt" },
    { id: "aging", name: "Unpaid Invoices (Aging)", ico: "invoice" },
    { id: "ap", name: "Supplier Payables (A/P)", ico: "truck" },
    { id: "client", name: "Income by Client", ico: "people" },
  ];

  function buildReportExport() {
    const money = (n) => +((n || 0)).toFixed(2);
    const safeLbl = String(dated ? range.label : "as of " + BCCWE.today).replace(/[^\w-]+/g, "-");
    if (report === "pl") {
      const f = storeFinance(sf, dated ? range : null);
      const rows = [
        { item: "Sales revenue (net of returns)", amount: money(f.revenue) },
        { item: "Restocking fee income", amount: money(f.restock) },
        { item: "Total revenue", amount: money(f.revenue + f.restock) },
        { item: "Cost of goods sold", amount: money(f.cogs) },
        { item: "Inventory written off", amount: money(f.writeOff) },
        { item: "Gross profit", amount: money(f.grossProfit + f.restock - f.writeOff) },
        ...Object.keys(f.opexByName).sort().map((k) => ({ item: "Expense — " + k, amount: money(f.opexByName[k]) })),
        { item: "Total expenses", amount: money(f.opex) },
        { item: "NET INCOME", amount: money(f.netIncome) },
      ];
      return { filename: "BCCWE-IncomeStatement-" + safeLbl, sheet: "Income Statement",
        cols: [{ key: "item", label: "Item", type: "text" }, { key: "amount", label: "Amount (CAD)", type: "number" }],
        data: rows, opts: { title: "BCCWE — Income Statement", subtitle: storeLabel(sf) + " · " + range.label } };
    }
    if (report === "tb") {
      const live = liveAccountBalances(sf);
      const rows = reportAccounts(live).map((a) => {
        const b = live[a.code] || 0;
        const dn = a.type === "Asset" || a.type === "Expense";
        return { code: a.code, name: a.name + (a.unmapped ? " (not in chart)" : ""), debit: dn ? money(b) : 0, credit: dn ? 0 : money(b) };
      });
      return { filename: "BCCWE-TrialBalance-" + safeLbl, sheet: "Trial Balance",
        cols: [{ key: "code", label: "Code", type: "text" }, { key: "name", label: "Account", type: "text" }, { key: "debit", label: "Debit", type: "number" }, { key: "credit", label: "Credit", type: "number" }],
        data: rows, opts: { title: "BCCWE — Trial Balance", subtitle: storeLabel(sf) + " · as of " + BCCWE.today } };
    }
    if (report === "bs") {
      // Same folded numbers as the on-screen Balance Sheet (earnings into 3900),
      // so the export always balances too.
      const d = balanceSheetData(sf);
      const rows = [];
      d.assets.forEach((a) => rows.push({ type: "Asset", code: a.code, name: a.name, balance: money(a.bal) }));
      d.liabs.forEach((a) => rows.push({ type: "Liability", code: a.code, name: a.name, balance: money(a.bal) }));
      d.equity.forEach((a) => rows.push({ type: "Equity", code: a.code, name: a.name + (a.code === "3900" ? " (incl. accumulated net income)" : ""), balance: money(a.bal) }));
      rows.push({ type: "", code: "", name: "TOTAL ASSETS", balance: money(d.tA) });
      rows.push({ type: "", code: "", name: "LIABILITIES + EQUITY", balance: money(d.tL + d.tE) });
      return { filename: "BCCWE-BalanceSheet-" + safeLbl, sheet: "Balance Sheet",
        cols: [{ key: "type", label: "Section", type: "text" }, { key: "code", label: "Code", type: "text" }, { key: "name", label: "Account", type: "text" }, { key: "balance", label: "Balance", type: "number" }],
        data: rows,
        opts: { title: "BCCWE — Balance Sheet", subtitle: storeLabel(sf) + " · as of " + BCCWE.today } };
    }
    if (report === "tax") {
      const f = storeFinance(sf, dated ? range : null);
      return { filename: "BCCWE-TaxRemittance-" + safeLbl, sheet: "GST-PST",
        cols: [{ key: "item", label: "Item", type: "text" }, { key: "amount", label: "Amount (CAD)", type: "number" }],
        data: [
          { item: "GST collected on sales (net of returns)", amount: money(f.gst) },
          { item: "Less: GST input tax credits (expenses)", amount: money(-f.gstITC) },
          { item: "Net GST due", amount: money(f.gst - f.gstITC) },
          { item: "PST collected", amount: money(f.pst) },
          { item: "TOTAL REMITTANCE DUE", amount: money(f.gst - f.gstITC + f.pst) },
        ], opts: { title: "BCCWE — GST/PST Remittance", subtitle: storeLabel(sf) + " · " + range.label } };
    }
    if (report === "aging") {
      const open = receivableRows(sf);
      return { filename: "BCCWE-ARAging-" + safeLbl, sheet: "A-R Aging",
        cols: [{ key: "no", label: "Document", type: "text" }, { key: "client", label: "Client", type: "text" }, { key: "due", label: "Due", type: "text" }, { key: "balance", label: "Balance", type: "number" }, { key: "status", label: "Status", type: "text" }],
        data: open.map((r) => ({ no: r.no, client: r.clientId ? clientName(r.clientId) : "Walk-in", due: r.due || "", balance: money(r.bal), status: r.status })),
        opts: { title: "BCCWE — A/R Aging", subtitle: storeLabel(sf) + " · as of " + BCCWE.today,
          totals: { balance: money(open.reduce((s, r) => s + r.bal, 0)) } } };
    }
    if (report === "ap") {
      const rows = supplierPayableRows(sf).sort((a, b) => String(a.supplier).localeCompare(String(b.supplier)) || String(a.date).localeCompare(String(b.date)));
      return { filename: "BCCWE-SupplierPayables-" + safeLbl, sheet: "Supplier Payables",
        cols: [{ key: "supplier", label: "Supplier", type: "text" }, { key: "ref", label: "PO", type: "text" }, { key: "date", label: "Date", type: "text" }, { key: "recvVal", label: "Received value", type: "number" }, { key: "paid", label: "Paid", type: "number" }, { key: "bal", label: "Balance owing", type: "number" }],
        data: rows.map((r) => ({ supplier: (typeof supplierName === "function" ? supplierName(r.supplier) : r.supplier) || "(no supplier)", ref: r.ref, date: r.date, recvVal: r.recvVal, paid: r.paid, bal: r.bal })),
        opts: { title: "BCCWE — Supplier Payables (A/P)", subtitle: storeLabel(sf) + " · as of " + BCCWE.today,
          totals: { bal: money(rows.reduce((s, r) => s + r.bal, 0)) } } };
    }
    if (report === "client") {
      const rows = clientRevenueRows(sf, dated ? range : null).sort((a, b) => b.v - a.v);
      return { filename: "BCCWE-IncomeByClient-" + safeLbl, sheet: "Income by Client",
        cols: [{ key: "client", label: "Client", type: "text" }, { key: "revenue", label: "Revenue (pre-tax)", type: "number" }],
        data: rows.map((r) => ({ client: r.name, revenue: money(r.v) })),
        opts: { title: "BCCWE — Income by Client", subtitle: storeLabel(sf) + " · " + range.label,
          totals: { revenue: money(rows.reduce((s, r) => s + r.v, 0)) } } };
    }
    return null;
  }
  function exportExcel() {
    const s = buildReportExport();
    if (!s) return;
    exportXlsx(s.filename, s.sheet, s.cols, s.data, s.opts);
    window.logDownload && window.logDownload({ kind: "XLSX", file: s.filename + ".xlsx" });
    pushToast && pushToast("Exported " + s.filename + ".xlsx");
  }
  function exportPdf() {
    const el = document.querySelector(".report-body");
    if (!el || !window.downloadInvoicePdf) return;
    const name = "BCCWE-" + report + "-report.pdf";
    window.logDownload && window.logDownload({ kind: "PDF", file: name });
    pushToast && pushToast("Generating " + name + "…");
    window.downloadInvoicePdf(el, name, (r) => { pushToast && pushToast(r === "fallback" ? "Use “Save as PDF” in the print dialog" : name + " downloaded"); });
  }

  return (
    <div>
      <PageHead title="Reports" sub={"Financial statements · " + storeLabel(sf) + " · export to PDF or Excel"}
        actions={<>
          <Btn variant="ghost" icon="download" onClick={exportExcel}>Excel / CSV</Btn>
          <Btn variant="primary" icon="download" onClick={exportPdf}>Export PDF</Btn>
        </>} />

      <div className="reports-layout">
        <div className="report-nav">
          {reports.map((r) => (
            <button key={r.id} className={"rnav" + (report === r.id ? " on" : "")} onClick={() => { setReport(r.id); setDrill(null); }}>
              <Icon name={r.ico} size={17} /><span>{r.name}</span>
            </button>
          ))}
        </div>

        <Card pad={false} className="report-pane">
          <div className="report-bar">
            {(drill ? (!drill.asOf && dated) : dated)
              ? <PeriodFilter period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
              : <span className="muted">As of {shortDate(BCCWE.today)}</span>}
            <span className="muted">{storeLabel(sf)}</span>
          </div>
          <div className="report-body">
            {drill ? <ReportDrill spec={drill} store={sf} range={dated ? range : null} onBack={() => setDrill(null)} go={go} />
              : <>
                {report === "pl" && <PLReport store={sf} range={range} onDrill={setDrill} />}
                {report === "bs" && <BalanceSheet store={sf} onDrill={setDrill} />}
                {report === "tb" && <TrialBalance store={sf} />}
                {report === "tax" && <TaxReport store={sf} range={range} period={period} pushToast={pushToast} />}
                {report === "aging" && <AgingReport store={sf} go={go} />}
                {report === "ap" && <APAgingReport store={sf} go={go} />}
                {report === "client" && <ClientReport store={sf} range={range} go={go} />}
              </>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatementRow({ label, value, bold, indent, total, neg, onClick }) {
  return (
    <div className={"stmt-row" + (bold ? " bold" : "") + (total ? " total" : "") + (indent ? " indent" : "") + (onClick ? " click" : "")}
      onClick={onClick} title={onClick ? "Click to see the transactions behind this number" : undefined}>
      <span>{label}{onClick && <Icon name="chevron" size={13} />}</span><span className={"mono" + (neg ? " neg" : "")}>{value}</span>
    </div>
  );
}

function PLReport({ store, range, onDrill }) {
  const sf = store || "all";
  const D = BCCWE;
  const f = storeFinance(sf, range);
  const cats = Object.keys(f.opexByName).filter((k) => Math.abs(f.opexByName[k]) > 0.005).sort();
  // Every row drills into the transactions behind it.
  const acctsOf = (types) => (D.accounts || []).filter((a) => types.includes(a.type)).map((a) => a.code);
  const drill = onDrill || (() => {});
  return (
    <div className="statement">
      <h3 className="stmt-title">Income Statement — {storeLabel(sf)}{range ? " · " + range.label : ""}</h3>
      <div className="stmt-sec">Revenue</div>
      <StatementRow label="Sales revenue (net of returns)" value={fmt(f.revenue)} indent
        onClick={() => drill({ kind: "accounts", title: "Sales revenue (net of returns)", codes: ["4000", "4010", "4100"], mode: "cr" })} />
      {f.restock > 0.005 && <StatementRow label="Restocking fee income" value={fmt(f.restock)} indent
        onClick={() => drill({ kind: "accounts", title: "Restocking fee income", codes: ["4200"], mode: "cr" })} />}
      <StatementRow label="Total revenue" value={fmt(f.revenue + f.restock)} bold
        onClick={() => drill({ kind: "accounts", title: "Total revenue", codes: ["4000", "4010", "4100", "4200"], mode: "cr" })} />
      <div className="stmt-sec">Cost of goods sold</div>
      <StatementRow label="Cost of goods sold" value={fmt(f.cogs)} indent
        onClick={() => drill({ kind: "accounts", title: "Cost of goods sold", codes: ["5000"], mode: "dr" })} />
      {f.writeOff > 0.005 && <StatementRow label="Inventory written off (defective returns)" value={fmt(f.writeOff)} indent
        onClick={() => drill({ kind: "accounts", title: "Inventory written off", codes: ["5100"], mode: "dr" })} />}
      <StatementRow label="Gross profit" value={fmt(f.grossProfit + f.restock - f.writeOff)} bold
        onClick={() => drill({ kind: "accounts", title: "Gross profit (revenue less cost of goods)", codes: ["4000", "4010", "4100", "4200", "5000", "5100"], mode: "ni" })} />
      <div className="stmt-sec">Operating expenses</div>
      {cats.length ? cats.map((k) => <StatementRow key={k} label={k} value={fmt(f.opexByName[k])} indent
        onClick={() => drill({ kind: "expcat", title: "Expenses — " + k, cat: k })} />)
        : <StatementRow label="No expenses recorded" value={fmt(0)} indent />}
      <StatementRow label="Total expenses" value={fmt(f.opex)} bold
        onClick={() => drill({ kind: "expcat", title: "All operating expenses", cat: "" })} />
      <StatementRow label="Net income" value={fmt(f.netIncome)} total neg={f.netIncome < 0}
        onClick={() => drill({ kind: "accounts", title: "Net income (all revenue and expense activity)", codes: acctsOf(["Revenue", "Expense"]), mode: "ni" })} />
      <div className="stmt-note">Derived live from this store's invoices, returns and expenses. Click any line to see the transactions behind it.</div>
    </div>
  );
}

// Shared by the Balance Sheet display and its Excel export: derived balances for
// Asset/Liability/Equity accounts with current earnings (revenue − expenses not
// yet closed to equity) FOLDED into 3900. Without the fold, the statement was
// off by exactly net income — assets never equalled liabilities + equity.
function balanceSheetData(sf) {
  const live = liveAccountBalances(sf);
  const accts = reportAccounts(live); // includes any unmapped codes carrying money
  let earnings = 0;
  accts.forEach((a) => {
    if (a.type === "Revenue") earnings += live[a.code] || 0;
    else if (a.type === "Expense") earnings -= live[a.code] || 0;
  });
  const rowsFor = (type) => accts
    .filter((a) => a.type === type)
    .map((a) => ({ code: a.code, name: a.name, bal: (live[a.code] || 0) + (a.code === "3900" ? earnings : 0) }))
    .filter((a) => Math.abs(a.bal) > 0.005 || a.code === "3900");
  const assets = rowsFor("Asset"), liabs = rowsFor("Liability"), equity = rowsFor("Equity");
  const tA = assets.reduce((s, a) => s + a.bal, 0);
  const tL = liabs.reduce((s, a) => s + a.bal, 0);
  const tE = equity.reduce((s, a) => s + a.bal, 0);
  return { assets, liabs, equity, tA, tL, tE, earnings };
}

function BalanceSheet({ store, onDrill }) {
  const sf = store || "all";
  // Built from the FULL derived account balances (same numbers as the Chart of
  // accounts and Trial balance) with current earnings folded into 3900 — see
  // balanceSheetData.
  const { assets, liabs, equity, tA, tL, tE } = balanceSheetData(sf);
  const drill = onDrill || null;
  const rowClick = (a, mode) => drill ? () => drill({ kind: "accounts", title: a.code + " · " + a.name, codes: [a.code], mode, asOf: true }) : undefined;
  const groupClick = (rows, title, mode) => drill && rows.length ? () => drill({ kind: "accounts", title, codes: rows.map((r) => r.code), mode, asOf: true }) : undefined;
  const balanced = Math.abs(tA - (tL + tE)) < 0.02;
  return (
    <div className="statement">
      <h3 className="stmt-title">Balance Sheet — {storeLabel(sf)} · as of {shortDate(BCCWE.today)}</h3>
      <div className="stmt-sec">Assets</div>
      {assets.map((a) => <StatementRow key={a.code} label={a.code + " · " + a.name} value={fmt(a.bal)} indent neg={a.bal < 0} onClick={rowClick(a, "dr")} />)}
      {!assets.length && <StatementRow label="No asset balances yet" value={fmt(0)} indent />}
      <StatementRow label="Total assets" value={fmt(tA)} bold onClick={groupClick(assets, "Total assets", "dr")} />
      <div className="stmt-sec">Liabilities</div>
      {liabs.map((a) => <StatementRow key={a.code} label={a.code + " · " + a.name} value={fmt(a.bal)} indent neg={a.bal < 0} onClick={rowClick(a, "cr")} />)}
      {!liabs.length && <StatementRow label="No liability balances" value={fmt(0)} indent />}
      <StatementRow label="Total liabilities" value={fmt(tL)} bold onClick={groupClick(liabs, "Total liabilities", "cr")} />
      <div className="stmt-sec">Equity</div>
      {equity.map((a) => <StatementRow key={a.code} label={a.code + " · " + a.name + (a.code === "3900" ? " (incl. accumulated net income)" : "")} value={fmt(a.bal)} indent neg={a.bal < 0} onClick={rowClick(a, "cr")} />)}
      {!equity.length && <StatementRow label="No equity balances" value={fmt(0)} indent />}
      <StatementRow label="Total equity" value={fmt(tE)} bold onClick={groupClick(equity, "Total equity", "cr")} />
      <StatementRow label="Liabilities + Equity" value={fmt(tL + tE)} total />
      {balanced
        ? <div className="stmt-check"><Icon name="check" size={15} /> Balanced — Assets {fmt(tA)} = Liabilities + Equity {fmt(tL + tE)}</div>
        : <div className="stmt-check bad"><Icon name="alert" size={15} /> OUT OF BALANCE by {fmt(tA - (tL + tE))} — Assets {fmt(tA)} vs Liabilities + Equity {fmt(tL + tE)}. Check recent manual journal entries.</div>}
      <div className="stmt-note">Derived from every recorded transaction plus manual journal entries and opening-balance adjustments. Click any account for its full activity.
        {sf !== "all" ? " Inventory is tracked company-wide and appears only in the combined view." : ""}</div>
    </div>
  );
}

function TrialBalance({ store }) {
  const D = BCCWE;
  const sf = store || "all";
  const live = liveAccountBalances(sf);
  const [sort, setSort] = useState("code_asc");
  const tbSorts = {
    code_asc: { label: "Code — ascending", get: (r) => r.code, dir: "asc" },
    name_asc: { label: "Account — A to Z", get: (r) => r.name, dir: "asc" },
    debit_desc: { label: "Debit — high to low", get: (r) => r.dr, dir: "desc" },
    credit_desc: { label: "Credit — high to low", get: (r) => r.cr, dir: "desc" },
  };
  const base = reportAccounts(live).map((a) => {
    const b = live[a.code] || 0;
    const debitNormal = ["Asset", "Expense"].includes(a.type);
    return { ...a, balance: b, dr: debitNormal ? b : 0, cr: debitNormal ? 0 : b };
  });
  const rows = applySort(base, sort, tbSorts);
  const dr = base.reduce((s, r) => s + r.dr, 0), cr = base.reduce((s, r) => s + r.cr, 0);
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Trial Balance</h3><SortControl sort={sort} setSort={setSort} defs={tbSorts} /></div>
      <table className="data-table tb">
        <thead><tr><th>Code</th><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.code}><td className="mono muted">{r.code}</td>
          <td>{r.name}{r.unmapped && <em className="cat-tag" title="This code carries a balance but is not in your chart of accounts — add it in Accounting → Chart of accounts">not in chart</em>}</td>
          <td className="r mono">{r.dr ? fmtPlain(r.dr) : "—"}</td><td className="r mono">{r.cr ? fmtPlain(r.cr) : "—"}</td></tr>)}</tbody>
        <tfoot><tr><td /><td>Totals</td><td className="r mono strong">{fmtPlain(dr)}</td><td className="r mono strong">{fmtPlain(cr)}</td></tr></tfoot>
      </table>
      <div className="stmt-check"><Icon name="check" size={15} /> Debits {fmt(dr)} = Credits {fmt(cr)} — books balance</div>
    </div>
  );
}

function TaxReport({ store, range, period, pushToast }) {
  const D = BCCWE;
  const sf = store || "all";
  if (!D.taxFilings) D.taxFilings = [];
  const f = storeFinance(sf, range);
  const isAdmin = !!(window.STORES && window.STORES.isAdmin());
  const canFile = acctCan("reconcile");
  const bounded = period && period !== "all"; // a filing must cover a specific period
  const [confirmDel, setConfirmDel] = useState("");
  const [, _r] = useState(0);
  const bump = () => _r((x) => x + 1);
  const total = f.gst - f.gstITC + f.pst;
  const overlaps = range ? D.taxFilings.filter((x) => rangesOverlap({ from: x.from, to: x.to }, range)) : [];
  const alreadyFiled = overlaps.some((x) => x.from === range.from && x.to === range.to);

  function markFiled() {
    if (!bounded || !canFile) return;
    D.taxFilings.push({
      id: "tf_" + Date.now().toString(36),
      from: range.from, to: range.to, label: range.label, store: sf,
      gst: +f.gst.toFixed(2), itc: +f.gstITC.toFixed(2), pst: +f.pst.toFixed(2), total: +total.toFixed(2),
      at: D.today, by: sessionWho(),
    });
    if (window.persist) window.persist("taxFilings");
    window.logAudit && window.logAudit("POST", "Tax filing", "taxFilings", range.label,
      "Marked GST/PST as filed for " + range.label + " · " + fmt(total) + " (" + storeLabel(sf) + ")");
    pushToast && pushToast("Marked " + range.label + " as filed — " + fmt(total));
    bump();
  }
  function removeFiling(id) {
    const i = D.taxFilings.findIndex((x) => x.id === id);
    if (i < 0) return;
    const x = D.taxFilings[i];
    D.taxFilings.splice(i, 1);
    if (window.persist) window.persist("taxFilings");
    window.logAudit && window.logAudit("DELETE", "Tax filing", "taxFilings", x.label, "Removed filed marker for " + x.label);
    pushToast && pushToast("Filing marker removed — " + x.label);
    setConfirmDel("");
    bump();
  }

  const filings = D.taxFilings.slice().sort((a, b) => String(b.to).localeCompare(String(a.to)));
  return (
    <div className="statement">
      <h3 className="stmt-title">GST / PST Remittance — {storeLabel(sf)}{range ? " · " + range.label : ""}</h3>
      <div className="stmt-sec">GST</div>
      <StatementRow label="GST collected on sales (net of returns)" value={fmt(f.gst)} indent />
      {f.gstITC > 0.005 && <StatementRow label="Less: GST paid on expenses (input tax credits)" value={"−" + fmt(f.gstITC)} indent neg />}
      <StatementRow label="Net GST due" value={fmt(f.gst - f.gstITC)} bold />
      <div className="stmt-sec">PST</div>
      <StatementRow label="PST collected (no input credits in BC)" value={fmt(f.pst)} indent />
      <StatementRow label="Total remittance due" value={fmt(total)} total />

      {overlaps.length > 0 && (
        <div className="inline-note">
          <Icon name="alert" size={15} /> {alreadyFiled
            ? "This exact period is already marked as filed (" + overlaps.map((x) => x.label).join(", ") + ")."
            : "Careful — this period overlaps filing(s) already marked: " + overlaps.map((x) => x.label).join(", ") + ". The figures above include dates you may have already remitted."}
        </div>
      )}
      {canFile && (
        <div className="tax-file-row">
          <Btn variant="primary" icon="check" disabled={!bounded || alreadyFiled} onClick={markFiled}>
            {alreadyFiled ? "Period already filed" : bounded ? "Mark " + (range ? range.label : "") + " as filed" : "Pick a specific period to file"}
          </Btn>
          {!bounded && <span className="muted" style={{ fontSize: 12 }}>Choose a month, year or date range above — “All time” can't be marked as filed.</span>}
        </div>
      )}

      <h4 className="stmt-sec" style={{ marginTop: 22 }}>Filed periods</h4>
      <table className="data-table">
        <thead><tr><th>Period</th><th>Store</th><th className="r">Net GST</th><th className="r">PST</th><th className="r">Total remitted</th><th>Filed on</th><th>By</th><th /></tr></thead>
        <tbody>
          {filings.map((x) => (
            <tr key={x.id}>
              <td className="strong">{x.label}</td>
              <td className="muted">{storeLabel(x.store)}</td>
              <td className="r mono">{fmt((x.gst || 0) - (x.itc || 0))}</td>
              <td className="r mono">{fmt(x.pst || 0)}</td>
              <td className="r mono strong">{fmt(x.total || 0)}</td>
              <td className="muted">{shortDate(x.at)}</td>
              <td className="muted">{x.by || "—"}</td>
              <td className="row-acts">
                {isAdmin && (confirmDel === x.id
                  ? <span className="del-confirm"><Btn variant="danger" size="sm" icon="trash" onClick={() => removeFiling(x.id)}>Confirm</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirmDel("")}>Cancel</Btn></span>
                  : <button className="icon-btn danger" title="Remove filed marker" onClick={() => setConfirmDel(x.id)}><Icon name="trash" size={15} /></button>)}
              </td>
            </tr>
          ))}
          {!filings.length && <tr><td colSpan="8"><Empty icon="receipt" text="No periods marked as filed yet" /></td></tr>}
        </tbody>
      </table>
      <div className="stmt-note">GST due nets input tax credits on expenses; BC PST paid on purchases is not recoverable and is included in expense cost. Marking a period as filed records the figures for your records — it does not change the books.</div>
    </div>
  );
}

// Everything a customer still owes, from BOTH channels: unpaid invoices AND
// register sales left "on account". The register side was missing, so the aging
// report never matched account 1200 on the Balance Sheet — money was owed that
// this report simply didn't list.
function receivableRows(sf) {
  const D = BCCWE;
  const out = [];
  (D.invoices || []).forEach((i) => {
    if (i.kind === "order" || !storeMatch(i, sf)) return;
    if (invStatus(i) === "Paid" || invOpenBalance(i) <= 0.005) return;
    out.push({ key: i.no, no: i.no, clientId: i.clientId, due: i.due || i.date, bal: invOpenBalance(i), status: invStatus(i), ref: "invoiceview/" + i.no });
  });
  (D.cashSales || []).forEach((s, n) => {
    if (!storeMatch(s, sf) || (s.owed || 0) <= 0.005) return;
    // Register sales are due immediately, so the sale date is the due date.
    out.push({ key: (s.id || "cs") + "-" + n, no: (s.kind || "Sale") + " (register)", clientId: s.clientId,
      due: s.date, bal: +(s.owed || 0).toFixed(2), status: "Unpaid", ref: "", register: true });
  });
  return out;
}

function AgingReport({ store, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("age_desc");
  const buckets = { "Current": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  const today = new Date(D.today);
  // Return-aware open balances (never the stored status) plus register credit.
  const open = receivableRows(sf);
  open.forEach((r) => {
    const age = Math.floor((today - new Date(r.due)) / 86400000);
    if (age <= 0) buckets["Current"] += r.bal;
    else if (age <= 30) buckets["1–30"] += r.bal;
    else if (age <= 60) buckets["31–60"] += r.bal;
    else if (age <= 90) buckets["61–90"] += r.bal;
    else buckets["90+"] += r.bal;
  });
  const agingSorts = {
    age_desc: { label: "Age — oldest first", get: (r) => today - new Date(r.due), dir: "desc" },
    balance_desc: { label: "Balance — high to low", get: (r) => r.bal, dir: "desc" },
    due_asc: { label: "Due date — earliest", get: (r) => new Date(r.due).getTime(), dir: "asc" },
    client_asc: { label: "Client — A to Z", get: (r) => clientName(r.clientId), dir: "asc" },
  };
  const openRows = applySort(open, sort, agingSorts);
  const totalAR = open.reduce((s, r) => s + r.bal, 0);
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Accounts Receivable Aging</h3><SortControl sort={sort} setSort={setSort} defs={agingSorts} /></div>
      <div className="aging-row">
        {Object.entries(buckets).map(([k, v]) => (
          <div className={"aging-cell" + (k !== "Current" && v > 0 ? " warn" : "")} key={k}>
            <span className="ag-lbl">{k} days</span>
            <span className="ag-val mono">{fmt(v)}</span>
          </div>
        ))}
      </div>
      <table className="data-table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th className="r">Balance</th><th>Status</th></tr></thead>
        <tbody>
          {openRows.map((r) => <tr key={r.key}>
            <td className="mono">{go && r.ref ? <button className="link mono" onClick={() => go(r.ref)}>{r.no}</button> : r.no}</td>
            <td>{r.clientId
              ? (go ? <button className="link" onClick={() => go("client/" + r.clientId)}>{clientName(r.clientId)}</button> : clientName(r.clientId))
              : <span className="muted">Walk-in</span>}</td>
            <td className="muted">{shortDate(r.due)}</td>
            <td className="r mono">{fmt(r.bal)}</td>
            <td><Badge tone={statusTone(r.status)} dot>{r.status}</Badge>{r.register && <em className="cat-tag">register</em>}</td>
          </tr>)}
          {!openRows.length && <tr><td colSpan="5"><Empty icon="check" text="Nothing outstanding — every sale is paid" /></td></tr>}
        </tbody>
        {openRows.length > 0 && <tfoot><tr><td colSpan="3" className="r strong">Total receivable</td><td className="r mono strong">{fmt(totalAR)}</td><td /></tr></tfoot>}
      </table>
      <div className="stmt-note">Unpaid invoices plus register sales left on account — the total ties to Accounts Receivable on the Balance Sheet.</div>
    </div>
  );
}

// Pre-tax revenue per client, from EVERY sales channel: invoices, register /
// POS sales, and returns & exchanges (which reduce it). Previously this counted
// invoices only, so a client who bought at the register showed nothing and
// returns were never deducted — the report disagreed with the P&L by exactly
// the register + return volume. Walk-in register sales (no client on the sale)
// are grouped under one row so the total still ties to the Income Statement.
function clientRevenueRows(sf, range) {
  const D = BCCWE;
  const inR = (d) => !range || inRange(d || "", range);
  const map = {};
  const addTo = (id, amt) => { if (Math.abs(amt) < 0.000001) return; const k = id || "__walkin"; map[k] = (map[k] || 0) + amt; };
  (D.invoices || []).forEach((i) => {
    if (i.kind === "order" || !storeMatch(i, sf) || !inR(i.date)) return;
    addTo(i.clientId, (i.total || 0) - (i.gst || 0) - (i.pst || 0));
  });
  (D.cashSales || []).forEach((s) => {
    if (!storeMatch(s, sf) || !inR(s.date)) return;
    addTo(s.clientId, s.subtotal != null ? s.subtotal : (s.total || 0));
  });
  (D.creditNotes || []).forEach((cn) => {
    if (!cnMatch(cn, sf) || !inR(cn.date)) return;
    // cn.subtotal is negative on returns, positive on an exchange-up.
    const cid = cn.clientId || ((D.invoices || []).find((i) => i.no === cn.origInv) || {}).clientId;
    addTo(cid, cn.subtotal || 0);
  });
  return Object.entries(map).map(([id, v]) => ({
    id, v,
    name: id === "__walkin" ? "Walk-in / cash customers" : clientName(id),
    walkin: id === "__walkin",
  }));
}

/* ---------------- Supplier payables (A/P aging) ---------------- */
function APAgingReport({ store, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const rows = supplierPayableRows(sf);
  const today = new Date(D.today);
  const buckets = { "Current": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  rows.forEach((r) => {
    const age = Math.floor((today - new Date(r.date + "T00:00:00")) / 86400000);
    const k = age <= 0 ? "Current" : age <= 30 ? "1–30" : age <= 60 ? "31–60" : age <= 90 ? "61–90" : "90+";
    buckets[k] += r.bal;
  });
  // Group by supplier, biggest balance first; POs oldest first within a group.
  const bySup = {};
  rows.forEach((r) => { (bySup[r.supplier] = bySup[r.supplier] || []).push(r); });
  const groups = Object.entries(bySup)
    .map(([sup, list]) => ({ sup, name: (typeof supplierName === "function" ? supplierName(sup) : sup) || "(no supplier)", list: list.sort((a, b) => String(a.date).localeCompare(String(b.date))), total: list.reduce((s, r) => s + r.bal, 0) }))
    .sort((a, b) => b.total - a.total);
  const grand = rows.reduce((s, r) => s + r.bal, 0);
  return (
    <div className="statement">
      <h3 className="stmt-title">Supplier Payables — {storeLabel(sf)} · as of {shortDate(D.today)}</h3>
      <div className="aging-row">
        {Object.entries(buckets).map(([k, v]) => (
          <div className={"aging-cell" + (k !== "Current" && v > 0.005 ? " warn" : "")} key={k}>
            <span className="ag-lbl">{k} days</span>
            <span className="ag-val mono">{fmt(v)}</span>
          </div>
        ))}
      </div>
      <table className="data-table">
        <thead><tr><th>Supplier</th><th>Purchase order</th><th>Date</th><th className="r">Received value</th><th className="r">Paid</th><th className="r">Balance owing</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.sup || "none"}>
              {g.list.map((r, i) => (
                <tr key={r.ref}>
                  <td className="strong">{i === 0 ? g.name : ""}</td>
                  <td className="mono">{go ? <button className="link mono" onClick={() => go("po/" + r.ref)}>{r.ref}</button> : r.ref}</td>
                  <td className="muted">{shortDate(r.date)}</td>
                  <td className="r mono">{fmtPlain(r.recvVal)}</td>
                  <td className="r mono">{r.paid > 0.005 ? fmtPlain(r.paid) : "—"}</td>
                  <td className={"r mono strong" + (r.bal < 0 ? " neg" : "")}>{fmt(r.bal)}</td>
                </tr>
              ))}
              <tr className="ap-subtotal">
                <td colSpan="5" className="r strong">{g.name} total</td>
                <td className={"r mono strong" + (g.total < 0 ? " neg" : "")}>{fmt(g.total)}</td>
              </tr>
            </React.Fragment>
          ))}
          {!rows.length && <tr><td colSpan="6"><Empty icon="truck" text="Nothing owed to suppliers — all received orders are paid" /></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan="5" className="r strong">Total supplier payables</td><td className="r mono strong">{fmt(grand)}</td></tr></tfoot>}
      </table>
      <div className="stmt-note">Received value minus payments per purchase order — the same math as account 2000 on the Balance Sheet, so the two always agree. A negative balance is a prepayment (deposit) with the supplier. Record payments on the purchase order.</div>
    </div>
  );
}

function ClientReport({ store, range, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("value_desc");
  const [q, setQ] = useState("");
  // Pre-tax revenue from invoices + register sales, net of returns — ties to the
  // Income Statement's "Sales revenue (net of returns)".
  const rowsAll = clientRevenueRows(sf, range);
  const clientReportSorts = {
    value_desc: { label: "Revenue — high to low", get: (r) => r.v, dir: "desc" },
    value_asc: { label: "Revenue — low to high", get: (r) => r.v, dir: "asc" },
    name_asc: { label: "Client — A to Z", get: (r) => r.name, dir: "asc" },
  };
  const ql = q.trim().toLowerCase();
  const rows = applySort(rowsAll, sort, clientReportSorts).filter((r) => !ql || r.name.toLowerCase().includes(ql));
  const max = Math.max(1, ...rows.map((r) => r.v)); // guard: no rows / all-zero must not break bar widths
  const shownTotal = rows.reduce((s, r) => s + r.v, 0);
  return (
    <div className="statement">
      <div className="stmt-head">
        <h3 className="stmt-title">Income by Client</h3>
        <div className="search" style={{ maxWidth: 260 }}><Icon name="search" size={15} /><input placeholder="Search client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SortControl sort={sort} setSort={setSort} defs={clientReportSorts} />
      </div>
      <div className="bars">
        {rows.map((r) => (
          <div className="bar-row" key={r.id}>
            {go && !r.walkin
              ? <button className="link bar-lbl" style={{ textAlign: "left" }} title="Open this client's account" onClick={() => go("client/" + r.id)}>{r.name}</button>
              : <span className="bar-lbl">{r.name}</span>}
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(0, (r.v / max) * 100) + "%" }} /></div>
            <span className="bar-val mono">{fmt(r.v)}</span>
          </div>
        ))}
        {!rows.length && <Empty icon="people" text={ql ? "No client matches “" + q + "”" : "No client revenue in this period"} />}
      </div>
      {rows.length > 0 && <StatementRow label={ql ? "Total (filtered)" : "Total — ties to Sales revenue on the P&L"} value={fmt(shownTotal)} total />}
      <div className="stmt-note">Pre-tax revenue from invoices and register sales, net of returns and exchanges. Click a client to open their account.</div>
    </div>
  );
}

Object.assign(window, { Accounting, Reports });
