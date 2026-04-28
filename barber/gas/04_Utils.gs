/**
 * 04_Utils.gs
 * Helper umum database, response, waktu, validasi, dan ID.
 */
function getSpreadsheet_() {
  if (APP_CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet tidak ditemukan. Isi APP_CONFIG.SPREADSHEET_ID atau buat Apps Script dari Google Sheet.');
  return ss;
}

function parsePayload_(e, method) {
  let payload = {};
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      payload = e.parameter || {};
      payload.raw = raw;
    }
  } else if (e && e.parameter) {
    payload = Object.assign({}, e.parameter);
    if (payload.payload) {
      try {
        payload = Object.assign(payload, JSON.parse(payload.payload));
      } catch (err) {}
    }
  }
  return payload || {};
}

function apiResponse_(data, callback) {
  const output = data && data.status ? data : Object.assign({ status: APP_CONFIG.API_OK }, data || {});
  const json = JSON.stringify(output);
  if (callback) {
    return ContentService.createTextOutput(String(callback) + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function now_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function makeId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyyMMddHHmmss');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return prefix + '-' + stamp + '-' + rand;
}

function normalizePhone_(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.indexOf('62') === 0) p = '0' + p.substring(2);
  return p;
}

function bool_(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value || '').toLowerCase();
  return ['true', '1', 'yes', 'ya', 'aktif', 'active'].indexOf(s) >= 0;
}

function number_(value, fallback) {
  const n = Number(value);
  return isNaN(n) ? (fallback || 0) : n;
}

function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet belum ada: ' + sheetName + '. Jalankan setupDatabase terlebih dahulu.');
  return sheet;
}

function getHeaders_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
}

function getRowsAsObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const headers = getHeaders_(sheetName);
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function(row, idx) {
    const obj = { _row: idx + 2 };
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function appendObject_(sheetName, obj) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
  return obj;
}

function updateRowById_(sheetName, idField, idValue, updates) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const rows = getRowsAsObjects_(sheetName);
  const found = rows.find(function(r) { return String(r[idField]) === String(idValue); });
  if (!found) throw new Error('Data tidak ditemukan: ' + sheetName + ' ' + idField + '=' + idValue);

  const current = Object.assign({}, found);
  headers.forEach(function(h, i) {
    if (updates[h] !== undefined) {
      sheet.getRange(found._row, i + 1).setValue(updates[h]);
      current[h] = updates[h];
    }
  });
  return current;
}

function findOneByField_(sheetName, fieldName, value) {
  return getRowsAsObjects_(sheetName).find(function(r) {
    return String(r[fieldName]) === String(value);
  }) || null;
}

function filterRows_(sheetName, predicate) {
  return getRowsAsObjects_(sheetName).filter(predicate);
}

function createPasswordHash_(password) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  const hash = hashPassword_(password, salt);
  return salt + '$' + hash;
}

function verifyPassword_(password, stored) {
  if (!stored || String(stored).indexOf('$') === -1) return false;
  const parts = String(stored).split('$');
  return hashPassword_(password, parts[0]) === parts[1];
}

function hashPassword_(password, salt) {
  const raw = salt + '|' + String(password || '');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function requireFields_(payload, fields) {
  fields.forEach(function(f) {
    if (payload[f] === undefined || payload[f] === null || String(payload[f]).trim() === '') {
      throw new Error('Field wajib belum diisi: ' + f);
    }
  });
}

function writeAuditLog_(user, action, entity, entityId, oldValue, newValue, notes) {
  try {
    appendObject_('AuditLogs', {
      log_id: makeId_('LOG'),
      timestamp: now_(),
      user_id: user && user.user_id ? user.user_id : '',
      role: user && user.role ? user.role : '',
      action: action || '',
      entity: entity || '',
      entity_id: entityId || '',
      old_value: oldValue ? JSON.stringify(oldValue) : '',
      new_value: newValue ? JSON.stringify(newValue) : '',
      notes: notes || ''
    });
  } catch (err) {}
}

function maskName_(name) {
  const s = String(name || '').trim();
  if (!s) return '-';
  return s.charAt(0).toUpperCase() + '****';
}

function minutesBetween_(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = new Date(String(startStr).replace(' ', 'T'));
  const end = new Date(String(endStr).replace(' ', 'T'));
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

function toDateOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value).substring(0, 10);
}

function toTimeOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'HH:mm');
  }
  return String(value).substring(0, 5);
}
