# SALIM PHONE — Aplikasi Manajemen Konter

Aplikasi web responsif yang dapat dipasang ke layar utama Android (PWA). Menggunakan React + Vite untuk antarmuka dan Supabase Auth/Postgres untuk login serta database online multi-pengguna.

## Fitur MVP
- Login dengan akun yang dibuat pemilik.
- Role `owner`, `cashier`, `technician`.
- Stok HP/aksesori, penjualan, servis, pengeluaran, pembelian dan retur.
- Penjualan mengurangi stok secara atomik di database; pembelian menambah stok; retur mengurangi stok.
- Laporan harian per tanggal dan ekspor CSV.
- Layout responsif untuk HP Android dan desktop.
- Tanggal transaksi memakai WIB untuk default tanggal di database.

## 1. Siapkan database online
1. Buat project di https://supabase.com/ (pilih region terdekat yang tersedia).
2. Buka **SQL Editor → New query**.
3. Salin seluruh isi `supabase/schema.sql`, lalu tekan **Run**.
4. Buka **Project Settings → API** (atau Connect). Salin Project URL dan publishable/anon key. Jangan pernah masukkan `service_role` key ke frontend.
5. Di Authentication → Providers, pastikan Email aktif. Untuk penggunaan internal, sebaiknya matikan public sign-up di Authentication settings.

## 2. Buat akun pemilik pertama
1. Buka Authentication → Users → Add user, isi email dan password kuat, lalu buat user.
2. Salin UUID user tersebut.
3. Di SQL Editor jalankan perintah berikut, ganti UUID dan nama:
   ```sql
   insert into public.profiles (id, full_name, role)
   values ('UUID-DARI-AUTH', 'Nama Pemilik', 'owner')
   on conflict (id) do update set full_name=excluded.full_name, role='owner';
   ```
4. Setelah login pemilik, akun lain dapat dibuat melalui Authentication → Users → Add user. Setiap akun baru harus dipasangkan profilnya lewat SQL:
   ```sql
   insert into public.profiles (id, full_name, role)
   values ('UUID-AKUN-BARU', 'Nama Kasir', 'cashier');
   ```
   Gunakan `technician` untuk teknisi. Jangan berikan SQL Editor kepada kasir/teknisi.

## 3. Jalankan di komputer
Perlu Node.js versi LTS (https://nodejs.org/).
```bash
npm install
cp .env.example .env
```
Edit `.env` dan isi nilai Supabase:
```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_OR_ANON_KEY
```
Lalu jalankan:
```bash
npm run dev
```
Buka URL lokal yang ditampilkan Vite. Untuk build produksi:
```bash
npm run build
```
Hasil produksi ada di folder `dist`.

## 4. Deploy agar bisa diakses semua perangkat
Cara mudah: Vercel atau Netlify.
1. Upload repository ini ke GitHub (jangan commit `.env`).
2. Buat project baru di Vercel/Netlify dari repository.
3. Tambahkan environment variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Build command: `npm run build`; output directory: `dist`.
5. Deploy. Gunakan URL HTTPS yang disediakan.
6. Login dari laptop/HP dengan akun masing-masing. Semua pengguna memakai project database yang sama.

## 5. Pasang seperti aplikasi Android
1. Buka URL deployment di Chrome Android.
2. Menu ⋮ → **Tambahkan ke layar utama** / **Install app** (label bisa berbeda).
3. Ikon akan muncul di layar utama dan aplikasi terbuka dalam tampilan app-like.
Ini adalah PWA, bukan APK native Play Store. Untuk kebutuhan APK native, proyek perlu dibungkus dengan Capacitor atau dibuat ulang dengan React Native.

## 6. Hak akses
- Pemilik: semua fitur termasuk pembelian, retur, tambah stok, laporan dan pengguna.
- Kasir: penjualan, melihat stok, membuat tiket servis, mencatat pengeluaran.
- Teknisi: melihat tiket servis dan memperbarui status/diagnosis.
- Role ditegakkan dengan Row Level Security (RLS) dan fungsi database, bukan hanya menyembunyikan tombol di UI.

## 7. Operasional dan keamanan
- Jangan pernah membagikan `service_role` key.
- Gunakan password unik dan aktifkan MFA pemilik bila tersedia.
- Buat backup database berkala dari Supabase; penyimpanan cloud bukan pengganti backup.
- Uji dengan akun owner, cashier, dan technician sebelum dipakai untuk transaksi sungguhan.
- Buat satu produk per unit HP jika ingin melacak IMEI per unit. Versi MVP menyimpan satu field IMEI per produk; pelacakan beberapa unit dengan IMEI berbeda memerlukan tabel unit/serial terpisah.
- Laba penjualan = (harga jual - harga modal saat ini) × qty. Jika harga modal barang berubah setelah pembelian, laporan historis tetap menyimpan modal unit dari saat penjualan.
- Untuk retur pelanggan, refund, piutang/tempo, kas saldo awal/rekonsiliasi, barcode, nota thermal, dan multi-cabang, perlu pengembangan lanjutan.

## Catatan batasan MVP
Ini merupakan starter app operasional yang bisa dikembangkan. Belum mencakup sistem akuntansi penuh, pembukuan kas masuk/keluar terintegrasi untuk setiap transaksi, cetak nota, notifikasi, serta audit trail perubahan data. Sebelum dipakai sebagai sumber pembukuan resmi, lakukan pengujian dan penyesuaian alur usaha.
