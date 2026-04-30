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
