/**
 * 13_Reports.gs
 * Dashboard dan laporan.
 */
function getDashboardAdmin_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  const date = toDateOnly_(payload.date || payload.booking_date || today_());
  const bookings = getBookingsByDate_(date);
  const summary = summarizeBookings_(bookings);
  return { status: APP_CONFIG.API_OK, date: date, summary: summary };
}

function getDashboardOperator_(payload) {
  const user = requireRole_(payload, USER_ROLES.OPERATOR);
  const date = toDateOnly_(payload.date || payload.booking_date || today_());
  const bookings = getBookingsByDate_(date).filter(function(b) { return String(b.operator_id) === String(user.operator_id); });
  return { status: APP_CONFIG.API_OK, date: date, summary: summarizeBookings_(bookings), bookings: bookings.map(cleanRow_) };
}

function getDashboardCustomer_(payload) {
  const user = requireRole_(payload, USER_ROLES.CUSTOMER);
  const date = toDateOnly_(payload.date || payload.booking_date || today_());
  const active = getBookingsByDate_(date).find(function(b) {
    return String(b.customer_id) === String(user.user_id) &&
      [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(String(b.status)) === -1;
  });
  const queue = getQueueLive_(Object.assign({}, payload, { booking_date: date }));
  return { status: APP_CONFIG.API_OK, date: date, active_booking: active ? cleanRow_(active) : null, queue: queue };
}

function getReportBookings_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  let rows = getRowsAsObjects_('Bookings');
  if (payload.date_from) rows = rows.filter(function(r) { return toDateOnly_(r.booking_date) >= toDateOnly_(payload.date_from); });
  if (payload.date_to) rows = rows.filter(function(r) { return toDateOnly_(r.booking_date) <= toDateOnly_(payload.date_to); });
  if (payload.operator_id) rows = rows.filter(function(r) { return String(r.operator_id) === String(payload.operator_id); });
  if (payload.status) rows = rows.filter(function(r) { return String(r.status) === String(payload.status); });
  return { status: APP_CONFIG.API_OK, summary: summarizeBookings_(rows), bookings: rows.map(cleanRow_) };
}

function getReportRevenue_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  let bookings = getRowsAsObjects_('Bookings').filter(function(b) { return String(b.status) === BOOKING_STATUS.FINISHED; });
  if (payload.date_from) bookings = bookings.filter(function(r) { return toDateOnly_(r.booking_date) >= toDateOnly_(payload.date_from); });
  if (payload.date_to) bookings = bookings.filter(function(r) { return toDateOnly_(r.booking_date) <= toDateOnly_(payload.date_to); });

  const byDate = {};
  const byService = {};
  const byOperator = {};
  bookings.forEach(function(b) {
    const amount = number_(b.price, 0);
    const d = toDateOnly_(b.booking_date);
    byDate[d] = (byDate[d] || 0) + amount;
    byService[b.service_name] = (byService[b.service_name] || 0) + amount;
    byOperator[b.operator_name] = (byOperator[b.operator_name] || 0) + amount;
  });
  return {
    status: APP_CONFIG.API_OK,
    total_revenue: bookings.reduce(function(sum, b) { return sum + number_(b.price, 0); }, 0),
    total_transactions: bookings.length,
    by_date: byDate,
    by_service: byService,
    by_operator: byOperator
  };
}

function getReportOperators_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  let bookings = getRowsAsObjects_('Bookings').filter(function(b) { return String(b.status) === BOOKING_STATUS.FINISHED; });
  if (payload.date_from) bookings = bookings.filter(function(r) { return toDateOnly_(r.booking_date) >= toDateOnly_(payload.date_from); });
  if (payload.date_to) bookings = bookings.filter(function(r) { return toDateOnly_(r.booking_date) <= toDateOnly_(payload.date_to); });

  const map = {};
  bookings.forEach(function(b) {
    const key = b.operator_id || '-';
    if (!map[key]) map[key] = { operator_id: b.operator_id, operator_name: b.operator_name, total_customer: 0, total_revenue: 0, total_duration_min: 0 };
    map[key].total_customer += 1;
    map[key].total_revenue += number_(b.price, 0);
    map[key].total_duration_min += number_(b.actual_duration_min, 0);
  });
  const rows = Object.keys(map).map(function(k) {
    const r = map[k];
    r.avg_duration_min = r.total_customer ? Math.round(r.total_duration_min / r.total_customer) : 0;
    return r;
  });
  return { status: APP_CONFIG.API_OK, operators: rows };
}

function summarizeBookings_(bookings) {
  const summary = {
    total: bookings.length,
    booked: 0,
    checked_in: 0,
    called: 0,
    in_service: 0,
    finished: 0,
    cancelled: 0,
    no_show: 0,
    estimated_revenue: 0,
    finished_revenue: 0,
    unpaid_amount: 0
  };
  bookings.forEach(function(b) {
    const st = String(b.status);
    if (st === BOOKING_STATUS.BOOKED) summary.booked += 1;
    if (st === BOOKING_STATUS.CHECKED_IN) summary.checked_in += 1;
    if (st === BOOKING_STATUS.CALLED) summary.called += 1;
    if (st === BOOKING_STATUS.IN_SERVICE) summary.in_service += 1;
    if (st === BOOKING_STATUS.FINISHED) summary.finished += 1;
    if (st === BOOKING_STATUS.CANCELLED) summary.cancelled += 1;
    if (st === BOOKING_STATUS.NO_SHOW) summary.no_show += 1;
    if ([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(st) === -1) summary.estimated_revenue += number_(b.price, 0);
    if (st === BOOKING_STATUS.FINISHED) summary.finished_revenue += number_(b.price, 0);
    if (String(b.payment_status) !== PAYMENT_STATUS.PAID && [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(st) === -1) summary.unpaid_amount += number_(b.price, 0);
  });
  return summary;
}
