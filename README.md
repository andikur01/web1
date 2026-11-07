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

## Struktur & pengembangan

Lihat `AGENTS.md` untuk peta file, arsitektur, dan konvensi. Arah desain ada di
`DESIGN.md`, disaring aturan anti-slop di `antislop.md`.

## Data

- Database: SQLite di `data/glm.db` (dibuat otomatis, tidak masuk git).
- Foto produk: file lokal di `public/assets/img/`.
- Reset data: `npm run reset-db` lalu `npm start`.
