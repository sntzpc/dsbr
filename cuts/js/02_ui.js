// TOAST NOTIFICATIONS
// ============================================================
function toast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: '✦' };
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `<span style="color:var(--${type==='error'?'red':type==='success'?'green':'gold'})">${icons[type]}</span> ${msg}`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ============================================================
// MODAL
// ============================================================
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.add('open');
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ============================================================
// NAVIGATION
// ============================================================
/*
 * FIX NAVIGATION RECURSION - 2026-04-30
 * Penyebab error "too much recursion": fungsi navigateTo() sebelumnya
 * dideklarasikan ulang di bagian bawah file. Karena hoisting JavaScript,
 * _origNav menunjuk ke fungsi override dan memanggil dirinya sendiri.
 */
function baseNavigateTo(pageId) {
  document.querySelectorAll('.' + 'page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (!page) return;
  page.classList.add('active');

  // Update nav highlight
  document.querySelectorAll('#bottom-nav .nav-item, #bottom-nav-op .nav-item').forEach(n => n.classList.remove('active'));
  const navMap = {
    'page-home'    : 'nav-home',
    'page-book'    : 'nav-book',
    'page-queue'   : 'nav-queue',
    'page-bookings': 'nav-bookings',
  };
  if (navMap[pageId]) {
    const el = document.getElementById(navMap[pageId]);
    if (el) el.classList.add('active');
  }
}

// ============================================================
