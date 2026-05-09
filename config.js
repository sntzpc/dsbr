// config.js (GLOBAL CONFIG) - MySQL Backend
window.APP_CONFIG = window.APP_CONFIG || {};

// Mode hosting utama di https://sntz.my.id:
// Frontend dan api.php berada dalam folder/domain yang sama, sehingga aman untuk repository GitHub
// yang ditarik langsung oleh cPanel/Git Version Control ke public_html.
window.APP_CONFIG.SCRIPT_URL = 'https://sntz.my.id/api.php';

// Jika suatu saat frontend masih dibuka dari GitHub Pages, sedangkan API tetap di sntz.my.id,
// ganti menjadi URL absolut berikut dan isi ALLOWED_ORIGIN di db_config.php.
// window.APP_CONFIG.SCRIPT_URL = 'https://sntz.my.id/dashboard/api.php';
