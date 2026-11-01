/**
 * @fileoverview ProfileSystem - tracks player XP, level, name, drone upgrades, and slot capacity.
 *
 * Emits events for UI updates:
 *   'profile-changed' -> { name, level, xp, xpNeeded }
 *   'level-up'        -> { level }
 *   'upgrade'         -> { type, level, value }
 */
import UniversalEventEmitter from '../utils/EventEmitter.js';

const UPGRADE_COSTS = [100, 250, 500, 1000];
const SPEED_VALUES = [200, 170, 140, 110, 80];
const ACTION_VALUES = [300, 250, 200, 150, 100];
const BATTERY_VALUES = [10000, 25000, 50000, 100000, 250000];

export const BACKPACK_SLOT_VALUES = [16, 20, 24, 32];
export const BACKPACK_SLOT_COSTS = [500, 1500, 5000];

export const WAREHOUSE_SLOT_VALUES = [24, 36, 48, 72];
export const WAREHOUSE_SLOT_COSTS = [1000, 3000, 10000];

export default class ProfileSystem {
  constructor() {
    this.name = 'Pilot Alpha';
    this.level = 1;
    this.xp = 0;

    // Upgrade levels
    this.upgrades = {
      speed: 1,
      action: 1,
      battery: 1,
      backpackSlots: 1,
      warehouseSlots: 1,
    };

    /**
     * Event emitter for profile-related events.
     * @type {UniversalEventEmitter}
     */
    this.events = new UniversalEventEmitter();
  }

  /**
   * Get XP needed to reach the next level.
   * Formula: level * 100
   * @returns {number}
   */
  getXpNeeded() {
    return this.level * 100;
  }

  /**
   * Add XP to the player.
   * @param {number} amount
   */
  addXp(amount) {
    this.xp += amount;
    let leveledUp = false;

    while (this.xp >= this.getXpNeeded()) {
      this.xp -= this.getXpNeeded();
      this.level++;
      leveledUp = true;
    }

    this.events.emit('profile-changed', {
      name: this.name,
      level: this.level,
      xp: this.xp,
      xpNeeded: this.getXpNeeded(),
    });

    if (leveledUp) {
      this.events.emit('level-up', { level: this.level });
    }
  }

  /**
   * Rename the pilot.
   * @param {string} newName
   */
  rename(newName) {
    if (newName && newName.trim()) {
      this.name = newName.trim();
      this.events.emit('profile-changed', {
        name: this.name,
        level: this.level,
        xp: this.xp,
        xpNeeded: this.getXpNeeded(),
      });
    }
  }

  /**
   * Get the cost to purchase the next upgrade level.
   * Returns null if already maxed.
   * @param {'speed'|'action'|'battery'|'backpackSlots'|'warehouseSlots'} type
   * @returns {number|null}
   */
  getUpgradeCost(type) {
    const currentLvl = this.upgrades[type] || 1;
    if (type === 'backpackSlots') {
      if (currentLvl >= 4) return null;
      return BACKPACK_SLOT_COSTS[currentLvl - 1];
    }
    if (type === 'warehouseSlots') {
      if (currentLvl >= 4) return null;
      return WAREHOUSE_SLOT_COSTS[currentLvl - 1];
    }
    if (currentLvl >= 5) return null;
    return UPGRADE_COSTS[currentLvl - 1];
  }

  /**
   * Get the current level of an upgrade.
   * @param {'speed'|'action'|'battery'|'backpackSlots'|'warehouseSlots'} type
   * @returns {number}
   */
  getUpgradeLevel(type) {
    return this.upgrades[type] || 1;
  }

  /**
   * Get the actual value corresponding to the current upgrade level.
   * @param {'speed'|'action'|'battery'|'backpackSlots'|'warehouseSlots'} type
   * @returns {number}
   */
  getUpgradeValue(type) {
    const currentLvl = this.upgrades[type] || 1;
    if (type === 'speed') {
      return SPEED_VALUES[currentLvl - 1] || SPEED_VALUES[SPEED_VALUES.length - 1];
    } else if (type === 'action') {
      return ACTION_VALUES[currentLvl - 1] || ACTION_VALUES[ACTION_VALUES.length - 1];
    } else if (type === 'battery') {
      return BATTERY_VALUES[currentLvl - 1] || BATTERY_VALUES[BATTERY_VALUES.length - 1];
    } else if (type === 'backpackSlots') {
      return BACKPACK_SLOT_VALUES[currentLvl - 1] || BACKPACK_SLOT_VALUES[BACKPACK_SLOT_VALUES.length - 1];
    } else if (type === 'warehouseSlots') {
      return WAREHOUSE_SLOT_VALUES[currentLvl - 1] || WAREHOUSE_SLOT_VALUES[WAREHOUSE_SLOT_VALUES.length - 1];
    }
    return 0;
  }

  /**
   * Purchase an upgrade.
   * @param {'speed'|'action'|'battery'|'backpackSlots'|'warehouseSlots'} type
   * @param {object} inventorySystem
   * @returns {{ success: boolean, message: string }}
   */
  upgrade(type, inventorySystem) {
    const maxLvl = (type === 'backpackSlots' || type === 'warehouseSlots') ? 4 : 5;
    const currentLvl = this.upgrades[type] || 1;
    if (currentLvl >= maxLvl) {
      return { success: false, message: 'Upgrade already at maximum level.' };
    }

    const cost = this.getUpgradeCost(type);
    if (cost === null || !inventorySystem.removeCoins(cost)) {
      return { success: false, message: 'Not enough coins.' };
    }

    this.upgrades[type] = currentLvl + 1;
    const newVal = this.getUpgradeValue(type);

    if (type === 'backpackSlots' && typeof inventorySystem.setSlotCapacity === 'function') {
      inventorySystem.setSlotCapacity(newVal);
    }

    this.events.emit('upgrade', {
      type,
      level: this.upgrades[type],
      value: newVal,
    });

    this.events.emit('profile-changed', {
      name: this.name,
      level: this.level,
      xp: this.xp,
      xpNeeded: this.getXpNeeded(),
    });

    return { success: true, message: `Successfully upgraded ${type} to Level ${this.upgrades[type]}!` };
  }
}
