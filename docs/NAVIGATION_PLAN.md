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

### 4.2 Aliran data

```
Player.tileX/tileY ──► NavigationSystem.tick() ──(kalau beda)──► emit 'position-changed'
   (GameScene.update)         bandingin 2 angka                        │
                                                                       ▼
                                                    NavigationHUD ubah textContent (kalau teksnya beda)
```

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

  /** Daftar marker untuk peta & UI. */
  getMarkers() {
    const markers = [];
    const s = this.scene;
    if (!s) return markers;

    if (s.player) {
      markers.push({ kind: 'player', id: 'player', x: s.player.tileX, y: s.player.tileY, label: 'Pemain' });
    }

    if (s.deviceManager) {
      for (const d of s.deviceManager.getAll()) {
        markers.push({ kind: 'drone', id: d.id, x: d.tileX, y: d.tileY, label: `Drone ${d.id}` });
      }
    }

    if (s.warehouse) {
      markers.push({ kind: 'hq', id: 'hq', x: s.warehouse.tileX, y: s.warehouse.tileY, w: s.warehouse.tileW || 2, h: s.warehouse.tileH || 2, label: 'Gudang Pusat' });
    }

    if (s.marketZone) {
      markers.push({ kind: 'market', id: 'market', x: s.marketZone.x, y: s.marketZone.y, w: s.marketZone.w || 3, h: s.marketZone.h || 2, label: 'Pasar' });
    }

    if (s.buildingSystem?.buildings) {
      for (const b of s.buildingSystem.buildings.values()) {
        if (b.type === 'warehouse') {
          markers.push({ kind: 'depot', id: b.id, x: b.x, y: b.y, w: 2, h: 2, label: 'Depot Gudang' });
        } else if (b.type === 'teleporter') {
          markers.push({ kind: 'teleporter', id: b.id, x: b.x, y: b.y, label: b.name || 'Teleporter' });
        }
      }
    }

    if (s.wildlifeSystem?.caches && this.isRevealed('zone5')) {
      for (const c of s.wildlifeSystem.caches) {
        if (!c.opened) {
          markers.push({ kind: 'cache', id: c.id, x: c.x, y: c.y, label: 'Peti Kuno' });
        }
      }
    }

    if (s.gridManager) {
      const gates = [
        { id: 'gate2', x: 19, y: 10, zone: 'zone2' },
        { id: 'gate3', x: 10, y: 19, zone: 'zone3' },
        { id: 'gate4', x: 39, y: 20, zone: 'zone4' },
        { id: 'gate5', x: 20, y: 39, zone: 'zone5' },
      ];
      for (const g of gates) {
        const tile = s.gridManager.getTile(g.x, g.y);
        const isLocked = tile ? tile.isLocked : !this.isRevealed(g.zone);
        markers.push({ kind: 'gate', id: g.id, x: g.x, y: g.y, isLocked, zone: g.zone, label: `Gerbang ${g.zone}` });
      }
    }

    return markers;
  }
}
```

---

## 7. Urutan, sprint, dan prompt siap tempel

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
