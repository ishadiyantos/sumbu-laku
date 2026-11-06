# Galeri Karya Alumni — *Sumbu Laku, Jejak Bakti*

Galeri web interaktif untuk menampilkan karya (poster) alumni Sekolah Pascasarjana UGM —
Penyuluhan & Komunikasi Pembangunan. Satu poster per layar, navigasi **Next/Prev**
(tombol, panah keyboard, geser/swipe di HP), filter per **Jenis Karya**, perbesar poster
(lightbox), **tombol reaksi emoji** (❤️ 👍 👏 🔥 💡) per karya, dan **QR** untuk dibagikan ke hadirin.

## Struktur

```
index.html          Landing page acara (info, agenda, lokasi, booklet, QR reaksi)
galeri.html         Galeri karya alumni (auto-slide, next/prev, filter, reaksi, QR)
styles.css          Tampilan dasar + komponen galeri (brand hijau–emas–krem)
landing.css         Tampilan khusus landing page
app.js              Logika galeri + auto-slide 30 dtk + reaksi emoji + QR
data/works.json     ← SUMBER DATA. Edit di sini untuk ubah/urutkan karya.
booklet.pdf         Buku Panduan Peserta (ditampilkan di landing)
posters/*.jpg       Gambar poster (hasil render)
posters/pdf/*.pdf   Berkas PDF asli (untuk tombol "Unduh PDF")
assets/             logo_banner2, kaligrafi judul, background, flyer, cover booklet
api/react.js        Serverless: tambah/hapus reaksi emoji (POST)
api/reactions.js    Serverless: ambil jumlah reaksi per emoji (GET)
api/_redis.js       Koneksi Upstash Redis
vercel.json         Konfigurasi Vercel
package.json        Dependensi (@upstash/redis)
```

Halaman depan situs adalah **landing page acara** (`index.html`); galeri karya ada di
**`galeri.html`**. Galeri **berpindah otomatis tiap 30 detik** (bisa dijeda lewat tombol
“Auto-slide”). QR mengarah ke galeri agar hadirin bisa memberi **reaksi**.

## Menjalankan lokal (opsional)

Karena ada Serverless Function, cara termudah mencoba lokal persis seperti produksi:

```bash
npm install
npm i -g vercel        # sekali saja
vercel dev             # buka http://localhost:3000
```

Tanpa itu, membuka `index.html` lewat server statis apa pun tetap jalan —
fitur reaksi otomatis masuk **mode lokal** (tersimpan di perangkat masing-masing).

## Deploy ke Vercel

1. Push folder ini ke sebuah repo Git (GitHub/GitLab), lalu **Import Project** di Vercel —
   atau dari folder ini jalankan `vercel` lalu `vercel --prod`.
2. Framework preset: **Other** (situs statis + folder `api/`). Tidak perlu build command.
3. Selesai — situs langsung tayang. (Tanpa langkah 4, tombol reaksi berjalan dalam mode lokal.)

## Mengaktifkan reaksi BERSAMA (lintas perangkat)

Hitungan reaksi yang dibagikan ke semua pengunjung butuh satu penyimpanan. Dipakai **Upstash Redis**
(punya paket gratis, dan terintegrasi sebagai **Vercel KV / Marketplace → Upstash**).

Cara tercepat lewat Vercel:

1. Dashboard proyek → tab **Storage** → **Create / Connect** → pilih **Upstash (Redis)**.
2. Setelah terhubung, Vercel otomatis menambahkan env var (`KV_REST_API_URL`,
   `KV_REST_API_TOKEN`, atau `UPSTASH_REDIS_REST_URL/TOKEN`). Kode ini membaca keduanya.
3. **Redeploy**. Sejak itu reaksi tersimpan terpusat dan tampil sama di semua HP yang memindai QR.

> Belum diset pun aman: API mengembalikan 503 dan web otomatis memakai mode lokal,
> jadi tidak pernah error di layar.

### Alternatif: backend sendiri (mis. MongoDB)
Logikanya hanya dua endpoint: `POST /api/react` `{id, deviceId, emoji, action}` → `{count}`, dan
`GET /api/reactions?deviceId=` → `{counts, mine}` (counts = `{id: {emoji: jumlah}}`). Silakan ganti
isi `api/` dengan implementasi Node/MongoDB/Socket.IO Anda tanpa menyentuh frontend.

## Mengedit data karya

Semua teks ada di `data/works.json` — ubah `nama`, `instansi`, `jenis`, `judul`, `jenjang`,
`angkatan`, urutan array, atau `image`/`pdf`. **Poster "Pilar Jateng"** sengaja dikosongkan
`nama` & `instansi`-nya; tinggal diisi.

Jenis yang mewarnai badge: `Buku`, `Artikel Jurnal`, `Penelitian`, `Tesis`, `Disertasi`,
`Orasi Ilmiah`, `Lainnya`.
