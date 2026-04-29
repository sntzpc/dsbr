/**
 * 09_Bookings.gs
 * Booking, kapasitas, dan reservasi pelanggan.
 */
function getBookingAvailability_(payload) {
  requireAuth_(payload);
  requireFields_(payload, ['booking_date']);
  const date = toDateOnly_(payload.booking_date);
  validateOperationalDate_(date);

  const service = payload.service_id ? findOneByField_('Services', 'service_id', payload.service_id) : null;
  const duration = service ? number_(service.duration_min, 30) : number_(getSettingValue_('default_service_duration_min', 30), 30);
  const operators = getActiveOperatorsForDate_(date);
  const bookings = getBookingsByDate_(date).filter(function(b) { return ACTIVE_BOOKING_STATUSES.indexOf(String(b.status)) >= 0; });

  const capacity = calculateCapacity_(date, operators, bookings);
  const slots = buildSlots_(date, operators, bookings, duration);

  return {
    status: APP_CONFIG.API_OK,
    booking_date: date,
    service_duration_min: duration,
    capacity: capacity,
    operators: operators.map(cleanRow_),
    slots: slots
  };
}

function createBooking_(payload) {
  const user = requireRole_(payload, [USER_ROLES.CUSTOMER, USER_ROLES.ADMIN]);
  requireFields_(payload, ['booking_date', 'service_id', 'slot_time']);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const date = toDateOnly_(payload.booking_date);
    validateOperationalDate_(date);

    const customer = user.role === USER_ROLES.ADMIN && payload.customer_id
      ? findOneByField_('Users', 'user_id', payload.customer_id)
      : user;
    if (!customer) throw new Error('Data pelanggan tidak ditemukan.');

    const maxPerDay = number_(getSettingValue_('max_booking_per_customer_per_day', 1), 1);
    const existingCustomerBookings = getBookingsByDate_(date).filter(function(b) {
      return String(b.customer_id) === String(customer.user_id) &&
        [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(String(b.status)) === -1;
    });
    if (existingCustomerBookings.length >= maxPerDay) {
      throw new Error('Pelanggan sudah mencapai batas booking pada tanggal tersebut.');
    }

    const service = findOneByField_('Services', 'service_id', payload.service_id);
    if (!service || !bool_(service.active)) throw new Error('Layanan tidak ditemukan atau tidak aktif.');

    const operators = getActiveOperatorsForDate_(date);
    if (operators.length === 0) throw new Error('Tidak ada operator aktif pada tanggal tersebut.');

    const requestedSlot = toTimeOnly_(payload.slot_time);
    if (!requestedSlot) throw new Error('Slot waktu tidak valid.');

    let operator = null;
    if (payload.operator_id && payload.operator_id !== 'ANY') {
      operator = operators.find(function(o) { return String(o.operator_id) === String(payload.operator_id); });
      if (!operator) throw new Error('Operator tidak tersedia.');
      assertSlotAvailable_(operator, date, requestedSlot, number_(service.duration_min, 30));
    } else {
      operator = chooseAvailableOperatorForSlot_(operators, date, requestedSlot, number_(service.duration_min, 30));
    }

    const queueNo = getNextQueueNo_(date);
    const now = now_();
    const booking = appendObject_('Bookings', {
      booking_id: makeId_('BK'),
      booking_date: date,
      queue_no: queueNo,
      customer_id: customer.user_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      service_id: service.service_id,
      service_name: service.service_name,
      operator_id: operator.operator_id,
      operator_name: operator.operator_name,
      chair_no: operator.chair_no || '',
      slot_time: requestedSlot,
      estimated_duration_min: number_(service.duration_min, 30),
      status: BOOKING_STATUS.BOOKED,
      price: number_(service.price, 0),
      payment_status: PAYMENT_STATUS.UNPAID,
      called_at: '',
      started_at: '',
      finished_at: '',
      actual_duration_min: '',
      cancelled_at: '',
      cancel_reason: '',
      no_show_at: '',
      created_at: now,
      updated_at: now,
      created_by: user.user_id
    });

    createNotificationInternal_(customer.user_id, booking.booking_id, 'Booking Berhasil', 'Nomor antrian Anda ' + queueNo + '.', 'BOOKING');
    writeAuditLog_(user, 'CREATE_BOOKING', 'Bookings', booking.booking_id, null, booking, 'Booking baru');

    return { status: APP_CONFIG.API_OK, message: 'Booking berhasil dibuat.', booking: cleanRow_(booking) };
  } finally {
    lock.releaseLock();
  }
}

function listBookings_(payload) {
  const user = requireAuth_(payload);
  let rows = getRowsAsObjects_('Bookings');
  if (payload.date || payload.booking_date) {
    const d = toDateOnly_(payload.date || payload.booking_date);
    rows = rows.filter(function(r) { return toDateOnly_(r.booking_date) === d; });
  }
  if (payload.date_from) rows = rows.filter(function(r) { return compareDate_(r.booking_date, payload.date_from) >= 0; });
  if (payload.date_to) rows = rows.filter(function(r) { return compareDate_(r.booking_date, payload.date_to) <= 0; });
  if (payload.status) rows = rows.filter(function(r) { return String(r.status) === String(payload.status); });
  if (payload.operator_id) rows = rows.filter(function(r) { return String(r.operator_id) === String(payload.operator_id); });

  if (user.role === USER_ROLES.CUSTOMER) rows = rows.filter(function(r) { return String(r.customer_id) === String(user.user_id); });
  if (user.role === USER_ROLES.OPERATOR) rows = rows.filter(function(r) { return String(r.operator_id) === String(user.operator_id); });

  rows.sort(function(a, b) { return number_(a.queue_no) - number_(b.queue_no); });
  return { status: APP_CONFIG.API_OK, bookings: rows.map(cleanRow_) };
}

function cancelBooking_(payload) {
  const user = requireAuth_(payload);
  requireFields_(payload, ['booking_id']);
  const booking = findOneByField_('Bookings', 'booking_id', payload.booking_id);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (user.role === USER_ROLES.CUSTOMER && String(booking.customer_id) !== String(user.user_id)) {
    throw new Error('Anda hanya bisa membatalkan booking milik sendiri.');
  }
  if ([BOOKING_STATUS.FINISHED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(String(booking.status)) >= 0) {
    throw new Error('Booking dengan status ini tidak bisa dibatalkan.');
  }
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: BOOKING_STATUS.CANCELLED,
    cancelled_at: now_(),
    cancel_reason: payload.cancel_reason || 'Dibatalkan',
    updated_at: now_()
  });
  createNotificationInternal_(booking.customer_id, booking.booking_id, 'Booking Dibatalkan', 'Booking nomor antrian ' + booking.queue_no + ' telah dibatalkan.', 'CANCELLED');
  writeAuditLog_(user, 'CANCEL_BOOKING', 'Bookings', booking.booking_id, booking, updated, 'Batalkan booking');
  return { status: APP_CONFIG.API_OK, message: 'Booking berhasil dibatalkan.', booking: cleanRow_(updated) };
}

function updateBookingStatus_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id', 'status']);
  const booking = assertBookingAccess_(user, payload.booking_id);
  const updated = updateRowById_('Bookings', 'booking_id', booking.booking_id, {
    status: payload.status,
    updated_at: now_()
  });
  writeAuditLog_(user, 'UPDATE_BOOKING_STATUS', 'Bookings', booking.booking_id, booking, updated, 'Update status manual');
  return { status: APP_CONFIG.API_OK, message: 'Status booking berhasil diubah.', booking: cleanRow_(updated) };
}

function getBookingsByDate_(date) {
  return getRowsAsObjects_('Bookings').filter(function(b) { return toDateOnly_(b.booking_date) === toDateOnly_(date); });
}

function validateOperationalDate_(date) {
  const d = parseDateValue_(date);
  if (!d) throw new Error('Format tanggal tidak valid. Gunakan dd/mm/yyyy.');
  const day = d.getDay();
  const operationalDays = String(getSettingValue_('operational_days', '1,2,3,4,5,6,0')).split(',').map(function(x) { return String(x).trim(); });
  if (operationalDays.indexOf(String(day)) === -1) throw new Error('Tanggal tersebut bukan hari operasional.');

  const holiday = getRowsAsObjects_('Holidays').find(function(h) {
    return toDateOnly_(h.date) === date && bool_(h.active);
  });
  if (holiday) throw new Error('Tanggal tersebut libur: ' + holiday.holiday_name);
}

function getActiveOperatorsForDate_(date) {
  return getRowsAsObjects_('Operators').filter(function(o) { return bool_(o.active); });
}

function calculateCapacity_(date, operators, bookings) {
  const chairCap = number_(getSettingValue_('chair_count', 1), 1) * number_(getSettingValue_('capacity_per_chair', 10), 10);
  const operatorCap = operators.reduce(function(sum, o) { return sum + number_(getOperatorCapacityForDate_(date, o), 0); }, 0);
  const effective = Math.min(chairCap, operatorCap || chairCap);
  const used = bookings.length;
  return {
    chair_capacity: chairCap,
    operator_capacity: operatorCap,
    effective_capacity: effective,
    used: used,
    remaining: Math.max(effective - used, 0)
  };
}

function getOperatorCapacityForDate_(date, operator) {
  const override = getRowsAsObjects_('DailyCapacity').find(function(r) {
    return toDateOnly_(r.date) === toDateOnly_(date) && String(r.operator_id) === String(operator.operator_id) && bool_(r.active);
  });
  if (override) return number_(override.capacity, 0);
  return number_(operator.daily_capacity, getSettingValue_('capacity_per_chair', 15));
}

function assertOperatorCapacityAvailable_(operator, date) {
  const count = getBookingsByDate_(date).filter(function(b) {
    return String(b.operator_id) === String(operator.operator_id) && ACTIVE_BOOKING_STATUSES.indexOf(String(b.status)) >= 0;
  }).length;
  const cap = getOperatorCapacityForDate_(date, operator);
  if (count >= cap) throw new Error('Kapasitas operator ' + operator.operator_name + ' sudah penuh.');
}

function chooseLeastBusyOperator_(operators, date) {
  let selected = null;
  let minCount = 999999;
  operators.forEach(function(o) {
    const count = getBookingsByDate_(date).filter(function(b) {
      return String(b.operator_id) === String(o.operator_id) && ACTIVE_BOOKING_STATUSES.indexOf(String(b.status)) >= 0;
    }).length;
    const cap = getOperatorCapacityForDate_(date, o);
    if (count < cap && count < minCount) {
      selected = o;
      minCount = count;
    }
  });
  if (!selected) throw new Error('Semua operator sudah penuh.');
  return selected;
}

function getNextQueueNo_(date) {
  const nums = getBookingsByDate_(date).map(function(b) { return number_(b.queue_no, 0); });
  const next = nums.length ? Math.max.apply(null, nums) + 1 : 1;
  return ('000' + next).slice(-3);
}

function buildSlots_(date, operators, bookings, durationMin) {
  const open = toTimeOnly_(getSettingValue_('open_time', '08:00:00')) || '08:00:00';
  const close = toTimeOnly_(getSettingValue_('close_time', '21:00:00')) || '21:00:00';
  const dur = Math.max(5, number_(durationMin, number_(getSettingValue_('default_service_duration_min', 30), 30)));
  const slots = [];
  operators.forEach(function(op) {
    let startMin = timeToMinutes_(toTimeOnly_(op.work_start) || open);
    const endMin = timeToMinutes_(toTimeOnly_(op.work_end) || close);
    if (endMin <= startMin) return;
    const opBookings = (bookings || []).filter(function(b) { return String(b.operator_id) === String(op.operator_id); });
    const cap = getOperatorCapacityForDate_(date, op);
    while (startMin + dur <= endMin) {
      const time = minutesToTime_(startMin);
      const hasConflict = hasSlotConflict_(opBookings, startMin, startMin + dur);
      slots.push({
        operator_id: op.operator_id,
        operator_name: op.operator_name,
        chair_no: op.chair_no || '',
        slot_time: time,
        available: !hasConflict && opBookings.length < cap
      });
      startMin += dur;
    }
  });
  return slots;
}

function hasSlotConflict_(bookings, startMin, endMin) {
  return (bookings || []).some(function(b) {
    const bStart = timeToMinutes_(toTimeOnly_(b.slot_time));
    const bDur = Math.max(5, number_(b.estimated_duration_min, number_(getSettingValue_('default_service_duration_min', 30), 30)));
    return startMin < (bStart + bDur) && bStart < endMin;
  });
}

function assertSlotAvailable_(operator, date, slotTime, durationMin) {
  const bookings = getBookingsByDate_(date).filter(function(b) {
    return String(b.operator_id) === String(operator.operator_id) && ACTIVE_BOOKING_STATUSES.indexOf(String(b.status)) >= 0;
  });
  const cap = getOperatorCapacityForDate_(date, operator);
  if (bookings.length >= cap) throw new Error('Kapasitas operator ' + operator.operator_name + ' sudah penuh.');

  const open = toTimeOnly_(getSettingValue_('open_time', '08:00:00')) || '08:00:00';
  const close = toTimeOnly_(getSettingValue_('close_time', '21:00:00')) || '21:00:00';
  const startMin = timeToMinutes_(slotTime);
  const endMin = startMin + Math.max(5, number_(durationMin, 30));
  const opStart = timeToMinutes_(toTimeOnly_(operator.work_start) || open);
  const opEnd = timeToMinutes_(toTimeOnly_(operator.work_end) || close);
  if (startMin < opStart || endMin > opEnd) throw new Error('Slot di luar jam kerja operator.');
  if (hasSlotConflict_(bookings, startMin, endMin)) throw new Error('Slot tersebut sudah dipilih pelanggan lain. Silakan pilih slot lain.');
  return true;
}

function chooseAvailableOperatorForSlot_(operators, date, slotTime, durationMin) {
  let selected = null;
  let minCount = 999999;
  operators.forEach(function(o) {
    try {
      assertSlotAvailable_(o, date, slotTime, durationMin);
      const count = getBookingsByDate_(date).filter(function(b) {
        return String(b.operator_id) === String(o.operator_id) && ACTIVE_BOOKING_STATUSES.indexOf(String(b.status)) >= 0;
      }).length;
      if (count < minCount) {
        selected = o;
        minCount = count;
      }
    } catch (err) {}
  });
  if (!selected) throw new Error('Slot tersebut sudah tidak tersedia. Silakan pilih slot lain.');
  return selected;
}

function timeToMinutes_(hhmm) {
  const parts = String(hhmm || '00:00').split(':');
  return number_(parts[0], 0) * 60 + number_(parts[1], 0);
}

function minutesToTime_(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00';
}

function assertBookingAccess_(user, bookingId) {
  const booking = findOneByField_('Bookings', 'booking_id', bookingId);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (user.role === USER_ROLES.OPERATOR && String(booking.operator_id) !== String(user.operator_id)) {
    throw new Error('Operator hanya bisa mengubah order miliknya.');
  }
  return booking;
}
