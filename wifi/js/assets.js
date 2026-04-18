(function(){
  const ASSET_STATUSES = ['AKTIF','RUSAK','DIJUAL'];
  const LONG_LIFE_KEYWORDS = ['router','access point','ap','starlink','mppt','switch hub','switchhub','switch'];

  function ensureAssetState(){
    APP.state.assetFilters = {
      startDate: APP.state.assetFilters?.startDate || '',
      endDate: APP.state.assetFilters?.endDate || '',
      search: APP.state.assetFilters?.search || '',
      assetType: APP.state.assetFilters?.assetType || 'ALL',
      usefulLifeMonths: APP.state.assetFilters?.usefulLifeMonths || 'ALL',
      status: APP.state.assetFilters?.status || 'ALL'
    };
    APP.state.assetForm = APP.state.assetForm || defaultAssetForm();
    APP.state.editAssetId = APP.state.editAssetId || null;
  }

  function defaultAssetForm(){
    return {
      assetDate: todayDateIso(),
      assetType: '',
      assetName: '',
      notes: '',
      priceRaw: 0,
      usefulLifeMonths: 12,
      status: 'AKTIF'
    };
  }

  function resetAssetForm(){
    APP.state.assetForm = defaultAssetForm();
    APP.state.editAssetId = null;
  }

  function normalizeAssetName(value=''){ return String(value || '').toLowerCase().replace(/\s+/g,' ').trim(); }
  function assetNameKey(assetDate, assetName){ return `${assetDate || ''}::${normalizeAssetName(assetName)}`; }
  function titleCaseWords(v=''){ return String(v||'').trim().replace(/\s+/g,' ').split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); }
  function inferAssetUsefulLifeMonthsFromText(text=''){ const t = ` ${normalizeAssetName(text)} `; return LONG_LIFE_KEYWORDS.some(k => t.includes(` ${k} `) || t.includes(k)) ? 60 : 12; }
  function calcAssetDepreciation(price, usefulLifeMonths){ const safePrice = Number(price||0); const months = Math.max(1, Number(usefulLifeMonths||12)); return Math.round(safePrice / months); }
  function monthsElapsedInclusive(assetDate){ if(!assetDate) return 0; const [y,m] = String(assetDate).split('-').map(Number); if(!y || !m) return 0; const now = nowParts(); const [cy,cm] = now.date.split('-').map(Number); return Math.max(0, ((cy - y) * 12) + (cm - m) + 1); }
  function calcAccumulatedDepreciation(assetDate, price, usefulLifeMonths){ const monthly = calcAssetDepreciation(price, usefulLifeMonths); return Math.min(Number(price||0), monthly * Math.min(Number(usefulLifeMonths||12), monthsElapsedInclusive(assetDate))); }
  function calcBookValue(assetDate, price, usefulLifeMonths){ return Math.max(0, Number(price||0) - calcAccumulatedDepreciation(assetDate, price, usefulLifeMonths)); }
  function isAssetMainTransaction(tx){
    if(!tx || tx.type !== 'PENGELUARAN') return false;
    const names = (tx.categoryPathNames || []).map(x=>String(x||'').toLowerCase().trim());
    if(names.some(x => x === 'aset' || x.includes('aset'))) return true;
    return /\baset\b/.test(String(tx.notes || '').toLowerCase());
  }
  function inferAssetTypeFromMainTransaction(tx){
    const names = (tx?.categoryPathNames || []).filter(Boolean);
    if(names.length >= 3) return names[names.length - 1];
    if(names.length >= 2) return names[names.length - 1];
    return 'Aset';
  }
  function inferAssetNameFromMainTransaction(tx){
    const assetType = inferAssetTypeFromMainTransaction(tx);
    const note = String(tx?.notes || '').trim();
    return [assetType, note].filter(Boolean).join(' - ') || assetType || 'Aset';
  }
  function assetStatusBadge(status){
    const s = String(status || 'AKTIF').toUpperCase();
    if(s === 'RUSAK') return 'badge badge-rose';
    if(s === 'DIJUAL') return 'badge badge-amber';
    return 'badge badge-emerald';
  }
  function calcAssetFields(base){
    const usefulLifeMonths = Math.max(1, Number(base.usefulLifeMonths || inferAssetUsefulLifeMonthsFromText(`${base.assetType || ''} ${base.assetName || ''} ${base.notes || ''}`)));
    return {
      ...base,
      usefulLifeMonths,
      depreciationPerMonth: calcAssetDepreciation(base.price, usefulLifeMonths),
      accumulatedDepreciation: calcAccumulatedDepreciation(base.assetDate, base.price, usefulLifeMonths),
      bookValue: calcBookValue(base.assetDate, base.price, usefulLifeMonths)
    };
  }
  function buildAssetFromMainTransaction(tx, previousAsset=null){
    const assetTypeAuto = inferAssetTypeFromMainTransaction(tx);
    const assetNameAuto = inferAssetNameFromMainTransaction(tx);
    const notesAuto = String(tx.notes || '').trim();
    const assetDate = tx.date || todayDateIso();
    const base = {
      id: previousAsset?.id || uuid(),
      assetDate,
      assetType: previousAsset?.manualOverride ? (previousAsset.assetType || assetTypeAuto) : assetTypeAuto,
      assetName: previousAsset?.manualOverride ? (previousAsset.assetName || assetNameAuto) : assetNameAuto,
      assetNameKey: assetNameKey(assetDate, previousAsset?.manualOverride ? (previousAsset.assetName || assetNameAuto) : assetNameAuto),
      price: Number(tx.amount || 0),
      usefulLifeMonths: previousAsset?.manualOverride ? Number(previousAsset.usefulLifeMonths || inferAssetUsefulLifeMonthsFromText(assetNameAuto)) : inferAssetUsefulLifeMonthsFromText(`${assetTypeAuto} ${assetNameAuto}`),
      status: previousAsset?.status || 'AKTIF',
      notes: previousAsset?.manualOverride ? (previousAsset.notes || notesAuto) : notesAuto,
      sourceMainTransactionId: tx.id,
      createdAt: previousAsset?.createdAt || nowParts().display,
      updatedAt: nowParts().display,
      manualOverride: !!previousAsset?.manualOverride,
      sourceType: 'AUTO'
    };
    return calcAssetFields(base);
  }

  async function findAssetByMainTransactionId(mainTxId){ return (APP.state.assets || []).find(x => x.sourceMainTransactionId === mainTxId) || null; }
  async function findDuplicateAsset(assetDate, assetName, ignoreId=''){ const key = assetNameKey(assetDate, assetName); return (APP.state.assets || []).find(x => x.assetNameKey === key && x.id !== ignoreId) || null; }

  async function syncAssetFromMainTransaction(tx){
    const existing = await findAssetByMainTransactionId(tx.id);
    if(!isAssetMainTransaction(tx)){
      if(existing) await DB.delete(STORES.assets, existing.id);
      return { action: existing ? 'deleted' : 'ignored' };
    }
    const payload = buildAssetFromMainTransaction(tx, existing);
    const duplicate = await findDuplicateAsset(payload.assetDate, payload.assetName, payload.id);
    if(duplicate){
      if(existing && duplicate.id !== existing.id) await DB.delete(STORES.assets, existing.id);
      return { action:'duplicate', duplicate };
    }
    await DB.put(STORES.assets, payload);
    return { action: existing ? 'updated' : 'created', asset: payload };
  }

  async function deleteAssetAutoByMainId(mainTxId){ const existing = await findAssetByMainTransactionId(mainTxId); if(existing) await DB.delete(STORES.assets, existing.id); }

  async function importAssetsFromMainTransactions(){
    let added = 0, skipped = 0, updated = 0;
    const rows = [...APP.state.mainTransactions].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    for(const tx of rows){
      if(!isAssetMainTransaction(tx)) continue;
      const res = await syncAssetFromMainTransaction(tx);
      if(res.action === 'created') added++;
      else if(res.action === 'updated') updated++;
      else skipped++;
    }
    await loadState();
    return { added, updated, skipped };
  }

  function getAssetTypeOptions(){
    const set = new Set((APP.state.assets || []).map(x=>String(x.assetType || '').trim()).filter(Boolean));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }

  function getFilteredAssets(){
    ensureAssetState();
    const { startDate, endDate, search, assetType, usefulLifeMonths, status } = APP.state.assetFilters;
    return [...(APP.state.assets || [])]
      .map(calcAssetFields)
      .filter(x => !startDate || String(x.assetDate || '') >= startDate)
      .filter(x => !endDate || String(x.assetDate || '') <= endDate)
      .filter(x => assetType === 'ALL' || String(x.assetType || '') === assetType)
      .filter(x => usefulLifeMonths === 'ALL' || Number(x.usefulLifeMonths || 0) === Number(usefulLifeMonths))
      .filter(x => status === 'ALL' || String(x.status || 'AKTIF') === status)
      .filter(x => {
        if(!search) return true;
        const q = search.toLowerCase();
        return [x.assetName, x.assetType, x.notes, x.status, String(x.price || '')].some(v => String(v || '').toLowerCase().includes(q));
      })
      .sort((a,b)=>`${b.assetDate || ''} ${b.createdAt || ''}`.localeCompare(`${a.assetDate || ''} ${a.createdAt || ''}`));
  }

  function fillAssetForm(asset){
    APP.state.editAssetId = asset.id;
    APP.state.assetForm = {
      assetDate: asset.assetDate || todayDateIso(),
      assetType: asset.assetType || '',
      assetName: asset.assetName || '',
      notes: asset.notes || '',
      priceRaw: Number(asset.price || 0),
      usefulLifeMonths: Number(asset.usefulLifeMonths || 12),
      status: asset.status || 'AKTIF'
    };
  }

  async function saveAssetManual(){
    ensureAssetState();
    const f = APP.state.assetForm;
    if(!String(f.assetName || '').trim()) return showToast('Nama aset masih kosong.', 'error');
    if(!String(f.assetType || '').trim()) return showToast('Jenis aset masih kosong.', 'error');
    if(!f.priceRaw) return showToast('Harga aset masih kosong.', 'error');
    const prev = APP.state.assets.find(x => x.id === APP.state.editAssetId) || null;
    const payload = calcAssetFields({
      id: prev?.id || uuid(),
      assetDate: f.assetDate || todayDateIso(),
      assetType: titleCaseWords(f.assetType),
      assetName: String(f.assetName || '').trim(),
      assetNameKey: assetNameKey(f.assetDate || todayDateIso(), String(f.assetName || '').trim()),
      price: Number(f.priceRaw || 0),
      usefulLifeMonths: Number(f.usefulLifeMonths || 12),
      status: f.status || 'AKTIF',
      notes: String(f.notes || '').trim(),
      sourceMainTransactionId: prev?.sourceMainTransactionId || '',
      createdAt: prev?.createdAt || nowParts().display,
      updatedAt: nowParts().display,
      manualOverride: true,
      sourceType: prev?.sourceMainTransactionId ? 'AUTO+EDIT' : 'MANUAL'
    });
    const duplicate = await findDuplicateAsset(payload.assetDate, payload.assetName, payload.id);
    if(duplicate) return showToast('Aset duplikat ditemukan. Nama aset dan tanggal pembelian sudah ada.', 'error');
    await DB.put(STORES.assets, payload);
    await loadState();
    resetAssetForm();
    render();
    showToast(prev ? 'Aset berhasil diperbarui.' : 'Aset manual berhasil ditambahkan.');
  }

  async function removeAsset(id){
    await DB.delete(STORES.assets, id);
    if(APP.state.editAssetId === id) resetAssetForm();
    await loadState();
    render();
    showToast('Data aset dihapus.');
  }


  function exportAssetsXlsx(){
    if(!window.XLSX) return showToast('Library Excel belum termuat.', 'error');
    const rows = getFilteredAssets();
    const wb = XLSX.utils.book_new();
    const summary = [{
      Dicetak: `${nowParts().display} WIB`,
      TotalAset: rows.length,
      TotalNilaiAset: rows.reduce((s,x)=>s+Number(x.price||0),0),
      TotalPenyusutanPerBulan: rows.reduce((s,x)=>s+Number(x.depreciationPerMonth||0),0),
      TotalNilaiBuku: rows.reduce((s,x)=>s+Number(x.bookValue||0),0)
    }];
    const detail = rows.map((x,i)=>({
      No: i+1,
      TanggalBeli: formatDate(x.assetDate),
      JenisAset: x.assetType || '',
      NamaAset: x.assetName || '',
      Harga: Number(x.price || 0),
      UmurPakaiBulan: Number(x.usefulLifeMonths || 0),
      PenyusutanPerBulan: Number(x.depreciationPerMonth || 0),
      AkumulasiPenyusutan: Number(x.accumulatedDepreciation || 0),
      NilaiBuku: Number(x.bookValue || 0),
      Status: x.status || 'AKTIF',
      Sumber: x.sourceMainTransactionId ? 'Otomatis' : 'Manual',
      Catatan: x.notes || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Ringkasan Aset');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail.length ? detail : [{Info:'Tidak ada data aset'}]), 'Daftar Aset');
    XLSX.writeFile(wb, `laporan-aset-${todayDateIso()}.xlsx`);
  }

  function exportAssetsPdf(){
    if(!(window.jspdf && window.jspdf.jsPDF)) return showToast('Library PDF belum termuat.', 'error');
    const rows = getFilteredAssets();
    const doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
    let y = 36;
    doc.setFontSize(16); doc.text('Laporan Aset WiFi Hotspot', 40, y); y += 22;
    doc.setFontSize(10); doc.text(`Dicetak: ${nowParts().display} WIB`, 40, y); y += 14;
    doc.text(`Jumlah aset: ${rows.length}`, 40, y); y += 16;
    doc.autoTable({
      startY: y,
      head: [['Tanggal','Jenis','Nama Aset','Harga','Umur','Susut/Bulan','Nilai Buku','Status','Update Terakhir']],
      body: rows.length ? rows.map(x=>[
        formatDate(x.assetDate), x.assetType || '-', x.assetName || '-', `Rp ${rupiah(x.price)}`,
        `${x.usefulLifeMonths} bln`, `Rp ${rupiah(x.depreciationPerMonth)}`, `Rp ${rupiah(x.bookValue)}`, x.status || 'AKTIF', x.updatedAt ? `${x.updatedAt} WIB` : '-'
      ]) : [['-','-','Tidak ada data aset','','','','','','']],
      styles:{fontSize:8}
    });
    doc.save(`laporan-aset-${todayDateIso()}.pdf`);
  }

  function assetsPage(){
    ensureAssetState();
    const rows = getFilteredAssets();
    const totalPrice = rows.reduce((s,x)=>s+Number(x.price||0),0);
    const totalMonthly = rows.reduce((s,x)=>s+Number(x.depreciationPerMonth||0),0);
    const totalBookValue = rows.reduce((s,x)=>s+Number(x.bookValue||0),0);
    const f = APP.state.assetForm;
    const typeOptions = getAssetTypeOptions();
    return `
    <div class="space-y-4">
      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 class="text-xl font-bold">Daftar Aset</h2><p class="text-sm text-slate-500 dark:text-slate-400">Nama aset otomatis memakai Sub-Sub Kategori + Keterangan. Perubahan status dilakukan melalui Edit Aset, dan waktu edit tercatat otomatis dalam WIB.</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="importAssetsBtn" class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Import dari Transaksi Utama</button>
            <button id="refreshAssetsBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Refresh Penyusutan</button>
            <button id="exportAssetsXlsxBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Excel</button>
            <button id="exportAssetsPdfBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export PDF</button>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          ${card('Total Nilai Aset', `Rp ${rupiah(totalPrice)}`, `${rows.length} aset tercatat`, 'text-indigo-600')}
          ${card('Penyusutan per Bulan', `Rp ${rupiah(totalMonthly)}`, 'Akumulasi seluruh aset', 'text-amber-600')}
          ${card('Nilai Buku Saat Ini', `Rp ${rupiah(totalBookValue)}`, 'Setelah akumulasi penyusutan', 'text-emerald-600')}
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">${APP.state.editAssetId ? 'Edit Aset' : 'Input Aset Manual'}</h3><p class="text-sm text-slate-500 dark:text-slate-400">Untuk aset yang belum ada di transaksi utama atau perlu koreksi manual.</p></div>${APP.state.editAssetId ? '<button id="cancelAssetEditBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Batal Edit</button>' : ''}</div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Tanggal Beli</span><input id="assetDate" type="date" value="${f.assetDate}" class="w-full rounded-2xl border px-3 py-3"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Jenis Aset</span><input id="assetType" type="text" value="${escapeHtml(f.assetType)}" placeholder="Contoh: Router" class="w-full rounded-2xl border px-3 py-3"></label>
          <label class="block text-sm xl:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nama Aset</span><input id="assetName" type="text" value="${escapeHtml(f.assetName)}" placeholder="Contoh: Router Mikrotik RB750Gr3 - Server Utama" class="w-full rounded-2xl border px-3 py-3"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Harga</span><input id="assetPrice" type="text" value="${f.priceRaw ? rupiah(f.priceRaw) : ''}" placeholder="Contoh: 850.000" class="w-full rounded-2xl border px-3 py-3"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Umur Pakai</span><select id="assetUsefulLifeMonths" class="w-full rounded-2xl border px-3 py-3"><option value="12" ${Number(f.usefulLifeMonths)===12?'selected':''}>12 bulan</option><option value="60" ${Number(f.usefulLifeMonths)===60?'selected':''}>60 bulan</option></select></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Status</span><select id="assetStatus" class="w-full rounded-2xl border px-3 py-3">${ASSET_STATUSES.map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Catatan</span><input id="assetNotes" type="text" value="${escapeHtml(f.notes)}" placeholder="Catatan aset" class="w-full rounded-2xl border px-3 py-3"></label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2"><button id="saveAssetBtn" class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">${APP.state.editAssetId ? 'Update Aset' : 'Simpan Aset'}</button><button id="resetAssetFormBtn" class="rounded-2xl border px-4 py-3 text-sm font-semibold">Reset Form</button></div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4"><h3 class="text-lg font-bold">Filter Aset</h3><p class="text-sm text-slate-500 dark:text-slate-400">Filter berdasarkan jenis aset, umur pakai, status, tanggal, dan kata kunci.</p></div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input id="assetFilterStart" type="date" value="${APP.state.assetFilters.startDate}" class="rounded-2xl border px-3 py-2">
          <input id="assetFilterEnd" type="date" value="${APP.state.assetFilters.endDate}" class="rounded-2xl border px-3 py-2">
          <select id="assetFilterType" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Jenis</option>${typeOptions.map(v=>`<option value="${escapeHtml(v)}" ${APP.state.assetFilters.assetType===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select>
          <select id="assetFilterLife" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Umur Pakai</option><option value="12" ${String(APP.state.assetFilters.usefulLifeMonths)==='12'?'selected':''}>12 bulan</option><option value="60" ${String(APP.state.assetFilters.usefulLifeMonths)==='60'?'selected':''}>60 bulan</option></select>
          <select id="assetFilterStatus" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Status</option>${ASSET_STATUSES.map(s=>`<option value="${s}" ${APP.state.assetFilters.status===s?'selected':''}>${s}</option>`).join('')}</select>
          <input id="assetFilterSearch" type="text" value="${escapeHtml(APP.state.assetFilters.search)}" placeholder="Cari nama/jenis/keterangan" class="rounded-2xl border px-3 py-2">
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400"><span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">${rows.length} aset sesuai filter</span>${(APP.state.assetFilters.startDate || APP.state.assetFilters.endDate || APP.state.assetFilters.search || APP.state.assetFilters.assetType !== 'ALL' || APP.state.assetFilters.usefulLifeMonths !== 'ALL' || APP.state.assetFilters.status !== 'ALL') ? '<button id="resetAssetFiltersBtn" class="rounded-full border px-3 py-1 font-semibold">Reset Filter</button>' : ''}</div>
        <div class="mt-4 table-wrap">
          <table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Jenis</th><th class="px-3 py-2 text-left">Nama Aset</th><th class="px-3 py-2 text-right">Harga</th><th class="px-3 py-2 text-center">Umur Pakai</th><th class="px-3 py-2 text-right">Penyusutan/Bulan</th><th class="px-3 py-2 text-right">Nilai Buku</th><th class="px-3 py-2 text-center">Status</th><th class="px-3 py-2 text-left">Update Terakhir</th><th class="px-3 py-2 text-left">Sumber</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(asset=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDate(asset.assetDate)}</td><td class="px-3 py-2">${escapeHtml(asset.assetType || '-')}</td><td class="px-3 py-2"><div class="font-semibold">${escapeHtml(asset.assetName || '-')}</div><div class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(asset.notes || '-')}</div></td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(asset.price)}</td><td class="px-3 py-2 text-center">${asset.usefulLifeMonths} bln</td><td class="px-3 py-2 text-right">Rp ${rupiah(asset.depreciationPerMonth)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(asset.bookValue)}</td><td class="px-3 py-2 text-center"><span class="${assetStatusBadge(asset.status)}">${asset.status || 'AKTIF'}</span></td><td class="px-3 py-2">${escapeHtml(asset.updatedAt ? `${asset.updatedAt} WIB` : '-')}</td><td class="px-3 py-2">${asset.sourceMainTransactionId ? '<span class="badge badge-blue">Otomatis</span>' : '<span class="badge">Manual</span>'}${asset.manualOverride ? '<div class="mt-1 text-xs text-slate-500">+ edit manual</div>' : ''}</td><td class="px-3 py-2 text-center"><div class="flex justify-center gap-2"><button data-asset-edit="${asset.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold">Edit</button><button data-asset-delete="${asset.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600">Hapus</button></div></td></tr>`).join('') || `<tr><td colspan="11" class="px-3 py-8 text-center text-slate-500">Belum ada data aset.</td></tr>`}</tbody></table>
        </div>
      </section>
    </div>`;
  }

  function bindAssetsEvents(){
    ensureAssetState();
    document.getElementById('assetDate')?.addEventListener('change', e=> APP.state.assetForm.assetDate = e.target.value);
    document.getElementById('assetType')?.addEventListener('input', e=> APP.state.assetForm.assetType = e.target.value);
    document.getElementById('assetName')?.addEventListener('input', e=> APP.state.assetForm.assetName = e.target.value);
    document.getElementById('assetNotes')?.addEventListener('input', e=> APP.state.assetForm.notes = e.target.value);
    document.getElementById('assetPrice')?.addEventListener('input', e=>{ const num = parseNum(e.target.value); APP.state.assetForm.priceRaw = num; e.target.value = num ? rupiah(num) : ''; });
    document.getElementById('assetUsefulLifeMonths')?.addEventListener('change', e=> APP.state.assetForm.usefulLifeMonths = Number(e.target.value || 12));
    document.getElementById('assetStatus')?.addEventListener('change', e=> APP.state.assetForm.status = e.target.value);
    document.getElementById('saveAssetBtn')?.addEventListener('click', saveAssetManual);
    document.getElementById('resetAssetFormBtn')?.addEventListener('click', ()=>{ resetAssetForm(); render(); });
    document.getElementById('cancelAssetEditBtn')?.addEventListener('click', ()=>{ resetAssetForm(); render(); });
    document.getElementById('assetFilterStart')?.addEventListener('change', e=>{ APP.state.assetFilters.startDate = e.target.value; render(); });
    document.getElementById('assetFilterEnd')?.addEventListener('change', e=>{ APP.state.assetFilters.endDate = e.target.value; render(); });
    document.getElementById('assetFilterType')?.addEventListener('change', e=>{ APP.state.assetFilters.assetType = e.target.value; render(); });
    document.getElementById('assetFilterLife')?.addEventListener('change', e=>{ APP.state.assetFilters.usefulLifeMonths = e.target.value; render(); });
    document.getElementById('assetFilterStatus')?.addEventListener('change', e=>{ APP.state.assetFilters.status = e.target.value; render(); });
    document.getElementById('assetFilterSearch')?.addEventListener('input', e=>{ APP.state.assetFilters.search = e.target.value; scheduleRender({ preserveInputId:'assetFilterSearch', preserveCursor:true }); });
    document.getElementById('resetAssetFiltersBtn')?.addEventListener('click', ()=>{ APP.state.assetFilters = { startDate:'', endDate:'', search:'', assetType:'ALL', usefulLifeMonths:'ALL', status:'ALL' }; render(); });
    document.getElementById('importAssetsBtn')?.addEventListener('click', async ()=>{ const res = await importAssetsFromMainTransactions(); render(); showToast(`Import aset selesai. Tambah: ${res.added}, Update: ${res.updated}, Dilewati: ${res.skipped}`); });
    document.getElementById('refreshAssetsBtn')?.addEventListener('click', async ()=>{ for(const row of (APP.state.assets || [])) await DB.put(STORES.assets, calcAssetFields(row)); await loadState(); render(); showToast('Penyusutan aset diperbarui.'); });
    document.getElementById('exportAssetsXlsxBtn')?.addEventListener('click', exportAssetsXlsx);
    document.getElementById('exportAssetsPdfBtn')?.addEventListener('click', exportAssetsPdf);
    document.querySelectorAll('[data-asset-edit]').forEach(btn => btn.addEventListener('click', ()=>{ const row = APP.state.assets.find(x=>x.id===btn.dataset.assetEdit); if(row){ fillAssetForm(row); render(); } }));
    document.querySelectorAll('[data-asset-delete]').forEach(btn => btn.addEventListener('click', async ()=>{ if(!confirm('Hapus aset ini?')) return; await removeAsset(btn.dataset.assetDelete); }));
  }

  window.assetsPage = assetsPage;
  window.bindAssetsEvents = bindAssetsEvents;
  window.syncAssetFromMainTransaction = syncAssetFromMainTransaction;
  window.deleteAssetAutoByMainId = deleteAssetAutoByMainId;
})();
