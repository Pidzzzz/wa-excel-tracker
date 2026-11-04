const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const VISITS_DIR = path.join(__dirname, "..", "visits");

function ensureDir() {
  if (!fs.existsSync(VISITS_DIR)) fs.mkdirSync(VISITS_DIR, { recursive: true });
}

function monthFromFile(month) {
  return path.join(VISITS_DIR, `visit-${month}.xlsx`);
}

function readMonth(month) {
  ensureDir();
  const file = monthFromFile(month);
  if (!fs.existsSync(file)) return [];
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows.map((r, i) => ({
    id: Number(r.ID ?? i + 1),
    date: String(r.TANGGAL ?? ""),
    site: String(r["SITE NAME"] ?? ""),
    note: String(r.KETERANGAN ?? ""),
  }));
}

function writeMonth(month, visits) {
  ensureDir();
  const sorted = [...visits].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date.localeCompare(b.date)
  );
  const rows = sorted.map((v, i) => ({
    ID: i + 1,
    TANGGAL: v.date,
    "SITE NAME": v.site,
    KETERANGAN: v.note || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["ID", "TANGGAL", "SITE NAME", "KETERANGAN"],
  });
  ws["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 55 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Visit");
  XLSX.writeFile(wb, monthFromFile(month));
}

function addVisit({ date, site, note }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal tidak valid");
  const month = date.slice(0, 7);
  const visits = readMonth(month);

  const dup = visits.find(
    (v) => v.date === date && v.site.toLowerCase() === site.toLowerCase()
  );
  if (dup) throw new Error(`Sudah ada visit "${site}" di tanggal ${date}`);

  const nextId = visits.reduce((m, v) => Math.max(m, v.id), 0) + 1;
  const visit = { id: nextId, date, site, note: note || "" };
  visits.push(visit);
  writeMonth(month, visits);
  return visit;
}

function deleteVisit(date, id) {
  const month = date.slice(0, 7);
  const visits = readMonth(month);
  const next = visits.filter((v) => v.id !== id);
  if (next.length === visits.length) throw new Error("Data tidak ditemukan");
  writeMonth(month, next);
}

function clearMonth(month) {
  writeMonth(month, []);
}

function listVisits(month) {
  return readMonth(month);
}

function formatDateID(iso) {
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${hari[dt.getDay()]}, ${d} ${bulan[m - 1]} ${y}`;
}

function buildMonthlyReport(month) {
  const visits = readMonth(month);
  if (visits.length === 0) return null;

  const [y, m] = month.split("-");
  const bulanNama = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ][Number(m) - 1];

  const byDate = new Map();
  for (const v of visits) {
    if (!byDate.has(v.date)) byDate.set(v.date, []);
    byDate.get(v.date).push(v);
  }

  const lines = [];
  lines.push(`*LIST VISIT ${bulanNama.toUpperCase()} ${y}*`);
  lines.push(`Total: ${visits.length} lokasi`);
  lines.push("");

  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    lines.push(`*${formatDateID(date)}*`);
    byDate.get(date).forEach((v, i) => {
      lines.push(`${i + 1}. ${v.site}${v.note ? ` (${v.note})` : ""}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
}

module.exports = {
  listVisits,
  addVisit,
  deleteVisit,
  clearMonth,
  buildMonthlyReport,
  VISITS_DIR,
};
