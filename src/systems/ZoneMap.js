/**
 * @fileoverview ZoneMap — Single source of truth for zone boundaries, fences, and gates.
 * Prevents hardcoding fence and gate checks in multiple places.
 */
import { GRID_COLS, GRID_ROWS, ZONE_BOUNDS, GATES } from '../config/constants.js';

export class ZoneMap {
  /**
   * Determine which zone a tile coordinate belongs to.
   * @param {number} x
   * @param {number} y
   * @returns {string|null} Zone identifier (e.g. 'zone1', 'zone2', etc.)
   */
  static getZoneAt(x, y) {
    for (const [zoneKey, bounds] of Object.entries(ZONE_BOUNDS)) {
      if (x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2) {
        return zoneKey;
      }
    }
    return null;
  }

  /**
   * Check if a coordinate is a gate tile.
   * @param {number} x
   * @param {number} y
   * @returns {object|null} Gate definition if true, otherwise null.
   */
  static getGateAt(x, y) {
    for (const gate of Object.values(GATES)) {
      if (gate.x === x && gate.y === y) {
        return gate;
      }
    }
    return null;
  }

  /**
   * Check if a coordinate is a gate tile.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  static isGateTile(x, y) {
    return ZoneMap.getGateAt(x, y) !== null;
  }

  /**
   * Check if a coordinate is a fence tile.
   * Fences include:
   * 1. Outer perimeter borders
   * 2. Zone separators, excluding gate positions
   * @param {number} x
   * @param {number} y
   * @param {number} [cols=GRID_COLS]
   * @param {number} [rows=GRID_ROWS]
   * @returns {boolean}
   */
  static isFenceTile(x, y, cols = GRID_COLS, rows = GRID_ROWS) {
    // 1. Outer borders
    if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
      return true;
    }

    // 2. Zone separator fences (excluding gates)
    // Separator between Zone 1 & 2 (x=19, y 0..19)
    if (x === 19 && y >= 0 && y <= 19) {
      return y !== GATES.gate2?.y;
    }

    // Separator between Zone 1/2 & 3 (y=19, x 0..39)
    if (y === 19 && x >= 0 && x <= 39) {
      return x !== GATES.gate3?.x;
    }

    // Separator between Zone 2/3 & 4 and eastern boundary of Zone 5 (x=39, y 0..rows-1)
    if (x === 39 && y >= 0 && y < rows) {
      return y !== GATES.gate4?.y;
    }

    // Separator between Zone 3 & 5 (y=39, x 0..39)
    if (y === 39 && x >= 0 && x <= 39) {
      return x !== GATES.gate5?.x;
    }

    return false;
  }
}

export default ZoneMap;
