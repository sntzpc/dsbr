// OPERATOR PANEL
// ============================================================
async function loadOperatorQueue() {
  const el = document.getElementById('op-queue-list');
  el.innerHTML = '<div class="spinner"></div>';
  if (!STATE.operatorId) {
    el.innerHTML = '<div class="text-muted text-small">Akun tidak terhubung ke operator. Hubungi admin.</div>';
    return;
  }
  try {
    const queue = await api('operator.getMyQueue', { operatorId: STATE.operatorId });
    const waiting = queue.filter(q => ['waiting','called'].includes(q.status)).length;
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
            <div class="fw-bold font-head" style="font-size:1.2rem;color:var(--gold)">#${q.queueNumber}</div>
            <div class="fw-bold mt-4">${q.customerName}</div>
            <div class="text-muted text-small mt-4">${q.operatorName}</div>
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
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat antrian</div>'; }
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
