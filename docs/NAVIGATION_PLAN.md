# 🧭 NAVIGATION_PLAN — Koordinat Live, Minimap, Teleporter (ceo_by_coding / DroneHarvest)

> Hasil baca repo `nevorium/ceo_by_coding` di commit `4d7973d` (HEAD per 3 Nov 2026, 4 commit). Dokumen dibuat 3 Nov 2026.
> **Metode:** clone → baca kode → jalanin `node --test` (tanpa `npm install`) → verifikasi beberapa kecurigaan pakai script Node kecil.
> **Belum dilakukan:** game belum dijalankan di browser, dan **nggak ada satu baris pun kode repo yang diubah**. Jadi temuan visual (mis. "kamera keluar batas") itu *deduksi dari kode*, bukan hasil lihat layar.
> Tanda **(asumsi)** = angka/keputusan desain yang aku tebak. Sesuaikan setelah playtest.

---

## 0. Cara pakai dokumen ini

1. Taruh file ini di repo: `docs/NAVIGATION_PLAN.md`.
2. Tambah satu baris di `AGENTS.md` (di bawah baris yang sudah ada):
   `Untuk fitur koordinat/minimap/teleporter, baca docs/NAVIGATION_PLAN.md bagian 1–3 dan sprint yang diminta. Kerjakan HANYA sprint itu.`
3. Satu sprint = satu branch (`nav-1-fondasi`, `nav-2-koordinat`, ...), commit kecil, merge kalau Definition of Done (DoD) hijau.
4. Tiap sprint punya **Prompt siap tempel** buat Codex (bagian 7).

---

## 1. TL;DR

- **3 fitur, 5 sprint inti + 1 stretch**, estimasi total ±8–11 hari kerja (asumsi).
- Semuanya **numpang pola yang sudah ada**: kit → Build Mode (`BuildingSystem`), resep di Crafting Table (`MachineSystem.RECIPES`), modal lewat `PanelManager`, overlay DOM di `#rpg-chrome`, save v2 tanpa bump versi.
- Keputusan teknis kunci:
  - **Minimap = `<canvas>` DOM 60×60** (1 piksel = 1 petak), bukan kamera Phaser kedua.
  - **Teleporter = bangunan solid 1×1**, dipakai dari petak sebelahnya dengan `E` (bukan pad yang diinjak).
  - **Jaringan bebas**: tiap teleporter bisa ke teleporter lain di zona yang sudah terbuka.
- **3 temuan yang harus dibereskan dulu (Sprint N1):** aturan zona masih ada yang di-hardcode, kuadran kanan-bawah peta "tanpa zona" tapi bisa dijalani, dan nama zona ganda beda bahasa.

> 💡 **Analogi besar:** bayangin game-mu itu kampung. **Koordinat** = nomor kapling ("blok C-12"). **Minimap** = denah di gapura kampung. **Teleporter** = "Pintu Ke Mana Saja"-nya Doraemon, tapi harus dibangun dulu di dua ujung. Denah dan nomor kapling cuma *membaca* kampung; teleporter *mengubah* kampung (nambah bangunan). Makanya urutannya: baca dulu (N1–N3), baru bangun (N4–N5).

---

## 2. Analisis repo

### 2.1 Stack & arsitektur

**Stack:** Vite 8 + Phaser 4 (canvas game) + Monaco (editor kode di sidebar kanan) + `js-interpreter` (sandbox script drone) + Supabase/Upstash (cloud save). Kode game **JavaScript biasa** (`.js`); file `.tsx` cuma stub `App.tsx`/`main.tsx`.

```
index.html                 ← layout + CSS + markup semua popup DOM
                             #game-container > #rpg-chrome (overlay HUD, pointer-events:none)
src/main.js                ← bikin Phaser.Game, pasang installPixelViewport
src/config/constants.js    ← GRID 60×60, TILE_SIZE 32, ZONE_BOUNDS, GATES
src/systems/ZoneMap.js     ← getZoneAt / isFenceTile / isGateTile
src/scenes/GameScene.js    ← 1793 baris: create(), update(), input, interaksi, prompt, kamera
src/systems/GridManager.js ← state tiap petak, isWalkable, isBuildable, conveyor
src/systems/BuildingSystem.js ← kit → pasang/bongkar bangunan (crafting table, depot, mesin, conveyor)
src/systems/MachineSystem.js  ← mesin + RECIPES (termasuk crafting_table: 12 resep)
src/systems/WildlifeSystem.js ← fauna + peti kuno (Zona 5)
src/systems/SaveSystem.js  ← save lokal versi 2 (+ migrasi v1)
src/ui/PanelManager.js     ← 1 modal sekaligus, Esc, focus-trap, scene.isModalOpen
src/ui/HUD.js, Hotbar.js, MachineUI.js, StorageUI.js ...
src/rendering/PixelAssets.js ← SEMUA sprite & ikon digambar lewat kode (palet 12 warna)
tests/*.test.js            ← node --test, scene di-mock (lihat sprint7-building-mode.test.js)
```

### 2.2 Status fitur (update dari `UPGRADE_PLAN.md`)

Audit lama di `UPGRADE_PLAN.md` sudah usang: sekarang **Sprint 0–10 semuanya sudah ada** (commit `69644b9`) dan masing-masing punya test.

| Fitur | Status | File utama |
|---|---|---|
| Farming (cangkul, siram, tanam, panen) | ✅ | `GridManager`, `GrowthSystem`, `data/plants.js` |
| Drone + scripting JS | ✅ | `Drone`, `DroneAPI`, `ScriptSandbox`, `EditorBridge` |
| 5 zona + gerbang | ✅ | `constants.js` (`ZONE_BOUNDS`, `GATES`), `ZoneMap` |
| Ekonomi, pasar, special buyer, kontrak | ✅ | `EconomySystem`, `MarketUI`, `SpecialBuyerSystem`, `OperationsSystem` |
| Profil, XP, upgrade | ✅ | `ProfileSystem` |
| Inventory slot, sorting, DragManager, Storage Dock | ✅ | `SlotContainer`, `DragManager`, `StorageUI` |
| Mining (manual + drone) | ✅ | `GameScene._doMine`, `GridManager.setOre` |
| Crafting Table (kit bangunan + perkakas) | ✅ | `MachineSystem.RECIPES.crafting_table`, `MachineUI` |
| Building Mode (9 tipe bangunan) | ✅ | `BuildingSystem`, `data/buildings.js` |
| Conveyor, mesin placeable, multi-warehouse | ✅ | `GridManager.tickConveyorItems`, `BuildingSystem` |
| Explore zone, fauna, peti kuno | ✅ | `WildlifeSystem` |
| Tutorial RPG | ✅ | `TutorialSystem` |
| Save lokal v2 + cloud | ✅ | `SaveSystem`, `CloudSaveSystem` |
| **Koordinat live / minimap / teleporter** | ❌ 0% | cuma ada `window.__dev.tp()` buat debug |

### 2.3 Fakta di kode yang menentukan rancangan

| # | Fakta | Dampak ke rancangan |
|---|---|---|
| F1 | Grid 60×60, tile 32 px, koordinat integer. `Player.tileX/tileY`. `drone.getPosition()` mengembalikan `{x, y}` dengan sistem koordinat yang **sama**. | Koordinat di HUD = koordinat yang dipakai script drone. Bisa dicopy langsung ke kode. |
| F2 | `#rpg-chrome` = overlay DOM `pointer-events:none`; anak yang interaktif set `pointer-events:auto`. Pojok kiri-atas: `.game-hud`. Kanan-atas: `.world-actions` + `#build-toolbar`. Tengah-bawah: hotbar (Phaser) + `.world-help`. **Kiri-bawah: `.rpg-tutorial-box` (position:fixed, bottom:80px, left:16px).** | Kiri-bawah kosong, tapi tutorial box numpang di situ → harus digeser. |
| F3 | Aturan pixel-art ketat (`DESIGN_REVIEW.md` + `tests/pixel-assets.test.js`): palet 12 warna, maks 4 warna/frame, alpha cuma 0/255, integer scaling. | Sprite/ikon teleporter wajib patuh. Warna minimap juga kuambil dari palet yang sama. |
| F4 | `PanelManager`: satu modal sekaligus, Esc menutup, focus-trap, set `scene.isModalOpen`. `register(id)` butuh elemen DOM yang **sudah ada**; label aria hanya dikenal untuk 3 id. | Peta besar & UI teleporter = modal baru lewat `PanelManager`. Tambah label aria. |
| F5 | `BuildingSystem.getSaveState()` meng-spread `...building` (field tambahan ikut tersimpan), tapi `loadSaveState()` memanggil `placeFromKit(kitId, x, y, direction, {consume, id, persist})` tanpa meneruskan field lain. | Nama teleporter akan **hilang saat load** kecuali `placeFromKit` dikasih jalur `meta`. |
| F6 | Ore habis: `isOre=false`, `oreType='depleted'`, respawn 30 detik. | Minimap jangan baca `isOre` mentah (kedip tiap 30 dtk). Pakai `isOre \|\| oreType==='depleted'`. |
| F7 | Tombol terpakai: `SPACE E ESC Q B R X 1–8 WASD` + `Tab` (sidebar). **`M` bebas** (sudah kugrep). | `M` = buka peta. |
| F8 | Test pakai *mock scene* (lihat `sprint7-building-mode.test.js`). | Logika harus dipisah dari Phaser/DOM biar bisa dites: fungsi murni + kelas tanpa DOM. |
| F9 | `installPixelViewport` meng-emit event `'pixel-resize'` di `game.events`. | Peta besar dengar event ini buat hitung ulang skala. |

> 💡 **Fungsi murni** = penggiling padi: gabah masuk, beras keluar, nggak nyenggol apa-apa di dapur. Gampang dites karena input yang sama selalu hasil yang sama. Makanya `formatCoord`, `pickScale`, `findArrivalTile` dibikin murni.

### 2.4 Temuan & risiko (yang relevan buat 3 fitur ini)

| # | Temuan | Kenapa penting | Dibereskan di |
|---|---|---|---|
| T1 | `GameScene._getPlayerZone()` (~baris 1507) masih **hardcode** `if (px <= 19 && py <= 19)…`, nggak pakai `ZoneMap.getZoneAt`. Padahal `UPGRADE_PLAN` S0 mencentang "hubungkan ZoneMap". | Zona di HUD dan zona di minimap bisa beda jawaban. |  N1 |
| T2 | **Kuadran kanan-bawah (x 40–59, y 40–59):** `ZoneMap.getZoneAt` → `null`, tapi `isWalkable` **true** dan `isBuildable` **true** (kuverifikasi pakai script Node). `_getPlayerZone()` menyebutnya `zone4`. `_updateCameraBounds()` membatasi tinggi kamera 40 baris sampai zona 5 terbuka. | Pemain *mungkin* bisa jalan keluar area kamera (deduksi, belum dilihat di browser). Minimap harus memutuskan cara menggambarnya; teleporter harus menolak dipasang di sana. | N1 (keputusan, lihat Q1) |
| T3 | Nama zona **ganda & beda bahasa**: `PanelManager.updateHudZone` (Indonesia: "Kebun Perintis") vs `_showZoneBanner` (Inggris: "Zone 1: Starter Farm"). | Peta/HUD butuh satu sumber label. | N1 |
| T4 | Koordinat gerbang di-hardcode lagi di `SaveSystem.applySaveData` (`setGate(19,10…)`, `(10,19)`, `(39,20)`, `(20,39)`), padahal ada `GATES`. | Marker gerbang di peta harus baca dari `GATES`, jangan salin angka. | N1 (opsional) |
| T5 | `_doInteract()` & `_updateInteractionPrompts()` = rantai `if`, dan cek **pasar/gudang dulu**. | Teleporter yang dipasang di sebelah gudang bakal "kalah" dan malah buka gudang. Cek teleporter harus paling atas. | N5 |
| T6 | `BuildingSystem` punya rantai jenis bangunan (`conveyor` / `machineType` / `storage`) di **3 tempat**: `placeFromKit`, `dismantleBuilding`, `reset`. | Teleporter = tambah cabang di ketiganya. Lupa satu → bug "pad hantu" setelah bongkar/load. | N4 |
| T7 | `window.__dev.tp` pakai `setPosition(tx*32, ty*32)` (pojok petak, bukan tengah) dan nggak menyentuh kamera. API yang benar: `Player.setTilePosition(tx, ty)`. | Jangan dicontoh. Perbaiki 1 baris. | N1 |
| T8 | **Posisi pemain tidak disimpan** (selalu muncul di (5,5)). | Koordinat live tetap valid. Simpan posisi = nice-to-have. | N6 |
| T9 | `Player.tileX/tileY` diubah di **awal** tween jalan (`moveTo`), bukan di akhir. | Koordinat HUD "mendahului" sprite satu langkah, wajar. Tapi teleport wajib cek `isMoving`, kalau nggak tween lama menyeret pemain balik. | N5 |

### 2.5 Baseline test

`node --test` → **91 tes, 90 lulus, 1 gagal.** Yang gagal = `tests/script-runtime.test.js` dengan `ERR_MODULE_NOT_FOUND: js-interpreter`: itu cuma karena aku nggak `npm install` di sandbox, **bukan bug repo**. Di mesinmu jalankan `npm install` dulu, baru `npm test`; harusnya 91/91.

---

## 3. Keputusan desain

| # | Keputusan | Pilihan | Alasan | Alternatif yang ditolak |
|---|---|---|---|---|
| D1 | Cara gambar minimap | **`<canvas>` DOM 60×60**, 1 px = 1 petak, diskalakan CSS `image-rendering:pixelated` dengan skala integer | Cocok dengan HUD yang sudah DOM; murah (3.600 piksel); gampang kasih fog & legenda; patuh aturan "integer scaling" | Kamera Phaser kedua: menggambar ulang seluruh dunia + teks prompt, ikut kena `installPixelViewport`, susah kasih fog/legenda |
| D2 | Struktur gambar | **2 lapis**: lapis dasar (jarang berubah) + lapis dinamis (pemain, drone, marker) | Hemat: yang sering berubah cuma lapis atas | Gambar ulang semuanya tiap frame |
| D3 | "Expand" | **Modal besar** lewat `PanelManager`, dibuka klik thumbnail atau `M` | Konsisten dengan Tas/Gudang/Jurnal; ada ruang buat legenda, hover, dan mode travel; nggak tabrakan sama hotbar/tutorial/storage dock | Thumbnail membesar di tempat (rebutan ruang di kiri-bawah) |
| D4 | Fog of war | Zona yang belum terbuka digambar gelap; **gerbang tetap kelihatan** (kuning) | Pemain tahu *ke mana* harus menuju | Sembunyikan semua zona terkunci |
| D5 | Interaksi teleporter | **Bangunan solid 1×1** + `E` dari petak sebelahnya | Konsisten dengan crafting table/mesin (`isBuilding` = tak bisa diinjak); nggak ada risiko loop teleport bolak-balik; drone nggak salah jalur | Pad yang diinjak: harus ada logika "baru tiba jangan teleport lagi", ubah semantik `isWalkable` |
| D6 | Jaringan | **Bebas** (tiap pad ↔ pad lain), maks **8 pad** (asumsi) | Hub-and-spoke (HQ sebagai pusat) paling berguna | Berpasangan A↔B saja: boros kit, nggak fleksibel |
| D7 | Biaya | **Kit-nya yang jadi sink** (resep mahal) + cooldown 3 dtk; tanpa fee per pakai di v1 | Sederhana, adil; fee bisa ditambah nanti (`TELEPORT.FEE_PER_10_TILES`) | Fee koin tiap teleport |
| D8 | Save | Field `name` tambahan di `buildings[]`, **versi save tetap 2** | Pelajaran dari B3 di `UPGRADE_PLAN`: bump versi tanpa migrasi = save lama kebuang | Bump ke v3 |
| D9 | Sumber data bersama | **`NavigationSystem`** (tanpa DOM): posisi, zona, marker. HUD, peta, UI teleporter semua baca dari sini | Satu sumber kebenaran; gampang dites | Tiap UI ngorek `scene.*` sendiri-sendiri |

> 💡 **Analogi OHP (D2):** ingat OHP waktu sekolah? Peta digambar sekali di lembar dasar, lalu posisi "kamu di sini" ditaruh di lembar plastik transparan di atasnya. Yang diganti-ganti cuma plastiknya, lembar dasar nggak disentuh. Persis konsep dua lapis kita.
>
> **Analogi gapura (D5):** teleporter itu kayak gapura keraton: kamu berdiri di depannya, bilang mau ke mana, baru dipindahkan. Kamu nggak "menginjak" gapuranya.

---

## 4. Fitur A — Koordinat live (kiri-bawah)

### 4.1 Perilaku

- Chip kecil di **kiri-bawah**: `Z1 · X 05 · Y 12` (Z = nomor zona, `Z?` kalau di kuadran tanpa zona).
- Update **langsung** saat pemain pindah petak. Angka di-*zero-pad* 2 digit supaya lebarnya nggak goyang.
- Klik chip = **salin** `5, 12` ke clipboard + toast "Koordinat 5, 12 disalin". Ini nyambung ke `drone.getPosition()` di script (F1).
- Nama zona **tidak** diulang di chip karena sudah ada di HUD kiri-atas (`#workspace-zone`).
- Opsional (N2b): baris kedua kecil `→ 14, 7` = petak di bawah kursor mouse. Berguna buat nentuin koordinat target script.

```
┌───────────────────┐
│ Z1 · X 05 · Y 12  │  ← tombol, min-height 44px (aturan DESIGN_REVIEW)
└───────────────────┘
```

> 💡 **Kenapa 0-based?** Dunia di kode dimulai dari petak (0,0), sama seperti nomor kapling pertama. Kita tampilkan apa adanya (bukan +1) supaya angka di layar *persis* sama dengan angka di kode.

### 4.2 Aliran data

```
Player.tileX/tileY ──► NavigationSystem.tick() ──(kalau beda)──► emit 'position-changed'
   (GameScene.update)         bandingin 2 angka                        │
                                                                       ▼
                                                    NavigationHUD ubah textContent (kalau teksnya beda)
```

> 💡 **Polling vs kentongan:** `tick()` itu ronda keliling (cek tiap frame, murah karena cuma bandingin angka). Event `'position-changed'` itu kentongan: begitu ada yang berubah, semua yang butuh langsung "dengar". Ronda-nya satu, pendengarnya boleh banyak (HUD, peta, nanti UI lain).

### 4.3 Kode (kerangka)

`src/config/constants.js` — tambah:

```js
export const ZONE_LABELS = Object.freeze({
  zone1: 'Kebun Perintis',
  zone2: 'Bengkel Artisan',
  zone3: 'Lembah Tambang',
  zone4: 'Laboratorium',
  zone5: 'Hutan Liar Selatan',
});
export const UNKNOWN_ZONE_LABEL = 'Wilayah Tak Dikenal';
```

`src/systems/NavigationSystem.js` — **tanpa DOM**, jadi bisa dites:

```js
import UniversalEventEmitter from '../utils/EventEmitter.js';
import ZoneMap from './ZoneMap.js';
import { ZONE_LABELS, UNKNOWN_ZONE_LABEL } from '../config/constants.js';

export function formatCoord(n) {
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0');
}

/** Murni. Dipakai juga oleh BuildingSystem & TeleportSystem (nggak butuh instance NavigationSystem). */
export function isZoneRevealed(unlockedZones, zoneKey) {
  return zoneKey === 'zone1' || Boolean(unlockedZones?.[zoneKey]);
}

export default class NavigationSystem {
  constructor(scene) {
    this.scene = scene;
    this.events = new UniversalEventEmitter();
    this._pos = { x: -1, y: -1 };
    this._revealSig = '';
    // Relay: perubahan bangunan / peti = marker berubah.
    scene.buildingSystem?.events.on('changed', () => this.events.emit('markers-changed'));
    scene.wildlifeSystem?.events.on('cache-opened', () => this.events.emit('markers-changed'));
  }

  /** Dipanggil tiap frame dari GameScene.update(). Murah: cuma bandingin angka. */
  tick() {
    const p = this.scene.player;
    if (p && (p.tileX !== this._pos.x || p.tileY !== this._pos.y)) {
      this._pos = { x: p.tileX, y: p.tileY };
      this.events.emit('position-changed', this.getPlayerPosition());
    }
    // Zona terbuka? Cukup bandingin "tanda tangan" 4 bit; nggak perlu ubah kode gerbang.
    const sig = ['zone2', 'zone3', 'zone4', 'zone5']
      .map(k => (this.scene.unlockedZones?.[k] ? 1 : 0)).join('');
    if (sig !== this._revealSig) {
      this._revealSig = sig;
      this.events.emit('reveal-changed');
    }
  }

  getPlayerPosition() {
    const { x, y } = this._pos;
    const zoneKey = ZoneMap.getZoneAt(x, y); // null di kuadran kanan-bawah
    return { x, y, zoneKey, zoneLabel: ZONE_LABELS[zoneKey] ?? UNKNOWN_ZONE_LABEL };
  }

  isRevealed(zoneKey) {
    return isZoneRevealed(this.scene.unlockedZones, zoneKey);
  }

  /** Daftar marker untuk peta & UI. Lihat 5.3 untuk bentuknya. */
  getMarkers() { /* ... */ }
}
```

Pasang di `GameScene.create()` **setelah** `this.hud` dibuat (biar `buildingSystem` & `wildlifeSystem` sudah ada), dan di `update()` taruh `this.navigationSystem?.tick();` dekat `this.hud.update()`.

### 4.4 Markup & CSS

Di `index.html`, di dalam `#rpg-chrome`:

```html
<div id="nav-cluster" class="nav-cluster">
  <!-- thumbnail minimap masuk di sini (Sprint N3) -->
  <button id="nav-coords" class="nav-coords" type="button" title="Klik untuk menyalin koordinat">
    <span class="nav-z">Z1</span>
    <span class="nav-sep">·</span><b>X</b> <span id="nav-x">05</span>
    <span class="nav-sep">·</span><b>Y</b> <span id="nav-y">05</span>
  </button>
</div>
```

> ⚠️ **Jangan pakai `<output>` atau `aria-live`** buat angkanya. Angka berubah tiap langkah; pembaca layar bakal nge-spam. Cukup `aria-label` statis di tombol.

`src/ui/workspace.css` (gaya mengikuti `.game-hud`: siku, border 2px, bayangan offset):

```css
.nav-cluster{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:6px;pointer-events:auto;z-index:31}
.nav-coords{min-height:44px;padding:8px 12px;background:#101a21;border:2px solid #42535b;color:#edf0d4;
  box-shadow:2px 2px 0 #101a21;border-radius:0;font:12px 'JetBrains Mono',monospace;cursor:pointer;text-align:left}
.nav-coords:hover,.nav-coords:focus-visible{border-color:#63d8d1;color:#63d8d1}
.nav-coords b{color:#a4b18b;font-weight:400}.nav-sep{color:#42535b;margin:0 4px}

/* Tutorial box sekarang nongkrong di kiri-bawah → naikkan sesuai tinggi cluster */
.rpg-tutorial-box{bottom:calc(80px + var(--nav-h,0px))}
```

`NavigationHUD` mengukur tinggi `#nav-cluster` (pakai `ResizeObserver`) lalu `document.documentElement.style.setProperty('--nav-h', h + 'px')`.

### 4.5 Aturan layout (pakai breakpoint yang sudah ada)

| Kondisi | Perilaku |
|---|---|
| Container ≥ 700px | Cluster di `left:12px; bottom:12px`. |
| Container ≤ 700px (`@container`) | Hotbar 8 kolom selebar ±384px bisa menabrak. Naikkan cluster ke `bottom:64px`; geser `.world-help` ke atas (`bottom:130px`). |
| Container ≤ 383px (hotbar 2 baris) | `bottom:112px`, sama seperti aturan `.world-help` yang sudah ada. |
| Tinggi layar ≤ 520px (`@media`) | Sembunyikan thumbnail (N3), sisakan chip koordinat. |

### 4.6 DoD (Sprint N2)

- Angka berubah di frame yang sama dengan langkah pemain; nggak ada update DOM kalau angka tidak berubah.
- Chip nggak menutupi hotbar/tutorial/toast di lebar 320, 390, 768, 1024, 1440 (lebar yang sama dengan pemeriksaan di `DESIGN_REVIEW.md`).
- Klik menyalin `x, y`; gagal clipboard (non-secure context) → toast "Gagal menyalin", tidak error.
- Listener & `ResizeObserver` dibersihkan saat `scene.events 'shutdown'`.

---

## 5. Fitur B — Minimap + expand

### 5.1 Dua keadaan

| | **Compact** (selalu tampil) | **Expanded** (modal besar) |
|---|---|---|
| Ukuran | canvas 60×60 → **120×120 px** (2 px/petak) | 60 petak × **N px** (N = 4–10, dihitung `pickScale`) |
| Dibuka | — | klik thumbnail, atau tekan **`M`** |
| Ditutup | — | `Esc` (diurus `PanelManager`), `M`, tombol ✕ |
| Isi | dunia penuh, pemain, drone, teleporter, kotak viewport kamera | + legenda, nama zona, hover `(x, y) · zona · objek`, klik = salin koordinat |

Dunia cuma 60×60 jadi **peta dunia penuh, tetap** (bukan radar yang ngikutin pemain). Lebih simpel dan lebih berguna buat game yang suka ngatur banyak bangunan.

### 5.2 Warna (semua dari palet 12 warna — asumsi, sesuaikan)

| Elemen | Warna | Hex |
|---|---|---|
| Fog (zona terkunci / tanpa zona) | ink | `#101a21` |
| Tanah zona terbuka | forest | `#244c3a` |
| Pagar | earth | `#9b794e` |
| Gerbang terkunci / terbuka | amber / sand | `#e9bf62` / `#e3ba83` |
| Ore (termasuk yang sedang habis) | silver | `#93a7a1` |
| Bangunan (HQ, pasar, depot, mesin, meja kerja) | sand | `#e3ba83` |
| Conveyor | steel | `#42535b` |
| **Teleporter** | cyan | `#63d8d1` |
| Peti kuno (belum dibuka) | sage | `#a4b18b` |
| Drone | amber | `#e9bf62` |
| **Pemain** | cream (kedip 500 ms; reduced-motion = tidak kedip) | `#edf0d4` |
| Kotak viewport kamera | silver | `#93a7a1` |

### 5.3 Marker

`NavigationSystem.getMarkers()` mengembalikan array seragam:

```js
// { kind, id, x, y, w, h, label }
// kind: 'player' | 'drone' | 'hq' | 'market' | 'depot' | 'teleporter' | 'cache' | 'gate'
```

Sumber datanya (semua sudah ada di kode):

| kind | Sumber |
|---|---|
| `player` | `scene.player.tileX/tileY` |
| `drone` | `scene.deviceManager.getAll()` → `drone.tileX/tileY` |
| `hq` | `scene.warehouse` (`tileX, tileY, tileW, tileH`) |
| `market` | `scene.marketZone` (`{x:17, y:1, w:3, h:2}`) |
| `depot`, `teleporter` | `scene.buildingSystem.buildings` (filter `type`) |
| `cache` | `scene.wildlifeSystem.caches` (yang `!opened`, hanya kalau zona 5 terbuka) |
| `gate` | dari konstanta `GATES` + `tile.isLocked` di `gridManager` |

> HQ dan pasar **digambar dari marker**, bukan dari flag `tile.isBuilding`, karena HQ dibuat langsung (`new Warehouse(...)`) tanpa lewat `BuildingSystem`.

### 5.4 Render (2 lapis)

`src/ui/MapRenderer.js` — fungsi gambar, tanpa state global:

```js
import ZoneMap from '../systems/ZoneMap.js';
import { GRID_COLS, GRID_ROWS } from '../config/constants.js';

export const MAP_COLORS = Object.freeze({
  fog: '#101a21', ground: '#244c3a', fence: '#9b794e',
  gateLocked: '#e9bf62', gateOpen: '#e3ba83', ore: '#93a7a1',
  building: '#e3ba83', conveyor: '#42535b', teleporter: '#63d8d1',
  cache: '#a4b18b', drone: '#e9bf62', player: '#edf0d4', view: '#93a7a1',
});

/** Skala integer terbesar yang muat. Murni → gampang dites. */
export function pickScale(availW, availH, { min = 4, max = 10 } = {}) {
  return Math.max(min, Math.min(max, Math.floor(Math.min(availW, availH) / GRID_COLS)));
}

/** LAPIS DASAR: 1 px = 1 petak. Digambar ulang HANYA kalau bangunan/zona berubah. */
export function drawTerrain(ctx, nav, grid) {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const revealed = nav.isRevealed(ZoneMap.getZoneAt(x, y)); // null → false → fog
      const tile = grid.getTile(x, y);
      let color = revealed ? MAP_COLORS.ground : MAP_COLORS.fog;
      if (ZoneMap.isFenceTile(x, y)) color = MAP_COLORS.fence;
      else if (revealed && (tile.isOre || tile.oreType === 'depleted')) color = MAP_COLORS.ore; // F6
      else if (revealed && tile.isConveyor) color = MAP_COLORS.conveyor;
      else if (revealed && (tile.isBuilding || tile.isMachine)) color = MAP_COLORS.building;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // gerbang: baca dari GATES (T4), selalu kelihatan walau zona masih fog.
}

/** LAPIS DINAMIS: salin lapis dasar, lalu tempel marker + kotak kamera. */
export function drawView(ctx, terrainCanvas, markers, { scale, cameraRect, blinkOn }) { /* ... */ }
```

Jadwal gambar:

| Kejadian | Aksi |
|---|---|
| Awal game, setelah `loadLocalSave()`, `'markers-changed'`, `'reveal-changed'` | `drawTerrain` (lapis dasar) lalu `drawView` |
| `'position-changed'` | `drawView` |
| Timer 250 ms (`scene.time.addEvent`, loop) | `drawView` (buat drone bergerak, kedip pemain, kotak kamera) |
| Thumbnail tersembunyi / `document.hidden` / popup tertutup | **lewati** semua gambar |

> 💡 **Dirty flag = papan tulis kelas.** Guru nggak menghapus dan menulis ulang seluruh papan tiap menit; dia cuma menghapus bagian yang berubah. Lapis dasar baru "dihapus" kalau memang ada bangunan baru atau gerbang terbuka.

Kotak viewport: `scene.cameras.main.worldView` (x, y, width, height dalam piksel dunia) dibagi `TILE_SIZE`, dikali `scale`.

### 5.5 Peta besar (modal)

1. Tambah `<section id="map-popup">` di `index.html` (salin struktur `#backpack-popup`), isi: judul, tombol `data-close-panel`, `<canvas id="map-canvas">`, panel legenda, baris readout `#map-readout`, tombol "Salin posisiku".
2. `this.panelManager.register('map-popup')` di `GameScene.create()`. **Tambahkan** `'map-popup': 'Peta dunia'` ke peta label di `PanelManager.register` (F4), kalau nggak, aria-label-nya jatuh ke "Menu".
3. Tombol `M`: di `GameScene._setupInput()` tambah `keydown-M` dengan guard `_isDOMInputFocused()` (pola yang sama dengan `B`/`R`/`X`). Karena modal terbuka mengunci input game (`isModalOpen`), **penutupan dengan `M`** dipasang sebagai listener `keydown` di elemen popup itu sendiri.
4. Lebar canvas: `pickScale(popupW - 48, popupH - 160)`; hitung ulang saat `game.events 'pixel-resize'` (F9).
5. Hover: `pointermove` → `tileX = floor(offsetX / scale)` → tampilkan `(x, y) · nama zona · objek` (cari di marker). Klik → salin `x, y` (pakai helper yang sama dengan chip).
6. Kuadran tanpa zona (T2): readout menulis "Wilayah Tak Dikenal".

### 5.6 DoD (Sprint N3)

- Thumbnail 120×120 tajam (tanpa blur) di zoom 1× dan 2×; **hanya warna dari palet** (ada test, lihat bagian 8).
- Gerbang tampil kuning dan berubah jadi sand setelah dibuka; zona yang baru dibuka langsung "terang" tanpa reload.
- `M` buka/tutup; `Esc` tutup; fokus kembali ke pembuka; WASD tidak menggerakkan pemain saat peta terbuka.
- Nggak ada gambar ulang saat peta tersembunyi (cek lewat counter di test).
- Pemain + drone tampak bergerak; ore yang habis tidak bikin peta "kedip".

---

## 6. Fitur C — Teleporter (bisa di-craft & ditempatin)

### 6.1 Alur main (dari sisi pemain)

```
Tambang & lebur bahan ──► Crafting Table: "Assemble Teleporter Kit" ──► kit masuk Tas
        │
        ▼
tekan B (Build Mode) ► pilih "Teleporter ×1" ► klik petak kosong ► pad terpasang (otomatis bernama TP-1)
        │
        ▼  (pasang minimal 2 pad di lokasi berbeda)
hadap pad + tekan E ► modal "Teleporter TP-1": daftar tujuan ► klik "Teleport" ► layar memudar ► muncul di sebelah TP-2
```

> 💡 **Analogi wayang:** dalang memindahkan adegan dari Astina ke Amarta tanpa wayangnya jalan kaki. Teleporter itu "dalang"-nya pemain. Tapi di game ini dalangnya harus *bangun panggung di dua tempat dulu*. Makanya satu pad sendirian tidak berguna dan kita kasih hint di toast.

### 6.2 Data & resep

**`src/data/items.js`** — item baru:

```js
teleporter_kit: {
  id: 'teleporter_kit',
  name: 'Teleporter Kit',
  emoji: '',
  desc: 'Pad teleport. Pasang minimal dua untuk berpindah cepat antar lokasi.',
  rarity: 'Rare',
  category: 'Bangunan',
  sector: 'Bangunan',
  stackMax: 99,
  stackMaxWarehouse: 999,
},
```

**`src/data/buildings.js`** — tipe bangunan baru (otomatis masuk `BUILDING_KITS`, jadi tombol di Build Toolbar muncul sendiri):

```js
teleporter: {
  kitId: 'teleporter_kit',
  label: 'Teleporter',
  width: 1,
  height: 1,
  teleporter: true,
  description: 'Pad teleport. Terhubung ke teleporter lain di zona yang sudah terbuka.',
},
```

**`src/systems/MachineSystem.js`** — satu entri di `RECIPES.crafting_table` (kategori `Bangunan`, otomatis muncul di filter `MachineUI`):

```js
{
  id: 'teleporter_kit',
  inputs: { iron_ingot: 8, gold_ingot: 3, chip: 2 },   // asumsi — sesuaikan playtest
  output: { id: 'teleporter_kit', count: 1 },
  timeMs: 15000,
  name: 'Assemble Teleporter Kit',
  category: 'Bangunan',
  description: 'Pad teleport untuk berpindah cepat antar-teleporter.',
},
```

**Kenapa bahan itu?** Sesuai prinsip "resep harus gabungin sumber yang berbeda": besi (tambang + smelter), emas (tambang paling keras, durability 12 + smelter), dan `chip` (Assembler: `2 wire + 1 gold_ingot`). Jadi pemain wajib sudah punya rantai **tambang → smelter → assembler** jalan.

| Varian | Resep | Biaya mentah per kit* | Cocok kalau |
|---|---|---|---|
| Ringan | 6 iron + 2 gold + 1 chip | 6 besi, 3 emas, 2 wire | Mau teleporter terasa "murah" dan sering dibongkar-pasang |
| **Normal (default)** | **8 iron + 3 gold + 2 chip** | **8 besi, 5 emas, 4 wire** | Mid-game: dibuka setelah rantai Assembler jalan |
| Berat | 12 iron + 5 gold + 4 chip | 12 besi, 9 emas, 8 wire | Teleporter mau jadi hadiah endgame |

\* emas = `gold_ingot` (1 ingot = 2 `gold_ore` + 1 `coal` di Smelter), termasuk emas di dalam chip. Satu *pasangan* varian Normal ≈ 10 emas batangan ≈ **20 gold ore + 10 coal**.

Ini **sink** buat besi/emas/chip, dan satu-satunya sumber teleporter. Membongkar pad mengembalikan kit utuh (sama seperti bangunan lain), jadi memindahkan jaringan itu gratis.

**Konstanta** (`src/config/constants.js`):

```js
export const TELEPORT = Object.freeze({
  MAX_PADS: 8,           // asumsi — batas jaringan
  COOLDOWN_MS: 3000,     // asumsi — jeda setelah tiba
  FEE_PER_10_TILES: 0,   // asumsi — 0 = gratis; naikkan kalau mau jadi coin sink
});
```

### 6.3 Aturan penempatan (`BuildingSystem`)

`canPlace()` sekarang cuma return boolean, sehingga pesan error selalu "Bangunan tidak dapat dipasang di petak itu." Ubah jadi **`explainPlacement()`** yang mengembalikan alasan; `canPlace()` tetap ada (membungkusnya) biar test lama aman.

```js
explainPlacement(type, x, y, { restoring = false } = {}) {
  const definition = BUILDING_DEFINITIONS[type];
  if (!definition) return { ok: false, reason: 'unknown_type' };

  // ...cek footprint & pemain di atas petak: persis isi canPlace() sekarang...

  if (definition.teleporter && !restoring) {
    const zone = ZoneMap.getZoneAt(x, y);
    if (!zone || !isZoneRevealed(this.scene.unlockedZones, zone)) return { ok: false, reason: 'zone_unavailable' };
    if (this.scene.teleportSystem.getPads().length >= TELEPORT.MAX_PADS) return { ok: false, reason: 'limit' };
    if (!findArrivalTile({ x, y }, this.scene.teleportSystem.isFree)) return { ok: false, reason: 'no_arrival' };
  }
  return { ok: true };
}
canPlace(type, x, y, opts) { return this.explainPlacement(type, x, y, opts).ok; }
```

| `reason` | Pesan toast (asumsi) |
|---|---|
| `zone_unavailable` | "Teleporter hanya bisa dipasang di zona yang sudah terbuka." |
| `limit` | "Batas teleporter tercapai (8). Bongkar satu dulu." |
| `no_arrival` | "Harus ada petak kosong di sebelah teleporter buat tempat tiba." |

> ⚠️ **`restoring`** (dipakai saat `placeFromKit(..., { consume:false })` dari `loadSaveState`): aturan **limit & arrival-tile jangan dicek saat load**. Kalau dicek, urutan load bangunan bisa bikin pad yang valid ditolak (tetangganya baru ke-load belakangan) dan pad-nya *hilang dari save*. Cukup validasi footprint.

### 6.4 Integrasi `BuildingSystem` (3 tempat: T6)

Tambah `this.pads = new Map()` di constructor (seperti `this.depots`). Lalu cabang baru di **tiga** fungsi:

```js
// 1) placeFromKit — meta untuk nama. Signature jadi:
placeFromKit(kitId, x, y, direction = 'right', { consume = true, id = null, persist = true, meta = null } = {}) {
  // ...kode lama...
  } else if (definition.teleporter) {
    this.scene.gridManager.setBuilding(x, y, buildingId, type);          // solid, seperti depot
    const wanted = meta?.name;
    const taken = this.scene.teleportSystem.getPads().some(p => p.id !== buildingId && p.name === wanted);
    building.name = (wanted && !taken) ? wanted : this.scene.teleportSystem.nextName();
    this.pads.set(buildingId, new Teleporter(this.scene, x, y, building.name));
    if (consume) this.scene.hud?.showMessage('Teleporter terpasang. Pasang satu lagi di lokasi lain untuk berpindah.', 3600);
  }
}

// 2) dismantleBuilding
} else if (definition.teleporter) {
  this.scene.teleporterUI?.closeIfOpenFor(building.id);
  this.pads.get(building.id)?.destroy();
  this.pads.delete(building.id);
  this.scene.gridManager.setBuilding(building.x, building.y, null, null);
  this.scene.updateTileSprite(building.x, building.y);
}

// 3) reset — cabang yang sama (destroy semua pad + clear this.pads)
```

`loadSaveState()` (T7/F5) — teruskan nama:

```js
const success = this.placeFromKit(definition.kitId, building.x, building.y, building.direction,
  { consume: false, id: building.id, persist: false, meta: { name: building.name } });
```

`getSaveState()` **tidak perlu diubah**: dia sudah men-spread `...building`, jadi `name` ikut tersimpan. Versi save tetap **2**; save lama tanpa teleporter tetap terbaca (D8).

Di `GameScene.create()`, bikin `this.teleportSystem = new TeleportSystem(this)` **tepat setelah** `this.buildingSystem = new BuildingSystem(this)` (karena `placeFromKit` saat load memanggil `nextName()`).

### 6.5 `TeleportSystem` (aturan jaringan & perjalanan)

`src/systems/TeleportSystem.js`:

```js
import UniversalEventEmitter from '../utils/EventEmitter.js';
import ZoneMap from './ZoneMap.js';
import { isZoneRevealed } from './NavigationSystem.js';
import { TELEPORT } from '../config/constants.js';

export const NAME_PATTERN = /^[A-Za-z0-9 _-]{1,16}$/;

/** MURNI. isFree(x, y) → boolean. Urutan: bawah, kanan, kiri, atas, lalu cincin 2 petak. */
export function findArrivalTile(pad, isFree) {
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    if (isFree(pad.x + dx, pad.y + dy)) return { x: pad.x + dx, y: pad.y + dy };
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
    if (isFree(pad.x + dx, pad.y + dy)) return { x: pad.x + dx, y: pad.y + dy };
  }
  return null; // (fallback cincin-2 bisa mendarat di petak terkurung; cukup untuk v1)
}

export default class TeleportSystem {
  constructor(scene) {
    this.scene = scene;
    this.events = new UniversalEventEmitter();
    this.lastTravelAt = -Infinity;
    this.traveling = false;
    // arrow function supaya `this` aman saat dioper sebagai callback
    this.isFree = (x, y) => scene.gridManager.isWalkable(x, y) && !scene.wildlifeSystem?.getAnimalAt(x, y);
  }

  getPads() { return [...this.scene.buildingSystem.buildings.values()].filter(b => b.type === 'teleporter'); }

  nextName() {
    const used = new Set(this.getPads().map(p => p.name));
    for (let n = 1; ; n++) if (!used.has(`TP-${n}`)) return `TP-${n}`;
  }

  getDestinations(fromId) {
    const from = this.scene.buildingSystem.buildings.get(fromId);
    return this.getPads().filter(p => p.id !== fromId).map(p => {
      const zoneKey = ZoneMap.getZoneAt(p.x, p.y);
      return { ...p, zoneKey, distance: Math.abs(p.x - from.x) + Math.abs(p.y - from.y),
               reachable: isZoneRevealed(this.scene.unlockedZones, zoneKey) };
    });
  }

  /** Alasan penolakan: 'missing' | 'moving' | 'cooldown' | 'zone_locked' | 'blocked' */
  canTravel(fromId, toId) {
    const s = this.scene, b = s.buildingSystem.buildings;
    const from = b.get(fromId), to = b.get(toId);
    if (!from || !to || from.id === to.id) return { ok: false, reason: 'missing' };
    if (this.traveling || s.player.isMoving) return { ok: false, reason: 'moving' };
    if (s.time.now - this.lastTravelAt < TELEPORT.COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
    if (!isZoneRevealed(s.unlockedZones, ZoneMap.getZoneAt(to.x, to.y))) return { ok: false, reason: 'zone_locked' };
    const arrival = findArrivalTile(to, this.isFree);
    if (!arrival) return { ok: false, reason: 'blocked' };
    return { ok: true, arrival, from, to };
  }

  travel(fromId, toId) {
    const check = this.canTravel(fromId, toId);
    if (!check.ok) return check;
    const s = this.scene, cam = s.cameras.main, { arrival, from, to } = check;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.traveling = true;
    s.player.isMoving = true;            // Player.update() berhenti kalau isMoving → kunci input jalan (T9)
    s.tweens.killTweensOf(s.player);     // jaga-jaga: tween jalan lama jangan menyeret pemain balik

    const jump = () => {
      try {
        s.player.setTilePosition(arrival.x, arrival.y);          // API yang benar (T7)
        cam.stopFollow(); cam.centerOn(s.player.x, s.player.y);  // supaya kamera nggak "meluncur" 50 petak
        cam.startFollow(s.player, true, 0.1, 0.1);               // lerp sama seperti create()
        if (!reduce) { s._emitPixelParticles?.(arrival.x, arrival.y, 0x63d8d1, 12); cam.fadeIn(150); }
        this.lastTravelAt = s.time.now;
        this.events.emit('traveled', { from, to });
      } finally {
        s.player.isMoving = false;
        this.traveling = false;
      }
    };

    if (reduce) jump();
    else {
      s._emitPixelParticles?.(from.x, from.y, 0x63d8d1, 12);
      cam.fadeOut(120);
      s.time.delayedCall(130, jump);     // pakai delayedCall, bukan nama event fade (lebih tahan beda versi Phaser)
    }
    return { ok: true };
  }

  rename(id, name) { /* validasi NAME_PATTERN + unik (case-insensitive) → set building.name & pad.name → saveLocal */ }
}
```

> 💡 **Kenapa `try/finally`?** Kita "mengunci" pemain (`isMoving = true`) selama layar memudar. Kalau ada error di tengah jalan dan kunci itu nggak dilepas, pemain **nyangkut selamanya**. `finally` = petugas yang pasti mengunci-balik pintu, apa pun yang terjadi.

> 💡 **Kenapa `setTilePosition`, bukan `__dev.tp`?** `__dev.tp` menaruh sprite di *pojok* petak (tanpa `+16`), jadi pemain tampak geser setengah petak dan kamera nggak ikut. `setTilePosition` sudah menaruh di *tengah* petak.

### 6.6 Sprite, ikon, dan interaksi

**Ikon kit** (`PixelAssets.js`): `ICON_IDS` itu *urutan = nomor ikon*, jadi tambahkan `'teleporter_kit'` **di akhir** (setelah `'pickaxe'`). Fungsi `icon(id)` memilih gambar lewat regex `substring`, jadi taruh cabang baru **sebelum** cabang umum dan pastikan namanya nggak nyasar ke regex lain (cek: `teleporter_kit` aman terhadap `/ore|coal|stone…/`, `/chip/`, `/gear|wire/`).

```js
if (/juice|jam|watering|chip|phone|speed|teleporter/.test(id)) { base = P.cyan; highlight = P.silver; detail = P.steel; }
// ...
else if (id === 'teleporter_kit') { b.box(3, 10, 10, 4, detail); b.box(4, 2, 8, 9, base); b.rect(6, 4, 4, 5, P.ink); b.rect(7, 6, 2, 2, highlight); }
```

**Sprite pad 32×32, 2 frame** (idle & berkedip). Aturan wajib (ditegakkan `pixel-assets.test.js`): maks 4 warna per frame dari palet, alpha 0/255, koordinat integer.

```js
function teleporterPad(frame = 0) {
  const b = new PixelBitmap(32, 32);
  const ring = frame ? P.cream : P.cyan, core = frame ? P.cyan : P.cream; // frame 1 = tukar warna → efek berkedip
  b.rect(4, 24, 24, 5, P.ink);       // bayangan alas
  b.rect(3, 18, 26, 8, P.ink);       // outline pelat
  b.rect(4, 19, 24, 6, P.panel);     // pelat
  b.rect(9, 6, 14, 14, P.ink);       // outline bingkai portal
  b.rect(10, 7, 12, 12, ring);       // cincin
  b.rect(12, 9, 8, 8, P.ink);        // lubang
  b.rect(14, 11, 4, 4, core);        // inti
  return b;                          // warna: ink, panel, cyan, cream = 4 ✓
}
// di buildPixelAssets(), dekat sheet('eli_npc'...):
sheet('building_teleporter', [teleporterPad(0), teleporterPad(1)]);
```

Ini cuma *titik awal*; silakan dipercantik selama test tetap hijau.

**Entity** `src/entities/Teleporter.js` (mirip `Warehouse.js`: punya sprite sendiri, bukan lewat `_updateTileSprite`):

```js
import { TILE_SIZE } from '../config/constants.js';

export default class Teleporter {
  constructor(scene, tx, ty, name) {
    this.scene = scene; this.tileX = tx; this.tileY = ty; this.name = name;
    this.sprite = scene.add.image(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, 'building_teleporter', 0).setDepth(5);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let on = false;
    this.timer = reduce ? null : scene.time.addEvent({
      delay: 600, loop: true,
      callback: () => { on = !on; this.sprite.setFrame(on ? 1 : 0); }, // boolean, bukan baca frame.name
    });
  }
  destroy() { this.timer?.remove(); this.sprite.destroy(); }
}
```

**Interaksi** (`GameScene.js`) — cek pad ditaruh **paling atas** supaya nggak "kalah" sama gudang/pasar (T5):

```js
_getFacingPad() {
  const f = this.player.getFacingTile();
  const t = this.gridManager.getTile(f.x, f.y);
  return t?.isBuilding && t.buildingType === 'teleporter' ? this.buildingSystem.buildings.get(t.buildingId) : null;
}

// _doInteract(): tepat setelah `const py = this.player.tileY;`
const pad = this._getFacingPad();
if (pad) { this.teleporterUI.open(pad.id); return; }

// _updateInteractionPrompts(): tepat setelah `if (!this.player) return;`
const facingPad = this._getFacingPad();
if (facingPad) {
  this._showPromptAt(facingPad.x * TILE_SIZE + TILE_SIZE / 2, facingPad.y * TILE_SIZE - 12, `[E] Teleport (${facingPad.name})`);
  return;
}
```

### 6.7 UI modal teleporter

`#teleporter-popup` (salin struktur popup lain) + `src/ui/TeleporterUI.js`, didaftarkan lewat `panelManager.register('teleporter-popup')` (tambahkan label `'teleporter-popup': 'Teleporter'` ke peta label `PanelManager`).

```
┌ Teleporter ───────────────────────────── ✕ ┐
│ Nama:  [ TP-1        ]  (maks 16 huruf)     │
│                                             │
│ Tujuan                                      │
│ ▸ TP-2   Lembah Tambang   (12, 28)  ±34 petak  [Teleport]
│ ▸ TP-3   Hutan Liar Selatan (20, 47) ±50 petak [Teleport]
│ ▸ TP-4   Laboratorium     (45, 10)  ✕ terkunci │
│                                             │
│ Cooldown 3 dtk · Bongkar: tekan B lalu X    │
└─────────────────────────────────────────────┘
```

- Daftar dari `teleportSystem.getDestinations(padId)`; baris `reachable:false` dinonaktifkan.
- Klik "Teleport" → `travel()`. Kalau `ok` → tutup modal. Kalau tidak → toast sesuai `reason`:

| `reason` | Toast |
|---|---|
| `cooldown` | "Teleporter masih mengisi daya." |
| `moving` | "Berhenti dulu sebelum teleport." |
| `zone_locked` | "Zona tujuan belum terbuka." |
| `blocked` | "Area tujuan terhalang. Kosongkan petak di sekitar teleporter tujuan." |
| `missing` | "Teleporter tujuan tidak ditemukan." |

- Kosong (hanya 1 pad): "Belum ada teleporter lain. Pasang minimal dua untuk bisa berpindah."
- Input nama: `maxlength=16`, divalidasi `NAME_PATTERN`, unik (case-insensitive). Karena fokus di `<input>`, `_isDOMInputFocused()` otomatis mencegah tombol game bocor.

### 6.8 Hal yang sengaja **tidak** masuk v1

- Drone **tidak** memakai teleporter (butuh API script baru). Pad itu solid, jadi drone menganggapnya rintangan seperti meja kerja. Saran: jangan pasang di jalur drone yang sibuk.
- Tidak ada fee per teleport (konstanta sudah disiapkan).
- Tidak ada teleport dari peta jarak jauh (lihat N5b: mode travel di peta, dan N6).

### 6.9 DoD gabungan (N4 + N5)

- Resep muncul di Crafting Table (kategori Bangunan), kit masuk Tas, tombol "Teleporter ×N" muncul di Build Toolbar.
- Pasang di zona terbuka OK; di zona terkunci / kuadran tanpa zona / tanpa petak kosong di sekitar / pad ke-9 → ditolak **dengan pesan yang jelas**.
- Bongkar mengembalikan kit; modal yang terbuka untuk pad itu menutup sendiri; tidak ada sprite/timer yang tersisa.
- Reload: semua pad kembali **dengan nama yang sama**; save lama (tanpa pad) tetap termuat.
- Teleport: layar memudar → muncul di petak sebelah tujuan, menghadap bawah; kamera **tidak** meluncur; banner zona muncul bila zona berbeda; cooldown 3 dtk bekerja; menekan WASD saat memudar tidak membuat pemain nyangkut atau terseret balik.
- `prefers-reduced-motion`: tanpa fade/partikel/kedip, perpindahan tetap instan dan benar.

---

## 7. Urutan, sprint, dan prompt siap tempel

```
N1 Fondasi ─┬─ N2 Koordinat live
            ├─ N3 Minimap + expand ─────────────┐
            └─ N4 Teleporter: data/resep/pasang ─ N5 Travel + UI ─ N5b Mode travel di peta (butuh N3)
                                                                     └─ N6 Stretch
```

| Sprint | Nama | Estimasi* | Milestone |
|---|---|---|---|
| N1 | Fondasi navigasi (label zona, `NavigationSystem`, bersih-bersih) | 0,5–1 hari | M1 |
| N2 | Koordinat live kiri-bawah | 0,5–1 hari | M1 |
| N3 | Minimap + peta besar (expand) | 2–3 hari | M2 |
| N4 | Teleporter: item, resep, pasang/bongkar, save | 2–3 hari | M3 |
| N5 | Teleporter: perjalanan + UI modal (+ N5b mode travel di peta) | 2–3 hari | M3 |
| N6 | Stretch | bebas | — |

\*asumsi — dari ukuran file dan pola yang sudah ada, bukan dari pengukuran.

---

### SPRINT N1 — Fondasi navigasi

Tujuan: satu sumber kebenaran untuk posisi, zona, dan label, sebelum ada UI yang menggantungkan diri padanya.

- [ ] `ZONE_LABELS`, `UNKNOWN_ZONE_LABEL` di `constants.js` (4.3).
- [ ] `PanelManager.updateHudZone` dan `GameScene._showZoneBanner` baca `ZONE_LABELS` (T3). **Grep test/tutorial yang bergantung ke string lama** ("Starter Farm", dst) sebelum mengganti.
- [ ] `GameScene._getPlayerZone()` → `ZoneMap.getZoneAt(...)` (T1). **Grep semua pemakai** dan pastikan hasil `null` aman.
- [ ] `NavigationSystem.js`: `formatCoord`, `isZoneRevealed`, `tick`, `getPlayerPosition`, `isRevealed`, `getMarkers` (5.3) — tanpa DOM.
- [ ] Pasang di `GameScene.create()` (setelah `this.hud`) dan `update()`.
- [ ] Perbaiki `window.__dev.tp` → `player.setTilePosition` + `centerOn` kamera (T7).
- [ ] (Opsional) `SaveSystem.applySaveData`: ganti koordinat gerbang hardcode dengan `GATES` (T4).
- [ ] **Keputusan Q1** (kuadran tanpa zona). Default: dibiarkan, dilabeli "Wilayah Tak Dikenal".
- [ ] Test `tests/nav1-navigation-system.test.js`.

**DoD:** `npm test` hijau; HUD zona dan banner konsisten berbahasa Indonesia; di kuadran tanpa zona HUD menulis "Wilayah Tak Dikenal" (bukan "Laboratorium").

**Prompt:**
```
Baca docs/NAVIGATION_PLAN.md bagian 2.3, 2.4, 3, 4.3, 5.3. Kerjakan HANYA Sprint N1.
1) Tambah ZONE_LABELS & UNKNOWN_ZONE_LABEL di src/config/constants.js.
2) PanelManager.updateHudZone dan GameScene._showZoneBanner baca ZONE_LABELS. Grep dulu test/tutorial yang bergantung ke string lama.
3) GameScene._getPlayerZone() pakai ZoneMap.getZoneAt (null = wilayah tak dikenal). Grep semua pemakainya dulu.
4) Buat src/systems/NavigationSystem.js (tanpa DOM): formatCoord, isZoneRevealed, tick, getPlayerPosition, isRevealed, getMarkers.
5) Pasang di GameScene.create() setelah this.hud dan panggil tick() di update().
6) Perbaiki window.__dev.tp: pakai player.setTilePosition dan recenter kamera.
7) Tulis tests/nav1-navigation-system.test.js (mock scene, ikuti gaya tests/sprint7-building-mode.test.js).
Jangan ubah mekanik, resep, format save, atau tampilan selain label zona. Jalankan npm test dan npm run build.
```

---

### SPRINT N2 — Koordinat live

Tujuan: chip `Z1 · X 05 · Y 12` di kiri-bawah.

- [ ] Markup `#nav-cluster` + `#nav-coords` di `index.html` (4.4).
- [ ] CSS di `workspace.css` + aturan layout (4.5) + `--nav-h` untuk tutorial box.
- [ ] `src/ui/NavigationHUD.js`: dengar `'position-changed'`, ubah `textContent` hanya bila beda; klik = salin `x, y`; bersihkan listener saat `shutdown`.
- [ ] (N2b, opsional) baris `→ x, y` untuk petak di bawah kursor.
- [ ] Test untuk format teks dan format salin.

**DoD:** lihat 4.6.

**Prompt:**
```
Baca docs/NAVIGATION_PLAN.md bagian 4 (seluruhnya). Kerjakan HANYA Sprint N2.
Bikin chip koordinat di kiri-bawah (#nav-cluster > #nav-coords) di dalam #rpg-chrome, ikuti markup dan CSS di 4.4.
Buat src/ui/NavigationHUD.js yang mendengar navigationSystem.events 'position-changed'. Ubah textContent hanya kalau teksnya berubah.
Klik chip menyalin "x, y" lewat navigator.clipboard dengan try/catch dan toast hud.showMessage.
Jangan pakai aria-live atau <output>. Naikkan .rpg-tutorial-box lewat var(--nav-h).
Cek tampilan di lebar 320, 390, 768, 1024, 1440 px. Jangan ubah hotbar atau mekanik. Jalankan npm test dan npm run build.
```

---

### SPRINT N3 — Minimap + expand

Tujuan: thumbnail di kiri-bawah + peta besar via `M`/klik.

- [ ] `src/ui/MapRenderer.js`: `MAP_COLORS`, `pickScale`, `drawTerrain`, `drawView` (5.4).
- [ ] Thumbnail `<canvas id="nav-minimap-canvas" width="60" height="60">` dalam `<button>` di `#nav-cluster`, tampil 120×120 CSS, `image-rendering:pixelated`.
- [ ] Jadwal gambar (5.4): event + timer 250 ms; berhenti saat tersembunyi.
- [ ] `getMarkers()` lengkap (player, drone, hq, market, depot, teleporter, cache, gate).
- [ ] `#map-popup` + `panelManager.register` + label aria + tombol `M` (5.5).
- [ ] Hover readout, klik salin, legenda, hitung ulang skala saat `'pixel-resize'`.
- [ ] Test palet & `pickScale` & counter gambar.

**DoD:** lihat 5.6.

**Prompt:**
```
Baca docs/NAVIGATION_PLAN.md bagian 3 (D1–D4), 5 (seluruhnya). Kerjakan HANYA Sprint N3.
Bikin src/ui/MapRenderer.js (MAP_COLORS, pickScale, drawTerrain, drawView) dengan 2 lapis: lapis dasar digambar ulang hanya saat 'markers-changed' / 'reveal-changed'.
Tambah thumbnail 60x60 (tampil 120x120) di #nav-cluster dan modal #map-popup lewat PanelManager (tambah label aria 'map-popup').
Tombol M membuka peta (guard _isDOMInputFocused), M/Esc menutup. Hitung ulang skala saat game.events 'pixel-resize'.
Semua warna harus dari palet 12 warna di DESIGN_REVIEW.md. Ore dianggap node jika tile.isOre || tile.oreType === 'depleted'.
Marker gerbang dibaca dari GATES, bukan angka hardcode. Jangan ubah mekanik. Jalankan npm test dan npm run build.
```

---

### SPRINT N4 — Teleporter: item, resep, pasang/bongkar, save

- [ ] `teleporter_kit` di `items.js`; resep di `RECIPES.crafting_table` (6.2); `teleporter` di `buildings.js`.
- [ ] `TELEPORT` + konstanta di `constants.js`.
- [ ] Ikon (`ICON_IDS` **di akhir**) + sprite `building_teleporter` 2 frame (6.6).
- [ ] `src/entities/Teleporter.js`.
- [ ] `BuildingSystem`: `pads` Map, `explainPlacement` (+`restoring`), cabang di `placeFromKit` / `dismantleBuilding` / `reset`, `meta` untuk nama, `loadSaveState` meneruskan nama (6.3–6.4).
- [ ] `TeleportSystem` minimal: `getPads`, `nextName`, `isFree`, `findArrivalTile`.
- [ ] Toast alasan penolakan.
- [ ] Test `tests/nav4-teleporter-build.test.js`.

**DoD:** lihat 6.9 (bagian pasang/bongkar/save).

**Prompt:**
```
Baca docs/NAVIGATION_PLAN.md bagian 2.3 (F3, F5), 2.4 (T5–T7), 3 (D5–D8), 6.2–6.6. Kerjakan HANYA Sprint N4 (belum ada UI teleport/perjalanan).
Tambah item teleporter_kit, resep di RECIPES.crafting_table, tipe bangunan 'teleporter' di buildings.js, ikon (tambah di AKHIR ICON_IDS), sprite building_teleporter 2 frame, dan entity src/entities/Teleporter.js.
BuildingSystem: tambah this.pads, ubah canPlace jadi pembungkus explainPlacement(type,x,y,{restoring}), tambah cabang teleporter di placeFromKit, dismantleBuilding, dan reset.
Saat load (consume:false) JANGAN cek limit/arrival-tile. placeFromKit menerima meta:{name}; loadSaveState meneruskan building.name. Versi save tetap 2.
Buat TeleportSystem minimal (getPads, nextName, isFree, findArrivalTile) dan buat instance-nya tepat setelah new BuildingSystem(this).
Test: resep valid, pasang/bongkar+refund, penolakan (zona terkunci, zona null, limit 8, tanpa petak kosong), round-trip save dengan nama, save lama tanpa pad. pixel-assets.test.js harus tetap hijau. Jangan sentuh drone/API script. Jalankan npm test dan npm run build.
```

---

### SPRINT N5 — Teleporter: perjalanan + UI (+ N5b)

- [ ] `TeleportSystem.canTravel` / `travel` / `rename` (6.5).
- [ ] `src/ui/TeleporterUI.js` + `#teleporter-popup` + `register` + label aria (6.7).
- [ ] `GameScene._getFacingPad`, cabang di `_doInteract` dan `_updateInteractionPrompts` **paling atas** (6.6, T5).
- [ ] Toast `reason`; hint "pasang satu lagi" saat pad pertama.
- [ ] `prefers-reduced-motion`.
- [ ] Test `tests/nav5-teleport-travel.test.js`.
- [ ] **N5b (setelah N3):** buka peta besar dalam "mode travel" dari modal teleporter: marker teleporter bisa diklik dan nama muncul saat hover; yang lain diredupkan.

**DoD:** lihat 6.9 (bagian teleport).

**Prompt:**
```
Baca docs/NAVIGATION_PLAN.md bagian 2.4 (T5, T7, T9), 6.5–6.9. Kerjakan HANYA Sprint N5 (tanpa N5b).
Lengkapi TeleportSystem: canTravel (alasan: missing|moving|cooldown|zone_locked|blocked), travel (fadeOut 120ms -> delayedCall 130ms -> setTilePosition -> stopFollow/centerOn/startFollow -> fadeIn 150ms; kunci player.isMoving + killTweensOf; try/finally), rename.
Buat TeleporterUI (modal lewat PanelManager) dengan daftar tujuan, input nama (maks 16, unik), dan toast sesuai reason.
Tambah GameScene._getFacingPad dan pasang cek pad PALING ATAS di _doInteract dan _updateInteractionPrompts.
Hormati prefers-reduced-motion (tanpa fade/partikel). Jangan sentuh DroneAPI. Test: findArrivalTile, canTravel semua reason, travel memindahkan tileX/tileY, cooldown. Jalankan npm test dan npm run build.
```

---

### SPRINT N6 — Stretch

- Simpan posisi pemain di save (T8), dengan validasi zona terbuka saat load.
- API drone `drone.teleport('TP-2')` (butuh desain: harus berdiri di sebelah pad? biaya?).
- Lapis farm di peta besar (toggle: petak tilled/tanaman).
- Pin/waypoint buatan pemain di peta.
- Fee koin per jarak (`TELEPORT.FEE_PER_10_TILES`).
- Kuadran tanpa zona dijadikan Zona 6 (kalau Q1 = C).

---

## 8. Rencana test

Gaya: `node --test`, scene di-mock (ikuti `tests/sprint7-building-mode.test.js`).

| File | Yang dites |
|---|---|
| `nav1-navigation-system.test.js` | `formatCoord`; `getZoneAt` termasuk `null` di (45,45); `isZoneRevealed`; `tick` hanya emit saat berubah; `getMarkers` (tiap `kind`); sinyal `reveal-changed` |
| `nav2-coords-hud.test.js` | format teks `Z1 · X 05 · Y 12`; `Z?` saat zona null; format salin `5, 12` |
| `nav3-minimap.test.js` | `pickScale` (batas min/max, bentuk persegi); `drawTerrain` dengan **ctx palsu** yang mencatat `fillStyle` → semua warna ⊂ palet 12 warna; ore `depleted` tetap tergambar; zona terkunci = fog tapi gerbang tetap kuning; jumlah gambar = 0 saat disembunyikan |
| `nav4-teleporter-build.test.js` | resep valid & item ada; pasang/bongkar + refund kit; tolak: zona terkunci, zona `null`, pad ke-9, tanpa petak kosong; `nextName` mengisi celah (TP-1, TP-3 → TP-2); save round-trip nama; nama duplikat di save → diganti otomatis; save lama tanpa pad; `restoring` tidak mengecek limit/arrival |
| `nav5-teleport-travel.test.js` | `findArrivalTile` (urutan bawah→kanan→kiri→atas, fallback cincin-2, `null`); `canTravel` untuk tiap `reason`; `travel` memindahkan `tileX/tileY` dan melepas `isMoving` **walau error** (try/finally); cooldown; zona tujuan terkunci ditolak |
| `pixel-assets.test.js` (yang sudah ada) | otomatis mencakup sprite & ikon baru (≤4 warna, alpha biner, atlas cocok) |

> 💡 **Ctx palsu** = papan tulis pura-pura. Test nggak butuh browser; kita cuma kasih objek yang pura-pura jadi `canvas.getContext('2d')` dan mencatat warna apa saja yang dipakai, lalu cek tidak ada warna di luar palet.

Cek manual di browser (belum bisa kulakukan): kamera tidak meluncur saat teleport; lebar 320–1440 px tanpa tumpang tindih; peta tajam di zoom 1× dan 2×; `Tab` sidebar dan `M` tidak saling ganggu.

---

## 9. Peta file yang disentuh

| File | N1 | N2 | N3 | N4 | N5 |
|---|:-:|:-:|:-:|:-:|:-:|
| `src/config/constants.js` | ✏️ | | | ✏️ | |
| `src/systems/NavigationSystem.js` | 🆕 | | ✏️ | | |
| `src/systems/TeleportSystem.js` | | | | 🆕 | ✏️ |
| `src/entities/Teleporter.js` | | | | 🆕 | |
| `src/ui/NavigationHUD.js` | | 🆕 | ✏️ | | |
| `src/ui/MapRenderer.js` | | | 🆕 | | |
| `src/ui/TeleporterUI.js` | | | | | 🆕 |
| `src/ui/PanelManager.js` (label zona + label aria) | ✏️ | | ✏️ | | ✏️ |
| `src/scenes/GameScene.js` | ✏️ | | ✏️ | ✏️ | ✏️ |
| `src/systems/BuildingSystem.js` | | | | ✏️ | |
| `src/data/items.js`, `buildings.js` | | | | ✏️ | |
| `src/systems/MachineSystem.js` (resep) | | | | ✏️ | |
| `src/rendering/PixelAssets.js` (ikon + sprite) | | | | ✏️ | |
| `index.html`, `src/ui/workspace.css` | | ✏️ | ✏️ | | ✏️ |
| `tests/nav*.test.js` | 🆕 | 🆕 | 🆕 | 🆕 | 🆕 |

Yang **tidak** disentuh: `DroneAPI`, `ScriptSandbox`, `EconomySystem`, `GridManager` (kecuali kalau Q1 = pagari), format save (tetap v2).

---

## 10. Risiko & hal yang belum terverifikasi

| # | Risiko | Mitigasi |
|---|---|---|
| R1 | Repo memakai **Phaser 4**. API yang kupakai di kerangka (`cameras.main.centerOn`, `worldView`, `tweens.killTweensOf`, `time.now`, `time.delayedCall`) kukenal dari Phaser 3 dan `fadeIn` sudah dipakai di `create()`, tapi **belum kucoba jalan di Phaser 4.2**. | Smoke test manual di browser di akhir N3 dan N5. Kalau ada yang beda, sesuaikan; logika test tidak terpengaruh (scene di-mock). |
| R2 | Pad solid bisa menutup jalan. | Aturan "harus ada petak kosong di sebelah" + bongkar selalu bisa (X). Saran desain: jangan pasang di lorong 1 petak. |
| R3 | Save dari cloud (`CloudSaveSystem`) | Harusnya otomatis ikut karena `buildings[]` sama; **belum kuverifikasi** apakah cloud memakai `compileSaveData` yang sama. Cek di N4. |
| R4 | Pemain nge-bypass gerbang pakai pad | Dicegah di dua titik: pasang hanya di zona terbuka, dan `canTravel` mengecek zona tujuan (jaga-jaga save hasil edit/restore). |
| R5 | Layout kiri-bawah ramai (tutorial, hotbar, help) | Aturan layout 4.5 + cek 5 lebar layar + `--nav-h`. |
| R6 | Biaya gambar peta | 3.600 piksel dua lapis; 4 Hz; berhenti saat tersembunyi. Di bawah anggaran apa pun. |
| R7 | Fallback cincin-2 pada `findArrivalTile` bisa mendarat di petak terkurung | Aman untuk v1 (jarang); perbaiki dengan BFS 4-arah kalau muncul keluhan. |

---

## 11. Pertanyaan terbuka (sudah kuberi default biar nggak menghalangi)

| # | Pertanyaan | Default yang kupakai | Alternatif |
|---|---|---|---|
| **Q1** | **Kuadran kanan-bawah (x 40–59, y 40–59)**: itu memang disiapkan buat Zona 6 nanti, atau sisa yang belum ditutup pagar? | **A.** Dibiarkan, dilabeli "Wilayah Tak Dikenal", digelapkan di peta, teleporter ditolak di sana | **B.** Pagari (ubah `ZoneMap.isFenceTile`) · **C.** Jadikan Zona 6 sekarang |
| Q2 | Jaringan teleporter | Bebas (tiap pad ↔ pad lain), maks 8 | Berpasangan A↔B |
| Q3 | Resep | Varian **Normal**, 1 kit per craft | Varian Ringan/Berat; atau 1 craft = 2 kit ("Teleporter Pair") biar pad pertama langsung berguna |
| Q4 | Expand | Modal besar via `M` | Thumbnail membesar di tempat |

Kalau jawabanmu beda dari default, yang paling terdampak: Q1 → N1 (`ZoneMap`/`GridManager`), Q2 → N4–N5 (`TeleportSystem`), Q3 → N4 (resep & test), Q4 → N3 (markup & CSS).