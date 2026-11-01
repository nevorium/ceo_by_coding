/**
 * @fileoverview Warehouse entity – storage building on the game map with SlotContainer backing.
 *
 * Drones can deposit and withdraw items when adjacent.
 * The player can interact (press E) to open management UI.
 */
import UniversalEventEmitter from '../utils/EventEmitter.js';
import { TILE_SIZE } from '../config/constants.js';
import SlotContainer from '../systems/SlotContainer.js';

export default class Warehouse {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} tx  – Tile-X of the warehouse (top-left corner)
   * @param {number} ty  – Tile-Y of the warehouse (top-left corner)
   * @param {number} [w=2] – Width in tiles
   * @param {number} [h=2] – Height in tiles
   * @param {object} [storage=null]
   * @param {string} [label='GUDANG']
   * @param {number} [slotCapacity=24]
   */
  constructor(scene, tx, ty, w = 2, h = 2, storage = null, label = 'GUDANG', slotCapacity = 24) {
    /** @type {Phaser.Scene} */
    this.scene = scene;

    /** @type {number} Tile anchor X */
    this.tileX = tx;
    /** @type {number} Tile anchor Y */
    this.tileY = ty;
    /** @type {number} Width in tiles */
    this.tileW = w;
    /** @type {number} Height in tiles */
    this.tileH = h;
    this.label = label;

    if (!storage) {
      const container = new SlotContainer(slotCapacity, { isWarehouse: true });
      const events = new UniversalEventEmitter();
      this.storage = {
        container,
        events,
        items: {
          get: (id) => container.getTotalCount(id),
          has: (id) => container.hasItem(id, 1),
          set: (id, count) => {
            const current = container.getTotalCount(id);
            if (count > current) container.addItem(id, count - current);
            else if (count < current) container.removeItem(id, current - count);
            return this.storage.items;
          },
          delete: (id) => container.removeItem(id, container.getTotalCount(id)),
          clear: () => container.clear(),
          entries: () => container.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
          values: () => container.getAll().map(i => i.count)[Symbol.iterator](),
          keys: () => container.getAll().map(i => i.id)[Symbol.iterator](),
          [Symbol.iterator]: () => container.getAll().map(i => [i.id, i.count])[Symbol.iterator](),
          get size() { return container.getAll().length; },
        },
      };
    } else {
      this.storage = storage;
      if (!this.storage.container) {
        this.storage.container = new SlotContainer(slotCapacity, { isWarehouse: true });
        // If storage already had a Map of items, migrate them into the container
        if (this.storage.items instanceof Map) {
          for (const [id, count] of this.storage.items.entries()) {
            this.storage.container.addItem(id, count);
          }
        }
      }
    }

    this.container = this.storage.container;
    this.items = this.storage.items;
    this.events = this.storage.events;

    // ── Visual ──────────────────────────────────────────────────
    const cx = (tx + w / 2) * TILE_SIZE;
    const cy = (ty + h / 2) * TILE_SIZE;

    // Background panel
    this._bg = scene.add.rectangle(cx, cy, w * TILE_SIZE, h * TILE_SIZE, 0x244c3a);
    this._bg.setDepth(2);
    this._bg.setStrokeStyle(1, 0x244c3a);

    // Icon
    this._icon = scene.add.image(cx, cy, 'warehouse').setDepth(3);

    // Label
    this._label = scene.add.text(cx, cy + 12, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: '#edf0d4',
      resolution: 1,
    }).setOrigin(0.5).setPosition(cx, cy + 25).setDepth(4);
  }

  /* ================================================================
   *  STORAGE API (WITH SLOTS & BACKWARDS COMPATIBILITY)
   * ================================================================ */

  /**
   * Deposit items into the warehouse.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean} True if all items were deposited, false if leftover.
   */
  deposit(itemId, qty = 1) {
    const { added, leftover } = this.container.addItem(itemId, qty);
    this.events.emit('changed', { action: 'deposit', itemId, qty: added, leftover });
    return leftover === 0;
  }

  /**
   * Withdraw items from the warehouse.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean} false if not enough stock
   */
  withdraw(itemId, qty = 1) {
    const success = this.container.removeItem(itemId, qty);
    if (success) {
      this.events.emit('changed', { action: 'withdraw', itemId, qty });
    }
    return success;
  }

  /**
   * Check if warehouse has at least qty of an item.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean}
   */
  hasItem(itemId, qty = 1) {
    return this.container.hasItem(itemId, qty);
  }

  /**
   * Get all stored items as array of {id, count}.
   * @returns {{ id: string, count: number }[]}
   */
  getAll() {
    return this.container.getAll();
  }

  /**
   * Get count of a specific item.
   * @param {string} itemId
   * @returns {number}
   */
  getItemCount(itemId) {
    return this.container.getTotalCount(itemId);
  }

  /**
   * Get slots array.
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
    this.events.emit('changed', { action: 'setSlot', index });
  }

  /**
   * Swap two slots in warehouse.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  swapSlots(fromIndex, toIndex) {
    const success = this.container.swapSlots(fromIndex, toIndex);
    if (success) {
      this.events.emit('changed', { action: 'swapSlots', fromIndex, toIndex });
    }
    return success;
  }

  /**
   * Remove items from a specific warehouse slot index.
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {boolean}
   */
  removeItemFromSlot(slotIndex, count = 1) {
    const success = this.container.removeItemFromSlot(slotIndex, count);
    if (success) {
      this.events.emit('changed', { action: 'removeItemFromSlot', slotIndex, count });
    }
    return success;
  }

  /**
   * Check if warehouse has space for given count of item.
   * @param {string} itemId
   * @param {number} [count=1]
   * @returns {boolean}
   */
  hasSpaceFor(itemId, count = 1) {
    return this.container.hasSpaceFor(itemId, count);
  }

  /**
   * Sort warehouse slots.
   * @param {'category'|'name'|'quantity'|'id'} [criterion='category']
   * @param {'asc'|'desc'} [dir='asc']
   */
  sort(criterion = 'category', dir = 'asc') {
    this.container.sort(criterion, dir);
    this.events.emit('changed', { action: 'sort' });
  }

  /**
   * Compact partial stacks in warehouse.
   */
  compact() {
    this.container.compact();
    this.events.emit('changed', { action: 'compact' });
  }

  /**
   * Set slot capacity.
   * @param {number} newCapacity
   */
  setSlotCapacity(newCapacity) {
    this.container.setCapacity(newCapacity);
    this.events.emit('changed', { action: 'capacityChanged', capacity: newCapacity });
  }

  /**
   * Get current slot capacity.
   * @returns {number}
   */
  getSlotCapacity() {
    return this.container.capacity;
  }

  /* ================================================================
   *  SPATIAL HELPERS
   * ================================================================ */

  /**
   * Check if a tile coordinate is within the warehouse footprint.
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  containsTile(tx, ty) {
    return (
      tx >= this.tileX && tx < this.tileX + this.tileW &&
      ty >= this.tileY && ty < this.tileY + this.tileH
    );
  }

  /**
   * Check if an entity at tile (tx, ty) is adjacent (1 tile away) to the warehouse.
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  isAdjacentTo(tx, ty) {
    return (
      tx >= this.tileX - 1 && tx <= this.tileX + this.tileW &&
      ty >= this.tileY - 1 && ty <= this.tileY + this.tileH &&
      !this.containsTile(tx, ty)
    );
  }

  /**
   * Destroy all visual objects.
   */
  destroy() {
    if (this._bg) this._bg.destroy();
    if (this._icon) this._icon.destroy();
    if (this._label) this._label.destroy();
  }
}
