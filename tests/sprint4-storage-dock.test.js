import test from 'node:test';
import assert from 'node:assert/strict';
import StorageUI, { SORT_MODES, SORT_LABELS } from '../src/ui/StorageUI.js';
import InventorySystem from '../src/systems/InventorySystem.js';
import SlotContainer from '../src/systems/SlotContainer.js';
import DragManager from '../src/systems/DragManager.js';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';

// Setup mock DOM elements for StorageUI
function setupMockDOM() {
  const elements = new Map();

  function createElement(tag, id = null) {
    const el = {
      tagName: tag.toUpperCase(),
      id: id || '',
      hidden: true,
      _className: '',
      get className() { return this._className; },
      set className(val) {
        this._className = val || '';
        this.classList._classes = new Set(this._className.split(/\s+/).filter(Boolean));
      },
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); el._className = [...this._classes].join(' '); },
        remove(c) { this._classes.delete(c); el._className = [...this._classes].join(' '); },
        toggle(c, force) {
          if (force !== undefined) {
            force ? this.add(c) : this.remove(c);
          } else {
            this.contains(c) ? this.remove(c) : this.add(c);
          }
        },
        contains(c) { return this._classes.has(c); }
      },
      attributes: new Map(),
      dataset: {},
      innerHTML: '',
      textContent: '',
      children: [],
      setAttribute(k, v) { this.attributes.set(k, v); },
      getAttribute(k) { return this.attributes.get(k); },
      hasAttribute(k) { return this.attributes.has(k); },
      removeAttribute(k) { this.attributes.delete(k); },
      querySelector(selector) {
        if (selector === '[data-storage-close]') return this._find(e => e.hasAttribute('data-storage-close'));
        if (selector === '[data-storage-container="backpack"]') return this._find(e => e.dataset.storageContainer === 'backpack');
        if (selector === '[data-storage-container="warehouse"]') return this._find(e => e.dataset.storageContainer === 'warehouse');
        if (selector === '[data-storage-capacity]') return this._find(e => 'storageCapacity' in e.dataset);
        if (selector === '[data-storage-sort]') return this._find(e => 'storageSort' in e.dataset);
        if (selector === '[data-storage-compact]') return this._find(e => 'storageCompact' in e.dataset);
        if (selector === '[data-storage-selection]') return this._find(e => e.hasAttribute('data-storage-selection'));
        if (selector === '.storage-grid') return this._find(e => e.classList.contains('storage-grid'));
        return null;
      },
      querySelectorAll(selector) {
        const results = [];
        if (selector === '[data-storage-container]') {
          this._findAll(e => 'storageContainer' in e.dataset, results);
        } else if (selector === '.drop-target') {
          this._findAll(e => e.classList.contains('drop-target'), results);
        } else if (selector === '.storage-slot') {
          this._findAll(e => e.classList.contains('storage-slot'), results);
        }
        return results;
      },
      _find(predicate) {
        if (predicate(this)) return this;
        for (const child of this.children) {
          const res = child._find(predicate);
          if (res) return res;
        }
        return null;
      },
      _findAll(predicate, results) {
        if (predicate(this)) results.push(this);
        for (const child of this.children) {
          child._findAll(predicate, results);
        }
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
      focus() {},
      getBoundingClientRect() {
        return { left: 100, right: 300, top: 50, bottom: 400, width: 200, height: 350 };
      }
    };
    if (id) elements.set(id, el);
    return el;
  }

  const storagePanel = createElement('aside', 'storage-panel');
  storagePanel.hidden = true;

  const editorPanel = createElement('aside', 'editor-panel');
  editorPanel.hidden = false;

  const resizeHandle = createElement('div', 'editor-resize-handle');
  resizeHandle.hidden = false;

  // Build storage-panel structure
  const header = createElement('header');
  const closeBtn = createElement('button');
  closeBtn.setAttribute('data-storage-close', '');
  header.appendChild(closeBtn);
  storagePanel.appendChild(header);

  const columns = createElement('div');
  columns.className = 'storage-columns';

  // Backpack container
  const backpackContainer = createElement('section');
  backpackContainer.dataset.storageContainer = 'backpack';
  const bpHeader = createElement('div');
  const bpCapBadge = createElement('span');
  bpCapBadge.dataset.storageCapacity = 'backpack';
  bpHeader.appendChild(bpCapBadge);
  const bpSortBtn = createElement('button');
  bpSortBtn.dataset.storageSort = 'backpack';
  bpHeader.appendChild(bpSortBtn);
  const bpCompactBtn = createElement('button');
  bpCompactBtn.dataset.storageCompact = 'backpack';
  bpHeader.appendChild(bpCompactBtn);
  backpackContainer.appendChild(bpHeader);
  const bpGrid = createElement('div');
  bpGrid.className = 'storage-grid';
  backpackContainer.appendChild(bpGrid);
  columns.appendChild(backpackContainer);

  // Warehouse container
  const whContainer = createElement('section');
  whContainer.dataset.storageContainer = 'warehouse';
  const whHeader = createElement('div');
  const whCapBadge = createElement('span');
  whCapBadge.dataset.storageCapacity = 'warehouse';
  whHeader.appendChild(whCapBadge);
  const whSortBtn = createElement('button');
  whSortBtn.dataset.storageSort = 'warehouse';
  whHeader.appendChild(whSortBtn);
  const whCompactBtn = createElement('button');
  whCompactBtn.dataset.storageCompact = 'warehouse';
  whHeader.appendChild(whCompactBtn);
  whContainer.appendChild(whHeader);
  const whGrid = createElement('div');
  whGrid.className = 'storage-grid';
  whContainer.appendChild(whGrid);
  columns.appendChild(whContainer);

  storagePanel.appendChild(columns);

  const footer = createElement('footer');
  const selectionInfo = createElement('p');
  selectionInfo.setAttribute('data-storage-selection', '');
  footer.appendChild(selectionInfo);
  storagePanel.appendChild(footer);

  globalThis.document = {
    getElementById: (id) => elements.get(id) || null,
    body: {
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      }
    },
    addEventListener() {},
    removeEventListener() {},
    elementFromPoint: () => null,
  };

  globalThis.window = {
    prompt: () => '1',
    requestAnimationFrame: (cb) => cb(),
  };

  return { storagePanel, editorPanel, resizeHandle, backpackContainer, whContainer, bpGrid, whGrid };
}

// Mock Warehouse backed by SlotContainer
class MockWarehouse {
  constructor(capacity = 24) {
    this.container = new SlotContainer(capacity, { isWarehouse: true });
    this.events = new UniversalEventEmitter();
  }
  getSlots() { return this.container.getSlots(); }
  getSlot(index) { return this.container.getSlot(index); }
  setSlot(index, item) {
    this.container.setSlot(index, item);
    this.events.emit('changed', { action: 'setSlot', index });
  }
  swapSlots(from, to) {
    const success = this.container.swapSlots(from, to);
    if (success) this.events.emit('changed', { action: 'swapSlots' });
    return success;
  }
  removeItemFromSlot(index, count) {
    const success = this.container.removeItemFromSlot(index, count);
    if (success) this.events.emit('changed', { action: 'removeItemFromSlot' });
    return success;
  }
  deposit(id, count) {
    const { added, leftover } = this.container.addItem(id, count);
    this.events.emit('changed', { action: 'deposit', id, count: added });
    return leftover === 0;
  }
  withdraw(id, count) {
    const success = this.container.removeItem(id, count);
    if (success) this.events.emit('changed', { action: 'withdraw', id, count });
    return success;
  }
  sort(criterion) {
    this.container.sort(criterion);
    this.events.emit('changed', { action: 'sort' });
  }
  compact() {
    this.container.compact();
    this.events.emit('changed', { action: 'compact' });
  }
  getItemCount(id) { return this.container.getTotalCount(id); }
}

function createMockScene() {
  const inventorySystem = new InventorySystem(16);
  const warehouse = new MockWarehouse(24);
  const dragManager = new DragManager();
  let saved = false;

  return {
    inventorySystem,
    warehouse,
    dragManager,
    saveSystem: {
      saveLocal: () => { saved = true; },
      get wasSaved() { return saved; }
    },
    hud: {
      showMessage: () => {}
    },
    events: new UniversalEventEmitter(),
    editorBridge: {
      editor: { layout: () => {} }
    }
  };
}

test('Sprint 4: StorageUI docks side-by-side replacing editor panel on open, restoring on close', () => {
  setupMockDOM();
  const scene = createMockScene();
  const storageUI = new StorageUI(scene);

  assert.equal(storageUI.isOpen(), false);
  assert.equal(storageUI.root.hidden, true);
  assert.equal(storageUI.editorPanel.hidden, false);

  storageUI.open();
  assert.equal(storageUI.isOpen(), true);
  assert.equal(storageUI.root.hidden, false);
  assert.equal(storageUI.editorPanel.hidden, true);
  assert.equal(storageUI.resizeHandle.hidden, true);
  assert.equal(document.body.classList.contains('storage-open'), true);

  storageUI.close();
  assert.equal(storageUI.isOpen(), false);
  assert.equal(storageUI.root.hidden, true);
  assert.equal(storageUI.editorPanel.hidden, false);
  assert.equal(storageUI.resizeHandle.hidden, false);
  assert.equal(document.body.classList.contains('storage-open'), false);
});

test('Sprint 4: StorageUI renders both empty slots and populated item slots with capacity badge', () => {
  const { bpGrid, whGrid, backpackContainer, whContainer } = setupMockDOM();
  const scene = createMockScene();

  // Add 1 plow (stack 1), 50 wheat seeds (stack 99) to backpack
  scene.inventorySystem.setSlot(0, { id: 'plow', count: 1 });
  scene.inventorySystem.setSlot(1, { id: 'wheat_seed', count: 50 });

  // Add 100 copper_ore to warehouse slot 0
  scene.warehouse.setSlot(0, { id: 'copper_ore', count: 100 });

  const storageUI = new StorageUI(scene);
  storageUI.open();

  // Check capacity badge text
  const bpBadge = backpackContainer.querySelector('[data-storage-capacity]');
  const whBadge = whContainer.querySelector('[data-storage-capacity]');
  assert.equal(bpBadge.textContent, '(2/16)');
  assert.equal(whBadge.textContent, '(1/24)');

  // Check that backpack grid contains slot elements (2 populated, 14 empty)
  assert.equal(bpGrid.innerHTML.includes('data-item-id="plow"'), true);
  assert.equal(bpGrid.innerHTML.includes('data-item-id="wheat_seed"'), true);
  assert.equal(bpGrid.innerHTML.includes('class="storage-slot empty"'), true);

  // Check that warehouse grid contains slot elements (1 populated, 23 empty)
  assert.equal(whGrid.innerHTML.includes('data-item-id="copper_ore"'), true);
  assert.equal(whGrid.innerHTML.includes('class="storage-slot empty"'), true);
});

test('Sprint 4: Menu sorting by Category, Name, and Quantity reorganizes slots and triggers save', () => {
  setupMockDOM();
  const scene = createMockScene();

  // Populate backpack slots in arbitrary order
  // Category order: Peralatan (plow) -> Pertanian (wheat_seed) -> Tambang (copper_ore)
  scene.inventorySystem.setSlot(0, { id: 'copper_ore', count: 20 });
  scene.inventorySystem.setSlot(1, { id: 'wheat_seed', count: 50 });
  scene.inventorySystem.setSlot(2, { id: 'plow', count: 1 });

  const storageUI = new StorageUI(scene);
  storageUI.open();

  // Sort by Category
  storageUI.sortContainer('backpack', 'category');
  let slots = scene.inventorySystem.getSlots();
  assert.equal(slots[0]?.id, 'plow'); // Peralatan
  assert.equal(slots[1]?.id, 'wheat_seed'); // Pertanian
  assert.equal(slots[2]?.id, 'copper_ore'); // Tambang

  // Sort by Name (Copper Ore 'C' -> Plow 'P' -> Wheat Seed 'W')
  storageUI.sortContainer('backpack', 'name');
  slots = scene.inventorySystem.getSlots();
  assert.equal(slots[0]?.id, 'copper_ore');
  assert.equal(slots[1]?.id, 'plow');
  assert.equal(slots[2]?.id, 'wheat_seed');

  // Sort by Quantity (highest first)
  storageUI.sortContainer('backpack', 'quantity');
  slots = scene.inventorySystem.getSlots();
  assert.equal(slots[0]?.count, 50); // wheat_seed (50)
  assert.equal(slots[1]?.count, 20); // copper_ore (20)
  assert.equal(slots[2]?.count, 1);  // plow (1)

  // Cycle sort function
  assert.equal(storageUI.sort.backpack, 'quantity');
  storageUI.cycleSort('backpack');
  assert.equal(storageUI.sort.backpack, 'category');
});

test('Sprint 4: Compact button merges partial stacks in both backpack and warehouse', () => {
  setupMockDOM();
  const scene = createMockScene();

  // Backpack with fragmented wheat stacks
  scene.inventorySystem.setSlot(0, { id: 'wheat', count: 10 });
  scene.inventorySystem.setSlot(1, { id: 'wheat', count: 15 });
  scene.inventorySystem.setSlot(2, { id: 'copper_ore', count: 5 });

  // Warehouse with fragmented iron_ore stacks
  scene.warehouse.setSlot(0, { id: 'iron_ore', count: 50 });
  scene.warehouse.setSlot(1, { id: 'iron_ore', count: 70 });

  const storageUI = new StorageUI(scene);
  storageUI.open();

  storageUI.compactContainer('backpack');
  const bpSlots = scene.inventorySystem.getSlots();
  assert.equal(bpSlots[0]?.id, 'wheat');
  assert.equal(bpSlots[0]?.count, 25); // 10 + 15 merged!
  assert.equal(bpSlots[1], null);
  assert.equal(bpSlots[2]?.id, 'copper_ore');
  assert.equal(bpSlots[2]?.count, 5);

  storageUI.compactContainer('warehouse');
  const whSlots = scene.warehouse.getSlots();
  assert.equal(whSlots[0]?.id, 'iron_ore');
  assert.equal(whSlots[0]?.count, 120); // 50 + 70 merged!
  assert.equal(whSlots[1], null);
});

test('Sprint 4: depositAll moves all storable crops/materials from backpack to warehouse, preserving tools', () => {
  setupMockDOM();
  const scene = createMockScene();

  // Backpack has plow, watering_can, wheat, potato, copper_ore
  scene.inventorySystem.setSlot(0, { id: 'plow', count: 1 });
  scene.inventorySystem.setSlot(1, { id: 'watering_can', count: 1 });
  scene.inventorySystem.setSlot(2, { id: 'wheat', count: 30 });
  scene.inventorySystem.setSlot(3, { id: 'potato', count: 15 });
  scene.inventorySystem.setSlot(4, { id: 'copper_ore', count: 25 });

  const storageUI = new StorageUI(scene);
  storageUI.open();

  storageUI.depositAll();

  // Tools must remain in backpack!
  assert.equal(scene.inventorySystem.getItemCount('plow'), 1);
  assert.equal(scene.inventorySystem.getItemCount('watering_can'), 1);

  // Crops and materials moved to warehouse!
  assert.equal(scene.inventorySystem.getItemCount('wheat'), 0);
  assert.equal(scene.inventorySystem.getItemCount('potato'), 0);
  assert.equal(scene.inventorySystem.getItemCount('copper_ore'), 0);

  assert.equal(scene.warehouse.getItemCount('wheat'), 30);
  assert.equal(scene.warehouse.getItemCount('potato'), 15);
  assert.equal(scene.warehouse.getItemCount('copper_ore'), 25);
});

test('Sprint 4: quickTransferSlot (Shift-click) moves items between backpack and warehouse with validation', () => {
  setupMockDOM();
  const scene = createMockScene();

  scene.inventorySystem.setSlot(0, { id: 'wheat', count: 20 });
  scene.inventorySystem.setSlot(1, { id: 'plow', count: 1 });

  const storageUI = new StorageUI(scene);
  storageUI.open();

  // Shift-click wheat in backpack -> moves to warehouse
  const transferred = storageUI.quickTransferSlot('backpack', 'warehouse', 0);
  assert.equal(transferred, true);
  assert.equal(scene.inventorySystem.getItemCount('wheat'), 0);
  assert.equal(scene.warehouse.getItemCount('wheat'), 20);

  // Shift-click plow in backpack -> rejected (tools cannot be put in warehouse)
  const toolTransfer = storageUI.quickTransferSlot('backpack', 'warehouse', 1);
  assert.equal(toolTransfer, false);
  assert.equal(scene.inventorySystem.getItemCount('plow'), 1);
  assert.equal(scene.warehouse.getItemCount('plow'), 0);

  // Shift-click wheat in warehouse -> moves back to backpack
  const whSlotIdx = scene.warehouse.getSlots().findIndex(s => s?.id === 'wheat');
  const returnTransfer = storageUI.quickTransferSlot('warehouse', 'backpack', whSlotIdx);
  assert.equal(returnTransfer, true);
  assert.equal(scene.inventorySystem.getItemCount('wheat'), 20);
  assert.equal(scene.warehouse.getItemCount('wheat'), 0);
});

test('Sprint 4: Two-way drag drop handling for intra-container reordering and cross-container slot placement', () => {
  setupMockDOM();
  const scene = createMockScene();

  scene.inventorySystem.setSlot(0, { id: 'wheat_seed', count: 10 });
  scene.inventorySystem.setSlot(5, null);

  const storageUI = new StorageUI(scene);
  storageUI.open();

  // Intra-backpack drag: slot 0 to slot 5
  storageUI._handleBackpackDrop({
    source: 'backpack',
    slotIndex: 0,
    id: 'wheat_seed',
    count: 10
  }, 5);

  let bpSlots = scene.inventorySystem.getSlots();
  assert.equal(bpSlots[0], null);
  assert.equal(bpSlots[5]?.id, 'wheat_seed');
  assert.equal(bpSlots[5]?.count, 10);

  // Cross-container drag: backpack slot 5 to warehouse slot 2
  storageUI._handleWarehouseDrop({
    source: 'backpack',
    slotIndex: 5,
    id: 'wheat_seed',
    count: 10
  }, 2);

  bpSlots = scene.inventorySystem.getSlots();
  const whSlots = scene.warehouse.getSlots();
  assert.equal(bpSlots[5], null);
  assert.equal(whSlots[2]?.id, 'wheat_seed');
  assert.equal(whSlots[2]?.count, 10);
});
