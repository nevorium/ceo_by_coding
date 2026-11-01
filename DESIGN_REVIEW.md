# DroneHarvest — RPG pixel 2D alam–industrial

## Identitas dan batas tahap ini

Dunia RPG menjadi tampilan utama: eksplorasi zona, farming, pengumpulan sumber daya, dan perkembangan machinery. Kontrak merupakan kegiatan pendukung yang tersedia melalui Jurnal.

Tahap ini mengoreksi visual dan penyajian UI. Pembangunan mesin bebas di grid, peningkatan machinery baru, dan otomasi berbasis UI tanpa skrip adalah arah tahap selanjutnya. Sistem kode drone tetap menjadi sidebar yang dapat dibuka dan ditutup melalui tombol `[ CODE ]` atau Tab.

## Sistem seni pixel

- Tile dan karakter asli 32×32. Pemain memiliki 16 frame: empat arah, empat frame per arah; indeks frame tetap kompatibel.
- Semua gambar dunia dan ikon dihasilkan dari buffer RGBA berkoordinat integer. Tidak ada kurva vector, resampling, atau antialiasing dalam sumber sprite.
- Setiap frame maksimal empat warna dan alpha hanya 0/255, dari palet bersama: `#101a21`, `#22343c`, `#42535b`, `#93a7a1`, `#edf0d4`, `#a4b18b`, `#244c3a`, `#4a7c59`, `#9b794e`, `#e3ba83`, `#63d8d1`, `#e9bf62`.
- Tile, tanaman, drone, NPC, gudang, pasar, conveyor, gerbang, dan ikon memakai bahasa visual yang sama. Ikon DOM dan Phaser berasal dari atlas item yang sama; ikon objek berbentuk emoji telah diganti.
- Mesin dibedakan lewat bentuk penggiling, oven, tangki, press, tungku, dan lengan perakitan. Indikator kotak membaca status simulasi yang sudah ada: menunggu bahan, bekerja, atau hasil siap.
- Efek kerja berupa partikel kotak. Preferensi reduced motion menonaktifkan animasi dekoratif dan partikel kerja.

## Peta, HUD, dan panel

- Permainan membuka peta dan sidebar Editor seperti versi sebelum rework (`9c4da91`). Tombol `[ CODE ]` / `[ < ]` dan Tab membuka atau menutup sidebar tanpa mengganti tab aktif maupun isi skrip.
- Sidebar menampilkan empat tab langsung: Editor, Profile, Academy, dan Devices. Struktur serta bentuk kontrol lama dipulihkan dengan palet warna sekarang. Pada desktop sidebar berada di kanan; pada lebar hingga 768px sidebar berada di bawah dan membebaskan tinggi saat ditutup.
- HUD ringkas menampilkan zona, saldo, status armada, dan hotbar. Tas, Jurnal, dan Ponsel tetap dapat dibuka melalui tombol masing-masing. Jurnal memuat kontrak dan laporan Operasi yang sudah ada.
- Sidebar bukan modal: dunia tetap dapat digunakan ketika fokus berada di luar editor/formulir. Tab dan Escape saat Monaco fokus tetap ditangani Monaco, termasuk untuk indentasi dan autocomplete. Shortcut sidebar tidak mengambil input formulir atau modal.
- Koordinator panel hanya mengelola modal seperti Jurnal, Tas, Gudang, Ponsel, inspector mesin, dan pasar. Satu modal terbuka pada satu waktu, dengan perangkap fokus, pemblokiran input dunia, serta pemulihan fokus saat ditutup.
- Inspector mesin memisahkan gambar, status, progres, bahan masuk, hasil, dan resep. Pasar mempertahankan API pembelian/penjualan yang sudah ada.
- Modal memakai bingkai siku dan aksen cyan/amber; sidebar mempertahankan bentuk dan tipografi versi lama. Monaco mempertahankan font kode.
- Tombol dunia, modal, dan hotbar memakai target minimal 44px. Kontrol sidebar mempertahankan ukuran ringkas sebelumnya. Hotbar menjadi empat kolom × dua baris jika lebar render kurang dari 384px.

## Rendering dan kompatibilitas

Skala CSS adalah 2× ketika lebar ruang game tersedia mulai 1024px dan 1× pada ukuran lebih kecil. Ukuran logis mengikuti ruang tersisa setelah sidebar dalam kelipatan 32, maksimal 640×480. Sisa ruang menjadi letterbox. Canvas, HUD, dan hotbar mengikuti ukuran aktual setelah resize atau toggle sidebar; peta, collision, dan koordinat tile tidak berubah.

Tidak ada migrasi save atau perubahan resep, biaya, hasil, kapasitas, maupun persyaratan zona. Nama tekstur dan indeks animasi tetap tersedia. Penyimpanan kontrak, gudang, hotbar, serta perbaikan harga dan estimasi sebelumnya dipertahankan.

## Pengujian

`npm test` mencakup logika kontrak dan pemeriksaan sumber pixel: batas palet, jumlah warna per frame, alpha biner, karakter 32px/16 frame, atlas bersama, penolakan koordinat pecahan, integer scaling pada lima lebar, serta target hotbar 44px. Tes runtime tambahan menjalankan interpreter asli untuk console, posisi syntax error, kegagalan runtime, pause/resume aksi asinkron, STOP, benchmark tanpa mutasi dunia, dan persistensi kode/penugasan skrip.

Autosave editor mengambil ID dan isi skrip saat perubahan terjadi. Buffer disimpan sebelum berpindah skrip atau tab, menutup sidebar, dan meninggalkan halaman; pemuatan kode dari save tidak dianggap sebagai edit pengguna. Mesin interpreter, API drone, format save, dan dependensi tetap sama. Batas lama yang ditemukan saat pengujian: nomor baris runtime error bisa menunjuk baris sebelumnya; ini tidak berasal dari rework sidebar dan belum diubah pada pemulihan ini.

Fixture browser di `tests/visual-fixtures.html` menguji inspector dan pasar dengan inventaris terpisah yang tidak membaca atau menulis save pemain. Alur yang diperiksa: deposit 2 gandum → proses → ambil 1 tepung, beli benih 5g, jual tepung 35g, dan pemulihan fokus melalui Escape.

Fixture `tests/editor-sidebar.html` menjalankan game asli dalam iframe dengan localStorage di memori. Buka melalui server dev lalu klik **Jalankan pemeriksaan**. Sembilan pemeriksaan mencakup sidebar awal, perpindahan buffer, toggle/tab aktif, event drag/drop dan Edit dari Devices, RUN/console/resume, STOP, nomor baris syntax error, persistensi buffer, serta Jurnal terpisah. Seluruhnya lulus; pengujian ini tidak menggunakan save pemain.

Pemeriksaan visual dilakukan pada lebar 320, 390, 768, 1024, dan 1440px, termasuk sidebar, Jurnal, dan editor. Escape autocomplete, indentasi Tab, fokus formulir, reload langsung setelah mengetik, dan pembebasan ruang game saat sidebar mobile ditutup juga diperiksa melalui browser. Build produksi masih menampilkan peringatan ukuran bundel Monaco/Phaser dan externalisasi `vm` dari js-interpreter. Integrasi cloud memerlukan konfigurasi layanan dan tidak termasuk validasi lokal ini.

## Tahap berikutnya

Fokus berikutnya adalah bangun machinery bebas di grid dan pengaturan prioritas produksi melalui UI. Perkembangan idealnya membuka kemampuan yang terlihat: alat kerja alami → mesin dasar → pengolahan bertingkat → logistik → lini produksi yang dapat ditata pemain. Kontrak memberikan tujuan tambahan; pertumbuhan pabrik menjadi progres utama.
