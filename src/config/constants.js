/**
 * @fileoverview Game-wide constants for the farming RPG.
 * All magic numbers live here so they can be tuned in one place.
 */

// ── Grid & viewport ────────────────────────────────────────────────
export const TILE_SIZE = 32;
export const GRID_COLS = 60; // Expanded to 60 for Zone 1-4 exploration
export const GRID_ROWS = 60; // Zone 5 expands south from the mining cave
export const GAME_WIDTH = 640;  // Fixed viewport size
export const GAME_HEIGHT = 480; // Fixed viewport size
export const SCALE_FACTOR = 2;

// ── Growth system ──────────────────────────────────────────────────
export const GROWTH_TICK_MS = 5000;  // 5 seconds per growth tick
export const GROWTH_STAGES = 4;     // 0=seed, 1=sprout, 2=young, 3=mature

// ── Economy ────────────────────────────────────────────────────────
export const STARTING_COINS = 100;
export const MAX_SCRIPT_SLOTS = 10;

// ── Hotbar ─────────────────────────────────────────────────────────
export const HOTBAR_SLOTS = 8;

// ── Drone ──────────────────────────────────────────────────────────
export const DRONE_MOVE_SPEED = 200;       // ms per tile
export const DRONE_ACTION_DELAY = 300;     // ms per action
export const MAX_EXECUTION_STEPS = 10000;
export const DRONE_BASE_INVENTORY = 100;   // base carry capacity (harvest 100)
export const DRONE_SUPPLIER_BONUS = 9900;  // extra capacity with Supplier/Carrier module (total 10000)
export const DRONE_SELLER_BONUS = 400;     // extra capacity with Seller module (total 500)

// New module carry capacities
export const DRONE_BIGGER_SELLER_CAPACITY = 1000;
export const DRONE_SUPER_CARRIER_CAPACITY = 20000;

// ── Colour palette ─────────────────────────────────────────────────
export const COLORS = {
  GRASS: 0x4a7c59,
  TILLED: 0x9b794e,
  WATERED: 0x42535b,
  UI_BG: 0x101a21,
  UI_PANEL: 0x22343c,
  UI_ACCENT: 0x42535b,
  UI_HIGHLIGHT: 0x63d8d1,
  GOLD: 0xe9bf62,
  TEXT_PRIMARY: 0xedf0d4,
  TEXT_SECONDARY: 0x93a7a1,
  DRONE_GREEN: 0x63d8d1,
  DRONE_RED: 0xe9bf62,
};

// ── Zone Gates & Coordinates ───────────────────────────────────────
export const ZONE_BOUNDS = {
  zone1: { x1: 0, y1: 0, x2: 19, y2: 19 },
  zone2: { x1: 20, y1: 0, x2: 39, y2: 19 },
  zone3: { x1: 0, y1: 20, x2: 39, y2: 39 },
  zone4: { x1: 40, y1: 0, x2: 59, y2: 39 },
  zone5: { x1: 0, y1: 40, x2: 39, y2: 59 },
};

export const GATES = {
  gate2: { x: 19, y: 10, cost: 1000, level: 3, key: 'zone2' },
  gate3: { x: 10, y: 19, cost: 5000, level: 5, itemReq: 'bread', itemQty: 10, key: 'zone3' },
  gate4: { x: 39, y: 20, cost: 15000, level: 8, itemReqs: [{ id: 'copper_ingot', count: 5 }, { id: 'iron_ingot', count: 5 }], key: 'zone4' },
  gate5: { x: 20, y: 39, itemReqs: [{ id: 'stone', count: 10 }, { id: 'iron_ingot', count: 2 }], key: 'zone5' },
};
