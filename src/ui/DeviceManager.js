/**
 * @fileoverview DeviceManager — registry of all drones in the game.
 *
 * Maintains a map of drone ID → Drone instance.
 * Provides the active device concept: the drone whose code is being
 * edited in the Monaco editor.
 */

import Phaser from 'phaser';

export default class DeviceManager {
  constructor() {
    /** @type {Map<string, import('../entities/Drone.js').default>} */
    this.drones = new Map();

    /** @type {string|null} ID of the drone currently selected for code editing */
    this.activeDeviceId = null;

    /** @type {Phaser.Events.EventEmitter} */
    this.events = new Phaser.Events.EventEmitter();
  }

  /**
   * Register a drone with the device manager.
   * @param {import('../entities/Drone.js').default} drone
   */
  register(drone) {
    this.drones.set(drone.id, drone);

    // Set as active if it's the first one
    if (!this.activeDeviceId) {
      this.activeDeviceId = drone.id;
    }

    // Forward drone events to device manager listeners
    drone.events.on('status-changed', (data) => {
      this.events.emit('device-updated', { droneId: data.droneId });
    });
    drone.events.on('module-changed', (data) => {
      this.events.emit('device-updated', { droneId: data.droneId });
    });
    drone.events.on('inventory-changed', (data) => {
      this.events.emit('device-updated', { droneId: data.droneId });
    });

    this.events.emit('device-registered', { droneId: drone.id });
  }

  /**
   * Get all registered drones as array.
   * @returns {import('../entities/Drone.js').default[]}
   */
  getAll() {
    return Array.from(this.drones.values());
  }

  /**
   * Get a drone by ID.
   * @param {string} id
   * @returns {import('../entities/Drone.js').default|undefined}
   */
  getById(id) {
    return this.drones.get(id);
  }

  /**
   * Get the currently active drone (whose code is being edited).
   * @returns {import('../entities/Drone.js').default|null}
   */
  getActiveDevice() {
    if (!this.activeDeviceId) return null;
    return this.drones.get(this.activeDeviceId) || null;
  }

  /**
   * Set the active drone for code editing.
   * @param {string} droneId
   */
  setActiveDevice(droneId) {
    if (!this.drones.has(droneId)) return;
    this.activeDeviceId = droneId;
    this.events.emit('active-device-changed', { droneId });
  }

  /**
   * Get a summary of all devices for UI rendering.
   * @returns {Array<{id: string, label: string, status: string, module: string|null, inventoryCount: number, inventoryCapacity: number}>}
   */
  getDeviceSummaries() {
    return this.getAll().map(drone => ({
      id: drone.id,
      label: drone.label || drone.id,
      status: drone.status,
      module: drone.module,
      inventoryCount: drone.droneInventory.getTotalCount(),
      inventoryCapacity: drone.getInventoryCapacity(),
      isActive: drone.id === this.activeDeviceId,
    }));
  }
}
