/* Utilitas bersama untuk situs toko dan dashboard. */
window.GLM = window.GLM || {};

(function (G) {
  G.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  };

  G.rupiah = function (n) {
    const num = Number(n || 0);
    if (!num) return 'Hubungi kami';
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  G.api = async function (url, options) {
    const opt = Object.assign({ headers: {} }, options || {});
    if (opt.body && typeof opt.body !== 'string') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(opt.body);
    }
    const res = await fetch(url, opt);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Permintaan gagal (' + res.status + ')');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  G.toast = function (message, kind) {
    const stack = document.getElementById('toasts');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => el.remove(), 300);
    }, 4200);
  };

  G.icons = function (root) {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ nameAttr: 'data-lucide', attrs: { 'stroke-width': 1.6 } });
    }
  };

  G.deviceId = function () {
    try {
      let id = localStorage.getItem('glm_device_id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('glm_device_id', id);
      }
      return id;
    } catch {
      return 'dev_unknown';
    }
  };

  G.deviceLabel = function () {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Perangkat lain';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : 'Browser';
    return browser + ' di ' + os;
  };

  G.debounce = function (fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };
})(window.GLM);
