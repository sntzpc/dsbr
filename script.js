// Konfigurasi Google Apps Script
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyvHcSzNYZaTow79OYr4Fev0cbPwBkTTk8os4zM7s_tDLTTFtgXk9mLZtCYlZIv9y1oJQ/exec';

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

// Fungsi untuk memuat data dari Google Sheets
async function loadData() {
    try {
        showLoading(true);
        
        // Load apps
        const appsResponse = await fetch(`${SCRIPT_URL}?action=getApps`);
        const appsResult = await appsResponse.json();
        
        if (appsResult.success) {
            appsData = appsResult.data;
        } else {
            console.error('Gagal memuat aplikasi:', appsResult.message);
            appsData = [];
        }
        
        // Load theme
        const themeResponse = await fetch(`${SCRIPT_URL}?action=getTheme`);
        const themeResult = await themeResponse.json();
        
        if (themeResult.success) {
            currentTheme = themeResult.data;
            applyTheme(currentTheme);
        }
        
        // Tampilkan aplikasi
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
    
    if (apps.length === 0) {
        noResultsElement.style.display = 'block';
        return;
    }
    
    noResultsElement.style.display = 'none';
    
    // Urutkan berdasarkan order
    const sortedApps = [...apps].sort((a, b) => a.order - b.order);
    
    sortedApps.forEach(app => {
        const appCard = document.createElement('a');
        appCard.href = app.url.startsWith('http') ? app.url : `https://${app.url}`;
        appCard.className = 'app-card';
        appCard.target = '_blank';
        appCard.rel = 'noopener noreferrer';
        
        appCard.innerHTML = `
            <div class="app-icon" style="background-color: ${app.color || '#1976d2'}">
                <i class="${app.icon || 'fas fa-cube'}"></i>
            </div>
            <span class="app-name">${app.name}</span>
        `;
        
        appsContainer.appendChild(appCard);
    });
}

// Terapkan tema
function applyTheme(theme) {
    if (!theme) return;
    
    const root = document.documentElement;
    
    if (theme.bg_color) {
        root.style.setProperty('--bg-color', theme.bg_color);
    }
    
    if (theme.primary_color) {
        root.style.setProperty('--primary-color', theme.primary_color);
    }
    
    if (theme.text_color) {
        root.style.setProperty('--text-color', theme.text_color);
    }
}

// Toggle tema gelap/terang
function setupThemeToggle() {
    // Ini hanya contoh sederhana, Anda bisa kembangkan lebih lanjut
    themeToggle.addEventListener('click', () => {
        const root = document.documentElement;
        const currentBg = getComputedStyle(root).getPropertyValue('--bg-color');
        
        if (currentBg.includes('#f0f2f5') || currentBg.includes('rgb(240, 242, 245)')) {
            // Ganti ke tema gelap
            root.style.setProperty('--bg-color', '#1a1a1a');
            root.style.setProperty('--secondary-color', '#2d2d2d');
            root.style.setProperty('--text-color', '#ffffff');
            root.style.setProperty('--text-secondary', '#b0b0b0');
            root.style.setProperty('--border-color', '#404040');
        } else {
            // Kembali ke tema terang
            root.style.setProperty('--bg-color', '#f0f2f5');
            root.style.setProperty('--secondary-color', '#ffffff');
            root.style.setProperty('--text-color', '#333333');
            root.style.setProperty('--text-secondary', '#666666');
            root.style.setProperty('--border-color', '#dddddd');
        }
    });
}

// Fungsi pencarian
function setupSearch() {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (!searchTerm) {
            displayApps(appsData);
            return;
        }
        
        const filteredApps = appsData.filter(app => 
            app.name.toLowerCase().includes(searchTerm) || 
            (app.url && app.url.toLowerCase().includes(searchTerm))
        );
        
        displayApps(filteredApps);
        
        // Tampilkan pesan jika tidak ada hasil
        if (filteredApps.length === 0) {
            noResultsElement.style.display = 'block';
        }
    });
}

// Update counter aplikasi
function updateAppCount() {
    appCountElement.textContent = appsData.length;
}

// Tampilkan/menyembunyikan loading
function showLoading(show) {
    loadingElement.style.display = show ? 'block' : 'none';
}

// Tampilkan error
function showError(message) {
    // Buat elemen error sementara
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    
    // Tambahkan ke container
    const container = document.querySelector('.container');
    container.insertBefore(errorDiv, container.firstChild);
    
    // Hapus setelah 5 detik
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Redirect ke halaman admin
function setupAdminButton() {
    adminBtn.addEventListener('click', () => {
        window.location.href = 'admin.html';
    });
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupSearch();
    setupThemeToggle();
    setupAdminButton();
    
    // Refresh data setiap 5 menit
    setInterval(loadData, 5 * 60 * 1000);
});