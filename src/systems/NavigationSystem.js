import UniversalEventEmitter from '../utils/EventEmitter.js';
import ZoneMap from './ZoneMap.js';
import { ZONE_LABELS, UNKNOWN_ZONE_LABEL, GATES } from '../config/constants.js';

/**
 * Format an integer coordinate into a zero-padded 2-digit string.
 * @param {number} n
 * @returns {string} e.g. 5 -> '05', 12 -> '12'
 */
export function formatCoord(n) {
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0');
}

/**
 * Check if a given zone is revealed/unlocked.
 * Pure function that can be used without an instantiated NavigationSystem.
 * @param {object} unlockedZones - e.g. { zone2: true, zone3: false, ... }
 * @param {string|null} zoneKey - e.g. 'zone1', 'zone2', etc.
 * @returns {boolean}
 */
export function isZoneRevealed(unlockedZones, zoneKey) {
  if (!zoneKey) return false;
  return zoneKey === 'zone1' || Boolean(unlockedZones?.[zoneKey]);
}

/**
 * NavigationSystem — Single source of truth for player position, zone state, and world markers.
 * Decoupled from DOM so it can be 100% unit tested in headless environments.
 */
export default class NavigationSystem {
  /**
   * @param {object} scene - Game scene instance (or mock scene)
   */
  constructor(scene) {
    this.scene = scene;
    this.events = new UniversalEventEmitter();
    this._pos = { x: -1, y: -1 };
    this._revealSig = '';

    // Relay: building changes & opened caches change map markers
    if (scene?.buildingSystem?.events?.on) {
      scene.buildingSystem.events.on('changed', () => this.events.emit('markers-changed'));
    }
    if (scene?.wildlifeSystem?.events?.on) {
      scene.wildlifeSystem.events.on('cache-opened', () => this.events.emit('markers-changed'));
    }
  }

  /**
   * Called each frame from GameScene.update().
   * Lightweight checks (number comparison) to emit changes only when state updates.
   */
  tick() {
    const p = this.scene?.player;
    if (p && (p.tileX !== this._pos.x || p.tileY !== this._pos.y)) {
      this._pos = { x: p.tileX, y: p.tileY };
      this.events.emit('position-changed', this.getPlayerPosition());
    }

    // Zone reveal signature: compare 4-bit state string to detect gate unlocks
    const sig = ['zone2', 'zone3', 'zone4', 'zone5']
      .map(k => (this.scene?.unlockedZones?.[k] ? 1 : 0))
      .join('');

    if (sig !== this._revealSig) {
      this._revealSig = sig;
      this.events.emit('reveal-changed');
    }
  }

  /**
   * Get current player position and zone details.
   * @returns {{ x: number, y: number, zoneKey: string|null, zoneLabel: string }}
   */
  getPlayerPosition() {
    const { x, y } = this._pos;
    const zoneKey = ZoneMap.getZoneAt(x, y); // null in unknown quadrant (40..59, 40..59)
    return {
      x,
      y,
      zoneKey,
      zoneLabel: (zoneKey && ZONE_LABELS[zoneKey]) || UNKNOWN_ZONE_LABEL,
    };
  }

  /**
   * Check if a zone is revealed according to scene's unlockedZones.
   * @param {string|null} zoneKey
   * @returns {boolean}
   */
  isRevealed(zoneKey) {
    return isZoneRevealed(this.scene?.unlockedZones, zoneKey);
  }

  /**
   * Get uniform list of markers for minimap, world map, and navigation.
   * @returns {Array<{ kind: string, id: string, x: number, y: number, w?: number, h?: number, label: string, [key: string]: any }>}
   */
  getMarkers() {
    const markers = [];
    const s = this.scene;
    if (!s) return markers;

    // 1. Player
    if (s.player && typeof s.player.tileX === 'number' && typeof s.player.tileY === 'number') {
      markers.push({
        kind: 'player',
        id: 'player',
        x: s.player.tileX,
        y: s.player.tileY,
        label: 'Pemain',
      });
    }

    // 2. Drones
    if (s.deviceManager?.getAll) {
      for (const d of s.deviceManager.getAll()) {
        markers.push({
          kind: 'drone',
          id: d.id,
          x: d.tileX,
          y: d.tileY,
          label: `Drone ${d.id}`,
        });
      }
    }

    // 3. Central Warehouse (HQ)
    if (s.warehouse) {
      markers.push({
        kind: 'hq',
        id: 'hq',
        x: s.warehouse.tileX,
        y: s.warehouse.tileY,
        w: s.warehouse.tileW || 2,
        h: s.warehouse.tileH || 2,
        label: 'Gudang Pusat',
      });
    }

    // 4. Market Zone
    if (s.marketZone) {
      markers.push({
        kind: 'market',
        id: 'market',
        x: s.marketZone.x,
        y: s.marketZone.y,
        w: s.marketZone.w || 3,
        h: s.marketZone.h || 2,
        label: 'Pasar',
      });
    }

    // 5. Buildings (Satellite Depots & Teleporters)
    if (s.buildingSystem?.buildings) {
      const buildingsList = s.buildingSystem.buildings.values
        ? s.buildingSystem.buildings.values()
        : Object.values(s.buildingSystem.buildings);

      for (const b of buildingsList) {
        if (b.type === 'warehouse') {
          markers.push({
            kind: 'depot',
            id: b.id,
            x: b.x,
            y: b.y,
            w: 2,
            h: 2,
            label: 'Depot Gudang',
          });
        } else if (b.type === 'teleporter') {
          markers.push({
            kind: 'teleporter',
            id: b.id,
            x: b.x,
            y: b.y,
            label: b.name || 'Teleporter',
          });
        }
      }
    }

    // 6. Ancient Caches (Zone 5)
    if (s.wildlifeSystem?.caches && this.isRevealed('zone5')) {
      const cachesList = s.wildlifeSystem.caches.values
        ? s.wildlifeSystem.caches.values()
        : (Array.isArray(s.wildlifeSystem.caches) ? s.wildlifeSystem.caches : Object.values(s.wildlifeSystem.caches));

      for (const c of cachesList) {
        if (!c.opened) {
          markers.push({
            kind: 'cache',
            id: c.id,
            x: c.x,
            y: c.y,
            label: 'Peti Kuno',
          });
        }
      }
    }

    // 7. Gates
    if (s.gridManager) {
      for (const [gateKey, g] of Object.entries(GATES)) {
        const tile = s.gridManager.getTile ? s.gridManager.getTile(g.x, g.y) : null;
        const isLocked = tile ? Boolean(tile.isLocked) : !this.isRevealed(g.key);
        markers.push({
          kind: 'gate',
          id: gateKey,
          x: g.x,
          y: g.y,
          isLocked,
          zone: g.key,
          label: `Gerbang ${ZONE_LABELS[g.key] || g.key}`,
        });
      }
    }

    return markers;
  }
}
