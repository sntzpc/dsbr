// BOOKING PAGE
// ============================================================
async function loadBookingPage() {
  const dateEl = document.getElementById('book-date');
  if (!dateEl.value) dateEl.value = todayStr();
  STATE.selectedOp = null;
  STATE.selectedTimeSlot = null;
  await Promise.all([loadOperatorsForBook(), loadServicesForBook()]);
  loadBookingSlots();
}

async function loadOperatorsForBook() {
  const el = document.getElementById('operator-list-book');
  try {
    const ops = await api('admin.getOperators');
    STATE._operators = ops;
    el.innerHTML = ops.map(op => `
      <div class="operator-chip" id="opchip-${op.operatorId}" onclick="selectOperator('${op.operatorId}')">
        <div class="op-avatar">${op.photoInitial || op.name.charAt(0)}</div>
        <div class="op-info">
          <div class="op-name">${op.name}</div>
          <div class="op-sub">${op.speciality || 'Pemangkas Profesional'}</div>
        </div>
        <span class="chip" id="slot-${op.operatorId}">...</span>
      </div>`).join('') || '<div class="text-muted text-small">Belum ada operator terdaftar</div>';
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat operator</div>'; }
}

async function loadServicesForBook() {
  const sel = document.getElementById('book-service');
  try {
    const svcs = await api('admin.getServices');
    STATE._services = svcs;
    sel.innerHTML = '<option value="">-- Pilih Layanan --</option>' + svcs.map(s =>
      `<option value="${s.serviceId}">${s.name} — Rp${Number(s.price).toLocaleString('id')} (${s.durationMin} mnt)</option>`
    ).join('');
  } catch(e) {}
}

async function loadBookingSlots() {
  const date = document.getElementById('book-date').value;
  if (!date) return;
  STATE.selectedDate = date;
  STATE.selectedTimeSlot = null;
  try {
    const slots = await api('booking.getDailySlots', { date });
    STATE._dailySlots = slots;
    slots.operators.forEach(op => {
      const el = document.getElementById('slot-' + op.operatorId);
      if (el) el.textContent = op.available > 0 ? op.available + ' slot' : 'Penuh';
    });
    renderTimeSlotsForSelectedOperator();
    updateBookSummary();
  } catch(e) {}
}

function selectOperator(opId) {
  document.querySelectorAll('.operator-chip').forEach(c => c.classList.remove('selected'));
  const chip = document.getElementById('opchip-' + opId);
  if (chip) chip.classList.add('selected');
  STATE.selectedOp = opId;
  STATE.selectedTimeSlot = null;
  renderTimeSlotsForSelectedOperator();
  updateBookSummary();
}

function renderTimeSlotsForSelectedOperator() {
  const el = document.getElementById('time-slot-list');
  if (!el) return;
  if (!STATE.selectedOp) {
    el.innerHTML = '<div class="text-muted text-small">Pilih operator terlebih dahulu.</div>';
    return;
  }
  const opSlots = (STATE._dailySlots?.operators || []).find(o => o.operatorId === STATE.selectedOp);
  if (!opSlots || !opSlots.slots || !opSlots.slots.length) {
    el.innerHTML = '<div class="text-muted text-small">Slot jam belum tersedia. Cek pengaturan jam buka/tutup.</div>';
    return;
  }
  el.innerHTML = opSlots.slots.map(s => `
    <button type="button" class="time-slot-btn ${s.isFull ? 'disabled' : ''}" ${s.isFull ? 'disabled' : ''} onclick="selectTimeSlot('${s.time}')">
      <b>${s.time}</b><span>${s.isFull ? 'Penuh' : s.available + ' tersedia'}</span>
    </button>`).join('');
}

function selectTimeSlot(time) {
  STATE.selectedTimeSlot = time;
  document.querySelectorAll('.time-slot-btn').forEach(btn => btn.classList.toggle('selected', btn.textContent.trim().startsWith(time)));
  updateBookSummary();
}

function updateBookSummary() {
  const date = document.getElementById('book-date').value;
  const svcId = document.getElementById('book-service').value;
  const opId = STATE.selectedOp;
  const timeSlot = STATE.selectedTimeSlot;
  const summary = document.getElementById('book-summary');
  const content = document.getElementById('book-summary-content');
  if (!date || !svcId || !opId || !timeSlot) { summary.classList.add('hidden'); return; }

  const op = (STATE._operators || []).find(o => o.operatorId === opId);
  const svc = (STATE._services || []).find(s => s.serviceId === svcId);
  if (!op || !svc) return;

  summary.classList.remove('hidden');
  content.innerHTML = `
    <div class="row"><span class="text-muted text-small">Tanggal</span><span class="text-small">${formatDate(date)}</span></div>
    <div class="row mt-8"><span class="text-muted text-small">Jam</span><span class="text-small text-gold fw-bold">${timeSlot}</span></div>
    <div class="row mt-8"><span class="text-muted text-small">Operator</span><span class="text-small">${op.name}</span></div>
    <div class="row mt-8"><span class="text-muted text-small">Layanan</span><span class="text-small">${svc.name}</span></div>
    <div class="row mt-8"><span class="text-muted text-small">Harga</span><span class="text-small text-gold fw-bold">Rp${Number(svc.price).toLocaleString('id')}</span></div>`;
}

async function doBooking() {
  const date = document.getElementById('book-date').value;
  const svcId = document.getElementById('book-service').value;
  const notes = document.getElementById('book-notes').value;
  if (!date) return toast('Pilih tanggal kunjungan', 'error');
  if (!STATE.selectedOp) return toast('Pilih operator / pemangkas', 'error');
  if (!STATE.selectedTimeSlot) return toast('Pilih jam pelayanan', 'error');
  if (!svcId) return toast('Pilih layanan', 'error');
  if (!STATE.user) return toast('Anda perlu login dulu', 'error');

  try {
    const result = await api('booking.create', {
      userId      : STATE.user.userId,
      customerName: STATE.user.name,
      phone       : STATE.user.phone,
      date,
      timeSlot    : STATE.selectedTimeSlot,
      operatorId  : STATE.selectedOp,
      serviceId   : svcId,
      notes,
    });
    openModal(`
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:12px">✅</div>
        <div class="modal-title">Booking Berhasil!</div>
        <div class="text-muted text-small" style="margin-bottom:20px">Nomor antrian Anda</div>
        <div class="big-queue">${result.queueNumber}</div>
        <div class="text-muted text-small" style="margin-top:8px">Tanggal: ${formatDate(result.date)}</div>
        <div class="text-muted text-small">Jam Pelayanan: <b>${result.timeSlot}</b></div>
        <div class="text-muted text-small">Operator: ${result.operatorName}</div>
        <div class="text-muted text-small">Layanan: ${result.serviceName}</div>
        <div style="margin-top:24px">
          <button class="btn btn-gold" onclick="closeModal();navigateTo('page-home');loadHomePage()">Pantau Antrian</button>
        </div>
      </div>`);
    await loadBookingSlots();
  } catch(err) { toast(err.message, 'error'); }
}

// ============================================================
