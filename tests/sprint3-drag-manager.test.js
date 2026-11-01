import test from 'node:test';
import assert from 'node:assert/strict';
import DragManager, {
  calculateTilt,
  isThresholdExceeded,
  findMatchingDropTarget,
  DRAG_THRESHOLD,
  MAX_TILT_DEG
} from '../src/systems/DragManager.js';

test('Sprint 3: calculateTilt calculates smooth clamped velocity tilt', () => {
  assert.equal(calculateTilt(0), 0);
  assert.equal(calculateTilt(null), 0);
  assert.equal(calculateTilt(NaN), 0);

  const tilt10 = calculateTilt(10, 15, 0.35);
  assert.equal(tilt10, 3.5);

  const tiltMinus10 = calculateTilt(-10, 15, 0.35);
  assert.equal(tiltMinus10, -3.5);

  // Clamped at maxAngle
  assert.equal(calculateTilt(100, 15, 0.35), 15);
  assert.equal(calculateTilt(-100, 15, 0.35), -15);
});

test('Sprint 3: isThresholdExceeded prevents accidental drag on small clicks', () => {
  // Move 3px: less than threshold 5px
  assert.equal(isThresholdExceeded(100, 100, 103, 100, DRAG_THRESHOLD), false);
  assert.equal(isThresholdExceeded(100, 100, 102, 102, DRAG_THRESHOLD), false);

  // Move 5px exactly: threshold met
  assert.equal(isThresholdExceeded(100, 100, 105, 100, DRAG_THRESHOLD), true);

  // Move 20px: threshold exceeded
  assert.equal(isThresholdExceeded(100, 100, 115, 115, DRAG_THRESHOLD), true);
});

test('Sprint 3: findMatchingDropTarget matches target by point containment and acceptance', () => {
  const targetA = {
    id: 'zone-items',
    accepts: (p) => p.type === 'item',
    containsPoint: (x, y) => x >= 0 && x <= 100 && y >= 0 && y <= 100,
  };

  const targetB = {
    id: 'zone-scripts',
    accepts: (p) => p.type === 'script_card',
    containsPoint: (x, y) => x >= 150 && x <= 250 && y >= 0 && y <= 100,
  };

  const targets = [targetA, targetB];

  // Point inside targetA with item payload
  const matchA = findMatchingDropTarget(targets, 50, 50, { type: 'item', id: 'wheat' });
  assert.equal(matchA?.id, 'zone-items');

  // Point inside targetA but script_card payload (targetA rejects script_card)
  const rejectA = findMatchingDropTarget(targets, 50, 50, { type: 'script_card', scriptId: 's1' });
  assert.equal(rejectA, null);

  // Point inside targetB with script_card payload
  const matchB = findMatchingDropTarget(targets, 200, 50, { type: 'script_card', scriptId: 's1' });
  assert.equal(matchB?.id, 'zone-scripts');

  // Point outside any target
  const noMatch = findMatchingDropTarget(targets, 500, 500, { type: 'item', id: 'wheat' });
  assert.equal(noMatch, null);
});

test('Sprint 3: DragManager lifecycle with threshold, hover, and drop target', () => {
  const dm = new DragManager();
  let dragStarted = false;
  let dragEnded = false;
  let dropTargetReceived = null;
  let hoverState = null;

  const targetZone = {
    id: 'test-slot',
    accepts: (p) => p.type === 'item',
    containsPoint: (x, y) => x >= 50 && x <= 100 && y >= 50 && y <= 100,
    onHover: (active) => {
      hoverState = active;
    },
    onDrop: (payload, coords) => {
      dropTargetReceived = { payload, coords };
    }
  };

  const unregister = dm.registerDropTarget(targetZone);

  const payload = {
    type: 'item',
    id: 'potato_seed',
    count: 5,
    source: 'backpack',
    onDragStart: () => { dragStarted = true; },
    onDragEnd: () => { dragEnded = true; }
  };

  // Start drag at (10, 10)
  dm.startDrag({ button: 0, clientX: 10, clientY: 10, pointerId: 1 }, payload);
  assert.equal(dm.activeDrag.isDragging, false);
  assert.equal(dragStarted, false);

  // Move within threshold (12, 10)
  dm._onPointerMove({ clientX: 12, clientY: 10, pointerId: 1, preventDefault: () => {} });
  assert.equal(dm.activeDrag.isDragging, false);
  assert.equal(dragStarted, false);

  // Move past threshold to (25, 10)
  dm._onPointerMove({ clientX: 25, clientY: 10, pointerId: 1, preventDefault: () => {} });
  assert.equal(dm.activeDrag.isDragging, true);
  assert.equal(dragStarted, true);
  assert.equal(hoverState, null);

  // Move over targetZone (70, 70)
  dm._onPointerMove({ clientX: 70, clientY: 70, pointerId: 1, preventDefault: () => {} });
  assert.equal(hoverState, true);

  // Pointer up (drop)
  dm._onPointerUp({ clientX: 70, clientY: 70, pointerId: 1 });
  assert.equal(hoverState, false);
  assert.notEqual(dropTargetReceived, null);
  assert.equal(dropTargetReceived.payload.id, 'potato_seed');
  assert.equal(dropTargetReceived.payload.count, 5);
  assert.equal(dropTargetReceived.coords.x, 70);
  assert.equal(dropTargetReceived.coords.y, 70);
  assert.equal(dragEnded, true);
  assert.equal(dm.activeDrag, null);

  unregister();
  assert.equal(dm.dropTargets.length, 0);
});

test('Sprint 3: DragManager drops outside target call onDropOutside', () => {
  const dm = new DragManager();
  let outsideDropped = false;

  const payload = {
    type: 'item',
    id: 'watering_can',
    source: 'hotbar',
    slotIndex: 0,
    onDropOutside: () => {
      outsideDropped = true;
    }
  };

  dm.startDrag({ button: 0, clientX: 10, clientY: 10, pointerId: 1 }, payload);
  // Move past threshold
  dm._onPointerMove({ clientX: 50, clientY: 50, pointerId: 1, preventDefault: () => {} });
  assert.equal(dm.activeDrag.isDragging, true);

  // Drop at (200, 200) where no targets exist
  dm._onPointerUp({ clientX: 200, clientY: 200, pointerId: 1 });
  assert.equal(outsideDropped, true);
  assert.equal(dm.activeDrag, null);
});

test('Sprint 3: DragManager cancellation restores item via onCancel', () => {
  const dm = new DragManager();
  let cancelled = false;

  const payload = {
    type: 'item',
    id: 'plow',
    source: 'hotbar',
    slotIndex: 1,
    onCancel: () => {
      cancelled = true;
    }
  };

  dm.startDrag({ button: 0, clientX: 10, clientY: 10, pointerId: 1 }, payload);
  dm._onPointerMove({ clientX: 60, clientY: 60, pointerId: 1, preventDefault: () => {} });
  assert.equal(dm.activeDrag.isDragging, true);

  // Cancel explicitly
  dm.cancelDrag();
  assert.equal(cancelled, true);
  assert.equal(dm.activeDrag, null);
});

test('Sprint 3: Script card drag payload and target binding', () => {
  const dm = new DragManager();
  let boundDrone = null;

  const droneZone = {
    id: 'drone-zone-drone_01',
    accepts: (p) => p.type === 'script_card',
    containsPoint: (x, y) => x >= 300 && x <= 450 && y >= 100 && y <= 250,
    onDrop: (payload) => {
      boundDrone = { droneId: 'drone_01', scriptId: payload.scriptId };
    }
  };

  dm.registerDropTarget(droneZone);

  const scriptPayload = {
    type: 'script_card',
    scriptId: 'script_farm_auto',
    name: 'Auto Harvester'
  };

  dm.startDrag({ button: 0, clientX: 50, clientY: 50, pointerId: 1 }, scriptPayload);
  dm._onPointerMove({ clientX: 350, clientY: 150, pointerId: 1, preventDefault: () => {} });
  assert.equal(dm.activeDrag.isDragging, true);

  dm._onPointerUp({ clientX: 350, clientY: 150, pointerId: 1 });
  assert.deepEqual(boundDrone, { droneId: 'drone_01', scriptId: 'script_farm_auto' });
});
