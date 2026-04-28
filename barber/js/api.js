(function(){
  /**
   * API client Google Apps Script Web App.
   * v1.2:
   * - Mendukung beberapa endpoint: script.google.com /exec + alternatif googleusercontent.
   * - Retry otomatis per endpoint dan mode parameter payload/flat.
   * - Default tetap JSONP agar aman di GitHub Pages + Chrome Mobile.
   */
  const Api = {
    getEndpoints(){
      const main = window.APP_CONFIG?.GAS_URL || '';
      const extras = Array.isArray(window.APP_CONFIG?.GAS_URL_ALTERNATES) ? window.APP_CONFIG.GAS_URL_ALTERNATES : [];
      return [main].concat(extras).map(x=>String(x||'').trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
    },

    request(action, data = {}, options = {}) {
      const payload = Object.assign({}, data, { action });
      const timeout = options.timeout || window.APP_CONFIG?.API_TIMEOUT_MS || 30000;
      return this.jsonpWithRetry(payload, timeout);
    },

    async jsonpWithRetry(payload, timeout) {
      const endpoints = this.getEndpoints();
      if(!endpoints.length) throw new Error('GAS_URL belum diisi di js/config.js');
      const attempts = [];
      endpoints.forEach(endpoint => {
        attempts.push({ endpoint, mode: 'payload', timeout });
        attempts.push({ endpoint, mode: 'flat', timeout: Math.max(timeout, 35000) });
        attempts.push({ endpoint, mode: 'payload', timeout: Math.max(timeout, 45000), cacheBuster: true });
      });

      let lastErr = null;
      for (const attempt of attempts) {
        try { return await this.jsonp(payload, attempt); }
        catch (err) { lastErr = err; await this.delay(450); }
      }

      throw new Error(
        (lastErr && lastErr.message ? lastErr.message : 'Gagal terhubung ke GAS.') +
        ' Chrome Mobile: pastikan Web App akses Anyone, deployment /exec terbaru, atau isi GAS_URL_ALTERNATES dengan URL googleusercontent jika tersedia.'
      );
    },

    jsonp(payload, attempt) {
      return new Promise((resolve, reject) => {
        const cb = 'bb_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        let done = false;

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout. Periksa koneksi internet, deployment GAS, atau endpoint alternatif.'));
        }, attempt.timeout || 30000);

        function cleanup(){
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { delete window[cb]; } catch(e) { window[cb] = undefined; }
          script.onload = null;
          script.onerror = null;
          if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[cb] = (res) => {
          cleanup();
          if (!res) return reject(new Error('Response kosong dari server.'));
          if (res.status && String(res.status).toLowerCase() === 'error') {
            return reject(new Error(res.message || 'Terjadi error pada server.'));
          }
          resolve(res);
        };

        let url;
        try { url = new URL(attempt.endpoint || window.APP_CONFIG.GAS_URL); }
        catch (err) { cleanup(); return reject(new Error('URL GAS/alternatif tidak valid di js/config.js')); }

        url.searchParams.set('callback', cb);
        url.searchParams.set('_', String(Date.now()) + Math.random().toString(36).slice(2));

        if (attempt.mode === 'flat') {
          Object.keys(payload || {}).forEach(k => {
            const v = payload[k];
            if (v !== undefined && v !== null && typeof v !== 'object') url.searchParams.set(k, String(v));
            else if (v !== undefined && v !== null) url.searchParams.set(k, JSON.stringify(v));
          });
        } else {
          url.searchParams.set('payload', JSON.stringify(payload));
        }

        script.async = true;
        script.referrerPolicy = 'no-referrer-when-downgrade';
        script.onerror = () => {
          cleanup();
          reject(new Error('Gagal terhubung ke endpoint GAS: ' + (attempt.endpoint || '')));
        };
        script.src = url.toString();
        (document.head || document.documentElement).appendChild(script);
      });
    },

    delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  };

  window.Api = Api;
})();
