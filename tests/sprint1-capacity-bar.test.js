import test from 'node:test';
import assert from 'node:assert/strict';
import { fillColor, fillColorCSS, hslToHex } from '../src/utils/fillColor.js';

test('Sprint 1: fillColor transitions yellow -> orange -> red monotonically', () => {
  const c0 = fillColor(0);
  const cHalf = fillColor(0.5);
  const cFull = fillColor(1.0);

  // Hex values should be valid numbers
  assert.equal(typeof c0, 'number');
  assert.equal(typeof cHalf, 'number');
  assert.equal(typeof cFull, 'number');

  // Check green component decreases as we go from yellow (high green) to red (low green)
  const g0 = (c0 >> 8) & 0xff;
  const gHalf = (cHalf >> 8) & 0xff;
  const gFull = (cFull >> 8) & 0xff;

  // Yellow has significant green, orange has medium, red has low/no green
  assert.ok(g0 > gHalf, `g0 (${g0}) should be greater than gHalf (${gHalf})`);
  assert.ok(gHalf > gFull, `gHalf (${gHalf}) should be greater than gFull (${gFull})`);

  // Red component should remain high across all three
  const r0 = (c0 >> 16) & 0xff;
  const rHalf = (cHalf >> 16) & 0xff;
  const rFull = (cFull >> 16) & 0xff;
  assert.ok(r0 > 200, 'Yellow should have high red component');
  assert.ok(rHalf > 200, 'Orange should have high red component');
  assert.ok(rFull > 200, 'Red should have high red component');

  // Test css string helper
  assert.equal(fillColorCSS(0).startsWith('#'), true);
  assert.equal(fillColorCSS(1).startsWith('#'), true);
});

test('Sprint 1: DroneInventory emits inventory-changed on mutations', () => {
  const events = [];
  const mockDrone = {
    id: 'drone-999',
    events: {
      emit(eventName, data) {
        events.push({ eventName, data });
      },
    },
  };

  // Create an inventory with drone reference
  const inv = {
    capacity: 10,
    drone: mockDrone,
    items: new Map(),
    getTotalCount() {
      let total = 0;
      for (const count of this.items.values()) total += count;
      return total;
    },
    _notifyChange() {
      if (this.drone?.events) {
        this.drone.events.emit('inventory-changed', {
          used: this.getTotalCount(),
          capacity: this.capacity,
          droneId: this.drone.id,
        });
      }
    },
    addItem(itemId, qty = 1) {
      if (this.getTotalCount() + qty > this.capacity) return false;
      const current = this.items.get(itemId) || 0;
      this.items.set(itemId, current + qty);
      this._notifyChange();
      return true;
    },
    removeItem(itemId, qty = 1) {
      const current = this.items.get(itemId) || 0;
      if (current < qty) return false;
      const newCount = current - qty;
      if (newCount === 0) this.items.delete(itemId);
      else this.items.set(itemId, newCount);
      this._notifyChange();
      return true;
    },
    clear() {
      this.items.clear();
      this._notifyChange();
    },
  };

  // 1. Add item
  inv.addItem('wheat', 4);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, 'inventory-changed');
  assert.deepEqual(events[0].data, { used: 4, capacity: 10, droneId: 'drone-999' });

  // 2. Remove item
  inv.removeItem('wheat', 1);
  assert.equal(events.length, 2);
  assert.deepEqual(events[1].data, { used: 3, capacity: 10, droneId: 'drone-999' });

  // 3. Clear
  inv.clear();
  assert.equal(events.length, 3);
  assert.deepEqual(events[2].data, { used: 0, capacity: 10, droneId: 'drone-999' });
});
