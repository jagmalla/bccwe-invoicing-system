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
    { code: "3000", name: "Owner's Equity", type: "Equity", balance: 60000.0 },
    { code: "3900", name: "Retained Earnings", type: "Equity", balance: 21639.95 },
    { code: "4000", name: "Sales Revenue — Retail", type: "Revenue", balance: 96420.0 },
    { code: "4010", name: "Sales Revenue — Wholesale", type: "Revenue", balance: 61350.0 },
    { code: "4100", name: "Service & Repair Revenue", type: "Revenue", balance: 28940.0 },
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
    const id = "m" + Date.now().toString(36);
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
  window.logDownload = function (entry) {
    const id = "d" + Date.now().toString(36);
    const now = window.BCCWE.today + " " + new Date().toTimeString().slice(0, 5);
    window.BCCWE.downloadLog.unshift(Object.assign({ id, ts: now, kind: "PDF", docNo: "", clientId: "", user: "Harman Gill" }, entry, { id }));
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
  // simulate PHPMailer send: log Pending, then resolve after a beat. cb(status) fires on resolve.
  window.sendEmail = function (entry, cb) {
    // System default backup email is ALWAYS copied on every outgoing email,
    // no matter who the recipient is (client, employee, owner, accountant…).
    const backup = (window.BCCWE.prefs && window.BCCWE.prefs.backupEmail) || "";
    if (backup) {
      const cc = Array.isArray(entry.cc) ? entry.cc.slice() : [];
      const seen = new Set([...(entry.to || []), ...cc].map((a) => String(a).toLowerCase()));
      if (!seen.has(backup.toLowerCase())) cc.push(backup);
      entry.cc = cc;
    }
    const id = window.logEmail(entry);
    setTimeout(function () {
      // a recipient with an obvious typo / unroutable domain bounces; everything else delivers
      const bad = (entry.to || []).find((a) => /\.(test|invalid|local)$/i.test(a) || /@example\./i.test(a));
      if (bad) window.resolveEmail(id, "Bounced", "550 5.1.1 User unknown", "Recipient address rejected — " + bad);
      else window.resolveEmail(id, "Delivered", "250 2.0.0 Accepted", "Accepted by remote SMTP host");
      if (cb) cb(bad ? "Bounced" : "Delivered", id);
    }, 1400);
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
  function stockAgeDays(item) {
    if (!item || !item.purchased) return 0;
    return Math.max(0, Math.round((today - new Date(item.purchased)) / STOCK_DAY));
  }
  function stockRecentUnits(code, days) {
    const cut = new Date(today); cut.setDate(cut.getDate() - days);
    const c = cut.toISOString().slice(0, 10);
    return itemSales.filter((s) => s.code === code && s.date >= c).reduce((a, s) => a + s.qty, 0);
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

  const TEAM_SPEC = {
    dashboard: { view_own: true, revenue: true, charts: true },
    invoice:   { add: true, update: true, assign_sales: true },
    history:   { view_own: true, view_paid: true, view_due: true, add_pay: true, email: true, export: true },
    orders:    { view_all: true, add: true, update: true, receive: true, convert: true, comments: true },
    people:    { view_all: true, add_client: true, update_client: true },
    inventory: { view: true, view_stock: true },
    sales:     { view_own: true, add: true, update: true, add_pay: true, ret_own: true },
    expenses:  { view_own: true, add: true },
  };
  const ACCT_SPEC = {
    dashboard:  { view_company: true, revenue: true, profit: true, stock: true, charts: true, receivables: true },
    invoice:    { view_cost: true },
    history:    { view_all: true, view_paid: true, view_due: true, view_partial: true, view_overdue: true, add_pay: true, edit_pay: true, profit: true, export: true, email: true, void: true },
    orders:     { view_all: true },
    people:     { view_all: true, view_cost: true, view_balance: true },
    inventory:  { view: true, view_stock: true, view_cost: true, losses: true },
    sales:      { view_all: true, view_paid: true, view_due: true, add_pay: true, profit: true, view_cost: true, ret_all: true },
    expenses:   { view_all: true, add: true, update: true, approve: true, categories: true },
    accounting: { view: true, add: true, edit: true, reconcile: true, pl: true, bs: true, coa: true },
    unpaid:     { view_all: true, record_pay: true, remind: true, writeoff: true },
    reports:    { sales: true, profit: true, tax: true, inventory: true, export: true },
  };
  function defaultPerms(id) {
    if (id === "r_team") return permsFrom(TEAM_SPEC);
    if (id === "r_acct") return permsFrom(ACCT_SPEC);
    return blankPerms();
  }

  let roles = [
    { id: "r_admin", name: "Admin", tone: "blue", system: true, perms: allPerms() },
    { id: "r_team", name: "Team Member", tone: "slate", system: false, perms: permsFrom(TEAM_SPEC) },
    { id: "r_acct", name: "Accountant", tone: "green", system: false, perms: permsFrom(ACCT_SPEC) },
  ];
  let users = [
    { id: "u_admin", name: "Harman Gill", initials: "HG", email: "harman.gill@bccwe.ca", role: "r_admin", password: "Bccwe@2026!", active: true, last: "2 min ago" },
    { id: "u_priya", name: "Priya Sandhu", initials: "PS", email: "priya.sandhu@bccwe.ca", role: "r_team", password: "Priya@2026", active: true, last: "1 hr ago" },
    { id: "u_kev", name: "Kevin Tran", initials: "KT", email: "kevin.tran@bccwe.ca", role: "r_team", password: "Kevin@2026", active: true, last: "Today, 11:05" },
    { id: "u_acct", name: "Dana Mehta", initials: "DM", email: "dana.mehta@bccwe.ca", role: "r_acct", password: "Dana@2026", active: true, last: "Yesterday" },
  ];

  // hydrate tax + RBAC overrides from a previous session
  (function () {
    try { const t = JSON.parse(localStorage.getItem("bccwe_tax") || "null"); if (t && t.modes && t.order) { TAX.modes = t.modes; TAX.order = t.order; } } catch (e) {}
    try {
      const r = JSON.parse(localStorage.getItem("bccwe_rbac") || "null");
      if (r && r.roles && r.users) {
        if (r.v === 3) {
          // current permission model — use as saved
          roles = r.roles;
        } else {
          // older permission model(s) — regenerate perms for the new named-permission
          // model while preserving role identities, names and tones
          roles = r.roles.map((role) => ({ ...role, perms: role.system ? allPerms() : defaultPerms(role.id) }));
        }
        users = r.users;
        if (r.salespeople) { salespeople.length = 0; r.salespeople.forEach((s) => salespeople.push(s)); }
      }
    } catch (e) {}
  })();

  window.saveBCCWETax = function () {
    try { localStorage.setItem("bccwe_tax", JSON.stringify({ modes: window.BCCWE.TAX.modes, order: window.BCCWE.TAX.order })); } catch (e) {}
  };
  window.saveBCCWERbac = function () {
    try { localStorage.setItem("bccwe_rbac", JSON.stringify({ v: 3, roles: window.BCCWE.roles, users: window.BCCWE.users, salespeople: window.BCCWE.salespeople })); } catch (e) {}
  };

  window.BCCWE = {
    company, TAX, salespeople, clients, suppliers, inventory, services,
    accounts, invoices, payments, expenses, expenseCategories, cashSales, journal,
    purchaseOrders, smtpProfiles, mailLog, downloadLog, auditLog, itemSales, defectiveProducts,
    creditNotes, orders,
    modules, roles, users,
    blankPerms, allPerms,
    prefs,
    clientPrices: {},
    today: "2026-06-14",
    nextInvoiceNo: 1048,
    nextOrderNo: 1010,
  };
})();
