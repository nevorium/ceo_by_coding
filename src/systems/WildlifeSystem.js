import UniversalEventEmitter from '../utils/EventEmitter.js';
import { TILE_SIZE } from '../config/constants.js';

const MAX_FAUNA = 6;
const ZONE5 = { x1: 1, x2: 38, y1: 41, y2: 58 };

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const MOB_TYPES = Object.freeze({
  hare: {
    id: 'hare',
    name: 'Hare',
    hp: 2,
    maxHp: 2,
    speed: 600,
    xp: 8,
    loot: [
      { id: 'raw_meat', count: 1, chance: 1.0 },
      { id: 'wild_fiber', count: 1, chance: 0.8 },
    ],
  },
  deer: {
    id: 'deer',
    name: 'Deer',
    hp: 4,
    maxHp: 4,
    speed: 900,
    xp: 15,
    loot: [
      { id: 'raw_meat', count: 2, chance: 1.0 },
      { id: 'leather', count: 1, chance: 1.0 },
      { id: 'bone', count: 1, chance: 0.6 },
    ],
  },
  boar: {
    id: 'boar',
    name: 'Wild Boar',
    hp: 6,
    maxHp: 6,
    speed: 1200,
    xp: 25,
    loot: [
      { id: 'raw_meat', count: 2, chance: 1.0 },
      { id: 'bone', count: 2, chance: 1.0 },
      { id: 'leather', count: 1, chance: 0.8 },
    ],
  },
});

export const DISCOVERY_CACHES = Object.freeze([
  {
    id: 'cache_pioneer',
    name: "Pioneer's Stash",
    x: 8,
    y: 43,
    items: [
      { id: 'stone', count: 8 },
      { id: 'wheat_seed', count: 5 },
      { id: 'conveyor_kit', count: 2 },
    ],
    coins: 50,
    xp: 25,
  },
  {
    id: 'cache_builder',
    name: "Ancient Builder's Crate",
    x: 26,
    y: 47,
    items: [
      { id: 'conveyor_kit', count: 4 },
      { id: 'crafting_table_kit', count: 1 },
      { id: 'iron_ingot', count: 3 },
    ],
    coins: 100,
    xp: 40,
  },
  {
    id: 'cache_tech',
    name: "Precursor Tech Capsule",
    x: 33,
    y: 53,
    items: [
      { id: 'wire', count: 4 },
      { id: 'gear', count: 2 },
      { id: 'chip', count: 1 },
    ],
    coins: 150,
    xp: 60,
  },
]);

/**
 * Ecosystem, wildlife fauna, mob combat, and exploration manager
 * for the Southern Wilds (Zone 5 Explore Zone).
 */
export default class WildlifeSystem {
  constructor(scene) {
    this.scene = scene;
    this.fauna = new Map();
    this.drops = new Map();
    this.caches = new Map();
    this.serial = 0;
    this.spawnElapsed = 0;
    this.events = new UniversalEventEmitter();
    this._initCaches();
    scene.events?.once?.('shutdown', () => this.destroy());
  }

  _initCaches() {
    for (const def of DISCOVERY_CACHES) {
      this.caches.set(def.id, {
        ...def,
        opened: false,
        sprite: null,
      });
    }
  }

  ensureCacheVisuals() {
    if (!this.scene.unlockedZones?.zone5) return;
    for (const cache of this.caches.values()) {
      if (!cache.opened && !cache.sprite && this.scene.add) {
        const sprite = this.scene.add.image(
          cache.x * TILE_SIZE + TILE_SIZE / 2,
          cache.y * TILE_SIZE + TILE_SIZE / 2,
          'icon_crate'
        );
        sprite.setDepth?.(4);
        cache.sprite = sprite;
      }
    }
  }

  update(delta) {
    if (!this.scene.unlockedZones?.zone5) return;
    this.ensureCacheVisuals();

    this.spawnElapsed += delta;
    if (this.spawnElapsed >= 3500 && this.fauna.size < MAX_FAUNA) {
      this.spawnElapsed = 0;
      this.spawn();
    }
    for (const animal of this.fauna.values()) {
      animal.dropCooldown -= delta;
      animal.moveCooldown -= delta;
      if (animal.moveCooldown <= 0) this._wander(animal);
      if (animal.dropCooldown <= 0) {
        animal.dropCooldown = 9000 + Math.floor(Math.random() * 5000);
        this._dropFiber(Math.round(animal.tileX), Math.round(animal.tileY));
      }
    }
  }

  spawn(state = null) {
    const mobTypesList = ['hare', 'deer', 'boar'];
    const type = state?.type || mobTypesList[this.serial % mobTypesList.length];
    const mobConfig = MOB_TYPES[type] || MOB_TYPES.hare;

    const x = state?.x ?? randomBetween(ZONE5.x1, ZONE5.x2);
    const y = state?.y ?? randomBetween(ZONE5.y1, ZONE5.y2);
    if (!this.scene.gridManager?.isWalkable(x, y)) return null;

    const id = state?.id || `fauna_${++this.serial}`;
    const sprite = this.scene.add?.image(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2,
      `wildlife_${type}`
    )?.setDepth?.(8) || null;

    const hp = state?.hp !== undefined ? state.hp : mobConfig.hp;
    const maxHp = state?.maxHp !== undefined ? state.maxHp : mobConfig.maxHp;

    const animal = {
      id,
      type,
      name: mobConfig.name,
      tileX: x,
      tileY: y,
      hp,
      maxHp,
      sprite,
      moveCooldown: state?.moveCooldown ?? mobConfig.speed,
      dropCooldown: state?.dropCooldown ?? 7000,
    };
    this.fauna.set(id, animal);
    this.events.emit('animal-spawned', animal);
    return animal;
  }

  _wander(animal) {
    const mobConfig = MOB_TYPES[animal.type] || MOB_TYPES.hare;
    animal.moveCooldown = (mobConfig.speed || 900) + Math.floor(Math.random() * 1200);
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = getRandom(dirs);
    const x = animal.tileX + dx;
    const y = animal.tileY + dy;
    if (x < ZONE5.x1 || x > ZONE5.x2 || y < ZONE5.y1 || y > ZONE5.y2 || !this.scene.gridManager?.isWalkable(x, y)) return;
    animal.tileX = x;
    animal.tileY = y;
    if (this.scene.tweens?.add && animal.sprite) {
      this.scene.tweens.add({
        targets: animal.sprite,
        x: x * TILE_SIZE + TILE_SIZE / 2,
        y: y * TILE_SIZE + TILE_SIZE / 2,
        duration: 340,
        ease: 'Linear',
      });
    }
  }

  getAnimalAt(x, y, tolerance = 0.5) {
    for (const animal of this.fauna.values()) {
      if (Math.hypot(animal.tileX - x, animal.tileY - y) <= tolerance ||
         (Math.round(animal.tileX) === x && Math.round(animal.tileY) === y)) {
        return animal;
      }
    }
    return null;
  }

  getAnimalNear(x, y, radius = 1.5) {
    let nearest = null;
    let minDist = Infinity;
    for (const animal of this.fauna.values()) {
      const dist = Math.hypot(animal.tileX - x, animal.tileY - y);
      if (dist <= radius && dist < minDist) {
        minDist = dist;
        nearest = animal;
      }
    }
    return nearest;
  }

  damageAnimal(animalId, damage = 1, fromX = 0, fromY = 0, scene = null) {
    const animal = typeof animalId === 'object' && animalId !== null ? animalId : this.fauna.get(animalId);
    if (!animal) return { success: false, reason: 'not_found' };

    const effectiveDamage = Math.max(1, Number(damage) || 1);
    animal.hp = Math.max(0, animal.hp - effectiveDamage);

    const refScene = scene || this.scene;

    // Sprite hurt flash
    if (animal.sprite?.setTint) {
      animal.sprite.setTint(0xff4444);
      if (refScene?.time?.delayedCall) {
        refScene.time.delayedCall(220, () => {
          if (animal.sprite) animal.sprite.clearTint?.();
        });
      } else if (typeof setTimeout === 'function') {
        setTimeout(() => {
          if (animal.sprite) animal.sprite.clearTint?.();
        }, 220);
      }
    }

    // Flee behavior away from attacker
    const diffX = Math.sign(animal.tileX - fromX);
    const diffY = Math.sign(animal.tileY - fromY);
    const stepX = diffX !== 0 ? diffX : (Math.random() < 0.5 ? 1 : -1);
    const stepY = diffY !== 0 ? diffY : (Math.random() < 0.5 ? 1 : -1);

    let fleeX = Math.max(ZONE5.x1, Math.min(ZONE5.x2, animal.tileX + stepX * 2));
    let fleeY = Math.max(ZONE5.y1, Math.min(ZONE5.y2, animal.tileY + stepY * 2));
    if (!this.scene.gridManager?.isWalkable(fleeX, fleeY)) {
      fleeX = Math.max(ZONE5.x1, Math.min(ZONE5.x2, animal.tileX + stepX));
      fleeY = Math.max(ZONE5.y1, Math.min(ZONE5.y2, animal.tileY + stepY));
    }

    if (this.scene.gridManager?.isWalkable(fleeX, fleeY)) {
      animal.tileX = fleeX;
      animal.tileY = fleeY;
      animal.moveCooldown = 1400;
      if (this.scene.tweens?.add && animal.sprite) {
        this.scene.tweens.add({
          targets: animal.sprite,
          x: fleeX * TILE_SIZE + TILE_SIZE / 2,
          y: fleeY * TILE_SIZE + TILE_SIZE / 2,
          duration: 260,
          ease: 'Quad.easeOut',
        });
      }
    }

    this.events.emit('animal-damaged', { animal, damage: effectiveDamage, fromX, fromY });

    // Check defeat
    if (animal.hp <= 0) {
      const mobConfig = MOB_TYPES[animal.type] || MOB_TYPES.hare;
      const drops = [];

      for (const loot of mobConfig.loot) {
        const chance = loot.chance ?? 1.0;
        if (Math.random() <= chance) {
          const drop = this.dropItem(animal.tileX, animal.tileY, loot.id, loot.count);
          if (drop) drops.push(drop);
        }
      }

      const xp = mobConfig.xp || 10;
      if (refScene?.profileSystem?.addXp) {
        refScene.profileSystem.addXp(xp);
      }

      animal.sprite?.destroy?.();
      animal.sprite = null;
      this.fauna.delete(animal.id);

      this.events.emit('animal-defeated', {
        animal,
        drops,
        xp,
        fromX,
        fromY,
      });

      return {
        defeated: true,
        animalName: mobConfig.name,
        animal,
        remainingHp: 0,
        maxHp: animal.maxHp,
        drops,
        xp,
      };
    }

    return {
      defeated: false,
      animalName: animal.name,
      animal,
      remainingHp: animal.hp,
      maxHp: animal.maxHp,
    };
  }

  dropItem(x, y, itemId = 'wild_fiber', count = 1) {
    let targetX = x;
    let targetY = y;
    let key = `${targetX},${targetY}`;

    if (this.drops.has(key)) {
      const existing = this.drops.get(key);
      if (existing.id === itemId) {
        existing.count += count;
        this.events.emit('drop-changed');
        return existing;
      }
      // Adjacent tile scatter
      const offsets = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const [ox, oy] of offsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= ZONE5.x1 && nx <= ZONE5.x2 && ny >= ZONE5.y1 && ny <= ZONE5.y2 &&
            this.scene.gridManager?.isWalkable(nx, ny) && !this.drops.has(`${nx},${ny}`)) {
          targetX = nx;
          targetY = ny;
          key = `${targetX},${targetY}`;
          break;
        }
      }
    }

    const textureKey = `icon_${itemId}`;
    const sprite = this.scene.add?.image(
      targetX * TILE_SIZE + TILE_SIZE / 2,
      targetY * TILE_SIZE + TILE_SIZE / 2,
      this.scene.textures?.exists?.(textureKey) ? textureKey : 'icon_crate'
    )?.setDepth?.(9) || null;

    const drop = { x: targetX, y: targetY, id: itemId, count, sprite };
    this.drops.set(key, drop);
    this.events.emit('drop-changed');
    return drop;
  }

  _dropFiber(x, y) {
    return this.dropItem(x, y, 'wild_fiber', 1);
  }

  getDropAt(x, y) {
    return this.drops.get(`${x},${y}`) || null;
  }

  collectAt(x, y, inventory) {
    const key = `${x},${y}`;
    const drop = this.drops.get(key);
    if (!drop) return false;

    if (inventory && typeof inventory.hasSpaceFor === 'function') {
      if (!inventory.hasSpaceFor(drop.id, drop.count)) return false;
    } else {
      const capacity = Number(inventory?.capacity);
      if (Number.isFinite(capacity) && typeof inventory.getTotalCount === 'function' && inventory.getTotalCount() + drop.count > capacity) {
        return false;
      }
    }

    const collectedInfo = { id: drop.id, count: drop.count, x, y };
    inventory.addItem(drop.id, drop.count);
    drop.sprite?.destroy?.();
    this.drops.delete(key);
    this.events.emit('drop-changed');
    this.events.emit('drop-collected', collectedInfo);
    return true;
  }

  getCacheAt(x, y) {
    for (const cache of this.caches.values()) {
      if (!cache.opened && cache.x === x && cache.y === y) return cache;
    }
    return null;
  }

  openCacheAt(x, y, inventory, economy = null, profile = null) {
    const cache = this.getCacheAt(x, y);
    if (!cache || cache.opened) return { success: false, reason: 'not_found' };

    // Check space for items
    if (inventory && typeof inventory.hasSpaceFor === 'function') {
      for (const item of cache.items) {
        if (!inventory.hasSpaceFor(item.id, item.count)) {
          return { success: false, reason: 'inventory_full' };
        }
      }
    }

    // Deliver items
    for (const item of cache.items) {
      inventory.addItem(item.id, item.count);
    }

    // Deliver coins
    if (cache.coins > 0 && economy?.addCoins) {
      economy.addCoins(cache.coins);
    }

    // Award exploration XP
    if (cache.xp > 0 && profile?.addXp) {
      profile.addXp(cache.xp);
    }

    cache.opened = true;
    cache.sprite?.destroy?.();
    cache.sprite = null;

    this.events.emit('cache-opened', cache);
    return { success: true, cache };
  }

  getSaveState() {
    return {
      fauna: [...this.fauna.values()].map(({ id, type, tileX, tileY, hp, maxHp, moveCooldown, dropCooldown }) => ({
        id, type, x: tileX, y: tileY, hp, maxHp, moveCooldown, dropCooldown
      })),
      drops: [...this.drops.values()].map(({ x, y, id, count }) => ({ x, y, id, count })),
      caches: [...this.caches.values()].map(({ id, opened, x, y }) => ({ id, opened, x, y })),
      spawnElapsed: this.spawnElapsed,
    };
  }

  loadSaveState(state) {
    if (!state || typeof state !== 'object') return;
    this.spawnElapsed = Number(state.spawnElapsed) || 0;

    // Restore caches opened state
    if (Array.isArray(state.caches)) {
      for (const savedCache of state.caches) {
        const cache = this.caches.get(savedCache.id);
        if (cache) {
          cache.opened = savedCache.opened === true;
        }
      }
    }

    (state.fauna || []).slice(0, MAX_FAUNA).forEach(animal => this.spawn(animal));
    (state.drops || []).forEach(drop => {
      if (!this.scene.gridManager?.inBounds(drop.x, drop.y)) return;
      this.dropItem(drop.x, drop.y, drop.id || 'wild_fiber', drop.count || 1);
    });

    this.ensureCacheVisuals();
  }

  destroy() {
    for (const animal of this.fauna.values()) animal.sprite?.destroy?.();
    for (const drop of this.drops.values()) drop.sprite?.destroy?.();
    for (const cache of this.caches.values()) cache.sprite?.destroy?.();
    this.fauna.clear();
    this.drops.clear();
  }
}
