(function(){
  const U = window.Utils;
  const C = window.CONSTANTS;
  const App = {
    state:{ token:'', user:null, settings:{}, operators:[], services:[], bookings:[], queue:null, notifications:[], unread_count:0, page:'dashboard', polling:null, selectedSlot:null, isSaving:false, lastUserEditAt:0, pollingPausedUntil:0, refreshBusy:false, tablePages:{} },
    nav:{
      ADMIN:[['dashboard','🏠','Dashboard'],['bookings','📋','Booking'],['operators','💈','Operator'],['services','🧾','Layanan'],['settings','⚙️','Setting'],['reports','📊','Report']],
      OPERATOR:[['dashboard','🏠','Dashboard'],['myQueue','📣','Antrian Saya'],['history','🕒','Riwayat'],['notifications','🔔','Notifikasi']],
      CUSTOMER:[['dashboard','🏠','Dashboard'],['booking','🗓️','Booking'],['queue','📡','Antrian Live'],['history','🕒','Riwayat'],['notifications','🔔','Notifikasi']]
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
      clearInterval(this.state.polling); localStorage.removeItem(APP_CONFIG.STORAGE_KEY); this.state={token:'',user:null,settings:{},operators:[],services:[],bookings:[],queue:null,notifications:[],unread_count:0,page:'dashboard',polling:null,selectedSlot:null,isSaving:false,lastUserEditAt:0,pollingPausedUntil:0,refreshBusy:false,tablePages:{}}; this.showAuth();
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
      const snap=await this.api('getAppSnapshot',{date,page:this.state.page,include_notifications:!silent,include_history:includeHistory});
      this.state.settings=snap.settings||{};
      this.state.operators=snap.operators||[];
      this.state.services=snap.services||[];
      if(!silent || (snap.notifications||[]).length) this.state.notifications=snap.notifications||this.state.notifications||[];
      this.state.dashboard=snap.dashboard||null;
      this.state.queue=snap.queue||(snap.dashboard&&snap.dashboard.queue)||null;
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
    qrisImgUrl(settings={}){
      const fileId = settings.qris_static_file_id || this.extractDriveFileId(settings.qris_static_url || '');
      if(fileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
      return settings.qris_static_url || '';
    },
    extractDriveFileId(url){
      const raw=String(url||'');
      let m=raw.match(/[?&]id=([^&]+)/); if(m) return decodeURIComponent(m[1]);
      m=raw.match(/\/d\/([^/]+)/); if(m) return m[1];
      return '';
    },
    qrisImageHtml(settings={}, maxWidth='260px'){
      const src=this.qrisImgUrl(settings);
      if(!src) return '';
      const fileId=settings.qris_static_file_id || this.extractDriveFileId(settings.qris_static_url||'');
      const fallback=fileId?`https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`:(settings.qris_static_url||'');
      return `<img src="${U.esc(src)}" data-fallback-src="${U.esc(fallback)}" alt="QRIS Statis" class="qris-img" style="max-width:${maxWidth}">`;
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
      const map={dashboard:()=>this.adminDashboard(),bookings:()=>this.adminBookings(),operators:()=>this.adminOperators(),services:()=>this.adminServices(),settings:()=>this.adminSettings(),reports:()=>this.adminReports(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    renderOperator(page){
      const map={dashboard:()=>this.operatorDashboard(),myQueue:()=>this.operatorQueue(),history:()=>this.operatorHistory(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    renderCustomer(page){
      const map={dashboard:()=>this.customerDashboard(),booking:()=>this.customerBooking(),queue:()=>this.queueLivePage(),history:()=>this.customerHistory(),notifications:()=>this.notificationsPage()};
      (map[page]||map.dashboard)();
    },
    adminDashboard(){
      this.setTitle('Dashboard Admin','Ringkasan operasional barbershop hari ini'); const s=this.state.dashboard?.summary||{};
      U.$('#content').innerHTML=`${this.summaryCards(s)}<div class="grid grid-2" style="margin-top:16px"><div class="card">${this.queuePreview()}</div><div class="card">${this.todayBookingsTable(this.state.bookings.slice(0,8),'dashboardBookings')}</div></div>`;
    },
    operatorDashboard(){
      this.setTitle('Dashboard Operator','Order masuk ke operator hari ini'); const s=this.state.dashboard?.summary||{};
      U.$('#content').innerHTML=`${this.summaryCards(s)}<div class="card" style="margin-top:16px">${this.operatorActionList(this.state.bookings)}</div>`;
    },
    customerDashboard(){
      this.setTitle('Dashboard Pelanggan','Pantau booking, pembayaran, dan antrian secara live'); const b=this.state.dashboard?.active_booking;
      const bookingHtml=b?`<div class="card soft"><h3>Booking Aktif Anda</h3><div class="grid grid-4">${this.stat('Nomor Antrian',b.queue_no,'')}${this.stat('Status',U.statusLabel(b.status),'')}${this.stat('Operator',b.operator_name||'-','')}${this.stat('Jam',U.formatTime(b.slot_time)||'-','')}</div><div class="action-row" style="margin-top:16px"><button class="success-btn" data-action="checkIn" data-id="${b.booking_id}">Check-in</button><button class="danger-btn" data-action="cancelBooking" data-id="${b.booking_id}">Batalkan</button></div></div>${this.paymentInfoCard(b)}`:`<div class="card empty-state"><b>Belum ada booking aktif hari ini</b><p>Silakan buat booking baru sesuai jadwal yang tersedia.</p><button class="primary-btn" data-go="booking">Buat Booking</button></div>`;
      U.$('#content').innerHTML=`${bookingHtml}<div class="card" style="margin-top:16px">${this.queuePreview()}</div>`;
    },
    queuePreview(){
      const q=this.state.queue||this.state.dashboard?.queue||{}; const cur=q.current||[];
      return `<div class="section-title" style="margin-top:0"><h2>Antrian Live</h2><span class="badge">Next: ${q.next_queue||'-'}</span></div><div class="grid grid-3">${this.stat('Menunggu',q.waiting_count||0,'Antrian belum selesai')}${this.stat('Selesai',q.finished_count||0,'Hari ini')}${this.stat('Sedang Dilayani',cur.length,'Kursi aktif')}</div><div class="section-title"><h2>Sedang Dilayani</h2></div><div class="queue-list">${cur.length?cur.map(x=>`<div class="queue-item"><div class="queue-no">${U.esc(x.queue_no)}</div><div class="queue-main"><b>${U.esc(x.customer_initial)} · ${U.esc(x.service_name)}</b><span>${U.esc(x.operator_name)} · Kursi ${U.esc(x.chair_no||'-')} · ${x.running_duration_min||0} menit</span></div></div>`).join(''):'<div class="empty-state"><b>Belum ada yang sedang dilayani</b><p>Data akan refresh otomatis.</p></div>'}</div>`;
    },
    paymentInfoCard(b){
      const st=String(b.payment_status||'UNPAID').toUpperCase();
      if(st==='PAID') return `<div class="card" style="margin-top:16px"><h3>Pembayaran</h3><p>Status: <b>${U.paymentLabel(st)}</b></p></div>`;
      const s=this.state.settings||{};
      const qris=this.qrisImgUrl(s)?`<div style="margin-top:12px"><b>QRIS Statis</b><p style="color:var(--muted)">Silakan scan QRIS, lalu tunjukkan bukti pembayaran ke Operator.</p>${this.qrisImageHtml(s,'260px')}</div>`:'';
      const tripay=String(s.payment_gateway_enabled).toLowerCase()==='true'?`<button class="primary-btn" data-action="tripayCustomer" data-id="${U.esc(b.booking_id)}" data-price="${U.esc(b.price||0)}">Bayar Online Tripay</button>`:'';
      return `<div class="card" style="margin-top:16px"><div class="section-title" style="margin-top:0"><h2>Pembayaran</h2><span class="badge">${U.paymentLabel(st)}</span></div><p>Total tagihan: <b>${U.rupiah(b.price||0)}</b></p><div class="action-row">${tripay}</div>${qris}</div>`;
    },
    customerBooking(){
      this.setTitle('Booking Baru','Pilih layanan, lalu klik slot jam yang tersedia');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><form id="booking-form"><div class="form-grid"><label>Tanggal Booking<input type="date" name="booking_date" value="${U.today()}" required></label><label>Layanan<select name="service_id" required><option value="">Pilih layanan</option>${this.state.services.map(s=>`<option value="${s.service_id}">${U.esc(s.service_name)} · ${U.rupiah(s.price)} · ${s.duration_min} menit</option>`).join('')}</select><small>Setelah layanan dipilih, slot otomatis ditampilkan. Pelanggan cukup klik jam yang tersedia.</small></label><label class="span-2">Operator<select name="operator_id"><option value="ANY">Operator mana saja</option>${this.state.operators.map(o=>`<option value="${o.operator_id}">${U.esc(o.operator_name)} · Kursi ${U.esc(o.chair_no||'-')}</option>`).join('')}</select></label></div><div id="availability-result" style="margin-top:16px"><div class="empty-state"><b>Pilih layanan terlebih dahulu</b><p>Slot akan digenerate otomatis berdasarkan durasi layanan, jam kerja operator, dan booking yang sudah masuk.</p></div></div><button class="primary-btn full" type="submit" style="margin-top:16px">Konfirmasi Booking</button></form></div><div class="card">${this.queuePreview()}</div></div>`;
    },
    queueLivePage(){ this.setTitle('Antrian Live','Pantau kapasitas dan status pelanggan yang sedang dilayani'); U.$('#content').innerHTML=`<div class="card">${this.queuePreview()}</div><div class="card" style="margin-top:16px">${this.queueTable()}</div>`; },
    queueTable(){
      const q=this.sortNewestRows((this.state.queue||this.state.dashboard?.queue||{}).queue||[]);
      const meta=this.paginate('queueTable',q);
      return `<h3>Daftar Antrian Hari Ini</h3><div class="table-wrap"><table><thead><tr><th>No</th><th>Pelanggan</th><th>Layanan</th><th>Operator</th><th>Jam</th><th>Status</th></tr></thead><tbody>${meta.rows.map(x=>`<tr><td>${x.queue_no}</td><td>${U.esc(x.customer_initial)}</td><td>${U.esc(x.service_name)}</td><td>${U.esc(x.operator_name)}</td><td>${U.esc(U.formatTime(x.slot_time))}</td><td>${U.badge(x.status)}</td></tr>`).join('')||'<tr><td colspan="6">Belum ada antrian.</td></tr>'}</tbody></table></div>${this.paginationControls('queueTable',meta)}`;
    },
    customerHistory(){ this.setTitle('Riwayat Booking','Semua booking milik pelanggan'); U.$('#content').innerHTML=`<div class="card">${this.todayBookingsTable(this.state.bookings,'customerHistoryBookings')}</div>`; },
    operatorQueue(){ this.setTitle('Antrian Saya','Panggil, mulai, dan selesaikan order pelanggan'); U.$('#content').innerHTML=`<div class="card">${this.operatorActionList(this.state.bookings)}</div>`; },
    operatorHistory(){ this.setTitle('Riwayat Layanan','Order operator hari ini dan riwayat status'); U.$('#content').innerHTML=`<div class="card">${this.todayBookingsTable(this.state.bookings,'operatorHistoryBookings')}</div>`; },
    operatorActionList(rows){ return `<h3>Order Hari Ini</h3><div class="queue-list">${rows.length?rows.map(b=>`<div class="queue-item"><div class="queue-no">${U.esc(b.queue_no)}</div><div class="queue-main"><b>${U.esc(b.customer_name)} · ${U.esc(b.service_name)}</b><span>${U.esc(U.formatTime(b.slot_time))} · ${U.statusLabel(b.status)} · ${U.paymentLabel(b.payment_status)}</span></div><div class="action-row">${this.operatorButtons(b)}</div></div>`).join(''):'<div class="empty-state"><b>Belum ada order</b><p>Order baru akan tampil otomatis.</p></div>'}</div>`; },
    operatorButtons(b){ const id=U.esc(b.booking_id); return `<button class="ghost-btn mini" data-action="call" data-id="${id}">Panggil</button><button class="success-btn mini" data-action="start" data-id="${id}">Mulai</button><button class="primary-btn mini" data-action="finish" data-id="${id}">Selesai</button><button class="warning-btn mini" data-action="payment" data-id="${id}" data-price="${b.price}">Bayar</button><button class="danger-btn mini" data-action="noshow" data-id="${id}">No Show</button>`; },
    todayBookingsTable(rows,key='bookingsTable'){
      const sorted=this.sortNewestRows(rows||[]);
      const meta=this.paginate(key,sorted);
      return `<div class="section-title" style="margin-top:0"><h2>Data Booking</h2><button class="ghost-btn small" data-export="bookings">Export CSV</button></div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>No</th><th>Pelanggan</th><th>Layanan</th><th>Operator</th><th>Jam</th><th>Harga</th><th>Status</th><th>Bayar</th><th>Aksi</th></tr></thead><tbody>${meta.rows.map(b=>`<tr><td>${U.esc(U.formatDate(b.booking_date))}</td><td>${U.esc(b.queue_no)}</td><td>${U.esc(b.customer_name)}</td><td>${U.esc(b.service_name)}</td><td>${U.esc(b.operator_name)}</td><td>${U.esc(U.formatTime(b.slot_time))}</td><td>${U.rupiah(b.price)}</td><td>${U.badge(b.status)}</td><td>${U.paymentLabel(b.payment_status)}</td><td><div class="action-row no-wrap-actions">${this.state.user.role!=='CUSTOMER'?this.operatorButtons(b):''}</div></td></tr>`).join('')||'<tr><td colspan="10">Belum ada data.</td></tr>'}</tbody></table></div>${this.paginationControls(key,meta)}`;
    },
    adminBookings(){
      this.setTitle('Manajemen Booking','Filter, pantau, dan update order pelanggan');
      U.$('#content').innerHTML=`<div class="card"><div class="toolbar"><label>Tanggal<input id="filter-booking-date" type="date" value="${U.today()}"></label><label>Status<select id="filter-status"><option value="">Semua</option>${C.STATUS.map(s=>`<option value="${s}">${U.statusLabel(s)}</option>`).join('')}</select></label><label>Operator<select id="filter-operator"><option value="">Semua</option>${this.state.operators.map(o=>`<option value="${o.operator_id}">${U.esc(o.operator_name)}</option>`).join('')}</select></label><button class="primary-btn" id="btn-filter-bookings">Terapkan</button></div></div><div class="card" style="margin-top:16px">${this.todayBookingsTable(this.state.bookings,'adminBookings')}</div>`;
    },
    adminOperators(){
      this.setTitle('Master Operator','Tambah dan kelola pemangkas/barber');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><h3>Form Operator</h3><form id="operator-form"><input type="hidden" name="operator_id"><div class="form-grid"><label>Nama Operator<input name="operator_name" required></label><label>No HP<input name="phone" required></label><label>No Kursi<input name="chair_no" placeholder="1"></label><label>Kapasitas Harian<input name="daily_capacity" type="number" value="15"></label><label>Jam Mulai<input name="work_start" type="time" step="1" value="08:00"></label><label>Jam Selesai<input name="work_end" type="time" step="1" value="21:00"></label><label>Tipe Komisi<select name="commission_type"><option value="">Tidak ada</option><option value="PERCENT">Persen</option><option value="FIXED">Nominal</option></select></label><label>Nilai Komisi<input name="commission_value" type="number" value="0"></label><label class="span-2"><input type="checkbox" name="create_login" style="width:auto;margin-right:8px"> Buat/Update akun login operator</label><label class="span-2">Password Operator<input name="password" value="operator123"></label><label class="span-2">Catatan<textarea name="notes"></textarea></label></div><button class="primary-btn full">Simpan Operator</button></form></div><div class="card"><h3>Daftar Operator</h3>${this.operatorCards()}</div></div>`;
    },
    operatorCards(){ return `<div class="queue-list">${this.state.operators.map(o=>`<div class="queue-item"><div class="queue-no">${U.esc(o.chair_no||'-')}</div><div class="queue-main"><b>${U.esc(o.operator_name)}</b><span>${U.esc(o.phone)} · Kap ${U.esc(o.daily_capacity)} · ${U.esc(U.formatTime(o.work_start))}-${U.esc(U.formatTime(o.work_end))}</span></div><button class="ghost-btn mini" data-edit-operator='${JSON.stringify(o).replace(/'/g,'&#39;')}'>Edit</button></div>`).join('')||'<div class="empty-state"><b>Belum ada operator</b></div>'}</div>`; },
    adminServices(){
      this.setTitle('Master Layanan','Atur jenis layanan, durasi, dan harga');
      U.$('#content').innerHTML=`<div class="grid grid-2"><div class="card"><h3>Form Layanan</h3><form id="service-form"><input type="hidden" name="service_id"><label>Nama Layanan<input name="service_name" required></label><label>Durasi Menit<input type="number" name="duration_min" value="30" required></label><label>Harga<input type="number" name="price" value="25000" required></label><label>Deskripsi<textarea name="description"></textarea></label><button class="primary-btn full">Simpan Layanan</button></form></div><div class="card"><h3>Daftar Layanan</h3><div class="queue-list">${this.state.services.map(s=>`<div class="queue-item"><div class="queue-no">${U.esc(s.duration_min)}</div><div class="queue-main"><b>${U.esc(s.service_name)}</b><span>${U.rupiah(s.price)} · ${U.esc(s.description||'-')}</span></div><button class="ghost-btn mini" data-edit-service='${JSON.stringify(s).replace(/'/g,'&#39;')}'>Edit</button></div>`).join('')||'<div class="empty-state"><b>Belum ada layanan</b></div>'}</div></div></div>`;
    },
    adminSettings(){
      this.setTitle('Pengaturan Barbershop','Profil, jam operasional, payment gateway, dan QRIS statis'); const s=this.state.settings;
      const qris=this.qrisImgUrl(s)?`<div class="span-2"><small>QRIS aktif:</small><br>${this.qrisImageHtml(s,'220px')}</div>`:'<div class="span-2"><small>Belum ada QRIS statis yang diupload.</small></div>';
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
      this.setTitle('Notifikasi','Pesan dan pemberitahuan aplikasi');
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
      const of=U.$('#operator-form'); if(of) of.onsubmit=async e=>{e.preventDefault(); await this.saveOperator(U.serialize(of));};
      const sf=U.$('#service-form'); if(sf) sf.onsubmit=async e=>{e.preventDefault(); await this.saveService(U.serialize(sf));};
      const st=U.$('#settings-form'); if(st) st.onsubmit=async e=>{e.preventDefault(); await this.saveSettings(U.serialize(st));};
      const qf=U.$('#qris-upload-form'); if(qf) qf.onsubmit=async e=>{e.preventDefault(); await this.uploadQrisStatic(qf);};
      U.$$('[data-edit-operator]').forEach(b=>b.onclick=()=>{const o=JSON.parse(b.getAttribute('data-edit-operator')); const f=U.$('#operator-form'); Object.keys(o).forEach(k=>{if(f.elements[k]) f.elements[k].value=(f.elements[k].type==='time'?U.timeInput(o[k]):o[k])}); window.scrollTo({top:0,behavior:'smooth'});});
      U.$$('[data-edit-service]').forEach(b=>b.onclick=()=>{const s=JSON.parse(b.getAttribute('data-edit-service')); const f=U.$('#service-form'); Object.keys(s).forEach(k=>{if(f.elements[k]) f.elements[k].value=(f.elements[k].type==='time'?U.timeInput(s[k]):s[k])}); window.scrollTo({top:0,behavior:'smooth'});});
      U.$$('[data-export="bookings"]').forEach(b=>b.onclick=()=>U.csvDownload('booking-barbershop.csv',this.state.bookings));
      U.$$('[data-read-notif]').forEach(b=>b.onclick=()=>this.markNotif(b.dataset.readNotif));
      U.$$('.qris-img').forEach(img=>{ img.onerror=()=>{ const fb=img.dataset.fallbackSrc; if(fb && img.src!==fb) img.src=fb; }; });
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
      const map={call:'callCustomer',start:'startService',finish:'finishService',noshow:'markNoShow',checkIn:'checkInBooking'};
      if(action==='cancelBooking'){ const ok=await U.confirm('Batalkan Booking','Booking akan dibatalkan. Lanjutkan?'); if(!ok)return; return this.runBookingAction('cancelBooking',{booking_id:id,cancel_reason:'Dibatalkan pengguna'}); }
      if(action==='payment') return this.paymentModal(id, btn.dataset.price);
      if(action==='tripayCustomer') return this.createTripayInvoice(id, btn.dataset.price);
      if(map[action]) return this.runBookingAction(map[action],{booking_id:id});
    },
    async runBookingAction(apiAction,payload){ try{ this.loading(true,'Memproses...'); const r=await this.api(apiAction,payload); U.toast('Berhasil',r.message||'Data diperbarui.','success'); await this.refresh(); }catch(err){U.toast('Gagal',err.message,'error')}finally{this.loading(false)} },
    paymentModal(id,price){
      const tripayOn=String(this.state.settings.payment_gateway_enabled).toLowerCase()==='true';
      U.modal('Input Pembayaran',`<form id="payment-form"><label>Nominal<input name="amount" type="number" value="${price||0}" required></label><label>Metode<select name="method"><option>CASH</option><option>QRIS_STATIS</option><option>TRANSFER</option></select></label><label>Status<select name="status"><option value="PAID">Lunas</option><option value="PARTIAL">Sebagian</option></select></label><label>Catatan<textarea name="notes"></textarea></label><button class="primary-btn full">Simpan Pembayaran Manual</button></form>${tripayOn?`<hr style="border:none;border-top:1px solid var(--border);margin:16px 0"><button class="warning-btn full" id="btn-create-tripay">Buat Invoice Tripay</button>`:''}`);
      U.$('#payment-form').onsubmit=async e=>{e.preventDefault(); const data=U.serialize(e.target); data.booking_id=id; U.closeModal(); await this.runBookingAction('createPayment',data);};
      const bt=U.$('#btn-create-tripay'); if(bt) bt.onclick=()=>{U.closeModal(); this.createTripayInvoice(id,price);};
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
