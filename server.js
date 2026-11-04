const fs = require("fs");
const path = require("path");
const express = require("express");
const XLSX = require("xlsx");
const QRCode = require("qrcode");

const { loadSites } = require("./lib/sites");
const {
  listVisits,
  addVisit,
  deleteVisit,
  clearMonth,
  buildMonthlyReport,
} = require("./lib/visits");
const wa = require("./lib/whatsapp");

const CONFIG_PATH = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const sites = loadSites(config.excelFile, config.siteColumn);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/sites", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (q.length < 2) return res.json({ sites: [] });

  const scored = sites
    .map((name) => {
      const n = name.toLowerCase();
      let score = -1;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 80;
      else if (n.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
      else if (n.includes(q)) score = 40;
      else {
        let i = 0;
        let j = 0;
        while (i < q.length && j < n.length) {
          if (q[i] === n[j]) i++;
          j++;
        }
        if (i === q.length) score = 20;
      }
      return { name, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 12);

  res.json({ sites: scored.map((x) => x.name) });
});

app.get("/api/visits", (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    res.json({ month, visits: listVisits(month) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/visits", (req, res) => {
  try {
    const { date, site, note } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Tanggal tidak valid (YYYY-MM-DD)" });
    }
    if (!site || !String(site).trim()) {
      return res.status(400).json({ error: "Site wajib diisi" });
    }
    const known = sites.some((s) => s.toLowerCase() === String(site).trim().toLowerCase());
    if (!known) {
      return res.status(400).json({ error: "Site tidak ada di daftar datek.xlsx" });
    }
    const visit = addVisit({
      date,
      site: String(site).trim(),
      note: note ? String(note).trim() : "",
    });
    res.json({ ok: true, visit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/visits", (req, res) => {
  try {
    const { id, date } = req.body || {};
    if (id === undefined || !date) {
      return res.status(400).json({ error: "id dan date wajib" });
    }
    deleteVisit(date, Number(id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/visits/clear", (req, res) => {
  try {
    const { month } = req.body || {};
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month tidak valid (YYYY-MM)" });
    }
    clearMonth(month);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/report", (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const text = buildMonthlyReport(month);
    res.json({ month, text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wa/status", async (req, res) => {
  try {
    const status = await wa.status();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wa/qr", async (req, res) => {
  try {
    const qr = await wa.getQR();
    if (!qr) return res.json({ qr: null });
    const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
    res.json({ qr: dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wa/reset", async (req, res) => {
  try {
    const status = await wa.reset();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wa/send", async (req, res) => {
  try {
    const month = (req.body && req.body.month) || new Date().toISOString().slice(0, 7);
    const report = buildMonthlyReport(month);
    if (!report) return res.status(400).json({ error: `Belum ada visit di bulan ${month}` });

    const result = await wa.sendText(config.targetNumber, report);
    res.json({ ok: true, sent: result.sent, month });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log("=== Visit Tracker ===");
  console.log(`Site dari datek.xlsx : ${sites.length} lokasi`);
  console.log(`Buka browser          : http://localhost:${PORT}`);
  console.log(`Kirim WA ke           : ${config.targetNumber}`);
  console.log(`Folder Excel visit    : ${path.join(__dirname, "visits")}`);
});
