// KONFIGURASI — GANTI URL GAS ANDA DI SINI
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxxoSuiqHtO2H5PFyunUbCUCQlivbQyxz-fOPpVJduBHtBzWbEJzqtIHf5fw_mp5ToNGw/exec';

// ============================================================
// STATE APLIKASI
// ============================================================
let STATE = {
  user          : null,
  selectedOp    : null,
  selectedDate  : null,
  operatorId    : null, // untuk operator login
  refreshTimer  : null,
  shopName      : 'BarberKu',
};

// ============================================================
