import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import TutorialSystem, { TUTORIAL_STEPS, TUTORIAL_REWARD, TUTORIAL_STORAGE_KEY } from '../src/systems/TutorialSystem.js';

function createMockScene() {
  const coins = { amount: 100 };
  const xp = { amount: 0, level: 1 };

  return {
    events: new UniversalEventEmitter(),
    inventorySystem: {
      getCoins: () => coins.amount,
      addCoins: (n) => { coins.amount += n; },
    },
    profileSystem: {
      get xp() { return xp.amount; },
      get level() { return xp.level; },
      addXp: (n) => { xp.amount += n; },
    },
    player: {
      tileX: 5,
      tileY: 5,
      getFacingTile: () => ({ x: 5, y: 6 }),
    },
    hud: {
      showMessage: () => {},
    },
    saveSystem: {
      saveLocal: () => {},
    },
  };
}

test('TutorialSystem: TUTORIAL_STEPS registry defines complete 6-step RPG onboarding', () => {
  assert.equal(TUTORIAL_STEPS.length, 6, 'Must have 6 clear RPG steps');
  
  const stepIds = TUTORIAL_STEPS.map(s => s.id);
  assert.deepEqual(stepIds, [
    'movement',
    'till_soil',
    'water_soil',
    'plant_seed',
    'visit_warehouse',
    'run_drone_code'
  ]);

  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.title, `Step ${step.id} has title`);
    assert.ok(step.dialog, `Step ${step.id} has Eli dialogue`);
    assert.ok(step.objective, `Step ${step.id} has objective prompt`);
    assert.ok(step.badge, `Step ${step.id} has badge indicator`);
  }
});

test('TutorialSystem: Old/Returning players are detected and tutorial is skipped', (t) => {
  // Mock localStorage
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  t.after(() => {
    delete globalThis.localStorage;
  });

  // 1. Returning player with progress (level 2, coins 500)
  const existingSave = {
    profile: { level: 2, xp: 120 },
    inventory: { coins: 500 },
    unlockedZones: { zone2: true },
  };

  assert.equal(
    TutorialSystem.shouldSkipForReturningPlayer(existingSave),
    true,
    'Existing player with level 2 must be skipped'
  );

  // 2. Returning player with existing modified grid
  storage.clear();
  const saveWithGrid = {
    profile: { level: 1, xp: 0 },
    inventory: { coins: 100 },
    grid: [{ x: 5, y: 5, isTilled: true }],
  };

  assert.equal(
    TutorialSystem.shouldSkipForReturningPlayer(saveWithGrid),
    true,
    'Player with pre-existing tilled farm tiles must be skipped'
  );

  // 3. Brand new player with no save
  storage.clear();
  assert.equal(
    TutorialSystem.shouldSkipForReturningPlayer(null),
    false,
    'Brand new player without save should receive tutorial'
  );

  // 4. Fresh virgin save
  storage.clear();
  const freshSave = {
    profile: { level: 1, xp: 0 },
    inventory: { coins: 100 },
    grid: [],
    buildings: [],
    unlockedZones: { zone2: false, zone3: false },
  };

  assert.equal(
    TutorialSystem.shouldSkipForReturningPlayer(freshSave),
    false,
    'Fresh save file should be eligible for tutorial'
  );
});

test('TutorialSystem: Step-by-step progress tracking from Step 1 to Completion', (t) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  t.after(() => {
    delete globalThis.localStorage;
  });

  const scene = createMockScene();
  const tutorial = new TutorialSystem(scene);
  tutorial.startIfEligible(null);

  assert.equal(tutorial.completed, false);
  assert.equal(tutorial.currentStepIndex, 0, 'Starts at step 0 (movement)');

  // Step 1: Movement
  tutorial.onPlayerMove(5, 6);
  tutorial.onPlayerMove(5, 7);
  tutorial.onPlayerMove(6, 7);
  assert.equal(tutorial.currentStepIndex, 1, 'Moved 3 tiles -> advanced to step 1 (till_soil)');

  // Step 2: Tilling soil
  tutorial.onTileTilled(6, 8);
  assert.equal(tutorial.currentStepIndex, 2, 'Tilled tile -> advanced to step 2 (water_soil)');

  // Step 3: Watering soil
  tutorial.onTileWatered(6, 8);
  assert.equal(tutorial.currentStepIndex, 3, 'Watered tile -> advanced to step 3 (plant_seed)');

  // Step 4: Planting seed
  tutorial.onSeedPlanted(6, 8, 'wheat_seed');
  assert.equal(tutorial.currentStepIndex, 4, 'Planted seed -> advanced to step 4 (visit_warehouse)');

  // Step 5: Visiting warehouse
  tutorial.onWarehouseOpened();
  assert.equal(tutorial.currentStepIndex, 5, 'Warehouse opened -> advanced to step 5 (run_drone_code)');

  // Step 6: Running drone code
  let completedEventFired = false;
  tutorial.events.on('tutorial-completed', () => {
    completedEventFired = true;
  });

  tutorial.onDroneStarted();
  assert.equal(tutorial.completed, true, 'Tutorial completed after running drone code');
  assert.equal(completedEventFired, true, 'tutorial-completed event emitted');

  // Verify rewards delivered
  assert.equal(scene.inventorySystem.getCoins(), 100 + TUTORIAL_REWARD.coins, 'Granted +150 tutorial coins');
  assert.equal(scene.profileSystem.xp, TUTORIAL_REWARD.xp, 'Granted +50 tutorial XP');

  // Verify localStorage marker
  assert.equal(localStorage.getItem(TUTORIAL_STORAGE_KEY), 'true', 'Permanently marked completed in localStorage');
});

test('TutorialSystem: Skip button immediately dismisses tutorial and marks complete', (t) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  t.after(() => {
    delete globalThis.localStorage;
  });

  const scene = createMockScene();
  const tutorial = new TutorialSystem(scene);
  tutorial.startIfEligible(null);

  assert.equal(tutorial.completed, false);
  tutorial.skip();

  assert.equal(tutorial.completed, true, 'Tutorial marked complete on skip');
  assert.equal(localStorage.getItem(TUTORIAL_STORAGE_KEY), 'true', 'Stored in localStorage on skip');
});

test('TutorialSystem: Persistence getSaveState and loadSaveState', (t) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  t.after(() => {
    delete globalThis.localStorage;
  });

  const scene1 = createMockScene();
  const tutorial1 = new TutorialSystem(scene1);
  tutorial1.startIfEligible(null);
  tutorial1.currentStepIndex = 3;

  const saveState = tutorial1.getSaveState();
  assert.equal(saveState.currentStepIndex, 3);
  assert.equal(saveState.completed, false);

  const scene2 = createMockScene();
  const tutorial2 = new TutorialSystem(scene2);
  tutorial2.loadSaveState(saveState);
  assert.equal(tutorial2.currentStepIndex, 3, 'Restored to step 3');
});
