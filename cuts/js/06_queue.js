// QUEUE PAGE
// ============================================================
async function loadQueuePage() {
  const el = document.getElementById('queue-page-content');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const queue = await api('queue.getToday', { date: todayStr() });
    if (!queue.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">✂</div><div class="empty-text">Belum ada order hari ini</div></div>';
      return;
    }
    const groupByOp = {};
    queue.forEach(q => {
      if (!groupByOp[q.operatorName]) groupByOp[q.operatorName] = [];
      groupByOp[q.operatorName].push(q);
    });
    el.innerHTML = Object.keys(groupByOp).map(opName => `
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <div class="fw-bold font-head">✂ ${opName}</div>
        </div>
        <div class="queue-grid">
          ${groupByOp[opName].map(q => `
            <div class="queue-card status-${q.status}">
              <div class="queue-num">${displayOrderNo(q)}</div>
              <div class="queue-initial">${q.customerInitial}</div>
              ${q.status==='in_progress'?`<div class="queue-op text-green" style="color:var(--green)">✂ Memotong</div>${renderRunningTimer(q.startedAt, true)}`:''}
              ${q.status==='called'?`<div class="queue-op" style="color:var(--gold)">Dipanggil</div>`:''}
              ${q.status==='done'?`<div class="queue-op">Selesai</div>`:''}
            </div>`).join('')}
        </div>
      </div>`).join('');
    ensureRunningTimer();
  } catch(e) { el.innerHTML = '<div class="empty-text text-muted">Gagal memuat order</div>'; }
}

// ============================================================
