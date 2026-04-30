// OPERATOR PANEL
// ============================================================
async function loadOperatorQueue() {
  const el = document.getElementById('op-queue-list');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const queue = await api('operator.getMyQueue', {
      operatorId: STATE.operatorId || '',
      userId    : STATE.user?.userId || '',
      phone     : STATE.user?.phone || '',
      date      : todayStr()
    });

    if (!STATE.operatorId && queue.length) STATE.operatorId = queue[0].operatorId;

    const waiting = queue.filter(q => ['waiting','called','in_progress'].includes(q.status)).length;
    const done = queue.filter(q => q.status === 'done').length;
    document.getElementById('op-count-wait').textContent = waiting;
    document.getElementById('op-count-done').textContent = done;

    if (!queue.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">✂</div><div class="empty-text">Belum ada antrian untukmu hari ini</div></div>';
      return;
    }
    el.innerHTML = queue.map(q => `
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <div>
            <div class="fw-bold font-head" style="font-size:1.2rem;color:var(--gold)">#${q.queueNumber} · ${q.timeSlot || 'Jam belum ada'}</div>
            <div class="fw-bold mt-4">${q.customerName}</div>
            <div class="text-muted text-small mt-4">${q.serviceName || 'Layanan'} · ${q.operatorName}</div>
          </div>
          <div style="text-align:right">${statusBadge(q.status)}</div>
        </div>
        <div class="divider"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${q.status==='waiting'?`<button class="btn btn-gold btn-sm" onclick="opCall('${q.bookingId}')">📣 Panggil</button>`:''}
          ${q.status==='called'?`<button class="btn btn-green btn-sm" onclick="opStart('${q.bookingId}')">▶ Mulai</button>`:''}
          ${q.status==='in_progress'?`<button class="btn btn-outline btn-sm" onclick="opFinish('${q.bookingId}')">✓ Selesai</button>`:''}
          ${q.status==='done'?`<span class="chip">Selesai</span>`:''}
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat antrian: '+e.message+'</div>'; }
}

async function loadOperatorCalendar() {
  const input = document.getElementById('op-calendar-month');
  const el = document.getElementById('op-calendar');
  if (!input || !el) return;
  if (!input.value) input.value = todayStr().slice(0, 7);
  const [year, month] = input.value.split('-').map(Number);
  try {
    const data = await api('admin.getMonthlyCalendar', {
      year, month,
      operatorId: STATE.operatorId || '',
      userId    : STATE.user?.userId || '',
      phone     : STATE.user?.phone || ''
    });
    renderCalendarGrid(el, year, month, data.days, 'Operator');
  } catch (err) {
    el.innerHTML = '<div class="text-muted text-small">Gagal memuat kalender: '+err.message+'</div>';
  }
}

async function opCall(bookingId) {
  try {
    await api('operator.callCustomer', { bookingId, seatNumber: '1' });
    toast('Pelanggan dipanggil!', 'success');
    loadOperatorQueue();
  } catch(err) { toast(err.message, 'error'); }
}
async function opStart(bookingId) {
  try {
    await api('operator.startService', { bookingId });
    toast('Layanan dimulai', 'success');
    loadOperatorQueue();
  } catch(err) { toast(err.message, 'error'); }
}
async function opFinish(bookingId) {
  try {
    await api('operator.finishService', { bookingId });
    toast('Layanan selesai!', 'success');
    loadOperatorQueue();
  } catch(err) { toast(err.message, 'error'); }
}

// ============================================================
