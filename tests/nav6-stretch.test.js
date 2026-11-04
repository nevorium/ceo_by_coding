import './setup-env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import SaveSystem from '../src/systems/SaveSystem.js';
import DroneAPI from '../src/systems/DroneAPI.js';
import NavigationSystem from '../src/systems/NavigationSystem.js';
import { MAP_COLORS, drawTerrain, drawView } from '../src/ui/MapRenderer.js';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';

// 12-color retro palette strictly defined in DESIGN_REVIEW.md
const PALETTE_12 = new Set([
  '#101a21', '#22343c', '#42535b', '#93a7a1',
  '#edf0d4', '#a4b18b', '#244c3a', '#4a7c59',
  '#9b794e', '#e3ba83', '#63d8d1', '#e9bf62',
]);

function createMockGrid() {
  const tiles = new Map();
  return {
    cols: 60,
    rows: 60,
    getTile(x, y) {
      const key = `${x},${y}`;
      if (!tiles.has(key)) {
        tiles.set(key, {
          isWalkable: true,
          isBuilding: false,
          isOre: false,
          isConveyor: false,
          isTilled: false,
          isWatered: false,
          hasPlant: false,
          growthStage: 0,
        });
      }
      return tiles.get(key);
    },
    isWalkable(x, y) {
      const t = this.getTile(x, y);
      return Boolean(t && t.isWalkable && !t.isBuilding);
    },
    resetTile(x, y) {
      tiles.delete(`${x},${y}`);
    },
    setBuilding(x, y, id, type) {
      const t = this.getTile(x, y);
      t.isBuilding = Boolean(id);
      t.buildingId = id;
      t.buildingType = type;
      t.isWalkable = !id;
    },
    setGate() {},
    setOre() {},
    setMachine() {},
  };
}

function createMockScene() {
  const gridManager = createMockGrid();
  const buildings = new Map();
  const pads = new Map();

  const scene = {
    unlockedZones: { zone2: true, zone3: false, zone4: false, zone5: false },
    gridManager,
    profileSystem: {
      name: 'Pilot Alpha',
      level: 1,
      xp: 0,
      upgrades: {},
      getXpNeeded: () => 100,
      getUpgradeValue: () => 10,
      events: new UniversalEventEmitter(),
    },
    inventorySystem: {
      coins: 500,
      getCoins: () => 500,
      getAllItems: () => [],
      events: new UniversalEventEmitter(),
      items: new Map(),
    },
    scriptManager: {
      scripts: [],
      getAllScripts: () => [],
      saveToLocalStorage: () => {},
    },
    deviceManager: {
      drones: new Map(),
      getAll: () => [],
    },
    buildingSystem: {
      buildings,
      pads,
      events: new UniversalEventEmitter(),
      reset: () => { buildings.clear(); pads.clear(); },
      loadSaveState: () => {},
      getSaveState: () => [],
    },
    cameras: {
      main: {
        x: 0,
        y: 0,
        centerOn(cx, cy) {
          this.centerX = cx;
          this.centerY = cy;
        },
      },
    },
    player: {
      tileX: 5,
      tileY: 5,
      setTilePosition(x, y) {
        this.tileX = x;
        this.tileY = y;
      },
    },
    time: {
      delayedCall(ms, cb) {
        if (typeof cb === 'function') cb();
      },
    },
    hud: {
      showMessage: () => {},
    },
  };

  scene.navigationSystem = new NavigationSystem(scene);
  return scene;
}

test('Sprint N6: SaveSystem serializes and restores player position with zone validation', () => {
  const scene = createMockScene();
  const saveSystem = new SaveSystem(scene);

  // Position player at (8, 12) in Zone 1
  scene.player.setTilePosition(8, 12);
  const data = saveSystem.compileSaveData();

  assert.ok(data.player, 'Save data contains player object');
  assert.equal(data.player.tileX, 8);
  assert.equal(data.player.tileY, 12);

  // 1. Reset player to 5,5 then restore
  scene.player.setTilePosition(5, 5);
  saveSystem.applySaveData(data);
  assert.equal(scene.player.tileX, 8, 'Restores player tileX to 8');
  assert.equal(scene.player.tileY, 12, 'Restores player tileY to 12');
  assert.equal(scene.cameras.main.centerX, 8 * 32 + 16, 'Recenters camera on player X');

  // 2. Reject position if target is in a locked zone (Zone 4: 45, 10)
  scene.unlockedZones.zone4 = false;
  scene.player.setTilePosition(5, 5);
  const lockedData = {
    version: 2,
    unlockedZones: { zone2: false, zone3: false, zone4: false, zone5: false },
    player: { tileX: 45, tileY: 10 },
  };
  saveSystem.applySaveData(lockedData);
  assert.equal(scene.player.tileX, 5, 'Player position in locked zone is rejected and stays at 5');
  assert.equal(scene.player.tileY, 5, 'Player position in locked zone is rejected and stays at 5');

  // 3. Fallback gracefully for legacy saves without player object
  const legacyData = {
    version: 2,
    unlockedZones: { zone2: true, zone3: false, zone4: false, zone5: false },
  };
  scene.player.setTilePosition(5, 5);
  saveSystem.applySaveData(legacyData);
  assert.equal(scene.player.tileX, 5, 'Legacy save without player property preserves default position');
});

test('Sprint N6: DroneAPI drone.teleport() executes when adjacent to pad and enforces constraints', async () => {
  const scene = createMockScene();

  // Create two teleporters: TP-1 at (5, 5) [Zone 1] and TP-2 at (25, 8) [Zone 2]
  const pad1 = { id: 'pad_1', x: 5, y: 5, name: 'TP-1', zoneKey: 'zone1' };
  const pad2 = { id: 'pad_2', x: 25, y: 8, name: 'TP-2', zoneKey: 'zone2' };
  const padLocked = { id: 'pad_locked', x: 45, y: 10, name: 'TP-LOCKED', zoneKey: 'zone4' };

  scene.buildingSystem.pads.set(pad1.id, pad1);
  scene.buildingSystem.pads.set(pad2.id, pad2);
  scene.buildingSystem.pads.set(padLocked.id, padLocked);

  scene.teleportSystem = {
    getPads: () => [pad1, pad2, padLocked],
    findArrivalTile: (tx, ty) => ({ x: tx, y: ty + 1 }),
  };

  const mockDrone = {
    tileX: 5,
    tileY: 6, // adjacent to TP-1 (5, 5)
    scene,
    setTilePosition(x, y) {
      this.tileX = x;
      this.tileY = y;
    },
    animateAction() {},
  };

  const droneAPI = new DroneAPI(mockDrone, scene.gridManager);

  // 1. Successful teleport to TP-2
  await droneAPI._handleTeleport('TP-2');
  assert.equal(mockDrone.tileX, 25, 'Drone teleported to arrival X of TP-2');
  assert.equal(mockDrone.tileY, 9, 'Drone teleported to arrival Y of TP-2 (8 + 1)');

  // 2. Reject when drone is NOT adjacent to any teleporter pad
  mockDrone.tileX = 20;
  mockDrone.tileY = 20; // far away
  await assert.rejects(
    () => droneAPI._handleTeleport('TP-1'),
    /Drone must be adjacent to a teleporter pad/,
    'Rejects when drone is not adjacent to a pad'
  );

  // Move back adjacent to TP-2
  mockDrone.tileX = 25;
  mockDrone.tileY = 9;

  // 3. Reject teleporting to self
  await assert.rejects(
    () => droneAPI._handleTeleport('TP-2'),
    /Cannot teleport to the same teleporter pad/,
    'Rejects teleporting to the same pad'
  );

  // 4. Reject nonexistent destination
  await assert.rejects(
    () => droneAPI._handleTeleport('TP-GHOST'),
    /not found/,
    'Rejects when destination pad does not exist'
  );

  // 5. Reject destination in locked zone
  scene.unlockedZones.zone4 = false;
  await assert.rejects(
    () => droneAPI._handleTeleport('TP-LOCKED'),
    /locked zone/,
    'Rejects teleportation to locked zone'
  );
});

test('Sprint N6: MapRenderer farm layer toggle and custom waypoint pin', () => {
  const scene = createMockScene();
  const nav = scene.navigationSystem;

  // Test custom pin management in NavigationSystem
  assert.equal(nav.pin, null, 'Initially no pin');
  nav.setPin(14, 28);
  assert.deepEqual(nav.pin, { x: 14, y: 28 }, 'Pin set correctly');

  const markers = nav.getMarkers();
  const pinMarker = markers.find(m => m.kind === 'pin');
  assert.ok(pinMarker, 'Pin marker included in NavigationSystem.getMarkers()');
  assert.equal(pinMarker.x, 14);
  assert.equal(pinMarker.y, 28);

  nav.clearPin();
  assert.equal(nav.pin, null, 'Pin cleared');
  assert.equal(nav.getMarkers().find(m => m.kind === 'pin'), undefined, 'Pin marker removed');

  // Test drawTerrain with showFarm = true
  const recordedColors = new Set();
  const mockCtx = {
    imageSmoothingEnabled: false,
    fillRect() {},
    set fillStyle(val) {
      recordedColors.add(String(val).toLowerCase());
    },
    get fillStyle() {
      return '#000000';
    },
  };

  // Set tilled and planted tiles on grid
  const t1 = scene.gridManager.getTile(5, 5);
  t1.isTilled = true;
  const t2 = scene.gridManager.getTile(6, 5);
  t2.hasPlant = true;
  t2.growthStage = 3;

  drawTerrain(mockCtx, nav, scene.gridManager, { showFarm: true });

  assert.ok(recordedColors.has(MAP_COLORS.tilled), 'Farm layer renders tilled soil color');
  assert.ok(recordedColors.has(MAP_COLORS.harvest), 'Farm layer renders mature crop harvest color');

  // Verify all recorded colors belong strictly to 12-color retro palette
  for (const c of recordedColors) {
    assert.ok(PALETTE_12.has(c), `Color ${c} must be in the 12-color palette`);
  }
});
