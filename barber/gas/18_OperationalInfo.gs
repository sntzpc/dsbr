/**
 * 18_OperationalInfo.gs
 * Hari libur operasional dan informasi publik halaman awal.
 */
function ensureOptionalSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const headers = DB_SCHEMA[sheetName];
  if (!headers) throw new Error('Schema tidak ditemukan: ' + sheetName);
  ensureSheet_(ss, sheetName, headers);
}

function listHolidays_(payload) {
  requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  ensureOptionalSheet_('Holidays');
  var rows = getRowsAsObjects_('Holidays').map(cleanRow_);
  if (payload && payload.date_from) rows = rows.filter(function(r) { return compareDate_(r.date, payload.date_from) >= 0; });
  if (payload && payload.date_to) rows = rows.filter(function(r) { return compareDate_(r.date, payload.date_to) <= 0; });
  rows.sort(function(a, b) { return compareDate_(a.date, b.date); });
  return { status: APP_CONFIG.API_OK, holidays: rows };
}

function saveHoliday_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  ensureOptionalSheet_('Holidays');
  requireFields_(payload, ['date', 'holiday_name']);
  const date = toDateOnly_(payload.date);
  if (!date) throw new Error('Tanggal libur tidak valid.');
  const row = { date: date, holiday_name: String(payload.holiday_name || '').trim(), active: String(payload.active).toLowerCase() === 'false' ? false : true, notes: payload.notes || '', created_at: now_(), created_by: user.user_id };
  const existing = getRowsAsObjects_('Holidays').find(function(h) { return toDateOnly_(h.date) === date; });
  const saved = existing ? updateRowById_('Holidays', 'date', existing.date, row) : appendObject_('Holidays', row);
  writeAuditLog_(user, 'SAVE_HOLIDAY', 'Holidays', date, existing || null, saved, 'Simpan hari libur operasional');
  return { status: APP_CONFIG.API_OK, message: 'Hari libur berhasil disimpan.', holiday: cleanRow_(saved) };
}

function deleteHoliday_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  ensureOptionalSheet_('Holidays');
  requireFields_(payload, ['date']);
  const date = toDateOnly_(payload.date);
  const existing = getRowsAsObjects_('Holidays').find(function(h) { return toDateOnly_(h.date) === date; });
  if (!existing) throw new Error('Hari libur tidak ditemukan.');
  const updated = updateRowById_('Holidays', 'date', existing.date, { active: false, notes: (existing.notes || '') + ' | Dinonaktifkan ' + now_() });
  writeAuditLog_(user, 'DELETE_HOLIDAY', 'Holidays', date, existing, updated, 'Nonaktifkan hari libur operasional');
  return { status: APP_CONFIG.API_OK, message: 'Hari libur berhasil dinonaktifkan.', holiday: cleanRow_(updated) };
}

function listOperationalInfo_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  ensureOptionalSheet_('OperationalInfo');
  const rows = getRowsAsObjects_('OperationalInfo').map(cleanRow_).sort(function(a, b) { return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')); });
  return { status: APP_CONFIG.API_OK, infos: rows };
}

function saveOperationalInfo_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  ensureOptionalSheet_('OperationalInfo');
  requireFields_(payload, ['title', 'message']);
  const stamp = now_();
  const row = { info_id: payload.info_id || makeId_('INF'), title: String(payload.title || '').trim(), message: String(payload.message || '').trim(), active: String(payload.active).toLowerCase() === 'true', date_from: payload.date_from ? toDateOnly_(payload.date_from) : '', date_to: payload.date_to ? toDateOnly_(payload.date_to) : '', priority: payload.priority || 'NORMAL', updated_at: stamp, updated_by: user.user_id };
  const existing = payload.info_id ? findOneByField_('OperationalInfo', 'info_id', payload.info_id) : null;
  let saved;
  if (existing) saved = updateRowById_('OperationalInfo', 'info_id', payload.info_id, row);
  else { row.created_at = stamp; row.created_by = user.user_id; saved = appendObject_('OperationalInfo', row); }
  writeAuditLog_(user, 'SAVE_OPERATIONAL_INFO', 'OperationalInfo', row.info_id, existing || null, saved, 'Simpan informasi publik');
  return { status: APP_CONFIG.API_OK, message: 'Informasi berhasil disimpan.', info: cleanRow_(saved) };
}

function deleteOperationalInfo_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  ensureOptionalSheet_('OperationalInfo');
  requireFields_(payload, ['info_id']);
  const existing = findOneByField_('OperationalInfo', 'info_id', payload.info_id);
  if (!existing) throw new Error('Informasi tidak ditemukan.');
  const updated = updateRowById_('OperationalInfo', 'info_id', payload.info_id, { active: false, updated_at: now_(), updated_by: user.user_id });
  writeAuditLog_(user, 'DELETE_OPERATIONAL_INFO', 'OperationalInfo', payload.info_id, existing, updated, 'Nonaktifkan informasi publik');
  return { status: APP_CONFIG.API_OK, message: 'Informasi berhasil dinonaktifkan.', info: cleanRow_(updated) };
}

function getPublicOperationalInfo_(payload) {
  ensureOptionalSheet_('OperationalInfo');
  const today = today_();
  const rows = getRowsAsObjects_('OperationalInfo').filter(function(r) {
    if (!bool_(r.active)) return false;
    if (r.date_from && compareDate_(today, r.date_from) < 0) return false;
    if (r.date_to && compareDate_(today, r.date_to) > 0) return false;
    return true;
  }).map(cleanRow_).sort(function(a, b) {
    const pr = { URGENT: 3, HIGH: 2, NORMAL: 1 };
    return (pr[String(b.priority || 'NORMAL').toUpperCase()] || 1) - (pr[String(a.priority || 'NORMAL').toUpperCase()] || 1) || String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
  });
  return { status: APP_CONFIG.API_OK, info: rows[0] || null };
}
