import { TILE_SIZE } from '../config/constants.js';

/**
 * Entity representing an active teleporter pad in the world.
 * Manages the animated portal sprite and cleanup.
 */
export default class Teleporter {
  /**
   * @param {object} scene - Phaser GameScene instance
   * @param {number} tx - Tile X coordinate
   * @param {number} ty - Tile Y coordinate
   * @param {string} name - Pad identifier label (e.g. 'TP-1')
   */
  constructor(scene, tx, ty, name) {
    this.scene = scene;
    this.tileX = tx;
    this.tileY = ty;
    this.name = name;

    this.sprite = scene.add?.image?.(
      tx * TILE_SIZE + TILE_SIZE / 2,
      ty * TILE_SIZE + TILE_SIZE / 2,
      'building_teleporter',
      0
    ) || null;
    this.sprite?.setDepth?.(5);

    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let on = false;

    this.timer = (reduce || !scene.time?.addEvent) ? null : scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        on = !on;
        this.sprite?.setFrame?.(on ? 1 : 0);
      },
    });
  }

  destroy() {
    this.timer?.remove?.();
    this.sprite?.destroy?.();
  }
}
