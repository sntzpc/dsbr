(function(){
  const U = window.Utils;
  const C = window.CONSTANTS;
  const App = {
    state:{ token:'', user:null, settings:{}, operators:[], services:[], bookings:[], queue:null, notifications:[], unread_count:0, loyalty:null, page:'dashboard', polling:null, selectedSlot:null, isSaving:false, lastUserEditAt:0, pollingPausedUntil:0, refreshBusy:false, tablePages:{} },
    nav:{
      ADMIN:[['dashboard','🏠','Dashboard'],['calendar','📅','Kalender'],['bookings','📋','Booking'],['operators','💈','Operator'],['services','🧾','Layanan'],['settings','⚙️','Setting'],['reports','📊','Report']],
      OPERATOR:[['dashboard','🏠','Dashboard'],['calendar','📅','Kalender'],['myQueue','📣','Antrian Saya'],['history','🕒','Riwayat'],['notifications','🔔','Notifikasi']],
      CUSTOMER:[['dashboard','🏠','Dashboard'],['booking','🗓️','Booking'],['queue','📡','Antrian Live'],['loyalty','⭐','Loyalty'],['history','🕒','Riwayat'],['notifications','🔔','Notifikasi']]
    },
    init(){
      this.applyTheme(localStorage.getItem(APP_CONFIG.THEME_KEY) || APP_CONFIG.DEFAULT_THEME);
      this.bindAuth();
      this.restoreSession();
      setTimeout(()=>U.$('#app-loader').classList.add('hidden'),350);
    },
    bindAuth(){
      U.$$('#auth-screen .auth-tab').forEach(btn=>btn.onclick=()=>{
        U.$$('#auth-screen .auth-tab').forEach(b=>b.classList.remove('active'));
        U.$$('#auth-screen .auth-form').forEach(f=>f.classList.remove('active'));
        btn.classList.add('active'); U.$(`#${btn.dataset.authTab}-form`).classList.add('active');
      });
      U.$('#login-form').onsubmit = async e => { e.preventDefault(); await this.login(U.serialize(e.target)); };
      U.$('#register-form').onsubmit = async e => { e.preventDefault(); await this.register(U.serialize(e.target)); };
      U.$('#auth-theme-btn').onclick = () => this.toggleTheme();
      U.$('#theme-toggle').onclick = () => this.toggleTheme();
      U.$('#btn-setup-db').onclick = async () => { try{ this.loading(true,'Menyiapkan database...'); const r=await Api.request('setupDatabase'); U.toast('Setup Database', r.message || 'Database siap.', 'success'); }catch(err){U.toast('Setup gagal',err.message,'error')}finally{this.loading(false)} };
      U.$('#btn-logout').onclick = () => this.logout();
      U.$('#btn-sync').onclick = () => this.refresh();
      U.$('#mobile-menu-btn').onclick = () => U.$('#sidebar').classList.toggle('open');
      U.$('#notif-btn').onclick = () => this.go('notifications');
    },
    restoreSession(){
      try{ const s=JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEY)||'{}'); if(s.token&&s.user){ this.state.token=s.token; this.state.user=s.user; this.showApp(); this.refresh(); return; } }catch(e){}
      this.showAuth();
    },
    saveSession(){ localStorage.setItem(APP_CONFIG.STORAGE_KEY, JSON.stringify({token:this.state.token,user:this.state.user})); },
    loading(show, text){ const loader=U.$('#app-loader'); if(show){loader.classList.remove('hidden'); loader.querySelector('p').textContent=text||'Memuat...'} else loader.classList.add('hidden'); },
    async api(action, data={}){ return Api.request(action, Object.assign({}, data, this.state.token?{token:this.state.token}:{})); },
    async login(data){
      try{ this.loading(true,'Login...'); const r=await Api.request('login', data); this.state.token=r.token; this.state.user=r.user; this.saveSession(); U.toast('Login berhasil',`Selamat datang, ${r.user.name}`,'success'); this.showApp(); await this.refresh(); }
      catch(err){ U.toast('Login gagal', err.message,'error'); }
      finally{ this.loading(false); }
    },
    async register(data){
      try{ this.loading(true,'Mendaftarkan akun...'); await Api.request('registerCustomer', data); U.toast('Registrasi berhasil','Silakan login menggunakan nomor HP dan password.','success'); U.$('[data-auth-tab="login"]').click(); U.$('#login-form input[name="phone"]').value=data.phone; }
      catch(err){ U.toast('Registrasi gagal',err.message,'error'); }
      finally{ this.loading(false); }
    },
    async logout(){
      try{ if(this.state.token) await this.api('logout'); }catch(e){}
      clearInterval(this.state.polling); localStorage.removeItem(APP_CONFIG.STORAGE_KEY); this.state={token:'',user:null,settings:{},operators:[],services:[],bookings:[],queue:null,notifications:[],unread_count:0,loyalty:null,page:'dashboard',polling:null,selectedSlot:null,isSaving:false,lastUserEditAt:0,pollingPausedUntil:0,refreshBusy:false,tablePages:{}}; this.showAuth();
    },
    showAuth(){ U.$('#auth-screen').classList.remove('hidden'); U.$('#app-shell').classList.add('hidden'); },
    showApp(){
      U.$('#auth-screen').classList.add('hidden'); U.$('#app-shell').classList.remove('hidden');
      U.$('#user-name').textContent=this.state.user.name; U.$('#user-initial').textContent=U.initial(this.state.user.name); U.$('#sidebar-role').textContent=this.roleName();
      this.renderNav(); this.startPolling();
    },
    roleName(){ return {ADMIN:'Admin',OPERATOR:'Operator',CUSTOMER:'Pelanggan'}[this.state.user?.role]||'-'; },
    renderNav(){
      const nav = this.nav[this.state.user.role] || [];
      U.$('#side-nav').innerHTML = nav.map(([id,ic,label])=>`<button class="nav-btn ${this.state.page===id?'active':''}" data-page="${id}"><span>${ic}</span>${label}</button>`).join('');
      U.$$('#side-nav .nav-btn').forEach(b=>b.onclick=()=>this.go(b.dataset.page));
    },
    go(page){
      this.state.page=page; this.state.lastUserEditAt=0; this.state.pollingPausedUntil=0;
      U.$('#sidebar').classList.remove('open'); this.renderNav();
      if(page==='history' || page==='notifications'){ this.refresh(); return; }
      this.render();
    },
    applyTheme(theme){ document.documentElement.dataset.theme=theme; localStorage.setItem(APP_CONFIG.THEME_KEY,theme); const icon=theme==='dark'?'🌙':'☀️'; U.$('#theme-toggle').textContent=icon; U.$('#auth-theme-btn').textContent=icon; },
    toggleTheme(){ this.applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'); },
    startPolling(){
      clearInterval(this.state.polling);
      const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'');
      const role=this.state.user?.role;
      const ms=role==='OPERATOR'
        ? (isMobile?(APP_CONFIG.MOBILE_OPERATOR_POLLING_MS||45000):APP_CONFIG.OPERATOR_POLLING_MS)
        : role==='CUSTOMER'
          ? (isMobile?(APP_CONFIG.MOBILE_CUSTOMER_POLLING_MS||60000):(APP_CONFIG.CUSTOMER_POLLING_MS||60000))
          : (isMobile?(APP_CONFIG.MOBILE_ADMIN_POLLING_MS||90000):(APP_CONFIG.ADMIN_POLLING_MS||90000));
      this.state.polling=setInterval(()=>this.silentRefresh(),ms);
    },
    shouldPollPage(){
      const role=this.state.user?.role, page=this.state.page;
      const livePages={ADMIN:['dashboard','bookings'],OPERATOR:['dashboard','myQueue'],CUSTOMER:['dashboard','queue']};
      return !!(livePages[role]||[]).includes(page);
    },
    async refresh(){ try{ this.loading(true,'Mengambil data terbaru...'); await this.loadSnapshot(false); this.render(); }catch(err){ U.toast('Refresh gagal',err.message,'error'); try{ await this.loadBaseData(); await this.loadPageData(); this.render(); }catch(e){} }finally{this.loading(false)} },
    async silentRefresh(){
      if(!this.state.user || this.state.refreshBusy || this.state.isSaving || document.hidden || !this.shouldPollPage()) return;
      if(Date.now() < (this.state.pollingPausedUntil||0)) return;
      this.state.refreshBusy=true;
      try{
        await this.loadSnapshot(true);
        if(this.canSilentRender()) this.render(false);
        else this.updateTopbarOnly();
      }catch(e){ console.warn(e.message); }
      finally{ this.state.refreshBusy=false; }
    },
    canSilentRender(){
      if(this.isUserEditing()) return false;
      const role=this.state.user?.role;
      const page=this.state.page;
      const safePages={
        ADMIN:['dashboard','bookings'],
        OPERATOR:['dashboard','myQueue'],
        CUSTOMER:['dashboard','queue']
      };
      return !!(safePages[role]||[]).includes(page);
    },
    isUserEditing(){
      const active=document.activeElement;
      const editing=active && (['INPUT','SELECT','TEXTAREA'].includes(active.tagName) || active.isContentEditable);
      const modalRoot=U.$("#modal-root");
      const modalOpen=modalRoot && !modalRoot.classList.contains("hidden");
      const recentEdit=(Date.now()-(this.state.lastUserEditAt||0)) < (APP_CONFIG.POLLING_PAUSE_AFTER_EDIT_MS||120000);
      return !!(editing || modalOpen || recentEdit);
    },
    pausePolling(ms){
      const until=Date.now()+(ms||APP_CONFIG.POLLING_PAUSE_AFTER_EDIT_MS||120000);
      this.state.pollingPausedUntil=Math.max(this.state.pollingPausedUntil||0, until);
    },
    markUserEditing(){
      this.state.lastUserEditAt=Date.now();
      this.pausePolling();
    },
    updateTopbarOnly(){
      const unread=this.state.unread_count!==undefined?this.state.unread_count:(this.state.notifications||[]).filter(n=>String(n.read_status).toLowerCase()!=='true').length;
      const badge=U.$("#notif-badge"); if(badge) badge.textContent=unread;
      const shop=U.$("#sidebar-shop-name"); if(shop) shop.textContent=this.state.settings.barbershop_name||"BarberBook";
    },
    async loadSnapshot(silent=false){
      const role=this.state.user.role, date=U.today();
      const includeHistory=(role==='CUSTOMER' && this.state.page==='history');
      const includeLoyalty=(role==='CUSTOMER' && !silent);
      const snap=await this.api('getAppSnapshot',{date,page:this.state.page,include_notifications:!silent,include_history:includeHistory,include_loyalty:includeLoyalty});
      this.state.settings=snap.settings||{};
      this.state.operators=snap.operators||[];
      this.state.services=snap.services||[];
      if(!silent || (snap.notifications||[]).length) this.state.notifications=snap.notifications||this.state.notifications||[];
      this.state.dashboard=snap.dashboard||null;
      this.state.queue=snap.queue||(snap.dashboard&&snap.dashboard.queue)||null;
      if(snap.loyalty) this.state.loyalty=snap.loyalty;
      this.state.bookings=snap.bookings||[];
      U.$("#sidebar-shop-name").textContent=this.state.settings.barbershop_name||"BarberBook";
      const unread=snap.unread_count!==undefined?snap.unread_count:(this.state.notifications||[]).filter(n=>String(n.read_status).toLowerCase()!=='true').length;
      this.state.unread_count=unread;
      U.$("#notif-badge").textContent=unread;
    },
    async loadBaseData(silent=false){
      const tasks=[this.api('getSettings'),this.api('listOperators',{active:true}),this.api('listServices',{active:true}),this.api('listNotifications',{unread_only:false})];
      const [set,ops,sv,nt]=await Promise.all(tasks);
      this.state.settings=set.settings||{}; this.state.operators=ops.operators||[]; this.state.services=sv.services||[]; this.state.notifications=nt.notifications||[];
      U.$('#sidebar-shop-name').textContent=this.state.settings.barbershop_name||'BarberBook';
      const unread=this.state.notifications.filter(n=>String(n.read_status).toLowerCase()!=='true').length; this.state.unread_count=unread; U.$('#notif-badge').textContent=unread;
    },
    async loadPageData(silent=false){
      const role=this.state.user.role, date=U.today();
      if(role==='ADMIN'){
        const [dash,book]=await Promise.all([this.api('getDashboardAdmin',{date}),this.api('listBookings',{date})]);
        this.state.dashboard=dash; this.state.bookings=book.bookings||[];
      }else if(role==='OPERATOR'){
        const [dash,queue]=await Promise.all([this.api('getDashboardOperator',{date}),this.api('getQueueLive',{date})]);
        this.state.dashboard=dash; this.state.bookings=dash.bookings||[]; this.state.queue=queue;
      }else{
        const [dash,queue,hist]=await Promise.all([this.api('getDashboardCustomer',{date}),this.api('getQueueLive',{date}),this.api('listBookings',{})]);
        this.state.dashboard=dash; this.state.queue=queue; this.state.bookings=hist.bookings||[];
      }
    },
    setTitle(title,sub){ U.$('#page-title').textContent=title; U.$('#page-subtitle').textContent=sub||''; },
    render(scrollTop=true){
      if(!this.state.user) return;
      const role=this.state.user.role, page=this.state.page;
      if(role==='ADMIN') this.renderAdmin(page); else if(role==='OPERATOR') this.renderOperator(page); else this.renderCustomer(page);
      if(scrollTop) window.scrollTo({top:0,behavior:'smooth'});
      this.bindContentEvents();
    },
    summaryCards(s={}){ return `<div class="grid grid-4">
      ${this.stat('Total Booking',s.total||0,'Hari ini')}${this.stat('Menunggu',(s.booked||0)+(s.checked_in||0)+(s.called||0),'Belum dilayani')}${this.stat('Dilayani',s.in_service||0,'Sedang berjalan')}${this.stat('Selesai',s.finished||0,U.rupiah(s.finished_revenue||0))}
    </div>`; },
    stat(label,val,sub){ return `<div class="card stat-card"><small>${label}</small><b>${val}</b><span>${sub||''}</span></div>`; },
    qrisAsset(settings={}){
      const fileId = settings.qris_static_file_id || this.extractDriveFileId(settings.qris_static_url || '') || this.extractDriveFileId(settings.qris_static_download_url || '') || this.extractDriveFileId(settings.qris_static_view_url || '');
      const cleanUrl = settings.qris_static_view_url || settings.qris_static_url || '';
      if(fileId){
        return {
          fileId,
          viewUrl: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view?usp=sharing`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
          thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`
        };
      }
      if(cleanUrl){
        return { fileId:'', viewUrl: cleanUrl, downloadUrl: settings.qris_static_download_url || cleanUrl, thumbnailUrl: cleanUrl };
      }
      return null;
    },
    qrisImgUrl(settings={}){
      const q=this.qrisAsset(settings);
      return q ? q.thumbnailUrl : '';
    },
    extractDriveFileId(url){
      const raw=String(url||'').trim();
      if(!raw) return '';
      if(/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
      let decoded=raw;
      try{ decoded=decodeURIComponent(raw); }catch(e){ decoded=raw; }
      const patterns=[/[?&]id=([a-zA-Z0-9_-]{20,})/,/\/d\/([a-zA-Z0-9_-]{20,})/,/file\/d\/([a-zA-Z0-9_-]{20,})/,/thumbnail\?id=([a-zA-Z0-9_-]{20,})/,/uc\?export=(?:view|download)&id=([a-zA-Z0-9_-]{20,})/];
      for(const re of patterns){ const m=decoded.match(re); if(m&&m[1]) return m[1]; }
      return '';
    },
    qrisLinkHtml(settings={}, mode='customer'){
      const q=this.qrisAsset(settings);
      if(!q) return '';
      const help = mode==='admin'
        ? 'QRIS statis sudah tersimpan. Klik link untuk membuka atau menyimpan file.'
        : 'Klik tombol di bawah untuk membuka atau menyimpan QRIS statis.';
      return `<div class="qris-link-box"><div><b>QRIS Statis</b><p>${U.esc(help)}</p></div><div class="action-row no-wrap-actions"><a class="primary-btn mini" href="${U.esc(q.viewUrl)}" target="_blank" rel="noopener noreferrer">Buka QRIS</a><a class="ghost-btn mini" href="${U.esc(q.downloadUrl)}" target="_blank" rel="noopener noreferrer" download>Simpan QRIS</a></div></div>`;
    },
    sortNewestRows(rows=[]){
      return (rows||[]).slice().sort((a,b)=>{
        const key=(x)=>`${x.booking_date||x.date||''} ${x.slot_time||x.created_at||x.updated_at||''}`.trim();
        return key(b).localeCompare(key(a)) || Number(b.queue_no||0)-Number(a.queue_no||0);
      });
    },
    getTableState(key){
      this.state.tablePages=this.state.tablePages||{};
      if(!this.state.tablePages[key]) this.state.tablePages[key]={page:1,pageSize:Number(APP_CONFIG.DEFAULT_PAGE_SIZE||20)};
      return this.state.tablePages[key];
    },
    paginate(key, rows=[]){
      const st=this.getTableState(key);
      const total=rows.length;
      const pages=Math.max(1,Math.ceil(total/st.pageSize));
      st.page=Math.min(Math.max(1,Number(st.page||1)),pages);
      const start=(st.page-1)*st.pageSize;
      return {state:st,total,pages,start,rows:rows.slice(start,start+st.pageSize)};
    },
    pageNumbers(current,total){
      const out=[]; const add=x=>{ if(!out.includes(x)) out.push(x); };
      add(1); add(total);
      for(let i=current-1;i<=current+1;i++) if(i>1&&i<total) add(i);
      out.sort((a,b)=>a-b);
      const final=[]; out.forEach((n,i)=>{ if(i&&n-out[i-1]>1) final.push('…'); final.push(n); });
      return final;
    },
    paginationControls(key, meta){
      const sizes=[20,50,100,500];
      const pageBtns=this.pageNumbers(meta.state.page,meta.pages).map(n=> n==='…'
        ? `<span class="pager-ellipsis">…</span>`
        : `<button type="button" class="pager-btn ${n===meta.state.page?'active':''}" data-page-key="${key}" data-page="${n}">${n}</button>`).join('');
      return `<div class="table-pager"><div class="pager-info">${meta.total?`${meta.start+1}-${Math.min(meta.start+meta.state.pageSize,meta.total)} dari ${meta.total}`:'0 data'}</div><div class="pager-actions"><button type="button" class="pager-btn" data-page-key="${key}" data-page="${Math.max(1,meta.state.page-1)}">‹</button>${pageBtns}<button type="button" class="pager-btn" data-page-key="${key}" data-page="${Math.min(meta.pages,meta.state.page+1)}">›</button><select class="pager-size" data-page-size-key="${key}">${sizes.map(s=>`<option value="${s}" ${s===meta.state.pageSize?'selected':''}>${s}/hal</option>`).join('')}</select></div></div>`;
    },
    renderAdmin(page){
      const map={dashboard:()=>this.adminDashboard(),calendar:()=>this.bookingCalendarPage(),bookings:()=>this.adminBookings(),operators:()=>this.adminOperators(),services:()=>this.adminServices(),settings:()=>this.adminSettings(),reports:()=>this.adminReports(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    renderOperator(page){
      const map={dashboard:()=>this.operatorDashboard(),calendar:()=>this.bookingCalendarPage(),myQueue:()=>this.operatorQueue(),history:()=>this.operatorHistory(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    renderCustomer(page){
      const map={dashboard:()=>this.customerDashboard(),booking:()=>this.customerBooking(),queue:()=>this.queueLivePage(),loyalty:()=>this.customerLoyaltyPage(),history:()=>this.customerHistory(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    adminDashboard(){
      this.setTitle('Dashboard Admin','Ringkasan hari ini'); const s=this.state.dashboard?.summary||{};
      U.$('#content').innerHTML=`${this.summaryCards(s)}<div class="grid grid-2" style="margin-top:16px"><div class="card">${this.queuePreview()}</div><div class="card">${this.todayBookingsTable(this.state.bookings.slice(0,8),'dashboardBookings')}</div></div>`;
    },
    operatorDashboard(){
      this.setTitle('Dashboard Operator','Order masuk hari ini'); const s=this.state.dashboard?.summary||{};
      U.$('#content').innerHTML=`${this.summaryCards(s)}<div class="card" style="margin-top:16px">${this.operatorActionList(this.state.bookings)}</div>`;
    },
    customerDashboard(){
      this.setTitle('Dashboard Pelanggan','Booking, pembayaran, dan antrian secara live'); const b=this.state.dashboard?.active_booking;
      const bookingHtml=b?`<div class="card soft"><h3>Booking Aktif Anda</h3><div class="grid grid-4">${this.stat('Nomor Antrian',b.queue_no,'')}${this.stat('Status',U.statusLabel(b.status),'')}${this.stat('Operator',b.operator_name||'-','')}${this.stat('Jam',U.formatTime(b.slot_time)||'-','')}</div><div class="action-row" style="margin-top:16px"><button class="success-btn" data-action="checkIn" data-id="${b.booking_id}">Check-in</button><button class="danger-btn" data-action="cancelBooking" data-id="${b.booking_id}">Batalkan</button></div></div>${this.paymentInfoCard(b)}`:`<div class="card empty-state"><b>Belum ada booking aktif hari ini</b><p>Silakan buat booking baru sesuai jadwal yang tersedia.</p><button class="primary-btn" data-go="booking">Buat Booking</button></div>`;
      U.$('#content').innerHTML=`${bookingHtml}${this.loyaltyMiniCard()}<div class="card" style="margin-top:16px">${this.queuePreview()}</div>`;
    },
    queuePreview(){
      const q=this.state.queue||this.state.dashboard?.queue||{}; const cur=q.current||[];
      return `<div class="section-title" style="margin-top:0"><h2>Antrian Live</h2><span class="badge">Next: ${q.next_queue||'-'}</span></div><div class="grid grid-3">${this.stat('Menunggu',q.waiting_count||0,'Antrian belum selesai')}${this.stat('Selesai',q.finished_count||0,'Hari ini')}${this.stat('Sedang Dilayani',cur.length,'Kursi aktif')}</div><div class="section-title"><h2>Sedang Dilayani</h2></div><div class="queue-list">${cur.length?cur.map(x=>`<div class="queue-item"><div class="queue-no">${U.esc(x.queue_no)}</div><div class="queue-main"><b>${U.esc(x.customer_initial)} · ${U.esc(x.service_name)}</b><span>${U.esc(x.operator_name)} · Kursi ${U.esc(x.chair_no||'-')} · ${x.running_duration_min||0} menit</span></div></div>`).join(''):'<div class="empty-state"><b>Belum ada yang sedang dilayani</b><p>Data akan refresh otomatis.</p></div>'}</div>`;
    },
    paymentInfoCard(b){
      const st=String(b.payment_status||'UNPAID').toUpperCase();
      if(st==='PAID') return `<div class="card" style="margin-top:16px"><h3>Pembayaran</h3><p>Status: <b>${U.paymentLabel(st)}</b></p></div>`;
      const s=this.state.settings||{};
      const qris=this.qrisAsset(s)?`<div style="margin-top:12px">${this.qrisLinkHtml(s,'customer')}</div>`:'';
      const tripay=String(s.payment_gateway_enabled).toLowerCase()==='true'?`<button class="primary-btn" data-action="tripayCustomer" data-id="${U.esc(b.booking_id)}" data-price="${U.esc(b.price||0)}">Bayar Online Tripay</button>`:'';
      return `<div class="card" style="margin-top:16px"><div class="section-title" style="margin-top:0"><h2>Pembayaran</h2><span class="badge">${U.paymentLabel(st)}</span></div><p>Total tagihan: <b>${U.rupiah(b.price||0)}</b></p><div class="action-row">${tripay}</div>${qris}</div>`;
    },
    customerBooking(){
      this.setTitle('Booking Baru','Pilih layanan, lalu klik slot jam yang tersedia');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><form id="booking-form"><div class="form-grid"><label>Tanggal Booking<input type="date" name="booking_date" value="${U.today()}" required></label><label>Layanan<select name="service_id" required><option value="">Pilih layanan</option>${this.state.services.map(s=>`<option value="${s.service_id}">${U.esc(s.service_name)} · ${U.rupiah(s.price)} · ${s.duration_min} menit</option>`).join('')}</select><small>Setelah layanan dipilih, slot otomatis ditampilkan. Pelanggan cukup klik jam yang tersedia.</small></label><label class="span-2">Operator<select name="operator_id"><option value="ANY">Operator mana saja</option>${this.state.operators.map(o=>`<option value="${o.operator_id}">${U.esc(o.operator_name)} · Kursi ${U.esc(o.chair_no||'-')}</option>`).join('')}</select></label></div><div id="availability-result" style="margin-top:16px"><div class="empty-state"><b>Pilih layanan terlebih dahulu</b><p>Slot akan tampil berdasarkan durasi layanan, jam kerja operator, dan booking yang sudah masuk.</p></div></div><button class="primary-btn full" type="submit" style="margin-top:16px">Konfirmasi Booking</button></form></div><div class="card">${this.queuePreview()}</div></div>`;
    },
    queueLivePage(){ this.setTitle('Antrian Live','Pantau kapasitas dan status pelanggan yang sedang dilayani'); U.$('#content').innerHTML=`<div class="card">${this.queuePreview()}</div><div class="card" style="margin-top:16px">${this.queueTable()}</div>`; },
    queueTable(){
      const q=this.sortNewestRows((this.state.queue||this.state.dashboard?.queue||{}).queue||[]);
      const meta=this.paginate('queueTable',q);
      return `<h3>Daftar Antrian Hari Ini</h3><div class="table-wrap"><table><thead><tr><th>No</th><th>Pelanggan</th><th>Layanan</th><th>Operator</th><th>Jam</th><th>Status</th></tr></thead><tbody>${meta.rows.map(x=>`<tr><td>${x.queue_no}</td><td>${U.esc(x.customer_initial)}</td><td>${U.esc(x.service_name)}</td><td>${U.esc(x.operator_name)}</td><td>${U.esc(U.formatTime(x.slot_time))}</td><td>${U.badge(x.status)}</td></tr>`).join('')||'<tr><td colspan="6">Belum ada antrian.</td></tr>'}</tbody></table></div>${this.paginationControls('queueTable',meta)}`;
    },
    loyaltyMiniCard(){
      const l=this.state.loyalty;
      const s=this.state.settings||{};
      if(String(s.loyalty_enabled).toLowerCase()!=='true') return '';
      if(!l) return `<div class="card loyalty-card" style="margin-top:16px"><div class="section-title" style="margin-top:0"><h2>⭐ Loyalty</h2><span class="badge">Aktif</span></div><p>Status loyalty sedang dimuat. Buka menu Loyalty untuk melihat detail benefit.</p></div>`;
      const level=l.priority_level||'NORMAL';
      const cls=level==='VIP'?'vip':(level==='PRIORITY'?'priority':'normal');
      return `<div class="card loyalty-card ${cls}" style="margin-top:16px"><div class="section-title" style="margin-top:0"><h2>⭐ ${U.esc(l.program_name||'Loyalty')}</h2><span class="badge">${U.esc(level)}</span></div><div class="loyalty-progress"><span style="width:${Number(l.progress_percent||0)}%"></span></div><p><b>${U.esc(l.benefit||'')}</b></p><small>${U.esc(l.next_target_text||'')}</small><div class="action-row" style="margin-top:12px"><button class="ghost-btn small" data-go="loyalty">Lihat Detail Loyalty</button></div></div>`;
    },
    customerLoyaltyPage(){
      this.setTitle('Loyalty Pelanggan','Status prioritas dan manfaat pelanggan setia');
      const s=this.state.settings||{};
      const l=this.state.loyalty;
      if(String(s.loyalty_enabled).toLowerCase()!=='true'){
        U.$('#content').innerHTML=`<div class="card empty-state"><b>Program loyalty belum aktif</b><p>Barbershop belum mengaktifkan program loyalty untuk pelanggan.</p></div>`;
        return;
      }
      if(!l){
        U.$('#content').innerHTML=`<div class="card empty-state"><b>Data loyalty belum dimuat</b><p>Tekan refresh untuk mengambil status loyalty terbaru.</p><button class="primary-btn" id="btn-refresh-loyalty">Refresh Loyalty</button></div>`;
        const b=U.$('#btn-refresh-loyalty'); if(b) b.onclick=()=>this.refresh();
        return;
      }
      const level=l.priority_level||'NORMAL';
      U.$('#content').innerHTML=`<div class="card loyalty-card ${level==='VIP'?'vip':(level==='PRIORITY'?'priority':'normal')}"><div class="section-title" style="margin-top:0"><h2>⭐ ${U.esc(l.program_name)}</h2><span class="badge">${U.esc(level)}</span></div><p>${U.esc(l.program_description||'')}</p><div class="loyalty-progress big"><span style="width:${Number(l.progress_percent||0)}%"></span></div><div class="grid grid-4" style="margin-top:14px">${this.stat('Kunjungan Lunas',l.total_paid_visits||0,'Dari history Payments')}${this.stat('Total Belanja',U.rupiah(l.total_paid_amount||0),'Transaksi PAID')}${this.stat('Poin',l.points||0,'Akumulasi')}${this.stat('Kunjungan Periode',l.visits_in_period||0,'Periode berjalan')}</div><div class="card soft" style="margin-top:16px"><h3>Benefit Saat Ini</h3><p><b>${U.esc(l.benefit||'')}</b></p><p>${U.esc(l.next_target_text||'')}</p><small>Catatan: status loyalty dihitung otomatis dari pembayaran berstatus PAID. Jika pembayaran baru saja dicatat, tekan Refresh agar status terbaru tampil.</small></div></div>`;
    },
    customerHistory(){ this.setTitle('Riwayat Booking','Semua booking milik pelanggan'); U.$('#content').innerHTML=`<div class="card">${this.todayBookingsTable(this.state.bookings,'customerHistoryBookings')}</div>`; },
    operatorQueue(){ this.setTitle('Antrian Saya','Panggil, mulai, dan selesaikan orderan'); U.$('#content').innerHTML=`<div class="card">${this.operatorActionList(this.state.bookings)}</div>`; },
    operatorHistory(){ this.setTitle('Riwayat Layanan','Order hari ini dan riwayat status'); U.$('#content').innerHTML=`<div class="card">${this.todayBookingsTable(this.state.bookings,'operatorHistoryBookings')}</div>`; },
    operatorActionList(rows){ return `<h3>Order Hari Ini</h3><div class="queue-list">${rows.length?rows.map(b=>`<div class="queue-item status-${U.esc(String(b.status||'').toLowerCase())}"><div class="queue-no">${U.esc(b.queue_no)}</div><div class="queue-main"><b>${U.esc(b.customer_name)} · ${U.esc(b.service_name)}</b><span>${U.esc(U.formatTime(b.slot_time))} · ${U.statusLabel(b.status)} · ${U.paymentLabel(b.payment_status)}</span><small class="operator-hint">${this.operatorFlowHint(b)}</small></div><div class="action-row operator-actions">${this.operatorButtons(b)}</div></div>`).join(''):'<div class="empty-state"><b>Belum ada order</b><p>Order baru akan tampil otomatis.</p></div>'}</div>`; },
    operatorFlowHint(b){
      const st=String(b.status||'').toUpperCase();
      const pay=String(b.payment_status||'UNPAID').toUpperCase();
      if(st==='NO_SHOW') return 'Pelanggan tidak hadir. Semua aksi dikunci, pelanggan harus booking ulang.';
      if(st==='CANCELLED') return 'Booking dibatalkan.';
      if(st==='BOOKED' || st==='CHECKED_IN') return 'Aksi aktif: Panggil atau No Show.';
      if(st==='CALLED') return 'Aksi aktif: Mulai atau No Show.';
      if(st==='IN_SERVICE') return 'Aksi aktif: Selesai.';
      if(st==='FINISHED' && pay!=='PAID') return 'Aksi aktif: Bayar.';
      if(st==='FINISHED' && pay==='PAID') return 'Transaksi selesai dan lunas. Struk dapat dicetak.';
      return '';
    },
    operatorButtons(b){
      const id=U.esc(b.booking_id);
      const st=String(b.status||'').toUpperCase();
      const pay=String(b.payment_status||'UNPAID').toUpperCase();
      const active={
        call: st==='BOOKED' || st==='CHECKED_IN',
        start: st==='CALLED',
        finish: st==='IN_SERVICE',
        payment: st==='FINISHED' && pay!=='PAID',
        noshow: st==='BOOKED' || st==='CHECKED_IN' || st==='CALLED',
        receipt: st==='FINISHED'
      };
      const dis=k=>active[k]?'':' disabled aria-disabled="true"';
      const price=U.esc(b.price||0);
      return `<button class="ghost-btn mini" data-action="call" data-id="${id}"${dis('call')}>Panggil</button><button class="success-btn mini" data-action="start" data-id="${id}"${dis('start')}>Mulai</button><button class="primary-btn mini" data-action="finish" data-id="${id}"${dis('finish')}>Selesai</button><button class="warning-btn mini" data-action="payment" data-id="${id}" data-price="${price}"${dis('payment')}>Bayar</button><button class="danger-btn mini" data-action="noshow" data-id="${id}"${dis('noshow')}>No Show</button><button class="ghost-btn mini" data-action="receipt" data-id="${id}"${dis('receipt')}>Struk</button>`;
    },
    todayBookingsTable(rows,key='bookingsTable'){
      const sorted=this.sortNewestRows(rows||[]);
      const meta=this.paginate(key,sorted);
      return `<div class="section-title" style="margin-top:0"><h2>Data Booking</h2><button class="ghost-btn small" data-export="bookings">Export CSV</button></div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>No</th><th>Pelanggan</th><th>Layanan</th><th>Operator</th><th>Jam</th><th>Harga</th><th>Status</th><th>Bayar</th><th>Aksi</th></tr></thead><tbody>${meta.rows.map(b=>`<tr><td>${U.esc(U.formatDate(b.booking_date))}</td><td>${U.esc(b.queue_no)}</td><td>${U.esc(b.customer_name)}</td><td>${U.esc(b.service_name)}</td><td>${U.esc(b.operator_name)}</td><td>${U.esc(U.formatTime(b.slot_time))}</td><td>${U.rupiah(b.price)}</td><td>${U.badge(b.status)}</td><td>${U.paymentLabel(b.payment_status)}</td><td><div class="action-row no-wrap-actions">${this.state.user.role!=='CUSTOMER'?this.operatorButtons(b):(String(b.status||'').toUpperCase()==='FINISHED'?`<button class="ghost-btn mini" data-action="receipt" data-id="${U.esc(b.booking_id)}">Struk</button>`:'')}</div></td></tr>`).join('')||'<tr><td colspan="10">Belum ada data.</td></tr>'}</tbody></table></div>${this.paginationControls(key,meta)}`;
    },

    bookingCalendarPage(){
      this.setTitle('Kalender Booking','Klik tanggal untuk detail');
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const currentMonth = this.state.calendarMonth || defaultMonth;
      const opOptions = this.state.user.role==='ADMIN'
        ? `<label>Operator<select id="calendar-operator"><option value="">Semua Operator</option>${this.state.operators.map(o=>`<option value="${U.esc(o.operator_id)}" ${String(this.state.calendarOperator||'')===String(o.operator_id)?'selected':''}>${U.esc(o.operator_name)}</option>`).join('')}</select></label>`
        : '';
      U.$('#content').innerHTML=`<div class="card"><div class="toolbar calendar-toolbar"><button class="ghost-btn" id="btn-calendar-prev">‹ Bulan Sebelumnya</button><label>Bulan<input id="calendar-month" type="month" value="${U.esc(currentMonth)}"></label>${opOptions}<button class="primary-btn" id="btn-load-calendar">Tampilkan</button><button class="ghost-btn" id="btn-calendar-today">Bulan Ini</button></div><small>Tanggal yang sudah lewat tetap tampil dan diarsir abu-abu. Booking tanggal lampau yang belum selesai akan otomatis berubah menjadi No Show saat data dimuat.</small></div><div class="card" style="margin-top:16px" id="calendar-wrap">${this.renderCalendarMatrix()}</div>`;
      const key = `${currentMonth}|${this.state.calendarOperator||''}`;
      if(!this.state.calendar || this.state.calendarKey!==key){
        setTimeout(()=>this.loadBookingCalendar(),0);
      }
    },
    renderCalendarMatrix(){
      const cal=this.state.calendar;
      if(!cal) return `<div class="empty-state"><b>Kalender belum dimuat</b><p>Tekan tombol Tampilkan untuk mengambil matrik booking.</p></div>`;
      const headings=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
      const first=cal.days && cal.days[0] ? cal.days[0] : null;
      const offset=first ? ((Number(first.weekday)+6)%7) : 0;
      const blanks=Array.from({length:offset}).map(()=>`<div class="calendar-cell blank"></div>`).join('');
      const cells=(cal.days||[]).map(d=>{
        const cls=['calendar-cell']; if(d.is_past) cls.push('past'); if(d.is_today) cls.push('today'); if(Number(d.total||0)>0) cls.push('has-booking');
        const statusLine = Number(d.total||0)>0
          ? `<div class="calendar-chips"><span>${Number(d.active||0)} Aktif</span><span>${Number(d.finished||0)} Selesai</span><span>${Number(d.cancelled||0)} Batal</span><span>${Number(d.no_show||0)} No Show</span></div>`
          : `<small class="muted">Kosong</small>`;
        return `<button type="button" class="${cls.join(' ')}" data-calendar-date="${U.esc(d.date)}"><div class="calendar-date-head"><b>${d.day}</b>${d.total?`<em>${d.total} order</em>`:''}</div>${statusLine}</button>`;
      }).join('');
      return `<div class="section-title" style="margin-top:0"><h2>${U.esc(cal.month_label||'Kalender')}</h2><span class="badge">${U.esc(U.formatDate(cal.date_from))} - ${U.esc(U.formatDate(cal.date_to))}</span></div><div class="calendar-legend"><span><i class="legend-dot today"></i>Hari ini</span><span><i class="legend-dot past"></i>Tanggal lewat</span><span><i class="legend-dot active"></i>Ada booking</span></div><div class="calendar-grid headings">${headings.map(h=>`<div>${h}</div>`).join('')}</div><div class="calendar-grid">${blanks}${cells}</div>`;
    },
    async loadBookingCalendar(){
      try{
        const m=U.$('#calendar-month')?.value || this.state.calendarMonth || U.today().slice(0,7);
        const op=U.$('#calendar-operator')?.value || this.state.calendarOperator || '';
        this.state.calendarMonth=m; this.state.calendarOperator=op;
        const [year,month]=m.split('-').map(Number);
        this.loading(true,'Memuat matrik kalender...');
        const r=await this.api('getBookingCalendar',{year,month_number:month,operator_id:op});
        this.state.calendar=r;
        this.state.calendarKey=`${m}|${op}`;
        const box=U.$('#calendar-wrap'); if(box) box.innerHTML=this.renderCalendarMatrix();
        this.bindContentEvents();
      }catch(err){U.toast('Kalender gagal dimuat',err.message,'error')}
      finally{this.loading(false)}
    },
    shiftCalendarMonth(delta){
      const base=this.state.calendarMonth || U.today().slice(0,7);
      const [y,m]=base.split('-').map(Number);
      const d=new Date(y,m-1+Number(delta||0),1);
      this.state.calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      this.state.calendar=null;
      this.render(false);
    },
    showCalendarDayDetail(date){
      const cal=this.state.calendar; if(!cal) return;
      const day=(cal.days||[]).find(d=>String(d.date)===String(date));
      if(!day) return;
      const rows=day.bookings||[];
      const summary=`<div class="grid grid-4">${this.stat('Total',day.total||0,'Order')}${this.stat('Selesai',day.finished||0,'')}${this.stat('Batal',day.cancelled||0,'')}${this.stat('No Show',day.no_show||0,'')}</div>`;
      const table=`<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>No</th><th>Pelanggan</th><th>No HP</th><th>Layanan</th><th>Operator</th><th>Jam Rencana</th><th>Status</th><th>Bayar</th></tr></thead><tbody>${rows.map(b=>`<tr><td>${U.esc(b.queue_no||'-')}</td><td>${U.esc(b.customer_name||'-')}</td><td>${U.esc(b.customer_phone||'-')}</td><td>${U.esc(b.service_name||'-')}</td><td>${U.esc(b.operator_name||'-')}</td><td>${U.esc(U.formatTime(b.slot_time)||'-')}</td><td>${U.badge(b.status)}</td><td>${U.paymentLabel(b.payment_status)}</td></tr>`).join('')||'<tr><td colspan="8">Kosong pada tanggal ini.</td></tr>'}</tbody></table></div>`;
      const note=day.is_past?`<small>Tanggal ini sudah lewat. Booking yang belum selesai akan otomatis menjadi No Show, sedangkan transaksi selesai tetap menampilkan status bayar.</small>`:`<small>Data menampilkan booking sesuai otorisasi login saat ini.</small>`;
      U.modal(`Detail Booking ${U.formatDate(date)}`,`${summary}${table}${note}`);
    },
    adminBookings(){
      this.setTitle('Manajemen Booking','Order pelanggan');
      U.$('#content').innerHTML=`<div class="card"><div class="toolbar"><label>Tanggal<input id="filter-booking-date" type="date" value="${U.today()}"></label><label>Status<select id="filter-status"><option value="">Semua</option>${C.STATUS.map(s=>`<option value="${s}">${U.statusLabel(s)}</option>`).join('')}</select></label><label>Operator<select id="filter-operator"><option value="">Semua</option>${this.state.operators.map(o=>`<option value="${o.operator_id}">${U.esc(o.operator_name)}</option>`).join('')}</select></label><button class="primary-btn" id="btn-filter-bookings">Terapkan</button></div></div><div class="card" style="margin-top:16px">${this.todayBookingsTable(this.state.bookings,'adminBookings')}</div>`;
    },
    adminOperators(){
      this.setTitle('Master Operator','Kelola pemangkas');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><h3>Form Operator</h3><form id="operator-form"><input type="hidden" name="operator_id"><div class="form-grid"><label>Nama Operator<input name="operator_name" required></label><label>No HP<input name="phone" required></label><label>No Kursi<input name="chair_no" placeholder="1"></label><label>Kapasitas Harian<input name="daily_capacity" type="number" value="15"></label><label>Jam Mulai<input name="work_start" type="time" step="1" value="08:00"></label><label>Jam Selesai<input name="work_end" type="time" step="1" value="21:00"></label><label>Tipe Komisi<select name="commission_type"><option value="">Tidak ada</option><option value="PERCENT">Persen</option><option value="FIXED">Nominal</option></select></label><label>Nilai Komisi<input name="commission_value" type="number" value="0"></label><label class="span-2"><input type="checkbox" name="create_login" style="width:auto;margin-right:8px"> Buat/Update akun login operator</label><label class="span-2">Password Operator<input name="password" value="operator123"></label><label class="span-2">Catatan<textarea name="notes"></textarea></label></div><button class="primary-btn full">Simpan Operator</button></form></div><div class="card"><h3>Daftar Operator</h3>${this.operatorCards()}</div></div>`;
    },
    operatorCards(){ return `<div class="queue-list">${this.state.operators.map(o=>`<div class="queue-item"><div class="queue-no">${U.esc(o.chair_no||'-')}</div><div class="queue-main"><b>${U.esc(o.operator_name)}</b><span>${U.esc(o.phone)} · Kap ${U.esc(o.daily_capacity)} · ${U.esc(U.formatTime(o.work_start))}-${U.esc(U.formatTime(o.work_end))}</span></div><button class="ghost-btn mini" data-edit-operator='${JSON.stringify(o).replace(/'/g,'&#39;')}'>Edit</button></div>`).join('')||'<div class="empty-state"><b>Belum ada operator</b></div>'}</div>`; },
    adminServices(){
      this.setTitle('Master Layanan','Jenis layanan, durasi, dan harga');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><h3>Form Layanan</h3><form id="service-form"><input type="hidden" name="service_id"><label>Nama Layanan<input name="service_name" required></label><label>Durasi Menit<input type="number" name="duration_min" value="30" required></label><label>Harga<input type="number" name="price" value="25000" required></label><label>Deskripsi<textarea name="description"></textarea></label><button class="primary-btn full">Simpan Layanan</button></form></div><div class="card"><h3>Daftar Layanan</h3><div class="queue-list">${this.state.services.map(s=>`<div class="queue-item"><div class="queue-no">${U.esc(s.duration_min)}</div><div class="queue-main"><b>${U.esc(s.service_name)}</b><span>${U.rupiah(s.price)} · ${U.esc(s.description||'-')}</span></div><button class="ghost-btn mini" data-edit-service='${JSON.stringify(s).replace(/'/g,'&#39;')}'>Edit</button></div>`).join('')||'<div class="empty-state"><b>Belum ada layanan</b></div>'}</div></div></div>`;
    },
    loyaltyProgramOptions(selected){
      selected=String(selected||'POINTS_PRIORITY').toUpperCase();
      const opts=[
        ['POINTS_PRIORITY','1. Poin Loyal Prioritas'],
        ['VISIT_REWARD','2. Kunjungan Berhadiah'],
        ['SPEND_VIP','3. VIP Berdasarkan Belanja'],
        ['MONTHLY_ACTIVE','4. Pelanggan Aktif Bulanan'],
        ['HYBRID_ELITE','5. Elite Gabungan Visit + Belanja']
      ];
      return opts.map(([v,t])=>`<option value="${v}" ${selected===v?'selected':''}>${t}</option>`).join('');
    },
    adminSettings(){
      this.setTitle('Pengaturan Barbershop','Profil, jam operasional, payment gateway, dan QRIS statis'); const s=this.state.settings;
      const qris=this.qrisAsset(s)?`<div class="span-2">${this.qrisLinkHtml(s,'admin')}</div>`:'<div class="span-2"><small>Belum ada QRIS statis yang diupload.</small></div>';
      U.$('#content').innerHTML=`<div class="card"><form id="settings-form" class="form-grid">
        <label>Nama Barbershop<input name="barbershop_name" value="${U.esc(s.barbershop_name||'BarberBook')}"></label>
        <label>No WhatsApp<input name="whatsapp" value="${U.esc(s.whatsapp||s.contact_phone||'')}"></label>
        <label>Jam Buka<input type="time" step="1" name="open_time" value="${U.esc(U.timeInput(s.open_time)||'08:00')}"></label>
        <label>Jam Tutup<input type="time" step="1" name="close_time" value="${U.esc(U.timeInput(s.close_time)||'21:00')}"></label>
        <label>Jumlah Kursi<input type="number" name="chair_count" value="${U.esc(s.chair_count||3)}"></label>
        <label>Kapasitas per Kursi<input type="number" name="capacity_per_chair" value="${U.esc(s.capacity_per_chair||15)}"></label>
        <label>Durasi Default Menit<input type="number" name="default_service_duration_min" value="${U.esc(s.default_service_duration_min||30)}"></label>
        <label>Maks Booking/Pelanggan/Hari<input type="number" name="max_booking_per_customer_per_day" value="${U.esc(s.max_booking_per_customer_per_day||1)}"></label>
        <label class="span-2">Alamat<textarea name="address">${U.esc(s.address||'')}</textarea></label>
        <label class="span-2">Hari Operasional<input name="operational_days" value="${U.esc(s.operational_days||'1,2,3,4,5,6,0')}"><small>0=Minggu, 1=Senin, dst. Contoh setiap hari: 1,2,3,4,5,6,0</small></label>
        <h3 class="span-2">Program Loyalty Pelanggan</h3>
        <label>Aktifkan Loyalty<select name="loyalty_enabled"><option value="false" ${String(s.loyalty_enabled).toLowerCase()==='true'?'':'selected'}>Tidak Aktif</option><option value="true" ${String(s.loyalty_enabled).toLowerCase()==='true'?'selected':''}>Aktif</option></select></label>
        <label>Jenis Program Loyalty<select name="loyalty_program_type">${this.loyaltyProgramOptions(s.loyalty_program_type)}</select><small>Pilih salah satu dari 5 alternatif program.</small></label>
        <label>Poin per Transaksi Lunas<input type="number" name="loyalty_points_per_paid" value="${U.esc(s.loyalty_points_per_paid||1)}"></label>
        <label>Target Kunjungan/Poin<input type="number" name="loyalty_visit_threshold" value="${U.esc(s.loyalty_visit_threshold||5)}"></label>
        <label>Target Belanja VIP<input type="number" name="loyalty_spend_threshold" value="${U.esc(s.loyalty_spend_threshold||250000)}"></label>
        <label>Reward Setiap Berapa Kunjungan<input type="number" name="loyalty_free_visit_every" value="${U.esc(s.loyalty_free_visit_every||6)}"></label>
        <label>Periode Aktif Bulanan/Hari<input type="number" name="loyalty_monthly_period_days" value="${U.esc(s.loyalty_monthly_period_days||30)}"></label>
        <label>Min. Kunjungan Periode<input type="number" name="loyalty_monthly_visit_min" value="${U.esc(s.loyalty_monthly_visit_min||3)}"></label>
        <label>Elite: Min. Kunjungan<input type="number" name="loyalty_hybrid_visit_min" value="${U.esc(s.loyalty_hybrid_visit_min||8)}"></label>
        <label>Elite: Min. Belanja<input type="number" name="loyalty_hybrid_spend_min" value="${U.esc(s.loyalty_hybrid_spend_min||400000)}"></label>
        <div class="span-2 card soft"><b>5 alternatif loyalty</b><p style="color:var(--muted)">1) Poin Loyal Prioritas, 2) Kunjungan Berhadiah, 3) VIP Berdasarkan Belanja, 4) Pelanggan Aktif Bulanan, 5) Elite Gabungan Visit + Belanja. Semua dihitung dari history Payments berstatus PAID.</p></div>
        <h3 class="span-2">Setting Website & Tripay</h3>
        <label class="span-2">URL Website<input name="website_url" placeholder="https://domain-anda.com" value="${U.esc(s.website_url||location.origin)}"><small>URL ini dipakai untuk pengajuan merchant Tripay.</small></label>
        <label>Aktifkan Payment Gateway<select name="payment_gateway_enabled"><option value="false" ${String(s.payment_gateway_enabled).toLowerCase()==='true'?'':'selected'}>Tidak</option><option value="true" ${String(s.payment_gateway_enabled).toLowerCase()==='true'?'selected':''}>Ya</option></select></label>
        <label>Mode Tripay<select name="tripay_mode"><option value="sandbox" ${String(s.tripay_mode).toLowerCase()==='production'?'':'selected'}>Sandbox</option><option value="production" ${String(s.tripay_mode).toLowerCase()==='production'?'selected':''}>Production</option></select></label>
        <label>Merchant Code<input name="tripay_merchant_code" value="${U.esc(s.tripay_merchant_code||'')}"></label>
        <label>Default Channel<input name="tripay_default_method" value="${U.esc(s.tripay_default_method||'QRIS')}"><small>Contoh: QRIS, BRIVA, BCAVA, BNIVA.</small></label>
        <label class="span-2">API Key Tripay<input name="tripay_api_key" autocomplete="off" value="${U.esc(s.tripay_api_key||'')}"></label>
        <label class="span-2">Private Key Tripay<input name="tripay_private_key" autocomplete="off" value="${U.esc(s.tripay_private_key||'')}"></label>
        <label class="span-2">URL Callback Tripay<input name="tripay_callback_url" value="${U.esc(s.tripay_callback_url||APP_CONFIG.GAS_URL)}"><small>Masukkan URL ini di dashboard Tripay sebagai URL Callback.</small></label>
        <label class="span-2">URL Return Tripay<input name="tripay_return_url" value="${U.esc(s.tripay_return_url||location.href.split('#')[0])}"><small>Halaman tujuan setelah pelanggan membayar.</small></label>
        <div class="span-2 card soft"><b>Whitelist IP Tripay</b><p style="color:var(--muted)">Google Apps Script memakai IP dinamis Google. Jika Tripay meminta Whitelist IP statis, gunakan backend/proxy VPS di tahap produksi. Untuk sandbox biasanya dapat diuji tanpa IP statis.</p></div>
        <button class="primary-btn span-2">Simpan Pengaturan</button></form></div>
        <div class="card" style="margin-top:16px"><h3>QRIS Statis</h3><p style="color:var(--muted)">Upload QRIS statis agar bisa dibuka oleh Pelanggan dan Operator.</p><form id="qris-upload-form" class="form-grid"><label class="span-2">File QRIS<input type="file" name="qris_file" accept="image/png,image/jpeg,image/webp" required></label>${qris}<button class="primary-btn span-2">Upload QRIS Statis</button></form></div>`;
    },
    adminReports(){
      this.setTitle('Report Management','Laporan booking, revenue, dan operator');
      U.$('#content').innerHTML=`<div class="card"><div class="toolbar"><label>Dari<input id="report-from" type="date" value="${U.addDays(-30)}"></label><label>Sampai<input id="report-to" type="date" value="${U.today()}"></label><button class="primary-btn" id="btn-load-report">Tampilkan</button><button class="ghost-btn" onclick="window.print()">Print/PDF</button></div></div><div id="report-output" class="grid" style="margin-top:16px"></div>`;
    },
    notificationsPage(){
      this.setTitle('Notifikasi','Pemberitahuan aplikasi');
      U.$('#content').innerHTML=`<div class="card"><div class="notif-panel">${this.state.notifications.length?this.state.notifications.map(n=>`<div class="notif-item ${String(n.read_status).toLowerCase()==='true'?'':'unread'}"><b>${U.esc(n.title)}</b><p>${U.esc(n.message)}</p><small>${U.esc(U.dateTime(n.created_at))}</small>${String(n.read_status).toLowerCase()==='true'?'':`<div style="margin-top:8px"><button class="ghost-btn mini" data-read-notif="${n.notification_id}">Tandai dibaca</button></div>`}</div>`).join(''):'<div class="empty-state"><b>Tidak ada notifikasi</b></div>'}</div></div>`;
    },
    async checkAvailability(showToast=false){
      const form=U.$('#booking-form');
      if(!form) return;
      const box=U.$('#availability-result');
      const data=U.serialize(form);
      this.state.selectedSlot=null;
      if(!data.booking_date||!data.service_id){
        if(box) box.innerHTML='<div class="empty-state"><b>Pilih layanan terlebih dahulu</b><p>Slot akan muncul otomatis setelah layanan dipilih.</p></div>';
        if(showToast) U.toast('Lengkapi data','Tanggal dan layanan wajib dipilih.','error');
        return;
      }
      try{
        if(box) box.innerHTML='<div class="empty-state"><b>Memuat slot...</b><p>Mengecek ketersediaan jam dari server.</p></div>';
        const r=await this.api('getBookingAvailability',data);
        this.state.availability=r;
        const slots=(r.slots||[]).filter(x=>String(data.operator_id||'ANY')==='ANY'||String(x.operator_id)===String(data.operator_id));
        const availableCount=slots.filter(x=>x.available).length;
        const slotHtml=slots.map(sl=>`<button type="button" class="slot-btn" ${sl.available?'':'disabled'} data-slot="${sl.slot_time}" data-op="${sl.operator_id}"><b>${U.formatTime(sl.slot_time)}</b><span>${U.esc(sl.operator_name)} · Kursi ${U.esc(sl.chair_no||'-')}</span></button>`).join('');
        if(box) box.innerHTML=`<div class="kpi-strip"><span class="badge">Kapasitas: ${r.capacity.effective_capacity}</span><span class="badge">Terpakai: ${r.capacity.used}</span><span class="badge">Sisa: ${r.capacity.remaining}</span><span class="badge">Slot tersedia: ${availableCount}</span></div><div class="section-title"><h2>Pilih Slot</h2></div><div class="slot-grid">${slotHtml||'<div class="empty-state"><b>Tidak ada slot tersedia</b><p>Coba pilih operator lain atau tanggal lain.</p></div>'}</div>`;
        U.$$('.slot-btn').forEach(btn=>btn.onclick=()=>{U.$$('.slot-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');this.state.selectedSlot={slot_time:btn.dataset.slot,operator_id:btn.dataset.op};});
      }
      catch(err){ if(box) box.innerHTML='<div class="empty-state"><b>Slot gagal dimuat</b><p>'+U.esc(err.message)+'</p></div>'; if(showToast) U.toast('Cek slot gagal',err.message,'error'); }
    },
    bindContentEvents(){
      U.$$('[data-go]').forEach(b=>b.onclick=()=>this.go(b.dataset.go));
      U.$$('#content [data-action]').forEach(b=>b.onclick=()=>this.handleAction(b.dataset.action,b.dataset.id,b));
      U.$$('#content form').forEach(f=>{
        f.addEventListener('input',()=>this.markUserEditing(),{passive:true});
        f.addEventListener('change',()=>this.markUserEditing(),{passive:true});
      });
      const bf=U.$('#booking-form'); if(bf){
        const trigger=()=>{ clearTimeout(this._slotTimer); this._slotTimer=setTimeout(()=>this.checkAvailability(false),250); };
        ['booking_date','service_id','operator_id'].forEach(name=>{ if(bf.elements[name]) bf.elements[name].addEventListener('change',trigger,{passive:true}); });
        const btn=U.$('#btn-check-availability'); if(btn) btn.onclick=()=>this.checkAvailability(true);
        bf.onsubmit=async e=>{e.preventDefault(); await this.createBooking(U.serialize(bf));};
      }
      const ff=U.$('#btn-filter-bookings'); if(ff) ff.onclick=()=>this.filterBookings();
      const cm=U.$('#calendar-month'); if(cm) cm.onchange=()=>{this.state.calendarMonth=cm.value; this.state.calendar=null; this.loadBookingCalendar();};
      const co=U.$('#calendar-operator'); if(co) co.onchange=()=>{this.state.calendarOperator=co.value; this.state.calendar=null; this.loadBookingCalendar();};
      const cl=U.$('#btn-load-calendar'); if(cl) cl.onclick=()=>this.loadBookingCalendar();
      const cp=U.$('#btn-calendar-prev'); if(cp) cp.onclick=()=>this.shiftCalendarMonth(-1);
      const cn=U.$('#btn-calendar-today'); if(cn) cn.onclick=()=>{this.state.calendarMonth=U.today().slice(0,7); this.state.calendar=null; this.render(false);};
      U.$$('[data-calendar-date]').forEach(b=>b.onclick=()=>this.showCalendarDayDetail(b.dataset.calendarDate));
      const of=U.$('#operator-form'); if(of) of.onsubmit=async e=>{e.preventDefault(); await this.saveOperator(U.serialize(of));};
      const sf=U.$('#service-form'); if(sf) sf.onsubmit=async e=>{e.preventDefault(); await this.saveService(U.serialize(sf));};
      const st=U.$('#settings-form'); if(st) st.onsubmit=async e=>{e.preventDefault(); await this.saveSettings(U.serialize(st));};
      const qf=U.$('#qris-upload-form'); if(qf) qf.onsubmit=async e=>{e.preventDefault(); await this.uploadQrisStatic(qf);};
      U.$$('[data-edit-operator]').forEach(b=>b.onclick=()=>{const o=JSON.parse(b.getAttribute('data-edit-operator')); const f=U.$('#operator-form'); Object.keys(o).forEach(k=>{if(f.elements[k]) f.elements[k].value=(f.elements[k].type==='time'?U.timeInput(o[k]):o[k])}); window.scrollTo({top:0,behavior:'smooth'});});
      U.$$('[data-edit-service]').forEach(b=>b.onclick=()=>{const s=JSON.parse(b.getAttribute('data-edit-service')); const f=U.$('#service-form'); Object.keys(s).forEach(k=>{if(f.elements[k]) f.elements[k].value=(f.elements[k].type==='time'?U.timeInput(s[k]):s[k])}); window.scrollTo({top:0,behavior:'smooth'});});
      U.$$('[data-export="bookings"]').forEach(b=>b.onclick=()=>U.csvDownload('booking-barbershop.csv',this.state.bookings));
      U.$$('[data-read-notif]').forEach(b=>b.onclick=()=>this.markNotif(b.dataset.readNotif));
      // QRIS statis sengaja tidak dirender sebagai gambar otomatis agar loading halaman lebih ringan.
      U.$$('[data-page-key]').forEach(b=>b.onclick=()=>{ const st=this.getTableState(b.dataset.pageKey); st.page=Number(b.dataset.page||1); if(b.dataset.pageKey==='reportBookings') this.renderReportBookingsPage(); else this.render(false); });
      U.$$('[data-page-size-key]').forEach(sel=>sel.onchange=()=>{ const st=this.getTableState(sel.dataset.pageSizeKey); st.pageSize=Number(sel.value||20); st.page=1; if(sel.dataset.pageSizeKey==='reportBookings') this.renderReportBookingsPage(); else this.render(false); });
      const rp=U.$('#btn-load-report'); if(rp) rp.onclick=()=>this.loadReports();
    },
    async createBooking(data){
      if(!this.state.selectedSlot){ U.toast('Pilih slot','Klik Cek Slot lalu pilih jam yang tersedia.','error'); return; }
      try{ this.loading(true,'Menyimpan booking...'); const payload=Object.assign({},data,this.state.selectedSlot); const r=await this.api('createBooking',payload); U.toast('Booking berhasil',`Nomor antrian ${r.booking.queue_no}`,'success'); this.go('dashboard'); await this.refresh(); }
      catch(err){ U.toast('Booking gagal',err.message,'error'); }
      finally{this.loading(false)}
    },
    async handleAction(action,id,btn){
      if(btn && btn.disabled) return;
      const map={call:'callCustomer',start:'startService',finish:'finishService',checkIn:'checkInBooking'};
      if(action==='cancelBooking'){ const ok=await U.confirm('Batalkan Booking','Booking akan dibatalkan. Lanjutkan?'); if(!ok)return; return this.runBookingAction('cancelBooking',{booking_id:id,cancel_reason:'Dibatalkan pengguna'}); }
      if(action==='noshow'){ const ok=await U.confirm('Tandai No Show','Pelanggan akan ditandai tidak hadir. Setelah No Show, semua tombol dikunci dan pelanggan harus booking ulang dari awal. Lanjutkan?'); if(!ok)return; return this.runBookingAction('markNoShow',{booking_id:id}); }
      if(action==='payment') return this.paymentModal(id, btn.dataset.price);
      if(action==='receipt') return this.receiptModal(id);
      if(action==='tripayCustomer') return this.createTripayInvoice(id, btn.dataset.price);
      if(map[action]) return this.runBookingAction(map[action],{booking_id:id});
    },
    async runBookingAction(apiAction,payload){ try{ this.loading(true,'Memproses...'); const r=await this.api(apiAction,payload); U.toast('Berhasil',r.message||'Data diperbarui.','success'); await this.refresh(); return r; }catch(err){U.toast('Gagal',err.message,'error'); return null;}finally{this.loading(false)} },
    paymentModal(id,price){
      const booking=this.getBookingById(id)||{};
      const tripayOn=String(this.state.settings.payment_gateway_enabled).toLowerCase()==='true';
      U.modal('Input Pembayaran',`<form id="payment-form"><div class="receipt-mini"><b>Transaksi</b><span>No. Antrian ${U.esc(booking.queue_no||'-')} · ${U.esc(booking.customer_name||'-')}</span><span>${U.esc(booking.service_name||'-')} · ${U.rupiah(price||booking.price||0)}</span></div><label>Nominal<input name="amount" type="number" value="${price||booking.price||0}" required></label><label>Metode<select name="method"><option>CASH</option><option>QRIS_STATIS</option><option>TRANSFER</option></select></label><label>Status<select name="status"><option value="PAID">Lunas</option><option value="PARTIAL">Sebagian</option></select></label><label>Catatan<textarea name="notes"></textarea></label><div class="action-row no-wrap-actions"><button class="primary-btn" type="submit">Simpan Pembayaran Manual</button><button class="ghost-btn" type="button" id="btn-print-receipt-preview">Cetak Struk</button></div><small>Struk format thermal 58 mm. Saat dialog print muncul, pilih printer thermal atau Simpan sebagai PDF.</small></form>${tripayOn?`<hr style="border:none;border-top:1px solid var(--border);margin:16px 0"><button class="warning-btn full" id="btn-create-tripay">Buat Invoice Tripay</button>`:''}`);
      U.$('#payment-form').onsubmit=async e=>{e.preventDefault(); const data=U.serialize(e.target); data.booking_id=id; U.closeModal(); const r=await this.runBookingAction('createPayment',data); if(r) this.receiptModal(id, Object.assign({},data,{payment_id:r.payment&&r.payment.payment_id,payment_date:r.payment&&r.payment.payment_date}));};
      const pr=U.$('#btn-print-receipt-preview'); if(pr) pr.onclick=()=>{ const f=U.$('#payment-form'); const data=U.serialize(f); this.printReceipt(id,data); };
      const bt=U.$('#btn-create-tripay'); if(bt) bt.onclick=()=>{U.closeModal(); this.createTripayInvoice(id,price);};
    },
    getBookingById(id){
      const all=[...(this.state.bookings||[])];
      const dash=this.state.dashboard||{};
      if(dash.active_booking) all.push(dash.active_booking);
      return all.find(x=>String(x.booking_id)===String(id))||null;
    },
    receiptData(id, paymentData={}){
      const b=this.getBookingById(id)||{};
      const s=this.state.settings||{};
      const paid=Number(paymentData.amount||b.price||0);
      return {
        shop:s.barbershop_name||'Barbershop',
        address:s.address||'',
        phone:s.whatsapp||s.contact_phone||'',
        booking_id:b.booking_id||id,
        queue_no:b.queue_no||'-',
        customer_name:b.customer_name||'-',
        customer_phone:b.customer_phone||'-',
        service_name:b.service_name||'-',
        operator_name:b.operator_name||'-',
        chair_no:b.chair_no||'-',
        booking_date:U.formatDate(b.booking_date)||'-',
        slot_time:U.formatTime(b.slot_time)||'-',
        finished_at:U.dateTime(b.finished_at)||U.nowDisplay(),
        price:Number(b.price||paymentData.amount||0),
        amount:paid,
        method:paymentData.method||'MANUAL',
        status:paymentData.status||b.payment_status||'PAID',
        notes:paymentData.notes||'',
        payment_id:paymentData.payment_id||'',
        payment_date:U.dateTime(paymentData.payment_date)||U.nowDisplay()
      };
    },
    receiptHtml(id, paymentData={}){
      const r=this.receiptData(id,paymentData);
      return `<div class="receipt-58"><div class="receipt-center"><h1>${U.esc(r.shop)}</h1>${r.address?`<p>${U.esc(r.address)}</p>`:''}${r.phone?`<p>WA: ${U.esc(r.phone)}</p>`:''}</div><hr><div class="receipt-row"><span>No Antrian</span><b>${U.esc(r.queue_no)}</b></div><div class="receipt-row"><span>Tanggal</span><b>${U.esc(r.payment_date)}</b></div><div class="receipt-row"><span>Pelanggan</span><b>${U.esc(r.customer_name)}</b></div><div class="receipt-row"><span>Operator</span><b>${U.esc(r.operator_name)}</b></div><hr><div class="receipt-item"><b>${U.esc(r.service_name)}</b><span>${U.rupiah(r.price)}</span></div><hr><div class="receipt-row total"><span>Total</span><b>${U.rupiah(r.price)}</b></div><div class="receipt-row"><span>Dibayar</span><b>${U.rupiah(r.amount)}</b></div><div class="receipt-row"><span>Metode</span><b>${U.esc(r.method)}</b></div><div class="receipt-row"><span>Status</span><b>${U.paymentLabel(r.status)}</b></div>${r.notes?`<p class="receipt-notes">Catatan: ${U.esc(r.notes)}</p>`:''}<hr><div class="receipt-center"><p>Terima kasih atas kunjungan Anda.</p><p>Simpan struk ini sebagai bukti transaksi.</p></div></div>`;
    },
    receiptModal(id,paymentData={}){
      U.modal('Struk Pembayaran',`<div class="receipt-modal-wrap">${this.receiptHtml(id,paymentData)}</div><div class="action-row no-wrap-actions" style="margin-top:14px"><button class="primary-btn" id="btn-print-receipt">Cetak / Simpan PDF</button><button class="ghost-btn" id="btn-close-receipt">Tutup</button></div><small>Untuk PDF, pilih printer tujuan “Save as PDF” / “Simpan sebagai PDF”. Untuk thermal, pilih printer 58 mm yang sudah terhubung.</small>`);
      const p=U.$('#btn-print-receipt'); if(p) p.onclick=()=>this.printReceipt(id,paymentData);
      const c=U.$('#btn-close-receipt'); if(c) c.onclick=()=>U.closeModal();
    },
    printReceipt(id,paymentData={}){
      const html=this.receiptHtml(id,paymentData);
      const w=window.open('','_blank','width=380,height=720');
      if(!w){ U.toast('Popup diblokir','Izinkan popup untuk mencetak struk.','error'); return; }
      w.document.open();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Struk</title><style>@page{size:58mm auto;margin:3mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.receipt-58{width:52mm;margin:0 auto;font-size:10px;line-height:1.25}.receipt-center{text-align:center}.receipt-center h1{font-size:14px;margin:0 0 3px;text-transform:uppercase}.receipt-center p{margin:2px 0}.receipt-row{display:flex;justify-content:space-between;gap:6px;margin:3px 0}.receipt-row span:first-child{color:#333}.receipt-row b{text-align:right}.receipt-row.total{font-size:12px}.receipt-item{display:flex;justify-content:space-between;gap:6px;margin:5px 0}.receipt-notes{margin:5px 0}hr{border:0;border-top:1px dashed #000;margin:6px 0}@media print{body{width:58mm}.receipt-58{width:52mm}}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print();},250)}</script></body></html>`);
      w.document.close();
    },
    async createTripayInvoice(id, price){
      try{
        this.loading(true,'Membuat invoice Tripay...');
        const r=await this.api('createTripayPayment',{booking_id:id,amount:price||0});
        const url=r.checkout_url||r.payment?.checkout_url;
        U.toast('Invoice Tripay',r.message||'Invoice berhasil dibuat.','success');
        if(url) window.open(url,'_blank');
        await this.refresh();
      }catch(err){U.toast('Tripay gagal',err.message,'error')}
      finally{this.loading(false)}
    },
    async checkTripayStatus(bookingId){
      try{ this.loading(true,'Cek status Tripay...'); const r=await this.api('checkTripayPaymentStatus',{booking_id:bookingId}); U.toast('Status Tripay',r.message,'success'); await this.refresh(); }
      catch(err){U.toast('Cek status gagal',err.message,'error')}
      finally{this.loading(false)}
    },
    async filterBookings(){ try{ this.loading(true); const r=await this.api('listBookings',{date:U.$('#filter-booking-date').value,status:U.$('#filter-status').value,operator_id:U.$('#filter-operator').value}); this.state.bookings=r.bookings||[]; this.render(false); }catch(err){U.toast('Filter gagal',err.message,'error')}finally{this.loading(false)} },
    async saveOperator(data){ try{ this.state.isSaving=true; this.loading(true); const r=await this.api('saveOperator',data); this.state.lastUserEditAt=0; this.state.pollingPausedUntil=0; U.toast('Operator disimpan',r.message,'success'); await this.refresh(); }catch(err){U.toast('Gagal simpan',err.message,'error')}finally{this.state.isSaving=false; this.loading(false)} },
    async saveService(data){ try{ this.state.isSaving=true; this.loading(true); const r=await this.api('saveService',data); this.state.lastUserEditAt=0; this.state.pollingPausedUntil=0; U.toast('Layanan disimpan',r.message,'success'); await this.refresh(); }catch(err){U.toast('Gagal simpan',err.message,'error')}finally{this.state.isSaving=false; this.loading(false)} },
    async uploadQrisStatic(form){
      try{
        const file = form.elements.qris_file.files[0];

        if(!file) {
          U.toast('File kosong', 'Pilih file QRIS terlebih dahulu.', 'error');
          return;
        }

        this.loading(true, 'Menyiapkan gambar QRIS...');

        const base64_data = await U.fileToQrisDataUrl(file);

        this.loading(true, 'Upload QRIS 0%...');

        const r = await Api.uploadQrisStaticChunked({
          token: this.state.token,
          base64_data,
          filename: file.name,
          mime: 'image/jpeg',
          onProgress: (pct) => {
            this.loading(true, 'Upload QRIS ' + pct + '%...');
          }
        });

        if(r.qris_static_url) this.state.settings.qris_static_url = r.qris_static_url;
        if(r.qris_static_view_url) this.state.settings.qris_static_view_url = r.qris_static_view_url;
        if(r.qris_static_download_url) this.state.settings.qris_static_download_url = r.qris_static_download_url;
        if(r.file_id) this.state.settings.qris_static_file_id = r.file_id;
        U.toast('QRIS disimpan', r.message || 'QRIS statis berhasil diupload.', 'success');
        await this.refresh();

      }catch(err){
        U.toast('Upload QRIS gagal', err.message, 'error');
      }finally{
        this.loading(false);
      }
    },
    async saveSettings(data){ try{ this.state.isSaving=true; this.loading(true); const r=await this.api('saveSettings',{settings:data}); this.state.lastUserEditAt=0; this.state.pollingPausedUntil=0; U.toast('Setting disimpan',r.message,'success'); await this.refresh(); }catch(err){U.toast('Gagal simpan',err.message,'error')}finally{this.state.isSaving=false; this.loading(false)} },
    async markNotif(id){ try{ await this.api('markNotificationRead',{notification_id:id}); await this.refresh(); }catch(err){U.toast('Gagal',err.message,'error')} },
    renderReportBookingsPage(){
      const box=U.$('#report-bookings-card');
      if(box) box.innerHTML=this.todayBookingsTable(this.state.reportBookings||[],'reportBookings');
      this.bindContentEvents();
    },
    async loadReports(){
      try{ this.loading(true); const date_from=U.$('#report-from').value, date_to=U.$('#report-to').value; const [b,r,o]=await Promise.all([this.api('getReportBookings',{date_from,date_to}),this.api('getReportRevenue',{date_from,date_to}),this.api('getReportOperators',{date_from,date_to})]); const bars=this.bars(r.by_date||{}); U.$('#report-output').innerHTML=`<div class="grid grid-4">${this.stat('Total Booking',b.summary.total,'Periode')}${this.stat('Selesai',b.summary.finished,'Transaksi')}${this.stat('Revenue',U.rupiah(r.total_revenue),'Selesai')}${this.stat('Unpaid',U.rupiah(b.summary.unpaid_amount),'Belum lunas')}</div><div class="grid grid-2"><div class="card"><h3>Revenue per Tanggal</h3>${bars}</div><div class="card"><h3>Performa Operator</h3><div class="table-wrap"><table><thead><tr><th>Operator</th><th>Pelanggan</th><th>Revenue</th><th>Durasi Rata-rata</th></tr></thead><tbody>${(o.operators||[]).map(x=>`<tr><td>${U.esc(x.operator_name)}</td><td>${x.total_customer}</td><td>${U.rupiah(x.total_revenue)}</td><td>${x.avg_duration_min} menit</td></tr>`).join('')||'<tr><td colspan="4">Belum ada data.</td></tr>'}</tbody></table></div></div></div><div class="card" id="report-bookings-card">${this.todayBookingsTable(b.bookings||[],'reportBookings')}</div>`; this.state.reportBookings=b.bookings||[]; this.state.bookings=b.bookings||[]; this.bindContentEvents(); }catch(err){U.toast('Report gagal',err.message,'error')}finally{this.loading(false)}
    },
    bars(obj){ const entries=Object.entries(obj); const max=Math.max(1,...entries.map(e=>Number(e[1]||0))); return `<div class="chart-bars">${entries.map(([k,v])=>`<div class="bar-row"><b>${U.esc(k)}</b><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,Number(v)/max*100)}%"></div></div><span>${U.rupiah(v)}</span></div>`).join('')||'<div class="empty-state"><b>Belum ada revenue</b></div>'}</div>`; }
  };
  window.App=App;
  document.addEventListener('DOMContentLoaded',()=>App.init());
})();
