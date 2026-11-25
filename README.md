# SIMTESIS — Dashboard Pemantauan Progres Tesis
**Magister Teknik Sipil, Fakultas Teknik, Universitas Janabadra**

Website gratis untuk memantau progres penelitian tesis, mulai dari pengajuan judul sampai luaran akhir (laporan dan publikasi).

| Bagian | Teknologi | Biaya |
|---|---|---|
| Website (tampilan) | HTML + JavaScript statis di **GitHub Pages** | Gratis |
| Server / API | **Google Apps Script** (Web App) | Gratis |
| Database | **Google Sheets** | Gratis |
| Penyimpanan berkas | **Google Drive** (milik akun yang men-deploy) | Gratis (kuota Drive) |

---

## 1. Fitur

**Mahasiswa** (mendaftar sendiri dengan NIM)
- Mengisi judul tesis, memilih **jalur (Reguler/Publikasi)**, serta memilih **Pembimbing 1 dan 2**.
- Mengunggah berkas tiap tahap (berkas ≤ 20 MB atau tautan Google Drive), dengan riwayat versi.
- Melihat tahapan dan status tiap tahap: *Sedang berjalan → Menunggu persetujuan → Perlu revisi → Selesai*.
- Membaca saran pembimbing dan membalasnya.
- Mengisi data publikasi: judul artikel, nama jurnal, ISSN, indeks (SINTA 1–6/Scopus Q1–Q4), status (Submitted, Under Review, Revisi, Accepted, Published, Rejected), DOI, vol/no/tahun, dan peran penulis.

**Dosen** (akun dibuat oleh admin)
- **Hanya melihat mahasiswa bimbingannya sendiri** (sebagai P1 atau P2). Server menolak akses ke data mahasiswa lain.
- Penanda titik merah untuk mahasiswa yang punya aktivitas baru.
- Menulis saran, **Minta revisi**, atau **Setujui tahap**, serta mengunggah berkas koreksi.

**Admin prodi**
- Ringkasan: sebaran tahap, jalur, status publikasi, dan beban bimbingan tiap dosen.
- Daftar seluruh mahasiswa dengan filter dan **Unduh CSV** (bisa dibuka di Excel).
- Mengelola akun (tambah dosen, reset password, nonaktifkan), mengubah pembimbing/jalur, dan memberi persetujuan atas nama prodi.

**Notifikasi email otomatis** ke dosen saat mahasiswa mengunggah/membalas, dan ke mahasiswa saat dosen memberi saran atau keputusan.

## 2. Alur tahapan (sesuai Kurikulum MTS 2025)

| No | Tahap | MK | Berkas wajib |
|---|---|---|---|
| 1 | Seminar Judul | Tesis 1 | Judul, jalur, P1 & P2 + **Bahan Seminar Judul** |
| 2 | Seminar Proposal | Tesis 2 | **Proposal Tesis**, **Bahan Seminar Proposal** |
| 3 | Seminar Hasil | Tesis 3 | **Bahan Seminar Hasil** |
| 4 | Naskah & Ujian Tesis | Tesis 3 | **Naskah Tesis** |
| 5 | Luaran Akhir | Tesis 3 + Publikasi | lihat di bawah |

**Tahap 5 — Luaran Akhir**
- **Jalur Reguler:** Buku Laporan Tesis (final), Naskah Artikel, LoA/Bukti Terbit. Artikel harus **minimal SINTA 4–6** dengan status **Accepted/Published**.
- **Jalur Publikasi:** Paper Jurnal dan LoA/Bukti Terbit (DOI), **tanpa buku laporan**. Jurnal harus **SINTA 1–3 atau Scopus** dengan status **Accepted/Published**. Bila artikel masih *under review*, sistem menampilkan peringatan bahwa mahasiswa tetap menyusun laporan.
- **Kedua jalur:** paket repositori, yaitu Extended Abstract (6–10 hlm), Lembar Pengesahan, dan Dataset/Skrip (opsional).

**Aturan persetujuan**
- Tahap dinyatakan **selesai** jika **P1 dan P2 sama-sama menyetujui** (atau prodi menyetujui).
- Tahap berikutnya baru terbuka setelah tahap sebelumnya selesai.
- Dosen tidak bisa menyetujui tahap yang berkas wajibnya belum lengkap.
- Setelah Seminar Judul disetujui, mahasiswa tidak bisa lagi mengganti pembimbing sendiri. Penggantian dilakukan lewat admin.
- Semua perubahan judul, jalur, pembimbing, dan status publikasi **tercatat otomatis** di riwayat bimbingan.

---

## 3. Instalasi (± 20 menit)

> Gunakan **satu akun Google khusus prodi** (misalnya akun email prodi). Seluruh data dan berkas tersimpan di Drive akun ini.

### Langkah A — Siapkan Google Sheet dan Apps Script
1. Buka <https://sheets.new>, lalu beri nama spreadsheet, misalnya **Database SIMTESIS MTS**.
2. Pilih menu **Ekstensi → Apps Script**.
3. Hapus isi `Kode.gs`/`Code.gs` bawaan, lalu **tempel seluruh isi** file `apps-script/Code.gs` dari paket ini. Klik 💾 Simpan.
4. (Opsional, disarankan) Buka ⚙️ **Setelan Project** dan centang *"Tampilkan file manifes appsscript.json"*. Buka `appsscript.json`, ganti isinya dengan file `apps-script/appsscript.json`, lalu simpan. Langkah ini mengatur zona waktu ke Asia/Jakarta.
5. Di toolbar atas, pilih fungsi **`setup`** lalu klik **▶ Jalankan**.
   - Akan muncul permintaan izin. Klik **Tinjau izin**, pilih akun, lalu **Lanjutan → Buka (tidak aman)** dan **Izinkan**. Peringatan ini normal karena skripnya milik Anda sendiri.
   - Setelah selesai, spreadsheet berisi sheet `Users`, `Tesis`, `Berkas`, `Catatan`, `Publikasi`, dan di Drive Anda muncul folder **Berkas Tesis MTS FTUJB**.
   - Akun admin pertama: **username `admin`, password `admin12345`**. Segera ganti password setelah login.

### Langkah B — Deploy sebagai Web App
1. Di editor Apps Script, klik **Deploy → Deployment baru**.
2. Klik ⚙️ di samping "Pilih jenis", lalu pilih **Aplikasi web**.
3. Isi:
   - Deskripsi: `SIMTESIS v1`
   - **Jalankan sebagai: Saya**
   - **Yang memiliki akses: Siapa saja**
4. Klik **Deploy** dan salin **URL aplikasi web** (berakhiran `/exec`).
5. Uji dengan membuka URL itu di browser. Jika muncul teks `{"ok":true,"app":"SIMTESIS",...}`, API sudah berjalan.

### Langkah C — Upload website ke GitHub Pages
1. Buat akun di <https://github.com> (gratis), lalu klik **New repository**.
   - Nama: `simtesis`, pilih **Public** (GitHub Pages gratis mensyaratkan repo publik). Klik **Create repository**.
2. Klik **uploading an existing file**, lalu seret file dan folder berikut dari paket ini:
   ```
   index.html
   config.js
   assets/style.css
   assets/app.js
   README.md
   ```
   (Folder `apps-script/` boleh ikut diunggah sebagai arsip; isinya tidak memuat rahasia.)
3. Buka `config.js` di GitHub, klik ✏️ edit, lalu ganti URL dengan URL dari Langkah B:
   ```js
   window.SIMTESIS_CONFIG = {
     API_URL: 'https://script.google.com/macros/s/AKfycb....../exec'
   };
   ```
   Klik **Commit changes**.
4. Buka **Settings → Pages**. Pada *Build and deployment*, pilih **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, lalu klik **Save**.
5. Tunggu 1–2 menit. Website tersedia di:
   **`https://<username-github>.github.io/simtesis/`**

### Langkah D — Penyelesaian
1. Buka website, login sebagai `admin`, lalu ganti password lewat menu **Akun**.
2. Buka menu **Pengguna → + Tambah pengguna**. Tambahkan semua dosen (peran *Dosen*, isi email agar notifikasi masuk), lalu bagikan username dan password awal kepada masing-masing dosen.
3. Bagikan link website ke mahasiswa. Mahasiswa mendaftar sendiri lewat **Daftar akun**.
4. (Opsional) Di `Code.gs`, isi `URL_DASHBOARD: 'https://<username>.github.io/simtesis/'` agar email notifikasi memuat tautan ke website, lalu lakukan **deploy ulang** (lihat bagian 4).

---

## 4. Mengubah kode backend (PENTING)
Setiap kali `Code.gs` diubah, perubahan **baru berlaku setelah deploy versi baru**:
**Deploy → Kelola deployment → ✏️ Edit → Versi: *Versi baru* → Deploy.**
URL `/exec` tetap sama, jadi `config.js` tidak perlu diubah.

## 5. Pengaturan yang bisa disesuaikan (`Code.gs`, bagian `APP`)
| Pengaturan | Default | Keterangan |
|---|---|---|
| `MAKS_MB` | 20 | Batas ukuran unggahan. Berkas lebih besar dikirim sebagai tautan Drive. |
| `REGISTRASI_PERLU_VERIFIKASI` | `false` | Jika `true`, akun mahasiswa baru harus diaktifkan admin dulu (menu Pengguna → Ubah → centang *Akun aktif*). |
| `NOTIFIKASI_EMAIL` | `true` | Matikan jika tidak ingin ada email. |
| `BAGIKAN_BERKAS_DENGAN_TAUTAN` | `true` | Berkas Drive bisa dibuka siapa pun yang memegang tautannya. |
| `KONSENTRASI` | 3 konsentrasi MTS | Daftar pilihan konsentrasi. |
| `TAHAP` | 5 tahap | Nama tahap dan berkas wajib tiap tahap. |
| `INDEKS_PUBLIKASI` / `INDEKS_REGULER` | sesuai kurikulum | Indeks jurnal yang sah untuk tiap jalur. |

## 6. Struktur database (Google Sheets)
| Sheet | Isi |
|---|---|
| `Users` | Akun (password disimpan sebagai *hash* + *salt*, bukan teks asli) |
| `Tesis` | Judul, jalur, P1, dan P2 tiap mahasiswa |
| `Berkas` | Semua unggahan (tahap, jenis, tautan Drive, pengunggah, waktu) |
| `Catatan` | Saran, tanggapan, keputusan (Disetujui/Revisi), dan log perubahan |
| `Publikasi` | Data artikel jurnal tiap mahasiswa |

Sheet boleh dibaca langsung untuk rekap. **Jangan menghapus kolom atau mengubah urutan header**, dan jangan membagikan spreadsheet ke banyak orang karena berisi hash password.

## 7. Keamanan dan batasan
- Hak akses diperiksa **di server**, bukan hanya di tampilan, sehingga dosen tidak bisa membuka data mahasiswa yang bukan bimbingannya.
- Sesi login berlaku 6 jam, lalu pengguna diminta login ulang.
- Setelah 8 kali salah password, akun dikunci selama 10 menit.
- Input yang diawali `=`, `+`, `-`, atau `@` disimpan sebagai teks, sehingga tidak bisa menyisipkan formula ke Sheets.
- Berkas yang diunggah tersimpan di Drive akun prodi dengan akses "siapa saja yang memiliki link". Ubah `BAGIKAN_BERKAS_DENGAN_TAUTAN` jika ingin lebih tertutup, tetapi dosen nantinya perlu diberi akses folder secara manual.
- Kuota Google untuk akun gmail biasa: ±100 email/hari dan waktu eksekusi terbatas. Untuk ratusan pengguna aktif sekaligus, gunakan akun Google Workspace kampus. Catatan: sebagian domain Workspace melarang Web App diakses "Siapa saja" atau berbagi tautan publik. Jika demikian, gunakan akun gmail prodi.
- Lupa password: admin melakukan reset lewat menu **Pengguna → Reset password**.

## 8. Mengatasi masalah
| Gejala | Solusi |
|---|---|
| "API_URL belum diatur" | Isi `config.js` dengan URL `/exec`. |
| "Respons server tidak valid" | Deployment belum diset **Yang memiliki akses: Siapa saja**, atau URL yang dipakai berakhiran `/dev` (harus `/exec`). |
| "Sheet ... belum ada" | Jalankan fungsi `setup` dari editor Apps Script. |
| Perubahan kode tidak berpengaruh | Deploy **versi baru** (bagian 4). |
| Website GitHub masih menampilkan versi lama | Tunggu 1–2 menit, lalu tekan Ctrl+F5. |
| Unggah gagal untuk berkas besar | Unggah ke Google Drive sendiri, atur aksesnya ke "siapa saja yang memiliki link", lalu tempel tautannya. |
