/**
 * 04_Utils.gs
 * Helper umum database, response, waktu WIB, validasi, dan ID.
 * Format database/report:
 * - Tanggal: dd/MM/yyyy
 * - Jam: HH:mm:ss
 * - DateTime: dd/MM/yyyy HH:mm:ss
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
  Object.keys(payload || {}).forEach(function(k) {
    if (typeof payload[k] === 'string') {
      var txt = payload[k].trim();
      if ((txt.charAt(0) === '{' && txt.charAt(txt.length - 1) === '}') || (txt.charAt(0) === '[' && txt.charAt(txt.length - 1) === ']')) {
        try { payload[k] = JSON.parse(txt); } catch (err) {}
      }
    }
  });
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
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'dd/MM/yyyy');
}

function formatDateOnly_(dateObj) {
  return Utilities.formatDate(dateObj, APP_CONFIG.TIMEZONE, 'dd/MM/yyyy');
}

function formatTimeOnly_(dateObj) {
  return Utilities.formatDate(dateObj, APP_CONFIG.TIMEZONE, 'HH:mm:ss');
}

function formatDateTime_(dateObj) {
  return Utilities.formatDate(dateObj, APP_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function parseDateValue_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  var s = String(value).trim();
  if (!s) return null;
  s = s.split('T')[0].split(' ')[0];

  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateTimeValue_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  var s = String(value).trim();
  if (!s) return null;

  var parts = s.split(/[ T]/);
  var d = parseDateValue_(parts[0]);
  if (!d) return null;
  var time = (parts[1] || '00:00:00').split(':');
  d.setHours(number_(time[0], 0), number_(time[1], 0), number_(time[2], 0), 0);
  return d;
}

function toDateKey_(value) {
  var d = parseDateValue_(value);
  return d ? Utilities.formatDate(d, APP_CONFIG.TIMEZONE, 'yyyyMMdd') : '';
}

function compareDate_(a, b) {
  var ak = toDateKey_(a);
  var bk = toDateKey_(b);
  if (!ak || !bk) return 0;
  return ak === bk ? 0 : (ak > bk ? 1 : -1);
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
  var start = parseDateTimeValue_(startStr);
  var end = parseDateTimeValue_(endStr);
  if (!start || !end) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

function toDateOnly_(value) {
  var d = parseDateValue_(value);
  return d ? formatDateOnly_(d) : '';
}

function toTimeOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return formatTimeOnly_(value);
  var s = String(value).trim();
  var m = s.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return '';
  return ('0' + Number(m[1])).slice(-2) + ':' + ('0' + Number(m[2])).slice(-2) + ':' + ('0' + Number(m[3] || 0)).slice(-2);
}
