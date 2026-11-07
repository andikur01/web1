/* Situs toko GLM: data, animasi, keranjang, dan checkout WhatsApp. */
(function () {
  const G = window.GLM;
  const state = {
    settings: {},
    products: [],
    testimonials: [],
    cart: [],
    wishlist: [],
    filter: 'all',
    query: '',
    heroIndex: 0,
    config: {}
  };

  const HERO_BRANDS = [
    { key: 'ASUS ROG.', brand: 'ASUS', name: 'ASUS ROG Strix G16', img: 'assets/img/hero-rog.jpg', color: 'rgba(226, 35, 26, 0.42)' },
    { key: 'MacBook Pro.', brand: 'Apple', name: 'MacBook Pro 14 M3', img: 'assets/img/hero-macbook.jpg', color: 'rgba(215, 215, 215, 0.34)' },
    { key: 'Lenovo Legion.', brand: 'Lenovo', name: 'Lenovo Legion Pro 5', img: 'assets/img/hero-legion.jpg', color: 'rgba(47, 111, 208, 0.42)' },
    { key: 'Acer Predator.', brand: 'Acer', name: 'Acer Predator Helios', img: 'assets/img/hero-predator.jpg', color: 'rgba(22, 212, 212, 0.36)' },
    { key: 'HP Omen.', brand: 'HP', name: 'HP Omen 16', img: 'assets/img/hero-omen.jpg', color: 'rgba(179, 40, 45, 0.4)' },
    { key: 'MSI Titan.', brand: 'MSI', name: 'MSI Titan GT77', img: 'assets/img/hero-msi.jpg', color: 'rgba(211, 32, 42, 0.42)' }
  ];

  const BRAND_LIST = ['ASUS', 'Apple', 'Lenovo', 'Acer', 'HP', 'MSI', 'Dell', 'Razer'];

  const CATEGORIES = [
    { id: 'gaming', title: 'Gaming', icon: 'gamepad-2', desc: 'Kartu grafis kelas atas, layar refresh tinggi, dan pendinginan kuat untuk main game berat.' },
    { id: 'office', title: 'Kerja & Office', icon: 'briefcase', desc: 'Ringan, baterai tahan lama, dan keyboard nyaman untuk kerja harian.' },
    { id: 'desain', title: 'Desain & Kreator', icon: 'palette', desc: 'Layar akurat warna dan tenaga ekstra untuk render, editing, dan ilustrasi.' },
    { id: 'ultrabook', title: 'Ultrabook', icon: 'feather', desc: 'Tipis, ringan, dan cepat untuk mobilitas tinggi.' }
  ];

  const PIN_NOTES = [
    { title: 'Spesifikasi terverifikasi', body: 'CPU, RAM, penyimpanan, dan GPU dicatat per unit, bukan per tipe.' },
    { title: 'Unit siap pakai', body: 'Sudah melalui pengecekan layar, baterai, dan keyboard sebelum dikirim.' },
    { title: 'Upgrade sebelum kirim', body: 'Minta tambahan RAM atau SSD, kami pasang sebelum unit dikirim.' }
  ];

  const PIN_SPECS = [
    { title: 'Garansi resmi', body: 'Klaim garansi lewat distributor resmi dengan nota pembelian.' },
    { title: 'Pengiriman aman', body: 'Packing berlapis dan asuransi pengiriman untuk unit bernilai tinggi.' }
  ];

  /* ------------------------------------------------------------ utilities */

  const el = (id) => document.getElementById(id);
  const money = (n) => G.rupiah(n);

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value == null ? '' : value;
  }

  function waLink(text) {
    const num = String(state.settings.whatsapp_number || '').replace(/[^0-9]/g, '');
    if (!num) return null;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }

  function openWa(text) {
    const link = waLink(text);
    if (!link) {
      G.toast('Nomor WhatsApp belum diisi. Isi di dashboard pada menu Pengaturan.', 'error');
      return false;
    }
    window.open(link, '_blank', 'noopener');
    return true;
  }

  function brandInfo(brand) {
    return HERO_BRANDS.find((b) => b.brand.toLowerCase() === String(brand || '').toLowerCase());
  }

  function fallbackImage(brand, index) {
    const info = brandInfo(brand);
    if (info) return info.img;
    return 'assets/img/product-' + ((index % 8) + 1) + '.jpg';
  }

  function productSpecList(p) {
    return [
      ['cpu', 'cpu', p.cpu],
      ['ram', 'memory-stick', p.ram],
      ['storage', 'hard-drive', p.storage],
      ['gpu', 'monitor', p.gpu]
    ].filter((row) => row[2] && row[2] !== 'Belum diisi');
  }

  /* --------------------------------------------------------- data loading */

  async function loadBootstrap() {
    const [boot, config] = await Promise.all([G.api('/api/public/bootstrap'), G.api('/api/public/config')]);
    state.settings = boot.settings || {};
    state.products = (boot.products || []).filter((p) => p.name && !/^contoh:/i.test(p.name));
    state.testimonials = boot.testimonials || [];
    state.config = config || {};
  }

  async function trackVisit() {
    try {
      await G.api('/api/public/track-visit', {
        method: 'POST',
        body: { deviceId: G.deviceId(), page: location.pathname }
      });
    } catch {
      /* pencatatan kunjungan tidak boleh mengganggu halaman */
    }
  }

  /* ----------------------------------------------------------- preloader */

  function runPreloader() {
    const pre = el('preloader');
    if (!pre) return Promise.resolve();
    const bar = el('preloaderBar');
    const pct = el('preloaderPct');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setText('preloaderWord', state.settings.intro_text || state.settings.logo_text || 'GLM');
    setText('preloaderSub', state.settings.intro_sub || state.settings.brand_sub || '');

    const videoUrl = String(state.settings.intro_video_url || '').trim();
    const holder = el('preloaderVideo');
    if (videoUrl && holder) {
      holder.hidden = false;
      const isEmbed = /youtube\.com|youtu\.be|vimeo\.com/.test(videoUrl);
      if (isEmbed) {
        const src = videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/');
        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = 'Video intro GLM';
        frame.allow = 'autoplay; encrypted-media';
        holder.appendChild(frame);
      } else {
        const video = document.createElement('video');
        video.src = videoUrl;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        holder.appendChild(video);
      }
    }

    return new Promise((resolve) => {
      let value = 0;
      const done = () => {
        if (reduce) {
          pre.hidden = true;
          resolve();
          return;
        }
        gsap.to(pre, {
          yPercent: -100,
          duration: 0.85,
          ease: 'power3.inOut',
          onComplete: () => {
            pre.hidden = true;
            resolve();
          }
        });
      };
      const step = () => {
        value += Math.random() * 16 + 6;
        if (value >= 100) {
          value = 100;
          if (bar) bar.style.width = '100%';
          setText('preloaderPct', '100%');
          setTimeout(done, 260);
          return;
        }
        if (bar) bar.style.width = value + '%';
        setText('preloaderPct', Math.round(value) + '%');
        setTimeout(step, 130);
      };
      setTimeout(step, reduce ? 0 : 200);
    });
  }

  /* ------------------------------------------------------------- nav & bar */

  function initNav() {
    const nav = el('nav');
    const progress = el('progress');
    let last = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('is-stuck', y > 40);
      if (y > last && y > 220) nav.classList.add('is-hidden');
      else nav.classList.remove('is-hidden');
      last = y;

      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const burger = el('burger');
    const drawer = el('drawer');
    burger?.addEventListener('click', () => {
      const open = drawer.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    drawer?.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        drawer.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      })
    );
  }

  /* ------------------------------------------------------- dynamic island */

  function initIsland() {
    const island = el('island');
    const title = el('islandTitle');
    const body = el('islandBody');
    if (!island) return;
    let open = false;
    let timer = null;

    const messages = () => {
      const ready = state.products.filter((p) => p.stock > 0);
      const list = [];
      if (state.settings.announcement) {
        list.push({ t: 'Info dari toko', b: state.settings.announcement });
      }
      for (const p of ready.slice(0, 4)) {
        list.push({
          t: p.name,
          b: p.stock <= 3 ? 'Stok tersisa ' + p.stock + ' unit' : 'Siap kirim hari ini, stok ' + p.stock + ' unit'
        });
      }
      list.push({ t: 'Konsultasi sebelum beli', b: 'Tanya spesifikasi dulu lewat WhatsApp, dijawab langsung.' });
      if (state.settings.promo_title) {
        list.push({ t: state.settings.promo_title, b: 'Cek unit promo di bagian Promo.' });
      }
      return list;
    };

    let pool = [];
    let cursor = 0;

    function show() {
      if (!pool.length) pool = messages();
      if (!pool.length) return;
      const item = pool[cursor % pool.length];
      cursor += 1;
      title.textContent = item.t;
      body.textContent = item.b;
      island.classList.add('is-open');
      open = true;
      clearTimeout(timer);
      timer = setTimeout(hide, 5200);
    }

    function hide() {
      island.classList.remove('is-open');
      open = false;
    }

    island.addEventListener('click', () => {
      if (open) {
        hide();
        clearTimeout(timer);
      } else {
        show();
      }
    });

    setInterval(() => {
      if (!document.hidden && !open) show();
    }, 6500);

    setTimeout(show, 2400);
  }

  /* ------------------------------------------------------------------ hero */

  function initHero() {
    const slides = el('heroSlides');
    const dots = el('heroDots');
    const glow = el('heroGlow');
    if (!slides) return;

    HERO_BRANDS.forEach((b, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'hero__slide';
      wrap.dataset.index = String(i);
      const img = document.createElement('img');
      img.src = b.img;
      img.alt = b.name;
      img.width = 1400;
      img.height = 1050;
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      if (i === 0) img.setAttribute('fetchpriority', 'high');
      wrap.appendChild(img);
      slides.appendChild(wrap);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Tampilkan ' + b.name);
      dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', () => selectHero(i));
      dots.appendChild(dot);
    });

    function priceFor(brand) {
      const list = state.products
        .filter((p) => String(p.brand).toLowerCase() === brand.toLowerCase() && Number(p.price) > 0)
        .sort((a, b) => a.price - b.price);
      return list.length ? 'Mulai ' + money(list[0].price) : 'Tanya harga lewat WhatsApp';
    }

    function selectHero(index) {
      if (index === state.heroIndex) return;
      state.heroIndex = index;
      const items = slides.querySelectorAll('.hero__slide');
      const prev = items[index === 0 ? items.length - 1 : index - 1];
      const next = items[index];
      const info = HERO_BRANDS[index];

      gsap.set(items, { zIndex: 0 });
      gsap.set(next, { zIndex: 1 });
      gsap.fromTo(
        next,
        { autoAlpha: 0, x: 40, rotate: -3, scale: 0.92 },
        { autoAlpha: 1, x: 0, rotate: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
      );
      gsap.to(prev, { autoAlpha: 0, x: -30, scale: 0.96, duration: 0.5, ease: 'power2.out' });

      glow.style.setProperty('--glow-color', info.color);
      setText('heroCaptionName', info.name);
      setText('heroCaptionPrice', priceFor(info.brand));
      dots.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
    }

    const first = slides.querySelector('.hero__slide');
    if (first) gsap.set(first, { autoAlpha: 1, zIndex: 1 });
    setText('heroCaptionName', HERO_BRANDS[0].name);
    setText('heroCaptionPrice', priceFor(HERO_BRANDS[0].brand));
    glow.style.setProperty('--glow-color', HERO_BRANDS[0].color);

    if (window.Typed) {
      new window.Typed('#heroType', {
        strings: HERO_BRANDS.map((b) => b.key),
        typeSpeed: 62,
        backSpeed: 34,
        backDelay: 1500,
        startDelay: 400,
        loop: true,
        smartBackspace: false,
        onStringTyped: (i) => selectHero(i)
      });
    }

    const spot = el('heroSpot');
    const hero = el('beranda');
    hero?.addEventListener('pointermove', (e) => {
      const rect = hero.getBoundingClientRect();
      spot.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
      spot.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
    });

    const magnetic = el('magneticBtn');
    if (magnetic && window.matchMedia('(hover: hover)').matches) {
      const strength = 18;
      magnetic.addEventListener('pointermove', (e) => {
        const r = magnetic.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        gsap.to(magnetic, { x: dx * strength, y: dy * strength, duration: 0.35, ease: 'power2.out' });
      });
      magnetic.addEventListener('pointerleave', () => {
        gsap.to(magnetic, { x: 0, y: 0, duration: 0.45, ease: 'elastic.out(1, 0.5)' });
      });
    }

    const consult = el('consultBtn');
    consult?.addEventListener('click', (e) => {
      if (!waLink('Halo GLM, saya mau konsultasi memilih laptop.')) return;
      e.preventDefault();
      openWa('Halo GLM, saya mau konsultasi memilih laptop.');
    });
  }

  /* --------------------------------------------------------------- marquee */

  function initMarquee() {
    const track = el('marqueeTrack');
    if (!track) return;
    const set = BRAND_LIST.concat(BRAND_LIST);
    track.innerHTML = set
      .map((b) => '<span class="marquee__item" aria-hidden="true">' + G.escapeHtml(b) + '</span>')
      .join('');
  }

  /* -------------------------------------------------------------- produk */

  function renderProducts() {
    const grid = el('productGrid');
    const empty = el('productEmpty');
    const count = el('productCount');
    if (!grid) return;

    const q = state.query.trim().toLowerCase();
    const list = state.products.filter((p) => {
      const okCat = state.filter === 'all' || p.category === state.filter;
      const okQ =
        !q ||
        [p.name, p.brand, p.cpu, p.ram, p.gpu].some((v) => String(v || '').toLowerCase().includes(q));
      return okCat && okQ;
    });

    grid.innerHTML = '';
    if (!list.length) {
      empty.hidden = false;
      count.textContent = '0 unit';
      return;
    }
    empty.hidden = true;
    count.textContent = list.length + ' unit tampil';

    for (const p of list) {
      const img = p.image || fallbackImage(p.brand, p.id);
      const specs = productSpecList(p).slice(0, 3);
      const wished = state.wishlist.includes(p.id);
      const badge =
        p.badge ||
        (p.stock > 0 && p.stock <= 3 ? 'Sisa ' + p.stock : p.stock === 0 ? 'Stok habis' : '');

      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('data-reveal', '');
      card.setAttribute('data-id', String(p.id));
      card.innerHTML =
        '<div class="card__media">' +
        '<img src="' + G.escapeHtml(img) + '" alt="' + G.escapeHtml(p.name) + '" width="900" height="675" loading="lazy" decoding="async">' +
        '<div class="card__badges">' +
        (badge ? '<span class="chip ' + (badge === 'Best Seller' ? 'chip--gold' : 'chip--live') + '">' + G.escapeHtml(badge) + '</span>' : '') +
        '</div>' +
        '<button class="card__wish" type="button" aria-pressed="' + wished + '" aria-label="Simpan ' + G.escapeHtml(p.name) + ' ke wishlist" data-wish="' + p.id + '">' +
        '<i data-lucide="heart"></i></button>' +
        '</div>' +
        '<div class="card__body">' +
        '<p class="card__brand">' + G.escapeHtml(p.brand) + '</p>' +
        '<h3 class="card__name">' + G.escapeHtml(p.name) + '</h3>' +
        '<ul class="specs">' +
        specs.map((s) => '<li><i data-lucide="' + s[1] + '"></i>' + G.escapeHtml(s[2]) + '</li>').join('') +
        '</ul>' +
        '<div class="card__price"><b>' + money(p.price) + '</b>' + (p.old_price ? '<s>' + money(p.old_price) + '</s>' : '') + '</div>' +
        '<div class="card__actions">' +
        '<button class="btn btn--primary btn--sm" type="button" data-add="' + p.id + '">Tambah ke Keranjang</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-view="' + p.id + '" aria-label="Lihat detail ' + G.escapeHtml(p.name) + '">Detail</button>' +
        '</div>' +
        '</div>';
      grid.appendChild(card);
    }

    G.icons(grid);
    applyReveal(grid.querySelectorAll('[data-reveal]'));

    if (window.VanillaTilt && window.matchMedia('(hover: hover)').matches) {
      grid.querySelectorAll('.card').forEach((c) =>
        window.VanillaTilt.init(c, { max: 6, speed: 700, glare: false, scale: 1.01, gyroscope: false })
      );
    }

    grid.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(Number(b.dataset.add));
      })
    );
    grid.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(Number(b.dataset.view));
      })
    );
    grid.querySelectorAll('[data-wish]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWish(Number(b.dataset.wish), b);
      })
    );
    grid.querySelectorAll('.card').forEach((c) =>
      c.addEventListener('click', () => openModal(Number(c.dataset.id)))
    );

    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  function prefersReduce() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Elemen [data-reveal] tampil saat masuk layar. Dipanggil ulang setiap kali kartu dirender. */
  function applyReveal(nodes) {
    const list = Array.from(nodes || []);
    if (!list.length) return;
    if (!window.gsap || !window.ScrollTrigger || prefersReduce()) {
      list.forEach((n) => {
        n.style.opacity = '1';
        n.style.transform = 'none';
        n.style.filter = 'none';
      });
      return;
    }
    window.ScrollTrigger.batch(list, {
      start: 'top 92%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.06, ease: 'power2.out' })
    });
  }

  function initProductTabs() {
    const tabs = el('categoryTabs');
    if (!tabs) return;

    const search = document.createElement('input');
    search.type = 'search';
    search.id = 'productSearch';
    search.placeholder = 'Cari merek atau tipe';
    search.setAttribute('aria-label', 'Cari produk');
    search.style.cssText =
      'flex:1;min-width:200px;padding:10px 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:14px';
    search.hidden = true;
    tabs.parentElement.appendChild(search);
    search.addEventListener(
      'input',
      G.debounce(() => {
        state.query = search.value;
        renderProducts();
      }, 220)
    );

    el('searchBtn')?.addEventListener('click', () => {
      search.hidden = !search.hidden;
      if (!search.hidden) search.focus();
      else {
        search.value = '';
        state.query = '';
        renderProducts();
      }
    });

    tabs.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        tabs.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
        tab.setAttribute('aria-selected', 'true');
        state.filter = tab.dataset.cat;
        renderProducts();
      })
    );
  }

  /* ------------------------------------------------------------ quick view */

  function openModal(id) {
    const p = state.products.find((x) => x.id === id);
    const modal = el('productModal');
    if (!p || !modal) return;

    const img = p.image || fallbackImage(p.brand, p.id);
    el('modalImage').src = img;
    el('modalImage').alt = p.name;
    setText('modalBrand', p.brand);
    setText('modalName', p.name);
    setText('modalSummary', p.summary || 'Belum ada ringkasan untuk unit ini.');
    setText('modalPrice', money(p.price));
    const old = el('modalOld');
    old.textContent = p.old_price ? money(p.old_price) : '';
    old.hidden = !p.old_price;

    const specs = el('modalSpecs');
    specs.innerHTML = productSpecList(p)
      .concat([['screen', 'monitor-smartphone', p.screen]])
      .filter((r) => r[2] && r[2] !== 'Belum diisi')
      .map((r) => '<li><i data-lucide="' + r[1] + '"></i>' + G.escapeHtml(r[2]) + '</li>')
      .join('');
    setText('modalNotes', p.specs || '');

    el('modalAdd').onclick = () => {
      addToCart(p.id);
      closeModal();
    };
    el('modalWa').onclick = () => {
      openWa(
        'Halo GLM, saya mau tanya unit ' +
          p.name +
          ' (' +
          p.brand +
          '). Spesifikasi: ' +
          [p.cpu, p.ram, p.storage, p.gpu].filter(Boolean).join(', ') +
          '.'
      );
    };

    modal.classList.add('is-open');
    document.body.classList.add('is-locked');
    G.icons(modal);
    el('modalAdd').focus();
  }

  function closeModal() {
    const modal = el('productModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    if (!el('cartDrawer')?.classList.contains('is-open')) document.body.classList.remove('is-locked');
  }

  /* -------------------------------------------------------------- wishlist */

  function toggleWish(id, btn) {
    const i = state.wishlist.indexOf(id);
    if (i >= 0) {
      state.wishlist.splice(i, 1);
      btn.setAttribute('aria-pressed', 'false');
      G.toast('Dihapus dari wishlist');
    } else {
      state.wishlist.push(id);
      btn.setAttribute('aria-pressed', 'true');
      G.toast('Disimpan ke wishlist');
    }
    try {
      localStorage.setItem('glm_wishlist', JSON.stringify(state.wishlist));
    } catch {
      /* localStorage bisa diblokir; wishlist tetap jalan di sesi ini */
    }
  }

  /* -------------------------------------------------------------- keranjang */

  function addToCart(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    const row = state.cart.find((c) => c.id === id);
    if (row) row.qty += 1;
    else state.cart.push({ id, qty: 1 });
    renderCart();
    G.toast(p.name + ' masuk keranjang', 'ok');
  }

  function cartDetailed() {
    return state.cart
      .map((row) => {
        const p = state.products.find((x) => x.id === row.id);
        return p ? { p, qty: row.qty } : null;
      })
      .filter(Boolean);
  }

  function renderCart() {
    const list = el('cartList');
    const badge = el('cartBadge');
    const total = el('cartTotal');
    if (!list) return;

    const rows = cartDetailed();
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    badge.textContent = String(qty);
    badge.hidden = qty === 0;
    total.textContent = money(rows.reduce((s, r) => s + Number(r.p.price) * r.qty, 0));

    if (!rows.length) {
      list.innerHTML =
        '<div class="empty"><h3>Keranjang kosong</h3><p>Tambahkan unit dari daftar stok, lalu kirim pesanan lewat WhatsApp.</p></div>';
      return;
    }

    list.innerHTML = '';
    for (const { p, qty: q } of rows) {
      const img = p.image || fallbackImage(p.brand, p.id);
      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML =
        '<button class="cart-row__head" type="button" aria-expanded="false" data-toggle="' + p.id + '">' +
        '<img src="' + G.escapeHtml(img) + '" alt="" width="52" height="40" loading="lazy">' +
        '<span><b>' + G.escapeHtml(p.name) + '</b><span>' + money(p.price) + ' x ' + q + '</span></span>' +
        '<span class="chev"><i data-lucide="chevron-down"></i></span>' +
        '</button>' +
        '<div class="cart-row__body" id="cartBody-' + p.id + '">' +
        '<dl>' +
        '<dt>Merek</dt><dd>' + G.escapeHtml(p.brand) + '</dd>' +
        '<dt>CPU</dt><dd>' + G.escapeHtml(p.cpu || '-') + '</dd>' +
        '<dt>RAM</dt><dd>' + G.escapeHtml(p.ram || '-') + '</dd>' +
        '<dt>Penyimpanan</dt><dd>' + G.escapeHtml(p.storage || '-') + '</dd>' +
        '<dt>GPU</dt><dd>' + G.escapeHtml(p.gpu || '-') + '</dd>' +
        '<dt>Layar</dt><dd>' + G.escapeHtml(p.screen || '-') + '</dd>' +
        (p.specs ? '<dt>Catatan</dt><dd>' + G.escapeHtml(p.specs) + '</dd>' : '') +
        '</dl>' +
        '<div class="qty">' +
        '<button type="button" data-dec="' + p.id + '" aria-label="Kurangi jumlah">-</button>' +
        '<span>' + q + '</span>' +
        '<button type="button" data-inc="' + p.id + '" aria-label="Tambah jumlah">+</button>' +
        '</div> ' +
        '<button class="btn btn--ghost btn--sm" type="button" data-del="' + p.id + '">Hapus</button>' +
        '</div>';
      list.appendChild(row);
    }
    G.icons(list);

    list.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        el('cartBody-' + btn.dataset.toggle).classList.toggle('is-open', !open);
      })
    );
    list.querySelectorAll('[data-inc]').forEach((b) =>
      b.addEventListener('click', () => {
        const row = state.cart.find((c) => c.id === Number(b.dataset.inc));
        if (row) row.qty += 1;
        renderCart();
      })
    );
    list.querySelectorAll('[data-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        const row = state.cart.find((c) => c.id === Number(b.dataset.dec));
        if (row) {
          row.qty -= 1;
          if (row.qty <= 0) state.cart = state.cart.filter((c) => c.id !== row.id);
        }
        renderCart();
      })
    );
    list.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        state.cart = state.cart.filter((c) => c.id !== Number(b.dataset.del));
        renderCart();
      })
    );
  }

  function openCart() {
    el('cartDrawer')?.classList.add('is-open');
    document.body.classList.add('is-locked');
    renderCart();
  }

  function closeCart() {
    el('cartDrawer')?.classList.remove('is-open');
    if (!el('productModal')?.classList.contains('is-open')) document.body.classList.remove('is-locked');
  }

  function buildWaOrder() {
    const rows = cartDetailed();
    const lines = rows.map(
      (r, i) =>
        (i + 1) +
        '. ' +
        r.p.name +
        ' (' +
        r.p.brand +
        ') x' +
        r.qty +
        '\n   ID: ' +
        r.p.id +
        '\n   ' +
        [r.p.cpu, r.p.ram, r.p.storage, r.p.gpu].filter((v) => v && v !== 'Belum diisi').join(' | ')
    );
    const total = rows.reduce((s, r) => s + Number(r.p.price) * r.qty, 0);
    return (
      'Halo GLM, saya mau pesan:\n\n' +
      lines.join('\n') +
      '\n\nEstimasi total: ' +
      money(total) +
      '\n\nMohon konfirmasi ketersediaan dan cara pembayaran.'
    );
  }

  /* ------------------------------------------------------------ kategori */

  function initCategories() {
    const track = el('catTrack');
    if (!track) return;
    track.innerHTML = CATEGORIES.map(
      (c) =>
        '<article class="cat">' +
        '<span class="cat__icon"><i data-lucide="' + c.icon + '"></i></span>' +
        '<div><h3>' + G.escapeHtml(c.title) + '</h3><p>' + G.escapeHtml(c.desc) + '</p></div>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-cat-jump="' + c.id + '">Lihat unit</button>' +
        '</article>'
    ).join('');
    G.icons(track);

    track.querySelectorAll('[data-cat-jump]').forEach((b) =>
      b.addEventListener('click', () => {
        state.filter = b.dataset.catJump;
        document.querySelectorAll('#categoryTabs .tab').forEach((t) =>
          t.setAttribute('aria-selected', String(t.dataset.cat === state.filter))
        );
        renderProducts();
        document.getElementById('produk').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }

  /* ------------------------------------------------------ pinned showcase */

  function initPin() {
    const left = el('pinNotesLeft');
    const right = el('pinNotesRight');
    if (!left || !right) return;
    left.innerHTML = PIN_NOTES.map(
      (n) => '<div class="pin__note"><h4>' + G.escapeHtml(n.title) + '</h4><p>' + G.escapeHtml(n.body) + '</p></div>'
    ).join('');
    right.innerHTML =
      '<div class="pin__note"><h4>Laptop unggulan</h4><p>Unit yang paling sering dicari pelanggan kami, dari kelas kerja sampai gaming.</p></div>' +
      PIN_SPECS.map(
        (n) => '<div class="pin__note"><h4>' + G.escapeHtml(n.title) + '</h4><p>' + G.escapeHtml(n.body) + '</p></div>'
      ).join('');
  }

  /* -------------------------------------------------------------- promo */

  function initCountdown() {
    const end = state.settings.promo_end;
    setText('promoTitle', state.settings.promo_title || 'Flash Sale');
    setText('promoDesc', state.settings.promo_desc || '');
    const status = el('promoStatus');
    const boxes = ['cdDays', 'cdHours', 'cdMinutes', 'cdSeconds'].map(el);

    if (!end) {
      status.textContent = 'Jadwal promo belum diisi dari dashboard.';
      return;
    }
    const target = new Date(end).getTime();
    if (Number.isNaN(target)) {
      status.textContent = 'Format jadwal promo tidak dikenali.';
      return;
    }
    status.textContent = 'Berakhir ' + new Date(target).toLocaleString('id-ID');

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        boxes.forEach((b) => (b.textContent = '0'));
        status.textContent = 'Promo sudah berakhir.';
        clearInterval(timer);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText('cdDays', String(d));
      setText('cdHours', String(h));
      setText('cdMinutes', String(m));
      setText('cdSeconds', String(s));
    };
    tick();
    const timer = setInterval(tick, 1000);
  }

  /* ----------------------------------------------------------- testimoni */

  function initReviews() {
    const wrapper = el('reviewWrapper');
    const empty = el('reviewEmpty');
    const swiperEl = el('reviewSwiper');
    if (!wrapper) return;

    if (!state.testimonials.length) {
      empty.hidden = false;
      swiperEl.hidden = true;
      return;
    }
    empty.hidden = true;
    swiperEl.hidden = false;

    wrapper.innerHTML = state.testimonials
      .map((t) => {
        const stars = Array.from({ length: Math.max(1, Math.min(5, Number(t.rating) || 5)) })
          .map(() => '<i data-lucide="star"></i>')
          .join('');
        return (
          '<div class="swiper-slide"><article class="quote">' +
          '<div class="quote__stars" aria-label="Penilaian ' + (Number(t.rating) || 5) + ' dari 5">' + stars + '</div>' +
          '<p>' + G.escapeHtml(t.body) + '</p>' +
          '<div class="quote__who">' +
          (t.image
            ? '<img src="' + G.escapeHtml(t.image) + '" alt="" width="42" height="42" loading="lazy">'
            : '') +
          '<span><b>' + G.escapeHtml(t.name) + '</b>' + (t.city ? '<span>' + G.escapeHtml(t.city) + '</span>' : '') + '</span>' +
          '</div></article></div>'
        );
      })
      .join('');
    G.icons(wrapper);

    if (window.Swiper) {
      new window.Swiper('#reviewSwiper', {
        slidesPerView: 1,
        spaceBetween: 20,
        loop: state.testimonials.length > 2,
        autoplay: { delay: 4200, disableOnInteraction: false, pauseOnMouseEnter: true },
        pagination: { el: '.swiper-pagination', clickable: true },
        breakpoints: { 760: { slidesPerView: 2 }, 1080: { slidesPerView: 3 } },
        a11y: { enabled: true }
      });
    }
  }

  /* -------------------------------------------------------------- footer */

  function initFooter() {
    const s = state.settings;
    setText('year', String(new Date().getFullYear()));
    setText('footerAddress', s.contact_address || 'Alamat belum diisi');
    setText('footerWord', s.logo_text || 'GLM');

    const wa = el('footerWa');
    const link = waLink('Halo GLM, saya mau tanya stok laptop.');
    if (link) wa.href = link;
    else
      wa.addEventListener('click', (e) => {
        e.preventDefault();
        openWa('Halo GLM, saya mau tanya stok laptop.');
      });

    const socials = [
      ['socialIg', s.social_instagram],
      ['socialTt', s.social_tiktok],
      ['socialYt', s.social_youtube]
    ];
    for (const [id, url] of socials) {
      const node = el(id);
      if (node && url) {
        node.href = url;
        node.hidden = false;
      }
    }

    const map = el('footerMap');
    if (map) {
      const q = encodeURIComponent(s.maps_query || s.contact_address || 'Jakarta');
      map.innerHTML =
        '<iframe title="Lokasi toko GLM" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' +
        q +
        '&output=embed"></iframe>';
    }

    el('newsletterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el('newsletterEmail');
      const note = el('newsletterNote');
      try {
        await G.api('/api/public/newsletter', { method: 'POST', body: { email: input.value } });
        note.textContent = 'Terdaftar. Info stok dan promo akan dikirim ke ' + input.value + '.';
        G.toast('Email kamu tercatat', 'ok');
        input.value = '';
      } catch (err) {
        note.textContent = err.message;
        G.toast(err.message, 'error');
      }
    });
  }

  /* --------------------------------------------------------------- cursor */

  function initCursor() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const dot = el('cursorDot');
    const ring = el('cursorRing');
    if (!dot || !ring) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;

    window.addEventListener('pointermove', (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = 'translate(' + (x - 3) + 'px,' + (y - 3) + 'px)';
      const hot = e.target.closest('a, button, .card, input, .tab');
      ring.classList.toggle('is-hot', !!hot);
    });

    const loop = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      const size = ring.classList.contains('is-hot') ? 58 : 34;
      ring.style.transform = 'translate(' + (rx - size / 2) + 'px,' + (ry - size / 2) + 'px)';
      requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------------------------------------------------------- animations */

  function initAnimations() {
    const reduce = prefersReduce();
    if (!window.gsap || !window.ScrollTrigger) {
      applyReveal(document.querySelectorAll('[data-reveal]'));
      return;
    }
    gsap.registerPlugin(window.ScrollTrigger, window.SplitText);

    if (window.Lenis && !reduce) {
      const lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 1 });
      lenis.on('scroll', window.ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    if (reduce) {
      applyReveal(document.querySelectorAll('[data-reveal]'));
      return;
    }

    /* Teks judul section muncul kata per kata (hero tidak dipecah agar efek ketik tetap jalan) */
    document.querySelectorAll('.section-head h2, .promo__body h2').forEach((h) => {
      try {
        const split = new window.SplitText(h, { type: 'words', wordsClass: 'split-word' });
        gsap.from(split.words, {
          y: 26,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: { trigger: h, start: 'top 88%', once: true }
        });
      } catch {
        /* SplitText gagal pada elemen tertentu tidak boleh mematikan halaman */
      }
    });

    /* Paragraf berubah dari abu ke putih mengikuti scroll */
    document.querySelectorAll('.section-head p').forEach((p) => {
      gsap.fromTo(
        p,
        { color: '#6f6f6f' },
        {
          color: '#f5f5f5',
          ease: 'none',
          scrollTrigger: { trigger: p, start: 'top 85%', end: 'top 45%', scrub: true }
        }
      );
    });

    /* Kartu dan blok lain muncul bertahap */
    applyReveal(document.querySelectorAll('[data-reveal]'));

    /* Parallax keluar untuk hero */
    const heroCopy = el('heroCopy');
    if (heroCopy) {
      gsap.to(heroCopy, {
        yPercent: -12,
        autoAlpha: 0.2,
        scale: 0.96,
        ease: 'none',
        scrollTrigger: { trigger: '#beranda', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    /* Section kategori bergeser ke samping */
    const track = el('catTrack');
    if (track && window.innerWidth > 900) {
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 40);
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: '#kategori',
          start: 'top top',
          end: () => '+=' + (distance() + window.innerHeight * 0.5),
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true
        }
      });
    }

    /* Showcase unggulan di-pin, gambar berputar mengikuti scroll */
    const pinImage = el('pinImage');
    if (pinImage) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#unggulan',
          start: 'top top',
          end: '+=200%',
          pin: true,
          scrub: 1
        }
      });
      tl.fromTo(pinImage, { scale: 0.86, rotate: -6 }, { scale: 1.06, rotate: 6, ease: 'none' }, 0);
      const notes = document.querySelectorAll('.pin__note');
      notes.forEach((n, i) => {
        tl.to(n, { opacity: 1, borderColor: '#c9a96e', duration: 0.4 }, i * 0.6);
      });
    }

    /* Banner promo terbuka dari tengah */
    document.querySelectorAll('[data-clip]').forEach((node) => {
      gsap.fromTo(
        node.querySelector('img'),
        { clipPath: 'inset(46% 46% 46% 46%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: node, start: 'top 80%', once: true }
        }
      );
    });

    window.ScrollTrigger.refresh();
  }

  /* --------------------------------------------------------------- boot */

  async function boot() {
    try {
      await loadBootstrap();
    } catch {
      G.toast('Gagal memuat data toko. Menampilkan tampilan dasar.', 'error');
    }

    try {
      state.wishlist = JSON.parse(localStorage.getItem('glm_wishlist') || '[]');
    } catch {
      state.wishlist = [];
    }

    initNav();
    initMarquee();
    initHero();
    initProductTabs();
    renderProducts();
    initCategories();
    initPin();
    initCountdown();
    initReviews();
    initFooter();
    initCursor();
    initIsland();

    const models = state.products.length;
    setText('statModels', String(models));
    setText('heroLabel', state.settings.hero_label || 'GLM Laptop Store');
    setText('heroTitleText', state.settings.hero_title || 'Laptop Impian Kamu,');
    setText('heroDesc', state.settings.hero_desc || '');
    setText('statWarranty', state.settings.stat_warranty || 'Garansi Resmi');

    const logoImg = el('logoImage');
    const logoText = el('logoText');
    if (state.settings.logo_image) {
      logoImg.src = state.settings.logo_image;
      logoImg.alt = state.settings.logo_text || 'GLM';
      logoImg.hidden = false;
      logoText.hidden = true;
    }
    setText('logoText', state.settings.logo_text || 'GLM');
    setText('logoSub', state.settings.brand_sub || '');
    document.title = (state.settings.logo_text || 'GLM') + ' - Toko Laptop Original & Bergaransi';

    /* angka pelanggan diisi dari dashboard, jadi tidak dikarang */
    const customers = Number(String(state.settings.stat_customers || '0').replace(/[^0-9]/g, '')) || 0;
    const statNode = el('statCustomers');
    if (statNode) {
      statNode.dataset.count = String(customers);
      statNode.textContent = String(customers);
    }

    G.icons(document);

    el('cartBtn')?.addEventListener('click', openCart);
    document.querySelectorAll('[data-close-cart]').forEach((n) => n.addEventListener('click', closeCart));
    document.querySelectorAll('[data-close-modal]').forEach((n) => n.addEventListener('click', closeModal));
    el('clearCart')?.addEventListener('click', () => {
      state.cart = [];
      renderCart();
    });
    el('checkoutBtn')?.addEventListener('click', () => {
      if (!state.cart.length) {
        G.toast('Keranjang masih kosong', 'error');
        return;
      }
      openWa(buildWaOrder());
    });
    el('waFloat')?.addEventListener('click', () => openWa('Halo GLM, saya mau tanya stok laptop.'));

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeModal();
      closeCart();
      el('drawer')?.classList.remove('is-open');
    });

    renderCart();
    await runPreloader();
    initAnimations();

    /* Angka statistik menghitung naik setelah preloader */
    if (window.gsap && customers > 0) {
      const obj = { v: 0 };
      gsap.to(obj, {
        v: customers,
        duration: 1.6,
        ease: 'power2.out',
        onUpdate: () => (statNode.textContent = Math.round(obj.v).toLocaleString('id-ID') + '+')
      });
    }

    trackVisit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
