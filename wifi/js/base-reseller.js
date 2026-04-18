function moduleTabToType(tab){
  return { deposit:'DEPOSIT', setor:'SETOR' }[tab] || 'DEPOSIT';
}
function typeToModuleTab(type){
  return { DEPOSIT:'deposit', SETOR:'setor' }[type] || 'deposit';
}

function defaultActorKeyForBase(baseId){
  const base = findBase(baseId);
  if(!base) return '';
  if(base.directEnabled) return actorKey(base.id, '');
  if(base.resellers?.[0]) return actorKey(base.id, base.resellers[0].id);
  return '';
}
function ensureModuleActor(baseId, actor=''){
  const actors = moduleActorsForBase(baseId);
  if(actor && actors.some(x=>x.value===actor)) return actor;
  return actors[0]?.value || '';
}
function resetModuleForm(keepSelection=false){
  const fallbackBaseId = APP.state.config?.bases?.[0]?.id || '';
  const prev = APP.state.forms.module || {};
  const baseId = keepSelection ? (prev.baseId || fallbackBaseId) : fallbackBaseId;
  APP.state.forms.module = {
    txType:moduleTabToType(APP.state.moduleTab),
    baseId,
    actorKey: keepSelection ? ensureModuleActor(baseId, prev.actorKey || defaultActorKeyForBase(baseId)) : defaultActorKeyForBase(baseId),
    recipient:'ACTOR',
    nominal:0,
    notes:'',
    date: keepSelection ? (prev.date || todayDateIso()) : todayDateIso(),
    time: currentTimeWIB(),
    linkedDepositId: keepSelection ? (prev.linkedDepositId || '') : '',
    sourceDepositSnapshot: keepSelection ? (prev.sourceDepositSnapshot || null) : null
  };
  APP.state.editModuleId = null;
}
function moduleActorsForBase(baseId){
  const base = findBase(baseId); if(!base) return [];
  const arr = [];
  if(base.directEnabled) arr.push({ value:actorKey(base.id,''), label:`Langsung ke Base (${base.name})`, resellerId:'' });
  (base.resellers||[]).forEach(res => arr.push({ value:actorKey(base.id,res.id), label:`Reseller - ${res.name}`, resellerId:res.id }));
  return arr;
}
function parseActorKey(key=''){ const [baseId, tail] = String(key).split('::'); return { baseId, resellerId: tail && tail !== 'DIRECT' ? tail : '' }; }
function getFilteredModuleTransactions(type='ALL', filters = APP.state.moduleFilters){
  const {modStart,modEnd,baseId,actorKey:actor,modSearch=''} = filters;
  const q = String(modSearch||'').trim().toLowerCase();
  return [...APP.state.moduleTransactions]
    .filter(x => type==='ALL' || x.moduleType===type)
    .filter(x => !modStart || x.date >= modStart)
    .filter(x => !modEnd || x.date <= modEnd)
    .filter(x => baseId==='ALL' || x.baseId===baseId)
    .filter(x => actor==='ALL' || x.actorKey===actor)
    .filter(x => {
      if(!q) return true;
      const base = findBase(x.baseId);
      const hay = [
        base?.name || '',
        actorLabel(base, x.resellerId),
        x.notes || '',
        x.moduleType || '',
        String(x.nominal || ''),
        formatDate(x.date),
        formatDateTime(x.date, x.time)
      ].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function txDecorated(tx){
  const base = findBase(tx.baseId);
  return {
    ...tx,
    baseName:base?.name||'-',
    actorName:actorLabel(base, tx.resellerId),
    recipientLabel: PROFIT_RECIPIENTS[tx.recipient || 'ACTOR'] || '-'
  };
}
function linkedSetorForDeposit(depositId=''){
  return APP.state.moduleTransactions.find(x=>x.moduleType==='SETOR' && x.linkedDepositId===depositId) || null;
}

function filterMirroredSetorRows(rows, filters = APP.state.moduleFilters){
  const smart = filters.setorSmart || 'ALL';
  if(smart === 'ALL') return rows;
  const today = todayDateIso();
  return rows.filter(row => {
    if(smart === 'UNSETTLED') return !row.setorId;
    if(smart === 'PARTIAL') return !!row.setorId && row.setorNominal > 0 && row.setorNominal < row.targetSetor;
    if(smart === 'FULL') return !!row.setorId && row.setorNominal >= row.targetSetor;
    if(smart === 'TODAY_DEPOSIT') return row.depositDate === today;
    if(smart === 'TODAY_SETOR') return !!row.setorId && row.setorDate === today;
    if(smart === 'PIUTANG') return Number(row.receivable||0) > 0;
    return true;
  });
}
function filterDepositRows(rows, filters = APP.state.moduleFilters){
  const smart = filters.depositSmart || 'ALL';
  if(smart === 'ALL') return rows;
  const today = todayDateIso();
  return rows.filter(tx => {
    const setor = linkedSetorForDeposit(tx.id);
    const setorNominal = Number(setor?.nominal || 0);
    const target = Number(tx.expectedSetor || 0);
    if(smart === 'TODAY') return tx.date === today;
    if(smart === 'UNSETTLED') return !setor;
    if(smart === 'PARTIAL') return !!setor && setorNominal > 0 && setorNominal < target;
    if(smart === 'FULL') return !!setor && setorNominal >= target;
    if(smart === 'PIUTANG') return Math.max(0, target - setorNominal) > 0;
    return true;
  });
}
function moduleActorFilterOptions(filters = APP.state.moduleFilters){
  if(filters.baseId && filters.baseId !== 'ALL') return moduleActorsForBase(filters.baseId);
  return (APP.state.config?.bases || []).flatMap(base => moduleActorsForBase(base.id));
}
function moduleQuickFilterBar(tab, context='module'){
  const rf = context === 'report' ? APP.state.reportFilters : APP.state.moduleFilters;
  const actorOptions = moduleActorFilterOptions(rf);
  const smartKey = tab === 'setor' ? 'setorSmart' : 'depositSmart';
  const chips = tab === 'setor'
    ? [
        ['ALL','Semua'],
        ['UNSETTLED','Belum Disetor'],
        ['PARTIAL','Setor Sebagian'],
        ['FULL','Setor Penuh'],
        ['PIUTANG','Masih Piutang'],
        ['TODAY_SETOR','Setor Hari Ini']
      ]
    : [
        ['ALL','Semua'],
        ['TODAY','Deposit Hari Ini'],
        ['UNSETTLED','Belum Disetor'],
        ['PARTIAL','Setor Sebagian'],
        ['FULL','Setor Penuh'],
        ['PIUTANG','Masih Piutang']
      ];
  return `<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
    <div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_repeat(4,minmax(0,1fr))]">
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Cari cepat</span><input id="${context}SearchFilter" type="text" value="${escapeHtml(rf.modSearch||'')}" placeholder="base / pelaku / catatan / nominal" class="w-full rounded-2xl border px-3 py-2"></label>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Dari</span><input id="${context}StartFilter" type="date" value="${rf.modStart||''}" class="w-full rounded-2xl border px-3 py-2"></label>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Sampai</span><input id="${context}EndFilter" type="date" value="${rf.modEnd||''}" class="w-full rounded-2xl border px-3 py-2"></label>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Base</span><select id="${context}BaseFilter" class="w-full rounded-2xl border px-3 py-2"><option value="ALL">Semua Base</option>${getConfig().bases.map(base=>`<option value="${base.id}" ${rf.baseId===base.id?'selected':''}>${escapeHtml(base.name)}</option>`).join('')}</select></label>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Pelaku</span><select id="${context}ActorFilter" class="w-full rounded-2xl border px-3 py-2"><option value="ALL">Semua Pelaku</option>${actorOptions.map(opt=>`<option value="${opt.value}" ${rf.actorKey===opt.value?'selected':''}>${escapeHtml(opt.label)}</option>`).join('')}</select></label>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filter pintar:</span>
      ${chips.map(([value,label])=>`<button type="button" data-smart-context="${context}" data-smart-filter="${smartKey}" data-smart-value="${value}" class="rounded-full border px-3 py-1.5 text-xs font-semibold ${String(rf[smartKey]||'ALL')===value?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-slate-900'}">${label}</button>`).join('')}
      <button type="button" id="${context}ResetFilters" class="ml-auto rounded-2xl border px-3 py-2 text-xs font-semibold">Reset Filter</button>
    </div>
  </div>`;
}
function mirroredSetorRows(){
  return getFilteredModuleTransactions('DEPOSIT').map(tx=>{
    const dec = txDecorated(tx);
    const setor = linkedSetorForDeposit(tx.id);
    const setorNominal = Number(setor?.nominal||0);
    const target = Number(tx.expectedSetor||0);
    return {
      ...dec,
      depositId: tx.id,
      depositDate: tx.date,
      depositTime: tx.time,
      depositNominal: Number(tx.nominal||0),
      targetSetor: target,
      setorId: setor?.id || '',
      setorNominal,
      setorDate: setor?.date || tx.date,
      setorTime: setor?.time || tx.time,
      setorNotes: setor?.notes || '',
      receivable: Math.max(0, target - setorNominal),
      statusLabel: !setor ? 'Belum Disetor' : (setorNominal >= target ? 'Setor Penuh' : 'Setor Sebagian')
    };
  });
}
function startSetorFromDeposit(depositId){
  const tx = APP.state.moduleTransactions.find(x=>x.id===depositId && x.moduleType==='DEPOSIT');
  if(!tx) return showToast('Data deposit tidak ditemukan.', 'error');
  const existing = linkedSetorForDeposit(depositId);
  APP.state.moduleTab = 'setor';
  APP.state.editModuleId = existing?.id || null;
  APP.state.forms.module = {
    txType:'SETOR',
    baseId:tx.baseId,
    actorKey:tx.actorKey,
    recipient:'ACTOR',
    nominal:Number(existing?.nominal ?? tx.expectedSetor ?? 0),
    notes:existing?.notes || `Setoran dari deposit ${formatDateTime(tx.date, tx.time)}${tx.notes ? ' - ' + tx.notes : ''}`,
    date:existing?.date || tx.date,
    time:existing?.time || tx.time,
    linkedDepositId:depositId,
    sourceDepositSnapshot: {
      id: tx.id,
      baseId: tx.baseId,
      resellerId: tx.resellerId || '',
      actorKey: tx.actorKey,
      date: tx.date,
      time: tx.time,
      nominal: Number(tx.nominal||0),
      expectedSetor: Number(tx.expectedSetor||0),
      notes: tx.notes || ''
    }
  };
  render();
}
function aggregateModuleReport(){
  const rowsMap = new Map();
  const txs = getFilteredModuleTransactions('ALL');
  for(const tx of txs){
    if(!['DEPOSIT','SETOR'].includes(tx.moduleType)) continue;
    const base = findBase(tx.baseId); if(!base) continue;
    const key = tx.actorKey || actorKey(tx.baseId, tx.resellerId || '');
    if(!rowsMap.has(key)) rowsMap.set(key, { baseId:tx.baseId, baseName:base.name, actorKey:key, actorName:actorLabel(base, tx.resellerId), mode:base.mode, gross:0, expected:0, actual:0, receivable:0, ownerShare:0, partnerShare:0, actorShare:0, baseShare:0, deposits:0, setors:0 });
    const row = rowsMap.get(key);
    if(tx.moduleType==='DEPOSIT'){
      row.gross += Number(tx.nominal||0);
      row.expected += Number(tx.expectedSetor||0);
      row.actorShare += Number(tx.actorShareAmount||0);
      row.ownerShare += Number(tx.ownerShareAmount||0);
      row.partnerShare += Number(tx.partnerShareAmount||0);
      row.baseShare += Number(tx.baseShareAmount||0);
      row.deposits += 1;
    }
    if(tx.moduleType==='SETOR'){
      row.actual += Number(tx.nominal||0);
      row.setors += 1;
    }
  }
  const rows = [...rowsMap.values()].map(r => {
    const actorShareDisplay = Number(r.actorShare || 0) > 0 ? Number(r.actorShare || 0) : Number(r.baseShare || 0);
    return { ...r, receivable: Math.max(0, r.expected - r.actual), actorShareDisplay };
  }).sort((a,b)=>a.baseName.localeCompare(b.baseName)||a.actorName.localeCompare(b.actorName));
  const grand = rows.reduce((a,r)=>({
    gross:a.gross+r.gross,
    expected:a.expected+r.expected,
    actual:a.actual+r.actual,
    receivable:a.receivable+r.receivable,
    ownerShare:a.ownerShare+r.ownerShare,
    partnerShare:a.partnerShare+r.partnerShare,
    actorShare:a.actorShare+r.actorShare,
    actorShareDisplay:a.actorShareDisplay+r.actorShareDisplay,
    baseShare:a.baseShare+r.baseShare,
    deposits:a.deposits+r.deposits,
    setors:a.setors+r.setors
  }), { gross:0, expected:0, actual:0, receivable:0, ownerShare:0, partnerShare:0, actorShare:0, actorShareDisplay:0, baseShare:0, deposits:0, setors:0 });
  return { rows, grand };
}
function computedPiutangRows(){
  return aggregateModuleReport().rows
    .filter(r=>Number(r.receivable||0) > 0)
    .map(r=>({
      id:`AUTO-PIUTANG-${r.actorKey}`,
      moduleType:'PIUTANG_AUTO',
      baseId:r.baseId,
      resellerId:parseActorKey(r.actorKey).resellerId || '',
      actorKey:r.actorKey,
      nominal:Number(r.receivable||0),
      notes:`Piutang otomatis dari selisih target setor dan setoran.`,
      date:APP.state.reportFilters.modEnd || todayDateIso(),
      time:'23:59:59'
    }))
    .map(txDecorated);
}
function computedProfitRows(){
  const rows = [];
  const filteredDeposits = getFilteredModuleTransactions('DEPOSIT');
  for(const tx of filteredDeposits){
    const base = findBase(tx.baseId);
    if(!base) continue;
    const actor = txDecorated(tx);
    const parts = [
      { recipient:'BASE', label:actor.baseName, nominal:Number(tx.baseShareAmount||0) },
      { recipient:'ACTOR', label:'Pelaku', nominal:Number(tx.actorShareAmount||0) },
      { recipient:'OWNER', label:getConfig().ownerName || 'System', nominal:Number(tx.ownerShareAmount||0) },
      { recipient:'PARTNER', label:getConfig().partnerName || 'Technical', nominal:Number(tx.partnerShareAmount||0) }
    ];
    for(const part of parts){
      if(part.nominal <= 0) continue;
      rows.push({
        id:`AUTO-BAGI-${tx.id}-${part.recipient}`,
        moduleType:'BAGIHASIL_AUTO',
        baseId:tx.baseId,
        resellerId:tx.resellerId || '',
        actorKey:tx.actorKey,
        recipient:part.recipient,
        recipientLabel: part.label,
        nominal:part.nominal,
        notes:`Bagi hasil otomatis dari deposit ${actor.actorName}.`,
        date:tx.date,
        time:tx.time,
        baseName:actor.baseName,
        actorName:actor.actorName
      });
    }
  }
  return rows.sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function sumModuleType(type){ return APP.state.moduleTransactions.filter(x=>x.moduleType===type).reduce((s,x)=>s+Number(x.nominal||0),0); }
function countModuleType(type){ return APP.state.moduleTransactions.filter(x=>x.moduleType===type).length; }
function moduleTabMeta(tab){
  return {
    deposit:{ type:'DEPOSIT', title:'Deposit / Distribusi', note:'Input deposit. Piutang dan bagi hasil dihitung otomatis.' },
    setor:{ type:'SETOR', title:'Setoran Masuk', note:'Data setoran mengikuti transaksi deposit. Pilih salah satu deposit lalu atur nominal setoran sesuai aktual.' }
  }[tab] || { type:'DEPOSIT', title:'Deposit / Distribusi', note:'Cukup input deposit.' };
}
function moduleFormSection(meta){
  const f = APP.state.forms.module;
  const selectedBase = findBase(f.baseId);
  const actors = moduleActorsForBase(f.baseId);
  const actorValue = ensureModuleActor(f.baseId, f.actorKey);
  const parsed = parseActorKey(actorValue);
  const sourceDeposit = f.sourceDepositSnapshot || (f.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===f.linkedDepositId && x.moduleType==='DEPOSIT') : null);
  const expected = f.txType==='SETOR' && sourceDeposit ? Number(sourceDeposit.expectedSetor||0) : expectedSetorAmount(selectedBase, f.nominal, parsed.resellerId);
  const sourceInfo = f.txType==='SETOR'
    ? `<div class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">${sourceDeposit ? `Setoran ini mengikuti deposit <strong>${escapeHtml(actorLabel(findBase(sourceDeposit.baseId), sourceDeposit.resellerId))}</strong> tanggal <strong>${formatDateTime(sourceDeposit.date, sourceDeposit.time)}</strong> dengan nilai deposit <strong>Rp ${rupiah(sourceDeposit.nominal||0)}</strong> dan target setor <strong>Rp ${rupiah(sourceDeposit.expectedSetor||0)}</strong>.` : 'Pilih setoran dari tabel deposit/setoran agar data mengikuti transaksi deposit.'}</div>`
    : '';
  const locked = f.txType==='SETOR' && !!sourceDeposit;
  return `
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div class="space-y-4">
      <div class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">${meta.note}</div>
      ${sourceInfo}
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Base</span><select id="moduleBaseId" ${locked?'disabled':''} class="w-full rounded-2xl border px-3 py-3 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800"><option value="">Pilih base</option>${getConfig().bases.map(base=>`<option value="${base.id}" ${f.baseId===base.id?'selected':''}>${escapeHtml(base.name)}</option>`).join('')}</select></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Pelaku</span><select id="moduleActorKey" ${locked?'disabled':''} class="w-full rounded-2xl border px-3 py-3 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800"><option value="">Pilih pelaku</option>${actors.map(a=>`<option value="${a.value}" ${(actorValue===a.value)?'selected':''}>${escapeHtml(a.label)}</option>`).join('')}</select></label>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nominal ${f.txType==='SETOR'?'Setoran':'Deposit'}</span><input id="moduleNominal" type="text" value="${f.nominal?rupiah(f.nominal):''}" class="w-full rounded-2xl border px-3 py-3"></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Tanggal</span><input id="moduleDate" type="date" value="${f.date}" class="w-full rounded-2xl border px-3 py-3"></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Jam</span><input id="moduleTime" type="time" step="1" value="${f.time}" class="w-full rounded-2xl border px-3 py-3"></label>
      </div>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Keterangan</span><textarea id="moduleNotes" rows="3" class="w-full rounded-2xl border px-3 py-3">${escapeHtml(f.notes||'')}</textarea></label>
      <div class="flex flex-col gap-2 sm:flex-row"><button id="saveModuleBtn" class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">${APP.state.editModuleId?'Update Transaksi':'Simpan Transaksi'}</button><button id="resetModuleFormBtn" class="rounded-2xl border px-4 py-3 text-sm font-semibold">Reset Form</button>${APP.state.editModuleId?'<button id="cancelModuleEditBtn" class="rounded-2xl border px-4 py-3 text-sm font-semibold">Batal Edit</button>':''}</div>
    </div>
    <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
      <h3 class="text-lg font-bold">Preview</h3>
      <div class="mt-4 space-y-3 text-sm">
        <div><span class="text-slate-500 dark:text-slate-400">Jenis</span><div class="font-semibold">${meta.title}</div></div>
        <div><span class="text-slate-500 dark:text-slate-400">Mode Base</span><div class="font-semibold">${selectedBase ? BASE_MODES[selectedBase.mode].label : '-'}</div></div>
        <div><span class="text-slate-500 dark:text-slate-400">Target Setor</span><div class="font-semibold">Rp ${rupiah(expected)}</div></div>
        ${f.txType==='SETOR' ? `<div><span class="text-slate-500 dark:text-slate-400">Sisa Piutang Setelah Setor</span><div class="font-semibold ${Math.max(0, expected-Number(f.nominal||0))>0?'text-amber-600':'text-emerald-600'}">Rp ${rupiah(Math.max(0, expected-Number(f.nominal||0)))}</div></div>` : ''}
        <div><span class="text-slate-500 dark:text-slate-400">Catatan Mode</span><div>${selectedBase ? BASE_MODES[selectedBase.mode].note : 'Pilih base terlebih dahulu.'}</div></div>
      </div>
    </div>
  </div>`;
}
function summaryCardsForTab(tab){
  const type = moduleTabToType(tab);
  if(tab==='deposit' || tab==='setor'){
    const auto = aggregateModuleReport();
    return `<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
      ${card('Total Deposit', `Rp ${rupiah(auto.grand.gross)}`, `${auto.grand.deposits} transaksi`, 'text-emerald-600')}
      ${card('Total Setoran', `Rp ${rupiah(auto.grand.actual)}`, `${auto.grand.setors} transaksi`, 'text-blue-600')}
      ${card('Piutang Otomatis', `Rp ${rupiah(auto.grand.receivable)}`, 'Deposit - setoran', auto.grand.receivable>0?'text-amber-600':'text-emerald-600')}
      ${card('Bagi Hasil Otomatis', `Rp ${rupiah(auto.grand.actorShare + auto.grand.baseShare + auto.grand.ownerShare + auto.grand.partnerShare)}`, 'Dihitung dari deposit', 'text-purple-600')}
    </div>`;
  }
  return '';
}
function transactionsTableForTab(tab){
  if(tab==='setor'){
    const rows = filterMirroredSetorRows(mirroredSetorRows());
    const totals = rows.reduce((a,r)=>({ deposit:a.deposit+r.depositNominal, target:a.target+r.targetSetor, setor:a.setor+r.setorNominal, piutang:a.piutang+r.receivable }), { deposit:0, target:0, setor:0, piutang:0 });
    return `${moduleQuickFilterBar('setor')}<div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Deposit</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-right">Deposit</th><th class="px-3 py-2 text-right">Target Setor</th><th class="px-3 py-2 text-right">Setoran</th><th class="px-3 py-2 text-right">Piutang</th><th class="px-3 py-2 text-left">Tanggal Setor</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.depositDate,row.depositTime)}</td><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2">${escapeHtml(row.actorName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(row.depositNominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.targetSetor)}</td><td class="px-3 py-2 text-right ${row.setorNominal>0?'text-blue-600 font-semibold':''}">Rp ${rupiah(row.setorNominal)}</td><td class="px-3 py-2 text-right ${row.receivable>0?'text-amber-600 font-semibold':'text-emerald-600'}">Rp ${rupiah(row.receivable)}</td><td class="px-3 py-2">${row.setorId ? formatDateTime(row.setorDate,row.setorTime) : '-'}</td><td class="px-3 py-2"><span class="badge ${row.receivable>0?'badge-amber':'badge-emerald'}">${row.statusLabel}</span></td><td class="px-3 py-2 text-center"><div class="inline-flex items-center justify-center gap-1 whitespace-nowrap"><button data-setor-from-deposit="${row.depositId}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-blue-600 whitespace-nowrap">${row.setorId?'Ubah Setoran':'Atur Setoran'}</button>${row.setorId?`<button data-module-delete="${row.setorId}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600 whitespace-nowrap">Hapus Setoran</button>`:''}</div></td></tr>`).join('') || `<tr><td colspan="10" class="px-3 py-8 text-center text-slate-500">Belum ada data deposit untuk dibuatkan setoran.</td></tr>`}<tr class="bg-slate-50 font-semibold dark:bg-slate-800/50"><td class="px-3 py-2" colspan="3">TOTAL</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.deposit)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.target)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.setor)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.piutang)}</td><td class="px-3 py-2" colspan="3"></td></tr></tbody></table></div>`;
  }
  const type = moduleTabToType(tab);
  const rows = (type==='DEPOSIT' ? filterDepositRows(getFilteredModuleTransactions(type)) : getFilteredModuleTransactions(type)).map(txDecorated);
  const showTarget = ['DEPOSIT','SETOR'].includes(type);
  return `${moduleQuickFilterBar('deposit')}<div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-right">Nominal</th>${showTarget?'<th class="px-3 py-2 text-right">Target</th>':''}<th class="px-3 py-2 text-left">Catatan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(tx=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2">${escapeHtml(tx.baseName)}</td><td class="px-3 py-2">${escapeHtml(tx.actorName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(tx.nominal)}</td>${showTarget?`<td class="px-3 py-2 text-right">Rp ${rupiah(tx.expectedSetor||0)}</td>`:''}<td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td><td class="px-3 py-2 text-center"><div class="inline-flex items-center justify-center gap-1 whitespace-nowrap"><button data-module-edit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold whitespace-nowrap">Edit</button><button data-setor-from-deposit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-blue-600 whitespace-nowrap">Atur Setoran</button><button data-module-delete="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600 whitespace-nowrap">Hapus</button></div></td></tr>`).join('') || `<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">Belum ada transaksi.</td></tr>`}</tbody></table></div>`;
}


function modulesPage(){
  if(!['deposit','setor','masters'].includes(APP.state.moduleTab)) APP.state.moduleTab = 'deposit';
  const meta = moduleTabMeta(APP.state.moduleTab);
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-xl font-bold">Modul Transaksi Base</h2><p class="text-sm text-slate-500 dark:text-slate-400">Deposit dan Setoran. Piutang serta bagi hasil dihitung otomatis dari deposit.</p></div>
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-5">
          ${[
            {key:'deposit',label:'Deposit'},
            {key:'setor',label:'Setoran'},
            {key:'masters',label:'Master Base/Reseller'}
          ].map(x=>`<button data-module-tab="${x.key}" data-active="${APP.state.moduleTab===x.key}" class="tab-btn rounded-2xl border px-4 py-2 text-sm font-semibold">${x.label}</button>`).join('')}
        </div>
      </div>
      ${APP.state.moduleTab==='masters' ? moduleMasterPage() : `${moduleFormSection(meta)}${summaryCardsForTab(APP.state.moduleTab)}${transactionsTableForTab(APP.state.moduleTab)}`}
    </section>
  </div>`;
}
function moduleMasterPage(){
  return `
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nama Partner/Technical</span><input id="partnerNameInput" type="text" value="${escapeHtml(getConfig().partnerName)}" class="w-full rounded-2xl border px-3 py-3"></label>
      <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nama Owner/System</span><input id="ownerNameInput" type="text" value="${escapeHtml(getConfig().ownerName)}" class="w-full rounded-2xl border px-3 py-3"></label>
    </div>
    <div class="flex gap-2"><button id="saveIdentityBtn" class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Simpan Nama</button><button id="addBaseBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">+ Tambah Base</button></div>
    <div class="space-y-4">${getConfig().bases.map(base=>`
      <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <label class="block text-sm lg:col-span-2"><span class="mb-1 block text-slate-500 dark:text-slate-400">Nama Base</span><input data-base-field="name" data-base-id="${base.id}" type="text" value="${escapeHtml(base.name)}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Mode</span><select data-base-field="mode" data-base-id="${base.id}" class="w-full rounded-2xl border px-3 py-2">${Object.keys(BASE_MODES).map(mode=>`<option value="${mode}" ${base.mode===mode?'selected':''}>${BASE_MODES[mode].label}</option>`).join('')}</select></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Share Base Direct %</span><input data-share-field="baseDirect" data-base-id="${base.id}" type="number" value="${base.shares.baseDirect}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Share Reseller %</span><input data-share-field="reseller" data-base-id="${base.id}" type="number" value="${base.shares.reseller}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Share Pemilik Base dari Reseller %</span><input data-share-field="baseFromReseller" data-base-id="${base.id}" type="number" value="${base.shares.baseFromReseller ?? 0}" class="w-full rounded-2xl border px-3 py-2"></label>
          <div class="flex items-end gap-2"><button data-add-reseller="${base.id}" class="rounded-2xl border px-4 py-2 text-sm font-semibold">+ Reseller</button><button data-delete-base="${base.id}" class="rounded-2xl border px-4 py-2 text-sm font-semibold text-rose-600">Hapus</button></div>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Share Partner %</span><input data-share-field="partner" data-base-id="${base.id}" type="number" value="${base.shares.partner}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Share Owner %</span><input data-share-field="owner" data-base-id="${base.id}" type="number" value="${base.shares.owner}" class="w-full rounded-2xl border px-3 py-2"></label>
          <label class="flex items-center gap-2 text-sm"><input data-base-toggle="directEnabled" data-base-id="${base.id}" type="checkbox" ${base.directEnabled?'checked':''}> Aktifkan transaksi direct base</label>
          <div class="text-sm text-slate-500 dark:text-slate-400 flex items-center">${BASE_MODES[base.mode].note}</div>
        </div>
        <div class="mt-4">
          <p class="text-sm font-semibold">Daftar Reseller</p>
          <div class="mt-2 space-y-2">${base.resellers.map(res=>`<div class="flex gap-2"><input data-reseller-name="${res.id}" data-base-id="${base.id}" type="text" value="${escapeHtml(res.name)}" class="w-full rounded-2xl border px-3 py-2"><button data-delete-reseller="${res.id}" data-base-id="${base.id}" class="rounded-2xl border px-4 py-2 text-sm font-semibold text-rose-600">Hapus</button></div>`).join('') || '<p class="text-sm text-slate-500">Belum ada reseller.</p>'}</div>
        </div>
      </div>`).join('')}</div>
      <div class="flex justify-end"><button id="saveConfigBtn" class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Simpan Konfigurasi Base/Reseller</button></div>
  </div>`;
}
async function saveModuleTransaction(){
  const f = APP.state.forms.module;
  if(!f.baseId) return showToast('Base belum dipilih.', 'error');
  const base = findBase(f.baseId);
  const safeActorKey = ensureModuleActor(f.baseId, f.actorKey || defaultActorKeyForBase(f.baseId));
  if(!safeActorKey) return showToast('Pelaku transaksi belum dipilih.', 'error');
  if(!f.nominal) return showToast('Nominal masih kosong.', 'error');
  const act = parseActorKey(safeActorKey);
  const resellerId = act.resellerId || '';
  const payload = {
    id: APP.state.editModuleId || uuid(),
    moduleType:f.txType,
    baseId:f.baseId,
    resellerId,
    actorKey:safeActorKey,
    recipient:'ACTOR',
    nominal:Number(f.nominal||0),
    notes:f.notes||'',
    date:f.date||todayDateIso(),
    time:f.time||currentTimeWIB(),
    expectedSetor:0,
    actorShareAmount:0,
    ownerShareAmount:0,
    partnerShareAmount:0,
    baseShareAmount:0,
    linkedDepositId:f.linkedDepositId || ''
  };
  if(f.txType === 'DEPOSIT'){
    payload.expectedSetor = expectedSetorAmount(base, payload.nominal, resellerId);
    payload.actorShareAmount = Math.max(0, payload.nominal - payload.expectedSetor);
    payload.partnerShareAmount = payload.nominal * (Number(base.shares.partner||0)/100);
    payload.ownerShareAmount = payload.nominal * (Number(base.shares.owner||0)/100);
    payload.baseShareAmount = resellerId ? (payload.nominal * (Number(base.shares.baseFromReseller||0)/100)) : 0;
  }
  if(f.txType === 'SETOR'){
    const sourceDeposit = f.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===f.linkedDepositId && x.moduleType==='DEPOSIT') : null;
    if(!sourceDeposit) return showToast('Setoran harus dibuat dari transaksi deposit.', 'error');
    payload.baseId = sourceDeposit.baseId;
    payload.resellerId = sourceDeposit.resellerId || '';
    payload.actorKey = sourceDeposit.actorKey;
    payload.expectedSetor = Number(sourceDeposit.expectedSetor||0);
    if(payload.nominal > payload.expectedSetor){
      return showToast('Nominal setoran tidak boleh melebihi target setor deposit.', 'error');
    }
  }
  await DB.put(STORES.moduleTransactions, payload);
  await loadState();
  resetModuleForm(true);
  render();
  showToast(f.txType==='SETOR' ? 'Setoran berhasil disimpan dari data deposit.' : 'Transaksi modul berhasil disimpan.');
}
async function createFullSetorFromDeposit(depositId){ startSetorFromDeposit(depositId); }
function fillModuleForm(tx){
  APP.state.editModuleId = tx.id;
  APP.state.moduleTab = typeToModuleTab(tx.moduleType);
  APP.state.forms.module = { txType:tx.moduleType, baseId:tx.baseId, actorKey:tx.actorKey, recipient:tx.recipient || 'ACTOR', nominal:Number(tx.nominal||0), notes:tx.notes||'', date:tx.date, time:tx.time, linkedDepositId:tx.linkedDepositId || '', sourceDepositSnapshot: tx.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===tx.linkedDepositId && x.moduleType==='DEPOSIT') || null : null };
}
async function saveModuleConfig(){ APP.state.config = getConfig(); await DB.put(STORES.settings, { key:SETTINGS_KEYS.moduleConfig, value: APP.state.config }); await loadState(); render(); showToast('Konfigurasi base/reseller berhasil disimpan.'); }
function bindModuleEvents(){
  document.querySelectorAll('[data-module-tab]').forEach(btn=>btn.addEventListener('click', ()=>{ APP.state.moduleTab = btn.dataset.moduleTab; if(APP.state.moduleTab!=='masters'){ APP.state.forms.module.txType = moduleTabToType(APP.state.moduleTab); if(!APP.state.editModuleId) resetModuleForm(); } render(); }));
  document.getElementById('moduleBaseId')?.addEventListener('change', e=>{ APP.state.forms.module.baseId = e.target.value; APP.state.forms.module.actorKey = defaultActorKeyForBase(e.target.value); render(); });
  document.getElementById('moduleActorKey')?.addEventListener('change', e=> APP.state.forms.module.actorKey = e.target.value);
  document.getElementById('moduleRecipient')?.addEventListener('change', e=> APP.state.forms.module.recipient = e.target.value);
  document.getElementById('moduleNominal')?.addEventListener('input', e=>{ const num=parseNum(e.target.value); APP.state.forms.module.nominal=num; e.target.value=num?rupiah(num):''; });
  document.getElementById('moduleDate')?.addEventListener('change', e=> APP.state.forms.module.date = e.target.value);
  document.getElementById('moduleTime')?.addEventListener('change', e=> APP.state.forms.module.time = e.target.value);
  document.getElementById('moduleNotes')?.addEventListener('input', e=> APP.state.forms.module.notes = e.target.value);
  document.getElementById('saveModuleBtn')?.addEventListener('click', saveModuleTransaction);
  document.getElementById('resetModuleFormBtn')?.addEventListener('click', ()=>{ resetModuleForm(); render(); });
  document.getElementById('cancelModuleEditBtn')?.addEventListener('click', ()=>{ APP.state.editModuleId=null; resetModuleForm(); render(); });
  document.querySelectorAll('[data-module-edit]').forEach(btn=>btn.addEventListener('click', ()=>{ const tx=APP.state.moduleTransactions.find(x=>x.id===btn.dataset.moduleEdit); if(tx){ fillModuleForm(tx); APP.state.currentPage='modules'; render(); }}));
  document.querySelectorAll('[data-setor-from-deposit]').forEach(btn=>btn.addEventListener('click', ()=> startSetorFromDeposit(btn.dataset.setorFromDeposit)));
  document.querySelectorAll('[data-module-delete]').forEach(btn=>btn.addEventListener('click', async ()=>{ if(!confirm('Hapus transaksi modul ini?')) return; await DB.delete(STORES.moduleTransactions, btn.dataset.moduleDelete); await loadState(); render(); showToast('Transaksi modul dihapus.'); }));
  document.getElementById('saveIdentityBtn')?.addEventListener('click', ()=>{ APP.state.config = getConfig(); APP.state.config.partnerName = document.getElementById('partnerNameInput').value.trim() || 'Technical'; APP.state.config.ownerName = document.getElementById('ownerNameInput').value.trim() || 'System'; saveModuleConfig(); });
  document.getElementById('addBaseBtn')?.addEventListener('click', ()=>{ APP.state.config = getConfig(); APP.state.config.bases.push({ id:uuid(), name:'Base Baru', mode:'FULL', directEnabled:true, shares:{...DEFAULT_SHARE}, resellers:[] }); render(); });
  document.querySelectorAll('[data-base-field]').forEach(el=>el.addEventListener('input', ()=>{ const base=findBase(el.dataset.baseId); if(base) base[el.dataset.baseField] = el.value; }));
  document.querySelectorAll('[data-share-field]').forEach(el=>el.addEventListener('input', ()=>{ const base=findBase(el.dataset.baseId); if(base) base.shares[el.dataset.shareField] = Number(el.value||0); }));
  document.querySelectorAll('[data-base-toggle]').forEach(el=>el.addEventListener('change', ()=>{ const base=findBase(el.dataset.baseId); if(base) base[el.dataset.baseToggle] = !!el.checked; }));
  document.querySelectorAll('[data-add-reseller]').forEach(btn=>btn.addEventListener('click', ()=>{ const base=findBase(btn.dataset.addReseller); if(base){ base.resellers.push({ id:uuid(), name:'Reseller Baru' }); render(); } }));
  document.querySelectorAll('[data-reseller-name]').forEach(el=>el.addEventListener('input', ()=>{ const base=findBase(el.dataset.baseId); const res=(base?.resellers||[]).find(x=>x.id===el.dataset.resellerName); if(res) res.name = el.value; }));
  document.querySelectorAll('[data-delete-reseller]').forEach(btn=>btn.addEventListener('click', ()=>{ const base=findBase(btn.dataset.baseId); if(base){ base.resellers = base.resellers.filter(x=>x.id!==btn.dataset.deleteReseller); render(); } }));
  document.querySelectorAll('[data-delete-base]').forEach(btn=>btn.addEventListener('click', ()=>{ if(!confirm('Hapus base ini?')) return; getConfig().bases = getConfig().bases.filter(x=>x.id!==btn.dataset.deleteBase); render(); }));

  document.getElementById('moduleSearchFilter')?.addEventListener('input', e=>{ APP.state.moduleFilters.modSearch = e.target.value; scheduleRender({ preserveInputId:'moduleSearchFilter', preserveCursor:true }); });
  document.getElementById('moduleStartFilter')?.addEventListener('change', e=>{ APP.state.moduleFilters.modStart = e.target.value; render(); });
  document.getElementById('moduleEndFilter')?.addEventListener('change', e=>{ APP.state.moduleFilters.modEnd = e.target.value; render(); });
  document.getElementById('moduleBaseFilter')?.addEventListener('change', e=>{ APP.state.moduleFilters.baseId = e.target.value; const validActors = moduleActorFilterOptions(APP.state.moduleFilters).map(x=>x.value); if(APP.state.moduleFilters.actorKey !== 'ALL' && !validActors.includes(APP.state.moduleFilters.actorKey)) APP.state.moduleFilters.actorKey = 'ALL'; render(); });
  document.getElementById('moduleActorFilter')?.addEventListener('change', e=>{ APP.state.moduleFilters.actorKey = e.target.value; render(); });
  document.querySelectorAll('[data-smart-context="module"]').forEach(btn=>btn.addEventListener('click', ()=>{ APP.state.moduleFilters[btn.dataset.smartFilter] = btn.dataset.smartValue; render(); }));
  document.getElementById('moduleResetFilters')?.addEventListener('click', ()=>{ APP.state.moduleFilters.modStart=''; APP.state.moduleFilters.modEnd=''; APP.state.moduleFilters.baseId='ALL'; APP.state.moduleFilters.actorKey='ALL'; APP.state.moduleFilters.modSearch=''; APP.state.moduleFilters.depositSmart='ALL'; APP.state.moduleFilters.setorSmart='ALL'; render(); });

  document.getElementById('saveConfigBtn')?.addEventListener('click', saveModuleConfig);
}
