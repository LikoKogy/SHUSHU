import * as XLSX from "xlsx";
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

function itemTotal(item) {
  return SIZES.reduce((sum, sz) => sum + (parseInt(item.sizes[sz]) || 0), 0);
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

// ── Build Excel ────────────────────────────────────────────────────────────

export function buildExcelBlob(order) {
  const rows = [];

  // ── Order header ──
  rows.push([`ORDER #${order.id} — ${order.status}`]);
  rows.push([]);
  rows.push(["Customer", order.ownerName || "—"]);
  rows.push(["Email", order.email || "—"]);
  rows.push(["Phone", order.phone || "—"]);
  rows.push(["Placed", order.created || "—"]);
  rows.push(["Last Edited", order.lastEdited || order.created || "—"]);
  if (order.notes) rows.push(["Order Notes", order.notes]);
  rows.push([]);
  rows.push([]);

  // ── Items ──
  order.items.forEach((item, idx) => {
    const total = itemTotal(item);

    rows.push([`── ITEM ${idx + 1} ──────────────────────────────────`]);
    rows.push(["Style / Model", item.style || "—"]);
    rows.push(["Colors", item.colors || "—"]);
    rows.push(["Catalog Image", item.catalogImage ? item.catalogImage.name : "—"]);
    rows.push([]);

    // Sizes table
    rows.push(["SIZES", ...SIZES, "TOTAL"]);
    rows.push(["Quantity", ...SIZES.map(sz => parseInt(item.sizes[sz]) || 0), total]);
    rows.push([]);

    // Logo placements
    rows.push(["Logo Placements", item.logos && item.logos.length ? item.logos.join(", ") : "—"]);
    if (item.logoNote) rows.push(["Logo Notes", item.logoNote]);
    rows.push([]);

    // Branding files
    rows.push(["BRANDING FILES", "File Name", "Notes"]);
    BRAND_FILES.forEach(bf => {
      const f = item.brandingFiles?.[bf];
      const note = item.brandingFileNotes?.[bf] || "";
      rows.push([bf, f ? f.name : "—", note]);
    });
    rows.push([]);

    // Item notes
    if (item.itemNotes) {
      rows.push(["Item Notes", item.itemNotes]);
    }

    rows.push([]);
    rows.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws["!cols"] = [
    { wch: 25 },  // A – label
    { wch: 42 },  // B
    { wch: 30 },  // C – notes / 3rd col
    { wch: 8 },   // D – XS
    { wch: 8 },   // E – S
    { wch: 8 },   // F – M
    { wch: 8 },   // G – L
    { wch: 8 },   // H – XL
    { wch: 8 },   // I – 2XL
    { wch: 8 },   // J – 3XL
    { wch: 10 },  // K – TOTAL
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Order Details");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Download Excel only ────────────────────────────────────────────────────

export function downloadExcel(order) {
  const blob = buildExcelBlob(order);
  const name = safeFilename(`Order_${order.id}_${order.ownerName}`);
  triggerDownload(blob, `${name}.xlsx`);
}

// ── Download ZIP (Excel + all uploaded files) ──────────────────────────────

export async function downloadZip(order, loadFileFn, onProgress) {
  const zip = new JSZip();

  // Excel inside the ZIP
  const excelBlob = buildExcelBlob(order);
  const baseName = safeFilename(`Order_${order.id}_${order.ownerName}`);
  zip.file(`${baseName}.xlsx`, excelBlob);

  const filesFolder = zip.folder("Files");

  // Collect all files to download
  const tasks = [];
  order.items.forEach((item, i) => {
    const itemLabel = `Item_${i + 1}_${safeFilename(item.style || `Item_${i + 1}`)}`;

    if (item.catalogImage?.key) {
      tasks.push({ folder: itemLabel, key: item.catalogImage.key, name: item.catalogImage.name });
    }

    BRAND_FILES.forEach(bf => {
      const f = item.brandingFiles?.[bf];
      if (f?.key) {
        const prefix = safeFilename(bf);
        tasks.push({ folder: itemLabel, key: f.key, name: `${prefix}_${f.name}` });
      }
    });
  });

  // Download files and add to ZIP
  for (let t = 0; t < tasks.length; t++) {
    const { folder, key, name } = tasks[t];
    if (onProgress) onProgress(t, tasks.length);
    const blob = await loadFileFn(key);
    if (blob) {
      filesFolder.folder(folder).file(name, blob);
    }
  }

  if (onProgress) onProgress(tasks.length, tasks.length);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `${baseName}.zip`);
}
