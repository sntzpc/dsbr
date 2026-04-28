(function(){
  const Api = {
    request(action, data = {}, options = {}) {
      const payload = Object.assign({}, data, { action });
      return this.jsonp(payload, options.timeout || 30000);
    },
    jsonp(payload, timeout) {
      return new Promise((resolve, reject) => {
        const cb = 'bb_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout. Periksa koneksi atau deployment GAS.'));
        }, timeout);
        function cleanup(){
          clearTimeout(timer);
          try { delete window[cb]; } catch(e) { window[cb] = undefined; }
          if (script.parentNode) script.parentNode.removeChild(script);
        }
        window[cb] = (res) => {
          cleanup();
          if (!res) return reject(new Error('Response kosong dari server.'));
          if (res.status && String(res.status).toLowerCase() === 'error') return reject(new Error(res.message || 'Terjadi error pada server.'));
          resolve(res);
        };
        const url = new URL(window.APP_CONFIG.GAS_URL);
        url.searchParams.set('callback', cb);
        url.searchParams.set('payload', JSON.stringify(payload));
        url.searchParams.set('_', String(Date.now()));
        script.onerror = () => { cleanup(); reject(new Error('Gagal terhubung ke GAS. Cek URL deployment dan akses Web App.')); };
        script.src = url.toString();
        document.body.appendChild(script);
      });
    }
  };
  window.Api = Api;
})();
