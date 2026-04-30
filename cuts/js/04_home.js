// HOME PAGE
// ============================================================
async function loadHomePage() {
  loadHomeQueue();
  loadCapacity();
  loadMyQueueStatus();
}

async function loadMyQueueStatus() {
  if (!STATE.user) return;
  try {
    const status = await api('queue.getStatus', { userId: STATE.user.userId });
    const card = document.getElementById('my-status-card');
    if (!status.found || status.status === 'cancelled' || status.status === 'done') {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    document.getElementById('my-queue-num').textContent = status.queueNumber;
    document.getElementById('my-op-name').textContent = '✂ ' + status.operatorName;
    document.getElementById('my-in-front').textContent = status.inFront > 0 ? `${status.inFront} orang di depan` : 'Giliran berikutnya!';

    const badges = {
      waiting    : '<span class="badge badge-wait"><span class="badge-dot"></span>Menunggu</span>',
      called     : '<span class="badge badge-called"><span class="badge-dot"></span>Dipanggil!</span>',
      in_progress: '<span class="badge badge-progress"><span class="badge-dot"></span>Sedang Dipotong</span>',
    };
    document.getElementById('my-status-badge').innerHTML = badges[status.status] || '';

    const progress = status.inFront === 0 ? 95 : Math.max(10, 100 - (status.inFront * 20));
    document.getElementById('my-progress-fill').style.width = progress + '%';
    document.getElementById('my-called-notice').classList.toggle('hidden', status.status !== 'called');
  } catch (e) {}
}

async function loadHomeQueue() {
  const el = document.getElementById('home-queue-list');
  try {
    const queue = await api('queue.getToday', { date: todayStr() });
    if (!queue.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">✂</div><div class="empty-text">Belum ada antrian hari ini</div></div>'; return; }
    const active = queue.filter(q => ['waiting','called','in_progress'].includes(q.status));
    if (!active.length) { el.innerHTML = '<div class="empty empty-text">Semua antrian selesai hari ini</div>'; return; }
    el.innerHTML = `<div class="queue-grid">${active.map(q => `
      <div class="queue-card status-${q.status}">
        <div class="queue-num">${q.queueNumber}</div>
        <div class="queue-initial">${q.customerInitial}</div>
        <div class="queue-op">${q.operatorName.split(' ')[0]}</div>
        <div style="margin-top:4px">${statusMini(q.status)}</div>
        ${q.status==='in_progress'&&q.durationMinutes?`<div class="queue-op">${q.durationMinutes}mnt</div>`:''}
      </div>`).join('')}
    </div>`;
  } catch (e) { el.innerHTML = '<div class="empty-text text-muted">Gagal memuat antrian</div>'; }
}

async function loadCapacity() {
  const el = document.getElementById('home-capacity');
  try {
    const slots = await api('booking.getDailySlots', { date: todayStr() });
    const pct = Math.round((slots.totalBooked / slots.maxCapacity) * 100);
    el.innerHTML = `
      <div class="row" style="margin-bottom:10px">
        <span class="text-small text-muted">${slots.totalBooked} / ${slots.maxCapacity} slot terisi</span>
        <span class="chip">${slots.remainingSlots} tersisa</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="margin-top:14px">
        ${slots.operators.map(op => `
          <div class="row" style="margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="op-avatar" style="width:28px;height:28px;font-size:.75rem">${op.initial}</div>
              <span class="text-small">${op.operatorName}</span>
            </div>
            <span class="chip">${op.available} slot</span>
          </div>`).join('')}
      </div>`;
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat info kapasitas</div>'; }
}

function startQueueRefresh() {
  if (STATE.refreshTimer) clearInterval(STATE.refreshTimer);
  STATE.refreshTimer = setInterval(() => {
    if (STATE.user && STATE.user.role === 'customer') {
      loadMyQueueStatus();
      loadHomeQueue();
    }
  }, 30000);
}

// ============================================================
