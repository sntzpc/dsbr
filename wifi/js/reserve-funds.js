const RESERVE_FUNDS = {
  ZAKAT: { key:'ZAKAT', label:'Zakat', icon:'🕌', keyword:'zakat' },
  INFAQ: { key:'INFAQ', label:'Infaq', icon:'🤲', keyword:'infaq' },
  PENYUSUTAN: { key:'PENYUSUTAN', label:'Penyusutan', icon:'🧰', keyword:'penyusutan' }
};

function resetReserveForm(keepFund=false){
  const prev = APP.state.forms.reserve || {};
  APP.state.forms.reserve = {
    fundType: keepFund ? (prev.fundType || 'ZAKAT') : 'ZAKAT',
    entryType: keepFund ? (prev.entryType || 'CREDIT') : 'CREDIT',
    amountRaw: 0,
    notes: '',
    date: keepFund ? (prev.date || todayDateIso()) : todayDateIso(),
    time: currentTimeWIB()
  };
  APP.state.editReserveId = null;
}
function reserveFundInfo(key){ return RESERVE_FUNDS[key] || RESERVE_FUNDS.ZAKAT; }
function reserveAutoKeywordMap(){
  return Object.values(RESERVE_FUNDS).map(x=>({ fundType:x.key, keyword:x.keyword }));
}
function detectReserveFundFromMainTx(tx){
  if(!tx || tx.type !== 'PENGELUARAN') return null;
  const hay = [ ...(tx.categoryPathNames||[]), tx.notes||'' ].join(' ').toLowerCase();
  const hit = reserveAutoKeywordMap().find(x => hay.includes(x.keyword));
  return hit?.fundType || null;
}
function reserveLinkedByMainId(mainId=''){
  return APP.state.reserveTransactions.find(x => x.sourceMainTransactionId === mainId) || null;
}
async function syncReserveAutoFromMainTransaction(mainTx){
  if(!mainTx?.id) return;
  const fundType = detectReserveFundFromMainTx(mainTx);
  const existing = await DB.getByIndex(STORES.reserveTransactions, 'sourceMainTransactionId', mainTx.id);
  if(!fundType){
    if(existing?.id) await DB.delete(STORES.reserveTransactions, existing.id);
    return;
  }
  const payload = {
    id: existing?.id || uuid(),
    fundType,
    entryType: 'CREDIT',
    amount: Number(mainTx.amount||0),
    notes: mainTx.notes || `Auto dari Transaksi Utama - ${fundType}`,
    date: mainTx.date || todayDateIso(),
    time: mainTx.time || currentTimeWIB(),
    source: 'MAIN_AUTO',
    sourceMainTransactionId: mainTx.id,
    sourceSnapshot: {
      mainType: mainTx.type,
      categoryPathNames: [...(mainTx.categoryPathNames||[])],
      amount: Number(mainTx.amount||0)
    },
    updatedAt: nowParts().display
  };
  await DB.put(STORES.reserveTransactions, payload);
}
async function deleteReserveAutoByMainId(mainId=''){
  const existing = await DB.getByIndex(STORES.reserveTransactions, 'sourceMainTransactionId', mainId);
  if(existing?.id) await DB.delete(STORES.reserveTransactions, existing.id);
}
function reserveSummaryByFund(filters = APP.state.reserveFilters){
  const rows = getFilteredReserveTransactions(filters);
  const sums = {};
  Object.keys(RESERVE_FUNDS).forEach(key=>{
    const list = rows.filter(x=>x.fundType===key);
    const credit = list.filter(x=>x.entryType==='CREDIT').reduce((s,x)=>s+Number(x.amount||0),0);
    const debit = list.filter(x=>x.entryType==='DEBIT').reduce((s,x)=>s+Number(x.amount||0),0);
    sums[key] = { credit, debit, balance: credit-debit, count:list.length };
  });
  const total = Object.values(sums).reduce((acc, x)=>({ credit:acc.credit+x.credit, debit:acc.debit+x.debit, balance:acc.balance+x.balance, count:acc.count+x.count }), {credit:0,debit:0,balance:0,count:0});
  return { funds:sums, total };
}
function getFilteredReserveTransactions(filters = APP.state.reserveFilters){
  const { startDate='', endDate='', fundType='ALL', entryType='ALL', search='' } = filters || {};
  const q = String(search||'').trim().toLowerCase();
  return [...APP.state.reserveTransactions]
    .filter(x => !startDate || x.date >= startDate)
    .filter(x => !endDate || x.date <= endDate)
    .filter(x => fundType === 'ALL' || x.fundType === fundType)
    .filter(x => entryType === 'ALL' || x.entryType === entryType)
    .filter(x => {
      if(!q) return true;
      const info = reserveFundInfo(x.fundType);
      return [info.label, x.notes||'', x.source||'', x.entryType||'', String(x.amount||0)].join(' ').toLowerCase().includes(q);
    })
    .sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function reserveFundsPage(){
  const f = APP.state.forms.reserve;
  const rows = getFilteredReserveTransactions();
  const sum = reserveSummaryByFund();
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-xl font-bold">Transaksi Cadangan</h2><p class="text-sm text-slate-500 dark:text-slate-400">Menampung saldo Zakat, Infaq, dan Penyusutan.</p></div>
        <button id="resetReserveFormBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Reset Form</button>
      </div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium">Pos Dana</label>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
              ${Object.values(RESERVE_FUNDS).map(item=>`<button data-reserve-fund="${item.key}" class="type-btn rounded-2xl border px-4 py-3 text-sm font-semibold" data-active="${f.fundType===item.key}">${item.icon} ${item.label}</button>`).join('')}
            </div>
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium">Jenis Transaksi</label>
            <div class="grid grid-cols-2 gap-2">
              <button data-reserve-entry="CREDIT" class="type-btn rounded-2xl border px-4 py-3 text-sm font-semibold" data-active="${f.entryType==='CREDIT'}">+ Tambah Saldo</button>
              <button data-reserve-entry="DEBIT" class="type-btn rounded-2xl border px-4 py-3 text-sm font-semibold" data-active="${f.entryType==='DEBIT'}">- Penggunaan Dana</button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nominal</span><input id="reserveAmount" type="text" value="${f.amountRaw?rupiah(f.amountRaw):''}" placeholder="Contoh: 150.000" class="w-full rounded-2xl border px-3 py-3"></label>
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Tanggal</span><input id="reserveDate" type="date" value="${f.date}" class="w-full rounded-2xl border px-3 py-3"></label>
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Jam</span><input id="reserveTime" type="time" step="1" value="${f.time}" class="w-full rounded-2xl border px-3 py-3"></label>
          </div>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Keterangan</span><textarea id="reserveNotes" rows="3" class="w-full rounded-2xl border px-3 py-3" placeholder="Catatan tambahan...">${escapeHtml(f.notes||'')}</textarea></label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <button id="saveReserveBtn" class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">${APP.state.editReserveId ? 'Update Transaksi' : 'Simpan Transaksi'}</button>
            ${APP.state.editReserveId ? '<button id="cancelReserveEditBtn" class="rounded-2xl border px-4 py-3 text-sm font-semibold">Batal Edit</button>' : ''}
          </div>
        </div>
        <div class="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <h3 class="text-lg font-bold">Ringkasan Saldo Cadangan</h3>
          ${Object.values(RESERVE_FUNDS).map(item=>card(item.label, `Rp ${rupiah(sum.funds[item.key].balance)}`, `${sum.funds[item.key].count} transaksi · Masuk Rp ${rupiah(sum.funds[item.key].credit)} · Keluar Rp ${rupiah(sum.funds[item.key].debit)}`, sum.funds[item.key].balance>=0?'text-blue-600':'text-rose-600')).join('')}
        </div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4"><h3 class="text-lg font-bold">Riwayat Transaksi Cadangan</h3><p class="text-sm text-slate-500 dark:text-slate-400">Bisa difilter per periode, pos dana, jenis transaksi, dan pencarian.</p></div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-5">
        <input id="reserveFilterStart" type="date" value="${APP.state.reserveFilters.startDate||''}" class="rounded-2xl border px-3 py-2">
        <input id="reserveFilterEnd" type="date" value="${APP.state.reserveFilters.endDate||''}" class="rounded-2xl border px-3 py-2">
        <select id="reserveFilterFund" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Pos Dana</option>${Object.values(RESERVE_FUNDS).map(item=>`<option value="${item.key}" ${APP.state.reserveFilters.fundType===item.key?'selected':''}>${item.label}</option>`).join('')}</select>
        <select id="reserveFilterType" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Jenis</option><option value="CREDIT" ${APP.state.reserveFilters.entryType==='CREDIT'?'selected':''}>Tambah Saldo</option><option value="DEBIT" ${APP.state.reserveFilters.entryType==='DEBIT'?'selected':''}>Penggunaan Dana</option></select>
        <input id="reserveFilterSearch" type="text" value="${escapeHtml(APP.state.reserveFilters.search||'')}" placeholder="Cari keterangan / nominal" class="rounded-2xl border px-3 py-2">
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        ${card('Total Saldo Cadangan', `Rp ${rupiah(sum.total.balance)}`, `${sum.total.count} transaksi`, sum.total.balance>=0?'text-indigo-600':'text-rose-600')}
        ${card('Total Tambah Saldo', `Rp ${rupiah(sum.total.credit)}`, 'Akumulasi semua pos dana', 'text-emerald-600')}
        ${card('Total Penggunaan', `Rp ${rupiah(sum.total.debit)}`, 'Akumulasi pemakaian dana', 'text-amber-600')}
        ${card('Auto dari Utama', `${rows.filter(x=>x.source==='MAIN_AUTO').length} trx`, 'Dibuat dari pengeluaran utama yang relevan', 'text-purple-600')}
      </div>
      <div class="table-wrap mt-4">
        <table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Pos Dana</th><th class="px-3 py-2 text-left">Jenis</th><th class="px-3 py-2 text-right">Nominal</th><th class="px-3 py-2 text-left">Sumber</th><th class="px-3 py-2 text-left">Keterangan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(tx=>{ const fund=reserveFundInfo(tx.fundType); const isAuto=tx.source==='MAIN_AUTO'; return `<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2">${fund.icon} ${escapeHtml(fund.label)}</td><td class="px-3 py-2"><span class="badge ${tx.entryType==='CREDIT'?'badge-emerald':'badge-amber'}">${tx.entryType==='CREDIT'?'Tambah Saldo':'Penggunaan'}</span></td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(tx.amount)}</td><td class="px-3 py-2">${isAuto?'<span class="badge badge-blue">AUTO UTAMA</span>':'Manual'}</td><td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td><td class="px-3 py-2 text-center"><div class="flex justify-center gap-2">${isAuto?'<span class="text-xs text-slate-400">Otomatis</span>':`<button data-reserve-edit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold">Edit</button><button data-reserve-delete="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600">Hapus</button>`}</div></td></tr>`; }).join('') || `<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">Belum ada data.</td></tr>`}</tbody></table>
      </div>
    </section>
  </div>`;
}
async function saveReserveTransaction(){
  const f = APP.state.forms.reserve;
  if(!f.fundType) return showToast('Pos dana belum dipilih.', 'error');
  if(!f.amountRaw) return showToast('Nominal transaksi masih kosong.', 'error');
  const payload = {
    id: APP.state.editReserveId || uuid(),
    fundType: f.fundType,
    entryType: f.entryType,
    amount: Number(f.amountRaw||0),
    notes: f.notes || '',
    date: f.date || todayDateIso(),
    time: f.time || currentTimeWIB(),
    source: 'MANUAL',
    sourceMainTransactionId: '',
    updatedAt: nowParts().display
  };
  await DB.put(STORES.reserveTransactions, payload);
  await loadState(); resetReserveForm(true); render(); showToast('Transaksi cadangan berhasil disimpan.');
}
function fillReserveForm(tx){
  APP.state.editReserveId = tx.id;
  APP.state.forms.reserve = { fundType:tx.fundType, entryType:tx.entryType, amountRaw:Number(tx.amount||0), notes:tx.notes||'', date:tx.date, time:tx.time };
}
function bindReserveEvents(){
  document.querySelectorAll('[data-reserve-fund]').forEach(btn=>btn.addEventListener('click', ()=>{ APP.state.forms.reserve.fundType = btn.dataset.reserveFund; render(); }));
  document.querySelectorAll('[data-reserve-entry]').forEach(btn=>btn.addEventListener('click', ()=>{ APP.state.forms.reserve.entryType = btn.dataset.reserveEntry; render(); }));
  document.getElementById('reserveAmount')?.addEventListener('input', e=>{ const num=parseNum(e.target.value); APP.state.forms.reserve.amountRaw=num; e.target.value=num?rupiah(num):''; });
  document.getElementById('reserveDate')?.addEventListener('change', e=> APP.state.forms.reserve.date = e.target.value);
  document.getElementById('reserveTime')?.addEventListener('change', e=> APP.state.forms.reserve.time = e.target.value);
  document.getElementById('reserveNotes')?.addEventListener('input', e=> APP.state.forms.reserve.notes = e.target.value);
  document.getElementById('saveReserveBtn')?.addEventListener('click', saveReserveTransaction);
  document.getElementById('resetReserveFormBtn')?.addEventListener('click', ()=>{ resetReserveForm(); render(); });
  document.getElementById('cancelReserveEditBtn')?.addEventListener('click', ()=>{ resetReserveForm(); render(); });
  document.getElementById('reserveFilterStart')?.addEventListener('change', e=>{ APP.state.reserveFilters.startDate = e.target.value; render(); });
  document.getElementById('reserveFilterEnd')?.addEventListener('change', e=>{ APP.state.reserveFilters.endDate = e.target.value; render(); });
  document.getElementById('reserveFilterFund')?.addEventListener('change', e=>{ APP.state.reserveFilters.fundType = e.target.value; render(); });
  document.getElementById('reserveFilterType')?.addEventListener('change', e=>{ APP.state.reserveFilters.entryType = e.target.value; render(); });
  document.getElementById('reserveFilterSearch')?.addEventListener('input', e=>{ APP.state.reserveFilters.search = e.target.value; scheduleRender({ preserveInputId:'reserveFilterSearch', preserveCursor:true }); });
  document.querySelectorAll('[data-reserve-edit]').forEach(btn=>btn.addEventListener('click', ()=>{ const tx=APP.state.reserveTransactions.find(x=>x.id===btn.dataset.reserveEdit); if(tx){ fillReserveForm(tx); APP.state.currentPage='reserve'; render(); } }));
  document.querySelectorAll('[data-reserve-delete]').forEach(btn=>btn.addEventListener('click', async ()=>{ if(!confirm('Hapus transaksi cadangan ini?')) return; await DB.delete(STORES.reserveTransactions, btn.dataset.reserveDelete); await loadState(); render(); showToast('Transaksi cadangan dihapus.'); }));
}
