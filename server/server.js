import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, migrate, seed, getSettings, setSetting, logActivity, newSession } from './db.js';
import { hashSecret, verifySecret, randomToken, randomPin, randomPassword, safeEqual, encryptSecret, decryptSecret } from './crypto-util.js';
import { sendMail, mailerMode } from './mailer.js';
import { addClient, removeClient, setPage, broadcast, broadcastPresence, recentActivity, onlineSummary } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = ROOT_DIR;
const PORT = Number(process.env.PORT || 12000);

migrate();
seed();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', true);

/* ---------------------------------------------------------------- helpers */

const SESSION_COOKIE = 'glm_session';
const PIN_MAX_ATTEMPTS = 5;

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, days = 30) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: days * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}

function userView(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    avatarColor: u.avatar_color,
    emailVerified: !!u.email_verified,
    lastLoginAt: u.last_login_at
  };
}

function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function lastId(info) {
  return Number(info.lastInsertRowid);
}

function requireAuth(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Belum masuk' });
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return res.status(401).json({ error: 'Sesi tidak valid' });
  if (new Date(s.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
    return res.status(401).json({ error: 'Sesi berakhir' });
  }
  db.prepare("UPDATE sessions SET last_seen = datetime('now') WHERE id = ?").run(s.id);
  const real = getUser(s.user_id);
  const effective = s.acting_as ? getUser(s.acting_as) : real;
  if (!real || !effective || !real.active) return res.status(401).json({ error: 'Akun tidak aktif' });
  req.session = s;
  req.token = token;
  req.realUser = real;
  req.user = effective;
  req.impersonating = !!s.acting_as && s.acting_as !== s.user_id;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Tidak punya akses' });
    next();
  };
}

function isStaff(user) {
  return user.role === 'owner' || user.role === 'admin';
}

/* ------------------------------------------------------------ rate limits */

const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    const b = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > b.reset) {
      b.count = 0;
      b.reset = now + windowMs;
    }
    b.count += 1;
    buckets.set(key, b);
    if (b.count > max) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    next();
  };
}

/* --------------------------------------------------------------- captcha */

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, error: 'Verifikasi keamanan belum selesai.' };
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip || '' });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body
    });
    const data = await r.json();
    return { ok: !!data.success, error: data.success ? null : 'Verifikasi keamanan gagal.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi layanan verifikasi.' };
  }
}

async function verifyGoogle(credential) {
  if (!credential) return { ok: false, error: 'Token Google kosong.' };
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) return { ok: false, error: 'Token Google tidak valid.' };
    const data = await r.json();
    const aud = process.env.GOOGLE_CLIENT_ID;
    if (aud && data.aud !== aud) return { ok: false, error: 'Token Google bukan untuk aplikasi ini.' };
    if (data.email_verified !== 'true' && data.email_verified !== true) {
      return { ok: false, error: 'Email Google belum terverifikasi.' };
    }
    return { ok: true, email: data.email, name: data.name || data.email };
  } catch {
    return { ok: false, error: 'Gagal memverifikasi token Google.' };
  }
}

/* ------------------------------------------------------- public endpoints */

app.get('/api/public/config', (req, res) => {
  res.json({
    googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    turnstileEnabled: !!process.env.TURNSTILE_SECRET_KEY,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    mailerMode: mailerMode()
  });
});

app.get('/api/public/bootstrap', (req, res) => {
  const s = getSettings();
  const products = db
    .prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC')
    .all();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY id DESC').all();
  res.json({
    settings: {
      site_name: s.site_name,
      logo_text: s.logo_text,
      logo_image: s.logo_image,
      brand_sub: s.brand_sub,
      hero_label: s.hero_label,
      hero_title: s.hero_title,
      hero_desc: s.hero_desc,
      whatsapp_number: s.whatsapp_number,
      contact_address: s.contact_address,
      maps_query: s.maps_query,
      social_instagram: s.social_instagram,
      social_tiktok: s.social_tiktok,
      social_youtube: s.social_youtube,
      promo_title: s.promo_title,
      promo_desc: s.promo_desc,
      promo_end: s.promo_end,
      stat_customers: s.stat_customers,
      stat_warranty: s.stat_warranty,
      announcement: s.announcement,
      intro_text: s.intro_text,
      intro_sub: s.intro_sub,
      intro_video_url: s.intro_video_url
    },
    products,
    testimonials
  });
});

app.post('/api/public/newsletter', rateLimit('newsletter', 10, 60_000), async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  db.prepare('INSERT OR IGNORE INTO newsletter (email) VALUES (?)').run(email);
  logActivity({ action: 'newsletter.subscribe', detail: email });
  await sendMail({
    to: email,
    subject: 'Terima kasih sudah berlangganan info GLM',
    body: 'Halo,\n\nEmail kamu sudah terdaftar untuk info stok dan promo GLM.\n\nGLM Laptop Store'
  });
  res.json({ ok: true });
});

app.post('/api/public/track-visit', rateLimit('visit', 120, 60_000), (req, res) => {
  const { deviceId, page } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId wajib' });
  db.prepare('INSERT INTO visits (device_id, page, ip, ua) VALUES (?,?,?,?)').run(
    String(deviceId).slice(0, 80),
    String(page || '/').slice(0, 200),
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 300)
  );
  res.json({ ok: true });
});

/* --------------------------------------------------------------- register */

app.post('/api/auth/register', rateLimit('register', 10, 60_000), async (req, res) => {
  const { name, email, username, password, deviceId, deviceLabel, turnstileToken } = req.body || {};
  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'Nama, email, username, dan password wajib diisi.' });
  }
  if (String(password).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Username 3-24 karakter, hanya huruf, angka, titik, garis.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Format email tidak valid.' });

  const cap = await verifyTurnstile(turnstileToken, clientIp(req));
  if (!cap.ok) return res.status(400).json({ error: cap.error });

  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)').get(email, username);
  if (exists) return res.status(409).json({ error: 'Email atau username sudah dipakai.' });

  const pin = randomPin(6);
  const info = db
    .prepare(
      `INSERT INTO users (email, name, username, role, password_hash, pin_hash, pin_view, email_verified, avatar_color)
       VALUES (?, ?, ?, 'karyawan', ?, ?, ?, 0, ?)`
    )
    .run(email, name, username, hashSecret(password), hashSecret(pin), encryptSecret(pin), '#C9A96E');

  const userId = lastId(info);
  const verifyCode = randomPin(6);
  const challengeId = randomToken(16);
  db.prepare(
    `INSERT INTO challenges (id, user_id, device_id, code_hash, kind, expires_at)
     VALUES (?, ?, ?, ?, 'email_verify', datetime('now', '+1 day'))`
  ).run(challengeId, userId, String(deviceId || ''), hashSecret(verifyCode));

  await sendMail({
    to: email,
    subject: `Kode verifikasi GLM: ${verifyCode}`,
    body: `Halo ${name},\n\nKode verifikasi akun GLM kamu: ${verifyCode}\n\nPIN untuk masuk dari perangkat lain: ${pin}\n\nSimpan PIN ini. Jangan bagikan ke siapa pun.\n\nGLM Laptop Store`
  });

  logActivity({ userId, action: 'auth.register', detail: `${username} mendaftar`, ip: clientIp(req), ua: req.headers['user-agent'] || '' });

  res.json({
    ok: true,
    userId,
    challengeId,
    message: 'Akun dibuat. Kode verifikasi dikirim ke email.',
    devCode: process.env.NODE_ENV === 'production' ? undefined : verifyCode
  });
});

app.post('/api/auth/verify', rateLimit('verify', 20, 60_000), (req, res) => {
  const { challengeId, code, deviceLabel } = req.body || {};
  const ch = db.prepare("SELECT * FROM challenges WHERE id = ? AND kind = 'email_verify'").get(String(challengeId || ''));
  if (!ch) return res.status(400).json({ error: 'Kode verifikasi tidak ditemukan. Minta kode baru.' });
  if (new Date(ch.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
    db.prepare('DELETE FROM challenges WHERE id = ?').run(ch.id);
    return res.status(400).json({ error: 'Kode sudah kedaluwarsa.' });
  }
  if (!verifySecret(String(code || ''), ch.code_hash)) {
    db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(ch.id);
    return res.status(400).json({ error: 'Kode salah.' });
  }
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(ch.user_id);
  db.prepare('DELETE FROM challenges WHERE id = ?').run(ch.id);
  const user = getUser(ch.user_id);
  logActivity({ userId: user.id, action: 'auth.verify_email', detail: 'Email terverifikasi' });
  // Perangkat tempat pendaftaran dilakukan langsung dipercaya, jadi user tidak
  // perlu PIN hanya untuk masuk di perangkat yang sama.
  const result = completeLogin(req, res, user, ch.device_id, deviceLabel, true);
  res.json({ ok: true, verified: true, ...result });
});

/* ------------------------------------------------------------------ login */

function findUserByIdentifier(identifier) {
  return db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
    .get(identifier, identifier);
}

function isTrustedDevice(userId, deviceId) {
  if (!deviceId) return false;
  const row = db
    .prepare('SELECT * FROM devices WHERE user_id = ? AND device_id = ?')
    .get(userId, String(deviceId));
  return !!(row && row.trusted);
}

function touchDevice(userId, deviceId, label, ua, trusted) {
  db.prepare(
    `INSERT INTO devices (user_id, device_id, label, user_agent, trusted) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, device_id) DO UPDATE SET last_seen = datetime('now'),
       label = COALESCE(excluded.label, devices.label),
       trusted = MAX(devices.trusted, excluded.trusted)`
  ).run(userId, String(deviceId || 'unknown'), label || null, String(ua || '').slice(0, 300), trusted ? 1 : 0);
}

function startPinChallenge(user, deviceId, kind) {
  const pin = randomPin(6);
  const id = randomToken(16);
  db.prepare('DELETE FROM challenges WHERE user_id = ? AND kind = ?').run(user.id, kind);
  db.prepare(
    `INSERT INTO challenges (id, user_id, device_id, code_hash, kind, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', '+15 minutes'))`
  ).run(id, user.id, String(deviceId || ''), hashSecret(pin), kind);
  return { id, pin };
}

function completeLogin(req, res, user, deviceId, deviceLabel, trusted) {
  touchDevice(user.id, deviceId, deviceLabel, req.headers['user-agent'], trusted);
  const token = newSession(user.id, String(deviceId || 'unknown'));
  setSessionCookie(res, token);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  logActivity({
    userId: user.id,
    action: 'auth.login',
    detail: `Masuk sebagai ${user.username} (${user.role})`,
    ip: clientIp(req),
    ua: req.headers['user-agent'] || ''
  });
  broadcast('activity', { event: 'login', userId: user.id, name: user.name });
  return { ok: true, user: userView(getUser(user.id)), role: user.role };
}

app.post('/api/auth/login', rateLimit('login', 12, 60_000), async (req, res) => {
  const { identifier, email, password, deviceId, deviceLabel } = req.body || {};
  const ident = identifier || email;
  if (!ident || !password) return res.status(400).json({ error: 'Email/username dan password wajib diisi.' });
  const user = findUserByIdentifier(ident);
  if (!user || !user.active || !verifySecret(password, user.password_hash)) {
    logActivity({ action: 'auth.login_fail', detail: `Gagal masuk: ${ident}`, ip: clientIp(req) });
    return res.status(401).json({ error: 'Email/username atau password salah.' });
  }
  if (isTrustedDevice(user.id, deviceId)) {
    return res.json(completeLogin(req, res, user, deviceId, deviceLabel, true));
  }
  const { id, pin } = startPinChallenge(user, deviceId, 'device_pin');
  await sendMail({
    to: user.email,
    subject: 'PIN masuk perangkat baru - GLM',
    body: `Halo ${user.name},\n\nAda upaya masuk dari perangkat baru.\n\nPIN kamu: ${pin}\n\nBerlaku 15 menit. Kalau bukan kamu, abaikan email ini dan ganti password.\n\nGLM Laptop Store`
  });
  logActivity({ userId: user.id, action: 'auth.device_new', detail: 'Perangkat baru minta PIN', ip: clientIp(req) });
  res.json({
    ok: false,
    needPin: true,
    challengeId: id,
    maskedEmail: user.email.replace(/^(.).*(@.*)$/, '$1***$2'),
    devPin: process.env.NODE_ENV === 'production' ? undefined : pin
  });
});

app.post('/api/auth/pin', rateLimit('pin', 20, 60_000), (req, res) => {
  const { challengeId, pin, deviceId, deviceLabel } = req.body || {};
  const ch = db.prepare("SELECT * FROM challenges WHERE id = ? AND kind = 'device_pin'").get(String(challengeId || ''));
  if (!ch) return res.status(400).json({ error: 'Sesi PIN tidak ditemukan. Ulangi login.' });
  if (new Date(ch.expires_at.replace(' ', 'T') + 'Z') < new Date()) {
    db.prepare('DELETE FROM challenges WHERE id = ?').run(ch.id);
    return res.status(400).json({ error: 'PIN kedaluwarsa. Ulangi login.' });
  }
  if (ch.attempts >= PIN_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM challenges WHERE id = ?').run(ch.id);
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Ulangi login.' });
  }
  if (!verifySecret(String(pin || ''), ch.code_hash)) {
    db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(ch.id);
    logActivity({ userId: ch.user_id, action: 'auth.pin_fail', detail: 'PIN salah', ip: clientIp(req) });
    return res.status(400).json({ error: 'PIN salah.' });
  }
  db.prepare('DELETE FROM challenges WHERE id = ?').run(ch.id);
  const user = getUser(ch.user_id);
  res.json(completeLogin(req, res, user, deviceId || ch.device_id, deviceLabel, true));
});

app.post('/api/auth/pin/resend', rateLimit('pinresend', 5, 60_000), async (req, res) => {
  const { challengeId } = req.body || {};
  const ch = db.prepare("SELECT * FROM challenges WHERE id = ? AND kind = 'device_pin'").get(String(challengeId || ''));
  if (!ch) return res.status(400).json({ error: 'Sesi PIN tidak ditemukan.' });
  const user = getUser(ch.user_id);
  const fresh = startPinChallenge(user, ch.device_id, 'device_pin');
  await sendMail({
    to: user.email,
    subject: 'PIN masuk perangkat baru - GLM',
    body: `Halo ${user.name},\n\nPIN baru kamu: ${fresh.pin}\n\nBerlaku 15 menit.\n\nGLM Laptop Store`
  });
  res.json({ ok: true, challengeId: fresh.id, devPin: process.env.NODE_ENV === 'production' ? undefined : fresh.pin });
});

app.post('/api/auth/google', rateLimit('google', 20, 60_000), async (req, res) => {
  const { credential, deviceId, deviceLabel } = req.body || {};
  const g = await verifyGoogle(credential);
  if (!g.ok) return res.status(401).json({ error: g.error });
  let user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(g.email);
  if (!user) {
    let username = String(g.email.split('@')[0]).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 20) || 'user';
    while (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username)) {
      username = `${username}${Math.floor(Math.random() * 90 + 10)}`;
    }
    const pin = randomPin(6);
    const info = db
      .prepare(
        `INSERT INTO users (email, name, username, role, password_hash, pin_hash, pin_view, email_verified, avatar_color)
         VALUES (?, ?, ?, 'karyawan', ?, ?, ?, 1, '#C9A96E')`
      )
      .run(g.email, g.name, username, hashSecret(randomPassword(24)), hashSecret(pin), encryptSecret(pin));
    user = getUser(lastId(info));
    await sendMail({
      to: g.email,
      subject: 'Akun GLM kamu sudah aktif',
      body: `Halo ${g.name},\n\nAkun GLM dibuat lewat Google. Username: ${username}\nPIN perangkat: ${pin}\n\nSimpan PIN ini.\n\nGLM Laptop Store`
    });
    logActivity({ userId: user.id, action: 'auth.register_google', detail: `${username} daftar lewat Google` });
  }
  if (!user.active) return res.status(403).json({ error: 'Akun tidak aktif.' });
  res.json(completeLogin(req, res, user, deviceId, deviceLabel, true));
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (s) logActivity({ userId: s.user_id, action: 'auth.logout', detail: 'Keluar' });
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- me */

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: userView(req.user),
    realUser: userView(req.realUser),
    impersonating: req.impersonating,
    staff: isStaff(req.user),
    canManageUsers: req.user.role === 'owner'
  });
});

app.put('/api/me/profile', requireAuth, (req, res) => {
  const { name, username, email } = req.body || {};
  const next = { name: name ?? req.user.name, username: username ?? req.user.username, email: email ?? req.user.email };
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(next.username)) return res.status(400).json({ error: 'Username tidak valid.' });
  if (!/^\S+@\S+\.\S+$/.test(next.email)) return res.status(400).json({ error: 'Email tidak valid.' });
  const clash = db
    .prepare('SELECT id FROM users WHERE (lower(username) = lower(?) OR lower(email) = lower(?)) AND id <> ?')
    .get(next.username, next.email, req.user.id);
  if (clash) return res.status(409).json({ error: 'Username atau email sudah dipakai akun lain.' });
  db.prepare('UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?').run(next.name, next.username, next.email, req.user.id);
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'account.profile', detail: 'Ubah profil' });
  res.json({ ok: true, user: userView(getUser(req.user.id)) });
});

app.put('/api/me/pin', requireAuth, (req, res) => {
  const { currentPassword, newPin } = req.body || {};
  if (!/^\d{4,8}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'PIN harus 4-8 angka.' });
  const user = getUser(req.user.id);
  if (user.password_hash && !verifySecret(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Password saat ini salah.' });
  }
  db.prepare('UPDATE users SET pin_hash = ?, pin_view = ? WHERE id = ?').run(hashSecret(String(newPin)), encryptSecret(String(newPin)), user.id);
  logActivity({ userId: user.id, actorId: req.realUser.id, action: 'account.pin', detail: 'Ganti PIN' });
  res.json({ ok: true });
});

app.get('/api/me/devices', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, device_id, label, user_agent, trusted, first_seen, last_seen FROM devices WHERE user_id = ? ORDER BY last_seen DESC').all(req.user.id);
  res.json({ devices: rows });
});

app.delete('/api/me/devices/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Perangkat tidak ditemukan.' });
  db.prepare('DELETE FROM devices WHERE id = ?').run(row.id);
  logActivity({ userId: req.user.id, action: 'account.device_revoke', detail: `Cabut perangkat ${row.label || row.device_id}` });
  res.json({ ok: true });
});

/* -------------------------------------------------------------- realtime */

app.get('/api/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const client = {
    res,
    token: req.token,
    userId: req.realUser.id,
    role: req.realUser.role,
    actingAs: req.impersonating ? req.user.id : null,
    name: req.user.name,
    deviceId: req.session.device_id,
    page: '/dashboard'
  };
  addClient(client);
  res.write('event: hello\ndata: ' + JSON.stringify({ ok: true, at: new Date().toISOString() }) + '\n\n');

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    removeClient(client);
  });
});

app.post('/api/presence', requireAuth, (req, res) => {
  const page = String(req.body?.page || '/dashboard').slice(0, 200);
  setPage(req.token, page);
  db.prepare('INSERT INTO visits (device_id, user_id, page, ip, ua) VALUES (?,?,?,?,?)').run(
    req.session.device_id,
    req.user.id,
    page,
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 300)
  );
  res.json({ ok: true });
});

app.get('/api/activity', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  res.json({ activity: recentActivity(80) });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const totalDevices = db.prepare('SELECT COUNT(DISTINCT device_id) AS c FROM visits').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE active = 1').get().c;
  const everLoggedIn = db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NOT NULL').get().c;
  const loginsToday = db.prepare("SELECT COUNT(*) AS c FROM activity WHERE action = 'auth.login' AND date(created_at) = date('now')").get().c;
  const productCount = db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c;
  const outboxCount = db.prepare('SELECT COUNT(*) AS c FROM outbox').get().c;
  const pages = db
    .prepare(
      `SELECT page, COUNT(*) AS hits FROM visits WHERE created_at > datetime('now', '-1 day') GROUP BY page ORDER BY hits DESC LIMIT 8`
    )
    .all();
  const hourly = db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00', created_at) AS bucket, COUNT(*) AS c
       FROM activity WHERE action = 'auth.login' AND created_at > datetime('now', '-1 day')
       GROUP BY bucket ORDER BY bucket ASC`
    )
    .all();
  res.json({
    onlineNow: onlineSummary(),
    totalDevices,
    totalUsers,
    activeUsers,
    everLoggedIn,
    loginsToday,
    productCount,
    outboxCount,
    mailerMode: mailerMode(),
    pages,
    hourly
  });
});

app.get('/api/outbox', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const rows = db.prepare('SELECT id, to_email, subject, body, sent, error, created_at FROM outbox ORDER BY id DESC LIMIT 50').all();
  res.json({ outbox: rows, mode: mailerMode() });
});

/* --------------------------------------------------------------- products */

app.get('/api/products', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY sort_order ASC, id ASC').all();
  res.json({ products: rows });
});

function productPayload(body) {
  const slugBase = String(body.slug || body.name || 'unit')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return {
    slug: slugBase || `unit-${Date.now()}`,
    name: String(body.name || '').trim(),
    brand: String(body.brand || '').trim(),
    category: String(body.category || 'gaming').trim(),
    cpu: String(body.cpu || ''),
    ram: String(body.ram || ''),
    storage: String(body.storage || ''),
    gpu: String(body.gpu || ''),
    screen: String(body.screen || ''),
    price: Number(body.price || 0),
    old_price: body.old_price === '' || body.old_price == null ? null : Number(body.old_price),
    stock: Number(body.stock || 0),
    badge: body.badge ? String(body.badge) : null,
    image: String(body.image || ''),
    summary: String(body.summary || ''),
    specs: String(body.specs || ''),
    active: body.active === false || body.active === 0 || body.active === '0' ? 0 : 1,
    sort_order: Number(body.sort_order || 0)
  };
}

app.post('/api/products', requireAuth, (req, res) => {
  const p = productPayload(req.body || {});
  if (!p.name || !p.brand) return res.status(400).json({ error: 'Nama dan merek wajib diisi.' });
  let slug = p.slug;
  let n = 1;
  while (db.prepare('SELECT id FROM products WHERE slug = ?').get(slug)) slug = `${p.slug}-${n++}`;
  const info = db
    .prepare(
      `INSERT INTO products (slug,name,brand,category,cpu,ram,storage,gpu,screen,price,old_price,stock,badge,image,summary,specs,active,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(slug, p.name, p.brand, p.category, p.cpu, p.ram, p.storage, p.gpu, p.screen, p.price, p.old_price, p.stock, p.badge, p.image, p.summary, p.specs, p.active, p.sort_order);
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'product.create', detail: `Tambah produk ${p.name}` });
  res.json({ ok: true, id: lastId(info) });
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  const p = productPayload({ ...cur, ...req.body });
  db.prepare(
    `UPDATE products SET slug=?,name=?,brand=?,category=?,cpu=?,ram=?,storage=?,gpu=?,screen=?,price=?,old_price=?,stock=?,badge=?,image=?,summary=?,specs=?,active=?,sort_order=?,updated_at=datetime('now') WHERE id=?`
  ).run(p.slug, p.name, p.brand, p.category, p.cpu, p.ram, p.storage, p.gpu, p.screen, p.price, p.old_price, p.stock, p.badge, p.image, p.summary, p.specs, p.active, p.sort_order, id);
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'product.update', detail: `Ubah produk ${p.name}` });
  res.json({ ok: true });
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'product.delete', detail: `Hapus produk ${cur.name}` });
  res.json({ ok: true });
});

/* ----------------------------------------------------------- testimonials */

app.get('/api/testimonials', requireAuth, (req, res) => {
  res.json({ testimonials: db.prepare('SELECT * FROM testimonials ORDER BY id DESC').all() });
});

app.post('/api/testimonials', requireAuth, (req, res) => {
  const { name, city, rating, body, image } = req.body || {};
  if (!name || !body) return res.status(400).json({ error: 'Nama dan isi ulasan wajib diisi.' });
  const info = db
    .prepare('INSERT INTO testimonials (name, city, rating, body, image, active) VALUES (?,?,?,?,?,1)')
    .run(name, city || '', Number(rating || 5), body, image || '');
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'testimonial.create', detail: `Tambah ulasan ${name}` });
  res.json({ ok: true, id: lastId(info) });
});

app.put('/api/testimonials/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Ulasan tidak ditemukan.' });
  const b = { ...cur, ...req.body };
  db.prepare('UPDATE testimonials SET name=?, city=?, rating=?, body=?, image=?, active=? WHERE id=?').run(
    b.name,
    b.city || '',
    Number(b.rating || 5),
    b.body,
    b.image || '',
    b.active ? 1 : 0,
    id
  );
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'testimonial.update', detail: `Ubah ulasan ${b.name}` });
  res.json({ ok: true });
});

app.delete('/api/testimonials/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Ulasan tidak ditemukan.' });
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(id);
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'testimonial.delete', detail: `Hapus ulasan ${cur.name}` });
  res.json({ ok: true });
});

/* --------------------------------------------------------------- settings */

app.get('/api/settings', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  res.json({ settings: getSettings() });
});

app.put('/api/settings', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const body = req.body || {};
  const allowed = Object.keys(getSettings());
  const changed = [];
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.includes(k)) continue;
    setSetting(k, v);
    changed.push(k);
  }
  logActivity({ userId: req.user.id, actorId: req.realUser.id, action: 'settings.update', detail: `Ubah: ${changed.join(', ')}` });
  broadcast('settings', { changed });
  res.json({ ok: true, changed });
});

/* ------------------------------------------------------------------ users */

app.get('/api/users', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.active, u.email_verified, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS device_count,
              (SELECT MAX(last_seen) FROM devices d WHERE d.user_id = u.id) AS last_device_seen
       FROM users u ORDER BY u.role DESC, u.id ASC`
    )
    .all();
  res.json({ users: rows });
});

app.post('/api/users', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { name, username, email, password, role } = req.body || {};
  if (!name || !username || !email) return res.status(400).json({ error: 'Nama, username, dan email wajib diisi.' });
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username tidak valid.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email tidak valid.' });
  const clash = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)').get(username, email);
  if (clash) return res.status(409).json({ error: 'Username atau email sudah dipakai.' });

  const wantRole = role === 'admin' ? 'admin' : 'karyawan';
  if (wantRole === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya owner yang bisa membuat akun admin.' });
  }
  const pass = password && String(password).length >= 8 ? String(password) : randomPassword(12);
  const pin = randomPin(6);
  const info = db
    .prepare(
      `INSERT INTO users (email, name, username, role, password_hash, pin_hash, pin_view, email_verified, avatar_color, created_by)
       VALUES (?,?,?,?,?,?,?,1,?,?)`
    )
    .run(email, name, username, wantRole, hashSecret(pass), hashSecret(pin), encryptSecret(pin), '#C9A96E', req.user.id);
  await sendMail({
    to: email,
    subject: 'Akun GLM kamu sudah siap',
    body: `Halo ${name},\n\nAkun kamu sudah dibuat.\n\nUsername: ${username}\nPassword awal: ${pass}\nPIN perangkat: ${pin}\n\nSegera ganti password dan PIN setelah masuk pertama.\n\nGLM Laptop Store`
  });
  logActivity({ userId: lastId(info), actorId: req.realUser.id, action: 'user.create', detail: `Buat akun ${username}` });
  res.json({ ok: true, id: lastId(info), initialPassword: process.env.NODE_ENV === 'production' ? undefined : pass, initialPin: process.env.NODE_ENV === 'production' ? undefined : pin });
});

app.put('/api/users/:id', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const id = Number(req.params.id);
  const target = getUser(id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const b = req.body || {};

  if (target.role === 'owner' && req.user.role !== 'owner') return res.status(403).json({ error: 'Tidak boleh mengubah owner.' });
  if (b.role && b.role !== target.role && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya owner yang bisa mengubah role.' });
  }
  if (b.role && !['owner', 'admin', 'karyawan'].includes(b.role)) return res.status(400).json({ error: 'Role tidak valid.' });

  const next = {
    name: b.name ?? target.name,
    username: b.username ?? target.username,
    email: b.email ?? target.email,
    role: b.role ?? target.role,
    active: b.active === undefined ? target.active : b.active ? 1 : 0
  };
  const clash = db.prepare('SELECT id FROM users WHERE (lower(username)=lower(?) OR lower(email)=lower(?)) AND id <> ?').get(next.username, next.email, id);
  if (clash) return res.status(409).json({ error: 'Username atau email sudah dipakai.' });

  db.prepare('UPDATE users SET name=?, username=?, email=?, role=?, active=? WHERE id=?').run(
    next.name,
    next.username,
    next.email,
    next.role,
    next.active,
    id
  );

  if (b.newPassword) {
    if (String(b.newPassword).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(String(b.newPassword)), id);
  }
  if (b.newPin) {
    if (!/^\d{4,8}$/.test(String(b.newPin))) return res.status(400).json({ error: 'PIN harus 4-8 angka.' });
    db.prepare('UPDATE users SET pin_hash = ?, pin_view = ? WHERE id = ?').run(hashSecret(String(b.newPin)), encryptSecret(String(b.newPin)), id);
  }
  if (next.active === 0) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  logActivity({ userId: id, actorId: req.realUser.id, action: 'user.update', detail: `Ubah akun ${next.username}` });
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requireRole('owner'), (req, res) => {
  const id = Number(req.params.id);
  const target = getUser(id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Akun owner tidak bisa dihapus.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logActivity({ actorId: req.realUser.id, action: 'user.delete', detail: `Hapus akun ${target.username}` });
  res.json({ ok: true });
});

/** Owner & admin: lihat PIN aktif karyawan (agar bisa dipakai login/impersonate). */
app.get('/api/users/:id/pin', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const id = Number(req.params.id);
  const target = getUser(id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (target.role === 'owner' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Tidak boleh melihat PIN owner.' });
  }
  const pin = decryptSecret(target.pin_view);
  logActivity({ userId: id, actorId: req.realUser.id, action: 'user.pin_view', detail: `Lihat PIN ${target.username}` });
  res.json({
    userId: id,
    username: target.username,
    hasPin: !!target.pin_hash,
    pin,
    note: pin
      ? 'PIN aktif akun ini. Dipakai untuk masuk dari perangkat baru atau impersonate.'
      : 'PIN akun ini dibuat sebelum fitur ini aktif, jadi tidak bisa ditampilkan. Ganti PIN untuk melihat nilai barunya.'
  });
});

/** Owner & admin: impersonate (masuk sebagai) akun karyawan, dikonfirmasi dengan PIN akun itu. */
app.post('/api/users/:id/impersonate', requireAuth, requireRole('owner', 'admin'), (req, res) => {
  const id = Number(req.params.id);
  const target = getUser(id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (!target.active) return res.status(400).json({ error: 'Akun tidak aktif.' });
  if (req.user.role !== 'owner' && target.role !== 'karyawan') {
    return res.status(403).json({ error: 'Admin hanya bisa masuk sebagai akun Tim.' });
  }
  const { pin } = req.body || {};
  if (!verifySecret(String(pin || ''), target.pin_hash)) {
    logActivity({ userId: id, actorId: req.realUser.id, action: 'user.impersonate_fail', detail: 'PIN salah' });
    return res.status(401).json({ error: 'PIN akun itu salah.' });
  }
  db.prepare('UPDATE sessions SET acting_as = ? WHERE id = ?').run(id, req.session.id);
  logActivity({ userId: id, actorId: req.realUser.id, action: 'user.impersonate', detail: `Masuk sebagai ${target.username}` });
  broadcast('activity', { event: 'impersonate', userId: id, name: target.name });
  res.json({ ok: true, user: userView(target) });
});

app.post('/api/stop-impersonate', requireAuth, (req, res) => {
  if (!req.impersonating) return res.json({ ok: true });
  db.prepare('UPDATE sessions SET acting_as = NULL WHERE id = ?').run(req.session.id);
  logActivity({ userId: req.realUser.id, action: 'user.impersonate_end', detail: 'Kembali ke akun sendiri' });
  res.json({ ok: true });
});

/* ------------------------------------------------------------- pages/static */

const DENY = ['/server', '/data', '/node_modules', '/package.json', '/package-lock.json', '/.git'];

app.get('/masuk', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'masuk.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'dashboard', 'index.html')));

/* Kunci folder sensitif sebelum file statis disajikan. */
app.use((req, res, next) => {
  const blocked = DENY.some((p) => req.path === p || req.path.startsWith(p + '/'));
  if (blocked) return res.status(404).json({ error: 'Tidak ditemukan.' });
  next();
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: ['index.html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`GLM Laptop Store jalan di http://localhost:${PORT}`);
  console.log(`Mode email: ${mailerMode()}`);
});

export { app, server };
