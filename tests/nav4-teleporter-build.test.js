import test from 'node:test';
import assert from 'node:assert/strict';
import BuildingSystem from '../src/systems/BuildingSystem.js';
import TeleportSystem, { findArrivalTile } from '../src/systems/TeleportSystem.js';
import GridManager from '../src/systems/GridManager.js';
import MachineSystem, { RECIPES } from '../src/systems/MachineSystem.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import { ITEMS } from '../src/data/items.js';
import { BUILDING_DEFINITIONS } from '../src/data/buildings.js';
import { GRID_COLS, GRID_ROWS, TELEPORT } from '../src/config/constants.js';

function createMockScene(unlockedZones = { zone2: false, zone3: false, zone4: false, zone5: false }) {
  const gridManager = new GridManager(GRID_COLS, GRID_ROWS);
  const machineSystem = new MachineSystem();
  const inventorySystem = new InventorySystem(24);

  const mockGameObject = () => {
    const obj = {
      setDepth: () => obj,
      setStrokeStyle: () => obj,
      setFillStyle: () => obj,
      setPosition: () => obj,
      setSize: () => obj,
      setVisible: () => obj,
      setOrigin: () => obj,
      setFrame: () => obj,
      destroy: () => {},
    };
    return obj;
  };

  const sceneAdd = {
    rectangle: () => mockGameObject(),
    image: () => mockGameObject(),
    text: () => mockGameObject(),
  };

  const scene = {
    add: sceneAdd,
    gridManager,
    machineSystem,
    inventorySystem,
    unlockedZones: { ...unlockedZones },
    player: { tileX: 5, tileY: 5 },
    updateTileSprite: () => {},
    cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
    input: { activePointer: { x: 0, y: 0 } },
    events: { once: () => {}, emit: () => {} },
    hud: { showMessage: () => {} },
    saveSystem: { saveLocal: () => {} },
    _emitPixelParticles: () => {},
    time: {
      addEvent: () => ({ remove: () => {} }),
      now: 10000,
    },
  };

  scene.buildingSystem = new BuildingSystem(scene);
  scene.teleportSystem = new TeleportSystem(scene);

  return scene;
}

test('Sprint N4: items, buildings, and crafting recipes include teleporter_kit', () => {
  // 1. Items definition
  const item = ITEMS.teleporter_kit;
  assert.ok(item, 'teleporter_kit exists in items');
  assert.equal(item.category, 'Bangunan');
  assert.equal(item.stackMax, 99);

  // 2. Building definition
  const bDef = BUILDING_DEFINITIONS.teleporter;
  assert.ok(bDef, 'teleporter exists in BUILDING_DEFINITIONS');
  assert.equal(bDef.kitId, 'teleporter_kit');
  assert.equal(bDef.width, 1);
  assert.equal(bDef.height, 1);
  assert.equal(bDef.teleporter, true);

  // 3. Crafting table recipe
  const recipe = RECIPES.crafting_table.find(r => r.id === 'teleporter_kit');
  assert.ok(recipe, 'Recipe for teleporter_kit exists in RECIPES.crafting_table');
  assert.equal(recipe.inputs.iron_ingot, 8);
  assert.equal(recipe.inputs.gold_ingot, 3);
  assert.equal(recipe.inputs.chip, 2);
  assert.equal(recipe.output.id, 'teleporter_kit');
  assert.equal(recipe.output.count, 1);
});

test('Sprint N4: findArrivalTile priority order (bottom, right, left, top) and 2-tile ring fallback', () => {
  const pad = { x: 10, y: 10 };

  // All 4 neighbors free -> chooses bottom (0, 1) -> (10, 11)
  let freeMap = new Map();
  let isFree = (x, y) => freeMap.get(`${x},${y}`) ?? true;
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 10, y: 11 });

  // Bottom blocked -> chooses right (1, 0) -> (11, 10)
  freeMap.set('10,11', false);
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 11, y: 10 });

  // Right blocked -> chooses left (-1, 0) -> (9, 10)
  freeMap.set('11,10', false);
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 9, y: 10 });

  // Left blocked -> chooses top (0, -1) -> (10, 9)
  freeMap.set('9,10', false);
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 10, y: 9 });

  // All 4 adjacent blocked -> falls back to 2-tile ring, e.g. (8, 8) or first free in ring
  freeMap.set('10,9', false);
  const ringTile = findArrivalTile(pad, isFree);
  assert.ok(ringTile !== null);
  const dist = Math.max(Math.abs(ringTile.x - pad.x), Math.abs(ringTile.y - pad.y));
  assert.equal(dist, 2);

  // Completely surrounded (all tiles false) -> returns null
  assert.equal(findArrivalTile(pad, () => false), null);
});

test('Sprint N4: placeFromKit places Teleporter, registers pad with name, and dismantles with kit refund', () => {
  const scene = createMockScene();
  scene.inventorySystem.addItem('teleporter_kit', 2);

  // Place first pad at (6, 6) in Zone 1
  const placed1 = scene.buildingSystem.placeFromKit('teleporter_kit', 6, 6);
  assert.equal(placed1, true);
  assert.equal(scene.inventorySystem.getItemCount('teleporter_kit'), 1);

  // Check building record
  const building1 = scene.buildingSystem.getBuildingAt(6, 6);
  assert.ok(building1);
  assert.equal(building1.type, 'teleporter');
  assert.equal(building1.name, 'TP-1');

  // Check pad in pads map
  assert.ok(scene.buildingSystem.pads.has(building1.id));
  const padObj = scene.buildingSystem.pads.get(building1.id);
  assert.equal(padObj.tileX, 6);
  assert.equal(padObj.tileY, 6);
  assert.equal(padObj.name, 'TP-1');

  // Grid tile is solid building
  const tile1 = scene.gridManager.getTile(6, 6);
  assert.equal(tile1.isBuilding, true);
  assert.equal(tile1.buildingType, 'teleporter');

  // Place second pad at (8, 8)
  const placed2 = scene.buildingSystem.placeFromKit('teleporter_kit', 8, 8);
  assert.equal(placed2, true);
  const building2 = scene.buildingSystem.getBuildingAt(8, 8);
  assert.equal(building2.name, 'TP-2');

  // Check TeleportSystem.getPads()
  const pads = scene.teleportSystem.getPads();
  assert.equal(pads.length, 2);
  assert.equal(pads[0].name, 'TP-1');
  assert.equal(pads[1].name, 'TP-2');

  // Dismantle first pad
  const dismantled = scene.buildingSystem.dismantleBuilding(building1.id);
  assert.equal(dismantled, true);
  assert.equal(scene.inventorySystem.getItemCount('teleporter_kit'), 1);
  assert.equal(scene.buildingSystem.pads.has(building1.id), false);
  assert.equal(tile1.isBuilding, false);
});

test('Sprint N4: explainPlacement rejects locked zones, null zone, pad limit (8), and lack of arrival tile', () => {
  const scene = createMockScene({ zone2: false, zone3: false, zone4: false, zone5: false });

  // 1. Valid Zone 1 placement
  assert.deepEqual(scene.buildingSystem.explainPlacement('teleporter', 6, 6), { ok: true });

  // 2. Locked zone (Zone 2: x=25, y=5 is locked)
  const lockedRes = scene.buildingSystem.explainPlacement('teleporter', 25, 5);
  assert.equal(lockedRes.ok, false);
  assert.equal(lockedRes.reason, 'zone_unavailable');

  // Unlock zone 2 -> now valid
  scene.unlockedZones.zone2 = true;
  assert.deepEqual(scene.buildingSystem.explainPlacement('teleporter', 25, 5), { ok: true });

  // 3. Null zone (x=45, y=45 is outside defined zones)
  const nullRes = scene.buildingSystem.explainPlacement('teleporter', 45, 45);
  assert.equal(nullRes.ok, false);
  assert.equal(nullRes.reason, 'zone_unavailable');

  // 4. No arrival tile: surround (6, 6) with obstacles in 1-tile and 2-tile radius
  const blockedScene = createMockScene();
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      blockedScene.gridManager.setBuilding(6 + dx, 6 + dy, `wall_${dx}_${dy}`, 'wall');
    }
  }
  const noArrivalRes = blockedScene.buildingSystem.explainPlacement('teleporter', 6, 6);
  assert.equal(noArrivalRes.ok, false);
  assert.equal(noArrivalRes.reason, 'no_arrival');

  // 5. Limit: maximum 8 pads
  const limitScene = createMockScene();
  limitScene.inventorySystem.addItem('teleporter_kit', 10);
  for (let i = 0; i < TELEPORT.MAX_PADS; i++) {
    limitScene.buildingSystem.placeFromKit('teleporter_kit', 2 + i * 2, 2);
  }
  assert.equal(limitScene.teleportSystem.getPads().length, 8);

  const overLimitRes = limitScene.buildingSystem.explainPlacement('teleporter', 2, 15);
  assert.equal(overLimitRes.ok, false);
  assert.equal(overLimitRes.reason, 'limit');
});

test('Sprint N4: nextName fills holes in pad naming sequence', () => {
  const scene = createMockScene();
  scene.inventorySystem.addItem('teleporter_kit', 5);

  scene.buildingSystem.placeFromKit('teleporter_kit', 2, 2); // TP-1
  scene.buildingSystem.placeFromKit('teleporter_kit', 4, 2); // TP-2
  scene.buildingSystem.placeFromKit('teleporter_kit', 6, 2); // TP-3

  const b2 = scene.buildingSystem.getBuildingAt(4, 2);
  scene.buildingSystem.dismantleBuilding(b2.id); // Remove TP-2

  // Next pad should fill the hole: TP-2
  assert.equal(scene.teleportSystem.nextName(), 'TP-2');
  scene.buildingSystem.placeFromKit('teleporter_kit', 8, 2);
  const bNew = scene.buildingSystem.getBuildingAt(8, 2);
  assert.equal(bNew.name, 'TP-2');
});

test('Sprint N4: save/load round-trip preserves custom names, resolves duplicates, and handles legacy saves without pads', () => {
  const scene = createMockScene();
  scene.inventorySystem.addItem('teleporter_kit', 2);

  scene.buildingSystem.placeFromKit('teleporter_kit', 4, 4, 'right', {
    consume: true,
    meta: { name: 'HQ-Portal' },
  });
  scene.buildingSystem.placeFromKit('teleporter_kit', 6, 6, 'right', {
    consume: true,
    meta: { name: 'Mine-Portal' },
  });

  const savedBuildings = scene.buildingSystem.getSaveState();
  assert.equal(savedBuildings.length, 2);
  assert.equal(savedBuildings[0].name, 'HQ-Portal');
  assert.equal(savedBuildings[1].name, 'Mine-Portal');

  // Restore into a fresh scene
  const scene2 = createMockScene();
  scene2.buildingSystem.loadSaveState(savedBuildings);
  const pads2 = scene2.teleportSystem.getPads();
  assert.equal(pads2.length, 2);
  assert.equal(pads2[0].name, 'HQ-Portal');
  assert.equal(pads2[1].name, 'Mine-Portal');

  // Test duplicate names in save: second pad gets auto-assigned
  const scene3 = createMockScene();
  scene3.buildingSystem.loadSaveState([
    { id: 'teleporter_1', type: 'teleporter', x: 2, y: 2, name: 'Main-Pad' },
    { id: 'teleporter_2', type: 'teleporter', x: 4, y: 4, name: 'Main-Pad' }, // Duplicate!
  ]);
  const pads3 = scene3.teleportSystem.getPads();
  assert.equal(pads3.length, 2);
  assert.equal(pads3[0].name, 'Main-Pad');
  assert.equal(pads3[1].name, 'TP-1', 'Duplicate name was replaced with next available name');

  // Test legacy save without teleporters
  const sceneLegacy = createMockScene();
  sceneLegacy.buildingSystem.loadSaveState([
    { id: 'crafting_table_1', type: 'crafting_table', x: 3, y: 3 },
  ]);
  assert.equal(sceneLegacy.teleportSystem.getPads().length, 0);

  // Test restoring ignores limits & arrival checks
  const sceneRestoring = createMockScene();
  // Surround (10, 10) completely
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      sceneRestoring.gridManager.setBuilding(10 + dx, 10 + dy, `wall_${dx}_${dy}`, 'wall');
    }
  }
  // Load pad at (10, 10)
  sceneRestoring.buildingSystem.loadSaveState([
    { id: 'teleporter_99', type: 'teleporter', x: 10, y: 10, name: 'Surrounded-Pad' },
  ]);
  const padsRestored = sceneRestoring.teleportSystem.getPads();
  assert.equal(padsRestored.length, 1);
  assert.equal(padsRestored[0].name, 'Surrounded-Pad', 'Restoring pad ignored arrival checks');
});
