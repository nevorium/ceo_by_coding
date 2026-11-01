/**
 * @fileoverview ScriptSandbox – executes player-authored JavaScript safely in real-time.
 *
 * Strategy
 * --------
 * 1. The player's code is executed using Neil Fraser's JS-Interpreter.
 * 2. Drone action methods (like move, till, plant, crop) are registered as async functions.
 *    When called, they pause the interpreter, trigger the game animation/logic,
 *    and resume the interpreter once completed.
 * 3. Drone check methods (like canCrop, isWatered) are registered as synchronous functions.
 *    They query the current grid state instantly and return the value back to the script.
 * 4. Step-by-step runner loops through instructions, yielding periodically to prevent
 *    browser freezing in case of infinite loops.
 */

import Interpreter from 'js-interpreter';
import { MAX_EXECUTION_STEPS } from '../config/constants.js';

export default class ScriptSandbox {
  /**
   * @param {import('./DroneAPI.js').default} droneAPI
   * @param {object} profileSystem
   */
  constructor(droneAPI, profileSystem) {
    /** @type {import('./DroneAPI.js').default} */
    this.droneAPI = droneAPI;

    /** @type {object} */
    this.profileSystem = profileSystem;

    /** @type {boolean} True while a script is running. */
    this.isRunning = false;

    /** @type {number} How many steps have been executed. */
    this.stepCount = 0;

    /** @type {number} Hard ceiling to prevent runaway scripts. */
    this.maxSteps = MAX_EXECUTION_STEPS;

    /** @type {string[]} Captured `console.log` output. */
    this.logs = [];

    /** @type {string[]} Captured error messages. */
    this.errors = [];

    /** @type {Interpreter|null} The active JS-Interpreter instance. */
    this.interpreter = null;

    // ── Callbacks (set externally) ──────────────────────────────
    /** @type {Function|null} Called for every `console.log` line. */
    this.onLog = null;

    /** @type {Function|null} Called when an error occurs. */
    this.onError = null;

    /** @type {Function|null} Called when execution finishes (success or fail). */
    this.onComplete = null;
  }

  /* ================================================================
   *  PUBLIC API
   * ================================================================ */

  /**
   * Execute a block of player-written JavaScript.
   *
   * @param {string} code – Raw source from the Monaco editor.
   * @returns {void}
   */
  /**
   * Translate character offset to 1-indexed line number.
   * @param {string} code
   * @param {number} offset
   * @returns {number}
   */
  getLineNumberFromOffset(code, offset) {
    if (typeof offset !== 'number' || offset < 0) return 1;
    let line = 1;
    for (let i = 0; i < Math.min(offset, code.length); i++) {
      if (code[i] === '\n') {
        line++;
      }
    }
    return line;
  }

  /**
   * Determine the current line number based on the interpreter state stack.
   * @returns {number|null}
   */
  getCurrentLineNumber() {
    if (!this.interpreter || !this.interpreter.stateStack || this.interpreter.stateStack.length === 0) {
      return null;
    }
    // Traverse state stack from top to bottom to find a node with position info
    for (let i = this.interpreter.stateStack.length - 1; i >= 0; i--) {
      const state = this.interpreter.stateStack[i];
      if (state && state.node && typeof state.node.start === 'number') {
        return this.getLineNumberFromOffset(this.originalCode, state.node.start);
      }
    }
    return null;
  }

  /**
   * Propagate asynchronous errors from DroneAPI, halting script execution immediately.
   * @param {Error|string} err
   */
  handleAsyncError(err) {
    this.isRunning = false;
    const lineNum = this.getCurrentLineNumber();
    const rawMsg = err.message || String(err);
    const linePrefix = lineNum !== null ? `Line ${lineNum}: ` : '';
    const formattedError = `${linePrefix}Error: ${rawMsg}`;

    this.errors.push(formattedError);
    if (this.droneAPI.drone) {
      this.droneAPI.drone.setStatus('error');
    }
    if (this.onError) {
      this.onError(formattedError);
    }
    if (this.onComplete) {
      this.onComplete({ success: false, error: formattedError });
    }
  }

  /**
   * Execute a block of player-written JavaScript.
   *
   * @param {string} code – Raw source from the Monaco editor.
   * @returns {void}
   */
  execute(code) {
    // ── 1. Reset state ────────────────────────────────────────────
    this.originalCode = code;
    this.isRunning = true;
    this.stepCount = 0;
    this.logs = [];
    this.errors = [];
    this.droneAPI.clearQueue();

    // ── 1b. Update maxSteps dynamically from profile system ──
    this.maxSteps = this.profileSystem ? this.profileSystem.getUpgradeValue('battery') : MAX_EXECUTION_STEPS;

    // ── 2. Set Drone Status ────────────────────────────────────────
    if (this.droneAPI.drone) {
      this.droneAPI.drone.setStatus('running');
    }

    try {
      const self = this;

      // ── 3. Initialize JS-Interpreter ──────────────────────────────
      this.interpreter = new Interpreter(code, (interpreter, globalObject) => {
        // Expose 'console' object
        const consoleObj = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
        interpreter.setProperty(globalObject, 'console', consoleObj);

        // Map console log methods
        const logWrapper = function() {
          const args = Array.prototype.slice.call(arguments).map(arg => {
            const native = interpreter.pseudoToNative(arg);
            if (native !== null && typeof native === 'object') {
              try {
                return JSON.stringify(native);
              } catch (e) {
                return String(native);
              }
            }
            return String(native);
          });
          const msg = args.join(' ');
          self.logs.push(msg);
          if (self.onLog) self.onLog(msg);
        };

        interpreter.setProperty(consoleObj, 'log', interpreter.createNativeFunction(logWrapper));
        interpreter.setProperty(consoleObj, 'warn', interpreter.createNativeFunction(logWrapper));
        interpreter.setProperty(consoleObj, 'error', interpreter.createNativeFunction(logWrapper));
        interpreter.setProperty(consoleObj, 'info', interpreter.createNativeFunction(logWrapper));

        // Expose 'drone' object
        const droneObj = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
        interpreter.setProperty(globalObject, 'drone', droneObj);

        // ── Expose Drone Async Actions ──

        // move(direction)
        const moveWrapper = function(direction, callback) {
          self.droneAPI._handleMove(direction).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'move', interpreter.createAsyncFunction(moveWrapper));

        // till()
        const tillWrapper = function(callback) {
          self.droneAPI._handleTill().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'till', interpreter.createAsyncFunction(tillWrapper));

        // water()
        const waterWrapper = function(callback) {
          self.droneAPI._handleWater().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'water', interpreter.createAsyncFunction(waterWrapper));

        // plant(seedType)
        const plantWrapper = function(seedType, callback) {
          self.droneAPI._handlePlant(seedType).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'plant', interpreter.createAsyncFunction(plantWrapper));

        // crop()
        const cropWrapper = function(callback) {
          self.droneAPI._handleCrop().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'crop', interpreter.createAsyncFunction(cropWrapper));

        // harvest()
        const harvestWrapper = function(callback) {
          self.droneAPI._handleHarvest().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'harvest', interpreter.createAsyncFunction(harvestWrapper));

        // doFlip()
        const flipWrapper = function(callback) {
          self.droneAPI._handleFlip().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'doFlip', interpreter.createAsyncFunction(flipWrapper));

        // say(text)
        const sayWrapper = function(text, callback) {
          self.droneAPI._handleSay(String(text)).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'say', interpreter.createAsyncFunction(sayWrapper));

        // transferToPlayer()
        const transferToPlayerWrapper = function(callback) {
          self.droneAPI._handleTransferToPlayer().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'transferToPlayer', interpreter.createAsyncFunction(transferToPlayerWrapper));

        // transferToWarehouse()
        const transferToWarehouseWrapper = function(callback) {
          self.droneAPI._handleTransferToWarehouse().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'transferToWarehouse', interpreter.createAsyncFunction(transferToWarehouseWrapper));

        // transferFromWarehouse(itemId)
        const transferFromWarehouseWrapper = function(itemId, callback) {
          const item = interpreter.pseudoToNative(itemId);
          self.droneAPI._handleTransferFromWarehouse(item).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'transferFromWarehouse', interpreter.createAsyncFunction(transferFromWarehouseWrapper));

        // supplyFrom(targetDroneId)
        const supplyFromWrapper = function(targetDroneId, callback) {
          self.droneAPI._handleSupplyFrom(targetDroneId).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'supplyFrom', interpreter.createAsyncFunction(supplyFromWrapper));

        // sell()
        const sellWrapper = function(callback) {
          self.droneAPI._handleSell().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'sell', interpreter.createAsyncFunction(sellWrapper));

        // buy(seedType, qty)
        const buyWrapper = function(seedType, qty, callback) {
          self.droneAPI._handleBuy(seedType, qty).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'buy', interpreter.createAsyncFunction(buyWrapper));

        // mine()
        const mineWrapper = function(callback) {
          self.droneAPI._handleMine().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'mine', interpreter.createAsyncFunction(mineWrapper));

        // depositToMachine(machineId, itemId, qty)
        const depositToMachineWrapper = function(machineId, itemId, qty, callback) {
          const mId = interpreter.pseudoToNative(machineId);
          const iId = interpreter.pseudoToNative(itemId);
          const q = interpreter.pseudoToNative(qty);
          self.droneAPI._handleDepositToMachine(mId, iId, q).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'depositToMachine', interpreter.createAsyncFunction(depositToMachineWrapper));

        // retrieveFromMachine(machineId)
        const retrieveFromMachineWrapper = function(machineId, callback) {
          const mId = interpreter.pseudoToNative(machineId);
          self.droneAPI._handleRetrieveFromMachine(mId).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'retrieveFromMachine', interpreter.createAsyncFunction(retrieveFromMachineWrapper));

        // deliverToSpecialBuyer()
        const deliverToSpecialBuyerWrapper = function(callback) {
          self.droneAPI._handleDeliverToSpecialBuyer().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'deliverToSpecialBuyer', interpreter.createAsyncFunction(deliverToSpecialBuyerWrapper));

        // pushItem(direction)
        const pushItemWrapper = function(direction, callback) {
          self.droneAPI._handlePushItem(direction).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'pushItem', interpreter.createAsyncFunction(pushItemWrapper));

        // wait(seconds)
        const waitWrapper = function(seconds, callback) {
          self.droneAPI._handleWait(seconds).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'wait', interpreter.createAsyncFunction(waitWrapper));

        // ── Expose Drone Synchronous Checks ──

        // checkFrontItem()
        const checkFrontItemWrapper = function() {
          return self.droneAPI._checkFrontItem();
        };
        interpreter.setProperty(droneObj, 'checkFrontItem', interpreter.createNativeFunction(checkFrontItemWrapper));

        // depositToConveyor(itemId)
        const depositToConveyorWrapper = function(itemId, callback) {
          const item = interpreter.pseudoToNative(itemId);
          self.droneAPI._handleDepositToConveyor(item).then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'depositToConveyor', interpreter.createAsyncFunction(depositToConveyorWrapper));

        // checkNode()
        const checkNodeWrapper = function() {
          return self.droneAPI._checkNode();
        };
        interpreter.setProperty(droneObj, 'checkNode', interpreter.createNativeFunction(checkNodeWrapper));

        // checkGround()
        const checkGroundWrapper = function() {
          return self.droneAPI._checkGround();
        };
        interpreter.setProperty(droneObj, 'checkGround', interpreter.createNativeFunction(checkGroundWrapper));

        // collect()
        const collectWrapper = function(callback) {
          self.droneAPI._handleCollect().then(() => {
            callback();
            self.runInterpreter();
          }).catch((err) => {
            self.handleAsyncError(err);
          });
        };
        interpreter.setProperty(droneObj, 'collect', interpreter.createAsyncFunction(collectWrapper));

        // getBatteryLevel()
        const getBatteryLevelWrapper = function() {
          return self.droneAPI._getBatteryLevel();
        };
        interpreter.setProperty(droneObj, 'getBatteryLevel', interpreter.createNativeFunction(getBatteryLevelWrapper));

        // hasPower()
        const hasPowerWrapper = function() {
          return self.droneAPI._getBatteryLevel() > 0;
        };
        interpreter.setProperty(droneObj, 'hasPower', interpreter.createNativeFunction(hasPowerWrapper));

        // canCrop()
        const canCropWrapper = function() {
          return self.droneAPI._checkCanCrop();
        };
        interpreter.setProperty(droneObj, 'canCrop', interpreter.createNativeFunction(canCropWrapper));

        // canHarvest()
        const canHarvestWrapper = function() {
          return self.droneAPI._checkCanHarvest();
        };
        interpreter.setProperty(droneObj, 'canHarvest', interpreter.createNativeFunction(canHarvestWrapper));

        // isWatered()
        const isWateredWrapper = function() {
          return self.droneAPI._checkIsWatered();
        };
        interpreter.setProperty(droneObj, 'isWatered', interpreter.createNativeFunction(isWateredWrapper));

        // isTilled()
        const isTilledWrapper = function() {
          return self.droneAPI._checkIsTilled();
        };
        interpreter.setProperty(droneObj, 'isTilled', interpreter.createNativeFunction(isTilledWrapper));

        // hasPlant()
        const hasPlantWrapper = function() {
          return self.droneAPI._checkHasPlant();
        };
        interpreter.setProperty(droneObj, 'hasPlant', interpreter.createNativeFunction(hasPlantWrapper));

        // getPlantStage()
        const getPlantStageWrapper = function() {
          return self.droneAPI._checkPlantStage();
        };
        interpreter.setProperty(droneObj, 'getPlantStage', interpreter.createNativeFunction(getPlantStageWrapper));

        // getPosition()
        const getPositionWrapper = function() {
          const pos = self.droneAPI.drone.getPosition();
          return interpreter.nativeToPseudo(pos);
        };
        interpreter.setProperty(droneObj, 'getPosition', interpreter.createNativeFunction(getPositionWrapper));

        // getInventoryCount()
        const getInventoryCountWrapper = function() {
          return self.droneAPI.drone.droneInventory.getTotalCount();
        };
        interpreter.setProperty(droneObj, 'getInventoryCount', interpreter.createNativeFunction(getInventoryCountWrapper));

        // getInventoryCapacity()
        const getInventoryCapacityWrapper = function() {
          return self.droneAPI.drone.getInventoryCapacity();
        };
        interpreter.setProperty(droneObj, 'getInventoryCapacity', interpreter.createNativeFunction(getInventoryCapacityWrapper));

        // hasDroneItem(itemId, qty)
        const hasDroneItemWrapper = function(itemId, qty) {
          return self.droneAPI.drone.droneInventory.hasItem(itemId, qty || 1);
        };
        interpreter.setProperty(droneObj, 'hasDroneItem', interpreter.createNativeFunction(hasDroneItemWrapper));

        // isInventoryFull()
        const isInventoryFullWrapper = function() {
          return self.droneAPI.drone.droneInventory.getTotalCount() >= self.droneAPI.drone.getInventoryCapacity();
        };
        interpreter.setProperty(droneObj, 'isInventoryFull', interpreter.createNativeFunction(isInventoryFullWrapper));

        // getMachineState(machineId)
        const getMachineStateWrapper = function(machineId) {
          const mId = interpreter.pseudoToNative(machineId);
          const state = self.droneAPI.drone.scene?.machineSystem?.getMachineState(mId) || null;
          return interpreter.nativeToPseudo(state);
        };
        interpreter.setProperty(droneObj, 'getMachineState', interpreter.createNativeFunction(getMachineStateWrapper));

        // hasSpecialBuyer()
        const hasSpecialBuyerWrapper = function() {
          const res = self.droneAPI.drone.scene?.specialBuyerSystem?.getActiveBuyer() !== null;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(droneObj, 'hasSpecialBuyer', interpreter.createNativeFunction(hasSpecialBuyerWrapper));

        // getSpecialBuyerRequest()
        const getSpecialBuyerRequestWrapper = function() {
          const buyer = self.droneAPI.drone.scene?.specialBuyerSystem?.getActiveBuyer();
          if (!buyer) return interpreter.nativeToPseudo(null);
          const res = {
            id: buyer.id,
            name: buyer.name,
            reqItem: buyer.reqItem,
            reqCount: buyer.reqCount,
            reward: buyer.reward,
            timeLeft: Math.ceil(buyer.timeRemaining / 1000)
          };
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(droneObj, 'getSpecialBuyerRequest', interpreter.createNativeFunction(getSpecialBuyerRequestWrapper));

        // getDrones()
        const getDronesWrapper = function() {
          const drones = self.droneAPI.deviceManager ? self.droneAPI.deviceManager.getAll() : [];
          const list = drones.map(d => ({
            id: d.id,
            label: d.label,
            x: d.tileX,
            y: d.tileY,
            status: d.status
          }));
          return interpreter.nativeToPseudo(list);
        };
        interpreter.setProperty(droneObj, 'getDrones', interpreter.createNativeFunction(getDronesWrapper));

        // getDronePosition(droneId)
        const getDronePositionWrapper = function(targetId) {
          const targetIdNative = interpreter.pseudoToNative(targetId);
          if (!self.droneAPI.deviceManager) return interpreter.nativeToPseudo(null);
          const target = self.droneAPI.deviceManager.getById(targetIdNative);
          if (!target) return interpreter.nativeToPseudo(null);
          return interpreter.nativeToPseudo({ x: target.tileX, y: target.tileY });
        };
        interpreter.setProperty(droneObj, 'getDronePosition', interpreter.createNativeFunction(getDronePositionWrapper));

        // Expose 'sharedMemory' and 'mem' object
        const memObj = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
        interpreter.setProperty(globalObject, 'sharedMemory', memObj);
        interpreter.setProperty(globalObject, 'mem', memObj);

        // Expose 'sharedMemory' functions
        const setWrapper = function(key, value) {
          const k = interpreter.pseudoToNative(key);
          const v = interpreter.pseudoToNative(value);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          if (sm) sm.set(k, v);
        };
        interpreter.setProperty(memObj, 'set', interpreter.createNativeFunction(setWrapper));

        const getWrapper = function(key, defaultValue) {
          const k = interpreter.pseudoToNative(key);
          const dv = interpreter.pseudoToNative(defaultValue);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.get(k, dv) : dv;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'get', interpreter.createNativeFunction(getWrapper));

        const hasWrapper = function(key) {
          const k = interpreter.pseudoToNative(key);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.has(k) : false;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'has', interpreter.createNativeFunction(hasWrapper));

        const delWrapper = function(key) {
          const k = interpreter.pseudoToNative(key);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          if (sm) sm.del(k);
        };
        interpreter.setProperty(memObj, 'del', interpreter.createNativeFunction(delWrapper));

        const keysWrapper = function() {
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const arr = sm ? sm.keys() : [];
          return interpreter.nativeToPseudo(arr);
        };
        interpreter.setProperty(memObj, 'keys', interpreter.createNativeFunction(keysWrapper));

        const clearWrapper = function() {
          const sm = self.droneAPI.drone.scene.sharedMemory;
          if (sm) sm.clear();
        };
        interpreter.setProperty(memObj, 'clear', interpreter.createNativeFunction(clearWrapper));

        const incWrapper = function(key, delta) {
          const k = interpreter.pseudoToNative(key);
          const d = delta === undefined ? 1 : interpreter.pseudoToNative(delta);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.inc(k, d) : 0;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'inc', interpreter.createNativeFunction(incWrapper));

        const decWrapper = function(key, delta) {
          const k = interpreter.pseudoToNative(key);
          const d = delta === undefined ? 1 : interpreter.pseudoToNative(delta);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.dec(k, d) : 0;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'dec', interpreter.createNativeFunction(decWrapper));

        const pushWrapper = function(key, item) {
          const k = interpreter.pseudoToNative(key);
          const i = interpreter.pseudoToNative(item);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.push(k, i) : 0;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'push', interpreter.createNativeFunction(pushWrapper));

        const popWrapper = function(key) {
          const k = interpreter.pseudoToNative(key);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.pop(k) : undefined;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'pop', interpreter.createNativeFunction(popWrapper));

        const shiftWrapper = function(key) {
          const k = interpreter.pseudoToNative(key);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.shift(k) : undefined;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'shift', interpreter.createNativeFunction(shiftWrapper));

        const lenWrapper = function(key) {
          const k = interpreter.pseudoToNative(key);
          const sm = self.droneAPI.drone.scene.sharedMemory;
          const res = sm ? sm.len(k) : 0;
          return interpreter.nativeToPseudo(res);
        };
        interpreter.setProperty(memObj, 'len', interpreter.createNativeFunction(lenWrapper));
      });

      // ── 4. Start execution loop ─────────────────────────────────
      this.runInterpreter();
    } catch (error) {
      this.isRunning = false;
      let lineNum = null;
      if (error.loc && typeof error.loc.line === 'number') {
        lineNum = error.loc.line;
      } else if (typeof error.pos === 'number') {
        lineNum = this.getLineNumberFromOffset(code, error.pos);
      }

      const rawMsg = error.message || String(error);
      const linePrefix = lineNum !== null ? `Line ${lineNum}: ` : '';
      const formattedError = `${linePrefix}Error: ${rawMsg}`;

      this.errors.push(formattedError);
      if (this.droneAPI.drone) {
        this.droneAPI.drone.setStatus('error');
      }
      if (this.onError) this.onError(formattedError);
      if (this.onComplete) {
        this.onComplete({ success: false, error: formattedError });
      }
    }
  }

  /**
   * Safely run steps of the interpreter.
   * Yields via setTimeout to keep browser responsive.
   */
  runInterpreter() {
    if (!this.isRunning) return;

    try {
      let stepsThisTurn = 0;
      while (this.isRunning) {
        if (this.interpreter.paused_) {
          // Execution is paused waiting for an async callback (e.g. movement animation).
          // We yield control. The async callback will invoke runInterpreter() again.
          return;
        }

        const hasMore = this.interpreter.step();
        this.stepCount++;

        if (this.stepCount > this.maxSteps) {
          throw new Error(
            `Maximum execution steps exceeded (${this.maxSteps}). ` +
            'Possible infinite loop — please check your code.'
          );
        }

        if (!hasMore) {
          // Execution completed successfully
          this.isRunning = false;
          if (this.onComplete) {
            this.onComplete({ success: true, steps: this.stepCount });
          }
          return;
        }

        // Yield to prevent UI freeze during long synchronous loops
        stepsThisTurn++;
        if (stepsThisTurn > 1000) {
          setTimeout(() => this.runInterpreter(), 0);
          return;
        }
      }
    } catch (error) {
      this.isRunning = false;
      const lineNum = this.getCurrentLineNumber();
      const rawMsg = error.message || String(error);
      const linePrefix = lineNum !== null ? `Line ${lineNum}: ` : '';
      const formattedError = `${linePrefix}Error: ${rawMsg}`;

      this.errors.push(formattedError);
      if (this.droneAPI.drone) {
        this.droneAPI.drone.setStatus('error');
      }
      if (this.onError) this.onError(formattedError);
      if (this.onComplete) {
        this.onComplete({ success: false, error: formattedError });
      }
    }
  }

  /**
   * Run the player's script in a cloned virtual state to calculate rates.
   * @param {string} code
   */
  benchmark(code) {
    const scene = this.droneAPI.drone.scene;
    const grid = this.droneAPI.gridManager;
    const inv = this.droneAPI.inventorySystem;
    const warehouse = this.droneAPI.warehouse;

    // Deep clone tiles
    const clonedTiles = [];
    for (let y = 0; y < grid.rows; y++) {
      const row = [];
      for (let x = 0; x < grid.cols; x++) {
        row.push({ ...grid.tiles[y][x] });
      }
      clonedTiles.push(row);
    }

    // Cloned drone state
    const drone = this.droneAPI.drone;
    let mockTileX = drone.tileX;
    let mockTileY = drone.tileY;
    let mockFacing = drone.facing || 'down';

    // Cloned inventories
    const mockDroneInv = new Map();
    for (const { id, count } of drone.droneInventory.getAll()) {
      mockDroneInv.set(id, count);
    }

    const mockPlayerInv = new Map();
    if (inv) {
      for (const [id, count] of inv.items.entries()) {
        mockPlayerInv.set(id, count);
      }
    }
    let mockPlayerCoins = inv ? inv.getCoins() : 100;

    const mockWarehouseInv = new Map();
    if (warehouse) {
      for (const [id, count] of warehouse.items.entries()) {
        mockWarehouseInv.set(id, count);
      }
    }

    // Cloned machine buffers
    const mockMachineStates = new Map();
    if (scene && scene.machineSystem) {
      for (const [id, m] of scene.machineSystem.machines.entries()) {
        mockMachineStates.set(id, {
          inputBuffer: new Map(m.inputBuffer),
          outputBuffer: new Map(m.outputBuffer)
        });
      }
    }

    let simulatedDurationMs = 0;
    let stepsRun = 0;
    let hasError = false;
    let errorMsg = '';

    const getFront = () => {
      let dx = 0, dy = 0;
      if (mockFacing === 'up') dy = -1;
      else if (mockFacing === 'down') dy = 1;
      else if (mockFacing === 'left') dx = -1;
      else if (mockFacing === 'right') dx = 1;
      return { x: mockTileX + dx, y: mockTileY + dy };
    };

    let interp;
    try {
      interp = new Interpreter(code, (ib, globalObj) => {
        const consoleObj = ib.createObjectProto(ib.OBJECT_PROTO);
        ib.setProperty(globalObj, 'console', consoleObj);
        ib.setProperty(consoleObj, 'log', ib.createNativeFunction(() => {}));

        const droneObj = ib.createObjectProto(ib.OBJECT_PROTO);
        ib.setProperty(globalObj, 'drone', droneObj);

        // Move
        ib.setProperty(droneObj, 'move', ib.createNativeFunction((direction) => {
          const dir = String(direction);
          const deltas = { up: {dx:0,dy:-1}, down: {dx:0,dy:1}, left: {dx:-1,dy:0}, right: {dx:1,dy:0} };
          const d = deltas[dir];
          if (!d) return false;
          const nx = mockTileX + d.dx;
          const ny = mockTileY + d.dy;
          if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) return false;
          if (nx === 0 || nx === grid.cols - 1 || ny === 0 || ny === grid.rows - 1) return false;
          if (nx === 19 && ny >= 0 && ny <= 19 && clonedTiles[ny][nx].isLocked) return false;
          if (ny === 19 && nx >= 0 && nx <= 39 && clonedTiles[ny][nx].isLocked) return false;
          if (nx === 39 && ny >= 0 && ny <= 39 && clonedTiles[ny][nx].isLocked) return false;
          if (ny === 39 && (nx !== 20 || clonedTiles[ny][nx].isLocked)) return false;
          if (clonedTiles[ny][nx].isMachine) return false;

          mockTileX = nx;
          mockTileY = ny;
          mockFacing = dir;
          simulatedDurationMs += (drone.module === 'speed_booster' ? 100 : 200);
          return true;
        }));

        // Till
        ib.setProperty(droneObj, 'till', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          if (tile && !tile.isTilled && !tile.hasPlant && !tile.isMachine && !tile.isOre && !tile.isConveyor) {
            tile.isTilled = true;
          }
          simulatedDurationMs += (drone.module === 'advanced_farming' ? 150 : 300);
        }));

        // Water
        ib.setProperty(droneObj, 'water', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          if (tile && tile.isTilled && !tile.isWatered) {
            tile.isWatered = true;
          }
          simulatedDurationMs += (drone.module === 'advanced_farming' ? 150 : 300);
        }));

        // Plant
        ib.setProperty(droneObj, 'plant', ib.createNativeFunction((seedType) => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          const seedItem = seedType + '_seed';
          let hasSeed = false;
          if ((mockDroneInv.get(seedItem) || 0) >= 1) {
            mockDroneInv.set(seedItem, mockDroneInv.get(seedItem) - 1);
            hasSeed = true;
          } else if ((mockPlayerInv.get(seedItem) || 0) >= 1) {
            mockPlayerInv.set(seedItem, mockPlayerInv.get(seedItem) - 1);
            hasSeed = true;
          }
          if (tile && tile.isTilled && tile.isWatered && !tile.hasPlant && hasSeed) {
            tile.hasPlant = true;
            tile.plantType = seedType;
            tile.growthStage = 0;
            tile.hasFruit = false;
          }
          simulatedDurationMs += (drone.module === 'advanced_farming' ? 150 : 300);
        }));

        // Crop
        ib.setProperty(droneObj, 'crop', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          if (tile && tile.hasPlant && tile.plantType !== 'none') {
            const cropType = tile.plantType;
            const curCount = Array.from(mockDroneInv.values()).reduce((a,b)=>a+b, 0);
            if (curCount < drone.getInventoryCapacity()) {
              mockDroneInv.set(cropType, (mockDroneInv.get(cropType) || 0) + 2);
            }
            tile.hasPlant = false;
            tile.plantType = null;
            tile.isTilled = false;
            tile.isWatered = false;
          }
          simulatedDurationMs += (drone.module === 'advanced_farming' ? 150 : 300);
        }));

        // Harvest
        ib.setProperty(droneObj, 'harvest', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          if (tile && tile.hasPlant && tile.hasFruit) {
            const cropType = tile.plantType;
            const curCount = Array.from(mockDroneInv.values()).reduce((a,b)=>a+b, 0);
            if (curCount < drone.getInventoryCapacity()) {
              mockDroneInv.set(cropType, (mockDroneInv.get(cropType) || 0) + 1);
            }
            tile.hasFruit = false;
          }
          simulatedDurationMs += (drone.module === 'advanced_farming' ? 150 : 300);
        }));

        // Mine
        ib.setProperty(droneObj, 'mine', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          if (tile && (tile.isOre || tile.oreType === 'depleted') && tile.oreType !== 'depleted') {
            tile.oreCurrentDurability--;
            if (tile.oreCurrentDurability <= 0) {
              const type = tile.oreType;
              let drop = type === 'coal' ? 'coal' : type + '_ore';
              mockDroneInv.set(drop, (mockDroneInv.get(drop) || 0) + 1);
              tile.oreType = 'depleted';
              tile.isOre = false;
            }
          }
          simulatedDurationMs += 300;
        }));

        // Deposit one carried item to the empty conveyor directly ahead.
        ib.setProperty(droneObj, 'depositToConveyor', ib.createNativeFunction((itemId) => {
          const item = ib.pseudoToNative(itemId);
          const front = getFront();
          const tile = clonedTiles[front.y]?.[front.x];
          if (tile?.isConveyor && tile.conveyorItem === 'none' && (mockDroneInv.get(item) || 0) > 0) {
            tile.conveyorItem = item;
            mockDroneInv.set(item, mockDroneInv.get(item) - 1);
          }
          simulatedDurationMs += 300;
        }));

        // PushItem
        ib.setProperty(droneObj, 'pushItem', ib.createNativeFunction((direction) => {
          const front = getFront();
          const frontTile = clonedTiles[front.y]?.[front.x];
          if (frontTile && frontTile.isConveyor && frontTile.conveyorItem !== 'none') {
            const item = frontTile.conveyorItem;
            let tdx = 0, tdy = 0;
            if (direction === 'up') tdy = -1;
            else if (direction === 'down') tdy = 1;
            else if (direction === 'left') tdx = -1;
            else if (direction === 'right') tdx = 1;
            const tx = front.x + tdx;
            const ty = front.y + tdy;
            if (warehouse && warehouse.containsTile(tx, ty)) {
              mockWarehouseInv.set(item, (mockWarehouseInv.get(item) || 0) + 1);
              frontTile.conveyorItem = 'none';
            } else {
              const target = clonedTiles[ty]?.[tx];
              if (target && target.isConveyor && target.conveyorItem === 'none') {
                target.conveyorItem = item;
                frontTile.conveyorItem = 'none';
              } else if (target && target.isMachine && target.machineId) {
                const mach = mockMachineStates.get(target.machineId);
                if (mach) {
                  mach.inputBuffer.set(item, (mach.inputBuffer.get(item) || 0) + 1);
                  frontTile.conveyorItem = 'none';
                }
              }
            }
          }
          simulatedDurationMs += 300;
        }));

        // Wait
        ib.setProperty(droneObj, 'wait', ib.createNativeFunction((seconds) => {
          simulatedDurationMs += (seconds * 1000);
        }));

        // CheckFrontItem
        ib.setProperty(droneObj, 'checkFrontItem', ib.createNativeFunction(() => {
          const front = getFront();
          const tile = clonedTiles[front.y]?.[front.x];
          return (tile && tile.isConveyor) ? tile.conveyorItem : 'none';
        }));

        // CheckNode
        ib.setProperty(droneObj, 'checkNode', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return (tile && (tile.isOre || tile.oreType === 'depleted')) ? tile.oreType : 'none';
        }));

        // Explore drops are not seeded into the benchmark simulation, but the
        // API remains available so scripts can be measured without crashing.
        ib.setProperty(droneObj, 'checkGround', ib.createNativeFunction(() => 'none'));
        ib.setProperty(droneObj, 'collect', ib.createNativeFunction(() => {
          simulatedDurationMs += 300;
        }));

        // getBatteryLevel
        ib.setProperty(droneObj, 'getBatteryLevel', ib.createNativeFunction(() => {
          return Math.max(0, 500 - stepsRun);
        }));

        // hasPower
        ib.setProperty(droneObj, 'hasPower', ib.createNativeFunction(() => {
          return (500 - stepsRun) > 0;
        }));

        ib.setProperty(droneObj, 'canCrop', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile && tile.hasPlant && tile.plantType !== 'none';
        }));
        ib.setProperty(droneObj, 'canHarvest', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile && tile.hasPlant && tile.hasFruit;
        }));
        ib.setProperty(droneObj, 'isWatered', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile ? tile.isWatered : false;
        }));
        ib.setProperty(droneObj, 'isTilled', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile ? tile.isTilled : false;
        }));
        ib.setProperty(droneObj, 'hasPlant', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile ? tile.hasPlant : false;
        }));
        ib.setProperty(droneObj, 'getPlantStage', ib.createNativeFunction(() => {
          const tile = clonedTiles[mockTileY]?.[mockTileX];
          return tile?.hasPlant ? tile.growthStage : -1;
        }));
        ib.setProperty(droneObj, 'getPosition', ib.createNativeFunction(() => {
          return ib.nativeToPseudo({ x: mockTileX, y: mockTileY });
        }));
        ib.setProperty(droneObj, 'isInventoryFull', ib.createNativeFunction(() => {
          const curCount = Array.from(mockDroneInv.values()).reduce((a,b)=>a+b, 0);
          return curCount >= drone.getInventoryCapacity();
        }));
        ib.setProperty(droneObj, 'getInventoryCount', ib.createNativeFunction(() => {
          return Array.from(mockDroneInv.values()).reduce((a, b) => a + b, 0);
        }));
        ib.setProperty(droneObj, 'getInventoryCapacity', ib.createNativeFunction(() => drone.getInventoryCapacity()));
        ib.setProperty(droneObj, 'hasDroneItem', ib.createNativeFunction((itemId, qty) => {
          const item = ib.pseudoToNative(itemId);
          const count = Number(ib.pseudoToNative(qty)) || 1;
          return (mockDroneInv.get(item) || 0) >= count;
        }));
        ib.setProperty(droneObj, 'transferToWarehouse', ib.createNativeFunction(() => {
          for (const [id, count] of mockDroneInv.entries()) {
            mockWarehouseInv.set(id, (mockWarehouseInv.get(id) || 0) + count);
          }
          mockDroneInv.clear();
          simulatedDurationMs += 300;
        }));
        ib.setProperty(droneObj, 'transferFromWarehouse', ib.createNativeFunction((itemId) => {
          const item = ib.pseudoToNative(itemId);
          const carrying = Array.from(mockDroneInv.values()).reduce((a, b) => a + b, 0);
          const space = Math.max(0, drone.getInventoryCapacity() - carrying);
          const available = mockWarehouseInv.get(item) || 0;
          const amount = Math.min(space, available);
          if (amount > 0) {
            mockWarehouseInv.set(item, available - amount);
            mockDroneInv.set(item, (mockDroneInv.get(item) || 0) + amount);
          }
          simulatedDurationMs += 300;
        }));
        ib.setProperty(droneObj, 'transferToPlayer', ib.createNativeFunction(() => {
          for (const [id, count] of mockDroneInv.entries()) {
            mockPlayerInv.set(id, (mockPlayerInv.get(id) || 0) + count);
          }
          mockDroneInv.clear();
          simulatedDurationMs += 300;
        }));
        ib.setProperty(droneObj, 'sell', ib.createNativeFunction(() => {
          for (const [id, count] of mockDroneInv.entries()) {
            if (!id.endsWith('_seed') && !id.startsWith('module_')) mockDroneInv.delete(id);
          }
          simulatedDurationMs += 300;
        }));
        ib.setProperty(droneObj, 'depositToMachine', ib.createNativeFunction((machineId, itemId, qty) => {
          const mId = ib.pseudoToNative(machineId);
          const iId = ib.pseudoToNative(itemId);
          const q = ib.pseudoToNative(qty) || 1;
          const mach = mockMachineStates.get(mId);
          const droneHas = mockDroneInv.get(iId) || 0;
          const toDep = Math.min(droneHas, q);
          if (mach && toDep > 0) {
            mach.inputBuffer.set(iId, (mach.inputBuffer.get(iId) || 0) + toDep);
            mockDroneInv.set(iId, droneHas - toDep);
          }
          simulatedDurationMs += 300;
        }));
        ib.setProperty(droneObj, 'retrieveFromMachine', ib.createNativeFunction((machineId) => {
          const mId = ib.pseudoToNative(machineId);
          const mach = mockMachineStates.get(mId);
          if (mach) {
            for (const [id, count] of mach.outputBuffer.entries()) {
              mockDroneInv.set(id, (mockDroneInv.get(id) || 0) + count);
            }
            mach.outputBuffer.clear();
          }
          simulatedDurationMs += 300;
        }));
      });

      while (stepsRun < 500) {
        const hasMore = interp.step();
        stepsRun++;
        if (!hasMore) break;
      }
    } catch (e) {
      hasError = true;
      errorMsg = e.message || String(e);
    }

    if (hasError) {
      return { success: false, error: errorMsg };
    }

    const resourceGains = {};
    if (inv) {
      for (const [id, count] of mockPlayerInv.entries()) {
        const initial = inv.items.get(id) || 0;
        const diff = count - initial;
        if (diff > 0) {
          resourceGains[id] = (resourceGains[id] || 0) + diff;
        }
      }
    }
    if (warehouse) {
      for (const [id, count] of mockWarehouseInv.entries()) {
        const initial = warehouse.items.get(id) || 0;
        const diff = count - initial;
        if (diff > 0) {
          resourceGains[id] = (resourceGains[id] || 0) + diff;
        }
      }
    }
    if (scene && scene.machineSystem) {
      for (const [id, m] of scene.machineSystem.machines.entries()) {
        const mockM = mockMachineStates.get(id);
        if (mockM) {
          for (const [itemId, count] of mockM.outputBuffer.entries()) {
            const initial = m.outputBuffer.get(itemId) || 0;
            const diff = count - initial;
            if (diff > 0) {
              resourceGains[itemId] = (resourceGains[itemId] || 0) + diff;
            }
          }
        }
      }
    }

    if (simulatedDurationMs === 0) {
      simulatedDurationMs = stepsRun * 5;
    }

    const ratesPerMinute = {};
    const durationMin = simulatedDurationMs / 60000;
    for (const [id, count] of Object.entries(resourceGains)) {
      ratesPerMinute[id] = Number((count / durationMin).toFixed(2));
    }

    return {
      success: true,
      rates: ratesPerMinute,
      simulatedDurationMs,
      steps: stepsRun
    };
  }

  /**
   * Immediately halt the current execution (if any).
   */
  stop() {
    this.isRunning = false;
    this.interpreter = null;
    this.droneAPI.clearQueue();
    if (this.droneAPI.drone) {
      this.droneAPI.drone.setStatus('idle');
    }
  }

  /**
   * @returns {string[]} All captured `console.log` messages.
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * @returns {string[]} All captured error messages.
   */
  getErrors() {
    return [...this.errors];
  }
}
