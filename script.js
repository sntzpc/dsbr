// Konfigurasi Google Apps Script
const SCRIPT_URL = (window.APP_CONFIG && window.APP_CONFIG.SCRIPT_URL) || '';

// ===== Session Keys =====
const LS_SESSION = 'dash_session_v1'; // {token, username, role, group, exp}

// Variabel global
let appsData = [];
let currentTheme = {};

// DOM Elements
const appsContainer = document.getElementById('apps-container');
const loadingElement = document.getElementById('loading');
const noResultsElement = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
const appCountElement = document.getElementById('app-count');
const themeToggle = document.getElementById('theme-toggle');
const adminBtn = document.getElementById('admin-btn');
const logoutBtn = document.getElementById('logout-btn');
const userBadge = document.getElementById('user-badge');
const userNameEl = document.getElementById('user-name');
const pageLoader = document.getElementById('page-loader');

function showPageLoader(text){
  if (!pageLoader) return;
  const t = pageLoader.querySelector('.pl-text');
  if (t && text) t.textContent = text;
  pageLoader.style.display = 'flex';
}
function hidePageLoader(){
  if (!pageLoader) return;
  pageLoader.style.display = 'none';
}


// Login modal elements
const loginModal = document.getElementById('login-modal');
const loginClose = document.getElementById('login-close');
const loginSubmit = document.getElementById('login-submit');
const loginUser = document.getElementById('login-username');
const loginPass = document.getElementById('login-password');
const loginMsg = document.getElementById('login-msg');

function getSession(){
  try{ return JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); }catch(e){ return null; }
}
function setSession(s){
  if (s && typeof s === 'object'){
    if (s.group != null) s.group = String(s.group).trim().toLowerCase();
    if (s.role != null) s.role = String(s.role).trim().toLowerCase();
  }
  localStorage.setItem(LS_SESSION, JSON.stringify(s));
}
function clearSession(){
  localStorage.removeItem(LS_SESSION);
}

// ===== UI helpers =====
function toUpperSafe(s){
  return String(s||'').trim().toUpperCase();
}
function renderUserBadge(){
  const s = getSession();
  const nm = s?.nama || s?.username || '';
  if (!nm){
    if (userBadge) userBadge.style.display = 'none';
    return;
  }
  if (userNameEl) userNameEl.textContent = toUpperSafe(nm);
  if (userBadge) userBadge.style.display = 'flex';
}

function showLoginModal(show){
  loginModal.style.display = show ? 'flex' : 'none';
  loginMsg.style.display = 'none';
  if (show){
    loginUser.value = '';
    loginPass.value = '';
    setTimeout(()=> loginUser.focus(), 50);
  }
}
function showLoginError(msg){
  loginMsg.textContent = msg;
  loginMsg.style.display = 'block';
}

// ===== API =====
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

async function doLogin(username, password){
  const result = await apiPost('login', { username, password });
  if (!result.success) throw new Error(result.message || 'Login gagal');
  setSession(result.data);
  return result.data;
}

async function doLogout(){
  const s = getSession();
  try{
    if (s?.token) await apiPost('logout', { token: s.token });
  }catch(e){}
  clearSession();
}

// ===== Load data =====
async function loadData() {
  try {
    showLoading(true);

    const s = getSession();
    if (!s?.token){
      showLoginModal(true);
      return;
    }

    // Load apps sesuai hak akses
    const appsResult = await apiGet(`?action=getAppsForSession&token=${encodeURIComponent(s.token)}`);
    if (appsResult.success) {
      appsData = appsResult.data || [];
    } else {
      // token invalid/expired
      if ((appsResult.message||'').toLowerCase().includes('expired') || (appsResult.message||'').toLowerCase().includes('token')) {
        await doLogout();
        showLoginModal(true);
        return;
      }
      appsData = [];
      console.error('Gagal memuat aplikasi:', appsResult.message);
    }

    // Load theme (public)
    const themeResult = await apiGet(`?action=getTheme`);
    if (themeResult.success) {
      currentTheme = themeResult.data;
      applyTheme(currentTheme);
    }

    displayApps(appsData);
    updateAppCount();

  } catch (error) {
    console.error('Error loading data:', error);
    showError('Gagal memuat data. Cek koneksi internet.');
  } finally {
    showLoading(false);
  }
}

// Tampilkan aplikasi di grid
function displayApps(apps) {
  appsContainer.innerHTML = '';

  if (!apps || apps.length === 0) {
    noResultsElement.style.display = 'block';
    return;
  }

  noResultsElement.style.display = 'none';

  const sortedApps = [...apps].sort((a, b) => (Number(a.order)||0) - (Number(b.order)||0));

  sortedApps.forEach(app => {
    const appCard = document.createElement('a');
    const url = (app.url || '').trim();
    const href = url.startsWith('http') ? url : `https://${url}`;

    appCard.href = href;
    appCard.className = 'app-card';
    appCard.target = '_blank';
    appCard.rel = 'noopener noreferrer';

    appCard.innerHTML = `
      <div class="app-icon" style="background-color: ${app.color || '#1976d2'}">
          <i class="${app.icon || 'fas fa-cube'}"></i>
      </div>
      <span class="app-name">${app.name || '-'}</span>
    `;

    appsContainer.appendChild(appCard);
  });
}

// Terapkan tema
function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.bg_color) root.style.setProperty('--bg-color', theme.bg_color);
  if (theme.primary_color) root.style.setProperty('--primary-color', theme.primary_color);
  if (theme.text_color) root.style.setProperty('--text-color', theme.text_color);
}

// Toggle tema gelap/terang (local only)
function setupThemeToggle() {
  themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const currentBg = getComputedStyle(root).getPropertyValue('--bg-color').trim();

    if (currentBg.includes('#f0f2f5') || currentBg.includes('rgb(240, 242, 245)')) {
      root.style.setProperty('--bg-color', '#1a1a1a');
      root.style.setProperty('--secondary-color', '#2d2d2d');
      root.style.setProperty('--text-color', '#ffffff');
      root.style.setProperty('--text-secondary', '#b0b0b0');
      root.style.setProperty('--border-color', '#404040');
    } else {
      root.style.setProperty('--bg-color', '#f0f2f5');
      root.style.setProperty('--secondary-color', '#ffffff');
      root.style.setProperty('--text-color', '#333333');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--border-color', '#dddddd');
    }
  });
}

// Pencarian (hanya pada appsData yg sudah terfilter)
function setupSearch() {
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (!searchTerm) {
      displayApps(appsData);
      return;
    }

    const filteredApps = (appsData || []).filter(app =>
      (app.name || '').toLowerCase().includes(searchTerm) ||
      (app.url || '').toLowerCase().includes(searchTerm)
    );

    displayApps(filteredApps);

    if (filteredApps.length === 0) noResultsElement.style.display = 'block';
  });
}

function updateAppCount() {
  appCountElement.textContent = (appsData || []).length;
}

function showLoading(show) {
  loadingElement.style.display = show ? 'block' : 'none';
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${message}</span>`;
  const container = document.querySelector('.container');
  container.insertBefore(errorDiv, container.firstChild);
  setTimeout(() => errorDiv.remove(), 5000);
}

function setupAdminButton() {
  adminBtn.addEventListener('click', () => {
    showPageLoader('Membuka Admin...');
    // kasih 30-80ms supaya overlay sempat render sebelum pindah halaman
    setTimeout(()=> window.location.href = 'admin.html', 50);
  });
}

// ===== Login Modal logic =====
function setupLoginModal(){
  // prevent close if not logged
  loginClose.addEventListener('click', () => {
    const s = getSession();
    if (s?.token) showLoginModal(false);
  });

  loginSubmit.addEventListener('click', async () => {
    const u = loginUser.value.trim();
    const p = loginPass.value.trim();
    if (!u || !p) return showLoginError('Username dan password wajib diisi.');

    loginSubmit.disabled = true;
    loginSubmit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Login...`;

    try{
      await doLogin(u, p);
      renderUserBadge();
      showLoginModal(false);
      await loadData();
    }catch(err){
      showLoginError(err.message || 'Login gagal.');
    }finally{
      loginSubmit.disabled = false;
      loginSubmit.innerHTML = `<i class="fas fa-sign-in-alt"></i> Login`;
    }
  });

  loginPass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginSubmit.click();
  });
  loginUser.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginPass.focus();
  });
}

function setupLogoutButton(){
  logoutBtn.addEventListener('click', async () => {
    await doLogout();
    if (userBadge) userBadge.style.display = 'none';
    appsContainer.innerHTML = '';
    appsData = [];
    updateAppCount();
    showLoginModal(true);
  });
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', async () => {
  setupLoginModal();
  setupSearch();
  setupThemeToggle();
  setupAdminButton();
  setupLogoutButton();

  // jika belum ada session, tampilkan modal login
  const s = getSession();
  if (!s?.token) {
    showLoginModal(true);
    showLoading(false);
  } else {
    renderUserBadge();
    await loadData();
  }

  // Refresh data setiap 5 menit (kalau sudah login)
  setInterval(() => {
    const s2 = getSession();
    if (s2?.token) loadData();
  }, 5 * 60 * 1000);
});
