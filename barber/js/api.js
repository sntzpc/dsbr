(function(){
  const LS_KEY_LAST_GOOD_BASE = 'barberbook_last_good_gas_base_v2';

  function cleanBaseUrl(url){
    url = String(url || '').trim();
    if(!url) return '';
    try{
      const u = new URL(url);
      [
        'action','payload','payload_json','callback','_','_t','token','base64_data','chunk','upload_id',
        'index','filename','mime','total_chunks','total_length','bb_bridge','bb_request_id'
      ].forEach(k => u.searchParams.delete(k));
      return u.toString();
    }catch(e){
      return url;
    }
  }

  function getExecUrl(){
    return cleanBaseUrl(window.APP_CONFIG?.GAS_URL_EXEC || window.APP_CONFIG?.GAS_URL || '');
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
        try { delete window[cb]; } catch(e){ window[cb] = undefined; }
        if(script && script.parentNode) script.parentNode.removeChild(script);
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
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer-when-downgrade';

      script.onerror = () => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();
        reject(new Error('Gagal memuat JSONP. URL tidak publik / diblokir / respon bukan JavaScript callback.'));
      };

      document.head.appendChild(script);
    });
  }

  function iframePostCallOnce(baseUrl, payload, timeoutMs = 60000){
    return new Promise((resolve, reject) => {
      if(!baseUrl) {
        reject(new Error('GAS_URL_EXEC belum diisi.'));
        return;
      }

      const requestId = 'bb_bridge_' + Date.now() + '_' + Math.random().toString(16).slice(2);
      const iframeName = requestId + '_frame';
      let done = false;
      let iframe = null;
      let form = null;

      const cleanUp = () => {
        window.removeEventListener('message', onMessage);
        if(form && form.parentNode) form.parentNode.removeChild(form);
        if(iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };

      const timer = setTimeout(() => {
        if(done) return;
        done = true;
        cleanUp();
        reject(new Error('Timeout: Chrome Mobile tidak menerima balasan dari GAS bridge. Pastikan backend sudah di-deploy ulang dan Web App akses Anyone.'));
      }, timeoutMs);

      function onMessage(event){
        const data = event && event.data ? event.data : null;
        if(!data || data.source !== 'BARBERBOOK_GAS_BRIDGE' || data.requestId !== requestId) return;
        if(done) return;
        done = true;
        clearTimeout(timer);
        cleanUp();

        const res = data.payload || {};
        if(res.status && String(res.status).toLowerCase() === 'error') {
          reject(new Error(res.message || 'Terjadi error pada server GAS.'));
          return;
        }
        resolve(res);
      }

      window.addEventListener('message', onMessage);

      iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      form = document.createElement('form');
      form.method = 'POST';
      form.action = baseUrl;
      form.target = iframeName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      const fields = {
        bb_bridge: '1',
        bb_request_id: requestId,
        action: payload.action || '',
        payload_json: JSON.stringify(payload || {})
      };

      Object.keys(fields).forEach(k => {
        const input = document.createElement('textarea');
        input.name = k;
        input.value = fields[k];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    });
  }

  const Api = {
    getEndpoints(options = {}){
      const lastGood = cleanBaseUrl(localStorage.getItem(LS_KEY_LAST_GOOD_BASE) || '');
      const exec = getExecUrl();
      const guc = cleanBaseUrl(window.APP_CONFIG?.GAS_URL_GUC || '');
      const alternates = Array.isArray(window.APP_CONFIG?.GAS_URL_ALTERNATES)
        ? window.APP_CONFIG.GAS_URL_ALTERNATES.map(cleanBaseUrl)
        : [];

      // Urutan baru: /exec adalah sumber utama. googleusercontent hanya cadangan JSONP.
      const preferred = options.preferGuc
        ? [exec, lastGood, guc].concat(alternates)
        : [exec, lastGood, guc].concat(alternates);

      return preferred
        .map(x => String(x || '').trim())
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
    },

    request(action, data = {}, options = {}) {
      const payload = Object.assign({}, data, { action });
      const timeout = options.timeout || window.APP_CONFIG?.API_TIMEOUT_MS || 30000;
      return this.requestWithRetry(payload, timeout, options);
    },

    async requestWithRetry(payload, timeout, options = {}) {
      const exec = getExecUrl();
      let lastErr = null;

      // Jalur utama: hidden iframe POST bridge. Ini paling aman untuk Chrome Mobile,
      // karena tidak kena CORS/preflight dan tidak butuh URL googleusercontent.
      if(options.noBridge !== true && exec) {
        try {
          const res = await iframePostCallOnce(exec, payload, Math.max(timeout, options.bridgeTimeout || 60000));
          localStorage.setItem(LS_KEY_LAST_GOOD_BASE, exec);
          return res;
        } catch(err) {
          lastErr = err;
          await this.delay(250);
        }
      }

      // Cadangan lama: JSONP. Tetap dipertahankan untuk kompatibilitas deployment lama.
      try {
        return await this.jsonpWithRetry(payload, timeout, options);
      } catch(err) {
        lastErr = err;
      }

      throw new Error(
        (lastErr && lastErr.message ? lastErr.message : 'Gagal terhubung ke GAS.') +
        ' Solusi: deploy ulang backend terbaru sebagai Web App /exec dengan akses Anyone, lalu update GAS_URL_EXEC di js/config.js.'
      );
    },

    async jsonpWithRetry(payload, timeout, options = {}) {
      const endpoints = this.getEndpoints(options);
      if(!endpoints.length) {
        throw new Error('GAS_URL_EXEC belum diisi di js/config.js');
      }

      const modes = Array.isArray(options.modes) && options.modes.length ? options.modes : ['flat', 'payload'];
      const attempts = [];

      endpoints.forEach(endpoint => {
        modes.forEach(mode => {
          attempts.push({
            endpoint,
            mode,
            timeout: Math.max(timeout, mode === 'flat' ? 30000 : 35000)
          });
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
          await this.delay(250);
        }
      }

      throw lastErr || new Error('Gagal terhubung ke GAS JSONP.');
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
      if(!base64_data) throw new Error('Data QRIS kosong.');

      if(typeof onProgress === 'function') onProgress(10);

      // Jalur utama baru: upload 1x POST bridge ke /exec.
      // Ini jauh lebih stabil dibanding JSONP chunk pada Chrome Mobile.
      try {
        const res = await this.request('saveQrisStatic', {
          token,
          base64_data,
          filename,
          mime
        }, {
          timeout: 120000,
          bridgeTimeout: 120000,
          modes: ['payload']
        });
        if(typeof onProgress === 'function') onProgress(100);
        return res;
      } catch(primaryErr) {
        // Fallback lama: chunk JSONP/bridge. Dipakai jika browser/server membatasi POST besar.
        const fallbackRes = await this.uploadQrisStaticChunkedFallback({ token, base64_data, filename, mime, onProgress });
        if(typeof onProgress === 'function') onProgress(100);
        return fallbackRes;
      }
    },

    async uploadQrisStaticChunkedFallback({ token, base64_data, filename, mime, onProgress }) {
      const match = String(base64_data).match(/^data:([^;]+);base64,(.+)$/);
      const cleanBase64 = match ? match[2] : String(base64_data);
      const detectedMime = mime || (match ? match[1] : 'image/jpeg');
      const chunkSize = Number(window.APP_CONFIG?.QRIS_UPLOAD_CHUNK_SIZE || 9000);
      const totalChunks = Math.ceil(cleanBase64.length / chunkSize);

      if(totalChunks > 140) {
        throw new Error('Gambar QRIS masih terlalu besar setelah dikompres. Crop gambar QRIS lalu upload ulang.');
      }

      const begin = await this.request('beginQrisUpload', {
        token,
        filename,
        mime: detectedMime,
        total_chunks: totalChunks,
        total_length: cleanBase64.length
      }, {
        timeout: 30000,
        modes: ['flat']
      });

      const uploadId = begin.upload_id;
      if(!uploadId) throw new Error('Server tidak membuat upload_id QRIS.');

      for(let i = 0; i < totalChunks; i++) {
        const chunk = cleanBase64.slice(i * chunkSize, (i + 1) * chunkSize);
        await this.request('appendQrisUploadChunk', {
          token,
          upload_id: uploadId,
          index: i,
          chunk
        }, {
          timeout: 45000,
          modes: ['flat']
        });

        if(typeof onProgress === 'function') {
          onProgress(Math.round(((i + 1) / totalChunks) * 90));
        }
      }

      return this.request('finishQrisUpload', {
        token,
        upload_id: uploadId,
        filename,
        mime: detectedMime
      }, {
        timeout: 60000,
        modes: ['flat']
      });
    },

    delay(ms){
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  window.Api = Api;
})();
