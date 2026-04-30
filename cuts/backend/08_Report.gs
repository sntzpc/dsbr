// REPORT_ — Laporan & Statistik
// ============================================================

function REPORT_daily(data) {
  const { date } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS).filter(b => b.date === date);
  const done = bookings.filter(b => b.status === 'done');
  const totalRevenue = done.reduce((sum, b) => sum + (parseFloat(b.price) || 0), 0);

  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS);
  const opStats = operators.map(op => {
    const opDone = done.filter(b => b.operatorId === op.operatorId);
    return {
      operatorName: op.name,
      count       : opDone.length,
      revenue     : opDone.reduce((s, b) => s + (parseFloat(b.price) || 0), 0)
    };
  }).filter(o => o.count > 0);

  return {
    date, totalBookings: bookings.length, totalDone: done.length,
    totalCancelled: bookings.filter(b => b.status === 'cancelled').length,
    totalRevenue, operatorStats: opStats
  };
}

function REPORT_monthly(data) {
  const { year, month } = data; // month: 1-12
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS).filter(b => b.date.startsWith(prefix));
  const done = bookings.filter(b => b.status === 'done');
  const totalRevenue = done.reduce((sum, b) => sum + (parseFloat(b.price) || 0), 0);
  return { year, month, totalBookings: bookings.length, totalDone: done.length, totalRevenue };
}

function REPORT_operatorPerformance(data) {
  const { startDate, endDate } = data;
  const bookings = SHEET_readAll(CONFIG.SHEET_NAMES.BOOKINGS)
    .filter(b => b.status === 'done' && b.date >= startDate && b.date <= endDate);
  const operators = SHEET_readAll(CONFIG.SHEET_NAMES.OPERATORS);

  return operators.map(op => {
    const opDone = bookings.filter(b => b.operatorId === op.operatorId);
    return {
      operatorId  : op.operatorId,
      operatorName: op.name,
      totalDone   : opDone.length,
      totalRevenue: opDone.reduce((s, b) => s + (parseFloat(b.price) || 0), 0)
    };
  });
}


// ============================================================
