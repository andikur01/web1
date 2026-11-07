/* Deteksi base path + muat snapshot data demo.
   Dipakai supaya situs jalan di dua tempat:
   - Server Node (root, "/")
   - GitHub Pages (sub-folder repo, "/nama-repo/") */
(function () {
  var isPages = /\.github\.io$/.test(location.hostname);
  var seg = location.pathname.split('/').filter(Boolean)[0] || '';
  var base = isPages && seg ? '/' + seg + '/' : '/';
  if (location.protocol === 'file:') base = './';

  window.GLM_BASE = base;
  window.GLM = window.GLM || {};
  window.GLM.base = base;
  window.GLM.pages = isPages || location.protocol === 'file:';

  /* Rute ramah tanpa ekstensi di server; di GitHub Pages pakai nama file asli. */
  var PAGES_MAP = { '/masuk': 'masuk.html', '/dashboard': 'dashboard/', '/': 'index.html' };
  window.GLM.nav = function (target) {
    var p = String(target || '/');
    var rel = isPages || location.protocol === 'file:' ? PAGES_MAP[p] || p.replace(/^\//, '') : p;
    location.href = base === './' ? rel : base + rel.replace(/^\//, '');
  };

  var s = document.createElement('script');
  s.src = base + 'assets/js/env.js';
  s.async = false;
  document.head.appendChild(s);
})();
