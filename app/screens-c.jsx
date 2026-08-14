/* ============================================================
   BCCWE — Accounting, Reports, Settings
   ============================================================ */

/* ---------------- Accounting ---------------- */
function Accounting() {
  const D = BCCWE;
  const [tab, setTab] = useState("coa");
  const groups = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  const toneFor = { Asset: "blue", Liability: "amber", Equity: "slate", Revenue: "green", Expense: "red" };

  return (
    <div>
      <PageHead title="Accounting" sub="Double-entry ledger · chart of accounts · journal"
        actions={<>
          <Btn variant="ghost" icon="plus">New account</Btn>
          <Btn variant="primary" icon="book">Manual journal entry</Btn>
        </>} />

      <div className="tabs">
        <button className={"tab" + (tab === "coa" ? " on" : "")} onClick={() => setTab("coa")}>Chart of accounts</button>
        <button className={"tab" + (tab === "journal" ? " on" : "")} onClick={() => setTab("journal")}>General journal</button>
        <button className={"tab" + (tab === "ledger" ? " on" : "")} onClick={() => setTab("ledger")}>General ledger</button>
      </div>

      {tab === "coa" && (
        <div className="coa-grid">
          {groups.map((g) => {
            const accts = D.accounts.filter((a) => a.type === g);
            const sum = accts.reduce((s, a) => s + a.balance, 0);
            return (
              <Card key={g} title={g + "s"} sub={accts.length + " accounts"} actions={<Badge tone={toneFor[g]}>{fmt(sum)}</Badge>}>
                <ul className="coa-list">
                  {accts.map((a) => (
                    <li key={a.code}>
                      <span className="jcode">{a.code}</span>
                      <span className="coa-name">{a.name}</span>
                      <span className="coa-bal mono">{fmt(a.balance)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "journal" && (
        <Card pad={false}>
          <div className="journal-list">
            {D.journal.map((je) => {
              const dr = je.lines.reduce((s, l) => s + l.dr, 0);
              const cr = je.lines.reduce((s, l) => s + l.cr, 0);
              return (
                <div className="je" key={je.id}>
                  <div className="je-head">
                    <div><span className="mono strong">{je.id}</span> <span className="muted">· {shortDate(je.date)}</span><div className="je-memo">{je.memo}</div></div>
                    <Badge tone={Math.abs(dr - cr) < 0.01 ? "green" : "red"} dot>{Math.abs(dr - cr) < 0.01 ? "Balanced" : "Check"}</Badge>
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
          </div>
        </Card>
      )}

      {tab === "ledger" && <Ledger />}
    </div>
  );
}

function Ledger() {
  const D = BCCWE;
  const [acct, setAcct] = useState("1200");
  const a = D.accounts.find((x) => x.code === acct);
  // synth a few running lines
  const rows = useMemo(() => {
    const seed = [
      { date: "2026-06-02", memo: "Opening balance", dr: 0, cr: 0 },
      { date: "2026-06-09", memo: "Payment received — INV-1044", dr: acct === "1010" ? 900 : 0, cr: acct === "1200" ? 900 : 0 },
      { date: "2026-06-11", memo: "Invoice INV-1046", dr: acct === "1200" ? 226.81 : 0, cr: 0 },
      { date: "2026-06-12", memo: "Invoice INV-1047", dr: acct === "1200" ? 1388.8 : 0, cr: 0 },
    ];
    let bal = a.balance - seed.reduce((s, r) => s + r.dr - r.cr, 0);
    return seed.map((r) => { bal += r.dr - r.cr; return { ...r, bal }; });
  }, [acct]);

  return (
    <Card pad={false}>
      <div className="toolbar">
        <Field label="">
          <select className="tool-select wide" value={acct} onChange={(e) => setAcct(e.target.value)}>
            {D.accounts.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
          </select>
        </Field>
        <div className="ledger-bal">Current balance <strong className="mono">{fmt(a.balance)}</strong></div>
      </div>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Memo</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Running balance</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td className="muted">{shortDate(r.date)}</td><td>{r.memo}</td><td className="r mono">{r.dr ? fmtPlain(r.dr) : "—"}</td><td className="r mono">{r.cr ? fmtPlain(r.cr) : "—"}</td><td className="r mono strong">{fmt(r.bal)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------- Reports ---------------- */
function Reports() {
  const D = BCCWE;
  const [report, setReport] = useState("pl");
  const [range, setRange] = useState("month");

  const reports = [
    { id: "pl", name: "Income Statement (P&L)", ico: "report" },
    { id: "bs", name: "Balance Sheet", ico: "ledger" },
    { id: "tb", name: "Trial Balance", ico: "book" },
    { id: "tax", name: "GST/PST Remittance", ico: "receipt" },
    { id: "aging", name: "Unpaid Invoices (Aging)", ico: "invoice" },
    { id: "client", name: "Income by Client", ico: "people" },
  ];

  return (
    <div>
      <PageHead title="Reports" sub="Financial statements · filter by period · export to PDF or Excel"
        actions={<>
          <Btn variant="ghost" icon="download">Excel / CSV</Btn>
          <Btn variant="primary" icon="download">Export PDF</Btn>
        </>} />

      <div className="reports-layout">
        <div className="report-nav">
          {reports.map((r) => (
            <button key={r.id} className={"rnav" + (report === r.id ? " on" : "")} onClick={() => setReport(r.id)}>
              <Icon name={r.ico} size={17} /><span>{r.name}</span>
            </button>
          ))}
        </div>

        <Card pad={false} className="report-pane">
          <div className="report-bar">
            <div className="seg-filters">
              {["month", "quarter", "year", "custom"].map((r) => <button key={r} className={"chip" + (range === r ? " on" : "")} onClick={() => setRange(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}
            </div>
            <span className="muted">Period: Jun 1 – Jun 14, 2026</span>
          </div>
          <div className="report-body">
            {report === "pl" && <PLReport />}
            {report === "bs" && <BalanceSheet />}
            {report === "tb" && <TrialBalance />}
            {report === "tax" && <TaxReport />}
            {report === "aging" && <AgingReport />}
            {report === "client" && <ClientReport />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatementRow({ label, value, bold, indent, total, neg }) {
  return (
    <div className={"stmt-row" + (bold ? " bold" : "") + (total ? " total" : "") + (indent ? " indent" : "")}>
      <span>{label}</span><span className={"mono" + (neg ? " neg" : "")}>{value}</span>
    </div>
  );
}

function PLReport() {
  const rev = [["Sales Revenue — Retail", 96420], ["Sales Revenue — Wholesale", 61350], ["Service & Repair Revenue", 28940]];
  const totalRev = rev.reduce((s, r) => s + r[1], 0);
  const cogs = 98610;
  const gp = totalRev - cogs;
  const exp = [["Rent", 21600], ["Wages & Salaries", 34800], ["Utilities", 4180], ["Marketing & Advertising", 3920], ["Shop Supplies", 2610]];
  const totalExp = exp.reduce((s, r) => s + r[1], 0);
  const net = gp - totalExp;
  return (
    <div className="statement">
      <h3 className="stmt-title">Income Statement</h3>
      <div className="stmt-sec">Revenue</div>
      {rev.map((r) => <StatementRow key={r[0]} label={r[0]} value={fmt(r[1])} indent />)}
      <StatementRow label="Total revenue" value={fmt(totalRev)} bold />
      <div className="stmt-sec">Cost of goods sold</div>
      <StatementRow label="Cost of Goods Sold" value={fmt(cogs)} indent />
      <StatementRow label="Gross profit" value={fmt(gp)} bold />
      <div className="stmt-sec">Operating expenses</div>
      {exp.map((r) => <StatementRow key={r[0]} label={r[0]} value={fmt(r[1])} indent />)}
      <StatementRow label="Total expenses" value={fmt(totalExp)} bold />
      <StatementRow label="Net income" value={fmt(net)} total />
    </div>
  );
}

function BalanceSheet() {
  const D = BCCWE;
  const grp = (t) => D.accounts.filter((a) => a.type === t);
  const sum = (t) => grp(t).reduce((s, a) => s + a.balance, 0);
  const assets = sum("Asset"), liab = sum("Liability"), eq = sum("Equity");
  return (
    <div className="statement">
      <h3 className="stmt-title">Balance Sheet</h3>
      <div className="stmt-sec">Assets</div>
      {grp("Asset").map((a) => <StatementRow key={a.code} label={a.name} value={fmt(a.balance)} indent />)}
      <StatementRow label="Total assets" value={fmt(assets)} bold />
      <div className="stmt-sec">Liabilities</div>
      {grp("Liability").map((a) => <StatementRow key={a.code} label={a.name} value={fmt(a.balance)} indent />)}
      <StatementRow label="Total liabilities" value={fmt(liab)} bold />
      <div className="stmt-sec">Equity</div>
      {grp("Equity").map((a) => <StatementRow key={a.code} label={a.name} value={fmt(a.balance)} indent />)}
      <StatementRow label="Total equity" value={fmt(eq)} bold />
      <StatementRow label="Liabilities + Equity" value={fmt(liab + eq)} total />
      <div className="stmt-check"><Icon name="check" size={15} /> Assets {fmt(assets)} = Liabilities + Equity {fmt(liab + eq)}</div>
    </div>
  );
}

function TrialBalance() {
  const D = BCCWE;
  const [sort, setSort] = useState("code_asc");
  const tbSorts = {
    code_asc: { label: "Code — ascending", get: (r) => r.code, dir: "asc" },
    name_asc: { label: "Account — A to Z", get: (r) => r.name, dir: "asc" },
    debit_desc: { label: "Debit — high to low", get: (r) => r.dr, dir: "desc" },
    credit_desc: { label: "Credit — high to low", get: (r) => r.cr, dir: "desc" },
  };
  const base = D.accounts.map((a) => {
    const debitNormal = ["Asset", "Expense"].includes(a.type);
    return { ...a, dr: debitNormal ? a.balance : 0, cr: debitNormal ? 0 : a.balance };
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

function TaxReport() {
  const collected = [["GST collected on sales", 7910.5], ["PST collected on sales", 9342.2]];
  const paid = [["GST paid on purchases (ITC)", 5804.1], ["PST paid (non-recoverable)", 0]];
  const netGst = 7910.5 - 5804.1, netPst = 9342.2;
  return (
    <div className="statement">
      <h3 className="stmt-title">GST / PST Remittance Summary</h3>
      <div className="stmt-sec">Tax collected</div>
      {collected.map((r) => <StatementRow key={r[0]} label={r[0]} value={fmt(r[1])} indent />)}
      <div className="stmt-sec">Input tax credits</div>
      {paid.map((r) => <StatementRow key={r[0]} label={r[0]} value={fmt(r[1])} indent />)}
      <StatementRow label="Net GST payable" value={fmt(netGst)} bold />
      <StatementRow label="Net PST payable" value={fmt(netPst)} bold />
      <StatementRow label="Total remittance due" value={fmt(netGst + netPst)} total />
      <div className="stmt-note">Remittance period ends Jul 31, 2026 · tracked via separate GST Payable / PST Payable accounts.</div>
    </div>
  );
}

function AgingReport() {
  const D = BCCWE;
  const [sort, setSort] = useState("age_desc");
  const buckets = { "Current": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  const today = new Date(D.today);
  const open = D.invoices.filter((i) => i.status !== "Paid");
  open.forEach((i) => {
    const bal = i.total - i.paid;
    const age = Math.floor((today - new Date(i.due)) / 86400000);
    if (age <= 0) buckets["Current"] += bal;
    else if (age <= 30) buckets["1–30"] += bal;
    else if (age <= 60) buckets["31–60"] += bal;
    else if (age <= 90) buckets["61–90"] += bal;
    else buckets["90+"] += bal;
  });
  const agingSorts = {
    age_desc: { label: "Age — oldest first", get: (i) => today - new Date(i.due), dir: "desc" },
    balance_desc: { label: "Balance — high to low", get: (i) => i.total - i.paid, dir: "desc" },
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
        <tbody>{openRows.map((i) => <tr key={i.no}><td className="mono">{i.no}</td><td>{clientName(i.clientId)}</td><td className="muted">{shortDate(i.due)}</td><td className="r mono">{fmt(i.total - i.paid)}</td><td><Badge tone={statusTone(i.status)} dot>{i.status}</Badge></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ClientReport() {
  const D = BCCWE;
  const [sort, setSort] = useState("value_desc");
  const map = {};
  D.invoices.forEach((i) => { map[i.clientId] = (map[i.clientId] || 0) + i.subtotal; });
  const clientReportSorts = {
    value_desc: { label: "Revenue — high to low", get: (r) => r.v, dir: "desc" },
    value_asc: { label: "Revenue — low to high", get: (r) => r.v, dir: "asc" },
    name_asc: { label: "Client — A to Z", get: (r) => r.name, dir: "asc" },
  };
  const rows = applySort(Object.entries(map).map(([id, v]) => ({ name: clientName(id), v })), sort, clientReportSorts);
  const max = Math.max(...rows.map((r) => r.v));
  return (
    <div className="statement">
      <div className="stmt-head"><h3 className="stmt-title">Income by Client</h3><SortControl sort={sort} setSort={setSort} defs={clientReportSorts} /></div>
      <div className="bars">
        {rows.map((r) => (
          <div className="bar-row" key={r.name}>
            <span className="bar-lbl">{r.name}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: (r.v / max) * 100 + "%" }} /></div>
            <span className="bar-val mono">{fmt(r.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Accounting, Reports });
