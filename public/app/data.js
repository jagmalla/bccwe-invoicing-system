/* ============================================================
   BCCWE Invoicing System — Mock data layer
   All amounts in CAD. BC tax: GST 5% + PST 7%.
   ============================================================ */
(function () {
  const company = {
    name: "BCCWE",
    tagline: "Phone & Laptop Repair · Pre-Owned Devices",
    addr1: "Unit 204 — 12830 80 Avenue",
    addr2: "Surrey, BC  V3W 3A8",
    phone: "(604) 555-0142",
    email: "sales@bccwe.ca",
    web: "bccwe.ca",
    gst: "GST # 81427 6391 RT0001",
    pst: "PST # PST-1042-8837",
    logo: "",
    // Which company details appear on invoices/PDF (toggle in Settings → Company).
    show: { logo: true, tagline: true, address: true, phone: true, email: true, web: true, gst: true, pst: true },
  };

  const TAX = {
    modes: {
      none: { id: "none", label: "No Tax", gst: 0, pst: 0, hint: "Exempt / export / wholesale", comps: [] },
      gst: { id: "gst", label: "GST only", gst: 0.05, pst: 0, hint: "PST-exempt items",
        comps: [{ bucket: "gst", name: "GST", rate: 0.05, agency: "CRA — Federal (GST/HST)", acct: "2100", acctName: "GST Payable" }] },
      pst: { id: "pst", label: "PST only", gst: 0, pst: 0.07, hint: "GST-exempt scenarios",
        comps: [{ bucket: "pst", name: "PST", rate: 0.07, agency: "BC Ministry of Finance (PST)", acct: "2110", acctName: "PST Payable" }] },
      both: { id: "both", label: "GST + PST", gst: 0.05, pst: 0.07, hint: "Standard BC retail",
        comps: [
          { bucket: "gst", name: "GST", rate: 0.05, agency: "CRA — Federal (GST/HST)", acct: "2100", acctName: "GST Payable" },
          { bucket: "pst", name: "PST", rate: 0.07, agency: "BC Ministry of Finance (PST)", acct: "2110", acctName: "PST Payable" },
        ] },
    },
    order: ["none", "gst", "pst", "both"],
  };

  const salespeople = [
    { id: "u_admin", name: "Harman Gill", initials: "HG", role: "Admin" },
    { id: "u_priya", name: "Priya Sandhu", initials: "PS", role: "Team Member" },
    { id: "u_kev", name: "Kevin Tran", initials: "KT", role: "Team Member" },
    { id: "u_acct", name: "Dana Mehta", initials: "DM", role: "Accountant" },
  ];

  const clients = [
    { id: "c1", name: "Riverside Mobile Ltd.", type: "Wholesale", contact: "Amrit Bains", phone: "(604) 555-0188", terms: "Net 30", emails: ["ap@riversidemobile.ca", "amrit@riversidemobile.ca"], defaultEmail: "ap@riversidemobile.ca", exempt: false, balance: 4218.45, taxDefault: "both", phone2: "(604) 555-0190", addr: "120 Riverside Way, Richmond, BC V6X 1A4", taxNumber: "81237 4455 RT0001", notes: "Largest wholesale account. Always CC Amrit on POs. Net 30 strictly — chase at day 25." },
    { id: "c2", name: "Coast Cellular Wholesale", type: "Wholesale", contact: "Jenny Ho", phone: "(778) 555-0110", terms: "Net 15", emails: ["accounts@coastcellular.com"], defaultEmail: "accounts@coastcellular.com", exempt: false, balance: 1890.0, taxDefault: "gst", phone2: "", addr: "3320 Boundary Rd, Burnaby, BC V5M 4A8", taxNumber: "72910 8821 RT0001", notes: "Prefers e-transfer. PST-exempt resale certificate on file." },
    { id: "c3", name: "Walk-in — Retail", type: "Retail", contact: "—", phone: "—", terms: "Due on receipt", emails: [], defaultEmail: "", exempt: false, balance: 0, taxDefault: "both" },
    { id: "c4", name: "Sukhdeep Randhawa", type: "Retail", contact: "Sukhdeep Randhawa", phone: "(604) 555-0173", terms: "Due on receipt", emails: ["sukh.r@gmail.com"], defaultEmail: "sukh.r@gmail.com", exempt: false, balance: 226.8, taxDefault: "both" },
    { id: "c5", name: "Fraser Valley School Dist.", type: "Wholesale", contact: "Procurement Office", phone: "(604) 555-0199", terms: "Net 45", emails: ["purchasing@fvsd.bc.ca", "finance@fvsd.bc.ca"], defaultEmail: "purchasing@fvsd.bc.ca", exempt: true, balance: 9650.0, taxDefault: "none", phone2: "(604) 555-0198", addr: "8521 King Rd, Chilliwack, BC V2P 7M9", taxNumber: "PROV-EXEMPT-FVSD", notes: "Tax-exempt public body. PO number required on every invoice or AP will reject it." },
    { id: "c6", name: "Newton Repair Hub", type: "Wholesale", contact: "Bilal Ahmed", phone: "(778) 555-0166", terms: "Net 30", emails: ["bilal@newtonrepair.ca"], defaultEmail: "bilal@newtonrepair.ca", exempt: false, balance: 0, taxDefault: "both", phone2: "", addr: "7044 King George Blvd, Surrey, BC V3W 5A8", taxNumber: "", notes: "Trade repair shop — buys screens in bulk. Friendly, pays on time." },
    { id: "c7", name: "Manpreet Kaur", type: "Retail", contact: "Manpreet Kaur", phone: "(604) 555-0150", terms: "Due on receipt", emails: ["manpreet.k@outlook.com"], defaultEmail: "manpreet.k@outlook.com", exempt: false, balance: 0, taxDefault: "both" },
  ];

  const suppliers = [
    { id: "s1", name: "Pacific Parts Distribution", contact: "Wholesale Desk", phone: "(604) 555-0300", addr: "8200 River Rd, Richmond BC", terms: "Net 30", balance: 6120.0 },
    { id: "s2", name: "MobileTech Components Inc.", contact: "Lena Park", phone: "(778) 555-0322", addr: "1100 Boundary Rd, Burnaby BC", terms: "Net 15", balance: 2480.5 },
    { id: "s3", name: "GreenCell Trade-In Co.", contact: "Marco Diaz", phone: "(604) 555-0344", addr: "330 Industrial Ave, Vancouver BC", terms: "COD", balance: 0 },
    { id: "s4", name: "Surrey Screen Supply", contact: "Ravi Nair", phone: "(604) 555-0377", addr: "13700 King George Blvd, Surrey BC", terms: "Net 30", balance: 980.0 },
  ];

  const inventory = [
    { code: "IPH-13-128-A", name: "iPhone 13 128GB — Grade A (Pre-Owned)", cat: "Phone", supplier: "s3", cost: 410, price: 619, stock: 7, bonus: 0, alert: 4, purchased: "2026-05-18" },
    { code: "IPH-12-64-B", name: "iPhone 12 64GB — Grade B (Pre-Owned)", cat: "Phone", supplier: "s3", cost: 300, price: 469, stock: 3, bonus: 0, alert: 4, purchased: "2026-03-22" },
    { code: "SAM-S22-128", name: "Samsung Galaxy S22 128GB (Pre-Owned)", cat: "Phone", supplier: "s3", cost: 330, price: 499, stock: 5, bonus: 0, alert: 3, purchased: "2026-04-05" },
    { code: "MBP-2019-13", name: "MacBook Pro 13\" 2019 256GB (Pre-Owned)", cat: "Laptop", supplier: "s3", cost: 720, price: 1049, stock: 2, bonus: 0, alert: 2, purchased: "2025-12-12" },
    { code: "DELL-XPS13", name: "Dell XPS 13 9310 i7 (Pre-Owned)", cat: "Laptop", supplier: "s3", cost: 640, price: 929, stock: 1, bonus: 0, alert: 2, purchased: "2025-08-08" },
    { code: "SCRN-IP13", name: "iPhone 13 OLED Screen Assembly", cat: "Part", supplier: "s4", cost: 58, price: 149, stock: 22, bonus: 2, alert: 8, purchased: "2026-05-25" },
    { code: "SCRN-S22", name: "Galaxy S22 AMOLED Screen", cat: "Part", supplier: "s4", cost: 72, price: 179, stock: 14, bonus: 1, alert: 8, purchased: "2026-03-18" },
    { code: "BAT-IP12", name: "iPhone 12 Battery (OEM-spec)", cat: "Part", supplier: "s2", cost: 14, price: 59, stock: 41, bonus: 4, alert: 12, purchased: "2026-05-10" },
    { code: "BAT-MBP", name: "MacBook Pro Battery A1989", cat: "Part", supplier: "s2", cost: 62, price: 169, stock: 6, bonus: 0, alert: 5, purchased: "2026-01-22" },
    { code: "CHG-USBC-65", name: "65W USB-C Charger", cat: "Accessory", supplier: "s1", cost: 11, price: 39, stock: 58, bonus: 6, alert: 15, purchased: "2026-05-28" },
    { code: "CASE-IP13", name: "iPhone 13 Protective Case", cat: "Accessory", supplier: "s1", cost: 3.5, price: 19, stock: 120, bonus: 12, alert: 25, purchased: "2026-02-12" },
    { code: "GLASS-UNIV", name: "Tempered Glass Protector (Universal)", cat: "Accessory", supplier: "s1", cost: 1.2, price: 14, stock: 9, bonus: 0, alert: 20, purchased: "2025-09-18" },
  ];

  // Service / labour lines that aren't stocked items
  const services = [
    { code: "SVC-DIAG", name: "Diagnostic & Inspection", price: 39 },
    { code: "SVC-SCRN-LBR", name: "Screen Replacement — Labour", price: 70 },
    { code: "SVC-BAT-LBR", name: "Battery Replacement — Labour", price: 45 },
    { code: "SVC-DATA", name: "Data Transfer / Backup", price: 49 },
    { code: "SVC-UNLOCK", name: "Software / Unlock Service", price: 60 },
  ];

  const accounts = [
    { code: "1000", name: "Cash on Hand", type: "Asset", balance: 3240.0 },
    { code: "1010", name: "Bank — Operating", type: "Asset", balance: 48210.55 },
    { code: "1200", name: "Accounts Receivable", type: "Asset", balance: 15985.25 },
    { code: "1300", name: "Inventory", type: "Asset", balance: 28640.0 },
    { code: "1500", name: "Equipment & Tools", type: "Asset", balance: 6200.0 },
    { code: "2000", name: "Accounts Payable", type: "Liability", balance: 9580.5 },
    { code: "2100", name: "GST Payable", type: "Liability", balance: 2106.4 },
    { code: "2110", name: "PST Payable", type: "Liability", balance: 2948.95 },
    { code: "2200", name: "Customer Deposits", type: "Liability", balance: 0 },
    { code: "3000", name: "Owner's Equity", type: "Equity", balance: 60000.0 },
    { code: "3900", name: "Retained Earnings", type: "Equity", balance: 21639.95 },
    { code: "4000", name: "Sales Revenue — Retail", type: "Revenue", balance: 96420.0 },
    { code: "4010", name: "Sales Revenue — Wholesale", type: "Revenue", balance: 61350.0 },
    { code: "4100", name: "Service & Repair Revenue", type: "Revenue", balance: 28940.0 },
    { code: "4200", name: "Restocking Fee Income", type: "Revenue", balance: 0 },
    { code: "4900", name: "Sales Discounts", type: "Revenue", balance: 0 },
    { code: "5000", name: "Cost of Goods Sold", type: "Expense", balance: 98610.0 },
    { code: "5100", name: "Loss on Defective Goods", type: "Expense", balance: 1010.0 },
    { code: "5110", name: "Loss on Lost / Missing Stock", type: "Expense", balance: 420.0 },
    { code: "6000", name: "Rent", type: "Expense", balance: 21600.0 },
    { code: "6100", name: "Wages & Salaries", type: "Expense", balance: 34800.0 },
    { code: "6200", name: "Utilities", type: "Expense", balance: 4180.0 },
    { code: "6210", name: "Gas & Fuel", type: "Expense", balance: 1240.0 },
    { code: "6300", name: "Marketing & Advertising", type: "Expense", balance: 3920.0 },
    { code: "6400", name: "Shop Supplies", type: "Expense", balance: 2610.0 },
    { code: "6500", name: "Food & Meals", type: "Expense", balance: 980.0 },
    { code: "6600", name: "Entertainment", type: "Expense", balance: 1450.0 },
    { code: "6700", name: "Cleaning Supplies", type: "Expense", balance: 720.0 },
    { code: "6800", name: "Office Supplies", type: "Expense", balance: 1380.0 },
    { code: "6900", name: "Other Expenses", type: "Expense", balance: 540.0 },
  ];

  // Helper to build invoice history
  const today = new Date("2026-06-14");
  function daysAgo(n) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  const invoices = [
    { no: "INV-1047", clientId: "c1", date: daysAgo(2), due: daysAgo(-28), sales: "u_priya", tax: "both", subtotal: 1240.0, gst: 62.0, pst: 86.8, total: 1388.8, paid: 0, status: "Unpaid" },
    { no: "INV-1046", clientId: "c4", date: daysAgo(3), due: daysAgo(3), sales: "u_kev", tax: "both", subtotal: 202.5, gst: 10.13, pst: 14.18, total: 226.81, paid: 0, status: "Unpaid" },
    { no: "INV-1045", clientId: "c5", date: daysAgo(6), due: daysAgo(-39), sales: "u_priya", tax: "none", subtotal: 9650.0, gst: 0, pst: 0, total: 9650.0, paid: 0, status: "Unpaid" },
    { no: "INV-1044", clientId: "c2", date: daysAgo(8), due: daysAgo(-7), sales: "u_admin", tax: "gst", subtotal: 1800.0, gst: 90.0, pst: 0, total: 1890.0, paid: 0, status: "Partially Paid" },
    { no: "INV-1043", clientId: "c7", date: daysAgo(10), due: daysAgo(10), sales: "u_kev", tax: "both", subtotal: 619.0, gst: 30.95, pst: 43.33, total: 693.28, paid: 693.28, status: "Paid" },
    { no: "INV-1042", clientId: "c6", date: daysAgo(14), due: daysAgo(16), sales: "u_priya", tax: "both", subtotal: 2480.0, gst: 124.0, pst: 173.6, total: 2777.6, paid: 2777.6, status: "Paid" },
    { no: "INV-1041", clientId: "c1", date: daysAgo(22), due: daysAgo(8), sales: "u_priya", tax: "both", subtotal: 2530.0, gst: 126.5, pst: 177.1, total: 2833.6, paid: 0, status: "Overdue" },
    { no: "INV-1040", clientId: "c4", date: daysAgo(26), due: daysAgo(26), sales: "u_kev", tax: "both", subtotal: 168.0, gst: 8.4, pst: 11.76, total: 188.16, paid: 188.16, status: "Paid" },
    { no: "INV-1039", clientId: "c2", date: daysAgo(33), due: daysAgo(18), sales: "u_admin", tax: "gst", subtotal: 980.0, gst: 49.0, pst: 0, total: 1029.0, paid: 1029.0, status: "Paid" },
    { no: "INV-1038", clientId: "c7", date: daysAgo(40), due: daysAgo(40), sales: "u_kev", tax: "both", subtotal: 109.0, gst: 5.45, pst: 7.63, total: 122.08, paid: 122.08, status: "Paid" },
  ];

  // Returns (credit notes) & exchanges — appear in Invoice History alongside sales
  const creditNotes = [
    { no: "CN-2007", type: "Return", retDisp: "Inventory", clientId: "c4", date: daysAgo(1), origInv: "INV-1046", sales: "u_kev", tax: "both", reason: "Customer changed mind — restocked", subtotal: -59.0, gst: -2.95, pst: -4.13, total: -66.08, refund: 66.08, status: "Refunded" },
    { no: "EX-3004", type: "Exchange", retDisp: "Inventory", clientId: "c7", date: daysAgo(1), origInv: "INV-1043", sales: "u_priya", tax: "both", reason: "iPhone 13 case → size swap (even exchange)", subtotal: 0.0, gst: 0.0, pst: 0.0, total: 0.0, refund: 0, status: "Exchanged" },
    { no: "CN-2006", type: "Return", retDisp: "Defected", clientId: "c1", date: daysAgo(5), origInv: "INV-1041", sales: "u_priya", tax: "both", reason: "DOA screen assembly — defective, written off", subtotal: -149.0, gst: -7.45, pst: -10.43, total: -166.88, refund: 166.88, status: "Refunded" },
    { no: "EX-3003", type: "Exchange", retDisp: "Inventory", clientId: "c2", date: daysAgo(9), origInv: "INV-1044", sales: "u_admin", tax: "gst", reason: "Galaxy S22 screen → higher-grade unit (+$30)", subtotal: 30.0, gst: 1.5, pst: 0.0, total: 31.5, refund: 0, status: "Exchanged" },
    { no: "CN-2005", type: "Return", retDisp: "Inventory", clientId: "c6", date: daysAgo(16), origInv: "INV-1042", sales: "u_priya", tax: "both", reason: "Over-ordered chargers — restocked", subtotal: -78.0, gst: -3.9, pst: -5.46, total: -87.36, refund: 87.36, status: "Refunded" },
    { no: "EX-3002", type: "Exchange", retDisp: "Defected", clientId: "c4", date: daysAgo(24), origInv: "INV-1040", sales: "u_kev", tax: "both", reason: "Battery swap — defective on install", subtotal: 0.0, gst: 0.0, pst: 0.0, total: 0.0, refund: 0, status: "Exchanged" },
  ];

  const payments = [
    { id: "p1", date: daysAgo(10), inv: "INV-1043", clientId: "c7", amount: 693.28, method: "Debit", acct: "1010" },
    { id: "p2", date: daysAgo(14), inv: "INV-1042", clientId: "c6", amount: 2777.6, method: "E-Transfer", acct: "1010" },
    { id: "p3", date: daysAgo(9), inv: "INV-1044", clientId: "c2", amount: 900.0, method: "Cheque", acct: "1010" },
    { id: "p4", date: daysAgo(26), inv: "INV-1040", clientId: "c4", amount: 188.16, method: "Cash", acct: "1000" },
  ];

  const expenses = [
    { id: "e1", date: daysAgo(1), category: "Cleaning Supplies", acct: "6700", desc: "Disinfectant & shop towels", amount: 64.2, method: "Debit", tax: "both", sales: "u_kev", receipt: "clean-supplies-jun.pdf" },
    { id: "e2", date: daysAgo(2), category: "Gas", acct: "6210", desc: "Fuel — parts pickup run", amount: 78.4, method: "Credit Card", tax: "gst", sales: "u_priya", receipt: "" },
    { id: "e3", date: daysAgo(3), category: "Food", acct: "6500", desc: "Team lunch — Friday", amount: 96.8, method: "Credit Card", tax: "both", sales: "u_admin", receipt: "lunch-0612.jpg" },
    { id: "e4", date: daysAgo(4), category: "Marketing", acct: "6300", desc: "Instagram ad campaign", amount: 150.0, method: "Credit Card", tax: "gst", sales: "u_admin", receipt: "meta-invoice.pdf" },
    { id: "e5", date: daysAgo(6), category: "Office supplies", acct: "6800", desc: "Printer toner & paper", amount: 112.35, method: "Debit", tax: "both", sales: "u_kev", receipt: "" },
    { id: "e6", date: daysAgo(8), category: "Entertainment", acct: "6600", desc: "Client dinner — wholesale account", amount: 184.5, method: "Credit Card", tax: "both", sales: "u_priya", receipt: "dinner-0606.jpg" },
    { id: "e7", date: daysAgo(10), category: "Gas", acct: "6210", desc: "Fuel — supplier run Burnaby", amount: 71.1, method: "Credit Card", tax: "gst", sales: "u_kev", receipt: "" },
    { id: "e8", date: daysAgo(12), category: "Rent", acct: "6000", desc: "Shop rent — June", amount: 2400.0, method: "Bank", tax: "none", sales: "u_acct", receipt: "rent-jun.pdf" },
    { id: "e9", date: daysAgo(14), category: "Wages", acct: "6100", desc: "Payroll — first half June", amount: 4100.0, method: "Bank", tax: "none", sales: "u_acct", receipt: "" },
    { id: "e10", date: daysAgo(18), category: "Cleaning Supplies", acct: "6700", desc: "Isopropyl alcohol (bulk)", amount: 42.0, method: "Cash", tax: "both", sales: "u_priya", receipt: "" },
    { id: "e11", date: daysAgo(22), category: "Office supplies", acct: "6800", desc: "Label printer rolls", amount: 58.9, method: "Debit", tax: "both", sales: "u_kev", receipt: "labels.jpg" },
    { id: "e12", date: daysAgo(26), category: "Food", acct: "6500", desc: "Coffee & break-room supplies", amount: 47.25, method: "Cash", tax: "both", sales: "u_priya", receipt: "" },
    { id: "e13", date: daysAgo(33), category: "Marketing", acct: "6300", desc: "Google Ads — May", amount: 220.0, method: "Credit Card", tax: "gst", sales: "u_admin", receipt: "google-may.pdf" },
    { id: "e14", date: daysAgo(40), category: "Rent", acct: "6000", desc: "Shop rent — May", amount: 2400.0, method: "Bank", tax: "none", sales: "u_acct", receipt: "rent-may.pdf" },
    { id: "e15", date: daysAgo(44), category: "Wages", acct: "6100", desc: "Payroll — second half May", amount: 4250.0, method: "Bank", tax: "none", sales: "u_acct", receipt: "" },
    { id: "e16", date: daysAgo(52), category: "Entertainment", acct: "6600", desc: "Staff appreciation outing", amount: 130.0, method: "Credit Card", tax: "both", sales: "u_admin", receipt: "" },
    { id: "e17", date: daysAgo(60), category: "Other", acct: "6900", desc: "Business license renewal", amount: 165.0, method: "Bank", tax: "none", sales: "u_acct", receipt: "license.pdf" },
    { id: "e18", date: daysAgo(70), category: "Gas", acct: "6210", desc: "Fuel — courier deliveries", amount: 68.3, method: "Credit Card", tax: "gst", sales: "u_kev", receipt: "" },
  ];

  // Expense type → ledger account map (drives the Expenses dropdown)
  const expenseCategories = [
    { name: "Defective Stock", acct: "5100", stockLoss: "defective" },
    { name: "Lost Stock", acct: "5110", stockLoss: "lost" },
    { name: "Gas", acct: "6210" },
    { name: "Rent", acct: "6000" },
    { name: "Food", acct: "6500" },
    { name: "Wages", acct: "6100" },
    { name: "Entertainment", acct: "6600" },
    { name: "Cleaning Supplies", acct: "6700" },
    { name: "Office supplies", acct: "6800" },
    { name: "Marketing", acct: "6300" },
    { name: "Other", acct: "6900" },
  ];

  // Non-invoice (cash) sales
  const cashSales = [
    { id: "cs1", date: daysAgo(0), client: "Walk-in", type: "Retail", kind: "Sale", item: "Tempered Glass + Install", total: 28.0, method: "Cash", sales: "u_kev" },
    { id: "cs2", date: daysAgo(0), client: "Walk-in", type: "Retail", kind: "Sale", item: "iPhone 13 Screen Repair", total: 245.0, method: "Debit", sales: "u_priya" },
    { id: "cs3", date: daysAgo(1), client: "Manpreet Kaur", type: "Retail", kind: "Exchange", retDisp: "Inventory", item: "Case swap (size)", total: 0.0, method: "—", sales: "u_kev" },
    { id: "cs4", date: daysAgo(2), client: "Walk-in", type: "Retail", kind: "Return", retDisp: "Defected", item: "USB-C Charger (DOA)", total: -39.0, method: "Cash", sales: "u_kev" },
    { id: "cs5", date: daysAgo(2), client: "Walk-in", type: "Retail", kind: "Sale", item: "Battery Replacement — iPhone 12", total: 104.0, method: "Debit", sales: "u_priya" },
  ];

  // Defective / written-off products (returns that can't be resold = loss)
  const defectiveProducts = [
    { date: daysAgo(3), code: "SCRN-IP13", name: "iPhone 13 OLED Screen Assembly", qty: 1, costLoss: 58.0, reason: "DOA on install", ref: "RET-204", kind: "defective" },
    { date: daysAgo(7), code: "BAT-IP12", name: "iPhone 12 Battery (OEM-spec)", qty: 2, costLoss: 28.0, reason: "Swollen cells", ref: "RET-201", kind: "defective" },
    { date: daysAgo(12), code: "CHG-USBC-65", name: "65W USB-C Charger", qty: 1, costLoss: 11.0, reason: "Returned faulty (DOA)", ref: "RET-198", kind: "defective" },
    { date: daysAgo(9), code: "GLASS-UNIV", name: "Tempered Glass Protector (Universal)", qty: 6, costLoss: 18.0, reason: "Unaccounted at stock count", ref: "LOST-112", kind: "lost" },
    { date: daysAgo(18), code: "CASE-IP14", name: "iPhone 14 Silicone Case", qty: 3, costLoss: 21.0, reason: "Missing from shelf — suspected shrinkage", ref: "LOST-108", kind: "lost" },
  ];

  // Recent journal entries (derived examples for the ledger view)
  const journal = [
    { id: "JE-2051", date: daysAgo(2), memo: "Invoice INV-1047 — Riverside Mobile", lines: [
      { acct: "1200", name: "Accounts Receivable", dr: 1388.8, cr: 0 },
      { acct: "5000", name: "Cost of Goods Sold", dr: 820.0, cr: 0 },
      { acct: "4010", name: "Sales Revenue — Wholesale", dr: 0, cr: 1240.0 },
      { acct: "2100", name: "GST Payable", dr: 0, cr: 62.0 },
      { acct: "2110", name: "PST Payable", dr: 0, cr: 86.8 },
      { acct: "1300", name: "Inventory", dr: 0, cr: 820.0 },
    ]},
    { id: "JE-2050", date: daysAgo(3), memo: "Invoice INV-1046 — S. Randhawa", lines: [
      { acct: "1200", name: "Accounts Receivable", dr: 226.81, cr: 0 },
      { acct: "5000", name: "Cost of Goods Sold", dr: 116.0, cr: 0 },
      { acct: "4000", name: "Sales Revenue — Retail", dr: 0, cr: 202.5 },
      { acct: "2100", name: "GST Payable", dr: 0, cr: 10.13 },
      { acct: "2110", name: "PST Payable", dr: 0, cr: 14.18 },
      { acct: "1300", name: "Inventory", dr: 0, cr: 116.0 },
    ]},
    { id: "JE-2049", date: daysAgo(4), memo: "Expense — Instagram ad campaign", lines: [
      { acct: "6300", name: "Marketing & Advertising", dr: 150.0, cr: 0 },
      { acct: "2100", name: "GST Payable", dr: 7.5, cr: 0 },
      { acct: "1010", name: "Bank — Operating", dr: 0, cr: 157.5 },
    ]},
    { id: "JE-2048", date: daysAgo(9), memo: "Payment received — INV-1044", lines: [
      { acct: "1010", name: "Bank — Operating", dr: 900.0, cr: 0 },
      { acct: "1200", name: "Accounts Receivable", dr: 0, cr: 900.0 },
    ]},
    { id: "JE-2047", date: daysAgo(11), memo: "Stock received — Surrey Screen Supply PO-338", lines: [
      { acct: "1300", name: "Inventory", dr: 980.0, cr: 0 },
      { acct: "2000", name: "Accounts Payable", dr: 0, cr: 980.0 },
    ]},
  ];

  const purchaseOrders = [
    { po: "PO-341", supplier: "s4", date: daysAgo(1), items: "iPhone 13 Screens ×20", tracking: "1Z992A...8841", total: 1160.0, status: "Placed" },
    { po: "PO-340", supplier: "s2", date: daysAgo(3), items: "iPhone 12 Batteries ×50", tracking: "CP4471...CA", total: 700.0, status: "In Transit" },
    { po: "PO-339", supplier: "s3", date: daysAgo(5), items: "Pre-Owned mixed lot ×8", tracking: "—", total: 3120.0, status: "Received" },
    { po: "PO-338", supplier: "s4", date: daysAgo(11), items: "Galaxy S22 Screens ×10", tracking: "1Z992A...7720", total: 720.0, status: "Received" },
  ];

  // ---- Client online orders (placed by clients through their portal login) ----
  // status flow: Ordering → Ordered → In Transit → Received  (Discrepancy = paid + ordered but short-received)
  const orders = [
    { id: "ORD-1009", clientId: "c1", placed: daysAgo(0), portal: true, paid: false, status: "Ordering", tracking: "", note: "Submitted via client portal", lines: [
      { code: "IPH-13-128-A", name: "iPhone 13 128GB — Grade A (Pre-Owned)", price: 619, qtyOrdered: 4, qtyReceived: 0 },
      { code: "CASE-IP13", name: "iPhone 13 Protective Case", price: 19, qtyOrdered: 10, qtyReceived: 0 },
    ]},
    { id: "ORD-1008", clientId: "c6", placed: daysAgo(1), portal: true, paid: false, status: "Ordering", tracking: "", note: "Awaiting confirmation", lines: [
      { code: "SCRN-IP13", name: "iPhone 13 OLED Screen Assembly", price: 149, qtyOrdered: 6, qtyReceived: 0 },
      { code: "BAT-IP12", name: "iPhone 12 Battery (OEM-spec)", price: 59, qtyOrdered: 8, qtyReceived: 0 },
    ]},
    { id: "ORD-1007", clientId: "c2", placed: daysAgo(3), portal: true, paid: true, status: "Ordered", tracking: "", note: "Paid on order — awaiting dispatch", lines: [
      { code: "SAM-S22-128", name: "Samsung Galaxy S22 128GB (Pre-Owned)", price: 499, qtyOrdered: 3, qtyReceived: 0 },
      { code: "SCRN-S22", name: "Galaxy S22 AMOLED Screen", price: 179, qtyOrdered: 4, qtyReceived: 0 },
    ]},
    { id: "ORD-1006", clientId: "c5", placed: daysAgo(5), portal: true, paid: true, status: "In Transit", tracking: "1Z 992A 0392 4471 8290", note: "Shipped via UPS Ground", lines: [
      { code: "MBP-2019-13", name: "MacBook Pro 13\" 2019 256GB (Pre-Owned)", price: 1049, qtyOrdered: 2, qtyReceived: 0 },
      { code: "CHG-USBC-65", name: "65W USB-C Charger", price: 39, qtyOrdered: 6, qtyReceived: 0 },
    ]},
    { id: "ORD-1005", clientId: "c1", placed: daysAgo(9), portal: true, paid: true, status: "Received", tracking: "1Z 992A 0392 4471 6610", note: "Delivered complete", lines: [
      { code: "BAT-MBP", name: "MacBook Pro Battery A1989", price: 169, qtyOrdered: 4, qtyReceived: 4 },
      { code: "GLASS-UNIV", name: "Tempered Glass Protector (Universal)", price: 14, qtyOrdered: 20, qtyReceived: 20 },
    ]},
    { id: "ORD-1004", clientId: "c6", placed: daysAgo(14), portal: true, paid: true, status: "Discrepancy", tracking: "CP 4471 8210 9920 CA", note: "Short shipment — 2 screens missing, paid in full", lines: [
      { code: "SCRN-IP13", name: "iPhone 13 OLED Screen Assembly", price: 149, qtyOrdered: 8, qtyReceived: 6 },
      { code: "IPH-12-64-B", name: "iPhone 12 64GB — Grade B (Pre-Owned)", price: 469, qtyOrdered: 3, qtyReceived: 3 },
    ]},
  ];

  const smtpProfiles = (function () {
    const seed = [
      { id: "sp1", name: "Sales", from: "sales@bccwe.ca", fromName: "BCCWE Sales", host: "mail.bccwe.ca", port: 465, enc: "SSL", user: "sales@bccwe.ca", replyTo: "sales@bccwe.ca", isDefault: true },
      { id: "sp2", name: "Accounts", from: "accounts@bccwe.ca", fromName: "BCCWE Accounts", host: "mail.bccwe.ca", port: 587, enc: "TLS", user: "accounts@bccwe.ca", replyTo: "accounts@bccwe.ca", isDefault: false },
    ];
    try { const s = JSON.parse(localStorage.getItem("bccwe_smtp") || "null"); if (s && s.v === 1 && Array.isArray(s.profiles) && s.profiles.length) return s.profiles; } catch (e) {}
    return seed;
  })();
  window.saveBCCWESmtp = function () {
    try { localStorage.setItem("bccwe_smtp", JSON.stringify({ v: 1, profiles: window.BCCWE.smtpProfiles })); } catch (e) {}
  };

  // ---- email log: every message the system sent (PHPMailer send result) ----
  // status: Delivered | Opened | Pending | Failed | Bounced
  const mailLog = (function () {
    const seed = [
      { id: "m1047", ts: daysAgo(2) + " 14:23", kind: "invoice", subject: "Invoice INV-1047 from BCCWE", docNo: "INV-1047", clientId: "c1", profileId: "sp1", to: ["ap@riversidemobile.ca", "amrit@riversidemobile.ca"], cc: ["records@bccwe.ca"], attachments: ["INV-1047.pdf"], status: "Delivered", code: "250 2.0.0 Accepted", note: "Accepted by mx.riversidemobile.ca", openedAt: "" },
      { id: "ms1", ts: daysAgo(2) + " 15:10", kind: "statement", subject: "Account statement — Riverside Mobile Ltd.", docNo: "", clientId: "c1", profileId: "sp2", to: ["ap@riversidemobile.ca"], cc: [], attachments: ["Statement-Riverside-Jun2026.pdf"], status: "Opened", code: "250 2.0.0 Accepted", note: "Opened by recipient", openedAt: daysAgo(1) + " 09:12" },
      { id: "m1046", ts: daysAgo(3) + " 09:48", kind: "invoice", subject: "Invoice INV-1046 from BCCWE", docNo: "INV-1046", clientId: "c4", profileId: "sp1", to: ["sukh.r@gmail.com"], cc: ["records@bccwe.ca"], attachments: ["INV-1046.pdf"], status: "Delivered", code: "250 2.0.0 OK", note: "Accepted by gmail-smtp-in.l.google.com", openedAt: "" },
      { id: "mord6", ts: daysAgo(5) + " 16:02", kind: "order", subject: "Order ORD-1006 confirmation — shipped", docNo: "ORD-1006", clientId: "c5", profileId: "sp1", to: ["purchasing@fvsd.bc.ca"], cc: [], attachments: ["ORD-1006.pdf"], status: "Delivered", code: "250 2.0.0 Accepted", note: "Accepted by mail.fvsd.bc.ca", openedAt: "" },
      { id: "m1045", ts: daysAgo(6) + " 11:30", kind: "invoice", subject: "Invoice INV-1045 from BCCWE", docNo: "INV-1045", clientId: "c5", profileId: "sp2", to: ["purchasing@fvsd.bc.ca", "finance@fvsd.bc.ca"], cc: ["records@bccwe.ca"], attachments: ["INV-1045.pdf"], status: "Delivered", code: "250 2.0.0 Accepted", note: "Accepted by mail.fvsd.bc.ca", openedAt: "" },
      { id: "m1044", ts: daysAgo(8) + " 10:05", kind: "invoice", subject: "Invoice INV-1044 from BCCWE", docNo: "INV-1044", clientId: "c2", profileId: "sp2", to: ["accounts@coastcellular.com"], cc: [], attachments: ["INV-1044.pdf"], status: "Opened", code: "250 2.0.0 OK", note: "Opened by recipient", openedAt: daysAgo(7) + " 14:41" },
      { id: "mrcpt7", ts: daysAgo(10) + " 13:20", kind: "receipt", subject: "Payment receipt — INV-1043", docNo: "INV-1043", clientId: "c7", profileId: "sp1", to: ["manpreet.k@outlook.com"], cc: [], attachments: ["Receipt-INV-1043.pdf"], status: "Delivered", code: "250 2.0.0 Accepted", note: "Accepted by outlook-com.olc.protection.outlook.com", openedAt: "" },
      { id: "m1043", ts: daysAgo(10) + " 09:15", kind: "invoice", subject: "Invoice INV-1043 from BCCWE", docNo: "INV-1043", clientId: "c7", profileId: "sp1", to: ["manpreet.kk@outlook.com"], cc: [], attachments: ["INV-1043.pdf"], status: "Bounced", code: "550 5.1.1 User unknown", note: "Recipient address rejected — check spelling of manpreet.kk@outlook.com", openedAt: "" },
      { id: "m1042", ts: daysAgo(14) + " 12:48", kind: "invoice", subject: "Invoice INV-1042 from BCCWE", docNo: "INV-1042", clientId: "c6", profileId: "sp2", to: ["bilal@newtonrepair.ca"], cc: ["records@bccwe.ca"], attachments: ["INV-1042.pdf"], status: "Delivered", code: "250 2.0.0 Accepted", note: "Accepted by mail.newtonrepair.ca", openedAt: "" },
      { id: "m1041", ts: daysAgo(22) + " 08:31", kind: "invoice", subject: "Invoice INV-1041 from BCCWE", docNo: "INV-1041", clientId: "c1", profileId: "sp1", to: ["ap@riversidemobile.ca"], cc: [], attachments: ["INV-1041.pdf"], status: "Failed", code: "451 4.4.1 Connection timed out", note: "SMTP host did not respond — retried 3×, then queued. Resend to try again.", openedAt: "" },
      { id: "m1040", ts: daysAgo(26) + " 15:55", kind: "invoice", subject: "Invoice INV-1040 from BCCWE", docNo: "INV-1040", clientId: "c4", profileId: "sp1", to: ["sukh.r@gmail.com"], cc: [], attachments: ["INV-1040.pdf"], status: "Delivered", code: "250 2.0.0 OK", note: "Accepted by gmail-smtp-in.l.google.com", openedAt: "" },
    ];
    try { const s = JSON.parse(localStorage.getItem("bccwe_mail") || "null"); if (s && s.v === 2 && Array.isArray(s.mailLog)) return s.mailLog; } catch (e) {}
    return seed;
  })();

  // ---- download log: every PDF / export pulled from the system ----
  const downloadLog = (function () {
    const seed = [
      { id: "d1", ts: daysAgo(1) + " 17:02", kind: "CSV", file: "invoice-history-jun2026.csv", docNo: "", clientId: "", user: "Harman Gill" },
      { id: "d2", ts: daysAgo(2) + " 14:25", kind: "PDF", file: "INV-1047.pdf", docNo: "INV-1047", clientId: "c1", user: "Harman Gill" },
      { id: "d3", ts: daysAgo(2) + " 15:08", kind: "PDF", file: "Statement-Riverside-Jun2026.pdf", docNo: "", clientId: "c1", user: "Dana Mehta" },
      { id: "d4", ts: daysAgo(6) + " 11:28", kind: "PDF", file: "INV-1045.pdf", docNo: "INV-1045", clientId: "c5", user: "Priya Sandhu" },
      { id: "d5", ts: daysAgo(10) + " 09:13", kind: "PDF", file: "INV-1043.pdf", docNo: "INV-1043", clientId: "c7", user: "Kevin Tran" },
      { id: "d6", ts: daysAgo(22) + " 08:29", kind: "PDF", file: "INV-1041.pdf", docNo: "INV-1041", clientId: "c1", user: "Priya Sandhu" },
    ];
    try { const s = JSON.parse(localStorage.getItem("bccwe_mail") || "null"); if (s && s.v === 2 && Array.isArray(s.downloadLog)) return s.downloadLog; } catch (e) {}
    return seed;
  })();

  window.saveBCCWEMail = function () {
    try { localStorage.setItem("bccwe_mail", JSON.stringify({ v: 2, mailLog: window.BCCWE.mailLog, downloadLog: window.BCCWE.downloadLog })); } catch (e) {}
  };
  // notify any mounted screen that the logs changed
  function emitMail() { try { window.dispatchEvent(new CustomEvent("bccwe-mail")); } catch (e) {} }
  // append an email send and return its log id (status starts "Pending")
  window.logEmail = function (entry) {
    const id = "m" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const now = window.BCCWE.today + " " + new Date().toTimeString().slice(0, 5);
    window.BCCWE.mailLog.unshift(Object.assign({ id, ts: now, cc: [], attachments: [], status: "Pending", code: "", note: "Queued — connecting to SMTP host…", openedAt: "" }, entry, { id }));
    window.saveBCCWEMail(); emitMail();
    return id;
  };
  // resolve a queued send to its delivery outcome
  window.resolveEmail = function (id, status, code, note) {
    const e = window.BCCWE.mailLog.find((x) => x.id === id);
    if (!e) return;
    e.status = status; e.code = code || e.code; e.note = note || e.note;
    window.saveBCCWEMail(); emitMail();
  };

  // ---- Activity log (audit trail) ----
  // The caller's IP is fetched from the server (req.ip) and cached here.
  window.__clientIp = "";
  try {
    fetch("/api/whoami").then(function (r) { return r.json(); })
      .then(function (d) { window.__clientIp = (d && d.ip) || ""; })
      .catch(function () {});
  } catch (e) {}

  // Who is acting. There is no login screen, so this defaults to the admin
  // user; if a currentUserId is ever set, it is honoured.
  window.currentUser = function () {
    // The signed-in login id is the source of truth for who is acting.
    if (window.__session && window.__session.userId) {
      return {
        id: window.__session.userId,
        name: window.__session.name || window.__session.userId,
        role: window.__session.role || "User",
      };
    }
    var B = window.BCCWE || {};
    var users = B.users || [];
    var uid = B.currentUserId || "u_admin";
    var u = users.find(function (x) { return x.id === uid; }) || users[0] || { name: "admin", role: "r_admin" };
    var roleName = u.role;
    var r = (B.roles || []).find(function (x) { return x.id === u.role; });
    if (r) roleName = r.name;
    return { id: u.id, name: u.name || "admin", role: roleName || "Admin" };
  };

  // Compress an uploaded image (File) to a smaller base64 data URL so receipts
  // and logos use little space. PDFs / non-images are read as-is. Returns a
  // Promise that resolves to { name, type, dataUrl }.
  window.compressImage = function (file, maxDim, quality) {
    maxDim = maxDim || 1100;
    quality = quality || 0.7;
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error("no file")); return; }
      var reader = new FileReader();
      reader.onerror = reject;
      if (!/^image\//.test(file.type)) {
        // Not an image (e.g. PDF) — keep as-is.
        reader.onload = function () { resolve({ name: file.name, type: file.type, dataUrl: reader.result }); };
        reader.readAsDataURL(file);
        return;
      }
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var out = canvas.toDataURL("image/jpeg", quality);
          resolve({ name: file.name.replace(/\.(png|gif|bmp|webp)$/i, ".jpg"), type: "image/jpeg", dataUrl: out });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // ---- WhatsApp helpers (#3/#4) ----
  // Build the full international number (digits only) from an entity's country
  // code (default +1) and phone.
  window.waNumber = function (ent) {
    var cc = String((ent && ent.countryCode) || "+1").replace(/\D/g, "");
    var ph = String((ent && (ent.phone || ent.phone2)) || "").replace(/\D/g, "");
    if (!ph) return "";
    return cc + ph;
  };
  window.waLink = function (ent, message) {
    var n = window.waNumber(ent);
    if (!n) return "";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(message || "");
  };
  // Send a WhatsApp message: if the WhatsApp Business API is configured &
  // enabled, send automatically via the server; otherwise open wa.me (tap to
  // send). cb(result) is called for the API path. Returns "api" | "link" | "".
  window.sendWhatsApp = function (ent, message, cb) {
    var wc = window.BCCWE.waConfig || {};
    var num = window.waNumber(ent);
    if (!num) return "";
    if (wc.enabled && wc.token && wc.phoneId) {
      fetch("/api/send-whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: wc.token, phoneId: wc.phoneId, to: num, message: message || "" }),
      }).then(function (r) { return r.json(); }).then(function (r) { if (cb) cb(r); })
        .catch(function (e) { if (cb) cb({ ok: false, error: e.message }); });
      return "api";
    }
    var link = window.waLink(ent, message);
    if (link) { window.open(link, "_blank"); return "link"; }
    return "";
  };
  // Compose the WhatsApp message for an invoice: each item (name ×qty @ price)
  // plus the invoice total.
  window.invoiceWaMessage = function (inv, client) {
    var C = (window.STORES ? window.STORES.profile(inv.companyId) : null) || window.BCCWE.company || {};
    var lines = (typeof deriveLines === "function") ? deriveLines(inv) : (inv.lines || []);
    var money = function (n) { return "$" + (Number(n) || 0).toFixed(2); };
    var msg = "Hi " + ((client && client.name) || "") + ",\n";
    msg += "Here is your invoice " + (inv.no || "") + " from " + (C.name || "BCCWE") + ":\n\n";
    lines.forEach(function (l) {
      var lt = (l.qty || 0) * (l.price || 0) * (1 - ((l.disc || 0) / 100));
      msg += "• " + (l.desc || "Item") + "  ×" + (l.qty || 0) + " @ " + money(l.price) + " = " + money(lt) + "\n";
    });
    msg += "\nTotal: " + money(inv.total) + "\n\nThank you!";
    return msg;
  };

  // ---- Stores / Companies access + helpers ----
  // A record (invoice / sale / expense) "belongs" to a store via its companyId.
  // Records with no companyId fall back to the default (first) store so legacy
  // data still appears. Owners/Admins may see every store and the combined view;
  // other users are limited to the stores listed on their user record.
  window.STORES = (function () {
    function D() { return window.BCCWE || {}; }
    function all() { return D().companies || []; }
    function active() { return all().filter(function (c) { return c.active !== false; }); }
    function byId(id) { return all().find(function (c) { return c.id === id; }) || null; }
    function defaultId() { var a = active(); return a.length ? a[0].id : ""; }
    function idOf(rec) { return (rec && rec.companyId) || defaultId(); }
    function isAdmin() {
      var s = window.__session || {};
      // Admin tier follows the ASSIGNED role. The bare owner account (no role
      // record) is admin by default so there is always a way in.
      if (s.roleId === "r_admin" || s.roleId === "r_owner") return true;
      if (s.role === "Admin" || s.role === "Owner") return true;
      if (s.isOwner && !s.roleId) return true;
      return false;
    }
    function allowedIds() {
      var ids = active().map(function (c) { return c.id; });
      if (isAdmin()) return ids;
      var s = window.__session || {};
      var u = (D().users || []).find(function (x) { return x.id === s.userId; });
      var list = (u && Array.isArray(u.companies) && u.companies.length) ? u.companies : ids;
      return list.filter(function (id) { return ids.indexOf(id) >= 0; });
    }
    function allowed() { var ids = allowedIds(); return active().filter(function (c) { return ids.indexOf(c.id) >= 0; }); }
    // Only owners/admins get the combined "All stores" view.
    function canSeeAll() { return isAdmin(); }
    function profile(companyId) { return byId(companyId) || D().company || {}; }
    function nameOf(companyId) { var c = byId(companyId); return c ? c.name : ""; }
    // Does a record match the active filter? filter==="all" → everything.
    function matches(rec, filter) {
      if (!filter || filter === "all") return true;
      return idOf(rec) === filter;
    }
    // The store filter the UI should open with for the signed-in user.
    function initialFilter() {
      if (canSeeAll()) return "all";
      var a = allowedIds();
      return a.length ? a[0] : "all";
    }
    return {
      all: all, active: active, byId: byId, defaultId: defaultId, idOf: idOf,
      isAdmin: isAdmin, allowedIds: allowedIds, allowed: allowed, canSeeAll: canSeeAll,
      profile: profile, nameOf: nameOf, matches: matches, initialFilter: initialFilter,
    };
  })();

  // Next invoice number string for a store (e.g. "INV-1048"), using its own
  // prefix + counter so each store numbers independently.
  window.nextInvNoForStore = function (companyId) {
    var c = window.STORES.byId(companyId);
    if (!c) return "INV-" + (window.BCCWE.nextInvoiceNo || 1000);
    return (c.invPrefix || "INV") + "-" + (c.nextInvoiceNo || 1000);
  };
  // Advance a store's invoice counter after a new invoice is saved.
  window.bumpStoreInvoiceNo = function (companyId) {
    var c = window.STORES.byId(companyId);
    if (c) c.nextInvoiceNo = (c.nextInvoiceNo || 1000) + 1;
  };

  // A client's purchase history of one item, taken from the real records:
  // their invoices (actual saved line items) plus any POS / quick-sale lines.
  // Used to drive price suggestions, so anything already in Invoice History
  // shows up here without needing a separate ledger.
  window.clientPurchaseHistory = function (clientId, code, limit) {
    if (!clientId || !code) return [];
    var D = window.BCCWE || {}, out = [];
    try {
      (D.invoices || []).forEach(function (inv) {
        if (inv.clientId !== clientId || inv.kind === "order") return;
        var lines = inv.lines && inv.lines.length ? inv.lines
          : ((typeof deriveLines === "function") ? deriveLines(inv) : []);
        (lines || []).forEach(function (l) {
          if (l && l.code === code && (l.qty || 0) > 0) out.push({ date: inv.date, qty: l.qty, price: l.price, disc: l.disc || 0 });
        });
      });
      (D.cashSales || []).forEach(function (s) {
        if (s.clientId !== clientId || !Array.isArray(s.lines)) return;
        s.lines.forEach(function (l) {
          if (l && l.code === code && (l.qty || 0) > 0) out.push({ date: s.date, qty: l.qty, price: l.price, disc: l.disc || 0 });
        });
      });
      out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    } catch (e) { return []; }
    return limit ? out.slice(0, limit) : out;
  };

  // ---- Identity helpers (who is signed in) ----
  // Stable user-record id for the session (matches salespeople / users ids).
  window.sessionUid = function () {
    var s = window.__session || {};
    return s.uid || (s.isOwner ? "u_owner" : (s.userId || ""));
  };
  // The client record this login represents (empty for staff / owner).
  window.sessionClientId = function () {
    var s = window.__session || {};
    if (s.clientId) return s.clientId;
    var u = (window.BCCWE.users || []).find(function (x) {
      return x.id === s.uid || (s.email && x.email === s.email) || x.email === s.userId;
    });
    return (u && u.clientId) || "";
  };
  // Is the signed-in user a Client (restricted portal user)?
  window.isClientUser = function () {
    var s = window.__session || {};
    if (s.isOwner) return false;
    if (s.roleId === "r_client" || s.role === "Client") return true;
    return !!window.sessionClientId();
  };

  // Record one activity-log entry.
  // action: CREATE | UPDATE | DELETE | EMAIL | DOWNLOAD | POST | IMPORT | LOGIN | LOGOUT
  window.logAudit = function (action, entity, table, rec, detail) {
    try {
      var u = window.currentUser();
      var now = new Date();
      var ts = (window.BCCWE.today || now.toISOString().slice(0, 10)) + " " + now.toTimeString().slice(0, 5);
      window.BCCWE.auditLog = window.BCCWE.auditLog || [];
      window.BCCWE.auditLog.unshift({
        ts: ts, user: u.name, role: u.role, action: action || "UPDATE",
        entity: entity || "", table: table || "", rec: rec || "", detail: detail || "",
        ip: window.__clientIp || "",
      });
      if (window.persist) window.persist("auditLog");
      try { window.dispatchEvent(new CustomEvent("bccwe-audit")); } catch (e) {}
    } catch (e) {}
  };
  window.logDownload = function (entry) {
    const id = "d" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const now = window.BCCWE.today + " " + new Date().toTimeString().slice(0, 5);
    const who = (window.currentUser && window.currentUser().name) || (window.__session && window.__session.name) || "";
    window.BCCWE.downloadLog.unshift(Object.assign({ id, ts: now, kind: "PDF", docNo: "", clientId: "", user: who }, entry, { id }));
    window.saveBCCWEMail(); emitMail();
    return id;
  };
  // print the on-screen invoice paper to PDF (browser "Save as PDF"); isolates .inv-paper
  window.printArea = function () {
    document.body.classList.add("printing");
    const done = function () { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(function () { try { window.print(); } catch (e) { done(); } }, 40);
    // safety: clear the class even if afterprint never fires (some browsers)
    setTimeout(done, 60000);
  };

  // ---- Real PDF generation (direct download, no print dialog) ----
  // Renders a DOM element (the invoice paper) to a true PDF file via html2canvas + jsPDF.
  // Internal-only rows (price suggestions) are stripped from the capture so they never
  // reach the customer's PDF or email attachment.
  window.elementToPdf = function (el) {
    return new Promise(function (resolve, reject) {
      if (!el || !window.html2canvas || !window.jspdf) { reject(new Error("pdf-libs-unavailable")); return; }
      window.html2canvas(el, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
        ignoreElements: function (n) {
          return n.classList && (n.classList.contains("ip-hist-row") || n.classList.contains("ret-hist") || n.classList.contains("price-sugg-toggle"));
        },
      }).then(function (canvas) {
        try {
          var jsPDF = window.jspdf.jsPDF;
          var pdf = new jsPDF("p", "pt", "letter");
          var pageW = pdf.internal.pageSize.getWidth();
          var pageH = pdf.internal.pageSize.getHeight();
          var margin = 36;
          var imgW = pageW - margin * 2;
          var ratio = imgW / canvas.width;
          var pageContentH = pageH - margin * 2;
          var pagePixH = pageContentH / ratio;
          var totalH = canvas.height;
          var rendered = 0, first = true;
          while (rendered < totalH - 1) {
            var sliceH = Math.min(pagePixH, totalH - rendered);
            var slice = document.createElement("canvas");
            slice.width = canvas.width; slice.height = Math.round(sliceH);
            var ctx = slice.getContext("2d");
            ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            if (!first) pdf.addPage();
            pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, sliceH * ratio);
            rendered += sliceH; first = false;
          }
          resolve(pdf);
        } catch (e) { reject(e); }
      }).catch(reject);
    });
  };
  // Build a real PDF from the invoice paper and download it directly. Falls back to print if libs fail.
  window.downloadInvoicePdf = function (el, filename, cb) {
    window.elementToPdf(el).then(function (pdf) {
      pdf.save(filename);
      if (cb) cb("done");
    }).catch(function () {
      // graceful fallback — still gives the user a PDF via the browser print path
      window.printArea();
      if (cb) cb("fallback");
    });
  };
  // Build the invoice PDF and return an object URL (used to attach to outgoing email).
  window.invoicePdfBlobUrl = function (el) {
    return window.elementToPdf(el).then(function (pdf) {
      return URL.createObjectURL(pdf.output("blob"));
    });
  };
  // Build the invoice PDF and return its base64 content (for real email attachments).
  window.invoicePdfBase64 = function (el) {
    return window.elementToPdf(el).then(function (pdf) {
      var uri = pdf.output("datauristring"); // data:application/pdf;...;base64,XXXX
      var i = uri.indexOf("base64,");
      return i >= 0 ? uri.slice(i + 7) : "";
    });
  };

  // Build an invoice PDF directly from the invoice DATA (no on-screen element
  // needed). Used to attach a PDF for each invoice in a statement email.
  function moneyStr(n) {
    return "$" + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  window.invoicePdfBase64FromData = function (inv) {
    if (!window.jspdf || !window.jspdf.jsPDF || !inv) return "";
    var D = window.BCCWE;
    var C = (window.STORES ? window.STORES.profile(inv.companyId) : null) || D.company || {};
    var client = (D.clients || []).find(function (c) { return c.id === inv.clientId; }) || {};
    var lines = (typeof deriveLines === "function") ? deriveLines(inv) : (inv.lines || []);
    var show = C.show || {};
    var on = function (k) { return show[k] !== false; }; // default to showing
    var doc = new window.jspdf.jsPDF("p", "pt", "letter");
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var x = 40, y = 50;
    // Optional logo (left of the name)
    if (C.logo && on("logo")) {
      try { doc.addImage(C.logo, "JPEG", x, y - 14, 46, 46); x += 56; } catch (e) {}
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20);
    doc.text(String(C.name || "BCCWE"), x, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
    y += 16;
    var headerLines = [];
    if (C.tagline && on("tagline")) headerLines.push(C.tagline);
    if (on("address")) { if (C.addr1) headerLines.push(C.addr1); if (C.addr2) headerLines.push(C.addr2); }
    var contact = [on("phone") ? C.phone : "", on("email") ? C.email : "", on("web") ? C.web : ""].filter(Boolean).join("  ·  ");
    if (contact) headerLines.push(contact);
    var taxLine = [on("gst") ? C.gst : "", on("pst") ? C.pst : ""].filter(Boolean).join("   ");
    if (taxLine) headerLines.push(taxLine);
    headerLines.forEach(function (t) { doc.text(String(t), x, y); y += 12; });
    // INVOICE meta (right column)
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("INVOICE", W - 40, 52, { align: "right" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    var ry = 74;
    var metaRows = [["Invoice #", inv.no]];
    if (inv.poNo) metaRows.push(["P.O./S.O. #", inv.poNo]);
    metaRows.push(["Date", inv.date], ["Due", inv.due], ["Status", inv.status]);
    metaRows.forEach(function (r) {
      doc.setTextColor(130); doc.text(String(r[0]), W - 170, ry);
      doc.setTextColor(20); doc.text(String(r[1] == null ? "" : r[1]), W - 40, ry, { align: "right" });
      ry += 14;
    });
    // Bill to
    y = Math.max(y, ry) + 16;
    doc.setTextColor(130); doc.setFontSize(8); doc.text("BILL TO", x, y); y += 14;
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(String(client.name || "—"), x, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
    [client.contact !== "—" ? client.contact : "", client.defaultEmail].forEach(function (t) {
      if (t) { doc.text(String(t), x, y); y += 12; }
    });
    // Line items table
    var cQty = W - 250, cUnit = W - 185, cDisc = W - 120, cAmt = W - 40;
    y += 10; doc.setDrawColor(220); doc.line(x, y, W - 40, y); y += 14;
    doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.setFontSize(9);
    doc.text("Description", x, y);
    doc.text("Qty", cQty, y, { align: "right" });
    doc.text("Unit", cUnit, y, { align: "right" });
    doc.text("Disc", cDisc, y, { align: "right" });
    doc.text("Amount", cAmt, y, { align: "right" });
    y += 7; doc.line(x, y, W - 40, y); y += 14;
    doc.setFont("helvetica", "normal");
    lines.forEach(function (l) {
      var amt = (l.qty || 0) * (l.price || 0) * (1 - ((l.disc || 0) / 100));
      doc.setTextColor(20); doc.text(String(l.desc || "—").slice(0, 48), x, y);
      doc.text(String(l.qty == null ? "" : l.qty), cQty, y, { align: "right" });
      doc.text(moneyStr(l.price), cUnit, y, { align: "right" });
      doc.text(l.disc ? l.disc + "%" : "—", cDisc, y, { align: "right" });
      doc.text(moneyStr(amt), cAmt, y, { align: "right" });
      y += 14;
      if (y > H - 120) { doc.addPage(); y = 50; }
    });
    // Totals
    y += 6; doc.line(cUnit - 50, y, W - 40, y); y += 16;
    function totRow(lbl, val, bold) {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(bold ? 20 : 110); doc.text(lbl, cDisc, y, { align: "right" });
      doc.setTextColor(20); doc.text(moneyStr(val), cAmt, y, { align: "right" });
      y += 15;
    }
    totRow("Subtotal", inv.subtotal);
    if (inv.gst) totRow("GST", inv.gst);
    if (inv.pst) totRow("PST", inv.pst);
    totRow("Total", inv.total, true);
    if (inv.paid) totRow("Paid", inv.paid);
    totRow("Balance due", Math.max(0, (inv.total || 0) - (inv.paid || 0)), true);

    var uri = doc.output("datauristring");
    var i = uri.indexOf("base64,");
    return i >= 0 ? uri.slice(i + 7) : "";
  };
  // simulate PHPMailer send: log Pending, then resolve after a beat. cb(status) fires on resolve.
  // Build a simple, professional HTML body for an outgoing email.
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function buildEmailHtml(entry) {
    var company = (window.BCCWE.company && window.BCCWE.company.name) || "BCCWE";
    var body;
    if (entry.message && String(entry.message).trim()) {
      // Use exactly what the user typed (preserve line breaks).
      body = "<p>" + esc(entry.message).replace(/\n/g, "<br/>") + "</p>";
    } else {
      var lead = {
        invoice: "Please find your invoice" + (entry.docNo ? " " + entry.docNo : "") + (entry.attachmentData && entry.attachmentData.length ? " attached" : " below") + ".",
        statement: "Please find your account statement attached.",
        receipt: "Thank you — please find your payment receipt attached.",
        order: "Here is your order confirmation" + (entry.docNo ? " " + entry.docNo : "") + ".",
        history: "Please find the requested invoice history attached.",
        test: "This is a test email confirming your SMTP settings are working.",
      }[entry.kind] || "Please see the details below.";
      body = "<p>Hello,</p><p>" + lead + "</p>";
    }
    return (
      '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1c2530;font-size:14px;line-height:1.6">' +
      body +
      "<p style=\"margin-top:18px\">Kind regards,<br/>" + esc(company) + "</p>" +
      '<hr style="border:none;border-top:1px solid #e6eaf0;margin:18px 0"/>' +
      '<p style="font-size:12px;color:#8593a3">Sent from the ' + esc(company) + " invoicing system.</p></div>"
    );
  }

  // Send an email FOR REAL through the chosen sender profile's SMTP account.
  window.sendEmail = function (entry, cb) {
    // System default backup email is ALWAYS copied on every outgoing email.
    const backup = (window.BCCWE.prefs && window.BCCWE.prefs.backupEmail) || "";
    if (backup) {
      const cc = Array.isArray(entry.cc) ? entry.cc.slice() : [];
      const seen = new Set([...(entry.to || []), ...cc].map((a) => String(a).toLowerCase()));
      if (!seen.has(backup.toLowerCase())) cc.push(backup);
      entry.cc = cc;
    }
    const id = window.logEmail(entry);
    const profiles = window.BCCWE.smtpProfiles || [];
    const prof = profiles.find((x) => x.id === entry.profileId) || profiles[0] || {};

    fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          host: prof.host, port: prof.port, enc: prof.enc,
          user: prof.user, password: prof.password,
          from: prof.from, fromName: prof.fromName, replyTo: prof.replyTo,
        },
        to: entry.to || [],
        cc: entry.cc || [],
        subject: entry.subject || "",
        html: buildEmailHtml(entry),
        attachments: entry.attachmentData || [], // [{filename, content(base64)}]
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var entLabel = { invoice: "Invoice", statement: "Statement", history: "Invoice history", order: "Order", receipt: "Receipt", test: "Test email" }[entry.kind] || "Email";
        var toStr = (entry.to || []).join(", ");
        if (r.ok) {
          window.resolveEmail(id, "Delivered", "250 2.0.0 Accepted", r.note || "Accepted by SMTP host");
          window.logAudit("EMAIL", entLabel, "email", entry.docNo || "", "Emailed " + entLabel.toLowerCase() + " to " + toStr + " · Delivered");
          if (cb) cb("Delivered", id);
        } else {
          window.resolveEmail(id, "Failed", "SMTP error", r.error || "Send failed");
          window.logAudit("EMAIL", entLabel, "email", entry.docNo || "", "Email to " + toStr + " · Failed — " + (r.error || "send error"));
          if (cb) cb("Failed", id);
        }
      })
      .catch(function (e) {
        window.resolveEmail(id, "Failed", "Network error", "Could not reach the server: " + (e && e.message));
        window.logAudit("EMAIL", "Email", "email", entry.docNo || "", "Email to " + (entry.to || []).join(", ") + " · Failed — server unreachable");
        if (cb) cb("Failed", id);
      });
    return id;
  };

  const auditLog = [
    { ts: daysAgo(0) + " 14:22", user: "Priya Sandhu", role: "Team Member", action: "CREATE", entity: "Invoice", table: "invoices", rec: "INV-1047", detail: "Created invoice — total $1,388.80 to Riverside Mobile Ltd.", ip: "184.69.142.20" },
    { ts: daysAgo(0) + " 13:48", user: "Harman Gill", role: "Admin", action: "EMAIL", entity: "Invoice", table: "email", rec: "INV-1047", detail: "Emailed invoice to ap@riversidemobile.ca · Delivered", ip: "184.69.142.11" },
    { ts: daysAgo(0) + " 11:05", user: "Kevin Tran", role: "Team Member", action: "CREATE", entity: "Cash sale", table: "sales", rec: "REG-00021", detail: "Cash sale $245.00 · walk-in retail", ip: "70.66.180.4" },
    { ts: daysAgo(0) + " 10:32", user: "Harman Gill", role: "Admin", action: "DOWNLOAD", entity: "Report", table: "reports", rec: "BCCWE-Transactions-Jun-2026.xlsx", detail: "Exported transaction history to Excel · 21 rows", ip: "184.69.142.11" },
    { ts: daysAgo(0) + " 09:14", user: "Harman Gill", role: "Admin", action: "LOGIN", entity: "Session", table: "auth", rec: "harman.gill", detail: "Signed in successfully", ip: "184.69.142.11" },
    { ts: daysAgo(1) + " 16:48", user: "Dana Mehta", role: "Accountant", action: "POST", entity: "Journal entry", table: "journal_entries", rec: "JE-2051", detail: "Posted balanced entry 1,388.80 / 1,388.80", ip: "207.81.55.130" },
    { ts: daysAgo(1) + " 15:20", user: "Priya Sandhu", role: "Team Member", action: "CREATE", entity: "Client", table: "clients", rec: "Newton Repair Hub", detail: "Added new client · Wholesale · Net 30", ip: "184.69.142.20" },
    { ts: daysAgo(1) + " 12:03", user: "Kevin Tran", role: "Team Member", action: "IMPORT", entity: "Product", table: "inventory_items", rec: "supplier-feed.csv", detail: "Imported 34 products from CSV (Surrey Screen Supply)", ip: "70.66.180.4" },
    { ts: daysAgo(1) + " 09:30", user: "Harman Gill", role: "Admin", action: "UPDATE", entity: "Product", table: "inventory_items", rec: "SCRN-IP13", detail: "Stock 12 → 32 (+20 from PO-341)", ip: "184.69.142.11" },
    { ts: daysAgo(2) + " 17:10", user: "Harman Gill", role: "Admin", action: "CREATE", entity: "Supplier", table: "suppliers", rec: "Surrey Screen Supply", detail: "Added new supplier · Net 30", ip: "184.69.142.11" },
    { ts: daysAgo(2) + " 13:12", user: "Kevin Tran", role: "Team Member", action: "CREATE", entity: "Return", table: "sales", rec: "REG-00019", detail: "Processed return −$39.00", ip: "70.66.180.4" },
    { ts: daysAgo(2) + " 10:41", user: "Priya Sandhu", role: "Team Member", action: "UPDATE", entity: "Client", table: "clients", rec: "Coast Cellular Wholesale", detail: "Changed terms Net 30 → Net 15", ip: "184.69.142.20" },
    { ts: daysAgo(3) + " 16:02", user: "Harman Gill", role: "Admin", action: "DELETE", entity: "Product", table: "inventory_items", rec: "ACC-OLDCASE-7", detail: "Deleted discontinued product · 0 in stock", ip: "184.69.142.11" },
    { ts: daysAgo(3) + " 11:25", user: "Dana Mehta", role: "Accountant", action: "DOWNLOAD", entity: "Report", table: "reports", rec: "GST-PST-Q2-2026.pdf", detail: "Downloaded tax remittance report", ip: "207.81.55.130" },
    { ts: daysAgo(3) + " 09:08", user: "Kevin Tran", role: "Team Member", action: "LOGIN", entity: "Session", table: "auth", rec: "kevin.tran", detail: "Signed in successfully", ip: "70.66.180.4" },
    { ts: daysAgo(4) + " 14:55", user: "Harman Gill", role: "Admin", action: "UPDATE", entity: "Settings", table: "settings", rec: "Default recipients", detail: "Updated default CC → records@bccwe.ca", ip: "184.69.142.11" },
    { ts: daysAgo(4) + " 10:17", user: "Priya Sandhu", role: "Team Member", action: "EMAIL", entity: "Statement", table: "email", rec: "Riverside Mobile Ltd.", detail: "Emailed account statement · Delivered", ip: "184.69.142.20" },
    { ts: daysAgo(5) + " 15:33", user: "Kevin Tran", role: "Team Member", action: "CREATE", entity: "Order", table: "orders", rec: "ORD-1006", detail: "Created client order · Fraser Valley School Dist.", ip: "70.66.180.4" },
    { ts: daysAgo(5) + " 11:02", user: "Dana Mehta", role: "Accountant", action: "EMAIL", entity: "Invoice", table: "email", rec: "INV-1042", detail: "Resent invoice to bilal@newtonrepair.ca · Bounced", ip: "207.81.55.130" },
    { ts: daysAgo(6) + " 16:40", user: "Harman Gill", role: "Admin", action: "UPDATE", entity: "User", table: "users", rec: "kevin.tran", detail: "Role Team Member · enabled POS access", ip: "184.69.142.11" },
    { ts: daysAgo(6) + " 09:51", user: "Priya Sandhu", role: "Team Member", action: "CREATE", entity: "Invoice", table: "invoices", rec: "INV-1045", detail: "Created invoice — total $2,940.00 to Fraser Valley School Dist.", ip: "184.69.142.20" },
    { ts: daysAgo(8) + " 13:19", user: "Harman Gill", role: "Admin", action: "IMPORT", entity: "Client", table: "clients", rec: "clients-2026.csv", detail: "Imported 12 clients from CSV", ip: "184.69.142.11" },
    { ts: daysAgo(8) + " 10:05", user: "Kevin Tran", role: "Team Member", action: "DOWNLOAD", entity: "Invoice", table: "reports", rec: "INV-1044.pdf", detail: "Downloaded invoice PDF", ip: "70.66.180.4" },
    { ts: daysAgo(10) + " 14:28", user: "Dana Mehta", role: "Accountant", action: "POST", entity: "Journal entry", table: "journal_entries", rec: "JE-2044", detail: "Posted balanced entry 226.81 / 226.81", ip: "207.81.55.130" },
    { ts: daysAgo(10) + " 08:47", user: "Harman Gill", role: "Admin", action: "UPDATE", entity: "Tax", table: "settings", rec: "PST rate", detail: "No change saved · viewed BC GST 5% + PST 7%", ip: "184.69.142.11" },
    { ts: daysAgo(12) + " 15:12", user: "Priya Sandhu", role: "Team Member", action: "DELETE", entity: "Client", table: "clients", rec: "Test Account", detail: "Deleted duplicate client record", ip: "184.69.142.20" },
    { ts: daysAgo(14) + " 11:36", user: "Harman Gill", role: "Admin", action: "CREATE", entity: "Product", table: "inventory_items", rec: "SAM-S22-128", detail: "Added new product · cost $330 / price $499", ip: "184.69.142.11" },
    { ts: daysAgo(18) + " 09:22", user: "Kevin Tran", role: "Team Member", action: "LOGIN", entity: "Session", table: "auth", rec: "kevin.tran", detail: "Failed sign-in · wrong password", ip: "70.66.180.4" },
  ];

  // ---- line-level sales ledger (drives period profit for items & clients) ----
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(20260614);
  const sellable = inventory.filter((i) => true);
  const realClients = clients.filter((c) => c.id !== "c3");
  const start = new Date("2025-05-01");
  const span = Math.floor((new Date("2026-06-14") - start) / 86400000);
  const itemSales = [];
  // popularity weights + "stale" items whose sales only land in the older period
  // (so recent-90-day movement is deterministic for the aging/dead-stock views)
  const POP = { "IPH-13-128-A": 4, "SCRN-IP13": 6, "BAT-IP12": 6, "CHG-USBC-65": 6, "CASE-IP13": 5, "SAM-S22-128": 3, "SCRN-S22": 3, "IPH-12-64-B": 2, "GLASS-UNIV": 1, "BAT-MBP": 1, "MBP-2019-13": 1, "DELL-XPS13": 1 };
  const STALE = new Set(["DELL-XPS13", "GLASS-UNIV", "MBP-2019-13", "BAT-MBP"]);
  const weighted = [];
  sellable.forEach((it) => { const w = POP[it.code] || 2; for (let i = 0; i < w; i++) weighted.push(it); });
  for (let k = 0; k < 260; k++) {
    const item = weighted[Math.floor(rand() * weighted.length)];
    // walk-in retail gets ~25% of sales, rest to named clients
    const client = rand() < 0.25 ? clients[2] : realClients[Math.floor(rand() * realClients.length)];
    const offset = STALE.has(item.code) ? Math.floor(rand() * span * 0.42) : Math.floor(rand() * span);
    const d = new Date(start); d.setDate(d.getDate() + offset);
    let qty;
    if (item.cat === "Laptop") qty = 1;
    else if (item.cat === "Phone") qty = 1 + Math.floor(rand() * 1.6);
    else if (item.cat === "Part") qty = 1 + Math.floor(rand() * 4);
    else qty = 1 + Math.floor(rand() * 6);
    const disc = rand() < 0.22 ? [5, 10, 15][Math.floor(rand() * 3)] : 0;
    itemSales.push({ date: d.toISOString().slice(0, 10), code: item.code, clientId: client.id, qty, price: item.price, disc });
  }

  // ---- stock aging & movement analytics ----
  const STOCK_DAY = 86400000;
  const AGE_NOTMOVING = 120;  // 4 months — start reflecting as "not moving"
  const AGE_DEAD = 240;       // a further 4 months unsold — candidate for dead stock
  // Use the LIVE date and the LIVE itemSales collection at call time. The seed
  // `today` above is a fixed anchor for demo data only — using it here froze
  // every item's age, and the closure `itemSales` is the demo array that gets
  // REPLACED by the DB load, so real sales never showed as movement.
  function stockNow() {
    const t = window.BCCWE && window.BCCWE.today;
    return t ? new Date(t + "T00:00:00") : new Date();
  }
  function stockAgeDays(item) {
    if (!item || !item.purchased) return 0;
    return Math.max(0, Math.round((stockNow() - new Date(item.purchased + "T00:00:00")) / STOCK_DAY));
  }
  function stockRecentUnits(code, days) {
    const cut = stockNow(); cut.setDate(cut.getDate() - days);
    const c = cut.getFullYear() + "-" + String(cut.getMonth() + 1).padStart(2, "0") + "-" + String(cut.getDate()).padStart(2, "0");
    return ((window.BCCWE && window.BCCWE.itemSales) || itemSales)
      .filter((s) => s.code === code && s.date >= c && s.qty > 0).reduce((a, s) => a + s.qty, 0);
  }
  function stockMovement(item) {
    const u90 = stockRecentUnits(item.code, 90);
    const perMonth = Math.round((u90 / 3) * 10) / 10;
    let label = "No sales";
    if (u90 > 0) label = perMonth >= 4 ? "Fast" : perMonth >= 1.5 ? "Steady" : "Slow";
    return { u90, perMonth, label };
  }
  function stockSuggested(item) {
    const age = stockAgeDays(item);
    const u90 = stockRecentUnits(item.code, 90);
    if (age >= AGE_DEAD && u90 === 0) return "dead";
    if (age >= AGE_NOTMOVING && u90 <= 1) return "notmoving";
    return "active";
  }
  function stockState(item) {
    const ov = item.stockState;
    if (ov === "active" || ov === "notmoving" || ov === "dead") return ov;
    return stockSuggested(item);
  }
  window.STOCK = {
    AGE_NOTMOVING, AGE_DEAD,
    ageDays: stockAgeDays, recentUnits: stockRecentUnits,
    movement: stockMovement, suggested: stockSuggested, state: stockState,
  };

  const prefs = Object.assign(
    { accountantName: "Dana Mehta", accountantEmail: "dana.mehta@bccwe-cpa.ca", backupEmail: "records@bccwe.ca", defaultInvoiceEmail: "accounts@bccwe.ca" },
    (function () { try { return JSON.parse(localStorage.getItem("bccwe_prefs") || "{}"); } catch (e) { return {}; } })()
  );
  // migrate legacy "ccEmail" pref into the new system backup email
  if (!prefs.backupEmail && prefs.ccEmail) prefs.backupEmail = prefs.ccEmail;
  prefs.ccEmail = prefs.backupEmail; // keep legacy field in sync
  window.saveBCCWEPrefs = function () {
    try { localStorage.setItem("bccwe_prefs", JSON.stringify(window.BCCWE.prefs)); } catch (e) {}
  };

  // ---- access control: app functions (modules), roles, users ----
  // Each module has a flat list of named permissions (Ultimate-POS style).
  // A permission is a checkbox; permissions sharing a `radio` group are
  // mutually exclusive (e.g. "View all" vs "View own only").
  const modules = [
    { id: "dashboard", label: "Dashboard", info: "Home overview, KPIs and charts", perms: [
      { id: "view_company", label: "View company-wide dashboard", radio: "scope" },
      { id: "view_own", label: "View own performance only", radio: "scope" },
      { id: "revenue", label: "View revenue & sales totals" },
      { id: "profit", label: "View profit figures" },
      { id: "stock", label: "View inventory / low-stock widget" },
      { id: "charts", label: "View charts & graphs" },
      { id: "receivables", label: "View outstanding receivables" },
    ] },
    { id: "invoice", label: "Invoice Generator", info: "Create invoices with tax & journal posting", perms: [
      { id: "add", label: "Add invoice" },
      { id: "update", label: "Update invoice" },
      { id: "delete", label: "Delete invoice" },
      { id: "edit_price", label: "Edit product price on invoice" },
      { id: "edit_disc", label: "Edit product discount on invoice" },
      { id: "manage_disc", label: "Add/Edit/Delete invoice discount" },
      { id: "edit_invno", label: "Add/edit invoice number" },
      { id: "view_cost", label: "View purchase / cost price" },
      { id: "assign_sales", label: "Assign salesperson" },
      { id: "tax_override", label: "Override tax on invoice" },
    ] },
    { id: "history", label: "Invoice History", info: "Posted invoices, returns & exchanges", perms: [
      { id: "view_all", label: "View all invoices", radio: "scope" },
      { id: "view_own", label: "View own invoices only", radio: "scope" },
      { id: "view_paid", label: "View paid invoices only" },
      { id: "view_due", label: "View due / unpaid invoices only" },
      { id: "view_partial", label: "View partially paid invoices only" },
      { id: "view_overdue", label: "View overdue invoices only" },
      { id: "update", label: "Update invoice" },
      { id: "delete", label: "Delete invoice" },
      { id: "add_pay", label: "Add invoice payment" },
      { id: "edit_pay", label: "Edit invoice payment" },
      { id: "del_pay", label: "Delete invoice payment" },
      { id: "profit", label: "View profit per invoice" },
      { id: "export", label: "Export / download" },
      { id: "email", label: "Email invoice" },
      { id: "void", label: "Void / issue credit note" },
    ] },
    { id: "orders", label: "Client Orders", info: "Purchase orders & receiving", perms: [
      { id: "view_all", label: "View all orders", radio: "scope" },
      { id: "view_own", label: "View own orders only", radio: "scope" },
      { id: "add", label: "Add order" },
      { id: "update", label: "Update order" },
      { id: "delete", label: "Delete order" },
      { id: "receive", label: "Receive items / update status" },
      { id: "convert", label: "Convert order to invoice" },
      { id: "edit_price", label: "Edit order pricing" },
      { id: "comments", label: "Add / view comments" },
    ] },
    { id: "people", label: "Clients & Suppliers", info: "Customer and supplier records", perms: [
      { id: "view_all", label: "View all clients", radio: "scope" },
      { id: "view_own", label: "View own (assigned) clients only", radio: "scope" },
      { id: "add_client", label: "Add client" },
      { id: "update_client", label: "Update client" },
      { id: "delete_client", label: "Delete client" },
      { id: "add_supplier", label: "Add supplier" },
      { id: "update_supplier", label: "Update supplier" },
      { id: "delete_supplier", label: "Delete supplier" },
      { id: "view_cost", label: "View supplier purchase prices" },
      { id: "view_balance", label: "View client balances" },
    ] },
    { id: "inventory", label: "Inventory", info: "Products, stock and losses", perms: [
      { id: "view", label: "View products" },
      { id: "add", label: "Add product" },
      { id: "update", label: "Update product" },
      { id: "delete", label: "Delete product" },
      { id: "view_stock", label: "View stock quantities" },
      { id: "view_cost", label: "View purchase / cost price" },
      { id: "adjust", label: "Stock adjustments" },
      { id: "orders", label: "Manage purchase orders" },
      { id: "losses", label: "Manage stock losses (defective / lost)" },
    ] },
    { id: "sales", label: "Sales", info: "Point-of-sale register, returns & exchanges", perms: [
      { id: "view_all", label: "View all sells", radio: "scope" },
      { id: "view_own", label: "View own sells only", radio: "scope" },
      { id: "view_paid", label: "View paid sells only" },
      { id: "view_due", label: "View due sells only" },
      { id: "view_partial", label: "View partially paid sells only" },
      { id: "view_overdue", label: "View overdue sells only" },
      { id: "add", label: "Add sell" },
      { id: "update", label: "Update sell" },
      { id: "delete", label: "Delete sell" },
      { id: "add_pay", label: "Add sell payment" },
      { id: "edit_pay", label: "Edit sell payment" },
      { id: "del_pay", label: "Delete sell payment" },
      { id: "edit_price", label: "Edit product price from sales screen" },
      { id: "edit_disc", label: "Edit product discount from sale screen" },
      { id: "manage_disc", label: "Add/Edit/Delete discount" },
      { id: "ret_all", label: "Access all sell returns", radio: "ret" },
      { id: "ret_own", label: "Access own sell returns only", radio: "ret" },
      { id: "edit_invno", label: "Add/edit invoice number" },
      { id: "profit", label: "View profit margins" },
      { id: "view_cost", label: "View purchase price" },
    ] },
    { id: "expenses", label: "Expenses", info: "Spending & write-offs", perms: [
      { id: "view_all", label: "View all expenses", radio: "scope" },
      { id: "view_own", label: "View own expenses only", radio: "scope" },
      { id: "add", label: "Add expense" },
      { id: "update", label: "Update expense" },
      { id: "delete", label: "Delete expense" },
      { id: "approve", label: "Approve expenses" },
      { id: "categories", label: "Manage expense categories" },
    ] },
    { id: "accounting", label: "Accounting", info: "Ledger, journals & statements", perms: [
      { id: "view", label: "View ledger & journals" },
      { id: "add", label: "Add journal entry" },
      { id: "edit", label: "Edit journal entry" },
      { id: "delete", label: "Delete journal entry" },
      { id: "reconcile", label: "Reconcile / post" },
      { id: "pl", label: "View profit & loss" },
      { id: "bs", label: "View balance sheet" },
      { id: "coa", label: "Manage chart of accounts" },
    ] },
    { id: "unpaid", label: "Unpaid Invoices", info: "Receivables & collections", perms: [
      { id: "view_all", label: "View all unpaid invoices", radio: "scope" },
      { id: "view_own", label: "View own unpaid invoices only", radio: "scope" },
      { id: "record_pay", label: "Record payments" },
      { id: "remind", label: "Send reminders" },
      { id: "writeoff", label: "Write off bad debt" },
    ] },
    { id: "reports", label: "Reports", info: "Business reporting & exports", perms: [
      { id: "sales", label: "View sales reports" },
      { id: "profit", label: "View profit & margin reports" },
      { id: "tax", label: "View tax reports" },
      { id: "inventory", label: "View inventory reports" },
      { id: "export", label: "Export reports" },
    ] },
    { id: "settings", label: "Settings", info: "Company, users, security", perms: [
      { id: "view", label: "View settings" },
      { id: "company", label: "Manage company & tax settings" },
      { id: "email", label: "Manage email (SMTP / POP)" },
      { id: "users", label: "Manage users" },
      { id: "roles", label: "Manage roles & permissions" },
      { id: "audit", label: "View audit log" },
      { id: "security", label: "Manage security settings" },
    ] },
  ];

  function blankPerms() {
    const o = {};
    modules.forEach((m) => { o[m.id] = {}; m.perms.forEach((p) => { o[m.id][p.id] = false; }); });
    return o;
  }
  function allPerms() {
    const o = {};
    modules.forEach((m) => {
      o[m.id] = {}; const seen = {};
      m.perms.forEach((p) => {
        if (p.radio) { o[m.id][p.id] = !seen[p.radio]; seen[p.radio] = true; }
        else o[m.id][p.id] = true;
      });
    });
    return o;
  }
  // build perms from a spec: { moduleId: { permId: true } } — anything omitted stays false
  function permsFrom(spec) {
    const o = blankPerms();
    Object.keys(spec || {}).forEach((mid) => {
      if (!o[mid]) return;
      Object.keys(spec[mid]).forEach((pid) => { if (pid in o[mid]) o[mid][pid] = spec[mid][pid]; });
    });
    return o;
  }

  // Manager — runs day-to-day operations across all modules (no roles/security).
  const MANAGER_SPEC = {
    dashboard:  { view_company: true, revenue: true, profit: true, stock: true, charts: true, receivables: true },
    invoice:    { add: true, update: true, delete: true, edit_price: true, edit_disc: true, manage_disc: true, edit_invno: true, view_cost: true, assign_sales: true, tax_override: true },
    history:    { view_all: true, view_paid: true, view_due: true, view_partial: true, view_overdue: true, update: true, delete: true, add_pay: true, edit_pay: true, del_pay: true, profit: true, export: true, email: true, void: true },
    orders:     { view_all: true, add: true, update: true, delete: true, receive: true, convert: true, edit_price: true, comments: true },
    people:     { view_all: true, add_client: true, update_client: true, delete_client: true, add_supplier: true, update_supplier: true, delete_supplier: true, view_cost: true, view_balance: true },
    inventory:  { view: true, add: true, update: true, delete: true, view_stock: true, view_cost: true, adjust: true, orders: true, losses: true },
    sales:      { view_all: true, view_paid: true, view_due: true, view_partial: true, view_overdue: true, add: true, update: true, delete: true, add_pay: true, edit_pay: true, del_pay: true, edit_price: true, edit_disc: true, manage_disc: true, ret_all: true, edit_invno: true, profit: true, view_cost: true },
    expenses:   { view_all: true, add: true, update: true, delete: true, approve: true, categories: true },
    accounting: { view: true, add: true, edit: true, reconcile: true, pl: true, bs: true, coa: true },
    unpaid:     { view_all: true, record_pay: true, remind: true, writeoff: true },
    reports:    { sales: true, profit: true, tax: true, inventory: true, export: true },
    settings:   { view: true, company: true, email: true, users: true, audit: true },
  };
  // Supervisor — oversees the floor: can add/edit & approve, but not delete or change settings.
  const SUPERVISOR_SPEC = {
    dashboard:  { view_company: true, revenue: true, stock: true, charts: true, receivables: true },
    invoice:    { add: true, update: true, edit_price: true, edit_disc: true, assign_sales: true },
    history:    { view_all: true, view_paid: true, view_due: true, view_partial: true, view_overdue: true, update: true, add_pay: true, export: true, email: true },
    orders:     { view_all: true, add: true, update: true, receive: true, convert: true, comments: true },
    people:     { view_all: true, add_client: true, update_client: true, add_supplier: true, update_supplier: true, view_balance: true },
    inventory:  { view: true, add: true, update: true, view_stock: true, view_cost: true, adjust: true, orders: true, losses: true },
    sales:      { view_all: true, view_paid: true, view_due: true, add: true, update: true, add_pay: true, ret_all: true, profit: true, view_cost: true },
    expenses:   { view_all: true, add: true, update: true, approve: true },
    accounting: { view: true, pl: true, bs: true },
    unpaid:     { view_all: true, record_pay: true, remind: true },
    reports:    { sales: true, profit: true, tax: true, inventory: true, export: true },
    settings:   { view: true, audit: true },
  };
  // Sales Person — sells and serves their own customers; no cost/profit or settings.
  const SALES_SPEC = {
    dashboard:  { view_own: true, revenue: true, charts: true },
    invoice:    { add: true, update: true, edit_disc: true, assign_sales: true },
    history:    { view_own: true, view_paid: true, view_due: true, add_pay: true, email: true, export: true },
    orders:     { view_own: true, add: true, update: true, receive: true, comments: true },
    people:     { view_all: true, add_client: true, update_client: true },
    inventory:  { view: true, view_stock: true },
    sales:      { view_own: true, add: true, update: true, add_pay: true, ret_own: true },
    expenses:   { view_own: true, add: true },
    unpaid:     { view_own: true, record_pay: true, remind: true },
    reports:    { sales: true },
  };
  // Client — logs in to browse products and place / track their own orders only.
  const CLIENT_SPEC = {
    dashboard:  { view_own: true },
    history:    { view_own: true, view_paid: true, view_due: true },
    orders:     { view_own: true, add: true, comments: true },
    inventory:  { view: true, view_stock: true },
  };

  function defaultPerms(id) {
    if (id === "r_manager") return permsFrom(MANAGER_SPEC);
    if (id === "r_super") return permsFrom(SUPERVISOR_SPEC);
    if (id === "r_sales") return permsFrom(SALES_SPEC);
    if (id === "r_client") return permsFrom(CLIENT_SPEC);
    if (id === "r_admin" || id === "r_owner") return allPerms();
    return blankPerms();
  }

  let roles = [
    { id: "r_admin", name: "Admin", tone: "blue", system: true, perms: allPerms() },
    { id: "r_owner", name: "Owner", tone: "violet", system: true, perms: allPerms() },
    { id: "r_manager", name: "Manager", tone: "green", system: false, perms: permsFrom(MANAGER_SPEC) },
    { id: "r_super", name: "Supervisor", tone: "amber", system: false, perms: permsFrom(SUPERVISOR_SPEC) },
    { id: "r_sales", name: "Sales Person", tone: "slate", system: false, perms: permsFrom(SALES_SPEC) },
    { id: "r_client", name: "Client", tone: "blue", system: false, perms: permsFrom(CLIENT_SPEC) },
  ];
  let users = [];

  // ---- Stores / Companies ----
  // Each store keeps its own invoice number sequence, default tax and the
  // profile (name, address, tax #s, logo) that prints on its invoices.
  // Seeded with two: "Cash" (no tax) and "Invoice" (GST 5%). Both renameable.
  const companies = [
    { id: "co_cash", name: "Cash", taxDefault: "none", invPrefix: "CASH", nextInvoiceNo: 1000,
      tagline: company.tagline, addr1: company.addr1, addr2: company.addr2,
      phone: company.phone, email: company.email, web: company.web, gst: "", pst: "", logo: company.logo,
      show: Object.assign({}, company.show), active: true },
    { id: "co_inv", name: "Invoice", taxDefault: "gst", invPrefix: "INV", nextInvoiceNo: 1048,
      tagline: company.tagline, addr1: company.addr1, addr2: company.addr2,
      phone: company.phone, email: company.email, web: company.web, gst: company.gst, pst: company.pst, logo: company.logo,
      show: Object.assign({}, company.show), active: true },
  ];

  // (Legacy browser-localStorage hydration removed — the server/database is now
  // the single source of truth for tax, roles, users and all other data.)

  window.saveBCCWETax = function () {
    try { localStorage.setItem("bccwe_tax", JSON.stringify({ modes: window.BCCWE.TAX.modes, order: window.BCCWE.TAX.order })); } catch (e) {}
  };
  window.saveBCCWERbac = function () {
    try { localStorage.setItem("bccwe_rbac", JSON.stringify({ v: 3, roles: window.BCCWE.roles, users: window.BCCWE.users, salespeople: window.BCCWE.salespeople })); } catch (e) {}
  };

  window.BCCWE = {
    company, companies, TAX, salespeople, clients, suppliers, inventory, services,
    accounts, invoices, payments, expenses, expenseCategories, cashSales, journal,
    purchaseOrders, smtpProfiles, mailLog, downloadLog, auditLog, itemSales, defectiveProducts,
    creditNotes, orders, orderDiscrepancies: [],
    modules, roles, users,
    blankPerms, allPerms,
    prefs,
    categories: ["Phone", "Laptop", "Tablet", "Part", "Accessory", "Service"],
    catTree: [
      { name: "Phone", subs: ["Apple", "Samsung", "Other"] },
      { name: "Laptop", subs: ["Apple", "Windows"] },
      { name: "Tablet", subs: [] },
      { name: "Part", subs: ["Screen", "Battery", "Charger"] },
      { name: "Accessory", subs: ["Case", "Cable", "Protector"] },
      { name: "Service", subs: [] },
    ],
    waConfig: { enabled: false, token: "", phoneId: "" },
    clientPrices: {},
    today: "2026-06-14",
    nextInvoiceNo: 1048,
    nextOrderNo: 1010,
  };
})();

/* ============================================================
   API persistence layer (added on top of the Claude Design data)
   - Loads saved data from the server on startup (server wins).
   - Seeds the server with defaults on the very first run.
   - Saves changes back: instant via persist(), plus an automatic
     full-state safety net (timer + tab hide/close).
   This block does NOT touch the design's data above, so future
   design exports stay compatible.
   ============================================================ */
(function () {
  var _saveTimer = null;
  var _pendingCollections = {};

  // ---- auth: attach the login token to every /api/ request ----
  window.__authToken = "";
  try { window.__authToken = localStorage.getItem("bccwe_token") || ""; } catch (e) {}
  var _origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (_origFetch) {
    window.fetch = function (url, opts) {
      opts = opts || {};
      if (typeof url === "string" && url.indexOf("/api/") === 0 && window.__authToken) {
        opts.headers = Object.assign({}, opts.headers, { "x-auth-token": window.__authToken });
      }
      return _origFetch(url, opts);
    };
  }
  function authGet(urlPath) {
    var x = new XMLHttpRequest();
    x.open("GET", urlPath, false);
    if (window.__authToken) x.setRequestHeader("x-auth-token", window.__authToken);
    try { x.send(); } catch (e) { return { status: 0, json: null }; }
    var j = null; try { j = JSON.parse(x.responseText); } catch (e) {}
    return { status: x.status, json: j };
  }

  // A blank "fresh start" dataset: keeps setup (tax, accounts, company, SMTP,
  // roles), clears all business records, zeroes ledger balances.
  function freshDefaults() {
    var B = window.BCCWE;
    var out = {};
    Object.keys(B).forEach(function (k) { if (typeof B[k] !== "function") out[k] = B[k]; });
    // Business RECORDS are wiped; SETUP (categories, category tree, services)
    // is kept — a fresh start shouldn't leave the product/category and service
    // dropdowns empty. Salespeople are demo names, so they go too.
    ["clients", "suppliers", "inventory", "invoices", "payments", "expenses",
     "cashSales", "journal", "purchaseOrders", "mailLog", "downloadLog",
     "itemSales", "defectiveProducts", "creditNotes", "orders", "orderDiscrepancies", "auditLog",
     "salespeople"]
      .forEach(function (k) { out[k] = []; });
    out.clientPrices = {};
    // Demo identity must NOT survive into a real business's fresh start: the
    // seeded backup email silently CC'd every outgoing invoice to an address on
    // a domain the user may not own, and the fake GST/PST numbers printed on
    // real invoices.
    if (out.prefs) out.prefs = Object.assign({}, out.prefs, { backupEmail: "", ccEmail: "", defaultInvoiceEmail: "", accountantName: "", accountantEmail: "" });
    if (out.company) {
      out.company = Object.assign({}, out.company);
      if (/81427 6391/.test(String(out.company.gst || ""))) out.company.gst = "";
      if (/1042-8837/.test(String(out.company.pst || ""))) out.company.pst = "";
    }
    if (Array.isArray(out.accounts)) out.accounts = out.accounts.map(function (a) { return Object.assign({}, a, { balance: 0 }); });
    // Keep the stores (setup) but reset each store's invoice counter.
    if (Array.isArray(out.companies)) out.companies = out.companies.map(function (c) { return Object.assign({}, c, { nextInvoiceNo: 1000 }); });
    out.nextInvoiceNo = 1000;
    out.nextOrderNo = 1000;
    return out;
  }

  window.__authed = false;
  window.__session = null;
  window.__dataLoaded = false; // true only once real data is loaded (gates saving)

  // Validate the saved token and, if valid, find out the account status.
  if (window.__authToken) {
    var sess = authGet("/api/session");
    if (sess.status === 200 && sess.json && sess.json.ok) {
      window.__authed = true;
      window.__session = sess.json;
    } else {
      try { localStorage.removeItem("bccwe_token"); } catch (e) {}
      window.__authToken = "";
    }
  }

  // Load the real data only when logged in and past the first-login change.
  if (window.__authed && window.__session && !window.__session.mustChange) {
    var st = authGet("/api/state");
    if (st.status === 200 && st.json) {
      if (!st.json.empty) {
        // Permission DEFINITIONS (modules) are code, not data — "DB always wins"
        // froze them at first-seed forever, so new permissions added in code
        // never appeared. Keep the code's copy; it's also excluded from saves.
        var _codeModules = window.BCCWE.modules;
        Object.keys(st.json).forEach(function (key) { window.BCCWE[key] = st.json[key]; });
        window.BCCWE.modules = _codeModules;
        // Demo-identity scrub for EXISTING databases (exact seed values only):
        // the seeded backup email CC'd every outgoing invoice to records@bccwe.ca
        // and the fake GST/PST numbers printed on real invoices.
        var _p = window.BCCWE.prefs || {};
        if (_p.backupEmail === "records@bccwe.ca") _p.backupEmail = "";
        if (_p.ccEmail === "records@bccwe.ca") _p.ccEmail = "";
        if (_p.defaultInvoiceEmail === "accounts@bccwe.ca") _p.defaultInvoiceEmail = "";
        if (_p.accountantEmail === "dana.mehta@bccwe-cpa.ca") { _p.accountantEmail = ""; _p.accountantName = _p.accountantName === "Dana Mehta" ? "" : _p.accountantName; }
        var _co = window.BCCWE.company || {};
        if (/81427 6391/.test(String(_co.gst || ""))) _co.gst = "";
        if (/1042-8837/.test(String(_co.pst || ""))) _co.pst = "";
        // Older DB snapshots predate some ledger accounts, and "DB always wins"
        // would hide them forever. Top up any that are missing so postings to
        // these codes show in the chart of accounts / trial balance.
        window.BCCWE.accounts = window.BCCWE.accounts || [];
        [
          { code: "4200", name: "Restocking Fee Income", type: "Revenue", balance: 0 },
          { code: "4900", name: "Sales Discounts", type: "Revenue", balance: 0 },
        ].forEach(function (a) {
          if (!window.BCCWE.accounts.some(function (x) { return x.code === a.code; })) window.BCCWE.accounts.push(a);
        });
      } else {
        // First run after a fresh start — seed a BLANK dataset (setup kept).
        var seed = freshDefaults();
        Object.keys(seed).forEach(function (k) { window.BCCWE[k] = seed[k]; });
        var seedXhr = new XMLHttpRequest();
        seedXhr.open("POST", "/api/state", false);
        seedXhr.setRequestHeader("Content-Type", "application/json");
        if (window.__authToken) seedXhr.setRequestHeader("x-auth-token", window.__authToken);
        seedXhr.send(JSON.stringify(seed));
      }
      window.__dataLoaded = true; // safe to save from here on
    } else {
      // Logged in but the data could not be loaded (DB outage / server error).
      // Do NOT boot the app on the seed/demo data pretending it's real — the
      // owner would be looking at fictitious books. Flag it; the shell shows a
      // hard "can't load your data" screen instead. Saving stays disabled
      // (__dataLoaded is false), so nothing can overwrite the database either.
      window.__loadFailed = st.status || "network";
    }
  }

  // Always show the live date — LOCAL calendar date, not UTC. toISOString() is
  // UTC, so from ~5pm Pacific onward it rolls to tomorrow and stamps invoices,
  // payments and aging with the wrong day. Build it from local components.
  try {
    var _n = new Date();
    var _pad2 = function (x) { return (x < 10 ? "0" : "") + x; };
    window.BCCWE.today = _n.getFullYear() + "-" + _pad2(_n.getMonth() + 1) + "-" + _pad2(_n.getDate());
  } catch (e) {}

  // ---- instant save for explicitly named collections ----
  window.persist = function (/* ...collectionNames */) {
    if (!window.__dataLoaded) return; // never save until real data is loaded
    var names = Array.prototype.slice.call(arguments);
    names.forEach(function (name) { _pendingCollections[name] = true; });
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      var toSave = {};
      Object.keys(_pendingCollections).forEach(function (name) {
        if (window.BCCWE[name] !== undefined && typeof window.BCCWE[name] !== "function") {
          toSave[name] = window.BCCWE[name];
        }
      });
      _pendingCollections = {};
      var sentJson = {};
      Object.keys(toSave).forEach(function (n) { try { sentJson[n] = JSON.stringify(toSave[n]); } catch (e) {} });
      fetch("/api/save-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{" + Object.keys(sentJson).map(function (n) { return JSON.stringify(n) + ":" + sentJson[n]; }).join(",") + "}",
      }).then(function (res) {
        if (res && res.ok) {
          // Mark exactly what was sent as confirmed so the autosave net doesn't
          // re-send these collections unchanged.
          Object.keys(sentJson).forEach(function (n) { _lastSaved[n] = sentJson[n]; });
          return;
        }
        // HTTP failure resolves (not rejects) — previously a 401/500 here was
        // silently swallowed and the data was simply never saved. Re-mark the
        // collections dirty (the autosave net also retries within 2s).
        Object.keys(toSave).forEach(function (n) { _pendingCollections[n] = true; });
        if (res && res.status === 401) showRelogin();
        setStatus("err", "✗ Not saved (server error " + (res ? res.status : "?") + ") — retrying");
      }).catch(function (e) {
        Object.keys(toSave).forEach(function (n) { _pendingCollections[n] = true; });
        setStatus("err", "✗ Not saved (no connection) — retrying");
        console.error("Save failed:", e);
      });
    }, 300);
  };

  // Route the design's localStorage save helpers to the server instead
  window.saveBCCWEPrefs = function () { window.persist("prefs"); };
  window.saveBCCWETax = function () { window.persist("TAX"); };
  window.saveBCCWERbac = function () { window.persist("roles", "users", "salespeople"); };

  // Save specific collections NOW and report success/failure, so callers can
  // avoid navigating away (and losing the page) when the server is unreachable.
  window.persistNow = function (/* ...names */) {
    if (!window.__dataLoaded) return Promise.resolve(false);
    var names = Array.prototype.slice.call(arguments);
    var toSave = {};
    names.forEach(function (name) {
      if (window.BCCWE[name] !== undefined && typeof window.BCCWE[name] !== "function") toSave[name] = window.BCCWE[name];
    });
    // Hold the autosave net while this save-or-stay transaction is in flight —
    // otherwise the 2s timer could persist the mutated state, and a failed
    // persistNow would roll back memory while the DB kept the "failed" write
    // (phantom records + duplicate numbers on retry).
    _saveLock++;
    var sentJson = {};
    Object.keys(toSave).forEach(function (n) { try { sentJson[n] = JSON.stringify(toSave[n]); } catch (e) {} });
    return fetch("/api/save-bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: "{" + Object.keys(sentJson).map(function (n) { return JSON.stringify(n) + ":" + sentJson[n]; }).join(",") + "}",
    }).then(function (r) {
      _saveLock = Math.max(0, _saveLock - 1);
      if (r && r.ok) Object.keys(sentJson).forEach(function (n) { _lastSaved[n] = sentJson[n]; });
      if (r && r.status === 401) showRelogin();
      return !!(r && r.ok);
    }).catch(function () {
      _saveLock = Math.max(0, _saveLock - 1);
      return false;
    });
  };

  // Ask the server for the next document number (invoice / po / order). The
  // increment happens atomically in the database, so two devices can never be
  // handed the same number. Returns { no, next, ... } or null when offline —
  // callers fall back to their local counter (with a local duplicate check).
  window.allocateNumber = function (kind, companyId) {
    return fetch("/api/allocate-number", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: kind, companyId: companyId || "" }),
    }).then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) { return j && j.ok && j.no ? j : null; })
      .catch(function () { return null; });
  };

  // ---- automatic full-state save (safety net) ----
  // Saves EVERY data collection on a timer and when the tab is hidden/closed,
  // so screens do not need manual wiring to be saved. This is what lets new
  // Claude Design exports work without per-file changes.
  var _skipKeys = { today: true, blankPerms: true, allPerms: true, modules: true /* code-defined, never persisted */ };
  // Per-collection record of what the SERVER has confirmed (JSON string each).
  // The autosave sends ONLY collections whose current JSON differs — so two
  // devices working in different areas never overwrite each other's data. (The
  // old full-state save clobbered EVERY collection with this device's copy.)
  var _lastSaved = {};
  var _saveLock = 0;    // >0 while a persistNow save-or-stay transaction is in flight
  var _saving = false;  // a full-state save is already on the wire — don't stack another

  // Which collections changed since the last confirmed save → { name: json }.
  function diffChanges() {
    var changed = null;
    Object.keys(window.BCCWE).forEach(function (name) {
      if (_skipKeys[name]) return;
      var v = window.BCCWE[name];
      if (typeof v === "function") return;
      var j;
      try { j = JSON.stringify(v); } catch (e) { return; }
      if (_lastSaved[name] !== j) { (changed = changed || {})[name] = j; }
    });
    return changed;
  }
  function bodyFrom(changed) {
    return "{" + Object.keys(changed).map(function (n) { return JSON.stringify(n) + ":" + changed[n]; }).join(",") + "}";
  }
  function seedLastSaved() {
    _lastSaved = {};
    Object.keys(window.BCCWE).forEach(function (name) {
      if (_skipKeys[name]) return;
      if (typeof window.BCCWE[name] === "function") return;
      try { _lastSaved[name] = JSON.stringify(window.BCCWE[name]); } catch (e) {}
    });
  }

  function snapshotState() {
    var snap = {};
    Object.keys(window.BCCWE).forEach(function (name) {
      if (_skipKeys[name]) return;
      if (typeof window.BCCWE[name] === "function") return;
      snap[name] = window.BCCWE[name];
    });
    return snap;
  }

  // ---- visible save-status badge (bottom-right corner) ----
  var _badge = null;
  function badge() {
    if (_badge) return _badge;
    try {
      _badge = document.createElement("div");
      _badge.id = "bccwe-save-status";
      _badge.style.cssText =
        "position:fixed;right:14px;bottom:14px;z-index:99999;font:600 12px system-ui,sans-serif;" +
        "padding:7px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.18);opacity:0;" +
        "transition:opacity .2s;pointer-events:none;color:#fff;";
      document.body.appendChild(_badge);
    } catch (e) {}
    return _badge;
  }
  var _hideTimer = null;
  function setStatus(kind, text) {
    var b = badge();
    if (!b) return;
    var colors = { saving: "#5a6877", ok: "#0e8a6a", err: "#c0392b" };
    b.style.background = colors[kind] || "#5a6877";
    b.textContent = text;
    b.style.opacity = "1";
    clearTimeout(_hideTimer);
    if (kind === "ok") {
      _hideTimer = setTimeout(function () { b.style.opacity = "0"; }, 1500);
    }
  }

  // ---- in-place re-login (session recovery WITHOUT losing unsaved work) ----
  // Sessions live in server memory, and shared hosting (Passenger) restarts the
  // Node app whenever it idles — so tokens die routinely mid-shift. Every save
  // then 401s. Previously those 401s were swallowed and the user kept working
  // against a server that saved NOTHING. This overlay lets them log back in on
  // the spot; the in-memory data is untouched and is saved immediately after.
  var _reloginOpen = false;
  function showRelogin() {
    if (_reloginOpen) return;
    _reloginOpen = true;
    try {
      var wrap = document.createElement("div");
      wrap.id = "bccwe-relogin";
      wrap.style.cssText = "position:fixed;inset:0;background:rgba(15,23,32,.62);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;";
      var inputCss = "display:block;width:100%;box-sizing:border-box;margin:0 0 8px;padding:10px 12px;border:1px solid #d4dae2;border-radius:8px;font-size:14px;";
      wrap.innerHTML =
        '<div style="background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:26px 26px 22px;width:370px;max-width:92vw">' +
        '<h3 style="margin:0 0 6px;font-size:17px;color:#1c2530">Session expired — log back in</h3>' +
        '<p style="margin:0 0 14px;font-size:13px;color:#5a6877;line-height:1.5">The server restarted or your login timed out. <strong>Your unsaved work is still on this page</strong> — log back in and it will be saved right away.</p>' +
        '<input id="bccwe-rl-user" placeholder="User ID or email" style="' + inputCss + '" />' +
        '<input id="bccwe-rl-pass" type="password" placeholder="Password" style="' + inputCss + '" />' +
        '<div id="bccwe-rl-err" style="color:#c0392b;font-size:12px;min-height:16px;margin:2px 0 8px"></div>' +
        '<button id="bccwe-rl-go" style="width:100%;padding:11px 0;border:0;border-radius:9px;background:#ea580c;color:#fff;font-weight:700;font-size:14px;cursor:pointer">Log back in &amp; save</button>' +
        '</div>';
      document.body.appendChild(wrap);
      var u = document.getElementById("bccwe-rl-user");
      var p = document.getElementById("bccwe-rl-pass");
      var err = document.getElementById("bccwe-rl-err");
      var go = document.getElementById("bccwe-rl-go");
      u.value = (window.__session && (window.__session.userId || "")) || "";
      function attempt() {
        err.textContent = ""; go.disabled = true; go.textContent = "Logging in…";
        fetch("/api/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: u.value.trim(), password: p.value }),
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (res.ok && res.j && res.j.ok && res.j.token) {
              window.__authToken = res.j.token;
              try { localStorage.setItem("bccwe_token", res.j.token); } catch (e) {}
              try { wrap.parentNode.removeChild(wrap); } catch (e) {}
              _reloginOpen = false;
              // The per-collection diff knows exactly what failed to save while
              // the session was dead — send just that now.
              autoSave(false);
            } else {
              err.textContent = (res.j && res.j.error) || "Wrong ID or password.";
              go.disabled = false; go.textContent = "Log back in & save";
            }
          })
          .catch(function () {
            err.textContent = "Can't reach the server — check the connection and try again.";
            go.disabled = false; go.textContent = "Log back in & save";
          });
      }
      go.onclick = attempt;
      p.onkeydown = function (e) { if (e.key === "Enter") attempt(); };
      setTimeout(function () { (u.value ? p : u).focus(); }, 50);
    } catch (e) { _reloginOpen = false; }
  }

  // Normal save — plain fetch has NO body-size limit (works for any data size).
  // CRITICAL: _lastSaved advances only on CONFIRMED success, so a failed
  // attempt is retried by the 2s net (before Phase 1, one failure marked the
  // state "saved" forever — silent, permanent data loss).
  function saveAsync(changed) {
    if (_saving) return;   // one net save on the wire at a time
    _saving = true;
    setStatus("saving", "Saving…");
    fetch("/api/save-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyFrom(changed),
    })
      .then(function (res) {
        _saving = false;
        if (res && res.ok) {
          Object.keys(changed).forEach(function (n) { _lastSaved[n] = changed[n]; });
          setStatus("ok", "✓ Saved");
          return;
        }
        if (res && res.status === 401) { setStatus("err", "✗ Not saved — session expired"); showRelogin(); return; }
        if (res && res.status === 413) { setStatus("err", "✗ Not saved — data exceeds the server's size limit"); return; }
        setStatus("err", "✗ Not saved (server error " + (res ? res.status : "?") + ") — retrying");
      })
      .catch(function () {
        _saving = false;
        setStatus("err", "✗ Not saved (no connection) — retrying");
      });
  }

  // Final best-effort save when the page is closing. Both paths now carry the
  // auth token — previously neither did, so EVERY exit save was rejected with
  // 401 and silently lost. sendBeacon can't set headers, so the token rides as
  // a query parameter (the server accepts ?t= for exactly this reason); the
  // sync-XHR fallback sets the header. The snapshot is NOT marked saved: if the
  // page survives (tab re-shown), the 2s net re-verifies with a real save.
  function saveOnExit(json) {
    var tok = window.__authToken || "";
    var url = "/api/save-bulk" + (tok ? "?t=" + encodeURIComponent(tok) : "");
    var sent = false;
    if (navigator.sendBeacon && json.length < 60000) {
      try { sent = navigator.sendBeacon(url, new Blob([json], { type: "application/json" })); } catch (e) { sent = false; }
    }
    if (!sent) {
      try {
        var x = new XMLHttpRequest();
        x.open("POST", url, false); // synchronous = reliable on exit
        x.setRequestHeader("Content-Type", "application/json");
        if (tok) x.setRequestHeader("x-auth-token", tok);
        x.send(json);
      } catch (e) {}
    }
  }

  function autoSave(isExit) {
    if (!window.__dataLoaded) return; // never save until real data is loaded
    if (!isExit && _saveLock > 0) return; // a save-or-stay transaction is mid-flight
    var changed = diffChanges(); // ONLY collections this device actually changed
    if (!changed) return;
    if (isExit) { saveOnExit(bodyFrom(changed)); return; } // best-effort — never marked "saved"
    saveAsync(changed);
  }

  try { seedLastSaved(); } catch (e) {}
  // Check often so new invoices/returns are saved within a couple of seconds.
  // A failed attempt leaves _lastSaved behind, so the next tick retries.
  setInterval(function () { autoSave(false); }, 2000);
  document.addEventListener("visibilitychange", function () {
    // Tab hidden (not closing): the page is still alive, so use the normal
    // async save — it confirms and retries. Exit paths are for real unloads.
    if (document.visibilityState === "hidden") { autoSave(false); autoSave(true); }
  });
  window.addEventListener("pagehide", function () { autoSave(true); });
  window.addEventListener("beforeunload", function () { autoSave(true); });
  window.persistAll = function () { autoSave(false); };

  // One-time backfill: give legacy inventory items (stock entered before purchase
  // logging) an "opening stock" purchase record so their purchase history shows a
  // quantity. Idempotent — skips items that already have any purchase order.
  try {
    if (window.__dataLoaded && window.STORES && window.STORES.isAdmin()) {
      var _inv = window.BCCWE.inventory || [];
      var _pos = window.BCCWE.purchaseOrders || (window.BCCWE.purchaseOrders = []);
      var _added = 0;
      _inv.forEach(function (it) {
        if (!it || !it.code) return;
        var hasPO = _pos.some(function (p) { return p.code === it.code; });
        var qty = Math.max(0, it.stock || 0), bonus = it.bonus || 0;
        if (!hasPO && (qty > 0 || bonus > 0)) {
          _pos.unshift({
            po: "OPEN-" + it.code, supplier: it.supplier || "", date: it.purchased || window.BCCWE.today,
            code: it.code, qty: qty, bonusQty: bonus, landedUnit: it.cost || 0,
            qtyReceived: qty, status: "Received",
            total: +(qty * (it.cost || 0)).toFixed(2),
            items: it.name + " ×" + qty + (bonus ? " (+" + bonus + " bonus)" : "") + " · opening stock",
          });
          _added++;
        }
      });
      if (_added && window.persist) window.persist("purchaseOrders");
    }
  } catch (e) {}

  // Make sure the owner/admin appears in Settings → Users (so the admin sees
  // at least their own account and can manage staff from there).
  try {
    if (window.__dataLoaded && window.__session && window.__session.isOwner) {
      var _us = window.BCCWE.users || (window.BCCWE.users = []);
      if (!_us.some(function (u) { return u.isOwner; })) {
        var oid = window.__session.userId || "admin";
        _us.unshift({
          id: "u_owner", name: oid, initials: String(oid).slice(0, 2).toUpperCase(),
          email: window.__session.email || "", role: "r_admin", password: "", active: true,
          isOwner: true, last: "now",
        });
        if (window.persist) window.persist("users");
      }
      // Also make the owner available as a salesperson option.
      var _sp = window.BCCWE.salespeople || (window.BCCWE.salespeople = []);
      if (!_sp.some(function (s) { return s.id === "u_owner"; })) {
        var oid2 = window.__session.userId || "admin";
        _sp.unshift({ id: "u_owner", name: oid2, initials: String(oid2).slice(0, 2).toUpperCase(), role: "Admin" });
        if (window.persist) window.persist("salespeople");
      }
    }
  } catch (e) {}

  // Log a LOGIN entry right after a real sign-in (the login screen sets this
  // flag just before reloading). Done here so the audit log is the loaded one.
  try {
    if (window.__dataLoaded && sessionStorage.getItem("bccwe_just_logged_in") === "1") {
      sessionStorage.removeItem("bccwe_just_logged_in");
      setTimeout(function () {
        if (window.logAudit) window.logAudit("LOGIN", "Session", "auth", (window.__session && window.__session.userId) || "", "Signed in");
      }, 1200);
    }
  } catch (e) {}

  // Helper used by the Account menu to sign out.
  window.bccweLogout = function () {
    try { window.logAudit && window.logAudit("LOGOUT", "Session", "auth", (window.__session && window.__session.userId) || "", "Signed out"); } catch (e) {}
    // give the logout audit a moment to save, then end the session
    setTimeout(function () {
      try {
        fetch("/api/logout", { method: "POST" });
      } catch (e) {}
      try { localStorage.removeItem("bccwe_token"); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      location.reload();
    }, 400);
  };
})();
