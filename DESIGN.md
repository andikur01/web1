# DESIGN.md - GLM Laptop Store

Dokumen ini adalah **arah desain** (bukan sekadar daftar larangan). Semua keputusan visual
diambil dari sini, lalu disaring oleh `antislop.md`.

## Identitas

- Nama: GLM (GLM Laptop Store)
- Bidang: toko laptop premium, penjualan + konsultasi + garansi resmi
- Audiens: pembeli laptop gaming/kerja/desain di Indonesia, umur 18-40, beli lewat WhatsApp
- Nada: tenang, percaya diri, mahal, seperti brand hardware internasional

## Personalitas

1. Presisi (spesifikasi jelas, bukan janji kosong)
2. Mewah tapi tidak berisik (aksen dipakai hemat)
3. Cepat dan ringan (situs toko harus terasa seperti alat, bukan poster)

## Palet

| Peran | Nilai | Catatan |
|---|---|---|
| Base | `#0A0A0A` | hitam pekat, tema gelap dipilih karena produk = hardware dan foto laptop menyatu dengan latar gelap |
| Surface | `#121212` | kartu dan panel |
| Text | `#F5F5F5` | teks utama |
| Muted | `#8A8A8A` | teks sekunder (dicek >= 4.5:1 di atas base) |
| Accent | `#C9A96E` | emas champagne, dipakai hemat: satu CTA utama per layar, garis progress, satu sorotan |
| Danger/Live | `#3FB950` | badge "Live"/stok, satu-satunya hijau |

Accent dipakai maksimal 1-2 tempat per layar. Glow hanya untuk laptop hero dan satu CTA utama.

## Tipografi

- Judul: Space Grotesk (600/700)
- Teks: Inter (400/500)
- Skala: 12 / 14 / 16 / 20 / 28 / 40 / 64 / 96 / clamp(64-160px) untuk wordmark footer

## Dials

`Dial: ENERGY 3 / RHYTHM 2 / MOTION 3`

- ENERGY 3 karena toko ini jual produk visual dan harus bilang "halo" keras di hero.
- RHYTHM 2 karena halaman panjang butuh beberapa perubahan ritme (pinned, horizontal, bento) tapi tetap punya grid konsisten.
- MOTION 3 karena motion adalah bagian dari cerita produk (laptop berganti, scroll narrative).

## Motif identitas

Garis tipis 1px putih 10% + satu aksen emas + noise/grain halus. Motif ini berulang di
seluruh halaman dan dashboard, jadi terasa "milik GLM", bukan template.

## Alasan teknik yang biasanya dianggap slop (ditulis sesuai R-01, R-07, R-10, R-13)

- **Glow**: hanya di belakang laptop hero dan CTA utama. Alasan: memisahkan produk dari latar hitam, meniru cara brand hardware menyorot produk.
- **Glassmorphism**: hanya navbar. Alasan: navbar harus tetap terbaca di atas konten apa pun tanpa menutupi produk.
- **Gradient**: hanya sebagai pemisah level (hero -> section), bukan dekorasi di setiap section.
- **Grid background**: hanya di hero, tipis, sebagai penanda "presisi/spec". Tidak diulang di seluruh halaman.
- **Bento grid**: dipakai di "Kenapa Pilih GLM" karena isinya memang punya bobot berbeda (garansi & cicilan lebih besar dari yang lain).
- **Dark default**: dipilih sadar karena foto produk hardware dan mood mewah; bukan ikut tren.

## Aturan konten jujur (R-17, R-18, R-36, R-38)

- Testimoni, rating, dan angka statistik **tidak dikarang**. Semuanya diisi dari dashboard
  admin. Default kosong dengan placeholder jujur ("Belum ada ulasan", angka `0`).
- Nama merek (ASUS, Apple, Lenovo, ...) dipakai sebagai daftar merek yang dijual, bukan klaim afiliasi.
