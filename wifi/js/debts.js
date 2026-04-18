(function(){
  const DEBT_STATUSES = ['BELUM_LUNAS','SEBAGIAN','LUNAS'];
  const DEBT_RECIPIENTS = ['BASE','PARTNER','OWNER'];

  function currentPeriodKey(){
    return String(todayDateIso() || '').slice(0,7);
  }

  function periodLabel(period=''){
    if(!/^\d{4}-\d{2}$/.test(String(period||''))) return period || '-';
    const [y,m] = String(period).split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[(m||1)-1] || String(m).padStart(2,'0')} ${y}`;
  }

  function debtRecipientLabel(type){
    if(type==='BASE') return 'Base';
    if(type==='PARTNER') return getConfig().partnerName || 'Partner';
    if(type==='OWNER') return getConfig().ownerName || 'Owner';
    return type || '-';
  }

  function debtCategoryChildName(recipientType){
    if(recipientType==='BASE') return 'To Base';
    if(recipientType==='PARTNER') return `To ${getConfig().partnerName || 'Partner'}`;
    return `To ${getConfig().ownerName || 'Owner'}`;
  }

  function debtGroupKey(period, recipientType, recipientName){
    return [String(period||''), String(recipientType||''), String(recipientName||'').trim().toLowerCase()].join('::');
  }

  function lastPaymentInfo(payments=[]){
    const arr = Array.isArray(payments) ? payments.slice() : [];
    if(!arr.length) return null;
    return arr.sort((a,b)=>`${b.postingDate || b.date || ''} ${b.postingTime || b.time || ''}`.localeCompare(`${a.postingDate || a.date || ''} ${a.postingTime || a.time || ''}`))[0] || null;
  }

  function normalizeDebt(row={}){
    const principal = Number(row.principalAmount || row.amount || 0);
    const paid = Number(row.paidAmount || 0);
    const remaining = Math.max(0, principal - paid);
    const status = remaining <= 0 ? 'LUNAS' : (paid > 0 ? 'SEBAGIAN' : 'BELUM_LUNAS');
    const payments = Array.isArray(row.payments) ? row.payments : [];
    const lastPayment = lastPaymentInfo(payments);
    return {
      id: row.id || uuid(),
      groupKey: row.groupKey || debtGroupKey(row.period || '', row.recipientType || 'PARTNER', row.recipientName || '-'),
      period: row.period || '',
      debtDate: row.debtDate || todayDateIso(),
      debtTime: row.debtTime || '23:59:59',
      recipientType: row.recipientType || 'PARTNER',
      recipientName: row.recipientName || '-',
      principalAmount: principal,
      paidAmount: paid,
      remainingAmount: remaining,
      status,
      notes: row.notes || '',
      updatedAt: row.updatedAt || `${nowParts().display} WIB`,
      payments,
      sourceRowKeys: Array.isArray(row.sourceRowKeys) ? row.sourceRowKeys : (row.sourceRowKey ? [row.sourceRowKey] : []),
      lastBurdenPeriod: row.lastBurdenPeriod || lastPayment?.burdenPeriod || '',
      lastPostingDate: row.lastPostingDate || lastPayment?.postingDate || '',
      lastPostingTime: row.lastPostingTime || lastPayment?.postingTime || ''
    };
  }

  function debtRows(filters = APP.state.debtFilters || {}){
    const { startDate='', endDate='', status='ALL', recipientType='ALL', period='', search='' } = filters;
    const q = String(search||'').trim().toLowerCase();
    return (APP.state.debts || [])
      .map(normalizeDebt)
      .filter(x => !startDate || x.debtDate >= startDate)
      .filter(x => !endDate || x.debtDate <= endDate)
      .filter(x => status==='ALL' || x.status===status)
      .filter(x => recipientType==='ALL' || x.recipientType===recipientType)
      .filter(x => !period || x.period===period)
      .filter(x => {
        if(!q) return true;
        const hay = [x.recipientName,x.notes,x.period,periodLabel(x.period),String(x.principalAmount),String(x.remainingAmount),x.lastBurdenPeriod,periodLabel(x.lastBurdenPeriod)].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a,b)=>`${b.debtDate} ${b.debtTime}`.localeCompare(`${a.debtDate} ${a.debtTime}`));
  }

  function debtSummary(filters = APP.state.debtFilters || {}){
    const rows = debtRows(filters);
    return {
      rows,
      principal: rows.reduce((s,x)=>s+Number(x.principalAmount||0),0),
      paid: rows.reduce((s,x)=>s+Number(x.paidAmount||0),0),
      remaining: rows.reduce((s,x)=>s+Number(x.remainingAmount||0),0),
      unpaidCount: rows.filter(x=>x.status!=='LUNAS').length
    };
  }

  async function saveDebt(row){
    const debt = normalizeDebt(row);
    await DB.put(STORES.debts, debt);
    return debt;
  }

  function groupedProfitRows(period){
    const map = new Map();
    const rows = rowsForPeriod(period, 'BAGIHASIL');
    rows.forEach(row=>{
      const recipientType = row.recipientType || (String(row.recipientKey||'').split('::')[0] || 'PARTNER');
      const recipientName = row.recipientLabel || debtRecipientLabel(recipientType);
      const key = debtGroupKey(period, recipientType, recipientName);
      if(!map.has(key)){
        map.set(key, {
          period,
          recipientType,
          recipientName,
          principalAmount: 0,
          sourceRowKeys: [],
          sourceCount: 0
        });
      }
      const item = map.get(key);
      item.principalAmount += Number(row.nominal || 0);
      item.sourceCount += 1;
      if(row.rowKey) item.sourceRowKeys.push(row.rowKey);
    });
    return [...map.values()].filter(x=>x.principalAmount > 0);
  }

  async function postProfitPeriodToDebts(period){
    const groups = groupedProfitRows(period);
    if(!groups.length) return { created:0, skipped:0 };
    const debtDate = endOfPeriodDate(period);
    const debtTime = '23:59:59';
    let created = 0, skipped = 0;
    const existingRows = (APP.state.debts || []).map(normalizeDebt);
    for(const group of groups){
      const existing = existingRows.find(x => x.groupKey === debtGroupKey(period, group.recipientType, group.recipientName));
      if(existing){ skipped++; continue; }
      await saveDebt({
        id: uuid(),
        groupKey: debtGroupKey(period, group.recipientType, group.recipientName),
        period,
        debtDate,
        debtTime,
        recipientType: group.recipientType,
        recipientName: group.recipientName,
        principalAmount: group.principalAmount,
        paidAmount: 0,
        notes: `Bagi hasil ${group.recipientName} periode ${periodLabel(period)} (${group.sourceCount} baris sumber).`,
        payments: [],
        sourceRowKeys: group.sourceRowKeys,
        updatedAt: `${nowParts().display} WIB`
      });
      created++;
    }
    APP.state.debts = await DB.getAll(STORES.debts);
    return { created, skipped };
  }

  async function payDebtById(debtId, amount, burdenPeriod, paymentNotes=''){
    const debt = normalizeDebt(await DB.get(STORES.debts, debtId));
    if(!debt || !debt.id) throw new Error('Data hutang tidak ditemukan.');
    const payAmount = Math.min(Number(amount||0), Number(debt.remainingAmount||0));
    if(payAmount <= 0) throw new Error('Nominal pembayaran harus lebih dari 0.');
    const postingPeriod = burdenPeriod || currentPeriodKey();
    const postingDate = endOfPeriodDate(postingPeriod);
    const postingTime = '23:59:59';
    const isPartial = payAmount < Number(debt.remainingAmount||0);
    const defaultNote = ` ${periodLabel(debt.period)}${isPartial ? ' ' : ''}`;
    const finalNote = String(paymentNotes || '').trim() || defaultNote;
    const categoryPath = await ensureMainCategory('PENGELUARAN','Bagi Hasil', debtCategoryChildName(debt.recipientType));
    const payment = {
      id: uuid(),
      debtId: debt.id,
      amount: payAmount,
      burdenPeriod: postingPeriod,
      postingDate,
      postingTime,
      notes: finalNote,
      paidAtLabel: `${nowParts().display} WIB`
    };
    const updated = normalizeDebt({
      ...debt,
      paidAmount: Number(debt.paidAmount||0) + payAmount,
      payments: [...(debt.payments || []), payment],
      lastBurdenPeriod: postingPeriod,
      lastPostingDate: postingDate,
      lastPostingTime: postingTime,
      updatedAt: `${nowParts().display} WIB`
    });
    const mainTx = {
      id: uuid(),
      type: 'PENGELUARAN',
      categoryPath,
      categoryPathNames: categoryPathNames(categoryPath),
      amount: payAmount,
      notes: `${finalNote} · Penerima ${debt.recipientName} · Beban ${periodLabel(postingPeriod)}${isPartial ? ' · dibayar sebagian' : ''}`,
      date: postingDate,
      time: postingTime,
      source: 'DEBT_PAYMENT',
      debtId: debt.id,
      debtRecipientType: debt.recipientType,
      debtRecipientName: debt.recipientName,
      debtSourcePeriod: debt.period,
      burdenPeriod: postingPeriod,
      updatedAt: `${nowParts().display} WIB`
    };
    await DB.put(STORES.mainTransactions, mainTx);
    await DB.put(STORES.debts, updated);
    return updated;
  }

  function openDebtModal(debtId=''){
    const debt = debtId ? normalizeDebt(APP.state.debts.find(x=>x.id===debtId) || {}) : null;
    if(!debt?.id) return showToast('Data hutang tidak ditemukan.', 'error');
    const modalRoot = document.getElementById('modalRoot');
    const periods = [...new Set([
      ...(APP.state.moduleTransactions || []).map(x=>String(x.date||'').slice(0,7)).filter(Boolean),
      ...(APP.state.mainTransactions || []).map(x=>String(x.date||'').slice(0,7)).filter(Boolean),
      currentPeriodKey()
    ])].sort().reverse();
    const defaultBurdenPeriod = currentPeriodKey();
    modalRoot.innerHTML = `<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div class="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
        <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">Pembayaran Hutang Bagi Hasil</h3><p class="text-sm text-slate-500 dark:text-slate-400">Pilih periode pembebanan. Tanggal transaksi otomatis menjadi tanggal terakhir pada periode tersebut.</p></div><button id="closeDebtModalBtn" class="rounded-2xl border px-3 py-2 text-sm font-semibold">Tutup</button></div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 text-sm">
          <div><div class="text-slate-500 dark:text-slate-400">Periode Hutang</div><div class="font-semibold">${escapeHtml(periodLabel(debt.period))}</div></div>
          <div><div class="text-slate-500 dark:text-slate-400">Penerima</div><div class="font-semibold">${escapeHtml(debt.recipientName || '-')}</div></div>
          <div><div class="text-slate-500 dark:text-slate-400">Status</div><div class="font-semibold">${escapeHtml(debt.status || '-')}</div></div>
          <div><div class="text-slate-500 dark:text-slate-400">Sisa Hutang</div><div class="font-semibold text-amber-600">Rp ${rupiah(debt.remainingAmount || 0)}</div></div>
        </div>
        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Dibebankan ke Periode</span><select id="debtBurdenPeriod" class="w-full rounded-2xl border px-3 py-2">${periods.map(p=>`<option value="${p}" ${p===defaultBurdenPeriod?'selected':''}>${periodLabel(p)}</option>`).join('')}</select></label>
          <div class="text-sm md:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">Tanggal transaksi utama akan dicatat otomatis pada <strong id="debtPostingDateInfo">${formatDate(endOfPeriodDate(defaultBurdenPeriod))}</strong> jam <strong>23:59:59</strong>.</div>
          <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nominal Bayar</span><input id="debtPayAmount" type="number" min="1" max="${Number(debt.remainingAmount || 0)}" value="${Number(debt.remainingAmount || 0)}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Catatan</span><input id="debtPayNotes" type="text" value="" placeholder="Kosongkan untuk catatan otomatis" class="w-full rounded-2xl border px-3 py-2"></label>
        </div>
        <div class="mt-4 flex justify-end gap-2"><button id="saveDebtPaymentBtn" class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" data-debt-id="${escapeHtml(debt.id || '')}">Simpan Pembayaran</button></div>
      </div>
    </div>`;

    document.getElementById('closeDebtModalBtn')?.addEventListener('click', ()=>{ modalRoot.innerHTML=''; });
    document.getElementById('debtBurdenPeriod')?.addEventListener('change', (e)=>{
      const targetDate = endOfPeriodDate(e.target.value || currentPeriodKey());
      const el = document.getElementById('debtPostingDateInfo');
      if(el) el.textContent = formatDate(targetDate);
    });
    document.getElementById('saveDebtPaymentBtn')?.addEventListener('click', async (e)=>{
      try{
        const amount = Number(document.getElementById('debtPayAmount')?.value || 0);
        const burdenPeriod = document.getElementById('debtBurdenPeriod')?.value || currentPeriodKey();
        const paymentNotes = document.getElementById('debtPayNotes')?.value || '';
        await payDebtById(e.target.dataset.debtId, amount, burdenPeriod, paymentNotes);
        await loadState();
        modalRoot.innerHTML='';
        render();
        showToast('Pembayaran hutang berhasil dicatat ke Transaksi Utama.');
      }catch(err){
        showToast(err.message || String(err), 'error');
      }
    });
  }

  function debtStatusBadge(status){
    const cls = status==='LUNAS' ? 'badge-emerald' : (status==='SEBAGIAN' ? 'badge-blue' : 'badge-amber');
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }

  function debtsPage(){
    const summary = debtSummary();
    const periods = [...new Set((APP.state.debts || []).map(x=>x.period).filter(Boolean))].sort().reverse();
    return `<div class="space-y-4">
      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 class="text-xl font-bold">Hutang Bagi Hasil</h2><p class="text-sm text-slate-500 dark:text-slate-400">Hutang dicatat per periode dan penerima. Pembayaran dibebankan ke periode yang dipilih dan otomatis masuk ke Transaksi Utama pada tanggal akhir periode pembebanan.</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="exportDebtXlsxBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Hutang Excel</button>
            <button id="exportDebtPdfBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Hutang PDF</button>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          ${card('Total Hutang Awal', `Rp ${rupiah(summary.principal)}`, `${summary.rows.length} baris hutang`, 'text-rose-600')}
          ${card('Sudah Dibayar', `Rp ${rupiah(summary.paid)}`, 'Pembayaran yang sudah masuk transaksi utama', 'text-blue-600')}
          ${card('Sisa Hutang', `Rp ${rupiah(summary.remaining)}`, `${summary.unpaidCount} baris belum lunas`, summary.remaining>0?'text-amber-600':'text-emerald-600')}
          ${card('Baris Belum Lunas', `${summary.unpaidCount}`, 'Status BELUM_LUNAS / SEBAGIAN', 'text-purple-600')}
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="grid grid-cols-1 gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
          <input id="debtFilterStart" type="date" value="${APP.state.debtFilters.startDate || ''}" class="rounded-2xl border px-3 py-2">
          <input id="debtFilterEnd" type="date" value="${APP.state.debtFilters.endDate || ''}" class="rounded-2xl border px-3 py-2">
          <select id="debtFilterStatus" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Status</option>${DEBT_STATUSES.map(s=>`<option value="${s}" ${APP.state.debtFilters.status===s?'selected':''}>${s}</option>`).join('')}</select>
          <select id="debtFilterRecipient" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Penerima</option>${DEBT_RECIPIENTS.map(s=>`<option value="${s}" ${APP.state.debtFilters.recipientType===s?'selected':''}>${escapeHtml(debtRecipientLabel(s))}</option>`).join('')}</select>
          <select id="debtFilterPeriod" class="rounded-2xl border px-3 py-2"><option value="">Semua Periode</option>${periods.map(p=>`<option value="${p}" ${APP.state.debtFilters.period===p?'selected':''}>${periodLabel(p)}</option>`).join('')}</select>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <input id="debtFilterSearch" type="text" value="${escapeHtml(APP.state.debtFilters.search || '')}" placeholder="Cari penerima/periode/catatan" class="min-w-[260px] flex-1 rounded-2xl border px-3 py-2">
          <button id="resetDebtFiltersBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Reset Filter</button>
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Hutang</th><th class="px-3 py-2 text-left">Periode Hutang</th><th class="px-3 py-2 text-left">Penerima</th><th class="px-3 py-2 text-right">Hutang Awal</th><th class="px-3 py-2 text-right">Terbayar</th><th class="px-3 py-2 text-right">Sisa</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Pembebanan Terakhir</th><th class="px-3 py-2 text-left">Update Terakhir</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>
          ${summary.rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.debtDate,row.debtTime)}</td><td class="px-3 py-2">${escapeHtml(periodLabel(row.period))}</td><td class="px-3 py-2">${escapeHtml(row.recipientName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(row.principalAmount)}</td><td class="px-3 py-2 text-right text-blue-600">Rp ${rupiah(row.paidAmount)}</td><td class="px-3 py-2 text-right ${row.remainingAmount>0?'text-amber-600 font-semibold':'text-emerald-600 font-semibold'}">Rp ${rupiah(row.remainingAmount)}</td><td class="px-3 py-2">${debtStatusBadge(row.status)}</td><td class="px-3 py-2">${row.lastBurdenPeriod ? `${escapeHtml(periodLabel(row.lastBurdenPeriod))} · ${formatDate(row.lastPostingDate || '')}` : '-'}</td><td class="px-3 py-2">${escapeHtml(row.updatedAt || '-')}</td><td class="px-3 py-2 text-center">${row.status==='LUNAS' ? '-' : `<button data-pay-debt="${row.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-blue-600">Bayar</button>`}</td></tr>`).join('') || `<tr><td colspan="10" class="px-3 py-8 text-center text-slate-500">Belum ada data hutang bagi hasil.</td></tr>`}
        </tbody></table></div>
      </section>
    </div>`;
  }

  function exportDebtXlsx(){
    if(!window.XLSX) return showToast('Library Excel belum termuat.', 'error');
    const rows = debtRows().map(x=>({
      TanggalHutang: formatDateTime(x.debtDate,x.debtTime),
      PeriodeHutang: periodLabel(x.period),
      Penerima: x.recipientName,
      HutangAwal: Number(x.principalAmount||0),
      Terbayar: Number(x.paidAmount||0),
      Sisa: Number(x.remainingAmount||0),
      Status: x.status,
      PembebananTerakhir: x.lastBurdenPeriod ? periodLabel(x.lastBurdenPeriod) : '',
      TanggalPostingTerakhir: x.lastPostingDate ? formatDateTime(x.lastPostingDate, x.lastPostingTime || '23:59:59') : '',
      UpdateTerakhir: x.updatedAt || '',
      Catatan: x.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{Info:'Tidak ada data hutang'}]), 'Hutang Bagi Hasil');
    XLSX.writeFile(wb, `hutang-bagi-hasil-${todayDateIso()}.xlsx`);
  }

  function exportDebtPdf(){
    if(!(window.jspdf && window.jspdf.jsPDF)) return showToast('Library PDF belum termuat.', 'error');
    const doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
    const rows = debtRows();
    let y = 36;
    doc.setFontSize(16); doc.text('Laporan Hutang Bagi Hasil', 40, y); y += 22;
    doc.setFontSize(10); doc.text(`Dicetak: ${nowParts().display} WIB`, 40, y); y += 18;
    doc.autoTable({
      startY:y,
      head:[[ 'Tanggal Hutang','Periode Hutang','Penerima','Hutang Awal','Terbayar','Sisa','Status','Pembebanan Terakhir' ]],
      body: rows.length ? rows.map(r=>[
        formatDateTime(r.debtDate,r.debtTime),
        periodLabel(r.period),
        r.recipientName,
        `Rp ${rupiah(r.principalAmount)}`,
        `Rp ${rupiah(r.paidAmount)}`,
        `Rp ${rupiah(r.remainingAmount)}`,
        r.status,
        r.lastBurdenPeriod ? `${periodLabel(r.lastBurdenPeriod)} · ${formatDate(r.lastPostingDate || '')}` : '-'
      ]) : [['Tidak ada data','','','','','','','']],
      styles:{fontSize:8}
    });
    doc.save(`hutang-bagi-hasil-${todayDateIso()}.pdf`);
  }

  function bindDebtEvents(){
    document.getElementById('debtFilterStart')?.addEventListener('change', e=>{ APP.state.debtFilters.startDate=e.target.value; render(); });
    document.getElementById('debtFilterEnd')?.addEventListener('change', e=>{ APP.state.debtFilters.endDate=e.target.value; render(); });
    document.getElementById('debtFilterStatus')?.addEventListener('change', e=>{ APP.state.debtFilters.status=e.target.value; render(); });
    document.getElementById('debtFilterRecipient')?.addEventListener('change', e=>{ APP.state.debtFilters.recipientType=e.target.value; render(); });
    document.getElementById('debtFilterPeriod')?.addEventListener('change', e=>{ APP.state.debtFilters.period=e.target.value; render(); });
    document.getElementById('debtFilterSearch')?.addEventListener('input', e=>{ APP.state.debtFilters.search=e.target.value; scheduleRender({ preserveInputId:'debtFilterSearch', preserveCursor:true }); });
    document.getElementById('resetDebtFiltersBtn')?.addEventListener('click', ()=>{ APP.state.debtFilters={ startDate:'', endDate:'', status:'ALL', recipientType:'ALL', period:'', search:'' }; render(); });
    document.querySelectorAll('[data-pay-debt]').forEach(btn=>btn.addEventListener('click', ()=> openDebtModal(btn.dataset.payDebt)));
    document.getElementById('exportDebtXlsxBtn')?.addEventListener('click', exportDebtXlsx);
    document.getElementById('exportDebtPdfBtn')?.addEventListener('click', exportDebtPdf);
  }

  window.normalizeDebt = normalizeDebt;
  window.debtRows = debtRows;
  window.debtSummary = debtSummary;
  window.postProfitPeriodToDebts = postProfitPeriodToDebts;
  window.payDebtById = payDebtById;
  window.debtsPage = debtsPage;
  window.bindDebtEvents = bindDebtEvents;
  window.exportDebtXlsx = exportDebtXlsx;
  window.exportDebtPdf = exportDebtPdf;
  window.debtRecipientLabel = debtRecipientLabel;
  window.periodLabel = window.periodLabel || periodLabel;
})();
