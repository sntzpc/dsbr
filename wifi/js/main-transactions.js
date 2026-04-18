function resetMainForm(keepSelection=false){ const prev = APP.state.forms.main || {}; APP.state.forms.main = { type:keepSelection ? (prev.type || 'PENDAPATAN') : 'PENDAPATAN', categoryPath:keepSelection ? [...(prev.categoryPath||[])] : [], amountRaw:0, notes:'', date:keepSelection ? (prev.date || todayDateIso()) : todayDateIso(), time:currentTimeWIB() }; APP.state.editMainId = null; }
function getMainLevelOptions(type, level){ const path = APP.state.forms.main.categoryPath; const parentId = level===0 ? 'ROOT' : path[level-1]; return categoryChildren(type, parentId); }
function getFilteredMainTransactions(){
  const {startDate,endDate,type,search} = APP.state.mainFilters;
  return [...APP.state.mainTransactions]
    .filter(x => !startDate || x.date >= startDate)
    .filter(x => !endDate || x.date <= endDate)
    .filter(x => type==='ALL' || x.type===type)
    .filter(x => {
      if(!search) return true;
      const q = search.toLowerCase();
      return (x.categoryPathNames||[]).join(' > ').toLowerCase().includes(q) || (x.notes||'').toLowerCase().includes(q) || String(x.amount).includes(q);
    }).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function mainTransactionsPage(){
  const rows = getFilteredMainTransactions();
  const sumIn = rows.filter(x=>x.type==='PENDAPATAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const sumOut = rows.filter(x=>x.type==='PENGELUARAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const f = APP.state.forms.main;
  const categorySelectors = Array.from({length:5}).map((_,level)=>{
    const options = getMainLevelOptions(f.type, level); const current = f.categoryPath[level] || '';
    if(level>0 && !f.categoryPath[level-1]) return '';
    if(!options.length && level>0) return '';
    return `<select data-level="${level}" class="main-category-select rounded-2xl border px-3 py-3 text-sm"><option value="">${level===0?'Pilih kategori':'Pilih subkategori'}</option>${options.map(opt=>`<option value="${opt.id}" ${current===opt.id?'selected':''}>${escapeHtml(opt.name)}</option>`).join('')}</select>`;
  }).join('');
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-xl font-bold">Transaksi Utama</h2><p class="text-sm text-slate-500 dark:text-slate-400">Pendapatan dan Pengeluaran. Pengeluaran kategori Aset akan otomatis masuk ke halaman Aset.</p></div>
        <button id="resetMainFormBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Reset Form</button>
      </div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium">Jenis Transaksi</label>
            <div class="grid grid-cols-2 gap-2">
              ${['PENDAPATAN','PENGELUARAN'].map(type=>`<button data-main-type="${type}" data-active="${f.type===type}" class="type-btn rounded-2xl border px-4 py-3 text-sm font-semibold">${type}</button>`).join('')}
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">${categorySelectors}</div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nominal</span><input id="mainAmount" type="text" value="${f.amountRaw?rupiah(f.amountRaw):''}" placeholder="Contoh: 150.000" class="w-full rounded-2xl border px-3 py-3"></label>
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Tanggal</span><input id="mainDate" type="date" value="${f.date}" class="w-full rounded-2xl border px-3 py-3"></label>
            <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Jam</span><input id="mainTime" type="time" step="1" value="${f.time}" class="w-full rounded-2xl border px-3 py-3"></label>
          </div>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Keterangan</span><textarea id="mainNotes" rows="3" class="w-full rounded-2xl border px-3 py-3" placeholder="Catatan tambahan...">${escapeHtml(f.notes)}</textarea></label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <button id="saveMainBtn" class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">${APP.state.editMainId ? 'Update Transaksi' : 'Simpan Transaksi'}</button>
            ${APP.state.editMainId ? '<button id="cancelMainEditBtn" class="rounded-2xl border px-4 py-3 text-sm font-semibold">Batal Edit</button>' : ''}
          </div>
        </div>
        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <h3 class="text-lg font-bold">Preview</h3>
          <div class="mt-4 space-y-3 text-sm">
            <div><span class="text-slate-500 dark:text-slate-400">Jenis</span><div class="font-semibold">${f.type}</div></div>
            <div><span class="text-slate-500 dark:text-slate-400">Kategori</span><div class="font-semibold">${escapeHtml(categoryPathNames(f.categoryPath).join(' > ') || '-')}</div></div>
            <div><span class="text-slate-500 dark:text-slate-400">Nominal</span><div class="font-semibold">Rp ${rupiah(f.amountRaw)}</div></div>
            <div><span class="text-slate-500 dark:text-slate-400">Waktu</span><div class="font-semibold">${formatDateTime(f.date,f.time)}</div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4"><h3 class="text-lg font-bold">Riwayat Transaksi Utama</h3><p class="text-sm text-slate-500 dark:text-slate-400">Filter per periode, jenis, dan kata kunci.</p></div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input id="mainFilterStart" type="date" value="${APP.state.mainFilters.startDate}" class="rounded-2xl border px-3 py-2">
        <input id="mainFilterEnd" type="date" value="${APP.state.mainFilters.endDate}" class="rounded-2xl border px-3 py-2">
        <select id="mainFilterType" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Jenis</option><option value="PENDAPATAN" ${APP.state.mainFilters.type==='PENDAPATAN'?'selected':''}>PENDAPATAN</option><option value="PENGELUARAN" ${APP.state.mainFilters.type==='PENGELUARAN'?'selected':''}>PENGELUARAN</option></select>
        <input id="mainFilterSearch" type="text" value="${escapeHtml(APP.state.mainFilters.search)}" placeholder="Cari kategori/keterangan/nominal" class="rounded-2xl border px-3 py-2">
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        ${card('Pendapatan', `Rp ${rupiah(sumIn)}`, `${rows.filter(x=>x.type==='PENDAPATAN').length} transaksi`, 'text-emerald-600')}
        ${card('Pengeluaran', `Rp ${rupiah(sumOut)}`, `${rows.filter(x=>x.type==='PENGELUARAN').length} transaksi`, 'text-rose-600')}
        ${card('Saldo', `Rp ${rupiah(sumIn-sumOut)}`, `${rows.length} transaksi`, (sumIn-sumOut)>=0?'text-blue-600':'text-amber-600')}
      </div>
      <div class="table-wrap mt-4">
        <table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Jenis</th><th class="px-3 py-2 text-left">Kategori</th><th class="px-3 py-2 text-right">Nominal</th><th class="px-3 py-2 text-left">Keterangan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(tx=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2"><span class="badge ${tx.type==='PENDAPATAN'?'badge-emerald':'badge-rose'}">${tx.type}</span></td><td class="px-3 py-2">${escapeHtml((tx.categoryPathNames||[]).join(' > ') || '-')}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(tx.amount)}</td><td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td><td class="px-3 py-2 text-center"><div class="flex justify-center gap-2"><button data-main-edit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold">Edit</button><button data-main-delete="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600">Hapus</button></div></td></tr>`).join('') || `<tr><td colspan="6" class="px-3 py-8 text-center text-slate-500">Belum ada data.</td></tr>`}</tbody></table>
      </div>
    </section>
  </div>`;
}
async function saveMainTransaction(){
  const f = APP.state.forms.main;
  if(!f.categoryPath.length) return showToast('Kategori transaksi belum dipilih.', 'error');
  if(!f.amountRaw) return showToast('Nominal transaksi masih kosong.', 'error');
  const payload = {
    id: APP.state.editMainId || uuid(),
    type: f.type,
    categoryPath: [...f.categoryPath],
    categoryPathNames: categoryPathNames(f.categoryPath),
    amount: Number(f.amountRaw||0),
    notes: f.notes || '',
    date: f.date || todayDateIso(),
    time: f.time || currentTimeWIB(),
    source: 'MANUAL',
    updatedAt: nowParts().display
  };
  const prev = APP.state.mainTransactions.find(x=>x.id===payload.id);
  if(prev?.source === 'INTEGRATION') payload.source = 'INTEGRATION';
  await DB.put(STORES.mainTransactions, payload);
  if(typeof syncReserveAutoFromMainTransaction === 'function') await syncReserveAutoFromMainTransaction(payload);
  if(typeof syncAssetFromMainTransaction === 'function') await syncAssetFromMainTransaction(payload);
  await loadState(); resetMainForm(true); render(); showToast('Transaksi utama berhasil disimpan.');
}
function fillMainForm(tx){ APP.state.editMainId = tx.id; APP.state.forms.main = { type:tx.type, categoryPath:[...(tx.categoryPath||[])], amountRaw:Number(tx.amount||0), notes:tx.notes||'', date:tx.date, time:tx.time }; }
function bindMainEvents(){
  document.querySelectorAll('[data-main-type]').forEach(btn => btn.addEventListener('click', ()=>{ APP.state.forms.main.type = btn.dataset.mainType; APP.state.forms.main.categoryPath = []; render(); }));
  document.querySelectorAll('.main-category-select').forEach(sel => sel.addEventListener('change', e => {
    const level = Number(e.target.dataset.level); const value = e.target.value; APP.state.forms.main.categoryPath = APP.state.forms.main.categoryPath.slice(0, level);
    if(value) APP.state.forms.main.categoryPath[level] = value; render();
  }));
  document.getElementById('mainAmount')?.addEventListener('input', e=>{ const num = parseNum(e.target.value); APP.state.forms.main.amountRaw = num; e.target.value = num ? rupiah(num) : ''; });
  document.getElementById('mainDate')?.addEventListener('change', e=> APP.state.forms.main.date = e.target.value);
  document.getElementById('mainTime')?.addEventListener('change', e=> APP.state.forms.main.time = e.target.value);
  document.getElementById('mainNotes')?.addEventListener('input', e=> APP.state.forms.main.notes = e.target.value);
  document.getElementById('saveMainBtn')?.addEventListener('click', saveMainTransaction);
  document.getElementById('resetMainFormBtn')?.addEventListener('click', ()=>{ resetMainForm(); render(); });
  document.getElementById('cancelMainEditBtn')?.addEventListener('click', ()=>{ resetMainForm(); render(); });
  document.getElementById('mainFilterStart')?.addEventListener('change', e=>{ APP.state.mainFilters.startDate=e.target.value; render(); });
  document.getElementById('mainFilterEnd')?.addEventListener('change', e=>{ APP.state.mainFilters.endDate=e.target.value; render(); });
  document.getElementById('mainFilterType')?.addEventListener('change', e=>{ APP.state.mainFilters.type=e.target.value; render(); });
  document.getElementById('mainFilterSearch')?.addEventListener('input', e=>{ APP.state.mainFilters.search=e.target.value; scheduleRender({ preserveInputId:'mainFilterSearch', preserveCursor:true }); });
  document.querySelectorAll('[data-main-edit]').forEach(btn => btn.addEventListener('click', ()=>{ const tx = APP.state.mainTransactions.find(x=>x.id===btn.dataset.mainEdit); if(tx){ fillMainForm(tx); APP.state.currentPage='main'; render(); }}));
  document.querySelectorAll('[data-main-delete]').forEach(btn => btn.addEventListener('click', async ()=>{ if(!confirm('Hapus transaksi ini?')) return; if(typeof deleteReserveAutoByMainId === 'function') await deleteReserveAutoByMainId(btn.dataset.mainDelete); if(typeof deleteAssetAutoByMainId === 'function') await deleteAssetAutoByMainId(btn.dataset.mainDelete); await DB.delete(STORES.mainTransactions, btn.dataset.mainDelete); await loadState(); render(); showToast('Transaksi utama dihapus.'); }));
}
