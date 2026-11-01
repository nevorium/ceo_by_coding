/**
 * @fileoverview GridManager – owns the authoritative state of every tile
 * on the farm grid.  All tile mutations (till, water, plant, harvest)
 * go through this class so game rules are enforced in one place.
 */

import { GRID_COLS, GRID_ROWS, GROWTH_STAGES, GROWTH_TICK_MS } from '../config/constants.js';
import { PLANT_TYPES } from '../data/plants.js';
import { ZoneMap } from './ZoneMap.js';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Create a fresh, default tile state (grass, nothing planted).
 * @param {number} x  Column index.
 * @param {number} y  Row index.
 * @returns {TileState}
 */
function createDefaultTile(x, y) {
  return {
    x,
    y,
    isTilled: false,
    isWatered: false,
    hasPlant: false,
    plantType: null,
    growthStage: 0,
    growthTicksElapsed: 0,
    lastGrowthTime: 0,
    hasFruit: false,
    // Expansion fields
    isGate: false,
    gateKey: null,
    isLocked: false,
    isOre: false,
    oreType: null,
    oreMaxDurability: 0,
    oreCurrentDurability: 0,
    oreRespawnTimestamp: 0,
    isMachine: false,
    machineId: null,
    machineType: null,
    isConveyor: false,
    conveyorDir: null,
    conveyorItem: 'none',
    isBuilding: false,
    buildingId: null,
    buildingType: null,
  };
}

// ────────────────────────────────────────────────────────────────────
// GridManager
// ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TileState
 * @property {number}  x
 * @property {number}  y
 * @property {boolean} isTilled
 * @property {boolean} isWatered
 * @property {boolean} hasPlant
 * @property {string|null}  plantType       - key into PLANT_TYPES
 * @property {number}  growthStage          - 0‑3 (seed → mature)
 * @property {number}  growthTicksElapsed   - ticks accumulated so far
 * @property {number}  lastGrowthTime       - timestamp of last tick (ms)
 * @property {boolean} hasFruit             - true when a fruit‑type plant bears fruit
 */

export default class GridManager {
  /**
   * @param {number} [cols=GRID_COLS]
   * @param {number} [rows=GRID_ROWS]
   */
  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    /** @type {number} */
    this.cols = cols;
    /** @type {number} */
    this.rows = rows;

    /** @type {TileState[][]} 2‑D array [row][col] */
    this.tiles = [];

    this._initGrid();
  }

  // ── Initialisation ─────────────────────────────────────────────

  /** Build the blank grid. */
  _initGrid() {
    this.tiles = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        row.push(createDefaultTile(x, y));
      }
      this.tiles.push(row);
    }
  }

  // ── Accessors ──────────────────────────────────────────────────

  /**
   * Check whether (x, y) is inside the grid.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /**
   * Return the tile state at (x, y), or `null` if out of bounds.
   * @param {number} x  Column.
   * @param {number} y  Row.
   * @returns {TileState|null}
   */
  getTile(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[y][x];
  }

  /**
   * Set a tile as a gate checkpoint.
   * @param {number} x
   * @param {number} y
   * @param {string} gateKey
   * @param {boolean} isLocked
   */
  setGate(x, y, gateKey, isLocked) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.isGate = true;
      tile.gateKey = gateKey;
      tile.isLocked = isLocked;
    }
  }

  /**
   * Set a tile as an ore rock.
   * @param {number} x
   * @param {number} y
   * @param {string|null} oreType - 'coal'|'copper'|'iron'|'gold' or null to clear
   */
  setOre(x, y, oreType) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.isOre = oreType !== null && oreType !== 'depleted';
      tile.oreType = oreType;
      if (oreType && oreType !== 'depleted') {
        const durabilityMap = { stone: 3, coal: 5, copper: 6, iron: 8, gold: 12 };
        tile.oreMaxDurability = durabilityMap[oreType] || 5;
        tile.oreCurrentDurability = tile.oreMaxDurability;
      } else {
        tile.oreMaxDurability = 0;
        tile.oreCurrentDurability = 0;
      }
    }
  }

  /**
   * Set a tile as a conveyor belt.
   * @param {number} x
   * @param {number} y
   * @param {string|null} dir - 'up'|'down'|'left'|'right' or null to clear
   */
  setConveyor(x, y, dir) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.isConveyor = dir !== null;
      tile.conveyorDir = dir;
      if (dir === null) {
        tile.conveyorItem = 'none';
      }
    }
  }

  /**
   * Set a tile as a crafting machine refinery.
   * @param {number} x
   * @param {number} y
   * @param {string|null} machineId
   * @param {string|null} machineType
   */
  setMachine(x, y, machineId, machineType) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.isMachine = machineId !== null;
      tile.machineId = machineId;
      tile.machineType = machineType;
    }
  }

  /** Mark a tile occupied by a non-machine player building such as a depot. */
  setBuilding(x, y, buildingId, buildingType) {
    const tile = this.getTile(x, y);
    if (!tile) return;
    tile.isBuilding = buildingId !== null;
    tile.buildingId = buildingId;
    tile.buildingType = buildingType;
  }

  /** True only for an empty, reachable interior tile. */
  isBuildable(x, y) {
    if (!this.inBounds(x, y) || x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) return false;
    const tile = this.getTile(x, y);
    return Boolean(tile && !tile.isGate && !tile.isOre && !tile.isMachine && !tile.isConveyor && !tile.isBuilding && !tile.hasPlant);
  }

  /**
   * Determine if a tile is walkable by player or drones.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isWalkable(x, y, isDrone = false) {
    if (!this.inBounds(x, y)) return false;
    const tile = this.tiles[y][x];
    if (!tile) return false;

    // 1 & 2. Check fences via ZoneMap
    if (ZoneMap.isFenceTile(x, y, this.cols, this.rows)) {
      return false;
    }

    // 3. Check gate lock state
    if (tile.isGate && tile.isLocked) {
      return false;
    }

    // 4. Check ores & machines
    if (tile.isMachine || tile.isBuilding) {
      return false;
    }
    if (tile.isOre) {
      if (isDrone) return true; // Drones can fly over ore nodes to mine them!
      return false;
    }

    return true;
  }

  // ── Tile mutations ─────────────────────────────────────────────

  /**
   * Till a grass tile so it can accept water / seeds.
   * @param {number} x
   * @param {number} y
   * @returns {boolean} `true` if the tile was successfully tilled.
   */
  tillTile(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;

    // Cannot till gates, ores, machines, conveyors or fences
    if (tile.isGate || tile.isOre || tile.isMachine || tile.isConveyor) return false;

    // Check fences (boundary and partition fences)
    if (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1) return false;
    if (x === 19 && y >= 0 && y <= 19) return false;
    if (y === 19 && x >= 0 && x <= 39) return false;
    if (x === 39 && y >= 0 && y <= 39) return false;

    // Can only till un-tilled, un-planted grass
    if (tile.isTilled || tile.hasPlant) return false;

    tile.isTilled = true;
    return true;
  }

  /**
   * Water a tilled tile.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  waterTile(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;

    // Cannot water gates, ores, machines, conveyors or fences
    if (tile.isGate || tile.isOre || tile.isMachine || tile.isConveyor) return false;

    // Check fences
    if (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1) return false;
    if (x === 19 && y >= 0 && y <= 19) return false;
    if (y === 19 && x >= 0 && x <= 39) return false;
    if (x === 39 && y >= 0 && y <= 39) return false;

    if (!tile.isTilled) return false;
    if (tile.isWatered) return false;

    tile.isWatered = true;
    return true;
  }

  /**
   * Plant a seed on a tilled + watered tile that has no plant.
   * @param {number} x
   * @param {number} y
   * @param {string} plantType  Key in PLANT_TYPES.
   * @returns {boolean}
   */
  plantSeed(x, y, plantType) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (!tile.isTilled || !tile.isWatered) return false;
    if (tile.hasPlant) return false;
    if (!PLANT_TYPES[plantType]) return false;

    tile.hasPlant = true;
    tile.plantType = plantType;
    tile.growthStage = 0;
    tile.growthTicksElapsed = 0;
    tile.lastGrowthTime = Date.now();
    tile.hasFruit = false;

    return true;
  }

  // ── Harvest helpers ────────────────────────────────────────────

  /**
   * Can a non‑fruit plant at (x, y) be cropped (fully mature)?
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  canCrop(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.hasPlant) return false;
    const def = PLANT_TYPES[tile.plantType];
    if (!def || def.type === 'fruit') return false;
    return tile.growthStage >= GROWTH_STAGES - 1;
  }

  /**
   * Can a fruit‑bearing plant at (x, y) be harvested for fruit?
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  canHarvest(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.hasPlant) return false;
    const def = PLANT_TYPES[tile.plantType];
    if (!def || def.type !== 'fruit') return false;
    return tile.hasFruit === true;
  }

  /**
   * Harvest (crop) a **non‑fruit** plant.
   *  • If the plant is fully grown → reset the tile and return `true`.
   *  • If the plant is NOT fully grown (premature harvest) → reset tile
   *    anyway but the caller should give reduced / zero yield.
   * @param {number} x
   * @param {number} y
   * @returns {{ success: boolean, premature: boolean }}
   */
  cropPlant(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.hasPlant) return { success: false, premature: false };
    const def = PLANT_TYPES[tile.plantType];
    if (!def || def.type === 'fruit') return { success: false, premature: false };

    const fullyGrown = tile.growthStage >= GROWTH_STAGES - 1;

    // Either way the tile resets
    this.resetTile(x, y);
    return { success: true, premature: !fullyGrown };
  }

  /**
   * Harvest fruit from a fruit‑bearing plant.
   * The plant stays; only `hasFruit` is cleared so regrowth can begin.
   * @param {number} x
   * @param {number} y
   * @returns {boolean} `true` if fruit was successfully picked.
   */
  harvestFruit(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.hasPlant) return false;
    const def = PLANT_TYPES[tile.plantType];
    if (!def || def.type !== 'fruit') return false;
    if (!tile.hasFruit) return false;

    tile.hasFruit = false;
    // Reset ticks so regrow timer starts fresh
    tile.growthTicksElapsed = 0;
    tile.lastGrowthTime = Date.now();
    return true;
  }

  /**
   * Reset a tile back to bare grass.
   * @param {number} x
   * @param {number} y
   */
  resetTile(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return;
    Object.assign(tile, createDefaultTile(x, y));
  }

  // ── Growth update ──────────────────────────────────────────────

  /**
   * Advance plant growth across the entire grid.
   * Should be called once per frame (or periodically).
   * @param {number} currentTime  Current timestamp in ms (e.g. Date.now()).
   */
  update(currentTime) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const tile = this.tiles[y][x];
        if (!tile.hasPlant) continue;

        const def = PLANT_TYPES[tile.plantType];
        if (!def) continue;

        // How many ticks have elapsed since last growth check?
        const elapsed = currentTime - tile.lastGrowthTime;
        if (elapsed < GROWTH_TICK_MS) continue;

        // How many whole ticks fit into the elapsed time
        const ticksToApply = Math.floor(elapsed / GROWTH_TICK_MS);
        tile.lastGrowthTime += ticksToApply * GROWTH_TICK_MS;

        // ── Fruit regrowth path ───────────────────────────────
        if (def.type === 'fruit' && tile.growthStage >= GROWTH_STAGES - 1 && !tile.hasFruit) {
          tile.growthTicksElapsed += ticksToApply;
          if (tile.growthTicksElapsed >= def.regrowTicks) {
            tile.hasFruit = true;
            tile.growthTicksElapsed = 0;
          }
          continue;
        }

        // ── Normal growth path ────────────────────────────────
        if (tile.growthStage < GROWTH_STAGES - 1) {
          tile.growthTicksElapsed += ticksToApply;

          // Determine how many ticks per stage
          const ticksPerStage = Math.ceil(def.growthTicks / (GROWTH_STAGES - 1));

          while (
            tile.growthStage < GROWTH_STAGES - 1 &&
            tile.growthTicksElapsed >= ticksPerStage
          ) {
            tile.growthTicksElapsed -= ticksPerStage;
            tile.growthStage += 1;
          }

          // When a fruit plant reaches maturity, it immediately bears fruit
          if (def.type === 'fruit' && tile.growthStage >= GROWTH_STAGES - 1) {
            tile.hasFruit = true;
            tile.growthTicksElapsed = 0;
          }
        }
      }
    }
  }

  /**
   * Run one logic tick for all conveyor belts.
   * @param {Phaser.Scene} scene
   */
  tickConveyorItems(scene) {
    // 1. Gather all conveyor tiles with items
    const movingItems = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const tile = this.tiles[y][x];
        if (tile.isConveyor && tile.conveyorItem && tile.conveyorItem !== 'none') {
          movingItems.push({
            fromTile: tile,
            x,
            y,
            item: tile.conveyorItem,
            dir: tile.conveyorDir
          });
        }
      }
    }

    // 2. Resolve movements recursively to handle chains correctly
    const resolved = new Set();
    const resolveMove = (moveInfo) => {
      if (resolved.has(moveInfo)) return;
      resolved.add(moveInfo);

      let dx = 0, dy = 0;
      if (moveInfo.dir === 'up') dy = -1;
      else if (moveInfo.dir === 'down') dy = 1;
      else if (moveInfo.dir === 'left') dx = -1;
      else if (moveInfo.dir === 'right') dx = 1;

      const tx = moveInfo.x + dx;
      const ty = moveInfo.y + dy;

      if (!this.inBounds(tx, ty)) return;

      const targetTile = this.getTile(tx, ty);

      // Warehouse or crafted depot deposit (both use the shared warehouse stock).
      const storage = scene?.buildingSystem?.getStorageAt(tx, ty)
        || (scene?.warehouse?.containsTile(tx, ty) ? scene.warehouse : null);
      if (storage) {
        storage.deposit(moveInfo.item, 1);
        moveInfo.fromTile.conveyorItem = 'none';
        if (scene.updateTileSprite) scene.updateTileSprite(moveInfo.x, moveInfo.y);
        return;
      }

      // Machine deposit
      if (targetTile && targetTile.isMachine && targetTile.machineId) {
        if (scene && scene.machineSystem) {
          const deposited = scene.machineSystem.deposit(targetTile.machineId, moveInfo.item, 1);
          if (deposited > 0) {
            moveInfo.fromTile.conveyorItem = 'none';
            if (scene.updateTileSprite) scene.updateTileSprite(moveInfo.x, moveInfo.y);
          }
        }
        return;
      }

      // Conveyor movement
      if (targetTile && targetTile.isConveyor) {
        if (targetTile.conveyorItem !== 'none') {
          // If the target tile also wants to move, resolve it first!
          const targetMove = movingItems.find(m => m.fromTile === targetTile);
          if (targetMove) {
            resolveMove(targetMove);
          }
        }
        // Check if target slot is now clear
        if (targetTile.conveyorItem === 'none') {
          targetTile.conveyorItem = moveInfo.item;
          moveInfo.fromTile.conveyorItem = 'none';
          if (scene.updateTileSprite) {
            scene.updateTileSprite(moveInfo.x, moveInfo.y);
            scene.updateTileSprite(tx, ty);
          }
        }
      }
    };

    for (const move of movingItems) {
      resolveMove(move);
    }

    // 3. Machine auto-output to adjacent empty conveyor belts pointing away
    if (scene?.machineSystem?.machines) {
      for (const machine of scene.machineSystem.machines.values()) {
        if (!machine.outputBuffer || machine.outputBuffer.size === 0) continue;

        let outputItemId = null;
        for (const [id, count] of machine.outputBuffer.entries()) {
          if (count > 0) {
            outputItemId = id;
            break;
          }
        }
        if (!outputItemId) continue;

        const neighbors = [
          { dx: 0, dy: -1, oppositeDir: 'down' },
          { dx: 0, dy: 1, oppositeDir: 'up' },
          { dx: -1, dy: 0, oppositeDir: 'right' },
          { dx: 1, dy: 0, oppositeDir: 'left' },
        ];

        for (const n of neighbors) {
          const cx = machine.x + n.dx;
          const cy = machine.y + n.dy;
          if (!this.inBounds(cx, cy)) continue;

          const belt = this.getTile(cx, cy);
          if (belt && belt.isConveyor && belt.conveyorItem === 'none') {
            if (belt.conveyorDir !== n.oppositeDir) {
              belt.conveyorItem = outputItemId;
              const currentCount = machine.outputBuffer.get(outputItemId);
              if (currentCount <= 1) {
                machine.outputBuffer.delete(outputItemId);
              } else {
                machine.outputBuffer.set(outputItemId, currentCount - 1);
              }
              if (scene.updateTileSprite) {
                scene.updateTileSprite(cx, cy);
              }
              break;
            }
          }
        }
      }
    }
  }
}
