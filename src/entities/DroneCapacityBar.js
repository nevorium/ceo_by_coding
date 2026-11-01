/**
 * @fileoverview DroneCapacityBar — Pixel-crisp inventory fill bar for drones.
 *
 * Specifications:
 * - Dimensions: 26×4 px, 1px border #1b1b1b
 * - Position: y + 28 (below id label at y + 18)
 * - Color: HSL interpolated via fillColor() (0% yellow #FFD84A -> 50% orange #FF9A2E -> 100% red #E53935)
 * - Minimum fill: >= 1px if used > 0
 * - Animation: Lerp width towards target at ~8/s
 * - Full (100%): Subtle red pulse
 * - Empty (0%): Alpha 0.45 (subtle, non-distracting)
 */
import { fillColor } from '../utils/fillColor.js';

export class DroneCapacityBar {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x Initial X
   * @param {number} y Initial Y
   */
  constructor(scene, x, y) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(17);

    this.width = 26;
    this.height = 4;
    this.innerWidth = 24; // 26 - 2px border
    this.innerHeight = 2; // 4 - 2px border

    this.x = x;
    this.y = y;

    this.used = 0;
    this.capacity = 100;

    this.currentWidth = 0;
    this.targetWidth = 0;
    this.ratio = 0;

    this.pulseTimer = 0;
    this.isDirty = true;

    this.draw();
  }

  /**
   * Update used and capacity counts.
   * @param {number} used
   * @param {number} capacity
   */
  setValues(used, capacity) {
    const newUsed = Math.max(0, used || 0);
    const newCap = Math.max(1, capacity || 1);
    if (this.used === newUsed && this.capacity === newCap) return;

    this.used = newUsed;
    this.capacity = newCap;
    this.ratio = Math.min(1, this.used / this.capacity);

    if (this.used <= 0) {
      this.targetWidth = 0;
    } else {
      // Minimum 1px if used > 0
      this.targetWidth = Math.max(1, Math.round(this.innerWidth * this.ratio));
    }
    this.isDirty = true;
  }

  /**
   * Called every frame from Drone.update().
   * @param {number} x
   * @param {number} y
   * @param {number} deltaMs
   */
  update(x, y, deltaMs = 16) {
    let positionChanged = false;
    if (this.x !== x || this.y !== y) {
      this.x = x;
      this.y = y;
      positionChanged = true;
    }

    // Width lerp animation (~8/sec: factor = 1 - Math.exp(-8 * dt))
    const dt = Math.min(deltaMs / 1000, 0.1);
    const lerpFactor = 1 - Math.exp(-8 * dt);
    const diff = this.targetWidth - this.currentWidth;

    if (Math.abs(diff) > 0.05) {
      this.currentWidth += diff * lerpFactor;
      this.isDirty = true;
    } else if (this.currentWidth !== this.targetWidth) {
      this.currentWidth = this.targetWidth;
      this.isDirty = true;
    }

    // 100% full subtle pulse
    if (this.ratio >= 1) {
      this.pulseTimer += dt * 3; // ~0.5 Hz pulse
      this.isDirty = true;
    } else {
      this.pulseTimer = 0;
    }

    if (this.isDirty || positionChanged) {
      this.draw();
      this.isDirty = false;
    }
  }

  /**
   * Draw the capacity bar graphics.
   */
  draw() {
    this.graphics.clear();

    const drawX = Math.round(this.x - this.width / 2);
    const drawY = Math.round(this.y);

    const isFull = this.ratio >= 1;
    const isEmpty = this.used <= 0;

    let alpha = 1.0;
    if (isEmpty) {
      alpha = 0.45;
    } else if (isFull) {
      // Soft red pulse between 0.65 and 1.0
      alpha = 0.82 + 0.18 * Math.sin(this.pulseTimer * 4);
    }

    this.graphics.setAlpha(alpha);

    // 1. Outer border (1px #1b1b1b = 0x1b1b1b)
    this.graphics.fillStyle(0x1b1b1b, 1);
    this.graphics.fillRect(drawX, drawY, this.width, this.height);

    // 2. Inner background (#101a21 = 0x101a21)
    this.graphics.fillStyle(0x101a21, 1);
    this.graphics.fillRect(drawX + 1, drawY + 1, this.innerWidth, this.innerHeight);

    // 3. Filled bar (HSL interpolated color)
    if (this.currentWidth >= 0.5) {
      const barColor = fillColor(this.ratio);
      const renderW = Math.min(this.innerWidth, Math.max(1, Math.round(this.currentWidth)));
      this.graphics.fillStyle(barColor, 1);
      this.graphics.fillRect(drawX + 1, drawY + 1, renderW, this.innerHeight);
    }
  }

  /**
   * Set visibility of the bar.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.graphics.setVisible(visible);
  }

  /**
   * Clean up graphics on drone destroy.
   */
  destroy() {
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
  }
}

export default DroneCapacityBar;
