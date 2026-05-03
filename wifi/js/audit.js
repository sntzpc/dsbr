
(function(){
  function ensureAuditFilters(){
    APP.state.auditFilters = APP.state.auditFilters || { period:'', baseId:'ALL', kind:'ALL', search:'' };
    const periods = auditPeriodOptions();
    if(!APP.state.auditFilters.period && periods.length) APP.state.auditFilters.period = periods[0];
    return APP.state.auditFilters;
  }

  function auditPeriodOptions(){
    return [...new Set((APP.state.moduleTransactions || [])
      .filter(x => ['DEPOSIT','SETOR'].includes(x.moduleType))
      .map(x => periodKey(x.date))
      .filter(Boolean))].sort().reverse();
  }

  function baseOptionsHtml(selected='ALL'){
    return `<option value="ALL">Semua Base</option>${getConfig().bases.map(base=>`<option value="${escapeHtml(base.id)}" ${selected===base.id?'selected':''}>${escapeHtml(base.name)}</option>`).join('')}`;
  }

  function auditPassSearch(row, q){
    if(!q) return true;
    const hay = [
      row.baseName, row.actorName, row.recipientLabel, row.notes, row.depositNotes, row.setorNotes,
      row.depositDate, row.setorDate, row.date, row.period, row.sourceDepositId, row.sourceSetorId,
      String(row.depositNominal||''), String(row.targetSetor||''), String(row.setorNominal||''), String(row.nominal||'')
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function auditSetoranRows(filters = ensureAuditFilters()){
    const q = String(filters.search || '').trim().toLowerCase();
    const period = filters.period || '';
    const setors = (APP.state.moduleTransactions || [])
      .filter(tx => tx.moduleType === 'SETOR')
      .filter(tx => !period || periodKey(tx.date) === period)
      .sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    return setors.map((setor, idx) => {
      const dep = setor.linkedDepositId ? (APP.state.moduleTransactions || []).find(x => x.id === setor.linkedDepositId && x.moduleType === 'DEPOSIT') : null;
      const source = dep || setor;
      const base = findBase(source.baseId);
      const dec = txDecorated(source);
      const allSetors = dep ? linkedSetorsForDepositAsc(dep.id) : [setor];
      const paidUntilThis = allSetors
        .filter(x => `${x.date} ${x.time} ${x.id}` <= `${setor.date} ${setor.time} ${setor.id}`)
        .reduce((sum,x)=>roundMoney2(sum + Number(x.nominal||0)), 0);
      const target = Number(dep?.expectedSetor || setor.expectedSetor || 0);
      const depositNominal = Number(dep?.nominal || 0);
      const row = {
        no: idx + 1,
        period: periodKey(setor.date),
        setorId: setor.id,
        sourceSetorId: setor.id,
        sourceDepositId: dep?.id || '',
        setorDate: setor.date,
        setorTime: setor.time,
        baseId: source.baseId || '',
        baseName: base?.name || dec.baseName || 'Tanpa Base',
        actorName: dec.actorName || '-',
        depositDate: dep?.date || '',
        depositTime: dep?.time || '',
        depositNominal,
        targetSetor: target,
        setorNominal: Number(setor.nominal || 0),
        paidUntilThis,
        remainingAfterThis: Math.max(0, roundMoney2(target - paidUntilThis)),
        grossEquivalent: dep ? realizedGrossFromSetor(setor, dep) : Number(setor.nominal || 0),
        cicilanKe: dep ? Math.max(1, allSetors.findIndex(x=>x.id===setor.id) + 1) : 1,
        totalCicilan: dep ? allSetors.length : 1,
        depositNotes: dep?.notes || '',
        setorNotes: setor.notes || ''
      };
      return row;
    })
    .filter(row => filters.baseId === 'ALL' || row.baseId === filters.baseId)
    .filter(row => auditPassSearch(row, q));
  }

  function auditBagiHasilRows(filters = ensureAuditFilters()){
    const q = String(filters.search || '').trim().toLowerCase();
    const period = filters.period || '';
    return computedProfitRows(moduleAllFilters())
      .filter(row => ['BASE','OWNER','PARTNER'].includes(row.recipient))
      .filter(row => !period || periodKey(row.date) === period)
      .filter(row => filters.baseId === 'ALL' || row.baseId === filters.baseId)
      .map(row => {
        const dep = row.sourceDepositId ? (APP.state.moduleTransactions || []).find(x=>x.id===row.sourceDepositId && x.moduleType==='DEPOSIT') : null;
        const setor = row.sourceSetorId ? (APP.state.moduleTransactions || []).find(x=>x.id===row.sourceSetorId && x.moduleType==='SETOR') : null;
        return {
          ...row,
          period: periodKey(row.date),
          depositDate: dep?.date || '',
          depositTime: dep?.time || '',
          depositNominal: Number(dep?.nominal || 0),
          targetSetor: Number(dep?.expectedSetor || 0),
          setorDate: setor?.date || row.date,
          setorTime: setor?.time || row.time,
          setorNotes: setor?.notes || '',
          depositNotes: dep?.notes || ''
        };
      })
      .filter(row => auditPassSearch(row, q))
      .sort((a,b)=>`${a.setorDate} ${a.setorTime} ${a.recipient}`.localeCompare(`${b.setorDate} ${b.setorTime} ${b.recipient}`));
  }

  function auditPostingSetoranSummary(rows){
    const map = new Map();
    rows.forEach(row=>{
      const key = row.baseId || '__UNKNOWN__';
      if(!map.has(key)) map.set(key, { baseName:row.baseName || 'Tanpa Base', total:0, count:0 });
      const item = map.get(key);
      item.total = roundMoney2(item.total + Number(row.setorNominal||0));
      item.count += 1;
    });
    return [...map.values()].sort((a,b)=>a.baseName.localeCompare(b.baseName));
  }

  function auditPostingProfitSummary(rows){
    const map = new Map();
    rows.forEach(row=>{
      const key = `${row.recipient}::${row.recipientLabel}`;
      if(!map.has(key)) map.set(key, { recipientType:row.recipient, recipientLabel:row.recipientLabel, total:0, count:0 });
      const item = map.get(key);
      item.total = roundMoney2(item.total + Number(row.nominal||0));
      item.count += 1;
    });
    return [...map.values()].sort((a,b)=>a.recipientLabel.localeCompare(b.recipientLabel));
  }

  function auditSummaryCards(setoranRows, profitRows, period){
    const setorTotal = setoranRows.reduce((s,x)=>roundMoney2(s + Number(x.setorNominal||0)), 0);
    const profitTotal = profitRows.reduce((s,x)=>roundMoney2(s + Number(x.nominal||0)), 0);
    const grossEqTotal = setoranRows.reduce((s,x)=>roundMoney2(s + Number(x.grossEquivalent||0)), 0);
    return `<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      ${card('Periode Audit', period || '-', 'Dasar tanggal setoran aktual', 'text-blue-600')}
      ${card('Setoran Akan Diposting', `Rp ${rupiah(setorTotal)}`, `${setoranRows.length} baris setoran/cicilan`, 'text-emerald-600')}
      ${card('Dasar Bagi Hasil', `Rp ${rupiah(grossEqTotal)}`, 'Ekuivalen deposit dari setoran aktual', 'text-indigo-600')}
      ${card('Bagi Hasil Akan Diposting', `Rp ${rupiah(profitTotal)}`, `${profitRows.length} baris penerima`, 'text-purple-600')}
    </div>`;
  }

  function auditFiltersSection(filters, periods){
    return `<section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 class="text-xl font-bold">Audit Posting Periodik</h2><p class="text-sm text-slate-500 dark:text-slate-400">Cek rincian setoran dan bagi hasil otomatis sebelum/ setelah diposting. Perhitungan mengikuti tanggal setoran aktual, bukan tanggal deposit.</p></div>
        <button id="auditOpenReportsBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">Ke Halaman Laporan</button>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Periode Setoran</span><select id="auditPeriod" class="w-full rounded-2xl border px-3 py-2">${periods.map(p=>`<option value="${p}" ${filters.period===p?'selected':''}>${p}</option>`).join('')}</select></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Base</span><select id="auditBase" class="w-full rounded-2xl border px-3 py-2">${baseOptionsHtml(filters.baseId)}</select></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Jenis Data</span><select id="auditKind" class="w-full rounded-2xl border px-3 py-2"><option value="ALL" ${filters.kind==='ALL'?'selected':''}>Setoran + Bagi Hasil</option><option value="SETOR" ${filters.kind==='SETOR'?'selected':''}>Setoran saja</option><option value="BAGIHASIL" ${filters.kind==='BAGIHASIL'?'selected':''}>Bagi Hasil saja</option></select></label>
        <label class="block text-sm"><span class="mb-1 block text-slate-500 dark:text-slate-400">Cari</span><input id="auditSearch" value="${escapeHtml(filters.search||'')}" placeholder="Cari base, pelaku, catatan, nominal" class="w-full rounded-2xl border px-3 py-2"></label>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Posting Setoran: diringkas per Base ke Transaksi Utama</span>
        <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Posting Bagi Hasil: diringkas per penerima ke Hutang Bagi Hasil</span>
        <button id="auditResetBtn" class="ml-auto rounded-2xl border px-3 py-2 text-xs font-semibold">Reset Audit</button>
      </div>
    </section>`;
  }

  function auditSetoranTable(rows, period){
    const grouped = auditPostingSetoranSummary(rows);
    return `<section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between"><div><h3 class="text-lg font-bold">Audit Setoran ke Transaksi Utama</h3><p class="text-sm text-slate-500 dark:text-slate-400">Baris di bawah adalah rincian setoran/cicilan periode ${escapeHtml(period || '-')}. Hasil posting akan dijumlahkan per Base.</p></div></div>
      <div class="mb-4 table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-right">Total Posting</th><th class="px-3 py-2 text-center">Jumlah Setoran</th><th class="px-3 py-2 text-left">Catatan Posting</th></tr></thead><tbody>${grouped.map(row=>`<tr class="border-b"><td class="px-3 py-2 font-semibold">${escapeHtml(row.baseName)}</td><td class="px-3 py-2 text-right font-bold text-emerald-600">Rp ${rupiah(row.total)}</td><td class="px-3 py-2 text-center">${row.count}</td><td class="px-3 py-2">Posting Setoran Modul periode ${escapeHtml(period)} · Base ${escapeHtml(row.baseName)} (${row.count} transaksi)</td></tr>`).join('') || '<tr><td colspan="4" class="px-3 py-8 text-center text-slate-500">Tidak ada setoran pada periode/filter ini.</td></tr>'}</tbody></table></div>
      <div class="table-wrap"><table class="min-w-full text-xs whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Setor</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-left">Tanggal Deposit</th><th class="px-3 py-2 text-right">Deposit</th><th class="px-3 py-2 text-right">Target Setor</th><th class="px-3 py-2 text-right">Setoran Ini</th><th class="px-3 py-2 text-right">Dibayar s/d Ini</th><th class="px-3 py-2 text-right">Sisa</th><th class="px-3 py-2 text-center">Cicilan</th><th class="px-3 py-2 text-left">Catatan</th></tr></thead><tbody>${rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.setorDate,row.setorTime)}</td><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2">${escapeHtml(row.actorName)}</td><td class="px-3 py-2">${row.depositDate ? formatDateTime(row.depositDate,row.depositTime) : '-'}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.depositNominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.targetSetor)}</td><td class="px-3 py-2 text-right font-semibold text-emerald-600">Rp ${rupiah(row.setorNominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.paidUntilThis)}</td><td class="px-3 py-2 text-right ${row.remainingAfterThis>0?'text-amber-600 font-semibold':'text-emerald-600 font-semibold'}">Rp ${rupiah(row.remainingAfterThis)}</td><td class="px-3 py-2 text-center">${row.cicilanKe}/${row.totalCicilan}</td><td class="px-3 py-2 max-w-[360px] whitespace-normal">${escapeHtml(row.setorNotes || row.depositNotes || '-')}</td></tr>`).join('') || '<tr><td colspan="11" class="px-3 py-8 text-center text-slate-500">Tidak ada rincian setoran.</td></tr>'}</tbody></table></div>
    </section>`;
  }

  function auditProfitTable(rows, period){
    const grouped = auditPostingProfitSummary(rows);
    return `<section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-3"><h3 class="text-lg font-bold">Audit Bagi Hasil Otomatis</h3><p class="text-sm text-slate-500 dark:text-slate-400">Bagi hasil dihitung dari setoran/cicilan periode ${escapeHtml(period || '-')}. Deposit boleh berbeda bulan; dasar perhitungan tetap mengikuti setoran yang masuk pada periode audit.</p></div>
      <div class="mb-4 table-wrap"><table class="min-w-full text-sm whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Penerima</th><th class="px-3 py-2 text-left">Tipe</th><th class="px-3 py-2 text-right">Total Bagi Hasil</th><th class="px-3 py-2 text-center">Jumlah Baris</th><th class="px-3 py-2 text-left">Catatan Posting</th></tr></thead><tbody>${grouped.map(row=>`<tr class="border-b"><td class="px-3 py-2 font-semibold">${escapeHtml(row.recipientLabel)}</td><td class="px-3 py-2">${escapeHtml(row.recipientType)}</td><td class="px-3 py-2 text-right font-bold text-purple-600">Rp ${rupiah(row.total)}</td><td class="px-3 py-2 text-center">${row.count}</td><td class="px-3 py-2">Bagi hasil ${escapeHtml(row.recipientLabel)} periode ${escapeHtml(period)} (${row.count} baris sumber setoran)</td></tr>`).join('') || '<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">Tidak ada bagi hasil pada periode/filter ini.</td></tr>'}</tbody></table></div>
      <div class="table-wrap"><table class="min-w-full text-xs whitespace-nowrap"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal Setor</th><th class="px-3 py-2 text-left">Base</th><th class="px-3 py-2 text-left">Pelaku</th><th class="px-3 py-2 text-left">Penerima</th><th class="px-3 py-2 text-right">Setoran</th><th class="px-3 py-2 text-right">Dasar Ekuivalen</th><th class="px-3 py-2 text-right">Bagi Hasil</th><th class="px-3 py-2 text-left">Deposit Asal</th><th class="px-3 py-2 text-left">Catatan</th></tr></thead><tbody>${rows.map(row=>`<tr class="border-b"><td class="px-3 py-2">${formatDateTime(row.setorDate,row.setorTime)}</td><td class="px-3 py-2">${escapeHtml(row.baseName)}</td><td class="px-3 py-2">${escapeHtml(row.actorName)}</td><td class="px-3 py-2"><span class="rounded-full bg-slate-100 px-2 py-1 font-semibold dark:bg-slate-800">${escapeHtml(row.recipientLabel)}</span></td><td class="px-3 py-2 text-right">Rp ${rupiah(row.setorNominal)}</td><td class="px-3 py-2 text-right">Rp ${rupiah(row.grossEquivalent)}</td><td class="px-3 py-2 text-right font-semibold text-purple-600">Rp ${rupiah(row.nominal)}</td><td class="px-3 py-2">${row.depositDate ? `${formatDateTime(row.depositDate,row.depositTime)} · Rp ${rupiah(row.depositNominal)}` : '-'}</td><td class="px-3 py-2 max-w-[380px] whitespace-normal">${escapeHtml(row.notes || '-')}</td></tr>`).join('') || '<tr><td colspan="9" class="px-3 py-8 text-center text-slate-500">Tidak ada rincian bagi hasil.</td></tr>'}</tbody></table></div>
    </section>`;
  }

  window.auditPage = function auditPage(){
    const filters = ensureAuditFilters();
    const periods = auditPeriodOptions();
    if(!periods.length){
      return `<div class="space-y-4"><section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900"><h2 class="text-xl font-bold">Audit Posting Periodik</h2><p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Belum ada data Deposit/Setoran untuk diaudit.</p></section></div>`;
    }
    const setoranRows = auditSetoranRows(filters);
    const profitRows = auditBagiHasilRows(filters);
    const showSetor = filters.kind === 'ALL' || filters.kind === 'SETOR';
    const showProfit = filters.kind === 'ALL' || filters.kind === 'BAGIHASIL';
    return `<div class="space-y-4">
      ${auditFiltersSection(filters, periods)}
      ${auditSummaryCards(setoranRows, profitRows, filters.period)}
      ${showSetor ? auditSetoranTable(setoranRows, filters.period) : ''}
      ${showProfit ? auditProfitTable(profitRows, filters.period) : ''}
    </div>`;
  };

  window.bindAuditEvents = function bindAuditEvents(){
    if(APP.state.currentPage !== 'audit') return;
    const f = ensureAuditFilters();
    const update = (key, value)=>{ f[key] = value; APP.state.auditFilters = f; render(); };
    document.getElementById('auditPeriod')?.addEventListener('change', e=>update('period', e.target.value));
    document.getElementById('auditBase')?.addEventListener('change', e=>update('baseId', e.target.value));
    document.getElementById('auditKind')?.addEventListener('change', e=>update('kind', e.target.value));
    document.getElementById('auditSearch')?.addEventListener('input', e=>{ f.search = e.target.value; APP.state.auditFilters = f; render(); });
    document.getElementById('auditResetBtn')?.addEventListener('click', ()=>{ APP.state.auditFilters = { period:auditPeriodOptions()[0] || '', baseId:'ALL', kind:'ALL', search:'' }; render(); });
    document.getElementById('auditOpenReportsBtn')?.addEventListener('click', ()=>{ APP.state.currentPage='reports'; APP.state.reportFilters.integrationPeriod = f.period || APP.state.reportFilters.integrationPeriod; render(); });
  };
})();
