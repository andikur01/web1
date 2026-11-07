/* Panel internal: ringkasan, produk, ulasan, tim, aktivitas, pengaturan. */
(function () {
  const G = window.GLM;
  const el = (id) => document.getElementById(id);
  const state = {
    me: null,
    settings: {},
    products: [],
    testimonials: [],
    users: [],
    activity: [],
    stats: null,
    outbox: [],
    presence: [],
    view: 'ringkasan',
    impersonateTarget: null,
    stream: null
  };

  const VIEW_TITLES = {
    ringkasan: 'Ringkasan',
    produk: 'Produk',
    ulasan: 'Ulasan',
    tim: 'Tim & akun',
    aktivitas: 'Log aktivitas',
    outbox: 'Email keluar',
    akun: 'Akun saya',
    pengaturan: 'Pengaturan toko'
  };

  const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', karyawan: 'Tim' };

  /* ------------------------------------------------------------- helpers */

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value == null ? '' : value;
  }

  function fmtDate(value) {
    if (!value) return '-';
    const iso = String(value).includes('T') ? value : String(value).replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    return String(name || 'G')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function openSheet(id) {
    el(id)?.classList.add('is-open');
    document.body.classList.add('is-locked');
  }

  function closeSheet(id) {
    if (id) el(id)?.classList.remove('is-open');
    else document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('is-open'));
    document.body.classList.remove('is-locked');
  }

  function logClass(action) {
    if (/login|verify/.test(action)) return 'log__dot--login';
    if (/fail|error|delete/.test(action)) return 'log__dot--warn';
    if (/product|settings|user|impersonate|account/.test(action)) return 'log__dot--acc';
    return '';
  }

  /* ------------------------------------------------------------------ API */

  async function api(url, options) {
    try {
      return await G.api(url, options);
    } catch (err) {
      if (err.status === 401) {
        if (window.GLM && window.GLM.nav) window.GLM.nav('/masuk'); else window.location.href = '/masuk';
        return null;
      }
      G.toast(err.message, 'error');
      throw err;
    }
  }

  /* ------------------------------------------------------------- navigasi */

  function switchView(name) {
    if (!VIEW_TITLES[name]) name = 'ringkasan';
    state.view = name;
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
    document.querySelectorAll('.side__link').forEach((b) => b.setAttribute('aria-current', String(b.dataset.view === name)));
    setText('viewTitle', VIEW_TITLES[name]);
    el('side')?.classList.remove('is-open');
    el('dashBurger')?.setAttribute('aria-expanded', 'false');
    notifyPresence();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function notifyPresence() {
    G.api('/api/presence', { method: 'POST', body: { page: '/dashboard/' + state.view } }).catch(() => {});
  }

  /* -------------------------------------------------------------- render */

  function renderMe() {
    const me = state.me;
    if (!me) return;
    const staff = me.staff;
    setText('whoName', me.user.name);
    setText('whoRole', ROLE_LABEL[me.user.role] || me.user.role);
    setText('whoAvatar', initials(me.user.name));
    setText('sideBrand', state.settings.logo_text || 'GLM');
    document.title = 'Dashboard ' + (state.settings.logo_text || 'GLM');

    document.querySelectorAll('[data-staff-only]').forEach((n) => (n.hidden = !staff));
    if (!staff && ['tim', 'pengaturan', 'aktivitas', 'outbox'].includes(state.view)) switchView('ringkasan');

    const imp = el('impersonatePill');
    if (imp) {
      imp.hidden = !me.impersonating;
      if (me.impersonating) imp.textContent = 'Kembali ke ' + me.realUser.name;
    }
    setText('pfName', me.user.name);
    setText('pfUser', me.user.username);
    setText('pfEmail', me.user.email);
  }

  function renderStats() {
    const s = state.stats;
    const box = el('statCards');
    if (!s || !box) return;
    const cards = [
      ['Sedang online', s.onlineNow, 'Sesi aktif saat ini'],
      ['Perangkat pernah berkunjung', s.totalDevices, 'Perangkat unik yang membuka situs'],
      ['Akun aktif', s.activeUsers, 'Dari ' + s.totalUsers + ' akun terdaftar'],
      ['Pernah masuk', s.everLoggedIn, 'Akun yang sudah login minimal sekali'],
      ['Masuk hari ini', s.loginsToday, 'Semua akun'],
      ['Produk aktif', s.productCount, 'Tampil di halaman toko'],
      ['Email keluar', s.outboxCount, 'Mode: ' + (s.mailerMode || '-')]
    ];
    box.innerHTML = cards
      .map(
        (c) =>
          '<article class="stat"><p class="stat__label">' +
          G.escapeHtml(c[0]) +
          '</p><p class="stat__value">' +
          G.escapeHtml(String(c[1])) +
          '</p><p class="stat__foot">' +
          G.escapeHtml(c[2]) +
          '</p></article>'
      )
      .join('');
  }

  function renderChart() {
    const chart = el('loginChart');
    const axis = el('loginAxis');
    const note = el('chartNote');
    if (!chart) return;
    const rows = (state.stats && state.stats.hourly) || [];
    if (!rows.length) {
      chart.innerHTML = '';
      axis.innerHTML = '';
      note.hidden = false;
      return;
    }
    note.hidden = true;
    const max = Math.max(...rows.map((r) => r.c));
    chart.innerHTML = rows
      .map(
        (r) =>
          '<div class="chart__bar" style="height:' +
          Math.max(6, (r.c / max) * 100) +
          '%"><span>' +
          r.c +
          '</span></div>'
      )
      .join('');
    axis.innerHTML = rows.map((r) => '<span>' + G.escapeHtml(String(r.bucket).slice(11, 16)) + '</span>').join('');
  }

  function renderPages() {
    const box = el('pagesTable');
    if (!box) return;
    const rows = (state.stats && state.stats.pages) || [];
    if (!rows.length) {
      box.innerHTML = '<div class="empty"><h3>Belum ada data</h3><p>Data muncul setelah ada pengunjung atau aktivitas panel.</p></div>';
      return;
    }
    box.innerHTML =
      '<table><thead><tr><th>Halaman</th><th>Kunjungan</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td>' + G.escapeHtml(r.page || '/') + '</td><td>' + r.hits + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function renderLogInto(target, rows) {
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<div class="empty"><h3>Belum ada aktivitas</h3><p>Aktivitas akan tercatat di sini.</p></div>';
      return;
    }
    target.innerHTML = rows
      .map(
        (a) =>
          '<div class="log__row"><span class="log__time">' +
          G.escapeHtml(fmtDate(a.created_at)) +
          '</span><span class="log__dot ' +
          logClass(a.action) +
          '"></span><span class="log__body"><b>' +
          G.escapeHtml(a.user_name || 'Sistem') +
          '</b> <span>' +
          G.escapeHtml(a.action) +
          (a.detail ? ' - ' + G.escapeHtml(a.detail) : '') +
          '</span></span></div>'
      )
      .join('');
  }

  function renderPresence() {
    const list = el('presenceList');
    const count = el('presenceCount');
    const online = state.presence || [];
    setText('onlineText', online.length + ' online');
    if (count) count.textContent = String(online.length);
    if (state.stats && state.stats.onlineNow !== online.length) {
      state.stats.onlineNow = online.length;
      renderStats();
    }
    if (!list) return;
    if (!online.length) {
      list.innerHTML = '<div class="empty"><h3>Tidak ada sesi aktif</h3><p>Sesi yang sedang membuka panel akan tampil di sini.</p></div>';
      return;
    }
    list.innerHTML = online
      .map(
        (p) =>
          '<div class="person"><span class="person__dot"></span><span class="person__body"><b>' +
          G.escapeHtml(p.name) +
          '</b><span>' +
          G.escapeHtml(p.page || '/dashboard') +
          '</span></span><span class="pill">' +
          p.devices +
          ' perangkat</span></div>'
      )
      .join('');
  }

  function renderProducts() {
    const body = el('productRows');
    const empty = el('productRowsEmpty');
    if (!body) return;
    const rows = state.products;
    if (!rows.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = rows
      .map(
        (p) =>
          '<tr><td><img class="thumb" src="' +
          G.escapeHtml(p.image || 'assets/img/product-1.jpg') +
          '" alt="" width="54" height="40" loading="lazy"></td><td class="wrap-cell">' +
          G.escapeHtml(p.name) +
          '</td><td>' +
          G.escapeHtml(p.brand) +
          '</td><td>' +
          G.escapeHtml(p.category) +
          '</td><td>' +
          G.rupiah(p.price) +
          '</td><td>' +
          p.stock +
          '</td><td>' +
          (p.active ? '<span class="tag">Tampil</span>' : '<span class="tag tag--off">Disembunyikan</span>') +
          '</td><td><span class="row-actions"><button class="btn btn--ghost btn--sm" type="button" data-edit-product="' +
          p.id +
          '">Ubah</button><button class="btn btn--ghost btn--sm" type="button" data-del-product="' +
          p.id +
          '">Hapus</button></span></td></tr>'
      )
      .join('');
    body.querySelectorAll('[data-edit-product]').forEach((b) =>
      b.addEventListener('click', () => editProduct(Number(b.dataset.editProduct)))
    );
    body.querySelectorAll('[data-del-product]').forEach((b) =>
      b.addEventListener('click', () => removeProduct(Number(b.dataset.delProduct)))
    );
  }

  function renderReviews() {
    const body = el('reviewRows');
    const empty = el('reviewRowsEmpty');
    if (!body) return;
    const rows = state.testimonials;
    if (!rows.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = rows
      .map(
        (t) =>
          '<tr><td>' +
          G.escapeHtml(t.name) +
          '</td><td>' +
          G.escapeHtml(t.city || '-') +
          '</td><td>' +
          t.rating +
          '</td><td class="wrap-cell">' +
          G.escapeHtml(t.body) +
          '</td><td>' +
          (t.active ? '<span class="tag">Tampil</span>' : '<span class="tag tag--off">Disembunyikan</span>') +
          '</td><td><span class="row-actions"><button class="btn btn--ghost btn--sm" type="button" data-edit-review="' +
          t.id +
          '">Ubah</button><button class="btn btn--ghost btn--sm" type="button" data-del-review="' +
          t.id +
          '">Hapus</button></span></td></tr>'
      )
      .join('');
    body.querySelectorAll('[data-edit-review]').forEach((b) =>
      b.addEventListener('click', () => editReview(Number(b.dataset.editReview)))
    );
    body.querySelectorAll('[data-del-review]').forEach((b) =>
      b.addEventListener('click', () => removeReview(Number(b.dataset.delReview)))
    );
  }

  function renderUsers() {
    const body = el('userRows');
    if (!body) return;
    const canManage = state.me?.staff;
    const isOwner = state.me?.user?.role === 'owner';
    body.innerHTML = state.users
      .map((u) => {
        const roleTag = u.role === 'owner' ? 'tag--owner' : u.role === 'admin' ? 'tag--admin' : '';
        const actions = [];
        if (canManage) {
          actions.push('<button class="btn btn--ghost btn--sm" type="button" data-edit-user="' + u.id + '">Ubah</button>');
          if (u.role !== 'owner' || isOwner) {
            actions.push('<button class="btn btn--ghost btn--sm" type="button" data-pin-user="' + u.id + '">Lihat PIN</button>');
          }
          if (u.role === 'karyawan' || (isOwner && u.role !== 'owner')) {
            actions.push('<button class="btn btn--ghost btn--sm" type="button" data-imp-user="' + u.id + '">Masuk sebagai</button>');
          }
          if (isOwner && u.role !== 'owner') {
            actions.push('<button class="btn btn--ghost btn--sm" type="button" data-del-user="' + u.id + '">Hapus</button>');
          }
        }
        return (
          '<tr><td>' +
          G.escapeHtml(u.name) +
          '</td><td>' +
          G.escapeHtml(u.username) +
          '</td><td>' +
          G.escapeHtml(u.email) +
          '</td><td><span class="tag ' +
          roleTag +
          '">' +
          (ROLE_LABEL[u.role] || u.role) +
          '</span></td><td>' +
          u.device_count +
          '</td><td>' +
          fmtDate(u.last_login_at) +
          '</td><td>' +
          (u.active ? '<span class="tag">Aktif</span>' : '<span class="tag tag--off">Nonaktif</span>') +
          '</td><td><span class="row-actions">' +
          actions.join('') +
          '</span></td></tr>'
        );
      })
      .join('');
    body.querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => editUser(Number(b.dataset.editUser))));
    body.querySelectorAll('[data-pin-user]').forEach((b) => b.addEventListener('click', () => showPin(Number(b.dataset.pinUser))));
    body.querySelectorAll('[data-del-user]').forEach((b) => b.addEventListener('click', () => removeUser(Number(b.dataset.delUser))));
    body.querySelectorAll('[data-imp-user]').forEach((b) => b.addEventListener('click', () => openImpersonate(Number(b.dataset.impUser))));
  }

  function renderOutbox() {
    const list = el('outboxList');
    if (!list) return;
    setText('outboxMode', state.outboxMode || '-');
    setText(
      'outboxNote',
      state.outboxMode === 'smtp'
        ? 'Email dikirim lewat SMTP yang sudah dikonfigurasi di server.'
        : 'SMTP belum diisi, jadi email ditahan di daftar ini. Isi SMTP_HOST dan kredensial lain di server supaya email benar-benar terkirim.'
    );
    if (!state.outbox.length) {
      list.innerHTML = '<div class="empty"><h3>Belum ada email</h3><p>Email verifikasi dan undangan akun akan muncul di sini.</p></div>';
      return;
    }
    list.innerHTML = state.outbox
      .map(
        (m) =>
          '<details class="log__row" style="display:block"><summary style="cursor:pointer"><b>' +
          G.escapeHtml(m.subject) +
          '</b> <span style="color:var(--muted)">ke ' +
          G.escapeHtml(m.to_email) +
          ' - ' +
          G.escapeHtml(fmtDate(m.created_at)) +
          (m.sent ? ' - terkirim' : m.error ? ' - gagal: ' + G.escapeHtml(m.error) : ' - ditahan') +
          '</span></summary><pre style="white-space:pre-wrap;color:var(--muted);font-size:13px;margin:10px 0 0">' +
          G.escapeHtml(m.body) +
          '</pre></details>'
      )
      .join('');
  }

  /* --------------------------------------------------------- produk form */

  function resetProductForm() {
    el('productForm').reset();
    el('pr_id').value = '';
    el('pr_active').checked = true;
    el('pr_sort_order').value = '0';
    setText('productSheetTitle', 'Produk baru');
  }

  function editProduct(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    resetProductForm();
    setText('productSheetTitle', 'Ubah produk');
    const map = {
      pr_id: p.id,
      pr_name: p.name,
      pr_brand: p.brand,
      pr_category: p.category,
      pr_cpu: p.cpu,
      pr_gpu: p.gpu,
      pr_ram: p.ram,
      pr_storage: p.storage,
      pr_screen: p.screen,
      pr_price: p.price,
      pr_old_price: p.old_price || '',
      pr_stock: p.stock,
      pr_badge: p.badge || '',
      pr_sort_order: p.sort_order,
      pr_image: p.image,
      pr_summary: p.summary,
      pr_specs: p.specs
    };
    for (const [key, value] of Object.entries(map)) if (el(key)) el(key).value = value;
    el('pr_active').checked = !!p.active;
    openSheet('productSheet');
  }

  async function removeProduct(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm('Hapus produk "' + p.name + '"? Tindakan ini tidak bisa dibatalkan.')) return;
    await api('/api/products/' + id, { method: 'DELETE' });
    G.toast('Produk dihapus', 'ok');
    await loadProducts();
    await loadStats();
  }

  /* ---------------------------------------------------------- ulasan form */

  function resetReviewForm() {
    el('reviewForm').reset();
    el('rv_id').value = '';
    el('rv_rating').value = '5';
    el('rv_active').checked = true;
    setText('reviewSheetTitle', 'Ulasan baru');
  }

  function editReview(id) {
    const t = state.testimonials.find((x) => x.id === id);
    if (!t) return;
    resetReviewForm();
    setText('reviewSheetTitle', 'Ubah ulasan');
    el('rv_id').value = t.id;
    el('rv_name').value = t.name;
    el('rv_city').value = t.city || '';
    el('rv_rating').value = t.rating || 5;
    el('rv_image').value = t.image || '';
    el('rv_body').value = t.body;
    el('rv_active').checked = !!t.active;
    openSheet('reviewSheet');
  }

  async function removeReview(id) {
    if (!window.confirm('Hapus ulasan ini?')) return;
    await api('/api/testimonials/' + id, { method: 'DELETE' });
    G.toast('Ulasan dihapus', 'ok');
    await loadReviews();
  }

  /* ------------------------------------------------------------ akun form */

  function resetUserForm() {
    el('userForm').reset();
    el('us_id').value = '';
    el('us_active').checked = true;
    el('us_password').value = '';
    el('us_pin').value = '';
    setText('userSheetTitle', 'Akun baru');
  }

  function editUser(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    resetUserForm();
    setText('userSheetTitle', 'Ubah akun');
    el('us_id').value = u.id;
    el('us_name').value = u.name;
    el('us_username').value = u.username;
    el('us_email').value = u.email;
    el('us_role').value = u.role;
    el('us_active').checked = !!u.active;
    el('us_role_wrap').hidden = !state.me?.canManageUsers;
    openSheet('userSheet');
  }

  async function removeUser(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    if (!window.confirm('Hapus akun "' + u.name + '" (' + u.username + ')?')) return;
    await api('/api/users/' + id, { method: 'DELETE' });
    G.toast('Akun dihapus', 'ok');
    await loadUsers();
    await loadStats();
  }

  function openImpersonate(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    state.impersonateTarget = u;
    setText('impLead', 'Masukkan PIN akun ' + u.name + ' (' + u.username + ') untuk melihat panel dari sisi akun tersebut.');
    el('imp_pin').value = '';
    openSheet('impSheet');
    el('imp_pin').focus();
  }

  async function showPin(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    const data = await api('/api/users/' + id + '/pin');
    setText('pinSheetTitle', 'PIN ' + u.name);
    setText('pinLead', 'Akun ' + u.username + ' (' + (ROLE_LABEL[u.role] || u.role) + ').');
    const reveal = el('pinReveal');
    reveal.hidden = !data.pin;
    setText('pinValue', data.pin || '');
    setText('pinNote', data.note || '');
    openSheet('pinSheet');
  }

  /* ------------------------------------------------------------- loading */

  async function loadSettings() {
    // Semua peran butuh nama merek; hanya staff yang butuh seluruh pengaturan.
    const boot = await api('/api/public/bootstrap');
    state.settings = boot.settings || {};
    if (!state.me?.staff) return;
    const data = await api('/api/settings');
    state.settings = data.settings || {};
    const form = el('settingsForm');
    if (!form) return;
    form.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      let value = state.settings[key] == null ? '' : state.settings[key];
      if (input.type === 'datetime-local' && value) value = String(value).slice(0, 16);
      input.value = value;
    });
  }

  async function loadProducts() {
    const data = await api('/api/products');
    state.products = data.products || [];
    renderProducts();
  }

  async function loadReviews() {
    const data = await api('/api/testimonials');
    state.testimonials = data.testimonials || [];
    renderReviews();
  }

  async function loadUsers() {
    if (!state.me?.staff) return;
    const data = await api('/api/users');
    state.users = data.users || [];
    renderUsers();
  }

  async function loadActivity() {
    if (!state.me?.staff) return;
    const data = await api('/api/activity');
    state.activity = data.activity || [];
    renderLogInto(el('recentLog'), state.activity.slice(0, 12));
    applyLogFilter();
  }

  function applyLogFilter() {
    const filter = el('logFilter')?.value || 'all';
    const map = {
      auth: /auth\./,
      account: /account\.|user\./,
      product: /product\./,
      settings: /settings\./
    };
    const rows = filter === 'all' ? state.activity : state.activity.filter((a) => map[filter]?.test(a.action));
    renderLogInto(el('fullLog'), rows);
  }

  async function loadOutbox() {
    if (!state.me?.staff) return;
    const data = await api('/api/outbox');
    state.outbox = data.outbox || [];
    state.outboxMode = data.mode;
    renderOutbox();
    const pill = el('mailModePill');
    if (pill) pill.textContent = 'Email: ' + (data.mode === 'smtp' ? 'SMTP' : 'tertahan');
  }

  async function loadDevices() {
    const data = await api('/api/me/devices');
    const body = el('deviceRows');
    if (!body) return;
    const rows = data.devices || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Belum ada perangkat tercatat.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map(
        (d) =>
          '<tr><td class="wrap-cell">' +
          G.escapeHtml(d.label || 'Perangkat') +
          '<br><span style="color:var(--muted-2);font-size:12px">' +
          G.escapeHtml(String(d.device_id).slice(0, 22)) +
          '</span></td><td>' +
          (d.trusted ? '<span class="tag">Dipercaya</span>' : '<span class="tag">Perlu PIN</span>') +
          '</td><td>' +
          fmtDate(d.first_seen) +
          '</td><td>' +
          fmtDate(d.last_seen) +
          '</td><td><span class="row-actions"><button class="btn btn--ghost btn--sm" type="button" data-del-device="' +
          d.id +
          '">Cabut</button></span></td></tr>'
      )
      .join('');
    body.querySelectorAll('[data-del-device]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('Cabut perangkat ini? Perangkat akan minta PIN saat masuk lagi.')) return;
        await api('/api/me/devices/' + b.dataset.delDevice, { method: 'DELETE' });
        G.toast('Perangkat dicabut', 'ok');
        loadDevices();
      })
    );
  }

  async function loadStats() {
    const data = await api('/api/stats');
    state.stats = data;
    renderStats();
    renderChart();
    renderPages();
    renderPresence();
  }

  /* --------------------------------------------------------------- stream */

  function openStream() {
    if (state.stream) state.stream.close();
    const stream = new EventSource('/api/stream');
    state.stream = stream;

    stream.addEventListener('presence', (e) => {
      try {
        const data = JSON.parse(e.data);
        state.presence = data.online || [];
        renderPresence();
        setText('onlineText', (data.onlineCount || 0) + ' online');
      } catch {
        /* payload presence tidak valid, abaikan */
      }
    });

    stream.addEventListener('presence-self', (e) => {
      try {
        const data = JSON.parse(e.data);
        setText('onlineText', (data.onlineCount || 0) + ' online');
      } catch {
        /* abaikan */
      }
    });

    stream.addEventListener('activity', () => {
      loadActivity();
      loadStats();
    });

    stream.onerror = () => {
      /* EventSource mencoba menyambung ulang sendiri */
    };
  }

  /* --------------------------------------------------------------- aksi */

  function initForms() {
    el('productForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = el('pr_id').value;
      const payload = {
        name: el('pr_name').value.trim(),
        brand: el('pr_brand').value.trim(),
        category: el('pr_category').value,
        cpu: el('pr_cpu').value.trim(),
        gpu: el('pr_gpu').value.trim(),
        ram: el('pr_ram').value.trim(),
        storage: el('pr_storage').value.trim(),
        screen: el('pr_screen').value.trim(),
        price: Number(el('pr_price').value || 0),
        old_price: el('pr_old_price').value === '' ? null : Number(el('pr_old_price').value),
        stock: Number(el('pr_stock').value || 0),
        badge: el('pr_badge').value.trim(),
        sort_order: Number(el('pr_sort_order').value || 0),
        image: el('pr_image').value.trim(),
        summary: el('pr_summary').value.trim(),
        specs: el('pr_specs').value.trim(),
        active: el('pr_active').checked
      };
      await api(id ? '/api/products/' + id : '/api/products', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      G.toast(id ? 'Produk diperbarui' : 'Produk ditambahkan', 'ok');
      closeSheet('productSheet');
      await loadProducts();
      await loadStats();
    });

    el('reviewForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = el('rv_id').value;
      const payload = {
        name: el('rv_name').value.trim(),
        city: el('rv_city').value.trim(),
        rating: Number(el('rv_rating').value || 5),
        image: el('rv_image').value.trim(),
        body: el('rv_body').value.trim(),
        active: el('rv_active').checked
      };
      await api(id ? '/api/testimonials/' + id : '/api/testimonials', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      G.toast(id ? 'Ulasan diperbarui' : 'Ulasan ditambahkan', 'ok');
      closeSheet('reviewSheet');
      await loadReviews();
    });

    el('userForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = el('us_id').value;
      const payload = {
        name: el('us_name').value.trim(),
        username: el('us_username').value.trim(),
        email: el('us_email').value.trim(),
        role: el('us_role').value,
        active: el('us_active').checked
      };
      if (el('us_password').value.trim()) payload.newPassword = el('us_password').value.trim();
      if (el('us_pin').value.trim()) payload.newPin = el('us_pin').value.trim();

      if (id) {
        await api('/api/users/' + id, { method: 'PUT', body: payload });
        G.toast('Akun diperbarui', 'ok');
      } else {
        const data = await api('/api/users', {
          method: 'POST',
          body: {
            name: payload.name,
            username: payload.username,
            email: payload.email,
            role: payload.role,
            password: el('us_password').value.trim() || undefined
          }
        });
        G.toast('Akun dibuat. Password dan PIN dikirim ke email akun tersebut.', 'ok');
        if (data.initialPassword) G.toast('Mode uji - password awal: ' + data.initialPassword + ', PIN: ' + data.initialPin);
      }
      closeSheet('userSheet');
      await loadUsers();
      await loadOutbox();
      await loadStats();
    });

    el('impForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.impersonateTarget) return;
      await api('/api/users/' + state.impersonateTarget.id + '/impersonate', {
        method: 'POST',
        body: { pin: el('imp_pin').value.trim() }
      });
      G.toast('Sekarang masuk sebagai ' + state.impersonateTarget.name, 'ok');
      closeSheet('impSheet');
      await boot();
    });

    el('settingsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {};
      e.target.querySelectorAll('[data-setting]').forEach((input) => {
        body[input.dataset.setting] = input.value;
      });
      await api('/api/settings', { method: 'PUT', body });
      G.toast('Pengaturan disimpan', 'ok');
      await loadSettings();
      setText('sideBrand', state.settings.logo_text || 'GLM');
    });

    el('settingsForm')?.addEventListener('reset', () => setTimeout(loadSettings, 0));

    el('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = await api('/api/me/profile', {
        method: 'PUT',
        body: { name: el('pfName').value.trim(), username: el('pfUser').value.trim(), email: el('pfEmail').value.trim() }
      });
      state.me.user = data.user;
      renderMe();
      G.toast('Profil disimpan', 'ok');
    });

    el('pinForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api('/api/me/pin', {
        method: 'PUT',
        body: { currentPassword: el('pfPass').value, newPin: el('pfPin').value.trim() }
      });
      el('pinForm').reset();
      G.toast('PIN diperbarui. Perangkat baru akan memakai PIN ini.', 'ok');
    });

    el('logFilter')?.addEventListener('change', applyLogFilter);

    el('newProduct')?.addEventListener('click', () => {
      resetProductForm();
      openSheet('productSheet');
    });
    el('newReview')?.addEventListener('click', () => {
      resetReviewForm();
      openSheet('reviewSheet');
    });
    el('newUser')?.addEventListener('click', () => {
      resetUserForm();
      el('us_role_wrap').hidden = !state.me?.canManageUsers;
      openSheet('userSheet');
    });

    el('impShowPin')?.addEventListener('click', () => {
      if (state.impersonateTarget) showPin(state.impersonateTarget.id);
    });

    el('pinCopy')?.addEventListener('click', async () => {
      const value = el('pinValue')?.textContent || '';
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        G.toast('PIN disalin', 'ok');
      } catch {
        G.toast('Tidak bisa menyalin otomatis', 'warn');
      }
    });

    document.querySelectorAll('[data-close-sheet]').forEach((n) =>
      n.addEventListener('click', () => closeSheet(n.closest('.sheet')?.id))
    );

    document.querySelectorAll('.side__link').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

    el('dashBurger')?.addEventListener('click', () => {
      const side = el('side');
      const open = side.classList.toggle('is-open');
      el('dashBurger').setAttribute('aria-expanded', String(open));
    });

    el('logoutBtn')?.addEventListener('click', async () => {
      await G.api('/api/auth/logout', { method: 'POST' });
      if (window.GLM && window.GLM.nav) window.GLM.nav('/masuk'); else window.location.href = '/masuk';
    });

    el('impersonatePill')?.addEventListener('click', async () => {
      await api('/api/stop-impersonate', { method: 'POST' });
      window.location.reload();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });
  }

  /* ----------------------------------------------------------------- boot */

  async function boot() {
    if (G.isStatic && G.isStatic()) return showStaticNotice();
    const me = await api('/api/auth/me');
    if (!me) return;
    state.me = me;
    if (!me.staff) {
      // Akun tim tetap melihat ringkasan, produk, dan ulasan.
      document.querySelectorAll('[data-staff-only]').forEach((n) => (n.hidden = true));
    }

    await loadSettings();
    renderMe();
    await Promise.all([loadProducts(), loadReviews(), loadUsers(), loadActivity(), loadOutbox(), loadDevices(), loadStats()]);
    openStream();
    notifyPresence();
    G.icons(document);
  }

  function init() {
    initForms();
    boot().catch(() => {});
  }

  /* Di GitHub Pages tidak ada backend: tampilkan pemberitahuan. */
  function showStaticNotice() {
    const main = document.querySelector('.main');
    if (!main) return;
    document.querySelectorAll('.view').forEach((n) => (n.hidden = true));
    const box = document.createElement('div');
    box.className = 'static-note';
    box.setAttribute('role', 'status');
    box.innerHTML =
      '<b>Mode demo (GitHub Pages)</b><p>Panel internal butuh server (login, database, realtime). ' +
      'Jalankan versi lengkapnya dengan <code>npm start</code>, lalu buka <code>/masuk</code> dan klik logo 5x.</p>';
    main.prepend(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
