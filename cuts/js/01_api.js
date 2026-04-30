// API LAYER
// Menggunakan GET + URLSearchParams untuk menghindari CORS GAS.
// Data kompleks (object/array) di-encode sebagai JSON string
// dalam parameter "payload", lalu di-parse di sisi GAS.
// ============================================================
async function api(action, data = {}) {
  try {
    const params = new URLSearchParams();
    params.set('action', action);
    // Kirim seluruh data sebagai payload JSON string
    params.set('payload', JSON.stringify(data));

    const url = GAS_URL + '?' + params.toString();
    const res = await fetch(url, {
      method  : 'GET',
      redirect: 'follow',   // GAS selalu redirect ke URL final
    });

    // GAS kadang mengembalikan teks bukan JSON jika error deploy
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error('Response bukan JSON:', text);
      throw new Error('Response server tidak valid. Cek URL GAS dan status deploy.');
    }

    if (!json.success) throw new Error(json.message || 'Terjadi kesalahan');
    return json.data;
  } catch (err) {
    console.error('API Error [' + action + ']:', err.message);
    throw err;
  }
}

// ============================================================
