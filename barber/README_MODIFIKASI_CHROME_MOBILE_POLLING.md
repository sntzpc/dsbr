# Patch Barbershop Frontend - Chrome Mobile & Polling

Tanggal patch: 28 April 2026

## Masalah yang diperbaiki

1. **Chrome Mobile gagal login** dengan pesan:
   `Gagal terhubung ke GAS. Cek URL deployment dan akses Web App.`

2. **Polling realtime mengganggu form admin** saat mengedit:
   - Pengaturan Barbershop
   - Master Operator
   - Master Layanan
   - Filter/report tertentu

   Penyebabnya: `silentRefresh()` sebelumnya selalu menjalankan `render(false)`, sehingga isi halaman dibuat ulang walaupun user sedang mengetik.

---

## File yang berubah

### Frontend

1. `js/api.js`
   - Ditambahkan retry JSONP otomatis.
   - Ditambahkan fallback mode parameter datar/flat.
   - Script tag dipasang ke `<head>` agar lebih stabil di Chrome Mobile.
   - Timeout dan pesan error diperjelas.

2. `js/config.js`
   - Ditambahkan:
     - `API_TIMEOUT_MS`
     - `POLLING_PAUSE_AFTER_EDIT_MS`

3. `js/app.js`
   - Polling tidak lagi merender ulang halaman saat user sedang mengetik/mengedit form.
   - Polling otomatis pause saat ada input/change pada form.
   - Silent refresh hanya boleh render pada halaman aman:
     - Admin: `dashboard`, `bookings`
     - Operator: `dashboard`, `myQueue`, `history`, `notifications`
     - Customer: `dashboard`, `queue`, `history`, `notifications`
   - Halaman booking pelanggan dan halaman master admin tidak akan dirender ulang otomatis saat polling.
   - Saat simpan setting/operator/layanan, polling ditahan sementara sampai proses simpan selesai.

### Backend GAS

1. `gas/04_Utils.gs`
   - `parsePayload_()` sekarang dapat membaca object JSON yang dikirim sebagai parameter string.
   - Ini membantu fallback request Chrome Mobile jika mode `payload` gagal dan mode `flat` dipakai.

---

## Cara update

### Jika Bapak deploy dari GitHub Pages

Upload/replace file berikut:

```text
index.html
css/style.css
js/config.js
js/api.js
js/utils.js
js/app.js
manifest.json
```

Yang paling penting diganti:

```text
js/api.js
js/config.js
js/app.js
```

### Jika Bapak juga ingin update GAS

Di Apps Script, replace isi file:

```text
gas/04_Utils.gs
```

Atau cukup salin bagian fungsi `parsePayload_()` dari file patch ini.

---

## Catatan penggunaan

- Default tema tetap **Light Mode**.
- Dark mode tetap tersimpan di browser masing-masing user.
- URL GAS tetap hardcode di `js/config.js`.
- Tidak ada input URL GAS di halaman frontend.
- Polling realtime tetap aktif, tetapi tidak mengganggu form yang sedang diedit.

