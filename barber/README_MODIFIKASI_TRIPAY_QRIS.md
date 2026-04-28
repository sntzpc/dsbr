# Modifikasi Barbershop Management - Chrome Mobile, Tripay, dan QRIS Statis

## Isi Modifikasi

1. **Fallback koneksi Chrome Mobile**
   - `js/api.js` sekarang mencoba beberapa endpoint secara otomatis.
   - Endpoint utama tetap `APP_CONFIG.GAS_URL`.
   - Endpoint alternatif bisa ditambahkan pada `APP_CONFIG.GAS_URL_ALTERNATES` di `js/config.js`.
   - Jika Anda mendapatkan URL `script.googleusercontent.com/macros/echo?...` dari redirect deployment GAS, masukkan ke array tersebut.

2. **Setting Tripay di Frontend**
   Pada halaman Admin > Setting ditambahkan:
   - URL Website
   - Aktifkan Payment Gateway
   - Mode Tripay: Sandbox / Production
   - Merchant Code
   - API Key
   - Private Key
   - Default Channel, contoh `QRIS`, `BRIVA`, `BCAVA`
   - URL Callback
   - URL Return
   - Catatan Whitelist IP

3. **Integrasi Tripay di Backend GAS**
   Ditambahkan action:
   - `getTripayChannels`
   - `createTripayPayment`
   - `checkTripayPaymentStatus`
   - callback otomatis jika Tripay POST ke URL Web App tanpa action tetapi membawa `merchant_ref` / `reference` / `status`

4. **QRIS Statis**
   - Admin bisa upload QRIS statis dari halaman Setting.
   - File disimpan ke Google Drive dan dibuat public anyone-with-link.
   - URL QRIS disimpan ke Settings dan tampil di halaman pelanggan saat booking belum lunas.

## Langkah Pemasangan

1. Upload ulang semua file frontend ke GitHub Pages.
2. Copy semua file `.gs` di folder `gas/` ke project Google Apps Script.
3. Deploy ulang Web App sebagai versi baru.
4. Pastikan akses Web App: **Anyone**.
5. Jalankan tombol **Setup Database** dari aplikasi agar header sheet baru ditambahkan:
   - Kolom tambahan di `Payments`
   - Sheet baru `PaymentCallbacks`
   - Settings Tripay dan QRIS
6. Masuk sebagai Admin > Setting, lalu isi konfigurasi Tripay dan upload QRIS statis.
7. Di dashboard Tripay, isi:
   - URL Website: URL GitHub Pages/domain aplikasi
   - URL Callback: URL Web App GAS `/exec`
   - URL Return: URL aplikasi frontend

## Catatan Penting Whitelist IP

Google Apps Script menggunakan infrastruktur Google dengan IP keluar yang dinamis. Jika akun Tripay Production mewajibkan whitelist IP statis untuk request API, opsi paling aman adalah memakai backend/proxy kecil di VPS/domain profesional dengan IP statis, lalu frontend/GAS diarahkan ke backend tersebut. Untuk sandbox, biasanya integrasi dapat diuji tanpa IP statis.

## Catatan Keamanan Callback

Tripay mengirim signature callback lewat header `X-Callback-Signature`. Event `doPost(e)` Google Apps Script tidak menyediakan semua request header secara langsung, sehingga verifikasi header callback tidak bisa dibuat sekuat backend Node/PHP/VPS. Karena itu paket ini:

- tetap mencatat callback ke sheet `PaymentCallbacks`,
- memproses status secara idempotent berdasarkan `merchant_ref` / `reference`,
- menyediakan action `checkTripayPaymentStatus` untuk validasi ulang status langsung ke API Tripay.

Untuk produksi dengan nilai transaksi besar, disarankan migrasi callback Tripay ke backend yang dapat membaca header request.
