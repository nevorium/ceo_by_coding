/**
 * @fileoverview SaveSystem — Orchestrates serializing, saving, and loading local state.
 * Saves profile data, coin balance, items, active scripts, grid tiles, and active drones.
 */
import Drone from '../entities/Drone.js';
import ZoneMap from './ZoneMap.js';
import { GATES, TILE_SIZE, GRID_COLS, GRID_ROWS } from '../config/constants.js';

const LOCAL_SAVE_KEY = 'ceoByCode_savefile';

export default class SaveSystem {
  /**
   * @param {Phaser.Scene} scene - The active GameScene instance
   */
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * Compile the complete game state into a single JSON object.
   * @returns {object}
   */
  compileSaveData() {
    const profile = this.scene.profileSystem;
    const inv = this.scene.inventorySystem;
    const scripts = this.scene.scriptManager;
    const dm = this.scene.deviceManager;
    const grid = this.scene.gridManager;

    // 1. Serialize Profile
    const profileData = {
      name: profile.name,
      level: profile.level,
      xp: profile.xp,
      upgrades: profile.upgrades,
    };

    // 2. Serialize Inventory
    const inventoryData = {
      coins: inv.getCoins(),
      items: inv.getAllItems(),
      slots: inv.getSlots ? inv.getSlots() : null,
      slotCapacity: inv.getSlotCapacity ? inv.getSlotCapacity() : 16,
    };

    // 3. Serialize Script Cards
    const scriptsData = scripts.getAllScripts();

    // 4. Serialize Drones
    const dronesData = dm.getAll().map((d) => ({
      id: d.id,
      label: d.label,
      module: d.module,
      inventory: d.droneInventory.getAll(),
      tileX: d.tileX,
      tileY: d.tileY,
    }));

    // 5. Serialize Grid Tiles (only serialize tilled, watered, or planted tiles to keep it compact)
    const gridData = [];
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const tile = grid.getTile(x, y);
        if (tile && (tile.isTilled || tile.isWatered || tile.hasPlant)) {
          gridData.push({
            x,
            y,
            isTilled: tile.isTilled,
            isWatered: tile.isWatered,
            hasPlant: tile.hasPlant,
            plantType: tile.plantType,
            growthStage: tile.growthStage,
            growthTicksElapsed: tile.growthTicksElapsed,
            hasFruit: tile.hasFruit,
          });
        }
      }
    }

    // 6. Serialize Phase 16 expanded data
    const unlockedZones = this.scene.unlockedZones;
    const minedOres = this.scene.minedOres || [];
    const machines = this.scene.machineSystem ? this.scene.machineSystem.getSaveState() : [];
    const buildings = this.scene.buildingSystem ? this.scene.buildingSystem.getSaveState() : [];
    const wildlife = this.scene.wildlifeSystem ? this.scene.wildlifeSystem.getSaveState() : null;
    const specialBuyer = this.scene.specialBuyerSystem ? this.scene.specialBuyerSystem.getSaveState() : null;

    return {
      version: 2,
      timestamp: Date.now(),
      profile: profileData,
      inventory: inventoryData,
      scripts: scriptsData,
      drones: dronesData,
      grid: gridData,
      unlockedZones,
      minedOres,
      machines,
      buildings,
      wildlife,
      specialBuyer,
      tutorial: this.scene.tutorialSystem ? this.scene.tutorialSystem.getSaveState() : null,
      operations: this.scene.operationsSystem?.getSaveState(),
      warehouse: this.scene.warehouse?.getSlots ? this.scene.warehouse.getSlots() : this.scene.warehouse?.getAll(),
      warehouseSlotCapacity: this.scene.warehouse?.getSlotCapacity ? this.scene.warehouse.getSlotCapacity() : 24,
      warehouseItems: this.scene.warehouse?.getAll ? this.scene.warehouse.getAll() : null,
      hotbar: this.scene.hotbar ? {
        slots: [...this.scene.hotbar.slots],
        quantities: [...this.scene.hotbar.slotQuantities],
        activeSlot: this.scene.hotbar.activeSlot,
      } : null,
      player: this.scene.player ? {
        tileX: this.scene.player.tileX,
        tileY: this.scene.player.tileY,
      } : null,
    };
  }

  /**
   * Save the complete compiled game state locally to localStorage.
   */
  saveLocal() {
    try {
      const data = this.compileSaveData();
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('SaveSystem: failed to save local state:', err);
      return false;
    }
  }

  /**
   * Load and apply the saved state from localStorage if it exists.
   * @returns {boolean} True if load succeeded.
   */
  loadLocalSave() {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);
      return this.applySaveData(data);
    } catch (err) {
      console.error('SaveSystem: failed to load local state:', err);
      return false;
    }
  }

  /**
   * Clean up and reset save file.
   */
  clearLocalSave() {
    localStorage.removeItem(LOCAL_SAVE_KEY);
  }

  /**
   * Apply compiled save data to the active scene components.
   * @param {object} data - The compiled save JSON object.
   * @returns {boolean}
   */
  applySaveData(data) {
    if (!data || ![1, 2].includes(data.version)) return false;

    const profile = this.scene.profileSystem;
    const inv = this.scene.inventorySystem;
    const scripts = this.scene.scriptManager;
    const dm = this.scene.deviceManager;
    const grid = this.scene.gridManager;

    // 1. Restore Profile
    if (data.profile) {
      profile.name = data.profile.name || 'Pilot Alpha';
      profile.level = data.profile.level || 1;
      profile.xp = data.profile.xp || 0;
      if (data.profile.upgrades) {
        profile.upgrades = { ...profile.upgrades, ...data.profile.upgrades };
      }
      if (inv.setSlotCapacity && profile.upgrades?.backpackSlots) {
        inv.setSlotCapacity(profile.getUpgradeValue('backpackSlots'));
      }
      if (this.scene.warehouse?.setSlotCapacity && profile.upgrades?.warehouseSlots) {
        this.scene.warehouse.setSlotCapacity(profile.getUpgradeValue('warehouseSlots'));
      }
      profile.events.emit('profile-changed', {
        name: profile.name,
        level: profile.level,
        xp: profile.xp,
        xpNeeded: profile.getXpNeeded(),
      });
    }

    // 2. Restore Inventory
    if (data.inventory) {
      inv.coins = data.inventory.coins;
      const slotCap = data.inventory.slotCapacity || (profile.getUpgradeValue ? profile.getUpgradeValue('backpackSlots') : 16);
      if (inv.setSlotCapacity) inv.setSlotCapacity(slotCap);

      if (inv.container) {
        inv.container.clear();
        if (Array.isArray(data.inventory.slots)) {
          // v2 save with exact slot positions
          data.inventory.slots.forEach((slotItem, idx) => {
            if (slotItem && typeof slotItem.id === 'string' && slotItem.count > 0) {
              inv.setSlot(idx, slotItem);
            }
          });
        } else if (Array.isArray(data.inventory.items)) {
          // v1 migration: fill slots sequentially with stack limits
          data.inventory.items.forEach((item) => {
            if (item && item.id && item.count > 0) {
              inv.container.addItem(item.id, item.count);
            }
          });
        }
      } else {
        inv.items.clear();
        if (Array.isArray(data.inventory.items)) {
          data.inventory.items.forEach((item) => {
            inv.items.set(item.id, item.count);
          });
        }
      }
      inv.events.emit('coins-changed', { coins: inv.coins, delta: 0 });
      inv.events.emit('inventory-changed', { itemId: '', count: 0, delta: 0 });
    }

    // 3. Restore Scripts
    if (Array.isArray(data.scripts)) {
      scripts.scripts = data.scripts;
      // Persist directly to script manager's storage key
      scripts.saveToLocalStorage();
      
      // Select the first script if the active one is invalid
      if (scripts.scripts.length > 0) {
        if (!scripts.activeScriptId || !scripts.getScript(scripts.activeScriptId)) {
          scripts.activeScriptId = scripts.scripts[0].id;
        }
      } else {
        scripts.activeScriptId = null;
      }
    }

    // 4. Restore Grid
    if (Array.isArray(data.grid)) {
      // Clear grid first
      for (let y = 0; y < grid.rows; y++) {
        for (let x = 0; x < grid.cols; x++) {
          grid.resetTile(x, y);
        }
      }

      // Re-initialize default layout (fences, default ores, machines)
      if (typeof this.scene._createFarmLayout === 'function') {
        this.scene._createFarmLayout();
      }

      // Apply tilled, watered, and crop data
      data.grid.forEach((tileData) => {
        const tile = grid.getTile(tileData.x, tileData.y);
        if (tile) {
          tile.isTilled = tileData.isTilled;
          tile.isWatered = tileData.isWatered;
          tile.hasPlant = tileData.hasPlant;
          tile.plantType = tileData.plantType;
          tile.growthStage = tileData.growthStage;
          tile.growthTicksElapsed = tileData.growthTicksElapsed;
          tile.hasFruit = tileData.hasFruit;
          
          if (this.scene.updateTileSprite) {
            this.scene.updateTileSprite(tileData.x, tileData.y);
          }
        }
      });
    }

    // 5. Restore Drones
    if (Array.isArray(data.drones) && data.drones.length > 0) {
      // Clear current drones in scene and device manager
      dm.getAll().forEach((drone) => {
        drone.destroy();
      });
      dm.drones.clear();
      dm.activeDeviceId = null;

      // Spawn saved drones
      data.drones.forEach((d, idx) => {
        const droneX = typeof d.tileX === 'number' ? d.tileX : 3;
        const droneY = typeof d.tileY === 'number' ? d.tileY : 3;
        const newDrone = new Drone(this.scene, droneX, droneY, grid, profile, d.id);
        newDrone.label = d.label || d.id;
        
        if (d.module) {
          newDrone.equipModule(d.module);
        }
        
        if (Array.isArray(d.inventory)) {
          d.inventory.forEach((item) => {
            newDrone.droneInventory.addItem(item.id, item.count);
          });
        }

        // NOTE: Drone constructor calls scene.add.existing(this) internally.
        // Do NOT call scene.add.existing() again here — it would double-register the sprite.
        dm.register(newDrone);

        // Re-wire sandbox callbacks so EditorBridge gets log/error output
        if (this.scene.editorBridge) {
          this.scene.editorBridge._setupDroneSandboxCallbacks(newDrone);
        }
      });

      // Update active device selection
      if (dm.getAll().length > 0) {
        dm.setActiveDevice(dm.getAll()[0].id);
      }
    }

    // 6. Restore Unlocked Zones & update gates/bounds
    if (data.unlockedZones) {
      this.scene.unlockedZones = { ...this.scene.unlockedZones, ...data.unlockedZones };
    } else {
      this.scene.unlockedZones = { zone2: false, zone3: false, zone4: false, zone5: false };
    }
    if (this.scene.gridManager) {
      for (const gate of Object.values(GATES)) {
        this.scene.gridManager.setGate(gate.x, gate.y, gate.key, !this.scene.unlockedZones[gate.key]);
        if (this.scene.updateTileSprite) {
          this.scene.updateTileSprite(gate.x, gate.y);
        }
      }
    }
    if (typeof this.scene._updateCameraBounds === 'function') {
      this.scene._updateCameraBounds();
    }

    // 6b. Restore Player Position (validating unlocked zone and walkability)
    if (data.player && typeof data.player.tileX === 'number' && typeof data.player.tileY === 'number') {
      const px = Math.trunc(data.player.tileX);
      const py = Math.trunc(data.player.tileY);
      const cols = this.scene.gridManager?.cols ?? GRID_COLS;
      const rows = this.scene.gridManager?.rows ?? GRID_ROWS;
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        const zoneKey = ZoneMap.getZoneAt(px, py);
        const isRevealed = zoneKey === 'zone1' || Boolean(this.scene.unlockedZones?.[zoneKey]);
        const isWalkable = this.scene.gridManager ? this.scene.gridManager.isWalkable(px, py) : true;
        if (isRevealed && isWalkable && this.scene.player) {
          this.scene.player.setTilePosition(px, py);
          if (this.scene.cameras?.main) {
            const cx = px * TILE_SIZE + TILE_SIZE / 2;
            const cy = py * TILE_SIZE + TILE_SIZE / 2;
            this.scene.cameras.main.centerOn(cx, cy);
          }
        }
      }
    }

    // 7. Restore Mined Ores (clear them from grid if respawn pending)
    if (Array.isArray(data.minedOres)) {
      this.scene.minedOres = data.minedOres;
      if (this.scene.gridManager) {
        data.minedOres.forEach(ore => {
          this.scene.gridManager.setOre(ore.x, ore.y, null);
          if (this.scene.updateTileSprite) {
            this.scene.updateTileSprite(ore.x, ore.y);
          }
        });
      }
    } else {
      this.scene.minedOres = [];
    }

    // 8. Restore player buildings before machine state, so crafted machinery
    // can be reconstructed by the existing machine-state loader.
    if (this.scene.buildingSystem) {
      this.scene.buildingSystem.reset();
      this.scene.buildingSystem.loadSaveState(data.buildings);
    }

    // 9. Restore Machine States & update tiles
    if (data.machines && this.scene.machineSystem) {
      this.scene.machineSystem.loadSaveState(data.machines);
      if (this.scene.gridManager) {
        for (const [id, m] of this.scene.machineSystem.machines) {
          this.scene.gridManager.setMachine(m.x, m.y, id, m.type);
          if (this.scene.updateTileSprite) {
            this.scene.updateTileSprite(m.x, m.y);
          }
        }
      }
    }

    // 10. Restore passive explore-zone life after its gate state is known.
    if (this.scene.wildlifeSystem) {
      this.scene.wildlifeSystem.destroy();
      this.scene.wildlifeSystem.loadSaveState(data.wildlife);
    }

    // 11. Restore Special Buyer state & NPC visual
    if (data.specialBuyer && this.scene.specialBuyerSystem) {
      this.scene.specialBuyerSystem.loadSaveState(data.specialBuyer);
      const active = this.scene.specialBuyerSystem.getActiveBuyer();
      if (active) {
        this.scene._spawnSpecialBuyerNPC();
      } else {
        this.scene._destroySpecialBuyerNPC();
      }
    }

    // 12. Restore or skip RPG Tutorial for returning players
    if (this.scene.tutorialSystem) {
      this.scene.tutorialSystem.loadSaveState(data.tutorial, data);
    }

    // Optional fields keep existing version-1 saves compatible.
    if (this.scene.warehouse) {
      const wh = this.scene.warehouse;
      const whCap = data.warehouseSlotCapacity || (profile.getUpgradeValue ? profile.getUpgradeValue('warehouseSlots') : 24);
      if (wh.setSlotCapacity) wh.setSlotCapacity(whCap);

      if (wh.container) {
        wh.container.clear();
        if (Array.isArray(data.warehouse)) {
          const isSlotList = data.version >= 2 && (data.warehouse.includes(null) || data.warehouse.some(entry => entry && typeof entry === 'object' && 'id' in entry && 'count' in entry));
          if (isSlotList) {
            data.warehouse.forEach((slotItem, idx) => {
              if (slotItem && typeof slotItem.id === 'string' && slotItem.count > 0) {
                wh.setSlot(idx, slotItem);
              }
            });
          } else {
            // v1 migration: items list
            data.warehouse.forEach((entry) => {
              if (entry && typeof entry.id === 'string' && Number.isSafeInteger(entry.count) && entry.count > 0) {
                wh.container.addItem(entry.id, entry.count);
              }
            });
          }
        }
      } else {
        wh.items.clear();
        if (Array.isArray(data.warehouse)) {
          data.warehouse.forEach(({ id, count }) => {
            if (typeof id === 'string' && Number.isSafeInteger(count) && count > 0) wh.items.set(id, count);
          });
        }
      }
      wh.events.emit('changed', { action: 'restore' });
    }
    if (data.hotbar && this.scene.hotbar) {
      const hotbar = this.scene.hotbar;
      hotbar.slots = hotbar.slots.map((_, i) => typeof data.hotbar.slots?.[i] === 'string' ? data.hotbar.slots[i] : null);
      hotbar.slotQuantities = hotbar.slots.map((item, i) => item && Number.isSafeInteger(data.hotbar.quantities?.[i]) ? Math.max(0, data.hotbar.quantities[i]) : 0);
      hotbar.setActiveSlot(Number.isInteger(data.hotbar.activeSlot) ? data.hotbar.activeSlot : 0);
      hotbar.refresh();
    }
    this.scene.operationsSystem?.loadSaveState(data.operations);
    this.scene.operationsUI?.render();
    return true;
  }
}
