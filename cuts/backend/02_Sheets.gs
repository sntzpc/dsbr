// SHEET_ — Inisialisasi & Manajemen Sheet
// ============================================================

/**
 * Inisialisasi semua sheet beserta header jika belum ada
 */
function SHEET_initAllSheets() {
  SHEET_initSettings();
  SHEET_initUsers();
  SHEET_initOperators();
  SHEET_initBookings();
  SHEET_initQueue();
  SHEET_initServices();
  SHEET_initLogs();
}

function SHEET_initSettings() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SETTINGS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['key', 'value', 'label', 'updatedAt']);
    const defaults = CONFIG.DEFAULT_SETTINGS;
    const now = new Date().toISOString();
    Object.keys(defaults).forEach(key => {
      sheet.appendRow([key, defaults[key], key, now]);
    });
  }
}

function SHEET_initUsers() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.USERS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'userId', 'name', 'phone', 'email', 'password',
      'role', 'createdAt', 'lastLogin', 'isActive'
    ]);
    // Buat default admin
    sheet.appendRow([
      UTIL_generateId('USR'),
      'Administrator', '081234567890', 'admin@barbershop.com',
      UTIL_hashSimple('admin123'),
      'admin', new Date().toISOString(), '', 'true'
    ]);
  }
}

function SHEET_initOperators() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.OPERATORS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'operatorId', 'name', 'phone', 'speciality',
      'isActive', 'userId', 'photoInitial', 'createdAt'
    ]);
  }
}

function SHEET_initBookings() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.BOOKINGS);
  const headers = [
    'bookingId', 'userId', 'customerName', 'phone',
    'date', 'timeSlot', 'operatorId', 'operatorName',
    'serviceId', 'serviceName', 'price',
    'queueNumber', 'status', 'notes', 'createdAt', 'updatedAt'
  ];
  SHEET_ensureHeaders(sheet, headers);
}

function SHEET_initQueue() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.QUEUE);
  const headers = [
    'queueId', 'bookingId', 'date', 'timeSlot', 'queueNumber',
    'userId', 'customerName', 'operatorId', 'operatorName',
    'serviceId', 'serviceName', 'status', 'calledAt', 'startedAt', 'finishedAt',
    'durationMinutes', 'seatNumber'
  ];
  SHEET_ensureHeaders(sheet, headers);
}

function SHEET_initServices() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SERVICES);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['serviceId', 'name', 'price', 'durationMin', 'isActive', 'createdAt']);
    // Default services
    const now = new Date().toISOString();
    [
      ['Potong Rambut Biasa', 25000, 30],
      ['Potong + Cuci', 40000, 45],
      ['Cukur Jenggot', 20000, 20],
      ['Potong + Cukur + Cuci', 60000, 60],
    ].forEach(([name, price, dur]) => {
      sheet.appendRow([UTIL_generateId('SVC'), name, price, dur, 'true', now]);
    });
  }
}

function SHEET_initLogs() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.LOGS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'action', 'userId', 'detail']);
  }
}


/**
 * Pastikan header sheet lengkap.
 * Dipakai untuk migrasi aman pada aplikasi yang sudah berjalan:
 * - Jika sheet kosong, buat header lengkap.
 * - Jika sheet lama belum punya kolom baru, tambahkan kolom di ujung kanan.
 */
function SHEET_ensureHeaders(sheet, requiredHeaders) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.appendRow(requiredHeaders);
    return;
  }
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missing = requiredHeaders.filter(h => currentHeaders.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
}

/**
 * Ambil sheet berdasarkan nama, buat baru jika belum ada
 */
function SHEET_getOrCreate(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * Baca semua data sheet sebagai array of objects
 */
function SHEET_readAll(sheetName) {
  const sheet = SHEET_getOrCreate(sheetName);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i].toString() : ''; });
    return obj;
  });
}

/**
 * Append satu row ke sheet
 */
function SHEET_appendRow(sheetName, rowData) {
  const sheet = SHEET_getOrCreate(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
  sheet.appendRow(row);
}

/**
 * Update row berdasarkan key+value pencarian
 */
function SHEET_updateRow(sheetName, searchKey, searchValue, updateData) {
  const sheet = SHEET_getOrCreate(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyIndex = headers.indexOf(searchKey);
  if (keyIndex === -1) throw new Error('Kolom tidak ditemukan: ' + searchKey);

  for (let i = 1; i < data.length; i++) {
    if (data[i][keyIndex].toString() === searchValue.toString()) {
      Object.keys(updateData).forEach(key => {
        const colIndex = headers.indexOf(key);
        if (colIndex !== -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(updateData[key]);
        }
      });
      return true;
    }
  }
  return false;
}


// ============================================================
