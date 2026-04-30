// AUTH
// ============================================================
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', (tab==='login') === (i===0)));
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
}

async function doLogin() {
  const phone = document.getElementById('l-phone').value.trim();
  const password = document.getElementById('l-pass').value;
  if (!phone || !password) return toast('Isi nomor HP dan password', 'error');
  try {
    const user = await api('auth.login', { phone, password });
    STATE.user = user;
    localStorage.setItem('bs_user', JSON.stringify(user));
    afterLogin(user);
    toast(`Selamat datang, ${user.name}!`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const phone = document.getElementById('r-phone').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const password = document.getElementById('r-pass').value;
  if (!name || !phone || !password) return toast('Isi nama, nomor HP, dan password', 'error');
  if (password.length < 6) return toast('Password min. 6 karakter', 'error');
  try {
    await api('auth.register', { name, phone, email, password });
    toast('Akun berhasil dibuat! Silakan masuk.', 'success');
    switchAuthTab('login');
    document.getElementById('l-phone').value = phone;
  } catch (err) { toast(err.message, 'error'); }
}

function afterLogin(user) {
  closeModal();
  const role = user.role;
  const authPage = document.getElementById('page-auth');
  if (authPage) {
    authPage.classList.remove('active');
    authPage.removeAttribute('style');
  }

  if (role === 'admin') {
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('bottom-nav-op').classList.add('hidden');
    navigateTo('page-admin');
    loadAdminDashboard();
    loadAdminSettings();
  } else if (role === 'operator') {
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('bottom-nav-op').classList.remove('hidden');
    navigateTo('page-operator');
    resolveOperatorId(user).then(() => { loadOperatorQueue(); loadOperatorCalendar(); });
    // Set topbar
    document.getElementById('op-name-topbar').textContent = user.name;
    document.getElementById('op-avatar-topbar').textContent = user.name.charAt(0);
  } else {
    document.getElementById('bottom-nav').classList.remove('hidden');
    document.getElementById('bottom-nav-op').classList.add('hidden');
    navigateTo('page-home');
    document.getElementById('usr-name-topbar').textContent = user.name;
    document.getElementById('usr-avatar-topbar').textContent = user.name.charAt(0);
    loadHomePage();
    startQueueRefresh();
  }
}

async function resolveOperatorId(user) {
  try {
    const ops = await api('admin.getOperators');
    const op = ops.find(o => o.phone === user.phone || o.userId === user.userId);
    if (op) STATE.operatorId = op.operatorId;
  } catch(e) {}
}

function doLogout() {
  if (!confirm('Keluar dari aplikasi sekarang?')) return;

  STATE.user = null;
  STATE.selectedOp = null;
  STATE.selectedDate = null;
  STATE.operatorId = null;

  if (STATE.refreshTimer) {
    clearInterval(STATE.refreshTimer);
    STATE.refreshTimer = null;
  }

  localStorage.removeItem('bs_user');
  closeModal();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#bottom-nav .nav-item, #bottom-nav-op .nav-item').forEach(n => n.classList.remove('active'));

  const authPage = document.getElementById('page-auth');
  if (authPage) {
    authPage.classList.add('active');
    authPage.removeAttribute('style');
  }

  const bottomNav = document.getElementById('bottom-nav');
  const bottomNavOp = document.getElementById('bottom-nav-op');
  if (bottomNav) bottomNav.classList.add('hidden');
  if (bottomNavOp) bottomNavOp.classList.add('hidden');

  switchAuthTab('login');
  const pass = document.getElementById('l-pass');
  if (pass) pass.value = '';
  const phone = document.getElementById('l-phone');
  if (phone) setTimeout(() => phone.focus(), 80);

  toast('Anda sudah keluar dari aplikasi.', 'info');
}

// ============================================================
