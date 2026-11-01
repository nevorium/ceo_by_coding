import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import GridManager from '../src/systems/GridManager.js';
import SlotContainer from '../src/systems/SlotContainer.js';
import MachineSystem, { RECIPES } from '../src/systems/MachineSystem.js';
import BuildingSystem from '../src/systems/BuildingSystem.js';
import Warehouse from '../src/entities/Warehouse.js';
import { BUILDING_DEFINITIONS, buildingTypeFromKit } from '../src/data/buildings.js';
import { getItem } from '../src/data/items.js';

function createMockScene() {
  const inventoryContainer = new SlotContainer(16, { isWarehouse: false });
  const warehouseContainer = new SlotContainer(24, { isWarehouse: true });
  const events = new UniversalEventEmitter();
  const whEvents = new UniversalEventEmitter();

  const inventorySystem = {
    container: inventoryContainer,
    events,
    getItemCount: (id) => inventoryContainer.getTotalCount(id),
    hasItem: (id, count = 1) => inventoryContainer.hasItem(id, count),
    hasSpaceFor: (id, count = 1) => inventoryContainer.hasSpaceFor(id, count),
    addItem: (id, count = 1) => inventoryContainer.addItem(id, count),
    removeItem: (id, count = 1) => inventoryContainer.removeItem(id, count),
  };

  const sharedWarehouseStorage = {
    container: warehouseContainer,
    events: whEvents,
    items: {
      get: (id) => warehouseContainer.getTotalCount(id),
      has: (id) => warehouseContainer.hasItem(id, 1),
      set: (id, count) => {
        const current = warehouseContainer.getTotalCount(id);
        if (count > current) warehouseContainer.addItem(id, count - current);
        else if (count < current) warehouseContainer.removeItem(id, current - count);
      },
      delete: (id) => warehouseContainer.removeItem(id, warehouseContainer.getTotalCount(id)),
      clear: () => warehouseContainer.clear(),
      entries: () => warehouseContainer.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
      values: () => warehouseContainer.getAll().map(i => i.count)[Symbol.iterator](),
      keys: () => warehouseContainer.getAll().map(i => i.id)[Symbol.iterator](),
      [Symbol.iterator]: () => warehouseContainer.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
      get size() { return warehouseContainer.getAll().length; },
    },
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
    gridManager: new GridManager(40, 40),
    machineSystem: new MachineSystem(),
    inventorySystem,
    player: { tileX: 5, tileY: 5, getFacingTile: () => ({ x: 6, y: 5 }) },
    hud: { showMessage: () => {} },
    textures: { exists: () => true },
    add: {
      rectangle: mockGameObject,
      image: mockGameObject,
      text: mockGameObject,
    },
    cameras: {
      main: {
        getWorldPoint: (px, py) => ({ x: px, y: py }),
      },
    },
    input: {
      activePointer: { x: 0, y: 0 },
    },
    tileSpriteUpdates: [],
    updateTileSprite: function(x, y) {
      this.tileSpriteUpdates.push({ x, y });
    },
    saveSystem: {
      saveLocal: () => true,
    },
  };

  // Base starting warehouse HQ at (10, 2)
  scene.warehouse = new Warehouse(scene, 10, 2, 2, 2, sharedWarehouseStorage, 'GUDANG');
  scene.buildingSystem = new BuildingSystem(scene);

  return scene;
}

test('Sprint 8: Building definitions and items registry include machine and warehouse kits', () => {
  const expectedKits = ['smelter_kit', 'mill_kit', 'assembler_kit', 'press_kit', 'boiler_kit', 'warehouse_kit', 'warehouse_depot_kit', 'conveyor_kit', 'crafting_table_kit'];
  for (const kitId of expectedKits) {
    const item = getItem(kitId);
    assert.ok(item, `Item ${kitId} must be registered in items registry`);
    assert.equal(item.category, 'Bangunan');
    const type = buildingTypeFromKit(kitId);
    assert.ok(type, `Kit ${kitId} must map to a building definition`);
    assert.ok(BUILDING_DEFINITIONS[type], `Building definition for ${type} must exist`);
  }

  // Verify recipes exist in crafting_table
  const ctRecipes = RECIPES.crafting_table;
  for (const kitId of expectedKits) {
    const hasRecipe = ctRecipes.some(r => r.id === kitId || r.output?.id === kitId);
    assert.ok(hasRecipe, `Crafting table must have a recipe for ${kitId}`);
  }
});

test('Sprint 8: Conveyor movement moves items step-by-step along belt chains', () => {
  const scene = createMockScene();
  const gm = scene.gridManager;

  // Build a conveyor line from (2, 2) to (5, 2) directed 'right'
  gm.setConveyor(2, 2, 'right');
  gm.setConveyor(3, 2, 'right');
  gm.setConveyor(4, 2, 'right');
  gm.setConveyor(5, 2, 'right');

  // Place item on (2, 2)
  gm.getTile(2, 2).conveyorItem = 'copper_ore';

  // Tick 1: moves from (2, 2) to (3, 2)
  gm.tickConveyorItems(scene);
  assert.equal(gm.getTile(2, 2).conveyorItem, 'none');
  assert.equal(gm.getTile(3, 2).conveyorItem, 'copper_ore');

  // Tick 2: moves from (3, 2) to (4, 2)
  gm.tickConveyorItems(scene);
  assert.equal(gm.getTile(3, 2).conveyorItem, 'none');
  assert.equal(gm.getTile(4, 2).conveyorItem, 'copper_ore');

  // Tick 3: moves from (4, 2) to (5, 2)
  gm.tickConveyorItems(scene);
  assert.equal(gm.getTile(4, 2).conveyorItem, 'none');
  assert.equal(gm.getTile(5, 2).conveyorItem, 'copper_ore');
});

test('Sprint 8: Conveyor delivers items directly into Warehouse storage', () => {
  const scene = createMockScene();
  const gm = scene.gridManager;

  // Conveyor pointing right into warehouse HQ tile at (10, 2)
  gm.setConveyor(9, 2, 'right');
  gm.getTile(9, 2).conveyorItem = 'iron_ore';

  assert.equal(scene.warehouse.getItemCount('iron_ore'), 0);

  // Tick conveyor: item enters warehouse
  gm.tickConveyorItems(scene);

  assert.equal(gm.getTile(9, 2).conveyorItem, 'none', 'Belt should be cleared');
  assert.equal(scene.warehouse.getItemCount('iron_ore'), 1, 'Warehouse should receive 1 iron_ore');
});

test('Sprint 8: Conveyor delivers items into Machine input buffer', () => {
  const scene = createMockScene();
  const gm = scene.gridManager;
  const ms = scene.machineSystem;

  // Place smelter at (12, 10)
  ms.registerMachine('smelter_01', 'smelter', 12, 10);
  gm.setMachine(12, 10, 'smelter_01', 'smelter');

  // Conveyor pointing down into the smelter from (12, 9)
  gm.setConveyor(12, 9, 'down');
  gm.getTile(12, 9).conveyorItem = 'copper_ore';

  gm.tickConveyorItems(scene);

  assert.equal(gm.getTile(12, 9).conveyorItem, 'none', 'Belt should be cleared');
  const machine = ms.machines.get('smelter_01');
  assert.equal(machine.inputBuffer.get('copper_ore'), 1, 'Machine buffer should have copper_ore');
});

test('Sprint 8: Machine automatically ejects output items onto adjacent output conveyor', () => {
  const scene = createMockScene();
  const gm = scene.gridManager;
  const ms = scene.machineSystem;

  // Register smelter at (15, 15) with an output item ready
  ms.registerMachine('smelter_02', 'smelter', 15, 15);
  gm.setMachine(15, 15, 'smelter_02', 'smelter');
  const machine = ms.machines.get('smelter_02');
  machine.outputBuffer.set('copper_ingot', 2);

  // Output conveyor placed to the right at (16, 15) pointing right (away from smelter)
  gm.setConveyor(16, 15, 'right');
  assert.equal(gm.getTile(16, 15).conveyorItem, 'none');

  // Tick conveyor: machine auto-outputs 1 copper_ingot
  gm.tickConveyorItems(scene);

  assert.equal(gm.getTile(16, 15).conveyorItem, 'copper_ingot', 'Output conveyor should receive item');
  assert.equal(machine.outputBuffer.get('copper_ingot'), 1, 'Machine output buffer count should decrease');
});

test('Sprint 8: Multi-machine: players can place multiple machines of any type and inspect/run them independently', () => {
  const scene = createMockScene();
  const bs = scene.buildingSystem;
  const ms = scene.machineSystem;

  // Give player 2 smelter kits and 1 mill kit
  scene.inventorySystem.addItem('smelter_kit', 2);
  scene.inventorySystem.addItem('mill_kit', 1);

  // Place first smelter at (20, 20)
  const placed1 = bs.placeFromKit('smelter_kit', 20, 20);
  assert.ok(placed1, 'First smelter should be placed');

  // Place second smelter at (22, 20)
  const placed2 = bs.placeFromKit('smelter_kit', 22, 20);
  assert.ok(placed2, 'Second smelter should be placed');

  // Place mill at (24, 20)
  const placed3 = bs.placeFromKit('mill_kit', 24, 20);
  assert.ok(placed3, 'Mill should be placed');

  assert.equal(ms.machines.has('smelter_1'), true);
  assert.equal(ms.machines.has('smelter_2'), true);
  assert.equal(ms.machines.has('mill_3'), true);

  // Feed smelter 1 and smelter 2 independently
  ms.deposit('smelter_1', 'copper_ore', 2);
  ms.deposit('smelter_1', 'coal', 1);

  ms.deposit('smelter_2', 'iron_ore', 2);
  ms.deposit('smelter_2', 'coal', 1);

  const m1 = ms.machines.get('smelter_1');
  const m2 = ms.machines.get('smelter_2');

  assert.ok(m1.activeRecipe, 'Smelter 1 should have active recipe for copper_ingot');
  assert.ok(m2.activeRecipe, 'Smelter 2 should have active recipe for iron_ingot');
  assert.notEqual(m1.activeRecipe.name, m2.activeRecipe.name);
});

test('Sprint 8: Multi-warehouse: players can place satellite warehouses and access shared central storage', () => {
  const scene = createMockScene();
  const bs = scene.buildingSystem;

  // Give player warehouse kit and warehouse depot kit
  scene.inventorySystem.addItem('warehouse_kit', 1);
  scene.inventorySystem.addItem('warehouse_depot_kit', 1);

  // Place satellite warehouse at (25, 25) (2x2 footprint)
  const placedWh = bs.placeFromKit('warehouse_kit', 25, 25);
  assert.ok(placedWh, 'Satellite warehouse should be placed');

  // Place satellite depot at (30, 25) (2x2 footprint)
  const placedDepot = bs.placeFromKit('warehouse_depot_kit', 30, 25);
  assert.ok(placedDepot, 'Depot should be placed');

  // Verify storage instances share central stock
  const wh2 = bs.getStorageAt(25, 25);
  const wh3 = bs.getStorageAt(30, 25);

  assert.ok(wh2, 'Should find warehouse at (25, 25)');
  assert.ok(wh3, 'Should find depot at (30, 25)');

  // Deposit at HQ (10, 2), withdraw from satellite (25, 25)
  scene.warehouse.deposit('apple_juice', 5);
  assert.equal(wh2.getItemCount('apple_juice'), 5);
  assert.equal(wh3.getItemCount('apple_juice'), 5);

  const withdrawn = wh3.withdraw('apple_juice', 2);
  assert.equal(withdrawn, true);
  assert.equal(scene.warehouse.getItemCount('apple_juice'), 3);
  assert.equal(wh2.getItemCount('apple_juice'), 3);
});

test('Sprint 8: Conveyor save and restore round-trip preserves direction and riding items', () => {
  const scene = createMockScene();
  const bs = scene.buildingSystem;
  const gm = scene.gridManager;

  // Place conveyor kits
  scene.inventorySystem.addItem('conveyor_kit', 3);
  bs.placeFromKit('conveyor_kit', 10, 15, 'up');
  bs.placeFromKit('conveyor_kit', 10, 14, 'left');
  bs.placeFromKit('conveyor_kit', 9, 14, 'down');

  // Put items on belts
  gm.getTile(10, 15).conveyorItem = 'wire';
  gm.getTile(9, 14).conveyorItem = 'gear';

  // Save state
  const saveState = bs.getSaveState();
  assert.equal(saveState.length, 3);
  const wireTile = saveState.find(b => b.x === 10 && b.y === 15);
  const gearTile = saveState.find(b => b.x === 9 && b.y === 14);
  assert.equal(wireTile.conveyorItem, 'wire');
  assert.equal(wireTile.direction, 'up');
  assert.equal(gearTile.conveyorItem, 'gear');
  assert.equal(gearTile.direction, 'down');

  // Reset building system and grid
  bs.reset();
  assert.equal(gm.getTile(10, 15).isConveyor, false);
  assert.equal(gm.getTile(10, 15).conveyorItem, 'none');

  // Restore save state
  bs.loadSaveState(saveState);

  assert.equal(gm.getTile(10, 15).isConveyor, true);
  assert.equal(gm.getTile(10, 15).conveyorDir, 'up');
  assert.equal(gm.getTile(10, 15).conveyorItem, 'wire');

  assert.equal(gm.getTile(9, 14).isConveyor, true);
  assert.equal(gm.getTile(9, 14).conveyorDir, 'down');
  assert.equal(gm.getTile(9, 14).conveyorItem, 'gear');
});
