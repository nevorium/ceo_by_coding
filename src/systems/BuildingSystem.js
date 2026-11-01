import UniversalEventEmitter from '../utils/EventEmitter.js';
import Warehouse from '../entities/Warehouse.js';
import { TILE_SIZE } from '../config/constants.js';
import { BUILDING_DEFINITIONS, BUILDING_KITS, buildingTypeFromKit } from '../data/buildings.js';
import { getItem } from '../data/items.js';

/**
 * Owns player-built world objects. Manages placement and dismantling of
 * crafting tables, warehouse depots, and conveyors.
 */
export default class BuildingSystem {
  constructor(scene) {
    this.scene = scene;
    this.buildings = new Map();
    this.depots = new Map();
    this.serial = 0;
    this.isOpen = false;
    this.mode = 'place'; // 'place' | 'dismantle'
    this.activeKitId = null;
    this.direction = 'right';
    this.preview = null;
    this.events = new UniversalEventEmitter();
    this._bindToolbar();
  }

  _bindToolbar() {
    if (typeof document === 'undefined') return;
    this.toolbar = document.getElementById('build-toolbar');
    document.getElementById('btn-build-mode')?.addEventListener('click', () => this.toggle());
    this.toolbar?.addEventListener('click', event => {
      const kitButton = event.target.closest('[data-build-kit]');
      if (kitButton && !kitButton.disabled) {
        this.mode = 'place';
        this.setActiveKit(kitButton.dataset.buildKit);
        return;
      }
      const actionButton = event.target.closest('[data-build-action]');
      if (actionButton) {
        if (actionButton.dataset.buildAction === 'dismantle') {
          this.toggleDismantle();
        }
      }
    });
    this.scene.events.once('shutdown', () => this.destroy());
  }

  get isActive() {
    return this.isOpen && (Boolean(this.activeKitId) || this.mode === 'dismantle');
  }

  toggle() {
    if (this.isOpen) {
      this.cancel();
    } else {
      const first = BUILDING_KITS.find(({ kitId }) => this.scene.inventorySystem.hasItem(kitId, 1));
      if (first) {
        this.isOpen = true;
        this.mode = 'place';
        this.setActiveKit(first.kitId);
      } else if (this.buildings.size > 0) {
        this.setDismantleMode();
      } else {
        this.scene.hud?.showMessage('Belum ada building kit. Buat kit bangunan di Crafting Table.', 3600);
      }
    }
  }

  setActiveKit(kitId) {
    const type = buildingTypeFromKit(kitId);
    if (!type || !this.scene.inventorySystem.hasItem(kitId, 1)) return;
    this.isOpen = true;
    this.mode = 'place';
    this.activeKitId = kitId;
    this.direction = this.direction || 'right';
    this._ensurePreview();
    this._renderToolbar();
    this.scene.hud?.showMessage(`${BUILDING_DEFINITIONS[type].label} siap dipasang. Klik petak · R putar · X bongkar · Esc batal.`, 3000);
  }

  setDismantleMode() {
    this.isOpen = true;
    this.mode = 'dismantle';
    this.activeKitId = null;
    this._ensurePreview();
    this._renderToolbar();
    this.scene.hud?.showMessage('Mode Bongkar Bangunan aktif. Klik bangunan pemain untuk mengangkat ke tas.', 3000);
  }

  toggleDismantle() {
    if (!this.isOpen) {
      this.setDismantleMode();
      return;
    }
    if (this.mode === 'dismantle') {
      const first = BUILDING_KITS.find(({ kitId }) => this.scene.inventorySystem.hasItem(kitId, 1));
      if (first) {
        this.setActiveKit(first.kitId);
      } else {
        this.cancel();
      }
    } else {
      this.setDismantleMode();
    }
  }

  cancel() {
    this.isOpen = false;
    this.activeKitId = null;
    this.mode = 'place';
    this.preview?.destroy();
    this.preview = null;
    this._renderToolbar();
  }

  rotate() {
    if (!this.isActive || this.mode !== 'place') return;
    const dirs = ['up', 'right', 'down', 'left'];
    this.direction = dirs[(dirs.indexOf(this.direction) + 1) % dirs.length];
    this._updatePreview(this.scene.input.activePointer);
  }

  _ensurePreview() {
    if (this.preview) return;
    this.preview = this.scene.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0x63d8d1, 0.28)
      .setStrokeStyle(2, 0x63d8d1, 1).setDepth(28).setVisible(false);
  }

  updatePreview(pointer) {
    if (!this.isActive || !pointer) return;
    this._updatePreview(pointer);
  }

  _updatePreview(pointer) {
    if (!this.preview) this._ensurePreview();
    if (!this.preview) return;

    const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(point.x / TILE_SIZE);
    const y = Math.floor(point.y / TILE_SIZE);

    if (this.mode === 'dismantle') {
      const targetBuilding = this.getBuildingAt(x, y);
      if (targetBuilding) {
        const def = BUILDING_DEFINITIONS[targetBuilding.type];
        const w = (def?.width || 1) * TILE_SIZE;
        const h = (def?.height || 1) * TILE_SIZE;
        this.preview.setPosition(
          targetBuilding.x * TILE_SIZE + w / 2,
          targetBuilding.y * TILE_SIZE + h / 2,
        ).setSize(w, h)
          .setStrokeStyle(2, 0xd95f54, 1)
          .setFillStyle(0xd95f54, 0.35)
          .setVisible(true);
        this.preview.setData('mode', 'dismantle');
        this.preview.setData('building', targetBuilding);
        this.preview.setData('valid', true);
      } else {
        this.preview.setPosition(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
        ).setSize(TILE_SIZE, TILE_SIZE)
          .setStrokeStyle(2, 0x93a7a1, 0.8)
          .setFillStyle(0x93a7a1, 0.15)
          .setVisible(true);
        this.preview.setData('mode', 'dismantle');
        this.preview.setData('building', null);
        this.preview.setData('valid', false);
      }
      return;
    }

    // Mode: place
    const type = buildingTypeFromKit(this.activeKitId);
    const definition = BUILDING_DEFINITIONS[type];
    if (!definition) return;

    const valid = this.canPlace(type, x, y);
    const w = definition.width * TILE_SIZE;
    const h = definition.height * TILE_SIZE;
    this.preview.setPosition(
      x * TILE_SIZE + w / 2,
      y * TILE_SIZE + h / 2,
    ).setSize(w, h)
      .setStrokeStyle(2, valid ? 0x63d8d1 : 0xd95f54, 1)
      .setFillStyle(valid ? 0x63d8d1 : 0xd95f54, 0.28)
      .setVisible(true);

    this.preview.setData('mode', 'place');
    this.preview.setData('x', x);
    this.preview.setData('y', y);
    this.preview.setData('valid', valid);
  }

  handlePointerDown(pointer) {
    if (!this.isActive) return false;
    if (this.mode === 'dismantle') {
      return this.tryDismantleAtPointer(pointer);
    }
    return this.tryPlaceAtPointer(pointer);
  }

  tryPlaceAtPointer(pointer) {
    if (!this.isActive || this.mode !== 'place') return false;
    this._updatePreview(pointer);
    const data = this.preview?.getData();
    if (!data || !data.valid) {
      const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Math.floor(point.x / TILE_SIZE);
      const y = Math.floor(point.y / TILE_SIZE);
      const existing = this.getBuildingAt(x, y);
      if (existing) {
        const def = BUILDING_DEFINITIONS[existing.type];
        this.scene.hud?.showMessage(`Petak sudah terisi ${def?.label || 'bangunan'}. Tekan [X] untuk mode Bongkar.`, 2200);
      } else {
        this.scene.hud?.showMessage('Bangunan tidak dapat dipasang di petak itu.', 1800);
      }
      return false;
    }

    const { x, y } = data;
    const placed = this.placeFromKit(this.activeKitId, x, y, this.direction);
    if (placed && !this.scene.inventorySystem.hasItem(this.activeKitId, 1)) {
      const next = BUILDING_KITS.find(({ kitId }) => this.scene.inventorySystem.hasItem(kitId, 1));
      if (next) {
        this.setActiveKit(next.kitId);
      } else if (this.buildings.size > 0) {
        this.setDismantleMode();
      } else {
        this.cancel();
      }
    } else {
      this._renderToolbar();
    }
    return placed;
  }

  tryDismantleAtPointer(pointer) {
    if (!this.isActive || this.mode !== 'dismantle') return false;
    this._updatePreview(pointer);
    const data = this.preview?.getData();
    if (!data || !data.building) {
      this.scene.hud?.showMessage('Pilih bangunan buatan pemain untuk diangkat.', 1800);
      return false;
    }
    return this.dismantleBuilding(data.building.id);
  }

  canPlace(type, x, y) {
    const definition = BUILDING_DEFINITIONS[type];
    if (!definition) return false;
    for (let dy = 0; dy < definition.height; dy += 1) {
      for (let dx = 0; dx < definition.width; dx += 1) {
        const tx = x + dx;
        const ty = y + dy;
        if (!this.scene.gridManager.isBuildable(tx, ty)) return false;
        // Cannot place on top of player
        if (this.scene.player && this.scene.player.tileX === tx && this.scene.player.tileY === ty) {
          return false;
        }
      }
    }
    return true;
  }

  placeFromKit(kitId, x, y, direction = 'right', { consume = true, id = null, persist = true } = {}) {
    const type = buildingTypeFromKit(kitId);
    const definition = BUILDING_DEFINITIONS[type];
    if (!definition || !this.canPlace(type, x, y)) return false;
    if (consume && !this.scene.inventorySystem.removeItem(kitId, 1)) return false;

    const buildingId = id || `${type}_${++this.serial}`;
    const building = { id: buildingId, type, x, y, direction };
    this.buildings.set(buildingId, building);

    if (definition.conveyor) {
      this.scene.gridManager.setConveyor(x, y, direction);
      this.scene.updateTileSprite(x, y);
    } else if (definition.machineType) {
      this.scene.machineSystem.registerMachine(buildingId, definition.machineType, x, y);
      this.scene.gridManager.setMachine(x, y, buildingId, definition.machineType);
      this.scene.updateTileSprite(x, y);
    } else if (definition.storage) {
      for (let dy = 0; dy < definition.height; dy += 1) {
        for (let dx = 0; dx < definition.width; dx += 1) {
          this.scene.gridManager.setBuilding(x + dx, y + dy, buildingId, type);
        }
      }
      const sharedStorage = this.scene.warehouse?.storage || null;
      const label = definition.label === 'Warehouse' ? 'GUDANG' : (definition.label || 'DEPOT');
      const depot = new Warehouse(this.scene, x, y, definition.width, definition.height, sharedStorage, label);
      this.depots.set(buildingId, depot);
      if (!this.scene.warehouse) {
        this.scene.warehouse = depot;
      }
    }

    if (consume && this.scene._emitPixelParticles) {
      this.scene._emitPixelParticles(x, y, 0x63d8d1, 8);
    }
    if (consume && this.scene.hud) {
      this.scene.hud.showMessage(`🔨 ${definition.label} berhasil dipasang!`, 2200);
    }

    this.events.emit('changed', building);
    if (persist) this.scene.saveSystem?.saveLocal();
    return true;
  }

  getBuildingAt(x, y) {
    for (const building of this.buildings.values()) {
      const def = BUILDING_DEFINITIONS[building.type];
      const w = def?.width || 1;
      const h = def?.height || 1;
      if (x >= building.x && x < building.x + w && y >= building.y && y < building.y + h) {
        return building;
      }
    }
    return null;
  }

  canDismantle(x, y) {
    return Boolean(this.getBuildingAt(x, y));
  }

  dismantleAt(x, y) {
    const building = this.getBuildingAt(x, y);
    if (!building) return false;
    return this.dismantleBuilding(building.id);
  }

  dismantleBuilding(buildingId) {
    const building = this.buildings.get(buildingId);
    if (!building) return false;

    const definition = BUILDING_DEFINITIONS[building.type];
    if (!definition) return false;

    // Verify inventory room for the returned kit
    if (this.scene.inventorySystem && typeof this.scene.inventorySystem.hasSpaceFor === 'function') {
      if (!this.scene.inventorySystem.hasSpaceFor(definition.kitId, 1)) {
        this.scene.hud?.showMessage('⚠️ Tas penuh! Kosongkan slot ransel terlebih dahulu.', 2400);
        return false;
      }
    }

    if (definition.machineType) {
      // Close machine inspector if currently viewing this machine
      if (this.scene.machineUI?.isVisible() && this.scene.machineUI._machineId === building.id) {
        this.scene.machineUI.hide();
      }

      // Unregister and retrieve all buffer items
      const unreg = this.scene.machineSystem.unregisterMachine(building.id);
      if (unreg && unreg.items) {
        for (const it of unreg.items) {
          this.scene.inventorySystem.addItem(it.id, it.count);
        }
      }

      // Clear machine state from grid
      this.scene.gridManager.setMachine(building.x, building.y, null, null);
      this.scene.updateTileSprite(building.x, building.y);

      // Clean up machine indicator
      if (this.scene.machineIndicators?.has(building.id)) {
        this.scene.machineIndicators.get(building.id).destroy();
        this.scene.machineIndicators.delete(building.id);
      }
    } else if (definition.storage) {
      const depot = this.depots.get(building.id);
      if (depot) {
        depot.destroy();
        this.depots.delete(building.id);
      }
      for (let dy = 0; dy < definition.height; dy += 1) {
        for (let dx = 0; dx < definition.width; dx += 1) {
          this.scene.gridManager.setBuilding(building.x + dx, building.y + dy, null, null);
          this.scene.updateTileSprite(building.x + dx, building.y + dy);
        }
      }
    } else if (definition.conveyor) {
      const tile = this.scene.gridManager.getTile(building.x, building.y);
      if (tile && tile.conveyorItem && tile.conveyorItem !== 'none') {
        this.scene.inventorySystem.addItem(tile.conveyorItem, 1);
      }
      this.scene.gridManager.setConveyor(building.x, building.y, null);
      this.scene.updateTileSprite(building.x, building.y);
    }

    // Return building kit to inventory
    this.scene.inventorySystem.addItem(definition.kitId, 1);

    // Remove from registered buildings
    this.buildings.delete(building.id);

    // Visual feedback
    if (this.scene._emitPixelParticles) {
      this.scene._emitPixelParticles(building.x, building.y, 0xe9bf62, 8);
    }
    const kitName = getItem(definition.kitId)?.name || definition.label;
    this.scene.hud?.showMessage(`📦 ${definition.label} diangkat (+1 ${kitName})!`, 2200);

    this.events.emit('dismantled', building);
    this.events.emit('changed', null);
    this.scene.saveSystem?.saveLocal();
    this._renderToolbar();
    return true;
  }

  getWarehouseAdjacentTo(x, y) {
    if (this.scene.warehouse?.isAdjacentTo(x, y)) return this.scene.warehouse;
    for (const depot of this.depots.values()) if (depot.isAdjacentTo(x, y)) return depot;
    return null;
  }

  getStorageAt(x, y) {
    if (this.scene.warehouse?.containsTile(x, y)) return this.scene.warehouse;
    for (const depot of this.depots.values()) if (depot.containsTile(x, y)) return depot;
    return null;
  }

  getSaveState() {
    return [...this.buildings.values()].map(building => {
      const tile = this.scene.gridManager.getTile(building.x, building.y);
      return { ...building, conveyorItem: tile?.isConveyor ? tile.conveyorItem : undefined };
    });
  }

  loadSaveState(state) {
    if (!Array.isArray(state)) return;
    for (const building of state) {
      const definition = BUILDING_DEFINITIONS[building.type];
      if (!definition || !Number.isInteger(building.x) || !Number.isInteger(building.y)) continue;
      this.serial = Math.max(this.serial, Number((building.id || '').split('_').at(-1)) || 0);
      const success = this.placeFromKit(definition.kitId, building.x, building.y, building.direction, { consume: false, id: building.id, persist: false });
      if (success && definition.conveyor && typeof building.conveyorItem === 'string') {
        const tile = this.scene.gridManager.getTile(building.x, building.y);
        tile.conveyorItem = building.conveyorItem;
        this.scene.updateTileSprite?.(building.x, building.y);
      }
    }
  }

  /** Remove restored visuals and in-memory references before another restore. */
  reset() {
    this.cancel();
    for (const building of this.buildings.values()) {
      const def = BUILDING_DEFINITIONS[building.type];
      if (!def) continue;
      if (def.machineType) {
        this.scene.machineSystem?.unregisterMachine(building.id);
        this.scene.gridManager?.setMachine(building.x, building.y, null, null);
        this.scene.updateTileSprite?.(building.x, building.y);
      } else if (def.storage) {
        for (let dy = 0; dy < def.height; dy += 1) {
          for (let dx = 0; dx < def.width; dx += 1) {
            this.scene.gridManager?.setBuilding(building.x + dx, building.y + dy, null, null);
            this.scene.updateTileSprite?.(building.x + dx, building.y + dy);
          }
        }
      } else if (def.conveyor) {
        this.scene.gridManager?.setConveyor(building.x, building.y, null);
        this.scene.updateTileSprite?.(building.x, building.y);
      }
    }
    for (const depot of this.depots.values()) depot.destroy();
    this.depots.clear();
    this.buildings.clear();
    this.serial = 0;
  }

  _renderToolbar() {
    if (typeof document === 'undefined' || !this.toolbar) return;
    this.toolbar.hidden = !this.isActive;
    document.getElementById('btn-build-mode')?.setAttribute('aria-pressed', String(this.isActive));
    if (!this.isActive) return;

    const isDismantle = this.mode === 'dismantle';
    const buildingButtons = BUILDING_KITS.map(({ kitId, label }) => {
      const count = this.scene.inventorySystem.getItemCount(kitId);
      const active = !isDismantle && kitId === this.activeKitId;
      return `<button data-build-kit="${kitId}" ${count ? '' : 'disabled'} class="${active ? 'active' : ''}">${label} ×${count}</button>`;
    }).join('');

    const dismantleButton = `
      <button data-build-action="dismantle" class="btn-dismantle-mode ${isDismantle ? 'active' : ''}" title="Bongkar bangunan dan kembalikan kit ke tas">
        🪓 Bongkar (X)
      </button>
    `;

    const hint = isDismantle
      ? '<span class="build-hint">Klik bangunan untuk mengangkat · Esc keluar</span>'
      : '<span class="build-hint">R putar · X bongkar · Esc batal</span>';

    this.toolbar.innerHTML = `
      <div class="build-toolbar-kits">${buildingButtons}</div>
      <div class="build-toolbar-divider"></div>
      <div class="build-toolbar-actions">${dismantleButton}</div>
      ${hint}
    `;
  }

  destroy() {
    this.reset();
    this.preview?.destroy();
  }
}
