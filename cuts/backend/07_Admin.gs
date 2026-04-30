// ADMIN_ — Fungsi Khusus Admin
// ============================================================

function ADMIN_getSettings() {
  return ADMIN_getSettingsMap();
}

function ADMIN_getSettingsMap() {
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SETTINGS);
  const values = sheet.getDataRange().getValues();
  const map = Object.assign({}, CONFIG.DEFAULT_SETTINGS);
  if (values.length < 2) return ADMIN_normalizeSettings_(map);

  const headers = values[0].map(h => String(h || '').trim());
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  if (keyIdx === -1 || valIdx === -1) return ADMIN_normalizeSettings_(map);

  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][keyIdx] || '').trim();
    if (!key) continue;
    map[key] = values[i][valIdx];
  }

  // Kompatibilitas untuk nama setting lama jika pernah dipakai di versi sebelumnya.
  const aliases = {
    openHour: 'OPEN_HOUR', open_time: 'OPEN_HOUR', jamBuka: 'OPEN_HOUR', JAM_BUKA: 'OPEN_HOUR',
    closeHour: 'CLOSE_HOUR', close_time: 'CLOSE_HOUR', jamTutup: 'CLOSE_HOUR', JAM_TUTUP: 'CLOSE_HOUR',
    slotDuration: 'SLOT_DURATION_MIN', slotDurationMin: 'SLOT_DURATION_MIN', durasiSlot: 'SLOT_DURATION_MIN', DURASI_SLOT: 'SLOT_DURATION_MIN',
    seats: 'SEATS', jumlahKursi: 'SEATS', JUMLAH_KURSI: 'SEATS',
    maxCapacityDay: 'MAX_CAPACITY_DAY', kapasitasHarian: 'MAX_CAPACITY_DAY', KAPASITAS_HARIAN: 'MAX_CAPACITY_DAY'
  };
  Object.keys(aliases).forEach(oldKey => {
    if (map[oldKey] !== undefined && map[oldKey] !== '') map[aliases[oldKey]] = map[oldKey];
  });

  return ADMIN_normalizeSettings_(map);
}

function ADMIN_normalizeSettings_(map) {
  const out = Object.assign({}, CONFIG.DEFAULT_SETTINGS, map || {});
  out.OPEN_HOUR = ADMIN_normalizeTime_(out.OPEN_HOUR, CONFIG.DEFAULT_SETTINGS.OPEN_HOUR);
  out.CLOSE_HOUR = ADMIN_normalizeTime_(out.CLOSE_HOUR, CONFIG.DEFAULT_SETTINGS.CLOSE_HOUR);
  out.SLOT_DURATION_MIN = ADMIN_positiveInt_(out.SLOT_DURATION_MIN, CONFIG.DEFAULT_SETTINGS.SLOT_DURATION_MIN, 5);
  out.MAX_CAPACITY_DAY = ADMIN_positiveInt_(out.MAX_CAPACITY_DAY, CONFIG.DEFAULT_SETTINGS.MAX_CAPACITY_DAY, 1);
  out.SEATS = ADMIN_positiveInt_(out.SEATS, CONFIG.DEFAULT_SETTINGS.SEATS, 1);
  return out;
}

function ADMIN_positiveInt_(value, fallback, min) {
  const n = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) || n < min ? fallback : n;
}

function ADMIN_normalizeTime_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'HH:mm');
  }
  let s = String(value).trim();

  // Contoh Date.toString(): Sat Dec 30 1899 08:00:00 GMT+0700 ...
  let m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];

  // Format serial time-only Google Sheets: 0.333333 = 08:00.
  const num = Number(s.replace(',', '.'));
  if (!isNaN(num) && num >= 0 && num < 1) {
    const total = Math.round(num * 24 * 60);
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  return fallback;
}
function ADMIN_saveSettings(data) {
  const { settings } = data;
  const now = UTIL_nowIso_();
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SETTINGS);
  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  const updIdx = headers.indexOf('updatedAt');

  Object.keys(settings).forEach(key => {
    let found = false;
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][keyIdx] === key) {
        sheet.getRange(i + 1, valIdx + 1).setValue(settings[key]);
        if (updIdx !== -1) sheet.getRange(i + 1, updIdx + 1).setValue(now);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, settings[key], key, now]);
  });
  return { success: true };
}

function ADMIN_getOperators() {
  return SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS).filter(o => o.isActive === 'true');
}

function ADMIN_saveOperator(data) {
  const { operatorId, name, phone, speciality, userId } = data;
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (operatorId) {
    SHEET_updateRow(CONFIG.SHEET_NAMES.OPERATORS, 'operatorId', operatorId, {
      name, phone, speciality, photoInitial: initial, userId: userId || ''
    });
  } else {
    const newOperatorId = UTIL_generateId('OPR');
    let linkedUserId = userId || '';

    if (!linkedUserId && phone) {
      const existingUsers = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
      const existing = existingUsers.find(u => u.phone === phone);
      if (existing) {
        linkedUserId = existing.userId;
      } else {
        linkedUserId = UTIL_generateId('USR');
        SHEET_appendRow(CONFIG.SHEET_NAMES.USERS, {
          userId   : linkedUserId,
          name     : name,
          phone    : phone,
          email    : '',
          password : UTIL_hashSimple('operator123'),
          role     : 'operator',
          createdAt: UTIL_nowIso_(),
          lastLogin: '',
          isActive : 'true'
        });
      }
    }

    SHEET_appendRow(CONFIG.SHEET_NAMES.OPERATORS, {
      operatorId   : newOperatorId,
      name         : name,
      phone        : phone || '',
      speciality   : speciality || '',
      isActive     : 'true',
      userId       : linkedUserId,
      photoInitial : initial,
      createdAt    : UTIL_nowIso_()
    });
  }
  return { success: true };
}

function ADMIN_deleteOperator(data) {
  const { operatorId } = data;
  SHEET_updateRow(CONFIG.SHEET_NAMES.OPERATORS, 'operatorId', operatorId, { isActive: 'false' });
  return { success: true };
}

function ADMIN_getServices() {
  return SHEET_readAll(CONFIG.SHEET_NAMES.SERVICES).filter(s => s.isActive === 'true');
}

function ADMIN_saveService(data) {
  const { serviceId, name, price, durationMin } = data;
  if (serviceId) {
    SHEET_updateRow(CONFIG.SHEET_NAMES.SERVICES, 'serviceId', serviceId, { name, price, durationMin });
  } else {
    SHEET_appendRow(CONFIG.SHEET_NAMES.SERVICES, {
      serviceId  : UTIL_generateId('SVC'),
      name       : name,
      price      : price,
      durationMin: durationMin,
      isActive   : 'true',
      createdAt  : UTIL_nowIso_()
    });
  }
  return { success: true };
}

function ADMIN_deleteService(data) {
  const { serviceId } = data;
  SHEET_updateRow(CONFIG.SHEET_NAMES.SERVICES, 'serviceId', serviceId, { isActive: 'false' });
  return { success: true };
}

function ADMIN_getAllUsers() {
  const users = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
  return users.map(u => { const { password, ...rest } = u; return rest; });
}

function ADMIN_getAllBookings(data) {
  const { date, startDate, endDate } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  if (date) return bookings.filter(b => b.date === date);
  if (startDate && endDate) return bookings.filter(b => b.date >= startDate && b.date <= endDate);
  return bookings;
}

function ADMIN_getMonthlyCalendar(data) {
  const year = parseInt(data.year, 10);
  const month = parseInt(data.month, 10); // 1-12
  if (!year || !month) throw new Error('Tahun dan bulan wajib diisi.');

  const monthStr = String(month).padStart(2, '0');
  const prefix = year + '-' + monthStr + '-';
  const operatorId = data.operatorId || (data.userId || data.phone ? OPERATOR_resolveOperatorId_(data) : '');
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS)
    .filter(b => b.date && b.date.indexOf(prefix) === 0 && b.status !== 'cancelled')
    .filter(b => !operatorId || b.operatorId === operatorId)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.timeSlot || '').localeCompare(String(b.timeSlot || '')));

  const days = {};
  bookings.forEach(b => {
    if (!days[b.date]) days[b.date] = { date: b.date, total: 0, waiting: 0, called: 0, in_progress: 0, done: 0, bookings: [] };
    days[b.date].total += 1;
    const st = b.status || 'waiting';
    if (days[b.date][st] !== undefined) days[b.date][st] += 1;
    days[b.date].bookings.push({
      bookingId    : b.bookingId,
      customerName : b.customerName,
      phone        : b.phone,
      date         : b.date,
      timeSlot     : b.timeSlot || '',
      operatorId   : b.operatorId,
      operatorName : b.operatorName,
      serviceName  : b.serviceName,
      queueNumber  : b.queueNumber,
      status       : b.status,
      notes        : b.notes || ''
    });
  });

  return { year: year, month: month, days: days };
}

// ============================================================
