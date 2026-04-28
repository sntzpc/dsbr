window.APP_CONFIG = {
  APP_NAME: 'BarberBook',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxsecNGywzHza4aO-eCXnVuCPn9OEJbNgw8ib40VlLSw4sW43S7CYD0EF4YznXd88sc2w/exec',
  // Isi URL googleusercontent jika Anda mendapat URL alternatif dari redirect /exec.
  // Contoh format: https://script.googleusercontent.com/macros/echo?user_content_key=...
  GAS_URL_ALTERNATES: ['https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTqz21pSM1813xXYV-OZfOgCUraalttpdvstQ5cuYnLJ-fVUfmoGqZV9Js0RMuXsTu81jtzmNel0C2-F3NRtm7t6rWHlYmSrMIvsgIcpGhKJSyxigjqfQu0pYYEv22APVy_Z3oa0iKI-PDhYyP3eZ1GKLv3n2AUUPe0Vk3KKbQZbkBN3fLDTbb3gp876W3EvJQi78WvgZT6K3fjFjq5LVKcrssHjPoVbnmlBEwYwtC-Ee5WE9NhfWmYvoTgwFxhTo7lr5AmuKbhsLKgAjmT88bC7Myh7g&lib=Mb5iZp8-00Bo-bwFbxjERnUmSx4WqhLym'],
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
