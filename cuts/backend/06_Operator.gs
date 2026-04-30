// OPERATOR_ — Fungsi Khusus Operator
// ============================================================

function OPERATOR_getMyQueue(data) {
  const resolvedOperatorId = OPERATOR_resolveOperatorId_(data);
  if (!resolvedOperatorId) return [];
  const today = data.date || UTIL_todayString();
  const queue = SHEET_readAll(CONFIG.SHEET_NAMES.QUEUE);
  return queue
    .filter(q => q.operatorId === resolvedOperatorId && q.date === today && q.status !== 'cancelled')
    .sort((a, b) => String(a.timeSlot || '').localeCompare(String(b.timeSlot || '')) || OPERATOR_getOrderNumber_(a) - OPERATOR_getOrderNumber_(b))
    .map(q => Object.assign({}, q, { orderNumber: q.orderNumber || q.queueNumber }));
}

function OPERATOR_resolveOperatorId_(data) {
  if (data.operatorId) return data.operatorId;
  const userId = data.userId || '';
  const phone = data.phone || '';
  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS).filter(o => o.isActive === 'true');
  const op = operators.find(o => (userId && o.userId === userId) || (phone && o.phone === phone));
  return op ? op.operatorId : '';
}

function OPERATOR_callCustomer(data) {
  const { bookingId, seatNumber } = data;
  const now = UTIL_nowIso_();
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
  const now = UTIL_nowIso_();
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
  const now = UTIL_nowIso_();
  const queue = SHEET_readAll(CONFIG.SHEET_NAMES.QUEUE);
  const entry = queue.find(q => q.bookingId === bookingId);
  let finalDuration = durationMinutes || '';
  if (!finalDuration && entry && entry.startedAt) {
    const start = new Date(entry.startedAt).getTime();
    const finish = new Date(now).getTime();
    if (!isNaN(start) && !isNaN(finish) && finish >= start) {
      finalDuration = Math.max(1, Math.round((finish - start) / 60000));
    }
  }
  SHEET_updateRow(CONFIG.SHEET_NAMES.QUEUE, 'bookingId', bookingId, {
    status: 'done', finishedAt: now, durationMinutes: finalDuration || ''
  });
  SHEET_updateRow(CONFIG.SHEET_NAMES.BOOKINGS, 'bookingId', bookingId, {
    status: 'done', updatedAt: now
  });
  return { success: true, finishedAt: now };
}

// ============================================================

function OPERATOR_getOrderNumber_(row) {
  return parseInt((row && (row.orderNumber || row.queueNumber)) || 0, 10) || 0;
}
