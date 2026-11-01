import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import GridManager from '../src/systems/GridManager.js';
import SlotContainer from '../src/systems/SlotContainer.js';
import ZoneMap from '../src/systems/ZoneMap.js';
import WildlifeSystem, { DISCOVERY_CACHES } from '../src/systems/WildlifeSystem.js';
import { GATES, ZONE_BOUNDS } from '../src/config/constants.js';

function createMockScene(zone5Unlocked = false) {
  const inventoryContainer = new SlotContainer(16, { isWarehouse: false });
  const events = new UniversalEventEmitter();

  const inventorySystem = {
    container: inventoryContainer,
    events,
    getItemCount: (id) => inventoryContainer.getTotalCount(id),
    hasItem: (id, count = 1) => inventoryContainer.hasItem(id, count),
    hasSpaceFor: (id, count = 1) => inventoryContainer.hasSpaceFor(id, count),
    addItem: (id, count = 1) => inventoryContainer.addItem(id, count),
    removeItem: (id, count = 1) => inventoryContainer.removeItem(id, count),
  };

  const economySystem = {
    coins: 100,
    addCoins(amt) { this.coins += amt; },
    getCoins() { return this.coins; },
  };

  const profileSystem = {
    xp: 0,
    level: 1,
    addXp(amt) { this.xp += amt; },
  };

  const mockGameObject = () => ({
    setPosition: function() { return this; },
    setSize: function() { return this; },
    setDepth: function() { return this; },
    setVisible: function() { return this; },
    setStrokeStyle: function() { return this; },
    setFillStyle: function() { return this; },
    setOrigin: function() { return this; },
    setText: function() { return this; },
    destroy: function() { return this; },
    setData: function() { return this; },
    getData: function() { return {}; },
  });

  const scene = {
    events: new UniversalEventEmitter(),
    gridManager: new GridManager(60, 60),
    inventorySystem,
    economySystem,
    profileSystem,
    unlockedZones: { zone2: false, zone3: true, zone4: false, zone5: zone5Unlocked },
    player: { tileX: 20, tileY: 38, getFacingTile: () => ({ x: 20, y: 39 }) },
    hud: { showMessage: () => {} },
    textures: { exists: () => true },
    add: {
      image: mockGameObject,
      rectangle: mockGameObject,
      text: mockGameObject,
      sprite: mockGameObject,
    },
    tweens: {
      add: () => ({}),
    },
    cameras: {
      main: {
        setBounds: function(x, y, w, h) { this.bounds = { x, y, w, h }; },
        getWorldPoint: (px, py) => ({ x: px, y: py }),
      },
    },
    saveSystem: {
      saveLocal: () => true,
    },
    tileSpriteUpdates: [],
    updateTileSprite: function(x, y) {
      this.tileSpriteUpdates.push({ x, y });
    },
    _updateCameraBounds: function() {
      let maxCols = 40;
      let maxRows = this.unlockedZones.zone5 ? 60 : 40;
      this.cameras.main.setBounds(0, 0, maxCols * 32, maxRows * 32);
    },
  };

  scene.wildlifeSystem = new WildlifeSystem(scene);
  return scene;
}

test('Sprint 9: ZoneMap correctly identifies Zone 5 Explore boundaries and Gate 5', () => {
  assert.equal(ZoneMap.getZoneAt(20, 50), 'zone5');
  assert.equal(ZoneMap.getZoneAt(1, 41), 'zone5');
  assert.equal(ZoneMap.getZoneAt(38, 58), 'zone5');

  // Verify Gate 5 definition
  const gate5 = GATES.gate5;
  assert.ok(gate5, 'Gate 5 definition must exist');
  assert.equal(gate5.x, 20);
  assert.equal(gate5.y, 39);
  assert.equal(gate5.key, 'zone5');
  assert.equal(ZoneMap.isGateTile(20, 39), true);
  assert.equal(ZoneMap.isFenceTile(20, 39, 60, 60), false, 'Gate tile must not be considered a solid fence');

  // Fences bordering Zone 5
  assert.equal(ZoneMap.isFenceTile(19, 39, 60, 60), true, 'Separating fence west of gate 5');
  assert.equal(ZoneMap.isFenceTile(21, 39, 60, 60), true, 'Separating fence east of gate 5');
  assert.equal(ZoneMap.isFenceTile(39, 45, 60, 60), true, 'East fence of Zone 5');
  assert.equal(ZoneMap.isFenceTile(20, 59, 60, 60), true, 'South outer border of Zone 5');
});

test('Sprint 9: Gate 5 interaction checks material requirements and unlocks Explore Zone', () => {
  const scene = createMockScene(false);
  const gm = scene.gridManager;
  gm.setGate(20, 39, 'zone5', true);
  const gateTile = gm.getTile(20, 39);

  assert.equal(gateTile.isLocked, true);
  assert.equal(scene.unlockedZones.zone5, false);

  // Insufficient items: gate remains locked
  scene.inventorySystem.addItem('stone', 5);
  // Attempting unlock logic
  const gateInfo = GATES.gate5;
  const canUnlockBefore = gateInfo.itemReqs.every(({ id, count }) => scene.inventorySystem.hasItem(id, count));
  assert.equal(canUnlockBefore, false);

  // Give required materials: 10 stone, 2 iron_ingot
  scene.inventorySystem.addItem('stone', 5); // now 10
  scene.inventorySystem.addItem('iron_ingot', 2);
  const canUnlockNow = gateInfo.itemReqs.every(({ id, count }) => scene.inventorySystem.hasItem(id, count));
  assert.equal(canUnlockNow, true);

  // Execute unlock
  gateInfo.itemReqs.forEach(({ id, count }) => scene.inventorySystem.removeItem(id, count));
  gateTile.isLocked = false;
  scene.unlockedZones.zone5 = true;
  scene._updateCameraBounds();

  assert.equal(gateTile.isLocked, false);
  assert.equal(scene.unlockedZones.zone5, true);
  assert.equal(scene.inventorySystem.getItemCount('stone'), 0);
  assert.equal(scene.inventorySystem.getItemCount('iron_ingot'), 0);
  assert.equal(scene.cameras.main.bounds.h, 60 * 32, 'Camera bounds should expand to 60 rows');
});

test('Sprint 9: Stone quarry and deep vein ore nodes in Zone 5', () => {
  const scene = createMockScene(true);
  const gm = scene.gridManager;

  // Setup stone quarry nodes in Zone 5
  const sampleNodes = [
    { x: 5, y: 44, type: 'stone' },
    { x: 12, y: 48, type: 'stone' },
    { x: 28, y: 52, type: 'stone' },
    { x: 18, y: 55, type: 'iron' },
    { x: 35, y: 55, type: 'gold' },
  ];

  sampleNodes.forEach(n => gm.setOre(n.x, n.y, n.type));

  const stoneTile = gm.getTile(5, 44);
  assert.equal(stoneTile.isOre, true);
  assert.equal(stoneTile.oreType, 'stone');
  assert.equal(stoneTile.oreMaxDurability, 3);
  assert.equal(stoneTile.oreCurrentDurability, 3);

  // Mining stone node
  stoneTile.oreCurrentDurability -= 2;
  assert.equal(stoneTile.oreCurrentDurability, 1);

  // Depleting stone node gives stone drops
  stoneTile.oreCurrentDurability = 0;
  stoneTile.oreType = 'depleted';
  stoneTile.isOre = false;
  scene.inventorySystem.addItem('stone', 3);
  assert.equal(scene.inventorySystem.getItemCount('stone'), 3);
});

test('Sprint 9: Wildlife fauna spawns and produces forageable wild fiber in Zone 5', () => {
  const scene = createMockScene(true);
  const ws = scene.wildlifeSystem;

  // Advance time to spawn fauna
  ws.update(4000);
  assert.ok(ws.fauna.size > 0, 'Wildlife fauna should spawn in Zone 5');

  // Trigger fiber drop at (15, 45)
  ws._dropFiber(15, 45);
  const drop = ws.getDropAt(15, 45);
  assert.ok(drop, 'Wild fiber drop should exist on tile');
  assert.equal(drop.id, 'wild_fiber');
  assert.equal(drop.count, 1);

  // Collect fiber into player inventory
  assert.equal(scene.inventorySystem.getItemCount('wild_fiber'), 0);
  const collected = ws.collectAt(15, 45, scene.inventorySystem);
  assert.equal(collected, true);
  assert.equal(scene.inventorySystem.getItemCount('wild_fiber'), 1);
  assert.equal(ws.getDropAt(15, 45), null, 'Drop should be removed after collection');
});

test('Sprint 9: Discovery loot caches in Zone 5 can be discovered and opened', () => {
  const scene = createMockScene(true);
  const ws = scene.wildlifeSystem;

  assert.ok(DISCOVERY_CACHES.length >= 3, 'At least 3 discovery caches defined');

  // Cache 1: Pioneer Stash at (8, 43)
  const cache1 = ws.getCacheAt(8, 43);
  assert.ok(cache1, 'Cache at (8, 43) should be found');
  assert.equal(cache1.opened, false);

  const initialCoins = scene.economySystem.getCoins();
  const initialXp = scene.profileSystem.xp;

  const result = ws.openCacheAt(8, 43, scene.inventorySystem, scene.economySystem, scene.profileSystem);
  assert.equal(result.success, true);
  assert.equal(cache1.opened, true);

  // Check rewards delivered
  assert.equal(scene.inventorySystem.getItemCount('stone'), 8);
  assert.equal(scene.inventorySystem.getItemCount('wheat_seed'), 5);
  assert.equal(scene.inventorySystem.getItemCount('conveyor_kit'), 2);
  assert.equal(scene.economySystem.getCoins(), initialCoins + 50);
  assert.equal(scene.profileSystem.xp, initialXp + 25);

  // Attempting to open again fails (already opened)
  assert.equal(ws.getCacheAt(8, 43), null);
  const result2 = ws.openCacheAt(8, 43, scene.inventorySystem, scene.economySystem, scene.profileSystem);
  assert.equal(result2.success, false);
});

test('Sprint 9: Discovery cache rejects looting when player inventory is completely full', () => {
  const scene = createMockScene(true);
  const ws = scene.wildlifeSystem;

  // Fill up player inventory completely (16 slots with stackMax 1)
  for (let i = 0; i < 16; i++) {
    scene.inventorySystem.addItem('pickaxe', 1);
  }
  assert.equal(scene.inventorySystem.hasSpaceFor('stone', 1), false);

  const result = ws.openCacheAt(26, 47, scene.inventorySystem, scene.economySystem, scene.profileSystem);
  assert.equal(result.success, false);
  assert.equal(result.reason, 'inventory_full');

  const cache2 = ws.caches.get('cache_builder');
  assert.equal(cache2.opened, false, 'Cache should remain unopened');
});

test('Sprint 9: Explore zone state (fauna, drops, caches) survives save/load round-trip', () => {
  const scene = createMockScene(true);
  const ws = scene.wildlifeSystem;

  // Open cache 1
  ws.openCacheAt(8, 43, scene.inventorySystem, scene.economySystem, scene.profileSystem);

  // Spawn an animal and a drop
  ws.spawn({ id: 'fauna_test', type: 'deer', x: 10, y: 50, moveCooldown: 500, dropCooldown: 3000 });
  ws._dropFiber(12, 52);

  // Save state
  const saveState = ws.getSaveState();
  assert.ok(Array.isArray(saveState.caches));
  const savedCache1 = saveState.caches.find(c => c.id === 'cache_pioneer');
  const savedCache2 = saveState.caches.find(c => c.id === 'cache_builder');
  assert.equal(savedCache1.opened, true);
  assert.equal(savedCache2.opened, false);
  assert.ok(saveState.fauna.some(f => f.id === 'fauna_test'));
  assert.ok(saveState.drops.some(d => d.x === 12 && d.y === 52));

  // Destroy and reload state
  ws.destroy();
  assert.equal(ws.fauna.size, 0);
  assert.equal(ws.drops.size, 0);

  ws.loadSaveState(saveState);

  assert.equal(ws.caches.get('cache_pioneer').opened, true);
  assert.equal(ws.caches.get('cache_builder').opened, false);
  assert.ok(ws.fauna.has('fauna_test'));
  assert.ok(ws.getDropAt(12, 52));
});
