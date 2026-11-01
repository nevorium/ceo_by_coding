/**
 * @fileoverview Hotbar — in-game item bar rendered at the bottom-center of the screen.
 *
 * 8 slots. The active slot is selected with number keys 1–8 or clicking.
 * SPACE or clicking on the map uses the equipped item in the active slot.
 *
 * Items that can be hotbarred:
 *   'watering_can'   → waters the targeted tile
 *   'plow'           → tills the targeted tile
 *   'wheat_seed'     → plants wheat on the targeted tile
 *   'potato_seed'    → plants potato on the targeted tile
 *   'cactus_seed'    → plants cactus on the targeted tile
 *   'apple_tree_seed'→ plants apple_tree on the targeted tile
 *   (other items)    → shows "cannot use here" message
 */

import { HOTBAR_SLOTS } from '../config/constants.js';
import { hotbarLayout } from '../rendering/viewport.js';

/** Maps item ID to action type and plant type (if applicable) */
const ITEM_ACTIONS = {
  watering_can:    { action: 'water',   plantType: null },
  plow:            { action: 'till',    plantType: null },
  pickaxe:         { action: 'mine',    plantType: null },
  wheat_seed:      { action: 'plant',   plantType: 'wheat' },
  potato_seed:     { action: 'plant',   plantType: 'potato' },
  cactus_seed:     { action: 'plant',   plantType: 'cactus' },
  apple_tree_seed: { action: 'plant',   plantType: 'apple_tree' },
};

export default class Hotbar {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../systems/InventorySystem.js').default} inventorySystem
   */
  constructor(scene, inventorySystem) {
    /** @type {Phaser.Scene} */
    this.scene = scene;
    /** @type {import('../systems/InventorySystem.js').default} */
    this.inventorySystem = inventorySystem;

    /** @type {Array<string|null>} Item ID in each slot, or null if empty */
    this.slots = new Array(HOTBAR_SLOTS).fill(null);

    /** @type {Array<number>} Quantity of item in each slot */
    this.slotQuantities = new Array(HOTBAR_SLOTS).fill(0);

    /** @type {number} Currently active slot index (0-based) */
    this.activeSlot = 0;

    this._slotBgs = []; this._slotTexts = []; this._slotCountTexts = []; this._slotKeyTexts = [];
    for (let i=0; i<HOTBAR_SLOTS; i++) {
      const bg=scene.add.rectangle(0,0,44,44,0x22343c).setStrokeStyle(1,0x42535b).setScrollFactor(0).setDepth(101).setInteractive({useHandCursor:true});
      bg.on('pointerdown', pointer => {
        if(scene.isModalOpen) return;
        if(pointer.rightButtonDown()) {
          this.unequipSlot(i);
        } else {
          this.setActiveSlot(i);
          const itemId = this.slots[i];
          if(itemId && this.scene.dragManager) {
            this.scene.dragManager.startFromPhaser(pointer, {
              type: 'item',
              id: itemId,
              count: this.slotQuantities[i],
              source: 'hotbar',
              slotIndex: i,
              onDragStart: () => {
                this._slotTexts[i]?.setAlpha(0.25);
                this._slotCountTexts[i]?.setAlpha(0.25);
              },
              onDragEnd: () => {
                this._slotTexts[i]?.setAlpha(1);
                this._slotCountTexts[i]?.setAlpha(1);
                this.refresh();
              },
              onDropOutside: () => {
                this.unequipSlot(i);
                this.scene.hud?.showMessage?.('Item dikembalikan ke ransel.', 1200);
              }
            });
          }
        }
      });
      this._slotBgs.push(bg);
      this._slotTexts.push(scene.add.image(0,0,'icon_crate').setVisible(false).setScrollFactor(0).setDepth(102));
      const style={fontFamily:'JetBrains Mono, monospace',fontSize:'9px',color:'#edf0d4',resolution:1};
      this._slotCountTexts.push(scene.add.text(0,0,'',style).setOrigin(1,1).setScrollFactor(0).setDepth(103));
      this._slotKeyTexts.push(scene.add.text(0,0,String(i+1),{...style,color:'#93a7a1'}).setScrollFactor(0).setDepth(103));
    }
    this.layout();
    this.setActiveSlot(0);
    this._onResize=()=>this.layout();
    scene.game.events.on('pixel-resize',this._onResize);
    scene.events.once('shutdown',()=> {
      scene.game.events.off('pixel-resize',this._onResize);
      this.destroy();
    });

    // ── DragManager drop target registration ────────────────────
    this._setupDragManagerTarget();

    // ── Keyboard input ──────────────────────────────────────────
    this._setupKeys();

    // ── Legacy HTML Drag and Drop on Canvas Setup ───────────────
    this._setupDOMDropZone();
  }

  /** Setup DragManager target for hotbar slots */
  _setupDragManagerTarget() {
    if (!this.scene.dragManager) return;

    this._unregisterDropTarget = this.scene.dragManager.registerDropTarget({
      id: 'hotbar-slots',
      accepts: (payload) => payload && payload.type === 'item',
      containsPoint: (clientX, clientY) => {
        const canvas = this.scene.sys.game.canvas;
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
          return false;
        }
        const localX = (clientX - rect.left) * (this.scene.scale.width / rect.width);
        const localY = (clientY - rect.top) * (this.scene.scale.height / rect.height);
        const slotIdx = this.getSlotIndexAt(localX, localY);
        return slotIdx !== -1;
      },
      onHover: (isHovered) => {
        if (!isHovered) {
          this.clearHoverHighlights();
        }
      },
      onDrop: (payload, coords) => {
        const canvas = this.scene.sys.game.canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const localX = (coords.x - rect.left) * (this.scene.scale.width / rect.width);
        const localY = (coords.y - rect.top) * (this.scene.scale.height / rect.height);
        const targetIdx = this.getSlotIndexAt(localX, localY);
        if (targetIdx === -1) return;

        if (payload.source === 'hotbar') {
          const sourceIdx = payload.slotIndex;
          if (sourceIdx !== undefined && sourceIdx !== targetIdx) {
            // Swap slots
            [this.slots[sourceIdx], this.slots[targetIdx]] = [this.slots[targetIdx], this.slots[sourceIdx]];
            [this.slotQuantities[sourceIdx], this.slotQuantities[targetIdx]] = [this.slotQuantities[targetIdx], this.slotQuantities[sourceIdx]];
            this.refresh();
          }
        } else {
          // Dragged from backpack or warehouse
          this.moveItemToHotbar(payload.id, targetIdx);
          this.scene.saveSystem?.saveLocal?.();
          this.scene.editorBridge?._renderBackpack?.();
          this.scene.storageUI?.render?.();
        }
      }
    });
  }

  clearHoverHighlights() {
    this._slotBgs.forEach((bg, idx) => {
      const isActive = idx === this.activeSlot;
      bg.setStrokeStyle(1, isActive ? 0x63d8d1 : 0x42535b);
    });
  }

  /* ================================================================
   *  HTML DRAG AND DROP INTEGRATION
   * ================================================================ */

  /** Bind DOM event listeners to the Phaser canvas for dragging items from HTML */
  _setupDOMDropZone() {
    const canvas = this.scene.sys.game.canvas;
    if (!canvas) return;

    this._dragOverHandler = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    this._dropHandler = (e) => {
      e.preventDefault();
      const itemId = e.dataTransfer.getData('text/plain');
      if (!itemId) return;

      // Map client screen coordinate to local Phaser game coordinate
      const rect = canvas.getBoundingClientRect();
      const localX = (e.clientX - rect.left) * (this.scene.scale.width / rect.width);
      const localY = (e.clientY - rect.top) * (this.scene.scale.height / rect.height);

      const slotIdx = this.getSlotIndexAt(localX, localY);
      if (slotIdx !== -1) {
        this.moveItemToHotbar(itemId, slotIdx);
      }
    };

    canvas.addEventListener('dragover', this._dragOverHandler);
    canvas.addEventListener('drop', this._dropHandler);
  }

  /** Calculate slot index (0-7) at the specified local canvas coordinate, or -1 */
  layout() {
    const zoom=this.scene.registry.get('pixelZoom')||1;
    const safeBottom=this.scene.registry.get('pixelViewport')?.safe?.bottom||0;
    this._layout=hotbarLayout(this.scene.scale.width,this.scene.scale.height,zoom,safeBottom);
    const size=this._layout.size;
    this._layout.positions.forEach((p,i)=>{
      const cx=p.x+size/2,cy=p.y+size/2;
      this._slotBgs[i].setPosition(cx,cy).setSize(size,size);
      this._slotTexts[i].setPosition(cx,cy).setDisplaySize(zoom===2?16:32,zoom===2?16:32);
      this._slotCountTexts[i].setPosition(p.x+size-2,p.y+size-1).setFontSize(zoom===2?6:10);
      this._slotKeyTexts[i].setPosition(p.x+2,p.y+1).setFontSize(zoom===2?5:8);
    });
  }

  getSlotIndexAt(x,y) {
    return this._layout.positions.findIndex(p=>x>=p.x&&x<p.x+this._layout.size&&y>=p.y&&y<p.y+this._layout.size);
  }

  /* ================================================================
   *  PUBLIC API
   * ================================================================ */

  /**
   * Directly equips an item into the hotbar, with state management.
   * Pulls the item stack out of player inventory (making it 0 there).
   * Returns any pre-existing slot item back to player inventory.
   * 
   * @param {string} itemId
   * @param {number} slotIdx
   */
  moveItemToHotbar(itemId, slotIdx) {
    if (slotIdx < 0 || slotIdx >= HOTBAR_SLOTS) return;

    // Get current inventory quantity of the item
    let qty = this.inventorySystem.getItemCount(itemId);

    // Tools do not have count values, but verify the player possesses them
    const isTool = (itemId === 'plow' || itemId === 'watering_can' || itemId === 'pickaxe');
    if (isTool) {
      if (!this.inventorySystem.hasItem(itemId, 1)) return;
      qty = 1;
    }

    if (qty <= 0) return;

    // If same item is already in that slot: merge quantities (for non-tools)
    const existingId = this.slots[slotIdx];
    const existingQty = this.slotQuantities[slotIdx];

    if (existingId === itemId) {
      if (!isTool) {
        this.slotQuantities[slotIdx] += qty;
        this.inventorySystem.removeItem(itemId, qty); // sets to 0 in inventory
        this._renderSlot(slotIdx);
      }
      return;
    }

    // Return any existing slot item back to general inventory
    if (existingId) {
      const isExistingTool = (existingId === 'plow' || existingId === 'watering_can' || existingId === 'pickaxe');
      this.inventorySystem.addItem(existingId, isExistingTool ? 1 : existingQty);
    }

    // Assign new item to slot
    this.slots[slotIdx] = itemId;
    this.slotQuantities[slotIdx] = isTool ? 1 : qty;

    // Remove item stack entirely from general backpack inventory
    this.inventorySystem.removeItem(itemId, qty);

    this._renderSlot(slotIdx);
  }

  /**
   * Unequips the item in a hotbar slot and returns it to player inventory.
   * @param {number} slotIdx
   */
  unequipSlot(slotIdx) {
    if (slotIdx < 0 || slotIdx >= HOTBAR_SLOTS) return;

    const itemId = this.slots[slotIdx];
    if (!itemId) return;

    const qty = this.slotQuantities[slotIdx];
    const isTool = (itemId === 'plow' || itemId === 'watering_can' || itemId === 'pickaxe');

    // Return item/quantity back to the backpack inventory
    this.inventorySystem.addItem(itemId, isTool ? 1 : qty);

    // Reset slot states
    this.slots[slotIdx] = null;
    this.slotQuantities[slotIdx] = 0;

    this._renderSlot(slotIdx);
  }

  /**
   * Deducts quantity from a slot. Clears slot if quantity reaches 0.
   * @param {number} slotIdx
   * @param {number} qty
   */
  useItem(slotIdx, qty = 1) {
    if (slotIdx < 0 || slotIdx >= HOTBAR_SLOTS) return;

    const itemId = this.slots[slotIdx];
    if (!itemId) return;

    // Tools don't degrade or lose quantity
    if (itemId === 'plow' || itemId === 'watering_can' || itemId === 'pickaxe') return;

    this.slotQuantities[slotIdx] -= qty;
    if (this.slotQuantities[slotIdx] <= 0) {
      this.slots[slotIdx] = null;
      this.slotQuantities[slotIdx] = 0;
    }

    this._renderSlot(slotIdx);
  }

  /**
   * Check if a Phaser GameObject is a component of the Hotbar
   * @param {Phaser.GameObjects.GameObject} go
   * @returns {boolean}
   */
  isHotbarObject(go) {
    return (
      this._slotBgs.includes(go) ||
      this._slotTexts.includes(go) ||
      this._slotCountTexts.includes(go) ||
      this._slotKeyTexts.includes(go)
    );
  }

  /**
   * Set the item in a slot. (Simple override for backward compatibility if needed)
   * @param {number} slotIdx - 0-based index
   * @param {string|null} itemId
   */
  setSlot(slotIdx, itemId) {
    if (slotIdx < 0 || slotIdx >= HOTBAR_SLOTS) return;
    this.slots[slotIdx] = itemId;
    this.slotQuantities[slotIdx] = itemId ? 1 : 0;
    this._renderSlot(slotIdx);
  }

  /**
   * Clear a slot.
   * @param {number} slotIdx
   */
  clearSlot(slotIdx) {
    this.slots[slotIdx] = null;
    this.slotQuantities[slotIdx] = 0;
    this._renderSlot(slotIdx);
  }

  /**
   * Get the item ID in the active slot, or null if empty.
   * @returns {string|null}
   */
  getActiveItem() {
    return this.slots[this.activeSlot] || null;
  }

  /** Refresh after restoring saved slots and quantities. */
  refresh() {
    for (let i = 0; i < HOTBAR_SLOTS; i++) this._renderSlot(i);
  }

  /**
   * Set active slot by index.
   * @param {number} idx
   */
  setActiveSlot(idx) {
    if (idx < 0 || idx >= HOTBAR_SLOTS) return;
    // Deactivate old
    this._slotBgs[this.activeSlot].setStrokeStyle(1, 0x42535b, 1);
    this.activeSlot = idx;
    // Activate new
    this._slotBgs[this.activeSlot].setStrokeStyle(2, 0x63d8d1, 1);
  }

  /**
   * Get the action associated with the item in the active slot.
   * @returns {{ action: string, plantType: string|null } | null}
   */
  getActiveItemAction() {
    const itemId = this.getActiveItem();
    if (!itemId) return null;
    return ITEM_ACTIONS[itemId] || null;
  }

  /**
   * Check if the active item is a seed and return the plant type.
   * @returns {string|null}
   */
  getActivePlantType() {
    const action = this.getActiveItemAction();
    if (!action || action.action !== 'plant') return null;
    return action.plantType;
  }

  /* ================================================================
   *  PRIVATE HELPERS
   * ================================================================ */

  _setupKeys() {
    const scene = this.scene;
    // Number keys 1–8 select slots
    const keyMap = {
      ONE: 0, TWO: 1, THREE: 2, FOUR: 3,
      FIVE: 4, SIX: 5, SEVEN: 6, EIGHT: 7,
    };

    for (const [keyName, slotIdx] of Object.entries(keyMap)) {
      scene.input.keyboard.on(`keydown-${keyName}`, () => {
        // Only respond if editor is NOT focused
        if (this._isDOMInputFocused()) return;
        this.setActiveSlot(slotIdx);
      });
    }
  }

  _isDOMInputFocused() {
    if (this.scene.isModalOpen) return true;
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    const monacoContainer = document.getElementById('monaco-container');
    if (monacoContainer && monacoContainer.contains(active)) return true;
    return false;
  }

  _renderSlot(idx) {
    const itemId = this.slots[idx];
    this._slotTexts[idx].setVisible(Boolean(itemId));
    if (itemId) this._slotTexts[idx].setTexture(this.scene.textures.exists(`icon_${itemId}`) ? `icon_${itemId}` : 'icon_crate');
    this._updateCountBadge(idx);
  }

  _updateCountBadges() {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      this._updateCountBadge(i);
    }
  }

  _updateCountBadge(idx) {
    const itemId = this.slots[idx];
    if (!itemId) {
      this._slotCountTexts[idx].setText('');
      return;
    }
    // Tools (watering can, plow, pickaxe) don't have counts
    if (itemId === 'watering_can' || itemId === 'plow' || itemId === 'pickaxe') {
      this._slotCountTexts[idx].setText('');
      return;
    }
    const count = this.slotQuantities[idx];
    this._slotCountTexts[idx].setText(count > 0 ? String(count) : '');
  }

  /** Cleanup event listeners when object is destroyed */
  destroy() {
    this._unregisterDropTarget?.();
    const canvas = this.scene.sys.game.canvas;
    if (canvas) {
      canvas.removeEventListener('dragover', this._dragOverHandler);
      canvas.removeEventListener('drop', this._dropHandler);
    }
  }
}

