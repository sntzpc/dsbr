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
  const { settings } = data; // settings = {KEY: value, ...}
  const now = new Date().toISOString();
  const sheet = SHEET_getOrCreate(CONFIG.SHEET_NAMES.SETTINGS);
  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  const updIdx = headers.indexOf('updatedAt');

  Object.keys(settings).forEach(key => {
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][keyIdx] === key) {
        sheet.getRange(i + 1, valIdx + 1).setValue(settings[key]);
        sheet.getRange(i + 1, updIdx + 1).setValue(now);
        break;
      }
    }
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
    // Update
    SHEET_updateRow(CONFIG.SHEET_NAMES.OPERATORS, 'operatorId', operatorId, {
      name, phone, speciality, photoInitial: initial
    });
  } else {
    // Create
    const newOp = {
      operatorId   : UTIL_generateId('OPR'),
      name         : name,
      phone        : phone || '',
      speciality   : speciality || '',
      isActive     : 'true',
      userId       : userId || '',
      photoInitial : initial,
      createdAt    : new Date().toISOString()
    };
    SHEET_appendRow(CONFIG.SHEET_NAMES.OPERATORS, newOp);

    // Buat akun user untuk operator jika ada userId terkait, atau buat baru
    if (!userId && phone) {
      const existingUsers = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
      if (!existingUsers.find(u => u.phone === phone)) {
        SHEET_appendRow(CONFIG.SHEET_NAMES.USERS, {
          userId   : UTIL_generateId('USR'),
          name     : name,
          phone    : phone,
          email    : '',
          password : UTIL_hashSimple('operator123'),
          role     : 'operator',
          createdAt: new Date().toISOString(),
          lastLogin: '',
          isActive : 'true'
        });
        // Simpan relasi operatorId ke user
        SHEET_updateRow(CONFIG.SHEET_NAMES.OPERATORS, 'operatorId', newOp.operatorId, { userId: newOp.operatorId });
      }
    }
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
      createdAt  : new Date().toISOString()
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


// ============================================================
