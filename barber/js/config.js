window.APP_CONFIG = {
  APP_NAME: 'BarberBook',

  // URL WEB APP GAS /exec - WAJIB diisi dengan deployment terbaru.
  // Jalur utama aplikasi sekarang memakai hidden iframe POST bridge ke URL ini,
  // sehingga Chrome Mobile tidak lagi bergantung pada base URL googleusercontent.
  GAS_URL_EXEC: 'https://script.google.com/macros/s/AKfycbxsecNGywzHza4aO-eCXnVuCPn9OEJbNgw8ib40VlLSw4sW43S7CYD0EF4YznXd88sc2w/exec',

  // Alias lama agar kode lain tetap aman.
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxsecNGywzHza4aO-eCXnVuCPn9OEJbNgw8ib40VlLSw4sW43S7CYD0EF4YznXd88sc2w/exec',

  // Tidak wajib lagi. Dibiarkan kosong agar tidak terkunci pada URL googleusercontent yang bisa berubah.
  // Jika suatu saat diperlukan sebagai fallback JSONP, boleh diisi base URL googleusercontent yang valid.
  GAS_URL_GUC: '',
  GAS_URL_ALTERNATES: [],

  // Dipakai hanya sebagai fallback bila upload POST bridge gagal.
  QRIS_UPLOAD_CHUNK_SIZE: 9000,

  DEFAULT_THEME: 'light',
  POLLING_MS: 15000,
  MOBILE_POLLING_MS: 30000,
  OPERATOR_POLLING_MS: 10000,
  MOBILE_OPERATOR_POLLING_MS: 20000,
  API_TIMEOUT_MS: 30000,
  POLLING_PAUSE_AFTER_EDIT_MS: 120000,
  STORAGE_KEY: 'barberbook.session.v1',
  THEME_KEY: 'barberbook.theme.v1'
};

window.CONSTANTS = {
  ROLES: { ADMIN: 'ADMIN', OPERATOR: 'OPERATOR', CUSTOMER: 'CUSTOMER' },
  STATUS: ['BOOKED','CHECKED_IN','CALLED','IN_SERVICE','FINISHED','CANCELLED','NO_SHOW'],
  PAYMENT_STATUS: ['UNPAID','PARTIAL','PAID','REFUNDED','PENDING','EXPIRED','FAILED']
};
