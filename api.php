<?php
require_once __DIR__ . '/db_config.php';

if (ALLOWED_ORIGIN !== '') {
  header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
header('Content-Type: application/json; charset=utf-8');

function pdo_conn() {
  static $pdo = null;
  if ($pdo) return $pdo;
  $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  $pdo = new PDO($dsn, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  return $pdo;
}
function ok($data=null, $message='') { return ['success'=>true, 'data'=>$data, 'message'=>$message]; }
function fail($message) { return ['success'=>false, 'message'=>$message]; }
function out($arr) { echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
function param($key, $default='') { return isset($_REQUEST[$key]) ? $_REQUEST[$key] : $default; }
function now_dt() { return date('Y-m-d H:i:s'); }
function norm_group($g) { return strtolower(trim((string)$g)); }
function ids_csv_to_arr($csv) {
  $raw = trim((string)$csv);
  if ($raw === '') return [];
  $parts = array_map('trim', explode(',', $raw));
  return array_values(array_filter($parts, fn($x) => $x !== ''));
}
function hashPassword($password) {
  $hash = 0;
  $len = strlen($password);
  for ($i=0; $i<$len; $i++) {
    $hash = (($hash << 5) - $hash) + ord($password[$i]);
    $hash = $hash & 0xFFFFFFFF;
    if ($hash >= 0x80000000) $hash -= 0x100000000;
  }
  return (string)$hash;
}
function cleanup_sessions() {
  pdo_conn()->prepare("DELETE FROM dash_sessions WHERE expires_at < NOW()")->execute();
}
function new_token() { return rtrim(strtr(base64_encode(bin2hex(random_bytes(32)) . '|' . microtime(true)), '+/', '-_'), '='); }
function get_session($token) {
  if (!$token) throw new Exception('Token invalid/expired');
  cleanup_sessions();
  $st = pdo_conn()->prepare("SELECT * FROM dash_sessions WHERE token=? AND expires_at >= NOW() LIMIT 1");
  $st->execute([$token]);
  $s = $st->fetch();
  if (!$s) throw new Exception('Token invalid/expired');
  return ['token'=>$s['token'], 'username'=>$s['username'], 'nama'=>$s['nama'], 'role'=>$s['role'], 'group'=>$s['group_name'], 'exp'=>strtotime($s['expires_at']) * 1000];
}
function assert_priv($token) {
  $s = get_session($token);
  if ($s['role'] !== 'admin' && $s['role'] !== 'master') throw new Exception('No permission');
  return $s;
}
function assert_admin($token) { return assert_priv($token); }
function get_user($username) {
  $st = pdo_conn()->prepare("SELECT username,nama,pass_hash,role,group_name,active,created_at,updated_at FROM dash_users WHERE username=? LIMIT 1");
  $st->execute([$username]);
  return $st->fetch();
}
function group_exists($group) {
  $st = pdo_conn()->prepare("SELECT group_name FROM dash_app_groups WHERE group_name=? LIMIT 1");
  $st->execute([norm_group($group)]);
  return (bool)$st->fetch();
}
function upsert_group($group, $appIds) {
  $g = norm_group($group);
  $ids = implode(',', array_values(array_filter(array_map('trim', $appIds), fn($x) => $x !== '')));
  $st = pdo_conn()->prepare("INSERT INTO dash_app_groups(group_name,app_ids,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE app_ids=VALUES(app_ids), updated_at=VALUES(updated_at)");
  $st->execute([$g, $ids, now_dt()]);
}
function get_all_app_ids() {
  $rows = pdo_conn()->query("SELECT id FROM dash_apps ORDER BY sort_order ASC, id ASC")->fetchAll();
  return array_map(fn($r)=>(string)$r['id'], $rows);
}
function ensure_default_admin() {
  if (!group_exists('master')) upsert_group('master', get_all_app_ids());
  if (!group_exists('admin')) upsert_group('admin', get_all_app_ids());
  if (!group_exists('default')) upsert_group('default', []);
  if (!get_user('master')) {
    $st=pdo_conn()->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
    $st->execute(['master','Master Admin',hashPassword('user123'),'master','master',1,now_dt(),now_dt()]);
  }
  if (!get_user('admin')) {
    $st=pdo_conn()->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
    $st->execute(['admin','Administrator',hashPassword('user123'),'admin','admin',1,now_dt(),now_dt()]);
  }
}
function get_apps() {
  $rows = pdo_conn()->query("SELECT id,name,url,icon,color,sort_order AS `order` FROM dash_apps ORDER BY sort_order ASC, id ASC")->fetchAll();
  foreach ($rows as &$r) { $r['id']=(string)$r['id']; $r['order']=(string)$r['order']; }
  return ok($rows);
}
function get_theme() {
  $rows = pdo_conn()->query("SELECT setting_key, setting_value FROM dash_settings")->fetchAll();
  $theme = [];
  foreach ($rows as $r) {
    if ($r['setting_key']==='theme_bg') $theme['bg_color']=$r['setting_value'];
    if ($r['setting_key']==='theme_primary') $theme['primary_color']=$r['setting_value'];
    if ($r['setting_key']==='theme_text') $theme['text_color']=$r['setting_value'];
  }
  return ok($theme);
}
function login_action($username, $password) {
  ensure_default_admin();
  $username = trim((string)$username); $password = trim((string)$password);
  if ($username==='' || $password==='') return fail('Username/password wajib diisi');
  $u = get_user($username);
  if (!$u) return fail('User tidak ditemukan');
  if ((int)$u['active'] !== 1) return fail('User nonaktif');
  if ((string)$u['pass_hash'] !== hashPassword($password)) return fail('Username atau password salah');
  $group = norm_group($u['group_name']);
  if (!group_exists($group)) upsert_group($group, []);
  $token = new_token();
  $exp = date('Y-m-d H:i:s', time() + SESSION_TTL_SECONDS);
  $st = pdo_conn()->prepare("INSERT INTO dash_sessions(token,username,nama,role,group_name,expires_at,created_at) VALUES(?,?,?,?,?,?,?)");
  $st->execute([$token,$u['username'],$u['nama'],$u['role'],$group,$exp,now_dt()]);
  return ['success'=>true,'data'=>['token'=>$token,'username'=>$u['username'],'nama'=>$u['nama'],'role'=>$u['role'],'group'=>$group,'exp'=>strtotime($exp)*1000]];
}
function logout_action($token) {
  $st = pdo_conn()->prepare("DELETE FROM dash_sessions WHERE token=?"); $st->execute([$token]);
  return ['success'=>true,'message'=>'Logged out'];
}
function whoami($token) { return ok(get_session($token)); }
function get_group($group) {
  $st = pdo_conn()->prepare("SELECT group_name,app_ids,updated_at FROM dash_app_groups WHERE group_name=? LIMIT 1");
  $st->execute([norm_group($group)]); return $st->fetch();
}
function get_apps_for_session($token, $adminPanel=false) {
  $s = $adminPanel ? assert_priv($token) : get_session($token);
  $all = get_apps()['data'];
  if ($s['role'] === 'master') return ok($all);
  $g = get_group($s['group']);
  $allowed = [];
  if ($g && trim((string)$g['app_ids']) !== '') foreach (ids_csv_to_arr($g['app_ids']) as $id) $allowed[(string)$id] = true;
  $filtered = array_values(array_filter($all, fn($a) => isset($allowed[(string)$a['id']])));
  return ok($filtered);
}
function list_users($token) {
  $s = assert_priv($token);
  $rows = pdo_conn()->query("SELECT username,nama,role,group_name AS `group`,active FROM dash_users ORDER BY role DESC, nama ASC, username ASC")->fetchAll();
  $out=[];
  foreach ($rows as $r) {
    if ($s['role']==='admin' && $r['role']==='master') continue;
    $r['active'] = (bool)$r['active']; $out[]=$r;
  }
  return ok($out);
}
function add_user($token,$username,$nama,$role,$group) {
  $actor = assert_priv($token);
  $username=trim((string)$username); $nama=trim((string)$nama); $role=trim((string)$role); $group=norm_group($group ?: 'default');
  if ($username==='') throw new Exception('Username wajib');
  if (get_user($username)) throw new Exception('Username sudah ada');
  if (!in_array($role,['user','admin','master'],true)) $role='user';
  if ($role==='master' && $actor['role']!=='master') throw new Exception('Hanya MASTER yang boleh membuat user MASTER');
  if (!group_exists($group)) upsert_group($group, []);
  $st=pdo_conn()->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
  $st->execute([$username,$nama,hashPassword('user123'),$role,$group,1,now_dt(),now_dt()]);
  return ['success'=>true,'message'=>'User ditambahkan'];
}
function delete_user($token,$username) {
  $actor = assert_priv($token); $username=trim((string)$username);
  if ($username==='') throw new Exception('Username kosong');
  $target=get_user($username); if (!$target) return fail('User tidak ditemukan');
  if ($target['role']==='master' && $actor['role']!=='master') throw new Exception('Tidak boleh mengubah user MASTER');
  $st=pdo_conn()->prepare("DELETE FROM dash_users WHERE username=?"); $st->execute([$username]);
  return ['success'=>true,'message'=>'User dihapus'];
}
function reset_user_password($token,$username) {
  $actor = assert_priv($token); $username=trim((string)$username);
  $target=get_user($username); if (!$target) return fail('User tidak ditemukan');
  if ($target['role']==='master' && $actor['role']!=='master') throw new Exception('Tidak boleh mengubah user MASTER');
  $st=pdo_conn()->prepare("UPDATE dash_users SET pass_hash=?, updated_at=? WHERE username=?"); $st->execute([hashPassword('user123'),now_dt(),$username]);
  return ['success'=>true,'message'=>'Password direset'];
}
function change_my_password($token,$current,$new) {
  $s=get_session($token); $current=trim((string)$current); $new=trim((string)$new);
  if ($current==='' || $new==='') throw new Exception('Field kosong');
  $u=get_user($s['username']); if (!$u) throw new Exception('User tidak ditemukan');
  if ((string)$u['pass_hash'] !== hashPassword($current)) throw new Exception('Password saat ini salah');
  $st=pdo_conn()->prepare("UPDATE dash_users SET pass_hash=?, updated_at=? WHERE username=?"); $st->execute([hashPassword($new),now_dt(),$s['username']]);
  return ['success'=>true,'message'=>'Password berubah'];
}
function list_groups($token) {
  assert_admin($token);
  $rows = pdo_conn()->query("SELECT group_name AS `group`, app_ids, updated_at FROM dash_app_groups ORDER BY group_name ASC")->fetchAll();
  foreach ($rows as &$r) { $r['app_ids'] = ids_csv_to_arr($r['app_ids']); }
  return ok($rows);
}
function save_group_apps($token,$group,$csv) { assert_admin($token); upsert_group($group, ids_csv_to_arr($csv)); return ['success'=>true,'message'=>'Group saved']; }
function add_group($token,$group) { assert_admin($token); $g=norm_group($group); if($g==='') throw new Exception('Group kosong'); if(group_exists($g)) throw new Exception('Group sudah ada'); upsert_group($g,[]); return ['success'=>true,'message'=>'Group dibuat']; }
function delete_group($token,$group) {
  assert_admin($token); $g=norm_group($group); if($g==='') throw new Exception('Group kosong'); if($g==='admin' || $g==='master') throw new Exception('Group admin/master tidak boleh dihapus');
  $pdo=pdo_conn(); $pdo->prepare("UPDATE dash_users SET group_name='default', updated_at=? WHERE group_name=?")->execute([now_dt(),$g]);
  $pdo->prepare("DELETE FROM dash_app_groups WHERE group_name=?")->execute([$g]);
  return ['success'=>true,'message'=>'Group dihapus'];
}
function add_app($token,$name,$url,$icon,$color,$order) {
  assert_admin($token); $pdo=pdo_conn();
  $st=$pdo->prepare("INSERT INTO dash_apps(name,url,icon,color,sort_order) VALUES(?,?,?,?,?)"); $st->execute([$name,$url,$icon ?: 'fas fa-cube',$color ?: '#1976d2',(int)$order]);
  $id=(string)$pdo->lastInsertId();
  foreach (['master','admin'] as $gname) { $g=get_group($gname); $ids=$g?ids_csv_to_arr($g['app_ids']):[]; $ids[]=$id; upsert_group($gname,array_unique($ids)); }
  return ['success'=>true,'message'=>'Aplikasi berhasil ditambahkan','id'=>$id];
}
function update_app($token,$id,$name,$url,$icon,$color,$order) {
  assert_admin($token); $st=pdo_conn()->prepare("UPDATE dash_apps SET name=?,url=?,icon=?,color=?,sort_order=? WHERE id=?"); $st->execute([$name,$url,$icon,$color,(int)$order,(int)$id]);
  return ['success'=>true,'message'=>'Aplikasi berhasil diupdate'];
}
function delete_app($token,$id) {
  assert_admin($token); $pdo=pdo_conn(); $pdo->prepare("DELETE FROM dash_apps WHERE id=?")->execute([(int)$id]);
  $rows=$pdo->query("SELECT group_name,app_ids FROM dash_app_groups")->fetchAll();
  foreach($rows as $g){ $ids=array_values(array_filter(ids_csv_to_arr($g['app_ids']), fn($x)=>(string)$x !== (string)$id)); upsert_group($g['group_name'],$ids); }
  return ['success'=>true,'message'=>'Aplikasi berhasil dihapus'];
}
function save_theme($token,$bg,$primary,$text) {
  assert_admin($token); $pdo=pdo_conn();
  $st=$pdo->prepare("INSERT INTO dash_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
  $st->execute(['theme_bg',$bg]); $st->execute(['theme_primary',$primary]); $st->execute(['theme_text',$text]);
  return ['success'=>true,'message'=>'Tema berhasil disimpan'];
}

try {
  $action = param('action');
  switch ($action) {
    case 'getApps': out(get_apps());
    case 'getTheme': out(get_theme());
    case 'login': out(login_action(param('username'), param('password')));
    case 'logout': out(logout_action(param('token')));
    case 'whoami': out(whoami(param('token')));
    case 'getAppsForSession': out(get_apps_for_session(param('token'), false));
    case 'getAppsForAdminPanel': out(get_apps_for_session(param('token'), true));
    case 'listUsers': out(list_users(param('token')));
    case 'addUser': out(add_user(param('token'), param('username'), param('nama'), param('role'), param('group')));
    case 'deleteUser': out(delete_user(param('token'), param('username')));
    case 'resetUserPassword': out(reset_user_password(param('token'), param('username')));
    case 'changeMyPassword': out(change_my_password(param('token'), param('current_password'), param('new_password')));
    case 'listGroups': out(list_groups(param('token')));
    case 'saveGroupApps': out(save_group_apps(param('token'), param('group'), param('app_ids')));
    case 'addGroup': out(add_group(param('token'), param('group')));
    case 'deleteGroup': out(delete_group(param('token'), param('group')));
    case 'addApp': out(add_app(param('token'), param('name'), param('url'), param('icon'), param('color'), param('order')));
    case 'updateApp': out(update_app(param('token'), param('id'), param('name'), param('url'), param('icon'), param('color'), param('order')));
    case 'deleteApp': out(delete_app(param('token'), param('id')));
    case 'saveTheme': out(save_theme(param('token'), param('bg_color'), param('primary_color'), param('text_color')));
    default: out(fail('Action tidak dikenali'));
  }
} catch (Throwable $e) {
  out(fail($e->getMessage()));
}
