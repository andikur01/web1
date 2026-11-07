/* Pintu masuk panel internal: klik logo 5 kali cepat (dalam 2,5 detik).
   Sengaja tidak ada tombol atau tulisan yang menandai adanya panel ini. */
(function () {
  const CLICKS = 5;
  const WINDOW_MS = 2500;
  let count = 0;
  let first = 0;

  function go() {
    if (window.GLM && window.GLM.nav) window.GLM.nav('/masuk');
    else window.location.href = '/masuk';
  }

  function arm(node) {
    if (!node) return;
    node.addEventListener('click', (e) => {
      e.preventDefault();
      const now = Date.now();
      if (!first || now - first > WINDOW_MS) {
        first = now;
        count = 0;
      }
      count += 1;
      if (count >= CLICKS) {
        count = 0;
        first = 0;
        go();
      }
    });
  }

  function boot() {
    arm(document.getElementById('logo'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
