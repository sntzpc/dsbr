# BarberBook Frontend

Frontend web modern responsif untuk aplikasi Management Barbershop berbasis Google Apps Script dan Google Sheets.

## Isi Paket

```text
barbershop_frontend/
├── index.html
├── manifest.json
├── css/
│   └── style.css
└── js/
    ├── config.js
    ├── api.js
    ├── utils.js
    └── app.js
```

## GAS URL

URL GAS sudah di-hardcode di:

```text
js/config.js
```

```javascript
GAS_URL: 'https://script.google.com/macros/s/AKfycbwoPMzVoCiZUdVYtvptf9nLCAyEC9LGKGpUHKqsEjYRA8_4NNCZ6TMDg8fK4eCZAnOPqw/exec'
```

Tidak ada input URL GAS di halaman frontend.

## Cara Deploy di GitHub Pages

1. Upload semua isi folder `barbershop_frontend` ke repository GitHub.
2. Aktifkan GitHub Pages dari branch utama.
3. Buka URL GitHub Pages.
4. Klik tombol `Setup DB` sekali jika database Google Sheets belum dibuat oleh backend.
5. Login dengan akun admin awal backend:

```text
Nomor HP : 08123456789
Password : admin123
```

## Catatan Teknis

- Komunikasi frontend ke GAS menggunakan JSONP agar aman dibuka dari GitHub Pages, browser mobile, dan desktop tanpa kendala CORS.
- Default tampilan adalah light mode.
- Theme preference disimpan di localStorage.
- Session login disimpan di localStorage.
- Data antrian refresh otomatis:
  - Operator: 10 detik
  - Admin/Pelanggan: 15 detik

## Fitur Utama

### Pelanggan
- Register mandiri
- Login
- Booking layanan
- Pilih operator atau operator mana saja
- Cek slot tersedia
- Nomor antrian otomatis dari backend
- Check-in
- Batalkan booking
- Lihat antrian live
- Lihat riwayat booking
- Notifikasi aplikasi

### Operator
- Login
- Dashboard order hari ini
- Lihat antrian masing-masing
- Panggil pelanggan
- Mulai layanan
- Selesaikan layanan
- Tandai no-show
- Input pembayaran
- Lihat notifikasi

### Admin
- Dashboard admin
- Manajemen booking
- Master operator
- Master layanan
- Setting profil barbershop
- Setting kapasitas dan jam operasional
- Report booking, revenue, dan operator
- Export CSV
- Print/PDF melalui fitur print browser

## File yang Biasanya Diubah

### `js/config.js`
Untuk mengganti GAS URL.

### `css/style.css`
Untuk mengganti warna, ukuran, dan tampilan visual.

### `js/app.js`
Untuk menambah halaman, fitur, validasi, dan logika aplikasi.

## Penting

Pastikan deployment GAS menggunakan pengaturan:

```text
Execute as: Me
Who has access: Anyone
```

Jika muncul error `Sheet belum ada`, klik tombol `Setup DB` dari halaman login atau akses action `setupDatabase` dari backend.
