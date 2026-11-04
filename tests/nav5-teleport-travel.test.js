import test from 'node:test';
import assert from 'node:assert/strict';
import BuildingSystem from '../src/systems/BuildingSystem.js';
import TeleportSystem, { findArrivalTile } from '../src/systems/TeleportSystem.js';
import TeleporterUI from '../src/ui/TeleporterUI.js';
import GridManager from '../src/systems/GridManager.js';
import MachineSystem from '../src/systems/MachineSystem.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import { GRID_COLS, GRID_ROWS, TELEPORT } from '../src/config/constants.js';

function createMockDomElement(tag = 'div', id = '') {
  let text = '';
  let val = '';
  const dataset = {};
  const listeners = new Map();

  const el = {
    id,
    dataset,
    hidden: true,
    get textContent() { return text; },
    set textContent(v) { text = String(v); },
    get value() { return val; },
    set value(v) { val = String(v); },
    innerHTML: '',
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (!listeners.has(event)) return;
      listeners.set(event, listeners.get(event).filter(cb => cb !== fn));
    },
    trigger(event, data = {}) {
      for (const fn of listeners.get(event) || []) {
        fn({
          preventDefault: () => {},
          stopPropagation: () => {},
          target: { closest: (selector) => data.targetClosest ? data.targetClosest(selector) : null },
          ...data,
        });
      }
    },
    closest: (selector) => null,
  };
  return el;
}

function createMockScene(unlockedZones = { zone2: false, zone3: false, zone4: false, zone5: false }) {
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
      setFrame: () => obj,
      destroy: () => {},
    };
    return obj;
  };

  const sceneAdd = {
    rectangle: () => mockGameObject(),
    image: () => mockGameObject(),
    text: () => mockGameObject(),
  };

  const camera = {
    stopFollow: () => {},
    centerOn: () => {},
    startFollow: () => {},
    fadeIn: () => {},
    fadeOut: () => {},
  };

  const player = {
    tileX: 5,
    tileY: 5,
    x: 5 * 32 + 16,
    y: 5 * 32 + 16,
    isMoving: false,
    setTilePosition(tx, ty) {
      this.tileX = tx;
      this.tileY = ty;
      this.x = tx * 32 + 16;
      this.y = ty * 32 + 16;
    },
    getFacingTile() {
      return { x: this.tileX, y: this.tileY + 1 };
    },
  };

  const scene = {
    add: sceneAdd,
    gridManager,
    machineSystem,
    inventorySystem,
    unlockedZones: { ...unlockedZones },
    player,
    updateTileSprite: () => {},
    cameras: { main: camera },
    tweens: { killTweensOf: () => {} },
    input: { activePointer: { x: 0, y: 0 } },
    events: { once: () => {}, emit: () => {} },
    hud: { lastMessage: '', showMessage: (msg) => { scene.hud.lastMessage = msg; } },
    saveSystem: { saveLocal: () => {} },
    _emitPixelParticles: () => {},
    time: {
      now: 10000,
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (ms, cb) => cb(), // synchronous call in test
    },
  };

  scene.buildingSystem = new BuildingSystem(scene);
  scene.teleportSystem = new TeleportSystem(scene);

  return scene;
}

test('TeleportSystem: findArrivalTile priority and fallback ring', () => {
  const pad = { x: 10, y: 10 };
  const blocked = new Set();
  const isFree = (x, y) => !blocked.has(`${x},${y}`);

  // Free: bottom (10, 11)
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 10, y: 11 });

  // Block bottom -> right (11, 10)
  blocked.add('10,11');
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 11, y: 10 });

  // Block right -> left (9, 10)
  blocked.add('11,10');
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 9, y: 10 });

  // Block left -> top (10, 9)
  blocked.add('9,10');
  assert.deepEqual(findArrivalTile(pad, isFree), { x: 10, y: 9 });

  // Block all 4 -> ring 2
  blocked.add('10,9');
  const ring = findArrivalTile(pad, isFree);
  assert.ok(ring);
  assert.equal(Math.max(Math.abs(ring.x - pad.x), Math.abs(ring.y - pad.y)), 2);

  // Everything blocked -> null
  assert.equal(findArrivalTile(pad, () => false), null);
});

test('TeleportSystem: canTravel rejects missing, moving, cooldown, zone_locked, and blocked', () => {
  const scene = createMockScene({ zone2: false });
  scene.inventorySystem.addItem('teleporter_kit', 5);

  scene.buildingSystem.placeFromKit('teleporter_kit', 4, 4); // Pad 1 (TP-1)
  scene.buildingSystem.placeFromKit('teleporter_kit', 8, 8); // Pad 2 (TP-2)

  const pads = scene.teleportSystem.getPads();
  const p1 = pads[0].id;
  const p2 = pads[1].id;

  // 1. Missing or self
  assert.equal(scene.teleportSystem.canTravel('non_existent', p2).reason, 'missing');
  assert.equal(scene.teleportSystem.canTravel(p1, p1).reason, 'missing');

  // 2. Success case
  const okCheck = scene.teleportSystem.canTravel(p1, p2);
  assert.equal(okCheck.ok, true);
  assert.deepEqual(okCheck.arrival, { x: 8, y: 9 });

  // 3. Moving
  scene.player.isMoving = true;
  assert.equal(scene.teleportSystem.canTravel(p1, p2).reason, 'moving');
  scene.player.isMoving = false;

  scene.teleportSystem.traveling = true;
  assert.equal(scene.teleportSystem.canTravel(p1, p2).reason, 'moving');
  scene.teleportSystem.traveling = false;

  // 4. Cooldown
  scene.teleportSystem.lastTravelAt = scene.time.now - 1000; // Only 1s ago (cooldown is 3s)
  assert.equal(scene.teleportSystem.canTravel(p1, p2).reason, 'cooldown');
  scene.teleportSystem.lastTravelAt = scene.time.now - TELEPORT.COOLDOWN_MS; // Ready
  assert.equal(scene.teleportSystem.canTravel(p1, p2).ok, true);

  // 5. Zone locked (destination in locked Zone 2: x=25, y=5)
  // Force place pad in Zone 2 via restoring: true
  scene.buildingSystem.placeFromKit('teleporter_kit', 25, 5, 'right', { consume: false, id: 'tp_z2' });
  assert.equal(scene.teleportSystem.canTravel(p1, 'tp_z2').reason, 'zone_locked');

  // Unlock Zone 2 -> now allowed
  scene.unlockedZones.zone2 = true;
  assert.equal(scene.teleportSystem.canTravel(p1, 'tp_z2').ok, true);

  // 6. Blocked destination: block all arrival tiles around pad 2
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      scene.gridManager.setBuilding(8 + dx, 8 + dy, `wall_${dx}_${dy}`, 'wall');
    }
  }
  assert.equal(scene.teleportSystem.canTravel(p1, p2).reason, 'blocked');
});

test('TeleportSystem: travel updates player tile position and handles motion lock in try/finally', () => {
  const scene = createMockScene();
  scene.inventorySystem.addItem('teleporter_kit', 2);

  scene.buildingSystem.placeFromKit('teleporter_kit', 2, 2);
  scene.buildingSystem.placeFromKit('teleporter_kit', 12, 12);

  const pads = scene.teleportSystem.getPads();
  const p1 = pads[0].id;
  const p2 = pads[1].id;

  assert.equal(scene.player.tileX, 5);
  assert.equal(scene.player.tileY, 5);

  let travelEmitted = false;
  scene.teleportSystem.events.on('traveled', () => { travelEmitted = true; });

  const result = scene.teleportSystem.travel(p1, p2);
  assert.equal(result.ok, true);

  // Player position moved to arrival tile (bottom of (12, 12) -> (12, 13))
  assert.equal(scene.player.tileX, 12);
  assert.equal(scene.player.tileY, 13);
  assert.equal(scene.player.isMoving, false, 'Motion lock released in finally block');
  assert.equal(scene.teleportSystem.traveling, false);
  assert.equal(travelEmitted, true);
  assert.equal(scene.teleportSystem.lastTravelAt, scene.time.now);
});

test('TeleporterUI: displays destination list and handles travel click and rename', () => {
  const popupEl = createMockDomElement('section', 'teleporter-popup');
  const subtitleEl = createMockDomElement('span', 'teleporter-subtitle');
  const nameInput = createMockDomElement('input', 'teleporter-name-input');
  const saveBtn = createMockDomElement('button', 'btn-save-teleporter-name');
  const listEl = createMockDomElement('div', 'teleporter-list');

  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => {
      if (id === 'teleporter-popup') return popupEl;
      if (id === 'teleporter-subtitle') return subtitleEl;
      if (id === 'teleporter-name-input') return nameInput;
      if (id === 'btn-save-teleporter-name') return saveBtn;
      if (id === 'teleporter-list') return listEl;
      return null;
    },
  };

  try {
    const scene = createMockScene({ zone2: true });
    scene.panelManager = {
      register: () => {},
      open: () => { popupEl.hidden = false; popupEl.dataset.open = 'true'; },
      close: () => { popupEl.hidden = true; popupEl.dataset.open = 'false'; },
    };

    scene.inventorySystem.addItem('teleporter_kit', 3);
    scene.buildingSystem.placeFromKit('teleporter_kit', 3, 3); // Pad 1 (TP-1)
    scene.buildingSystem.placeFromKit('teleporter_kit', 7, 7); // Pad 2 (TP-2)

    const ui = new TeleporterUI(scene);
    const pads = scene.teleportSystem.getPads();

    // 1. Open UI for Pad 1
    ui.open(pads[0].id);
    assert.equal(ui.isOpen(), true);
    assert.equal(nameInput.value, 'TP-1');
    assert.ok(subtitleEl.textContent.includes('TP-1'));
    assert.ok(listEl.innerHTML.includes('TP-2'));
    assert.ok(listEl.innerHTML.includes('Teleport'));

    // 2. Rename Pad 1 to 'HQ Portal'
    nameInput.value = 'HQ Portal';
    saveBtn.trigger('click');
    assert.equal(pads[0].name, 'HQ Portal');
    assert.ok(scene.hud.lastMessage.includes('HQ Portal'));

    // 3. Trigger travel click to Pad 2
    listEl.trigger('click', {
      targetClosest: (sel) => (sel === '[data-dest-id]' ? { dataset: { destId: pads[1].id } } : null),
    });

    // UI should close and player should be teleported
    assert.equal(ui.isOpen(), false);
    assert.equal(scene.player.tileX, 7);
    assert.equal(scene.player.tileY, 8);
  } finally {
    globalThis.document = prevDoc;
  }
});
