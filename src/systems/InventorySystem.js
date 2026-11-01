/**
 * @fileoverview InventorySystem – tracks the player's items and coins with slot container backing.
 *
 * All mutations emit events so UI components (HUD, Hotbar, StorageUI, MarketUI)
 * can react without polling.
 *
 * Events:
 *   'inventory-changed' → { itemId, count, delta, leftover }
 *   'coins-changed'     → { coins, delta }
 */
import UniversalEventEmitter from '../utils/EventEmitter.js';
import { STARTING_COINS } from '../config/constants.js';
import SlotContainer from './SlotContainer.js';

export default class InventorySystem {
  /**
   * @param {number} [slotCapacity=16]
   */
  constructor(slotCapacity = 16) {
    this.container = new SlotContainer(slotCapacity, { isWarehouse: false });

    /**
     * Current coin balance.
     * @type {number}
     */
    this.coins = STARTING_COINS;

    /**
     * Event emitter for inventory-related events.
     * @type {UniversalEventEmitter}
     */
    this.events = new UniversalEventEmitter();

    /**
     * Backwards-compatible Map-like interface for legacy accessors.
     */
    this.items = {
      get: (id) => this.container.getTotalCount(id),
      has: (id) => this.container.hasItem(id, 1),
      set: (id, count) => {
        const current = this.container.getTotalCount(id);
        if (count > current) this.container.addItem(id, count - current);
        else if (count < current) this.container.removeItem(id, current - count);
        return this.items;
      },
      delete: (id) => {
        const current = this.container.getTotalCount(id);
        return this.container.removeItem(id, current);
      },
      clear: () => this.container.clear(),
      entries: () => this.container.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
      values: () => this.container.getAll().map(i => i.count)[Symbol.iterator](),
      keys: () => this.container.getAll().map(i => i.id)[Symbol.iterator](),
      [Symbol.iterator]: () => this.container.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
      get size() { return this.container.getAll().length; },
    };
  }

  /* ================================================================
   *  SLOT-BASED APIS
   * ================================================================ */

  /**
   * Get all slots.
   * @returns {Array<{ id: string, count: number }|null>}
   */
  getSlots() {
    return this.container.getSlots();
  }

  /**
   * Get single slot by index.
   * @param {number} index
   * @returns {{ id: string, count: number }|null}
   */
  getSlot(index) {
    return this.container.getSlot(index);
  }

  /**
   * Set slot item directly.
   * @param {number} index
   * @param {{ id: string, count: number }|null} item
   */
  setSlot(index, item) {
    this.container.setSlot(index, item);
    this.events.emit('inventory-changed', { itemId: item?.id || '', count: item?.count || 0, delta: 0 });
  }

  /**
   * Swap two slots in the backpack.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  swapSlots(fromIndex, toIndex) {
    const success = this.container.swapSlots(fromIndex, toIndex);
    if (success) {
      this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
    }
    return success;
  }

  /**
   * Split a stack from one slot to another.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @param {number} count
   * @returns {boolean}
   */
  splitSlot(fromIndex, toIndex, count) {
    const success = this.container.splitSlot(fromIndex, toIndex, count);
    if (success) {
      this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
    }
    return success;
  }

  /**
   * Remove items from a specific slot index.
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {boolean}
   */
  removeItemFromSlot(slotIndex, count = 1) {
    const success = this.container.removeItemFromSlot(slotIndex, count);
    if (success) {
      this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
    }
    return success;
  }

  /**
   * Sort backpack slots.
   * @param {'category'|'name'|'quantity'|'id'} [criterion='category']
   * @param {'asc'|'desc'} [dir='asc']
   */
  sort(criterion = 'category', dir = 'asc') {
    this.container.sort(criterion, dir);
    this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
  }

  /**
   * Compact partial stacks.
   */
  compact() {
    this.container.compact();
    this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
  }

  /**
   * Set new slot capacity (e.g. from upgrade).
   * @param {number} newCapacity
   */
  setSlotCapacity(newCapacity) {
    this.container.setCapacity(newCapacity);
    this.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
  }

  /**
   * Get current slot capacity.
   * @returns {number}
   */
  getSlotCapacity() {
    return this.container.capacity;
  }

  /**
   * Check if container has space for given quantity of item.
   * @param {string} itemId
   * @param {number} [quantity=1]
   * @returns {boolean}
   */
  hasSpaceFor(itemId, quantity = 1) {
    return this.container.hasSpaceFor(itemId, quantity);
  }

  /**
   * Check if all slots are occupied and full.
   * @returns {boolean}
   */
  isFull() {
    return this.container.isFull();
  }

  /* ================================================================
   *  ITEM MANAGEMENT (LEGACY COMPATIBLE)
   * ================================================================ */

  /**
   * Add items to the inventory.
   * @param {string} itemId
   * @param {number} [quantity=1]
   * @returns {boolean} True if all items were added, false if leftover.
   */
  addItem(itemId, quantity = 1) {
    const { added, leftover } = this.container.addItem(itemId, quantity);
    const newCount = this.container.getTotalCount(itemId);

    this.events.emit('inventory-changed', {
      itemId,
      count: newCount,
      delta: added,
      leftover,
    });

    return leftover === 0;
  }

  /**
   * Remove items from the inventory.
   * @param {string} itemId
   * @param {number} [quantity=1]
   * @returns {boolean} True if removed, false if not enough.
   */
  removeItem(itemId, quantity = 1) {
    const success = this.container.removeItem(itemId, quantity);
    if (success) {
      const newCount = this.container.getTotalCount(itemId);
      this.events.emit('inventory-changed', {
        itemId,
        count: newCount,
        delta: -quantity,
      });
    }
    return success;
  }

  /**
   * Check whether the player has at least `quantity` of the given item.
   * @param {string} itemId
   * @param {number} [quantity=1]
   * @returns {boolean}
   */
  hasItem(itemId, quantity = 1) {
    return this.container.hasItem(itemId, quantity);
  }

  /**
   * Get the current count of a specific item.
   * @param {string} itemId
   * @returns {number}
   */
  getItemCount(itemId) {
    return this.container.getTotalCount(itemId);
  }

  /**
   * Return every item in the inventory as an array of `{ id, count }`.
   * @returns {{ id: string, count: number }[]}
   */
  getAllItems() {
    return this.container.getAll();
  }

  /* ================================================================
   *  COIN MANAGEMENT
   * ================================================================ */

  /**
   * Add coins to the player's balance.
   * @param {number} amount
   */
  addCoins(amount) {
    this.coins += amount;
    this.events.emit('coins-changed', {
      coins: this.coins,
      delta: amount,
    });
  }

  /**
   * Remove coins from the player's balance.
   * @param {number} amount
   * @returns {boolean} false if insufficient coins.
   */
  removeCoins(amount) {
    if (this.coins < amount) return false;
    this.coins -= amount;
    this.events.emit('coins-changed', {
      coins: this.coins,
      delta: -amount,
    });
    return true;
  }

  /**
   * Get the current coin balance.
   * @returns {number}
   */
  getCoins() {
    return this.coins;
  }
}
