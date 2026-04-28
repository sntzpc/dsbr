/**
 * 02_Code.gs
 * Entry point Web App.
 */
function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const payload = parsePayload_(e, method);
    const action = String(payload.action || '').trim();
    if (!action) throw new Error('Missing action');

    const result = routeAction_(action, payload, e);
    return apiResponse_(result, payload.callback);
  } catch (err) {
    return apiResponse_({
      status: APP_CONFIG.API_ERROR,
      message: err.message || String(err),
      stack: APP_CONFIG.DEBUG ? err.stack : undefined
    }, e && e.parameter ? e.parameter.callback : null);
  }
}

function routeAction_(action, payload, e) {
  const routes = {
    ping: ping_,
    setupDatabase: setupDatabase_,
    migrateDateTimeFormat: migrateDateTimeFormat_,

    login: loginUser_,
    logout: logoutUser_,
    registerCustomer: registerCustomer_,
    getCurrentUser: getCurrentUser_,

    getSettings: getSettings_,
    saveSettings: saveSettings_,

    listOperators: listOperators_,
    saveOperator: saveOperator_,
    setOperatorStatus: setOperatorStatus_,

    listServices: listServices_,
    saveService: saveService_,
    setServiceStatus: setServiceStatus_,

    getBookingAvailability: getBookingAvailability_,
    createBooking: createBooking_,
    listBookings: listBookings_,
    cancelBooking: cancelBooking_,
    updateBookingStatus: updateBookingStatus_,

    checkInBooking: checkInBooking_,
    callCustomer: callCustomer_,
    startService: startService_,
    finishService: finishService_,
    markNoShow: markNoShow_,

    getQueueLive: getQueueLive_,
    getCustomerActiveBooking: getCustomerActiveBooking_,

    createPayment: createPayment_,
    listPayments: listPayments_,

    listNotifications: listNotifications_,
    markNotificationRead: markNotificationRead_,

    getDashboardAdmin: getDashboardAdmin_,
    getDashboardOperator: getDashboardOperator_,
    getDashboardCustomer: getDashboardCustomer_,
    getReportBookings: getReportBookings_,
    getReportRevenue: getReportRevenue_,
    getReportOperators: getReportOperators_
  };

  if (!routes[action]) throw new Error('Unknown action: ' + action);
  return routes[action](payload, e);
}

function ping_(payload) {
  return {
    status: APP_CONFIG.API_OK,
    app: APP_CONFIG.APP_NAME,
    version: APP_CONFIG.VERSION,
    server_time: now_()
  };
}
