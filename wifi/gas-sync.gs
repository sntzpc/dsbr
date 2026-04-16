const DEFAULT_SHEETS = {
  settings: ['key','json','updatedAt'],
  categories: ['id','json','updatedAt'],
  mainTransactions: ['id','json','updatedAt'],
  moduleTransactions: ['id','json','updatedAt'],
  reserveTransactions: ['id','json','updatedAt']
};

function doGet(e){
  return jsonOut({ ok:true, message:'GAS WiFi Sync aktif', actions:['upsertBatch','deleteBatch','pullAll'] });
}

function doPost(e){
  try{
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const spreadsheetId = body.spreadsheetId;
    if(!spreadsheetId) throw new Error('spreadsheetId wajib diisi');
    const ss = SpreadsheetApp.openById(spreadsheetId);
    ensureAllSheets_(ss);
    const action = body.action;
    if(action === 'upsertBatch') return jsonOut(handleUpsertBatch_(ss, body.items || []));
    if(action === 'deleteBatch') return jsonOut(handleDeleteBatch_(ss, body.items || []));
    if(action === 'pullAll') return jsonOut(handlePullAll_(ss));
    return jsonOut({ ok:false, message:'Action tidak dikenali' });
  } catch(err){
    return jsonOut({ ok:false, message:String(err && err.message ? err.message : err) });
  }
}

function jsonOut(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureAllSheets_(ss){
  Object.keys(DEFAULT_SHEETS).forEach(function(name){ ensureSheet_(ss, name, DEFAULT_SHEETS[name]); });
}

function ensureSheet_(ss, name, headers){
  let sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);
  const currentHeaders = sh.getLastColumn() ? sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0] : [];
  const same = headers.every(function(h, i){ return currentHeaders[i] === h; });
  if(!same) sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  return sh;
}

function handleUpsertBatch_(ss, items){
  let processed = 0;
  (items || []).forEach(function(item){
    const store = item.store;
    const key = String(item.key || '');
    if(!DEFAULT_SHEETS[store]) throw new Error('Store tidak valid: ' + store);
    if(!key) throw new Error('Key kosong untuk store ' + store);
    const sh = ensureSheet_(ss, store, DEFAULT_SHEETS[store]);
    const row = findRowByKey_(sh, key);
    const values = [[key, JSON.stringify(item.data || {}), new Date().toISOString()]];
    if(row > 1){
      sh.getRange(row, 1, 1, 3).setValues(values);
    } else {
      sh.appendRow(values[0]);
    }
    processed++;
  });
  return { ok:true, processed:processed, message:'Upsert batch berhasil' };
}

function handleDeleteBatch_(ss, items){
  let processed = 0;
  const grouped = {};
  (items || []).forEach(function(item){
    const store = item.store;
    const key = String(item.key || '');
    if(!DEFAULT_SHEETS[store]) throw new Error('Store tidak valid: ' + store);
    if(!grouped[store]) grouped[store] = [];
    grouped[store].push(key);
  });
  Object.keys(grouped).forEach(function(store){
    const sh = ensureSheet_(ss, store, DEFAULT_SHEETS[store]);
    const keys = grouped[store];
    const rows = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){ return String(r[0] || ''); }) : [];
    const toDelete = [];
    rows.forEach(function(k, idx){ if(keys.indexOf(k) !== -1) toDelete.push(idx + 2); });
    toDelete.sort(function(a,b){ return b-a; }).forEach(function(r){ sh.deleteRow(r); processed++; });
  });
  return { ok:true, processed:processed, message:'Delete batch berhasil' };
}

function handlePullAll_(ss){
  const data = {};
  Object.keys(DEFAULT_SHEETS).forEach(function(store){
    const sh = ensureSheet_(ss, store, DEFAULT_SHEETS[store]);
    const lastRow = sh.getLastRow();
    if(lastRow <= 1){ data[store] = []; return; }
    const rows = sh.getRange(2,1,lastRow-1,3).getValues();
    data[store] = rows.map(function(r){
      return JSON.parse(String(r[1] || '{}'));
    }).filter(function(x){ return x && typeof x === 'object'; });
  });
  return { ok:true, data:data, message:'Pull berhasil' };
}

function findRowByKey_(sh, key){
  const lastRow = sh.getLastRow();
  if(lastRow <= 1) return -1;
  const values = sh.getRange(2,1,lastRow-1,1).getValues();
  for(let i=0; i<values.length; i++){
    if(String(values[i][0] || '') === String(key)) return i + 2;
  }
  return -1;
}
