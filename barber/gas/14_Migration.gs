/**
 * 14_Migration.gs
 * Migrasi satu kali untuk merapikan data lama dari format ISO menjadi format WIB Indonesia.
 * Bisa dijalankan dari frontend/API dengan action: migrateDateTimeFormat
 * Syarat: login ADMIN dan kirim token.
 */
function migrateDateTimeFormat_(payload) {
  requireRole_(payload, USER_ROLES.ADMIN);
  const ss = getSpreadsheet_();
  const result = [];
  ss.getSheets().forEach(function(sheet) {
    const sheetName = sheet.getName();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    let changed = 0;

    values.forEach(function(row, rIdx) {
      headers.forEach(function(header, cIdx) {
        const value = row[cIdx];
        if (value === '' || value === null || value === undefined) return;

        const h = String(header || '');
        let next = value;

        if (sheetName === 'Settings' && h === 'value') {
          const key = String(row[0] || '');
          if (key === 'open_time' || key === 'close_time') next = toTimeOnly_(value);
        } else if (/slot_time|work_start|work_end|open_time|close_time/i.test(h)) {
          next = toTimeOnly_(value);
        } else if (/_date$|^date$|booking_date|payment_date/i.test(h)) {
          next = toDateOnly_(value);
        } else if (/_at$|timestamp|last_login|expires_at/i.test(h)) {
          const d = parseDateTimeValue_(value) || parseDateValue_(value);
          next = d ? formatDateTime_(d) : value;
        }

        if (String(next) !== String(value)) {
          values[rIdx][cIdx] = next;
          changed += 1;
        }
      });
    });

    if (changed > 0) sheet.getRange(2, 1, lastRow - 1, lastCol).setValues(values);
    result.push({ sheet: sheetName, changed_cells: changed });
  });

  return { status: APP_CONFIG.API_OK, message: 'Migrasi format tanggal dan jam selesai.', result: result };
}
