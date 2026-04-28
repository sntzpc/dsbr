/**
 * 05_Auth.gs
 * Login, register, session, dan otorisasi role.
 */
function registerCustomer_(payload) {
  requireFields_(payload, ['name', 'phone', 'password']);
  const phone = normalizePhone_(payload.phone);
  if (String(payload.password).length < 6) throw new Error('Password minimal 6 karakter.');
  if (findOneByField_('Users', 'phone', phone)) throw new Error('Nomor HP sudah terdaftar.');

  const now = now_();
  const user = appendObject_('Users', {
    user_id: makeId_('USR'),
    name: String(payload.name).trim(),
    phone: phone,
    password_hash: createPasswordHash_(payload.password),
    role: USER_ROLES.CUSTOMER,
    operator_id: '',
    active: true,
    created_at: now,
    updated_at: now,
    last_login: ''
  });
  writeAuditLog_(user, 'REGISTER_CUSTOMER', 'Users', user.user_id, null, user, 'Pelanggan daftar mandiri');
  return { status: APP_CONFIG.API_OK, message: 'Registrasi berhasil.', user: sanitizeUser_(user) };
}

function loginUser_(payload, e) {
  requireFields_(payload, ['phone', 'password']);
  const phone = normalizePhone_(payload.phone);
  const user = findOneByField_('Users', 'phone', phone);
  if (!user || !bool_(user.active)) throw new Error('Akun tidak ditemukan atau tidak aktif.');
  if (!verifyPassword_(payload.password, user.password_hash)) throw new Error('Nomor HP atau password salah.');

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const created = new Date();
  const expires = new Date(created.getTime() + APP_CONFIG.SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = appendObject_('Sessions', {
    session_id: makeId_('SES'),
    user_id: user.user_id,
    token: token,
    created_at: now_(),
    expires_at: formatDateTime_(expires),
    active: true,
    last_seen_at: now_(),
    user_agent: e && e.parameter && e.parameter.ua ? e.parameter.ua : ''
  });

  updateRowById_('Users', 'user_id', user.user_id, { last_login: now_(), updated_at: now_() });
  writeAuditLog_(user, 'LOGIN', 'Sessions', session.session_id, null, session, 'User login');

  return {
    status: APP_CONFIG.API_OK,
    message: 'Login berhasil.',
    token: token,
    user: sanitizeUser_(user)
  };
}

function logoutUser_(payload) {
  const user = requireAuth_(payload);
  const session = findOneByField_('Sessions', 'token', payload.token);
  if (session) updateRowById_('Sessions', 'session_id', session.session_id, { active: false, last_seen_at: now_() });
  writeAuditLog_(user, 'LOGOUT', 'Sessions', session ? session.session_id : '', null, null, 'User logout');
  return { status: APP_CONFIG.API_OK, message: 'Logout berhasil.' };
}

function getCurrentUser_(payload) {
  const user = requireAuth_(payload);
  return { status: APP_CONFIG.API_OK, user: sanitizeUser_(user) };
}

function requireAuth_(payload) {
  const token = payload.token || payload.session_token;
  if (!token) throw new Error('Token login tidak ditemukan.');
  const session = findOneByField_('Sessions', 'token', token);
  if (!session || !bool_(session.active)) throw new Error('Session tidak aktif. Silakan login ulang.');

  const expires = parseDateTimeValue_(session.expires_at);
  if (!expires || expires.getTime() < new Date().getTime()) {
    updateRowById_('Sessions', 'session_id', session.session_id, { active: false, last_seen_at: now_() });
    throw new Error('Session expired. Silakan login ulang.');
  }

  const user = findOneByField_('Users', 'user_id', session.user_id);
  if (!user || !bool_(user.active)) throw new Error('User tidak aktif.');
  updateRowById_('Sessions', 'session_id', session.session_id, { last_seen_at: now_() });
  return user;
}

function requireRole_(payload, roles) {
  const user = requireAuth_(payload);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (allowed.indexOf(String(user.role)) === -1) {
    throw new Error('Akses ditolak. Role dibutuhkan: ' + allowed.join(', '));
  }
  return user;
}

function sanitizeUser_(user) {
  const copy = Object.assign({}, user);
  delete copy.password_hash;
  delete copy._row;
  return copy;
}
