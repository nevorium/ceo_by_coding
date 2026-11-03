/**
 * @fileoverview MachineSystem — manages item refinement and artisan crafting refineries.
 *
 * Each machine has a specific type, input buffers, output buffers, and processes recipes.
 */

export const RECIPES = {
  crafting_table: [
    {
      id: 'conveyor_kit',
      inputs: { copper_ingot: 1, iron_ingot: 1 },
      output: { id: 'conveyor_kit', count: 1 },
      timeMs: 5000,
      name: 'Assemble Conveyor Kit',
      category: 'Bangunan',
      description: 'Sabuk berjalan untuk otomatisasi pemindahan item.',
    },
    {
      id: 'warehouse_depot_kit',
      inputs: { stone: 12, iron_ingot: 4 },
      output: { id: 'warehouse_depot_kit', count: 1 },
      timeMs: 12000,
      name: 'Assemble Warehouse Depot Kit',
      category: 'Bangunan',
      description: 'Depot satelit untuk akses penyimpanan gudang pusat.',
    },
    {
      id: 'crafting_table_kit',
      inputs: { stone: 6, copper_ingot: 2 },
      output: { id: 'crafting_table_kit', count: 1 },
      timeMs: 6000,
      name: 'Assemble Crafting Table Kit',
      category: 'Bangunan',
      description: 'Meja kerja perakitan kit bangunan dan peralatan.',
    },
    {
      id: 'warehouse_kit',
      inputs: { stone: 12, iron_ingot: 4 },
      output: { id: 'warehouse_kit', count: 1 },
      timeMs: 12000,
      name: 'Assemble Warehouse Kit',
      category: 'Bangunan',
      description: 'Gudang satelit penyimpanan multi-lokasi.',
    },
    {
      id: 'smelter_kit',
      inputs: { stone: 10, copper_ingot: 4 },
      output: { id: 'smelter_kit', count: 1 },
      timeMs: 8000,
      name: 'Assemble Smelter Kit',
      category: 'Bangunan',
      description: 'Tungku pelebur bijih tambang menjadi batangan logam.',
    },
    {
      id: 'mill_kit',
      inputs: { stone: 8, iron_ingot: 2 },
      output: { id: 'mill_kit', count: 1 },
      timeMs: 6000,
      name: 'Assemble Mill Kit',
      category: 'Bangunan',
      description: 'Mesin giling gandum otomatis.',
    },
    {
      id: 'assembler_kit',
      inputs: { iron_ingot: 6, copper_ingot: 4 },
      output: { id: 'assembler_kit', count: 1 },
      timeMs: 10000,
      name: 'Assemble Assembler Kit',
      category: 'Bangunan',
      description: 'Mesin perakit komponen otomatis.',
    },
    {
      id: 'press_kit',
      inputs: { stone: 6, iron_ingot: 2 },
      output: { id: 'press_kit', count: 1 },
      timeMs: 6000,
      name: 'Assemble Press Kit',
      category: 'Bangunan',
      description: 'Mesin pemeras buah otomatis.',
    },
    {
      id: 'boiler_kit',
      inputs: { stone: 6, copper_ingot: 3 },
      output: { id: 'boiler_kit', count: 1 },
      timeMs: 6000,
      name: 'Assemble Boiler Kit',
      category: 'Bangunan',
      description: 'Ketel perebus sirup otomatis.',
    },
    {
      id: 'pickaxe',
      inputs: { stone: 4, wild_fiber: 2 },
      output: { id: 'pickaxe', count: 1 },
      timeMs: 4000,
      name: 'Craft Pickaxe',
      category: 'Peralatan',
      description: 'Beliung untuk menambang batu dan bijih di lembah tambang.',
    },
    {
      id: 'plow',
      inputs: { stone: 2, wild_fiber: 2 },
      output: { id: 'plow', count: 1 },
      timeMs: 3000,
      name: 'Craft Wooden Plow',
      category: 'Peralatan',
      description: 'Cangkul untuk menggemburkan tanah rumput.',
    },
    {
      id: 'watering_can',
      inputs: { copper_ingot: 2, wild_fiber: 1 },
      output: { id: 'watering_can', count: 1 },
      timeMs: 3000,
      name: 'Craft Watering Can',
      category: 'Peralatan',
      description: 'Penyiram air tanah garapan perkebunan.',
    },
    {
      id: 'teleporter_kit',
      inputs: { iron_ingot: 8, gold_ingot: 3, chip: 2 },
      output: { id: 'teleporter_kit', count: 1 },
      timeMs: 15000,
      name: 'Assemble Teleporter Kit',
      category: 'Bangunan',
      description: 'Pad teleport untuk berpindah cepat antar-teleporter.',
    },
  ],
  mill: {
    inputs: { wheat: 2 },
    output: { id: 'flour', count: 1 },
    timeMs: 10000,
    name: 'Grind Wheat into Flour',
  },
  bakery: {
    inputs: { flour: 2 },
    output: { id: 'bread', count: 1 },
    timeMs: 15000,
    name: 'Bake Flour into Bread',
  },
  press: {
    inputs: { apple_tree: 2 },
    output: { id: 'apple_juice', count: 1 },
    timeMs: 10000,
    name: 'Press Apples into Apple Juice',
  },
  boiler: {
    inputs: { apple_juice: 2 },
    output: { id: 'apple_jam', count: 1 },
    timeMs: 15000,
    name: 'Boil Apple Juice into Apple Jam',
  },
  purifier: {
    inputs: { potato: 2 },
    output: { id: 'potato_starch', count: 1 },
    timeMs: 10000,
    name: 'Purify Potatoes into Starch',
  },
  fryer: {
    inputs: { potato_starch: 2 },
    output: { id: 'chips', count: 1 },
    timeMs: 15000,
    name: 'Fry Starch into Potato Chips',
  },
  smelter: [
    {
      inputs: { copper_ore: 2, coal: 1 },
      output: { id: 'copper_ingot', count: 1 },
      timeMs: 12000,
      name: 'Smelt Copper Ingot',
    },
    {
      inputs: { iron_ore: 2, coal: 1 },
      output: { id: 'iron_ingot', count: 1 },
      timeMs: 12000,
      name: 'Smelt Iron Ingot',
    },
    {
      inputs: { gold_ore: 2, coal: 1 },
      output: { id: 'gold_ingot', count: 1 },
      timeMs: 15000,
      name: 'Smelt Gold Ingot',
    },
  ],
  assembler: [
    {
      inputs: { copper_ingot: 2 },
      output: { id: 'wire', count: 3 },
      timeMs: 15000,
      name: 'Assemble Copper Wire',
    },
    {
      inputs: { iron_ingot: 2 },
      output: { id: 'gear', count: 2 },
      timeMs: 15000,
      name: 'Assemble Iron Gear',
    },
    {
      inputs: { wire: 2, gold_ingot: 1 },
      output: { id: 'chip', count: 1 },
      timeMs: 20000,
      name: 'Assemble Microchip',
    },
  ],
  module_crafter: [
    {
      inputs: { wire: 1, gear: 1, copper_ingot: 2 },
      output: { id: 'module_mining', count: 1 },
      timeMs: 20000,
      name: 'Forge Mining Module',
    },
    {
      inputs: { wire: 5, gear: 5, iron_ingot: 10 },
      output: { id: 'module_bigger_seller', count: 1 },
      timeMs: 25000,
      name: 'Forge Bigger Seller Module',
    },
    {
      inputs: { wire: 10, gear: 10, iron_ingot: 20 },
      output: { id: 'module_super_carrier', count: 1 },
      timeMs: 30000,
      name: 'Forge Super Carrier Module',
    },
    {
      inputs: { wire: 5, gear: 5, copper_ingot: 5, iron_ingot: 5 },
      output: { id: 'module_advanced_farming', count: 1 },
      timeMs: 25000,
      name: 'Forge Advanced Farming Module',
    },
    {
      inputs: { wire: 5, gear: 5, copper_ingot: 10 },
      output: { id: 'module_speed_booster', count: 1 },
      timeMs: 25000,
      name: 'Forge Speed Booster Module',
    },
  ],
};

export default class MachineSystem {
  constructor() {
    /** @type {Map<string, object>} Map of machineId -> state */
    this.machines = new Map();
  }

  /**
   * Register a new machine in the system.
   * @param {string} id - Unique identifier (e.g. 'mill_001')
   * @param {string} type - Machine type matching RECIPES keys (e.g. 'mill')
   * @param {number} x - Grid X position
   * @param {number} y - Grid Y position
   */
  registerMachine(id, type, x, y) {
    if (this.machines.has(id)) return;

    this.machines.set(id, {
      id,
      type,
      x,
      y,
      inputBuffer: new Map(),
      outputBuffer: new Map(),
      activeRecipe: null,
      timeRemaining: 0,
      maxTime: 0,
    });
  }

  /**
   * Unregister / remove a machine from the system.
   * Returns any items left in its input and output buffers.
   * @param {string} id
   * @returns {{ id: string, type: string, items: Array<{ id: string, count: number }> }|null}
   */
  unregisterMachine(id) {
    const machine = this.machines.get(id);
    if (!machine) return null;

    const items = [];
    for (const [itemId, count] of machine.inputBuffer.entries()) {
      if (count > 0) items.push({ id: itemId, count });
    }
    for (const [itemId, count] of machine.outputBuffer.entries()) {
      if (count > 0) items.push({ id: itemId, count });
    }

    this.machines.delete(id);
    return { id, type: machine.type, items };
  }

  /**
   * Get the current state of a machine.
   * @param {string} id
   * @returns {object|null}
   */
  getMachineState(id) {
    const machine = this.machines.get(id);
    if (!machine) return null;

    const inputs = [];
    for (const [itemId, count] of machine.inputBuffer) {
      inputs.push({ id: itemId, count });
    }

    const outputs = [];
    for (const [itemId, count] of machine.outputBuffer) {
      outputs.push({ id: itemId, count });
    }

    const isProcessing = machine.activeRecipe !== null;
    const progress = isProcessing
      ? ((machine.maxTime - machine.timeRemaining) / machine.maxTime) * 100
      : 0;

    return {
      id: machine.id,
      type: machine.type,
      inputs,
      outputs,
      isProcessing,
      progress: Math.min(100, Math.max(0, progress)),
      activeRecipeName: machine.activeRecipe ? machine.activeRecipe.name : null,
      timeRemaining: Math.ceil(machine.timeRemaining / 1000), // in seconds
    };
  }

  /**
   * Deposit an item into a machine.
   * @param {string} id
   * @param {string} itemId
   * @param {number} qty
   * @returns {number} Amount actually deposited.
   */
  deposit(id, itemId, qty) {
    const machine = this.machines.get(id);
    if (!machine) return 0;

    const current = machine.inputBuffer.get(itemId) || 0;
    machine.inputBuffer.set(itemId, current + qty);

    // Try starting a recipe after deposit
    this._tryStartRecipe(machine);

    return qty;
  }

  /**
   * Retrieve all outputs from a machine.
   * @param {string} id
   * @returns {{id: string, count: number}[]}
   */
  retrieve(id) {
    const machine = this.machines.get(id);
    if (!machine) return [];

    const result = [];
    for (const [itemId, count] of machine.outputBuffer) {
      result.push({ id: itemId, count });
    }

    machine.outputBuffer.clear();
    return result;
  }

  /**
   * Get recipes for a machine type or machine id.
   * @param {string} machineTypeOrId
   * @returns {Array<object>}
   */
  getRecipes(machineTypeOrId) {
    const machine = this.machines.get(machineTypeOrId);
    const type = machine ? machine.type : machineTypeOrId;
    const list = RECIPES[type];
    if (!list) return [];
    return Array.isArray(list) ? list : [list];
  }

  /**
   * Check if player and/or machine has the required ingredients to craft a recipe.
   * @param {object|string} recipeOrId
   * @param {object} inventorySystem
   * @param {string|null} [machineId=null]
   * @param {number} [count=1]
   * @returns {{ canCraft: boolean, maxCraftable: number, missing: object, available: object, reqs: object }}
   */
  checkCraftRequirements(recipeOrId, inventorySystem, machineId = null, count = 1) {
    let recipe = recipeOrId;
    if (typeof recipe === 'string') {
      const all = Object.values(RECIPES).flatMap(r => Array.isArray(r) ? r : [r]);
      recipe = all.find(r => r.id === recipeOrId || r.output?.id === recipeOrId || r.name === recipeOrId);
    }
    if (!recipe || !recipe.inputs) {
      return { canCraft: false, maxCraftable: 0, missing: {}, available: {}, reqs: {} };
    }

    const machine = machineId ? this.machines.get(machineId) : null;
    const missing = {};
    const available = {};
    const reqs = {};
    let maxCraftable = Infinity;

    for (const [itemId, neededPerCraft] of Object.entries(recipe.inputs)) {
      const invCount = inventorySystem ? inventorySystem.getItemCount(itemId) : 0;
      const machCount = machine && machine.inputBuffer ? (machine.inputBuffer.get(itemId) || 0) : 0;
      const totalHave = invCount + machCount;
      const totalNeeded = neededPerCraft * count;

      available[itemId] = totalHave;
      reqs[itemId] = totalNeeded;

      if (totalHave < totalNeeded) {
        missing[itemId] = totalNeeded - totalHave;
      }

      const possibleForThis = Math.floor(totalHave / neededPerCraft);
      if (possibleForThis < maxCraftable) {
        maxCraftable = possibleForThis;
      }
    }

    if (maxCraftable === Infinity) maxCraftable = 0;
    const canCraft = Object.keys(missing).length === 0 && count > 0;

    return { canCraft, maxCraftable, missing, available, reqs };
  }

  /**
   * Calculate how many times a recipe can be crafted with available ingredients.
   * @param {object|string} recipeOrId
   * @param {object} inventorySystem
   * @param {string|null} [machineId=null]
   * @returns {number}
   */
  getMaxCraftableCount(recipeOrId, inventorySystem, machineId = null) {
    return this.checkCraftRequirements(recipeOrId, inventorySystem, machineId, 1).maxCraftable;
  }

  /**
   * Execute manual crafting of a recipe by the player.
   * Deducts ingredients from inventory (and machine buffer if needed),
   * and places the crafted output item(s) into inventory.
   *
   * @param {object|string} recipeOrId
   * @param {object} inventorySystem
   * @param {string|null} [machineId=null]
   * @param {number} [count=1]
   * @returns {{ success: boolean, reason?: string, outputItem?: string, outputCount?: number, countCrafted?: number, recipe?: object, missing?: object }}
   */
  craftItem(recipeOrId, inventorySystem, machineId = null, count = 1) {
    let recipe = recipeOrId;
    if (typeof recipe === 'string') {
      const all = Object.values(RECIPES).flatMap(r => Array.isArray(r) ? r : [r]);
      recipe = all.find(r => r.id === recipeOrId || r.output?.id === recipeOrId || r.name === recipeOrId);
    }
    if (!recipe) return { success: false, reason: 'invalid_recipe' };
    if (count <= 0) return { success: false, reason: 'invalid_count' };

    const check = this.checkCraftRequirements(recipe, inventorySystem, machineId, count);
    if (!check.canCraft) {
      return { success: false, reason: 'insufficient_materials', missing: check.missing };
    }

    const outputId = recipe.output.id;
    const totalOutputCount = (recipe.output.count || 1) * count;

    // Check inventory capacity
    if (inventorySystem && typeof inventorySystem.hasSpaceFor === 'function') {
      if (!inventorySystem.hasSpaceFor(outputId, totalOutputCount)) {
        return { success: false, reason: 'inventory_full' };
      }
    }

    // Deduct inputs
    const machine = machineId ? this.machines.get(machineId) : null;
    for (const [itemId, neededPerCraft] of Object.entries(recipe.inputs)) {
      let needed = neededPerCraft * count;

      if (inventorySystem) {
        const invHave = inventorySystem.getItemCount(itemId);
        const takeFromInv = Math.min(invHave, needed);
        if (takeFromInv > 0) {
          inventorySystem.removeItem(itemId, takeFromInv);
          needed -= takeFromInv;
        }
      }

      if (needed > 0 && machine && machine.inputBuffer) {
        const machHave = machine.inputBuffer.get(itemId) || 0;
        const takeFromMach = Math.min(machHave, needed);
        if (takeFromMach >= machHave) {
          machine.inputBuffer.delete(itemId);
        } else {
          machine.inputBuffer.set(itemId, machHave - takeFromMach);
        }
        needed -= takeFromMach;
      }
    }

    // Add output to player inventory
    if (inventorySystem) {
      inventorySystem.addItem(outputId, totalOutputCount);
    }

    return {
      success: true,
      recipe,
      outputItem: outputId,
      outputCount: totalOutputCount,
      countCrafted: count,
    };
  }

  /**
   * Core tick update. Called from GameScene update.
   * @param {number} delta - Frame delta in ms
   */
  update(delta) {
    for (const machine of this.machines.values()) {
      if (machine.activeRecipe) {
        machine.timeRemaining -= delta;
        if (machine.timeRemaining <= 0) {
          this._completeRecipe(machine);
        }
      }
    }
  }

  /**
   * Attempt to find and start a valid recipe based on inputs.
   * @private
   * @param {object} machine
   */
  _tryStartRecipe(machine) {
    if (machine.activeRecipe) return; // Already processing

    const recipeList = RECIPES[machine.type];
    if (!recipeList) return;

    // Check if the recipe list is an array or a single recipe
    const recipesToCheck = Array.isArray(recipeList) ? recipeList : [recipeList];

    for (const recipe of recipesToCheck) {
      let canCraft = true;

      // Verify inputs
      for (const [reqId, reqCount] of Object.entries(recipe.inputs)) {
        const hasCount = machine.inputBuffer.get(reqId) || 0;
        if (hasCount < reqCount) {
          canCraft = false;
          break;
        }
      }

      if (canCraft) {
        // Deduct inputs
        for (const [reqId, reqCount] of Object.entries(recipe.inputs)) {
          const current = machine.inputBuffer.get(reqId);
          if (current === reqCount) {
            machine.inputBuffer.delete(reqId);
          } else {
            machine.inputBuffer.set(reqId, current - reqCount);
          }
        }

        // Start recipe
        machine.activeRecipe = recipe;
        machine.timeRemaining = recipe.timeMs;
        machine.maxTime = recipe.timeMs;
        break; // Process one recipe at a time
      }
    }
  }

  /**
   * Complete the active recipe, moving result to output buffer.
   * @private
   * @param {object} machine
   */
  _completeRecipe(machine) {
    const recipe = machine.activeRecipe;
    if (!recipe) return;

    const outId = recipe.output.id;
    const outCount = recipe.output.count;

    const current = machine.outputBuffer.get(outId) || 0;
    machine.outputBuffer.set(outId, current + outCount);

    machine.activeRecipe = null;
    machine.timeRemaining = 0;
    machine.maxTime = 0;

    // Try starting the next one immediately if inputs exist
    this._tryStartRecipe(machine);
  }

  /**
   * Dump states for saving.
   */
  getSaveState() {
    const states = [];
    for (const [id, m] of this.machines) {
      states.push({
        id,
        type: m.type,
        x: m.x,
        y: m.y,
        inputBuffer: Array.from(m.inputBuffer.entries()),
        outputBuffer: Array.from(m.outputBuffer.entries()),
        activeRecipeName: m.activeRecipe ? m.activeRecipe.name : null,
        timeRemaining: m.timeRemaining,
        maxTime: m.maxTime,
      });
    }
    return states;
  }

  /**
   * Restore states from saving.
   */
  loadSaveState(states) {
    if (!Array.isArray(states)) return;
    this.machines.clear();

    for (const s of states) {
      const machine = {
        id: s.id,
        type: s.type,
        x: s.x,
        y: s.y,
        inputBuffer: new Map(s.inputBuffer),
        outputBuffer: new Map(s.outputBuffer),
        activeRecipe: null,
        timeRemaining: s.timeRemaining || 0,
        maxTime: s.maxTime || 0,
      };

      // Re-map active recipe if it was processing
      if (s.activeRecipeName) {
        const recipeList = RECIPES[s.type];
        if (recipeList) {
          const list = Array.isArray(recipeList) ? recipeList : [recipeList];
          const matched = list.find(r => r.name === s.activeRecipeName);
          if (matched) {
            machine.activeRecipe = matched;
          }
        }
      }

      this.machines.set(s.id, machine);
    }
  }
}
