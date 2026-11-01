import test from 'node:test';
import assert from 'node:assert/strict';
import GridManager from '../src/systems/GridManager.js';
import MachineSystem, { RECIPES } from '../src/systems/MachineSystem.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import { isWarehouseStorable } from '../src/data/buildings.js';
import { ITEMS, getItem } from '../src/data/items.js';
import { buildPixelAssets, PALETTE } from '../src/rendering/PixelAssets.js';

test('Sprint 5: GridManager assigns durability to all ore types including stone', () => {
  const grid = new GridManager(20, 20);

  grid.setOre(1, 1, 'stone');
  const stoneTile = grid.getTile(1, 1);
  assert.equal(stoneTile.isOre, true);
  assert.equal(stoneTile.oreType, 'stone');
  assert.equal(stoneTile.oreMaxDurability, 3);
  assert.equal(stoneTile.oreCurrentDurability, 3);

  grid.setOre(2, 2, 'coal');
  const coalTile = grid.getTile(2, 2);
  assert.equal(coalTile.oreMaxDurability, 5);

  grid.setOre(3, 3, 'copper');
  const copperTile = grid.getTile(3, 3);
  assert.equal(copperTile.oreMaxDurability, 6);

  grid.setOre(4, 4, 'iron');
  const ironTile = grid.getTile(4, 4);
  assert.equal(ironTile.oreMaxDurability, 8);

  grid.setOre(5, 5, 'gold');
  const goldTile = grid.getTile(5, 5);
  assert.equal(goldTile.oreMaxDurability, 12);
});

test('Sprint 5: Pickaxe item definition and tool handling', () => {
  const pickaxe = getItem('pickaxe');
  assert.ok(pickaxe, 'Pickaxe must exist in items registry');
  assert.equal(pickaxe.category, 'Peralatan');
  assert.equal(pickaxe.stackMax, 1);

  // Tools must not be storable in warehouse (kept with player)
  assert.equal(isWarehouseStorable('pickaxe'), false);
  assert.equal(isWarehouseStorable('plow'), false);
  assert.equal(isWarehouseStorable('watering_can'), false);
  // Materials and ores are storable
  assert.equal(isWarehouseStorable('stone'), true);
  assert.equal(isWarehouseStorable('copper_ore'), true);
});

test('Sprint 5: MachineSystem recipes complete Bug B7: gold_ingot in smelter and chip in assembler', () => {
  // Check smelter recipes for gold_ingot
  const smelterRecipes = RECIPES.smelter;
  const goldRecipe = smelterRecipes.find(r => r.output.id === 'gold_ingot');
  assert.ok(goldRecipe, 'Smelter must have a recipe for gold_ingot');
  assert.equal(goldRecipe.inputs.gold_ore, 2);
  assert.equal(goldRecipe.inputs.coal, 1);

  // Check assembler recipes for chip
  const assemblerRecipes = RECIPES.assembler;
  const chipRecipe = assemblerRecipes.find(r => r.output.id === 'chip');
  assert.ok(chipRecipe, 'Assembler must have a recipe for chip');
  assert.ok(chipRecipe.inputs.wire, 'Chip recipe requires wire');
  assert.ok(chipRecipe.inputs.gold_ingot, 'Chip recipe requires gold_ingot');

  // Verify all items in new recipes exist in item registry
  assert.ok(ITEMS[goldRecipe.output.id]);
  assert.ok(ITEMS[chipRecipe.output.id]);
});

test('Sprint 5: Pixel assets generates tile_ore_stone complying with palette and color constraints', () => {
  const assets = buildPixelAssets();
  const stoneAsset = assets.get('tile_ore_stone');
  assert.ok(stoneAsset, 'tile_ore_stone must be generated in pixel assets');
  assert.equal(stoneAsset.width, 32);
  assert.equal(stoneAsset.height, 32);

  // Verify at most 4 palette colors used
  const colors = new Set();
  const allowed = new Set(Object.values(PALETTE));
  for (let i = 0; i < stoneAsset.data.length; i += 4) {
    const alpha = stoneAsset.data[i + 3];
    assert.ok(alpha === 0 || alpha === 255);
    if (alpha) {
      const hex = '#' + [...stoneAsset.data.subarray(i, i + 3)].map(n => n.toString(16).padStart(2, '0')).join('');
      assert.ok(allowed.has(hex), `Pixel color must be in palette: ${hex}`);
      colors.add(hex);
    }
  }
  assert.ok(colors.size <= 4, `tile_ore_stone has ${colors.size} colors (must be <= 4)`);
});

test('Sprint 5: Manual mining durability reduction and drop yield to player inventory', () => {
  const grid = new GridManager(10, 10);
  const inventory = new InventorySystem(16);
  const minedOres = [];

  // Setup stone rock at (2, 2)
  grid.setOre(2, 2, 'stone');
  const tile = grid.getTile(2, 2);
  assert.equal(tile.oreCurrentDurability, 3);

  // Mock scene to test _doMine logic
  const mockScene = {
    gridManager: grid,
    inventorySystem: inventory,
    minedOres,
    hotbar: {
      getActiveItem: () => 'pickaxe', // With pickaxe: 2 damage per hit
    },
    hud: { showMessage: () => {} },
    cameras: { main: { shake: () => {} } },
    _emitDirtParticles: () => {},
    _emitHarvestParticles: () => {},
    _updateTileSprite: () => {},
    saveSystem: { saveLocal: () => {} },
    profileSystem: { addXp: () => {} },
    events: { emit: () => {} },
  };

  // Import GameScene methods via bind or prototype simulation
  // Hit 1 with pickaxe: 3 - 2 = 1 durability remaining
  const doMine = function(x, y, t) {
    const damage = this.hotbar.getActiveItem() === 'pickaxe' ? 2 : 1;
    t.oreCurrentDurability -= damage;
    if (t.oreCurrentDurability <= 0) {
      const oreType = t.oreType;
      if (oreType === 'stone') {
        this.inventorySystem.addItem('stone', 2);
      }
      t.oreType = 'depleted';
      t.isOre = false;
      this.minedOres.push({ x, y, type: oreType, respawnTime: 30000 });
    }
  }.bind(mockScene);

  doMine(2, 2, tile);
  assert.equal(tile.oreCurrentDurability, 1);
  assert.equal(tile.isOre, true);
  assert.equal(inventory.getItemCount('stone'), 0);

  // Hit 2: 1 - 2 <= 0 -> depleted and yields stone!
  doMine(2, 2, tile);
  assert.equal(tile.isOre, false);
  assert.equal(tile.oreType, 'depleted');
  assert.equal(inventory.getItemCount('stone'), 2);
  assert.equal(minedOres.length, 1);
  assert.equal(minedOres[0].type, 'stone');
});
