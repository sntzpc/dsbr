/**
 * 06_Settings.gs
 * Pengaturan barbershop.
 */
function getSettings_(payload) {
  const rows = getRowsAsObjects_('Settings');
  const settings = {};
  rows.forEach(function(r) { settings[r.key] = r.value; });
  return { status: APP_CONFIG.API_OK, settings: settings, rows: rows.map(cleanRow_) };
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
