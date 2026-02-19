  // ====== Utilities ======
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const fmt = new Intl.NumberFormat('id-ID');
  const rupiah = (n)=> 'Rp' + fmt.format(n||0);
  const LS = {
    get(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def; }catch(_){ return def; } },
    set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
  };

  // ====== Default Profiles ======
  const DEFAULT_PROFILES = {
    V12Jam: { price: 5000, duration: '12h', active: '12h15m' },
    V1Hari: { price: 10000, duration: '1d', active: '2d' },
    V2Hari: { price: 20000, duration: '2d', active: '3d' },
    V7Hari: { price: 35000, duration: '7d', active: '8d' },
    V30Hari:{ price: 100000, duration: '30d', active: '32d' },
  };
  
  // ====== Default Settings ======
	const DEFAULT_SETTINGS = {
	  voucherTitle: 'OrbitNet Hotspot'
	};

  // ====== Store ======
  const Store = {
	  load(){
		this.profiles = LS.get('profiles', DEFAULT_PROFILES);
		this.vouchers = LS.get('vouchers', []);
		this.settings = LS.get('settings', DEFAULT_SETTINGS);
	  },
	  save(){
		LS.set('profiles', this.profiles);
		LS.set('vouchers', this.vouchers);
		LS.set('settings', this.settings);
	  },
	  setVouchers(v){ this.vouchers = v; this.save(); },
	  upsertProfile(name, cfg){ this.profiles[name] = cfg; this.save(); },
	};

  // ====== Parser (XLSX → vouchers[]) ======
  const Parser = {
    parseComment(comm){
      if(typeof comm !== 'string') return { reseller:null, voucher:null, price:null, date:null };
      const id = /ID\s*:\s*([\w]+)/i.exec(comm)?.[1] || null;
      const voc = /voc\s*:\s*([\w]+)/i.exec(comm)?.[1] || null;
      const price = /\(Rp\s*([\d\.]+)/i.exec(comm)?.[1]?.replace(/\./g,'');
      const date = /tgl\s*:\s*([\d\-\/]+)/i.exec(comm)?.[1] || null;
      return { reseller:id, voucher:voc, price: price? Number(price): null, date };
    },
    fromSheet(rows){
      // expect columns: Name, Profile, Comment
      const data = [];
      for(const row of rows){
        const code = (row['Name'] ?? row['Name '] ?? '').toString().trim();
        const profile = (row['Profile'] ?? row['Profile '] ?? '').toString().trim();
        const comment = row['Comment'];
        if(!code || !profile) continue;
        const meta = this.parseComment(comment);
        const sale = Store.profiles[profile]?.price ?? null; // harga jual berdasar profil
        const margin = (sale ?? 0) - (meta.price ?? 0);
        data.push({
          code, profile,
          reseller: meta.reseller,
          price_reseller: meta.price,
          price_sale: sale,
          margin,
          date: meta.date
        });
      }
      return data;
    }
  };

  // ====== Rendering helpers ======
  function renderStats(){
    $('#stat-total').textContent = Store.vouchers.length;
    const resellers = new Set(Store.vouchers.map(v=> v.reseller).filter(Boolean));
    $('#stat-reseller').textContent = resellers.size;
    const totalMargin = Store.vouchers.reduce((a,b)=> a + (b.margin||0), 0);
    $('#stat-margin').textContent = rupiah(totalMargin);
    $('#stat-profiles').textContent = Object.keys(Store.profiles).length;

    // preview few vouchers
    const pv = $('#preview-vouchers');
    pv.innerHTML = '';
    Store.vouchers.slice(0,6).forEach(v=> pv.appendChild(voucherCard(v)));
  }

  function voucherCard(v){
    const cfg = Store.profiles[v.profile] || {};
    const el = document.createElement('div');
    el.className = 'voucher-card';
    const title = (Store.settings?.voucherTitle ?? DEFAULT_SETTINGS.voucherTitle);

	el.innerHTML = `
	  <div class="voucher-title">${title}</div>
      <div class="small text-end" style="opacity:.6">[${v.code.slice(-1)}]</div>
      <div class="voucher-code">${v.code}</div>
      <div class="voucher-meta">${cfg.active||'-'} ${cfg.duration||'-'} ${rupiah(cfg.price||0)}</div>
    `;
    return el;
  }

  // ====== Pagination + Filter table ======
  function paginate(arr, page=1, size=20){
    const start = (page-1)*size; return arr.slice(start, start+size);
  }
  function renderPager(total, page, size, ul, onGoto){
    const pages = Math.max(1, Math.ceil(total/size));
    const mk = (label, p, disabled=false, active=false)=> `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}"><a class="page-link" href="#">${label}</a></li>`;
    function range(a,b){ const r=[]; for(let i=a;i<=b;i++) r.push(i); return r; }
    let items = [];
    items.push(mk('«', Math.max(1, page-1), page===1));
    const window = 2; // left/right
    const left = Math.max(1, page-window), right = Math.min(pages, page+window);
    const show = new Set([1,pages, ...range(left,right)]);
    let last = 0;
    for(let i=1;i<=pages;i++){
      if(!show.has(i)) continue;
      if(i-last>1) items.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
      items.push(mk(i, i, false, i===page));
      last=i;
    }
    items.push(mk('»', Math.min(pages, page+1), page===pages));
    ul.innerHTML = items.join('');
    $$('a', ul).forEach(a=> a.addEventListener('click', (e)=>{
      e.preventDefault();
      const label = a.textContent.trim();
      let target = page;
      if(label==='«') target = Math.max(1, page-1);
      else if(label==='»') target = Math.min(pages, page+1);
      else target = Number(label);
      onGoto(target);
    }));
  }

  function renderVoucherTable(){
    const tbody = $('#tbl-vouchers tbody');
    const q = $('#search-voucher').value.toLowerCase();
    const size = Number($('#size-voucher').value||20);
    let data = Store.vouchers.filter(v=> {
      const s = `${v.code} ${v.profile} ${v.reseller}`.toLowerCase();
      return s.includes(q);
    });
    let page = Number(tbody.dataset.page||'1');
    const pages = Math.max(1, Math.ceil(data.length/size));
    if(page>pages) page=pages;
    tbody.dataset.page = page;

    const view = paginate(data, page, size);
    tbody.innerHTML = view.map((v,i)=> `
      <tr>
        <td>${(page-1)*size + i + 1}</td>
        <td><code>${v.code}</code></td>
        <td>${v.profile}</td>
        <td>${v.reseller||'-'}</td>
        <td>${rupiah(v.price_reseller||0)}</td>
        <td>${rupiah(v.price_sale||0)}</td>
        <td class="fw-semibold ${v.margin<0?'text-danger':'text-success'}">${rupiah(v.margin||0)}</td>
        <td>${v.date||''}</td>
      </tr>`).join('');

    renderPager(data.length, page, size, $('#pg-vouchers'), p=>{ tbody.dataset.page=p; renderVoucherTable(); });
  }

  // ====== Recap ======
  function buildRecap(){
    const map = new Map(); // key: reseller|profile
    for(const v of Store.vouchers){
      const key = `${v.reseller||'-'}|${v.profile}`;
      const cur = map.get(key) || { reseller:v.reseller||'-', profile:v.profile, qty:0, sale:0, cost:0, margin:0 };
      cur.qty += 1;
      cur.sale += v.price_sale||0;
      cur.cost += v.price_reseller||0;
      cur.margin += v.margin||0;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }
function renderRecap(){
  const tbody = $('#tbl-recap tbody');
  const q = $('#search-recap').value.toLowerCase();

  // data baris rekap (terfilter oleh pencarian)
  const rows = buildRecap().filter(r => (r.reseller || '-').toLowerCase().includes(q));

  // hitung total dari baris terfilter
  const total = rows.reduce((acc, r) => {
    acc.qty    += r.qty;
    acc.sale   += r.sale;
    acc.cost   += r.cost;
    acc.margin += r.margin;
    return acc;
  }, { qty:0, sale:0, cost:0, margin:0 });

  // render baris + baris total di akhir
  let html = rows.map(r => `
    <tr>
      <td>${r.reseller}</td>
      <td>${r.profile}</td>
      <td>${r.qty}</td>
      <td>${rupiah(r.sale)}</td>
      <td>${rupiah(r.cost)}</td>
      <td class="fw-semibold ${r.margin<0?'text-danger':'text-success'}">${rupiah(r.margin)}</td>
    </tr>
  `).join('');

  html += `
    <tr class="table-active">
      <td colspan="2" class="text-end fw-bold">TOTAL</td>
      <td class="fw-bold">${total.qty}</td>
      <td class="fw-bold">${rupiah(total.sale)}</td>
      <td class="fw-bold">${rupiah(total.cost)}</td>
      <td class="fw-bold ${total.margin<0?'text-danger':'text-success'}">${rupiah(total.margin)}</td>
    </tr>
  `;

  tbody.innerHTML = html;
}

  // ====== Settings (profiles) ======
  function renderProfiles(){
    const tbody = $('#tbl-profiles tbody');
    tbody.innerHTML = Object.entries(Store.profiles).map(([name, cfg])=> `
      <tr data-name="${name}">
        <td><input class="form-control form-control-sm" value="${name}" data-k="name"/></td>
        <td><input type="number" class="form-control form-control-sm" value="${cfg.price||0}" data-k="price"/></td>
        <td><input class="form-control form-control-sm" value="${cfg.duration||''}" data-k="duration"/></td>
        <td><input class="form-control form-control-sm" value="${cfg.active||''}" data-k="active"/></td>
        <td><button class="btn btn-outline-danger btn-sm" data-del="1"><i class="bi bi-trash"></i></button></td>
      </tr>`).join('');

    // delete handler
    $('#tbl-profiles').addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-del]'); if(!btn) return;
      const tr = btn.closest('tr');
      const name = tr.dataset.name;
      delete Store.profiles[name];
      Store.save(); renderProfiles();
    });
  }
  function renderGeneralSettings(){
	  const inp = document.getElementById('voucher-title');
	  if(!inp) return;
	  inp.value = (Store.settings?.voucherTitle ?? DEFAULT_SETTINGS.voucherTitle);
	}

	function saveGeneralSettings(){
	  const inp = document.getElementById('voucher-title');
	  if(!inp) return;
	  const v = inp.value.trim();
	  Store.settings = Store.settings || {};
	  Store.settings.voucherTitle = v || DEFAULT_SETTINGS.voucherTitle;
	  Store.save();
	}
  function addProfileRow(){
    const name = prompt('Nama profil? (mis. V3Hari)'); if(!name) return;
    Store.profiles[name] = { price:0, duration:'', active:'' };
    Store.save(); renderProfiles();
  }
  function saveProfiles(){
	saveGeneralSettings();
    const rows = $$('#tbl-profiles tbody tr');
    const next = {};
    for(const tr of rows){
      const vals = {};
      $$('input', tr).forEach(inp=> vals[inp.dataset.k] = inp.type==='number' ? Number(inp.value||0) : inp.value.trim());
      next[vals.name] = { price:Number(vals.price||0), duration:vals.duration, active:vals.active };
    }
    Store.profiles = next; Store.save();
    // Refresh dependent views
    syncPrices();
    renderStats(); renderVoucherTable(); renderRecap(); renderProfiles(); renderPrintOptions(); renderPrintPreview();
  }

  // ketika profile price berubah, update price_sale + margin
  function syncPrices(){
    for(const v of Store.vouchers){
      v.price_sale = Store.profiles[v.profile]?.price ?? v.price_sale;
      v.margin = (v.price_sale||0) - (v.price_reseller||0);
    }
    Store.save();
  }

  // ====== PRINT (jsPDF, 58mm) ======
  function renderPrintOptions(){
    const selR = $('#print-reseller'); const selP = $('#print-profile');
    const resellers = Array.from(new Set(Store.vouchers.map(v=> v.reseller).filter(Boolean))).sort();
    selR.innerHTML = '<option value="">(Semua Reseller)</option>' + resellers.map(r=> `<option>${r}</option>`).join('');
    const profiles = Object.keys(Store.profiles);
    selP.innerHTML = '<option value="">(Semua Profil)</option>' + profiles.map(p=> `<option>${p}</option>`).join('');
  }
  function filterForPrint(){
    const res = $('#print-reseller').value; const prof = $('#print-profile').value; const lim = Number($('#print-limit').value||0);
    let arr = Store.vouchers.filter(v=> (!res || v.reseller===res) && (!prof || v.profile===prof));
    if(lim>0) arr = arr.slice(0, lim);
    return arr;
  }
  function renderPrintPreview(){
    const box = $('#print-preview'); box.innerHTML='';
    filterForPrint().slice(0,8).forEach(v=> box.appendChild(voucherCard(v)));
  }

  // --- Filename helpers ---
function _safeSlug(s){
  return (s ?? 'ALL')
    .toString()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toLowerCase();
}

function buildPDFName(){
  const selProfile  = document.getElementById('print-profile')?.value || '';
  const selReseller = document.getElementById('print-reseller')?.value || '';
  const profile = selProfile || 'ALL';
  // harga jual hanya diisi jika profil dipilih; kalau tidak → ALL
  const price   = selProfile ? (Store.profiles[selProfile]?.price ?? 0) : 'ALL';

  const pPart = _safeSlug(profile);
  const hPart = (price === 'ALL') ? 'all' : String(price);
  const rPart = _safeSlug(selReseller || 'ALL');

  return `vcr_orbitnet_${pPart}_${hPart}_${rPart}.pdf`;
}

  // ====== PRINT (jsPDF, 58mm continuous) ======
  // --- Konstanta cetak (thermal 58mm) ---
  const PAGE_W_MM   = 58;   // lebar kertas
  const CARD_H_MM   = 26;   // tinggi 1 voucher
  const MAX_PAGE_H_MM = 2600; // tinggi maksimum per halaman (aman < batas PDF)

  // Gambar 1 voucher pada posisi Y tertentu
  function _drawVoucher(doc, v, y, idx){
    const cfg = Store.profiles[v.profile] || {};

    // Header + nomor urut
    doc.setFont('helvetica','bold'); 
    doc.setFontSize(9);
    const title = (Store.settings?.voucherTitle ?? DEFAULT_SETTINGS.voucherTitle);
	doc.text(title, PAGE_W_MM/2, y+5, { align:'center' });

    doc.setFont('helvetica','normal'); 
    doc.setFontSize(8);
    doc.text(`[${idx+1}]`, PAGE_W_MM-2, y+5, { align:'right' });

    // Kode
    doc.setLineWidth(0.4);
    doc.roundedRect(6, y+7, PAGE_W_MM-12, 10, 2, 2);
    doc.setFont('helvetica','bold'); 
    doc.setFontSize(11);
    doc.text(v.code, PAGE_W_MM/2, y+13, { align:'center' });

    // Meta
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    const line = `${cfg.active||'-'}  ${cfg.duration||'-'}  ${rupiah(cfg.price||0)}`;
    doc.text(line, PAGE_W_MM/2, y+22, { align:'center' });
  }

  // ====== PRINT (jsPDF, 58mm multi-page) ======
  async function generatePDF(){
    const { jsPDF } = window.jspdf;
    const vouchers = filterForPrint(); // sudah menghormati "Maks. Kupon"
    if(!vouchers.length){
      alert('Tidak ada voucher untuk dicetak.');
      return;
    }

    // Hitung kapasitas per halaman dan tinggi halaman aktual
    const itemsPerPage = Math.max(1, Math.floor(MAX_PAGE_H_MM / CARD_H_MM));
    const pageH = itemsPerPage * CARD_H_MM;

    // Buat dokumen pertama
    const doc = new jsPDF({ unit:'mm', format:[PAGE_W_MM, pageH] });

    vouchers.forEach((v, i)=>{
      const pos = i % itemsPerPage;
      if(i > 0 && pos === 0){
        // Halaman berikutnya dengan ukuran sama
        doc.addPage([PAGE_W_MM, pageH]);
      }
      const y = pos * CARD_H_MM;
      _drawVoucher(doc, v, y, i);
    });

    const title = (Store.settings?.voucherTitle ?? DEFAULT_SETTINGS.voucherTitle);
	doc.setProperties({ title: `${title} Vouchers` });
    doc.save(buildPDFName());
  }

  // ====== Router (SPA) ======
  const pages = {
    '#/dashboard': '#page-dashboard',
    '#/vouchers':  '#page-vouchers',
    '#/recap':     '#page-recap',
    '#/settings':  '#page-settings',
    '#/print':     '#page-print',
  };
  function show(hash){
    Object.values(pages).forEach(id=> $(id).classList.add('d-none'));
    const target = pages[hash] || '#page-dashboard';
    $(target).classList.remove('d-none');
    // mark active
    $$('#topnav .nav-link').forEach(a=> a.classList.toggle('active', a.getAttribute('href')===hash));
    // collapse navbar (auto-hide on click)
    const nav = bootstrap.Collapse.getOrCreateInstance($('#topnav')); nav.hide();
  }

  // ====== Upload handler ======
  async function handleFile(file){
    if(!file) return;
    $('#upload-info').textContent = 'Memproses file…';
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const wsName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { defval:'' });
    const vouchers = Parser.fromSheet(rows);
    Store.setVouchers(vouchers);
    $('#upload-info').innerHTML = `Berhasil memuat <strong>${vouchers.length}</strong> baris dari sheet <em>${wsName}</em>.`;
    renderStats(); renderVoucherTable(); renderRecap(); renderPrintOptions(); renderPrintPreview();
  }

  // ====== Init ======
  function init(){
    document.getElementById('year').textContent = new Date().getFullYear();
    Store.load(); syncPrices();

    // default route
    show(location.hash || '#/dashboard');
    window.addEventListener('hashchange', ()=> show(location.hash));

    // navbar autohide when clicking any nav link
    $$('#topnav [data-link]').forEach(a=> a.addEventListener('click', ()=>{
      const nav = bootstrap.Collapse.getOrCreateInstance($('#topnav')); nav.hide();
    }));

    // upload
    $('#file-input').addEventListener('change', (e)=> handleFile(e.target.files?.[0]));

    // table controls
    $('#search-voucher').addEventListener('input', renderVoucherTable);
    $('#size-voucher').addEventListener('change', ()=>{ $('#tbl-vouchers tbody').dataset.page='1'; renderVoucherTable(); });

    // recap search
    $('#search-recap').addEventListener('input', renderRecap);

    // settings
    $('#btn-add-profile').addEventListener('click', addProfileRow);
    $('#btn-save-profiles').addEventListener('click', saveProfiles);

    // print
    ['change','input'].forEach(ev=> {
      $('#print-reseller').addEventListener(ev, renderPrintPreview);
      $('#print-profile').addEventListener(ev, renderPrintPreview);
      $('#print-limit').addEventListener(ev, renderPrintPreview);
    });
    $('#btn-generate-pdf').addEventListener('click', generatePDF);

    // first paints
    renderStats(); renderVoucherTable(); renderRecap(); renderProfiles(); renderGeneralSettings(); renderPrintOptions(); renderPrintPreview();
  }

  init();