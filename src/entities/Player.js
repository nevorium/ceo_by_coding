/**
 * @fileoverview Player entity – the farmer avatar controlled by keyboard.
 *
 * Extends Phaser.GameObjects.Sprite and lives on the tile grid.
 * Movement is tile-based (one tile per keypress) with smooth tweens.
 * Supports WASD and Arrow keys.
 */

import Phaser from 'phaser';
import {
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
} from '../config/constants.js';

/** Duration (ms) of the walk tween between tiles */
const MOVE_DURATION = 150;

/** Direction deltas and animation frame indices */
const DIRECTION_DATA = {
  down:  { dx:  0, dy:  1, animStart: 0  },
  up:    { dx:  0, dy: -1, animStart: 4  },
  left:  { dx: -1, dy:  0, animStart: 8  },
  right: { dx:  1, dy:  0, animStart: 12 },
};

/** Fallback tint colours when sprite animations are unavailable */
const DIRECTION_TINTS = {
  down:  0xffffff,
  up:    0xccccff,
  left:  0xffcccc,
  right: 0xccffcc,
};

/**
 * @class Player
 * @extends Phaser.GameObjects.Sprite
 *
 * Keyboard-controlled farmer that moves on the tile grid.
 */
export default class Player extends Phaser.GameObjects.Sprite {
  /**
   * @param {Phaser.Scene} scene – The owning scene.
   * @param {number}       tx   – Starting tile-X coordinate.
   * @param {number}       ty   – Starting tile-Y coordinate.
   */
  constructor(scene, tx, ty) {
    // Convert tile coords → pixel centre
    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE + TILE_SIZE / 2;

    super(scene, px, py, 'player', 0);
    this.setDisplaySize(TILE_SIZE, TILE_SIZE);

    /** @type {number} Current tile-X */
    this.tileX = tx;
    /** @type {number} Current tile-Y */
    this.tileY = ty;

    /** @type {'up'|'down'|'left'|'right'} Direction the player is facing */
    this.facing = 'down';

    /** @type {boolean} True while a movement tween is in progress */
    this.isMoving = false;

    /** @type {boolean} Whether sprite animations were created successfully */
    this._hasAnimations = false;

    // ── Add to scene ──────────────────────────────────────────────
    scene.add.existing(this);
    this.setDepth(10);

    // ── Create animations (gracefully) ────────────────────────────
    this._createAnimations();

    // ── Input keys ────────────────────────────────────────────────
    /** @private */
    this._cursors = scene.input.keyboard.createCursorKeys();

    /** @private */
    this._wasd = scene.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Remove key captures to prevent Phaser from blocking keyboard inputs in Monaco editor
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.removeCapture([
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.D,
      ]);
    }

    /** @private Reference to the GridManager (set externally if needed) */
    this.gridManager = null;
  }

  /* ================================================================
   *  ANIMATION SETUP
   * ================================================================ */

  /**
   * Try to create walk animations from the 'player' spritesheet.
   * Falls back to tint-based direction indication if the texture is
   * missing or has no frames.
   * @private
   */
  _createAnimations() {
    const scene = this.scene;
    const texture = scene.textures.get('player');

    // If the texture is the default missing-texture, skip animation creation
    if (!texture || texture.key === '__MISSING') {
      console.warn('Player: "player" texture not found – using tint fallback.');
      return;
    }

    const frameCount = texture.getFrameNames().length;

    // Need at least 16 frames for 4 directions × 4 frames each
    if (frameCount < 16) {
      console.warn(
        `Player: "player" spritesheet has ${frameCount} frames (need 16) – using tint fallback.`,
      );
      return;
    }

    try {
      for (const [dir, data] of Object.entries(DIRECTION_DATA)) {
        if (scene.anims.exists(`walk-${dir}`)) continue;
        // Walk animation: 4 frames per direction
        scene.anims.create({
          key: `walk-${dir}`,
          frames: scene.anims.generateFrameNumbers('player', {
            start: data.animStart,
            end: data.animStart + 3,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
      this._hasAnimations = true;
    } catch (err) {
      console.warn('Player: failed to create animations –', err.message);
    }
  }

  /* ================================================================
   *  PUBLIC METHODS
   * ================================================================ */

  /**
   * Called every frame by the scene's `update()`.
   * Reads keyboard input and triggers tile movement.
   */
  update() {
    if (this.isMoving) return;

    // ── Skip input when Monaco or any DOM input has focus ──────────
    // This prevents WASD from moving the player while the user is typing code.
    if (this._isDOMInputFocused()) return;

    // Determine desired direction from keyboard
    const dir = this._getInputDirection();
    if (!dir) return;

    const { dx, dy } = DIRECTION_DATA[dir];
    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    // Update facing regardless of whether we can actually move
    this.facing = dir;
    this._applyFacingVisual();

    // Bounds check
    if (nextX < 0 || nextX >= GRID_COLS || nextY < 0 || nextY >= GRID_ROWS) {
      return;
    }

    // Optional walkability check via GridManager
    if (this.gridManager && typeof this.gridManager.isWalkable === 'function') {
      if (!this.gridManager.isWalkable(nextX, nextY)) return;
    }

    this.moveTo(nextX, nextY);
  }

  /**
   * Move the player to a specific tile with a smooth tween.
   *
   * @param {number} tileX – Target tile-X.
   * @param {number} tileY – Target tile-Y.
   * @returns {Promise<void>} Resolves when the move is complete.
   */
  moveTo(tileX, tileY) {
    if (this.isMoving) return Promise.resolve();

    this.isMoving = true;
    this.tileX = tileX;
    this.tileY = tileY;

    const targetPX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const targetPY = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Play walk animation if available
    if (this._hasAnimations) {
      this.play(`walk-${this.facing}`, true);
    }

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: targetPX,
        y: targetPY,
        duration: MOVE_DURATION,
        ease: 'Power2',
        onComplete: () => {
          this.isMoving = false;

          // Stop on idle frame (first frame of the direction)
          if (this._hasAnimations) {
            this.stop();
            this.setFrame(DIRECTION_DATA[this.facing].animStart);
          }

          resolve();
        },
      });
    });
  }

  /**
   * Return the tile coordinates of the tile the player is currently facing.
   *
   * @returns {{ x: number, y: number }}
   */
  getFacingTile() {
    const { dx, dy } = DIRECTION_DATA[this.facing];
    return {
      x: this.tileX + dx,
      y: this.tileY + dy,
    };
  }

  /**
   * Snap the player to a tile position immediately (no animation).
   *
   * @param {number} tx – Tile-X.
   * @param {number} ty – Tile-Y.
   */
  setTilePosition(tx, ty) {
    this.tileX = tx;
    this.tileY = ty;

    this.setPosition(
      tx * TILE_SIZE + TILE_SIZE / 2,
      ty * TILE_SIZE + TILE_SIZE / 2,
    );
  }

  /* ================================================================
   *  PRIVATE HELPERS
   * ================================================================ */

  /**
   * Returns true when the keyboard focus is on a DOM text input so that
   * game movement keys don't fire while the player is typing code.
   * @private
   * @returns {boolean}
   */
  _isDOMInputFocused() {
    if (this.scene.isModalOpen) return true;
    const active = document.activeElement;
    if (!active) return false;

    // Typing inputs and textareas (includes Monaco's hidden textarea)
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

    // Monaco editor's containing div (contenteditable lines)
    const monacoContainer = document.getElementById('monaco-container');
    if (monacoContainer && monacoContainer.contains(active)) return true;

    // Profile name input
    if (active.id === 'profile-name-input') return true;

    return false;
  }

  /**
   * Read WASD / Arrow key state and return the desired direction,
   * or `null` if no movement key is pressed.
   * @private
   * @returns {'up'|'down'|'left'|'right'|null}
   */
  _getInputDirection() {
    const c = this._cursors;
    const w = this._wasd;

    if (c.up.isDown    || w.up.isDown)    return 'up';
    if (c.down.isDown  || w.down.isDown)  return 'down';
    if (c.left.isDown  || w.left.isDown)  return 'left';
    if (c.right.isDown || w.right.isDown) return 'right';

    return null;
  }

  /**
   * Apply a visual indication of the facing direction.
   * Uses animation idle frame if available, otherwise tints the sprite.
   * @private
   */
  _applyFacingVisual() {
    if (this._hasAnimations) {
      // Show idle frame for the new direction
      if (!this.isMoving) {
        this.setFrame(DIRECTION_DATA[this.facing].animStart);
      }
    } else {
      // Tint fallback
      this.setTint(DIRECTION_TINTS[this.facing]);
    }
  }

  /**
   * Clean up input bindings when the player is destroyed.
   */
  destroy(fromScene) {
    // Phaser's keyboard manager handles cleanup on scene shutdown,
    // but we clear our references just in case.
    this._cursors = null;
    this._wasd = null;
    super.destroy(fromScene);
  }
}
