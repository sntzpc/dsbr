/**
 * 16_Performance.gs
 * Endpoint gabungan untuk mengurangi latency di mobile.
 */
function getAppSnapshot_(payload) {
  const user = requireAuth_(payload);
  const date = toDateOnly_(payload.date || payload.booking_date || today_());
  const page = String(payload.page || '').trim();
  const includeNotifications = payload.include_notifications === true || String(payload.include_notifications) === 'true';
  const includeHistory = payload.include_history === true || String(payload.include_history) === 'true' || page === 'history';

  const settingsRes = getSettings_(payload);
  const operators = getRowsAsObjects_('Operators').filter(function(o) { return bool_(o.active); }).map(cleanRow_);
  const services = getRowsAsObjects_('Services').filter(function(s) { return bool_(s.active); }).map(cleanRow_);
  const notifInfo = getNotificationSnapshotForUser_(user.user_id, includeNotifications, 20);

  const result = {
    status: APP_CONFIG.API_OK,
    server_time: now_(),
    date: date,
    role: user.role,
    settings: settingsRes.settings || {},
    operators: operators,
    services: services,
    notifications: notifInfo.notifications,
    unread_count: notifInfo.unread_count,
    dashboard: null,
    queue: null,
    bookings: []
  };

  if (user.role === USER_ROLES.ADMIN) {
    const bookings = getBookingsByDate_(date);
    result.dashboard = { status: APP_CONFIG.API_OK, date: date, summary: summarizeBookings_(bookings) };
    result.bookings = bookings.sort(sortBookingsNewestFirst_).map(cleanRow_);
  } else if (user.role === USER_ROLES.OPERATOR) {
    const allToday = getBookingsByDate_(date);
    const myBookings = allToday.filter(function(b) { return String(b.operator_id) === String(user.operator_id); });
    result.dashboard = { status: APP_CONFIG.API_OK, date: date, summary: summarizeBookings_(myBookings), bookings: myBookings.slice().sort(sortBookingsNewestFirst_).map(cleanRow_) };
    result.bookings = myBookings.sort(sortBookingsNewestFirst_).map(cleanRow_);
    result.queue = buildQueueLiveFromBookings_(date, myBookings);
  } else if (user.role === USER_ROLES.CUSTOMER) {
    const todayBookings = getBookingsByDate_(date);
    const active = todayBookings.find(function(b) {
      return String(b.customer_id) === String(user.user_id) &&
        [BOOKING_STATUS.FINISHED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW].indexOf(String(b.status)) === -1;
    });
    const queue = buildQueueLiveFromBookings_(date, todayBookings);
    result.dashboard = { status: APP_CONFIG.API_OK, date: date, active_booking: active ? cleanRow_(active) : null, queue: queue };
    result.queue = queue;
    if (includeHistory) {
      result.bookings = getRowsAsObjects_('Bookings')
        .filter(function(b) { return String(b.customer_id) === String(user.user_id); })
        .sort(function(a, b) { return compareDate_(b.booking_date, a.booking_date) || (number_(b.queue_no) - number_(a.queue_no)); })
        .slice(0, 50)
        .map(cleanRow_);
    }
  }

  return result;
}

function getNotificationSnapshotForUser_(userId, includeRows, limit) {
  let rows = getRowsAsObjects_('Notifications').filter(function(n) { return String(n.user_id) === String(userId); });
  const unread = rows.filter(function(n) { return !bool_(n.read_status); }).length;
  rows.sort(function(a, b) {
    var bd = parseDateTimeValue_(b.created_at);
    var ad = parseDateTimeValue_(a.created_at);
    return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
  });
  return {
    unread_count: unread,
    notifications: includeRows ? rows.slice(0, limit || 20).map(cleanRow_) : []
  };
}

function buildQueueLiveFromBookings_(date, bookings) {
  bookings = (bookings || []).slice().sort(function(a, b) { return number_(a.queue_no) - number_(b.queue_no); });
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


function sortBookingsNewestFirst_(a, b) {
  var bd = String(b.booking_date || '') + ' ' + String(b.slot_time || b.created_at || b.updated_at || '');
  var ad = String(a.booking_date || '') + ' ' + String(a.slot_time || a.created_at || a.updated_at || '');
  if (bd > ad) return 1;
  if (bd < ad) return -1;
  return number_(b.queue_no) - number_(a.queue_no);
}
