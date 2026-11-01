import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/data/items.js';
import MachineSystem, { RECIPES } from '../src/systems/MachineSystem.js';
import InventorySystem from '../src/systems/InventorySystem.js';

test('Sprint 6: Crafting table recipe registry contains building kits and essential tools', () => {
  const tableRecipes = RECIPES.crafting_table;
  assert.ok(Array.isArray(tableRecipes), 'crafting_table must have a list of recipes');
  assert.ok(tableRecipes.length >= 6, 'crafting_table must contain multiple crafting recipes');

  const outputIds = tableRecipes.map(r => r.output.id);
  assert.ok(outputIds.includes('conveyor_kit'), 'Must be able to craft conveyor_kit');
  assert.ok(outputIds.includes('warehouse_depot_kit'), 'Must be able to craft warehouse_depot_kit');
  assert.ok(outputIds.includes('crafting_table_kit'), 'Must be able to craft crafting_table_kit');
  assert.ok(outputIds.includes('pickaxe'), 'Must be able to craft pickaxe');
  assert.ok(outputIds.includes('plow'), 'Must be able to craft plow');
  assert.ok(outputIds.includes('watering_can'), 'Must be able to craft watering_can');

  for (const r of tableRecipes) {
    assert.ok(r.inputs && Object.keys(r.inputs).length > 0, `Recipe ${r.name} must have inputs`);
    assert.ok(r.output?.id, `Recipe ${r.name} must have output.id`);
    assert.ok(ITEMS[r.output.id], `Output ${r.output.id} must be registered in items.js`);
    for (const inId of Object.keys(r.inputs)) {
      assert.ok(ITEMS[inId], `Input ${inId} for ${r.name} must be registered in items.js`);
    }
  }
});

test('Sprint 6: checkCraftRequirements correctly calculates material availability and missing items', () => {
  const machineSystem = new MachineSystem();
  const inventory = new InventorySystem(16);

  // Crafting table kit needs: 6 stone, 2 copper_ingot
  const checkEmpty = machineSystem.checkCraftRequirements('crafting_table_kit', inventory);
  assert.equal(checkEmpty.canCraft, false);
  assert.equal(checkEmpty.missing.stone, 6);
  assert.equal(checkEmpty.missing.copper_ingot, 2);
  assert.equal(checkEmpty.maxCraftable, 0);

  // Give partial materials
  inventory.addItem('stone', 12);
  inventory.addItem('copper_ingot', 3);

  const checkPartial = machineSystem.checkCraftRequirements('crafting_table_kit', inventory);
  assert.equal(checkPartial.canCraft, true);
  assert.equal(Object.keys(checkPartial.missing).length, 0);
  // stone: 12 / 6 = 2, copper_ingot: 3 / 2 = 1 => min = 1
  assert.equal(checkPartial.maxCraftable, 1);

  // Give more copper_ingot
  inventory.addItem('copper_ingot', 5); // total 8 copper_ingot => 8 / 2 = 4, stone 12 / 6 = 2 => min = 2
  const checkMore = machineSystem.checkCraftRequirements('crafting_table_kit', inventory);
  assert.equal(checkMore.maxCraftable, 2);
});

test('Sprint 6: craftItem executes player crafting, consumes inputs, and delivers output', () => {
  const machineSystem = new MachineSystem();
  machineSystem.registerMachine('crafting_table_1', 'crafting_table', 5, 5);
  const inventory = new InventorySystem(16);

  // Give resources for 1 conveyor_kit: 1 copper_ingot, 1 iron_ingot
  inventory.addItem('copper_ingot', 3);
  inventory.addItem('iron_ingot', 2);

  const result = machineSystem.craftItem('conveyor_kit', inventory, 'crafting_table_1', 1);
  assert.equal(result.success, true);
  assert.equal(result.outputItem, 'conveyor_kit');
  assert.equal(result.outputCount, 1);

  // Inventory should have 1 conveyor_kit, 2 copper_ingot, 1 iron_ingot
  assert.equal(inventory.getItemCount('conveyor_kit'), 1);
  assert.equal(inventory.getItemCount('copper_ingot'), 2);
  assert.equal(inventory.getItemCount('iron_ingot'), 1);
});

test('Sprint 6: craftItem supports batch / max crafting', () => {
  const machineSystem = new MachineSystem();
  const inventory = new InventorySystem(16);

  // Pickaxe needs: 4 stone, 2 wild_fiber
  inventory.addItem('stone', 12);
  inventory.addItem('wild_fiber', 6);

  // Craft 3 pickaxes in one call
  const result = machineSystem.craftItem('pickaxe', inventory, null, 3);
  assert.equal(result.success, true);
  assert.equal(result.outputItem, 'pickaxe');
  assert.equal(result.outputCount, 3);

  assert.equal(inventory.getItemCount('stone'), 0);
  assert.equal(inventory.getItemCount('wild_fiber'), 0);
  assert.equal(inventory.getItemCount('pickaxe'), 3);
});

test('Sprint 6: craftItem rejects when materials are insufficient or inventory is full', () => {
  const machineSystem = new MachineSystem();
  const inventory = new InventorySystem(1); // Capacity 1 slot

  // Put a different item in the only slot
  inventory.addItem('wheat', 5);

  // Insufficient materials check
  const failMats = machineSystem.craftItem('warehouse_depot_kit', inventory);
  assert.equal(failMats.success, false);
  assert.equal(failMats.reason, 'insufficient_materials');

  // Now give 12 stone and 4 iron_ingot (will need more slots)
  const fullInventory = new InventorySystem(2);
  fullInventory.addItem('stone', 12);
  fullInventory.addItem('iron_ingot', 4);
  // Both slots are occupied (slot 0: stone, slot 1: iron_ingot).
  // Notice warehouse_depot_kit is a new item and cannot fit in 2 slots because both slots are full!
  const failSpace = machineSystem.craftItem('warehouse_depot_kit', fullInventory);
  assert.equal(failSpace.success, false);
  assert.equal(failSpace.reason, 'inventory_full');
  // Materials must remain untouched
  assert.equal(fullInventory.getItemCount('stone'), 12);
  assert.equal(fullInventory.getItemCount('iron_ingot'), 4);
  assert.equal(fullInventory.getItemCount('warehouse_depot_kit'), 0);
});

test('Sprint 6: Crafting table kit can be crafted and placed into the world', () => {
  const machineSystem = new MachineSystem();
  const inventory = new InventorySystem(16);

  // Give materials for crafting table: 6 stone, 2 copper_ingot
  inventory.addItem('stone', 6);
  inventory.addItem('copper_ingot', 2);

  const result = machineSystem.craftItem('crafting_table_kit', inventory);
  assert.equal(result.success, true);
  assert.equal(inventory.getItemCount('crafting_table_kit'), 1);
  assert.equal(inventory.getItemCount('stone'), 0);
  assert.equal(inventory.getItemCount('copper_ingot'), 0);
});
