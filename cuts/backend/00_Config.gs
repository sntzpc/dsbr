// KONFIGURASI GLOBAL
// ============================================================
const CONFIG = {
  SPREADSHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
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
