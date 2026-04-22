(function(){
  const IP_STATUSES = ['AKTIF','NON AKTIF','RUSAK','DIJUAL'];
  const IP_EVENT_LABELS = { CREATE:'Buat Data', UPDATE:'Update Data', MOVE:'Pindah Lokasi', STATUS:'Update Status', DELETE:'Hapus Data' };

  function ipNow(){ return nowParts(); }
  function normalizeDigits(value=''){ return String(value || '').replace(/\D/g,'').slice(0,3); }
  function joinIpSegments(parts=[]){ return [0,1,2,3].map(i=>normalizeDigits(parts[i]||'')).join('.'); }
  function splitIpAddress(ip=''){ const parts = String(ip||'').split('.'); return [0,1,2,3].map(i=>normalizeDigits(parts[i]||'')); }
  function validIpSegments(parts=[]){ return [0,1,2,3].every(i => { const v = parts[i]; return v !== '' && Number(v) >= 0 && Number(v) <= 255; }); }
  function nextSeqNo(){ const nums = (APP.state.ipRegisters||[]).map(r=>Number(r.seqNo||0)).filter(n=>n>0); return nums.length ? Math.max(...nums)+1 : 1; }
  function locationOptions(){
    const cfg = getConfig();
    const opts = [{ value:'', label:'Pilih lokasi' }];
    (cfg.bases || []).forEach(base=>{
      opts.push({ value:`BASE::${base.id}`, label:`Base · ${base.name}` });
      (base.resellers || []).forEach(res=> opts.push({ value:`RESELLER::${base.id}::${res.id}`, label:`Reseller · ${base.name} / ${res.name}` }));
    });
    return opts;
  }
  function locationLabel(locationKey=''){
    if(!locationKey) return '-';
    const parts = String(locationKey).split('::');
    const kind = parts[0];
    const base = findBase(parts[1]);
    if(kind === 'BASE') return base ? `Base · ${base.name}` : 'Base';
    if(kind === 'RESELLER'){
      const res = findReseller(base, parts[2]);
      return `Reseller · ${(base?.name || 'Base')} / ${(res?.name || 'Reseller')}`;
    }
    return locationKey;
  }
  function statusBadge(status=''){
    const s = String(status||'').toUpperCase();
    const cls = s==='AKTIF' ? 'badge-emerald' : (s==='NON AKTIF' ? 'badge-blue' : (s==='RUSAK' ? 'badge-amber' : 'badge-rose'));
    return `<span class="badge ${cls}">${escapeHtml(s || '-')}</span>`;
  }
  function ipName(register){ return `${register.deviceName || '-'} #${register.seqNo || '-'}`; }
  function uniqSuggestions(values=[]){
    return Array.from(new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b,'id',{sensitivity:'base'}))));
  }
  function getIpAutocompleteSuggestions(){
    const rows = APP.state.ipRegisters || [];
    return {
      brands: uniqSuggestions(rows.map(r=>r.brand)),
      deviceTypes: uniqSuggestions(rows.map(r=>r.deviceType)),
      deviceNames: uniqSuggestions(rows.map(r=>r.deviceName))
    };
  }
  function renderDatalist(id, values=[]){
    const items = uniqSuggestions(values).slice(0,200);
    return `<datalist id="${id}">${items.map(v=>`<option value="${escapeHtml(v)}"></option>`).join('')}</datalist>`;
  }
  function getFilteredIpRegisters(){
    const f = APP.state.ipFilters || {};
    return (APP.state.ipRegisters || []).filter(row=>{
      if(f.status && f.status !== 'ALL' && row.status !== f.status) return false;
      if(f.locationKey && f.locationKey !== 'ALL' && row.locationKey !== f.locationKey) return false;
      const hay = [row.ipAddress,row.brand,row.deviceType,row.deviceName,row.seqNo,row.notes,locationLabel(row.locationKey),row.status].join(' ').toLowerCase();
      if((f.search||'').trim() && !hay.includes(String(f.search).toLowerCase())) return false;
      return true;
    });
  }
  function ipLogsFor(registerId=''){ return (APP.state.ipRegisterLogs || []).filter(x=>x.registerId===registerId).sort((a,b)=>`${b.eventDate||''} ${b.eventTime||''}`.localeCompare(`${a.eventDate||''} ${a.eventTime||''}`)); }
  function recentIpLogs(limit=20){ return (APP.state.ipRegisterLogs || []).slice(0, limit); }
  function selectedIpRegister(){ return (APP.state.ipRegisters || []).find(x=>x.id === APP.state.editIpRegisterId) || null; }
  function renderIpSegmentInputs(prefix, values){
    return `<div class="flex items-center gap-2">${[0,1,2,3].map(i=>`<input data-ip-part="${prefix}-${i}" inputmode="numeric" maxlength="3" value="${escapeHtml(values[i]||'')}" class="w-full rounded-2xl border px-3 py-2 text-center" placeholder="0">${i<3?'<span class="text-lg font-bold text-slate-400">.</span>':''}`).join('')}</div>`;
  }
  function ipRegisterPage(){
    const rows = getFilteredIpRegisters();
    const editing = selectedIpRegister();
    const logs = editing ? ipLogsFor(editing.id) : [];
    const locOpts = locationOptions();
    const form = APP.state.forms.ipRegister || { seqNo:'', ipParts:['','','',''], brand:'', deviceType:'', deviceName:'', locationKey:'', status:'AKTIF', notes:'' };
    const suggestions = getIpAutocompleteSuggestions();
    return `
    <div class="space-y-4">
      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 class="text-xl font-bold">Register IP AP / Router</h2><p class="text-sm text-slate-500 dark:text-slate-400">Catat IP statis, lokasi, status, dan histori perpindahan Access Point maupun router.</p></div>
          <div class="flex flex-wrap gap-2">
            <button id="ipExportXlsxBtn" class="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Export Excel</button>
            <button id="ipExportPdfBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export PDF</button>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
        <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">${editing ? 'Edit Register' : 'Tambah Register Baru'}</h3><p class="text-sm text-slate-500 dark:text-slate-400">Nomor urut boleh manual atau otomatis. IP diisi per segmen tanpa titik.</p></div>${editing ? '<button id="cancelIpEditBtn" class="rounded-2xl border px-3 py-2 text-sm font-semibold">Batal Edit</button>' : ''}</div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">No Urut</span><input id="ipSeqNo" type="number" min="1" value="${escapeHtml(String(form.seqNo || ''))}" placeholder="Kosong = auto ${nextSeqNo()}" class="w-full rounded-2xl border px-3 py-2"></label>
            <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Status</span><select id="ipStatus" class="w-full rounded-2xl border px-3 py-2">${IP_STATUSES.map(s=>`<option value="${s}" ${form.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
            <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Alamat IP</span>${renderIpSegmentInputs('form', form.ipParts || ['', '', '', ''])}</label>
            <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Merek</span><input id="ipBrand" type="text" list="ipBrandSuggestions" autocomplete="off" value="${escapeHtml(form.brand || '')}" placeholder="Contoh: Ruijie / TP-Link / MikroTik" class="w-full rounded-2xl border px-3 py-2">${renderDatalist('ipBrandSuggestions', suggestions.brands)}<span class="mt-1 block text-xs text-slate-400">Ketik beberapa karakter untuk memilih merek yang sudah pernah dipakai.</span></label>
            <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Type / Model</span><input id="ipDeviceType" type="text" list="ipDeviceTypeSuggestions" autocomplete="off" value="${escapeHtml(form.deviceType || '')}" placeholder="Contoh: RG-RAP2200(F)" class="w-full rounded-2xl border px-3 py-2">${renderDatalist('ipDeviceTypeSuggestions', suggestions.deviceTypes)}<span class="mt-1 block text-xs text-slate-400">Saran diambil dari data register yang sudah tersimpan / tersinkron ke lokal.</span></label>
            <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nama Perangkat</span><input id="ipDeviceName" type="text" list="ipDeviceNameSuggestions" autocomplete="off" value="${escapeHtml(form.deviceName || '')}" placeholder="Contoh: AP Lorong Masjid / Router Server" class="w-full rounded-2xl border px-3 py-2">${renderDatalist('ipDeviceNameSuggestions', suggestions.deviceNames)}<span class="mt-1 block text-xs text-slate-400">Cocok untuk menyeragamkan penamaan perangkat agar konsisten.</span></label>
            <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Lokasi Saat Ini</span><select id="ipLocationKey" class="w-full rounded-2xl border px-3 py-2">${locOpts.map(opt=>`<option value="${escapeHtml(opt.value)}" ${form.locationKey===opt.value?'selected':''}>${escapeHtml(opt.label)}</option>`).join('')}</select></label>
            <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Catatan</span><textarea id="ipNotes" rows="3" class="w-full rounded-2xl border px-3 py-2" placeholder="Catatan tambahan">${escapeHtml(form.notes || '')}</textarea></label>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button id="saveIpRegisterBtn" class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">${editing ? 'Simpan Perubahan' : 'Simpan Register'}</button>
            <button id="resetIpRegisterBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Reset Form</button>
          </div>
          ${editing ? `<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Gunakan panel <strong>Pindah / Update Status</strong> di samping untuk mencatat histori perpindahan atau perubahan status secara rapi ke log.</div>` : ''}
        </div>

        <div class="space-y-4">
          <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-4"><h3 class="text-lg font-bold">Filter & Ringkasan</h3></div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select id="ipFilterStatus" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Status</option>${IP_STATUSES.map(s=>`<option value="${s}" ${APP.state.ipFilters.status===s?'selected':''}>${s}</option>`).join('')}</select>
              <select id="ipFilterLocation" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Lokasi</option>${locOpts.filter(x=>x.value).map(opt=>`<option value="${escapeHtml(opt.value)}" ${APP.state.ipFilters.locationKey===opt.value?'selected':''}>${escapeHtml(opt.label)}</option>`).join('')}</select>
              <input id="ipFilterSearch" type="text" value="${escapeHtml(APP.state.ipFilters.search || '')}" placeholder="Cari IP / merek / nama" class="rounded-2xl border px-3 py-2">
            </div>
            <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">${rows.length} perangkat tampil</span>
              <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Aktif ${(APP.state.ipRegisters||[]).filter(x=>x.status==='AKTIF').length}</span>
              <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Rusak ${(APP.state.ipRegisters||[]).filter(x=>x.status==='RUSAK').length}</span>
              <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Dijual ${(APP.state.ipRegisters||[]).filter(x=>x.status==='DIJUAL').length}</span>
            </div>
          </section>

          ${editing ? `
          <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-4"><h3 class="text-lg font-bold">Pindah / Update Status</h3><p class="text-sm text-slate-500 dark:text-slate-400">Perubahan dari panel ini akan masuk ke histori log.</p></div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="rounded-2xl border p-3 dark:border-slate-700"><div class="text-xs text-slate-500 dark:text-slate-400">Perangkat</div><div class="font-semibold">${escapeHtml(ipName(editing))}</div></div>
              <div class="rounded-2xl border p-3 dark:border-slate-700"><div class="text-xs text-slate-500 dark:text-slate-400">Lokasi Saat Ini</div><div class="font-semibold">${escapeHtml(locationLabel(editing.locationKey))}</div></div>
              <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Pindahkan ke Lokasi</span><select id="moveIpLocationKey" class="w-full rounded-2xl border px-3 py-2">${locOpts.filter(x=>x.value).map(opt=>`<option value="${escapeHtml(opt.value)}" ${editing.locationKey===opt.value?'selected':''}>${escapeHtml(opt.label)}</option>`).join('')}</select></label>
              <label class="text-sm md:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Catatan Pindah</span><input id="moveIpNotes" type="text" placeholder="Contoh: dipindah ke base Orbit karena relayout" class="w-full rounded-2xl border px-3 py-2"></label>
            </div>
            <div class="mt-3"><button id="moveIpRegisterBtn" class="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Simpan Pindah Lokasi</button></div>
            <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Status Baru</span><select id="changeIpStatusValue" class="w-full rounded-2xl border px-3 py-2">${IP_STATUSES.map(s=>`<option value="${s}" ${editing.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
              <label class="text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Catatan Status</span><input id="changeIpStatusNotes" type="text" placeholder="Contoh: port LAN rusak" class="w-full rounded-2xl border px-3 py-2"></label>
            </div>
            <div class="mt-3 flex flex-wrap gap-2"><button id="changeIpStatusBtn" class="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white">Simpan Update Status</button><button id="deleteIpRegisterBtn" class="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600">Hapus Data</button></div>
          </section>

          <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-4"><h3 class="text-lg font-bold">Histori Perangkat Terpilih</h3></div>
            <div class="table-wrap"><table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Event</th><th class="px-3 py-2 text-left">Dari</th><th class="px-3 py-2 text-left">Ke</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Catatan</th></tr></thead><tbody>${logs.map(log=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(log.eventDate, log.eventTime)}</td><td class="px-3 py-2">${escapeHtml(IP_EVENT_LABELS[log.eventType] || log.eventType)}</td><td class="px-3 py-2">${escapeHtml(log.fromLabel || '-')}</td><td class="px-3 py-2">${escapeHtml(log.toLabel || '-')}</td><td class="px-3 py-2">${escapeHtml(log.status || '-')}</td><td class="px-3 py-2">${escapeHtml(log.notes || '-')}</td></tr>`).join('') || '<tr><td colspan="6" class="px-3 py-8 text-center text-slate-500">Belum ada histori.</td></tr>'}</tbody></table></div>
          </section>` : ''}
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">Daftar Register IP</h3><p class="text-sm text-slate-500 dark:text-slate-400">Klik Edit untuk membuka histori pindah dan update status.</p></div></div>
        <div class="table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">No</th><th class="px-3 py-2 text-left">IP</th><th class="px-3 py-2 text-left">Merek</th><th class="px-3 py-2 text-left">Type</th><th class="px-3 py-2 text-left">Nama + No</th><th class="px-3 py-2 text-left">Lokasi</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Update</th><th class="px-3 py-2 text-left">Aksi</th></tr></thead><tbody>${rows.map((row, idx)=>`<tr class="border-b"><td class="px-3 py-2">${idx+1}</td><td class="px-3 py-2 font-mono">${escapeHtml(row.ipAddress)}</td><td class="px-3 py-2">${escapeHtml(row.brand || '-')}</td><td class="px-3 py-2">${escapeHtml(row.deviceType || '-')}</td><td class="px-3 py-2">${escapeHtml(ipName(row))}</td><td class="px-3 py-2">${escapeHtml(locationLabel(row.locationKey))}</td><td class="px-3 py-2">${statusBadge(row.status)}</td><td class="px-3 py-2">${escapeHtml(row.updatedAt ? formatDateTime(String(row.updatedAt).slice(0,10), String(row.updatedAt).slice(11,19)) : '-')}</td><td class="px-3 py-2"><div class="flex gap-2"><button data-ip-edit="${row.id}" class="rounded-xl border px-3 py-2 text-xs font-semibold">Edit</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="px-3 py-8 text-center text-slate-500">Belum ada data register IP.</td></tr>'}</tbody></table></div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4"><h3 class="text-lg font-bold">Log Terbaru</h3></div>
        <div class="table-wrap"><table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Perangkat</th><th class="px-3 py-2 text-left">Event</th><th class="px-3 py-2 text-left">Rincian</th><th class="px-3 py-2 text-left">Catatan</th></tr></thead><tbody>${recentIpLogs(30).map(log=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(log.eventDate, log.eventTime)}</td><td class="px-3 py-2">${escapeHtml(log.deviceLabel || '-')}</td><td class="px-3 py-2">${escapeHtml(IP_EVENT_LABELS[log.eventType] || log.eventType)}</td><td class="px-3 py-2">${escapeHtml([log.fromLabel?`Dari ${log.fromLabel}`:'', log.toLabel?`Ke ${log.toLabel}`:'', log.status?`Status ${log.status}`:''].filter(Boolean).join(' · ') || '-')}</td><td class="px-3 py-2">${escapeHtml(log.notes || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">Belum ada log.</td></tr>'}</tbody></table></div>
      </section>
    </div>`;
  }

  function readIpForm(){
    const parts = [0,1,2,3].map(i => normalizeDigits(document.querySelector(`[data-ip-part="form-${i}"]`)?.value || ''));
    return {
      seqNo: String(document.getElementById('ipSeqNo')?.value || '').trim(),
      ipParts: parts,
      brand: String(document.getElementById('ipBrand')?.value || '').trim(),
      deviceType: String(document.getElementById('ipDeviceType')?.value || '').trim(),
      deviceName: String(document.getElementById('ipDeviceName')?.value || '').trim(),
      locationKey: String(document.getElementById('ipLocationKey')?.value || ''),
      status: String(document.getElementById('ipStatus')?.value || 'AKTIF'),
      notes: String(document.getElementById('ipNotes')?.value || '').trim()
    };
  }
  function resetIpRegisterForm(preserve=false){
    APP.state.editIpRegisterId = null;
    APP.state.forms.ipRegister = { seqNo:'', ipParts:['','','',''], brand:'', deviceType:'', deviceName:'', locationKey:'', status:'AKTIF', notes:'' };
    if(!preserve) render();
  }
  function fillIpRegisterForm(row){
    APP.state.editIpRegisterId = row.id;
    APP.state.forms.ipRegister = { seqNo:String(row.seqNo || ''), ipParts: splitIpAddress(row.ipAddress), brand:row.brand||'', deviceType:row.deviceType||'', deviceName:row.deviceName||'', locationKey:row.locationKey||'', status:row.status||'AKTIF', notes:row.notes||'' };
    render();
  }
  async function appendIpLog(register, eventType, payload={}){
    const now = ipNow();
    const log = {
      id: uuid(),
      registerId: register.id,
      deviceLabel: ipName(register),
      ipAddress: register.ipAddress,
      eventType,
      fromLabel: payload.fromLabel || '',
      toLabel: payload.toLabel || '',
      status: payload.status || register.status || '',
      notes: payload.notes || '',
      eventDate: now.date,
      eventTime: now.time,
      updatedAt: new Date().toISOString()
    };
    await DB.put(STORES.ipRegisterLogs, log);
  }
  async function saveIpRegister(){
    const form = readIpForm();
    if(!validIpSegments(form.ipParts)) return showToast('Alamat IP belum lengkap atau ada segmen di luar 0-255.', 'error');
    if(!form.brand) return showToast('Merek harus diisi.', 'error');
    if(!form.deviceType) return showToast('Type / Model harus diisi.', 'error');
    if(!form.deviceName) return showToast('Nama perangkat harus diisi.', 'error');
    if(!form.locationKey) return showToast('Lokasi harus dipilih.', 'error');
    const seqNo = Number(form.seqNo || nextSeqNo());
    if(!seqNo || seqNo < 1) return showToast('No urut harus lebih dari 0.', 'error');
    const ipAddress = joinIpSegments(form.ipParts);
    const editId = APP.state.editIpRegisterId || '';
    if((APP.state.ipRegisters || []).some(r => r.id !== editId && Number(r.seqNo) === seqNo)) return showToast('No urut sudah digunakan perangkat lain.', 'error');
    if((APP.state.ipRegisters || []).some(r => r.id !== editId && String(r.ipAddress) === ipAddress)) return showToast('Alamat IP sudah digunakan perangkat lain.', 'error');
    const nowIso = new Date().toISOString();
    const current = editId ? ((APP.state.ipRegisters || []).find(x=>x.id===editId) || null) : null;
    const row = {
      id: current?.id || uuid(),
      seqNo,
      ipAddress,
      brand: form.brand,
      deviceType: form.deviceType,
      deviceName: form.deviceName,
      locationKey: form.locationKey,
      locationLabel: locationLabel(form.locationKey),
      status: form.status,
      notes: form.notes,
      createdAt: current?.createdAt || nowIso,
      updatedAt: nowIso,
      lastMoveAt: current?.lastMoveAt || nowIso,
      lastStatusAt: current?.lastStatusAt || nowIso
    };
    await DB.put(STORES.ipRegisters, row);
    if(!current){
      await appendIpLog(row, 'CREATE', { toLabel: locationLabel(row.locationKey), status: row.status, notes: row.notes || 'Data register dibuat' });
    } else {
      await appendIpLog(row, 'UPDATE', { fromLabel: current.locationLabel || locationLabel(current.locationKey), toLabel: locationLabel(row.locationKey), status: row.status, notes: 'Perubahan data induk register' });
    }
    await loadState();
    resetIpRegisterForm(true);
    render();
    showToast(current ? 'Register IP berhasil diperbarui.' : 'Register IP berhasil disimpan.');
  }
  async function moveIpRegister(){
    const row = selectedIpRegister();
    if(!row?.id) return showToast('Pilih data yang ingin dipindahkan.', 'error');
    const target = String(document.getElementById('moveIpLocationKey')?.value || '');
    const notes = String(document.getElementById('moveIpNotes')?.value || '').trim();
    if(!target) return showToast('Lokasi tujuan belum dipilih.', 'error');
    if(target === row.locationKey) return showToast('Lokasi tujuan sama dengan lokasi saat ini.', 'error');
    const updated = { ...row, locationKey:target, locationLabel:locationLabel(target), updatedAt:new Date().toISOString(), lastMoveAt:new Date().toISOString() };
    await DB.put(STORES.ipRegisters, updated);
    await appendIpLog(updated, 'MOVE', { fromLabel:locationLabel(row.locationKey), toLabel:locationLabel(target), status:updated.status, notes:notes || 'Perangkat dipindahkan' });
    await loadState();
    fillIpRegisterForm((APP.state.ipRegisters || []).find(x=>x.id===row.id) || updated);
    showToast('Perpindahan lokasi berhasil dicatat.');
  }
  async function changeIpRegisterStatus(){
    const row = selectedIpRegister();
    if(!row?.id) return showToast('Pilih data yang ingin diubah statusnya.', 'error');
    const status = String(document.getElementById('changeIpStatusValue')?.value || '');
    const notes = String(document.getElementById('changeIpStatusNotes')?.value || '').trim();
    if(!status) return showToast('Status belum dipilih.', 'error');
    if(status === row.status) return showToast('Status baru sama dengan status saat ini.', 'error');
    const updated = { ...row, status, updatedAt:new Date().toISOString(), lastStatusAt:new Date().toISOString() };
    await DB.put(STORES.ipRegisters, updated);
    await appendIpLog(updated, 'STATUS', { fromLabel:locationLabel(row.locationKey), toLabel:locationLabel(row.locationKey), status, notes:notes || `Status diubah dari ${row.status} ke ${status}` });
    await loadState();
    fillIpRegisterForm((APP.state.ipRegisters || []).find(x=>x.id===row.id) || updated);
    showToast('Status perangkat berhasil diperbarui.');
  }
  async function deleteIpRegister(){
    const row = selectedIpRegister();
    if(!row?.id) return showToast('Data tidak ditemukan.', 'error');
    if(!confirm(`Hapus register ${ipName(row)} (${row.ipAddress})?`)) return;
    await appendIpLog(row, 'DELETE', { fromLabel:locationLabel(row.locationKey), status:row.status, notes:'Data register dihapus' });
    await DB.delete(STORES.ipRegisters, row.id);
    await loadState();
    resetIpRegisterForm(true);
    render();
    showToast('Register IP dihapus.');
  }
  function exportIpRegisterXlsx(){
    if(!window.XLSX) return showToast('Library Excel belum termuat.', 'error');
    const wb = XLSX.utils.book_new();
    const rows = (APP.state.ipRegisters || []).map((row, idx)=>({ No:idx+1, NoUrut:Number(row.seqNo||0), IP:row.ipAddress, Merek:row.brand||'', Type:row.deviceType||'', Nama:row.deviceName||'', NamaNo:`${row.deviceName || ''} #${row.seqNo || ''}`, Lokasi:locationLabel(row.locationKey), Status:row.status||'', Catatan:row.notes||'', Dibuat:row.createdAt||'', Update:row.updatedAt||'' }));
    const logs = (APP.state.ipRegisterLogs || []).map((log, idx)=>({ No:idx+1, Tanggal:formatDateTime(log.eventDate, log.eventTime), Perangkat:log.deviceLabel||'', IP:log.ipAddress||'', Event:IP_EVENT_LABELS[log.eventType] || log.eventType, Dari:log.fromLabel||'', Ke:log.toLabel||'', Status:log.status||'', Catatan:log.notes||'' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{Info:'Belum ada data'}]), 'Register IP');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logs.length ? logs : [{Info:'Belum ada log'}]), 'Histori IP');
    XLSX.writeFile(wb, `register-ip-ap-${todayDateIso()}.xlsx`);
  }
  function exportIpRegisterPdf(){
    if(!window.jspdf?.jsPDF) return showToast('Library PDF belum termuat.', 'error');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });
    doc.setFontSize(14); doc.text('Register IP AP / Router', 40, 36);
    doc.setFontSize(9); doc.text(`Dicetak: ${nowParts().display} WIB`, 40, 52);
    doc.autoTable({
      startY: 68,
      head: [['No','No Urut','IP','Merek','Type','Nama + No','Lokasi','Status']],
      body: (APP.state.ipRegisters || []).map((row, idx)=>[idx+1, row.seqNo || '-', row.ipAddress || '-', row.brand || '-', row.deviceType || '-', ipName(row), locationLabel(row.locationKey), row.status || '-']),
      styles:{ fontSize:8, cellPadding:4 }
    });
    const nextY = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(12); doc.text('Histori Perubahan', 40, nextY);
    doc.autoTable({
      startY: nextY + 8,
      head: [['Tanggal','Perangkat','Event','Dari','Ke','Status','Catatan']],
      body: (APP.state.ipRegisterLogs || []).map(log=>[formatDateTime(log.eventDate, log.eventTime), log.deviceLabel || '-', IP_EVENT_LABELS[log.eventType] || log.eventType, log.fromLabel || '-', log.toLabel || '-', log.status || '-', log.notes || '-']),
      styles:{ fontSize:7.5, cellPadding:4 }
    });
    doc.save(`register-ip-ap-${todayDateIso()}.pdf`);
  }
  function bindIpSegmentInputs(){
    document.querySelectorAll('[data-ip-part^="form-"]').forEach(input=>{
      input.addEventListener('input', e=>{
        e.target.value = normalizeDigits(e.target.value);
        if(e.target.value.length >= 3){
          const idx = Number(String(e.target.dataset.ipPart).split('-')[1] || 0);
          document.querySelector(`[data-ip-part="form-${idx+1}"]`)?.focus();
        }
      });
    });
  }
  function bindIpRegisterEvents(){
    if(APP.state.currentPage !== 'ipregister') return;
    bindIpSegmentInputs();
    document.getElementById('saveIpRegisterBtn')?.addEventListener('click', saveIpRegister);
    document.getElementById('resetIpRegisterBtn')?.addEventListener('click', ()=> resetIpRegisterForm());
    document.getElementById('cancelIpEditBtn')?.addEventListener('click', ()=> resetIpRegisterForm());
    document.getElementById('ipFilterStatus')?.addEventListener('change', e=>{ APP.state.ipFilters.status = e.target.value; render(); });
    document.getElementById('ipFilterLocation')?.addEventListener('change', e=>{ APP.state.ipFilters.locationKey = e.target.value; render(); });
    document.getElementById('ipFilterSearch')?.addEventListener('input', e=>{ APP.state.ipFilters.search = e.target.value; scheduleRender ? scheduleRender({ preserveInputId:'ipFilterSearch', preserveCursor:true }) : render(); });
    document.querySelectorAll('[data-ip-edit]').forEach(btn=>btn.addEventListener('click', ()=>{ const row = (APP.state.ipRegisters || []).find(x=>x.id===btn.dataset.ipEdit); if(row) fillIpRegisterForm(row); }));
    document.getElementById('moveIpRegisterBtn')?.addEventListener('click', moveIpRegister);
    document.getElementById('changeIpStatusBtn')?.addEventListener('click', changeIpRegisterStatus);
    document.getElementById('deleteIpRegisterBtn')?.addEventListener('click', deleteIpRegister);
    document.getElementById('ipExportXlsxBtn')?.addEventListener('click', exportIpRegisterXlsx);
    document.getElementById('ipExportPdfBtn')?.addEventListener('click', exportIpRegisterPdf);
  }

  window.ipRegisterPage = ipRegisterPage;
  window.bindIpRegisterEvents = bindIpRegisterEvents;
  window.resetIpRegisterForm = resetIpRegisterForm;
})();
