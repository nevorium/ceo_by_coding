# 🚜 UPGRADE_PLAN — ceo_by_coding (DroneHarvest)

> Dokumen planning hasil baca repo `Meownic/ceo_by_coding` (commit `9c4da91` — satu-satunya commit, jadi riwayat git **nggak** bisa dipakai buat nelusuri upgrade yang dulu setengah jalan).
> Dibuat 28 Okt 2026. Angka persen = **perkiraan dari baca kode**, bukan hasil jalanin game.
> Tanda **(asumsi)** = angka/keputusan desain yang aku tebak. Sesuaikan setelah playtest.

---

## 0. Cara pakai dokumen ini

1. Taruh file ini di repo: `docs/UPGRADE_PLAN.md`.
2. Bikin `AGENTS.md` di root repo, isinya satu baris: `Baca docs/UPGRADE_PLAN.md (bagian 2 "Peta Kode") sebelum ngoding. Kerjakan HANYA sprint yang diminta.` — jadi Codex selalu punya konteks tanpa harus baca ulang seluruh repo.
3. Satu sprint = satu branch (`sprint-2-slot-inventory`), commit kecil-kecil, merge kalau Definition of Done (DoD) hijau.
4. Tiap sprint ada **Prompt siap tempel** buat Codex. Tinggal copy.

---

## 1. Audit: "udah jalan berapa persen?"

| Fitur | Status | Bukti di kode |
|---|---|---|
| Farming (cangkul, siram, tanam, panen, tumbuh) | ✅ ~100% | `GridManager`, `data/plants.js` |
| Drone + scripting (Monaco + js-interpreter) | ✅ ~90% | `Drone.js`, `DroneAPI.js`, `ScriptSandbox.js` |
| 4 Zona + gerbang | ✅ ~90% | `GATES` di `config/constants.js` (aturan pagar di-hardcode di 3 tempat ⚠️) |
| **Mining zone** | ✅ ~100% | Node batu (`stone`), pickaxe tool, penambangan manual player, durabilitas & drop yield, resep gold_ingot & chip (Sprint 5) |
| **Conveyor belt** | ✅ ~100% | Render belt directional, render item overlay berjalan, alur logistik ke warehouse & mesin, ejeksi output mesin, interaksi player, tersimpan di Save v2 (Sprint 8) |
| **Building mode** | ✅ ~100% | Pasang kit bangunan (`crafting_table`, `warehouse`, `smelter`, `mill`, `assembler`, `press`, `boiler`, `conveyor`), bongkar kit refund buffer, multi-mesin independen, multi-warehouse satelit (Sprint 7 & 8) |
| **Crafting table** | ✅ ~100% | Meja kerja player crafting, filter kategori, batch/max craft, pembuatan kit bangunan & perkakas (Sprint 6) |
| **Explore zone** | ✅ ~100% | Zona 5 Hutan Liar Selatan (0..39, 40..59), Gerbang 5 dibuka dengan 10 batu + 2 besi, 16 node ore quarry batu liar, 3 peti kuno discovery caches, siklus fauna liar & wild fiber (Sprint 9) |
| **Animal mob** | ✅ ~100% | Mob hare (HP 2), deer (HP 4), boar (HP 6), sprite pixel & animasi, mekanisme serang SPACE/klik, skala damage tool, kabur/flee, loot raw_meat/leather/bone, XP profile, dan save/load v2 (Sprint 10) |
| **Inventory slot + upgrade slot** | ❌ 0% | `InventorySystem` & `Warehouse` = `Map<id, qty>` tanpa batas, tanpa urutan |
| **Sorting** | ❌ 0% | — |
| **Drag & drop item** | 🟠 ~30% (dan "palsu") | Lihat 1.1 |
| **Bar kapasitas drone** | ❌ 0% | `DroneInventory` punya `getTotalCount()` & capacity, tapi belum digambar |

### 1.1 Kenapa drag & drop-nya terasa kayak "nyeret gambar di website"

Ada **3 mekanisme drag yang nggak saling kenal**:

1. **Hotbar** — drag Phaser: background slot (kotak) yang ikut pointer. Jadi yang kamu bawa itu *kotak slot*, bukan item.
2. **Kartu script** — pakai HTML5 native drag (`draggable`, `dragstart`) → browser otomatis bikin "ghost image" setengah transparan. Itu persis sensasi "nyeret gambar di website".
3. **Drop zone DOM di Hotbar** (`_setupDOMDropZone`) — **dead code**: nggak ada slot backpack yang `draggable` dan nggak ada yang `dataTransfer.setData(...)`. Jadi backpack → hotbar via drag sebenarnya nggak pernah jalan.

Solusi: satu `DragManager` buat semuanya (Sprint 3).

### 1.2 Bug/risiko yang ketemu (harus dibereskan duluan)

| # | Temuan | Dampak | Sprint |
|---|---|---|---|
| B1 | `SaveSystem`/`CloudSaveSystem` **nggak menyimpan isi warehouse** (grep `warehouse` = kosong) | Isi gudang hilang tiap reload ⚠️ | S0 |
| B2 | Isi hotbar nggak ada di save (item yang dipindah ke hotbar keluar dari inventory) — **cek manual** | Item bisa hilang/duplikat setelah reload | S0 |
| B3 | `loadLocalSave` menolak `version !== 1` | Kalau cuma bump versi tanpa migrasi, **semua save lama kebuang** | S2 |
| B4 | `ITEM_METADATA` duplikat di `EditorBridge.js` dan `MachineUI.js` | Nambah item = edit 2 tempat, gampang beda | S0 |
| B5 | Aturan pagar/gerbang di-hardcode di `GridManager.isWalkable`, `_updateTileSprite`, dan kode hover | Nambah zona 5 = edit 3 tempat | S0 |
| B6 | Popup warehouse cuma menggambar 24 slot (cek `_renderWarehouse`) — kalau jenis item > 24, sisanya kemungkinan nggak kelihatan | Item "ghaib" | S2 (hilang sendiri karena slot baru) |
| B7 | `gold_ingot` dan `chip` ada di metadata item — **cek** apakah punya resep. Kemungkinan belum | Item yang nggak bisa dibuat | S5 |
| B8 | Drone cuma emit event `module-changed` & `status-changed` — **nggak ada** `inventory-changed` | Bar drone harus nambah event ini | S1 |
| B9 | (Catatan sampingan) Kalau `.env.example` memakai token Upstash berawalan `VITE_`, token itu ikut ke bundle client → siapa pun bisa baca/tulis. Cek & pindahkan ke serverless function kalau memang begitu | Keamanan | di luar sprint |

---

## 2. Peta kode (konteks buat Codex)

**Stack:** Vite + Phaser (game canvas) + Monaco Editor (panel kode di kanan) + js-interpreter (sandbox script drone) + Supabase/Upstash (cloud save). UI game campur: **canvas Phaser** (hotbar, MachineUI, MarketUI) dan **DOM** (`index.html` + `EditorBridge.js`: panel kanan, backpack, warehouse, profile).

```
index.html                 ← layout + CSS + semua popup DOM (#editor-panel di kanan,
                             #backpack-popup, #warehouse-popup di ~baris 2060–2125)
src/main.js                ← entry
src/config/constants.js    ← GRID 60×40, TILE_SIZE, ZONES, GATES
src/data/plants.js, modules.js
src/scenes/BootScene.js    ← generate SEMUA tekstur lewat canvas (icon_<itemId> 16×16 di ~baris 734)
src/scenes/GameScene.js    ← ~1.4k baris: create(), input (SPACE/E/Q/ESC/B/1–8), _createFarmLayout,
                             _updateTileSprite, _doInteract
src/systems/GridManager.js ← tile state, isWalkable, conveyor engine (setConveyor, tickConveyorItems)
src/systems/InventorySystem.js ← Map<id,qty> tanpa batas
src/systems/MachineSystem.js   ← mesin + RECIPES (smelter: copper & iron)
src/systems/DroneAPI.js, ScriptSandbox.js ← API yang dipanggil script player
src/systems/SaveSystem.js (version 1), CloudSaveSystem.js, EconomySystem.js, ProfileSystem.js
src/entities/Drone.js      ← DroneInventory (capacity), label id di y+18, shadow y+12
src/entities/Warehouse.js  ← 2×2 di (10,2), items = Map
src/ui/Hotbar.js           ← Phaser, ITEM_ACTIONS (peta item→aksi), drag Phaser
src/ui/EditorBridge.js     ← ~2.2k baris "god class" DOM: tab editor/profile/devices/guide,
                             backpack, warehouse, kartu script (HTML5 drag)
src/ui/MachineUI.js        ← Phaser, di-rebuild tiap ~500ms
```

---

## 3. Urutan & estimasi

```
S0 Fondasi ─┬─ S1 Bar drone (quick win, bebas urutan)
            └─ S2 Slot inventory ─ S3 DragManager ─ S4 Storage Dock     ← "Inventory Pro"
                 │
                 └─ S5 Mining tuntas ─ S6 Crafting table ─ S7 Building core ─ S8 Conveyor & mesin   ← "Build & Automate"
                                                                                  │
                                                                      S9 Explore zone ─ S10 Animal mob   ← "Explore & Fauna"
                                                                                                  └─ S11 Stretch
```

| Sprint | Nama | Estimasi* | Milestone |
|---|---|---|---|
| S0 | Fondasi & bersih-bersih | 1–2 hari | M1 |
| S1 | Bar kapasitas drone | 0,5–1 hari | M1 |
| S2 | Inventory slot + sorting (logic) + save v2 | 2–3 hari | M2 |
| S3 | DragManager ("item beneran") | 2–3 hari | M2 |
| S4 | Storage Dock + menu sorting | 2–3 hari | M2 |
| S5 | Mining tuntas + material build | 1–2 hari | M3 |
| S6 | Crafting table | 2–3 hari | M3 |
| S7 | Building mode (core) | 3–4 hari | M3 |
| S8 | Conveyor tampil/tersimpan + mesin placeable + multi-warehouse | 3–4 hari | M3 |
| S9 | Explore zone | 3–4 hari | M4 |
| S10 | Animal mob MVP | 3–4 hari | M4 |
| S11 | Stretch (ranch, API ranger, mob agresif, balancing) | bebas | — |

---

## SPRINT 0 — Fondasi & bersih-bersih
Tujuan: bereskan bug kehilangan data dan duplikasi supaya sprint berikutnya nggak bangun di atas pasir.
- [x] Buat `src/data/items.js` single source of truth untuk metadata, kategori, dan batas stack.
- [x] Buat `src/systems/ZoneMap.js` untuk `getZoneAt`, `isFenceTile`, `isGateTile`.
- [x] Hubungkan `ZoneMap` ke `GridManager.isWalkable`, `GameScene._createFarmLayout`, `GameScene._updateTileSprite`, dan cursor hover.
- [x] Simpan & muat state `warehouse` dan `hotbar` di `SaveSystem`.
- [x] Pasang helper `window.__dev.give()`, `__dev.coins()`, `__dev.tp()` saat DEV atau `?debug=1`.
- [x] Unit test `tests/sprint0-foundation.test.js` (semua resep/shop/tanaman valid, ZoneMap valid).

## SPRINT 1 — Bar kapasitas drone (quick win)
Tujuan: tiap drone punya bar kecil di bawahnya: seberapa penuh inventory-nya. Kuning → oranye → merah makin penuh.
- [x] `src/utils/fillColor.js` dengan interpolasi HSL (50° -> 0°) yellow #FFD84A -> orange #FF9A2E -> red #E53935.
- [x] `DroneInventory`: emit `inventory-changed { used, capacity, droneId }` pada add/remove/clear & perubahan kapasitas modul.
- [x] `src/entities/DroneCapacityBar.js`: ukuran 26×4 px, border 1 px #1b1b1b, lerp animasi lebar bar, red pulse saat penuh 100%, alpha 0.45 saat kosong 0%.
- [x] Hook di `Drone` constructor, `_syncAttachments()`, dan `destroy()`.
- [x] Indikator bar di kartu drone tab Devices (`EditorBridge.js`).
- [x] Unit test `tests/sprint1-capacity-bar.test.js` (fillColor monotik HSL & event notification).

## SPRINT 2 — Inventory berbasis slot + sorting (logic) + save v2
Tujuan: inventory & warehouse punya slot, batas tumpukan, dan bisa di-upgrade (beli slot). Sorting dibuat sebagai logika murni (UI-nya di S4).
- [x] `src/systems/SlotContainer.js`: sistem slot berkapasitas, stackMax per item (99 material/tanaman, 1 tools/modules), partisi slot otomatis, swap, split, compact, sort.
- [x] `src/utils/inventorySort.js`: logika sorting murni (kategori, nama, kuantitas, ID) dan compacting slot parsial.
- [x] `InventorySystem` & `Warehouse` didukung oleh `SlotContainer` dengan backward compatibility penuh (Map proxy dan signature lama).
- [x] `ProfileSystem`: upgrade track `backpackSlots` (16→20→24→32) dan `warehouseSlots` (24→32→48→64).
- [x] `SaveSystem` versi 2: serialisasi slot & kapasitas, migrasi transparan save format v1 ke struktur slot v2 tanpa kehilangan item.
- [x] Unit test `tests/sprint2-slot-inventory.test.js` (stack partition, stackMax 1, slot rejection, compact, sorting, profile upgrade, v1->v2 migration).


## SPRINT 3 — DragManager: drag yang terasa "item beneran"
Tujuan: ganti 3 mekanisme drag jadi satu engine berbasis pointer, dengan ghost item yang punya bobot.
- [x] `src/systems/DragManager.js`: unified pointer-based drag engine dengan fisika kemiringan berbasis kecepatan (`calculateTilt`), threshold aktivasi drag, dan registrasi drop target lintas batas (DOM & Canvas).
- [x] "Ghost item yang punya bobot": elemen floating DOM berdefinisi pixel tinggi dengan bayangan mendalam, badge jumlah, dan rotasi inersia.
- [x] `Hotbar.js`: kotak slot tetap diam di tempat (tidak lagi ikut pointer); dragging slot mengangkat item ghost, swap antar-slot hotbar, dan drop di luar hotbar mengembalikan item ke ransel.
- [x] `EditorBridge.js`: drag kartu skrip diganti dari HTML5 native drag ke `DragManager` dengan visual kartu ghost mini dan highlight drop zone drone.
- [x] Slot popup ransel (`_renderBackpack`) mendukung drag & drop langsung ke slot hotbar.
- [x] `StorageUI.js`: delegasi operasi drag pointer ke `DragManager` untuk perpindahan item ransel ↔ warehouse.
- [x] Unit test `tests/sprint3-drag-manager.test.js` (tilt, threshold, hit testing drop target, hover & drop lifecycle, outside drop, cancel, script card binding).

## SPRINT 4 — Storage Dock + menu sorting
Tujuan: buka warehouse → panel kanan (sidebar editor) berganti jadi inventory supaya bisa drag dua arah. Plus menu sorting.
- [x] Storage Dock sidebar: saat interaksi dengan Warehouse HQ atau Depot (`StorageUI.open()`), panel kanan editor Monaco berganti mulus menjadi dock inventory dua kolom (Tas ↔ Warehouse), dan pulih kembali saat ditutup atau pemain menjauh.
- [x] Slot-based dual rendering: visualisasi slot lengkap berkapasitas riil (`SlotContainer`), termasuk render slot kosong bergaris putus-putus (`.storage-slot.empty`) dan indikator kapasitas live e.g. `(2/16)` & `(1/24)`.
- [x] Menu sorting terintegrasi: sorting langsung pada kontainer Tas dan Warehouse berdasarkan Kategori (Category), Nama alfabetis (Name), dan Jumlah tumpukan (Quantity), dengan auto-save lokal.
- [x] Tombol "Kerapkan" (Compact): menggabungkan tumpukan parsial sejenis ke kapasitas stackMax masing-masing kontainer dan merapikan slot.
- [x] Two-way drag & drop lintas kontainer via `DragManager`: drag slot-ke-slot dengan deteksi target slot tujuan, swap item, penggabungan parsial/penuh, dan fallback drop zone kontainer.
- [x] Quick actions & QoL: Shift+Klik untuk transfer cepat instan antar-kontainer, validasi penyimpanan alat/kunci, tombol "Deposit Semua 📦", "Ambil Semua", dan "Split Stack".
- [x] Unit test `tests/sprint4-storage-dock.test.js` (dock transitions, empty/filled slot rendering, sorting category/name/quantity, compacting, batch transfers, shift-click quick transfer, two-way drag & drop).

## SPRINT 5 — Mining zone tuntas + material buat build
Tujuan: mining nggak cuma urusan drone; player bisa nambang manual dan dapat stone (bahan dasar bangunan).
- [x] Node Batu (Stone Rocks) & Variasi Ore: batu (`stone`) didaftarkan sebagai node tambang di Zona 3 (Lembah Tambang), tekstur `tile_ore_stone` dibuat sesuai palet pixel art.
- [x] Alat Tambang (`pickaxe`): pemain dibekali Beliung (`pickaxe`) di slot hotbar default, diidentifikasi sebagai perkakas non-storable di gudang, dan memberikan 2x damage saat menambang.
- [x] Mekanisme Penambangan Manual Player: interaksi langsung (klik / `SPACE` / smart action) mengurangi durabilitas node (`oreCurrentDurability`), efek partikel puing, kamera bergetar, dan floating prompt interaktif saat menghadap batu tambang.
- [x] Drop Material Bangunan: penambangan menghasilkan `stone` (bahan utama bangunan/crafting), `coal`, `copper_ore`, `iron_ore`, dan `gold_ore`.
- [x] Respawn & Siklus Node: node yang hancur menjadi `depleted`, masuk ke antrean `minedOres` dengan timer 30 detik untuk respawn, serta auto-save ke `SaveSystem`.
- [x] Penyelesaian Bug B7: resep `gold_ingot` (Smelter: 2 gold_ore + 1 coal) dan `chip` (Assembler: 2 wire + 1 gold_ingot) ditambahkan di `MachineSystem`.
- [x] Dukungan Drone Mining: `drone.mine()` mendukung ekstraksi node `stone` ke inventory drone.
- [x] Unit test `tests/sprint5-mining.test.js` (durability stone/coal/copper/iron/gold, pickaxe tool handling, recipe completion B7, tile_ore_stone assets, dan alur penambangan manual).

## SPRINT 6 — Crafting table
Tujuan: player bisa meng-craft item (termasuk item bangunan) dari resource, lewat crafting table.
- [x] Resep Lengkap Meja Kerja: `RECIPES.crafting_table` mencakup kit bangunan (`conveyor_kit`, `warehouse_depot_kit`, `crafting_table_kit`) dan perkakas kerja (`pickaxe`, `plow`, `watering_can`) dari hasil tambang & serat alam.
- [x] Mesin Logika Player Crafting (`MachineSystem`): fungsi `getRecipes`, `checkCraftRequirements`, `getMaxCraftableCount`, dan `craftItem` untuk validasi bahan, pencegahan kehilangan item saat ransel penuh, serta dukungan rakit tunggal maupun batch / maks.
- [x] Antarmuka Khusus Meja Kerja (`MachineUI`): UI perakitan interaktif lengkap dengan filter kategori (Bangunan, Peralatan, Komponen), kartu resep, chip bahan (hijau/merah), tombol "Rakit 1" dan "Rakit Maks", serta notifikasi feedback HUD.
- [x] Dukungan Logistik Otomatis: buffer mesin dan antrean deposit/ambil hasil tetap berfungsi penuh (toggleable) untuk otomasi drone/conveyor.
- [x] Prompt Interaksi Khusus: menghadap meja kerja di world menampilkan `[E] Buka Meja Kerja`.
- [x] Unit test `tests/sprint6-crafting-table.test.js` (validasi resep, kalkulasi kebutuhan bahan, konsumsi material, output barang, batch crafting, penolakan saat ransel penuh, dan perakitan kit).

## SPRINT 7 — Building mode (core)
Tujuan: player bisa menaruh dan mengangkat bangunan di grid. Prioritas: crafting table & warehouse.
- [x] Sistem Penempatan Bangunan (`BuildingSystem.placeFromKit`): pemasangan kit dari ransel (`crafting_table_kit`, `warehouse_depot_kit`, `conveyor_kit`) dengan validasi footprint (tidak menimpa pagar, gerbang, ore, tanaman, pemain, atau bangunan lain).
- [x] Sistem Pengangkatan / Pembongkaran Bangunan (`BuildingSystem.dismantleBuilding` & `dismantleAt`): mengangkat bangunan pemain kembali menjadi kit di ransel. Menyelamatkan material buffer di meja kerja dan item yang sedang berjalan di atas conveyor.
- [x] Proteksi Ransel Penuh: pembongkaran dicegah jika ransel pemain penuh agar kit bangunan tidak lenyap.
- [x] Mode Bongkar Terintegrasi: toolbar Build Mode menyediakan tombol `🪓 Bongkar (X)` dan shortcut keyboard `X` untuk beralih instan antara mode pasang dan mode bongkar.
- [x] Visualisasi & Feedback Preview: kotak preview dinamis warna hijau (pasang valid), merah (lokasi tidak valid), dan oranye/merah snapping ke footprint bangunan yang dibidik dalam mode bongkar, lengkap dengan efek partikel dan pesan toast HUD.
- [x] Rotasi & Kontrol: tombol `R` untuk memutar orientasi (conveyor), `B` untuk toggle mode bangun, `ESC` untuk membatalkan.
- [x] Siklus Save/Load & Reset Bersih: `reset()` membersihkan tile grid dan unregister mesin dengan rapi sehingga restore state v2 berjalan sempurna tanpa konflik collision.
- [x] Unit test `tests/sprint7-building-mode.test.js` (validasi canPlace, penempatan meja kerja & warehouse depot, pengangkatan dan refund kit/buffer, proteksi inventory full, rotasi, mode switching, dan round-trip serialisasi save state).

## SPRINT 8 — Conveyor tampil/tersimpan + mesin placeable + multi-warehouse
Tujuan: menyelesaikan sisa 50 % conveyor, mesin bisa dibangun lebih dari satu, dan warehouse boleh banyak.
- [x] Visualisasi & Overlay Item Conveyor: item yang berjalan di atas conveyor (`conveyorItem`) digambar secara presisi dengan sprite icon 16×16 (`icon_<itemId>`), sinkron dengan ticker `tickConveyorItems` dan update tile.
- [x] Aliran Logistik Otomatis Lengkap: item berjalan step-by-step di atas conveyor chain, otomatis terdeposit ke Warehouse HQ maupun Depot satelit saat menyentuh tile gudang, dan otomatis masuk ke input buffer mesin jika belt mengarah ke mesin.
- [x] Ejeksi Output Mesin ke Conveyor: mesin yang selesai memproses resep otomatis meluncurkan item hasil produksinya ke conveyor kosong di sebelahnya yang mengarah keluar (away from machine).
- [x] Interaksi Manual Pemain di Conveyor: pemain dapat mengambil item dari conveyor dengan tombol `[E]` / klik, atau meletakkan item dari hotbar ke conveyor kosong dengan tombol `[SPACE]`, lengkap dengan prompt HUD melayang.
- [x] Mesin Placeable & Multi-Mesin: kit bangunan untuk semua mesin industri (`smelter_kit`, `mill_kit`, `assembler_kit`, `press_kit`, `boiler_kit`) didaftarkan di metadata, tekstur pixel, dan resep Meja Kerja; pemain dapat membangun lebih dari satu mesin dari tipe yang sama di grid dengan ID, timer, buffer, dan UI inspeksi mandiri.
- [x] Multi-Warehouse Satelit: pemain dapat menempatkan lebih dari satu warehouse / depot di berbagai zona (`warehouse_kit`, `warehouse_depot_kit`), berbagi penyimpanan terpusat sehingga drone dan pemain dapat setor/tarik dari lokasi terdekat.
- [x] Serialisasi & Restore Lengkap: arah belt, item aktif di atas belt, multi-mesin, dan multi-warehouse tersimpan aman di format Save v2 dan dipulihkan tanpa kehilangan data.
- [x] Unit test `tests/sprint8-conveyor-machines.test.js` (pergerakan rantai belt, setor ke warehouse, setor ke mesin, ejeksi output mesin, multi-mesin independen, multi-warehouse storage sharing, dan round-trip serialisasi).

## SPRINT 9 — Explore zone
Tujuan: area liar baru untuk dijelajahi: sumber stone/loot, dan "rumah" bagi animal mob (S10).
- [x] Perluasan Peta Grid & Batas Zona 5: Zona 5 (Southern Wilds, petak `x: 0..39, y: 40..59`) dibatasi dengan pagar keliling dan terhubung melalui Gerbang 5 di `(20, 39)`.
- [x] Mekanisme Pembukaan Gerbang 5: Gerbang 5 membutuhkan 10 stone + 2 iron_ingot; membuka gerbang memperluas batas kamera vertikal hingga baris 60, memicu visual fauna liar dan peti kuno.
- [x] Tambang Batu Liar (Stone Quarry) & Urat Tambang Dalam: 16 node ore alami didaftarkan di Zona 5 (13 batu `stone` untuk suplai bahan bangunan massal, serta cadangan dalam besi, batu bara, dan emas).
- [x] Ekosistem Fauna Liar & Serat Alami: hewan liar pasif (rusa & terwelu) menjelajah Hutan Liar Selatan dan meninggalkan `wild_fiber` yang dapat dipanen pemain dengan validasi kapasitas ransel.
- [x] Peti Temuan Eksplorasi (Discovery Loot Caches): peti kuno misterius (`cache_pioneer`, `cache_builder`, `cache_tech`) tersebar di pelosok Zona 5; pemain dapat membuka dengan `[E]` untuk mendapatkan benih, koin, XP, bahan logam, dan kit bangunan (`conveyor_kit`, `crafting_table_kit`).
- [x] Proteksi & HUD Dinamis: pembukaan peti dicegah jika tas penuh (`inventory_full`), HUD zona menampilkan nama area `Hutan Liar Selatan` dan banner animasi saat memasuki Zona 5.
- [x] Serialisasi Save v2: status gerbang 5, fauna liar, drop serat, dan status peti temuan tersimpan aman di format Save v2.
- [x] Unit test `tests/sprint9-explore-zone.test.js` (validasi batas ZoneMap, alur buka gerbang, quarry batu & ore, siklus fauna & serat, looting peti kuno, proteksi inventory full, dan round-trip serialisasi).

## SPRINT 10 — Animal mob MVP
Tujuan: hewan liar spawn di Zona 5, bisa dipukul, menjatuhkan loot.
- [x] Registrasi Tipe Mob & Status: `MOB_TYPES` di `WildlifeSystem.js` mendefinisikan terwelu (`hare`, HP 2, cepat), rusa (`deer`, HP 4, grazer), dan babi hutan (`boar`, HP 6, kokoh) lengkap dengan tabel drop loot dan nilai XP eksplorasi.
- [x] Visual Sprite Pixel Art & Ikon Loot: tekstur sprite `wildlife_boar` ditambahkan dengan moncong taring berpalet pixel art; ikon 16×16 untuk `raw_meat`, `leather`, dan `bone` digenerate di atlas tekstur dan didaftarkan di metadata `items.js`.
- [x] Mekanisme Tempur & Skala Serangan: pemain dapat menyerang mob liar menggunakan tombol `[SPACE]`, klik kursor, atau `[E]` saat berhadapan; kalkulasi damage perkakas (`pickaxe` = 2 damage, `plow` = 2 damage, tangan kosong/lainnya = 1 damage) disertai visual strike partikel darah merah, kamera bergetar, dan floating damage text.
- [x] Logika Kabur (Flee Behavior) & Flash Efek: mob yang menerima serangan non-letal berkedip merah (tint `0xff4444`) dan langsung kabur menjauhi arah penyerang sejauh 1–2 petak yang dapat dilalui (walkable).
- [x] Eliminasi Mob & Drop Hasil Buruan: saat HP mob habis (<= 0), mob musnah, memicu suara/efek toast HUD, menghadiahkan XP ke pemain, serta menjatuhkan tumpukan loot buruan di tanah (`raw_meat`, `leather`, `bone`, `wild_fiber`) dengan hamburan petak otomatis jika bertumpuk.
- [x] Pungut Barang & Proteksi Kapasitas: pemain dapat mengumpulkan hasil buruan di petak hadap atau petak berdiri dengan tombol `[E]`, divalidasi dengan kapasitas slot ransel (`hasSpaceFor`) untuk mencegah kehilangan item.
- [x] Siklus Spawn & Serialisasi Save v2: mob liar terus melakukan respawn terkontrol di Zona 5 (maks 6 fauna aktif); koordinat petak, tipe mob, sisa HP, dan seluruh item loot yang tergeletak di tanah tersimpan dan dipulihkan secara presisi di Save v2.
- [x] Unit test `tests/sprint10-animal-mob.test.js` (validasi registry MOB_TYPES, spawn & HP mob, lookup spasial getAnimalAt/Near, kalkulasi combat damage tool, flee behavior menjauhi penyerang, lethal defeat & loot drops, pengumpulan loot ransel, dan round-trip serialisasi save state).

## SPRINT 11 — Stretch
Ranch, API Ranger, mob agresif, balancing pass.

