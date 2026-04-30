// PAGE LOAD HOOKS
// ============================================================
const PAGE_LOAD_HOOKS = {
  'page-home'    : () => { loadHomePage(); },
  'page-book'    : () => { loadBookingPage(); },
  'page-bookings': () => { loadMyBookings(); },
  'page-queue'   : () => { loadQueuePage(); },
  'page-operator': () => { loadOperatorQueue(); },
  'page-admin'   : () => { loadAdminDashboard(); },
};

// Wrapper navigateTo untuk menjalankan hook halaman tanpa recursion.
function navigateTo(pageId) {
  baseNavigateTo(pageId);
  if (PAGE_LOAD_HOOKS[pageId]) PAGE_LOAD_HOOKS[pageId]();
}

// ============================================================
// BOOKING SELECT UPDATE HOOK
// ============================================================
document.addEventListener('change', function(e) {
  if (e.target.id === 'book-service') {
    updateBookSummary();
  }
  if (e.target.id === 'book-date') {
    loadBookingSlots();
  }
});

// ============================================================
// AUTO-LOGIN FROM LOCAL STORAGE
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  closeModal();
  const saved = localStorage.getItem('bs_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      STATE.user = user;
      afterLogin(user);
      return;
    } catch(e) {
      localStorage.removeItem('bs_user');
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const authPage = document.getElementById('page-auth');
  if (authPage) {
    authPage.classList.add('active');
    authPage.removeAttribute('style');
  }
  const bottomNav = document.getElementById('bottom-nav');
  const bottomNavOp = document.getElementById('bottom-nav-op');
  if (bottomNav) bottomNav.classList.add('hidden');
  if (bottomNavOp) bottomNavOp.classList.add('hidden');
});
