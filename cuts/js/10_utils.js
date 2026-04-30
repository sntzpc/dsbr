// HELPERS
// ============================================================
function todayStr() {
  return new Date().toLocaleDateString('sv-SE');
}
function formatDate(str) {
  if (!str) return '–';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function statusBadge(s) {
  const map = {
    waiting    : ['badge-wait', 'Menunggu'],
    called     : ['badge-called', 'Dipanggil!'],
    in_progress: ['badge-progress', 'Dipotong'],
    done       : ['badge-done', 'Selesai'],
    cancelled  : ['badge-cancel', 'Dibatal'],
  };
  const [cls, label] = map[s] || ['badge-done', s];
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
}
function statusMini(s) {
  const colors = { waiting:'var(--text3)', called:'var(--gold)', in_progress:'var(--green)', done:'var(--text3)' };
  const labels = { waiting:'Tunggu', called:'Panggil', in_progress:'Potong', done:'Selesai' };
  return `<span style="font-size:.6rem;color:${colors[s]||'var(--text3)'}">${labels[s]||s}</span>`;
}

// ============================================================

// ============================================================
// ORDER NUMBER & LIVE SERVICE TIMER
// ============================================================
function displayOrderNo(row) {
  return (row && (row.orderNumber || row.queueNumber)) || '–';
}

function parseServerDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function elapsedSecondsFrom(startedAt) {
  const d = parseServerDateTime(startedAt);
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
}

function formatElapsed(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}j ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}d`;
  return `${m}m ${String(s).padStart(2,'0')}d`;
}

function renderRunningTimer(startedAt, compact = false) {
  if (!startedAt) return '';
  const label = formatElapsed(elapsedSecondsFrom(startedAt));
  const prefix = compact ? '' : 'Sudah berjalan: ';
  return `<div class="running-timer${compact ? ' compact' : ''}" data-started-at="${startedAt}">⏱ ${prefix}${label}</div>`;
}

function refreshRunningTimers() {
  document.querySelectorAll('[data-started-at]').forEach(el => {
    const startedAt = el.getAttribute('data-started-at');
    const compact = el.classList.contains('compact');
    const label = formatElapsed(elapsedSecondsFrom(startedAt));
    el.textContent = compact ? `⏱ ${label}` : `⏱ Sudah berjalan: ${label}`;
  });
}

function ensureRunningTimer() {
  if (STATE.runningTimer) clearInterval(STATE.runningTimer);
  refreshRunningTimers();
  STATE.runningTimer = setInterval(refreshRunningTimers, 1000);
}
