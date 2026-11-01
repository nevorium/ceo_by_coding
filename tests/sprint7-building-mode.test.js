import test from 'node:test';
import assert from 'node:assert/strict';
import BuildingSystem from '../src/systems/BuildingSystem.js';
import GridManager from '../src/systems/GridManager.js';
import MachineSystem from '../src/systems/MachineSystem.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import Warehouse from '../src/entities/Warehouse.js';
import { GRID_COLS, GRID_ROWS } from '../src/config/constants.js';

function createMockScene() {
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
      setData: (k, v) => { obj._data = obj._data || {}; obj._data[k] = v; return obj; },
      getData: (k) => k ? obj._data?.[k] : obj._data || {},
      destroy: () => {},
    };
    return obj;
  };

  const sceneAdd = {
    rectangle: () => mockGameObject(),
    image: () => mockGameObject(),
    text: () => mockGameObject(),
  };

  const warehouse = new Warehouse(
    { add: sceneAdd },
    10, 2, 2, 2
  );

  const scene = {
    add: sceneAdd,
    gridManager,
    machineSystem,
    inventorySystem,
    warehouse,
    player: { tileX: 5, tileY: 5 },
    updateTileSprite: () => {},
    cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
    input: { activePointer: { x: 0, y: 0 } },
    events: { once: () => {}, emit: () => {} },
    hud: { showMessage: () => {} },
    saveSystem: { saveLocal: () => {} },
    _emitPixelParticles: () => {},
    machineIndicators: new Map(),
  };

  return scene;
}

test('Sprint 7: canPlace enforces spatial and collision constraints', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  // Valid interior farm tile
  assert.equal(buildingSystem.canPlace('crafting_table', 6, 6), true);

  // Border fence is not buildable
  assert.equal(buildingSystem.canPlace('crafting_table', 0, 0), false);
  assert.equal(buildingSystem.canPlace('crafting_table', GRID_COLS - 1, 5), false);

  // Player position is not buildable (prevents trapping player)
  assert.equal(buildingSystem.canPlace('crafting_table', 5, 5), false);

  // Gate tile is not buildable
  scene.gridManager.setGate(19, 10, 'zone2', true);
  assert.equal(buildingSystem.canPlace('crafting_table', 19, 10), false);

  // Ore tile is not buildable
  scene.gridManager.setOre(8, 28, 'stone');
  assert.equal(buildingSystem.canPlace('crafting_table', 8, 28), false);

  // Multi-tile building (Warehouse Depot 2x2) checks full footprint
  assert.equal(buildingSystem.canPlace('warehouse_depot', 6, 6), true);
  // If one of the 4 tiles is occupied by player (5,5), placement at (4,4) or (5,5) fails
  assert.equal(buildingSystem.canPlace('warehouse_depot', 4, 4), false); // covers (5,5)
});

test('Sprint 7: placeFromKit places Crafting Table and registers with MachineSystem', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('crafting_table_kit', 1);

  const placed = buildingSystem.placeFromKit('crafting_table_kit', 6, 6);
  assert.equal(placed, true);
  assert.equal(scene.inventorySystem.getItemCount('crafting_table_kit'), 0);

  // Grid tile must be marked as machine
  const tile = scene.gridManager.getTile(6, 6);
  assert.equal(tile.isMachine, true);
  assert.equal(tile.machineType, 'crafting_table');
  assert.ok(tile.machineId.startsWith('crafting_table_'));

  // MachineSystem must have the registered machine
  const machine = scene.machineSystem.machines.get(tile.machineId);
  assert.ok(machine);
  assert.equal(machine.type, 'crafting_table');
  assert.equal(machine.x, 6);
  assert.equal(machine.y, 6);

  // Building must be tracked in buildingSystem
  assert.equal(buildingSystem.buildings.size, 1);
  const b = buildingSystem.getBuildingAt(6, 6);
  assert.ok(b);
  assert.equal(b.type, 'crafting_table');
});

test('Sprint 7: placeFromKit places Warehouse Depot and sets up multi-tile building', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('warehouse_depot_kit', 1);

  const placed = buildingSystem.placeFromKit('warehouse_depot_kit', 7, 7);
  assert.equal(placed, true);
  assert.equal(scene.inventorySystem.getItemCount('warehouse_depot_kit'), 0);

  // All 4 tiles (7..8, 7..8) must be marked as building
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = scene.gridManager.getTile(7 + dx, 7 + dy);
      assert.equal(tile.isBuilding, true);
      assert.equal(tile.buildingType, 'warehouse_depot');
    }
  }

  // Depot must be registered
  assert.equal(buildingSystem.depots.size, 1);
  const depot = buildingSystem.getWarehouseAdjacentTo(6, 7);
  assert.ok(depot, 'Depot should be detected as adjacent');

  // getBuildingAt covers any tile in footprint
  assert.equal(buildingSystem.getBuildingAt(7, 7)?.type, 'warehouse_depot');
  assert.equal(buildingSystem.getBuildingAt(8, 8)?.type, 'warehouse_depot');
});

test('Sprint 7: dismantleBuilding lifts Crafting Table, recovers buffer items, and refunds kit', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('crafting_table_kit', 1);
  buildingSystem.placeFromKit('crafting_table_kit', 6, 6);

  const building = buildingSystem.getBuildingAt(6, 6);
  assert.ok(building);

  // Deposit some buffer items into the crafting table
  scene.machineSystem.deposit(building.id, 'stone', 4);

  // Dismantle
  const dismantled = buildingSystem.dismantleBuilding(building.id);
  assert.equal(dismantled, true);

  // Kit refunded
  assert.equal(scene.inventorySystem.getItemCount('crafting_table_kit'), 1);

  // Buffer items returned to inventory
  assert.equal(scene.inventorySystem.getItemCount('stone'), 4);

  // Machine unregistered
  assert.equal(scene.machineSystem.machines.has(building.id), false);

  // Tile cleared
  const tile = scene.gridManager.getTile(6, 6);
  assert.equal(tile.isMachine, false);
  assert.equal(tile.machineId, null);

  // Building record removed
  assert.equal(buildingSystem.buildings.size, 0);
  assert.equal(buildingSystem.getBuildingAt(6, 6), null);
});

test('Sprint 7: dismantleBuilding lifts Warehouse Depot and frees 2x2 grid footprint', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('warehouse_depot_kit', 1);
  buildingSystem.placeFromKit('warehouse_depot_kit', 7, 7);

  const building = buildingSystem.getBuildingAt(7, 7);
  assert.ok(building);

  // Dismantle
  const dismantled = buildingSystem.dismantleAt(8, 8); // dismantle by any footprint tile
  assert.equal(dismantled, true);

  // Kit refunded
  assert.equal(scene.inventorySystem.getItemCount('warehouse_depot_kit'), 1);

  // Footprint cleared
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = scene.gridManager.getTile(7 + dx, 7 + dy);
      assert.equal(tile.isBuilding, false);
      assert.equal(tile.buildingId, null);
    }
  }

  assert.equal(buildingSystem.depots.size, 0);
  assert.equal(buildingSystem.buildings.size, 0);
});

test('Sprint 7: dismantleBuilding lifts Conveyor and recovers riding item', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('conveyor_kit', 1);
  buildingSystem.placeFromKit('conveyor_kit', 6, 6, 'right');

  // Place an item on the conveyor
  const tile = scene.gridManager.getTile(6, 6);
  tile.conveyorItem = 'copper_ingot';

  // Dismantle conveyor
  const dismantled = buildingSystem.dismantleAt(6, 6);
  assert.equal(dismantled, true);

  // Kit refunded
  assert.equal(scene.inventorySystem.getItemCount('conveyor_kit'), 1);

  // Riding item returned to inventory
  assert.equal(scene.inventorySystem.getItemCount('copper_ingot'), 1);

  // Conveyor cleared
  assert.equal(tile.isConveyor, false);
  assert.equal(tile.conveyorItem, 'none');
});

test('Sprint 7: dismantle is rejected when inventory has no room for kit', () => {
  const scene = createMockScene();
  // Fill all slots of a tiny 1-slot inventory
  scene.inventorySystem = new InventorySystem(1);
  scene.inventorySystem.addItem('wheat', 99);

  const buildingSystem = new BuildingSystem(scene);
  // Manually insert building into system without consuming from inventory
  buildingSystem.placeFromKit('crafting_table_kit', 6, 6, 'right', { consume: false });

  const building = buildingSystem.getBuildingAt(6, 6);
  assert.ok(building);

  // Attempt dismantle when inventory is full
  const result = buildingSystem.dismantleBuilding(building.id);
  assert.equal(result, false, 'Dismantling should be prevented if inventory cannot hold kit');

  // Building remains intact
  assert.equal(buildingSystem.buildings.size, 1);
  assert.equal(scene.gridManager.getTile(6, 6).isMachine, true);
});

test('Sprint 7: Mode switching, rotation, and persistence round-trip', () => {
  const scene = createMockScene();
  const buildingSystem = new BuildingSystem(scene);

  scene.inventorySystem.addItem('crafting_table_kit', 1);

  // Start in place mode
  buildingSystem.setActiveKit('crafting_table_kit');
  assert.equal(buildingSystem.mode, 'place');
  assert.equal(buildingSystem.isActive, true);

  // Rotate cycles directions
  assert.equal(buildingSystem.direction, 'right');
  buildingSystem.rotate();
  assert.equal(buildingSystem.direction, 'down');
  buildingSystem.rotate();
  assert.equal(buildingSystem.direction, 'left');
  buildingSystem.rotate();
  assert.equal(buildingSystem.direction, 'up');

  // Toggle dismantle mode
  buildingSystem.toggleDismantle();
  assert.equal(buildingSystem.mode, 'dismantle');
  assert.equal(buildingSystem.isActive, true);

  // Place a building
  buildingSystem.setActiveKit('crafting_table_kit');
  buildingSystem.placeFromKit('crafting_table_kit', 6, 6);

  // Serialize state
  const state = buildingSystem.getSaveState();
  assert.equal(state.length, 1);
  assert.equal(state[0].type, 'crafting_table');
  assert.equal(state[0].x, 6);
  assert.equal(state[0].y, 6);

  // Reset and restore
  buildingSystem.reset();
  assert.equal(buildingSystem.buildings.size, 0);

  buildingSystem.loadSaveState(state);
  assert.equal(buildingSystem.buildings.size, 1);
  assert.equal(scene.gridManager.getTile(6, 6).isMachine, true);
});
