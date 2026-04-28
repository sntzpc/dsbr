/**
 * 10_Queue.gs
 * Antrian live dan aksi operator.
 */
function checkInBooking_(payload) {
  const user = requireAuth_(payload);
  requireFields_(payload, ['booking_id']);
  const booking = findOneByField_('Bookings', 'booking_id', payload.booking_id);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (user.role === USER_ROLES.CUSTOMER && String(booking.customer_id) !== String(user.user_id)) throw new Error('Akses ditolak.');
  if (String(booking.status) !== BOOKING_STATUS.BOOKED) throw new Error('Hanya booking status BOOKED yang bisa check-in.');
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, { status: BOOKING_STATUS.CHECKED_IN, updated_at: now_() });
  writeAuditLog_(user, 'CHECK_IN_BOOKING', 'Bookings', booking.booking_id, booking, updated, 'Pelanggan check-in');
  return { status: APP_CONFIG.API_OK, message: 'Check-in berhasil.', booking: cleanRow_(updated) };
}

function callCustomer_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id']);
  const booking = assertBookingAccess_(user, payload.booking_id);
  if ([BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN].indexOf(String(booking.status)) === -1) throw new Error('Booking tidak bisa dipanggil dari status: ' + booking.status);
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: BOOKING_STATUS.CALLED,
    called_at: now_(),
    updated_at: now_()
  });
  createNotificationInternal_(booking.customer_id, booking.booking_id, 'Giliran Anda Dipanggil', 'Silakan menuju operator ' + booking.operator_name + '.', 'CALL');
  writeAuditLog_(user, 'CALL_CUSTOMER', 'Bookings', booking.booking_id, booking, updated, 'Operator panggil pelanggan');
  return { status: APP_CONFIG.API_OK, message: 'Pelanggan berhasil dipanggil.', booking: cleanRow_(updated) };
}

function startService_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id']);
  const booking = assertBookingAccess_(user, payload.booking_id);
  if ([BOOKING_STATUS.CALLED, BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.BOOKED].indexOf(String(booking.status)) === -1) throw new Error('Layanan tidak bisa dimulai dari status: ' + booking.status);
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: BOOKING_STATUS.IN_SERVICE,
    started_at: now_(),
    updated_at: now_()
  });
  createNotificationInternal_(booking.customer_id, booking.booking_id, 'Layanan Dimulai', 'Layanan pangkas rambut Anda sedang dimulai.', 'START');
  writeAuditLog_(user, 'START_SERVICE', 'Bookings', booking.booking_id, booking, updated, 'Mulai layanan');
  return { status: APP_CONFIG.API_OK, message: 'Layanan berhasil dimulai.', booking: cleanRow_(updated) };
}

function finishService_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id']);
  const booking = assertBookingAccess_(user, payload.booking_id);
  if (String(booking.status) !== BOOKING_STATUS.IN_SERVICE) throw new Error('Hanya layanan IN_SERVICE yang bisa diselesaikan.');
  const finishedAt = now_();
  const duration = minutesBetween_(booking.started_at, finishedAt);
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: BOOKING_STATUS.FINISHED,
    finished_at: finishedAt,
    actual_duration_min: duration,
    payment_status: payload.payment_status || booking.payment_status || PAYMENT_STATUS.UNPAID,
    updated_at: finishedAt
  });
  createNotificationInternal_(booking.customer_id, booking.booking_id, 'Layanan Selesai', 'Terima kasih sudah menggunakan layanan kami.', 'FINISH');
  writeAuditLog_(user, 'FINISH_SERVICE', 'Bookings', booking.booking_id, booking, updated, 'Selesai layanan');
  return { status: APP_CONFIG.API_OK, message: 'Layanan berhasil diselesaikan.', booking: cleanRow_(updated) };
}

function markNoShow_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id']);
  const booking = assertBookingAccess_(user, payload.booking_id);
  if ([BOOKING_STATUS.FINISHED, BOOKING_STATUS.CANCELLED].indexOf(String(booking.status)) >= 0) throw new Error('Booking tidak bisa ditandai no-show.');
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: BOOKING_STATUS.NO_SHOW,
    no_show_at: now_(),
    updated_at: now_()
  });
  createNotificationInternal_(booking.customer_id, booking.booking_id, 'Tidak Hadir', 'Booking Anda ditandai tidak hadir.', 'NO_SHOW');
  writeAuditLog_(user, 'MARK_NO_SHOW', 'Bookings', booking.booking_id, booking, updated, 'Pelanggan tidak hadir');
  return { status: APP_CONFIG.API_OK, message: 'Booking ditandai tidak hadir.', booking: cleanRow_(updated) };
}

function getQueueLive_(payload) {
  requireAuth_(payload);
  const date = toDateOnly_(payload.booking_date || payload.date || today_());
  let bookings = getBookingsByDate_(date);
  if (payload.operator_id) bookings = bookings.filter(function(b) { return String(b.operator_id) === String(payload.operator_id); });
  bookings.sort(function(a, b) { return number_(a.queue_no) - number_(b.queue_no); });

  const inService = bookings.filter(function(b) { return String(b.status) === BOOKING_STATUS.IN_SERVICE; }).map(function(b) {
    return {
      booking_id: b.booking_id,
      queue_no: b.queue_no,
      customer_initial: maskName_(b.customer_name),
      operator_id: b.operator_id,
      operator_name: b.operator_name,
      chair_no: b.chair_no,
      started_at: b.started_at,
      running_duration_min: minutesBetween_(b.started_at, now_()),
      service_name: b.service_name
    };
  });

  const waiting = bookings.filter(function(b) { return WAITING_BOOKING_STATUSES.indexOf(String(b.status)) >= 0; });
  const finished = bookings.filter(function(b) { return String(b.status) === BOOKING_STATUS.FINISHED; });

  return {
    status: APP_CONFIG.API_OK,
    booking_date: date,
    current: inService,
    waiting_count: waiting.length,
    finished_count: finished.length,
    next_queue: waiting.length ? waiting[0].queue_no : '',
    queue: bookings.map(function(b) {
      return {
        booking_id: b.booking_id,
        queue_no: b.queue_no,
        customer_initial: maskName_(b.customer_name),
        operator_id: b.operator_id,
        operator_name: b.operator_name,
        service_name: b.service_name,
        slot_time: toTimeOnly_(b.slot_time),
        status: b.status
      };
    })
  };
}

function getCustomerActiveBooking_(payload) {
  const user = requireRole_(payload, USER_ROLES.CUSTOMER);
  const date = toDateOnly_(payload.booking_date || payload.date || today_());
  const bookings = getBookingsByDate_(date).filter(function(b) {
    return String(b.customer_id) === String(user.user_id) &&
      [BOOKING_STATUS.FINISHED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(String(b.status)) === -1;
  });
  return { status: APP_CONFIG.API_OK, booking: bookings.length ? cleanRow_(bookings[0]) : null };
}
