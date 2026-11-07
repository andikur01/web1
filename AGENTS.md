# AGENTS.md - GLM Laptop Store

Panduan singkat untuk agen/engineer yang bekerja di repo ini.

## Ringkas proyek

Toko laptop "GLM": satu server Node.js (Express) yang menyajikan storefront publik
dan dashboard internal rahasia, plus API. Tanpa build step, tanpa framework frontend.
Frontend memakai HTML/CSS/JS vanilla + Lucide icons (lokal). Animasi memakai CSS dan
canvas 2D sendiri (tanpa CDN runtime).

## Perintah

```bash
npm install          # sekali saja
npm start            # jalankan server (PORT, default 12000)
npm run dev          # sama, tapi auto-reload (node --watch)
npm run reset-db     # hapus data/glm.db; dijalankan ulang saat start berikutnya
```

## Struktur

```
server/
  server.js       # Express: semua route API + penyajian halaman statis
  db.js           # skema SQLite, migrasi ringan, seed owner + produk contoh
  crypto-util.js  # scrypt (hash), AES-256-GCM (vault PIN), token/PIN acak
  realtime.js     # klien SSE: presence, aktivitas, broadcast
  mailer.js       # SMTP kalau ada; kalau tidak, tulis ke outbox di DB
public/
  index.html      # storefront publik
  login.html      # /masuk - pintu masuk panel internal (login, daftar, verifikasi, PIN)
  dashboard.html  # panel internal (pantau, kelola, saya)
  assets/css/     # tokens.css (variabel + reset), site.css, auth.css, dash.css
  assets/js/      # site.js, login.js, dash.js, secret-login.js, bubbles.js, ui.js
  assets/img/     # foto laptop (lokal, bukan hotlink)
data/             # glm.db + secret.key (tidak masuk git)
```

## Arsitektur

- **Tanpa framework.** DOM dibangun dengan helper kecil (`el`, `setText`, `escapeHtml`).
  Jangan menambah React/Vue/Tailwind atau build step.
- **Satu sumber desain:** `DESIGN.md` (arah visual) disaring `antislop.md` (aturan anti-slop).
  Semua nilai visual diambil dari CSS custom property di `public/assets/css/tokens.css`.
- **Ikon:** Lucide lokal (`public/assets/lib/lucide.min.js`). Jangan pakai emoji.
- **Atribut `hidden` wajib menang.** `tokens.css` memuat `[hidden] { display: none !important }`
  supaya gating peran tidak bisa ditimpa `display: flex/grid`.

## Peran & akses

| Peran    | staff | Bisa apa |
|----------|-------|----------|
| owner    | ya    | Semua: akun, role, hapus akun, lihat PIN siapa pun, impersonate siapa pun |
| admin    | ya    | Kelola produk/ulasan, buat akun karyawan, lihat PIN non-owner, impersonate karyawan |
| karyawan | tidak | CRUD produk & ulasan, kelola profil/PIN/perangkat sendiri |

- Hanya **owner** yang bisa membuat akun `admin` (route `POST /api/users` menolak 403 untuk admin).
- **Impersonate** (`POST /api/users/:id/impersonate`) butuh PIN akun target. Admin hanya
  bisa target `karyawan`; owner bisa target apa pun kecuali owner lain.
- Jangan pernah menampilkan label "karyawan"/"CS" ke pengguna; role `karyawan` tampil sebagai "Tim".

## PIN & keamanan

- Password & PIN disimpan sebagai **scrypt hash** (`hashSecret`) untuk verifikasi.
- PIN juga disimpan terenkripsi di kolom `users.pin_view` (AES-256-GCM) supaya owner/admin
  bisa menampilkannya lagi. Kunci dari `GLM_SECRET_KEY`, atau file `data/secret.key` (0600).
- Login dari perangkat baru memicu challenge PIN (dikirim ke email, ada di outbox saat dev).
- Perangkat yang dipercaya bisa masuk tanpa PIN; cabut perangkat untuk memaksa PIN lagi.
- Setiap aksi sensitif (login, ganti PIN, lihat PIN, impersonate, ubah akun) dicatat di `activity`.

## Konvensi

- Bahasa UI: Indonesia, nada tenang dan jelas. Hindari teks placeholder.
- Komentar: hanya untuk hal yang tidak jelas dari kode (invariant, alasan keamanan, urutan).
  Jangan menarasikan riwayat perubahan.
- Semua endpoint JSON memakai bentuk `{ ok: true, ... }` atau `{ error: "pesan" }`.
- Rahasia (`data/`, `.env`) tidak masuk git.

## Env opsional

`PORT`, `GLM_DB_PATH`, `GLM_SECRET_KEY`, `GLM_OWNER_EMAIL/PASSWORD/PIN`,
`SMTP_HOST/PORT/USER/PASS/SECURE/FROM`, `TURNSTILE_SITE_KEY/SECRET_KEY`,
`GOOGLE_CLIENT_ID`, `NODE_ENV`.

## Uji cepat manual

```bash
npm start
curl -s localhost:12000/api/public/bootstrap | head -c 200
# login owner lalu lihat PIN karyawan:
curl -s -c /tmp/j -X POST localhost:12000/api/auth/login \
  -H 'content-type: application/json' -d '{"identifier":"owner","password":"..."}'
```
