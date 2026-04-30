// ADMIN PANEL
// ============================================================
function adminTab(tab) {
  const tabs = ['dashboard','calendar','operators','services','settings'];
  tabs.forEach(t => {
    const panel = document.getElementById(`admin-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#page-admin .auth-tab').forEach((el, i) => {
    el.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'dashboard') loadAdminDashboard();
  if (tab === 'calendar') loadAdminCalendar();
  if (tab === 'operators') loadAdminOperators();
  if (tab === 'services') loadAdminServices();
  if (tab === 'settings') loadAdminSettingsForm();
}

async function loadAdminDashboard() {
  const statsEl = document.getElementById('admin-daily-stats');
  const bookEl = document.getElementById('admin-today-bookings');
  try {
    const rpt = await api('report.daily', { date: todayStr() });
    statsEl.innerHTML = `
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num">${rpt.totalBookings}</div><div class="stat-label">Total Booking</div></div>
        <div class="stat-box"><div class="stat-num">${rpt.totalDone}</div><div class="stat-label">Selesai</div></div>
        <div class="stat-box"><div class="stat-num">${rpt.totalCancelled}</div><div class="stat-label">Dibatalkan</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:1.1rem">Rp${(rpt.totalRevenue/1000).toFixed(0)}k</div><div class="stat-label">Pendapatan</div></div>
      </div>`;

    const bookings = await api('booking.getByDate', { date: todayStr() });
    if (!bookings.length) {
      bookEl.innerHTML = '<div class="empty-text text-muted">Belum ada booking hari ini</div>';
    } else {
      bookEl.innerHTML = `<div class="table-wrap"><table>
        <tr><th>Order</th><th>Jam</th><th>Nama</th><th>Operator</th><th>Layanan</th><th>Status</th></tr>
        ${bookings.map(b => `<tr>
          <td><b>#${displayOrderNo(b)}</b></td>
          <td><b>${b.timeSlot || '-'}</b></td>
          <td>${b.customerName}</td>
          <td>${(b.operatorName || '').split(' ')[0]}</td>
          <td>${b.serviceName}</td>
          <td>${statusBadge(b.status)}</td>
        </tr>`).join('')}
      </table></div>`;
    }
  } catch(e) { statsEl.innerHTML = '<div class="text-muted text-small">Gagal memuat dashboard</div>'; }
}

async function loadAdminCalendar() {
  const input = document.getElementById('admin-calendar-month');
  const el = document.getElementById('admin-calendar-grid');
  if (!input || !el) return;
  if (!input.value) input.value = todayStr().slice(0, 7);
  const [year, month] = input.value.split('-').map(Number);
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await api('admin.getMonthlyCalendar', { year, month });
    renderCalendarGrid(el, year, month, data.days, 'Admin');
  } catch (err) {
    el.innerHTML = '<div class="text-muted text-small">Gagal memuat kalender: '+err.message+'</div>';
  }
}

function renderCalendarGrid(container, year, month, daysMap, sourceLabel) {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const startPad = first.getDay(); // Minggu = 0
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="calendar-cell empty-cell"></div>');
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const day = daysMap && daysMap[date] ? daysMap[date] : null;
    const total = day ? day.total : 0;
    cells.push(`
      <button type="button" class="calendar-cell ${total ? 'has-booking' : ''}" onclick="showCalendarDay('${date}', '${encodeURIComponent(JSON.stringify(day || {date,total:0,bookings:[]}))}')">
        <span class="calendar-day-num">${d}</span>
        <span class="calendar-total">${total ? total + ' booking' : '–'}</span>
      </button>`);
  }
  container.innerHTML = `
    <div class="calendar-weekdays"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div>
    <div class="calendar-grid">${cells.join('')}</div>`;
}

function showCalendarDay(date, encodedDay) {
  const day = JSON.parse(decodeURIComponent(encodedDay));
  const bookings = day.bookings || [];
  openModal(`
    <div class="modal-title">Booking ${formatDate(date)}</div>
    ${!bookings.length ? '<div class="empty-text text-muted">Belum ada booking pada tanggal ini.</div>' : `
      <div class="table-wrap"><table>
        <tr><th>Order</th><th>Jam</th><th>Nama</th><th>Operator</th><th>Layanan</th><th>Status</th></tr>
        ${bookings.map(b => `<tr>
          <td><b>#${displayOrderNo(b)}</b></td>
          <td><b>${b.timeSlot || '-'}</b></td>
          <td>${b.customerName}<div class="text-muted text-small">${b.phone || ''}</div></td>
          <td>${b.operatorName || '-'}</td>
          <td>${b.serviceName || '-'}</td>
          <td>${statusBadge(b.status)}</td>
        </tr>`).join('')}
      </table></div>`}
  `);
}

async function loadAdminOperators() {
  const el = document.getElementById('admin-op-list');
  try {
    const ops = await api('admin.getOperators');
    if (!ops.length) { el.innerHTML = '<div class="empty-text text-muted">Belum ada operator</div>'; return; }
    el.innerHTML = ops.map(op => `
      <div class="operator-chip" style="cursor:default">
        <div class="op-avatar">${op.photoInitial || op.name.charAt(0)}</div>
        <div class="op-info">
          <div class="op-name">${op.name}</div>
          <div class="op-sub">${op.speciality || '–'} · ${op.phone || '–'}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteOperator('${op.operatorId}')">Hapus</button>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat operator</div>'; }
}

function showAddOperatorModal() {
  openModal(`
    <div class="modal-title">Tambah Operator</div>
    <div class="field"><label>Nama</label><input type="text" id="new-op-name" placeholder="Nama Operator"/></div>
    <div class="field"><label>No. HP</label><input type="tel" id="new-op-phone" placeholder="08xxxxxxxxxx"/></div>
    <div class="field"><label>Spesialisasi</label><input type="text" id="new-op-spec" placeholder="Contoh: Fade & Undercut"/></div>
    <button class="btn btn-gold" onclick="saveOperator()">Simpan Operator</button>
  `);
}

async function saveOperator() {
  const name = document.getElementById('new-op-name').value.trim();
  const phone = document.getElementById('new-op-phone').value.trim();
  const speciality = document.getElementById('new-op-spec').value.trim();
  if (!name) return toast('Nama wajib diisi', 'error');
  try {
    await api('admin.saveOperator', { name, phone, speciality });
    toast('Operator disimpan', 'success');
    closeModal();
    loadAdminOperators();
  } catch(err) { toast(err.message, 'error'); }
}

async function deleteOperator(id) {
  if (!confirm('Hapus operator ini?')) return;
  try {
    await api('admin.deleteOperator', { operatorId: id });
    toast('Operator dihapus', 'success');
    loadAdminOperators();
  } catch(err) { toast(err.message, 'error'); }
}

async function loadAdminServices() {
  const el = document.getElementById('admin-svc-list');
  try {
    const svcs = await api('admin.getServices');
    if (!svcs.length) { el.innerHTML = '<div class="empty-text text-muted">Belum ada layanan</div>'; return; }
    el.innerHTML = svcs.map(s => `
      <div class="card" style="margin-bottom:10px;background:var(--bg3)">
        <div class="row">
          <div>
            <div class="fw-bold">${s.name}</div>
            <div class="text-muted text-small mt-4">Rp${Number(s.price).toLocaleString('id')} · ${s.durationMin} menit</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteService('${s.serviceId}')">Hapus</button>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat layanan</div>'; }
}

function showAddServiceModal() {
  openModal(`
    <div class="modal-title">Tambah Layanan</div>
    <div class="field"><label>Nama Layanan</label><input type="text" id="new-svc-name" placeholder="Nama Layanan"/></div>
    <div class="field"><label>Harga (Rp)</label><input type="number" id="new-svc-price" placeholder="25000"/></div>
    <div class="field"><label>Durasi (menit)</label><input type="number" id="new-svc-dur" placeholder="30"/></div>
    <button class="btn btn-gold" onclick="saveService()">Simpan Layanan</button>
  `);
}

async function saveService() {
  const name = document.getElementById('new-svc-name').value.trim();
  const price = document.getElementById('new-svc-price').value;
  const durationMin = document.getElementById('new-svc-dur').value;
  if (!name || !price) return toast('Nama dan harga wajib diisi', 'error');
  try {
    await api('admin.saveService', { name, price, durationMin });
    toast('Layanan disimpan', 'success');
    closeModal();
    loadAdminServices();
  } catch(err) { toast(err.message, 'error'); }
}

async function deleteService(id) {
  if (!confirm('Hapus layanan ini?')) return;
  try {
    await api('admin.deleteService', { serviceId: id });
    toast('Layanan dihapus', 'success');
    loadAdminServices();
  } catch(err) { toast(err.message, 'error'); }
}

async function loadAdminSettings() {
  try {
    const s = await api('admin.getSettings');
    STATE._settings = s;
    if (s.BARBERSHOP_NAME) {
      document.querySelectorAll('.topbar-title').forEach(el => {
        el.innerHTML = `<span>✂</span> ${s.BARBERSHOP_NAME}`;
      });
    }
  } catch(e) {}
}

async function loadAdminSettingsForm() {
  const el = document.getElementById('admin-settings-form');
  try {
    const s = await api('admin.getSettings');
    el.innerHTML = `
      <div class="field"><label>Nama Barbershop</label><input type="text" id="s-name" value="${s.BARBERSHOP_NAME||''}"/></div>
      <div class="field"><label>Jam Buka</label><input type="time" id="s-open" value="${s.OPEN_HOUR||'08:00'}"/></div>
      <div class="field"><label>Jam Tutup</label><input type="time" id="s-close" value="${s.CLOSE_HOUR||'21:00'}"/></div>
      <div class="field"><label>Kapasitas Harian (total)</label><input type="number" id="s-cap" value="${s.MAX_CAPACITY_DAY||50}"/></div>
      <div class="field"><label>Jumlah Kursi</label><input type="number" id="s-seats" value="${s.SEATS||3}"/></div>
      <div class="field"><label>Durasi Slot (menit)</label><input type="number" id="s-dur" value="${s.SLOT_DURATION_MIN||30}"/></div>
      <button class="btn btn-gold" onclick="saveSettings()">Simpan Pengaturan</button>`;
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat pengaturan</div>'; }
}

async function saveSettings() {
  try {
    await api('admin.saveSettings', { settings: {
      BARBERSHOP_NAME  : document.getElementById('s-name').value,
      OPEN_HOUR        : document.getElementById('s-open').value,
      CLOSE_HOUR       : document.getElementById('s-close').value,
      MAX_CAPACITY_DAY : document.getElementById('s-cap').value,
      SEATS            : document.getElementById('s-seats').value,
      SLOT_DURATION_MIN: document.getElementById('s-dur').value,
    }});
    toast('Pengaturan disimpan', 'success');
    loadAdminSettings();
  } catch(err) { toast(err.message, 'error'); }
}

// ============================================================
