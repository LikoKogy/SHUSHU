import ExcelJS from "exceljs";
import JSZip from "jszip";

const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

const BRAND_FILES = [
  "Logo Design",
  "Neck Label",
  "Washing / Care Label",
  "Hang Tag",
  "Packaging / Bag",
  "Front Print",
  "Back Print",
];

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  titleBg:       "1C2B4A",  // deep navy
  titleFg:       "FFFFFF",
  sectionBg:     "2D4A7A",  // medium navy
  sectionFg:     "FFFFFF",
  labelBg:       "EAF0FB",  // light blue-gray
  labelFg:       "1C2B4A",
  sizeHeadBg:    "3B6CC4",  // blue
  sizeHeadFg:    "FFFFFF",
  totalBg:       "D6E4FF",  // light blue
  totalFg:       "1C2B4A",
  brandHeadBg:   "4A5568",  // slate
  brandHeadFg:   "FFFFFF",
  rowAlt:        "F7F9FD",  // very light blue
  borderClr:     "C5D3E8",
  missingFg:     "9CA3AF",  // gray for "—"
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function itemTotal(item) {
  return SIZES.reduce((s, sz) => s + (parseInt(item.sizes[sz]) || 0), 0);
}

function safeFilename(str) {
  return (str || "").replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function mkFill(hex) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
}

function mkBorder(clr = C.borderClr) {
  const s = { style: "thin", color: { argb: "FF" + clr } };
  return { top: s, left: s, bottom: s, right: s };
}

function mkFont(bold = false, colorHex = "1F2937", size = 11) {
  return { bold, color: { argb: "FF" + colorHex }, size, name: "Calibri" };
}

// Apply label+value row (label in col A, value merged B–J)
function infoRow(ws, rowNum, label, value) {
  const row = ws.getRow(rowNum);
  row.height = 21;

  const lc = ws.getCell(`A${rowNum}`);
  lc.value = label;
  lc.fill = mkFill(C.labelBg);
  lc.font = mkFont(true, C.labelFg, 11);
  lc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  lc.border = mkBorder();

  const vc = ws.getCell(`B${rowNum}`);
  vc.value = value || "—";
  vc.font = mkFont(false, value ? "111827" : C.missingFg, 11);
  vc.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  vc.border = mkBorder();
  ws.mergeCells(`B${rowNum}:J${rowNum}`);
}

// ── Build Excel ────────────────────────────────────────────────────────────

export async function buildExcelBlob(order) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GarmentCRM";
  wb.created = new Date();

  const ws = wb.addWorksheet("Order Details", {
    pageSetup: { fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });

  // Column widths (A=labels, B=values, C=notes/3rd, D-I=sizes, J=total)
  ws.columns = [
    { width: 22 }, // A
    { width: 38 }, // B
    { width: 22 }, // C
    { width: 9  }, // D  XS
    { width: 9  }, // E  S
    { width: 9  }, // F  M
    { width: 9  }, // G  L
    { width: 9  }, // H  XL
    { width: 9  }, // I  2XL
    { width: 9  }, // J  3XL / TOTAL
  ];

  let r = 1;

  // ── TITLE ────────────────────────────────────────────────────────────────
  const titleRow = ws.getRow(r);
  titleRow.height = 38;
  const tc = ws.getCell(`A${r}`);
  tc.value = `ORDER #${order.id}  —  ${order.status}`;
  tc.fill = mkFill(C.titleBg);
  tc.font = { bold: true, color: { argb: "FF" + C.titleFg }, size: 18, name: "Calibri" };
  tc.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  ws.mergeCells(`A${r}:J${r}`);
  r++;

  // Thin divider row
  const divRow = ws.getRow(r);
  divRow.height = 4;
  const divCell = ws.getCell(`A${r}`);
  divCell.fill = mkFill("3B6CC4");
  ws.mergeCells(`A${r}:J${r}`);
  r++;

  r++; // spacer

  // ── ORDER INFO ───────────────────────────────────────────────────────────
  // Section label
  const infoLabelRow = ws.getRow(r);
  infoLabelRow.height = 20;
  const ilc = ws.getCell(`A${r}`);
  ilc.value = "ORDER INFORMATION";
  ilc.fill = mkFill(C.sectionBg);
  ilc.font = mkFont(true, C.sectionFg, 10);
  ilc.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  ws.mergeCells(`A${r}:J${r}`);
  r++;

  infoRow(ws, r++, "Customer",    order.ownerName);
  infoRow(ws, r++, "Email",       order.email);
  infoRow(ws, r++, "Phone",       order.phone);
  infoRow(ws, r++, "Placed",      order.created);
  infoRow(ws, r++, "Last Edited", order.lastEdited || order.created);
  if (order.notes) {
    const noteRow = ws.getRow(r);
    noteRow.height = Math.max(21, Math.ceil(order.notes.length / 60) * 15 + 10);
    infoRow(ws, r++, "Order Notes", order.notes);
  }

  // ── ITEMS ─────────────────────────────────────────────────────────────────
  order.items.forEach((item, idx) => {
    const total = itemTotal(item);

    r++; r++; // double spacer between items

    // Item section header
    const sh = ws.getRow(r);
    sh.height = 28;
    const shc = ws.getCell(`A${r}`);
    shc.value = `ITEM ${idx + 1}`;
    shc.fill = mkFill(C.titleBg);
    shc.font = mkFont(true, C.titleFg, 13);
    shc.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    ws.mergeCells(`A${r}:J${r}`);
    r++;

    // Divider
    const id = ws.getRow(r);
    id.height = 3;
    const idc = ws.getCell(`A${r}`);
    idc.fill = mkFill(C.sizeHeadBg);
    ws.mergeCells(`A${r}:J${r}`);
    r++;

    // Style / Colors / Catalog
    infoRow(ws, r++, "Style / Model",  item.style);
    infoRow(ws, r++, "Colors",         item.colors);
    infoRow(ws, r++, "Catalog Image",  item.catalogImage?.name);

    r++; // spacer

    // ── Sizes table ─────────────────────────────────────────────
    // Header row: SIZES | XS | S | M | L | XL | 2XL | 3XL | TOTAL
    const sizeHeaders = ["SIZES", ...SIZES, "TOTAL"];
    const szHRow = ws.getRow(r);
    szHRow.height = 22;
    sizeHeaders.forEach((label, ci) => {
      const col = String.fromCharCode(65 + ci);
      const cell = ws.getCell(`${col}${r}`);
      cell.value = label;
      cell.fill = mkFill(C.sizeHeadBg);
      cell.font = mkFont(true, C.sizeHeadFg, 11);
      cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : "center", indent: ci === 0 ? 1 : 0 };
      cell.border = mkBorder();
    });
    r++;

    // Values row: Quantity | qty... | total
    const sizeValues = ["Quantity", ...SIZES.map(sz => parseInt(item.sizes[sz]) || 0), total];
    const szVRow = ws.getRow(r);
    szVRow.height = 22;
    sizeValues.forEach((val, ci) => {
      const col = String.fromCharCode(65 + ci);
      const cell = ws.getCell(`${col}${r}`);
      const isTotal = ci === sizeValues.length - 1;
      const isLabel = ci === 0;
      cell.value = val;
      cell.fill = mkFill(isTotal ? C.totalBg : isLabel ? C.labelBg : "FFFFFF");
      cell.font = mkFont(isLabel || isTotal, isTotal ? C.totalFg : isLabel ? C.labelFg : "111827", 11);
      cell.alignment = { vertical: "middle", horizontal: isLabel ? "left" : "center", indent: isLabel ? 1 : 0 };
      cell.border = mkBorder();
    });
    r++;

    r++; // spacer

    // ── Logo placements ──────────────────────────────────────────
    if (item.logos?.length) infoRow(ws, r++, "Logo Placements", item.logos.join(", "));
    if (item.logoNote)      infoRow(ws, r++, "Logo Notes",      item.logoNote);

    r++; // spacer

    // ── Branding files table ─────────────────────────────────────
    // Header
    const bfHRow = ws.getRow(r);
    bfHRow.height = 22;
    [["A", "BRANDING FILES"], ["B", "File(s)"], ["C", "Notes"]].forEach(([col, label]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = label;
      cell.fill = mkFill(C.brandHeadBg);
      cell.font = mkFont(true, C.brandHeadFg, 11);
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cell.border = mkBorder();
    });
    ws.mergeCells(`C${r}:J${r}`);
    r++;

    let bfColorIdx = 0;
    BRAND_FILES.forEach((bf) => {
      const rawFiles = item.brandingFiles?.[bf];
      const files    = Array.isArray(rawFiles) ? rawFiles : (rawFiles ? [rawFiles] : []);
      const note     = item.brandingFileNotes?.[bf] || "";
      const rowItems = files.length ? files : [null];

      rowItems.forEach((f, fi) => {
        const bg = bfColorIdx % 2 === 1 ? C.rowAlt : "FFFFFF";
        const bfRow = ws.getRow(r);
        bfRow.height = 20;

        const ac = ws.getCell(`A${r}`);
        ac.value = fi === 0 ? bf : "";
        ac.fill = mkFill(bg);
        ac.font = mkFont(fi === 0, "374151", 11);
        ac.alignment = { vertical: "middle", horizontal: "left", indent: fi === 0 ? 1 : 3 };
        ac.border = mkBorder();

        const bc = ws.getCell(`B${r}`);
        bc.value = f ? f.name : "—";
        bc.fill = mkFill(bg);
        bc.font = mkFont(false, f ? "111827" : C.missingFg, 11);
        bc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        bc.border = mkBorder();

        const cc = ws.getCell(`C${r}`);
        cc.value = fi === 0 ? note : "";
        cc.fill = mkFill(bg);
        cc.font = mkFont(false, "374151", 11);
        cc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        cc.border = mkBorder();
        ws.mergeCells(`C${r}:J${r}`);

        r++;
      });

      bfColorIdx++;
    });

    // ── Item notes ───────────────────────────────────────────────
    if (item.itemNotes) {
      r++;
      infoRow(ws, r++, "Item Notes", item.itemNotes);
    }
  });

  // ── Generate buffer ───────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Download Excel only ────────────────────────────────────────────────────

export async function downloadExcel(order) {
  const blob = await buildExcelBlob(order);
  const name = safeFilename(`Order_${order.id}_${order.ownerName}`);
  triggerDownload(blob, `${name}.xlsx`);
}

// ── Download ZIP (Excel + all uploaded files) ──────────────────────────────

export async function downloadZip(order, loadFileFn, onProgress) {
  const zip = new JSZip();

  const baseName = safeFilename(`Order_${order.id}_${order.ownerName}`);

  // Excel inside ZIP
  const excelBlob = await buildExcelBlob(order);
  zip.file(`${baseName}.xlsx`, excelBlob);

  const filesFolder = zip.folder("Files");

  // Collect all file tasks
  const tasks = [];
  order.items.forEach((item, i) => {
    const itemLabel = `Item_${i + 1}_${safeFilename(item.style || `Item_${i + 1}`)}`;
    if (item.catalogImage?.key) {
      tasks.push({ folder: itemLabel, key: item.catalogImage.key, name: item.catalogImage.name });
    }
    BRAND_FILES.forEach(bf => {
      const rawFiles = item.brandingFiles?.[bf];
      const files = Array.isArray(rawFiles) ? rawFiles : (rawFiles ? [rawFiles] : []);
      files.forEach((f, fi) => {
        if (f?.key) {
          const prefix = safeFilename(bf);
          const suffix = files.length > 1 ? `_${fi + 1}` : "";
          tasks.push({ folder: itemLabel, key: f.key, name: `${prefix}${suffix}_${f.name}` });
        }
      });
    });
  });

  // Fetch and add to ZIP
  for (let t = 0; t < tasks.length; t++) {
    if (onProgress) onProgress(t, tasks.length);
    const { folder, key, name } = tasks[t];
    const blob = await loadFileFn(key);
    if (blob) filesFolder.folder(folder).file(name, blob);
  }
  if (onProgress) onProgress(tasks.length, tasks.length);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `${baseName}.zip`);
}
