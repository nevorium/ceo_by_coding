import ZoneMap from '../systems/ZoneMap.js';
import { GRID_COLS, GRID_ROWS, GATES } from '../config/constants.js';

/**
 * Palette of colors strictly sourced from the 12-color palette defined in DESIGN_REVIEW.md:
 * #101a21, #22343c, #42535b, #93a7a1, #edf0d4, #a4b18b, #244c3a, #4a7c59, #9b794e, #e3ba83, #63d8d1, #e9bf62
 */
export const MAP_COLORS = Object.freeze({
  fog: '#101a21',        // ink
  ground: '#244c3a',     // forest
  fence: '#9b794e',      // earth
  gateLocked: '#e9bf62', // gold
  gateOpen: '#e3ba83',   // sand
  ore: '#93a7a1',        // silver
  building: '#e3ba83',   // sand
  conveyor: '#42535b',   // steel
  teleporter: '#63d8d1', // cyan
  cache: '#a4b18b',      // sage
  drone: '#e9bf62',      // gold
  player: '#edf0d4',     // cream
  view: '#93a7a1',       // silver
  tilled: '#9b794e',     // earth
  plant: '#4a7c59',      // forest
  harvest: '#e9bf62',    // gold
  pin: '#63d8d1',        // cyan
});

/**
 * Calculate largest integer scale that fits within available width & height.
 * Pure function.
 * @param {number} availW - Available container width in px
 * @param {number} availH - Available container height in px
 * @param {{ min?: number, max?: number }} [options]
 * @returns {number} Integer scale factor (e.g. 4 to 10)
 */
export function pickScale(availW, availH, { min = 4, max = 10 } = {}) {
  const safeW = Math.max(0, availW);
  const safeH = Math.max(0, availH);
  const byDim = Math.floor(Math.min(safeW, safeH) / GRID_COLS);
  return Math.max(min, Math.min(max, byDim));
}

/**
 * BASE LAYER (Terrain): 1px = 1 tile (60x60).
 * Redrawn ONLY when buildings, zones, or gates change.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../systems/NavigationSystem.js').default} nav
 * @param {import('../systems/GridManager.js').default} grid
 */
export function drawTerrain(ctx, nav, grid, { showFarm = false } = {}) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const zoneKey = ZoneMap.getZoneAt(x, y);
      const revealed = nav ? nav.isRevealed(zoneKey) : false;
      const tile = grid?.getTile ? grid.getTile(x, y) : null;

      let color = revealed ? MAP_COLORS.ground : MAP_COLORS.fog;

      if (ZoneMap.isGateTile(x, y)) {
        const gate = ZoneMap.getGateAt(x, y);
        const isLocked = typeof tile?.isLocked === 'boolean'
          ? tile.isLocked
          : (nav ? !nav.isRevealed(gate.key) : true);
        color = isLocked ? MAP_COLORS.gateLocked : MAP_COLORS.gateOpen;
      } else if (ZoneMap.isFenceTile(x, y)) {
        color = MAP_COLORS.fence;
      } else if (revealed && tile) {
        if (tile.isOre || tile.oreType === 'depleted') {
          color = MAP_COLORS.ore;
        } else if (tile.isConveyor) {
          color = MAP_COLORS.conveyor;
        } else if (tile.isBuilding || tile.isMachine) {
          color = MAP_COLORS.building;
        } else if (showFarm && (tile.hasPlant || tile.plant)) {
          color = (tile.hasFruit || (tile.growthStage ?? 0) >= 3) ? MAP_COLORS.harvest : MAP_COLORS.plant;
        } else if (showFarm && (tile.isTilled || tile.isWatered)) {
          color = MAP_COLORS.tilled;
        }
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * DYNAMIC LAYER: Copies base terrain, renders markers, and draws camera viewport rect.
 * @param {CanvasRenderingContext2D} ctx - Target 2D canvas context
 * @param {HTMLCanvasElement|object} terrainCanvas - 60x60 base terrain canvas buffer
 * @param {Array<object>} markers - List of entities from NavigationSystem.getMarkers()
 * @param {object} options
 * @param {number} [options.scale=1] - Pixel scale (1 for minimap thumbnail, 4-10 for big map)
 * @param {{ x: number, y: number, w: number, h: number }|null} [options.cameraRect=null]
 * @param {boolean} [options.blinkOn=true] - Player blinking state (500ms cycle)
 * @param {boolean} [options.travelMode=false] - Whether teleporter pad targets should pulse
 */
export function drawView(ctx, terrainCanvas, markers = [], { scale = 1, cameraRect = null, blinkOn = true, travelMode = false } = {}) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  // 1. Copy terrain canvas
  if (terrainCanvas) {
    ctx.drawImage(terrainCanvas, 0, 0, GRID_COLS, GRID_ROWS, 0, 0, GRID_COLS * scale, GRID_ROWS * scale);
  } else {
    ctx.fillStyle = MAP_COLORS.fog;
    ctx.fillRect(0, 0, GRID_COLS * scale, GRID_ROWS * scale);
  }

  // 2. Render markers
  for (const m of markers) {
    if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') continue;

    const sx = m.x * scale;
    const sy = m.y * scale;
    const sw = (m.w || 1) * scale;
    const sh = (m.h || 1) * scale;

    switch (m.kind) {
      case 'player':
        if (blinkOn) {
          ctx.fillStyle = MAP_COLORS.player;
          ctx.fillRect(sx, sy, Math.max(1, scale), Math.max(1, scale));
        }
        break;

      case 'drone':
        ctx.fillStyle = MAP_COLORS.drone;
        ctx.fillRect(sx, sy, Math.max(1, scale), Math.max(1, scale));
        break;

      case 'hq':
      case 'market':
      case 'depot':
        ctx.fillStyle = MAP_COLORS.building;
        ctx.fillRect(sx, sy, sw, sh);
        break;

      case 'teleporter':
        ctx.fillStyle = MAP_COLORS.teleporter;
        ctx.fillRect(sx, sy, Math.max(1, scale), Math.max(1, scale));
        if (travelMode && scale >= 3) {
          ctx.strokeStyle = blinkOn ? MAP_COLORS.player : MAP_COLORS.teleporter;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 1.5, sy - 1.5, Math.max(1, scale) + 3, Math.max(1, scale) + 3);
        }
        break;

      case 'cache':
        ctx.fillStyle = MAP_COLORS.cache;
        ctx.fillRect(sx, sy, Math.max(1, scale), Math.max(1, scale));
        break;

      case 'pin':
      case 'waypoint':
        ctx.fillStyle = MAP_COLORS.pin;
        ctx.fillRect(sx, sy, Math.max(1, scale), Math.max(1, scale));
        if (scale >= 3) {
          ctx.strokeStyle = MAP_COLORS.player;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 0.5, sy - 0.5, Math.max(1, scale) + 1, Math.max(1, scale) + 1);
        }
        break;

      default:
        break;
    }
  }

  // 3. Viewport rect (camera bounds)
  if (cameraRect && typeof cameraRect.x === 'number' && typeof cameraRect.y === 'number') {
    const rx = Math.round(cameraRect.x * scale);
    const ry = Math.round(cameraRect.y * scale);
    const rw = Math.round((cameraRect.w || 1) * scale);
    const rh = Math.round((cameraRect.h || 1) * scale);

    ctx.strokeStyle = MAP_COLORS.view;
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(1, rw - 1), Math.max(1, rh - 1));
  }
}
