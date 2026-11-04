/**
 * @fileoverview Drone entity – the player's programmable farming drone.
 *
 * Extends Phaser.GameObjects.Sprite and lives on the tile grid.
 * Each drone has a unique ID, a limited-capacity inventory, and a single
 * module slot that unlocks different farming/logistics abilities.
 *
 * Renders a shadow, a bobbing sprite, and a small status-LED circle
 * that changes colour based on execution state.
 */

import Phaser from 'phaser';
import {
  TILE_SIZE,
  DRONE_MOVE_SPEED,
  DRONE_ACTION_DELAY,
  DRONE_BASE_INVENTORY,
  DRONE_SUPPLIER_BONUS,
  DRONE_SELLER_BONUS,
  COLORS,
} from '../config/constants.js';
import { MODULE_TYPES } from '../data/modules.js';
import DroneAPI from '../systems/DroneAPI.js';
import ScriptSandbox from '../systems/ScriptSandbox.js';
import DroneCapacityBar from './DroneCapacityBar.js';

// LED colours for each status
const STATUS_COLORS = {
  idle:    COLORS.DRONE_GREEN,
  running: 0xe9bf62,  // yellow
  error:   COLORS.DRONE_RED,
  paused:  0x93a7a1,  // silver
};

/** Counter for generating unique drone IDs */
let _droneIdCounter = 0;

/**
 * @class DroneInventory
 * Internal inventory container for drones with capacity management.
 */
class DroneInventory {
  /**
   * @param {number} capacity - Maximum number of total items
   * @param {Drone} [drone] - Associated drone reference
   */
  constructor(capacity, drone = null) {
    /** @type {number} */
    this.capacity = capacity;
    /** @type {Drone|null} */
    this.drone = drone;
    /** @type {Map<string, number>} */
    this.items = new Map();
  }

  setDrone(drone) {
    this.drone = drone;
  }

  _notifyChange() {
    if (this.drone?.events) {
      this.drone.events.emit('inventory-changed', {
        used: this.getTotalCount(),
        capacity: this.capacity,
        droneId: this.drone.id,
      });
    }
  }

  /** Total number of items currently held */
  getTotalCount() {
    let total = 0;
    for (const count of this.items.values()) total += count;
    return total;
  }

  /**
   * Add items — returns false if capacity would be exceeded.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean}
   */
  addItem(itemId, qty = 1) {
    if (this.getTotalCount() + qty > this.capacity) return false;
    const current = this.items.get(itemId) || 0;
    this.items.set(itemId, current + qty);
    this._notifyChange();
    return true;
  }

  /**
   * Remove items — returns false if not enough.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean}
   */
  removeItem(itemId, qty = 1) {
    const current = this.items.get(itemId) || 0;
    if (current < qty) return false;
    const newCount = current - qty;
    if (newCount === 0) {
      this.items.delete(itemId);
    } else {
      this.items.set(itemId, newCount);
    }
    this._notifyChange();
    return true;
  }

  /**
   * Check if holding at least qty of item.
   * @param {string} itemId
   * @param {number} qty
   * @returns {boolean}
   */
  hasItem(itemId, qty = 1) {
    return (this.items.get(itemId) || 0) >= qty;
  }

  /**
   * Get count of a specific item.
   * @param {string} itemId
   * @returns {number}
   */
  getItemCount(itemId) {
    return this.items.get(itemId) || 0;
  }

  /**
   * Return all items as array of {id, count}.
   * @returns {{ id: string, count: number }[]}
   */
  getAll() {
    const result = [];
    for (const [id, count] of this.items) {
      result.push({ id, count });
    }
    return result;
  }

  /** Clear all items */
  clear() {
    this.items.clear();
    this._notifyChange();
  }
}

/**
 * @class Drone
 * @extends Phaser.GameObjects.Sprite
 *
 * A tile-based drone that can be scripted by the player.
 */
export default class Drone extends Phaser.GameObjects.Sprite {
  /**
   * @param {Phaser.Scene} scene  – The owning scene.
   * @param {number}       tx     – Starting tile-X coordinate.
   * @param {number}       ty     – Starting tile-Y coordinate.
   * @param {object}       gridManager – Reference to the grid manager.
   * @param {object}       profileSystem - Reference to the profile system.
   * @param {string}       [id]   – Optional unique ID (auto-generated if omitted).
   */
  constructor(scene, tx, ty, gridManager, profileSystem, id) {
    // Convert tile coords → pixel centre
    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE + TILE_SIZE / 2;

    super(scene, px, py, 'drone');

    /** @type {string} Unique drone identifier */
    if (!id) {
      _droneIdCounter++;
      this.id = `drone-${String(_droneIdCounter).padStart(3, '0')}`;
      this.label = `Drone ${_droneIdCounter}`;
    } else {
      this.id = id;
      const numMatch = id.match(/drone-(\d+)/);
      const num = numMatch ? parseInt(numMatch[1], 10) : 1;
      this.label = `Drone ${num}`;
    }

    /** @type {number} Current tile-X */
    this.tileX = tx;
    /** @type {number} Current tile-Y */
    this.tileY = ty;

    /** @type {number} Spawn tile-X */
    this.spawnX = tx;
    /** @type {number} Spawn tile-Y */
    this.spawnY = ty;

    /** @type {boolean} True while a script is being executed */
    this.isExecuting = false;

    /** @type {'idle'|'running'|'error'|'paused'} */
    this.status = 'idle';

    /** @type {string|null} Currently equipped module type key */
    this.module = null;

    /** @type {string} Facing direction */
    this.facing = 'down';

    /** @type {object} */
    this.gridManager = gridManager;

    /** @type {object} */
    this.profileSystem = profileSystem;

    // Setup script execution context
    this.droneAPI = new DroneAPI(
      this,
      gridManager,
      scene.inventorySystem,
      profileSystem,
      scene.economySystem,
      scene.warehouse,
      scene.deviceManager
    );
    this.scriptSandbox = new ScriptSandbox(this.droneAPI, profileSystem);

    // ── Event emitter for inventory changes ──────────────────────
    this.events = new Phaser.Events.EventEmitter();

    // ── Drone inventory ────────────────────────────────────────────
    this.droneInventory = new DroneInventory(DRONE_BASE_INVENTORY, this);

    // ── Add to scene ─────────────────────────────────────────────
    scene.add.existing(this);
    this.setDepth(15);

    // ── Shadow (ellipse drawn below the sprite) ──────────────────
    this.shadow = scene.add.rectangle(px, py + 12, 16, 3, 0x244c3a);
    this.shadow.setDepth(14);

    // ── Status LED (small circle above the sprite) ───────────────
    this.statusIndicator = scene.add.rectangle(px, py - 14, 3, 3, STATUS_COLORS.idle);
    this.statusIndicator.setDepth(16);

    // ── ID label (small text below the drone) ────────────────────
    this.idLabel = scene.add.text(px, py + 18, this.label, {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '8px',
      color: '#93a7a1',
      alpha: 0.9,
      resolution: 1,
    }).setOrigin(0.5, 0).setDepth(16);

    // ── Inventory capacity bar (yellow → orange → red) ───────────
    this.capacityBar = new DroneCapacityBar(scene, px, py + 28);
    this.events.on('inventory-changed', () => {
      this.capacityBar?.setValues(this.droneInventory.getTotalCount(), this.getInventoryCapacity());
    });

    // ── Idle bobbing animation ───────────────────────────────────
    this._startBobbing();
    this._updateInventoryBar();
  }

  /* ================================================================
   *  PUBLIC METHODS
   * ================================================================ */

  /**
   * Get the current maximum inventory capacity (base + module bonus).
   * @returns {number}
   */
  getInventoryCapacity() {
    if (!this.module) return DRONE_BASE_INVENTORY;
    const mod = MODULE_TYPES[this.module];
    if (!mod) return DRONE_BASE_INVENTORY;
    return DRONE_BASE_INVENTORY + mod.inventoryBonus;
  }

  /**
   * Equip a module. Updates the drone inventory capacity.
   * @param {string|null} moduleType - Module type key, or null to unequip
   * @returns {{ success: boolean, message: string }}
   */
  equipModule(moduleType) {
    if (moduleType && !MODULE_TYPES[moduleType]) {
      return { success: false, message: `Unknown module type: ${moduleType}` };
    }
    this.module = moduleType;
    this.droneInventory.capacity = this.getInventoryCapacity();
    this.droneInventory._notifyChange();
    this._updateInventoryBar();
    this.events.emit('module-changed', { module: moduleType, droneId: this.id });
    return { success: true, message: moduleType ? `Equipped ${MODULE_TYPES[moduleType].name}` : 'Module unequipped' };
  }

  /**
   * Check if this drone has a specific module ability.
   *
   * Design: Basic farming (till/water/plant/crop/harvest) is available on ALL drones.
   * Advanced economy/logistics abilities require specific modules:
   *   - sell, buy → Seller Module
   *   - supplyFrom, transferTo → Supplier Module
   *
   * @param {string} ability
   * @returns {boolean}
   */
  hasAbility(ability) {
    // Basic farming is always available — no module required
    const basicAbilities = ['till', 'water', 'plant', 'crop', 'harvest'];
    if (basicAbilities.includes(ability)) return true;

    // Advanced abilities require the appropriate module
    if (!this.module) return false;
    const mod = MODULE_TYPES[this.module];
    return mod ? mod.abilities.includes(ability) : false;
  }

  /**
   * Snap the drone to a tile position (no animation).
   * @param {number} tx – Tile-X
   * @param {number} ty – Tile-Y
   */
  setTilePosition(tx, ty) {
    this.tileX = tx;
    this.tileY = ty;

    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE + TILE_SIZE / 2;

    if (this._bobTween) {
      this._bobTween.stop();
      this._bobTween = null;
    }

    this.setPosition(px, py);
    this._syncAttachments();

    this._startBobbing();
  }

  /**
   * Update status and recolour the LED.
   * @param {'idle'|'running'|'error'|'paused'} newStatus
   */
  setStatus(newStatus) {
    this.status = newStatus;
    this.isExecuting = newStatus === 'running';

    const colour = STATUS_COLORS[newStatus] ?? STATUS_COLORS.idle;
    this.statusIndicator.setFillStyle(colour);
    this.events.emit('status-changed', { status: newStatus, droneId: this.id });
  }

  /**
   * Perform a named action with a visual delay.
   * Resolves after the delay so callers can `await` it.
   *
   * @param {string} actionName – e.g. 'water', 'crop', 'till'
   * @param  {...any} args
   * @returns {Promise<void>}
   */
  async executeAction(actionName, ...args) {
    this.animateAction(actionName);

    let delay = this.profileSystem ? this.profileSystem.getUpgradeValue('action') : DRONE_ACTION_DELAY;
    if (this.module === 'advanced_farming') {
      delay = Math.floor(delay / 2);
    }
    return new Promise((resolve) => {
      this.scene.time.delayedCall(delay, resolve);
    });
  }

  /**
   * Return the drone's current tile coordinates.
   * @returns {{ x: number, y: number }}
   */
  getPosition() {
    return { x: this.tileX, y: this.tileY };
  }

  /**
   * Move one tile in the given direction with a smooth tween.
   *
   * @param {'up'|'down'|'left'|'right'} direction
   * @returns {Promise<boolean>} Resolves `true` if the move succeeded.
   */
  moveTo(direction) {
    const deltas = {
      up:    { dx:  0, dy: -1 },
      down:  { dx:  0, dy:  1 },
      left:  { dx: -1, dy:  0 },
      right: { dx:  1, dy:  0 },
    };

    const delta = deltas[direction];
    if (!delta) {
      console.warn(`Drone.moveTo: unknown direction "${direction}"`);
      return Promise.resolve(false);
    }

    const newTX = this.tileX + delta.dx;
    const newTY = this.tileY + delta.dy;

    // Bounds check
    const cols = this.gridManager ? this.gridManager.cols : GRID_COLS;
    const rows = this.gridManager ? this.gridManager.rows : GRID_ROWS;

    if (newTX < 0 || newTX >= cols || newTY < 0 || newTY >= rows) {
      // Snap immediately back to spawn position
      this.setTilePosition(this.spawnX, this.spawnY);
      
      // Stop bobbing and set error status
      this.setStatus('error');
      
      // Throw rejection error
      throw new Error(`Out of bounds! Drone attempted to fly outside the grid to (${newTX}, ${newTY}) and was forced to emergency reset to spawn point (${this.spawnX}, ${this.spawnY}).`);
    }

    // Bounds check (grid manager may also reject the move)
    if (this.gridManager && typeof this.gridManager.isWalkable === 'function') {
      if (!this.gridManager.isWalkable(newTX, newTY, true)) {
        return Promise.resolve(false);
      }
    }

    // Stop bobbing tween to prevent property collision on y during tween
    if (this._bobTween) {
      this._bobTween.stop();
      this._bobTween = null;
    }

    // Pixel targets
    const targetX = newTX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = newTY * TILE_SIZE + TILE_SIZE / 2;

    // Update logical position immediately so queued actions see the new tile
    this.tileX = newTX;
    this.tileY = newTY;
    this.facing = direction;

    // Target duration from profile upgrades
    let duration = this.profileSystem ? this.profileSystem.getUpgradeValue('speed') : DRONE_MOVE_SPEED;
    if (this.module === 'speed_booster') {
      duration = Math.floor(duration / 2);
    }

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration: duration,
        ease: 'Power2',
        onUpdate: () => this._syncAttachments(),
        onComplete: () => {
          this._syncAttachments();
          // Restart bobbing around the new position
          this._startBobbing();
          resolve(true);
        },
      });
    });
  }

  /**
   * Play a small visual effect that corresponds to the given action.
   * @param {string} actionName
   */
  animateAction(actionName) {
    if (!this.scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (actionName === 'flip') {
      this.setFlipX(!this.flipX);
      this.scene.time.delayedCall(200, () => { if(this.scene)this.setFlipX(!this.flipX); });
      return;
    }
    const color = (actionName === 'water' || actionName === 'teleport') ? 0x63d8d1 : actionName === 'mine' ? 0x93a7a1 : ['harvest', 'crop', 'plant'].includes(actionName) ? 0xe9bf62 : 0x9b794e;
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add.rectangle(Math.round(this.x) + Phaser.Math.Between(-8, 8), Math.round(this.y) + 8, 2, 2, color).setDepth(16);
      this.scene.time.addEvent({ delay: 80, repeat: 3, callback: () => { p.y += (actionName === 'water' || actionName === 'teleport') ? 2 : -2; } });
      this.scene.time.delayedCall(350, () => p.destroy());
    }
  }

  /** Keep the compact capacity meter accurate even when scripts move items. */
  _updateInventoryBar(delta = 16) {
    const total = this.droneInventory?.getTotalCount?.() || 0;
    const capacity = Math.max(1, this.getInventoryCapacity());

    if (this.capacityBar) {
      this.capacityBar.setValues(total, capacity);
      this.capacityBar.update(this.x, this.y + 28, delta);
    }

    const signature = `${total}/${capacity}`;
    if (signature !== this._inventorySignature) {
      this._inventorySignature = signature;
      this.events?.emit('inventory-changed', { droneId: this.id, total, capacity, used: total });
    }
  }

  update(time, delta = 16) {
    this._updateInventoryBar(delta);
  }

  /**
   * Keep shadow, LED, label, and capacity bar in sync with sprite position.
   * @private
   */
  _syncAttachments() {
    if (this.shadow) {
      this.shadow.setPosition(this.x, this.y + 12);
    }
    if (this.statusIndicator) {
      this.statusIndicator.setPosition(this.x, this.y - 14);
    }
    if (this.idLabel) {
      this.idLabel.setPosition(this.x, this.y + 18);
    }
    if (this.capacityBar) {
      this.capacityBar.update(this.x, this.y + 28, 16);
    }
    if (this.speechBubble) {
      this.speechBubble.setPosition(this.x, this.y);
    }
  }

  /**
   * Display a speech bubble container above the drone.
   */
  showSpeechBubble(text) {
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }

    const padding = 8;
    const txt = this.scene.add.text(0, 0, text, {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '12px',
      color: '#101a21',
      align: 'center',
      wordWrap: { width: 140 },
      resolution: 4,
    });

    const textWidth = txt.width;
    const textHeight = txt.height;

    const width = textWidth + padding * 2;
    const height = textHeight + padding * 2;

    const bubbleBg = this.scene.add.graphics();
    bubbleBg.fillStyle(0xedf0d4, 0.95);
    bubbleBg.lineStyle(1.5, 0x101a21, 1);

    // Draw bubble rounded rect relative to container origin
    bubbleBg.fillRect(-Math.floor(width / 2), -height - 18, width, height);
    bubbleBg.strokeRoundedRect(-width / 2, -height - 18, width, height, 4);

    // Tail pointing down
    const tailHeight = 6;
    const tailWidth = 8;
    bubbleBg.fillStyle(0xedf0d4, 0.95);
    bubbleBg.beginPath();
    bubbleBg.moveTo(-tailWidth / 2, -18);
    bubbleBg.lineTo(0, -18 + tailHeight);
    bubbleBg.lineTo(tailWidth / 2, -18);
    bubbleBg.closePath();
    bubbleBg.fill();
    bubbleBg.stroke();

    txt.setPosition(-textWidth / 2, -height - 18 + padding);
    txt.setDepth(18);
    bubbleBg.setDepth(17);

    this.speechBubble = this.scene.add.container(this.x, this.y);
    this.speechBubble.add([bubbleBg, txt]);
    this.speechBubble.setDepth(17);
  }

  /**
   * Clear the active speech bubble.
   */
  clearSpeechBubble() {
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
  }

  /**
   * Split long text into chunks of at most limit characters, keeping words intact.
   * @private
   */
  _splitTextIntoChunks(text, limit = 50) {
    if (text.length <= limit) return [text];
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk = '';

    for (const word of words) {
      if ((currentChunk + ' ' + word).trim().length > limit) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }

  /**
   * Display a message in speech bubbles sequentially.
   * @param {string} text
   * @returns {Promise<void>}
   */
  async say(text) {
    const chunks = this._splitTextIntoChunks(text, 50);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      this.showSpeechBubble(chunk);

      const wordCount = chunk.split(/\s+/).length;
      const readDelay = Math.max(1200, wordCount * 350 + 800);

      await new Promise((resolve) => {
        this.scene.time.delayedCall(readDelay, resolve);
      });
    }

    this.clearSpeechBubble();
  }

  /**
   * Start the gentle idle bobbing tween (sine wave).
   * @private
   */
  _startBobbing() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this._bobTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 3,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this._syncAttachments(),
    });
  }

  /**
   * Clean up when the drone is destroyed.
   */
  destroy(fromScene) {
    if (this._bobTween) this._bobTween.stop();
    if (this.shadow) this.shadow.destroy();
    if (this.statusIndicator) this.statusIndicator.destroy();
    if (this.idLabel) this.idLabel.destroy();
    if (this.capacityBar) this.capacityBar.destroy();
    if (this.speechBubble) this.speechBubble.destroy();
    super.destroy(fromScene);
  }
}
