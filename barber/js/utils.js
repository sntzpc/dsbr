(function(){
  const Utils = {
    $(sel, root=document){ return root.querySelector(sel); },
    $$(sel, root=document){ return Array.from(root.querySelectorAll(sel)); },
    esc(v){ return String(v ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s])); },
    rupiah(v){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0)); },
    num(v){ return Number(v||0); },
    today(){ return new Date().toISOString().slice(0,10); },
    addDays(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); },
    initial(name){ return String(name||'U').trim().charAt(0).toUpperCase() || 'U'; },
    statusLabel(st){ return ({BOOKED:'Booking',CHECKED_IN:'Check-in',CALLED:'Dipanggil',IN_SERVICE:'Dilayani',FINISHED:'Selesai',CANCELLED:'Batal',NO_SHOW:'Tidak Hadir'}[st] || st || '-'); },
    badge(st){ return `<span class="badge ${this.esc(st)}">${this.statusLabel(st)}</span>`; },
    paymentLabel(st){ return ({UNPAID:'Belum Bayar',PARTIAL:'Sebagian',PAID:'Lunas',REFUNDED:'Refund'}[st] || st || '-'); },
    toast(title, msg='', type='info'){
      const root = this.$('#toast-root');
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.innerHTML = `<b>${this.esc(title)}</b><span>${this.esc(msg)}</span>`;
      root.appendChild(el);
      setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 4200);
      setTimeout(()=> el.remove(), 4800);
    },
    serialize(form){
      const data = {};
      new FormData(form).forEach((v,k)=> data[k]=String(v).trim());
      form.querySelectorAll('input[type="checkbox"]').forEach(i => data[i.name] = i.checked);
      return data;
    },
    csvDownload(filename, rows){
      if(!rows || !rows.length){ this.toast('Data kosong','Tidak ada data untuk diexport.','error'); return; }
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    },
    modal(title, body, footer=''){
      const root = this.$('#modal-root');
      root.classList.remove('hidden');
      root.innerHTML = `<div class="modal-card"><div class="modal-head"><h3>${this.esc(title)}</h3><button class="icon-btn" data-close-modal>✕</button></div><div>${body}</div>${footer?`<div class="action-row" style="margin-top:16px">${footer}</div>`:''}</div>`;
      root.querySelector('[data-close-modal]').onclick = () => this.closeModal();
      root.onclick = e => { if(e.target === root) this.closeModal(); };
      return root;
    },
    closeModal(){ const root=this.$('#modal-root'); root.classList.add('hidden'); root.innerHTML=''; },
    confirm(title, msg){
      return new Promise(resolve => {
        this.modal(title, `<p style="color:var(--muted);line-height:1.5">${this.esc(msg)}</p>`, `<button class="ghost-btn" data-no>Batal</button><button class="danger-btn" data-yes>Ya, lanjutkan</button>`);
        this.$('[data-no]').onclick=()=>{this.closeModal();resolve(false)};
        this.$('[data-yes]').onclick=()=>{this.closeModal();resolve(true)};
      });
    }
  };
  window.Utils = Utils;
})();
