/**
 * @fileoverview DroneAPI – the action-queuing API layer exposed to player scripts.
 *
 * Harvests now go into the drone's own DroneInventory first.
 * Seeds for planting are pulled from drone inventory first, then player inventory.
 * New methods: transferToPlayer(), transferToWarehouse(), transferFromWarehouse(), sell(), buy(), supplyFrom().
 * Farming, sell/buy, and supplier actions are gated behind module checks.
 */

import {
  DRONE_ACTION_DELAY,
  GRID_COLS,
  GRID_ROWS,
} from '../config/constants.js';
import { PLANT_TYPES } from '../data/plants.js';

/**
 * @typedef {Object} QueuedAction
 * @property {string}   type    – Action type key
 * @property {any[]}    args    – Arguments
 * @property {Function} resolve – Promise resolve
 * @property {Function} reject  – Promise reject
 */

export default class DroneAPI {
  /**
   * @param {import('../entities/Drone.js').default} drone
   * @param {object} gridManager
   * @param {object} [inventorySystem] – Player inventory
   * @param {object} [profileSystem]
   * @param {object} [economySystem]
   * @param {object} [warehouse] – Warehouse entity reference
   * @param {object} [deviceManager] – DeviceManager for supplyFrom
   */
  constructor(drone, gridManager, inventorySystem = null, profileSystem = null, economySystem = null, warehouse = null, deviceManager = null) {
    this.drone = drone;
    this.gridManager = gridManager;
    this.inventorySystem = inventorySystem;   // player inventory
    this.profileSystem = profileSystem;
    this.economySystem = economySystem;
    this.warehouse = warehouse;
    this.deviceManager = deviceManager;

    /** @type {QueuedAction[]} */
    this.actionQueue = [];
  }

  /* ================================================================
   *  QUEUE MANAGEMENT
   * ================================================================ */

  getActionQueue() { return this.actionQueue; }
  clearQueue() { this.actionQueue = []; }

  /* ================================================================
   *  API FACTORY
   * ================================================================ */

  /**
   * Build the plain object injected as `drone` in sandboxed scripts.
   * @returns {object}
   */
  createAPI() {
    const self = this;

    return {
      // ── Movement ──────────────────────────────────────────────
      move(direction) {
        self._enqueue('move', [direction]);
      },

      // ── Farming actions (require Farming module) ───────────────
      crop() {
        self._enqueue('crop', []);
      },
      harvest() {
        self._enqueue('harvest', []);
      },
      water() {
        self._enqueue('water', []);
      },
      till() {
        self._enqueue('till', []);
      },
      plant(seedType) {
        self._enqueue('plant', [seedType]);
      },

      // ── Cosmetic ──────────────────────────────────────────────
      doFlip() {
        self._enqueue('flip', []);
      },
      say(text) {
        self._enqueue('say', [text]);
      },

      // ── Transfer actions ──────────────────────────────────────
      /** Move all items from drone inventory → player inventory */
      transferToPlayer() {
        self._enqueue('transferToPlayer', []);
      },
      /** Move all items from drone inventory → warehouse (must be adjacent) */
      transferToWarehouse() {
        self._enqueue('transferToWarehouse', []);
      },
      /** Fill remaining drone capacity with one item from an adjacent warehouse/depot. */
      transferFromWarehouse(itemId) {
        self._enqueue('transferFromWarehouse', [itemId]);
      },
      /**
       * Pull items from an adjacent drone (requires Supplier module).
       * @param {string} targetDroneId
       */
      supplyFrom(targetDroneId) {
        self._enqueue('supplyFrom', [targetDroneId]);
      },

      // ── Economy actions (require Seller module) ────────────────
      /** Sell all sellable crops in drone inventory */
      sell() {
        self._enqueue('sell', []);
      },
      /**
       * Buy seeds and add to drone inventory (requires Seller module).
       * @param {string} seedType
       * @param {number} qty
       */
      buy(seedType, qty) {
        self._enqueue('buy', [seedType, qty || 1]);
      },
      mine() {
        self._enqueue('mine', []);
      },
      depositToMachine(machineId, itemId, qty) {
        self._enqueue('depositToMachine', [machineId, itemId, qty]);
      },
      retrieveFromMachine(machineId) {
        self._enqueue('retrieveFromMachine', [machineId]);
      },
      deliverToSpecialBuyer() {
        self._enqueue('deliverToSpecialBuyer', []);
      },

      // ── Conveyor & Mining ──
      checkFrontItem() {
        return self._checkFrontItem();
      },
      /** Place one carried item onto the empty conveyor directly ahead. */
      depositToConveyor(itemId) {
        self._enqueue('depositToConveyor', [itemId]);
      },
      pushItem(direction) {
        self._enqueue('pushItem', [direction]);
      },
      wait(seconds) {
        self._enqueue('wait', [seconds]);
      },
      checkNode() {
        return self._checkNode();
      },
      /** Inspect the ground at the drone's current tile for explore drops. */
      checkGround() {
        return self._checkGround();
      },
      /** Collect a resource drop from the current tile. */
      collect() {
        self._enqueue('collect', []);
      },
      getBatteryLevel() {
        return self._getBatteryLevel();
      },
      hasPower() {
        return self._getBatteryLevel() > 0;
      },

      // ── Conditional checks (synchronous) ──────────────────────
      canCrop()       { return self._checkCanCrop(); },
      canHarvest()    { return self._checkCanHarvest(); },
      isWatered()     { return self._checkIsWatered(); },
      isTilled()      { return self._checkIsTilled(); },
      hasPlant()      { return self._checkHasPlant(); },
      getPlantStage() { return self._checkPlantStage(); },
      getPosition()   { return self.drone.getPosition(); },
      getMachineState(machineId) {
        return self.drone.scene?.machineSystem?.getMachineState(machineId) || null;
      },
      hasSpecialBuyer() {
        return self.drone.scene?.specialBuyerSystem?.getActiveBuyer() !== null;
      },
      getSpecialBuyerRequest() {
        const buyer = self.drone.scene?.specialBuyerSystem?.getActiveBuyer();
        if (!buyer) return null;
        return {
          id: buyer.id,
          name: buyer.name,
          reqItem: buyer.reqItem,
          reqCount: buyer.reqCount,
          reward: buyer.reward,
          timeLeft: Math.ceil(buyer.timeRemaining / 1000)
        };
      },

      // ── Drone inventory checks ─────────────────────────────────
      /** @returns {number} Total items in drone inventory */
      getInventoryCount() {
        return self.drone.droneInventory.getTotalCount();
      },
      /** @returns {number} Max capacity of drone inventory */
      getInventoryCapacity() {
        return self.drone.getInventoryCapacity();
      },
      /**
       * Check if drone inventory has an item.
       * @param {string} itemId
       * @param {number} qty
       * @returns {boolean}
       */
      hasDroneItem(itemId, qty) {
        return self.drone.droneInventory.hasItem(itemId, qty || 1);
      },
      isInventoryFull() {
        return self.drone.droneInventory.getTotalCount() >= self.drone.getInventoryCapacity();
      },

      // ── Inter-Drone Communication & Location ───────────────────
      /** @returns {Array<{id: string, label: string, x: number, y: number, status: string}>} All drones */
      getDrones() {
        const drones = self.deviceManager ? self.deviceManager.getAll() : [];
        return drones.map(d => ({
          id: d.id,
          label: d.label,
          x: d.tileX,
          y: d.tileY,
          status: d.status
        }));
      },
      /**
       * Get coordinates of another drone.
       * @param {string} droneId
       * @returns {{x: number, y: number}|null}
       */
      getDronePosition(droneId) {
        if (!self.deviceManager) return null;
        const target = self.deviceManager.getById(droneId);
        if (!target) return null;
        return { x: target.tileX, y: target.tileY };
      },
    };
  }

  /* ================================================================
   *  ACTION PROCESSING
   * ================================================================ */

  async processNextAction() {
    if (this.actionQueue.length === 0) return;

    const action = this.actionQueue.shift();

    try {
      switch (action.type) {
        case 'move':             await this._handleMove(action.args[0]); break;
        case 'crop':             await this._handleCrop(); break;
        case 'harvest':          await this._handleHarvest(); break;
        case 'water':            await this._handleWater(); break;
        case 'till':             await this._handleTill(); break;
        case 'plant':            await this._handlePlant(action.args[0]); break;
        case 'flip':             await this._handleFlip(); break;
        case 'say':              await this._handleSay(action.args[0]); break;
        case 'transferToPlayer': await this._handleTransferToPlayer(); break;
        case 'transferToWarehouse': await this._handleTransferToWarehouse(); break;
        case 'transferFromWarehouse': await this._handleTransferFromWarehouse(action.args[0]); break;
        case 'supplyFrom':       await this._handleSupplyFrom(action.args[0]); break;
        case 'sell':             await this._handleSell(); break;
        case 'buy':              await this._handleBuy(action.args[0], action.args[1]); break;
        case 'mine':             await this._handleMine(); break;
        case 'depositToConveyor': await this._handleDepositToConveyor(action.args[0]); break;
        case 'pushItem':         await this._handlePushItem(action.args[0]); break;
        case 'wait':             await this._handleWait(action.args[0]); break;
        case 'depositToMachine': await this._handleDepositToMachine(action.args[0], action.args[1], action.args[2]); break;
        case 'retrieveFromMachine': await this._handleRetrieveFromMachine(action.args[0]); break;
        case 'deliverToSpecialBuyer': await this._handleDeliverToSpecialBuyer(); break;
        case 'collect':          await this._handleCollect(); break;
        default:
          console.warn(`DroneAPI: unknown action type "${action.type}"`);
          break;
      }
      action.resolve();
    } catch (err) {
      action.reject(err);
    }
  }

  /* ================================================================
   *  PRIVATE – queue helper
   * ================================================================ */

  _enqueue(type, args) {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.actionQueue.push({ type, args, resolve, reject });
    return promise;
  }

  /* ================================================================
   *  PRIVATE – module check helper
   * ================================================================ */

  /**
   * Throw if the drone doesn't have the required module ability.
   * @private
   */
  _requireAbility(ability) {
    if (!this.drone.hasAbility(ability)) {
      const needed = ability === 'till' || ability === 'water' || ability === 'plant' || ability === 'crop' || ability === 'harvest'
        ? 'Farming Module 🌾'
        : ability === 'supplyFrom' || ability === 'transferTo'
        ? 'Supplier Module 📦'
        : ability === 'sell' || ability === 'buy'
        ? 'Seller/Buyer Module 💰'
        : `a module with '${ability}' ability`;
      const msg = `Requires ${needed}. Equip it in the Devices panel.`;
      // Show HUD message so it's visible even if the console panel is hidden
      if (this.drone.scene?.hud) {
        this.drone.scene.hud.showMessage(`⚙️ ${this.drone.label}: ${msg}`, 5000);
      }
      throw new Error(msg);
    }
  }

  /* ================================================================
   *  PRIVATE – action handlers
   * ================================================================ */

  async _handleMove(direction) {
    const success = await this.drone.moveTo(direction);
    if (!success) {
      throw new Error(`Cannot move '${direction}'. Hit boundary or obstacle. Make sure the path is clear and within the grid.`);
    }
  }

  async _handleCrop() {
    // Basic farming (crop) is available on all drones by default.
    // Seller/Supplier modules add extra bonuses but are not required for farming.
    const { tileX, tileY } = this.drone;

    if (this.gridManager) {
      const tile = this.gridManager.getTile(tileX, tileY);
      if (!tile || !tile.hasPlant) {
        throw new Error("No plant here to crop. Make sure you are positioned on a tile with a mature plant.");
      }
      const cropType = tile.plantType;
      const plantDef = PLANT_TYPES[cropType];
      if (plantDef && plantDef.type === 'fruit') {
        throw new Error(`Cannot crop '${plantDef.name}'. This is a fruit tree; use drone.harvest() instead so it can regrow fruit.`);
      }
      if (!this.gridManager.canCrop(tileX, tileY)) {
        throw new Error(`Cannot crop '${plantDef?.name || cropType}'. The crop is not fully grown yet. Use drone.canCrop() to check first.`);
      }

      // Check if drone inventory is full BEFORE harvesting
      const currentCount = this.drone.droneInventory.getTotalCount();
      const capacity = this.drone.getInventoryCapacity();
      if (currentCount >= capacity) {
        const msg = `Drone inventory is full! (${currentCount}/${capacity}). Use drone.transferToPlayer() or drone.transferToWarehouse() first.`;
        if (this.drone.scene?.hud) {
          this.drone.scene.hud.showMessage(`📦 ${this.drone.label}: Inventory Full!`, 4000);
        }
        throw new Error(`Cannot crop plant. ${msg}`);
      }

      const yieldAmt = plantDef
        ? Math.floor(Math.random() * (plantDef.harvestYield.max - plantDef.harvestYield.min + 1)) + plantDef.harvestYield.min
        : 1;

      // Verify it fits in drone inventory
      const remainingSpace = capacity - currentCount;
      if (yieldAmt > remainingSpace) {
        throw new Error(`Cannot crop plant. Not enough space in drone inventory (needs ${yieldAmt} slots, but only has ${remainingSpace} free).`);
      }

      const result = this.gridManager.cropPlant(tileX, tileY);
      if (result && result.success) {
        this.drone.droneInventory.addItem(cropType, yieldAmt);
        this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

        if (this.profileSystem) this.profileSystem.addXp(5);
        if (this.drone.scene?.events) {
          this.drone.scene.events.emit('xp-gain', { x: tileX, y: tileY, amount: 5 });
        }
        // Update tile visual
        if (this.drone.scene?.updateTileSprite) {
          this.drone.scene.updateTileSprite(tileX, tileY);
        }
      }
    }

    await this.drone.executeAction('crop');
  }

  async _handleHarvest() {
    // Basic farming (harvest) is available on all drones by default.
    const { tileX, tileY } = this.drone;


    if (this.gridManager) {
      const tile = this.gridManager.getTile(tileX, tileY);
      if (!tile || !tile.hasPlant) {
        throw new Error("No plant here to harvest. Make sure you are positioned on a tile with a ripe fruit tree.");
      }
      const cropType = tile.plantType;
      const plantDef = PLANT_TYPES[cropType];
      if (plantDef && plantDef.type !== 'fruit') {
        throw new Error(`Cannot harvest '${plantDef.name}'. This is a standard crop; use drone.crop() instead to harvest it.`);
      }
      if (!this.gridManager.canHarvest(tileX, tileY)) {
        throw new Error(`Fruit is not ripe yet on '${plantDef?.name || cropType}'. Use drone.canHarvest() to check first.`);
      }

      // Check if drone inventory is full BEFORE harvesting
      const currentCount = this.drone.droneInventory.getTotalCount();
      const capacity = this.drone.getInventoryCapacity();
      if (currentCount >= capacity) {
        const msg = `Drone inventory is full! (${currentCount}/${capacity}). Use drone.transferToPlayer() or drone.transferToWarehouse() first.`;
        if (this.drone.scene?.hud) {
          this.drone.scene.hud.showMessage(`📦 ${this.drone.label}: Inventory Full!`, 4000);
        }
        throw new Error(`Cannot harvest fruit. ${msg}`);
      }

      const yieldAmt = plantDef
        ? Math.floor(Math.random() * (plantDef.harvestYield.max - plantDef.harvestYield.min + 1)) + plantDef.harvestYield.min
        : 1;

      // Verify it fits in drone inventory
      const remainingSpace = capacity - currentCount;
      if (yieldAmt > remainingSpace) {
        throw new Error(`Cannot harvest fruit. Not enough space in drone inventory (needs ${yieldAmt} slots, but only has ${remainingSpace} free).`);
      }

      const result = this.gridManager.harvestFruit(tileX, tileY);
      if (result && cropType) {
        this.drone.droneInventory.addItem(cropType, yieldAmt);
        this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

        if (this.profileSystem) this.profileSystem.addXp(5);
        if (this.drone.scene?.events) {
          this.drone.scene.events.emit('xp-gain', { x: tileX, y: tileY, amount: 5 });
        }
        if (this.drone.scene?.updateTileSprite) {
          this.drone.scene.updateTileSprite(tileX, tileY);
        }
      }
    }

    await this.drone.executeAction('harvest');
  }

  async _handleWater() {
    // Basic farming (water) is available on all drones by default.
    const { tileX, tileY } = this.drone;

    if (this.gridManager) {
      const tile = this.gridManager.getTile(tileX, tileY);
      if (!tile) throw new Error("Drone is out of grid boundaries.");
      if (!tile.isTilled) throw new Error("Cannot water. Soil must be tilled first. Use drone.till() before watering.");
      if (tile.isWatered) throw new Error("Soil is already watered here. Watering it again has no effect.");
      
      const success = this.gridManager.waterTile(tileX, tileY);
      if (!success) throw new Error("Cannot water here.");
    }
    if (this.drone.scene?.updateTileSprite) this.drone.scene.updateTileSprite(tileX, tileY);
    await this.drone.executeAction('water');
  }

  async _handleTill() {
    // Basic farming (till) is available on all drones by default.
    const { tileX, tileY } = this.drone;

    if (this.gridManager) {
      const tile = this.gridManager.getTile(tileX, tileY);
      if (!tile) throw new Error("Drone is out of grid boundaries.");
      if (tile.isTilled) throw new Error("Soil is already tilled here. You don't need to till it again.");
      if (tile.hasPlant) throw new Error("Cannot till. Tile is occupied by a plant. Harvest or crop it first.");
      
      const success = this.gridManager.tillTile(tileX, tileY);
      if (!success) throw new Error("Cannot till this tile type (boundary or obstacles). Make sure you are on a valid soil tile.");
    }
    if (this.drone.scene?.updateTileSprite) this.drone.scene.updateTileSprite(tileX, tileY);
    await this.drone.executeAction('till');
  }

  async _handlePlant(seedType) {
    // Basic farming (plant) is available on all drones by default.
    const { tileX, tileY } = this.drone;

    
    // Check if seedType is valid
    if (!PLANT_TYPES[seedType]) {
      throw new Error(`Invalid crop type: '${seedType}'. Available crops: wheat, potato, cactus, apple_tree.`);
    }

    const seedItem = seedType + '_seed';

    // Check drone inventory first, then player inventory
    let seedSource = null;
    if (this.drone.droneInventory.hasItem(seedItem, 1)) {
      seedSource = 'drone';
    } else if (this.inventorySystem?.hasItem(seedItem, 1)) {
      seedSource = 'player';
    } else {
      const msg = `No '${seedType}' seeds available! Buy seeds at the Shop or transfer them to the drone.`;
      // Show HUD message so it's visible even if the console panel is hidden
      if (this.drone.scene?.hud) {
        this.drone.scene.hud.showMessage(`🌾 ${this.drone.label}: Out of seeds!`, 4000);
      }
      throw new Error(msg);
    }

    if (this.gridManager) {
      const tile = this.gridManager.getTile(tileX, tileY);
      if (!tile) throw new Error("Drone is out of grid boundaries.");
      if (!tile.isTilled || !tile.isWatered) {
        throw new Error(`Cannot plant here. Soil must be tilled and watered first. Use drone.till() and drone.water() first.`);
      }
      if (tile.hasPlant) {
        throw new Error("Cannot plant here. Tile is already occupied by another plant. Crop or harvest it first.");
      }

      const success = this.gridManager.plantSeed(tileX, tileY, seedType);
      if (success) {
        if (seedSource === 'drone') {
          this.drone.droneInventory.removeItem(seedItem, 1);
          this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
        } else {
          this.inventorySystem.removeItem(seedItem, 1);
        }
        if (this.drone.scene?.updateTileSprite) this.drone.scene.updateTileSprite(tileX, tileY);
      } else {
        throw new Error("Cannot plant here. Soil state is invalid.");
      }
    }

    await this.drone.executeAction('plant');
  }

  async _handleFlip() {
    await this.drone.executeAction('flip');
  }

  async _handleSay(text) {
    if (typeof text !== 'string') {
      throw new Error("drone.say() requires a string parameter.");
    }
    await this.drone.say(text);
  }

  async _handleTransferToPlayer() {
    if (!this.inventorySystem) {
      throw new Error("No player inventory available.");
    }
    const items = this.drone.droneInventory.getAll();
    if (items.length === 0) {
      throw new Error("Cannot transfer to player. Drone inventory is empty.");
    }

    for (const { id, count } of items) {
      this.inventorySystem.addItem(id, count);
    }
    this.drone.droneInventory.clear();
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    await this.drone.executeAction('transfer');
  }

  async _handleTransferToWarehouse() {
    if (!this.warehouse) {
      throw new Error("No warehouse found in this scene.");
    }
    const scene = this.drone.scene;
    const storage = this.warehouse.isAdjacentTo(this.drone.tileX, this.drone.tileY)
      ? this.warehouse
      : scene?.buildingSystem?.getWarehouseAdjacentTo(this.drone.tileX, this.drone.tileY);
    if (!storage) {
      throw new Error("Drone must be adjacent to a warehouse or depot to transfer items. Move closer first.");
    }
    const items = this.drone.droneInventory.getAll();
    if (items.length === 0) {
      throw new Error("Cannot transfer to warehouse. Drone inventory is empty.");
    }

    for (const { id, count } of items) {
      storage.deposit(id, count);
    }
    this.drone.droneInventory.clear();
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    await this.drone.executeAction('transfer');
  }

  /**
   * Pull one resource type into the drone until it reaches capacity or that
   * warehouse item runs out. HQ and crafted depots share the same stock.
   */
  async _handleTransferFromWarehouse(itemId) {
    if (!this.warehouse) throw new Error('No warehouse found in this scene.');
    if (typeof itemId !== 'string' || !itemId) {
      throw new Error("transferFromWarehouse requires an item ID, for example transferFromWarehouse('wheat').");
    }

    const scene = this.drone.scene;
    const storage = this.warehouse.isAdjacentTo(this.drone.tileX, this.drone.tileY)
      ? this.warehouse
      : scene?.buildingSystem?.getWarehouseAdjacentTo(this.drone.tileX, this.drone.tileY);
    if (!storage) throw new Error('Drone must be adjacent to a warehouse or depot to collect cargo.');

    const remaining = this.drone.getInventoryCapacity() - this.drone.droneInventory.getTotalCount();
    if (remaining <= 0) throw new Error('Drone inventory is already full.');
    const available = storage.getItemCount(itemId);
    if (available <= 0) throw new Error(`Warehouse does not contain any '${itemId}'.`);

    const amount = Math.min(available, remaining);
    if (!storage.withdraw(itemId, amount)) throw new Error(`Could not withdraw '${itemId}' from warehouse.`);
    this.drone.droneInventory.addItem(itemId, amount);
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    await this.drone.executeAction('transfer');
  }

  async _handleSupplyFrom(targetDroneId) {
    this._requireAbility('supplyFrom');
    if (!this.deviceManager) {
      throw new Error("DeviceManager not available.");
    }
    const target = this.deviceManager.getById(targetDroneId);
    if (!target) {
      throw new Error("Drone '" + targetDroneId + "' not found. Double check the ID.");
    }

    // Must be adjacent
    const dx = Math.abs(this.drone.tileX - target.tileX);
    const dy = Math.abs(this.drone.tileY - target.tileY);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      throw new Error("Drone '" + targetDroneId + "' is not adjacent. Drones must be adjacent to transfer items.");
    }

    const items = target.droneInventory.getAll();
    if (items.length === 0) {
      throw new Error("Drone '" + targetDroneId + "' inventory is empty. There is nothing to supply.");
    }

    // Check if this drone's inventory is already full
    const currentCount = this.drone.droneInventory.getTotalCount();
    const capacity = this.drone.getInventoryCapacity();
    if (currentCount >= capacity) {
      throw new Error(`Cannot supply items. Drone inventory is already full! (${currentCount}/${capacity} slots occupied).`);
    }

    // Pause target briefly
    const wasRunning = target.status === 'running';
    if (wasRunning) target.setStatus('paused');

    let itemsTransferred = 0;
    for (const { id, count } of items) {
      for (let i = 0; i < count; i++) {
        if (this.drone.droneInventory.getTotalCount() >= capacity) {
          break; // Stop transferring if full
        }
        const added = this.drone.droneInventory.addItem(id, 1);
        if (added) {
          target.droneInventory.removeItem(id, 1);
          itemsTransferred++;
        }
      }
    }

    target.events.emit('inventory-changed', { droneId: target.id });
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

    if (wasRunning) {
      this.drone.scene.time.delayedCall(500, () => target.setStatus('running'));
    }

    await this.drone.executeAction('transfer');
  }

  async _handleSell() {
    this._requireAbility('sell');
    if (!this.economySystem) {
      throw new Error("EconomySystem not available.");
    }
    const market = this.drone.scene?.marketZone;
    const atMarket = market &&
      this.drone.tileX >= market.x - 1 && this.drone.tileX <= market.x + market.w &&
      this.drone.tileY >= market.y - 1 && this.drone.tileY <= market.y + market.h;
    if (!atMarket) throw new Error('Drone must be beside the Market to sell cargo.');
    const items = this.drone.droneInventory.getAll();
    if (items.length === 0) {
      throw new Error("Cannot sell. Drone inventory is empty.");
    }

    // Only sell crops (not seeds or modules)
    const sellableItems = items.filter(({ id }) => !id.endsWith('_seed') && !id.startsWith('module_'));
    if (sellableItems.length === 0) {
      throw new Error("Cannot sell. Drone inventory does not contain any sellable crops (seeds and modules cannot be sold).");
    }

    let totalEarned = 0;
    for (const { id, count } of sellableItems) {
      const droneInv = this.drone.droneInventory;
      const invOverride = {
        getItemCount: (item) => droneInv.getItemCount(item),
        removeItem: (item, qty) => droneInv.removeItem(item, qty),
        items: droneInv.items,
      };
      const result = this.economySystem.sellCrop(id, count, invOverride);
      if (result.success) {
        if (droneInv.getItemCount(id) >= count) {
          droneInv.removeItem(id, count);
        }
        totalEarned += result.earned || 0;
      }
    }

    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    if (totalEarned > 0 && this.drone.scene?.hud) {
      this.drone.scene.hud.showMessage(`Drone sold items: +${totalEarned}g`, 2000);
    }

    await this.drone.executeAction('transfer');
  }

  async _handleBuy(seedType, qty) {
    this._requireAbility('buy');
    if (!this.economySystem || !this.inventorySystem) {
      throw new Error("Economy or inventory system not available.");
    }
    // Check if seedType is valid
    if (!PLANT_TYPES[seedType]) {
      throw new Error(`Invalid seed type: '${seedType}'. Available crops: wheat, potato, cactus, apple_tree.`);
    }

    // Verify inventory capacity for all requested seeds BEFORE buying
    const currentCount = this.drone.droneInventory.getTotalCount();
    const capacity = this.drone.getInventoryCapacity();
    const remainingSpace = capacity - currentCount;
    if (qty > remainingSpace) {
      throw new Error(`Cannot buy seeds. Not enough space in drone inventory (requested ${qty} seeds, but only has ${remainingSpace} slots free).`);
    }

    for (let i = 0; i < qty; i++) {
      const result = this.economySystem.buySeed(seedType);
      if (result.success) {
        // Move seed from player inventory to drone inventory
        const seedItem = seedType + '_seed';
        if (this.inventorySystem.hasItem(seedItem, 1)) {
          this.inventorySystem.removeItem(seedItem, 1);
          this.drone.droneInventory.addItem(seedItem, 1);
        }
      } else {
        throw new Error("Cannot buy '" + seedType + "': " + result.message + ". Earn more gold first.");
      }
    }
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    await this.drone.executeAction('transfer');
  }
  async _handleMine() {
    this._requireAbility('mine');
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager.getTile(tileX, tileY);

    if (!tile || (!tile.isOre && tile.oreType !== 'depleted')) {
      throw new Error("Drone is not positioned on an ore mining node. Move onto a mining node to mine it.");
    }

    if (tile.oreType === 'depleted') {
      throw new Error("This mining node is depleted and waiting to respawn.");
    }

    // Check inventory capacity
    const currentCount = this.drone.droneInventory.getTotalCount();
    const capacity = this.drone.getInventoryCapacity();
    if (currentCount >= capacity) {
      const msg = `Drone inventory is full! (${currentCount}/${capacity}).`;
      if (this.drone.scene?.hud) {
        this.drone.scene.hud.showMessage(`📦 ${this.drone.label}: Inventory Full!`, 4000);
      }
      throw new Error(`Cannot mine. ${msg}`);
    }

    // Reduce durability
    tile.oreCurrentDurability--;

    // If durability hits 0, node is depleted
    if (tile.oreCurrentDurability <= 0) {
      const oreType = tile.oreType;
      
      // Calculate loot drops using loot weights
      // Stone: 60, Coal: 25, Iron: 15
      let wStone = 60;
      let wCoal = 25;
      let wIron = 15;
      
      // Modifier Bor: if player upgraded drill or module "Hilirisasi Turbo"
      let modifier = 1.0;
      if (this.drone.module === 'mining') {
        modifier = 2.5; // High modifier for mining module!
      }
      
      // Choose item:
      let dropItemId = 'stone';
      const rand = Math.random() * (wStone + wCoal + wIron * modifier);
      if (rand < wIron * modifier) {
        dropItemId = 'iron_ore';
      } else if (rand < wIron * modifier + wCoal) {
        dropItemId = 'coal';
      } else {
        dropItemId = 'stone';
      }

      // If mining a specific vein, guarantee/high chance of that specific ore
      if (oreType === 'gold') {
        dropItemId = 'gold_ore';
      } else if (oreType === 'copper') {
        dropItemId = 'copper_ore';
      } else if (oreType === 'iron') {
        dropItemId = 'iron_ore';
      } else if (oreType === 'coal') {
        dropItemId = 'coal';
      } else if (oreType === 'stone') {
        dropItemId = 'stone';
      }

      // Add to inventory
      this.drone.droneInventory.addItem(dropItemId, 1);
      this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

      // Mark as depleted
      tile.oreType = 'depleted';
      tile.isOre = false;
      tile.oreRespawnTimestamp = Date.now() + 30000; // 30 seconds

      if (this.drone.scene && Array.isArray(this.drone.scene.minedOres)) {
        this.drone.scene.minedOres.push({
          x: tileX,
          y: tileY,
          type: oreType,
          respawnTime: 30000
        });
      }

      if (this.drone.scene?.updateTileSprite) {
        this.drone.scene.updateTileSprite(tileX, tileY);
      }

      // Award XP
      if (this.profileSystem) this.profileSystem.addXp(8);
      if (this.drone.scene?.events) {
        this.drone.scene.events.emit('xp-gain', { x: tileX, y: tileY, amount: 8 });
      }
    }

    // Visual animation
    await this.drone.executeAction('mine');
  }

  _getFrontCoords() {
    const { tileX, tileY, facing } = this.drone;
    let dx = 0, dy = 0;
    if (facing === 'up') dy = -1;
    else if (facing === 'down') dy = 1;
    else if (facing === 'left') dx = -1;
    else if (facing === 'right') dx = 1;
    return { x: tileX + dx, y: tileY + dy };
  }

  _checkFrontItem() {
    const coords = this._getFrontCoords();
    const tile = this.gridManager.getTile(coords.x, coords.y);
    if (tile && tile.isConveyor && tile.conveyorItem) {
      return tile.conveyorItem;
    }
    return 'none';
  }

  async _handleDepositToConveyor(itemId) {
    if (!itemId || !this.drone.droneInventory.hasItem(itemId, 1)) {
      throw new Error(`Drone inventory does not contain '${itemId}'.`);
    }
    const coords = this._getFrontCoords();
    const tile = this.gridManager.getTile(coords.x, coords.y);
    if (!tile?.isConveyor) throw new Error('An empty conveyor must be directly in front of the drone.');
    if (tile.conveyorItem && tile.conveyorItem !== 'none') throw new Error('The conveyor in front is already occupied.');
    tile.conveyorItem = itemId;
    this.drone.droneInventory.removeItem(itemId, 1);
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    this.drone.scene?.updateTileSprite?.(coords.x, coords.y);
    await this.drone.executeAction('transfer');
  }

  async _handlePushItem(direction) {
    const frontCoords = this._getFrontCoords();
    const frontTile = this.gridManager.getTile(frontCoords.x, frontCoords.y);
    if (!frontTile || !frontTile.isConveyor || frontTile.conveyorItem === 'none') {
      throw new Error("No item in front of the drone to push.");
    }

    const item = frontTile.conveyorItem;

    let tdx = 0, tdy = 0;
    if (direction === 'up') tdy = -1;
    else if (direction === 'down') tdy = 1;
    else if (direction === 'left') tdx = -1;
    else if (direction === 'right') tdx = 1;

    const tx = frontCoords.x + tdx;
    const ty = frontCoords.y + tdy;

    if (!this.gridManager.inBounds(tx, ty)) {
      throw new Error("Push target is out of bounds.");
    }

    const targetTile = this.gridManager.getTile(tx, ty);
    const scene = this.drone.scene;

    // Warehouse or crafted depot deposit.
    const storage = scene?.buildingSystem?.getStorageAt(tx, ty)
      || (scene?.warehouse?.containsTile(tx, ty) ? scene.warehouse : null);
    if (storage) {
      storage.deposit(item, 1);
      frontTile.conveyorItem = 'none';
      if (scene.updateTileSprite) {
        scene.updateTileSprite(frontCoords.x, frontCoords.y);
      }
      await this.drone.executeAction('transfer');
      return;
    }

    // Machine deposit
    if (targetTile && targetTile.isMachine && targetTile.machineId) {
      if (scene && scene.machineSystem) {
        const deposited = scene.machineSystem.deposit(targetTile.machineId, item, 1);
        if (deposited > 0) {
          frontTile.conveyorItem = 'none';
          if (scene.updateTileSprite) {
            scene.updateTileSprite(frontCoords.x, frontCoords.y);
          }
        } else {
          throw new Error(`Machine '${targetTile.machineId}' buffer is full.`);
        }
      }
      await this.drone.executeAction('transfer');
      return;
    }

    // Conveyor belt transfer
    if (targetTile && targetTile.isConveyor) {
      if (targetTile.conveyorItem !== 'none') {
        throw new Error("Target conveyor is already occupied.");
      }
      targetTile.conveyorItem = item;
      frontTile.conveyorItem = 'none';
      if (scene.updateTileSprite) {
        scene.updateTileSprite(frontCoords.x, frontCoords.y);
        scene.updateTileSprite(tx, ty);
      }
      await this.drone.executeAction('transfer');
      return;
    }

    throw new Error("Push target must be a conveyor, a machine, or the warehouse.");
  }

  async _handleWait(seconds) {
    if (typeof seconds !== 'number' || seconds <= 0) {
      throw new Error("Wait duration must be a positive number of seconds.");
    }
    return new Promise((resolve) => {
      this.drone.scene.time.delayedCall(seconds * 1000, resolve);
    });
  }

  _checkNode() {
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager.getTile(tileX, tileY);
    if (tile && tile.isOre && tile.oreType) {
      return tile.oreType;
    }
    if (tile && tile.oreType === 'depleted') {
      return 'depleted';
    }
    return 'none';
  }

  _checkGround() {
    return this.drone.scene?.wildlifeSystem?.getDropAt(this.drone.tileX, this.drone.tileY)?.id || 'none';
  }

  async _handleCollect() {
    const collected = this.drone.scene?.wildlifeSystem?.collectAt(
      this.drone.tileX,
      this.drone.tileY,
      this.drone.droneInventory,
    );
    if (!collected) throw new Error('There is no collectable resource here, or the drone inventory is full.');
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    await this.drone.executeAction('harvest');
  }

  _getBatteryLevel() {
    const sandbox = this.drone.scriptSandbox;
    if (!sandbox) return 100;
    return Math.max(0, sandbox.maxSteps - sandbox.stepCount);
  }
  async _handleDepositToMachine(machineId, itemId, qty) {
    if (!machineId || !itemId) {
      throw new Error("depositToMachine requires a valid machineId and itemId.");
    }
    const amount = typeof qty === 'number' ? qty : 1;
    if (amount <= 0) {
      throw new Error("Deposit quantity must be greater than zero.");
    }

    const machine = this.drone.scene?.machineSystem?.machines.get(machineId);
    if (!machine) {
      throw new Error(`Machine with ID '${machineId}' not found.`);
    }

    // Must be adjacent
    const dx = Math.abs(this.drone.tileX - machine.x);
    const dy = Math.abs(this.drone.tileY - machine.y);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      throw new Error(`Drone must be adjacent to machine '${machineId}' to deposit items.`);
    }

    // Check drone inventory
    const hasCount = this.drone.droneInventory.getItemCount(itemId);
    if (hasCount < amount) {
      throw new Error(`Drone inventory does not have enough '${itemId}' to deposit (has ${hasCount}, requested ${amount}).`);
    }

    // Perform deposit
    const deposited = this.drone.scene.machineSystem.deposit(machineId, itemId, amount);
    if (deposited > 0) {
      this.drone.droneInventory.removeItem(itemId, deposited);
      this.drone.events.emit('inventory-changed', { droneId: this.drone.id });
    } else {
      throw new Error(`Failed to deposit items into machine '${machineId}'.`);
    }

    await this.drone.executeAction('transfer');
  }

  async _handleRetrieveFromMachine(machineId) {
    if (!machineId) {
      throw new Error("retrieveFromMachine requires a valid machineId.");
    }

    const machine = this.drone.scene?.machineSystem?.machines.get(machineId);
    if (!machine) {
      throw new Error(`Machine with ID '${machineId}' not found.`);
    }

    // Must be adjacent
    const dx = Math.abs(this.drone.tileX - machine.x);
    const dy = Math.abs(this.drone.tileY - machine.y);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      throw new Error(`Drone must be adjacent to machine '${machineId}' to retrieve items.`);
    }

    // Check outputs
    const state = this.drone.scene.machineSystem.getMachineState(machineId);
    if (!state || state.outputs.length === 0) {
      throw new Error(`Machine '${machineId}' has no output items to retrieve.`);
    }

    // Verify inventory capacity
    let totalItems = 0;
    for (const out of state.outputs) {
      totalItems += out.count;
    }
    const currentCount = this.drone.droneInventory.getTotalCount();
    const capacity = this.drone.getInventoryCapacity();
    if (currentCount + totalItems > capacity) {
      throw new Error(`Cannot retrieve outputs. Drone inventory would exceed capacity (carrying ${currentCount}/${capacity}, attempting to retrieve ${totalItems}).`);
    }

    // Perform retrieval
    const retrieved = this.drone.scene.machineSystem.retrieve(machineId);
    for (const item of retrieved) {
      this.drone.droneInventory.addItem(item.id, item.count);
    }
    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

    await this.drone.executeAction('transfer');
  }

  async _handleDeliverToSpecialBuyer() {
    const activeBuyer = this.drone.scene?.specialBuyerSystem?.getActiveBuyer();
    if (!activeBuyer) {
      throw new Error("No active special buyer at the Market Visitor dock.");
    }

    // Must be adjacent to (17, 3)
    const dx = Math.abs(this.drone.tileX - 17);
    const dy = Math.abs(this.drone.tileY - 3);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      throw new Error("Drone must be adjacent to the Special Buyer NPC at tile (17, 3) to deliver items.");
    }

    // Check inventory
    const reqItem = activeBuyer.reqItem;
    const reqCount = activeBuyer.reqCount;
    if (!this.drone.droneInventory.hasItem(reqItem, reqCount)) {
      throw new Error(`Drone inventory does not have enough '${reqItem}' to fulfill the order (needs ${reqCount}).`);
    }

    // Deliver order
    const success = this.drone.scene.specialBuyerSystem.fulfillOrder(this.drone.droneInventory);
    if (!success) {
      throw new Error("Failed to fulfill special buyer order.");
    }

    this.drone.events.emit('inventory-changed', { droneId: this.drone.id });

    await this.drone.executeAction('transfer');
  }

  /* ================================================================
   *  PRIVATE – synchronous tile checks
   * ================================================================ */

  _checkCanCrop() {
    const { tileX, tileY } = this.drone;
    return this.gridManager?.canCrop ? this.gridManager.canCrop(tileX, tileY) : false;
  }

  _checkCanHarvest() {
    const { tileX, tileY } = this.drone;
    return this.gridManager?.canHarvest ? this.gridManager.canHarvest(tileX, tileY) : false;
  }

  _checkIsWatered() {
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager?.getTile(tileX, tileY);
    return tile ? tile.isWatered : false;
  }

  _checkIsTilled() {
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager?.getTile(tileX, tileY);
    return tile ? tile.isTilled : false;
  }

  _checkHasPlant() {
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager?.getTile(tileX, tileY);
    return tile ? tile.hasPlant : false;
  }

  _checkPlantStage() {
    const { tileX, tileY } = this.drone;
    const tile = this.gridManager?.getTile(tileX, tileY);
    return tile?.hasPlant ? tile.growthStage : -1;
  }
}
