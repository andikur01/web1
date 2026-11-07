/* Halaman masuk dan daftar panel internal. */
(function () {
  const G = window.GLM;
  const el = (id) => document.getElementById(id);
  let config = {};
  let settings = {};
  let challengeId = null;
  let pendingRegister = null;

  function showPanel(name) {
    for (const key of ['Login', 'Register', 'Pin']) {
      const node = el('panel' + key);
      if (node) node.hidden = key.toLowerCase() !== name;
    }
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === name)));
  }

  function clearErrors() {
    document.querySelectorAll('.err').forEach((n) => (n.textContent = ''));
  }

  function setError(id, message) {
    const node = el(id);
    if (node) node.textContent = message || '';
  }

  function captchaToken(id) {
    const node = el(id);
    if (!node || !config.turnstileEnabled) return null;
    const input = node.querySelector('input[name="cf-turnstile-response"]');
    return input ? input.value : null;
  }

  async function initCaptcha() {
    if (!config.turnstileEnabled) {
      document.querySelectorAll('.cf-turnstile').forEach((n) => (n.parentElement.hidden = true));
      return;
    }
    document.querySelectorAll('.cf-turnstile').forEach((n) => n.setAttribute('data-sitekey', config.turnstileSiteKey || ''));
  }

  function initGoogle() {
    const slots = [el('googleLoginSlot'), el('googleRegisterSlot')];
    if (!config.googleEnabled) {
      const staticMode = G.isStatic && G.isStatic();
      const note = staticMode
        ? 'Masuk dengan Google tidak tersedia di mode demo (GitHub Pages).'
        : 'Masuk dengan Google belum aktif. Hubungi pemilik toko.';
      for (const slot of slots) {
        if (!slot) continue;
        slot.innerHTML = '<p class="note">' + note + '</p>';
      }
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: onGoogleCredential });
      for (const slot of slots) {
        if (!slot) continue;
        slot.innerHTML = '';
        window.google.accounts.id.renderButton(slot, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320
        });
      }
    };
    document.head.appendChild(script);
  }

  async function onGoogleCredential(response) {
    try {
      const data = await G.api('/api/auth/google', {
        method: 'POST',
        body: { credential: response.credential, deviceId: G.deviceId(), deviceLabel: G.deviceLabel() }
      });
      if (data.ok) {
        if (window.GLM && window.GLM.nav) window.GLM.nav('/dashboard'); else window.location.href = '/dashboard';
        return;
      }
      G.toast('Masuk dengan Google gagal', 'error');
    } catch (err) {
      G.toast(err.message, 'error');
    }
  }

  function initTabs() {
    document.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => showPanel(b.dataset.mode))
    );
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.goto)));
  }

  async function submitLogin(e) {
    e.preventDefault();
    clearErrors();
    const identifier = el('loginIdent').value.trim();
    const password = el('loginPass').value;
    let bad = false;
    if (!identifier) {
      setError('loginIdentErr', 'Isi email atau username.');
      bad = true;
    }
    if (!password) {
      setError('loginPassErr', 'Isi password.');
      bad = true;
    }
    if (bad) return;

    const btn = el('loginSubmit');
    btn.disabled = true;
    btn.textContent = 'Memproses';
    try {
      const data = await G.api('/api/auth/login', {
        method: 'POST',
        body: {
          identifier,
          password,
          deviceId: G.deviceId(),
          deviceLabel: G.deviceLabel(),
          turnstileToken: captchaToken('loginCaptcha')
        }
      });
      if (data.ok) {
        if (window.GLM && window.GLM.nav) window.GLM.nav('/dashboard'); else window.location.href = '/dashboard';
        return;
      }
      if (data.needPin) {
        challengeId = data.challengeId;
        setText('pinLead', 'Perangkat ini belum dikenal. Masukkan PIN yang dikirim ke ' + (data.maskedEmail || 'email akun') + '.');
        showDevNote('devPinNote', data.devPin);
        buildPinInputs();
        showPanel('pin');
      }
    } catch (err) {
      setError('loginPassErr', err.message);
      G.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  }

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value;
  }

  function showDevNote(id, code) {
    const node = el(id);
    if (!node) return;
    if (!code) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    node.textContent = 'Mode uji (SMTP belum diisi): kode ' + code;
  }

  function buildPinInputs() {
    const box = el('pinInputs');
    box.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 1;
      input.autocomplete = 'one-time-code';
      input.setAttribute('aria-label', 'Angka PIN ke-' + (i + 1));
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && input.nextElementSibling) input.nextElementSibling.focus();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && input.previousElementSibling) input.previousElementSibling.focus();
        if (e.key === 'Enter') submitPin();
      });
      box.appendChild(input);
    }
    box.querySelector('input')?.focus();
  }

  function readPin() {
    return Array.from(el('pinInputs').querySelectorAll('input'))
      .map((i) => i.value)
      .join('');
  }

  async function submitPin() {
    const pin = readPin();
    if (pin.length < 6) {
      G.toast('PIN belum lengkap', 'error');
      return;
    }
    const btn = el('pinSubmit');
    btn.disabled = true;
    btn.textContent = 'Memeriksa';
    try {
      const data = await G.api('/api/auth/pin', {
        method: 'POST',
        body: { challengeId, pin, deviceId: G.deviceId(), deviceLabel: G.deviceLabel() }
      });
      if (data.ok) {
        if (window.GLM && window.GLM.nav) window.GLM.nav('/dashboard'); else window.location.href = '/dashboard';
        return;
      }
    } catch (err) {
      G.toast(err.message, 'error');
      el('pinInputs').querySelectorAll('input').forEach((i) => (i.value = ''));
      el('pinInputs').querySelector('input')?.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verifikasi PIN';
    }
  }

  async function resendPin() {
    try {
      const data = await G.api('/api/auth/pin/resend', { method: 'POST', body: { challengeId } });
      challengeId = data.challengeId;
      showDevNote('devPinNote', data.devPin);
      G.toast('PIN baru sudah dikirim ke email', 'ok');
    } catch (err) {
      G.toast(err.message, 'error');
    }
  }

  async function submitRegister(e) {
    e.preventDefault();
    clearErrors();
    const name = el('regName').value.trim();
    const username = el('regUser').value.trim();
    const email = el('regEmail').value.trim();
    const password = el('regPass').value;
    let bad = false;
    if (!name) {
      setError('regNameErr', 'Isi nama.');
      bad = true;
    }
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      setError('regUserErr', 'Username 3 sampai 24 karakter, hanya huruf, angka, titik, garis.');
      bad = true;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('regEmailErr', 'Format email tidak valid.');
      bad = true;
    }
    if (password.length < 8) {
      setError('regPassErr', 'Password minimal 8 karakter.');
      bad = true;
    }
    if (bad) return;

    const btn = el('registerSubmit');
    btn.disabled = true;
    btn.textContent = 'Membuat akun';
    try {
      const data = await G.api('/api/auth/register', {
        method: 'POST',
        body: {
          name,
          username,
          email,
          password,
          deviceId: G.deviceId(),
          deviceLabel: G.deviceLabel(),
          turnstileToken: captchaToken('regCaptcha')
        }
      });
      pendingRegister = { challengeId: data.challengeId, email };
      el('verifyModal').classList.add('is-open');
      el('verifyModal').classList.remove('is-done');
      setText('verifyLead', 'Kami kirim kode verifikasi 6 angka ke ' + email + '. Masukkan kodenya untuk mengaktifkan akun.');
      showDevNote('devVerifyNote', data.devCode);
      el('verifyCode').value = '';
      el('verifyCode').focus();
      G.icons(el('verifyModal'));
    } catch (err) {
      setError('regEmailErr', err.message);
      G.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Daftar';
    }
  }

  async function submitVerify() {
    const code = el('verifyCode').value.replace(/\D/g, '');
    if (code.length !== 6) {
      setError('verifyErr', 'Kode terdiri dari 6 angka.');
      return;
    }
    const btn = el('verifySubmit');
    btn.disabled = true;
    btn.textContent = 'Memeriksa';
    try {
      const data = await G.api('/api/auth/verify', {
        method: 'POST',
        body: { challengeId: pendingRegister.challengeId, code, deviceLabel: G.deviceLabel() }
      });
      if (data.ok) {
        const modal = el('verifyModal');
        modal.classList.add('is-done');
        el('verifyCore').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="check-path" d="M20 6 9 17l-5-5"/></svg>';
        setText('verifyTitle', 'Email terverifikasi');
        setText('verifyLead', 'Akun aktif. Kamu akan diarahkan ke dashboard.');
        setTimeout(() => {
          if (window.GLM && window.GLM.nav) window.GLM.nav('/dashboard');
          else window.location.href = '/dashboard';
        }, 1400);
      }
    } catch (err) {
      setError('verifyErr', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verifikasi';
    }
  }

  async function boot() {
    try {
      const boot = await G.api('/api/public/bootstrap');
      settings = boot.settings || {};
      setText('brandText', settings.logo_text || 'GLM');
      setText('brandSub', settings.brand_sub || 'Laptop Store');
      document.title = 'Masuk Panel ' + (settings.logo_text || 'GLM');
    } catch {
      /* halaman masuk tetap bisa dipakai walau data toko gagal dimuat */
    }

    try {
      const me = await G.api('/api/auth/me');
      if (me?.user) {
        if (window.GLM && window.GLM.nav) window.GLM.nav('/dashboard'); else window.location.href = '/dashboard';
        return;
      }
    } catch {
      /* belum masuk, lanjutkan */
    }

    try {
      config = await G.api('/api/public/config');
    } catch {
      config = {};
    }

    initCaptcha();
    initGoogle();
    initTabs();
    G.icons(document);

    el('loginForm')?.addEventListener('submit', submitLogin);
    el('registerForm')?.addEventListener('submit', submitRegister);
    el('pinSubmit')?.addEventListener('click', submitPin);
    el('pinResend')?.addEventListener('click', resendPin);
    el('pinBack')?.addEventListener('click', () => showPanel('login'));
    el('verifySubmit')?.addEventListener('click', submitVerify);
    el('verifyGoLogin')?.addEventListener('click', () => {
      el('verifyModal').classList.remove('is-open');
      showPanel('login');
    });
    el('verifyCode')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitVerify();
    });

    showStaticNotice();
  }

  /* Di GitHub Pages tidak ada backend: beri tahu pengunjung dengan jelas. */
  function showStaticNotice() {
    if (!G.isStatic || !G.isStatic()) return;
    const card = document.querySelector('.auth__card');
    if (!card) return;
    const box = document.createElement('div');
    box.className = 'static-note';
    box.setAttribute('role', 'status');
    box.innerHTML =
      '<b>Mode demo (GitHub Pages)</b><p>Login dan panel internal butuh server. ' +
      'Jalankan versi lengkapnya dengan <code>npm start</code>, lalu buka <code>/masuk</code>.</p>';
    card.prepend(box);
    /* Nonaktifkan kontrol yang benar-benar ada. Atribut disabled pada <form>
       tidak berefek, jadi form tetap bisa disubmit dan memicu 404. */
    document.querySelectorAll('.auth__card input, .auth__card select, .auth__card button').forEach((n) => {
      n.disabled = true;
    });
    document.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
