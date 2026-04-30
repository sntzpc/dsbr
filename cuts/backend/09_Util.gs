// UTIL_ — Utilitas & Helper
// ============================================================

function UTIL_generateId(prefix) {
  return prefix + '_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

/**
 * Hash sederhana untuk password (untuk produksi gunakan library hash yang lebih kuat)
 */
function UTIL_hashSimple(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return 'h_' + Math.abs(hash).toString(16) + '_' + str.length;
}

function UTIL_nowIso_() {
  return new Date().toISOString();
}

function UTIL_todayString() {
  const d = new Date();
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function UTIL_jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function UTIL_log(action, userId, detail) {
  try {
    SHEET_appendRow(CONFIG.SHEET_NAMES.LOGS, {
      timestamp: new Date().toISOString(),
      action   : action,
      userId   : userId,
      detail   : detail
    });
  } catch (e) { /* Log gagal tidak boleh menghentikan proses */ }
}
