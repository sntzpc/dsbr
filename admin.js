// Konfigurasi Google Apps Script
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyvHcSzNYZaTow79OYr4Fev0cbPwBkTTk8os4zM7s_tDLTTFtgXk9mLZtCYlZIv9y1oJQ/exec';

// ===== Session Keys =====
const LS_SESSION = 'dash_session_v1'; // {token, username, role, group, exp}
function getSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)||'null'); }catch(e){ return null; } }
function setSession(s){ localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

// ===== API helpers =====
async function apiGet(path){
  const res = await fetch(`${SCRIPT_URL}${path}`);
  return res.json();
}
async function apiPost(action, data){
  const fd = new FormData();
  Object.keys(data||{}).forEach(k => fd.append(k, data[k]));
  const res = await fetch(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`, { method:'POST', body: fd });
  return res.json();
}

// ===== Globals =====
let appsData = [];
let currentTheme = {};
let currentEditingId = null;
let me = null; // {token, username, role, group, exp}

// ===== DOM =====
const loginPage = document.getElementById('login-page');
const adminPage = document.getElementById('admin-page');

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

const usernameInput = document.getElementById('username');
const newNama = document.getElementById('new-nama');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');

const btnGoDashboard = document.getElementById('btn-go-dashboard');
const btnDashboardTop = document.getElementById('btn-dashboard');

// Tabs
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Apps tab
const appsTableBody = document.getElementById('apps-table-body');
const addAppBtn = document.getElementById('add-app-btn');

// Theme tab
const bgColorInput = document.getElementById('bg-color');
const bgColorText = document.getElementById('bg-color-text');
const primaryColorInput = document.getElementById('primary-color');
const primaryColorText = document.getElementById('primary-color-text');
const textColorInput = document.getElementById('text-color');
const textColorText = document.getElementById('text-color-text');
const saveThemeBtn = document.getElementById('save-theme-btn');
const resetThemeBtn = document.getElementById('reset-theme-btn');

// Password tab
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordError = document.getElementById('password-error');
const passwordSuccess = document.getElementById('password-success');

// Modal app
const appModal = document.getElementById('app-modal');
const modalTitle = document.getElementById('modal-title');
const appNameInput = document.getElementById('app-name');
const appUrlInput = document.getElementById('app-url');
const appIconSelect = document.getElementById('app-icon');
const appColorInput = document.getElementById('app-color');
const appOrderInput = document.getElementById('app-order');
const selectedIcon = document.getElementById('selected-icon');
const saveAppBtn = document.getElementById('save-app-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const modalClose = document.querySelector('.modal-close');

// Users tab
const usersTBody = document.getElementById('users-table-body');
const btnAddUser = document.getElementById('btn-add-user');
const userModal = document.getElementById('user-modal');
const userModalClose = document.getElementById('user-modal-close');
const btnCancelUser = document.getElementById('btn-cancel-user');
const btnSaveUser = document.getElementById('btn-save-user');
const newUsername = document.getElementById('new-username');
const newRole = document.getElementById('new-role');
const newGroup = document.getElementById('new-group');
const userModalMsg = document.getElementById('user-modal-msg');

// Groups tab
const groupSelect = document.getElementById('group-select');
const ddAvailable = document.getElementById('dd-available');
const ddAllowed = document.getElementById('dd-allowed');
const btnSaveGroup = document.getElementById('btn-save-group');
const btnAddGroup = document.getElementById('btn-add-group');
const btnDelGroup = document.getElementById('btn-del-group');

let groupsMap = {}; // group -> {app_ids:[]}
let usersData = [];
let currentGroup = 'default';

// ===== UI basics =====
function showLoginPage(){
  loginPage.style.display = 'block';
  adminPage.style.display = 'none';
  usernameInput.value = '';
  passwordInput.value = '';
  loginError.style.display = 'none';
  setTimeout(()=> usernameInput.focus(), 50);
}
function showAdminPage(){
  loginPage.style.display = 'none';
  adminPage.style.display = 'block';
}
function showLoginError(message){
  loginError.textContent = message;
  loginError.style.display = 'block';
}
function showPasswordError(message){
  passwordError.textContent = message;
  passwordError.style.display = 'block';
}
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    padding: 15px 20px; border-radius: 8px;
    background-color: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
    color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
    border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
    display: flex; align-items: center; gap: 10px;
    z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 5000);

  if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
}

// ===== Role restrictions =====
function applyRoleUI(){
  const isAdmin = (me?.role === 'admin');

  // hide nav buttons that are admin-only
  navBtns.forEach(btn => {
    const adminOnly = btn.getAttribute('data-admin-only') === '1';
    if (adminOnly) btn.style.display = isAdmin ? '' : 'none';
  });

  // hide admin-only tab content blocks
  const usersTab = document.getElementById('users-tab');
  const groupsTab = document.getElementById('groups-tab');
  const themeTab = document.getElementById('theme-tab');
  const appsTab = document.getElementById('apps-tab');

  if (!isAdmin){
    // user hanya bisa password-tab
    if (usersTab) usersTab.style.display = 'none';
    if (groupsTab) groupsTab.style.display = 'none';
    if (themeTab) themeTab.style.display = 'none';
    if (appsTab) appsTab.style.display = 'none';

    // force active tab = password
    navBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    const passBtn = [...navBtns].find(b => b.getAttribute('data-tab') === 'password-tab');
    if (passBtn) passBtn.classList.add('active');
    const passTab = document.getElementById('password-tab');
    if (passTab) passTab.classList.add('active');
  }
}

// ===== Auth =====
async function doLogin(username, password){
  const result = await apiPost('login', { username, password });
  if (!result.success) throw new Error(result.message || 'Login gagal');
  setSession(result.data);
  me = result.data;
  return me;
}
async function doLogout(){
  try{
    const s = getSession();
    if (s?.token) await apiPost('logout', { token: s.token });
  }catch(e){}
  clearSession();
  me = null;
}
async function checkSession(){
  const s = getSession();
  if (!s?.token) return false;
  // optional ping
  const ping = await apiGet(`?action=whoami&token=${encodeURIComponent(s.token)}`);
  if (!ping.success) {
    clearSession();
    return false;
  }
  me = ping.data;
  setSession(me);
  return true;
}

// ===== Tabs =====
function setupTabs(){
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) content.classList.add('active');
      });
    });
  });
}

// ===== Load admin data =====
async function loadAdminData(){
  try{
    // Apps (untuk admin only)
    if (me.role === 'admin'){
      const appsResult = await apiGet(`?action=getApps`);
      if (appsResult.success){
        appsData = appsResult.data || [];
        displayAppsTable();
      }
    }

    // Theme (admin only)
    const themeResult = await apiGet(`?action=getTheme`);
    if (themeResult.success){
      currentTheme = themeResult.data;
      updateThemeInputs();
    }

    // Users + Groups (admin only)
    if (me.role === 'admin'){
      await loadUsers();
      await loadGroups();
    }
  }catch(err){
    console.error(err);
    showNotification('Gagal memuat data admin', 'error');
  }
}

// ===== Apps CRUD (admin only) =====
function displayAppsTable(){
  if (!appsTableBody) return;
  appsTableBody.innerHTML = '';

  if (!appsData.length){
    appsTableBody.innerHTML = `
      <tr><td colspan="7" style="text-align:center; padding:30px;">
      <i class="fas fa-inbox" style="font-size:40px; color:#ccc; margin-bottom:10px;"></i>
      <p>Tidak ada aplikasi. Tambahkan aplikasi baru.</p>
      </td></tr>`;
    return;
  }

  const sorted = [...appsData].sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  sorted.forEach((app, idx) => {
    const row = document.createElement('tr');
    const url = (app.url||'').trim();
    row.innerHTML = `
      <td>${idx+1}</td>
      <td>${app.name||''}</td>
      <td><a href="${url.startsWith('http')?url:`https://${url}`}" target="_blank">${url}</a></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:30px; height:30px; border-radius:6px; background-color:${app.color||'#1976d2'}; display:flex; align-items:center; justify-content:center;">
            <i class="${app.icon||'fas fa-cube'}" style="color:#fff; font-size:14px;"></i>
          </div>
          <span>${app.icon||'fas fa-cube'}</span>
        </div>
      </td>
      <td><div style="width:20px; height:20px; background-color:${app.color||'#1976d2'}; border-radius:4px;"></div></td>
      <td>${app.order||''}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-id="${app.id}"><i class="fas fa-edit"></i></button>
          <button class="action-btn delete-btn" data-id="${app.id}"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    appsTableBody.appendChild(row);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => editApp(btn.dataset.id)));
  document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteApp(btn.dataset.id)));
}

function setupAppModal(){
  if (!addAppBtn) return;

  addAppBtn.addEventListener('click', () => {
    currentEditingId = null;
    modalTitle.textContent = 'Tambah Aplikasi Baru';
    resetModalForm();
    appModal.style.display = 'flex';
  });

  modalClose.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);

  window.addEventListener('click', (e) => { if (e.target === appModal) closeModal(); });

  appIconSelect.addEventListener('change', () => {
    selectedIcon.innerHTML = `<i class="${appIconSelect.value}"></i>`;
  });

  saveAppBtn.addEventListener('click', saveApp);
}

function resetModalForm(){
  appNameInput.value = '';
  appUrlInput.value = '';
  appIconSelect.value = 'fas fa-cube';
  appColorInput.value = '#1976d2';
  appOrderInput.value = appsData.length ? (Math.max(...appsData.map(a => Number(a.order)||0)) + 1) : 1;
  selectedIcon.innerHTML = '<i class="fas fa-cube"></i>';
  selectedIcon.style.backgroundColor = '#1976d2';
}
function closeModal(){ appModal.style.display = 'none'; }

function editApp(id){
  const app = appsData.find(a => String(a.id) === String(id));
  if (!app) return;

  currentEditingId = id;
  modalTitle.textContent = 'Edit Aplikasi';
  appNameInput.value = app.name || '';
  appUrlInput.value = app.url || '';
  appIconSelect.value = app.icon || 'fas fa-cube';
  appColorInput.value = app.color || '#1976d2';
  appOrderInput.value = app.order || 1;
  selectedIcon.innerHTML = `<i class="${app.icon||'fas fa-cube'}"></i>`;
  selectedIcon.style.backgroundColor = app.color || '#1976d2';

  appModal.style.display = 'flex';
}

async function deleteApp(id){
  if (!confirm('Apakah Anda yakin ingin menghapus aplikasi ini?')) return;

  try{
    const result = await apiPost('deleteApp', { token: me.token, id });
    if (result.success){
      showNotification('Aplikasi berhasil dihapus', 'success');
      await loadAdminData();
    } else {
      showNotification(result.message || 'Gagal menghapus aplikasi', 'error');
    }
  }catch(err){
    console.error(err);
    showNotification('Gagal menghapus aplikasi', 'error');
  }
}

async function saveApp(){
  const name = appNameInput.value.trim();
  const url = appUrlInput.value.trim();
  const icon = appIconSelect.value;
  const color = appColorInput.value;
  const order = parseInt(appOrderInput.value) || 1;

  if (!name) return showNotification('Nama aplikasi tidak boleh kosong', 'error');
  if (!url) return showNotification('URL aplikasi tidak boleh kosong', 'error');

  let formattedUrl = url;
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try{
    const payload = { token: me.token, name, url: formattedUrl, icon, color, order };
    let result;
    if (currentEditingId){
      payload.id = currentEditingId;
      result = await apiPost('updateApp', payload);
    } else {
      result = await apiPost('addApp', payload);
    }
    if (result.success){
      showNotification(currentEditingId ? 'Aplikasi berhasil diupdate' : 'Aplikasi berhasil ditambahkan', 'success');
      closeModal();
      await loadAdminData();
    } else {
      showNotification(result.message || 'Gagal menyimpan aplikasi', 'error');
    }
  }catch(err){
    console.error(err);
    showNotification('Gagal menyimpan aplikasi', 'error');
  }
}

// ===== Theme =====
function setupTheme(){
  if (!bgColorInput) return;

  bgColorInput.addEventListener('input', () => { bgColorText.value = bgColorInput.value; updateThemePreview(); });
  bgColorText.addEventListener('input', () => { if (bgColorText.value.match(/^#[0-9A-F]{6}$/i)) { bgColorInput.value = bgColorText.value; updateThemePreview(); } });

  primaryColorInput.addEventListener('input', () => { primaryColorText.value = primaryColorInput.value; updateThemePreview(); });
  primaryColorText.addEventListener('input', () => { if (primaryColorText.value.match(/^#[0-9A-F]{6}$/i)) { primaryColorInput.value = primaryColorText.value; updateThemePreview(); } });

  textColorInput.addEventListener('input', () => { textColorText.value = textColorInput.value; updateThemePreview(); });
  textColorText.addEventListener('input', () => { if (textColorText.value.match(/^#[0-9A-F]{6}$/i)) { textColorInput.value = textColorText.value; updateThemePreview(); } });

  saveThemeBtn.addEventListener('click', saveTheme);
  resetThemeBtn.addEventListener('click', resetTheme);
}

function updateThemeInputs(){
  if (!currentTheme) return;
  if (currentTheme.bg_color){ bgColorInput.value = currentTheme.bg_color; bgColorText.value = currentTheme.bg_color; }
  if (currentTheme.primary_color){ primaryColorInput.value = currentTheme.primary_color; primaryColorText.value = currentTheme.primary_color; }
  if (currentTheme.text_color){ textColorInput.value = currentTheme.text_color; textColorText.value = currentTheme.text_color; }
  updateThemePreview();
}
function updateThemePreview(){
  document.documentElement.style.setProperty('--bg-color', bgColorInput.value);
  document.documentElement.style.setProperty('--primary-color', primaryColorInput.value);
  document.documentElement.style.setProperty('--text-color', textColorInput.value);
  const previewApp = document.getElementById('theme-preview-app');
  if (previewApp){
    const previewIcon = previewApp.querySelector('.app-icon');
    if (previewIcon) previewIcon.style.backgroundColor = primaryColorInput.value;
  }
}
async function saveTheme(){
  if (me.role !== 'admin') return showNotification('Tidak punya izin.', 'error');
  try{
    const result = await apiPost('saveTheme', {
      token: me.token,
      bg_color: bgColorInput.value,
      primary_color: primaryColorInput.value,
      text_color: textColorInput.value
    });
    if (result.success){
      showNotification('Tema berhasil disimpan', 'success');
    } else {
      showNotification(result.message || 'Gagal menyimpan tema', 'error');
    }
  }catch(err){
    console.error(err);
    showNotification('Gagal menyimpan tema', 'error');
  }
}
function resetTheme(){
  if (confirm('Reset tema ke default?')){
    bgColorInput.value = '#f0f2f5'; bgColorText.value = '#f0f2f5';
    primaryColorInput.value = '#1976d2'; primaryColorText.value = '#1976d2';
    textColorInput.value = '#333333'; textColorText.value = '#333333';
    updateThemePreview();
    showNotification('Tema direset ke default (belum disimpan)', 'info');
  }
}

// ===== Password change (self only) =====
function setupPasswordChange(){
  changePasswordBtn.addEventListener('click', async () => {
    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    passwordError.style.display = 'none';
    passwordSuccess.style.display = 'none';

    if (!currentPassword || !newPassword || !confirmPassword) return showPasswordError('Semua field harus diisi');
    if (newPassword !== confirmPassword) return showPasswordError('Password baru dan konfirmasi tidak cocok');
    if (newPassword.length < 6) return showPasswordError('Password minimal 6 karakter');

    try{
      const result = await apiPost('changeMyPassword', {
        token: me.token,
        current_password: currentPassword,
        new_password: newPassword
      });
      if (result.success){
        currentPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        passwordSuccess.style.display = 'block';
        showNotification('Password berhasil diubah', 'success');

        // refresh session (optional)
        const ping = await apiGet(`?action=whoami&token=${encodeURIComponent(me.token)}`);
        if (ping.success){ me = ping.data; setSession(me); }
      } else {
        showPasswordError(result.message || 'Gagal mengubah password');
      }
    }catch(err){
      console.error(err);
      showPasswordError('Gagal mengubah password');
    }
  });
}

// ===== Users (admin only) =====
async function loadUsers(){
  const result = await apiGet(`?action=listUsers&token=${encodeURIComponent(me.token)}`);
  if (!result.success) throw new Error(result.message||'Gagal load users');
  usersData = result.data || [];
  renderUsersTable();
}
function renderUsersTable(){
  usersTBody.innerHTML = '';
  if (!usersData.length){
    usersTBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center;">Belum ada user</td></tr>`;
    return;
  }
  usersData.forEach((u, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${u.group}</td>
      <td>${u.active ? 'YA' : 'TIDAK'}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-act="reset" data-u="${u.username}" title="Reset password ke user123">
            <i class="fas fa-undo"></i>
          </button>
          <button class="action-btn delete-btn" data-act="del" data-u="${u.username}" title="Hapus user">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    usersTBody.appendChild(tr);
  });

  usersTBody.querySelectorAll('button[data-act="reset"]').forEach(b => {
    b.addEventListener('click', async ()=> {
      const uname = b.dataset.u;
      if (!confirm(`Reset password ${uname} menjadi user123?`)) return;
      const r = await apiPost('resetUserPassword', { token: me.token, username: uname });
      if (r.success){ showNotification('Password direset ke user123', 'success'); }
      else showNotification(r.message||'Gagal reset', 'error');
    });
  });

  usersTBody.querySelectorAll('button[data-act="del"]').forEach(b => {
    b.addEventListener('click', async ()=> {
      const uname = b.dataset.u;
      if (uname === me.username) return showNotification('Tidak bisa menghapus user yang sedang login.', 'error');
      if (!confirm(`Hapus user ${uname}?`)) return;
      const r = await apiPost('deleteUser', { token: me.token, username: uname });
      if (r.success){ showNotification('User dihapus', 'success'); await loadUsers(); }
      else showNotification(r.message||'Gagal hapus', 'error');
    });
  });
}

function openUserModal(){
  userModalMsg.style.display = 'none';
  newUsername.value = '';
  if (newNama) newNama.value = '';
  newRole.value = 'user';
  // newGroup options sudah diisi dari loadGroups
  userModal.style.display = 'flex';
  setTimeout(()=> newUsername.focus(), 50);
}
function closeUserModal(){ userModal.style.display = 'none'; }

function setupUsersUI(){
  if (!btnAddUser) return;
  btnAddUser.addEventListener('click', openUserModal);
  userModalClose.addEventListener('click', closeUserModal);
  btnCancelUser.addEventListener('click', closeUserModal);
  window.addEventListener('click', (e)=> { if (e.target === userModal) closeUserModal(); });

  btnSaveUser.addEventListener('click', async ()=>{
    const u = newUsername.value.trim();
    const nama = (newNama?.value || '').trim();
    const role = newRole.value;
    const grp = newGroup.value;

    userModalMsg.style.display = 'none';
    if (!u) { userModalMsg.textContent = 'Username wajib diisi'; userModalMsg.style.display='block'; return; }

    const r = await apiPost('addUser', { token: me.token, username: u, nama, role, group: grp });
    if (r.success){
      showNotification('User ditambahkan (password awal user123)', 'success');
      closeUserModal();
      await loadUsers();
    } else {
      userModalMsg.textContent = r.message || 'Gagal menambah user';
      userModalMsg.style.display = 'block';
    }
  });
}

// ===== Groups access (admin only) =====
async function loadGroups(){
  const res = await apiGet(`?action=listGroups&token=${encodeURIComponent(me.token)}`);
  if (!res.success) throw new Error(res.message||'Gagal load groups');

  groupsMap = {}; // reset
  (res.data || []).forEach(g => {
    groupsMap[g.group] = { app_ids: (g.app_ids || []).map(String) };
  });

  // fill select
  groupSelect.innerHTML = '';
  Object.keys(groupsMap).sort().forEach(gname => {
    const opt = document.createElement('option');
    opt.value = gname;
    opt.textContent = gname;
    groupSelect.appendChild(opt);
  });

  // sync newGroup options in user modal
  newGroup.innerHTML = '';
  Object.keys(groupsMap).sort().forEach(gname => {
    const opt = document.createElement('option');
    opt.value = gname;
    opt.textContent = gname;
    newGroup.appendChild(opt);
  });

  // choose current
  if (!groupsMap[currentGroup]) currentGroup = Object.keys(groupsMap)[0] || 'default';
  groupSelect.value = currentGroup;

  // Ensure apps loaded (for drag list)
  const appsRes = await apiGet(`?action=getApps`);
  if (appsRes.success) appsData = appsRes.data || [];

  renderGroupDnD();
}

function renderGroupDnD(){
  const allowed = new Set((groupsMap[currentGroup]?.app_ids || []).map(String));

  ddAvailable.innerHTML = '';
  ddAllowed.innerHTML = '';

  const sortedApps = [...appsData].sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  sortedApps.forEach(app => {
    const el = createDnDItem(app);
    if (allowed.has(String(app.id))) ddAllowed.appendChild(el);
    else ddAvailable.appendChild(el);
  });

  // droppable areas
  setupDropZone(ddAvailable);
  setupDropZone(ddAllowed);
}

function createDnDItem(app){
  const wrap = document.createElement('div');
  wrap.className = 'dd-item';
  wrap.draggable = true;
  wrap.dataset.appId = String(app.id);

  const badge = document.createElement('div');
  badge.className = 'dd-badge';
  badge.style.background = app.color || '#1976d2';
  badge.innerHTML = `<i class="${app.icon||'fas fa-cube'}"></i>`;

  const left = document.createElement('div');
  left.className = 'left';
  left.appendChild(badge);

  const meta = document.createElement('div');
  meta.innerHTML = `<div style="font-weight:700;">${app.name||'-'}</div>
                    <div class="dd-hint">${(app.url||'').replace(/^https?:\/\//,'')}</div>`;
  left.appendChild(meta);

  const right = document.createElement('div');
  right.innerHTML = `<i class="fas fa-grip-vertical" style="opacity:.5;"></i>`;

  wrap.appendChild(left);
  wrap.appendChild(right);

  wrap.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/plain', wrap.dataset.appId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(()=> wrap.style.opacity = '0.5', 0);
  });
  wrap.addEventListener('dragend', ()=>{
    wrap.style.opacity = '1';
  });

  return wrap;
}

function setupDropZone(zone){
  zone.addEventListener('dragover', (e)=>{
    e.preventDefault();
    zone.style.borderColor = 'var(--primary-color)';
  });
  zone.addEventListener('dragleave', ()=>{
    zone.style.borderColor = 'var(--border-color)';
  });
  zone.addEventListener('drop', (e)=>{
    e.preventDefault();
    zone.style.borderColor = 'var(--border-color)';
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const item = document.querySelector(`.dd-item[data-app-id="${CSS.escape(id)}"]`);
    if (item && zone !== item.parentElement) zone.appendChild(item);
  });
}

function getAllowedIdsFromUI(){
  return [...ddAllowed.querySelectorAll('.dd-item')].map(el => el.dataset.appId);
}

function setupGroupsUI(){
  groupSelect.addEventListener('change', ()=>{
    currentGroup = groupSelect.value;
    renderGroupDnD();
  });

  btnSaveGroup.addEventListener('click', async ()=>{
    const ids = getAllowedIdsFromUI();
    const r = await apiPost('saveGroupApps', {
      token: me.token,
      group: currentGroup,
      app_ids: ids.join(',')
    });
    if (r.success){
      showNotification('Akses group tersimpan', 'success');
      // update local groupsMap
      groupsMap[currentGroup] = { app_ids: ids.map(String) };
    } else {
      showNotification(r.message || 'Gagal menyimpan', 'error');
    }
  });

  btnAddGroup.addEventListener('click', async ()=>{
    const name = prompt('Nama group baru? (contoh: mandor)');
    if (!name) return;
    const r = await apiPost('addGroup', { token: me.token, group: name.trim() });
    if (r.success){
      showNotification('Group dibuat', 'success');
      currentGroup = name.trim();
      await loadGroups();
    } else showNotification(r.message || 'Gagal buat group', 'error');
  });

  btnDelGroup.addEventListener('click', async ()=>{
    const g = groupSelect.value;
    if (!g) return;
    if (g === 'admin') return showNotification('Group admin tidak boleh dihapus.', 'error');
    if (!confirm(`Hapus group "${g}"?`)) return;
    const r = await apiPost('deleteGroup', { token: me.token, group: g });
    if (r.success){
      showNotification('Group dihapus', 'success');
      currentGroup = 'default';
      await loadGroups();
    } else showNotification(r.message || 'Gagal hapus group', 'error');
  });
}

// ===== Navigation buttons =====
function setupNavButtons(){
  btnGoDashboard?.addEventListener('click', ()=> window.location.href = 'index.html');
  btnDashboardTop?.addEventListener('click', ()=> window.location.href = 'index.html');
}

// ===== Login UI =====
function setupLogin(){
  loginBtn.addEventListener('click', async ()=>{
    const u = usernameInput.value.trim();
    const p = passwordInput.value.trim();
    if (!u || !p) return showLoginError('Username dan password wajib diisi');

    loginBtn.disabled = true;
    loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Login...`;

    try{
      await doLogin(u,p);
      showAdminPage();
      applyRoleUI();
      await loadAdminData();
    }catch(err){
      showLoginError(err.message || 'Login gagal');
    }finally{
      loginBtn.disabled = false;
      loginBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Login`;
    }
  });

  passwordInput.addEventListener('keypress', (e)=>{ if (e.key === 'Enter') loginBtn.click(); });
  usernameInput.addEventListener('keypress', (e)=>{ if (e.key === 'Enter') passwordInput.focus(); });
}

function setupLogout(){
  logoutBtn.addEventListener('click', async ()=>{
    await doLogout();
    showLoginPage();
  });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=>{
  setupNavButtons();
  setupTabs();
  setupLogin();
  setupLogout();

  setupAppModal();
  setupTheme();
  setupPasswordChange();

  setupUsersUI();
  setupGroupsUI();

  // nonaktifkan login box lama (tetap ada, tapi tidak dipakai)
    try{
        if (loginBtn) loginBtn.disabled = true;
        if (usernameInput) usernameInput.disabled = true;
        if (passwordInput) passwordInput.disabled = true;
        const note = document.querySelector('#login-page .info-note');
        if (note) note.innerHTML = 'Login dilakukan dari Dashboard. Klik <b>Dashboard</b> untuk login.';
    }catch(e){}

  const ok = await checkSession();
    if (!ok){
    // ✅ tidak pakai login admin lagi, arahkan ke dashboard (modal login ada di sana)
    loginPage.style.display = 'none'; // hide, tidak dihapus
    adminPage.style.display = 'none';
    window.location.href = 'index.html';
    return;
    } else {
    // ✅ hide login page lama
    loginPage.style.display = 'none';
    showAdminPage();
    applyRoleUI();
    await loadAdminData();
    }
});
