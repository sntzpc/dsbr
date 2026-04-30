// AUTH_ — Autentikasi & Manajemen User
// ============================================================

function AUTH_register(data) {
  const { name, phone, email, password } = data;
  if (!name || !phone || !password) throw new Error('Nama, nomor HP, dan password wajib diisi.');

  const users = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
  if (users.find(u => u.phone === phone)) throw new Error('Nomor HP sudah terdaftar.');
  if (email && users.find(u => u.email === email && u.email !== '')) throw new Error('Email sudah terdaftar.');

  const newUser = {
    userId    : UTIL_generateId('USR'),
    name      : name,
    phone     : phone,
    email     : email || '',
    password  : UTIL_hashSimple(password),
    role      : 'customer',
    createdAt : new Date().toISOString(),
    lastLogin : '',
    isActive  : 'true'
  };
  SHEET_appendRow(CONFIG.SHEET_NAMES.USERS, newUser);
  return { userId: newUser.userId, name: newUser.name, role: newUser.role };
}

function AUTH_login(data) {
  const { phone, password } = data;
  if (!phone || !password) throw new Error('Nomor HP dan password wajib diisi.');

  const users = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
  const user = users.find(u => u.phone === phone && u.password === UTIL_hashSimple(password) && u.isActive === 'true');
  if (!user) throw new Error('Nomor HP atau password salah.');

  SHEET_updateRow(CONFIG.SHEET_NAMES.USERS, 'userId', user.userId, { lastLogin: new Date().toISOString() });
  return {
    userId: user.userId,
    name  : user.name,
    phone : user.phone,
    email : user.email,
    role  : user.role
  };
}

function AUTH_getProfile(data) {
  const { userId } = data;
  const users = SHEET_readAll(CONFIG.SHEET_NAMES.USERS);
  const user = users.find(u => u.userId === userId);
  if (!user) throw new Error('User tidak ditemukan.');
  const { password, ...profile } = user;
  return profile;
}

function AUTH_updateProfile(data) {
  const { userId, name, email } = data;
  SHEET_updateRow(CONFIG.SHEET_NAMES.USERS, 'userId', userId, { name, email, updatedAt: new Date().toISOString() });
  return { success: true };
}


// ============================================================
