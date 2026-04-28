window.APP_CONFIG = {
  APP_NAME: 'BarberBook',
  // 1) URL WEB APP GAS /exec
  GAS_URL_EXEC: 'https://script.google.com/macros/s/AKfycbxsecNGywzHza4aO-eCXnVuCPn9OEJbNgw8ib40VlLSw4sW43S7CYD0EF4YznXd88sc2w/exec',

  // Alias lama agar kode lain tetap aman
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxsecNGywzHza4aO-eCXnVuCPn9OEJbNgw8ib40VlLSw4sW43S7CYD0EF4YznXd88sc2w/exec',

  // 2) URL GOOGLEUSERCONTENT
  // Isi BASE URL saja, jangan tambahkan action, callback, payload, token, dll.
  GAS_URL_GUC: 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnRHJicjaRgOQaWK_RoXYmf0M9q4pb6n49J89FUz9pA0V_aS7cuOjbOQTPLRHuaSW2xVsgbhmxzhW4TcDj7tB9ffqiLs4SYuCBPR44qntigo845cHTZbeS5ryfRVi6k6d9azyVFkdYWmN52ratpTqnNB8s27g_YcTjZ0LUlu_AQVFquEUapUJQBVDRk4G6fqBZkOCEM6tCea4O_vD8PJ9A5IWGzUyIF7FmGi_JIhsDArhrZF5eQip9ONLDI_wk9_9srEI3iXm4Irvc326tUDhTat3oI3Dw&lib=Mb5iZp8-00Bo-bwFbxjERnUmSx4WqhLym',

  // Cadangan tambahan bila nanti ada URL googleusercontent lain
  GAS_URL_ALTERNATES: [],

  // Ukuran potongan upload QRIS. Jangan dibesarkan dulu.
  QRIS_UPLOAD_CHUNK_SIZE: 45000,
  DEFAULT_THEME: 'light',
  POLLING_MS: 15000,
  OPERATOR_POLLING_MS: 10000,
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
