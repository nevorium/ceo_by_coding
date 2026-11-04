import UniversalEventEmitter from '../utils/EventEmitter.js';
import ZoneMap from './ZoneMap.js';
import { isZoneRevealed } from './NavigationSystem.js';
import { TELEPORT } from '../config/constants.js';

export const NAME_PATTERN = /^[A-Za-z0-9 _-]{1,16}$/;

/**
 * Pure function to find an empty walkable tile adjacent to a pad for arrival.
 * Priority: Bottom (0, 1), Right (1, 0), Left (-1, 0), Top (0, -1).
 * Fallback: 2-tile radius ring (Chebyshev distance = 2).
 * @param {{ x: number, y: number }} pad
 * @param {(x: number, y: number) => boolean} isFree
 * @returns {{ x: number, y: number }|null}
 */
export function findArrivalTile(pad, isFree) {
  if (!pad || typeof isFree !== 'function') return null;

  // 1-tile adjacent priority: Bottom, Right, Left, Top
  const adjacent = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  for (const [dx, dy] of adjacent) {
    if (isFree(pad.x + dx, pad.y + dy)) {
      return { x: pad.x + dx, y: pad.y + dy };
    }
  }

  // 2-tile radius ring fallback
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      if (isFree(pad.x + dx, pad.y + dy)) {
        return { x: pad.x + dx, y: pad.y + dy };
      }
    }
  }

  return null;
}

export default class TeleportSystem {
  /**
   * @param {object} scene - GameScene instance
   */
  constructor(scene) {
    this.scene = scene;
    this.events = new UniversalEventEmitter();
    this.lastTravelAt = -Infinity;
    this.traveling = false;

    // Arrow function so `this` is preserved when passed as callback
    this.isFree = (x, y) => Boolean(
      this.scene?.gridManager?.isWalkable?.(x, y) &&
      !this.scene?.wildlifeSystem?.getAnimalAt?.(x, y)
    );
  }

  /**
   * Get all placed teleporter pads in the world.
   * @returns {Array<object>}
   */
  getPads() {
    if (!this.scene?.buildingSystem?.buildings) return [];
    return [...this.scene.buildingSystem.buildings.values()].filter(b => b.type === 'teleporter');
  }

  /**
   * Generate next available pad name (TP-1, TP-2, filling gaps).
   * @returns {string}
   */
  nextName() {
    const used = new Set(this.getPads().map(p => p.name));
    for (let n = 1; ; n++) {
      const candidate = `TP-${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }

  /**
   * Get destination pads reachable from a given origin pad.
   * @param {string} fromId
   * @returns {Array<object>}
   */
  getDestinations(fromId) {
    const from = this.scene?.buildingSystem?.buildings.get(fromId);
    if (!from) return [];
    return this.getPads().filter(p => p.id !== fromId).map(p => {
      const zoneKey = ZoneMap.getZoneAt(p.x, p.y);
      return {
        ...p,
        zoneKey,
        distance: Math.abs(p.x - from.x) + Math.abs(p.y - from.y),
        reachable: isZoneRevealed(this.scene?.unlockedZones, zoneKey),
      };
    });
  }

  /**
   * Check if travel between two pads is permitted.
   * @param {string} fromId
   * @param {string} toId
   * @returns {{ ok: boolean, reason?: string, arrival?: {x: number, y: number}, from?: object, to?: object }}
   */
  canTravel(fromId, toId) {
    const s = this.scene;
    const b = s?.buildingSystem?.buildings;
    const from = b?.get(fromId);
    const to = b?.get(toId);

    if (!from || !to || from.id === to.id) {
      return { ok: false, reason: 'missing' };
    }
    if (this.traveling || s.player?.isMoving) {
      return { ok: false, reason: 'moving' };
    }
    if (s.time?.now && s.time.now - this.lastTravelAt < TELEPORT.COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
    const toZone = ZoneMap.getZoneAt(to.x, to.y);
    if (!isZoneRevealed(s.unlockedZones, toZone)) {
      return { ok: false, reason: 'zone_locked' };
    }
    const arrival = findArrivalTile(to, this.isFree);
    if (!arrival) {
      return { ok: false, reason: 'blocked' };
    }

    return { ok: true, arrival, from, to };
  }

  /**
   * Execute teleport travel between two pads with camera transition and motion lock.
   * @param {string} fromId
   * @param {string} toId
   * @returns {{ ok: boolean, reason?: string, arrival?: {x: number, y: number}, from?: object, to?: object }}
   */
  travel(fromId, toId) {
    const check = this.canTravel(fromId, toId);
    if (!check.ok) return check;

    const s = this.scene;
    const cam = s?.cameras?.main;
    const { arrival, from, to } = check;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    this.traveling = true;
    if (s.player) s.player.isMoving = true;
    s.tweens?.killTweensOf?.(s.player);

    const jump = () => {
      try {
        s.player?.setTilePosition?.(arrival.x, arrival.y);
        cam?.stopFollow?.();
        const px = s.player?.x ?? (arrival.x * 32 + 16);
        const py = s.player?.y ?? (arrival.y * 32 + 16);
        cam?.centerOn?.(px, py);
        cam?.startFollow?.(s.player, true, 0.1, 0.1);

        if (!reduce) {
          s._emitPixelParticles?.(arrival.x, arrival.y, 0x63d8d1, 12);
          cam?.fadeIn?.(150);
        }
        this.lastTravelAt = s.time?.now || Date.now();
        this.events.emit('traveled', { from, to, arrival });
      } finally {
        if (s.player) s.player.isMoving = false;
        this.traveling = false;
      }
    };

    if (reduce || !s.time?.delayedCall || !cam?.fadeOut) {
      jump();
    } else {
      s._emitPixelParticles?.(from.x, from.y, 0x63d8d1, 12);
      cam.fadeOut(120);
      s.time.delayedCall(130, jump);
    }

    return { ok: true, arrival, from, to };
  }

  /**
   * Rename an existing teleporter pad.
   * @param {string} id
   * @param {string} name
   * @returns {{ ok: boolean, reason?: string, name?: string }}
   */
  rename(id, name) {
    if (!name || typeof name !== 'string' || !NAME_PATTERN.test(name.trim())) {
      return { ok: false, reason: 'invalid_format' };
    }
    const cleanName = name.trim();
    const pads = this.getPads();
    const target = pads.find(p => p.id === id);
    if (!target) return { ok: false, reason: 'not_found' };

    const duplicate = pads.some(p => p.id !== id && p.name?.toLowerCase() === cleanName.toLowerCase());
    if (duplicate) return { ok: false, reason: 'duplicate' };

    target.name = cleanName;
    const padEntity = this.scene?.buildingSystem?.pads?.get(id);
    if (padEntity) padEntity.name = cleanName;

    this.scene?.saveSystem?.saveLocal?.();
    this.events.emit('pad-renamed', { id, name: cleanName });
    return { ok: true, name: cleanName };
  }
}
