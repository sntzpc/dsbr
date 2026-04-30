// ENTRY POINT - HTTP Handler
// ============================================================

/**
 * Menangani semua request GET dari frontend.
 * Frontend mengirim data via parameter "payload" (JSON string)
 * untuk menghindari masalah CORS pada metode POST.
 */
function doGet(e) {
  return UTIL_processRequest(e);
}

/**
 * Menangani request POST (tetap disimpan sebagai fallback).
 */
function doPost(e) {
  return UTIL_processRequest(e);
}

/**
 * Router utama — memproses action dan mendelegasikan ke fungsi yang tepat.
 * Mendukung dua mode pengiriman data:
 *   1. GET: action & payload (JSON string) via query parameter
 *   2. POST: JSON body (fallback)
 */
function UTIL_processRequest(e) {
  try {
    const params = e.parameter || {};

    // --- Baca data: prioritaskan payload GET, fallback ke POST body ---
    let data = {};

    if (params.payload) {
      // Mode GET: frontend mengirim data sebagai JSON string di param "payload"
      try {
        data = JSON.parse(params.payload);
      } catch (parseErr) {
        data = {};
      }
      // Pastikan "action" terbaca (bisa dari params langsung atau dalam payload)
      if (params.action) data.action = params.action;
    } else if (e.postData && e.postData.contents) {
      // Mode POST: JSON body
      data = JSON.parse(e.postData.contents);
    } else {
      // Query params biasa (tidak ada payload)
      data = Object.assign({}, params);
    }

    const action = data.action || '';

    SHEET_initAllSheets(); // Pastikan semua sheet tersedia

    const ROUTE_MAP = {
      // --- AUTH ---
      'auth.register'         : () => AUTH_register(data),
      'auth.login'            : () => AUTH_login(data),
      'auth.getProfile'       : () => AUTH_getProfile(data),
      'auth.updateProfile'    : () => AUTH_updateProfile(data),

      // --- BOOKING ---
      'booking.create'        : () => BOOKING_create(data),
      'booking.getByUser'     : () => BOOKING_getByUser(data),
      'booking.getByDate'     : () => BOOKING_getByDate(data),
      'booking.cancel'        : () => BOOKING_cancel(data),
      'booking.getDailySlots' : () => BOOKING_getDailySlots(data),

      // --- QUEUE ---
      'queue.getToday'        : () => QUEUE_getToday(data),
      'queue.getStatus'       : () => QUEUE_getStatus(data),

      // --- OPERATOR ---
      'operator.getMyQueue'   : () => OPERATOR_getMyQueue(data),
      'operator.callCustomer' : () => OPERATOR_callCustomer(data),
      'operator.startService' : () => OPERATOR_startService(data),
      'operator.finishService': () => OPERATOR_finishService(data),

      // --- ADMIN ---
      'admin.getSettings'     : () => ADMIN_getSettings(),
      'admin.saveSettings'    : () => ADMIN_saveSettings(data),
      'admin.getOperators'    : () => ADMIN_getOperators(),
      'admin.saveOperator'    : () => ADMIN_saveOperator(data),
      'admin.deleteOperator'  : () => ADMIN_deleteOperator(data),
      'admin.getServices'     : () => ADMIN_getServices(),
      'admin.saveService'     : () => ADMIN_saveService(data),
      'admin.deleteService'   : () => ADMIN_deleteService(data),
      'admin.getAllUsers'      : () => ADMIN_getAllUsers(),
      'admin.getAllBookings'   : () => ADMIN_getAllBookings(data),

      // --- REPORT ---
      'report.daily'          : () => REPORT_daily(data),
      'report.monthly'        : () => REPORT_monthly(data),
      'report.operatorPerf'   : () => REPORT_operatorPerformance(data),
    };

    if (ROUTE_MAP[action]) {
      const result = ROUTE_MAP[action]();
      UTIL_log(action, data.userId || 'guest', 'SUCCESS');
      return UTIL_jsonResponse({ success: true, data: result });
    } else {
      return UTIL_jsonResponse({ success: false, message: 'Action tidak dikenal: ' + action });
    }

  } catch (err) {
    console.error('UTIL_processRequest ERROR:', err);
    UTIL_log('ERROR', '', err.toString());
    return UTIL_jsonResponse({ success: false, message: err.toString() });
  }
}


// ============================================================
