import { pixelIcon } from '../rendering/PixelAssets.js';
import { isWarehouseStorable } from '../data/buildings.js';
import { getItem } from '../data/items.js';

export const SORT_MODES = ['category', 'name', 'quantity'];
export const SORT_LABELS = {
  category: 'Kategori',
  name: 'Nama',
  quantity: 'Jumlah',
};

const title = id => id.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

/**
 * StorageUI — Right-side dock for side-by-side Warehouse & Backpack management.
 * Docks in place of the Code Editor panel for two-way drag & drop, menu sorting,
 * and compacting.
 */
export default class StorageUI {
  constructor(scene) {
    this.scene = scene;
    this.root = document.getElementById('storage-panel');
    this.editorPanel = document.getElementById('editor-panel');
    this.resizeHandle = document.getElementById('editor-resize-handle');
    this.sort = { backpack: 'category', warehouse: 'category' };
    this.selected = null;
    this._isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

    this._onInventory = () => this.render();
    scene.inventorySystem?.events?.on('inventory-changed', this._onInventory);
    scene.warehouse?.events?.on('changed', this._onInventory);

    this._setupGlobalKeys();
    this._bind();
    this._setupDragTargets();
    scene.events?.once('shutdown', () => this.destroy());
  }

  _setupGlobalKeys() {
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    if (this._isBrowser) {
      document.addEventListener('keydown', this._onKeyDown, true);
    }
  }

  _setupDragTargets() {
    if (!this.scene.dragManager) return;

    this._unregisterTargets = [
      this.scene.dragManager.registerDropTarget({
        id: 'storage-dock-backpack',
        accepts: (p) => p && p.type === 'item',
        containsPoint: (x, y) => {
          const container = this.root?.querySelector('[data-storage-container="backpack"]');
          if (!container || !this.isOpen()) return false;
          const rect = container.getBoundingClientRect();
          return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        },
        onHover: (active, p) => {
          const container = this.root?.querySelector('[data-storage-container="backpack"]');
          container?.classList.toggle('drop-target', active);
        },
        onDrop: (payload, coords) => {
          let targetSlotIndex = null;
          if (coords && this._isBrowser) {
            const el = document.elementFromPoint(coords.x, coords.y);
            const slotEl = el?.closest('[data-storage-container="backpack"] .storage-slot');
            if (slotEl && slotEl.dataset.slotIndex !== undefined) {
              targetSlotIndex = Number(slotEl.dataset.slotIndex);
            }
          }
          this._handleBackpackDrop(payload, targetSlotIndex);
        }
      }),
      this.scene.dragManager.registerDropTarget({
        id: 'storage-dock-warehouse',
        accepts: (p) => p && p.type === 'item',
        containsPoint: (x, y) => {
          const container = this.root?.querySelector('[data-storage-container="warehouse"]');
          if (!container || !this.isOpen()) return false;
          const rect = container.getBoundingClientRect();
          return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        },
        onHover: (active, p) => {
          const container = this.root?.querySelector('[data-storage-container="warehouse"]');
          container?.classList.toggle('drop-target', active);
        },
        onDrop: (payload, coords) => {
          let targetSlotIndex = null;
          if (coords && this._isBrowser) {
            const el = document.elementFromPoint(coords.x, coords.y);
            const slotEl = el?.closest('[data-storage-container="warehouse"] .storage-slot');
            if (slotEl && slotEl.dataset.slotIndex !== undefined) {
              targetSlotIndex = Number(slotEl.dataset.slotIndex);
            }
          }
          this._handleWarehouseDrop(payload, targetSlotIndex);
        }
      })
    ];
  }

  _handleBackpackDrop(payload, targetSlotIndex) {
    const inv = this.scene.inventorySystem;
    const wh = this.scene.warehouse;
    if (!inv) return;

    if (payload.source === 'hotbar') {
      this.scene.hotbar?.unequipSlot?.(payload.slotIndex);
      if (targetSlotIndex !== null) {
        const destSlot = inv.getSlot(targetSlotIndex);
        if (!destSlot) {
          inv.setSlot(targetSlotIndex, { id: payload.id, count: payload.count });
        } else {
          inv.addItem(payload.id, payload.count);
        }
      } else {
        inv.addItem(payload.id, payload.count);
      }
      this.scene.saveSystem?.saveLocal?.();
      this.render();
      return;
    }

    if (payload.source === 'backpack') {
      // Intra-backpack reordering / slot swapping
      const fromIdx = payload.slotIndex;
      if (fromIdx !== undefined && targetSlotIndex !== null && fromIdx !== targetSlotIndex) {
        inv.swapSlots(fromIdx, targetSlotIndex);
        this.scene.saveSystem?.saveLocal?.();
        this.render();
      }
      return;
    }

    if (payload.source === 'warehouse' && wh) {
      const fromIdx = payload.slotIndex;
      const count = payload.count || 1;

      if (targetSlotIndex !== null && fromIdx !== undefined) {
        const destSlot = inv.getSlot(targetSlotIndex);
        if (!destSlot) {
          // Empty backpack slot: move directly
          inv.setSlot(targetSlotIndex, { id: payload.id, count });
          wh.removeItemFromSlot(fromIdx, count);
        } else if (destSlot.id === payload.id) {
          // Same item: merge up to stackMax
          const stackMax = inv.container.getStackMax(payload.id);
          const space = stackMax - destSlot.count;
          const toMove = Math.min(space, count);
          if (toMove > 0) {
            destSlot.count += toMove;
            inv.setSlot(targetSlotIndex, destSlot);
            wh.removeItemFromSlot(fromIdx, toMove);
          }
        } else {
          // Different item: swap if dest is warehouse storable
          const fromSlot = wh.getSlot(fromIdx);
          if (fromSlot && isWarehouseStorable(destSlot.id) && count === fromSlot.count) {
            wh.setSlot(fromIdx, destSlot);
            inv.setSlot(targetSlotIndex, fromSlot);
          } else {
            // Otherwise fallback to adding to first available slot
            const { added } = inv.container.addItem(payload.id, count);
            if (added > 0) wh.removeItemFromSlot(fromIdx, added);
          }
        }
      } else {
        // Container-level drop
        const { added } = inv.container.addItem(payload.id, count);
        if (added > 0) {
          if (fromIdx !== undefined) wh.removeItemFromSlot(fromIdx, added);
          else wh.withdraw(payload.id, added);
        }
      }

      this.scene.saveSystem?.saveLocal?.();
      this.render();
    }
  }

  _handleWarehouseDrop(payload, targetSlotIndex) {
    const inv = this.scene.inventorySystem;
    const wh = this.scene.warehouse;
    if (!wh) return;

    if (!isWarehouseStorable(payload.id)) {
      this.scene.hud?.showMessage?.('Peralatan dan kunci harus tetap dibawa.', 2400);
      return false;
    }

    if (payload.source === 'hotbar') {
      wh.deposit(payload.id, payload.count || 1);
      this.scene.hotbar?.unequipSlot?.(payload.slotIndex);
      this.scene.saveSystem?.saveLocal?.();
      this.render();
      return;
    }

    if (payload.source === 'warehouse') {
      // Intra-warehouse reordering
      const fromIdx = payload.slotIndex;
      if (fromIdx !== undefined && targetSlotIndex !== null && fromIdx !== targetSlotIndex) {
        wh.swapSlots(fromIdx, targetSlotIndex);
        this.scene.saveSystem?.saveLocal?.();
        this.render();
      }
      return;
    }

    if (payload.source === 'backpack' && inv) {
      const fromIdx = payload.slotIndex;
      const count = payload.count || 1;

      if (targetSlotIndex !== null && fromIdx !== undefined) {
        const destSlot = wh.getSlot(targetSlotIndex);
        if (!destSlot) {
          // Empty warehouse slot: move directly
          wh.setSlot(targetSlotIndex, { id: payload.id, count });
          inv.removeItemFromSlot(fromIdx, count);
        } else if (destSlot.id === payload.id) {
          // Same item: merge up to stackMax
          const stackMax = wh.container.getStackMax(payload.id);
          const space = stackMax - destSlot.count;
          const toMove = Math.min(space, count);
          if (toMove > 0) {
            destSlot.count += toMove;
            wh.setSlot(targetSlotIndex, destSlot);
            inv.removeItemFromSlot(fromIdx, toMove);
          }
        } else {
          // Different item: swap if backpack slot full stack
          const fromSlot = inv.getSlot(fromIdx);
          if (fromSlot && count === fromSlot.count) {
            inv.setSlot(fromIdx, destSlot);
            wh.setSlot(targetSlotIndex, fromSlot);
          } else {
            const { added } = wh.container.addItem(payload.id, count);
            if (added > 0) inv.removeItemFromSlot(fromIdx, added);
          }
        }
      } else {
        // Container-level drop
        const { added } = wh.container.addItem(payload.id, count);
        if (added > 0) {
          if (fromIdx !== undefined) inv.removeItemFromSlot(fromIdx, added);
          else inv.removeItem(payload.id, added);
        }
      }

      this.scene.saveSystem?.saveLocal?.();
      this.render();
    }
  }

  _bind() {
    this.root?.addEventListener('click', event => {
      const close = event.target.closest('[data-storage-close]');
      if (close) return this.close();

      const sort = event.target.closest('[data-storage-sort]');
      if (sort) {
        const target = sort.dataset.storageSort;
        this.cycleSort(target);
        return;
      }

      const compact = event.target.closest('[data-storage-compact]');
      if (compact) {
        const target = compact.dataset.storageCompact;
        this.compactContainer(target);
        return;
      }

      const move = event.target.closest('[data-storage-move]');
      if (move) return this.moveSelected(move.dataset.storageMove);

      const split = event.target.closest('[data-storage-split]');
      if (split) return this.splitSelected();

      const depositAll = event.target.closest('[data-storage-deposit-all]');
      if (depositAll) return this.depositAll();

      const withdrawAll = event.target.closest('[data-storage-withdraw-all]');
      if (withdrawAll) return this.withdrawAll();

      // Slot selection or shift-click
      const slot = event.target.closest('.storage-slot');
      if (slot && event.shiftKey) {
        const source = slot.dataset.storageSource;
        const slotIdx = Number(slot.dataset.slotIndex);
        const destination = source === 'backpack' ? 'warehouse' : 'backpack';
        this.quickTransferSlot(source, destination, slotIdx);
      }
    });

    this.root?.addEventListener('pointerdown', event => {
      const slot = event.target.closest('.storage-slot');
      if (slot && slot.dataset.itemId) {
        this._startPointer(event, slot);
      }
    });

    this.root?.addEventListener('keydown', event => {
      const slot = event.target.closest('.storage-slot');
      if (!slot) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const source = slot.dataset.storageSource;
        const slotIdx = Number(slot.dataset.slotIndex);
        const destination = source === 'backpack' ? 'warehouse' : 'backpack';
        if (slot.dataset.itemId) {
          this.quickTransferSlot(source, destination, slotIdx);
        }
      }
    });
  }

  open() {
    if (!this.root) return;
    this.closeModalIfNeeded();
    this.root.hidden = false;
    if (this.editorPanel) this.editorPanel.hidden = true;
    if (this.resizeHandle) this.resizeHandle.hidden = true;
    if (this._isBrowser) {
      document.body.classList.add('storage-open');
    }
    this.render();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.root.querySelector('[data-storage-close]')?.focus({ preventScroll: true }));
    } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => this.root.querySelector('[data-storage-close]')?.focus({ preventScroll: true }));
    }
  }

  closeModalIfNeeded() {
    if (this.scene.panelManager?.current) this.scene.panelManager.close(false);
  }

  close() {
    this.cancelDrag();
    if (!this.root) return;
    this.root.hidden = true;
    if (this.editorPanel) this.editorPanel.hidden = false;
    if (this.resizeHandle) this.resizeHandle.hidden = false;
    if (this._isBrowser) {
      document.body.classList.remove('storage-open');
    }
    this.selected = null;
    this.scene.editorBridge?.editor?.layout();
    if (this._isBrowser) {
      document.getElementById('btn-toggle-editor')?.focus({ preventScroll: true });
    }
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  toggle() {
    this.isOpen() ? this.close() : this.open();
  }

  cycleSort(target) {
    const current = this.sort[target] || 'category';
    const nextIdx = (SORT_MODES.indexOf(current) + 1) % SORT_MODES.length;
    const nextSort = SORT_MODES[nextIdx];
    this.sortContainer(target, nextSort);
  }

  sortContainer(target, criterion) {
    this.sort[target] = criterion;
    if (target === 'backpack') {
      this.scene.inventorySystem?.sort?.(criterion);
    } else {
      this.scene.warehouse?.sort?.(criterion);
    }
    this.scene.saveSystem?.saveLocal?.();
    this.render();
    const label = SORT_LABELS[criterion] || criterion;
    this.scene.hud?.showMessage?.(`${target === 'backpack' ? 'Tas' : 'Warehouse'} diurutkan berdasarkan ${label}.`, 1500);
  }

  compactContainer(target) {
    if (target === 'backpack') {
      this.scene.inventorySystem?.compact?.();
    } else {
      this.scene.warehouse?.compact?.();
    }
    this.scene.saveSystem?.saveLocal?.();
    this.render();
    this.scene.hud?.showMessage?.(`${target === 'backpack' ? 'Tas' : 'Warehouse'} dikerapkan.`, 1500);
  }

  depositAll() {
    const inv = this.scene.inventorySystem;
    const wh = this.scene.warehouse;
    if (!inv || !wh) return;

    const slots = inv.getSlots();
    let countTransferred = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot && slot.count > 0 && isWarehouseStorable(slot.id)) {
        const { added } = wh.container.addItem(slot.id, slot.count);
        if (added > 0) {
          inv.removeItemFromSlot(i, added);
          countTransferred += added;
        }
      }
    }

    if (countTransferred > 0) {
      this.scene.hud?.showMessage?.(`${countTransferred} item dipindahkan ke warehouse.`, 2000);
      this.scene.saveSystem?.saveLocal?.();
      this.render();
    } else {
      this.scene.hud?.showMessage?.('Tidak ada hasil panen/material yang dapat disimpan.', 2000);
    }
  }

  withdrawAll() {
    const inv = this.scene.inventorySystem;
    const wh = this.scene.warehouse;
    if (!inv || !wh) return;

    const slots = wh.getSlots();
    let countTransferred = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot && slot.count > 0) {
        const { added } = inv.container.addItem(slot.id, slot.count);
        if (added > 0) {
          wh.removeItemFromSlot(i, added);
          countTransferred += added;
        }
      }
    }

    if (countTransferred > 0) {
      this.scene.hud?.showMessage?.(`${countTransferred} item diambil ke tas.`, 2000);
      this.scene.saveSystem?.saveLocal?.();
      this.render();
    } else {
      this.scene.hud?.showMessage?.('Tas penuh atau warehouse kosong.', 2000);
    }
  }

  quickTransferSlot(source, destination, slotIndex, amount = null) {
    const fromSystem = source === 'warehouse' ? this.scene.warehouse : this.scene.inventorySystem;
    const toSystem = destination === 'warehouse' ? this.scene.warehouse : this.scene.inventorySystem;
    if (!fromSystem || !toSystem) return false;

    const slot = fromSystem.getSlot(slotIndex);
    if (!slot || slot.count <= 0) return false;

    const id = slot.id;
    const countToTransfer = amount !== null ? Math.min(amount, slot.count) : slot.count;

    if (destination === 'warehouse' && !isWarehouseStorable(id)) {
      this.scene.hud?.showMessage?.('Peralatan dan kunci harus tetap dibawa.', 2400);
      return false;
    }

    if (!toSystem.container.hasSpaceFor(id, countToTransfer)) {
      this.scene.hud?.showMessage?.(`${destination === 'warehouse' ? 'Warehouse' : 'Tas'} penuh!`, 2000);
      return false;
    }

    const { added } = toSystem.container.addItem(id, countToTransfer);
    if (added > 0) {
      fromSystem.removeItemFromSlot(slotIndex, added);
      this.scene.saveSystem?.saveLocal?.();
      this.render();
      return true;
    }
    return false;
  }

  moveSelected(destination) {
    if (!this.selected || destination === this.selected.source) return;
    this.quickTransferSlot(this.selected.source, destination, this.selected.slotIndex, this.selected.count);
  }

  splitSelected() {
    if (!this.selected) return;
    const half = Math.max(1, Math.floor(this.selected.count / 2));
    const val = typeof window !== 'undefined' ? window.prompt(`Jumlah ${title(this.selected.id)} yang dipindahkan:`, half) : half;
    const requested = Number(val);
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > this.selected.count) return;

    const destination = this.selected.source === 'backpack' ? 'warehouse' : 'backpack';
    this.quickTransferSlot(this.selected.source, destination, this.selected.slotIndex, requested);
  }

  _renderContainer(source) {
    const container = this.root?.querySelector(`[data-storage-container="${source}"]`);
    if (!container) return;

    const isBackpack = source === 'backpack';
    const system = isBackpack ? this.scene.inventorySystem : this.scene.warehouse;
    if (!system) return;

    const slots = system.getSlots();
    const capacity = isBackpack ? system.getSlotCapacity() : system.container.capacity;
    const filledCount = slots.filter(s => s && s.count > 0).length;

    // Update capacity badge
    const badge = container.querySelector('[data-storage-capacity]');
    if (badge) badge.textContent = `(${filledCount}/${capacity})`;

    // Update sort button label
    const sortButton = container.querySelector('[data-storage-sort]');
    if (sortButton) {
      const mode = this.sort[source] || 'category';
      sortButton.textContent = `Sort: ${SORT_LABELS[mode] || 'Kategori'}`;
    }

    // Render slots grid
    const grid = container.querySelector('.storage-grid');
    if (!grid) return;

    let html = '';
    for (let i = 0; i < capacity; i++) {
      const slot = slots[i];
      if (slot && slot.count > 0) {
        const meta = getItem(slot.id);
        const name = meta?.name || title(slot.id);
        const stackMax = isBackpack ? (meta?.stackMax || 99) : (meta?.stackMaxWarehouse || 999);
        const isSelected = this.selected?.source === source && this.selected?.slotIndex === i;
        const allowed = source !== 'backpack' || isWarehouseStorable(slot.id);

        html += `<button class="storage-slot ${isSelected ? 'selected' : ''}" data-storage-source="${source}" data-slot-index="${i}" data-item-id="${slot.id}" data-item-count="${slot.count}" aria-label="${name}, ${slot.count}" title="${name} (${meta?.category || ''}) ×${slot.count}/${stackMax}${allowed ? '' : ' — tidak dapat disimpan di gudang'}">${pixelIcon(slot.id, 'inventory-slot-emoji')}<span>${slot.count}</span></button>`;
      } else {
        html += `<button class="storage-slot empty" data-storage-source="${source}" data-slot-index="${i}" aria-label="Slot kosong ${i + 1}" title="Slot kosong ${i + 1}"></button>`;
      }
    }

    grid.innerHTML = html;
  }

  render() {
    if (!this.isOpen()) return;

    this._renderContainer('backpack');
    this._renderContainer('warehouse');

    const info = this.root?.querySelector('[data-storage-selection]');
    if (info) {
      if (this.selected) {
        const meta = getItem(this.selected.id);
        const name = meta?.name || title(this.selected.id);
        info.textContent = `${name} ×${this.selected.count} dipilih (Slot ${this.selected.slotIndex + 1}). Shift+Klik untuk transfer cepat.`;
      } else {
        info.textContent = 'Tarik stack antar slot untuk menata/memindahkan. Shift+Tarik = 1 item. Shift+Klik = transfer cepat.';
      }
    }
  }

  _startPointer(event, slot) {
    if (event.button !== undefined && event.button !== 0) return;
    const source = slot.dataset.storageSource;
    const slotIndex = Number(slot.dataset.slotIndex);
    const id = slot.dataset.itemId;
    if (!id) return;

    const count = Number(slot.dataset.itemCount) || 1;
    const amount = event.shiftKey ? 1 : count;

    this.selected = { source, slotIndex, id, count };

    if (this.scene.dragManager) {
      this.scene.dragManager.startDrag(event, {
        type: 'item',
        id,
        count: amount,
        source,
        slotIndex,
        element: slot,
        onDragStart: () => {
          slot.classList.add('dragging');
        },
        onDragEnd: () => {
          slot.classList.remove('dragging');
          this.root?.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target'));
        },
        onClick: () => {
          if (event.shiftKey) {
            const destination = source === 'backpack' ? 'warehouse' : 'backpack';
            this.quickTransferSlot(source, destination, slotIndex, amount);
          } else {
            this.selected = { source, slotIndex, id, count };
            this.render();
          }
        },
        onDropSuccess: () => {
          this.render();
        }
      });
      return;
    }

    // Fallback if DragManager is unavailable
    this.drag = { pointerId: event.pointerId, slot, source, slotIndex, id, count, startX: event.clientX, startY: event.clientY, moved: false, amount };
    slot.setPointerCapture?.(event.pointerId);
    slot.addEventListener('pointermove', this._boundMove ||= e => this._movePointer(e));
    slot.addEventListener('pointerup', this._boundUp ||= e => this._finishPointer(e));
    slot.addEventListener('pointercancel', this._boundCancel ||= () => this.cancelDrag());
  }

  _movePointer(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const delta = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
    if (!this.drag.moved && delta < 6) return;
    if (!this.drag.moved) this._beginDragGhost();
    this.drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
    this.root?.querySelectorAll('[data-storage-container]').forEach(target => {
      target.classList.toggle('drop-target', target.contains(document.elementFromPoint(event.clientX, event.clientY)) && target.dataset.storageContainer !== this.drag.source);
    });
  }

  _beginDragGhost() {
    this.drag.moved = true;
    this.drag.slot.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'inventory-drag-ghost';
    ghost.innerHTML = `${pixelIcon(this.drag.id, 'inventory-slot-emoji')}<strong>${this.drag.amount}</strong>`;
    document.body.appendChild(ghost);
    this.drag.ghost = ghost;
    document.body.classList.add('storage-dragging');
  }

  _finishPointer(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-storage-container]')?.dataset.storageContainer;
    if (drag.moved && destination && destination !== drag.source) {
      this.quickTransferSlot(drag.source, destination, drag.slotIndex, drag.amount);
    } else if (!drag.moved) {
      this.selected = { source: drag.source, slotIndex: drag.slotIndex, id: drag.id, count: drag.count };
      this.render();
    }
    this.cancelDrag();
  }

  cancelDrag() {
    this.scene.dragManager?.cancelDrag();
    if (!this.drag) return;
    this.drag.slot?.classList.remove('dragging');
    this.drag.ghost?.remove();
    this.root?.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target'));
    if (this._isBrowser) {
      document.body.classList.remove('storage-dragging');
    }
    this.drag = null;
  }

  destroy() {
    if (this._isBrowser && this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown, true);
    }
    this._unregisterTargets?.forEach(u => u?.());
    this.cancelDrag();
    this.scene.inventorySystem?.events?.off('inventory-changed', this._onInventory);
    this.scene.warehouse?.events?.off('changed', this._onInventory);
  }
}
