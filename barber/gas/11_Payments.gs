/**
 * 11_Payments.gs
 * Pembayaran manual, QRIS statis, dan integrasi Tripay.
 *
 * Catatan penting:
 * - API Key dan Private Key Tripay disimpan di sheet Settings dan hanya dikirim ke ADMIN.
 * - Untuk callback Tripay di Apps Script, header X-Callback-Signature tidak tersedia di event doPost.
 *   Karena itu callback diproses idempotent best-effort, dan tombol cek status tetap disediakan untuk validasi ke API Tripay.
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
    gateway: payload.gateway || 'MANUAL',
    gateway_reference: payload.gateway_reference || '',
    merchant_ref: payload.merchant_ref || '',
    payment_channel: payload.payment_channel || '',
    checkout_url: payload.checkout_url || '',
    instructions: payload.instructions || '',
    raw_payload: payload.raw_payload || '',
    callback_payload: payload.callback_payload || '',
    notes: payload.notes || '',
    created_at: now_(),
    created_by: user.user_id,
    updated_at: now_()
  });

  refreshBookingPaymentStatus_(booking.booking_id);

  writeAuditLog_(user, 'CREATE_PAYMENT', 'Payments', payment.payment_id, null, payment, 'Input pembayaran');
  return { status: APP_CONFIG.API_OK, message: 'Pembayaran berhasil dicatat.', payment: cleanRow_(payment), payment_status: findOneByField_('Bookings', 'booking_id', booking.booking_id).payment_status };
}

function listPayments_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR, USER_ROLES.CUSTOMER]);
  let rows = getRowsAsObjects_('Payments');
  if (payload.booking_id) rows = rows.filter(function(p) { return String(p.booking_id) === String(payload.booking_id); });
  if (payload.date_from) rows = rows.filter(function(p) { return compareDate_(p.payment_date, payload.date_from) >= 0; });
  if (payload.date_to) rows = rows.filter(function(p) { return compareDate_(p.payment_date, payload.date_to) <= 0; });

  if (user.role === USER_ROLES.OPERATOR) {
    const myBookingIds = getRowsAsObjects_('Bookings')
      .filter(function(b) { return String(b.operator_id) === String(user.operator_id); })
      .map(function(b) { return String(b.booking_id); });
    rows = rows.filter(function(p) { return myBookingIds.indexOf(String(p.booking_id)) >= 0; });
  }

  if (user.role === USER_ROLES.CUSTOMER) {
    const myBookingIds = getRowsAsObjects_('Bookings')
      .filter(function(b) { return String(b.customer_id) === String(user.user_id); })
      .map(function(b) { return String(b.booking_id); });
    rows = rows.filter(function(p) { return myBookingIds.indexOf(String(p.booking_id)) >= 0; });
  }

  return { status: APP_CONFIG.API_OK, payments: rows.map(cleanRow_) };
}

function refreshBookingPaymentStatus_(bookingId) {
  const booking = findOneByField_('Bookings', 'booking_id', bookingId);
  if (!booking) return;
  const totalPaid = getRowsAsObjects_('Payments')
    .filter(function(p) { return String(p.booking_id) === String(bookingId) && String(p.status).toUpperCase() === PAYMENT_STATUS.PAID; })
    .reduce(function(sum, p) { return sum + number_(p.amount, 0); }, 0);
  const price = number_(booking.price, 0);
  const paymentStatus = totalPaid >= price ? PAYMENT_STATUS.PAID : (totalPaid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID);
  updateRowById_('Bookings', 'booking_id', bookingId, { payment_status: paymentStatus, updated_at: now_() });
  return paymentStatus;
}

function getTripayConfig_() {
  const mode = String(getSettingValue_('tripay_mode', 'sandbox') || 'sandbox').toLowerCase();
  return {
    enabled: bool_(getSettingValue_('payment_gateway_enabled', 'false')),
    mode: mode === 'production' ? 'production' : 'sandbox',
    merchant_code: String(getSettingValue_('tripay_merchant_code', '') || '').trim(),
    api_key: String(getSettingValue_('tripay_api_key', '') || '').trim(),
    private_key: String(getSettingValue_('tripay_private_key', '') || '').trim(),
    default_method: String(getSettingValue_('tripay_default_method', 'QRIS') || 'QRIS').trim(),
    callback_url: String(getSettingValue_('tripay_callback_url', '') || '').trim(),
    return_url: String(getSettingValue_('tripay_return_url', '') || '').trim(),
    website_url: String(getSettingValue_('website_url', '') || '').trim()
  };
}

function tripayBaseUrl_(cfg) {
  return cfg.mode === 'production' ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox';
}

function requireTripayConfig_() {
  const cfg = getTripayConfig_();
  if (!cfg.enabled) throw new Error('Payment gateway Tripay belum diaktifkan di Setting.');
  if (!cfg.merchant_code || !cfg.api_key || !cfg.private_key) throw new Error('Merchant Code, API Key, dan Private Key Tripay wajib diisi.');
  return cfg;
}

function tripayFetch_(path, cfg, options) {
  options = options || {};
  const url = tripayBaseUrl_(cfg) + path;
  const fetchOptions = {
    method: options.method || 'get',
    muteHttpExceptions: true,
    headers: Object.assign({ Authorization: 'Bearer ' + cfg.api_key }, options.headers || {})
  };
  if (options.body) {
    fetchOptions.contentType = 'application/json';
    fetchOptions.payload = JSON.stringify(options.body);
  }
  const res = UrlFetchApp.fetch(url, fetchOptions);
  const code = res.getResponseCode();
  const text = res.getContentText();
  let json = {};
  try { json = JSON.parse(text); } catch (err) { json = { raw: text }; }
  if (code < 200 || code >= 300 || json.success === false) {
    throw new Error('Tripay API gagal (' + code + '): ' + (json.message || text));
  }
  return json;
}

function getTripayChannels_(payload) {
  requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR]);
  const cfg = requireTripayConfig_();
  const amount = payload.amount ? '?amount=' + encodeURIComponent(payload.amount) : '';
  const data = tripayFetch_('/merchant/payment-channel' + amount, cfg, { method: 'get' });
  return { status: APP_CONFIG.API_OK, mode: cfg.mode, channels: data.data || [], raw: data };
}

function createTripayPayment_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR, USER_ROLES.CUSTOMER]);
  requireFields_(payload, ['booking_id']);
  const booking = findOneByField_('Bookings', 'booking_id', payload.booking_id);
  if (!booking) throw new Error('Booking tidak ditemukan.');

  if (user.role === USER_ROLES.OPERATOR && String(booking.operator_id) !== String(user.operator_id)) {
    throw new Error('Operator hanya bisa membuat invoice order sendiri.');
  }
  if (user.role === USER_ROLES.CUSTOMER && String(booking.customer_id) !== String(user.user_id)) {
    throw new Error('Pelanggan hanya bisa membayar booking miliknya sendiri.');
  }

  const cfg = requireTripayConfig_();
  const amount = number_(payload.amount || booking.price, 0);
  if (amount <= 0) throw new Error('Nominal pembayaran tidak valid.');

  const existing = getRowsAsObjects_('Payments').find(function(p) {
    return String(p.booking_id) === String(booking.booking_id) &&
      String(p.gateway).toUpperCase() === 'TRIPAY' &&
      ['UNPAID', 'PENDING'].indexOf(String(p.status).toUpperCase()) >= 0 &&
      String(p.checkout_url || '') !== '';
  });
  if (existing && !payload.force_new) {
    return {
      status: APP_CONFIG.API_OK,
      message: 'Invoice Tripay yang masih aktif ditemukan.',
      payment: cleanRow_(existing),
      checkout_url: existing.checkout_url,
      reference: existing.gateway_reference,
      merchant_ref: existing.merchant_ref
    };
  }

  const method = String(payload.method || cfg.default_method || 'QRIS').trim();
  const merchantRef = 'BB-' + String(booking.booking_id).replace(/[^A-Za-z0-9]/g, '').slice(-18) + '-' + Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'HHmmss');
  const signature = hmacSha256Hex_(cfg.merchant_code + merchantRef + amount, cfg.private_key);

  const body = {
    method: method,
    merchant_ref: merchantRef,
    amount: amount,
    customer_name: booking.customer_name || user.name || 'Pelanggan',
    customer_email: payload.customer_email || 'customer@barbershop.local',
    customer_phone: booking.customer_phone || user.phone || '',
    order_items: [{
      sku: booking.service_id || booking.booking_id,
      name: booking.service_name || 'Layanan Barbershop',
      price: amount,
      quantity: 1
    }],
    callback_url: cfg.callback_url,
    return_url: cfg.return_url || cfg.website_url,
    expired_time: payload.expired_time || Math.floor(new Date().getTime() / 1000) + (24 * 60 * 60),
    signature: signature
  };

  const result = tripayFetch_('/transaction/create', cfg, { method: 'post', body: body });
  const d = result.data || {};

  const payment = appendObject_('Payments', {
    payment_id: makeId_('PAY'),
    booking_id: booking.booking_id,
    payment_date: now_(),
    amount: amount,
    method: 'TRIPAY_' + method,
    status: String(d.status || 'UNPAID').toUpperCase(),
    gateway: 'TRIPAY',
    gateway_reference: d.reference || '',
    merchant_ref: d.merchant_ref || merchantRef,
    payment_channel: method,
    checkout_url: d.checkout_url || d.pay_url || '',
    instructions: safeJson_(d.instructions || d.payment_instructions || []),
    raw_payload: safeJson_(result),
    callback_payload: '',
    notes: 'Invoice Tripay dibuat dari aplikasi',
    created_at: now_(),
    created_by: user.user_id,
    updated_at: now_()
  });

  refreshBookingPaymentStatus_(booking.booking_id);
  writeAuditLog_(user, 'CREATE_TRIPAY_PAYMENT', 'Payments', payment.payment_id, null, payment, 'Buat invoice Tripay');

  return {
    status: APP_CONFIG.API_OK,
    message: 'Invoice Tripay berhasil dibuat.',
    payment: cleanRow_(payment),
    checkout_url: payment.checkout_url,
    reference: payment.gateway_reference,
    merchant_ref: payment.merchant_ref,
    raw: result
  };
}

function checkTripayPaymentStatus_(payload) {
  const user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR, USER_ROLES.CUSTOMER]);
  const cfg = requireTripayConfig_();
  let payment = null;
  if (payload.payment_id) payment = findOneByField_('Payments', 'payment_id', payload.payment_id);
  if (!payment && payload.booking_id) {
    const rows = getRowsAsObjects_('Payments').filter(function(p) {
      return String(p.booking_id) === String(payload.booking_id) && String(p.gateway).toUpperCase() === 'TRIPAY';
    });
    payment = rows.length ? rows[rows.length - 1] : null;
  }
  if (!payment) throw new Error('Data pembayaran Tripay tidak ditemukan.');
  const booking = findOneByField_('Bookings', 'booking_id', payment.booking_id);
  if (!booking) throw new Error('Booking tidak ditemukan.');

  if (user.role === USER_ROLES.OPERATOR && String(booking.operator_id) !== String(user.operator_id)) throw new Error('Akses pembayaran ditolak.');
  if (user.role === USER_ROLES.CUSTOMER && String(booking.customer_id) !== String(user.user_id)) throw new Error('Akses pembayaran ditolak.');

  const ref = payload.reference || payment.gateway_reference;
  if (!ref) throw new Error('Reference Tripay kosong.');
  const result = tripayFetch_('/transaction/detail?reference=' + encodeURIComponent(ref), cfg, { method: 'get' });
  const d = result.data || {};
  const newStatus = String(d.status || payment.status || '').toUpperCase();

  updateRowById_('Payments', 'payment_id', payment.payment_id, {
    status: newStatus,
    raw_payload: safeJson_(result),
    updated_at: now_()
  });
  const paymentStatus = refreshBookingPaymentStatus_(payment.booking_id);

  return {
    status: APP_CONFIG.API_OK,
    message: 'Status Tripay diperbarui: ' + newStatus,
    tripay_status: newStatus,
    payment_status: paymentStatus,
    payment: cleanRow_(findOneByField_('Payments', 'payment_id', payment.payment_id)),
    raw: result
  };
}

function processTripayCallback_(payload, e) {
  const raw = payload._raw_post || safeJson_(payload);
  const merchantRef = payload.merchant_ref || '';
  const reference = payload.reference || '';
  const trxStatus = String(payload.status || '').toUpperCase();

  const cb = appendObject_('PaymentCallbacks', {
    callback_id: makeId_('CB'),
    gateway: 'TRIPAY',
    reference: reference,
    merchant_ref: merchantRef,
    status: trxStatus,
    raw_payload: raw,
    created_at: now_(),
    processed: false
  });

  if (!merchantRef && !reference) {
    return { status: APP_CONFIG.API_OK, message: 'Callback dicatat, tetapi merchant_ref/reference kosong.' };
  }

  const rows = getRowsAsObjects_('Payments');
  const payment = rows.find(function(p) {
    return (merchantRef && String(p.merchant_ref) === String(merchantRef)) ||
           (reference && String(p.gateway_reference) === String(reference));
  });

  if (!payment) {
    updateRowById_('PaymentCallbacks', 'callback_id', cb.callback_id, { processed: false });
    return { status: APP_CONFIG.API_OK, message: 'Callback dicatat. Payment belum ditemukan.' };
  }

  updateRowById_('Payments', 'payment_id', payment.payment_id, {
    status: trxStatus || payment.status,
    callback_payload: raw,
    updated_at: now_()
  });
  updateRowById_('PaymentCallbacks', 'callback_id', cb.callback_id, { processed: true });
  refreshBookingPaymentStatus_(payment.booking_id);

  return { status: APP_CONFIG.API_OK, message: 'Callback Tripay diproses.', reference: reference, merchant_ref: merchantRef };
}

function saveQrisStatic_(payload) {
  const user = requireRole_(payload, USER_ROLES.ADMIN);
  requireFields_(payload, ['base64_data']);
  const raw = String(payload.base64_data || '');
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Format file QRIS tidak valid. Gunakan file gambar PNG/JPG/WebP.');
  const mime = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Ukuran QRIS maksimal 2 MB agar aman dibuka di mobile.');

  const ext = mime.indexOf('png') >= 0 ? '.png' : (mime.indexOf('webp') >= 0 ? '.webp' : '.jpg');
  const blob = Utilities.newBlob(bytes, mime, payload.filename || ('qris-statis-barbershop' + ext));
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  upsertSetting_('qris_static_file_id', file.getId(), 'File ID QRIS statis di Drive', user.user_id);
  upsertSetting_('qris_static_url', url, 'URL publik QRIS statis', user.user_id);

  writeAuditLog_(user, 'SAVE_QRIS_STATIC', 'Settings', 'qris_static_url', null, url, 'Upload QRIS statis');
  return { status: APP_CONFIG.API_OK, message: 'QRIS statis berhasil diupload.', qris_static_url: url, file_id: file.getId() };
}
