# Migrasi Dashboard SNTZ ke MySQL - Prefix `dash_`

Paket ini mengganti backend Google Apps Script menjadi backend PHP + MySQL. Semua tabel MySQL sudah menggunakan prefix `dash_` agar tidak bentrok dengan tabel aplikasi lain, tetapi nama action API tetap sama (`login`, `getAppsForSession`, `listUsers`, `saveGroupApps`, dan lain-lain). Karena itu perubahan frontend dibuat minimal: `config.js` diarahkan ke `./api.php`.

## Perubahan pada Versi Ini

- Semua tabel MySQL sudah diberi prefix `dash_`: `dash_users`, `dash_apps`, `dash_app_groups`, dan seterusnya.
- File `.cpanel.yml` dipertahankan agar hosting bisa tetap menarik/deploy langsung dari repository GitHub.
- `config.js` tetap memakai endpoint relatif `./api.php`, sehingga aman saat file hasil deploy berada di domain/folder yang sama dengan backend.

## Isi Paket

- `index.html`, `admin.html`, `script.js`, `admin.js`, `style.css` = frontend Dashboard.
- `config.js` = konfigurasi endpoint API MySQL.
- `api.php` = backend pengganti Google Apps Script.
- `db_config.php` = konfigurasi host, nama database, user, password, dan kunci installer.
- `install.php` = installer sekali pakai untuk membuat tabel dan import data awal.
- `migration/schema.sql` = struktur tabel MySQL.
- `migration/data_seed.json` = hasil konversi dari database Excel/Google Sheet yang Bapak upload.
- `legacy_gas_backup/Code.gs` = backup backend GAS lama, tidak perlu diupload untuk produksi MySQL.

## Data yang Diikutkan

Data awal yang ikut dimigrasikan:

- `dash_apps`: 39 baris
- `dash_users`: 116 baris
- `dash_app_groups`: 8 baris
- `dash_settings`: 4 baris
- `dash_icons`: 41 baris

## Langkah Upload ke Hosting `sntz.my.id` via Repository GitHub/cPanel

1. Buat database MySQL baru dari cPanel, misalnya:
   - Database: `dashboard_sntz`
   - User database: sesuai cPanel Bapak
   - Password database: sesuai cPanel Bapak

2. Commit semua file paket ini ke repository GitHub Dashboard Bapak. Hosting tetap bisa menarik file langsung dari repository seperti alur awal menggunakan **cPanel Git Version Control / Pull or Deploy**.

3. Pastikan file `.cpanel.yml` ikut masuk repository. File ini akan menyalin frontend, `api.php`, `db_config.php`, `install.php`, `.htaccess`, dan folder `migration/` ke `public_html/`. Jika Dashboard berada di subfolder, ubah `DEPLOYPATH` pada `.cpanel.yml`, misalnya `public_html/dashboard/`.

4. Edit `db_config.php`:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'dashboard_sntz');
define('DB_USER', 'ISI_USER_DATABASE');
define('DB_PASS', 'ISI_PASSWORD_DATABASE');
```

5. Jalankan installer sekali pakai melalui browser:

```text
https://sntz.my.id/dashboard/install.php?key=INSTALL_DASHBOARD_31B267YLXB
```

Sesuaikan `/dashboard/` dengan lokasi upload Bapak. Klik tombol **Jalankan Install / Update Data**.

6. Test API:

```text
https://sntz.my.id/dashboard/api.php?action=getTheme
```

Jika sukses, responsnya berbentuk JSON dengan `success:true`.

7. Setelah instalasi berhasil, hapus atau rename file berikut dari hosting:
   - `install.php`
   - folder `migration/`

## Catatan Penting untuk GitHub Repository dan GitHub Pages

Repository GitHub tetap bisa dipakai sebagai sumber deploy ke hosting cPanel. Yang tidak bisa adalah menjalankan PHP/MySQL langsung dari **GitHub Pages**, karena GitHub Pages hanya melayani file statis. Jadi runtime PHP/MySQL tetap berjalan di `https://sntz.my.id`, sedangkan proses upload dapat tetap menggunakan Pull/Deploy dari repository GitHub.

Jika frontend tetap ingin dibuka dari GitHub Pages tetapi API berada di `sntz.my.id`, ubah `config.js` menjadi:

```js
window.APP_CONFIG.SCRIPT_URL = 'https://sntz.my.id/dashboard/api.php';
```

Lalu di `db_config.php`, isi:

```php
define('ALLOWED_ORIGIN', 'https://sntzpc.github.io');
```

## Login

Password hash tetap memakai algoritma lama dari GAS, sehingga password existing tetap bisa digunakan.

Jika membutuhkan akun darurat, installer memastikan akun berikut tersedia bila belum ada:

- Username: `master`
- Password default: `user123`
- Role: `master`

- Username: `admin`
- Password default: `user123`
- Role: `admin`

## Reset Import

Jika ingin mengosongkan tabel utama dan import ulang dari seed:

```text
https://sntz.my.id/dashboard/install.php?key=INSTALL_DASHBOARD_31B267YLXB&run=1&reset=1
```

Gunakan hanya saat awal migrasi atau saat data MySQL boleh ditimpa ulang.

## File yang Tidak Perlu Diupload untuk Produksi

- `legacy_gas_backup/`
- `migration/` setelah installer selesai
- `install.php` setelah installer selesai

## Struktur Tabel MySQL dengan Prefix `dash_`

Tabel utama:

- `dash_apps`
- `dash_users`
- `dash_app_groups`
- `dash_settings`
- `dash_icons`
- `dash_sessions`
- `dash_migration_logs`

## Perubahan Teknis

- `api.php` mempertahankan format response lama: `{ success, data, message }`.
- Session login yang sebelumnya memakai `CacheService` GAS diganti ke tabel `dash_sessions` di MySQL.
- Hak akses aplikasi tetap berdasarkan `role` dan `group`.
- Theme tetap dibaca dari `dash_settings`.
- CRUD aplikasi, user, dan group sudah diarahkan ke MySQL.
