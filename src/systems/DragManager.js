/**
 * @fileoverview DragManager — Unified Pointer-based Drag & Drop Engine.
 *
 * Replaces 3 disparate drag mechanisms:
 *   1. Phaser draggable hotbar slot backgrounds (replaced with stationary slots + item ghost)
 *   2. HTML5 native drag for script cards (replaced with pointer-based card ghost)
 *   3. Dead code DOM drop zones (unified into cross-boundary DOM <-> Canvas drop engine)
 *
 * Provides a tactile "item with weight" feeling via velocity-based tilt, subtle elevation scale,
 * and high-z-index pixel-perfect ghosts.
 */

import { pixelIcon } from '../rendering/PixelAssets.js';

export const DRAG_THRESHOLD = 5;
export const MAX_TILT_DEG = 15;
export const TILT_SENSITIVITY = 0.35;

/**
 * Calculates tilt angle in degrees based on horizontal velocity.
 * Clamped between [-maxAngle, maxAngle].
 *
 * @param {number} vx - Horizontal velocity in pixels per frame/move
 * @param {number} [maxAngle=MAX_TILT_DEG] - Maximum tilt in degrees
 * @param {number} [sensitivity=TILT_SENSITIVITY] - Velocity multiplier
 * @returns {number} Tilt in degrees
 */
export function calculateTilt(vx, maxAngle = MAX_TILT_DEG, sensitivity = TILT_SENSITIVITY) {
  if (typeof vx !== 'number' || isNaN(vx)) return 0;
  const raw = vx * sensitivity;
  return Math.max(-maxAngle, Math.min(maxAngle, raw));
}

/**
 * Checks if pointer movement exceeds drag activation threshold.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} currentX
 * @param {number} currentY
 * @param {number} [threshold=DRAG_THRESHOLD]
 * @returns {boolean}
 */
export function isThresholdExceeded(startX, startY, currentX, currentY, threshold = DRAG_THRESHOLD) {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}

/**
 * Finds the first registered drop target that accepts the payload at (x, y).
 *
 * @param {Array<object>} targets
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @param {object} payload
 * @returns {object|null}
 */
export function findMatchingDropTarget(targets, x, y, payload) {
  if (!Array.isArray(targets)) return null;
  for (const target of targets) {
    if (!target) continue;
    if (typeof target.accepts === 'function' && !target.accepts(payload)) continue;
    if (typeof target.containsPoint === 'function' && target.containsPoint(x, y)) {
      return target;
    }
  }
  return null;
}

export default class DragManager {
  /**
   * @param {Phaser.Scene} [scene]
   */
  constructor(scene = null) {
    this.scene = scene;
    /** @type {Array<object>} Registered drop targets */
    this.dropTargets = [];
    /** @type {object|null} Current active drag session */
    this.activeDrag = null;
    /** @type {HTMLElement|null} Active ghost element */
    this.ghostEl = null;
    /** @type {object|null} Current hovered drop target */
    this.currentHoverTarget = null;

    this._boundMove = this._onPointerMove.bind(this);
    this._boundUp = this._onPointerUp.bind(this);
    this._boundCancel = this._onPointerCancel.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);

    this._isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * Register a drop target.
   *
   * @param {object} target
   * @param {string} target.id - Unique ID
   * @param {Function} [target.accepts] - (payload) => boolean
   * @param {Function} target.containsPoint - (x, y) => boolean
   * @param {Function} [target.onHover] - (isHovered, payload) => void
   * @param {Function} target.onDrop - (payload, coords) => boolean|void
   * @returns {() => void} Unregister function
   */
  registerDropTarget(target) {
    if (!target || !target.id) return () => {};
    this.dropTargets = this.dropTargets.filter(t => t.id !== target.id);
    this.dropTargets.push(target);
    return () => this.unregisterDropTarget(target.id);
  }

  /**
   * Unregister a drop target by ID.
   * @param {string} id
   */
  unregisterDropTarget(id) {
    this.dropTargets = this.dropTargets.filter(t => t.id !== id);
    if (this.currentHoverTarget?.id === id) {
      this.currentHoverTarget = null;
    }
  }

  /**
   * Initiate a drag from a DOM PointerEvent.
   *
   * @param {PointerEvent|MouseEvent} event
   * @param {object} payload
   */
  startDrag(event, payload) {
    if (event.button !== undefined && event.button !== 0) return;
    this.cancelDrag();

    const pointerId = event.pointerId ?? 1;
    const clientX = event.clientX;
    const clientY = event.clientY;

    this.activeDrag = {
      pointerId,
      payload,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      lastX: clientX,
      lastY: clientY,
      vx: 0,
      vy: 0,
      isDragging: false,
      startedAt: Date.now(),
    };

    if (this._isBrowser) {
      try {
        if (event.target?.setPointerCapture && event.pointerId !== undefined) {
          event.target.setPointerCapture(event.pointerId);
        }
      } catch (_) {}

      window.addEventListener('pointermove', this._boundMove, { passive: false });
      window.addEventListener('pointerup', this._boundUp, { passive: false });
      window.addEventListener('pointercancel', this._boundCancel, { passive: false });
      window.addEventListener('keydown', this._boundKeyDown);
    }
  }

  /**
   * Initiate a drag originating from Phaser input.
   *
   * @param {Phaser.Input.Pointer} pointer
   * @param {object} payload
   */
  startFromPhaser(pointer, payload) {
    this.cancelDrag();

    const clientX = pointer.event ? pointer.event.clientX : pointer.x;
    const clientY = pointer.event ? pointer.event.clientY : pointer.y;
    const pointerId = pointer.id ?? 1;

    this.activeDrag = {
      pointerId,
      payload,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      lastX: clientX,
      lastY: clientY,
      vx: 0,
      vy: 0,
      isDragging: false,
      startedAt: Date.now(),
    };

    if (this._isBrowser) {
      window.addEventListener('pointermove', this._boundMove, { passive: false });
      window.addEventListener('pointerup', this._boundUp, { passive: false });
      window.addEventListener('pointercancel', this._boundCancel, { passive: false });
      window.addEventListener('keydown', this._boundKeyDown);
    }
  }

  /**
   * Internal pointer move handler.
   */
  _onPointerMove(event) {
    if (!this.activeDrag) return;
    if (event.pointerId !== undefined && event.pointerId !== this.activeDrag.pointerId) return;

    const x = event.clientX;
    const y = event.clientY;

    this.activeDrag.vx = x - this.activeDrag.lastX;
    this.activeDrag.vy = y - this.activeDrag.lastY;
    this.activeDrag.lastX = x;
    this.activeDrag.lastY = y;
    this.activeDrag.currentX = x;
    this.activeDrag.currentY = y;

    // Check threshold
    if (!this.activeDrag.isDragging) {
      if (isThresholdExceeded(this.activeDrag.startX, this.activeDrag.startY, x, y)) {
        this.activeDrag.isDragging = true;
        this._createGhost(this.activeDrag.payload);
        if (typeof this.activeDrag.payload.onDragStart === 'function') {
          this.activeDrag.payload.onDragStart();
        }
        if (this._isBrowser) {
          document.body.classList.add('drag-manager-active');
        }
      } else {
        return;
      }
    }

    event.preventDefault();

    // Position ghost with physics tilt
    this._updateGhostPosition(x, y, this.activeDrag.vx);

    // Hit-test drop targets
    const target = this._resolveTarget(x, y, this.activeDrag.payload);
    if (target !== this.currentHoverTarget) {
      if (this.currentHoverTarget && typeof this.currentHoverTarget.onHover === 'function') {
        this.currentHoverTarget.onHover(false, this.activeDrag.payload);
      }
      this.currentHoverTarget = target;
      if (this.currentHoverTarget && typeof this.currentHoverTarget.onHover === 'function') {
        this.currentHoverTarget.onHover(true, this.activeDrag.payload);
      }
    }
  }

  /**
   * Internal pointer up handler (Drop).
   */
  _onPointerUp(event) {
    if (!this.activeDrag) return;
    if (event.pointerId !== undefined && event.pointerId !== this.activeDrag.pointerId) return;

    const drag = this.activeDrag;
    const x = event.clientX;
    const y = event.clientY;

    if (drag.isDragging) {
      const target = this._resolveTarget(x, y, drag.payload);
      if (target) {
        if (typeof target.onHover === 'function') {
          target.onHover(false, drag.payload);
        }
        target.onDrop(drag.payload, { x, y });
        if (typeof drag.payload.onDropSuccess === 'function') {
          drag.payload.onDropSuccess(target);
        }
      } else {
        // Dropped outside any valid target
        if (typeof drag.payload.onDropOutside === 'function') {
          drag.payload.onDropOutside({ x, y });
        }
      }
    } else {
      // Click without drag movement
      if (typeof drag.payload.onClick === 'function') {
        drag.payload.onClick(event);
      }
    }

    this._cleanUp();
  }

  /**
   * Cancel drag on pointercancel or Escape key.
   */
  _onPointerCancel() {
    this.cancelDrag();
  }

  _onKeyDown(event) {
    if (event.key === 'Escape') {
      this.cancelDrag();
    }
  }

  /**
   * Explicitly cancel current drag and restore source states.
   */
  cancelDrag() {
    if (!this.activeDrag) return;
    if (this.activeDrag.isDragging && typeof this.activeDrag.payload.onCancel === 'function') {
      this.activeDrag.payload.onCancel();
    }
    this._cleanUp();
  }

  _cleanUp() {
    if (this.currentHoverTarget && typeof this.currentHoverTarget.onHover === 'function') {
      this.currentHoverTarget.onHover(false, this.activeDrag?.payload);
    }
    this.currentHoverTarget = null;

    if (this.activeDrag && typeof this.activeDrag.payload.onDragEnd === 'function') {
      this.activeDrag.payload.onDragEnd();
    }

    this._destroyGhost();

    if (this._isBrowser) {
      document.body.classList.remove('drag-manager-active');
      window.removeEventListener('pointermove', this._boundMove);
      window.removeEventListener('pointerup', this._boundUp);
      window.removeEventListener('pointercancel', this._boundCancel);
      window.removeEventListener('keydown', this._boundKeyDown);
    }

    this.activeDrag = null;
  }

  /**
   * Creates the floating weighty ghost element.
   */
  _createGhost(payload) {
    if (!this._isBrowser) return;

    this._destroyGhost();

    const ghost = document.createElement('div');
    ghost.className = 'drag-manager-ghost';

    if (payload.type === 'item') {
      const countLabel = payload.count > 1 ? `<span class="ghost-badge">${payload.count}</span>` : '';
      ghost.innerHTML = `
        <div class="ghost-item-card">
          ${pixelIcon(payload.id, 'ghost-item-icon')}
          ${countLabel}
        </div>
      `;
    } else if (payload.type === 'script_card') {
      ghost.innerHTML = `
        <div class="ghost-script-card">
          <span class="ghost-script-icon">🤖</span>
          <span class="ghost-script-title">${payload.name || payload.scriptId || 'Script'}</span>
        </div>
      `;
    } else {
      ghost.innerHTML = `<div class="ghost-generic">${payload.name || 'Moving...'}</div>`;
    }

    document.body.appendChild(ghost);
    this.ghostEl = ghost;
  }

  /**
   * Updates ghost position and tilt angle.
   */
  _updateGhostPosition(x, y, vx = 0) {
    if (!this.ghostEl) return;
    const tilt = calculateTilt(vx);
    this.ghostEl.style.transform = `translate3d(${x + 12}px, ${y + 12}px, 0) rotate(${tilt}deg) scale(1.1)`;
  }

  /**
   * Destroys active ghost element.
   */
  _destroyGhost() {
    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }
  }

  /**
   * Resolve matching drop target based on coordinate and payload.
   */
  _resolveTarget(x, y, payload) {
    // 1. Check registered drop targets first
    const matched = findMatchingDropTarget(this.dropTargets, x, y, payload);
    if (matched) return matched;

    // 2. DOM element inspection fallback
    if (this._isBrowser && typeof document.elementFromPoint === 'function') {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;

      // Check if dropped on drone card drop zone
      if (payload.type === 'script_card') {
        const droneZone = el.closest('.drone-card-drop-zone');
        if (droneZone) {
          const droneId = droneZone.getAttribute('data-drone-id');
          return {
            id: `drone-zone-${droneId}`,
            element: droneZone,
            onHover: (active) => droneZone.classList.toggle('dragover', active),
            onDrop: (p) => {
              if (this.scene?.editorBridge?.scriptManager) {
                this.scene.editorBridge.scriptManager.assignScriptToDrone(p.scriptId, droneId);
                this.scene.editorBridge.consoleManager?.addLine(`Script card linked to ${droneId}`, 'info');
                this.scene.editorBridge._renderDevicesTab();
              }
            }
          };
        }
      }

      // Check if dropped on storage container
      if (payload.type === 'item') {
        const storageContainer = el.closest('[data-storage-container]');
        if (storageContainer && this.scene?.storageUI) {
          const dest = storageContainer.dataset.storageContainer;
          return {
            id: `storage-${dest}`,
            element: storageContainer,
            onHover: (active) => storageContainer.classList.toggle('drop-target', active),
            onDrop: (p) => {
              if (p.source === 'hotbar') {
                // Drop from hotbar to storage
                const amount = p.count || 1;
                const storage = this.scene.storageUI;
                if (dest === 'warehouse') {
                  this.scene.warehouse.deposit(p.id, amount);
                } else {
                  this.scene.inventorySystem.addItem(p.id, amount);
                }
                this.scene.hotbar.unequipSlot(p.slotIndex);
                storage.render();
              } else if (p.source !== dest) {
                this.scene.storageUI.transfer(p.source, dest, p.id, p.count || 1);
              }
            }
          };
        }
      }
    }

    return null;
  }
}
