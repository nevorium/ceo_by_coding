/**
 * @fileoverview SlotContainer — Manages an array of inventory slots with stack limits.
 * Used by both player backpack (16-32 slots) and warehouse (24-72 slots).
 */
import { getItem } from '../data/items.js';
import { compactSlots, sortSlots } from '../utils/inventorySort.js';

export class SlotContainer {
  /**
   * @param {number} [capacity=16] Total number of slots.
   * @param {object} [options={}]
   * @param {boolean} [options.isWarehouse=false] Whether warehouse stack limits apply.
   */
  constructor(capacity = 16, options = {}) {
    this.capacity = capacity;
    this.isWarehouse = Boolean(options.isWarehouse);
    /** @type {Array<{ id: string, count: number }|null>} */
    this.slots = new Array(capacity).fill(null);
  }

  /**
   * Get the maximum stack size for a given item in this container.
   * @param {string} id
   * @returns {number}
   */
  getStackMax(id) {
    const meta = getItem(id);
    if (this.isWarehouse) {
      return meta.stackMaxWarehouse || (meta.stackMax * 10) || 999;
    }
    return meta.stackMax || 99;
  }

  /**
   * Total number of a specific item across all slots.
   * @param {string} id
   * @returns {number}
   */
  getTotalCount(id) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.id === id) {
        total += slot.count;
      }
    }
    return total;
  }

  /** Alias for getTotalCount for API consistency */
  getItemCount(id) {
    return this.getTotalCount(id);
  }

  /**
   * Check whether the container holds at least `count` of `id`.
   * @param {string} id
   * @param {number} [count=1]
   * @returns {boolean}
   */
  hasItem(id, count = 1) {
    return this.getTotalCount(id) >= count;
  }

  /**
   * Check whether `count` of `id` can completely fit in available slots.
   * @param {string} id
   * @param {number} [count=1]
   * @returns {boolean}
   */
  hasSpaceFor(id, count = 1) {
    const stackMax = this.getStackMax(id);
    let needed = count;

    for (const slot of this.slots) {
      if (slot && slot.id === id) {
        const space = stackMax - slot.count;
        if (space > 0) needed -= space;
      } else if (!slot) {
        needed -= stackMax;
      }
      if (needed <= 0) return true;
    }
    return needed <= 0;
  }

  /**
   * Check if all slots are occupied and full.
   * @returns {boolean}
   */
  isFull() {
    return this.slots.every(s => s !== null && s.count >= this.getStackMax(s.id));
  }

  /**
   * Add items into the container, filling partial stacks then empty slots.
   * @param {string} id
   * @param {number} [count=1]
   * @returns {{ added: number, leftover: number }}
   */
  addItem(id, count = 1) {
    if (count <= 0) return { added: 0, leftover: 0 };

    const stackMax = this.getStackMax(id);
    let remaining = count;

    // Phase 1: Top up existing slots with matching id
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id && slot.count < stackMax) {
        const space = stackMax - slot.count;
        const toAdd = Math.min(space, remaining);
        slot.count += toAdd;
        remaining -= toAdd;
      }
    }

    // Phase 2: Fill empty slots
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const toAdd = Math.min(stackMax, remaining);
        this.slots[i] = { id, count: toAdd };
        remaining -= toAdd;
      }
    }

    const added = count - remaining;
    return { added, leftover: remaining };
  }

  /**
   * Remove `count` of `id` from the container.
   * @param {string} id
   * @param {number} [count=1]
   * @returns {boolean} True if successfully removed, false if insufficient items.
   */
  removeItem(id, count = 1) {
    if (!this.hasItem(id, count)) return false;

    let remaining = count;
    // Remove from slots (starting from the last slot containing the item)
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        const toRemove = Math.min(slot.count, remaining);
        slot.count -= toRemove;
        remaining -= toRemove;
        if (slot.count <= 0) {
          this.slots[i] = null;
        }
      }
    }

    return true;
  }

  /**
   * Remove items from a specific slot index.
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {boolean}
   */
  removeItemFromSlot(slotIndex, count = 1) {
    const slot = this.slots[slotIndex];
    if (!slot || slot.count < count) return false;

    slot.count -= count;
    if (slot.count <= 0) {
      this.slots[slotIndex] = null;
    }
    return true;
  }

  /**
   * Get slot by index.
   * @param {number} index
   * @returns {{ id: string, count: number }|null}
   */
  getSlot(index) {
    return this.slots[index] || null;
  }

  /**
   * Set slot directly.
   * @param {number} index
   * @param {{ id: string, count: number }|null} item
   */
  setSlot(index, item) {
    if (index >= 0 && index < this.capacity) {
      this.slots[index] = item ? { id: item.id, count: item.count } : null;
    }
  }

  /**
   * Swap two slots, merging them if they hold the same item and have space.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  swapSlots(fromIndex, toIndex) {
    if (fromIndex === toIndex) return false;
    if (fromIndex < 0 || fromIndex >= this.capacity || toIndex < 0 || toIndex >= this.capacity) {
      return false;
    }

    const from = this.slots[fromIndex];
    const to = this.slots[toIndex];

    if (!from && !to) return false;

    // If both slots hold the same item, attempt to merge
    if (from && to && from.id === to.id) {
      const stackMax = this.getStackMax(from.id);
      const space = stackMax - to.count;
      if (space > 0) {
        const transfer = Math.min(space, from.count);
        to.count += transfer;
        from.count -= transfer;
        if (from.count <= 0) {
          this.slots[fromIndex] = null;
        }
        return true;
      }
    }

    // Normal swap
    this.slots[fromIndex] = to;
    this.slots[toIndex] = from;
    return true;
  }

  /**
   * Split a stack from one slot to another.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @param {number} splitCount
   * @returns {boolean}
   */
  splitSlot(fromIndex, toIndex, splitCount) {
    const from = this.slots[fromIndex];
    if (!from || from.count <= splitCount || splitCount <= 0) return false;

    const to = this.slots[toIndex];
    const stackMax = this.getStackMax(from.id);

    if (!to) {
      this.slots[toIndex] = { id: from.id, count: splitCount };
      from.count -= splitCount;
      return true;
    }

    if (to.id === from.id && to.count + splitCount <= stackMax) {
      to.count += splitCount;
      from.count -= splitCount;
      return true;
    }

    return false;
  }

  /**
   * Compact all partial stacks of matching items.
   */
  compact() {
    this.slots = compactSlots(this.slots, this.isWarehouse);
  }

  /**
   * Sort slots by criterion.
   * @param {'category'|'name'|'quantity'|'id'} [criterion='category']
   * @param {'asc'|'desc'} [dir='asc']
   */
  sort(criterion = 'category', dir = 'asc') {
    this.slots = sortSlots(this.slots, criterion, dir, this.isWarehouse);
  }

  /**
   * Expand container capacity (e.g. from upgrade).
   * @param {number} newCapacity
   */
  setCapacity(newCapacity) {
    if (newCapacity <= this.capacity) return;
    while (this.slots.length < newCapacity) {
      this.slots.push(null);
    }
    this.capacity = newCapacity;
  }

  /**
   * Get all slots as a copy.
   * @returns {Array<{ id: string, count: number }|null>}
   */
  getSlots() {
    return [...this.slots];
  }

  /**
   * Returns summary array of { id, count } aggregated by item ID,
   * fully compatible with legacy getAll() / getAllItems().
   * @returns {{ id: string, count: number }[]}
   */
  getAll() {
    const map = new Map();
    for (const slot of this.slots) {
      if (slot && slot.count > 0) {
        map.set(slot.id, (map.get(slot.id) || 0) + slot.count);
      }
    }
    const result = [];
    for (const [id, count] of map) {
      result.push({ id, count });
    }
    return result;
  }

  /** Clear all slots */
  clear() {
    this.slots.fill(null);
  }
}

export default SlotContainer;
