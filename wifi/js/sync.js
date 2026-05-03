const SYNC_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzGZ4XnVT785n3d-Fc8-ZvnwtD2oq355SmNO441NFhX1x_6x5DnnznlDsbNKCn7AbS02Q/exec',
  SPREADSHEET_ID: '1-Fq6JhBd4NaiZZ0Xh_H7hRGB8QatHUgVwDH6ydeTY_s',
  BATCH_SIZE: 25,
  STORE_KEYS: {
    settings: 'key',
    categories: 'id',
    mainTransactions: 'id',
    moduleTransactions: 'id',
    reserveTransactions: 'id',
    assets: 'id',
    debts: 'id',
    ipRegisters: 'id',
    ipRegisterLogs: 'id'
  },
  MANAGED_STORES: ['settings','categories','mainTransactions','moduleTransactions','reserveTransactions','assets','debts','ipRegisters','ipRegisterLogs']
};

window.SYNC = {
  suppressQueue: false,
  busy: false,
  progress: { active:false, value:0, label:'', detail:'' },
  stats: { pending:0, failed:0, total:0, lastSyncAt:'', lastPullAt:'' },
  queueSelection: {},
  metaLoaded: false,

    shouldSyncRecord(store, valueOrKey){
    if(store !== 'settings') return true;
    const key = typeof valueOrKey === 'string'
      ? valueOrKey
      : String(valueOrKey?.key || '');
    return key !== 'theme';
  },

  async init(){
    if(!APP.navItems.some(x=>x.key==='syncFailed')) APP.navItems.splice(1,0,{ key:'syncFailed', label:'Gagal Sync', icon:'🔁' });
    await this.ensureMeta();
    this.patchDbQueueHooks();
    this.patchRenderers();
    await this.refreshStats();
  },
  async ensureMeta(){
    if(this.metaLoaded) return;
    const defaults = [
      { key:'lastSyncAt', value:'' },
      { key:'lastPullAt', value:'' },
      { key:'initialBootstrapDone', value:'0' }
    ];
    for(const row of defaults){ if(!await DB.get(STORES.syncMeta,row.key)) await DB.put(STORES.syncMeta,row); }
    this.metaLoaded = true;
  },
  queueCard(){
    const s = this.stats;
    return `
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 class="text-lg font-bold">Sinkronisasi Online</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Sync ke Google Sheets, pull ulang ke lokal, dan monitor antrean gagal sync.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="bootstrapLocalBtn" ${this.busy?'disabled':''} class="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Initial</button>
          <button id="syncNowBtn" ${this.busy?'disabled':''} class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Sync</button>
          <button id="pullNowBtn" ${this.busy?'disabled':''} class="rounded-2xl border px-4 py-2 text-sm font-semibold disabled:opacity-60">Pull</button>
          <button id="openQueueBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Antrian</button>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        ${card('Pending Sync', `${s.pending}`, 'Menunggu dikirim ke server', s.pending?'text-amber-600':'text-emerald-600')}
        ${card('Gagal Sync', `${s.failed}`, 'Bisa dipilih untuk sync ulang', s.failed?'text-rose-600':'text-emerald-600')}
        ${card('Total Antrean', `${s.total}`, 'Pending + gagal', s.total?'text-slate-900 dark:text-white':'text-emerald-600')}
        ${card('Status', this.busy ? `${this.progress.value}%` : 'Siap', this.busy ? escapeHtml(this.progress.label || 'Memproses...') : `Sync: ${this.stats.lastSyncAt ? formatDateTime(this.stats.lastSyncAt.slice(0,10), this.stats.lastSyncAt.slice(11,19)) : '-'} · Pull: ${this.stats.lastPullAt ? formatDateTime(this.stats.lastPullAt.slice(0,10), this.stats.lastPullAt.slice(11,19)) : '-'}`, this.busy?'text-blue-600':'text-emerald-600')}
      </div>
      <div class="mt-4">
        <div class="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div id="syncProgressBar" class="h-full rounded-full bg-blue-600 transition-all duration-300" style="width:${this.progress.active ? this.progress.value : 0}%"></div>
        </div>
        <div class="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span id="syncProgressLabel">${escapeHtml(this.progress.label || 'Belum ada proses sync/pull berjalan.')}</span>
          <span id="syncProgressValue">${this.progress.active ? this.progress.value+'%' : '0%'}</span>
        </div>
        ${this.progress.detail ? `<p class="mt-1 text-xs text-slate-400">${escapeHtml(this.progress.detail)}</p>` : ''}
      </div>
    </section>`;
  },
  failedPage(){
    const rows = (APP.state.syncQueue || []).filter(x => ['failed','pending'].includes(x.status)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    const totalSelected = rows.filter(x => this.queueSelection[x.id]).length;
    return `
    <div class="space-y-4">
      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 class="text-xl font-bold">Gagal Sync & Kartu Antrian</h2><p class="text-sm text-slate-500 dark:text-slate-400">Pilih data gagal/pending untuk disinkron ulang ke Google Sheets.</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="selectAllQueueBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Pilih Semua</button>
            <button id="clearQueueSelectionBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Reset Pilihan</button>
            <button id="retrySelectedQueueBtn" ${this.busy?'disabled':''} class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Sync Ulang Terpilih (${totalSelected})</button>
            <button id="retryAllQueueBtn" ${this.busy?'disabled':''} class="rounded-2xl border px-4 py-2 text-sm font-semibold disabled:opacity-60">Sync Semua</button>
          </div>
        </div>
      </section>
      ${this.queueCard()}
      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="table-wrap">
          <table class="min-w-full text-sm whitespace-nowrap">
            <thead>
              <tr class="border-b">
                <th class="px-3 py-2 text-center"><input id="toggleAllQueueCheckbox" type="checkbox" ${rows.length && totalSelected===rows.length ? 'checked':''}></th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-left">Store</th>
                <th class="px-3 py-2 text-left">Aksi</th>
                <th class="px-3 py-2 text-left">Kunci</th>
                <th class="px-3 py-2 text-left">Update</th>
                <th class="px-3 py-2 text-left">Pesan</th>
                <th class="px-3 py-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row=>`<tr class="border-b align-top">
                <td class="px-3 py-2 text-center"><input data-queue-check="${row.id}" type="checkbox" ${this.queueSelection[row.id]?'checked':''}></td>
                <td class="px-3 py-2"><span class="rounded-full px-2 py-1 text-xs font-semibold ${row.status==='failed'?'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300':'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}">${escapeHtml(row.status.toUpperCase())}</span></td>
                <td class="px-3 py-2">${escapeHtml(row.storeName)}</td>
                <td class="px-3 py-2">${escapeHtml(row.op)}</td>
                <td class="px-3 py-2">${escapeHtml(row.recordKey || '-')}</td>
                <td class="px-3 py-2">${escapeHtml(String(row.updatedAt||'-').replace('T',' ').slice(0,19))}</td>
                <td class="max-w-[340px] px-3 py-2 whitespace-normal text-xs text-slate-600 dark:text-slate-300">${escapeHtml(row.error || '-')}</td>
                <td class="px-3 py-2">
                  <div class="inline-flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                    <button type="button" data-queue-detail="${escapeHtml(row.id)}" class="whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">Detail</button>
                    <button type="button" data-queue-delete="${escapeHtml(row.id)}" class="whitespace-nowrap rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Hapus</button>
                  </div>
                </td>
              </tr>`).join('') || `<tr><td colspan="8" class="px-3 py-8 text-center text-slate-500">Tidak ada antrean gagal/pending.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
  },
  patchRenderers(){
    if(this._patchedRenderers) return;
    this._patchedRenderers = true;
    const oldDashboardPage = dashboardPage;
    dashboardPage = () => {
      const html = oldDashboardPage();
      return html.replace('<section class="grid grid-cols-1 gap-4 xl:grid-cols-2">', `${this.queueCard()}<section class="grid grid-cols-1 gap-4 xl:grid-cols-2">`);
    };
    const oldBindCoreEvents = bindCoreEvents;
    bindCoreEvents = () => {
      oldBindCoreEvents();
      document.getElementById('bootstrapLocalBtn')?.addEventListener('click', async ()=>{
        const queued = await this.bootstrapAllLocalToQueue();
        if(queued > 0) {
          showToast(`Upload awal disiapkan. ${queued} data masuk antrean sync.`);
          await this.syncAll();
        }
      });
      document.getElementById('syncNowBtn')?.addEventListener('click', ()=> this.syncAll());
      document.getElementById('pullNowBtn')?.addEventListener('click', ()=> this.pullFromServer());
      document.getElementById('openQueueBtn')?.addEventListener('click', ()=>{ APP.state.currentPage='syncFailed'; render(); });
    };
    const oldRender = render;
    render = () => {
      if(APP.state.currentPage === 'syncFailed'){
        applyTheme(APP.state.theme); renderNav();
        document.getElementById('pageContent').innerHTML = this.failedPage();
        bindCoreEvents(); bindMainEvents(); bindModuleEvents(); bindReserveEvents(); bindReportEvents(); bindSettingsEvents(); this.bindFailedEvents(); updateClock();
        return;
      }
      oldRender();
      if(APP.state.currentPage === 'dashboard') this.updateProgressUi();
    };
  },
  patchDbQueueHooks(){
    if(this._dbPatched) return;
    this._dbPatched = true;
    const basePut = DB.put.bind(DB);
    const baseDelete = DB.delete.bind(DB);
    DB.put = async (store, value) => {
  const result = await basePut(store, value);
  if(
    !this.suppressQueue &&
    SYNC_CONFIG.MANAGED_STORES.includes(store) &&
    this.shouldSyncRecord(store, value)
  ){
    await this.enqueueUpsert(store, value);
  }
  return result;
};

DB.delete = async (store, key) => {
  const result = await baseDelete(store, key);
  if(
    !this.suppressQueue &&
    SYNC_CONFIG.MANAGED_STORES.includes(store) &&
    this.shouldSyncRecord(store, key)
  ){
    await this.enqueueDelete(store, key);
  }
  return result;
};
  },
  async refreshStats(){
    APP.state.syncQueue = await DB.getAll(STORES.syncQueue);
    const meta = await DB.getAll(STORES.syncMeta);
    this.stats.pending = APP.state.syncQueue.filter(x=>x.status==='pending').length;
    this.stats.failed = APP.state.syncQueue.filter(x=>x.status==='failed').length;
    this.stats.total = APP.state.syncQueue.filter(x=>['pending','failed'].includes(x.status)).length;
    this.stats.lastSyncAt = meta.find(x=>x.key==='lastSyncAt')?.value || '';
    this.stats.lastPullAt = meta.find(x=>x.key==='lastPullAt')?.value || '';
  },
  async enqueueUpsert(store, value){
    const recordKey = this.extractKey(store, value);
    if(!recordKey) return;
    const id = `${store}::${recordKey}`;
    const now = new Date().toISOString();
    await DB.put(STORES.syncQueue, {
      id, storeName:store, recordKey, op:'upsert', payload:structuredClone(value), status:'pending', error:'', updatedAt:now
    });
    await this.refreshStats();
    if(APP.state.config && (APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed')) render();
  },
  async enqueueDelete(store, key){
    if(!key) return;
    const id = `${store}::${key}`;
    const now = new Date().toISOString();
    await DB.put(STORES.syncQueue, {
      id, storeName:store, recordKey:key, op:'delete', payload:null, status:'pending', error:'', updatedAt:now
    });
    await this.refreshStats();
    if(APP.state.config && (APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed')) render();
  },

  async bootstrapAllLocalToQueue(force=false){
    if(this.busy) return 0;
    const meta = await DB.get(STORES.syncMeta, 'initialBootstrapDone');
    const alreadyDone = String(meta?.value || '0') === '1';
    if(alreadyDone && !force){
      const proceed = confirm('Upload semua data lokal pernah ditandai sudah dilakukan. Ulangi dan masukkan semua data lokal ke antrean lagi?');
      if(!proceed) return 0;
    }
    this.busy = true;
    try{
      const stores = SYNC_CONFIG.MANAGED_STORES;
      let grandTotal = 0;
      const counts = {};
      for(const store of stores){
        const rows = (await DB.getAll(STORES[store] || store))
          .filter(row => this.shouldSyncRecord(store, row));
        counts[store] = rows.length;
        grandTotal += rows.length;
      }
      if(!grandTotal){
        showToast('Tidak ada data lokal yang perlu diupload.', 'info');
        return 0;
      }
      let queued = 0;
      this.setProgress(0, 'Menyiapkan semua data lokal ke antrean sync...', `Total data lokal: ${grandTotal}`);
      for(const store of stores){
        const rows = (await DB.getAll(STORES[store] || store))
          .filter(row => this.shouldSyncRecord(store, row));
        for(const row of rows){
          const recordKey = this.extractKey(store, row);
          if(!recordKey) continue;
          const id = `${store}::${recordKey}`;
          await DB.put(STORES.syncQueue, {
            id,
            storeName: store,
            recordKey,
            op: 'upsert',
            payload: structuredClone(row),
            status: 'pending',
            error: '',
            updatedAt: new Date().toISOString()
          });
          queued++;
          this.setProgress((queued / grandTotal) * 100, `Menyiapkan antrean upload awal ${queued}/${grandTotal}`, store);
        }
      }
      await DB.put(STORES.syncMeta, { key:'initialBootstrapDone', value:'1' });
      await this.refreshStats();
      this.setProgress(100, 'Semua data lokal sudah masuk antrean sync.', `Total ${queued} data siap diupload.`);
      return queued;
    }catch(err){
      console.error(err);
      this.setProgress(this.progress.value || 0, 'Gagal menyiapkan upload awal.', String(err.message || err));
      showToast(`Gagal menyiapkan upload awal: ${err.message || err}`, 'error');
      return 0;
    }finally{
      this.busy = false;
      if(APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed') render();
    }
  },
  extractKey(store, value){
    const keyName = SYNC_CONFIG.STORE_KEYS[store];
    return value?.[keyName] || '';
  },
  setProgress(value, label, detail=''){
    this.progress = { active:true, value:Math.max(0, Math.min(100, Math.round(value||0))), label:label||'', detail:detail||'' };
    this.updateProgressUi();
  },
  resetProgress(label='Belum ada proses sync/pull berjalan.'){
    this.progress = { active:false, value:0, label, detail:'' };
    this.updateProgressUi();
  },
  updateProgressUi(){
    const bar = document.getElementById('syncProgressBar');
    const label = document.getElementById('syncProgressLabel');
    const value = document.getElementById('syncProgressValue');
    if(bar) bar.style.width = `${this.progress.active ? this.progress.value : 0}%`;
    if(label) label.textContent = this.progress.label || 'Belum ada proses sync/pull berjalan.';
    if(value) value.textContent = `${this.progress.active ? this.progress.value : 0}%`;
  },
  async request(action, payload={}){
    if(!/^https?:\/\//.test(SYNC_CONFIG.WEB_APP_URL)) throw new Error('URL GAS belum diisi pada js/sync.js');
    const res = await fetch(SYNC_CONFIG.WEB_APP_URL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, spreadsheetId: SYNC_CONFIG.SPREADSHEET_ID, ...payload })
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.message || 'Permintaan ke server gagal');
    return json;
  },
  async syncAll(selectedIds=null){
    if(this.busy) return;
    this.busy = true;
    try{
      await this.refreshStats();
      let queue = (await DB.getAll(STORES.syncQueue)).filter(x => ['pending','failed'].includes(x.status));
      if(Array.isArray(selectedIds) && selectedIds.length) queue = queue.filter(x=>selectedIds.includes(x.id));
      if(!queue.length){
        const prepared = await this.bootstrapAllLocalToQueue();
        if(prepared > 0){
          queue = (await DB.getAll(STORES.syncQueue)).filter(x => ['pending','failed'].includes(x.status));
          if(Array.isArray(selectedIds) && selectedIds.length) queue = queue.filter(x=>selectedIds.includes(x.id));
        }
      }
      if(!queue.length){ showToast('Tidak ada antrean yang perlu disinkronkan.', 'info'); return; }
      const total = queue.length;
      let processed = 0;
      this.setProgress(0, 'Menyiapkan sinkronisasi...', `Total antrean: ${total}`);
      for(let i=0;i<queue.length;i+=SYNC_CONFIG.BATCH_SIZE){
        const batch = queue.slice(i, i+SYNC_CONFIG.BATCH_SIZE);
        const upserts = batch.filter(x=>x.op==='upsert').map(x=>({ store:x.storeName, key:x.recordKey, data:x.payload }));
        const deletes = batch.filter(x=>x.op==='delete').map(x=>({ store:x.storeName, key:x.recordKey }));
        if(upserts.length) await this.request('upsertBatch', { items: upserts });
        if(deletes.length) await this.request('deleteBatch', { items: deletes });
        for(const item of batch) await DB.delete(STORES.syncQueue, item.id);
        processed += batch.length;
        this.setProgress((processed/total)*100, `Sync ${processed}/${total} antrean`, `Batch ${Math.floor(i/SYNC_CONFIG.BATCH_SIZE)+1}`);
      }
      const now = new Date().toISOString();
      await DB.put(STORES.syncMeta, { key:'lastSyncAt', value:now });
      await this.refreshStats();
      this.setProgress(100, 'Sinkronisasi selesai.', `Total ${processed} antrean berhasil diproses.`);
      showToast(`Sync selesai. ${processed} antrean berhasil dikirim.`);
    }catch(err){
      console.error(err);
      const queue = await DB.getAll(STORES.syncQueue);
      for(const item of queue.filter(x=>['pending','failed'].includes(x.status))){
        if(selectedIds && !selectedIds.includes(item.id)) continue;
        await DB.put(STORES.syncQueue, { ...item, status:'failed', error:String(err.message||err), updatedAt:new Date().toISOString() });
      }
      await this.refreshStats();
      this.setProgress(this.progress.value || 0, 'Sinkronisasi gagal.', String(err.message||err));
      showToast(`Sync gagal: ${err.message || err}`, 'error');
    }finally{
      this.busy = false;
      if(APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed') render();
      if(!this.progress.active || this.progress.value===100) setTimeout(()=>{ this.resetProgress(this.progress.label || 'Selesai.'); if(APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed') render(); }, 1500);
    }
  },
  async pullFromServer(){
    if(this.busy) return;
    if(!confirm('Pull akan mengganti data lokal dengan data terbaru dari server Google Sheets. Lanjutkan?')) return;
    this.busy = true;
    try{
      this.setProgress(5, 'Mengambil data dari server...');
      const res = await this.request('pullAll', {});
      const data = res.data || {};
      const stores = SYNC_CONFIG.MANAGED_STORES;
      this.suppressQueue = true;
      this.setProgress(20, 'Mengosongkan data lokal lama...');
      for(let i=0;i<stores.length;i++) await DB.clear(STORES[stores[i]] || stores[i]);
      this.setProgress(55, 'Menulis data hasil pull ke local storage...');
      for(const store of stores){
        const rows = (Array.isArray(data[store]) ? data[store] : [])
          .filter(row => this.shouldSyncRecord(store, row));
        for(let i=0;i<rows.length;i++) {
          await DB.put(STORES[store] || store, rows[i]);
        }
      }
      this.setProgress(90, 'Membersihkan antrean sync lokal...');
      await DB.clear(STORES.syncQueue);
      const now = new Date().toISOString();
      await DB.put(STORES.syncMeta, { key:'lastPullAt', value:now });
      await loadState();
      await this.refreshStats();
      this.setProgress(100, 'Pull selesai. Data lokal sudah diperbarui dari server.');
      showToast('Pull selesai. Data lokal telah dimuat dari server.');
    }catch(err){
      console.error(err);
      this.setProgress(this.progress.value || 0, 'Pull gagal.', String(err.message||err));
      showToast(`Pull gagal: ${err.message || err}`, 'error');
    }finally{
      this.suppressQueue = false;
      this.busy = false;
      if(APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed') render();
      if(!this.progress.active || this.progress.value===100) setTimeout(()=>{ this.resetProgress(this.progress.label || 'Selesai.'); if(APP.state.currentPage==='dashboard' || APP.state.currentPage==='syncFailed') render(); }, 1500);
    }
  },
  queuePayloadRows(item){
    const rows = [
      ['ID Antrean', item?.id || '-'],
      ['Status', String(item?.status || '-').toUpperCase()],
      ['Store / Sheet', item?.storeName || '-'],
      ['Operasi Sync', item?.op === 'delete' ? 'DELETE / HAPUS DI SERVER' : 'UPSERT / TAMBAH-UPDATE DI SERVER'],
      ['Kunci Record', item?.recordKey || '-'],
      ['Update Terakhir', String(item?.updatedAt || '-').replace('T',' ').slice(0,19)],
      ['Pesan Error', item?.error || '-']
    ];

    const payload = item?.payload;
    if(item?.op === 'delete'){
      rows.push(['Keterangan', 'Antrean ini akan menghapus record dengan kunci di atas dari Google Sheets saat proses sync.']);
      return rows;
    }
    if(!payload || typeof payload !== 'object'){
      rows.push(['Payload', payload == null ? '-' : String(payload)]);
      return rows;
    }

    const walk = (obj, prefix='') => {
      Object.entries(obj).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if(Array.isArray(value)){
          if(!value.length) rows.push([path, '[]']);
          else if(value.every(v => v === null || ['string','number','boolean'].includes(typeof v))) rows.push([path, value.join(', ')]);
          else rows.push([path, JSON.stringify(value, null, 2)]);
        } else if(value && typeof value === 'object'){
          const entries = Object.keys(value);
          if(!entries.length) rows.push([path, '{}']);
          else walk(value, path);
        } else {
          rows.push([path, value == null || value === '' ? '-' : String(value)]);
        }
      });
    };
    walk(payload);
    return rows;
  },
  queueDetailModal(item){
    if(!item) return '';
    const rows = this.queuePayloadRows(item);
    return `
      <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3" data-queue-modal-backdrop>
        <div class="card flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div class="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h3 class="text-lg font-bold">Detail Data Antrean Sync</h3>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Periksa data yang akan dikirim atau dihapus dari Google Sheets sebelum disinkronkan.</p>
            </div>
            <button type="button" id="closeQueueDetailModal" class="rounded-2xl border px-3 py-2 text-sm font-semibold">Tutup</button>
          </div>
          <div class="overflow-auto p-4">
            <div class="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p class="text-xs text-slate-500">Status</p><p class="font-bold">${escapeHtml(String(item.status||'-').toUpperCase())}</p></div>
              <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p class="text-xs text-slate-500">Store</p><p class="font-bold">${escapeHtml(item.storeName||'-')}</p></div>
              <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p class="text-xs text-slate-500">Operasi</p><p class="font-bold">${escapeHtml(item.op||'-')}</p></div>
              <div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p class="text-xs text-slate-500">Kunci</p><p class="font-bold break-all">${escapeHtml(item.recordKey||'-')}</p></div>
            </div>
            <div class="table-wrap">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="border-b bg-slate-50 dark:bg-slate-800/70">
                    <th class="w-[260px] px-3 py-2 text-left">Field</th>
                    <th class="px-3 py-2 text-left">Isi Data</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(([field, value]) => `<tr class="border-b align-top"><td class="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(field)}</td><td class="px-3 py-2 whitespace-pre-wrap break-words">${escapeHtml(value)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2 rounded-b-3xl border-t border-slate-200 p-4 dark:border-slate-800">
            <button type="button" data-queue-delete-from-modal="${escapeHtml(item.id)}" class="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Hapus dari Antrean</button>
            <button type="button" id="closeQueueDetailModalBottom" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Tutup</button>
          </div>
        </div>
      </div>`;
  },
  openQueueDetail(id){
    const item = (APP.state.syncQueue || []).find(x => x.id === id);
    if(!item){ showToast('Data antrean tidak ditemukan.', 'error'); return; }
    const root = document.getElementById('modalRoot');
    if(!root) return;
    root.innerHTML = this.queueDetailModal(item);
    const close = () => { root.innerHTML = ''; };
    document.getElementById('closeQueueDetailModal')?.addEventListener('click', close);
    document.getElementById('closeQueueDetailModalBottom')?.addEventListener('click', close);
    root.querySelector('[data-queue-modal-backdrop]')?.addEventListener('click', (e)=>{ if(e.target?.hasAttribute('data-queue-modal-backdrop')) close(); });
    root.querySelector('[data-queue-delete-from-modal]')?.addEventListener('click', async (e)=>{
      await this.deleteQueueItem(e.currentTarget.dataset.queueDeleteFromModal);
      close();
    });
  },
  async deleteQueueItem(id){
    if(!id) return;
    const item = (APP.state.syncQueue || []).find(x => x.id === id) || await DB.get(STORES.syncQueue, id);
    if(!item){ showToast('Data antrean sudah tidak ada.', 'info'); return; }
    const ok = confirm(`Hapus antrean sync ini?\n\nStore: ${item.storeName || '-'}\nAksi: ${item.op || '-'}\nKunci: ${item.recordKey || '-'}\n\nData ini tidak akan ikut disinkronkan ke Google Sheets.`);
    if(!ok) return;
    await DB.delete(STORES.syncQueue, id);
    delete this.queueSelection[id];
    await this.refreshStats();
    showToast('Antrean sync berhasil dihapus.');
    if(APP.state.currentPage === 'dashboard' || APP.state.currentPage === 'syncFailed') render();
  },
  bindFailedEvents(){
    document.getElementById('selectAllQueueBtn')?.addEventListener('click', ()=>{
      (APP.state.syncQueue || []).filter(x=>['failed','pending'].includes(x.status)).forEach(x=>this.queueSelection[x.id]=true); render();
    });
    document.getElementById('clearQueueSelectionBtn')?.addEventListener('click', ()=>{ this.queueSelection = {}; render(); });
    document.getElementById('retrySelectedQueueBtn')?.addEventListener('click', ()=>{
      const ids = Object.keys(this.queueSelection).filter(id=>this.queueSelection[id]);
      this.syncAll(ids);
    });
    document.getElementById('retryAllQueueBtn')?.addEventListener('click', ()=> this.syncAll());
    document.getElementById('toggleAllQueueCheckbox')?.addEventListener('change', (e)=>{
      const checked = !!e.target.checked;
      (APP.state.syncQueue || []).filter(x=>['failed','pending'].includes(x.status)).forEach(x=>this.queueSelection[x.id]=checked);
      render();
    });
    document.querySelectorAll('[data-queue-check]').forEach(el=>el.addEventListener('change', ()=>{ this.queueSelection[el.dataset.queueCheck] = !!el.checked; }));
    document.querySelectorAll('[data-queue-detail]').forEach(btn=>btn.addEventListener('click', ()=> this.openQueueDetail(btn.dataset.queueDetail)));
    document.querySelectorAll('[data-queue-delete]').forEach(btn=>btn.addEventListener('click', ()=> this.deleteQueueItem(btn.dataset.queueDelete)));
  }
};

window.addEventListener('DOMContentLoaded', async ()=>{ await SYNC.init(); await SYNC.refreshStats(); render(); });
