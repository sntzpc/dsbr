// QUEUE_ — Antrian Real-Time
// ============================================================

function QUEUE_getToday(data) {
  const today = data.date || UTIL_todayString();
  const queue = SHEET_readAll(CONFIG.SHEET_NAMES.QUEUE);
  const todayQueue = queue
    .filter(q => q.date === today && q.status !== 'cancelled')
    .sort((a, b) => parseInt(a.queueNumber) - parseInt(b.queueNumber));

  return todayQueue.map(q => ({
    queueNumber    : q.queueNumber,
    customerInitial: q.customerName ? q.customerName.charAt(0).toUpperCase() + (q.customerName.charAt(1) || '') : '??',
    operatorName   : q.operatorName,
    status         : q.status,
    startedAt      : q.startedAt,
    durationMinutes: q.durationMinutes,
    seatNumber     : q.seatNumber,
  }));
}

function QUEUE_getStatus(data) {
  const { userId, bookingId } = data;
  const today = UTIL_todayString();
  const queue = SHEET_readAll(CONFIG.SHEET_NAMES.QUEUE);

  let myEntry;
  if (bookingId) {
    myEntry = queue.find(q => q.bookingId === bookingId && q.date === today);
  } else if (userId) {
    myEntry = queue.find(q => q.userId === userId && q.date === today && q.status !== 'cancelled');
  }
  if (!myEntry) return { found: false };

  // Hitung posisi di antrian operator yang sama
  const operatorQueue = queue
    .filter(q => q.operatorId === myEntry.operatorId && q.date === today && q.status !== 'cancelled')
    .sort((a, b) => parseInt(a.queueNumber) - parseInt(b.queueNumber));

  const myIndex = operatorQueue.findIndex(q => q.bookingId === myEntry.bookingId);
  const inFront = operatorQueue.filter((q, i) => i < myIndex && (q.status === 'waiting' || q.status === 'called')).length;

  return {
    found          : true,
    queueNumber    : myEntry.queueNumber,
    status         : myEntry.status,
    operatorName   : myEntry.operatorName,
    inFront        : inFront,
    calledAt       : myEntry.calledAt,
    startedAt      : myEntry.startedAt,
    durationMinutes: myEntry.durationMinutes,
  };
}


// ============================================================
