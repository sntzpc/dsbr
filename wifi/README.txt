Keuangan WiFi Hotspot Modular

Struktur file:
- index.html
- css/style.css
- js/storage.js
- js/app-core.js
- js/main-transactions.js
- js/base-reseller.js
- js/reports.js
- js/settings.js

Fitur utama:
1. Transaksi utama tetap terpisah: Pendapatan & Pengeluaran dengan kategori bertingkat.
2. Modul terpisah: Base, Reseller, Deposit/Setoran.
3. Laporan modul otomatis menghitung Piutang dan Bagi Hasil.
4. Rekap periodik modul dapat diposting ke Transaksi Utama.
5. Backup/restore JSON.

Catatan:
- Aplikasi ini menggunakan IndexedDB browser (data lokal perangkat/browser).
- Belum terhubung ke Google Sheets / server.
- Posting periodik membuat / memperbarui satu transaksi utama per periode.


Update 2026-04-16:
- Perbaikan simpan transaksi langsung ke base
- Modul Piutang dan Bagi Hasil dipisah menjadi halaman transaksi
- Tambahan export Excel (.xlsx) dan PDF pada halaman Laporan
- Posting periodik ke transaksi utama dipisah per jenis: Setoran, Piutang, Bagi Hasil


Tambahan sinkronisasi Google Sheets:
- File frontend baru: js/sync.js
- File backend GAS: gas-sync.gs
- Isi URL GAS pada konstanta SYNC_CONFIG.WEB_APP_URL di js/sync.js
