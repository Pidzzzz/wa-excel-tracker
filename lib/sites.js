const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function looksLikeSubHeader(row, headers) {
  if (!row) return false;
  let filled = 0;
  let headerish = 0;
  for (const h of headers) {
    const v = String(row[h] ?? "").trim();
    if (!v) continue;
    filled++;
    if (/^[A-Z0-9 \/\-\.\#\(\)]{3,}$/i.test(v) && !/^\d+[.,]\d+$/.test(v)) {
      headerish++;
    }
  }
  return filled > 5 && headerish / filled > 0.6;
}

function matchColumn(headers, subHeaderRow, configured, patterns) {
  const cellLabel = (i) => {
    const key = headers[i];
    const sub = subHeaderRow ? String(subHeaderRow[key] ?? "").trim() : "";
    return sub || String(key).trim();
  };

  if (configured) {
    const idx = headers.findIndex((h, i) => {
      const c = configured.trim().toLowerCase();
      return String(h).trim().toLowerCase() === c || cellLabel(i).toLowerCase() === c;
    });
    if (idx >= 0) return idx;
    throw new Error(`Kolom "${configured}" tidak ditemukan di file Excel`);
  }

  for (const p of patterns) {
    const idx = headers.findIndex((_, i) => p.test(cellLabel(i)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function loadSites(excelFile, siteColumn) {
  const filePath = path.isAbsolute(excelFile) ? excelFile : path.resolve(__dirname, "..", excelFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File Excel tidak ditemukan: ${filePath}`);
  }

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  let rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  if (rows.length === 0) throw new Error("Excel kosong");

  const headers = Object.keys(rows[0]);
  let subHeaderRow = null;
  if (looksLikeSubHeader(rows[0], headers)) {
    subHeaderRow = rows[0];
    rows = rows.slice(1);
  }

  const siteIdx = matchColumn(headers, subHeaderRow, siteColumn, [
    /site\s*name/i,
    /nama\s*lokasi\s*sesuai/i,
    /nama\s*lokasi/i,
    /site/i,
    /location/i,
    /nama/i,
  ]);
  if (siteIdx < 0) throw new Error("Kolom SITE NAME tidak ditemukan di Excel");

  const siteHeader = headers[siteIdx];
  const seen = new Set();
  const sites = [];
  for (const r of rows) {
    const name = String(r[siteHeader] ?? "").trim();
    if (!name) continue;
    if (subHeaderRow && name === String(subHeaderRow[siteHeader] ?? "").trim()) continue;
    if (/^(site\s*name|nama\s*lokasi|location)$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sites.push(name);
  }

  if (sites.length === 0) throw new Error("Tidak ada data site di Excel");
  return sites;
}

module.exports = { loadSites };
