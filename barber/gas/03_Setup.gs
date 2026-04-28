/**
 * 03_Setup.gs
 * Setup database otomatis: membuat sheet, header, data awal.
 */
function setupDatabase_(payload) {
  const ss = getSpreadsheet_();
  Object.keys(DB_SCHEMA).forEach(function(sheetName) {
    ensureSheet_(ss, sheetName, DB_SCHEMA[sheetName]);
  });
  seedDefaultSettings_();
  seedDefaultServices_();
  seedDefaultAdmin_();
  return {
    status: APP_CONFIG.API_OK,
    message: 'Database berhasil disiapkan.',
    sheets: Object.keys(DB_SCHEMA),
    server_time: now_()
  };
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function(v) { return String(v || '').trim(); });

  if (currentHeaders.filter(Boolean).length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    return sheet;
  }

  const missingHeaders = headers.filter(function(h) { return currentHeaders.indexOf(h) === -1; });
  if (missingHeaders.length > 0) {
    sheet.getRange(1, currentHeaders.filter(Boolean).length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function seedDefaultSettings_() {
  const defaults = [
    ['barbershop_name', 'Karya Barber', 'Nama usaha barbershop'],
    ['address', '-', 'Alamat barbershop'],
    ['contact_phone', '-', 'Nomor kontak/WhatsApp'],
    ['open_time', '08:00', 'Jam buka'],
    ['close_time', '21:00', 'Jam tutup'],
    ['operational_days', '1,2,3,4,5,6,0', 'Hari operasional: 0=Minggu, 1=Senin, dst'],
    ['chair_count', '3', 'Jumlah kursi/barber chair'],
    ['capacity_per_chair', '15', 'Kapasitas harian per kursi'],
    ['default_service_duration_min', '30', 'Durasi standar layanan'],
    ['max_booking_per_customer_per_day', '1', 'Maksimal booking pelanggan per hari'],
    ['timezone', APP_CONFIG.TIMEZONE, 'Zona waktu aplikasi'],
    ['queue_mode', 'SLOT_AND_QUEUE', 'Mode booking: SLOT_ONLY, QUEUE_ONLY, SLOT_AND_QUEUE'],
    ['polling_seconds_customer', '15', 'Auto refresh pelanggan'],
    ['polling_seconds_operator', '10', 'Auto refresh operator'],
    ['polling_seconds_admin', '20', 'Auto refresh admin']
  ];
  defaults.forEach(function(row) {
    upsertSetting_(row[0], row[1], row[2], 'SYSTEM');
  });
}

function seedDefaultServices_() {
  const existing = getRowsAsObjects_('Services');
  if (existing.length > 0) return;
  const now = now_();
  appendObject_('Services', {
    service_id: makeId_('SV'), service_name: 'Pangkas Dewasa', duration_min: 30,
    price: 25000, active: true, description: 'Layanan pangkas rambut dewasa', created_at: now, updated_at: now
  });
  appendObject_('Services', {
    service_id: makeId_('SV'), service_name: 'Pangkas Anak', duration_min: 25,
    price: 20000, active: true, description: 'Layanan pangkas rambut anak', created_at: now, updated_at: now
  });
  appendObject_('Services', {
    service_id: makeId_('SV'), service_name: 'Pangkas + Keramas', duration_min: 45,
    price: 35000, active: true, description: 'Pangkas rambut dan keramas', created_at: now, updated_at: now
  });
}

function seedDefaultAdmin_() {
  const users = getRowsAsObjects_('Users');
  const hasAdmin = users.some(function(u) { return String(u.role) === USER_ROLES.ADMIN; });
  if (hasAdmin) return;
  const now = now_();
  appendObject_('Users', {
    user_id: makeId_('USR'),
    name: APP_CONFIG.DEFAULT_ADMIN_NAME,
    phone: normalizePhone_(APP_CONFIG.DEFAULT_ADMIN_PHONE),
    password_hash: createPasswordHash_(APP_CONFIG.DEFAULT_ADMIN_PASSWORD),
    role: USER_ROLES.ADMIN,
    operator_id: '',
    active: true,
    created_at: now,
    updated_at: now,
    last_login: ''
  });
}
