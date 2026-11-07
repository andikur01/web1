# GLM - Toko Laptop Original & Bergaransi

Website toko laptop premium "GLM" lengkap dengan dashboard internal rahasia.
Storefront publik untuk pembeli, panel internal untuk owner/admin/tim, dan checkout
lewat WhatsApp. Satu server Node.js, tanpa build step.

## Menjalankan

```bash
npm install
npm start          # http://localhost:12000
```

Akun owner pertama dibuat otomatis saat database kosong:

| Field    | Nilai default        | Env                      |
|----------|----------------------|--------------------------|
| Email    | `owner@glm.local`    | `GLM_OWNER_EMAIL`        |
| Username | `owner`              | -                        |
| Password | `GLM-owner-2026`     | `GLM_OWNER_PASSWORD`     |
| PIN      | `246810`             | `GLM_OWNER_PIN`          |

Ganti kredensial ini lewat env sebelum dipakai produksi.

## Halaman

- `/` - storefront publik.
- `/masuk` - pintu masuk panel internal: login, daftar, verifikasi email, PIN perangkat,
  dan tombol "Daftar dengan Google".
- `/dashboard` - panel internal (butuh login).

### Masuk ke panel secara rahasia

Tidak ada tombol atau tulisan yang menandai adanya panel. Buka panel dengan
**mengklik logo GLM 5 kali cepat** (dalam 2,5 detik) di navbar storefront.
Dari situ bisa login, atau daftar akun baru.

## Fitur storefront

- Preloader layar pembuka dengan angka persen dan curtain reveal.
- Navbar glassmorphism yang sembunyi saat scroll ke bawah dan muncul lagi saat ke atas.
- Dynamic island notifikasi yang membesar/mengecil berisi info pembelian, stok, promo.
- Hero 100vh: teks merek mengetik bergantian (Typed-style) sinkron dengan foto laptop,
  glow warna per merek, statistik count-up, tombol magnetic, indikator slide.
- Marquee merek berjalan, hover berhenti dan menyala.
- Stok ready: filter kategori, kartu produk dengan tilt 3D + glow mengikuti kursor,
  quick view detail, tombol keranjang dan wishlist.
- Bento "Kenapa pilih GLM", banner promo dengan countdown, slider testimoni.
- Footer dengan wordmark raksasa dan tombol WhatsApp melayang.
- Animasi scroll (parallax exit, reveal per kata, stagger, pinned showcase, horizontal
  scroll kategori, clip reveal, progress bar emas), custom cursor, bubble canvas.
- Hormat `prefers-reduced-motion`.

## Checkout lewat WhatsApp

Keranjang diisi dari kartu produk. Tombol checkout membuka WhatsApp ke nomor toko
(diatur di Pengaturan toko) berisi daftar model, spesifikasi penting (CPU/RAM/SSD/GPU),
jumlah, dan estimasi total. Tidak ada pembayaran di web; transaksi diselesaikan di WhatsApp.

## Panel internal

Tab "Pantau" (ringkasan, log aktivitas, email keluar), "Kelola" (produk, ulasan, tim & akun),
dan "Saya" (akun, pengaturan toko). Isinya antara lain:

- Statistik: pengunjung unik (semua perangkat yang pernah membuka situs), akun aktif,
  pernah masuk, online saat ini, produk aktif, email tertahan.
- Realtime via SSE: siapa yang sedang online dan sedang di halaman apa.
- Log aktivitas: login, ganti PIN, lihat PIN, impersonate, perubahan akun/produk/pengaturan.
- Kelola produk dan ulasan (CRUD).
- Kelola akun tim: buat akun (password & PIN awal dikirim ke email), ubah, aktif/nonaktif,
  lihat PIN, masuk sebagai akun (impersonate), hapus.
- Pengaturan toko: logo (teks/gambar), video/teks intro, hero, nomor WhatsApp, promo,
  media sosial, dan lainnya.

### Peran

| Peran    | Ringkasan |
|----------|-----------|
| owner    | Akses penuh. Satu-satunya yang bisa membuat akun `admin`. |
| admin    | Staff. Kelola produk/ulasan, buat akun tim, lihat PIN tim, impersonate tim. |
| karyawan | CRUD produk & ulasan, kelola profil/PIN/perangkat sendiri. Ditampilkan sebagai "Tim". |

Peran tidak pernah ditampilkan sebagai "karyawan" ke pengguna; selalu "Tim".

### Keamanan

- Password & PIN disimpan sebagai hash scrypt.
- PIN juga disimpan terenkripsi (AES-256-GCM) agar owner/admin bisa menampilkannya.
  Kunci diambil dari `GLM_SECRET_KEY`, atau dibuat otomatis di `data/secret.key`.
- Login dari perangkat baru meminta PIN yang dikirim ke email.
- Email: kalau SMTP belum diisi, email ditahan di "Email keluar" (mode outbox).

## Konfigurasi (env opsional)

`PORT`, `GLM_DB_PATH`, `GLM_SECRET_KEY`, `GLM_OWNER_EMAIL`, `GLM_OWNER_PASSWORD`,
`GLM_OWNER_PIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`,
`SMTP_FROM`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `NODE_ENV`.

### Mengaktifkan "Masuk dengan Google"

1. Buka [Google Cloud Console](https://console.cloud.google.com/apis/credentials) ->
   **Create Credentials -> OAuth client ID -> Web application**.
2. Di **Authorized JavaScript origins**, tambahkan URL tempat situs dijalankan
   (contoh `https://toko.example.com`, `http://localhost:12000`). Origin wajib sama
   persis dengan asal halaman, termasuk skema dan port.
3. Set `GOOGLE_CLIENT_ID=<client-id>` di env server, lalu jalankan ulang server.
   Tombol Google otomatis muncul di halaman masuk dan daftar.

Catatan: di GitHub Pages (mode demo) Google tidak bisa dipakai karena callback
membutuhkan backend. Tanpa `GOOGLE_CLIENT_ID`, halaman menampilkan catatan
"Masuk dengan Google belum aktif".

## Struktur & pengembangan

Lihat `AGENTS.md` untuk peta file, arsitektur, dan konvensi. Arah desain ada di
`DESIGN.md`, disaring aturan anti-slop di `antislop.md`.

## Data

- Database: SQLite di `data/glm.db` (dibuat otomatis, tidak masuk git).
- Foto produk: file lokal di `assets/img/`.
- Reset data: `npm run reset-db` lalu `npm start`.

## Hosting

Ada dua mode, dan keduanya jalan dari repo yang sama:

### A. GitHub Pages (statis, gratis)

Halaman sudah di root repo (`index.html`, `masuk.html`, `dashboard/`), jadi:

1. Repo -> **Settings -> Pages**.
2. **Source**: `Deploy from a branch`. **Branch**: `main`, folder **`/ (root)`**. Save.
3. Tunggu 1-2 menit, buka `https://<user>.github.io/<repo>/`.

Yang jalan di Pages: storefront penuh (hero, produk, merek, ulasan, keranjang) pakai
snapshot data di `assets/js/env.js`. Yang **tidak** jalan: login, panel internal, dan
checkout WhatsApp, karena butuh server. Halaman `masuk.html` / `dashboard/` tetap bisa
dibuka tapi menampilkan pemberitahuan "Mode demo".

Perbarui snapshot data setelah mengubah produk:

```bash
npm run build:static    # menulis ulang assets/js/env.js
git add assets/js/env.js && git commit -m "perbarui data demo" && git push
```

### B. Server Node (fitur lengkap)

Butuh Node.js karena ada API, database SQLite, login, dan realtime. Tiga cara:

#### 1. Docker (VPS / lokal)

```bash
docker compose up -d --build     # buka http://localhost:12000
```

Set `GLM_OWNER_PASSWORD` dan `GLM_OWNER_PIN` di `docker-compose.yml` dulu.

### 2. Render / Railway (gratis buat mulai)

- Hubungkan repo GitHub ini.
- Build: `npm ci`  -  Start: `npm start`.
- Set env `NODE_ENV=production`, `PORT` (biasanya diisi otomatis), dan kredensial owner.
- Tambahkan volume disk di `/app/data` supaya database tidak hilang saat redeploy.

### 3. VPS biasa

```bash
npm ci --omit=dev
NODE_ENV=production PORT=8080 npm start
```

Balik di belakang reverse proxy (Caddy/Nginx) untuk HTTPS.

> Catatan: di mode server, buka `/` untuk toko dan `/masuk` untuk panel internal
> (atau klik logo 5x cepat). Di mode Pages, route itu menjadi `masuk.html` dan
> `dashboard/`.

