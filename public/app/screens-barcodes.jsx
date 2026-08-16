/* ============================================================
   BCCWE — Barcode label printing (EAN-8 / Code128)
   Generate, print (A4 grid or label printer) and download barcodes.
   Uses JsBarcode (vendored) + html2canvas (for PNG).
   ============================================================ */
function bccweBarcodeDataUrl(code, opts) {
  // Render a single barcode to an offscreen canvas and return a PNG data URL.
  // `opts.type` is the product's chosen symbology; without it the length of the
  // number decides, and anything non-standard falls back to Code 128.
  opts = opts || {};
  var cv = document.createElement("canvas");
  var val = String(code || "00000000");
  var fmt = opts.type
    || ((/^\d{8}$/.test(val)) ? "EAN8" : (/^\d{13}$/.test(val)) ? "EAN13" : (/^\d{12}$/.test(val)) ? "UPC" : "CODE128");
  try {
    window.JsBarcode(cv, val, { format: fmt, width: 2, height: 60, fontSize: 14, margin: 6, displayValue: true });
  } catch (e) {
    try { window.JsBarcode(cv, val, { format: "CODE128", width: 2, height: 60, fontSize: 14, margin: 6, displayValue: true }); } catch (e2) { return ""; }
  }
  return cv.toDataURL("image/png");
}

function BarcodeModal({ items, initialCode, onClose, pushToast }) {
  const D = BCCWE;
  const list = (items && items.length ? items : (D.inventory || []));
  const saved = (D.prefs && D.prefs.barcode) || {};
  // Callers open this with an ITEM CODE (the Print-barcode button on a stock
  // row). Resolve it to that product's actual barcode, or the label prints the
  // item code as Code 128 and a scan reads back "1-USB-CAR-CHARGER".
  const [code, setCode] = useState(() => {
    const inv = (items && items.length ? items : (D.inventory || []));
    const start = initialCode || (inv[0] && (inv[0].barcode || inv[0].code)) || "";
    const hit = inv.filter((i) => String(i.barcode || "") === String(start) || String(i.code) === String(start))[0];
    return hit ? ((typeof barcodeOf === "function") ? barcodeOf(hit) : (hit.barcode || hit.code)) : start;
  });
  const [rows, setRows] = useState(saved.rows || 10);
  const [cols, setCols] = useState(saved.cols || 3);
  const [labelH, setLabelH] = useState(saved.labelH || 25); // mm
  const [gap, setGap] = useState(saved.gap != null ? saved.gap : 2); // mm between labels
  const [showName, setShowName] = useState(saved.showName !== false);
  const [showPrice, setShowPrice] = useState(saved.showPrice !== false);
  const [dataUrl, setDataUrl] = useState("");

  // `code` holds the VALUE being printed. Selecting a product loads that
  // product's barcode (falling back to its item code for older records).
  const item = list.find((i) => String(i.barcode || "") === code) || list.find((i) => i.code === code)
    || { code: code, name: "", price: 0 };
  // What the label will ACTUALLY carry. A value that isn't valid for the chosen
  // symbology falls back to Code 128, which is why an item code printed as a
  // barcode scanned back as text — so say so plainly instead of claiming EAN-8.
  const wantType = (typeof barcodeTypeOf === "function" && item.name) ? barcodeTypeOf(item) : null;
  const badFor = (typeof barcodeProblem === "function" && wantType) ? barcodeProblem(code, wantType) : "";
  const printType = (wantType && !badFor) ? wantType : "CODE128";
  const prettyType = printType === "EAN8" ? "EAN-8" : printType === "EAN13" ? "EAN-13" : printType === "UPC" ? "UPC-A" : "Code 128";
  const noBarcode = !!(item.name && !item.barcode);
  const count = Math.max(1, (Number(rows) || 1) * (Number(cols) || 1));

  useEffect(() => {
    if (!window.JsBarcode) { setDataUrl(""); return; }
    setDataUrl(bccweBarcodeDataUrl(code, { type: printType }));
  }, [code, printType]);

  // Give THIS product a proper EAN-8 without leaving the dialog.
  async function makeBarcode() {
    const target = (D.inventory || []).filter((i) => i.code === item.code)[0];
    if (!target || typeof genEan8 !== "function") return;
    const v = genEan8();
    if (!v) { pushToast && pushToast("Could not generate a barcode"); return; }
    target.barcode = v; target.barcodeType = "EAN8";
    window.logAudit && window.logAudit("UPDATE", "Product", "inventory_items", target.code, "Generated EAN-8 barcode " + v);
    setCode(v);
    const ok = window.persistNow ? await window.persistNow("inventory") : true;
    pushToast && pushToast(ok ? target.code + " barcode set to " + v : "Couldn't save — please try again");
  }

  function saveSettings() {
    if (!D.prefs) D.prefs = {};
    D.prefs.barcode = { rows: +rows, cols: +cols, labelH: +labelH, gap: +gap, showName: showName, showPrice: showPrice };
    if (window.persist) window.persist("prefs");
    pushToast && pushToast("Barcode layout saved");
  }

  function labelHtml() {
    var url = dataUrl || bccweBarcodeDataUrl(code, { type: printType });
    var one = '<div class="lbl">' +
      '<img src="' + url + '"/>' +
      (showName ? '<div class="nm">' + String(item.name || "").replace(/</g, "&lt;") + '</div>' : "") +
      (showPrice ? '<div class="pr">' + fmt(item.price || 0) + '</div>' : "") +
      "</div>";
    var all = "";
    for (var i = 0; i < count; i++) all += one;
    return all;
  }

  function printSheet() {
    var w = window.open("", "_blank");
    if (!w) { pushToast && pushToast("Please allow pop-ups to print"); return; }
    w.document.write(
      '<html><head><title>Barcodes — ' + String(item.code || "") + '</title><style>' +
      '@page { size: A4; margin: 8mm; }' +
      'body { margin: 0; font-family: system-ui, Arial, sans-serif; }' +
      '.grid { display: grid; grid-template-columns: repeat(' + (+cols) + ', 1fr); gap: ' + (+gap) + 'mm; }' +
      '.lbl { height: ' + (+labelH) + 'mm; border: 1px dashed #d0d0d0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; padding: 1mm; box-sizing: border-box; }' +
      '.lbl img { max-width: 96%; max-height: ' + Math.max(8, (+labelH) - 10) + 'mm; object-fit: contain; }' +
      '.nm { font-size: 9px; font-weight: 600; text-align: center; line-height: 1.1; }' +
      '.pr { font-size: 11px; font-weight: 700; }' +
      '</style></head><body><div class="grid">' + labelHtml() + '</div>' +
      '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},250);};</scr' + 'ipt>' +
      '</body></html>'
    );
    w.document.close();
  }

  function downloadPng() {
    // Single high-res barcode PNG for this product.
    var url = bccweBarcodeDataUrl(code, { type: printType });
    if (!url) { pushToast && pushToast("Could not generate barcode"); return; }
    var a = document.createElement("a");
    a.href = url; a.download = (item.code || "barcode") + ".png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    pushToast && pushToast("Downloaded " + (item.code || "barcode") + ".png");
  }

  const num = (v, set) => (e) => set(Math.max(1, parseInt(e.target.value, 10) || 1));

  // Products created before barcodes existed have none. This gives each of them
  // a valid in-house EAN-8 in one go, leaving anything that already has one.
  const missing = (D.inventory || []).filter((i) => !i.barcode);
  async function fillMissing() {
    if (!missing.length || typeof genEan8 !== "function") return;
    let n = 0;
    missing.forEach((i) => { const v = genEan8(); if (v) { i.barcode = v; i.barcodeType = "EAN8"; n++; } });
    window.logAudit && window.logAudit("UPDATE", "Product", "inventory_items", n + " items", "Generated EAN-8 barcodes for " + n + " product(s)");
    const ok = window.persistNow ? await window.persistNow("inventory") : true;
    pushToast && pushToast(ok ? n + " product(s) given a barcode" : "Couldn't save — please try again");
  }

  return (
    <Modal title="Print barcodes" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        {missing.length > 0 && <Btn variant="ghost" icon="plus" onClick={fillMissing}>Generate for {missing.length} without one</Btn>}
        <Btn variant="ghost" icon="download" onClick={downloadPng}>Download PNG</Btn>
        <Btn variant="ghost" onClick={saveSettings}>Save layout</Btn>
        <Btn variant="primary" icon="receipt" onClick={printSheet}>Print</Btn>
      </>}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 240 }}>
          <Field label="Product">
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              {list.length === 0 && <option value="">No products yet</option>}
              {list.map((i) => {
                const v = (typeof barcodeOf === "function") ? barcodeOf(i) : i.code;
                return <option key={i.code} value={v}>{i.name} — {v}</option>;
              })}
            </select>
          </Field>
          <Field label="Barcode value" hint={"Printing as " + prettyType + (badFor ? " — not a valid " + (wantType === "EAN8" ? "EAN-8" : wantType) : "")}>
            <input value={code} style={{ fontFamily: "var(--mono)" }} onChange={(e) => setCode(e.target.value)} />
          </Field>
          {(noBarcode || printType === "CODE128") && item.name && (
            <div className="inline-note" style={{ marginTop: 0 }}>
              <Icon name="alert" size={15} />
              <span>
                {noBarcode
                  ? <>This product has no barcode yet, so the label would carry its item code as text — scanning it reads “{item.code}” back.</>
                  : <>This value isn’t a valid {wantType === "EAN8" ? "EAN-8" : wantType}, so it prints as Code 128 text.</>}
                {" "}
                <button className="link" onClick={makeBarcode}>Give it an EAN-8 now</button>
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Rows"><input type="number" min="1" value={rows} onChange={num(rows, setRows)} /></Field>
            <Field label="Columns"><input type="number" min="1" value={cols} onChange={num(cols, setCols)} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Label height (mm)"><input type="number" min="10" value={labelH} onChange={(e) => setLabelH(Math.max(10, parseInt(e.target.value, 10) || 10))} /></Field>
            <Field label="Gap (mm)"><input type="number" min="0" value={gap} onChange={(e) => setGap(Math.max(0, parseInt(e.target.value, 10) || 0))} /></Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}><input type="checkbox" checked={showName} onChange={() => setShowName((v) => !v)} /> Show product name</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13 }}><input type="checkbox" checked={showPrice} onChange={() => setShowPrice((v) => !v)} /> Show price</label>
          <p className="rail-note" style={{ marginTop: 12 }}>
            Will print <strong>{count}</strong> label{count === 1 ? "" : "s"} ({rows}×{cols}) on A4.
            For a <strong>label printer</strong>, set Rows=1, Columns=1 and pick your label printer in the print dialog.
          </p>
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 220, textAlign: "center" }}>
          <div className="field-label">Preview</div>
          <div style={{ border: "1px solid #e6eaf0", borderRadius: 10, padding: 16, background: "#fff" }}>
            {dataUrl ? <img src={dataUrl} alt="barcode" style={{ maxWidth: "100%" }} /> : <div className="muted">Enter a code…</div>}
            {showName && <div style={{ fontWeight: 600, fontSize: 12, marginTop: 6 }}>{item.name}</div>}
            {showPrice && <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(item.price || 0)}</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { BarcodeModal, bccweBarcodeDataUrl });
