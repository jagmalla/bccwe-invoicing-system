/* ============================================================
   BCCWE — Minimal dependency-free XLSX writer
   Produces a genuine .xlsx (OOXML, store-only ZIP) so the file
   opens natively in Excel / Numbers / Google Sheets with typed
   numeric cells — no external library required.
   ============================================================ */
(function () {
  const enc = new TextEncoder();

  /* ---- CRC32 ---- */
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function xmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function colLetter(n) {
    let s = "";
    n += 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /* ---- build worksheet XML ----
     rows: array of arrays; each cell is { v, t } where t = "n" | "s" (string) | "h" (header string) */
  function sheetXml(rows) {
    let body = "";
    rows.forEach((row, ri) => {
      let cells = "";
      row.forEach((cell, ci) => {
        const ref = colLetter(ci) + (ri + 1);
        if (cell == null || cell.v === "" || cell.v == null) { cells += `<c r="${ref}"/>`; return; }
        if (cell.t === "n") {
          cells += `<c r="${ref}"><v>${cell.v}</v></c>`;
        } else {
          const style = cell.t === "h" ? ' s="1"' : "";
          cells += `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`;
        }
      });
      body += `<row r="${ri + 1}">${cells}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  function workbookXml(sheetName) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  }

  const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  /* ---- store-only ZIP ---- */
  function zip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);
      const localLen = local.length + nameBytes.length + data.length;

      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      ), nameBytes);
      offset += localLen;
    });

    const centralStart = offset;
    let centralLen = 0;
    const centralChunks = [];
    central.forEach((c) => {
      const arr = c instanceof Uint8Array ? c : new Uint8Array(c);
      centralChunks.push(arr); centralLen += arr.length;
    });
    const eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(centralLen), u32(centralStart), u16(0)
    ));

    const all = [...chunks, ...centralChunks, eocd];
    let total = 0; all.forEach((a) => total += a.length);
    const out = new Uint8Array(total);
    let p = 0; all.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---- public API ---- */
  // columns: [{ key, label, type }]  type: "number" | "text" (default text)
  // data: array of objects
  // Build the .xlsx file bytes (Uint8Array) from the spec.
  function buildXlsxBytes(sheetName, columns, data, opts) {
    opts = opts || {};
    const rows = [];
    if (opts.title) rows.push([{ v: opts.title, t: "h" }]);
    if (opts.subtitle) rows.push([{ v: opts.subtitle, t: "s" }]);
    if (opts.title || opts.subtitle) rows.push([]);
    rows.push(columns.map((c) => ({ v: c.label, t: "h" })));
    data.forEach((d) => {
      rows.push(columns.map((c) => {
        const raw = d[c.key];
        if (c.type === "number") return { v: typeof raw === "number" ? raw : (parseFloat(raw) || 0), t: "n" };
        return { v: raw == null ? "" : String(raw), t: "s" };
      }));
    });
    if (opts.totals) {
      rows.push([]);
      rows.push(columns.map((c, i) => {
        if (opts.totals[c.key] != null) {
          return c.type === "number" ? { v: opts.totals[c.key], t: "n" } : { v: opts.totals[c.key], t: "h" };
        }
        return i === 0 ? { v: "Total", t: "h" } : { v: "", t: "s" };
      }));
    }

    const files = [
      { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
      { name: "_rels/.rels", data: enc.encode(RELS) },
      { name: "xl/workbook.xml", data: enc.encode(workbookXml(sheetName)) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WB_RELS) },
      { name: "xl/styles.xml", data: enc.encode(STYLES) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml(rows)) },
    ];
    return zip(files);
  }

  function exportXlsx(filename, sheetName, columns, data, opts) {
    const bytes = buildXlsxBytes(sheetName, columns, data, opts);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  // Same workbook, returned as a base64 string for email attachments.
  function xlsxBase64(sheetName, columns, data, opts) {
    const bytes = buildXlsxBytes(sheetName, columns, data, opts);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  window.exportXlsx = exportXlsx;
  window.xlsxBase64 = xlsxBase64;
})();
