// KONFIGURASI GLOBAL
// ============================================================

function CONFIG_getSpreadsheetId_() {
  const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (propId) return propId;
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('SPREADSHEET_ID belum diset. Jika Apps Script tidak terikat ke Google Sheet, isi Script Properties: SPREADSHEET_ID = ID Google Sheet database.');
  }
  return active.getId();
}

const CONFIG = {
  SPREADSHEET_ID: CONFIG_getSpreadsheetId_(),
  SHEET_NAMES: {
    SETTINGS    : 'Settings',
    USERS       : 'Users',
    OPERATORS   : 'Operators',
    BOOKINGS    : 'Bookings',
    QUEUE       : 'Queue',
    SERVICES    : 'Services',
    LOGS        : 'Logs',
  },
  DEFAULT_SETTINGS: {
    BARBERSHOP_NAME   : 'BarberKu',
    OPEN_HOUR         : '08:00',
    CLOSE_HOUR        : '21:00',
    SLOT_DURATION_MIN : 30,
    MAX_CAPACITY_DAY  : 50,
    SEATS             : 3,
    CURRENCY          : 'Rp',
    NOTIFICATION_MSG  : 'Giliran Anda sudah tiba! Silakan menuju kursi.',
  }
};

// ============================================================
