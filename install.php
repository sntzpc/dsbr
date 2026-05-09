<?php
require_once __DIR__ . '/db_config.php';
header('Content-Type: text/html; charset=utf-8');
function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
$key = $_GET['key'] ?? '';
$run = isset($_GET['run']);
$reset = isset($_GET['reset']);
if ($key !== INSTALL_KEY) { http_response_code(403); echo '<h2>403 - INSTALL_KEY salah</h2><p>Edit db_config.php dan buka install.php?key=INSTALL_KEY</p>'; exit; }
function db_install_conn($withDb=true) {
  $db = $withDb ? ';dbname=' . DB_NAME : '';
  $dsn = 'mysql:host=' . DB_HOST . $db . ';charset=' . DB_CHARSET;
  return new PDO($dsn, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}
function exec_multi($pdo,$sql){
  $parts = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
  foreach ($parts as $q) { if ($q !== '') $pdo->exec($q); }
}
function hashPasswordInstall($password) {
  $hash = 0; for ($i=0;$i<strlen($password);$i++){ $hash=(($hash<<5)-$hash)+ord($password[$i]); $hash=$hash & 0xFFFFFFFF; if($hash>=0x80000000)$hash-=0x100000000; } return (string)$hash;
}
if (!$run) {
  echo '<h1>Installer Database Dashboard SNTZ</h1>';
  echo '<p>Installer ini membuat tabel MySQL dan mengisi data awal dari <code>migration/data_seed.json</code>.</p>';
  echo '<p><a style="padding:12px 18px;background:#1976d2;color:#fff;border-radius:8px;text-decoration:none" href="?key='.h($key).'&run=1">Jalankan Install / Update Data</a></p>';
  echo '<p><a style="padding:12px 18px;background:#d32f2f;color:#fff;border-radius:8px;text-decoration:none" href="?key='.h($key).'&run=1&reset=1" onclick="return confirm(\'Reset akan mengosongkan tabel utama terlebih dahulu. Lanjutkan?\')">Reset dan Import Ulang</a></p>';
  echo '<p><b>Setelah sukses:</b> hapus/rename file <code>install.php</code> dan folder <code>migration</code> dari hosting.</p>';
  exit;
}
try {
  $pdo0 = db_install_conn(false);
  $pdo0->exec("CREATE DATABASE IF NOT EXISTS `" . str_replace('`','',DB_NAME) . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo = db_install_conn(true);
  exec_multi($pdo, file_get_contents(__DIR__ . '/migration/schema.sql'));
  if ($reset) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach (['dash_sessions','dash_migration_logs','dash_app_groups','dash_users','dash_icons','dash_settings','dash_apps'] as $t) $pdo->exec("TRUNCATE TABLE `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
  }
  $seed = json_decode(file_get_contents(__DIR__ . '/migration/data_seed.json'), true);
  $pdo->beginTransaction();
  $counts=[];
  $stmt = $pdo->prepare("INSERT INTO dash_apps(id,name,url,icon,color,sort_order) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),url=VALUES(url),icon=VALUES(icon),color=VALUES(color),sort_order=VALUES(sort_order)");
  foreach (($seed['apps'] ?? []) as $a) { $stmt->execute([(int)$a['id'], $a['name']??'', $a['url']??'', $a['icon']??'fas fa-cube', $a['color']??'#1976d2', (int)($a['order']??0)]); $counts['apps']=($counts['apps']??0)+1; }
  $stmt = $pdo->prepare("INSERT INTO dash_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
  foreach (($seed['settings'] ?? []) as $s) { $stmt->execute([$s['key']??'', $s['value']??'']); $counts['settings']=($counts['settings']??0)+1; }
  $stmt = $pdo->prepare("INSERT INTO dash_icons(name,class,unicode_value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), unicode_value=VALUES(unicode_value)");
  foreach (($seed['icons'] ?? []) as $i) { $stmt->execute([$i['name']??'', $i['class']??'', $i['unicode']??'']); $counts['icons']=($counts['icons']??0)+1; }
  $stmt = $pdo->prepare("INSERT INTO dash_app_groups(group_name,app_ids,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE app_ids=VALUES(app_ids), updated_at=VALUES(updated_at)");
  foreach (($seed['groups'] ?? []) as $g) { $stmt->execute([strtolower(trim($g['group']??'')), $g['app_ids']??'', date('Y-m-d H:i:s', strtotime($g['updated_at'] ?? 'now'))]); $counts['groups']=($counts['groups']??0)+1; }
  $stmt = $pdo->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nama=VALUES(nama),pass_hash=VALUES(pass_hash),role=VALUES(role),group_name=VALUES(group_name),active=VALUES(active),updated_at=VALUES(updated_at)");
  foreach (($seed['users'] ?? []) as $u) {
    $role = in_array($u['role']??'user', ['user','admin','master'], true) ? $u['role'] : 'user';
    $stmt->execute([trim((string)($u['username']??'')), $u['nama']??'', trim((string)($u['pass_hash']??hashPasswordInstall('user123'))), $role, strtolower(trim($u['group']??'default')), !empty($u['active'])?1:0, date('Y-m-d H:i:s', strtotime($u['created_at'] ?? 'now')), date('Y-m-d H:i:s', strtotime($u['updated_at'] ?? 'now'))]);
    $counts['users']=($counts['users']??0)+1;
  }
  foreach (['master','admin','default'] as $g) { $pdo->prepare("INSERT IGNORE INTO dash_app_groups(group_name,app_ids,updated_at) VALUES(?,?,NOW())")->execute([$g, $g==='default' ? '' : implode(',', array_column($pdo->query('SELECT id FROM dash_apps ORDER BY sort_order,id')->fetchAll(), 'id'))]); }
  if (!$pdo->query("SELECT username FROM dash_users WHERE username='master'")->fetch()) $pdo->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES('master','Master Admin',?,'master','master',1,NOW(),NOW())")->execute([hashPasswordInstall('user123')]);
  if (!$pdo->query("SELECT username FROM dash_users WHERE username='admin'")->fetch()) $pdo->prepare("INSERT INTO dash_users(username,nama,pass_hash,role,group_name,active,created_at,updated_at) VALUES('admin','Administrator',?,'admin','admin',1,NOW(),NOW())")->execute([hashPasswordInstall('user123')]);
  $pdo->prepare("INSERT INTO dash_migration_logs(action,detail) VALUES(?,?)")->execute(['install_excel_seed', json_encode(['counts'=>$counts,'reset'=>$reset], JSON_UNESCAPED_UNICODE)]);
  $pdo->commit();
  echo '<h1>Install Database Berhasil</h1><pre>'.h(json_encode($counts, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE)).'</pre>';
  echo '<p>Test API: <a href="api.php?action=getTheme">api.php?action=getTheme</a></p>';
  echo '<p><b>Penting:</b> hapus/rename <code>install.php</code> dan folder <code>migration</code> dari hosting setelah selesai.</p>';
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500); echo '<h1>Install Gagal</h1><pre>'.h($e->getMessage()).'</pre>';
}
