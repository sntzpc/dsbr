// ADMIN_ — Fungsi Khusus Admin
// ============================================================

function ADMIN_getSettings() {
  return ADMIN_getSettingsMap();
}

function ADMIN_getSettingsMap() {
  const rows = SHEET_readAll(CONFIG.SHEET_NAMES.SETTINGS);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
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
