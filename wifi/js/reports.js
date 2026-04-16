function actorFilterOptions(baseId, selected='ALL'){
  const bases = baseId === 'ALL' ? APP.state.config.bases : APP.state.config.bases.filter(b=>b.id===baseId);
  const opts = [];
  for(const base of bases){
    if(base.directEnabled) opts.push({ value: actorKey(base.id,''), label:`${base.name} (Direct)` });
    for(const res of base.resellers||[]) opts.push({ value: actorKey(base.id,res.id), label:`${base.name} - ${res.name}` });
  }
  return opts.map(opt=>`<option value="${opt.value}" ${selected===opt.value?'selected':''}>${escapeHtml(opt.label)}</option>`).join('');
}
function periodKey(date){ const [y,m] = String(date||'').split('-'); return y && m ? `${y}-${m}` : ''; }
function reportMainRows(){
  return [...APP.state.mainTransactions]
    .filter(x => !APP.state.reportFilters.mainStart || x.date >= APP.state.reportFilters.mainStart)
    .filter(x => !APP.state.reportFilters.mainEnd || x.date <= APP.state.reportFilters.mainEnd)
    .sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function reportModuleRows(type='ALL'){
  if(type==='PIUTANG') return computedPiutangRows();
  if(type==='BAGIHASIL') return computedProfitRows();
  if(type==='ALL'){
    return [
      ...getFilteredModuleTransactions('DEPOSIT', APP.state.reportFilters).map(txDecorated),
      ...getFilteredModuleTransactions('SETOR', APP.state.reportFilters).map(txDecorated),
      ...computedPiutangRows(),
      ...computedProfitRows()
    ].sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }
  return getFilteredModuleTransactions(type, APP.state.reportFilters).map(txDecorated);
}
function reportProfitSummaryRows(){
  const rows = getFilteredModuleTransactions('DEPOSIT', APP.state.reportFilters).map(tx=>{
    const dec = txDecorated(tx);
    return {
      date: tx.date,
      time: tx.time,
      baseName: dec.baseName,
      actorName: dec.actorName,
      baseReceive: Number(tx.baseShareAmount||0),
      partnerReceive: Number(tx.partnerShareAmount||0),
      ownerReceive: Number(tx.ownerShareAmount||0),
      note: `Bagi hasil otomatis dari deposit ${dec.actorName}.`
    };
  }).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const totals = rows.reduce((a,r)=>({ baseReceive:a.baseReceive+r.baseReceive, partnerReceive:a.partnerReceive+r.partnerReceive, ownerReceive:a.ownerReceive+r.ownerReceive }), { baseReceive:0, partnerReceive:0, ownerReceive:0 });
  return { rows, totals };
}

function getBalanceInfoReportData(){
  const start = APP.state.reportFilters.balanceStart || APP.state.reportFilters.mainStart || '';
  const end = APP.state.reportFilters.balanceEnd || APP.state.reportFilters.mainEnd || '';
  const mainRows = [...APP.state.mainTransactions]
    .filter(x => !start || x.date >= start)
    .filter(x => !end || x.date <= end);
  const pendapatan = mainRows.filter(x=>x.type==='PENDAPATAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const pengeluaran = mainRows.filter(x=>x.type==='PENGELUARAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const saldoUtama = pendapatan - pengeluaran;

  const reserveFilters = { startDate:start, endDate:end, fundType:'ALL', entryType:'ALL', search:'' };
  const reserve = typeof reserveSummaryByFund === 'function' ? reserveSummaryByFund(reserveFilters) : { total:{balance:0}, funds:{} };

  const moduleRows = [...APP.state.moduleTransactions]
    .filter(x => !start || x.date >= start)
    .filter(x => !end || x.date <= end);
  const baseMap = new Map();
  moduleRows.filter(x=>['DEPOSIT','SETOR'].includes(x.moduleType)).forEach(tx=>{
    const base = findBase(tx.baseId);
    if(!base) return;
    const key = tx.actorKey || actorKey(tx.baseId, tx.resellerId || '');
    if(!baseMap.has(key)){
      baseMap.set(key, { baseId:tx.baseId, baseName:base.name, actorName:actorLabel(base, tx.resellerId), receivable:0 });
    }
    const row = baseMap.get(key);
    if(tx.moduleType==='DEPOSIT') row.receivable += Number(tx.expectedSetor||0);
    if(tx.moduleType==='SETOR') row.receivable -= Number(tx.nominal||0);
  });
  const piutangDetail = [...baseMap.values()]
    .map(r=>({ ...r, receivable: Math.max(0, r.receivable) }))
    .filter(r=>r.receivable>0)
    .sort((a,b)=>b.receivable-a.receivable || a.baseName.localeCompare(b.baseName));
  const piutangByBaseMap = new Map();
  piutangDetail.forEach(row=>{
    const key = row.baseId || '__NOBASE__';
    if(!piutangByBaseMap.has(key)) piutangByBaseMap.set(key, { baseId:key, baseName:row.baseName || 'Tanpa Base', receivable:0, actors:0 });
    const item = piutangByBaseMap.get(key);
    item.receivable += Number(row.receivable || 0);
    item.actors += 1;
  });
  const piutangPerBase = [...piutangByBaseMap.values()].sort((a,b)=>b.receivable-a.receivable || a.baseName.localeCompare(b.baseName));
  const totalPiutang = piutangPerBase.reduce((s,x)=>s+Number(x.receivable||0),0);
  const saldoAktual = saldoUtama + Number(reserve.total?.balance || 0) - totalPiutang;
  return { start, end, pendapatan, pengeluaran, saldoUtama, reserve, piutangPerBase, piutangDetail, totalPiutang, saldoAktual };
}
function balanceInfoSection(){
  const info = getBalanceInfoReportData();
  return `
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h3 class="text-lg font-bold">Laporan Informasi Saldo per Periode</h3><p class="text-sm text-slate-500 dark:text-slate-400">Dipakai untuk export ringkasan saldo utama, dana cadangan, piutang per base, dan saldo aktual.</p></div>
        <div class="flex flex-wrap gap-2">
          <button id="exportBalanceXlsxBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Saldo Excel</button>
          <button id="exportBalancePdfBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Saldo PDF</button>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input id="reportBalanceStart" type="date" value="${info.start}" class="rounded-2xl border px-3 py-2">
        <input id="reportBalanceEnd" type="date" value="${info.end}" class="rounded-2xl border px-3 py-2">
        <button id="applyBalanceReportBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Terapkan Periode Saldo</button>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${card('Saldo Utama', `Rp ${rupiah(info.saldoUtama)}`, `Pendapatan Rp ${rupiah(info.pendapatan)} · Pengeluaran Rp ${rupiah(info.pengeluaran)}`, info.saldoUtama>=0?'text-blue-600':'text-amber-600')}
        ${card('Zakat', `Rp ${rupiah(info.reserve.funds?.ZAKAT?.balance || 0)}`, `Masuk Rp ${rupiah(info.reserve.funds?.ZAKAT?.credit || 0)} · Keluar Rp ${rupiah(info.reserve.funds?.ZAKAT?.debit || 0)}`, 'text-violet-600')}
        ${card('Infaq', `Rp ${rupiah(info.reserve.funds?.INFAQ?.balance || 0)}`, `Masuk Rp ${rupiah(info.reserve.funds?.INFAQ?.credit || 0)} · Keluar Rp ${rupiah(info.reserve.funds?.INFAQ?.debit || 0)}`, 'text-violet-600')}
        ${card('Penyusutan', `Rp ${rupiah(info.reserve.funds?.PENYUSUTAN?.balance || 0)}`, `Masuk Rp ${rupiah(info.reserve.funds?.PENYUSUTAN?.credit || 0)} · Keluar Rp ${rupiah(info.reserve.funds?.PENYUSUTAN?.debit || 0)}`, 'text-violet-600')}
        ${card('Total Piutang Base', `Rp ${rupiah(info.totalPiutang)}`, `${info.piutangPerBase.length} base masih punya piutang`, info.totalPiutang>0?'text-amber-600':'text-emerald-600')}
        ${card('Saldo Aktual', `Rp ${rupiah(info.saldoAktual)}`, 'Saldo Utama + Dana Cadangan - Piutang', info.saldoAktual>=0?'text-emerald-600':'text-rose-600')}
      </div>
      <div class="mt-4 table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-right">Piutang</th><th class="px-3 py-2 text-center">Akun Piutang</th></tr></thead><tbody>${info.piutangPerBase.map(row=>`<tr class="border-b"><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(row.receivable)}</td><td class="px-3 py-2 text-center">${row.actors}</td></tr>`).join('') || '<tr><td colspan="3" class="px-3 py-8 text-center text-slate-500">Tidak ada piutang pada periode ini.</td></tr>'}</tbody></table></div>
    </section>`;
}
function exportBalanceInfoXlsx(){
  if(!window.XLSX) return showToast('Library Excel belum termuat.', 'error');
  const info = getBalanceInfoReportData();
  const wb = XLSX.utils.book_new();
  const summaryRows = [
    { Komponen:'Periode', Nilai:`${info.start || '-'} s.d. ${info.end || '-'}`, Keterangan:'Filter laporan informasi saldo' },
    { Komponen:'Pendapatan', Nilai:Number(info.pendapatan||0), Keterangan:'Transaksi utama jenis pendapatan' },
    { Komponen:'Pengeluaran', Nilai:Number(info.pengeluaran||0), Keterangan:'Transaksi utama jenis pengeluaran' },
    { Komponen:'Saldo Utama', Nilai:Number(info.saldoUtama||0), Keterangan:'Pendapatan - Pengeluaran' },
    { Komponen:'Zakat', Nilai:Number(info.reserve.funds?.ZAKAT?.balance || 0), Keterangan:'Saldo dana Zakat' },
    { Komponen:'Infaq', Nilai:Number(info.reserve.funds?.INFAQ?.balance || 0), Keterangan:'Saldo dana Infaq' },
    { Komponen:'Penyusutan', Nilai:Number(info.reserve.funds?.PENYUSUTAN?.balance || 0), Keterangan:'Saldo dana Penyusutan' },
    { Komponen:'Total Piutang Base', Nilai:Number(info.totalPiutang||0), Keterangan:'Akumulasi piutang per base' },
    { Komponen:'Saldo Aktual', Nilai:Number(info.saldoAktual||0), Keterangan:'Saldo Utama + Dana Cadangan - Piutang' }
  ];
  const reserveRows = ['ZAKAT','INFAQ','PENYUSUTAN'].map(key=>({
    PosDana: reserveFundInfo(key).label,
    TambahSaldo: Number(info.reserve.funds?.[key]?.credit || 0),
    Penggunaan: Number(info.reserve.funds?.[key]?.debit || 0),
    Saldo: Number(info.reserve.funds?.[key]?.balance || 0),
    JumlahTransaksi: Number(info.reserve.funds?.[key]?.count || 0)
  }));
  const piutangRows = info.piutangPerBase.map(row=>({ Base:row.baseName, Piutang:Number(row.receivable||0), JumlahAkun:row.actors }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Informasi Saldo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reserveRows.length?reserveRows:[{Info:'Tidak ada data cadangan'}]), 'Dana Cadangan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(piutangRows.length?piutangRows:[{Info:'Tidak ada piutang'}]), 'Piutang per Base');
  XLSX.writeFile(wb, `laporan-informasi-saldo-${todayDateIso()}.xlsx`);
}
function exportBalanceInfoPdf(){
  if(!(window.jspdf && window.jspdf.jsPDF)) return showToast('Library PDF belum termuat.', 'error');
  const info = getBalanceInfoReportData();
  const doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  let y = 36;
  doc.setFontSize(16); doc.text('Laporan Informasi Saldo WiFi Hotspot', 40, y); y += 22;
  doc.setFontSize(10); doc.text(`Periode: ${info.start || '-'} s.d. ${info.end || '-'}`, 40, y); y += 14;
  doc.text(`Dicetak: ${nowParts().display} WIB`, 40, y); y += 18;
  doc.autoTable({
    startY: y,
    head: [['Komponen','Nilai','Keterangan']],
    body: [
      ['Pendapatan', `Rp ${rupiah(info.pendapatan)}`, 'Transaksi utama pendapatan'],
      ['Pengeluaran', `Rp ${rupiah(info.pengeluaran)}`, 'Transaksi utama pengeluaran'],
      ['Saldo Utama', `Rp ${rupiah(info.saldoUtama)}`, 'Pendapatan - Pengeluaran'],
      ['Zakat', `Rp ${rupiah(info.reserve.funds?.ZAKAT?.balance || 0)}`, 'Saldo dana Zakat'],
      ['Infaq', `Rp ${rupiah(info.reserve.funds?.INFAQ?.balance || 0)}`, 'Saldo dana Infaq'],
      ['Penyusutan', `Rp ${rupiah(info.reserve.funds?.PENYUSUTAN?.balance || 0)}`, 'Saldo dana Penyusutan'],
      ['Total Piutang Base', `Rp ${rupiah(info.totalPiutang)}`, 'Akumulasi piutang per base'],
      ['Saldo Aktual', `Rp ${rupiah(info.saldoAktual)}`, 'Saldo Utama + Dana Cadangan - Piutang']
    ], styles:{fontSize:9}
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.autoTable({
    startY: y,
    head: [['Pos Dana','Tambah Saldo','Penggunaan','Saldo']],
    body: ['ZAKAT','INFAQ','PENYUSUTAN'].map(key=>[reserveFundInfo(key).label, `Rp ${rupiah(info.reserve.funds?.[key]?.credit || 0)}`, `Rp ${rupiah(info.reserve.funds?.[key]?.debit || 0)}`, `Rp ${rupiah(info.reserve.funds?.[key]?.balance || 0)}`]),
    styles:{fontSize:9}
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.autoTable({
    startY: y,
    head: [['Base','Piutang','Akun Piutang']],
    body: (info.piutangPerBase.length ? info.piutangPerBase.map(row=>[row.baseName, `Rp ${rupiah(row.receivable)}`, String(row.actors)]) : [['Tidak ada piutang','','']]),
    styles:{fontSize:9}
  });
  doc.save(`laporan-informasi-saldo-${todayDateIso()}.pdf`);
}

function rowsForPeriod(period, type){
  if(type==='PIUTANG'){
    const map = new Map();
    APP.state.moduleTransactions.filter(x=>periodKey(x.date)===period && ['DEPOSIT','SETOR'].includes(x.moduleType)).forEach(tx=>{
      const base = findBase(tx.baseId); if(!base) return;
      const key = tx.actorKey || actorKey(tx.baseId, tx.resellerId || '');
      if(!map.has(key)) map.set(key, { nominal:0, baseName:base.name, actorName:actorLabel(base, tx.resellerId), actorKey:key, baseId:tx.baseId });
      const row = map.get(key);
      if(tx.moduleType==='DEPOSIT') row.nominal += Number(tx.expectedSetor||0);
      if(tx.moduleType==='SETOR') row.nominal -= Number(tx.nominal||0);
    });
    return [...map.values()].map(r=>({ ...r, nominal: Math.max(0, r.nominal) })).filter(r=>r.nominal>0);
  }
  if(type==='BAGIHASIL'){
    return APP.state.moduleTransactions
      .filter(x=>periodKey(x.date)===period && x.moduleType==='DEPOSIT')
      .flatMap(tx=>{
        const actor = txDecorated(tx);
        return [
          { nominal:Number(tx.baseShareAmount||0), recipientLabel:actor.baseName, baseName:actor.baseName, actorName:actor.actorName, rowKey:`${tx.id}::BASE`, recipientKey:`BASE::${actor.baseName}`, sourceDepositId:tx.id },
          { nominal:Number(tx.actorShareAmount||0), recipientLabel:'Pelaku', baseName:actor.baseName, actorName:actor.actorName, rowKey:`${tx.id}::ACTOR`, recipientKey:`ACTOR::${actor.actorName}`, sourceDepositId:tx.id },
          { nominal:Number(tx.ownerShareAmount||0), recipientLabel:APP.state.config.ownerName || 'System', baseName:actor.baseName, actorName:actor.actorName, rowKey:`${tx.id}::OWNER`, recipientKey:`OWNER::${APP.state.config.ownerName || 'System'}`, sourceDepositId:tx.id },
          { nominal:Number(tx.partnerShareAmount||0), recipientLabel:APP.state.config.partnerName || 'Technical', baseName:actor.baseName, actorName:actor.actorName, rowKey:`${tx.id}::PARTNER`, recipientKey:`PARTNER::${APP.state.config.partnerName || 'Technical'}`, sourceDepositId:tx.id }
        ].filter(r=>r.nominal>0);
      });
  }
  return APP.state.moduleTransactions.filter(x=>periodKey(x.date)===period && x.moduleType===type);
}
function mainCategoryByName(type, rootName, childName){
  let root = APP.state.categories.find(x => x.type===type && x.name===rootName && (x.parentId||'ROOT')==='ROOT');
  return { root, childName };
}
function endOfPeriodDate(period){
  const [y,m] = String(period||'').split('-').map(Number);
  if(!y || !m) return todayDateIso();
  const d = new Date(y, m, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
async function ensureMainCategory(type, rootName, childName){
  let root = APP.state.categories.find(x => x.type===type && x.name===rootName && (x.parentId||'ROOT')==='ROOT');
  if(!root){ root = { id:uuid(), type, name:rootName, parentId:'ROOT' }; await DB.put(STORES.categories, root); }
  let child = APP.state.categories.find(x => x.type===type && x.name===childName && x.parentId===root.id);
  if(!child){ child = { id:uuid(), type, name:childName, parentId:root.id }; await DB.put(STORES.categories, child); }
  await loadState();
  return [root.id, child.id];
}
async function postPeriodicIntegration(kind){
  const period = APP.state.reportFilters.integrationPeriod || '';
  if(!period) return showToast('Pilih periode terlebih dahulu.', 'error');
  const forcedPeriodDate = endOfPeriodDate(period);
  const postDate = (kind === 'SETOR' || kind === 'BAGIHASIL') ? forcedPeriodDate : (APP.state.reportFilters.integrationDate || todayDateIso());
  const postTime = (kind === 'SETOR' || kind === 'BAGIHASIL') ? '23:59:59' : (APP.state.reportFilters.integrationTime || currentTimeWIB());

  const map = {
    SETOR: { type:'PENDAPATAN', root:'Rekap Base/Reseller', child:'Posting Setoran Modul', note:'Setoran' },
    PIUTANG: { type:'PENDAPATAN', root:'Piutang Auto', child:'Posting Piutang Otomatis', note:'Posting total piutang otomatis dari modul' },
    BAGIHASIL: { type:'PENGELUARAN', root:'Bagi Hasil Auto', child:'Posting Bagi Hasil Otomatis', note:'Auto' }
  };
  const cfg = map[kind];
  const rows = rowsForPeriod(period, kind);
  if(!rows.length) return showToast('Tidak ada data pada periode tersebut.', 'error');

  const [rootId, childId] = await ensureMainCategory(cfg.type, cfg.root, cfg.child);

  if(kind === 'BAGIHASIL'){
    const forcedDate = endOfPeriodDate(period);
    const forcedTime = '23:59:59';
    const existingProfitPosts = APP.state.mainTransactions.filter(x => String(x.source||'').startsWith('INTEGRATION_BAGIHASIL') && x.integrationPeriod===period);
    for(const row of existingProfitPosts) await DB.delete(STORES.mainTransactions, row.id);

    const depositsInPeriod = APP.state.moduleTransactions.filter(x => x.moduleType==='DEPOSIT' && periodKey(x.date)===period);
    const totals = depositsInPeriod.reduce((acc, tx)=>{
      acc.base += Number(tx.baseShareAmount || 0);
      acc.partner += Number(tx.partnerShareAmount || 0);
      acc.owner += Number(tx.ownerShareAmount || 0);
      return acc;
    }, { base:0, partner:0, owner:0 });

    const profitTargets = [
      { childName:'Terima Base', amount: totals.base, source:'INTEGRATION_BAGIHASIL_BASE' },
      { childName:`Terima ${APP.state.config.partnerName || 'Partner'}`, amount: totals.partner, source:'INTEGRATION_BAGIHASIL_PARTNER' },
      { childName:`Terima ${APP.state.config.ownerName || 'Own'}`, amount: totals.owner, source:'INTEGRATION_BAGIHASIL_OWNER' }
    ].filter(item => Number(item.amount || 0) > 0);

    if(!profitTargets.length) return showToast('Tidak ada data bagi hasil pada periode tersebut.', 'error');

    for(const item of profitTargets){
      const catPath = await ensureMainCategory(cfg.type, cfg.root, item.childName);
      const payload = {
        id: uuid(),
        type: cfg.type,
        categoryPath: catPath,
        categoryPathNames: categoryPathNames(catPath),
        amount: Number(item.amount || 0),
        notes: `Posting total bagi hasil periode ${period} · ${item.childName}.`,
        date: forcedDate,
        time: forcedTime,
        source: item.source,
        integrationPeriod: period,
        updatedAt: nowParts().display
      };
      await DB.put(STORES.mainTransactions, payload);
    }
    await loadState();
    render();
    return showToast('Posting bagi hasil berhasil dipindahkan ke Transaksi Utama menjadi 3 total periode.');
  }

  if(kind === 'SETOR'){
    const forcedDate = endOfPeriodDate(period);
    const forcedTime = '23:59:59';
    const existingSetorPosts = APP.state.mainTransactions.filter(x => String(x.source||'').startsWith('INTEGRATION_SETOR') && x.integrationPeriod===period);
    for(const row of existingSetorPosts) await DB.delete(STORES.mainTransactions, row.id);

    const grouped = rows.reduce((acc, tx) => {
      const base = findBase(tx.baseId);
      const key = tx.baseId || '__UNKNOWN__';
      if(!acc.has(key)) acc.set(key, { baseId:key, baseName: base?.name || 'Tanpa Base', total:0, count:0 });
      const item = acc.get(key);
      item.total += Number(tx.nominal || 0);
      item.count += 1;
      return acc;
    }, new Map());

    for(const item of grouped.values()){
      const payload = {
        id: uuid(),
        type: cfg.type,
        categoryPath:[rootId, childId],
        categoryPathNames:categoryPathNames([rootId, childId]),
        amount: item.total,
        notes: `${cfg.note} periode ${period} · Base ${item.baseName} (${item.count} transaksi).`,
        date: forcedDate,
        time: forcedTime,
        source:'INTEGRATION_SETOR_BASE',
        integrationPeriod:period,
        integrationBaseId:item.baseId,
        updatedAt:nowParts().display
      };
      await DB.put(STORES.mainTransactions, payload);
    }
    await loadState();
    render();
    return showToast('Posting setoran berhasil dipindahkan ke Transaksi Utama per base.');
  }

  if(kind === 'PIUTANG'){
    const forcedDate = endOfPeriodDate(period);
    const forcedTime = '23:59:59';
    const existingPiutangPosts = APP.state.mainTransactions.filter(x => String(x.source||'').startsWith('INTEGRATION_PIUTANG') && x.integrationPeriod===period);
    for(const row of existingPiutangPosts) await DB.delete(STORES.mainTransactions, row.id);

    const grouped = rows.reduce((acc, tx) => {
      const base = findBase(tx.baseId);
      const key = tx.baseId || '__UNKNOWN__';
      if(!acc.has(key)) acc.set(key, { baseId:key, baseName: base?.name || 'Tanpa Base', total:0, count:0 });
      const item = acc.get(key);
      item.total += Number(tx.nominal || 0);
      item.count += 1;
      return acc;
    }, new Map());

    for(const item of grouped.values()){
      const payload = {
        id: uuid(),
        type: cfg.type,
        categoryPath:[rootId, childId],
        categoryPathNames:categoryPathNames([rootId, childId]),
        amount: item.total,
        notes: `Posting piutang otomatis periode ${period} · Base ${item.baseName} (${item.count} akun piutang).`,
        date: forcedDate,
        time: forcedTime,
        source:'INTEGRATION_PIUTANG_BASE',
        integrationPeriod:period,
        integrationBaseId:item.baseId,
        updatedAt:nowParts().display
      };
      await DB.put(STORES.mainTransactions, payload);
    }
    await loadState();
    render();
    return showToast('Posting piutang berhasil dipindahkan ke Transaksi Utama per base.');
  }

  const total = rows.reduce((s,x)=>s+Number(x.nominal||0),0);
  const existing = APP.state.mainTransactions.find(x => x.source===`INTEGRATION_${kind}` && x.integrationPeriod===period);
  const payload = {
    id: existing?.id || uuid(),
    type: cfg.type,
    categoryPath:[rootId, childId],
    categoryPathNames:categoryPathNames([rootId, childId]),
    amount: total,
    notes: `${cfg.note} periode ${period}. Total: Rp ${rupiah(total)} (${rows.length} transaksi).`,
    date:postDate,
    time:postTime,
    source:`INTEGRATION_${kind}`,
    integrationPeriod:period,
    updatedAt:nowParts().display
  };
  await DB.put(STORES.mainTransactions, payload);
  await loadState();
  render();
  showToast('Posting periodik berhasil dipindahkan ke Transaksi Utama.');
}
function reportSummaryCards(mainRows, autoReport, piutangRows, bagiRows){
  return `
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
    <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 class="text-lg font-bold">Laporan Transaksi Utama</h3>
      <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"><input id="reportMainStart" type="date" value="${APP.state.reportFilters.mainStart}" class="rounded-2xl border px-3 py-2"><input id="reportMainEnd" type="date" value="${APP.state.reportFilters.mainEnd}" class="rounded-2xl border px-3 py-2"><button id="applyMainReportBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Terapkan Filter</button></div>
      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        ${card('Pendapatan', `Rp ${rupiah(mainRows.filter(x=>x.type==='PENDAPATAN').reduce((s,x)=>s+Number(x.amount||0),0))}`, 'Sesuai filter utama', 'text-emerald-600')}
        ${card('Pengeluaran', `Rp ${rupiah(mainRows.filter(x=>x.type==='PENGELUARAN').reduce((s,x)=>s+Number(x.amount||0),0))}`, 'Sesuai filter utama', 'text-rose-600')}
        ${card('Jumlah Data', `${mainRows.length}`, 'Baris transaksi', 'text-blue-600')}
      </div>
    </div>
    <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 class="text-lg font-bold">Laporan Modul</h3>
      <div class="mt-3">${moduleQuickFilterBar('deposit','report')}</div>
      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        ${card('Deposit', `Rp ${rupiah(autoReport.grand.gross)}`, `${autoReport.grand.deposits} transaksi`, 'text-emerald-600')}
        ${card('Setoran', `Rp ${rupiah(autoReport.grand.actual)}`, `${autoReport.grand.setors} transaksi`, 'text-blue-600')}
        ${card('Piutang Otomatis', `Rp ${rupiah(piutangRows.reduce((s,x)=>s+Number(x.nominal||0),0))}`, `${piutangRows.length} akun`, 'text-amber-600')}
        ${card('Bagi Hasil Otomatis', `Rp ${rupiah(bagiRows.reduce((s,x)=>s+Number(x.nominal||0),0))}`, `${bagiRows.length} baris pembagian`, 'text-purple-600')}
      </div>
    </div>
  </div>`;
}
function reportsPage(){
  const mainRows = reportMainRows();
  const autoReport = aggregateModuleReport();
  const depositRows = reportModuleRows('DEPOSIT');
  const setorRows = reportModuleRows('SETOR');
  const piutangRows = reportModuleRows('PIUTANG');
  const bagiRows = reportModuleRows('BAGIHASIL');
  const profitSummary = reportProfitSummaryRows();
  const piutangTotal = piutangRows.reduce((s,x)=>s+Number(x.nominal||0),0);
  const periodOptions = [...new Set(APP.state.moduleTransactions.map(x=>periodKey(x.date)).filter(Boolean))].sort().reverse();
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 class="text-xl font-bold">Laporan Terpisah per Modul</h2><p class="text-sm text-slate-500 dark:text-slate-400">Export Excel dan PDF diambil dari data yang difilter.</p></div>
        <div class="flex flex-wrap gap-2">
          <button id="exportXlsxBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Excel</button>
          <button id="exportPdfBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export PDF</button>
          <button id="exportBackupBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Export Backup</button>
          <label class="rounded-2xl border px-4 py-2 text-sm font-semibold cursor-pointer">Import Backup<input id="importBackupInput" type="file" accept="application/json" class="hidden"></label>
        </div>
      </div>
      ${reportSummaryCards(mainRows, autoReport, piutangRows, bagiRows)}
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h3 class="text-lg font-bold">Posting Periodik ke Transaksi Utama</h3><p class="text-sm text-slate-500 dark:text-slate-400">Setoran, piutang dan bagi hasil dapat diposting ke transaksi utama.</p></div>
        <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-5 items-center">
          <select id="integrationPeriod" class="rounded-2xl border px-3 py-2"><option value="">Pilih periode posting</option>${periodOptions.map(p=>`<option value="${p}" ${APP.state.reportFilters.integrationPeriod===p?'selected':''}>${p}</option>`).join('')}</select>
          <input id="integrationDate" type="date" value="${APP.state.reportFilters.integrationDate || todayDateIso()}" class="rounded-2xl border px-3 py-2">
          <input id="integrationTime" type="time" step="1" value="${APP.state.reportFilters.integrationTime || currentTimeWIB()}" class="rounded-2xl border px-3 py-2">
          <button data-post-kind="SETOR" class="post-btn rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Setoran</button>
          <button data-post-kind="PIUTANG" class="post-btn rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Piutang</button>
          <button data-post-kind="BAGIHASIL" class="post-btn rounded-2xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white xl:col-span-2">Bagi Hasil</button>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        ${card('Setoran Periode', `Rp ${rupiah((APP.state.reportFilters.integrationPeriod ? rowsForPeriod(APP.state.reportFilters.integrationPeriod, 'SETOR') : []).reduce((s,x)=>s+Number(x.nominal||0),0))}`, 'Pilih periode untuk melihat nilai', 'text-blue-600')}
        ${card('Piutang Otomatis', `Rp ${rupiah((APP.state.reportFilters.integrationPeriod ? rowsForPeriod(APP.state.reportFilters.integrationPeriod, 'PIUTANG') : []).reduce((s,x)=>s+Number(x.nominal||0),0))}`, 'Pilih periode untuk melihat nilai', 'text-amber-600')}
        ${card('Bagi Hasil Otomatis', `Rp ${rupiah((APP.state.reportFilters.integrationPeriod ? rowsForPeriod(APP.state.reportFilters.integrationPeriod, 'BAGIHASIL') : []).reduce((s,x)=>s+Number(x.nominal||0),0))}`, 'Pilih periode untuk melihat nilai', 'text-purple-600')}
      </div>
    </section>

    ${balanceInfoSection()}

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <h3 class="text-lg font-bold">Rekap Deposit vs Setoran</h3>
      <div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left whitespace-nowrap">Base</th><th class="px-3 py-2 text-left whitespace-nowrap">Pelaku</th><th class="px-3 py-2 text-right whitespace-nowrap">Deposit</th><th class="px-3 py-2 text-right whitespace-nowrap">Target Setor</th><th class="px-3 py-2 text-right whitespace-nowrap">Setoran</th><th class="px-3 py-2 text-right whitespace-nowrap">Piutang Auto</th><th class="px-3 py-2 text-right whitespace-nowrap">Share Actor</th><th class="px-3 py-2 text-right whitespace-nowrap">Share Owner</th><th class="px-3 py-2 text-right whitespace-nowrap">Share Partner</th></tr></thead><tbody>${autoReport.rows.map(row=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(row.baseName)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(row.actorName)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.gross)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.expected)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.actual)}</td><td class="px-3 py-2 text-right whitespace-nowrap ${row.receivable>0?'text-amber-600 font-semibold':''}">Rp ${rupiah(row.receivable)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.actorShareDisplay || row.actorShare || 0)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.ownerShare)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.partnerShare)}</td></tr>`).join('') || `<tr><td colspan="9" class="px-3 py-8 text-center text-slate-500">Belum ada data deposit/setoran.</td></tr>`}<tr class="border-t-2 font-bold"><td class="px-3 py-2 whitespace-nowrap" colspan="2">Total</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.gross)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.expected)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.actual)}</td><td class="px-3 py-2 text-right whitespace-nowrap ${autoReport.grand.receivable>0?'text-amber-600':''}">Rp ${rupiah(autoReport.grand.receivable)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.actorShareDisplay || autoReport.grand.actorShare || 0)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.ownerShare)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(autoReport.grand.partnerShare)}</td></tr></tbody></table></div>
    </section>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-lg font-bold">Piutang Otomatis</h3>
        <div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left whitespace-nowrap">Tanggal</th><th class="px-3 py-2 text-left whitespace-nowrap">Base</th><th class="px-3 py-2 text-left whitespace-nowrap">Pelaku</th><th class="px-3 py-2 text-right whitespace-nowrap">Nominal</th><th class="px-3 py-2 text-left whitespace-nowrap">Catatan</th></tr></thead><tbody>${piutangRows.length ? `${piutangRows.map(tx=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(tx.baseName)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(tx.actorName)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(tx.nominal)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(tx.notes||'-')}</td></tr>`).join('')}<tr class="border-t-2 font-semibold"><td class="px-3 py-2 whitespace-nowrap" colspan="3">Total</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(piutangTotal)}</td><td class="px-3 py-2 whitespace-nowrap">Mengikuti filter laporan modul</td></tr>` : `<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">Belum ada data piutang.</td></tr>`}</tbody></table></div>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-lg font-bold">Bagi Hasil Otomatis</h3>
        <div class="table-wrap mt-4"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left whitespace-nowrap">Tanggal</th><th class="px-3 py-2 text-left whitespace-nowrap">Base</th><th class="px-3 py-2 text-left whitespace-nowrap">Pelaku</th><th class="px-3 py-2 text-right whitespace-nowrap">Terima Base</th><th class="px-3 py-2 text-right whitespace-nowrap">Terima ${escapeHtml(APP.state.config.partnerName || 'Technical')}</th><th class="px-3 py-2 text-right whitespace-nowrap">Terima ${escapeHtml(APP.state.config.ownerName || 'System')}</th><th class="px-3 py-2 text-left whitespace-nowrap">Catatan</th></tr></thead><tbody>${profitSummary.rows.map(row=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(row.date,row.time)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(row.baseName)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(row.actorName)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.baseReceive)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.partnerReceive)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(row.ownerReceive)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(row.note||'-')}</td></tr>`).join('') || `<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">Belum ada data bagi hasil.</td></tr>`}<tr class="border-t-2 font-bold"><td class="px-3 py-2 whitespace-nowrap" colspan="3">Total</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(profitSummary.totals.baseReceive)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(profitSummary.totals.partnerReceive)}</td><td class="px-3 py-2 text-right whitespace-nowrap">Rp ${rupiah(profitSummary.totals.ownerReceive)}</td><td class="px-3 py-2 whitespace-nowrap">Mengikuti filter laporan modul</td></tr></tbody></table></div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <h3 class="text-lg font-bold">Riwayat Modul Lengkap</h3>
      <div class="table-wrap mt-4"><table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Jenis</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-left">Penerima</th><th class="px-3 py-2 text-right">Nominal</th><th class="px-3 py-2 text-left">Catatan</th></tr></thead><tbody>${reportModuleRows('ALL').map(tx=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(tx.date,tx.time)}</td><td class="px-3 py-2">${escapeHtml(MODULE_TYPES[tx.moduleType] || tx.moduleType)}</td><td class="px-3 py-2">${escapeHtml(tx.baseName)}</td><td class="px-3 py-2">${escapeHtml(tx.actorName)}</td><td class="px-3 py-2">${tx.moduleType==='BAGIHASIL' ? escapeHtml(tx.recipientLabel) : '-'}</td><td class="px-3 py-2 text-right">Rp ${rupiah(tx.nominal)}</td><td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td></tr>`).join('') || `<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">Belum ada data modul.</td></tr>`}</tbody></table></div>
    </section>
  </div>`;
}
async function exportBackup(){
  const data = { version:2, exportedAt:new Date().toISOString(), settings:await DB.getAll(STORES.settings), categories:await DB.getAll(STORES.categories), mainTransactions:await DB.getAll(STORES.mainTransactions), moduleTransactions:await DB.getAll(STORES.moduleTransactions), reserveTransactions:await DB.getAll(STORES.reserveTransactions) };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-keuangan-wifi-${todayDateIso()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importBackup(file){
  const text = await file.text(); const data = JSON.parse(text);
  if(!data || !Array.isArray(data.settings) || !Array.isArray(data.categories)) return showToast('Format backup tidak valid.', 'error');
  for(const row of await DB.getAll(STORES.settings)) await DB.delete(STORES.settings, row.key);
  for(const row of await DB.getAll(STORES.categories)) await DB.delete(STORES.categories, row.id);
  for(const row of await DB.getAll(STORES.mainTransactions)) await DB.delete(STORES.mainTransactions, row.id);
  for(const row of await DB.getAll(STORES.moduleTransactions)) await DB.delete(STORES.moduleTransactions, row.id);
  for(const row of await DB.getAll(STORES.reserveTransactions)) await DB.delete(STORES.reserveTransactions, row.id);
  for(const row of data.settings) await DB.put(STORES.settings, row);
  for(const row of data.categories) await DB.put(STORES.categories, row);
  for(const row of (data.mainTransactions||[])) await DB.put(STORES.mainTransactions, row);
  for(const row of (data.moduleTransactions||[])) await DB.put(STORES.moduleTransactions, row);
  for(const row of (data.reserveTransactions||[])) await DB.put(STORES.reserveTransactions, row);
  await loadState(); render(); showToast('Backup berhasil diimpor.');
}
function exportReportsXlsx(){
  if(!window.XLSX) return showToast('Library Excel belum termuat.', 'error');
  const wb = XLSX.utils.book_new();
  const balanceInfo = getBalanceInfoReportData();
  const mainRows = reportMainRows().map(x=>({ Tanggal: formatDateTime(x.date,x.time), Jenis:x.type, Kategori:(x.categoryPathNames||[]).join(' > '), Nominal:Number(x.amount||0), Catatan:x.notes||'' }));
  const autoRows = aggregateModuleReport().rows.map(x=>({ Base:x.baseName, Pelaku:x.actorName, Deposit:Number(x.gross||0), TargetSetor:Number(x.expected||0), Setoran:Number(x.actual||0), PiutangAuto:Number(x.receivable||0), ShareActor:Number(x.actorShareDisplay||x.actorShare||0), ShareOwner:Number(x.ownerShare||0), SharePartner:Number(x.partnerShare||0) }));
  const piutangRows = reportModuleRows('PIUTANG').map(x=>({ Tanggal:formatDateTime(x.date,x.time), Base:x.baseName, Pelaku:x.actorName, Nominal:Number(x.nominal||0), Catatan:x.notes||'' }));
  const piutangTotal = piutangRows.reduce((s,x)=>s+Number(x.Nominal||0),0);
  const bagiRows = reportProfitSummaryRows().rows.map(x=>({ Tanggal:formatDateTime(x.date,x.time), Base:x.baseName, Pelaku:x.actorName, TerimaBase:Number(x.baseReceive||0), [`Terima${APP.state.config.partnerName || 'Technical'}`]:Number(x.partnerReceive||0), [`Terima${APP.state.config.ownerName || 'System'}`]:Number(x.ownerReceive||0), Catatan:x.note||'' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{Komponen:'Pendapatan', Nilai:Number(balanceInfo.pendapatan||0), Keterangan:'Transaksi utama pendapatan pada periode saldo'},{Komponen:'Pengeluaran', Nilai:Number(balanceInfo.pengeluaran||0), Keterangan:'Transaksi utama pengeluaran pada periode saldo'},{Komponen:'Saldo Utama', Nilai:Number(balanceInfo.saldoUtama||0), Keterangan:'Pendapatan - Pengeluaran'},{Komponen:'Zakat', Nilai:Number(balanceInfo.reserve.funds?.ZAKAT?.balance || 0), Keterangan:'Saldo dana Zakat'},{Komponen:'Infaq', Nilai:Number(balanceInfo.reserve.funds?.INFAQ?.balance || 0), Keterangan:'Saldo dana Infaq'},{Komponen:'Penyusutan', Nilai:Number(balanceInfo.reserve.funds?.PENYUSUTAN?.balance || 0), Keterangan:'Saldo dana Penyusutan'},{Komponen:'Total Piutang Base', Nilai:Number(balanceInfo.totalPiutang||0), Keterangan:'Piutang per base'},{Komponen:'Saldo Aktual', Nilai:Number(balanceInfo.saldoAktual||0), Keterangan:'Saldo Utama + Dana Cadangan - Piutang'}]), 'Informasi Saldo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balanceInfo.piutangPerBase.length?balanceInfo.piutangPerBase.map(r=>({Base:r.baseName, Piutang:Number(r.receivable||0), JumlahAkun:r.actors})):[{Info:'Tidak ada piutang'}]), 'Saldo Piutang');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainRows.length?mainRows:[{Info:'Tidak ada data'}]), 'Transaksi Utama');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(autoRows.length?autoRows:[{Info:'Tidak ada data'}]), 'Rekap Auto');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(piutangRows.length?[...piutangRows,{Tanggal:'', Base:'', Pelaku:'Total', Nominal:piutangTotal, Catatan:'Mengikuti filter laporan modul'}]:[{Info:'Tidak ada data'}]), 'Piutang Auto');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bagiRows.length?bagiRows:[{Info:'Tidak ada data'}]), 'Bagi Hasil Auto');
  XLSX.writeFile(wb, `laporan-keuangan-wifi-${todayDateIso()}.xlsx`);
}
function exportReportsPdf(){
  if(!(window.jspdf && window.jspdf.jsPDF)) return showToast('Library PDF belum termuat.', 'error');
  const doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'pt', format:'a4'});
  const auto = aggregateModuleReport();
  const balanceInfo = getBalanceInfoReportData();
  let y = 36;
  doc.setFontSize(16); doc.text('Laporan Keuangan WiFi Hotspot', 40, y); y += 22;
  doc.setFontSize(10); doc.text(`Dicetak: ${nowParts().display} WIB`, 40, y); y += 18;
  doc.text(`Filter utama: ${APP.state.reportFilters.mainStart || '-'} s.d. ${APP.state.reportFilters.mainEnd || '-'}`, 40, y); y += 14;
  doc.text(`Filter modul: ${APP.state.reportFilters.modStart || '-'} s.d. ${APP.state.reportFilters.modEnd || '-'}`, 40, y); y += 14;
  doc.text(`Filter saldo: ${balanceInfo.start || '-'} s.d. ${balanceInfo.end || '-'}`, 40, y); y += 18;
  doc.autoTable({
    startY: y,
    head: [['Komponen Saldo','Nilai','Keterangan']],
    body: [['Saldo Utama', `Rp ${rupiah(balanceInfo.saldoUtama)}`, 'Pendapatan - Pengeluaran'],['Zakat', `Rp ${rupiah(balanceInfo.reserve.funds?.ZAKAT?.balance || 0)}`, 'Saldo dana Zakat'],['Infaq', `Rp ${rupiah(balanceInfo.reserve.funds?.INFAQ?.balance || 0)}`, 'Saldo dana Infaq'],['Penyusutan', `Rp ${rupiah(balanceInfo.reserve.funds?.PENYUSUTAN?.balance || 0)}`, 'Saldo dana Penyusutan'],['Total Piutang Base', `Rp ${rupiah(balanceInfo.totalPiutang)}`, 'Akumulasi piutang per base'],['Saldo Aktual', `Rp ${rupiah(balanceInfo.saldoAktual)}`, 'Saldo Utama + Dana Cadangan - Piutang']],
    styles:{fontSize:8}
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.autoTable({
    startY: y,
    head: [['Base','Pelaku','Deposit','Target Setor','Setoran','Piutang Auto']],
    body: auto.rows.map(r=>[r.baseName,r.actorName,`Rp ${rupiah(r.gross)}`,`Rp ${rupiah(r.expected)}`,`Rp ${rupiah(r.actual)}`,`Rp ${rupiah(r.receivable)}`]),
    styles:{fontSize:8}
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.autoTable({
    startY: y,
    head: [['Piutang Otomatis','Base','Pelaku','Nominal']],
    body: (()=>{ const rows = reportModuleRows('PIUTANG').map(r=>[formatDateTime(r.date,r.time),r.baseName,r.actorName,`Rp ${rupiah(r.nominal)}`]); const total = reportModuleRows('PIUTANG').reduce((s,r)=>s+Number(r.nominal||0),0); if(rows.length) rows.push(['','','Total',`Rp ${rupiah(total)}`]); return rows; })(),
    styles:{fontSize:8}
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.autoTable({
    startY: y,
    head: [['Bagi Hasil Auto','Base','Pelaku','Terima Base',`Terima ${APP.state.config.partnerName || 'Technical'}`,`Terima ${APP.state.config.ownerName || 'System'}`]],
    body: reportProfitSummaryRows().rows.map(r=>[formatDateTime(r.date,r.time),r.baseName,r.actorName,`Rp ${rupiah(r.baseReceive)}`,`Rp ${rupiah(r.partnerReceive)}`,`Rp ${rupiah(r.ownerReceive)}`]),
    styles:{fontSize:8}
  });
  doc.save(`laporan-keuangan-wifi-${todayDateIso()}.pdf`);
}
function bindReportEvents(){
  document.getElementById('reportMainStart')?.addEventListener('change', e=> APP.state.reportFilters.mainStart = e.target.value);
  document.getElementById('reportMainEnd')?.addEventListener('change', e=> APP.state.reportFilters.mainEnd = e.target.value);
  document.getElementById('applyMainReportBtn')?.addEventListener('click', ()=> render());
  document.getElementById('reportBalanceStart')?.addEventListener('change', e=> APP.state.reportFilters.balanceStart = e.target.value);
  document.getElementById('reportBalanceEnd')?.addEventListener('change', e=> APP.state.reportFilters.balanceEnd = e.target.value);
  document.getElementById('applyBalanceReportBtn')?.addEventListener('click', ()=> render());
  document.getElementById('reportSearchFilter')?.addEventListener('input', e=>{ APP.state.reportFilters.modSearch = e.target.value; scheduleRender({ preserveInputId:'reportSearchFilter', preserveCursor:true }); });
  document.getElementById('reportStartFilter')?.addEventListener('change', e=>{ APP.state.reportFilters.modStart = e.target.value; render(); });
  document.getElementById('reportEndFilter')?.addEventListener('change', e=>{ APP.state.reportFilters.modEnd = e.target.value; render(); });
  document.getElementById('reportBaseFilter')?.addEventListener('change', e=>{ APP.state.reportFilters.baseId = e.target.value; const validActors = moduleActorFilterOptions(APP.state.reportFilters).map(x=>x.value); if(APP.state.reportFilters.actorKey !== 'ALL' && !validActors.includes(APP.state.reportFilters.actorKey)) APP.state.reportFilters.actorKey='ALL'; render(); });
  document.getElementById('reportActorFilter')?.addEventListener('change', e=>{ APP.state.reportFilters.actorKey = e.target.value; render(); });
  document.querySelectorAll('[data-smart-context="report"]').forEach(btn=>btn.addEventListener('click', ()=>{ APP.state.reportFilters[btn.dataset.smartFilter] = btn.dataset.smartValue; render(); }));
  document.getElementById('reportResetFilters')?.addEventListener('click', ()=>{ APP.state.reportFilters.modStart=''; APP.state.reportFilters.modEnd=''; APP.state.reportFilters.baseId='ALL'; APP.state.reportFilters.actorKey='ALL'; APP.state.reportFilters.modSearch=''; APP.state.reportFilters.depositSmart='ALL'; APP.state.reportFilters.setorSmart='ALL'; render(); });
  document.querySelectorAll('[data-post-kind]').forEach(btn=>btn.addEventListener('click', ()=> postPeriodicIntegration(btn.dataset.postKind)));
  document.getElementById('integrationPeriod')?.addEventListener('change', e=>{ APP.state.reportFilters.integrationPeriod = e.target.value; render(); });
  document.getElementById('integrationDate')?.addEventListener('change', e=>{ APP.state.reportFilters.integrationDate = e.target.value; });
  document.getElementById('integrationTime')?.addEventListener('change', e=>{ APP.state.reportFilters.integrationTime = e.target.value; });
  document.getElementById('exportBackupBtn')?.addEventListener('click', exportBackup);
  document.getElementById('importBackupInput')?.addEventListener('change', e=>{ if(e.target.files?.[0]) importBackup(e.target.files[0]); });
  document.getElementById('exportXlsxBtn')?.addEventListener('click', exportReportsXlsx);
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportReportsPdf);
  document.getElementById('exportBalanceXlsxBtn')?.addEventListener('click', exportBalanceInfoXlsx);
  document.getElementById('exportBalancePdfBtn')?.addEventListener('click', exportBalanceInfoPdf);
}
