/**
 * 07_Operators.gs
 * Master operator/pemangkas.
 */
function listOperators_(payload) {
  const user = requireAuth_(payload);
  let rows = getRowsAsObjects_('Operators').map(cleanRow_);
  if (payload.active !== undefined) {
    rows = rows.filter(function(r) { return bool_(r.active) === bool_(payload.active); });
  }
  return { status: APP_CONFIG.API_OK, operators: rows };
}

function saveOperator_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  requireFields_(payload, ['operator_name', 'phone']);
  const now = now_();
  const phone = normalizePhone_(payload.phone);

  let operatorId = payload.operator_id || '';
  let operator;

  if (operatorId) {
    const old = findOneByField_('Operators', 'operator_id', operatorId);
    if (!old) throw new Error('Operator tidak ditemukan.');
    operator = updateRowById_('Operators', 'operator_id', operatorId, {
      operator_name: String(payload.operator_name).trim(),
      phone: phone,
      active: payload.active !== undefined ? bool_(payload.active) : bool_(old.active),
      chair_no: payload.chair_no || old.chair_no || '',
      daily_capacity: payload.daily_capacity || old.daily_capacity || '',
      work_start: toTimeOnly_(payload.work_start || old.work_start || ''),
      work_end: toTimeOnly_(payload.work_end || old.work_end || ''),
      commission_type: payload.commission_type || old.commission_type || '',
      commission_value: payload.commission_value || old.commission_value || '',
      notes: payload.notes || '',
      updated_at: now
    });
    writeAuditLog_(user, 'UPDATE_OPERATOR', 'Operators', operatorId, old, operator, 'Update operator');
  } else {
    operatorId = makeId_('OPR');
    operator = appendObject_('Operators', {
      operator_id: operatorId,
      user_id: '',
      operator_name: String(payload.operator_name).trim(),
      phone: phone,
      active: payload.active !== undefined ? bool_(payload.active) : true,
      chair_no: payload.chair_no || '',
      daily_capacity: payload.daily_capacity || getSettingValue_('capacity_per_chair', 15),
      work_start: toTimeOnly_(payload.work_start || getSettingValue_('open_time', '08:00:00')),
      work_end: toTimeOnly_(payload.work_end || getSettingValue_('close_time', '21:00:00')),
      commission_type: payload.commission_type || '',
      commission_value: payload.commission_value || '',
      notes: payload.notes || '',
      created_at: now,
      updated_at: now
    });
    writeAuditLog_(user, 'CREATE_OPERATOR', 'Operators', operatorId, null, operator, 'Tambah operator');
  }

  if (payload.create_login === true || String(payload.create_login) === 'true') {
    ensureOperatorUser_(operator, payload.password || 'operator123');
  }

  return { status: APP_CONFIG.API_OK, message: 'Operator berhasil disimpan.', operator: cleanRow_(operator) };
}

function ensureOperatorUser_(operator, defaultPassword) {
  const phone = normalizePhone_(operator.phone);
  let user = findOneByField_('Users', 'phone', phone);
  if (user) {
    updateRowById_('Users', 'user_id', user.user_id, { role: USER_ROLES.OPERATOR, operator_id: operator.operator_id, updated_at: now_() });
    updateRowById_('Operators', 'operator_id', operator.operator_id, { user_id: user.user_id, updated_at: now_() });
    return user;
  }
  user = appendObject_('Users', {
    user_id: makeId_('USR'),
    name: operator.operator_name,
    phone: phone,
    password_hash: createPasswordHash_(defaultPassword),
    role: USER_ROLES.OPERATOR,
    operator_id: operator.operator_id,
    active: true,
    created_at: now_(),
    updated_at: now_(),
    last_login: ''
  });
  updateRowById_('Operators', 'operator_id', operator.operator_id, { user_id: user.user_id, updated_at: now_() });
  return user;
}

function setOperatorStatus_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  requireFields_(payload, ['operator_id', 'active']);
  const old = findOneByField_('Operators', 'operator_id', payload.operator_id);
  const updated = updateRowById_('Operators', 'operator_id', payload.operator_id, {
    active: bool_(payload.active),
    updated_at: now_()
  });
  writeAuditLog_(user, 'SET_OPERATOR_STATUS', 'Operators', payload.operator_id, old, updated, 'Ubah status operator');
  return { status: APP_CONFIG.API_OK, message: 'Status operator berhasil diubah.', operator: cleanRow_(updated) };
}
