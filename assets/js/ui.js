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

  /* Mode statis (GitHub Pages): kalau tidak ada backend, pakai snapshot demo. */
  G.isStatic = function () {
    if (typeof window.GLM_DEMO === 'undefined') return false;
    if (window.GLM && window.GLM.base && window.GLM.base !== '/') return true;
    return location.protocol === 'file:' || /\.github\.io$/.test(location.hostname);
  };

  G.demoData = function (url) {
    const demo = window.GLM_DEMO;
    if (!demo) return null;
    const key = String(url).split('?')[0];
    return Object.prototype.hasOwnProperty.call(demo, key) ? demo[key] : null;
  };

  G.api = async function (url, options) {
    const opt = Object.assign({ headers: {} }, options || {});
    if (opt.body && typeof opt.body !== 'string') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(opt.body);
    }
    try {
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
    } catch (err) {
      const offline = !err || err.status === undefined || err.status === 404 || err.status >= 500;
      const demo = offline ? G.demoData(url) : null;
      if (demo) return demo;
      throw err;
    }
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
