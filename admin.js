// Konfigurasi Google Apps Script
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyvHcSzNYZaTow79OYr4Fev0cbPwBkTTk8os4zM7s_tDLTTFtgXk9mLZtCYlZIv9y1oJQ/exec';

// Variabel global
let appsData = [];
let currentTheme = {};
let currentEditingId = null;
let isLoggedIn = false;

// DOM Elements
const loginPage = document.getElementById('login-page');
const adminPage = document.getElementById('admin-page');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');

// Tab elements
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

// Modal elements
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

// Hash password sederhana (untuk demo)
function hashPassword(password) {
    // Catatan: Ini hanya untuk demo, untuk produksi gunakan library hash yang lebih aman
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

// Check login status
function checkLogin() {
    const token = localStorage.getItem('dashboard_admin_token');
    if (token) {
        // Verifikasi token
        if (token === hashPassword('123456')) {
            isLoggedIn = true;
            showAdminPage();
            loadAdminData();
        } else {
            localStorage.removeItem('dashboard_admin_token');
        }
    }
}

// Login
function setupLogin() {
    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value.trim();
        
        if (!password) {
            showLoginError('Password tidak boleh kosong');
            return;
        }
        
        // Verifikasi password
        try {
            const response = await fetch(`${SCRIPT_URL}?action=verifyPassword&password=${encodeURIComponent(password)}`);
            const result = await response.json();
            
            if (result.success) {
                // Simpan token
                localStorage.setItem('dashboard_admin_token', hashPassword(password));
                isLoggedIn = true;
                showAdminPage();
                loadAdminData();
            } else {
                showLoginError(result.message || 'Password salah');
            }
        } catch (error) {
            console.error('Login error:', error);
            // Fallback: cek password default
            if (password === '123456') {
                localStorage.setItem('dashboard_admin_token', hashPassword(password));
                isLoggedIn = true;
                showAdminPage();
                loadAdminData();
            } else {
                showLoginError('Password salah');
            }
        }
    });
    
    // Enter untuk login
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });
}

// Logout
function setupLogout() {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('dashboard_admin_token');
        isLoggedIn = false;
        showLoginPage();
    });
}

// Tampilkan halaman login
function showLoginPage() {
    loginPage.style.display = 'block';
    adminPage.style.display = 'none';
    passwordInput.value = '';
    loginError.style.display = 'none';
}

// Tampilkan halaman admin
function showAdminPage() {
    loginPage.style.display = 'none';
    adminPage.style.display = 'block';
}

// Tampilkan error login
function showLoginError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    passwordInput.focus();
}

// Setup tab navigation
function setupTabs() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Update active tab button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Load data untuk admin
async function loadAdminData() {
    try {
        // Load apps
        const appsResponse = await fetch(`${SCRIPT_URL}?action=getApps`);
        const appsResult = await appsResponse.json();
        
        if (appsResult.success) {
            appsData = appsResult.data;
            displayAppsTable();
        }
        
        // Load theme
        const themeResponse = await fetch(`${SCRIPT_URL}?action=getTheme`);
        const themeResult = await themeResponse.json();
        
        if (themeResult.success) {
            currentTheme = themeResult.data;
            updateThemeInputs();
        }
        
    } catch (error) {
        console.error('Error loading admin data:', error);
        showNotification('Gagal memuat data', 'error');
    }
}

// Tampilkan tabel aplikasi
function displayAppsTable() {
    appsTableBody.innerHTML = '';
    
    if (appsData.length === 0) {
        appsTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 30px;">
                    <i class="fas fa-inbox" style="font-size: 40px; color: #ccc; margin-bottom: 10px;"></i>
                    <p>Tidak ada aplikasi. Tambahkan aplikasi baru.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Urutkan berdasarkan order
    const sortedApps = [...appsData].sort((a, b) => a.order - b.order);
    
    sortedApps.forEach((app, index) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${app.name}</td>
            <td><a href="https://${app.url}" target="_blank">${app.url}</a></td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 30px; height: 30px; border-radius: 6px; background-color: ${app.color || '#1976d2'}; display: flex; align-items: center; justify-content: center;">
                        <i class="${app.icon || 'fas fa-cube'}" style="color: white; font-size: 14px;"></i>
                    </div>
                    <span>${app.icon || 'fas fa-cube'}</span>
                </div>
            </td>
            <td><div style="width: 20px; height: 20px; background-color: ${app.color || '#1976d2'}; border-radius: 4px;"></div></td>
            <td>${app.order}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit-btn" data-id="${app.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${app.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        appsTableBody.appendChild(row);
    });
    
    // Add event listeners untuk tombol aksi
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editApp(btn.getAttribute('data-id')));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteApp(btn.getAttribute('data-id')));
    });
}

// Setup modal aplikasi
function setupAppModal() {
    // Open modal untuk tambah aplikasi
    addAppBtn.addEventListener('click', () => {
        currentEditingId = null;
        modalTitle.textContent = 'Tambah Aplikasi Baru';
        resetModalForm();
        appModal.style.display = 'flex';
    });
    
    // Close modal
    modalClose.addEventListener('click', closeModal);
    cancelModalBtn.addEventListener('click', closeModal);
    
    // Close modal saat klik di luar
    window.addEventListener('click', (e) => {
        if (e.target === appModal) {
            closeModal();
        }
    });
    
    // Update icon preview
    appIconSelect.addEventListener('change', () => {
        const selectedClass = appIconSelect.value;
        selectedIcon.innerHTML = `<i class="${selectedClass}"></i>`;
    });
    
    // Save app
    saveAppBtn.addEventListener('click', saveApp);
}

// Reset form modal
function resetModalForm() {
    appNameInput.value = '';
    appUrlInput.value = '';
    appIconSelect.value = 'fas fa-cube';
    appColorInput.value = '#1976d2';
    appOrderInput.value = appsData.length > 0 ? Math.max(...appsData.map(a => a.order)) + 1 : 1;
    selectedIcon.innerHTML = '<i class="fas fa-cube"></i>';
    selectedIcon.style.backgroundColor = '#1976d2';
}

// Close modal
function closeModal() {
    appModal.style.display = 'none';
}

// Edit app
function editApp(id) {
    const app = appsData.find(a => a.id == id);
    if (!app) return;
    
    currentEditingId = id;
    modalTitle.textContent = 'Edit Aplikasi';
    
    appNameInput.value = app.name || '';
    appUrlInput.value = app.url || '';
    appIconSelect.value = app.icon || 'fas fa-cube';
    appColorInput.value = app.color || '#1976d2';
    appOrderInput.value = app.order || 1;
    selectedIcon.innerHTML = `<i class="${app.icon || 'fas fa-cube'}"></i>`;
    selectedIcon.style.backgroundColor = app.color || '#1976d2';
    
    appModal.style.display = 'flex';
}

// Delete app
async function deleteApp(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus aplikasi ini?')) {
        return;
    }
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=deleteApp&id=${id}`);
        const result = await response.json();
        
        if (result.success) {
            showNotification('Aplikasi berhasil dihapus', 'success');
            loadAdminData(); // Refresh data
        } else {
            showNotification('Gagal menghapus aplikasi', 'error');
        }
    } catch (error) {
        console.error('Error deleting app:', error);
        showNotification('Gagal menghapus aplikasi', 'error');
    }
}

// Save app
async function saveApp() {
    const name = appNameInput.value.trim();
    const url = appUrlInput.value.trim();
    const icon = appIconSelect.value;
    const color = appColorInput.value;
    const order = parseInt(appOrderInput.value) || 1;
    
    // Validasi
    if (!name) {
        showNotification('Nama aplikasi tidak boleh kosong', 'error');
        appNameInput.focus();
        return;
    }
    
    if (!url) {
        showNotification('URL aplikasi tidak boleh kosong', 'error');
        appUrlInput.focus();
        return;
    }
    
    // Format URL jika perlu
    let formattedUrl = url;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
    }
    
    try {
        let actionUrl = `${SCRIPT_URL}?action=`;
        let formData = new FormData();
        
        if (currentEditingId) {
            // Update app
            actionUrl += 'updateApp';
            formData.append('id', currentEditingId);
            formData.append('name', name);
            formData.append('url', formattedUrl);
            formData.append('icon', icon);
            formData.append('color', color);
            formData.append('order', order);
        } else {
            // Add new app
            actionUrl += 'addApp';
            formData.append('name', name);
            formData.append('url', formattedUrl);
            formData.append('icon', icon);
            formData.append('color', color);
            formData.append('order', order);
        }
        
        const response = await fetch(actionUrl, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(
                currentEditingId ? 'Aplikasi berhasil diupdate' : 'Aplikasi berhasil ditambahkan', 
                'success'
            );
            closeModal();
            loadAdminData(); // Refresh data
        } else {
            showNotification(result.message || 'Gagal menyimpan aplikasi', 'error');
        }
    } catch (error) {
        console.error('Error saving app:', error);
        showNotification('Gagal menyimpan aplikasi', 'error');
    }
}

// Setup tema
function setupTheme() {
    // Sync color inputs dengan text inputs
    bgColorInput.addEventListener('input', () => {
        bgColorText.value = bgColorInput.value;
        updateThemePreview();
    });
    
    bgColorText.addEventListener('input', () => {
        if (bgColorText.value.match(/^#[0-9A-F]{6}$/i)) {
            bgColorInput.value = bgColorText.value;
            updateThemePreview();
        }
    });
    
    primaryColorInput.addEventListener('input', () => {
        primaryColorText.value = primaryColorInput.value;
        updateThemePreview();
    });
    
    primaryColorText.addEventListener('input', () => {
        if (primaryColorText.value.match(/^#[0-9A-F]{6}$/i)) {
            primaryColorInput.value = primaryColorText.value;
            updateThemePreview();
        }
    });
    
    textColorInput.addEventListener('input', () => {
        textColorText.value = textColorInput.value;
        updateThemePreview();
    });
    
    textColorText.addEventListener('input', () => {
        if (textColorText.value.match(/^#[0-9A-F]{6}$/i)) {
            textColorInput.value = textColorText.value;
            updateThemePreview();
        }
    });
    
    // Save theme
    saveThemeBtn.addEventListener('click', saveTheme);
    
    // Reset theme
    resetThemeBtn.addEventListener('click', resetTheme);
}

// Update theme inputs dengan data yang dimuat
function updateThemeInputs() {
    if (!currentTheme) return;
    
    if (currentTheme.bg_color) {
        bgColorInput.value = currentTheme.bg_color;
        bgColorText.value = currentTheme.bg_color;
    }
    
    if (currentTheme.primary_color) {
        primaryColorInput.value = currentTheme.primary_color;
        primaryColorText.value = currentTheme.primary_color;
    }
    
    if (currentTheme.text_color) {
        textColorInput.value = currentTheme.text_color;
        textColorText.value = currentTheme.text_color;
    }
    
    updateThemePreview();
}

// Update pratinjau tema
function updateThemePreview() {
    const previewApp = document.getElementById('theme-preview-app');
    const previewIcon = previewApp.querySelector('.app-icon');
    
    // Update warna pratinjau
    document.documentElement.style.setProperty('--bg-color', bgColorInput.value);
    document.documentElement.style.setProperty('--primary-color', primaryColorInput.value);
    document.documentElement.style.setProperty('--text-color', textColorInput.value);
    
    // Update warna icon di pratinjau
    previewIcon.style.backgroundColor = primaryColorInput.value;
}

// Simpan tema
async function saveTheme() {
    try {
        const themeData = {
            bg_color: bgColorInput.value,
            primary_color: primaryColorInput.value,
            text_color: textColorInput.value
        };
        
        const formData = new FormData();
        formData.append('bg_color', themeData.bg_color);
        formData.append('primary_color', themeData.primary_color);
        formData.append('text_color', themeData.text_color);
        
        const response = await fetch(`${SCRIPT_URL}?action=saveTheme`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Tema berhasil disimpan', 'success');
            currentTheme = themeData;
        } else {
            showNotification('Gagal menyimpan tema', 'error');
        }
    } catch (error) {
        console.error('Error saving theme:', error);
        showNotification('Gagal menyimpan tema', 'error');
    }
}

// Reset tema ke default
function resetTheme() {
    if (confirm('Reset tema ke default?')) {
        bgColorInput.value = '#f0f2f5';
        bgColorText.value = '#f0f2f5';
        primaryColorInput.value = '#1976d2';
        primaryColorText.value = '#1976d2';
        textColorInput.value = '#333333';
        textColorText.value = '#333333';
        
        updateThemePreview();
        showNotification('Tema direset ke default', 'info');
    }
}

// Setup ganti password
function setupPasswordChange() {
    changePasswordBtn.addEventListener('click', async () => {
        const currentPassword = currentPasswordInput.value.trim();
        const newPassword = newPasswordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();
        
        // Reset pesan
        passwordError.style.display = 'none';
        passwordSuccess.style.display = 'none';
        
        // Validasi
        if (!currentPassword || !newPassword || !confirmPassword) {
            showPasswordError('Semua field harus diisi');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showPasswordError('Password baru dan konfirmasi tidak cocok');
            return;
        }
        
        if (newPassword.length < 6) {
            showPasswordError('Password minimal 6 karakter');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('current_password', currentPassword);
            formData.append('new_password', newPassword);
            
            const response = await fetch(`${SCRIPT_URL}?action=changePassword`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Clear form
                currentPasswordInput.value = '';
                newPasswordInput.value = '';
                confirmPasswordInput.value = '';
                
                // Show success message
                passwordSuccess.style.display = 'block';
                showNotification('Password berhasil diubah', 'success');
                
                // Update token
                localStorage.setItem('dashboard_admin_token', hashPassword(newPassword));
            } else {
                showPasswordError(result.message || 'Gagal mengubah password');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            // Fallback: simpan di localStorage (hanya untuk demo)
            if (currentPassword === '123456' || 
                hashPassword(currentPassword) === localStorage.getItem('dashboard_admin_token')) {
                
                // Update token di localStorage
                localStorage.setItem('dashboard_admin_token', hashPassword(newPassword));
                
                // Clear form
                currentPasswordInput.value = '';
                newPasswordInput.value = '';
                confirmPasswordInput.value = '';
                
                // Show success message
                passwordSuccess.style.display = 'block';
                showNotification('Password berhasil diubah (demo mode)', 'success');
            } else {
                showPasswordError('Password saat ini salah');
            }
        }
    });
}

// Tampilkan error password
function showPasswordError(message) {
    passwordError.textContent = message;
    passwordError.style.display = 'block';
}

// Tampilkan notifikasi
function showNotification(message, type = 'info') {
    // Buat elemen notifikasi
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Tambahkan style
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        background-color: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
        color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
        border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Hapus setelah 5 detik
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
    
    // Tambahkan keyframe animations
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Inisialisasi admin
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    setupLogin();
    setupLogout();
    setupTabs();
    setupAppModal();
    setupTheme();
    setupPasswordChange();
});