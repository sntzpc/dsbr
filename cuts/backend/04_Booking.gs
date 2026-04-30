// BOOKING_ — Manajemen Reservasi
// ============================================================

function BOOKING_create(data) {
  const { userId, customerName, phone, date, timeSlot, operatorId, serviceId, notes } = data;
  if (!date || !operatorId || !serviceId || !timeSlot) {
    throw new Error('Tanggal, operator, jam pelayanan, dan layanan wajib diisi.');
  }

  const settings = ADMIN_getSettingsMap();
  const maxPerDay = parseInt(settings.MAX_CAPACITY_DAY, 10) || 50;

  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const todayBookings = bookings.filter(b => b.date === date && b.status !== 'cancelled');
  if (todayBookings.length >= maxPerDay) throw new Error('Kapasitas harian sudah penuh.');

  const userBookingToday = todayBookings.find(b => b.userId === userId && ['waiting','called','in_progress'].indexOf(b.status) !== -1);
  if (userBookingToday) throw new Error('Anda sudah memiliki booking aktif di tanggal ini.');

  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS);
  const operator = operators.find(o => o.operatorId === operatorId && String(o.isActive).toLowerCase() === 'true');
  if (!operator) throw new Error('Operator tidak ditemukan atau tidak aktif.');

  const services = SHEET_readAll(CONFIG.SHEET_NAMES.SERVICES);
  const service = services.find(s => s.serviceId === serviceId && String(s.isActive).toLowerCase() === 'true');
  if (!service) throw new Error('Layanan tidak ditemukan atau tidak aktif.');

  const availableMap = BOOKING_getSlotAvailabilityMap_(date, operatorId, settings, todayBookings);
  if (!availableMap[timeSlot] || availableMap[timeSlot].available <= 0) {
    throw new Error('Jam pelayanan ' + timeSlot + ' sudah penuh. Silakan pilih jam lain.');
  }

  // Nomor Order adalah nomor transaksi/booking, bukan urutan pelayanan.
  // Urutan pelayanan tetap ditentukan oleh timeSlot yang dipilih pelanggan.
  const orderNumber = BOOKING_nextOrderNumber_(todayBookings);
  const queueNumber = orderNumber; // legacy: dipertahankan agar sheet lama tetap kompatibel
  const bookingId = UTIL_generateId('BKG');
  const now = UTIL_nowIso_();

  const booking = {
    bookingId    : bookingId,
    userId       : userId || '',
    customerName : customerName,
    phone        : phone,
    date         : date,
    timeSlot     : timeSlot,
    operatorId   : operatorId,
    operatorName : operator.name,
    serviceId    : serviceId,
    serviceName  : service.name,
    price        : service.price,
    queueNumber  : queueNumber,
    orderNumber  : orderNumber,
    status       : 'waiting',
    notes        : notes || '',
    createdAt    : now,
    updatedAt    : now
  };
  SHEET_appendRow(CONFIG.SHEET_NAMES.BOOKINGS, booking);

  const queueEntry = {
    queueId        : UTIL_generateId('QUE'),
    bookingId      : bookingId,
    date           : date,
    timeSlot       : timeSlot,
    queueNumber    : queueNumber,
    orderNumber    : orderNumber,
    userId         : userId || '',
    customerName   : customerName,
    operatorId     : operatorId,
    operatorName   : operator.name,
    serviceId      : serviceId,
    serviceName    : service.name,
    status         : 'waiting',
    calledAt       : '',
    startedAt      : '',
    finishedAt     : '',
    durationMinutes: '',
    seatNumber     : ''
  };
  SHEET_appendRow(CONFIG.SHEET_NAMES.QUEUE, queueEntry);

  return { bookingId, queueNumber, orderNumber, operatorName: operator.name, serviceName: service.name, timeSlot: timeSlot, date: date };
}

function BOOKING_nextOrderNumber_(todayBookings) {
  let maxNo = 0;
  (todayBookings || []).forEach(b => {
    const n = BOOKING_getOrderNumber_(b);
    if (n > maxNo) maxNo = n;
  });
  return maxNo + 1;
}

function BOOKING_getOrderNumber_(row) {
  return parseInt((row && (row.orderNumber || row.queueNumber)) || 0, 10) || 0;
}

function BOOKING_getByUser(data) {
  const { userId } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  return bookings.filter(b => b.userId === userId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function BOOKING_getByDate(data) {
  const { date } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  return bookings.filter(b => b.date === date && b.status !== 'cancelled')
    .sort((a, b) => String(a.timeSlot || '').localeCompare(String(b.timeSlot || '')) || BOOKING_getOrderNumber_(a) - BOOKING_getOrderNumber_(b));
}

function BOOKING_cancel(data) {
  const { bookingId, userId } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const booking = bookings.find(b => b.bookingId === bookingId);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (booking.userId !== userId) throw new Error('Tidak diizinkan membatalkan booking ini.');
  if (booking.status !== 'waiting') throw new Error('Booking tidak dapat dibatalkan.');

  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'cancelled', updatedAt: UTIL_nowIso_()
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, { status: 'cancelled' });
  return { success: true };
}

function BOOKING_getDailySlots(data) {
  const { date } = data;
  const settings = ADMIN_getSettingsMap();
  const maxCapacity = parseInt(settings.MAX_CAPACITY_DAY, 10) || 50;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const todayBookings = bookings.filter(b => b.date === date && b.status !== 'cancelled');

  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS).filter(o => String(o.isActive).toLowerCase() === 'true');
  const perOperatorCap = BOOKING_operatorCapacity_(settings);

  const operatorSlots = operators.map(op => {
    const opBookings = todayBookings.filter(b => b.operatorId === op.operatorId);
    const slots = BOOKING_getSlotAvailability_(date, op.operatorId, settings, todayBookings);
    const available = slots.reduce((sum, s) => sum + s.available, 0);
    return {
      operatorId  : op.operatorId,
      operatorName: op.name,
      initial     : op.photoInitial || (op.name ? op.name.charAt(0).toUpperCase() : '?'),
      booked      : opBookings.length,
      capacity    : perOperatorCap,
      available   : Math.max(0, available),
      slots       : slots
    };
  });

  return {
    date          : date,
    totalBooked   : todayBookings.length,
    maxCapacity   : maxCapacity,
    remainingSlots: Math.max(0, maxCapacity - todayBookings.length),
    settings      : ADMIN_normalizeSettings_(settings),
    operators     : operatorSlots
  };
}

function BOOKING_getSlotAvailability_(date, operatorId, settings, todayBookings) {
  const slotTimes = BOOKING_generateTimeSlots_(settings);
  const perTimeCap = BOOKING_getPerTimeCapacity_(settings);
  const bookedByTime = {};
  todayBookings
    .filter(b => b.operatorId === operatorId)
    .forEach(b => {
      const key = b.timeSlot || '';
      if (!key) return;
      bookedByTime[key] = (bookedByTime[key] || 0) + 1;
    });

  return slotTimes.map(time => {
    const booked = bookedByTime[time] || 0;
    return {
      time     : time,
      booked   : booked,
      capacity : perTimeCap,
      available: Math.max(0, perTimeCap - booked),
      isFull   : booked >= perTimeCap
    };
  });
}

function BOOKING_getSlotAvailabilityMap_(date, operatorId, settings, todayBookings) {
  const map = {};
  BOOKING_getSlotAvailability_(date, operatorId, settings, todayBookings).forEach(s => map[s.time] = s);
  return map;
}

function BOOKING_generateTimeSlots_(settings) {
  const normalized = ADMIN_normalizeSettings_(settings || {});
  const open = normalized.OPEN_HOUR || CONFIG.DEFAULT_SETTINGS.OPEN_HOUR;
  const close = normalized.CLOSE_HOUR || CONFIG.DEFAULT_SETTINGS.CLOSE_HOUR;
  const dur = Math.max(5, parseInt(normalized.SLOT_DURATION_MIN, 10) || 30);
  const start = BOOKING_timeToMinutes_(open);
  let end = BOOKING_timeToMinutes_(close);

  // Jika close <= open, biasanya karena nilai Time di Sheet terbaca rusak.
  // Gunakan fallback default agar operator tidak tampil "Penuh" palsu.
  if (end <= start) {
    const defaultEnd = BOOKING_timeToMinutes_(CONFIG.DEFAULT_SETTINGS.CLOSE_HOUR);
    end = defaultEnd > start ? defaultEnd : start + (8 * 60);
  }

  const slots = [];
  for (let m = start; m < end; m += dur) {
    slots.push(BOOKING_minutesToTime_(m));
  }
  return slots;
}

function BOOKING_getPerTimeCapacity_(settings) {
  const normalized = ADMIN_normalizeSettings_(settings || {});
  return Math.max(1, parseInt(normalized.SEATS, 10) || 1);
}

function BOOKING_operatorCapacity_(settings) {
  return BOOKING_generateTimeSlots_(settings).length * BOOKING_getPerTimeCapacity_(settings);
}

function BOOKING_timeToMinutes_(hhmm) {
  const time = ADMIN_normalizeTime_(hhmm, '00:00');
  const parts = String(time || '00:00').split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function BOOKING_minutesToTime_(minutes) {
  const safe = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ============================================================
