// SHEET_ — Inisialisasi & Manajemen Sheet
// ============================================================

/**
 * Inisialisasi semua sheet beserta header jika belum ada.
 * Aman untuk database lama: kolom lama tidak dihapus, kolom baru ditambahkan.
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
  SHEET_ensureHeaders(sheet, ['key', 'value', 'label', 'updatedAt']);

  const defaults = CONFIG.DEFAULT_SETTINGS;
  const now = UTIL_nowIso_();
  const rows = sheet.getDataRange().getValues();
  const headers = (rows[0] || []).map(h => String(h || '').trim());
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  const labelIdx = headers.indexOf('label');
  const updIdx = headers.indexOf('updatedAt');
  const existingKeys = {};

  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][keyIdx] || '').trim();
    if (key) existingKeys[key] = true;
  }

  Object.keys(defaults).forEach(key => {
    if (!existingKeys[key]) {
      const row = new Array(headers.length).fill('');
      row[keyIdx] = key;
      if (valIdx !== -1) row[valIdx] = defaults[key];
      if (labelIdx !== -1) row[labelIdx] = key;
      if (updIdx !== -1) row[updIdx] = now;
      sheet.appendRow(row);
    }
  });
}

function SHEET_initUsers() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.USERS);
  SHEET_ensureHeaders(sheet, [
    'userId', 'name', 'phone', 'email', 'password',
    'role', 'createdAt', 'lastLogin', 'isActive'
  ]);

  const users = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
  const hasAdmin = users.some(u => String(u.role || '').toLowerCase() === 'admin');
  if (!hasAdmin) {
    SHEET_appendRow(CONFIG.SHEET_NAMES.USERS, {
      userId   : UTIL_generateId('USR'),
      name     : 'Administrator',
      phone    : '081234567890',
      email    : 'admin@barbershop.com',
      password : UTIL_hashSimple('admin123'),
      role     : 'admin',
      createdAt: UTIL_nowIso_(),
      lastLogin: '',
      isActive : 'true'
    });
  }
}

function SHEET_initOperators() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.OPERATORS);
  SHEET_ensureHeaders(sheet, [
    'operatorId', 'name', 'phone', 'speciality',
    'isActive', 'userId', 'photoInitial', 'createdAt'
  ]);
}

function SHEET_initBookings() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.BOOKINGS);
  SHEET_ensureHeaders(sheet, [
    'bookingId', 'userId', 'customerName', 'phone',
    'date', 'timeSlot', 'operatorId', 'operatorName',
    'serviceId', 'serviceName', 'price',
    'queueNumber', 'status', 'notes', 'createdAt', 'updatedAt'
  ]);
}

function SHEET_initQueue() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.QUEUE);
  SHEET_ensureHeaders(sheet, [
    'queueId', 'bookingId', 'date', 'timeSlot', 'queueNumber',
    'userId', 'customerName', 'operatorId', 'operatorName',
    'serviceId', 'serviceName', 'status', 'calledAt', 'startedAt', 'finishedAt',
    'durationMinutes', 'seatNumber'
  ]);
}

function SHEET_initServices() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SERVICES);
  SHEET_ensureHeaders(sheet, ['serviceId', 'name', 'price', 'durationMin', 'isActive', 'createdAt']);

  if (sheet.getLastRow() < 2) {
    const now = UTIL_nowIso_();
    [
      ['Potong Rambut Biasa', 25000, 30],
      ['Potong + Cuci', 40000, 45],
      ['Cukur Jenggot', 20000, 20],
      ['Potong + Cukur + Cuci', 60000, 60],
    ].forEach(([name, price, dur]) => {
      SHEET_appendRow(CONFIG.SHEET_NAMES.SERVICES, {
        serviceId  : UTIL_generateId('SVC'),
        name       : name,
        price      : price,
        durationMin: dur,
        isActive   : 'true',
        createdAt  : now
      });
    });
  }
}

function SHEET_initLogs() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.LOGS);
  SHEET_ensureHeaders(sheet, ['timestamp', 'action', 'userId', 'detail']);
}

/**
 * Pastikan header sheet lengkap.
 * Jika sheet kosong, buat header lengkap.
 * Jika sheet lama belum punya kolom baru, tambahkan kolom di ujung kanan.
 */
function SHEET_ensureHeaders(sheet, requiredHeaders) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.appendRow(requiredHeaders);
    return;
  }
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const missing = requiredHeaders.filter(h => currentHeaders.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
}

/**
 * Ambil sheet berdasarkan nama, buat baru jika belum ada.
 */
function SHEET_getOrCreate(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  return sheet;
}

/**
 * Baca semua data sheet sebagai array of objects.
 * Tanggal dan jam dinormalisasi agar tidak menjadi string 1899/12/30.
 */
function SHEET_readAll(sheetName) {
  const sheet = SHEET_getOrCreate(sheetName);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (!h) return;
        obj[h] = SHEET_normalizeCellValue_(row[i], h);
      });
      return obj;
    });
}

function SHEET_normalizeCellValue_(value, header) {
  if (value === null || value === undefined) return '';
  const h = String(header || '').toLowerCase();
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    if (h === 'date') return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    if (h === 'timeslot') return Utilities.formatDate(value, tz, 'HH:mm');
    if (h === 'createdat' || h === 'updatedat' || h === 'lastlogin' || h.endsWith('at')) {
      return Utilities.formatDate(value, tz, "yyyy-MM-dd'T'HH:mm:ss");
    }
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  return String(value).trim();
}

/** Append satu row ke sheet */
function SHEET_appendRow(sheetName, rowData) {
  const sheet = SHEET_getOrCreate(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const row = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
  sheet.appendRow(row);
}

/** Update row berdasarkan key+value pencarian */
function SHEET_updateRow(sheetName, searchKey, searchValue, updateData) {
  const sheet = SHEET_getOrCreate(sheetName);
  const data = sheet.getDataRange().getValues();
  if (!data.length) return false;
  const headers = data[0].map(h => String(h || '').trim());
  const keyIndex = headers.indexOf(searchKey);
  if (keyIndex === -1) throw new Error('Kolom tidak ditemukan: ' + searchKey);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIndex]) === String(searchValue)) {
      Object.keys(updateData).forEach(key => {
        const colIndex = headers.indexOf(key);
        if (colIndex !== -1) sheet.getRange(i + 1, colIndex + 1).setValue(updateData[key]);
      });
      return true;
    }
  }
  return false;
}

// ============================================================
