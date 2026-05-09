// Google Apps Script Backend untuk Dashboard Apps (Auth sederhana + Group Access)
// Deploy as Web App: Execute as Me, Access: Anyone
var SPREADSHEET_ID = '15J0015p6D0nbaCP7cG5F4ZQYrglqj3QvMYdQejILphs';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function nowISO(){
  return new Date().toISOString();
}

// ===== Normalizer =====
function normGroup_(g){
  return String(g || '').trim().toLowerCase();
}
function normIdsCsvToArr_(csv){
  const raw = String(csv || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => String(s).trim())
    .filter(s => s !== '');
}

// Hash password sederhana (demo)
function hashPassword(password) {
  var hash = 0;
  for (var i = 0; i < password.length; i++) {
    var char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}

// ===== Session token via CacheService =====
function cache(){
  return CacheService.getScriptCache();
}
function newToken(){
  // simple random token
  var raw = Utilities.getUuid() + '|' + new Date().getTime();
  return Utilities.base64EncodeWebSafe(raw);
}
function setSession(token, data, ttlSec){
  cache().put('sess:' + token, JSON.stringify(data), ttlSec || 6*60*60); // 6 jam
}
function getSession(token){
  if (!token) return null;
  var s = cache().get('sess:' + token);
  if (!s) return null;
  try{ return JSON.parse(s); }catch(e){ return null; }
}
function clearSession(token){
  if (!token) return;
  cache().remove('sess:' + token);
}

// ===== Sheet helpers =====
function ensureSheet(name, headers){
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    if (headers && headers.length){
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function setupSpreadsheet() {
  var ss = getSpreadsheet();

  // apps (existing)
  var appsSheet = ss.getSheetByName("apps");
  if (!appsSheet) {
    appsSheet = ss.insertSheet("apps");
    appsSheet.getRange("A1:F1").setValues([["id", "name", "url", "icon", "color", "order"]]);

    var initialApps = [
      ["1", "Order", "sntzpc.github.io/order", "fas fa-cube", "#1976d2", "1"],
      ["2", "Mess", "sntzpc.github.io/mess", "fas fa-utensils", "#4CAF50", "2"],
      ["3", "Aset", "sntzpc.github.io/aset", "fas fa-warehouse", "#FF9800", "3"],
      ["4", "GKM", "sntzpc.github.io/rgkm", "fas fa-users", "#9C27B0", "4"],
      ["5", "SP", "sntzpc.github.io/sp", "fas fa-chart-line", "#2196F3", "5"],
      ["6", "TO", "sntzpc.github.io/to", "fas fa-cogs", "#795548", "6"],
      ["7", "GTrack", "sntzpc.github.io/gtrack", "fas fa-map-marker-alt", "#607D8B", "7"],
      ["8", "SBMI", "sntzpc.github.io/sbmi", "fas fa-chart-bar", "#FF5722", "8"],
      ["9", "Roda", "sntzpc.github.io/roda", "fas fa-truck", "#3F51B5", "9"],
      ["10", "SBLS", "sntzpc.github.io/sbls", "fas fa-clipboard-list", "#009688", "10"],
      ["11", "AGRO", "sntzpc.github.io/agro", "fas fa-leaf", "#8BC34A", "11"],
      ["12", "Bio", "sntzpc.github.io/bio", "fas fa-flask", "#FFC107", "12"]
    ];
    appsSheet.getRange(2, 1, initialApps.length, initialApps[0].length).setValues(initialApps);
  }

  // settings
  var settingsSheet = ss.getSheetByName("settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("settings");
    settingsSheet.getRange("A1:B1").setValues([["key", "value"]]);
    var initialSettings = [
      ["theme_bg", "#f0f2f5"],
      ["theme_primary", "#1976d2"],
      ["theme_text", "#333333"]
    ];
    settingsSheet.getRange(2, 1, initialSettings.length, 2).setValues(initialSettings);
  }

  // icons
  var iconsSheet = ss.getSheetByName("icons");
  if (!iconsSheet) {
    iconsSheet = ss.insertSheet("icons");
    iconsSheet.getRange("A1:C1").setValues([["name", "class", "unicode"]]);
    var initialIcons = [
      ["Cube", "fas fa-cube", "f1b2"],
      ["Chart Bar", "fas fa-chart-bar", "f080"],
      ["Database", "fas fa-database", "f1c0"],
      ["File", "fas fa-file-alt", "f15c"]
    ];
    iconsSheet.getRange(2, 1, initialIcons.length, 3).setValues(initialIcons);
  }

  // users
  var users = ensureSheet('users', ["username","pass_hash","role","group","active","created_at","updated_at"]);
  if (users.getLastRow() === 1){
    // default admin user
    var defPass = "user123";
    users.appendRow(["admin", hashPassword(defPass), "admin", "admin", true, nowISO(), nowISO()]);
  }

  // groups
  var groups = ensureSheet('groups', ["group","app_ids","updated_at"]);
  if (groups.getLastRow() === 1){
    // default groups
    var allIds = getAllAppIds_().join(',');
    groups.appendRow(["master", allIds, nowISO()]);
    groups.appendRow(["admin", allIds, nowISO()]);
    groups.appendRow(["default", "", nowISO()]);
  }

  return "Spreadsheet berhasil di-setup";
}

// ===== Auth & Permission =====
function readUsers_(){
  ensureUsersSchema_();
  var sh = ensureSheet('users', ["username","nama","pass_hash","role","group","active","created_at","updated_at"]);
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i=1;i<data.length;i++){
    out.push({
      username: String(data[i][0]||'').trim(),
      nama: String(data[i][1]||'').trim(),
      pass_hash: String(data[i][2]||'').trim(),
      role: String(data[i][3]||'user').trim(),
      group: String(data[i][4]||'default').trim(),
      active: (data[i][5] === true || String(data[i][5]).toLowerCase() === 'true'),
      created_at: data[i][6],
      updated_at: data[i][7]
    });
  }
  return out;
}

function findUser_(username){
  var users = readUsers_();
  for (var i=0;i<users.length;i++){
    if (users[i].username === username) return users[i];
  }
  return null;
}
function upsertUser_(u){
  ensureUsersSchema_();
  var sh = ensureSheet('users', ["username","nama","pass_hash","role","group","active","created_at","updated_at"]);
  var data = sh.getDataRange().getValues();

  for (var i=1;i<data.length;i++){
    if (String(data[i][0]).trim() === u.username){
      sh.getRange(i+1,2).setValue(u.nama || "");          // nama
      sh.getRange(i+1,3).setValue(u.pass_hash);           // pass_hash
      sh.getRange(i+1,4).setValue(u.role);                // role
      sh.getRange(i+1,5).setValue(u.group);               // group
      sh.getRange(i+1,6).setValue(u.active);              // active
      sh.getRange(i+1,8).setValue(nowISO());              // updated_at
      return;
    }
  }
  sh.appendRow([u.username, u.nama||"", u.pass_hash, u.role, u.group, u.active, nowISO(), nowISO()]);
}

function assertSession_(token){
  var s = getSession(token);
  if (!s) throw new Error('Token invalid/expired');
  return s; // {token,username,role,group,exp}
}

function assertPriv_(token){ // admin OR master
  var s = assertSession_(token);
  if (s.role !== 'admin' && s.role !== 'master') throw new Error('No permission');
  return s;
}
function assertMaster_(token){
  var s = assertSession_(token);
  if (s.role !== 'master') throw new Error('No permission');
  return s;
}

function assertAdmin_(token){
  return assertPriv_(token); // admin OR master
}

// ===== Apps =====
function getApps() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("apps");
    var data = sheet.getDataRange().getValues();

    var apps = [];
    for (var i = 1; i < data.length; i++) {
      apps.push({
        id: data[i][0],
        name: data[i][1],
        url: data[i][2],
        icon: data[i][3],
        color: data[i][4],
        order: data[i][5]
      });
    }

    return { success: true, data: apps };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function getAllAppIds_(){
  var r = getApps();
  if (!r.success) return [];
  return (r.data||[]).map(function(a){ return String(a.id); });
}

// ===== Group Access =====
function readGroups_(){
  var sh = ensureSheet('groups', ["group","app_ids","updated_at"]);
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i=1;i<data.length;i++){
    var g = normGroup_(data[i][0]);
    var idsCell = data[i][1];
    var ids = String(idsCell || '').trim();

    out.push({
      group: g,
      app_ids: ids ? ids.split(',').map(function(x){ return String(x).trim(); }).filter(function(s){ return s !== ''; }) : [],
      updated_at: data[i][2]
    });
  }
  return out;
}

function getGroup_(gname){
  var target = normGroup_(gname);
  var gs = readGroups_();
  for (var i=0;i<gs.length;i++){
    if (normGroup_(gs[i].group) === target) return gs[i];
  }
  return null;
}

function upsertGroup_(gname, appIds){
  var sh = ensureSheet('groups', ["group","app_ids","updated_at"]);
  var data = sh.getDataRange().getValues();

  var gNorm = normGroup_(gname);
  var ids = (appIds || []).map(function(x){ return String(x).trim(); }).filter(function(s){ return s !== ''; }).join(',');

  for (var i=1;i<data.length;i++){
    if (normGroup_(data[i][0]) === gNorm){
      // simpan group dalam bentuk normal (lowercase)
      sh.getRange(i+1,1).setValue(gNorm);
      sh.getRange(i+1,2).setValue(ids);
      sh.getRange(i+1,3).setValue(nowISO());
      return;
    }
  }
  sh.appendRow([gNorm, ids, nowISO()]);
}

function deleteGroup_(gname){
  var sh = ensureSheet('groups', ["group","app_ids","updated_at"]);
  var data = sh.getDataRange().getValues();
  var gNorm = normGroup_(gname);

  for (var i=1;i<data.length;i++){
    if (normGroup_(data[i][0]) === gNorm){
      sh.deleteRow(i+1);
      return true;
    }
  }
  return false;
}

// ===== Theme =====
function getTheme() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("settings");
    var data = sheet.getDataRange().getValues();

    var theme = {};
    for (var i = 1; i < data.length; i++) {
      var key = data[i][0];
      var value = data[i][1];

      if (key == "theme_bg") theme.bg_color = value;
      else if (key == "theme_primary") theme.primary_color = value;
      else if (key == "theme_text") theme.text_color = value;
    }

    return { success: true, data: theme };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function saveTheme(token, bg_color, primary_color, text_color) {
  try {
    assertAdmin_(token);

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("settings");
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var key = data[i][0];
      if (key == "theme_bg") sheet.getRange(i + 1, 2).setValue(bg_color);
      else if (key == "theme_primary") sheet.getRange(i + 1, 2).setValue(primary_color);
      else if (key == "theme_text") sheet.getRange(i + 1, 2).setValue(text_color);
    }

    return { success: true, message: "Tema berhasil disimpan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ===== Apps CRUD (admin only) =====
function addApp(token, name, url, icon, color, order) {
  try {
    assertAdmin_(token);

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("apps");

    var lastRow = sheet.getLastRow();
    var lastId = lastRow > 1 ? sheet.getRange(lastRow, 1).getValue() : 0;
    var newId = parseInt(lastId, 10) + 1;

    sheet.appendRow([newId, name, url, icon, color, order]);

    // update group admin to include new app automatically
    var gm = getGroup_('master');
    var idsM = gm ? gm.app_ids : [];
    idsM.push(String(newId));
    upsertGroup_('master', idsM);

    return { success: true, message: "Aplikasi berhasil ditambahkan", id: newId };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function updateApp(token, id, name, url, icon, color, order) {
  try {
    assertAdmin_(token);

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("apps");
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) == String(id)) {
        var row = i + 1;
        sheet.getRange(row, 2).setValue(name);
        sheet.getRange(row, 3).setValue(url);
        sheet.getRange(row, 4).setValue(icon);
        sheet.getRange(row, 5).setValue(color);
        sheet.getRange(row, 6).setValue(order);
        break;
      }
    }

    return { success: true, message: "Aplikasi berhasil diupdate" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function deleteApp(token, id) {
  try {
    assertAdmin_(token);

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("apps");
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) == String(id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }

    // remove from all groups
    var gs = readGroups_();
    gs.forEach(function(g){
      var filtered = g.app_ids.filter(function(x){ return String(x) !== String(id); });
      upsertGroup_(g.group, filtered);
    });

    return { success: true, message: "Aplikasi berhasil dihapus" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ===== Auth actions =====
function login(username, password){
  try{
    ensureDefaultAdmin_();
    username = String(username||'').trim();
    password = String(password||'').trim();
    if (!username || !password) return {success:false, message:'Username/password wajib diisi'};

    var u = findUser_(username);
    if (!u) return {success:false, message:'User tidak ditemukan'};
    if (!u.active) return {success:false, message:'User nonaktif'};

    if (u.pass_hash !== hashPassword(password)) return {success:false, message:'Username atau password salah'};

    // ensure group exist (normalized)
    u.group = normGroup_(u.group);
    if (!getGroup_(u.group)){
      upsertGroup_(u.group, []); // create empty
    }

    var token = newToken();
    var exp = new Date().getTime() + (6*60*60*1000);
    var sess = { token: token, username: u.username, nama: (u.nama || ""), role: u.role, group: u.group, exp: exp };

    setSession(token, sess, 6*60*60);

    return {success:true, data: sess};
  }catch(err){
    return {success:false, message: String(err)};
  }
}
function whoami(token){
  try{
    var s = assertSession_(token);
    return {success:true, data:s};
  }catch(err){
    return {success:false, message: String(err)};
  }
}
function logout(token){
  try{
    clearSession(token);
    return {success:true, message:'Logged out'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

// ===== Get apps for session (filtered) =====
function getAppsForSession(token){
  try{
    var s = assertSession_(token);

    var all = getApps();
    if (!all.success) return all;

    // master: full
    if (s.role === 'master'){
      return {success:true, data: all.data};
    }

    // admin & user: ikut group access
    var g = getGroup_(s.group);
    var allowed = {};
    (g && g.app_ids ? g.app_ids : []).forEach(function(id){ allowed[String(id)] = true; });

    var filtered = (all.data || []).filter(function(a){
      return allowed[String(a.id)] === true;
    });

    return {success:true, data: filtered};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function getAppsForAdminPanel(token){
  try{
    var s = assertPriv_(token);

    var all = getApps();
    if (!all.success) return all;

    if (s.role === 'master'){
      return {success:true, data: all.data};
    }

    // admin -> filter by group
    var g = getGroup_(s.group);
    var allowed = {};
    (g && g.app_ids ? g.app_ids : []).forEach(function(id){ allowed[String(id)] = true; });

    var filtered = (all.data || []).filter(function(a){
      return allowed[String(a.id)] === true;
    });

    return {success:true, data: filtered};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

// ===== User management (admin only) =====
function listUsers(token){
  try{
    var s = assertPriv_(token); // admin/master

    var users = readUsers_().map(function(u){
      return { username:u.username, nama:u.nama, role:u.role, group:u.group, active:u.active };
    });

    if (s.role === 'admin'){
      users = users.filter(function(u){ return u.role !== 'master'; });
    }
    return {success:true, data: users};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function addUser(token, username, nama, role, group){
  try{
    var actor = assertPriv_(token); // admin/master

    username = String(username||'').trim();
    nama = String(nama||'').trim();
    role = String(role||'user').trim();
    group = String(group||'default').trim();

    // hanya MASTER boleh membuat user MASTER
    if (role === 'master' && actor.role !== 'master') {
      throw new Error('Hanya MASTER yang boleh membuat user MASTER');
    }

    // admin/master boleh tambah user
    assertAdmin_(token);

    if (!username) throw new Error('Username wajib');
    if (findUser_(username)) throw new Error('Username sudah ada');

    // validasi role (izinkan master)
    if (role !== 'user' && role !== 'admin' && role !== 'master') role = 'user';

    if (!getGroup_(group)) upsertGroup_(group, []);

    var defPass = 'user123';
    upsertUser_({
      username: username,
      nama: nama,
      pass_hash: hashPassword(defPass),
      role: role,
      group: group,
      active: true
    });

    return {success:true, message:'User ditambahkan'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function deleteUser(token, username){
  try{
    username = String(username||'').trim();
    if (!username) throw new Error('Username kosong');

    var actor = assertPriv_(token); // admin/master

    var target = findUser_(username);
    if (!target) return {success:false, message:'User tidak ditemukan'};

    if (target.role === 'master' && actor.role !== 'master'){
      throw new Error('Tidak boleh mengubah user MASTER');
    }

    assertAdmin_(token); // admin/master

    ensureUsersSchema_();
    var sh = ensureSheet('users', ["username","nama","pass_hash","role","group","active","created_at","updated_at"]);
    var data = sh.getDataRange().getValues();

    for (var i=1;i<data.length;i++){
      if (String(data[i][0]).trim() === username){
        sh.deleteRow(i+1);
        return {success:true, message:'User dihapus'};
      }
    }
    return {success:false, message:'User tidak ditemukan'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function resetUserPassword(token, username){
  try{
    username = String(username||'').trim();
    if (!username) throw new Error('Username kosong');

    var actor = assertPriv_(token); // admin/master

    var target = findUser_(username);
    if (!target) return {success:false, message:'User tidak ditemukan'};

    if (target.role === 'master' && actor.role !== 'master'){
      throw new Error('Tidak boleh mengubah user MASTER');
    }

    assertAdmin_(token); // admin/master

    target.pass_hash = hashPassword('user123');
    upsertUser_(target);

    return {success:true, message:'Password direset'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function ensureDefaultAdmin_(){
  ensureUsersSchema_();

  var sh = ensureSheet('users', ["username","nama","pass_hash","role","group","active","created_at","updated_at"]);

  // baca data users
  var last = sh.getLastRow();
  var data = (last > 1) ? sh.getRange(2,1,last-1,8).getValues() : [];

  // cek ada master?
  var hasMaster = false;
  for (var i=0;i<data.length;i++){
    // kolom role ada di index 3 (0=username,1=nama,2=pass_hash,3=role)
    if (String(data[i][3]).trim() === 'master'){
      hasMaster = true; break;
    }
  }
  if (!hasMaster){
    // master default
    sh.appendRow(["master", "Master Admin", hashPassword("user123"), "master", "master", true, nowISO(), nowISO()]);
  }

  // refresh data (karena mungkin baru append master)
  last = sh.getLastRow();
  data = (last > 1) ? sh.getRange(2,1,last-1,8).getValues() : [];

  // cek ada admin?
  var foundAdminRow = -1;
  for (var j=0;j<data.length;j++){
    if (String(data[j][0]).trim() === 'admin'){
      foundAdminRow = j + 2;
      break;
    }
  }

  if (foundAdminRow === -1){
    sh.appendRow(["admin", "Administrator", hashPassword("user123"), "admin", "admin", true, nowISO(), nowISO()]);
  } else {
    // pastikan admin punya nama minimal
    var nm = String(sh.getRange(foundAdminRow,2).getValue()||'').trim();
    if (!nm) sh.getRange(foundAdminRow,2).setValue("Administrator");
  }
}

function changeMyPassword(token, current_password, new_password){
  try{
    var s = assertSession_(token);
    current_password = String(current_password||'').trim();
    new_password = String(new_password||'').trim();
    if (!current_password || !new_password) throw new Error('Field kosong');

    var u = findUser_(s.username);
    if (!u) throw new Error('User tidak ditemukan');

    if (u.pass_hash !== hashPassword(current_password)) throw new Error('Password saat ini salah');

    u.pass_hash = hashPassword(new_password);
    upsertUser_(u);

    return {success:true, message:'Password berubah'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

// ===== Groups management (admin only) =====
function listGroups(token){
  try{
    assertAdmin_(token);
    var gs = readGroups_();
    return {success:true, data: gs};
  }catch(err){
    return {success:false, message:String(err)};
  }
}
function saveGroupApps(token, group, app_ids_csv){
  try{
    assertAdmin_(token);
    group = normGroup_(group);
    if (!group) throw new Error('Group kosong');

    var arr = normIdsCsvToArr_(app_ids_csv);
    upsertGroup_(group, arr);

    return {success:true, message:'Group saved'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function addGroup(token, group){
  try{
    assertAdmin_(token);
    group = normGroup_(group);
    if (!group) throw new Error('Group kosong');
    if (getGroup_(group)) throw new Error('Group sudah ada');

    upsertGroup_(group, []);
    return {success:true, message:'Group dibuat'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function deleteGroup(token, group){
  try{
    assertAdmin_(token);
    group = String(group||'').trim();
    if (!group) throw new Error('Group kosong');
    if (group === 'admin') throw new Error('Group admin tidak boleh dihapus');

    // also detach users of this group -> default
    var sh = ensureSheet('users', ["username","pass_hash","role","group","active","created_at","updated_at"]);
    // pastikan group master ada dan berisi semua app
    var gMaster = getGroup_('master');
    if (!gMaster){
      upsertGroup_('master', getAllAppIds_());
    } else if (!gMaster.app_ids || !gMaster.app_ids.length){
      upsertGroup_('master', getAllAppIds_());
    }
    var data = sh.getDataRange().getValues();
    for (var i=1;i<data.length;i++){
      if (String(data[i][3]).trim() === group){
        sh.getRange(i+1,4).setValue('default');
        sh.getRange(i+1,7).setValue(nowISO());
      }
    }

    var ok = deleteGroup_(group);
    return ok ? {success:true, message:'Group dihapus'} : {success:false, message:'Group tidak ditemukan'};
  }catch(err){
    return {success:false, message:String(err)};
  }
}

function ensureUsersSchema_(){
  var sh = ensureSheet('users', ["username","nama","pass_hash","role","group","active","created_at","updated_at"]);
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);

  // kalau sudah ada "nama" di header, skip
  if (headers.indexOf('nama') !== -1) return;

  // kalau header lama (7 kolom) -> sisipkan kolom nama di B
  // header lama: username, pass_hash, role, group, active, created_at, updated_at
  // jadi baru:  username, nama, pass_hash, role, group, active, created_at, updated_at
  sh.insertColumnAfter(1);
  sh.getRange(1,1,1,8).setValues([["username","nama","pass_hash","role","group","active","created_at","updated_at"]]);

  // data lama pindahkan: kolom pass_hash..updated_at geser 1 kolom ke kanan
  var lastRow = sh.getLastRow();
  if (lastRow > 1){
    var old = sh.getRange(2,1,lastRow-1,7).getValues();
    // old: [username, pass_hash, role, group, active, created_at, updated_at]
    var migrated = old.map(function(r){
      return [r[0], "", r[1], r[2], r[3], r[4], r[5], r[6]];
    });
    sh.getRange(2,1,migrated.length,8).setValues(migrated);
    // kosongkan area lama yang mungkin nyangkut (opsional aman)
    // (tidak wajib)
  }
}

// ===== HTTP Router =====
function doGet(e) {
  var action = e.parameter.action;
  var result;

  try {
    switch(action) {
      case "setup":
        result = {success:true, message: setupSpreadsheet()};
        break;

      case "getApps":
        result = getApps();
        break;

      case "getAppsForSession":
        result = getAppsForSession(e.parameter.token);
        break;

      case "getTheme":
        result = getTheme();
        break;

      case "whoami":
        result = whoami(e.parameter.token);
        break;

      case "listUsers":
        result = listUsers(e.parameter.token);
        break;

      case "listGroups":
        result = listGroups(e.parameter.token);
        break;

      case "getAppsForAdminPanel":
        result = getAppsForAdminPanel(e.parameter.token);
        break;

      default:
        result = {success:false, message:"Action tidak dikenali"};
    }
  } catch (error) {
    result = {success:false, message: String(error)};
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var action = e.parameter.action;
  var result;

  try {
    switch(action) {
      case "login":
        result = login(e.parameter.username, e.parameter.password);
        break;
      case "logout":
        result = logout(e.parameter.token);
        break;

      // apps CRUD
      case "addApp":
        result = addApp(e.parameter.token, e.parameter.name, e.parameter.url, e.parameter.icon, e.parameter.color, e.parameter.order);
        break;
      case "updateApp":
        result = updateApp(e.parameter.token, e.parameter.id, e.parameter.name, e.parameter.url, e.parameter.icon, e.parameter.color, e.parameter.order);
        break;
      case "deleteApp":
        result = deleteApp(e.parameter.token, e.parameter.id);
        break;

      // theme
      case "saveTheme":
        result = saveTheme(e.parameter.token, e.parameter.bg_color, e.parameter.primary_color, e.parameter.text_color);
        break;

      // password self
      case "changeMyPassword":
        result = changeMyPassword(e.parameter.token, e.parameter.current_password, e.parameter.new_password);
        break;

      // users admin
      case "addUser":
        result = addUser(e.parameter.token, e.parameter.username, e.parameter.nama, e.parameter.role, e.parameter.group);
        break;
      case "deleteUser":
        result = deleteUser(e.parameter.token, e.parameter.username);
        break;
      case "resetUserPassword":
        result = resetUserPassword(e.parameter.token, e.parameter.username);
        break;

      // groups admin
      case "saveGroupApps":
        result = saveGroupApps(e.parameter.token, e.parameter.group, e.parameter.app_ids);
        break;
      case "addGroup":
        result = addGroup(e.parameter.token, e.parameter.group);
        break;
      case "deleteGroup":
        result = deleteGroup(e.parameter.token, e.parameter.group);
        break;

      default:
        result = {success:false, message:"Action tidak dikenali"};
    }
  } catch (error) {
    result = {success:false, message:String(error)};
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
