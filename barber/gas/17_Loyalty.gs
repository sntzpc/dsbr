/**
 * 17_Loyalty.gs
 * Program loyalty pelanggan berbasis riwayat Payments.
 * Dipanggil hanya saat diminta agar polling realtime tetap ringan.
 */

const LOYALTY_PROGRAMS = {
  POINTS_PRIORITY: { name: 'Poin Loyal Prioritas', short: 'Poin', description: 'Setiap transaksi lunas menjadi poin. Jika poin mencapai target, pelanggan mendapat status prioritas.' },
  VISIT_REWARD: { name: 'Kunjungan Berhadiah', short: 'Visit Reward', description: 'Setiap kelipatan kunjungan tertentu, pelanggan mendapat reward untuk kunjungan berikutnya.' },
  SPEND_VIP: { name: 'VIP Berdasarkan Belanja', short: 'VIP Spend', description: 'Pelanggan menjadi VIP jika total pembayaran lunas mencapai nominal target.' },
  MONTHLY_ACTIVE: { name: 'Pelanggan Aktif Bulanan', short: 'Aktif Bulanan', description: 'Pelanggan mendapat prioritas jika rutin transaksi dalam periode hari terakhir.' },
  HYBRID_ELITE: { name: 'Elite Gabungan Visit + Belanja', short: 'Elite', description: 'Pelanggan menjadi Elite jika memenuhi target jumlah kunjungan dan total belanja.' }
};

function getLoyaltyConfig_(settings) {
  settings = settings || {};
  function get(key, fallback) {
    return settings[key] !== undefined && settings[key] !== '' ? settings[key] : getSettingValue_(key, fallback);
  }
  var type = String(get('loyalty_program_type', 'POINTS_PRIORITY') || 'POINTS_PRIORITY').trim().toUpperCase();
  if (!LOYALTY_PROGRAMS[type]) type = 'POINTS_PRIORITY';
  return {
    enabled: bool_(get('loyalty_enabled', 'false')),
    program_type: type,
    program_name: LOYALTY_PROGRAMS[type].name,
    program_short: LOYALTY_PROGRAMS[type].short,
    program_description: LOYALTY_PROGRAMS[type].description,
    points_per_paid: Math.max(1, number_(get('loyalty_points_per_paid', 1), 1)),
    visit_threshold: Math.max(1, number_(get('loyalty_visit_threshold', 5), 5)),
    spend_threshold: Math.max(1, number_(get('loyalty_spend_threshold', 250000), 250000)),
    free_visit_every: Math.max(1, number_(get('loyalty_free_visit_every', 6), 6)),
    monthly_period_days: Math.max(7, number_(get('loyalty_monthly_period_days', 30), 30)),
    monthly_visit_min: Math.max(1, number_(get('loyalty_monthly_visit_min', 3), 3)),
    hybrid_visit_min: Math.max(1, number_(get('loyalty_hybrid_visit_min', 8), 8)),
    hybrid_spend_min: Math.max(1, number_(get('loyalty_hybrid_spend_min', 400000), 400000))
  };
}

function getLoyaltyStatus_(payload) {
  var user = requireRole_(payload, [USER_ROLES.ADMIN, USER_ROLES.OPERATOR, USER_ROLES.CUSTOMER]);
  var customerId = payload.customer_id || user.user_id;
  if (user.role === USER_ROLES.CUSTOMER) customerId = user.user_id;
  return { status: APP_CONFIG.API_OK, loyalty: buildCustomerLoyaltyStatus_(customerId, payload.settings || null) };
}

function buildCustomerLoyaltyStatus_(customerId, settings) {
  var cfg = getLoyaltyConfig_(settings || null);
  var base = {
    enabled: cfg.enabled,
    program_type: cfg.program_type,
    program_name: cfg.program_name,
    program_short: cfg.program_short,
    program_description: cfg.program_description,
    customer_id: customerId,
    total_paid_visits: 0,
    total_paid_amount: 0,
    points: 0,
    visits_in_period: 0,
    last_payment_date: '',
    is_eligible: false,
    reward_due: false,
    priority_level: 'NORMAL',
    benefit: cfg.enabled ? 'Belum memenuhi target loyalty.' : 'Program loyalty sedang nonaktif.',
    next_target_text: cfg.enabled ? 'Transaksi lunas akan otomatis dihitung dari riwayat Payments.' : 'Aktifkan program loyalty di halaman Setting.',
    progress_percent: 0,
    remaining_visits: 0,
    remaining_amount: 0
  };
  if (!cfg.enabled) return base;

  var bookings = getRowsAsObjects_('Bookings').filter(function(b) { return String(b.customer_id) === String(customerId); });
  var bookingById = {};
  bookings.forEach(function(b) { bookingById[String(b.booking_id)] = b; });
  if (!Object.keys(bookingById).length) return evaluateLoyalty_(base, cfg);

  var payments = getRowsAsObjects_('Payments').filter(function(p) {
    return bookingById[String(p.booking_id)] && String(p.status || '').toUpperCase() === PAYMENT_STATUS.PAID;
  });

  var uniqueVisitMap = {};
  var visitsInPeriodMap = {};
  var totalAmount = 0;
  var lastDate = '';
  var periodStart = addDaysToDateString_(today_(), -cfg.monthly_period_days);

  payments.forEach(function(p) {
    var bid = String(p.booking_id || '');
    uniqueVisitMap[bid] = true;
    totalAmount += number_(p.amount, 0);
    var pd = toDateOnly_(p.payment_date || p.created_at || '');
    if (pd && (!lastDate || compareDate_(pd, lastDate) > 0)) lastDate = pd;
    if (pd && compareDate_(pd, periodStart) >= 0) visitsInPeriodMap[bid] = true;
  });

  base.total_paid_visits = Object.keys(uniqueVisitMap).length;
  base.total_paid_amount = totalAmount;
  base.points = base.total_paid_visits * cfg.points_per_paid;
  base.visits_in_period = Object.keys(visitsInPeriodMap).length;
  base.last_payment_date = lastDate;
  return evaluateLoyalty_(base, cfg);
}

function evaluateLoyalty_(base, cfg) {
  var type = cfg.program_type;
  var eligible = false;
  var rewardDue = false;
  var benefit = '';
  var next = '';
  var progress = 0;
  var remainingVisits = 0;
  var remainingAmount = 0;

  if (type === 'POINTS_PRIORITY') {
    var targetPoints = cfg.visit_threshold * cfg.points_per_paid;
    eligible = base.points >= targetPoints;
    remainingVisits = Math.max(0, cfg.visit_threshold - base.total_paid_visits);
    progress = pct_(base.points, targetPoints);
    benefit = eligible ? 'Status Prioritas aktif berdasarkan poin transaksi.' : 'Kumpulkan poin dari setiap pembayaran lunas.';
    next = eligible ? 'Benefit prioritas sudah aktif.' : 'Butuh ' + remainingVisits + ' transaksi lunas lagi untuk prioritas.';
  } else if (type === 'VISIT_REWARD') {
    rewardDue = base.total_paid_visits > 0 && base.total_paid_visits % cfg.free_visit_every === 0;
    eligible = rewardDue || base.total_paid_visits >= cfg.free_visit_every;
    var mod = base.total_paid_visits % cfg.free_visit_every;
    remainingVisits = rewardDue ? 0 : Math.max(0, cfg.free_visit_every - mod);
    progress = pct_(rewardDue ? cfg.free_visit_every : mod, cfg.free_visit_every);
    benefit = rewardDue ? 'Reward kunjungan aktif. Pelanggan layak mendapat prioritas/reward kunjungan berikutnya.' : 'Reward aktif setiap kelipatan kunjungan.';
    next = rewardDue ? 'Reward sudah jatuh tempo.' : 'Butuh ' + remainingVisits + ' kunjungan lunas lagi menuju reward.';
  } else if (type === 'SPEND_VIP') {
    eligible = base.total_paid_amount >= cfg.spend_threshold;
    remainingAmount = Math.max(0, cfg.spend_threshold - base.total_paid_amount);
    progress = pct_(base.total_paid_amount, cfg.spend_threshold);
    benefit = eligible ? 'Status VIP aktif berdasarkan total pembayaran.' : 'VIP aktif setelah total pembayaran mencapai target.';
    next = eligible ? 'Benefit VIP sudah aktif.' : 'Butuh tambahan Rp ' + formatNumberOnly_(remainingAmount) + ' menuju VIP.';
  } else if (type === 'MONTHLY_ACTIVE') {
    eligible = base.visits_in_period >= cfg.monthly_visit_min;
    remainingVisits = Math.max(0, cfg.monthly_visit_min - base.visits_in_period);
    progress = pct_(base.visits_in_period, cfg.monthly_visit_min);
    benefit = eligible ? 'Prioritas aktif karena pelanggan rutin dalam periode terakhir.' : 'Prioritas aktif jika rutin transaksi dalam periode berjalan.';
    next = eligible ? 'Benefit pelanggan aktif sudah aktif.' : 'Butuh ' + remainingVisits + ' transaksi lunas lagi dalam ' + cfg.monthly_period_days + ' hari.';
  } else if (type === 'HYBRID_ELITE') {
    var visitOk = base.total_paid_visits >= cfg.hybrid_visit_min;
    var spendOk = base.total_paid_amount >= cfg.hybrid_spend_min;
    eligible = visitOk && spendOk;
    remainingVisits = Math.max(0, cfg.hybrid_visit_min - base.total_paid_visits);
    remainingAmount = Math.max(0, cfg.hybrid_spend_min - base.total_paid_amount);
    progress = Math.min(100, Math.round((pctRaw_(base.total_paid_visits, cfg.hybrid_visit_min) + pctRaw_(base.total_paid_amount, cfg.hybrid_spend_min)) / 2));
    benefit = eligible ? 'Status Elite aktif karena memenuhi kunjungan dan nilai pembayaran.' : 'Elite aktif jika target kunjungan dan total pembayaran terpenuhi.';
    next = eligible ? 'Benefit Elite sudah aktif.' : 'Butuh ' + remainingVisits + ' kunjungan dan Rp ' + formatNumberOnly_(remainingAmount) + ' lagi.';
  }

  base.is_eligible = eligible;
  base.reward_due = rewardDue;
  base.priority_level = eligible ? (type === 'SPEND_VIP' || type === 'HYBRID_ELITE' ? 'VIP' : 'PRIORITY') : 'NORMAL';
  base.benefit = benefit;
  base.next_target_text = next;
  base.progress_percent = Math.max(0, Math.min(100, progress));
  base.remaining_visits = remainingVisits;
  base.remaining_amount = remainingAmount;
  return base;
}

function pct_(value, target) { return Math.max(0, Math.min(100, Math.round(pctRaw_(value, target)))); }
function pctRaw_(value, target) { target = Math.max(1, number_(target, 1)); return number_(value, 0) / target * 100; }
function addDaysToDateString_(dateStr, days) { var d = parseDateValue_(dateStr) || new Date(); d.setDate(d.getDate() + number_(days, 0)); return formatDateOnly_(d); }
function formatNumberOnly_(value) { return Math.round(number_(value, 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
