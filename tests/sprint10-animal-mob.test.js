import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import GridManager from '../src/systems/GridManager.js';
import SlotContainer from '../src/systems/SlotContainer.js';
import WildlifeSystem, { MOB_TYPES } from '../src/systems/WildlifeSystem.js';
import { ITEMS, getItem } from '../src/data/items.js';
import { buildPixelAssets, ICON_IDS } from '../src/rendering/PixelAssets.js';

function createMockScene(zone5Unlocked = true) {
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

  const profileSystem = {
    xp: 0,
    level: 1,
    addXp(amt) { this.xp += amt; },
  };

  const mockGameObject = () => ({
    tint: null,
    setTint: function(color) { this.tint = color; return this; },
    clearTint: function() { this.tint = null; return this; },
    setPosition: function() { return this; },
    setSize: function() { return this; },
    setDepth: function() { return this; },
    setVisible: function() { return this; },
    destroy: function() { this.isDestroyed = true; return this; },
  });

  const scene = {
    events: new UniversalEventEmitter(),
    gridManager: new GridManager(60, 60),
    inventorySystem,
    profileSystem,
    unlockedZones: { zone5: zone5Unlocked },
    player: { tileX: 20, tileY: 45, getFacingTile: () => ({ x: 20, y: 46 }) },
    hud: { showMessage: () => {} },
    textures: { exists: () => true },
    time: {
      delayedCall(ms, cb) {
        cb();
      },
    },
    tweens: {
      add({ targets, x, y, duration, onComplete }) {
        if (targets) {
          targets.x = x;
          targets.y = y;
        }
        if (typeof onComplete === 'function') onComplete();
      },
    },
    add: {
      image: () => mockGameObject(),
      rectangle: () => mockGameObject(),
      text: () => mockGameObject(),
    },
  };

  return scene;
}

test('Sprint 10: MOB_TYPES defines hare, deer, and boar with HP and loot tables', () => {
  assert.ok(MOB_TYPES.hare, 'hare mob definition exists');
  assert.equal(MOB_TYPES.hare.hp, 2, 'hare has 2 HP');
  assert.ok(MOB_TYPES.hare.loot.some(l => l.id === 'raw_meat'), 'hare drops raw_meat');

  assert.ok(MOB_TYPES.deer, 'deer mob definition exists');
  assert.equal(MOB_TYPES.deer.hp, 4, 'deer has 4 HP');
  assert.ok(MOB_TYPES.deer.loot.some(l => l.id === 'raw_meat'), 'deer drops raw_meat');
  assert.ok(MOB_TYPES.deer.loot.some(l => l.id === 'leather'), 'deer drops leather');

  assert.ok(MOB_TYPES.boar, 'boar mob definition exists');
  assert.equal(MOB_TYPES.boar.hp, 6, 'boar has 6 HP');
  assert.ok(MOB_TYPES.boar.loot.some(l => l.id === 'raw_meat'), 'boar drops raw_meat');
  assert.ok(MOB_TYPES.boar.loot.some(l => l.id === 'bone'), 'boar drops bone');
  assert.ok(MOB_TYPES.boar.loot.some(l => l.id === 'leather'), 'boar drops leather');
});

test('Sprint 10: items.js registers raw_meat, leather, and bone with proper metadata', () => {
  const meat = getItem('raw_meat');
  assert.equal(meat.id, 'raw_meat');
  assert.equal(meat.stackMax, 50);

  const leather = getItem('leather');
  assert.equal(leather.id, 'leather');
  assert.equal(leather.stackMax, 50);

  const bone = getItem('bone');
  assert.equal(bone.id, 'bone');
  assert.equal(bone.stackMax, 50);
});

test('Sprint 10: PixelAssets includes wildlife_boar texture and mob loot icon IDs', () => {
  const assets = buildPixelAssets();
  assert.ok(assets.has('wildlife_boar'), 'wildlife_boar texture generated');
  assert.ok(assets.has('wildlife_deer'), 'wildlife_deer texture generated');
  assert.ok(assets.has('wildlife_hare'), 'wildlife_hare texture generated');

  assert.ok(ICON_IDS.includes('raw_meat'), 'raw_meat icon registered');
  assert.ok(ICON_IDS.includes('leather'), 'leather icon registered');
  assert.ok(ICON_IDS.includes('bone'), 'bone icon registered');

  assert.ok(assets.has('icon_raw_meat'), 'icon_raw_meat asset generated');
  assert.ok(assets.has('icon_leather'), 'icon_leather asset generated');
  assert.ok(assets.has('icon_bone'), 'icon_bone asset generated');
});

test('Sprint 10: Spawning animal mob initializes HP, maxHp, and type correctly', () => {
  const scene = createMockScene(true);
  const wildlife = new WildlifeSystem(scene);

  const boar = wildlife.spawn({ type: 'boar', x: 15, y: 46 });
  assert.ok(boar, 'Boar spawned successfully');
  assert.equal(boar.type, 'boar');
  assert.equal(boar.hp, 6);
  assert.equal(boar.maxHp, 6);
  assert.equal(boar.tileX, 15);
  assert.equal(boar.tileY, 46);

  const deer = wildlife.spawn({ type: 'deer', x: 16, y: 46 });
  assert.equal(deer.type, 'deer');
  assert.equal(deer.hp, 4);
  assert.equal(deer.maxHp, 4);

  const hare = wildlife.spawn({ type: 'hare', x: 17, y: 46 });
  assert.equal(hare.type, 'hare');
  assert.equal(hare.hp, 2);
  assert.equal(hare.maxHp, 2);
});

test('Sprint 10: Spatial lookup getAnimalAt and getAnimalNear', () => {
  const scene = createMockScene(true);
  const wildlife = new WildlifeSystem(scene);

  const boar = wildlife.spawn({ type: 'boar', x: 20, y: 50 });
  const foundExact = wildlife.getAnimalAt(20, 50);
  assert.equal(foundExact?.id, boar.id, 'Found animal at exact tile');

  const foundNear = wildlife.getAnimalNear(21, 50, 1.5);
  assert.equal(foundNear?.id, boar.id, 'Found nearest animal within radius');

  const notFound = wildlife.getAnimalAt(5, 5);
  assert.equal(notFound, null, 'No animal at distant tile');
});

test('Sprint 10: Combat damage reduces animal HP, triggers flee away from player', () => {
  const scene = createMockScene(true);
  const wildlife = new WildlifeSystem(scene);

  const boar = wildlife.spawn({ type: 'boar', x: 20, y: 45 });
  // Attacker at (20, 44), directly north of boar
  const result = wildlife.damageAnimal(boar.id, 2, 20, 44, scene);

  assert.equal(result.defeated, false, 'Boar survives 2 damage (HP 6 -> 4)');
  assert.equal(result.remainingHp, 4);
  assert.equal(boar.hp, 4);

  // Flee should push boar south (away from y=44)
  assert.ok(boar.tileY >= 45, 'Boar moved away from northern attacker');
});

test('Sprint 10: Lethal damage defeats animal, drops loot, and awards player XP', () => {
  const scene = createMockScene(true);
  const wildlife = new WildlifeSystem(scene);

  const hare = wildlife.spawn({ type: 'hare', x: 22, y: 48 });
  let defeatEventFired = false;
  wildlife.events.on('animal-defeated', (data) => {
    defeatEventFired = true;
    assert.equal(data.animal.id, hare.id);
  });

  // Deal 2 damage to hare (HP 2)
  const result = wildlife.damageAnimal(hare.id, 2, 21, 48, scene);

  assert.equal(result.defeated, true, 'Hare is defeated by lethal strike');
  assert.equal(result.remainingHp, 0);
  assert.ok(defeatEventFired, 'animal-defeated event emitted');
  assert.equal(scene.profileSystem.xp, 8, 'Player awarded 8 XP for defeating hare');
  assert.equal(wildlife.fauna.has(hare.id), false, 'Fauna removed from active map');

  // Check loot dropped on the ground
  assert.ok(result.drops.length > 0, 'Loot dropped on ground');
  const droppedIds = result.drops.map(d => d.id);
  assert.ok(droppedIds.includes('raw_meat'), 'Raw meat dropped from defeated hare');
});

test('Sprint 10: Player can collect mob loot drops and inventory validates space', () => {
  const scene = createMockScene(true);
  const wildlife = new WildlifeSystem(scene);

  // Manually drop meat and leather
  wildlife.dropItem(25, 50, 'raw_meat', 2);
  wildlife.dropItem(26, 50, 'leather', 1);
  wildlife.dropItem(27, 50, 'bone', 3);

  // Collect meat
  const collectMeat = wildlife.collectAt(25, 50, scene.inventorySystem);
  assert.equal(collectMeat, true, 'Collected raw meat drop');
  assert.equal(scene.inventorySystem.getItemCount('raw_meat'), 2);

  // Collect leather
  const collectLeather = wildlife.collectAt(26, 50, scene.inventorySystem);
  assert.equal(collectLeather, true, 'Collected leather drop');
  assert.equal(scene.inventorySystem.getItemCount('leather'), 1);

  // Collect bone
  const collectBone = wildlife.collectAt(27, 50, scene.inventorySystem);
  assert.equal(collectBone, true, 'Collected bone drop');
  assert.equal(scene.inventorySystem.getItemCount('bone'), 3);

  // Test full inventory rejection
  // Fill all 16 slots of container with dummy items
  for (let i = 0; i < 16; i++) {
    scene.inventorySystem.container.slots[i] = { id: `dummy_${i}`, count: 99 };
  }
  wildlife.dropItem(28, 50, 'raw_meat', 1);
  const rejectCollect = wildlife.collectAt(28, 50, scene.inventorySystem);
  assert.equal(rejectCollect, false, 'Collection rejected when player inventory has no space');
});

test('Sprint 10: Save and load round-trip preserves mob HP, type, position, and drops', () => {
  const scene1 = createMockScene(true);
  const wildlife1 = new WildlifeSystem(scene1);

  const boar = wildlife1.spawn({ type: 'boar', x: 12, y: 44 });
  wildlife1.damageAnimal(boar.id, 3, 11, 44, scene1); // Boar now has 3/6 HP
  wildlife1.dropItem(15, 45, 'raw_meat', 2);
  wildlife1.dropItem(16, 45, 'bone', 4);

  const saveState = wildlife1.getSaveState();
  assert.ok(Array.isArray(saveState.fauna), 'fauna array in save state');
  const savedBoar = saveState.fauna.find(f => f.type === 'boar');
  assert.ok(savedBoar, 'Boar present in save state');
  assert.equal(savedBoar.hp, 3, 'Boar current HP preserved');
  assert.equal(savedBoar.maxHp, 6, 'Boar max HP preserved');

  // Restore in a fresh system
  const scene2 = createMockScene(true);
  const wildlife2 = new WildlifeSystem(scene2);
  wildlife2.loadSaveState(saveState);

  const restoredBoar = [...wildlife2.fauna.values()].find(f => f.type === 'boar');
  assert.ok(restoredBoar, 'Boar restored from save');
  assert.equal(restoredBoar.hp, 3, 'Restored boar has 3 HP');
  assert.equal(restoredBoar.maxHp, 6, 'Restored boar has 6 maxHp');

  const meatDrop = wildlife2.getDropAt(15, 45);
  assert.ok(meatDrop, 'Meat drop restored');
  assert.equal(meatDrop.id, 'raw_meat');
  assert.equal(meatDrop.count, 2);

  const boneDrop = wildlife2.getDropAt(16, 45);
  assert.ok(boneDrop, 'Bone drop restored');
  assert.equal(boneDrop.id, 'bone');
  assert.equal(boneDrop.count, 4);
});
