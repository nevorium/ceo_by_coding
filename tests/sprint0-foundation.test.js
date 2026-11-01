import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, getItem } from '../src/data/items.js';
import { PLANT_TYPES } from '../src/data/plants.js';
import { RECIPES } from '../src/systems/MachineSystem.js';
import { MODULE_ITEM_IDS } from '../src/data/modules.js';
import { ZoneMap } from '../src/systems/ZoneMap.js';
import { GATES, GRID_COLS, GRID_ROWS } from '../src/config/constants.js';

test('Sprint 0: All plants and seeds exist in items.js', () => {
  for (const [plantKey, plant] of Object.entries(PLANT_TYPES)) {
    const seedId = `${plantKey}_seed`;
    assert.ok(ITEMS[seedId], `Seed ${seedId} must exist in items.js`);
    assert.ok(ITEMS[plantKey], `Crop ${plantKey} must exist in items.js`);
  }
});

test('Sprint 0: All machine recipe inputs and outputs exist in items.js', () => {
  for (const [machineType, recipeList] of Object.entries(RECIPES)) {
    const recipes = Array.isArray(recipeList) ? recipeList : [recipeList];
    for (const r of recipes) {
      for (const inputId of Object.keys(r.inputs)) {
        assert.ok(ITEMS[inputId], `Recipe input '${inputId}' on machine '${machineType}' must exist in items.js`);
      }
      if (r.output?.id) {
        assert.ok(ITEMS[r.output.id], `Recipe output '${r.output.id}' on machine '${machineType}' must exist in items.js`);
      }
    }
  }
});

test('Sprint 0: All modules in MODULE_ITEM_IDS exist in items.js', () => {
  for (const [key, itemId] of Object.entries(MODULE_ITEM_IDS)) {
    assert.ok(ITEMS[itemId], `Module item '${itemId}' (${key}) must exist in items.js`);
  }
});

test('Sprint 0: ZoneMap correctly identifies outer borders and gate openings', () => {
  // Outer perimeter must be fences
  assert.equal(ZoneMap.isFenceTile(0, 5, GRID_COLS, GRID_ROWS), true);
  assert.equal(ZoneMap.isFenceTile(GRID_COLS - 1, 5, GRID_COLS, GRID_ROWS), true);
  assert.equal(ZoneMap.isFenceTile(5, 0, GRID_COLS, GRID_ROWS), true);
  assert.equal(ZoneMap.isFenceTile(5, GRID_ROWS - 1, GRID_COLS, GRID_ROWS), true);

  // Gates should NOT be fences
  assert.equal(ZoneMap.isGateTile(GATES.gate2.x, GATES.gate2.y), true);
  assert.equal(ZoneMap.isFenceTile(GATES.gate2.x, GATES.gate2.y, GRID_COLS, GRID_ROWS), false);

  assert.equal(ZoneMap.isGateTile(GATES.gate3.x, GATES.gate3.y), true);
  assert.equal(ZoneMap.isFenceTile(GATES.gate3.x, GATES.gate3.y, GRID_COLS, GRID_ROWS), false);

  assert.equal(ZoneMap.isGateTile(GATES.gate4.x, GATES.gate4.y), true);
  assert.equal(ZoneMap.isFenceTile(GATES.gate4.x, GATES.gate4.y, GRID_COLS, GRID_ROWS), false);

  // Open farm area should not be a fence or gate
  assert.equal(ZoneMap.isFenceTile(5, 5, GRID_COLS, GRID_ROWS), false);
  assert.equal(ZoneMap.isGateTile(5, 5), false);
  assert.equal(ZoneMap.getZoneAt(5, 5), 'zone1');
});
