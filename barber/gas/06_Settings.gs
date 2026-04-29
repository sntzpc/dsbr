/**
 * 06_Settings.gs
 * Pengaturan barbershop.
 */
function getSettings_(payload) {
  const rows = getRowsAsObjects_('Settings');
  let user = null;
  try { if (payload && payload.token) user = getUserByToken_(payload.token); } catch (err) {}
  const isAdmin = user && user.role === USER_ROLES.ADMIN;
  const settings = {};
  rows.forEach(function(r) { settings[r.key] = r.value; });
  normalizeQrisSettings_(settings);

  if (!isAdmin) {
    ['tripay_api_key', 'tripay_private_key', 'tripay_merchant_code'].forEach(function(k) { delete settings[k]; });
    return { status: APP_CONFIG.API_OK, settings: settings, rows: [] };
  }

  const safeRows = rows.map(function(r) {
    const c = cleanRow_(r);
    if (c.key === 'tripay_api_key' || c.key === 'tripay_private_key') c.value_masked = maskSecret_(c.value);
    return c;
  });
  return { status: APP_CONFIG.API_OK, settings: settings, rows: safeRows };
}

function saveSettings_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  const settings = payload.settings || {};
  Object.keys(settings).forEach(function(key) {
    upsertSetting_(key, settings[key], payload.description || '', user.user_id);
  });
  writeAuditLog_(user, 'SAVE_SETTINGS', 'Settings', 'bulk', null, settings, 'Update pengaturan barbershop');
  return { status: APP_CONFIG.API_OK, message: 'Pengaturan berhasil disimpan.', settings: settings };
}

function upsertSetting_(key, value, description, updatedBy) {
  if (key === 'open_time' || key === 'close_time') value = toTimeOnly_(value);
  const existing = findOneByField_('Settings', 'key', key);
  const row = {
    key: key,
    value: value,
    description: description || (existing ? existing.description : ''),
    updated_at: now_(),
    updated_by: updatedBy || 'SYSTEM'
  };
  if (existing) return updateRowById_('Settings', 'key', key, row);
  return appendObject_('Settings', row);
}

function getSettingValue_(key, fallback) {
  const row = findOneByField_('Settings', 'key', key);
  return row && row.value !== '' && row.value !== undefined ? row.value : fallback;
}

function cleanRow_(row) {
  const copy = Object.assign({}, row);
  delete copy._row;
  Object.keys(copy).forEach(function(k) {
    var v = copy[k];
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      if (/_date$|^date$|booking_date|payment_date/i.test(k)) copy[k] = formatDateOnly_(v);
      else if (/_at$|timestamp|last_login|expires_at/i.test(k)) copy[k] = formatDateTime_(v);
      else copy[k] = formatDateTime_(v);
    } else if (/slot_time|work_start|work_end|open_time|close_time/i.test(k) && v !== '') {
      copy[k] = toTimeOnly_(v);
    } else if (/_date$|^date$|booking_date|payment_date/i.test(k) && v !== '') {
      copy[k] = toDateOnly_(v);
    } else if (/_at$|timestamp|last_login|expires_at/i.test(k) && v !== '') {
      var d = parseDateTimeValue_(v) || parseDateValue_(v);
      if (d) copy[k] = formatDateTime_(d);
    }
  });
  return copy;
}


function normalizeQrisSettings_(settings) {
  if (!settings) return settings;

  var fileId = extractDriveFileId_(settings.qris_static_file_id) ||
               extractDriveFileId_(settings.qris_static_url) ||
               extractDriveFileId_(settings.qris_url) ||
               extractDriveFileId_(settings.qris_file_id);

  if (fileId) {
    settings.qris_static_file_id = fileId;
    settings.qris_static_url = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1000';
    settings.qris_static_download_url = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fileId);
  }

  return settings;
}

function extractDriveFileId_(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;

  var decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (e) {
    decoded = raw;
  }

  var patterns = [
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
    /\/d\/([a-zA-Z0-9_-]{20,})/,
    /file\/d\/([a-zA-Z0-9_-]{20,})/,
    /open\?id=([a-zA-Z0-9_-]{20,})/,
    /thumbnail\?id=([a-zA-Z0-9_-]{20,})/,
    /uc\?export=(?:view|download)&id=([a-zA-Z0-9_-]{20,})/
  ];

  for (var i = 0; i < patterns.length; i++) {
    var m = decoded.match(patterns[i]);
    if (m && m[1]) return m[1];
  }

  return '';
}
