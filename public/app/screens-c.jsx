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
function cnCosts(cn) {
  const D = BCCWE;
  let restock = 0, defect = 0, exchangeOut = 0;
  if (cn.retDisp === "Inventory") (cn.items || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    const it = (D.inventory || []).find((x) => x.code === l.code);
    restock += (it ? (it.cost || 0) : 0) * l.qty;
  });
  if (cn.retDisp === "Defected") (D.defectiveProducts || []).forEach((d) => {
    if (d.ref === cn.no) defect += d.costLoss || 0;
  });
  (cn.exchangeItems || []).forEach((l) => {
    if (!l.code || !(l.qty > 0)) return;
    const it = (D.inventory || []).find((x) => x.code === l.code);
    exchangeOut += (it ? (it.cost || 0) : 0) * l.qty;
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
    let recvVal = 0;
    const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    pls.forEach((l) => { recvVal += (l.qtyReceived || 0) * (l.landedUnit != null ? l.landedUnit : (l.cost || 0)); });
    payables += recvVal - pay;
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
    add(e.paidFrom || "1010", -((e.amount || 0) + gstPaid + pstPaid));
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
    let recvVal = 0;
    const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    pls.forEach((l) => { recvVal += (l.qtyReceived || 0) * (l.landedUnit != null ? l.landedUnit : (l.cost || 0)); });
    add("2000", recvVal - pay);
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
  const typeOf = {}; (D.accounts || []).forEach((a) => { typeOf[a.code] = a.type; });
  let dr = 0, cr = 0;
  Object.keys(bal).forEach((code) => {
    const debitNormal = typeOf[code] === "Asset" || typeOf[code] === "Expense";
    if (debitNormal) dr += bal[code]; else cr += bal[code];
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
    push(e.paidFrom || "1010", e.date, lbl, 0, (e.amount || 0) + gstPaid + pstPaid);
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
    let recvVal = 0;
    const pls = (typeof poLines === "function") ? poLines(po) : (po.lines || []);
    pls.forEach((l) => { recvVal += (l.qtyReceived || 0) * (l.landedUnit != null ? l.landedUnit : (l.cost || 0)); });
    push("2000", po.date, "Goods received — " + ref, 0, recvVal, poRef);
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
      const rows = (D.accounts || []).map((a) => {
        const b = live[a.code] || 0;
        const dn = a.type === "Asset" || a.type === "Expense";
        return { code: a.code, name: a.name, debit: dn ? money(b) : 0, credit: dn ? 0 : money(b) };
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
      const open = (D.invoices || []).filter((i) => i.kind !== "order" && invStatus(i) !== "Paid" && invOpenBalance(i) > 0.005 && storeMatch(i, sf));
      return { filename: "BCCWE-ARAging-" + safeLbl, sheet: "A-R Aging",
        cols: [{ key: "no", label: "Invoice", type: "text" }, { key: "client", label: "Client", type: "text" }, { key: "due", label: "Due", type: "text" }, { key: "balance", label: "Balance", type: "number" }, { key: "status", label: "Status", type: "text" }],
        data: open.map((i) => ({ no: i.no, client: clientName(i.clientId), due: i.due || "", balance: money(invOpenBalance(i)), status: invStatus(i) })),
        opts: { title: "BCCWE — A/R Aging", subtitle: storeLabel(sf) + " · as of " + BCCWE.today } };
    }
    if (report === "client") {
      const map = {};
      (D.invoices || []).forEach((i) => { if (i.kind === "order" || !storeMatch(i, sf) || (dated && !inRange(i.date || "", range))) return; map[i.clientId] = (map[i.clientId] || 0) + ((i.total || 0) - (i.gst || 0) - (i.pst || 0)); });
      return { filename: "BCCWE-IncomeByClient-" + safeLbl, sheet: "Income by Client",
        cols: [{ key: "client", label: "Client", type: "text" }, { key: "revenue", label: "Revenue (pre-tax)", type: "number" }],
        data: Object.entries(map).map(([id, v]) => ({ client: clientName(id), revenue: money(v) })).sort((a, b) => b.revenue - a.revenue),
        opts: { title: "BCCWE — Income by Client", subtitle: storeLabel(sf) + " · " + range.label } };
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
                {report === "tax" && <TaxReport store={sf} range={range} />}
                {report === "aging" && <AgingReport store={sf} go={go} />}
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
  const D = BCCWE;
  const live = liveAccountBalances(sf);
  let earnings = 0;
  (D.accounts || []).forEach((a) => {
    if (a.type === "Revenue") earnings += live[a.code] || 0;
    else if (a.type === "Expense") earnings -= live[a.code] || 0;
  });
  const rowsFor = (type) => (D.accounts || [])
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
  const base = D.accounts.map((a) => {
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
        <tbody>{rows.map((r) => <tr key={r.code}><td className="mono muted">{r.code}</td><td>{r.name}</td><td className="r mono">{r.dr ? fmtPlain(r.dr) : "—"}</td><td className="r mono">{r.cr ? fmtPlain(r.cr) : "—"}</td></tr>)}</tbody>
        <tfoot><tr><td /><td>Totals</td><td className="r mono strong">{fmtPlain(dr)}</td><td className="r mono strong">{fmtPlain(cr)}</td></tr></tfoot>
      </table>
      <div className="stmt-check"><Icon name="check" size={15} /> Debits {fmt(dr)} = Credits {fmt(cr)} — books balance</div>
    </div>
  );
}

function TaxReport({ store, range }) {
  const sf = store || "all";
  const f = storeFinance(sf, range);
  return (
    <div className="statement">
      <h3 className="stmt-title">GST / PST Remittance — {storeLabel(sf)}{range ? " · " + range.label : ""}</h3>
      <div className="stmt-sec">GST</div>
      <StatementRow label="GST collected on sales (net of returns)" value={fmt(f.gst)} indent />
      {f.gstITC > 0.005 && <StatementRow label="Less: GST paid on expenses (input tax credits)" value={"−" + fmt(f.gstITC)} indent neg />}
      <StatementRow label="Net GST due" value={fmt(f.gst - f.gstITC)} bold />
      <div className="stmt-sec">PST</div>
      <StatementRow label="PST collected (no input credits in BC)" value={fmt(f.pst)} indent />
      <StatementRow label="Total remittance due" value={fmt(f.gst - f.gstITC + f.pst)} total />
      <div className="stmt-note">GST due nets input tax credits on expenses; BC PST paid on purchases is not recoverable and is included in expense cost. Purchase orders are not yet posted here (Phase 8).</div>
    </div>
  );
}

function AgingReport({ store, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("age_desc");
  const buckets = { "Current": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  const today = new Date(D.today);
  // Return-aware open balance, live status, and no order (deposit) invoices —
  // this report previously trusted the stored status and raw total−paid.
  const open = D.invoices.filter((i) => i.kind !== "order" && invStatus(i) !== "Paid" && invOpenBalance(i) > 0.005 && storeMatch(i, sf));
  open.forEach((i) => {
    const bal = invOpenBalance(i);
    const age = Math.floor((today - new Date(i.due)) / 86400000);
    if (age <= 0) buckets["Current"] += bal;
    else if (age <= 30) buckets["1–30"] += bal;
    else if (age <= 60) buckets["31–60"] += bal;
    else if (age <= 90) buckets["61–90"] += bal;
    else buckets["90+"] += bal;
  });
  const agingSorts = {
    age_desc: { label: "Age — oldest first", get: (i) => today - new Date(i.due), dir: "desc" },
    balance_desc: { label: "Balance — high to low", get: (i) => invOpenBalance(i), dir: "desc" },
    due_asc: { label: "Due date — earliest", get: (i) => new Date(i.due).getTime(), dir: "asc" },
    client_asc: { label: "Client — A to Z", get: (i) => clientName(i.clientId), dir: "asc" },
  };
  const openRows = applySort(open, sort, agingSorts);
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
        <tbody>{openRows.map((i) => <tr key={i.no}>
          <td className="mono">{go ? <button className="link mono" onClick={() => go("invoiceview/" + i.no)}>{i.no}</button> : i.no}</td>
          <td>{go ? <button className="link" onClick={() => go("client/" + i.clientId)}>{clientName(i.clientId)}</button> : clientName(i.clientId)}</td>
          <td className="muted">{shortDate(i.due)}</td><td className="r mono">{fmt(invOpenBalance(i))}</td><td><Badge tone={statusTone(invStatus(i))} dot>{invStatus(i)}</Badge></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ClientReport({ store, range, go }) {
  const D = BCCWE;
  const sf = store || "all";
  const [sort, setSort] = useState("value_desc");
  const [q, setQ] = useState("");
  const map = {};
  // Pre-tax revenue, orders excluded, period-aware — consistent with the P&L.
  D.invoices.forEach((i) => {
    if (i.kind === "order" || !storeMatch(i, sf)) return;
    if (range && !inRange(i.date || "", range)) return;
    map[i.clientId] = (map[i.clientId] || 0) + ((i.total || 0) - (i.gst || 0) - (i.pst || 0));
  });
  const clientReportSorts = {
    value_desc: { label: "Revenue — high to low", get: (r) => r.v, dir: "desc" },
    value_asc: { label: "Revenue — low to high", get: (r) => r.v, dir: "asc" },
    name_asc: { label: "Client — A to Z", get: (r) => r.name, dir: "asc" },
  };
  const ql = q.trim().toLowerCase();
  const rows = applySort(Object.entries(map).map(([id, v]) => ({ id, name: clientName(id), v })), sort, clientReportSorts)
    .filter((r) => !ql || r.name.toLowerCase().includes(ql));
  const max = Math.max(1, ...rows.map((r) => r.v)); // guard: no rows / all-zero must not break bar widths
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
            {go
              ? <button className="link bar-lbl" style={{ textAlign: "left" }} title="Open this client's account" onClick={() => go("client/" + r.id)}>{r.name}</button>
              : <span className="bar-lbl">{r.name}</span>}
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(0, (r.v / max) * 100) + "%" }} /></div>
            <span className="bar-val mono">{fmt(r.v)}</span>
          </div>
        ))}
        {!rows.length && <Empty icon="people" text={ql ? "No client matches “" + q + "”" : "No client revenue in this period"} />}
      </div>
    </div>
  );
}

Object.assign(window, { Accounting, Reports });
