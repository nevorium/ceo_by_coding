import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import NavigationHUD, { getZoneShortCode } from '../src/ui/NavigationHUD.js';
import NavigationSystem from '../src/systems/NavigationSystem.js';

function createMockDomElement(initialText = '') {
  let text = initialText;
  let writeCount = 0;
  return {
    get textContent() {
      return text;
    },
    set textContent(val) {
      writeCount++;
      text = String(val);
    },
    getWriteCount() {
      return writeCount;
    },
    listeners: new Map(),
    addEventListener(event, fn) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (!this.listeners.has(event)) return;
      const list = this.listeners.get(event).filter(cb => cb !== fn);
      this.listeners.set(event, list);
    },
    trigger(event, data) {
      for (const fn of this.listeners.get(event) || []) {
        fn(data);
      }
    },
  };
}

test('NavigationHUD: getZoneShortCode maps zone keys to short codes', () => {
  assert.equal(getZoneShortCode('zone1'), 'Z1');
  assert.equal(getZoneShortCode('zone2'), 'Z2');
  assert.equal(getZoneShortCode('zone3'), 'Z3');
  assert.equal(getZoneShortCode('zone4'), 'Z4');
  assert.equal(getZoneShortCode('zone5'), 'Z5');
  assert.equal(getZoneShortCode(null), 'Z?');
  assert.equal(getZoneShortCode(undefined), 'Z?');
  assert.equal(getZoneShortCode('unknown_zone'), 'Z?');
});

test('NavigationHUD: update sets text and avoids redundant DOM writes', () => {
  const zEl = createMockDomElement('');
  const xEl = createMockDomElement('');
  const yEl = createMockDomElement('');
  const coordsBtn = createMockDomElement('');

  const previousDoc = globalThis.document;
  globalThis.document = {
    getElementById: id => {
      if (id === 'nav-z') return zEl;
      if (id === 'nav-x') return xEl;
      if (id === 'nav-y') return yEl;
      if (id === 'nav-coords') return coordsBtn;
      return null;
    },
    documentElement: {
      style: {
        setProperty: () => {},
        removeProperty: () => {},
      },
    },
  };

  try {
    const scene = { events: new UniversalEventEmitter() };
    const navSys = {
      events: new UniversalEventEmitter(),
      getPlayerPosition: () => ({ x: 5, y: 12, zoneKey: 'zone1', zoneLabel: 'Kebun Perintis' }),
    };

    const hud = new NavigationHUD(scene, navSys);

    // Initial populate happened in constructor
    assert.equal(zEl.textContent, 'Z1');
    assert.equal(xEl.textContent, '05');
    assert.equal(yEl.textContent, '12');
    assert.equal(hud.getCopyText(), '5, 12');

    const zWrites1 = zEl.getWriteCount();
    const xWrites1 = xEl.getWriteCount();
    const yWrites1 = yEl.getWriteCount();

    // Update with exact same position -> no DOM writes
    hud.update({ x: 5, y: 12, zoneKey: 'zone1', zoneLabel: 'Kebun Perintis' });
    assert.equal(zEl.getWriteCount(), zWrites1, 'Should not rewrite unchanged zone');
    assert.equal(xEl.getWriteCount(), xWrites1, 'Should not rewrite unchanged X');
    assert.equal(yEl.getWriteCount(), yWrites1, 'Should not rewrite unchanged Y');

    // Update with step in X (x: 6) -> only xEl rewritten
    hud.update({ x: 6, y: 12, zoneKey: 'zone1', zoneLabel: 'Kebun Perintis' });
    assert.equal(xEl.textContent, '06');
    assert.equal(xEl.getWriteCount(), xWrites1 + 1);
    assert.equal(yEl.getWriteCount(), yWrites1, 'Y write count unchanged');

    // Move to Unknown Quadrant (45, 45) -> zone is null -> 'Z?'
    hud.update({ x: 45, y: 45, zoneKey: null, zoneLabel: 'Wilayah Tak Dikenal' });
    assert.equal(zEl.textContent, 'Z?');
    assert.equal(xEl.textContent, '45');
    assert.equal(yEl.textContent, '45');
    assert.equal(hud.getCopyText(), '45, 45');

    hud.destroy();
  } finally {
    globalThis.document = previousDoc;
  }
});

test('NavigationHUD: listens to NavigationSystem position-changed and handles click to copy', async () => {
  const zEl = createMockDomElement('');
  const xEl = createMockDomElement('');
  const yEl = createMockDomElement('');
  const coordsBtn = createMockDomElement('');

  let copiedText = '';
  const prevClipboardDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async text => {
        copiedText = text;
        return true;
      },
    },
  });

  const previousDoc = globalThis.document;
  globalThis.document = {
    getElementById: id => {
      if (id === 'nav-z') return zEl;
      if (id === 'nav-x') return xEl;
      if (id === 'nav-y') return yEl;
      if (id === 'nav-coords') return coordsBtn;
      return null;
    },
    documentElement: {
      style: {
        setProperty: () => {},
        removeProperty: () => {},
      },
    },
  };

  try {
    const scene = {
      events: new UniversalEventEmitter(),
      player: { tileX: 14, tileY: 7 },
      unlockedZones: { zone2: false, zone3: false, zone4: false, zone5: false },
      hud: { showMessage: () => {} },
    };
    const navSys = new NavigationSystem(scene);
    const hud = new NavigationHUD(scene, navSys);

    // Initial position tick
    navSys.tick();
    assert.equal(xEl.textContent, '14');
    assert.equal(yEl.textContent, '07');
    assert.equal(zEl.textContent, 'Z1');

    // Trigger click on coordsBtn
    coordsBtn.trigger('click');
    await new Promise(r => setImmediate(r));
    assert.equal(copiedText, '14, 7', 'Clipboard received player coordinates');

    // Move player and tick
    scene.player.tileX = 22;
    scene.player.tileY = 5;
    navSys.tick();

    assert.equal(xEl.textContent, '22');
    assert.equal(yEl.textContent, '05');
    assert.equal(zEl.textContent, 'Z2');

    coordsBtn.trigger('click');
    await new Promise(r => setImmediate(r));
    assert.equal(copiedText, '22, 5');

    hud.destroy();
  } finally {
    globalThis.document = previousDoc;
    if (prevClipboardDesc) {
      Object.defineProperty(globalThis.navigator, 'clipboard', prevClipboardDesc);
    } else {
      delete globalThis.navigator.clipboard;
    }
  }
});
