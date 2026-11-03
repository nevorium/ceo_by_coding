import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_COLORS, pickScale, drawTerrain, drawView } from '../src/ui/MapRenderer.js';
import { GRID_COLS, GRID_ROWS, GATES } from '../src/config/constants.js';

// 12-color palette defined in DESIGN_REVIEW.md
const PALETTE_12 = new Set([
  '#101a21', '#22343c', '#42535b', '#93a7a1',
  '#edf0d4', '#a4b18b', '#244c3a', '#4a7c59',
  '#9b794e', '#e3ba83', '#63d8d1', '#e9bf62',
]);

function createMockContext2D() {
  const operations = [];
  const recordedColors = new Set();
  let currentFillStyle = '#000000';
  let currentStrokeStyle = '#000000';

  return {
    imageSmoothingEnabled: true,
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val) {
      currentFillStyle = String(val).toLowerCase();
      recordedColors.add(currentFillStyle);
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(val) {
      currentStrokeStyle = String(val).toLowerCase();
      recordedColors.add(currentStrokeStyle);
    },
    lineWidth: 1,
    fillRect(x, y, w, h) {
      operations.push({ type: 'fillRect', x, y, w, h, fillStyle: currentFillStyle });
    },
    strokeRect(x, y, w, h) {
      operations.push({ type: 'strokeRect', x, y, w, h, strokeStyle: currentStrokeStyle });
    },
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
      operations.push({ type: 'drawImage', sx, sy, sw, sh, dx, dy, dw, dh });
    },
    getRecordedColors() {
      return recordedColors;
    },
    getOperations() {
      return operations;
    },
  };
}

test('MapRenderer: pickScale clamps scale factor between min and max bounds', () => {
  // 60x60 grid
  assert.equal(pickScale(200, 200), 4, 'Clamps to min=4 when space is tight (200/60 = 3)');
  assert.equal(pickScale(360, 360), 6, 'Exact 6x scale for 360px (360/60 = 6)');
  assert.equal(pickScale(480, 480), 8, 'Exact 8x scale for 480px (480/60 = 8)');
  assert.equal(pickScale(900, 900), 10, 'Clamps to max=10 when space is huge (900/60 = 15)');
  assert.equal(pickScale(500, 300), 5, 'Uses minimum of width and height (300/60 = 5)');
});

test('MapRenderer: MAP_COLORS values are strictly subsets of the 12-color retro palette', () => {
  for (const [key, hex] of Object.entries(MAP_COLORS)) {
    assert.ok(
      PALETTE_12.has(hex.toLowerCase()),
      `MAP_COLORS.${key} (${hex}) must be an approved color from the 12-color palette in DESIGN_REVIEW.md`
    );
  }
});

test('MapRenderer: drawTerrain strictly uses 12-color palette and handles depleted ore nodes', () => {
  const ctx = createMockContext2D();

  // Mock grid with standard soil, depleted ore, active ore, building, and conveyor
  const mockTiles = Array.from({ length: GRID_ROWS }, (_, y) =>
    Array.from({ length: GRID_COLS }, (_, x) => {
      if (x === 5 && y === 5) return { isOre: false, oreType: 'depleted' }; // Depleted ore node
      if (x === 6 && y === 6) return { isOre: true, oreType: 'iron_node' }; // Active ore
      if (x === 7 && y === 7) return { isConveyor: true };
      if (x === 8 && y === 8) return { isBuilding: true };
      return { isTilled: false };
    })
  );

  const mockGrid = {
    getTile: (x, y) => mockTiles[y]?.[x] || null,
  };

  const mockNav = {
    isRevealed: (zoneKey) => zoneKey === 'zone1', // Zone 1 revealed, others fog
  };

  drawTerrain(ctx, mockNav, mockGrid);

  // Verify all recorded fill styles are strictly in the 12-color palette
  const recorded = ctx.getRecordedColors();
  for (const hex of recorded) {
    assert.ok(
      PALETTE_12.has(hex),
      `drawTerrain used non-palette color: ${hex}`
    );
  }

  // Verify depleted ore tile (5, 5) received MAP_COLORS.ore
  const ops = ctx.getOperations();
  const depletedTileOp = ops.find(op => op.x === 5 && op.y === 5);
  assert.ok(depletedTileOp);
  assert.equal(depletedTileOp.fillStyle, MAP_COLORS.ore.toLowerCase(), 'Depleted ore node must be drawn as ore');

  // Verify active ore tile (6, 6) received MAP_COLORS.ore
  const activeOreOp = ops.find(op => op.x === 6 && op.y === 6);
  assert.ok(activeOreOp);
  assert.equal(activeOreOp.fillStyle, MAP_COLORS.ore.toLowerCase());

  // Verify gates are rendered
  const gate2 = GATES.gate2;
  const gate2Op = ops.find(op => op.x === gate2.x && op.y === gate2.y);
  assert.ok(gate2Op, 'Gate 2 tile should be drawn');
  assert.equal(gate2Op.fillStyle, MAP_COLORS.gateLocked.toLowerCase(), 'Locked gate 2 is gold');
});

test('MapRenderer: drawView copies terrain buffer, renders entities, and handles player blinking', () => {
  const ctx = createMockContext2D();
  const terrainBuffer = { isCanvas: true };

  const markers = [
    { kind: 'player', id: 'player', x: 10, y: 10 },
    { kind: 'drone', id: 'drone-001', x: 12, y: 12 },
    { kind: 'hq', id: 'hq', x: 2, y: 2, w: 2, h: 2 },
    { kind: 'teleporter', id: 'tp-1', x: 15, y: 15 },
  ];

  const cameraRect = { x: 5, y: 5, w: 20, h: 15 };

  // Frame 1: blinkOn = true -> player is rendered
  drawView(ctx, terrainBuffer, markers, { scale: 2, cameraRect, blinkOn: true });

  const ops1 = ctx.getOperations();
  assert.ok(ops1.some(op => op.type === 'drawImage'), 'Terrain canvas buffer was drawn');

  const playerOp = ops1.find(op => op.type === 'fillRect' && op.x === 20 && op.y === 20);
  assert.ok(playerOp, 'Player rendered at scaled coordinates (10*2, 10*2)');
  assert.equal(playerOp.fillStyle, MAP_COLORS.player.toLowerCase());

  const droneOp = ops1.find(op => op.type === 'fillRect' && op.x === 24 && op.y === 24);
  assert.ok(droneOp, 'Drone rendered at (12*2, 12*2)');
  assert.equal(droneOp.fillStyle, MAP_COLORS.drone.toLowerCase());

  const hqOp = ops1.find(op => op.type === 'fillRect' && op.x === 4 && op.y === 4 && op.w === 4 && op.h === 4);
  assert.ok(hqOp, 'HQ warehouse rendered with scaled dimensions');
  assert.equal(hqOp.fillStyle, MAP_COLORS.building.toLowerCase());

  const viewOp = ops1.find(op => op.type === 'strokeRect');
  assert.ok(viewOp, 'Camera view boundary rendered');
  assert.equal(viewOp.strokeStyle, MAP_COLORS.view.toLowerCase());

  // Frame 2: blinkOn = false -> player is skipped
  const ctx2 = createMockContext2D();
  drawView(ctx2, terrainBuffer, markers, { scale: 2, cameraRect, blinkOn: false });
  const ops2 = ctx2.getOperations();
  const playerOp2 = ops2.find(op => op.type === 'fillRect' && op.x === 20 && op.y === 20);
  assert.equal(playerOp2, undefined, 'Player dot should not be rendered when blinkOn is false');
});

test('NavigationHUD: map popup open/close, toggle, and skips drawing when hidden', async () => {
  const previousDoc = globalThis.document;
  const elements = new Map();
  const getMockEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        hidden: true,
        dataset: { open: 'false' },
        classList: { add: () => {}, remove: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
        getContext: () => createMockContext2D(),
      });
    }
    return elements.get(id);
  };

  let isDocHidden = false;
  globalThis.document = {
    get hidden() {
      return isDocHidden;
    },
    getElementById: (id) => getMockEl(id),
    createElement: () => ({
      width: 60,
      height: 60,
      getContext: () => createMockContext2D(),
    }),
    documentElement: {
      style: { setProperty: () => {}, removeProperty: () => {} },
    },
  };

  try {
    const scene = {
      events: { once: () => {} },
      gridManager: { getTile: () => null },
    };
    const navSys = {
      events: { on: () => {}, off: () => {} },
      getPlayerPosition: () => ({ x: 5, y: 5, zoneKey: 'zone1', zoneLabel: 'Kebun Perintis' }),
      getMarkers: () => [{ kind: 'player', x: 5, y: 5 }],
      isRevealed: () => true,
    };

    const { default: NavigationHUD } = await import('../src/ui/NavigationHUD.js');
    const hud = new NavigationHUD(scene, navSys);

    assert.equal(hud.isWorldMapOpen(), false, 'Map starts closed');

    hud.openWorldMap();
    assert.equal(hud.isWorldMapOpen(), true, 'Map is open after openWorldMap()');

    hud.closeWorldMap();
    assert.equal(hud.isWorldMapOpen(), false, 'Map is closed after closeWorldMap()');

    hud.toggleWorldMap();
    assert.equal(hud.isWorldMapOpen(), true, 'Map is toggled to open');

    hud.toggleWorldMap();
    assert.equal(hud.isWorldMapOpen(), false, 'Map is toggled to closed');

    // Test hidden document skip
    isDocHidden = true;
    let drawCallHappened = false;
    hud.minimapCtx = {
      drawImage: () => { drawCallHappened = true; },
      fillRect: () => {},
    };
    hud.render();
    assert.equal(drawCallHappened, false, 'Should skip rendering when document.hidden is true');

    hud.destroy();
  } finally {
    globalThis.document = previousDoc;
  }
});

