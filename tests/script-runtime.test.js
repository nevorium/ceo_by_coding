import test from 'node:test';
import assert from 'node:assert/strict';
import ScriptSandbox from '../src/systems/ScriptSandbox.js';
import ScriptManager from '../src/systems/ScriptManager.js';

function runtime() {
  const drone = {
    status: 'idle', tileX: 1, tileY: 1, facing: 'down',
    scene: { machineSystem: { machines: new Map() } },
    droneInventory: { getAll: () => [] },
    setStatus(status) { this.status = status; },
  };
  const api = {
    drone,
    clearQueue() {},
    gridManager: { rows: 4, cols: 4, tiles: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ isTilled: false }))) },
    inventorySystem: { items: new Map(), getCoins: () => 100 },
    warehouse: { items: new Map() },
  };
  const sandbox = new ScriptSandbox(api, { getUpgradeValue: () => 10000 });
  return { sandbox, api, drone };
}

test('the existing interpreter executes JavaScript and forwards console output', () => {
  const { sandbox } = runtime();
  const messages = [];
  let result;
  sandbox.onLog = message => messages.push(message);
  sandbox.onComplete = value => { result = value; };
  sandbox.execute('var total = 0; for (var i = 0; i < 3; i++) total += i; console.log("total", total);');
  assert.equal(result.success, true);
  assert.deepEqual(messages, ['total 3']);
  assert.deepEqual(sandbox.getLogs(), messages);
});

test('syntax positions and runtime failures reach the error callbacks', () => {
  const cases = [
    ['var value = 1;\nvar = ;', /^Line 2: Error:/],
    ['var value = 1;\nmissingCommand();', /Error: missingCommand is not defined/],
  ];
  for (const [code, expectedError] of cases) {
    const { sandbox, drone } = runtime();
    let result;
    sandbox.onComplete = value => { result = value; };
    sandbox.execute(code);
    assert.equal(result.success, false);
    assert.match(result.error, expectedError);
    assert.equal(drone.status, 'error');
    assert.equal(sandbox.isRunning, false);
  }
});

test('async drone commands resume execution and STOP prevents later instructions', async () => {
  for (const stop of [false, true]) {
    const { sandbox, api } = runtime();
    let finishWait;
    api._handleWait = () => new Promise(resolve => { finishWait = resolve; });
    sandbox.execute('console.log("before"); drone.wait(1); console.log("after");');
    assert.deepEqual(sandbox.getLogs(), ['before']);
    assert.equal(sandbox.isRunning, true);
    if (stop) sandbox.stop();
    finishWait();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sandbox.getLogs(), stop ? ['before'] : ['before', 'after']);
    assert.equal(sandbox.isRunning, false);
  }
});

test('benchmark uses cloned game state without changing the live drone or tiles', () => {
  const { sandbox, api, drone } = runtime();
  const result = sandbox.benchmark('drone.move("right"); drone.till(); console.log("done");');
  assert.equal(result.success, true);
  assert.deepEqual(result.rates, {});
  assert.ok(result.simulatedDurationMs > 0);
  assert.equal(drone.tileX, 1);
  assert.equal(api.gridManager.tiles[1][2].isTilled, false);
});

test('script assignment and source code survive persistence without mixing scripts', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  try {
    const scripts = new ScriptManager();
    const first = scripts.getActiveScript();
    const second = scripts.createScript('Second');
    scripts.updateCode(first.id, 'console.log("first");');
    scripts.updateCode(second.id, 'console.log("second");');
    scripts.assignScriptToDrone(first.id, 'drone-001');
    scripts.assignScriptToDrone(second.id, 'drone-001');
    const restored = new ScriptManager();
    assert.equal(restored.getScript(first.id).assignedDroneId, null);
    assert.equal(restored.getScript(second.id).assignedDroneId, 'drone-001');
    assert.equal(restored.getScript(first.id).code, 'console.log("first");');
    const { sandbox } = runtime();
    sandbox.execute(restored.getScript(second.id).code);
    assert.deepEqual(sandbox.getLogs(), ['second']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
