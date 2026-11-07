/* Membuat assets/js/env.js berisi snapshot data publik.
   Dipakai oleh GitHub Pages (hosting statis) supaya storefront tetap tampil
   walau tanpa backend. Jalankan: npm run build:static */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSettings } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'js', 'env.js');

const s = getSettings();
const settings = {
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
};

const products = db
  .prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC')
  .all();
const testimonials = db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY id DESC').all();

const payload = {
  generatedAt: new Date().toISOString(),
  '/api/public/bootstrap': { settings, products, testimonials },
  '/api/public/config': { googleEnabled: false, googleClientId: null, turnstileEnabled: false, turnstileSiteKey: null, mailerMode: 'static' }
};

const banner = '/* Dibuat otomatis oleh server/build-static.mjs - jangan diedit manual. */\n';
fs.writeFileSync(OUT, banner + 'window.GLM_DEMO = ' + JSON.stringify(payload, null, 2) + ';\n');
console.log('Tulis ' + path.relative(process.cwd(), OUT) + ' (' + products.length + ' produk, ' + testimonials.length + ' ulasan)');
