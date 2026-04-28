/**
 * 12_Notifications.gs
 * Notifikasi dalam aplikasi.
 */
function createNotificationInternal_(userId, bookingId, title, message, type) {
  return appendObject_('Notifications', {
    notification_id: makeId_('NTF'),
    user_id: userId,
    booking_id: bookingId || '',
    title: title || '',
    message: message || '',
    type: type || 'INFO',
    read_status: false,
    created_at: now_(),
    read_at: ''
  });
}

function listNotifications_(payload) {
  const user = requireAuth_(payload);
  let rows = getRowsAsObjects_('Notifications').filter(function(n) { return String(n.user_id) === String(user.user_id); });
  if (payload.unread_only === true || String(payload.unread_only) === 'true') {
    rows = rows.filter(function(n) { return !bool_(n.read_status); });
  }
  rows.sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  return { status: APP_CONFIG.API_OK, notifications: rows.map(cleanRow_) };
}

function markNotificationRead_(payload) {
  const user = requireAuth_(payload);
  requireFields_(payload, ['notification_id']);
  const notif = findOneByField_('Notifications', 'notification_id', payload.notification_id);
  if (!notif || String(notif.user_id) !== String(user.user_id)) throw new Error('Notifikasi tidak ditemukan.');
  const updated = updateRowById_('Notifications', 'notification_id', payload.notification_id, {
    read_status: true,
    read_at: now_()
  });
  return { status: APP_CONFIG.API_OK, message: 'Notifikasi sudah dibaca.', notification: cleanRow_(updated) };
}
