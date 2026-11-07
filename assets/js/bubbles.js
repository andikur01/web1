/* Animasi gelembung bulat penuh layar di atas konten (dekorasi, bukan kontrol).
   Digambar di canvas 2D: ringan, hanya transform lewat requestAnimationFrame. */
(function () {
  const canvas = document.getElementById('bubbles');
  if (!canvas) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) {
    canvas.remove();
    return;
  }

  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let bubbles = [];
  let raf = null;
  let visible = true;

  function size() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(n) {
    const count = Math.max(10, Math.min(26, Math.round((w * h) / 62000)));
    bubbles = Array.from({ length: count }, () => {
      const r = 12 + Math.random() * 78;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -(0.12 + Math.random() * 0.3),
        a: 0.05 + Math.random() * 0.1,
        hue: Math.random() > 0.72 ? 'gold' : 'white'
      };
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const b of bubbles) {
      b.x += b.vx;
      b.y += b.vy;
      if (b.y + b.r < 0) {
        b.y = h + b.r;
        b.x = Math.random() * w;
      }
      if (b.x < -b.r) b.x = w + b.r;
      if (b.x > w + b.r) b.x = -b.r;

      const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
      const base = b.hue === 'gold' ? '201, 169, 110' : '255, 255, 255';
      grad.addColorStop(0, 'rgba(' + base + ',' + (b.a * 0.9).toFixed(3) + ')');
      grad.addColorStop(0.7, 'rgba(' + base + ',' + (b.a * 0.35).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + base + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(' + base + ',' + (b.a * 0.7).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    raf = requestAnimationFrame(draw);
  }

  function start() {
    if (raf) return;
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  size();
  spawn();

  window.addEventListener(
    'resize',
    GLM.debounce(() => {
      size();
      spawn();
    }, 220)
  );

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) start();
    else stop();
  });

  reduce.addEventListener?.('change', (e) => {
    if (e.matches) {
      stop();
      canvas.remove();
    }
  });

  start();
})();
