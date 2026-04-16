function settingsPage(){
  const incomeRoots = categoryChildren('PENDAPATAN','ROOT');
  const expenseRoots = categoryChildren('PENGELUARAN','ROOT');
  const renderTree = (type, parentId='ROOT', level=0) => categoryChildren(type,parentId).map(cat => `
    <div class="rounded-2xl border border-slate-200 p-3 dark:border-slate-700" style="margin-left:${level*18}px">
      <div class="flex flex-col gap-2 md:flex-row md:items-center">
        <input data-cat-name="${cat.id}" type="text" value="${escapeHtml(cat.name)}" class="w-full rounded-2xl border px-3 py-2">
        <div class="flex gap-2"><button data-add-child="${cat.id}" data-type="${type}" class="rounded-xl border px-3 py-2 text-xs font-semibold">+ Sub</button><button data-del-cat="${cat.id}" class="rounded-xl border px-3 py-2 text-xs font-semibold text-rose-600">Hapus</button></div>
      </div>
      <div class="mt-2">${renderTree(type, cat.id, level+1)}</div>
    </div>`).join('');
  return `
  <div class="space-y-4">
    <section class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 class="text-xl font-bold">Pengaturan Kategori Bertingkat</h2><p class="text-sm text-slate-500 dark:text-slate-400">Atur kategori untuk Pendapatan dan Pengeluaran.</p></div>
        <div class="flex gap-2"><button id="addIncomeRootBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">+ Root Pendapatan</button><button id="addExpenseRootBtn" class="rounded-2xl border px-4 py-2 text-sm font-semibold">+ Root Pengeluaran</button><button id="saveCategoryBtn" class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Simpan Perubahan Nama</button></div>
      </div>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h3 class="text-lg font-bold">Pendapatan</h3><div class="mt-3 space-y-3">${incomeRoots.length ? renderTree('PENDAPATAN') : emptyState('Belum ada kategori pendapatan.')}</div></div>
        <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h3 class="text-lg font-bold">Pengeluaran</h3><div class="mt-3 space-y-3">${expenseRoots.length ? renderTree('PENGELUARAN') : emptyState('Belum ada kategori pengeluaran.')}</div></div>
      </div>
    </section>

    <section class="rounded-3xl border border-rose-200 bg-white p-4 shadow-soft dark:border-rose-900 dark:bg-slate-900">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h3 class="text-lg font-bold text-rose-600 dark:text-rose-400">Hapus Data Lokal Aplikasi</h3><p class="text-sm text-slate-500 dark:text-slate-400">Menghapus semua data lokal dari aplikasi ini.</p></div>
        <button id="clearLocalDataBtn" class="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/40">Hapus Data Lokal</button>
      </div>
    </section>
  </div>`;
}
async function addCategory(type, parentId='ROOT'){ await DB.put(STORES.categories, { id:uuid(), type, name:'Kategori Baru', parentId }); await loadState(); render(); showToast('Kategori baru ditambahkan.'); }
function childCategoriesRecursive(id){ const direct = APP.state.categories.filter(x=>x.parentId===id); return direct.flatMap(x=>[x.id, ...childCategoriesRecursive(x.id)]); }
async function deleteCategory(catId){ const ids = [catId, ...childCategoriesRecursive(catId)]; for(const tx of APP.state.mainTransactions){ if((tx.categoryPath||[]).some(id=>ids.includes(id))) return showToast('Kategori dipakai transaksi, tidak bisa dihapus.', 'error'); }
  for(const id of ids) await DB.delete(STORES.categories, id); await loadState(); render(); showToast('Kategori dihapus.'); }
async function saveCategoryNames(){ const inputs = [...document.querySelectorAll('[data-cat-name]')]; for(const input of inputs){ const cat = categoryById(input.dataset.catName); if(cat) await DB.put(STORES.categories, { ...cat, name: input.value.trim() || 'Tanpa Nama' }); } await loadState(); render(); showToast('Perubahan kategori disimpan.'); }
async function clearLocalAppData(){
  const ok = confirm('PERINGATAN: Semua data lokal aplikasi ini akan dihapus dari browser Anda, termasuk pengaturan, kategori, transaksi utama, transaksi modul, dan transaksi cadangan.\n\nLanjutkan hapus data lokal?');
  if(!ok) return;
  try {
    const db = await DB.open();
    db.close();
    DB.db = null;
  } catch(_) {}
  await new Promise((resolve, reject)=>{
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = ()=> resolve(true);
    req.onerror = ()=> reject(req.error);
    req.onblocked = ()=> showToast('Tutup tab aplikasi lain yang masih membuka data ini, lalu coba lagi.', 'error');
  });
  try { localStorage.removeItem('wifiHotspotTheme'); } catch(_) {}
  location.reload();
}
function bindSettingsEvents(){
  document.getElementById('addIncomeRootBtn')?.addEventListener('click', ()=> addCategory('PENDAPATAN','ROOT'));
  document.getElementById('addExpenseRootBtn')?.addEventListener('click', ()=> addCategory('PENGELUARAN','ROOT'));
  document.getElementById('saveCategoryBtn')?.addEventListener('click', saveCategoryNames);
  document.querySelectorAll('[data-add-child]').forEach(btn=>btn.addEventListener('click', ()=> addCategory(btn.dataset.type, btn.dataset.addChild)));
  document.querySelectorAll('[data-del-cat]').forEach(btn=>btn.addEventListener('click', ()=> deleteCategory(btn.dataset.delCat)));
  document.getElementById('clearLocalDataBtn')?.addEventListener('click', clearLocalAppData);
}
