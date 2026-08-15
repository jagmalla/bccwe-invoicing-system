/* ============================================================
   BCCWE — Stores (Companies)
   Manage the separate businesses/stores. Each store has its own
   invoice number sequence, default tax and invoice profile.
   ============================================================ */
function Stores({ pushToast }) {
  const D = BCCWE;
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const [modal, setModal] = useState(null); // { type:'add'|'edit'|'delete', store? }

  function saveStore(data, original) {
    if (original) {
      Object.assign(original, data);
      window.logAudit("UPDATE", "Store", "companies", original.name, "Updated store " + original.name);
      pushToast && pushToast("Store updated — " + original.name);
    } else {
      const s = Object.assign({ id: "co_" + Date.now().toString(36), nextInvoiceNo: 1000, active: true }, data);
      D.companies.push(s);
      window.logAudit("CREATE", "Store", "companies", s.name, "Added store " + s.name + " (tax " + (D.TAX.modes[s.taxDefault] || {}).label + ")");
      pushToast && pushToast("Store created — " + s.name);
    }
    if (window.persist) window.persist("companies");
    bump(); setModal(null);
  }
  function deleteStore(s) {
    // Count FALLBACK ownership too: records with no companyId belong to the
    // default store via STORES.idOf — the strict check missed them, so deleting
    // the default store silently re-homed every legacy invoice to another store.
    const owns = (r) => (window.STORES ? window.STORES.idOf(r) : r.companyId) === s.id;
    const used = (D.invoices || []).some(owns) || (D.cashSales || []).some(owns) || (D.purchaseOrders || []).some(owns);
    if (used) { pushToast && pushToast("Can't delete — invoices or sales belong to " + s.name + " (including older records that default to it)"); setModal(null); return; }
    if ((D.companies || []).length <= 1) { pushToast && pushToast("Keep at least one store"); setModal(null); return; }
    D.companies = D.companies.filter((x) => x.id !== s.id);
    window.logAudit("DELETE", "Store", "companies", s.name, "Deleted store " + s.name);
    if (window.persist) window.persist("companies");
    pushToast && pushToast("Deleted store — " + s.name);
    bump(); setModal(null);
  }

  const taxLabel = (k) => (D.TAX.modes[k] || {}).label || k;
  const invCount = (id) => (D.invoices || []).filter((i) => (i.companyId || window.STORES.defaultId()) === id).length;

  return (
    <div>
      <PageHead title="Stores" sub="Each store invoices, taxes and reports separately. Add as many as you run."
        actions={<Btn variant="primary" icon="plus" onClick={() => setModal({ type: "add" })}>Add store</Btn>} />

      <div className="store-grid">
        {(D.companies || []).map((s) => (
          <Card key={s.id} className="store-card"
            title={s.name}
            sub={(s.active === false ? "Inactive · " : "") + "Next invoice " + (s.invPrefix || "INV") + "-" + (s.nextInvoiceNo || 1000)}
            actions={<>
              <Badge tone={s.taxDefault === "none" ? "slate" : "green"}>{taxLabel(s.taxDefault)}</Badge>
            </>}>
            <ul className="store-meta">
              <li><span>Invoice prefix</span><strong className="mono">{s.invPrefix || "INV"}-</strong></li>
              <li><span>Default tax</span><strong>{taxLabel(s.taxDefault)}</strong></li>
              <li><span>Invoices on file</span><strong>{invCount(s.id)}</strong></li>
              {s.gst ? <li><span>GST #</span><strong>{s.gst}</strong></li> : null}
              {s.addr1 ? <li><span>Address</span><strong>{[s.addr1, s.addr2].filter(Boolean).join(", ")}</strong></li> : null}
            </ul>
            <div className="store-card-acts">
              <Btn variant="ghost" size="sm" icon="edit" onClick={() => setModal({ type: "edit", store: s })}>Edit</Btn>
              <Btn variant="ghost" size="sm" icon="trash" onClick={() => setModal({ type: "delete", store: s })}>Delete</Btn>
            </div>
          </Card>
        ))}
      </div>

      {(modal && modal.type === "add") && <StoreFormModal onSave={(d) => saveStore(d, null)} onClose={() => setModal(null)} />}
      {(modal && modal.type === "edit") && <StoreFormModal store={modal.store} onSave={(d) => saveStore(d, modal.store)} onClose={() => setModal(null)} />}
      {(modal && modal.type === "delete") && (
        <Modal title={"Delete store — " + modal.store.name} onClose={() => setModal(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn variant="danger" icon="trash" onClick={() => deleteStore(modal.store)}>Delete store</Btn>
          </>}>
          <p className="rail-note">Deleting a store does not remove its history. Stores with invoices on file can't be deleted.</p>
        </Modal>
      )}
    </div>
  );
}

function StoreFormModal({ store, onSave, onClose }) {
  const D = BCCWE;
  const editing = !!store;
  const [name, setName] = useState(store ? store.name : "");
  const [invPrefix, setInvPrefix] = useState(store ? (store.invPrefix || "INV") : "INV");
  const [taxDefault, setTaxDefault] = useState(store ? (store.taxDefault || "gst") : "gst");
  const [tagline, setTagline] = useState(store ? (store.tagline || "") : "");
  const [addr1, setAddr1] = useState(store ? (store.addr1 || "") : "");
  const [addr2, setAddr2] = useState(store ? (store.addr2 || "") : "");
  const [phone, setPhone] = useState(store ? (store.phone || "") : "");
  const [email, setEmail] = useState(store ? (store.email || "") : "");
  const [web, setWeb] = useState(store ? (store.web || "") : "");
  const [gst, setGst] = useState(store ? (store.gst || "") : "");
  const [pst, setPst] = useState(store ? (store.pst || "") : "");
  const [logo, setLogo] = useState(store ? (store.logo || "") : "");
  const [active, setActive] = useState(store ? store.active !== false : true);
  const [show, setShow] = useState(Object.assign(
    { logo: true, tagline: true, address: true, phone: true, email: true, web: true, gst: true, pst: true },
    (store && store.show) || {}
  ));
  const fileRef = useRef(null);
  const valid = name.trim().length > 0 && invPrefix.trim().length > 0;

  function uploadLogo(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    window.compressImage(f, 400, 0.8).then((r) => setLogo(r.dataUrl)).catch(() => {});
  }
  function toggleShow(k) { setShow((s) => Object.assign({}, s, { [k]: !s[k] })); }

  function submit() {
    if (!valid) return;
    onSave({
      name: name.trim(), invPrefix: invPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "INV",
      taxDefault, tagline: tagline.trim(), addr1: addr1.trim(), addr2: addr2.trim(),
      phone: phone.trim(), email: email.trim(), web: web.trim(), gst: gst.trim(), pst: pst.trim(),
      logo, active, show,
    });
  }

  const showRows = [
    ["logo", "Logo"], ["tagline", "Tagline"], ["address", "Address"],
    ["phone", "Phone"], ["email", "Email"], ["web", "Website"], ["gst", "GST #"], ["pst", "PST #"],
  ];

  return (
    <Modal title={editing ? "Edit store — " + store.name : "Add store"} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={!valid} onClick={submit}>{editing ? "Save changes" : "Create store"}</Btn>
      </>}>
      <div className="meta-grid">
        <Field label="Store name" required><input value={name} placeholder="e.g. Cash / Invoice / Surrey Branch" onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Invoice prefix" hint="Used for this store's invoice numbers, e.g. INV-1001">
          <input value={invPrefix} onChange={(e) => setInvPrefix(e.target.value)} placeholder="INV" />
        </Field>
        <Field label="Default tax" hint="Applied to new invoices for this store unless changed">
          <select value={taxDefault} onChange={(e) => setTaxDefault(e.target.value)}>
            {D.TAX.order.map((k) => <option key={k} value={k}>{D.TAX.modes[k].label}</option>)}
          </select>
        </Field>
      </div>

      <div className="store-form-sec">Invoice profile — these details print on this store's invoices</div>
      <div className="meta-grid">
        <Field label="Tagline" full><input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Phone & Laptop Repair" /></Field>
        <Field label="Address line 1"><input value={addr1} onChange={(e) => setAddr1(e.target.value)} /></Field>
        <Field label="Address line 2"><input value={addr2} onChange={(e) => setAddr2(e.target.value)} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Website"><input value={web} onChange={(e) => setWeb(e.target.value)} /></Field>
        <Field label="GST #"><input value={gst} onChange={(e) => setGst(e.target.value)} placeholder="GST # ..." /></Field>
        <Field label="PST #"><input value={pst} onChange={(e) => setPst(e.target.value)} placeholder="PST # ..." /></Field>
      </div>

      <div className="store-logo-row">
        <div className="store-logo-prev">
          {logo ? <img src={logo} alt="logo" /> : <span>{(name || "ST").slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="store-logo-acts">
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadLogo} />
          <Btn variant="ghost" size="sm" icon="image" onClick={() => fileRef.current && fileRef.current.click()}>Upload logo</Btn>
          {logo && <Btn variant="ghost" size="sm" icon="trash" onClick={() => setLogo("")}>Remove</Btn>}
        </div>
      </div>

      <div className="store-form-sec">Show on invoice</div>
      <div className="store-show-grid">
        {showRows.map(([k, lbl]) => (
          <label key={k} className="store-show-chk">
            <input type="checkbox" checked={show[k] !== false} onChange={() => toggleShow(k)} />
            <span>{lbl}</span>
          </label>
        ))}
      </div>

      <label className="toggle-row" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div><strong>Store active</strong><span>Inactive stores are hidden from invoicing and filters</span></div>
      </label>
    </Modal>
  );
}

Object.assign(window, { Stores });
