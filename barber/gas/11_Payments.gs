/**
 * 11_Payments.gs
 * Pembayaran dan billing sederhana.
 */
function createPayment_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  requireFields_(payload, ['booking_id', 'amount', 'method']);
  const booking = findOneByField_('Bookings', 'booking_id', payload.booking_id);
  if (!booking) throw new Error('Booking tidak ditemukan.');
  if (user.role === USER_ROLES.OPERATOR && String(booking.operator_id) !== String(user.operator_id)) throw new Error('Operator hanya bisa input pembayaran order sendiri.');

  const payment = appendObject_('Payments', {
    payment_id: makeId_('PAY'),
    booking_id: booking.booking_id,
    payment_date: payload.payment_date || now_(),
    amount: number_(payload.amount, 0),
    method: payload.method,
    status: payload.status || PAYMENT_STATUS.PAID,
    notes: payload.notes || '',
    created_at: now_(),
    created_by: user.user_id
  });

  const totalPaid = getRowsAsObjects_('Payments')
    .filter(function(p) { return String(p.booking_id) === String(booking.booking_id) && String(p.status) === PAYMENT_STATUS.PAID; })
    .reduce(function(sum, p) { return sum + number_(p.amount, 0); }, 0);
  const price = number_(booking.price, 0);
  const paymentStatus = totalPaid >= price ? PAYMENT_STATUS.PAID : (totalPaid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID);
  updateRowById_('Bookings', 'booking_id', booking.booking_id, { payment_status: paymentStatus, updated_at: now_() });

  writeAuditLog_(user, 'CREATE_PAYMENT', 'Payments', payment.payment_id, null, payment, 'Input pembayaran');
  return { status: APP_CONFIG.API_OK, message: 'Pembayaran berhasil dicatat.', payment: cleanRow_(payment), payment_status: paymentStatus };
}

function listPayments_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  let rows = getRowsAsObjects_('Payments');
  if (payload.booking_id) rows = rows.filter(function(p) { return String(p.booking_id) === String(payload.booking_id); });
  if (payload.date_from) rows = rows.filter(function(p) { return toDateOnly_(p.payment_date) >= toDateOnly_(payload.date_from); });
  if (payload.date_to) rows = rows.filter(function(p) { return toDateOnly_(p.payment_date) <= toDateOnly_(payload.date_to); });

  if (user.role === USER_ROLES.OPERATOR) {
    const myBookingIds = getRowsAsObjects_('Bookings')
      .filter(function(b) { return String(b.operator_id) === String(user.operator_id); })
      .map(function(b) { return String(b.booking_id); });
    rows = rows.filter(function(p) { return myBookingIds.indexOf(String(p.booking_id)) >= 0; });
  }
  return { status: APP_CONFIG.API_OK, payments: rows.map(cleanRow_) };
}
