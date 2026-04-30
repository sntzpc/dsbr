// MY BOOKINGS
// ============================================================
async function loadMyBookings() {
  const el = document.getElementById('my-bookings-list');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const bookings = await api('booking.getByUser', { userId: STATE.user.userId });
    if (!bookings.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Belum ada riwayat booking</div></div>';
      return;
    }
    el.innerHTML = bookings.map(b => `
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <div>
            <div class="fw-bold">${b.serviceName}</div>
            <div class="text-muted text-small mt-4">✂ ${b.operatorName}</div>
            <div class="text-muted text-small mt-4">📅 ${formatDate(b.date)}</div>
            <div class="text-muted text-small mt-4">🕒 ${b.timeSlot || '-'}</div>
          </div>
          <div style="text-align:right">
            ${statusBadge(b.status)}
            <div class="text-gold fw-bold text-small mt-8">Rp${Number(b.price).toLocaleString('id')}</div>
            <div class="text-muted text-small mt-4">Order #${displayOrderNo(b)}</div>
          </div>
        </div>
        ${b.status==='waiting'?`<div style="margin-top:12px"><button class="btn btn-danger btn-sm" onclick="cancelBooking('${b.bookingId}')">Batalkan Booking</button></div>`:''}
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="text-muted text-small">Gagal memuat riwayat</div>'; }
}

async function cancelBooking(bookingId) {
  if (!confirm('Yakin ingin membatalkan booking ini?')) return;
  try {
    await api('booking.cancel', { bookingId, userId: STATE.user.userId });
    toast('Booking dibatalkan', 'success');
    loadMyBookings();
  } catch(err) { toast(err.message, 'error'); }
}

// ============================================================
