const TZ = 'Asia/Jakarta';
const LOCAL_THEME_KEY = 'wifiHotspotTheme';
const SETTINGS_KEYS = { moduleConfig: 'moduleConfig' };
const BASE_MODES = {
  FULL: { label: 'Setor Penuh', note: 'Target setoran sama dengan nominal deposit/distribusi.' },
  NET: { label: 'Setor Bersih', note: 'Target setoran = nominal setelah share pelaku.' },
  PHYSICAL: { label: 'Voucher Fisik', note: 'Target setoran mengikuti nilai voucher setelah share pelaku.' }
};
const DEFAULT_SHARE = { baseDirect: 20, reseller: 10, baseFromReseller: 10, partner: 20, owner: 20 };
const MODULE_TYPES = {
  DEPOSIT: 'Deposit/Distribusi',
  SETOR: 'Setoran Masuk',
  PIUTANG: 'Piutang',
  BAGIHASIL: 'Bagi Hasil',
  BAGIHASIL_AUTO: 'Bagi Hasil Otomatis',
  PIUTANG_AUTO: 'Piutang Otomatis'
};
const RESERVE_ENTRY_TYPES = { CREDIT:'Tambah Saldo', DEBIT:'Penggunaan Dana' };
const PROFIT_RECIPIENTS = { ACTOR: 'Pelaku', OWNER: 'Owner/System', PARTNER: 'Partner/Technical' };

const APP = {
  navItems: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'main', label: 'Transaksi Utama', icon: '💵' },
    { key: 'modules', label: 'Modul Transaksi', icon: '🧩' },
    { key: 'reserve', label: 'Transaksi Cadangan', icon: '🏦' },
    { key: 'assets', label: 'Aset', icon: '🖥️' },
    { key: 'debts', label: 'Hutang', icon: '🧾' },
    { key: 'ipregister', label: 'Register IP AP', icon: '📡' },
    { key: 'reports', label: 'Laporan', icon: '📑' },
    { key: 'settings', label: 'Pengaturan', icon: '⚙️' }
  ],
  state: {
    currentPage: 'dashboard',
    theme: 'light',
    categories: [],
    mainTransactions: [],
    moduleTransactions: [],
    reserveTransactions: [],
    assets: [],
    debts: [],
    ipRegisters: [],
    ipRegisterLogs: [],
    config: null,
    mainFilters: { startDate:'', endDate:'', type:'ALL', search:'' },
    moduleFilters: { modStart:'', modEnd:'', baseId:'ALL', actorKey:'ALL', modSearch:'', depositSmart:'ALL', setorSmart:'ALL' },
    reportFilters: { mainStart:'', mainEnd:'', modStart:'', modEnd:'', baseId:'ALL', actorKey:'ALL', modSearch:'', depositSmart:'ALL', setorSmart:'ALL', integrationPeriod:'', integrationDate:todayDateIso(), integrationTime:currentTimeWIB() },
    reserveFilters: { startDate:'', endDate:'', fundType:'ALL', entryType:'ALL', search:'' },
    assetFilters: { startDate:'', endDate:'', search:'' },
    debtFilters: { startDate:'', endDate:'', status:'ALL', recipientType:'ALL', period:'', search:'' },
    ipFilters: { status:'ALL', locationKey:'ALL', search:'' },
    forms: {
      main: { type:'PENDAPATAN', categoryPath:[], amountRaw:0, notes:'', date:'', time:'' },
      module: { txType:'DEPOSIT', baseId:'', actorKey:'', recipient:'ACTOR', nominal:0, notes:'', date:'', time:'' },
      reserve: { fundType:'ZAKAT', entryType:'CREDIT', amountRaw:0, notes:'', date:'', time:'' }
    },
    editMainId: null,
    editModuleId: null,
    editReserveId: null,
    moduleTab: 'deposit',
    dashboardChart: { grouping:'monthly', selectedKey:'' }
  }
};
window.APP = APP;

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(str=''){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); }
function parseNum(value){ return Number(String(value ?? '').replace(/\D/g,'')) || 0; }
function roundMoney2(value){
  const n = Number(value || 0);
  if(!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function rupiah(value){
  const n = roundMoney2(value);
  return n.toLocaleString('id-ID', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
function nowParts(){
  const fmt = new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const p = fmt.formatToParts(new Date()).reduce((a,x)=>(a[x.type]=x.value,a),{});
  return { date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}:${p.second}`, display:`${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}` };
}
function todayDateIso(){ return nowParts().date; }
function currentTimeWIB(){ return nowParts().time; }
function formatDate(iso){ if(!iso) return '-'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function formatDateTime(date,time){ return `${formatDate(date)} ${time||'00:00:00'}`; }
function showToast(message, type='success'){
  const wrap = document.getElementById('toastContainer');
  const classes = { success:'bg-emerald-600 text-white', error:'bg-rose-600 text-white', info:'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' };
  const el = document.createElement('div');
  el.className = `rounded-2xl px-4 py-3 shadow-soft transition ${classes[type]||classes.info}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(()=>{ el.classList.add('opacity-0','translate-x-3'); setTimeout(()=>el.remove(),250); }, 2500);
}
function getLocalTheme(){
  try {
    const saved = localStorage.getItem(LOCAL_THEME_KEY);
    if(saved === 'dark' || saved === 'light') return saved;
  } catch(_) {}
  return 'light';
}
function getConfig(){ return normalizeConfig(APP.state.config || defaultConfig()); }
function applyTheme(theme){
  APP.state.theme = theme === 'dark' ? 'dark' : 'light';
  const isDark = APP.state.theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.setAttribute('data-theme', APP.state.theme);
  document.body?.classList.toggle('dark', isDark);
  try { localStorage.setItem(LOCAL_THEME_KEY, APP.state.theme); } catch(_) {}
  const btn = document.getElementById('themeToggle');
  const t = document.getElementById('themeText');
  const i = document.getElementById('themeIcon');
  if(btn){
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('title', isDark ? 'Ubah ke Light Mode' : 'Ubah ke Dark Mode');
  }
  if(t) t.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  if(i) i.textContent = isDark ? '🌙' : '🌞';
}
function defaultConfig(){
  return {
    ownerName:'System', partnerName:'Technical',
    bases:[
      { id:uuid(), name:'Orbit', mode:'FULL', directEnabled:true, shares:{...DEFAULT_SHARE}, resellers:[{id:uuid(),name:'Wendy'},{id:uuid(),name:'NgahDon'}] },
      { id:uuid(), name:'Kenelang', mode:'NET', directEnabled:true, shares:{...DEFAULT_SHARE}, resellers:[] }
    ]
  };
}
function normalizeConfig(config){
  const safe = structuredClone(config || defaultConfig());
  safe.ownerName ||= 'System'; safe.partnerName ||= 'Technical'; safe.bases = Array.isArray(safe.bases) ? safe.bases : [];
  safe.bases = safe.bases.map(base => ({
    id: base.id || uuid(), name: base.name || 'Base', mode: BASE_MODES[base.mode] ? base.mode : 'FULL', directEnabled: base.directEnabled !== false,
    shares: {
      baseDirect: Number(base?.shares?.baseDirect ?? DEFAULT_SHARE.baseDirect), reseller: Number(base?.shares?.reseller ?? DEFAULT_SHARE.reseller),
      baseFromReseller: Number(base?.shares?.baseFromReseller ?? DEFAULT_SHARE.baseFromReseller),
      partner: Number(base?.shares?.partner ?? DEFAULT_SHARE.partner), owner: Number(base?.shares?.owner ?? DEFAULT_SHARE.owner)
    },
    resellers: (Array.isArray(base.resellers) ? base.resellers : []).map(res => ({ id: res.id || uuid(), name: res.name || 'Reseller' }))
  }));
  return safe;
}
function categoryChildren(type, parentId='ROOT'){ return APP.state.categories.filter(x => x.type===type && (x.parentId||'ROOT')===parentId).sort((a,b)=>a.name.localeCompare(b.name)); }
function categoryById(id){ return APP.state.categories.find(x=>x.id===id) || null; }
function categoryPathNames(path=[]){ return path.map(id => categoryById(id)?.name || '-'); }
function findBase(baseId){ return APP.state.config?.bases?.find(x => x.id === baseId) || null; }
function findReseller(base,resellerId){ return (base?.resellers||[]).find(x=>x.id===resellerId) || null; }
function actorKey(baseId,resellerId){ return resellerId ? `${baseId}::${resellerId}` : `${baseId}::DIRECT`; }
function actorLabel(base,resellerId){ return resellerId ? (findReseller(base,resellerId)?.name || 'Reseller') : (base?.name || '-'); }
function actorSharePct(base,resellerId){ return resellerId ? Number(base?.shares?.reseller||0) : Number(base?.shares?.baseDirect||0); }
function expectedSetorAmount(base, nominal, resellerId){ const gross = Number(nominal||0); if(!base) return 0; if(base.mode === 'FULL') return gross; return Math.max(0, gross - (gross * actorSharePct(base,resellerId) / 100)); }

function hasExpenseAssetCategory(categories){
  return (categories || []).some(x => x.type==='PENGELUARAN' && String(x.name||'').trim().toLowerCase()==='aset');
}

async function seedIfNeeded(){
  if (!await DB.get(STORES.settings, SETTINGS_KEYS.moduleConfig)) {
    await DB.put(STORES.settings, { key: SETTINGS_KEYS.moduleConfig, value: defaultConfig() });
  }

  // bersihkan legacy theme dari settings lokal agar tidak ikut sync lagi
  try { await DB.delete(STORES.settings, 'theme'); } catch(_) {}
  const cats = await DB.getAll(STORES.categories);
  if(cats.length && !hasExpenseAssetCategory(cats)){
    await DB.put(STORES.categories, { id:uuid(), type:'PENGELUARAN', name:'Aset', parentId:'ROOT' });
  }
  if (!cats.length) {
    const danaCadanganId = uuid();
    const seed = [
      { id:uuid(), type:'PENDAPATAN', name:'Penjualan', parentId:'ROOT' }, { id:uuid(), type:'PENDAPATAN', name:'Pendapatan Lain', parentId:'ROOT' },
      { id:uuid(), type:'PENGELUARAN', name:'Operasional', parentId:'ROOT' }, { id:uuid(), type:'PENGELUARAN', name:'Pembelian', parentId:'ROOT' },
      { id:uuid(), type:'PENGELUARAN', name:'Aset', parentId:'ROOT' },
      { id:uuid(), type:'PENDAPATAN', name:'Rekap Base/Reseller', parentId:'ROOT' },
      { id:uuid(), type:'PENGELUARAN', name:'Bagi Hasil', parentId:'ROOT' },
      { id:danaCadanganId, type:'PENGELUARAN', name:'Dana Cadangan', parentId:'ROOT' },
      { id:uuid(), type:'PENGELUARAN', name:'Zakat', parentId:danaCadanganId },
      { id:uuid(), type:'PENGELUARAN', name:'Infaq', parentId:danaCadanganId },
      { id:uuid(), type:'PENGELUARAN', name:'Penyusutan', parentId:danaCadanganId }
    ];
    for (const item of seed) await DB.put(STORES.categories, item);
  }
}
async function loadState(){
  const settings = await DB.getAll(STORES.settings);
  APP.state.theme = getLocalTheme();
  APP.state.config = normalizeConfig(settings.find(x=>x.key===SETTINGS_KEYS.moduleConfig)?.value || defaultConfig());
  APP.state.categories = await DB.getAll(STORES.categories);
  APP.state.mainTransactions = (await DB.getAll(STORES.mainTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  APP.state.moduleTransactions = (await DB.getAll(STORES.moduleTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  APP.state.reserveTransactions = (await DB.getAll(STORES.reserveTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  APP.state.assets = (await DB.getAll(STORES.assets)).sort((a,b)=>`${b.assetDate || ''} ${b.createdAt || ''}`.localeCompare(`${a.assetDate || ''} ${a.createdAt || ''}`));
  APP.state.debts = (await DB.getAll(STORES.debts)).sort((a,b)=>`${b.debtDate || ''} ${b.debtTime || ''}`.localeCompare(`${a.debtDate || ''} ${a.debtTime || ''}`));
  APP.state.ipRegisters = (await DB.getAll(STORES.ipRegisters)).sort((a,b)=>String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  APP.state.ipRegisterLogs = (await DB.getAll(STORES.ipRegisterLogs)).sort((a,b)=>`${b.eventDate || ''} ${b.eventTime || ''}`.localeCompare(`${a.eventDate || ''} ${a.eventTime || ''}`));
  if(!APP.state.forms.main.date) resetMainForm();
  if(!APP.state.forms.module.date) resetModuleForm();
  if(!APP.state.forms.reserve.date && typeof resetReserveForm === 'function') resetReserveForm();
}
function card(title, value, subtitle='', accent='text-slate-900 dark:text-white'){ return `<div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900"><p class="text-sm text-slate-500 dark:text-slate-400">${title}</p><p class="mt-2 text-2xl font-bold ${accent}">${value}</p><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">${subtitle}</p></div>`; }

function addDaysIso(date, days){
  if(!date) return '';
  const [y,m,d] = String(date).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m||1)-1, d||1));
  dt.setUTCDate(dt.getUTCDate() + Number(days||0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  return `${yy}-${mm}-${dd}`;
}
function endDateBefore(startDate=''){ return startDate ? addDaysIso(startDate, -1) : ''; }
function isoMonthLabel(iso=''){
  if(!iso) return '-';
  const [y,m] = String(iso).split('-');
  const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${names[Number(m||1)-1] || m} ${y}`;
}
function formatRangeLabel(start='', end=''){
  if(start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  if(start) return `Mulai ${formatDate(start)}`;
  if(end) return `Sampai ${formatDate(end)}`;
  return 'Semua Periode';
}
function startOfWeekIso(date=''){
  if(!date) return '';
  const [y,m,d] = String(date).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m||1)-1, d||1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - day + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  return `${yy}-${mm}-${dd}`;
}
function endOfWeekIso(date=''){ return addDaysIso(startOfWeekIso(date), 6); }
function weekLabel(start=''){
  const end = endOfWeekIso(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}
function quarterOfMonth(month){ return Math.floor((Number(month||1)-1)/3)+1; }
function balanceReserveAt(end=''){
  const reserveFilters = { startDate:'', endDate:end || '', fundType:'ALL', entryType:'ALL', search:'' };
  return typeof reserveSummaryByFund === 'function' ? reserveSummaryByFund(reserveFilters) : { total:{ balance:0 }, funds:{} };
}
function receivableSnapshotAt(end=''){
  /*
    PATCH 2026-05-03 - Dashboard Piutang harus tally dengan tabel Deposit/Setoran.
    Rumus lama menjumlahkan DEPOSIT lalu mengurangi SETOR per aktor berdasarkan tanggal transaksi.
    Ini bisa meleset ketika setoran berupa cicilan/linkedDepositId, ada beberapa deposit pada aktor yang sama,
    atau tanggal setoran berbeda dengan tanggal deposit.

    Rumus baru dibuat deposit-centric:
    1. Ambil hanya DEPOSIT yang tanggalnya <= akhir periode dashboard.
    2. Untuk setiap DEPOSIT, hitung SETOR yang benar-benar terhubung melalui linkedDepositId.
    3. Jika dashboard memakai akhir periode, hanya SETOR sampai tanggal akhir periode yang mengurangi piutang.
    4. Piutang = max(0, expectedSetor deposit - total setoran terhubung).
    Dengan cara ini angka dashboard sama dengan logika tabel Setoran/Piutang di Modul Transaksi.
  */
  const cutoff = end || '';
  const deposits = (APP.state.moduleTransactions || [])
    .filter(tx => tx.moduleType === 'DEPOSIT')
    .filter(tx => !cutoff || String(tx.date || '') <= cutoff);

  const setorsByDeposit = new Map();
  for(const tx of (APP.state.moduleTransactions || [])){
    if(tx.moduleType !== 'SETOR' || !tx.linkedDepositId) continue;
    if(cutoff && String(tx.date || '') > cutoff) continue;
    const key = tx.linkedDepositId;
    if(!setorsByDeposit.has(key)) setorsByDeposit.set(key, []);
    setorsByDeposit.get(key).push(tx);
  }

  const actorMap = new Map();
  const depositDetail = [];

  for(const dep of deposits){
    const base = findBase(dep.baseId);
    if(!base) continue;
    const key = dep.actorKey || actorKey(dep.baseId, dep.resellerId || '');
    const target = Number(dep.expectedSetor || 0);
    const paid = (setorsByDeposit.get(dep.id) || []).reduce((sum, setor)=>sum + Number(setor.nominal || 0), 0);
    const receivable = roundMoney2(Math.max(0, target - paid));
    if(receivable <= 0) continue;

    depositDetail.push({
      depositId: dep.id,
      actorKey: key,
      baseId: dep.baseId,
      baseName: base.name,
      actorName: actorLabel(base, dep.resellerId || ''),
      target,
      paid: roundMoney2(paid),
      receivable,
      date: dep.date,
      time: dep.time
    });

    if(!actorMap.has(key)){
      actorMap.set(key, {
        actorKey: key,
        baseId: dep.baseId,
        baseName: base.name,
        actorName: actorLabel(base, dep.resellerId || ''),
        receivable: 0,
        deposits: 0
      });
    }
    const row = actorMap.get(key);
    row.receivable = roundMoney2(Number(row.receivable || 0) + receivable);
    row.deposits += 1;
  }

  const detail = [...actorMap.values()]
    .filter(r => Number(r.receivable || 0) > 0)
    .sort((a,b)=>Number(b.receivable||0)-Number(a.receivable||0) || a.baseName.localeCompare(b.baseName) || a.actorName.localeCompare(b.actorName));

  const baseMap = new Map();
  for(const row of detail){
    const key = row.baseId || '__NOBASE__';
    if(!baseMap.has(key)) baseMap.set(key, { baseId:key, baseName:row.baseName || 'Tanpa Base', receivable:0, actors:0, deposits:0 });
    const item = baseMap.get(key);
    item.receivable = roundMoney2(Number(item.receivable || 0) + Number(row.receivable || 0));
    item.actors += 1;
    item.deposits += Number(row.deposits || 0);
  }

  const perBase = [...baseMap.values()]
    .sort((a,b)=>Number(b.receivable||0)-Number(a.receivable||0) || a.baseName.localeCompare(b.baseName));

  return {
    detail,
    depositDetail: depositDetail.sort((a,b)=>Number(b.receivable||0)-Number(a.receivable||0) || `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`)),
    perBase,
    total: roundMoney2(perBase.reduce((s,x)=>s+Number(x.receivable||0),0))
  };
}
function cashSnapshotAt(end=''){
  const mainRows = [...APP.state.mainTransactions].filter(x => !end || x.date <= end);
  const pendapatan = mainRows.filter(x=>x.type==='PENDAPATAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const pengeluaran = mainRows.filter(x=>x.type==='PENGELUARAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const saldoUtama = pendapatan - pengeluaran;
  const reserve = balanceReserveAt(end);
  const receivable = receivableSnapshotAt(end);
  const saldoAkhir = saldoUtama + Number(reserve.total?.balance || 0) + Number(receivable.total || 0);
  return { end, pendapatan, pengeluaran, saldoUtama, reserve, receivable, saldoAkhir };
}
function buildDashboardBalanceInfo(){
  const start = APP.state.mainFilters.startDate || '';
  const end = APP.state.mainFilters.endDate || '';
  const openingEnd = endDateBefore(start);
  const opening = cashSnapshotAt(openingEnd);
  const ending = cashSnapshotAt(end);
  return {
    start, end, openingEnd,
    opening, ending,
    delta: {
      pendapatan: Number(ending.pendapatan||0) - Number(opening.pendapatan||0),
      pengeluaran: Number(ending.pengeluaran||0) - Number(opening.pengeluaran||0),
      saldoUtama: Number(ending.saldoUtama||0) - Number(opening.saldoUtama||0),
      reserve: Number(ending.reserve.total?.balance||0) - Number(opening.reserve.total?.balance||0),
      piutang: Number(ending.receivable.total||0) - Number(opening.receivable.total||0),
      saldoAkhir: Number(ending.saldoAkhir||0) - Number(opening.saldoAkhir||0)
    }
  };
}
function chartBucketMeta(grouping, date){
  const [y,m,d] = String(date||'').split('-');
  if(grouping === 'daily') return { key:date, label:formatDate(date), start:date, end:date, sortKey:date };
  if(grouping === 'weekly'){
    const start = startOfWeekIso(date); const end = endOfWeekIso(date);
    return { key:start, label:weekLabel(start), start, end, sortKey:start };
  }
  if(grouping === 'yearly') return { key:y, label:String(y), start:`${y}-01-01`, end:`${y}-12-31`, sortKey:`${y}-01-01` };
  return { key:`${y}-${m}`, label:isoMonthLabel(`${y}-${m}`), start:`${y}-${m}-01`, end:`${y}-${m}-31`, sortKey:`${y}-${m}-01` };
}
function buildCashflowChartData(){
  const grouping = APP.state.dashboardChart?.grouping || 'monthly';
  const start = APP.state.mainFilters.startDate || '';
  const end = APP.state.mainFilters.endDate || '';
  const rows = [...APP.state.mainTransactions]
    .filter(x => !start || x.date >= start)
    .filter(x => !end || x.date <= end)
    .sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const map = new Map();
  for(const tx of rows){
    const meta = chartBucketMeta(grouping, tx.date);
    if(!map.has(meta.key)) map.set(meta.key, { ...meta, pendapatan:0, pengeluaran:0, saldoBersih:0, count:0, rows:[] });
    const item = map.get(meta.key);
    const amount = Number(tx.amount||0);
    if(tx.type === 'PENDAPATAN') item.pendapatan += amount;
    else item.pengeluaran += amount;
    item.saldoBersih = item.pendapatan - item.pengeluaran;
    item.count += 1;
    item.rows.push(tx);
  }
  const buckets = [...map.values()].sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
  const maxVal = Math.max(1, ...buckets.flatMap(x=>[Number(x.pendapatan||0), Number(x.pengeluaran||0), Math.abs(Number(x.saldoBersih||0))]));
  if(!APP.state.dashboardChart.selectedKey && buckets.length) APP.state.dashboardChart.selectedKey = buckets[buckets.length-1].key;
  if(APP.state.dashboardChart.selectedKey && !buckets.some(x=>x.key===APP.state.dashboardChart.selectedKey)) APP.state.dashboardChart.selectedKey = buckets[0]?.key || '';
  const selected = buckets.find(x=>x.key===APP.state.dashboardChart.selectedKey) || null;
  return { grouping, start, end, buckets, maxVal, selected };
}
function cashflowBars(value, maxVal, tone, title=''){
  const pct = Math.max(3, Math.round((Math.abs(Number(value||0)) / Math.max(1, Number(maxVal||1))) * 100));
  return `<div class="flex items-end gap-1 h-28"><div class="cash-bar ${tone}" title="${escapeHtml(title)}" style="height:${pct}%"></div></div>`;
}
function cashflowChartSection(){
  const chart = buildCashflowChartData();
  return `
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div><h3 class="text-lg font-bold">Grafik Arus Kas</h3><p class="text-sm text-slate-500 dark:text-slate-400">Klik kelompok batang untuk melihat tabel detail transaksi.</p></div>
        <div class="flex flex-wrap gap-2">
          ${[['daily','Harian'],['weekly','Mingguan'],['monthly','Bulanan'],['yearly','Tahunan']].map(([key,label])=>`<button data-cashflow-grouping="${key}" data-active="${chart.grouping===key}" class="type-btn rounded-2xl border px-4 py-2 text-sm font-semibold">${label}</button>`).join('')}
        </div>
      </div>
      <div class="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">Periode grafik: ${escapeHtml(formatRangeLabel(chart.start, chart.end))} · Menampilkan Pendapatan, Pengeluaran, dan Netto dari transaksi utama.</div>
      <div class="mt-4 overflow-x-auto pb-2">
        <div class="flex min-w-max items-end gap-3">
          ${chart.buckets.map(item=>`<button data-cashflow-bucket="${item.key}" class="cashflow-bucket ${chart.selected?.key===item.key?'is-selected':''}"><div class="cashflow-bars">${cashflowBars(item.pendapatan, chart.maxVal, 'bar-in', `Pendapatan Rp ${rupiah(item.pendapatan)}`)}${cashflowBars(item.pengeluaran, chart.maxVal, 'bar-out', `Pengeluaran Rp ${rupiah(item.pengeluaran)}`)}${cashflowBars(item.saldoBersih, chart.maxVal, item.saldoBersih>=0?'bar-net-plus':'bar-net-minus', `Netto Rp ${rupiah(item.saldoBersih)}`)}</div><div class="mt-2 text-center"><div class="text-xs font-semibold">${escapeHtml(item.label)}</div><div class="text-[11px] text-slate-500 dark:text-slate-400">${item.count} trx · Netto Rp ${rupiah(item.saldoBersih)}</div></div></button>`).join('') || '<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Belum ada data transaksi utama pada periode ini.</div>'}
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400"><span class="inline-flex items-center gap-2"><span class="legend-dot legend-in"></span>Pendapatan</span><span class="inline-flex items-center gap-2"><span class="legend-dot legend-out"></span>Pengeluaran</span><span class="inline-flex items-center gap-2"><span class="legend-dot legend-net"></span>Netto</span></div>
      ${chart.selected ? `<div class="mt-6"><div class="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div><h4 class="text-base font-bold">Detail ${escapeHtml(chart.selected.label)}</h4><p class="text-sm text-slate-500 dark:text-slate-400">Periode ${formatDate(chart.selected.start)} s.d. ${formatDate(chart.selected.end)}</p></div><div class="grid grid-cols-1 gap-2 sm:grid-cols-3">${card('Pendapatan', `Rp ${rupiah(chart.selected.pendapatan)}`, `${chart.selected.rows.filter(x=>x.type==='PENDAPATAN').length} transaksi`, 'text-emerald-600')}${card('Pengeluaran', `Rp ${rupiah(chart.selected.pengeluaran)}`, `${chart.selected.rows.filter(x=>x.type==='PENGELUARAN').length} transaksi`, 'text-rose-600')}${card('Netto', `Rp ${rupiah(chart.selected.saldoBersih)}`, `${chart.selected.count} transaksi`, chart.selected.saldoBersih>=0?'text-blue-600':'text-amber-600')}</div></div><div class="table-wrap"><table class="min-w-full text-sm"><thead><tr class="border-b"><th class="px-3 py-2 text-left">Tanggal</th><th class="px-3 py-2 text-left">Jenis</th><th class="px-3 py-2 text-left">Kategori</th><th class="px-3 py-2 text-right">Nominal</th><th class="px-3 py-2 text-left">Keterangan</th></tr></thead><tbody>${chart.selected.rows.slice().sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).map(tx=>`<tr class="border-b"><td class="px-3 py-2 whitespace-nowrap">${formatDateTime(tx.date, tx.time)}</td><td class="px-3 py-2"><span class="badge ${tx.type==='PENDAPATAN'?'badge-emerald':'badge-rose'}">${tx.type}</span></td><td class="px-3 py-2">${escapeHtml((tx.categoryPathNames||[]).join(' > ') || '-')}</td><td class="px-3 py-2 text-right font-semibold">Rp ${rupiah(tx.amount)}</td><td class="px-3 py-2">${escapeHtml(tx.notes||'-')}</td></tr>`).join('') || '<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">Tidak ada detail.</td></tr>'}</tbody></table></div></div>` : ''}
    </section>`;
}
function emptyState(text){ return `<div class="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">${text}</div>`; }

function isMobileViewport(){ return window.matchMedia('(max-width: 1023.98px)').matches; }
function closeMobileNav(){
  APP.state.mobileNavOpen = false;
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('mobileNavOverlay');
  const toggle = document.getElementById('mobileNavToggle');
  if(sidebar) sidebar.classList.remove('is-open');
  if(overlay){ overlay.hidden = true; overlay.classList.remove('is-open'); }
  if(toggle) toggle.setAttribute('aria-expanded', 'false');
}
function openMobileNav(){
  APP.state.mobileNavOpen = true;
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('mobileNavOverlay');
  const toggle = document.getElementById('mobileNavToggle');
  if(sidebar) sidebar.classList.add('is-open');
  if(overlay){ overlay.hidden = false; overlay.classList.add('is-open'); }
  if(toggle) toggle.setAttribute('aria-expanded', 'true');
}
function syncMobileNavUi(){
  if(!isMobileViewport()) return closeMobileNav();
  if(APP.state.mobileNavOpen) openMobileNav();
  else closeMobileNav();
}

function renderNav(){
  const nav = document.getElementById('navMenu');
  nav.innerHTML = APP.navItems.map(item => `<button data-page="${item.key}" data-active="${item.key===APP.state.currentPage}" class="nav-btn flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${item.key===APP.state.currentPage ? '' : 'border-transparent'}"><span>${item.icon}</span><span>${item.label}</span></button>`).join('');
  nav.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click',()=>{ APP.state.currentPage = btn.dataset.page; if(isMobileViewport()) closeMobileNav(); render(); }));
}
function dashboardPage(){
  const main = getFilteredMainTransactions();
  const moduleAuto = aggregateModuleReport();
  const balanceInfo = buildDashboardBalanceInfo();
  const opening = balanceInfo.opening;
  const ending = balanceInfo.ending;
  const piutangRows = ending.receivable.perBase || [];
  const totalPiutang = Number(ending.receivable.total || 0);
  const autoBagiHasil = Number(moduleAuto.grand.actorShare||0) + Number(moduleAuto.grand.baseShare||0) + Number(moduleAuto.grand.ownerShare||0) + Number(moduleAuto.grand.partnerShare||0);
  const filteredCount = main.length;
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 class="text-xl font-bold">Dashboard</h2><p class="text-sm text-slate-500 dark:text-slate-400">Ringkasan transaksi utama, dana cadangan, piutang base, dan arus kas.</p></div>
        <div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/80"><div><span class="font-semibold">Technical:</span> ${escapeHtml(getConfig().partnerName)}</div><div><span class="font-semibold">System:</span> ${escapeHtml(getConfig().ownerName)}</div></div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4"><h3 class="text-lg font-bold">Filter Dashboard</h3><p class="text-sm text-slate-500 dark:text-slate-400">Tanggal dipakai untuk posisi kas periodik dan grafik arus kas. Filter jenis dan pencarian tetap mempengaruhi daftar transaksi terfilter.</p></div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input id="dashboardMainFilterStart" type="date" value="${APP.state.mainFilters.startDate}" class="rounded-2xl border px-3 py-2">
        <input id="dashboardMainFilterEnd" type="date" value="${APP.state.mainFilters.endDate}" class="rounded-2xl border px-3 py-2">
        <select id="dashboardMainFilterType" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Jenis</option><option value="PENDAPATAN" ${APP.state.mainFilters.type==='PENDAPATAN'?'selected':''}>PENDAPATAN</option><option value="PENGELUARAN" ${APP.state.mainFilters.type==='PENGELUARAN'?'selected':''}>PENGELUARAN</option></select>
        <input id="dashboardMainFilterSearch" type="text" value="${escapeHtml(APP.state.mainFilters.search)}" placeholder="Cari kategori/keterangan/nominal" class="rounded-2xl border px-3 py-2">
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">${filteredCount} transaksi utama sesuai filter</span>
        <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Posisi kas: ${escapeHtml(formatRangeLabel(balanceInfo.start, balanceInfo.end))}</span>
        ${(APP.state.mainFilters.startDate || APP.state.mainFilters.endDate || APP.state.mainFilters.type !== 'ALL' || APP.state.mainFilters.search) ? '<button id="dashboardClearMainFilters" class="rounded-full border px-3 py-1 font-semibold text-slate-700 dark:text-slate-200">Reset Filter</button>' : ''}
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">Informasi Saldo Periodik</h3><p class="text-sm text-slate-500 dark:text-slate-400">Posisi kas dihitung kumulatif sampai akhir periode yang dipilih, sehingga saldo pembuka dan saldo akhir bisa dibandingkan.</p></div></div>
      <div class="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950/50">
        <div><span class="font-semibold">Saldo sebelum periode:</span> ${balanceInfo.start ? `setara saldo akhir ${formatDate(balanceInfo.openingEnd)}` : 'awal data'}</div>
        <div><span class="font-semibold">Saldo akhir periode:</span> ${balanceInfo.end ? `sampai ${formatDate(balanceInfo.end)}` : 'sampai seluruh data saat ini'}</div>
      </div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          ${card('Saldo Sebelum Periode', `Rp ${rupiah(opening.saldoAkhir)}`, `Utama Rp ${rupiah(opening.saldoUtama)} · Cadangan Rp ${rupiah(opening.reserve.total?.balance || 0)} · Piutang Rp ${rupiah(opening.receivable.total || 0)}`, opening.saldoAkhir>=0?'text-blue-600':'text-amber-600')}
          ${card('Mutasi Saldo Periode', `Rp ${rupiah(balanceInfo.delta.saldoAkhir)}`, `Pendapatan Rp ${rupiah(balanceInfo.delta.pendapatan)} · Pengeluaran Rp ${rupiah(balanceInfo.delta.pengeluaran)}`, balanceInfo.delta.saldoAkhir>=0?'text-emerald-600':'text-rose-600')}
          ${card('Saldo Akhir Periode', `Rp ${rupiah(ending.saldoAkhir)}`, 'Saldo Utama + Dana Cadangan + Piutang', ending.saldoAkhir>=0?'text-emerald-600':'text-rose-600')}
          ${card('Saldo Utama', `Rp ${rupiah(ending.saldoUtama)}`, `Sebelum periode Rp ${rupiah(opening.saldoUtama)} · Mutasi Rp ${rupiah(balanceInfo.delta.saldoUtama)}`, ending.saldoUtama>=0?'text-blue-600':'text-amber-600')}
          ${card('Dana Cadangan', `Rp ${rupiah(ending.reserve.total?.balance || 0)}`, `Sebelum periode Rp ${rupiah(opening.reserve.total?.balance || 0)} · Mutasi Rp ${rupiah(balanceInfo.delta.reserve)}`, 'text-violet-600')}
          ${card('Total Piutang Base', `Rp ${rupiah(totalPiutang)}`, `Sebelum periode Rp ${rupiah(opening.receivable.total || 0)} · Selisih Rp ${rupiah(balanceInfo.delta.piutang)}`, totalPiutang>0?'text-amber-600':'text-emerald-600')}
          ${card('Zakat', `Rp ${rupiah(ending.reserve.funds?.ZAKAT?.balance || 0)}`, `Saldo awal Rp ${rupiah(opening.reserve.funds?.ZAKAT?.balance || 0)}`, 'text-violet-600')}
          ${card('Infaq', `Rp ${rupiah(ending.reserve.funds?.INFAQ?.balance || 0)}`, `Saldo awal Rp ${rupiah(opening.reserve.funds?.INFAQ?.balance || 0)}`, 'text-violet-600')}
          ${card('Penyusutan', `Rp ${rupiah(ending.reserve.funds?.PENYUSUTAN?.balance || 0)}`, `Saldo awal Rp ${rupiah(opening.reserve.funds?.PENYUSUTAN?.balance || 0)}`, 'text-violet-600')}
        </div>
        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <h4 class="text-base font-bold">Rincian Piutang per Base</h4>
          <div class="mt-3 space-y-3">
            ${piutangRows.map(row=>`<div class="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div class="flex items-start justify-between gap-3"><div><p class="font-semibold">${escapeHtml(row.baseName)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${row.actors} akun masih piutang</p></div><div class="text-right font-bold text-amber-600">Rp ${rupiah(row.receivable)}</div></div></div>`).join('') || '<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Tidak ada piutang per base.</div>'}
          </div>
        </div>
      </div>
    </section>

    ${cashflowChartSection()}

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-lg font-bold">Ringkasan Modul</h3>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
          ${card('Deposit', `Rp ${rupiah(moduleAuto.grand.gross)}`, `${moduleAuto.grand.deposits} transaksi`, 'text-emerald-600')}
          ${card('Setoran Modul', `Rp ${rupiah(moduleAuto.grand.actual)}`, `${moduleAuto.grand.setors} transaksi`, 'text-indigo-600')}
          ${card('Piutang Otomatis', `Rp ${rupiah(totalPiutang)}`, 'Dari selisih deposit vs setoran', totalPiutang>0?'text-amber-600':'text-emerald-600')}
          ${card('Bagi Hasil Otomatis', `Rp ${rupiah(autoBagiHasil)}`, 'Dihitung dari nilai deposit', 'text-purple-600')}
        </div>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <h3 class="text-lg font-bold">Transaksi Utama Terbaru</h3>
        <div class="mt-3 space-y-3">${main.slice(0,5).map(tx=>`<div class="rounded-2xl border border-slate-200 p-3 dark:border-slate-700"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">${escapeHtml((tx.categoryPathNames||[]).join(' > ') || '-')}</p><p class="text-xs text-slate-500 dark:text-slate-400">${formatDateTime(tx.date,tx.time)} · ${tx.type}</p></div><div class="font-bold ${tx.type==='PENDAPATAN'?'text-emerald-600':'text-rose-600'}">Rp ${rupiah(tx.amount)}</div></div></div>`).join('') || '<p class="text-sm text-slate-500">Belum ada transaksi utama.</p>'}</div>
      </div>
    </section>
  </div>`;
}
function bindPersistentUiEvents(){
  const btn = document.getElementById('themeToggle');
  if(btn && !btn.dataset.boundThemeToggle){
    btn.dataset.boundThemeToggle = '1';
    btn.addEventListener('click', ()=>{
      const next = APP.state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      render();
    });
  }
  const mobileToggle = document.getElementById('mobileNavToggle');
  if(mobileToggle && !mobileToggle.dataset.boundMobileNav){
    mobileToggle.dataset.boundMobileNav = '1';
    mobileToggle.addEventListener('click', ()=>{
      if(APP.state.mobileNavOpen) closeMobileNav();
      else openMobileNav();
    });
  }
  const overlay = document.getElementById('mobileNavOverlay');
  if(overlay && !overlay.dataset.boundMobileNav){
    overlay.dataset.boundMobileNav = '1';
    overlay.addEventListener('click', ()=> closeMobileNav());
  }
  if(!window.__wifiMobileNavResizeBound){
    window.__wifiMobileNavResizeBound = true;
    window.addEventListener('resize', ()=> syncMobileNavUi());
  }
}
function bindCoreEvents(){
  document.getElementById('dashboardMainFilterStart')?.addEventListener('change', e=>{ APP.state.mainFilters.startDate=e.target.value; render(); });
  document.getElementById('dashboardMainFilterEnd')?.addEventListener('change', e=>{ APP.state.mainFilters.endDate=e.target.value; render(); });
  document.getElementById('dashboardMainFilterType')?.addEventListener('change', e=>{ APP.state.mainFilters.type=e.target.value; render(); });
  document.getElementById('dashboardMainFilterSearch')?.addEventListener('input', e=>{ APP.state.mainFilters.search=e.target.value; scheduleRender({ preserveInputId:'dashboardMainFilterSearch', preserveCursor:true }); });
  document.getElementById('dashboardClearMainFilters')?.addEventListener('click', ()=>{ APP.state.mainFilters = { startDate:'', endDate:'', type:'ALL', search:'' }; APP.state.dashboardChart.selectedKey=''; render(); });
  document.querySelectorAll('[data-cashflow-grouping]').forEach(btn => btn.addEventListener('click', ()=>{ APP.state.dashboardChart.grouping = btn.dataset.cashflowGrouping || 'monthly'; APP.state.dashboardChart.selectedKey=''; render(); }));
  document.querySelectorAll('[data-cashflow-bucket]').forEach(btn => btn.addEventListener('click', ()=>{ APP.state.dashboardChart.selectedKey = btn.dataset.cashflowBucket || ''; render(); }));
}
function updateClock(){ const el = document.getElementById('clockBadge'); if(el) el.textContent = `${nowParts().display} WIB`; }

let __renderTimer = null;
function scheduleRender(options={}){
  const preserveInputId = options.preserveInputId || null;
  const preserveCursor = !!options.preserveCursor;
  const active = preserveInputId ? document.getElementById(preserveInputId) : null;
  const cursorStart = preserveCursor && active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const cursorEnd = preserveCursor && active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  clearTimeout(__renderTimer);
  __renderTimer = setTimeout(()=>{
    render();
    if(preserveInputId){
      const next = document.getElementById(preserveInputId);
      if(next){
        next.focus();
        if(preserveCursor && cursorStart !== null && cursorEnd !== null && typeof next.setSelectionRange === 'function'){
          const len = String(next.value || '').length;
          next.setSelectionRange(Math.min(cursorStart, len), Math.min(cursorEnd, len));
        }
      }
    }
  }, options.delay ?? 180);
}
function render(){
  applyTheme(APP.state.theme); renderNav(); syncMobileNavUi();
  const root = document.getElementById('pageContent');
  if(APP.state.currentPage==='dashboard') root.innerHTML = dashboardPage();
  if(APP.state.currentPage==='main') root.innerHTML = mainTransactionsPage();
  if(APP.state.currentPage==='modules') root.innerHTML = modulesPage();
  if(APP.state.currentPage==='reserve') root.innerHTML = reserveFundsPage();
  if(APP.state.currentPage==='reports') root.innerHTML = reportsPage();
  if(APP.state.currentPage==='assets') root.innerHTML = assetsPage();
  if(APP.state.currentPage==='debts') root.innerHTML = debtsPage();
  if(APP.state.currentPage==='settings') root.innerHTML = settingsPage();
  if(APP.state.currentPage==='ipregister') root.innerHTML = ipRegisterPage();
  bindCoreEvents(); bindMainEvents(); bindModuleEvents(); bindReserveEvents(); bindReportEvents(); bindAssetsEvents(); bindDebtEvents(); bindSettingsEvents(); bindIpRegisterEvents(); updateClock();
}
window.addEventListener('DOMContentLoaded', async ()=>{ await DB.open(); await seedIfNeeded(); await loadState(); bindPersistentUiEvents(); render(); updateClock(); setInterval(updateClock, 1000); });
