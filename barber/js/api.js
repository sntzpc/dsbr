(function(){
  const LS_KEY_LAST_GOOD_BASE = 'barberbook_last_good_gas_base_v1';

  function cleanBaseUrl(url){
    url = String(url || '').trim();
    if(!url) return '';

    try{
      const u = new URL(url);

      [
        'action',
        'payload',
        'callback',
        '_',
        '_t',
        'token',
        'base64_data',
        'chunk',
        'upload_id'
      ].forEach(k => u.searchParams.delete(k));

      return u.toString();
    }catch(e){
      return url;
    }
  }

  function buildJsonpUrl(baseUrl, params, cbName){
    const q = new URLSearchParams({
      ...(params || {}),
      callback: cbName,
      _t: Date.now().toString()
    });

    return baseUrl + (baseUrl.includes('?') ? '&' : '?') + q.toString();
  }

  function jsonpCallOnce(baseUrl, params, timeoutMs = 30000){
    return new Promise((resolve, reject) => {
      const cb = '__bb_jsonp_' + Date.now() + '_' + Math.random().toString(16).slice(2);
      let script = null;
      let done = false;

      const cleanUp = () => {
        try {
          delete window[cb];
        } catch(e){
          window[cb] = undefined;
        }

        if(script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };

      const timer = setTimeout(() => {
        if(done) return;
        done = true;
        cleanUp();
        reject(new Error('Timeout: Tidak ada respon dari server GAS JSONP.'));
      }, timeoutMs);

      window[cb] = (data) => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();

        if(!data) {
          reject(new Error('Response kosong dari server GAS.'));
          return;
        }

        if(data.status && String(data.status).toLowerCase() === 'error') {
          reject(new Error(data.message || 'Terjadi error pada server GAS.'));
          return;
        }

        resolve(data);
      };

      const url = buildJsonpUrl(baseUrl, params, cb);

      script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = url;

      // Tambahan kompatibilitas Chrome Mobile
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer-when-downgrade';

      script.onerror = () => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();
        reject(new Error('Gagal memuat JSONP. URL tidak publik / diblokir / salah base URL.'));
      };

      document.head.appendChild(script);
    });
  }

  const Api = {
    getEndpoints(){
      const lastGood = cleanBaseUrl(localStorage.getItem(LS_KEY_LAST_GOOD_BASE) || '');
      const guc = cleanBaseUrl(window.APP_CONFIG?.GAS_URL_GUC || '');
      const exec = cleanBaseUrl(window.APP_CONFIG?.GAS_URL_EXEC || window.APP_CONFIG?.GAS_URL || '');
      const alternates = Array.isArray(window.APP_CONFIG?.GAS_URL_ALTERNATES)
        ? window.APP_CONFIG.GAS_URL_ALTERNATES.map(cleanBaseUrl)
        : [];

      return [lastGood, guc, exec]
        .concat(alternates)
        .map(x => String(x || '').trim())
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
    },

    request(action, data = {}, options = {}) {
      const payload = Object.assign({}, data, { action });
      const timeout = options.timeout || window.APP_CONFIG?.API_TIMEOUT_MS || 30000;
      return this.jsonpWithRetry(payload, timeout);
    },

    async jsonpWithRetry(payload, timeout) {
      const endpoints = this.getEndpoints();

      if(!endpoints.length) {
        throw new Error('GAS_URL_EXEC / GAS_URL_GUC belum diisi di js/config.js');
      }

      const attempts = [];

      endpoints.forEach(endpoint => {
        attempts.push({
          endpoint,
          mode: 'flat',
          timeout: Math.max(timeout, 30000)
        });

        attempts.push({
          endpoint,
          mode: 'payload',
          timeout: Math.max(timeout, 35000)
        });
      });

      let lastErr = null;

      for(const attempt of attempts) {
        try {
          const res = await this.jsonp(payload, attempt);
          localStorage.setItem(LS_KEY_LAST_GOOD_BASE, attempt.endpoint);
          return res;
        } catch(err) {
          lastErr = err;
          await this.delay(350);
        }
      }

      throw new Error(
        (lastErr && lastErr.message ? lastErr.message : 'Gagal terhubung ke GAS.') +
        ' Chrome Mobile: pastikan Web App akses Anyone, deployment /exec terbaru, dan GAS_URL_GUC memakai base URL googleusercontent yang benar.'
      );
    },

    jsonp(payload, attempt) {
      const params = {};

      if(attempt.mode === 'flat') {
        Object.keys(payload || {}).forEach(k => {
          const v = payload[k];

          if(v !== undefined && v !== null && typeof v !== 'object') {
            params[k] = String(v);
          } else if(v !== undefined && v !== null) {
            params[k] = JSON.stringify(v);
          }
        });
      } else {
        params.action = payload.action;
        params.payload = JSON.stringify(payload || {});
      }

      return jsonpCallOnce(attempt.endpoint, params, attempt.timeout || 30000);
    },

    async uploadQrisStaticChunked({ token, base64_data, filename, mime, onProgress }) {
      if(!base64_data) {
        throw new Error('Data QRIS kosong.');
      }

      const match = String(base64_data).match(/^data:([^;]+);base64,(.+)$/);
      const cleanBase64 = match ? match[2] : String(base64_data);
      const detectedMime = mime || (match ? match[1] : 'image/jpeg');

      const chunkSize = window.APP_CONFIG?.QRIS_UPLOAD_CHUNK_SIZE || 45000;
      const totalChunks = Math.ceil(cleanBase64.length / chunkSize);

      const begin = await this.request('beginQrisUpload', {
        token,
        filename,
        mime: detectedMime,
        total_chunks: totalChunks,
        total_length: cleanBase64.length
      }, {
        timeout: 30000
      });

      const uploadId = begin.upload_id;

      if(!uploadId) {
        throw new Error('Server tidak membuat upload_id QRIS.');
      }

      for(let i = 0; i < totalChunks; i++) {
        const chunk = cleanBase64.slice(i * chunkSize, (i + 1) * chunkSize);

        await this.request('appendQrisUploadChunk', {
          token,
          upload_id: uploadId,
          index: i,
          chunk
        }, {
          timeout: 45000
        });

        if(typeof onProgress === 'function') {
          onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }
      }

      return this.request('finishQrisUpload', {
        token,
        upload_id: uploadId,
        filename,
        mime: detectedMime
      }, {
        timeout: 60000
      });
    },

    delay(ms){
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  window.Api = Api;
})();