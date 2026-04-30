// BOOKING_ — Manajemen Reservasi
// ============================================================

function BOOKING_create(data) {
  const { userId, customerName, phone, date, timeSlot, operatorId, serviceId, notes } = data;
  if (!date || !operatorId || !serviceId) throw new Error('Tanggal, operator, dan layanan wajib diisi.');

  const settings = ADMIN_getSettingsMap();
  const maxPerDay = parseInt(settings.MAX_CAPACITY_DAY) || 50;

  // Cek kapasitas harian
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const todayBookings = bookings.filter(b => b.date === date && b.status !== 'cancelled');
  if (todayBookings.length >= maxPerDay) throw new Error('Kapasitas harian sudah penuh.');

  // Cek duplikat booking user di hari yang sama
  const userBookingToday = todayBookings.find(b => b.userId === userId);
  if (userBookingToday) throw new Error('Anda sudah memiliki booking di tanggal ini.');

  // Ambil info operator & service
  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS);
  const operator = operators.find(o => o.operatorId === operatorId);
  if (!operator) throw new Error('Operator tidak ditemukan.');

  const services = SHEET_readAll(CONFIG.SHEET_NAMES.SERVICES);
  const service = services.find(s => s.serviceId === serviceId);
  if (!service) throw new Error('Layanan tidak ditemukan.');

  // Hitung nomor antrian untuk operator di tanggal tersebut
  const operatorBookings = todayBookings.filter(b => b.operatorId === operatorId);
  const queueNumber = operatorBookings.length + 1;

  const bookingId = UTIL_generateId('BKG');
  const now = new Date().toISOString();

  const booking = {
    bookingId    : bookingId,
    userId       : userId || '',
    customerName : customerName,
    phone        : phone,
    date         : date,
    timeSlot     : timeSlot || '',
    operatorId   : operatorId,
    operatorName : operator.name,
    serviceId    : serviceId,
    serviceName  : service.name,
    price        : service.price,
    queueNumber  : queueNumber,
    status       : 'waiting',
    notes        : notes || '',
    createdAt    : now,
    updatedAt    : now
  };
  SHEET_appendRow(CONFIG.SHEET_NAMES.BOOKINGS, booking);

  // Tambah ke queue
  const queueEntry = {
    queueId        : UTIL_generateId('QUE'),
    bookingId      : bookingId,
    date           : date,
    queueNumber    : queueNumber,
    userId         : userId || '',
    customerName   : customerName,
    operatorId     : operatorId,
    operatorName   : operator.name,
    status         : 'waiting',
    calledAt       : '',
    startedAt      : '',
    finishedAt     : '',
    durationMinutes: '',
    seatNumber     : ''
  };
  SHEET_appendRow(CONFIG.SHEET_NAMES.QUEUE, queueEntry);

  return { bookingId, queueNumber, operatorName: operator.name, serviceName: service.name };
}

function BOOKING_getByUser(data) {
  const { userId } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  return bookings.filter(b => b.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function BOOKING_getByDate(data) {
  const { date } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  return bookings.filter(b => b.date === date && b.status !== 'cancelled');
}

function BOOKING_cancel(data) {
  const { bookingId, userId } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const booking = bookings.find(b => b.bookingId === bookingId);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (booking.userId !== userId) throw new Error('Tidak diizinkan membatalkan booking ini.');
  if (booking.status !== 'waiting') throw new Error('Booking tidak dapat dibatalkan.');

  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'cancelled', updatedAt: new Date().toISOString()
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, { status: 'cancelled' });
  return { success: true };
}

function BOOKING_getDailySlots(data) {
  const { date } = data;
  const settings = ADMIN_getSettingsMap();
  const maxCapacity = parseInt(settings.MAX_CAPACITY_DAY) || 50;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS);
  const todayBookings = bookings.filter(b => b.date === date && b.status !== 'cancelled');

  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS).filter(o => o.isActive === 'true');
  const operatorSlots = operators.map(op => {
    const opBookings = todayBookings.filter(b => b.operatorId === op.operatorId);
    return {
      operatorId  : op.operatorId,
      operatorName: op.name,
      initial     : op.photoInitial || op.name.charAt(0).toUpperCase(),
      booked      : opBookings.length,
      available   : Math.max(0, maxCapacity - opBookings.length)
    };
  });

  return {
    date          : date,
    totalBooked   : todayBookings.length,
    maxCapacity   : maxCapacity,
    remainingSlots: Math.max(0, maxCapacity - todayBookings.length),
    operators     : operatorSlots
  };
}


// ============================================================
