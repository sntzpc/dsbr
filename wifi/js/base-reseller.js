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
function linkedSetorsForDeposit(depositId='', excludeId=''){
  return (APP.state.moduleTransactions || [])
    .filter(x => x.moduleType === 'SETOR' && x.linkedDepositId === depositId && (!excludeId || x.id !== excludeId))
    .sort((a,b)=>`${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
}
function sumLinkedSetorsForDeposit(depositId='', excludeId=''){
  return linkedSetorsForDeposit(depositId, excludeId).reduce((s,x)=>s+Number(x.nominal||0),0);
}
function linkedSetorForDeposit(depositId=''){
  return linkedSetorsForDeposit(depositId)[0] || null;
}
function setorSettlementRatio(sourceDeposit){
  const depositNominal = Number(sourceDeposit?.nominal || 0);
  const expected = Number(sourceDeposit?.expectedSetor || 0);
  if(depositNominal <= 0) return 1;
  const ratio = expected / depositNominal;
  return (ratio > 0 && isFinite(ratio)) ? ratio : 1;
}
function realizedGrossFromSetor(setorTx, sourceDeposit){
  const nominal = Number(setorTx?.nominal || 0);
  const ratio = setorSettlementRatio(sourceDeposit);
  return roundMoney2(ratio > 0 ? nominal / ratio : nominal);
}
function linkedSetorsForDepositAsc(depositId='', excludeId=''){
  return linkedSetorsForDeposit(depositId, excludeId).slice().sort((a,b)=>`${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
}
function setorInstallmentInfo(setorTx, sourceDeposit){
  if(!setorTx || !sourceDeposit) return { installmentNo:0, installmentCount:0, paidBefore:0, paidUntilThis:0, remainingAfter:0 };
  const list = linkedSetorsForDepositAsc(sourceDeposit.id);
  const idx = list.findIndex(x=>x.id===setorTx.id);
  const pos = idx >= 0 ? idx : list.length;
  const paidBefore = list.slice(0, Math.max(0,pos)).reduce((sum,x)=>sum+Number(x.nominal||0),0);
  const paidUntilThis = paidBefore + Number(setorTx.nominal||0);
  const target = Number(sourceDeposit.expectedSetor||0);
  return {
    installmentNo: pos + 1,
    installmentCount: list.length || 1,
    paidBefore: roundMoney2(paidBefore),
    paidUntilThis: roundMoney2(paidUntilThis),
    remainingAfter: roundMoney2(Math.max(0, target - paidUntilThis))
  };
}
function moduleAllFilters(){ return { modStart:'', modEnd:'', baseId:'ALL', actorKey:'ALL', modSearch:'', depositSmart:'ALL', setorSmart:'ALL' }; }

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
    const setorList = linkedSetorsForDeposit(tx.id);
    const setorNominal = sumLinkedSetorsForDeposit(tx.id);
    const target = Number(tx.expectedSetor || 0);
    if(smart === 'TODAY') return tx.date === today;
    if(smart === 'UNSETTLED') return !setorList.length;
    if(smart === 'PARTIAL') return !!setorList.length && setorNominal > 0 && setorNominal < target;
    if(smart === 'FULL') return !!setorList.length && setorNominal >= target;
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
function mirroredSetorRows(filters = APP.state.moduleFilters){
  return getFilteredModuleTransactions('DEPOSIT', filters).map(tx=>{
    const dec = txDecorated(tx);
    const setors = linkedSetorsForDeposit(tx.id);
    const latestSetor = setors[0] || null;
    const setorNominal = setors.reduce((s,x)=>s+Number(x.nominal||0),0);
    const target = Number(tx.expectedSetor||0);
    return {
      ...dec,
      depositId: tx.id,
      depositDate: tx.date,
      depositTime: tx.time,
      depositNominal: Number(tx.nominal||0),
      targetSetor: target,
      setorId: latestSetor?.id || '',
      setorIds: setors.map(x=>x.id),
      setorCount: setors.length,
      setorNominal,
      setorDate: latestSetor?.date || tx.date,
      setorTime: latestSetor?.time || tx.time,
      setorNotes: latestSetor?.notes || '',
      receivable: Math.max(0, target - setorNominal),
      statusLabel: !setors.length ? 'Belum Disetor' : (setorNominal >= target ? 'Setor Penuh' : 'Setor Sebagian')
    };
  });
}

/*
  PATCH 2026-05-03 - Summary Deposit/Setoran/Piutang/Bagi Hasil harus tally dengan tabel.
  Penyebab lama: kartu ringkasan memakai aggregateModuleReport() yang memfilter DEPOSIT dan SETOR
  berdasarkan tanggal transaksi masing-masing. Sementara tabel Setoran bersifat deposit-centric:
  baris berasal dari DEPOSIT yang tampil, lalu setoran/cicilan dihitung dari linkedDepositId.
  Akibatnya Total Setoran dan Piutang bisa berbeda dari total tabel ketika ada filter tanggal,
  filter pintar, atau deposit dibayar cicilan pada tanggal berbeda.
*/
function moduleSettlementVisibleRows(filters = APP.state.moduleFilters){
  return filterMirroredSetorRows(mirroredSetorRows(filters), filters);
}

function profitPartsFromSetorTx(setorTx, sourceDeposit){
  const base = findBase(sourceDeposit?.baseId);
  if(!setorTx || !sourceDeposit || !base) return { actorShare:0, baseShare:0, ownerShare:0, partnerShare:0, total:0 };
  const grossEquivalent = realizedGrossFromSetor(setorTx, sourceDeposit);
  const actorShare = roundMoney2(grossEquivalent * (actorSharePct(base, sourceDeposit.resellerId || '') / 100));
  const baseShare = sourceDeposit.resellerId ? roundMoney2(grossEquivalent * (Number(base.shares.baseFromReseller||0) / 100)) : 0;
  const ownerShare = roundMoney2(grossEquivalent * (Number(base.shares.owner||0) / 100));
  const partnerShare = roundMoney2(grossEquivalent * (Number(base.shares.partner||0) / 100));
  return {
    actorShare,
    baseShare,
    ownerShare,
    partnerShare,
    total: roundMoney2(actorShare + baseShare + ownerShare + partnerShare)
  };
}

function moduleSettlementSummary(filters = APP.state.moduleFilters){
  const rows = moduleSettlementVisibleRows(filters);
  const depositIds = new Set(rows.map(r=>r.depositId));
  const setors = (APP.state.moduleTransactions || []).filter(tx => tx.moduleType === 'SETOR' && depositIds.has(tx.linkedDepositId));
  const totals = rows.reduce((a,r)=>({
    deposit: roundMoney2(a.deposit + Number(r.depositNominal||0)),
    target: roundMoney2(a.target + Number(r.targetSetor||0)),
    setor: roundMoney2(a.setor + Number(r.setorNominal||0)),
    piutang: roundMoney2(a.piutang + Number(r.receivable||0)),
    depositCount: a.depositCount + 1,
    setorCount: a.setorCount + Number(r.setorCount||0)
  }), { deposit:0, target:0, setor:0, piutang:0, depositCount:0, setorCount:0 });

  const profit = setors.reduce((a,setorTx)=>{
    const sourceDeposit = APP.state.moduleTransactions.find(x=>x.id===setorTx.linkedDepositId && x.moduleType==='DEPOSIT');
    const parts = profitPartsFromSetorTx(setorTx, sourceDeposit);
    return {
      actorShare: roundMoney2(a.actorShare + parts.actorShare),
      baseShare: roundMoney2(a.baseShare + parts.baseShare),
      ownerShare: roundMoney2(a.ownerShare + parts.ownerShare),
      partnerShare: roundMoney2(a.partnerShare + parts.partnerShare),
      total: roundMoney2(a.total + parts.total)
    };
  }, { actorShare:0, baseShare:0, ownerShare:0, partnerShare:0, total:0 });

  return { rows, totals, profit };
}
function startSetorFromDeposit(depositId){
  const tx = APP.state.moduleTransactions.find(x=>x.id===depositId && x.moduleType==='DEPOSIT');
  if(!tx) return showToast('Data deposit tidak ditemukan.', 'error');
  const alreadyPaid = sumLinkedSetorsForDeposit(depositId);
  const remaining = Math.max(0, Number(tx.expectedSetor || 0) - alreadyPaid);
  if(remaining <= 0) return showToast('Deposit ini sudah disetor penuh. Hapus/edit setoran lama jika perlu koreksi.', 'info');
  APP.state.moduleTab = 'setor';
  APP.state.editModuleId = null;
  APP.state.forms.module = {
    txType:'SETOR',
    baseId:tx.baseId,
    actorKey:tx.actorKey,
    recipient:'ACTOR',
    nominal:remaining,
    notes:`Setoran dari deposit ${formatDateTime(tx.date, tx.time)}${tx.notes ? ' - ' + tx.notes : ''}`,
    date:todayDateIso(),
    time:currentTimeWIB(),
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
function aggregateModuleReport(filters = APP.state.moduleFilters){
  const rowsMap = new Map();
  const depositRows = filterDepositRows(getFilteredModuleTransactions('DEPOSIT', filters), filters);

  for(const tx of depositRows){
    const base = findBase(tx.baseId); if(!base) continue;
    const key = tx.actorKey || actorKey(tx.baseId, tx.resellerId || '');
    if(!rowsMap.has(key)) rowsMap.set(key, {
      baseId:tx.baseId,
      baseName:base.name,
      actorKey:key,
      actorName:actorLabel(base, tx.resellerId),
      mode:base.mode,
      gross:0,
      expected:0,
      actual:0,
      receivable:0,
      ownerShare:0,
      partnerShare:0,
      actorShare:0,
      baseShare:0,
      deposits:0,
      setors:0
    });

    const row = rowsMap.get(key);
    const target = Number(tx.expectedSetor||0);
    const setors = linkedSetorsForDeposit(tx.id);
    const paid = setors.reduce((sum,x)=>sum+Number(x.nominal||0),0);

    row.gross = roundMoney2(row.gross + Number(tx.nominal||0));
    row.expected = roundMoney2(row.expected + target);
    row.actual = roundMoney2(row.actual + paid);
    row.receivable = roundMoney2(row.receivable + Math.max(0, target - paid));
    row.deposits += 1;
    row.setors += setors.length;

    for(const setorTx of setors){
      const parts = profitPartsFromSetorTx(setorTx, tx);
      row.actorShare = roundMoney2(row.actorShare + parts.actorShare);
      row.baseShare = roundMoney2(row.baseShare + parts.baseShare);
      row.ownerShare = roundMoney2(row.ownerShare + parts.ownerShare);
      row.partnerShare = roundMoney2(row.partnerShare + parts.partnerShare);
    }
  }

  const rows = [...rowsMap.values()].map(r => {
    const actorShareDisplay = Number(r.actorShare || 0) > 0 ? Number(r.actorShare || 0) : Number(r.baseShare || 0);
    return { ...r, actorShareDisplay };
  }).sort((a,b)=>a.baseName.localeCompare(b.baseName)||a.actorName.localeCompare(b.actorName));

  const grand = rows.reduce((a,r)=>({
    gross:roundMoney2(a.gross+r.gross),
    expected:roundMoney2(a.expected+r.expected),
    actual:roundMoney2(a.actual+r.actual),
    receivable:roundMoney2(a.receivable+r.receivable),
    ownerShare:roundMoney2(a.ownerShare+r.ownerShare),
    partnerShare:roundMoney2(a.partnerShare+r.partnerShare),
    actorShare:roundMoney2(a.actorShare+r.actorShare),
    actorShareDisplay:roundMoney2(a.actorShareDisplay+r.actorShareDisplay),
    baseShare:roundMoney2(a.baseShare+r.baseShare),
    deposits:a.deposits+r.deposits,
    setors:a.setors+r.setors
  }), { gross:0, expected:0, actual:0, receivable:0, ownerShare:0, partnerShare:0, actorShare:0, actorShareDisplay:0, baseShare:0, deposits:0, setors:0 });

  return { rows, grand };
}

function computedPiutangRows(filters = APP.state.moduleFilters){
  return aggregateModuleReport(filters).rows
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
function computedProfitRows(filters = APP.state.moduleFilters){
  const rows = [];
  const visibleDepositIds = new Set(moduleSettlementVisibleRows(filters).map(r=>r.depositId));
  const filteredSetors = (APP.state.moduleTransactions || [])
    .filter(tx => tx.moduleType === 'SETOR' && visibleDepositIds.has(tx.linkedDepositId));
  for(const tx of filteredSetors){
    const sourceDeposit = tx.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===tx.linkedDepositId && x.moduleType==='DEPOSIT') : null;
    if(!sourceDeposit) continue;
    const base = findBase(sourceDeposit.baseId);
    if(!base) continue;
    const actor = txDecorated(sourceDeposit);
    const grossEquivalent = realizedGrossFromSetor(tx, sourceDeposit);
    const actorShare = roundMoney2(grossEquivalent * (actorSharePct(base, sourceDeposit.resellerId || '') / 100));
    const parts = [
      { recipient:'BASE', label:actor.baseName, nominal: sourceDeposit.resellerId ? roundMoney2(grossEquivalent * (Number(base.shares.baseFromReseller||0)/100)) : 0 },
      { recipient:'ACTOR', label:'Pelaku', nominal: actorShare },
      { recipient:'OWNER', label:getConfig().ownerName || 'System', nominal:roundMoney2(grossEquivalent * (Number(base.shares.owner||0)/100)) },
      { recipient:'PARTNER', label:getConfig().partnerName || 'Technical', nominal:roundMoney2(grossEquivalent * (Number(base.shares.partner||0)/100)) }
    ];
    for(const part of parts){
      if(part.nominal <= 0) continue;
      rows.push({
        id:`AUTO-BAGI-${tx.id}-${part.recipient}`,
        moduleType:'BAGIHASIL_AUTO',
        baseId:sourceDeposit.baseId,
        resellerId:sourceDeposit.resellerId || '',
        actorKey:sourceDeposit.actorKey,
        recipient:part.recipient,
        recipientLabel: part.label,
        nominal:roundMoney2(part.nominal),
        notes:`Bagi hasil otomatis dari setoran ${actor.actorName}. Setor Rp ${rupiah(tx.nominal||0)}, dasar ekuivalen Rp ${rupiah(grossEquivalent)}.`,
        date:tx.date,
        time:tx.time,
        baseName:actor.baseName,
        actorName:actor.actorName,
        sourceDepositId:sourceDeposit.id,
        sourceSetorId:tx.id,
        grossEquivalent,
        setorNominal:Number(tx.nominal||0),
        settlementRatio:setorSettlementRatio(sourceDeposit)
      });
    }
  }
  return rows.sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function sumModuleType(type){ return APP.state.moduleTransactions.filter(x=>x.moduleType===type).reduce((s,x)=>s+Number(x.nominal||0),0); }
function countModuleType(type){ return APP.state.moduleTransactions.filter(x=>x.moduleType===type).length; }
function moduleTabMeta(tab){
  return {
    deposit:{ type:'DEPOSIT', title:'Deposit / Distribusi', note:'Input deposit. Piutang dihitung dari target setor, sedangkan bagi hasil dihitung saat setoran masuk.' },
    setor:{ type:'SETOR', title:'Setoran Masuk', note:'Data setoran mengikuti transaksi deposit. Satu deposit bisa dicicil beberapa kali sesuai tanggal setoran aktual.' },
    receipt:{ type:'SETOR', title:'Cetak Bukti Setoran', note:'Cetak bukti setoran thermal 58 mm berdasarkan setoran yang sudah tersimpan.' }
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
        ${f.txType==='SETOR' ? (()=>{ const paidBefore = sourceDeposit ? sumLinkedSetorsForDeposit(sourceDeposit.id, APP.state.editModuleId || '') : 0; const remainingAfter = Math.max(0, expected - paidBefore - Number(f.nominal||0)); return `<div><span class="text-slate-500 dark:text-slate-400">Sudah Disetor Sebelumnya</span><div class="font-semibold text-blue-600">Rp ${rupiah(paidBefore)}</div></div><div><span class="text-slate-500 dark:text-slate-400">Sisa Piutang Setelah Setor</span><div class="font-semibold ${remainingAfter>0?'text-amber-600':'text-emerald-600'}">Rp ${rupiah(remainingAfter)}</div></div>`; })() : ''}
        <div><span class="text-slate-500 dark:text-slate-400">Catatan Mode</span><div>${selectedBase ? BASE_MODES[selectedBase.mode].note : 'Pilih base terlebih dahulu.'}</div></div>
      </div>
    </div>
  </div>`;
}
function summaryCardsForTab(tab){
  if(tab==='deposit' || tab==='setor'){
    const summary = moduleSettlementSummary(APP.state.moduleFilters);
    return `<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
      ${card('Total Deposit', `Rp ${rupiah(summary.totals.deposit)}`, `${summary.totals.depositCount} transaksi`, 'text-emerald-600')}
      ${card('Total Setoran', `Rp ${rupiah(summary.totals.setor)}`, `${summary.totals.setorCount} cicilan/setoran`, 'text-blue-600')}
      ${card('Piutang Otomatis', `Rp ${rupiah(summary.totals.piutang)}`, 'Sama dengan total kolom Piutang tabel', summary.totals.piutang>0?'text-amber-600':'text-emerald-600')}
      ${card('Bagi Hasil Otomatis', `Rp ${rupiah(summary.profit.total)}`, 'Dihitung dari setoran pada baris tampil', 'text-purple-600')}
    </div>`;
  }
  return '';
}
function transactionsTableForTab(tab){
  if(tab==='setor'){
    const rows = filterMirroredSetorRows(mirroredSetorRows());
    const totals = rows.reduce((a,r)=>({ deposit:a.deposit+r.depositNominal, target:a.target+r.targetSetor, setor:a.setor+r.setorNominal, piutang:a.piutang+r.receivable }), { deposit:0, target:0, setor:0, piutang:0 });
    return `${moduleQuickFilterBar('setor')}<div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Deposit</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-right">Deposit</th><th class="px-3 py-2 text-right">Target Setor</th><th class="px-3 py-2 text-right">Setoran</th><th class="px-3 py-2 text-right">Piutang</th><th class="px-3 py-2 text-left">Tanggal Setor</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Cicilan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.depositDate,row.depositTime)}</td><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2">${escapeHtml(row.actorName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(row.depositNominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.targetSetor)}</td><td class="px-3 py-2 text-right ${row.setorNominal>0?'text-blue-600 font-semibold':''}">Rp ${rupiah(row.setorNominal)}</td><td class="px-3 py-2 text-right ${row.receivable>0?'text-amber-600 font-semibold':'text-emerald-600'}">Rp ${rupiah(row.receivable)}</td><td class="px-3 py-2">${row.setorId ? formatDateTime(row.setorDate,row.setorTime) : '-'}</td><td class="px-3 py-2"><span class="badge ${row.receivable>0?'badge-amber':'badge-emerald'}">${row.statusLabel}</span></td><td class="px-3 py-2">${row.setorCount>1?`<span class="badge badge-blue">${row.setorCount}x cicilan</span>`:(row.setorCount===1?'<span class="badge badge-emerald">1x bayar</span>':'-')}</td><td class="px-3 py-2 text-center"><div class="inline-flex items-center justify-center gap-1 whitespace-nowrap"><button data-setor-from-deposit="${row.depositId}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-blue-600 whitespace-nowrap">${row.setorId?'Tambah Setoran':'Atur Setoran'}</button><button data-setor-history="${row.depositId}" class="rounded-xl border px-3 py-1 text-xs font-semibold whitespace-nowrap">Riwayat</button>${row.setorId?`<button data-print-setor="${row.setorId}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-emerald-600 whitespace-nowrap">Cetak</button><button data-module-delete="${row.setorId}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600 whitespace-nowrap">Hapus Setoran Terakhir</button>`:''}</div></td></tr>`).join('') || `<tr><td colspan="11" class="px-3 py-8 text-center text-slate-500">Belum ada data deposit untuk dibuatkan setoran.</td></tr>`}<tr class="bg-slate-50 font-semibold dark:bg-slate-800/50"><td class="px-3 py-2" colspan="3">TOTAL</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.deposit)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.target)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.setor)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(totals.piutang)}</td><td class="px-3 py-2" colspan="4"></td></tr></tbody></table></div>`;
  }
  const type = moduleTabToType(tab);
  const rows = (type==='DEPOSIT' ? filterDepositRows(getFilteredModuleTransactions(type)) : getFilteredModuleTransactions(type)).map(txDecorated);
  const showTarget = ['DEPOSIT','SETOR'].includes(type);
  return `${moduleQuickFilterBar('deposit')}<div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-right">Nominal</th>${showTarget?'<th class="px-3 py-2 text-right">Target</th><th class="px-3 py-2 text-left">Status Setor</th>':''}<th class="px-3 py-2 text-left">Catatan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(tx=>{ const paid=sumLinkedSetorsForDeposit(tx.id); const target=Number(tx.expectedSetor||0); const isPartial=paid>0 && paid<target; const isFull=target>0 && paid>=target; return `<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2">${escapeHtml(tx.baseName)}</td><td class="px-3 py-2">${escapeHtml(tx.actorName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(tx.nominal)}</td>${showTarget?`<td class="px-3 py-2 text-right">Rp ${rupiah(tx.expectedSetor||0)}</td><td class="px-3 py-2">${isPartial?'<span class="badge badge-blue">Dicicil</span>':(isFull?'<span class="badge badge-emerald">Lunas</span>':'<span class="badge badge-amber">Belum Setor</span>')}</td>`:''}<td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td><td class="px-3 py-2 text-center"><div class="inline-flex items-center justify-center gap-1 whitespace-nowrap"><button data-module-edit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold whitespace-nowrap">Edit</button><button data-setor-from-deposit="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-blue-600 whitespace-nowrap">Atur Setoran</button><button data-setor-history="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold whitespace-nowrap">Riwayat</button><button data-module-delete="${tx.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-rose-600 whitespace-nowrap">Hapus</button></div></td></tr>`; }).join('') || `<tr><td colspan="8" class="px-3 py-8 text-center text-slate-500">Belum ada transaksi.</td></tr>`}</tbody></table></div>`;
}

function receiptPrintPage(){
  const rows = getFilteredModuleTransactions('SETOR').map(tx=>{
    const sourceDeposit = tx.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===tx.linkedDepositId && x.moduleType==='DEPOSIT') : null;
    const base = sourceDeposit ? findBase(sourceDeposit.baseId) : findBase(tx.baseId);
    const info = sourceDeposit ? setorInstallmentInfo(tx, sourceDeposit) : null;
    return { ...txDecorated(tx), sourceDeposit, base, info };
  });
  return `<div class="space-y-4"><div class="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">Menu ini digunakan untuk mencetak bukti setoran Base/Reseller pada printer thermal 58 mm. Gunakan filter Base/Pelaku/tanggal di bawah untuk memilih setoran yang ingin dicetak.</div>${moduleQuickFilterBar('setor')}<div class="table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Setor</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-right">Deposit</th><th class="px-3 py-2 text-right">Target</th><th class="px-3 py-2 text-right">Dibayar Ini</th><th class="px-3 py-2 text-right">Dibayar sd Ini</th><th class="px-3 py-2 text-right">Sisa</th><th class="px-3 py-2 text-left">Cicilan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.date,row.time)}</td><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2">${escapeHtml(row.actorName)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.sourceDeposit?.nominal||0)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.sourceDeposit?.expectedSetor||0)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(row.nominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.info?.paidUntilThis||0)}</td><td class="px-3 py-2 text-right ${Number(row.info?.remainingAfter||0)>0?'text-amber-600 font-semibold':'text-emerald-600'}">Rp ${rupiah(row.info?.remainingAfter||0)}</td><td class="px-3 py-2">${row.info?`Ke-${row.info.installmentNo} dari ${row.info.installmentCount}`:'-'}</td><td class="px-3 py-2 text-center"><button data-print-setor="${row.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-emerald-600">Cetak 58mm</button></td></tr>`).join('') || `<tr><td colspan="10" class="px-3 py-8 text-center text-slate-500">Belum ada data setoran sesuai filter.</td></tr>`}</tbody></table></div></div>`;
}


function modulesPage(){
  if(!['deposit','setor','receipt','masters'].includes(APP.state.moduleTab)) APP.state.moduleTab = 'deposit';
  const meta = moduleTabMeta(APP.state.moduleTab);
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-xl font-bold">Modul Transaksi Base</h2><p class="text-sm text-slate-500 dark:text-slate-400">Deposit dan Setoran. Piutang dihitung dari target setor, sedangkan bagi hasil dihitung dari setoran aktual.</p></div>
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-5">
          ${[
            {key:'deposit',label:'Deposit'},
            {key:'setor',label:'Setoran'},
            {key:'receipt',label:'Cetak Bukti Setoran'},
            {key:'masters',label:'Master Base/Reseller'}
          ].map(x=>`<button data-module-tab="${x.key}" data-active="${APP.state.moduleTab===x.key}" class="tab-btn rounded-2xl border px-4 py-2 text-sm font-semibold">${x.label}</button>`).join('')}
        </div>
      </div>
      ${APP.state.moduleTab==='masters' ? moduleMasterPage() : (APP.state.moduleTab==='receipt' ? receiptPrintPage() : `${moduleFormSection(meta)}${summaryCardsForTab(APP.state.moduleTab)}${transactionsTableForTab(APP.state.moduleTab)}`)}
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

function openSetorHistoryModal(depositId=''){
  const deposit = APP.state.moduleTransactions.find(x=>x.id===depositId && x.moduleType==='DEPOSIT');
  if(!deposit) return showToast('Data deposit tidak ditemukan.', 'error');
  const dec = txDecorated(deposit);
  const setors = linkedSetorsForDepositAsc(deposit.id);
  const target = Number(deposit.expectedSetor||0);
  const paid = setors.reduce((sum,x)=>sum+Number(x.nominal||0),0);
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div class="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900"><div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">Riwayat Cicilan Setoran</h3><p class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(dec.baseName)} · ${escapeHtml(dec.actorName)}</p></div><button id="closeSetorHistoryBtn" class="rounded-2xl border px-3 py-2 text-sm font-semibold">Tutup</button></div><div class="grid grid-cols-1 gap-3 md:grid-cols-4 text-sm"><div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><div class="text-slate-500">Deposit</div><div class="font-bold">Rp ${rupiah(deposit.nominal)}</div></div><div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><div class="text-slate-500">Target Setor</div><div class="font-bold">Rp ${rupiah(target)}</div></div><div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><div class="text-slate-500">Sudah Dibayar</div><div class="font-bold text-blue-600">Rp ${rupiah(paid)}</div></div><div class="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><div class="text-slate-500">Sisa</div><div class="font-bold ${Math.max(0,target-paid)>0?'text-amber-600':'text-emerald-600'}">Rp ${rupiah(Math.max(0,target-paid))}</div></div></div><div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Cicilan</th><th class="px-3 py-2 text-left">Tanggal/Jam</th><th class="px-3 py-2 text-right">Dibayar Ini</th><th class="px-3 py-2 text-right">Dibayar sd Ini</th><th class="px-3 py-2 text-right">Sisa</th><th class="px-3 py-2 text-left">Catatan</th><th class="px-3 py-2 text-center">Aksi</th></tr></thead><tbody>${setors.map(st=>{ const info=setorInstallmentInfo(st, deposit); return `<tr class="border-b"><td class="px-3 py-2">Ke-${info.installmentNo}</td><td class="px-3 py-2">${formatDateTime(st.date,st.time)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(st.nominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(info.paidUntilThis)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(info.remainingAfter)}</td><td class="px-3 py-2">${escapeHtml(st.notes||'-')}</td><td class="px-3 py-2 text-center"><button data-print-setor="${st.id}" class="rounded-xl border px-3 py-1 text-xs font-semibold text-emerald-600">Cetak</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">Belum ada cicilan setoran.</td></tr>'}</tbody></table></div></div></div>`;
  document.getElementById('closeSetorHistoryBtn')?.addEventListener('click', ()=>{ modalRoot.innerHTML=''; });
  modalRoot.querySelectorAll('[data-print-setor]').forEach(btn=>btn.addEventListener('click', ()=> printSetorReceipt(btn.dataset.printSetor)));
}
function printSetorReceipt(setorId=''){
  const setor = APP.state.moduleTransactions.find(x=>x.id===setorId && x.moduleType==='SETOR');
  if(!setor) return showToast('Data setoran tidak ditemukan.', 'error');
  const deposit = setor.linkedDepositId ? APP.state.moduleTransactions.find(x=>x.id===setor.linkedDepositId && x.moduleType==='DEPOSIT') : null;
  if(!deposit) return showToast('Deposit sumber setoran tidak ditemukan.', 'error');
  const dec = txDecorated(deposit);
  const info = setorInstallmentInfo(setor, deposit);
  const receiptNo = `STR-${String(setor.date||'').replaceAll('-','')}-${String(setor.time||'').replace(/\D/g,'')}-${String(setor.id||'').slice(0,4).toUpperCase()}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bukti Setoran</title><style>@page{size:58mm auto;margin:0;}*{box-sizing:border-box;}body{width:58mm;margin:0;padding:0;font-family:Arial,sans-serif;color:#000;}.receipt{width:58mm;padding:3mm;font-size:10.5px;line-height:1.25;}.center{text-align:center;}.title{font-weight:700;font-size:13px;}.muted{font-size:9px;}.line{border-top:1px dashed #000;margin:6px 0;}.row{display:flex;justify-content:space-between;gap:4px;margin:2px 0;}.row span:first-child{max-width:25mm;}.row span:last-child{text-align:right;font-weight:700;}.note{margin-top:6px;font-size:9px;}</style></head><body><div class="receipt"><div class="center title">ORBITNET HOTSPOT</div><div class="center">BUKTI SETORAN</div><div class="center muted">${escapeHtml(receiptNo)}</div><div class="line"></div><div class="row"><span>Tanggal</span><span>${formatDateTime(setor.date,setor.time)} WIB</span></div><div class="row"><span>Base</span><span>${escapeHtml(dec.baseName)}</span></div><div class="row"><span>Pelaku</span><span>${escapeHtml(dec.actorName)}</span></div><div class="line"></div><div class="row"><span>Deposit</span><span>Rp ${rupiah(deposit.nominal)}</span></div><div class="row"><span>Target Setor</span><span>Rp ${rupiah(deposit.expectedSetor)}</span></div><div class="row"><span>Sudah Dibayar</span><span>Rp ${rupiah(info.paidBefore)}</span></div><div class="row"><span>Dibayar Ini</span><span>Rp ${rupiah(setor.nominal)}</span></div><div class="row"><span>Dibayar sd Ini</span><span>Rp ${rupiah(info.paidUntilThis)}</span></div><div class="row"><span>Sisa</span><span>Rp ${rupiah(info.remainingAfter)}</span></div><div class="row"><span>Cicilan</span><span>Ke-${info.installmentNo} dari ${info.installmentCount}</span></div><div class="line"></div><div class="note">Catatan: ${escapeHtml(setor.notes || '-')}</div><div class="line"></div><div class="center muted">Dicetak: ${nowParts().display} WIB</div><div class="center muted">Terima kasih</div></div><script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`;
  const win = window.open('', '_blank', 'width=380,height=640');
  if(!win) return showToast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error');
  win.document.open(); win.document.write(html); win.document.close();
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
    const alreadyPaid = sumLinkedSetorsForDeposit(sourceDeposit.id, payload.id);
    const remaining = Math.max(0, payload.expectedSetor - alreadyPaid);
    if(payload.nominal > remaining){
      return showToast(`Nominal setoran melebihi sisa target. Sisa yang boleh disetor: Rp ${rupiah(remaining)}.`, 'error');
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
  document.querySelectorAll('[data-setor-history]').forEach(btn=>btn.addEventListener('click', ()=> openSetorHistoryModal(btn.dataset.setorHistory)));
  document.querySelectorAll('[data-print-setor]').forEach(btn=>btn.addEventListener('click', ()=> printSetorReceipt(btn.dataset.printSetor)));
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
