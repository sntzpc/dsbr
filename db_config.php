<?php
// =============================================================
// KONFIGURASI DATABASE MYSQL - DASHBOARD SNTZ
// Edit file ini sebelum menjalankan install.php.
// =============================================================

define('DB_HOST', 'localhost');
define('DB_NAME', 'sntp6755_dash_sntz');
define('DB_USER', 'sntp6755');
define('DB_PASS', 'Yc1PqzSgPuCU71');
define('DB_CHARSET', 'utf8mb4');

// Prefix tabel MySQL aplikasi Dashboard agar tidak bentrok dengan aplikasi lain.
// Semua tabel dibuat sebagai dash_apps, dash_users, dash_app_groups, dst.
define('DB_TABLE_PREFIX', 'dash_');

// Kunci instalasi sekali pakai. Ganti bila diperlukan.
define('INSTALL_KEY', 'INSTALL_DASHBOARD_31B267YLXB');

// Session login dashboard, default 6 jam seperti GAS lama.
define('SESSION_TTL_SECONDS', 6 * 60 * 60);

// CORS: kosong = same-origin saja. Isi domain GitHub Pages jika frontend masih dipanggil dari sana.
// Contoh: define('ALLOWED_ORIGIN', 'https://sntzpc.github.io');
define('ALLOWED_ORIGIN', '');
