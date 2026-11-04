# Visit Tracker

Form browser untuk mencatat **list visit bulanan**: ketik potongan nama lokasi → pilih dari daftar `datek.xlsx` → tersimpan ke Excel per bulan. Ada tombol kirim rekap bulanan ke WhatsApp.

## Cara Pakai

```
cd C:\Users\USer\wa-excel-tracker
npm start
```

Buka **http://localhost:3100** di browser.

### Alur harian

1. Pilih **Tanggal Visit** (default hari ini)
2. Ketik **potongan nama** lokasi (min. 2 huruf) → muncul saran dari Excel → klik untuk pilih
3. Klik **Tambah ke List**
4. Ulangi untuk lokasi berikutnya (mis. 2 lokasi/hari)
5. List tampil dikelompokkan per hari, tersimpan di `visits/visit-YYYY-MM.xlsx`

### Kirim ke WhatsApp

1. Klik **Kirim ke WhatsApp**
2. Scan QR (sekali saja, session tersimpan di `auth_session/`)
3. Rekap seluruh bulan terkirim ke nomor di `config.json`

## Pengaturan (`config.json`)

```json
{
  "excelFile": "D:/RE_Project/datek.xlsx",
  "targetNumber": "628xxxxxxxxxx",
  "siteColumn": "NAMA LOKASI"
}
```

- `targetNumber`: nomor WhatsApp tujuan rekap (format `628...`)
- Ganti `excelFile` jika file site pindah lokasi

## File

| Path | Fungsi |
|------|--------|
| `server.js` | Server web + API |
| `public/index.html` | Form UI |
| `lib/sites.js` | Baca daftar site dari datek.xlsx |
| `lib/visits.js` | Simpan/baca visit per bulan (Excel) |
| `lib/whatsapp.js` | Kirim rekap via WhatsApp (Baileys) |
| `visits/visit-YYYY-MM.xlsx` | Data visit bulanan |
