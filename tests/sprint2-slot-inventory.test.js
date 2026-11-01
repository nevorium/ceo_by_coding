import test from 'node:test';
import assert from 'node:assert/strict';
import SlotContainer from '../src/systems/SlotContainer.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import ProfileSystem from '../src/systems/ProfileSystem.js';
import { compactSlots, sortSlots } from '../src/utils/inventorySort.js';

test('Sprint 2: Stack limits partition items across slots (e.g. 150 wheat -> 99 + 51)', () => {
  const container = new SlotContainer(16);
  const result = container.addItem('wheat', 150);

  assert.equal(result.added, 150);
  assert.equal(result.leftover, 0);

  const slot0 = container.getSlot(0);
  const slot1 = container.getSlot(1);
  const slot2 = container.getSlot(2);

  assert.deepEqual(slot0, { id: 'wheat', count: 99 });
  assert.deepEqual(slot1, { id: 'wheat', count: 51 });
  assert.equal(slot2, null);
  assert.equal(container.getTotalCount('wheat'), 150);
});

test('Sprint 2: Tools and modules have stackMax: 1', () => {
  const container = new SlotContainer(4);
  container.addItem('plow', 2);

  assert.deepEqual(container.getSlot(0), { id: 'plow', count: 1 });
  assert.deepEqual(container.getSlot(1), { id: 'plow', count: 1 });
  assert.equal(container.getSlot(2), null);
});

test('Sprint 2: Container rejection when completely full', () => {
  const container = new SlotContainer(2); // 2 slots
  container.addItem('wheat', 99);
  container.addItem('wheat', 99);

  assert.equal(container.isFull(), true);

  // Attempt to add 10 more wheat
  const res = container.addItem('wheat', 10);
  assert.equal(res.added, 0);
  assert.equal(res.leftover, 10);
  assert.equal(container.getTotalCount('wheat'), 198);
});

test('Sprint 2: Compact merges partial stacks of the same item', () => {
  const slots = [
    { id: 'wheat', count: 40 },
    null,
    { id: 'wheat', count: 50 },
    { id: 'potato', count: 10 },
  ];

  const compacted = compactSlots(slots);

  assert.deepEqual(compacted[0], { id: 'wheat', count: 90 });
  assert.equal(compacted[1], null);
  assert.equal(compacted[2], null);
  assert.deepEqual(compacted[3], { id: 'potato', count: 10 });
});

test('Sprint 2: Sorting slots puts items in category/name order with empty slots at end', () => {
  const slots = [
    { id: 'wheat', count: 20 },
    null,
    { id: 'plow', count: 1 },
    { id: 'iron_ore', count: 15 },
  ];

  const sorted = sortSlots(slots, 'category', 'asc');

  // Peralatan (plow) -> Pertanian (wheat) -> Tambang (iron_ore) -> null
  assert.equal(sorted[0]?.id, 'plow');
  assert.equal(sorted[1]?.id, 'wheat');
  assert.equal(sorted[2]?.id, 'iron_ore');
  assert.equal(sorted[3], null);
});

test('Sprint 2: ProfileSystem slot upgrade expands backpack capacity', () => {
  const profile = new ProfileSystem();
  const inv = new InventorySystem(16);
  inv.coins = 1000;

  assert.equal(inv.getSlotCapacity(), 16);
  assert.equal(profile.getUpgradeLevel('backpackSlots'), 1);

  // Upgrade to level 2 (costs 500g -> 20 slots)
  const res = profile.upgrade('backpackSlots', inv);
  assert.equal(res.success, true);
  assert.equal(profile.getUpgradeLevel('backpackSlots'), 2);
  assert.equal(inv.getSlotCapacity(), 20);
  assert.equal(inv.getCoins(), 500);
});

test('Sprint 2: Migration of v1 save items into v2 slot structure without loss', () => {
  const inv = new InventorySystem(16);
  const v1Items = [
    { id: 'wheat', count: 120 },
    { id: 'plow', count: 1 },
    { id: 'copper_ore', count: 45 },
  ];

  // Emulate v1 migration logic
  inv.container.clear();
  v1Items.forEach((item) => {
    inv.container.addItem(item.id, item.count);
  });

  // Verify wheat partitioned into 99 + 21
  assert.deepEqual(inv.getSlot(0), { id: 'wheat', count: 99 });
  assert.deepEqual(inv.getSlot(1), { id: 'wheat', count: 21 });
  assert.deepEqual(inv.getSlot(2), { id: 'plow', count: 1 });
  assert.deepEqual(inv.getSlot(3), { id: 'copper_ore', count: 45 });

  // Total counts preserved
  assert.equal(inv.getItemCount('wheat'), 120);
  assert.equal(inv.getItemCount('plow'), 1);
  assert.equal(inv.getItemCount('copper_ore'), 45);
});
