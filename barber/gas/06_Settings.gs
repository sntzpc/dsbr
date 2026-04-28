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
  return copy;
}
