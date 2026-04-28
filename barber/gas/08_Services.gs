/**
 * 08_Services.gs
 * Master layanan dan harga.
 */
function listServices_(payload) {
  requireAuth_(payload);
  let rows = getRowsAsObjects_('Services').map(cleanRow_);
  if (payload.active !== undefined) rows = rows.filter(function(r) { return bool_(r.active) === bool_(payload.active); });
  return { status: APP_CONFIG.API_OK, services: rows };
}

function saveService_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  requireFields_(payload, ['service_name', 'duration_min', 'price']);
  const now = now_();
  let service;
  if (payload.service_id) {
    const old = findOneByField_('Services', 'service_id', payload.service_id);
    if (!old) throw new Error('Layanan tidak ditemukan.');
    service = updateRowById_('Services', 'service_id', payload.service_id, {
      service_name: String(payload.service_name).trim(),
      duration_min: number_(payload.duration_min, old.duration_min),
      price: number_(payload.price, old.price),
      active: payload.active !== undefined ? bool_(payload.active) : bool_(old.active),
      description: payload.description || '',
      updated_at: now
    });
    writeAuditLog_(user, 'UPDATE_SERVICE', 'Services', payload.service_id, old, service, 'Update layanan');
  } else {
    service = appendObject_('Services', {
      service_id: makeId_('SV'),
      service_name: String(payload.service_name).trim(),
      duration_min: number_(payload.duration_min, 30),
      price: number_(payload.price, 0),
      active: payload.active !== undefined ? bool_(payload.active) : true,
      description: payload.description || '',
      created_at: now,
      updated_at: now
    });
    writeAuditLog_(user, 'CREATE_SERVICE', 'Services', service.service_id, null, service, 'Tambah layanan');
  }
  return { status: APP_CONFIG.API_OK, message: 'Layanan berhasil disimpan.', service: cleanRow_(service) };
}

function setServiceStatus_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  requireFields_(payload, ['service_id', 'active']);
  const old = findOneByField_('Services', 'service_id', payload.service_id);
  const updated = updateRowById_('Services', 'service_id', payload.service_id, { active: bool_(payload.active), updated_at: now_() });
  writeAuditLog_(user, 'SET_SERVICE_STATUS', 'Services', payload.service_id, old, updated, 'Ubah status layanan');
  return { status: APP_CONFIG.API_OK, message: 'Status layanan berhasil diubah.', service: cleanRow_(updated) };
}
