import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { hashSecret, randomToken, encryptSecret } from './crypto-util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = process.env.GLM_DB_PATH || path.join(DATA_DIR, 'glm.db');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'karyawan',
    password_hash TEXT,
    pin_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    avatar_color TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    label TEXT,
    user_agent TEXT,
    trusted INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    acting_as INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    kind TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    actor_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    page TEXT,
    ip TEXT,
    ua TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    cpu TEXT,
    ram TEXT,
    storage TEXT,
    gpu TEXT,
    screen TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    old_price INTEGER,
    stock INTEGER NOT NULL DEFAULT 0,
    badge TEXT,
    image TEXT,
    summary TEXT,
    specs TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT,
    rating INTEGER,
    body TEXT NOT NULL,
    image TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    user_id INTEGER,
    page TEXT,
    ip TEXT,
    ua TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_visits_device ON visits(device_id);
  `);

  // pin_view menyimpan PIN dalam bentuk terenkripsi supaya owner/admin bisa
  // menampilkannya lagi (pin_hash tetap dipakai untuk verifikasi login).
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('pin_view')) db.exec('ALTER TABLE users ADD COLUMN pin_view TEXT');
}

export const DEFAULT_SETTINGS = {
  site_name: 'GLM',
  logo_text: 'GLM',
  logo_image: '',
  brand_sub: 'Laptop Store',
  intro_video_url: '',
  intro_text: 'GLM',
  intro_sub: 'Resmi & Bergaransi',
  hero_label: 'GLM Laptop Store - Resmi & Bergaransi',
  hero_title: 'Laptop Impian Kamu,',
  hero_desc: 'Stok unit asli, garansi resmi, dan konsultasi sebelum beli. Pilih modelnya, kami urus sisanya.',
  whatsapp_number: '',
  contact_address: '',
  maps_query: 'Jakarta',
  social_instagram: '',
  social_tiktok: '',
  social_youtube: '',
  promo_title: 'Flash Sale Minggu Ini',
  promo_desc: 'Harga khusus untuk unit tertentu selama periode promo.',
  promo_end: '',
  stat_customers: '0',
  stat_warranty: 'Garansi Resmi',
  announcement: '',
  dev_show_codes: '1'
};

export function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const ownerEmail = process.env.GLM_OWNER_EMAIL || 'owner@glm.local';
  const ownerPass = process.env.GLM_OWNER_PASSWORD || 'GLM-owner-2026';
  const ownerPin = process.env.GLM_OWNER_PIN || '246810';

  const res = db
    .prepare(
      `INSERT INTO users (email, name, username, role, password_hash, pin_hash, pin_view, email_verified, avatar_color)
       VALUES (?, ?, ?, 'owner', ?, ?, ?, 1, '#C9A96E')`
    )
    .run(ownerEmail, 'Owner GLM', 'owner', hashSecret(ownerPass), hashSecret(ownerPin), encryptSecret(ownerPin));

  db.prepare(
    `INSERT INTO activity (user_id, action, detail) VALUES (?, 'system.seed', ?)`
  ).run(res.lastInsertRowid, 'Akun owner awal dibuat oleh sistem.');

  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setStmt.run(k, v);

  // Data contoh supaya halaman toko tidak kosong. Ganti nama, harga, stok, dan
  // fotonya dari dashboard sesuai unit yang benar-benar kamu jual.
  const sampleProducts = [
    ['asus-rog-strix-g16', 'ASUS ROG Strix G16', 'ASUS', 'gaming', 'Intel Core i7-13650HX', '16GB DDR5', '512GB SSD NVMe', 'NVIDIA RTX 4060 8GB', '16 inci 165Hz', 21999000, 23999000, 5, 'Best Seller', 'assets/img/product-1.jpg', 'Laptop gaming 16 inci dengan pendinginan tiga kipas.', 'Garansi resmi 2 tahun.'],
    ['macbook-air-m3-13', 'MacBook Air M3 13 inci', 'Apple', 'ultrabook', 'Apple M3', '8GB', '256GB SSD', 'GPU 8 inti', '13,6 inci Liquid Retina', 15999000, null, 3, 'Baru', 'assets/img/product-2.jpg', 'Ultrabook ringan untuk kerja dan mobilitas harian.', 'Garansi resmi Apple Indonesia 1 tahun.'],
    ['lenovo-legion-pro-5', 'Lenovo Legion Pro 5', 'Lenovo', 'gaming', 'AMD Ryzen 7 7745HX', '16GB DDR5', '1TB SSD NVMe', 'NVIDIA RTX 4060 8GB', '16 inci 165Hz', 24499000, null, 4, null, 'assets/img/product-3.jpg', 'Gaming performa tinggi dengan layar luas.', 'Garansi resmi 3 tahun.'],
    ['acer-predator-helios-neo-16', 'Acer Predator Helios Neo 16', 'Acer', 'gaming', 'Intel Core i7-13700HX', '16GB DDR5', '512GB SSD NVMe', 'NVIDIA RTX 4060 8GB', '16 inci 165Hz', 20999000, 22499000, 2, 'Sisa 2', 'assets/img/product-4.jpg', 'Gaming dengan layar cepat untuk permainan kompetitif.', 'Garansi resmi 2 tahun.'],
    ['hp-omen-16', 'HP Omen 16', 'HP', 'gaming', 'Intel Core i7-13700HX', '16GB DDR5', '512GB SSD NVMe', 'NVIDIA RTX 4060 8GB', '16,1 inci 165Hz', 22499000, null, 3, null, 'assets/img/product-5.jpg', 'Gaming serbaguna untuk kerja dan bermain.', 'Garansi resmi 2 tahun.'],
    ['msi-titan-gt77-hx', 'MSI Titan GT77 HX', 'MSI', 'gaming', 'Intel Core i9-13980HX', '32GB DDR5', '2TB SSD NVMe', 'NVIDIA RTX 4080 12GB', '17,3 inci 144Hz', 59999000, null, 1, null, 'assets/img/product-6.jpg', 'Laptop desktop replacement untuk pekerjaan berat.', 'Garansi resmi 2 tahun.'],
    ['dell-xps-15-9530', 'Dell XPS 15', 'Dell', 'desain', 'Intel Core i7-13700H', '16GB DDR5', '512GB SSD NVMe', 'NVIDIA RTX 4050 6GB', '15,6 inci OLED', 28999000, null, 2, null, 'assets/img/product-7.jpg', 'Layar OLED akurat warna untuk desain dan editing.', 'Garansi resmi 1 tahun.'],
    ['asus-zenbook-14-oled', 'ASUS Zenbook 14 OLED', 'ASUS', 'office', 'AMD Ryzen 7 7840U', '16GB LPDDR5', '512GB SSD NVMe', 'AMD Radeon 780M', '14 inci OLED', 13999000, 15499000, 6, null, 'assets/img/product-8.jpg', 'Ringan, baterai panjang, layar OLED tajam.', 'Garansi resmi 2 tahun.']
  ];
  const stmt = db.prepare(
    `INSERT INTO products (slug, name, brand, category, cpu, ram, storage, gpu, screen, price, old_price, stock, badge, image, summary, specs, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  sampleProducts.forEach((row, i) => stmt.run(...row, i));
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value == null ? '' : String(value));
}

export function logActivity({ userId = null, actorId = null, action, detail = '', page = '', ip = '', ua = '' }) {
  db.prepare(
    `INSERT INTO activity (user_id, actor_id, action, detail, page, ip, ua) VALUES (?,?,?,?,?,?,?)`
  ).run(userId, actorId, action, detail, page, ip, ua);
}

export function newSession(userId, deviceId, actingAs = null, days = 30) {
  const token = randomToken(32);
  db.prepare(
    `INSERT INTO sessions (token, user_id, device_id, acting_as, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).run(token, userId, deviceId, actingAs, `+${days} days`);
  return token;
}
