// OPERATOR_ — Fungsi Khusus Operator
// ============================================================

function OPERATOR_getMyQueue(data) {
  const { operatorId } = data;
  const today = UTIL_todayString();
  const queue = SHEET_readAll(CONFIG.SHEET_NAMES.QUEUE);
  return queue
    .filter(q => q.operatorId === operatorId && q.date === today && q.status !== 'cancelled')
    .sort((a, b) => parseInt(a.queueNumber) - parseInt(b.queueNumber));
}

function OPERATOR_callCustomer(data) {
  const { bookingId, seatNumber } = data;
  const now = new Date().toISOString();
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, {
    status: 'called', calledAt: now, seatNumber: seatNumber || '1'
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'called', updatedAt: now
  });
  return { success: true, calledAt: now };
}

function OPERATOR_startService(data) {
  const { bookingId } = data;
  const now = new Date().toISOString();
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, {
    status: 'in_progress', startedAt: now
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'in_progress', updatedAt: now
  });
  return { success: true, startedAt: now };
}

function OPERATOR_finishService(data) {
  const { bookingId, durationMinutes } = data;
  const now = new Date().toISOString();
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, {
    status: 'done', finishedAt: now, durationMinutes: durationMinutes || ''
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'done', updatedAt: now
  });
  return { success: true, finishedAt: now };
}


// ============================================================
