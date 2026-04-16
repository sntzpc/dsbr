const TZ = 'Asia/Jakarta';
const SETTINGS_KEYS = { theme: 'theme', moduleConfig: 'moduleConfig' };
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
  BAGIHASIL: 'Bagi Hasil'
};
const RESERVE_ENTRY_TYPES = { CREDIT:'Tambah Saldo', DEBIT:'Penggunaan Dana' };
const PROFIT_RECIPIENTS = { ACTOR: 'Pelaku', OWNER: 'Owner/System', PARTNER: 'Partner/Technical' };

const APP = {
  navItems: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'main', label: 'Transaksi Utama', icon: '💵' },
    { key: 'modules', label: 'Modul Transaksi', icon: '🧩' },
    { key: 'reserve', label: 'Transaksi Cadangan', icon: '🏦' },
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
    config: null,
    mainFilters: { startDate:'', endDate:'', type:'ALL', search:'' },
    moduleFilters: { modStart:'', modEnd:'', baseId:'ALL', actorKey:'ALL', modSearch:'', depositSmart:'ALL', setorSmart:'ALL' },
    reportFilters: { mainStart:'', mainEnd:'', modStart:'', modEnd:'', baseId:'ALL', actorKey:'ALL', modSearch:'', depositSmart:'ALL', setorSmart:'ALL', integrationPeriod:'', integrationDate:todayDateIso(), integrationTime:currentTimeWIB() },
    reserveFilters: { startDate:'', endDate:'', fundType:'ALL', entryType:'ALL', search:'' },
    forms: {
      main: { type:'PENDAPATAN', categoryPath:[], amountRaw:0, notes:'', date:'', time:'' },
      module: { txType:'DEPOSIT', baseId:'', actorKey:'', recipient:'ACTOR', nominal:0, notes:'', date:'', time:'' },
      reserve: { fundType:'ZAKAT', entryType:'CREDIT', amountRaw:0, notes:'', date:'', time:'' }
    },
    editMainId: null,
    editModuleId: null,
    editReserveId: null,
    moduleTab: 'deposit'
  }
};
window.APP = APP;

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(str=''){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); }
function parseNum(value){ return Number(String(value ?? '').replace(/\D/g,'')) || 0; }
function rupiah(value){ return Number(value||0).toLocaleString('id-ID'); }
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
function applyTheme(theme){
  APP.state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', APP.state.theme === 'dark');
  try { localStorage.setItem('wifiHotspotTheme', APP.state.theme); } catch(_) {}
  const t = document.getElementById('themeText'); const i = document.getElementById('themeIcon');
  if(t) t.textContent = APP.state.theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  if(i) i.textContent = APP.state.theme === 'dark' ? '🌙' : '🌞';
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

async function seedIfNeeded(){
  if (!await DB.get(STORES.settings, SETTINGS_KEYS.theme)) await DB.put(STORES.settings, { key: SETTINGS_KEYS.theme, value: 'light' });
  if (!await DB.get(STORES.settings, SETTINGS_KEYS.moduleConfig)) await DB.put(STORES.settings, { key: SETTINGS_KEYS.moduleConfig, value: defaultConfig() });
  const cats = await DB.getAll(STORES.categories);
  if (!cats.length) {
    const danaCadanganId = uuid();
    const seed = [
      { id:uuid(), type:'PENDAPATAN', name:'Penjualan', parentId:'ROOT' }, { id:uuid(), type:'PENDAPATAN', name:'Pendapatan Lain', parentId:'ROOT' },
      { id:uuid(), type:'PENGELUARAN', name:'Operasional', parentId:'ROOT' }, { id:uuid(), type:'PENGELUARAN', name:'Pembelian', parentId:'ROOT' },
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
  APP.state.theme = settings.find(x=>x.key===SETTINGS_KEYS.theme)?.value || 'light';
  APP.state.config = normalizeConfig(settings.find(x=>x.key===SETTINGS_KEYS.moduleConfig)?.value || defaultConfig());
  APP.state.categories = await DB.getAll(STORES.categories);
  APP.state.mainTransactions = (await DB.getAll(STORES.mainTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  APP.state.moduleTransactions = (await DB.getAll(STORES.moduleTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  APP.state.reserveTransactions = (await DB.getAll(STORES.reserveTransactions)).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  if(!APP.state.forms.main.date) resetMainForm();
  if(!APP.state.forms.module.date) resetModuleForm();
  if(!APP.state.forms.reserve.date && typeof resetReserveForm === 'function') resetReserveForm();
}
function card(title, value, subtitle='', accent='text-slate-900 dark:text-white'){ return `<div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900"><p class="text-sm text-slate-500 dark:text-slate-400">${title}</p><p class="mt-2 text-2xl font-bold ${accent}">${value}</p><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">${subtitle}</p></div>`; }
function emptyState(text){ return `<div class="rounded-3xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">${text}</div>`; }

function renderNav(){
  const nav = document.getElementById('navMenu');
  nav.innerHTML = APP.navItems.map(item => `<button data-page="${item.key}" data-active="${item.key===APP.state.currentPage}" class="nav-btn flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${item.key===APP.state.currentPage ? '' : 'border-transparent'}"><span>${item.icon}</span><span>${item.label}</span></button>`).join('');
  nav.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click',()=>{ APP.state.currentPage = btn.dataset.page; render(); }));
}
function dashboardPage(){
  const main = getFilteredMainTransactions();
  const moduleAuto = aggregateModuleReport();
  const pendapatan = main.filter(x=>x.type==='PENDAPATAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const pengeluaran = main.filter(x=>x.type==='PENGELUARAN').reduce((s,x)=>s+Number(x.amount||0),0);
  const saldoUtama = pendapatan - pengeluaran;
  const reserve = typeof reserveSummaryByFund === 'function' ? reserveSummaryByFund() : { total:{balance:0}, funds:{} };
  const piutangPerBase = (moduleAuto.rows || []).reduce((acc,row)=>{
    const key = row.baseId || '__NOBASE__';
    if(!acc[key]) acc[key] = { baseId:key, baseName:row.baseName || 'Tanpa Base', receivable:0, actors:0 };
    acc[key].receivable += Number(row.receivable || 0);
    if(Number(row.receivable || 0) > 0) acc[key].actors += 1;
    return acc;
  }, {});
  const piutangRows = Object.values(piutangPerBase).filter(x=>x.receivable>0).sort((a,b)=>b.receivable-a.receivable || a.baseName.localeCompare(b.baseName));
  const totalPiutang = piutangRows.reduce((s,x)=>s+Number(x.receivable||0),0);
  const saldoAktual = saldoUtama + Number(reserve.total?.balance || 0) - totalPiutang;
  const autoBagiHasil = Number(moduleAuto.grand.actorShare||0) + Number(moduleAuto.grand.baseShare||0) + Number(moduleAuto.grand.ownerShare||0) + Number(moduleAuto.grand.partnerShare||0);
  const filteredCount = main.length;
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 class="text-xl font-bold">Dashboard</h2><p class="text-sm text-slate-500 dark:text-slate-400">Ringkasan transaksi utama, dana cadangan, dan piutang base.</p></div>
        <div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/80"><div><span class="font-semibold">Technical:</span> ${escapeHtml(APP.state.config.partnerName)}</div><div><span class="font-semibold">System:</span> ${escapeHtml(APP.state.config.ownerName)}</div></div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4"><h3 class="text-lg font-bold">Filter Dashboard</h3><p class="text-sm text-slate-500 dark:text-slate-400">Filter angka di dashboard.</p></div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input id="dashboardMainFilterStart" type="date" value="${APP.state.mainFilters.startDate}" class="rounded-2xl border px-3 py-2">
        <input id="dashboardMainFilterEnd" type="date" value="${APP.state.mainFilters.endDate}" class="rounded-2xl border px-3 py-2">
        <select id="dashboardMainFilterType" class="rounded-2xl border px-3 py-2"><option value="ALL">Semua Jenis</option><option value="PENDAPATAN" ${APP.state.mainFilters.type==='PENDAPATAN'?'selected':''}>PENDAPATAN</option><option value="PENGELUARAN" ${APP.state.mainFilters.type==='PENGELUARAN'?'selected':''}>PENGELUARAN</option></select>
        <input id="dashboardMainFilterSearch" type="text" value="${escapeHtml(APP.state.mainFilters.search)}" placeholder="Cari kategori/keterangan/nominal" class="rounded-2xl border px-3 py-2">
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">${filteredCount} transaksi utama sesuai filter</span>
        ${(APP.state.mainFilters.startDate || APP.state.mainFilters.endDate || APP.state.mainFilters.type !== 'ALL' || APP.state.mainFilters.search) ? '<button id="dashboardClearMainFilters" class="rounded-full border px-3 py-1 font-semibold text-slate-700 dark:text-slate-200">Reset Filter</button>' : ''}
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="text-lg font-bold">Informasi Saldo</h3><p class="text-sm text-slate-500 dark:text-slate-400">Saldo Aktual = Saldo Utama + Zakat + Infaq + Penyusutan - Piutang.</p></div></div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          ${card('Saldo Utama', `Rp ${rupiah(saldoUtama)}`, `Pendapatan Rp ${rupiah(pendapatan)} · Pengeluaran Rp ${rupiah(pengeluaran)}`, saldoUtama>=0?'text-blue-600':'text-amber-600')}
          ${card('Zakat', `Rp ${rupiah(reserve.funds?.ZAKAT?.balance || 0)}`, `Masuk Rp ${rupiah(reserve.funds?.ZAKAT?.credit || 0)} · Keluar Rp ${rupiah(reserve.funds?.ZAKAT?.debit || 0)}`, 'text-violet-600')}
          ${card('Infaq', `Rp ${rupiah(reserve.funds?.INFAQ?.balance || 0)}`, `Masuk Rp ${rupiah(reserve.funds?.INFAQ?.credit || 0)} · Keluar Rp ${rupiah(reserve.funds?.INFAQ?.debit || 0)}`, 'text-violet-600')}
          ${card('Penyusutan', `Rp ${rupiah(reserve.funds?.PENYUSUTAN?.balance || 0)}`, `Masuk Rp ${rupiah(reserve.funds?.PENYUSUTAN?.credit || 0)} · Keluar Rp ${rupiah(reserve.funds?.PENYUSUTAN?.debit || 0)}`, 'text-violet-600')}
          ${card('Total Piutang Base', `Rp ${rupiah(totalPiutang)}`, `${piutangRows.length} base masih punya piutang`, totalPiutang>0?'text-amber-600':'text-emerald-600')}
          ${card('Saldo Aktual', `Rp ${rupiah(saldoAktual)}`, 'Saldo setelah dikurangi piutang', saldoAktual>=0?'text-emerald-600':'text-rose-600')}
        </div>
        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <h4 class="text-base font-bold">Rincian Piutang per Base</h4>
          <div class="mt-3 space-y-3">
            ${piutangRows.map(row=>`<div class="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div class="flex items-start justify-between gap-3"><div><p class="font-semibold">${escapeHtml(row.baseName)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${row.actors} akun masih piutang</p></div><div class="text-right font-bold text-amber-600">Rp ${rupiah(row.receivable)}</div></div></div>`).join('') || '<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Tidak ada piutang per base.</div>'}
          </div>
        </div>
      </div>
    </section>

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
function bindCoreEvents(){
  document.getElementById('themeToggle')?.addEventListener('click', async ()=>{ const next = APP.state.theme === 'dark' ? 'light' : 'dark'; await DB.put(STORES.settings,{key:SETTINGS_KEYS.theme,value:next}); APP.state.theme = next; render(); });
  document.getElementById('dashboardMainFilterStart')?.addEventListener('change', e=>{ APP.state.mainFilters.startDate=e.target.value; render(); });
  document.getElementById('dashboardMainFilterEnd')?.addEventListener('change', e=>{ APP.state.mainFilters.endDate=e.target.value; render(); });
  document.getElementById('dashboardMainFilterType')?.addEventListener('change', e=>{ APP.state.mainFilters.type=e.target.value; render(); });
  document.getElementById('dashboardMainFilterSearch')?.addEventListener('input', e=>{ APP.state.mainFilters.search=e.target.value; scheduleRender({ preserveInputId:'dashboardMainFilterSearch', preserveCursor:true }); });
  document.getElementById('dashboardClearMainFilters')?.addEventListener('click', ()=>{ APP.state.mainFilters = { startDate:'', endDate:'', type:'ALL', search:'' }; render(); });
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
  applyTheme(APP.state.theme); renderNav();
  const root = document.getElementById('pageContent');
  if(APP.state.currentPage==='dashboard') root.innerHTML = dashboardPage();
  if(APP.state.currentPage==='main') root.innerHTML = mainTransactionsPage();
  if(APP.state.currentPage==='modules') root.innerHTML = modulesPage();
  if(APP.state.currentPage==='reserve') root.innerHTML = reserveFundsPage();
  if(APP.state.currentPage==='reports') root.innerHTML = reportsPage();
  if(APP.state.currentPage==='settings') root.innerHTML = settingsPage();
  bindCoreEvents(); bindMainEvents(); bindModuleEvents(); bindReserveEvents(); bindReportEvents(); bindSettingsEvents(); updateClock();
}
window.addEventListener('DOMContentLoaded', async ()=>{ await DB.open(); await seedIfNeeded(); await loadState(); render(); updateClock(); setInterval(updateClock, 1000); });
