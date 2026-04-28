/**
 * 15_Diagnostics.gs
 * Pemeriksaan izin aplikasi Barbershop secara manual dari editor Google Apps Script.
 *
 * Cara pakai:
 * 1. Buka Apps Script backend Barbershop.
 * 2. Tambahkan file baru: 15_Diagnostics.gs.
 * 3. Tempel seluruh isi file ini.
 * 4. Pilih fungsi manualCheckAppPermissionForUpload lalu klik Run/Jalankan.
 * 5. Ikuti authorization/izin akses yang muncul.
 */

function manualCheckAppPermissionForUpload() {
  const result = {
    app: APP_CONFIG.APP_NAME,
    version: APP_CONFIG.VERSION,
    checked_at: now_(),
    timezone: APP_CONFIG.TIMEZONE,
    spreadsheet_id: '',
    spreadsheet_ok: false,
    drive_ok: false,
    urlfetch_ok: false,
    settings_ok: false,
    qris_test_file_id: '',
    qris_test_file_url: '',
    web_app_url: '',
    errors: []
  };

  try {
    const ss = getSpreadsheet_();
    result.spreadsheet_id = ss.getId();
    result.spreadsheet_name = ss.getName();
    result.spreadsheet_ok = true;
  } catch (err) {
    result.errors.push('SpreadsheetApp gagal: ' + (err.message || err));
  }

  try {
    const settingsSheet = getSheet_('Settings');
    result.settings_rows = settingsSheet.getLastRow();
    result.settings_ok = true;
  } catch (err) {
    result.errors.push('Sheet Settings gagal: ' + (err.message || err));
  }

  try {
    // Gambar PNG 1x1 pixel untuk mengetes izin DriveApp.createFile()
    const bytes = Utilities.base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    );

    const blob = Utilities.newBlob(
      bytes,
      'image/png',
      'barbershop-qris-permission-test.png'
    );

    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    result.drive_ok = true;
    result.qris_test_file_id = file.getId();
    result.qris_test_file_url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

    upsertSetting_(
      'permission_test_drive_file_id',
      file.getId(),
      'File test izin upload Drive',
      'MANUAL_CHECK'
    );

    upsertSetting_(
      'permission_test_drive_file_url',
      result.qris_test_file_url,
      'URL file test izin upload Drive',
      'MANUAL_CHECK'
    );

  } catch (err) {
    result.errors.push('DriveApp upload/share gagal: ' + (err.message || err));
  }

  try {
    const response = UrlFetchApp.fetch('https://tripay.co.id', {
      muteHttpExceptions: true
    });

    result.urlfetch_ok = true;
    result.urlfetch_response_code = response.getResponseCode();
  } catch (err) {
    result.errors.push('UrlFetchApp gagal: ' + (err.message || err));
  }

  try {
    result.web_app_url = ScriptApp.getService().getUrl() || '';
  } catch (err) {
    result.errors.push('ScriptApp getService URL gagal: ' + (err.message || err));
  }

  result.overall_ok = result.spreadsheet_ok && result.drive_ok && result.settings_ok;

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Fungsi pendek khusus mengetes upload Drive saja.
 * Jalankan manual jika hanya ingin memaksa izin Google Drive.
 */
function manualCheckUploadOnly() {
  const bytes = Utilities.base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  );

  const blob = Utilities.newBlob(
    bytes,
    'image/png',
    'barbershop-upload-test.png'
  );

  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

  Logger.log('UPLOAD TEST BERHASIL');
  Logger.log('File ID: ' + file.getId());
  Logger.log('URL: ' + url);

  return {
    status: 'ok',
    file_id: file.getId(),
    url: url
  };
}


/**
 * Action API opsional agar Admin bisa mengetes izin dari frontend.
 * Fungsi ini membutuhkan route tambahan di 02_Code.gs.
 */
function checkAppPermissions_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);

  const result = {
    status: APP_CONFIG.API_OK,
    checked_at: now_(),
    spreadsheet_ok: false,
    drive_ok: false,
    settings_ok: false,
    errors: []
  };

  try {
    const ss = getSpreadsheet_();
    result.spreadsheet_ok = true;
    result.spreadsheet_id = ss.getId();
    result.spreadsheet_name = ss.getName();
  } catch (err) {
    result.errors.push('SpreadsheetApp: ' + (err.message || err));
  }

  try {
    const sh = getSheet_('Settings');
    result.settings_ok = true;
    result.settings_rows = sh.getLastRow();
  } catch (err) {
    result.errors.push('Settings: ' + (err.message || err));
  }

  try {
    const bytes = Utilities.base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    );

    const blob = Utilities.newBlob(
      bytes,
      'image/png',
      'barbershop-api-permission-test.png'
    );

    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    result.drive_ok = true;
    result.test_file_id = file.getId();
    result.test_file_url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

  } catch (err) {
    result.errors.push('DriveApp: ' + (err.message || err));
  }

  result.overall_ok = result.spreadsheet_ok && result.settings_ok && result.drive_ok;

  result.message = result.overall_ok
    ? 'Izin Spreadsheet dan Drive sudah aktif. Upload gambar seharusnya bisa berjalan.'
    : 'Masih ada izin/akses yang belum aktif. Jalankan manualCheckAppPermissionForUpload dari editor GAS.';

  return result;
}