import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import OperationsSystem, { productionPlan } from '../src/systems/OperationsSystem.js';

function setup(coins = 500) {
  const inventory = {
    coins, events: new EventEmitter(), items: new Map(),
    getCoins() { return this.coins; },
    getItemCount(id) { return this.items.get(id) || 0; },
    addItem(id, count) { this.items.set(id, this.getItemCount(id) + count); },
    removeItem(id, count) {
      if (this.getItemCount(id) < count) return false;
      this.items.set(id, this.getItemCount(id) - count); return true;
    },
    addCoins(amount) { this.coins += amount; this.events.emit('coins-changed', { delta: amount }); },
    removeCoins(amount) { if (this.coins < amount) return false; this.coins -= amount; this.events.emit('coins-changed', { delta: -amount }); return true; },
  };
  const warehouse = { ...inventory, items: new Map(), withdraw(id, count) { return this.removeItem(id, count); } };
  const profile = { level: 1, xp: 0, addXp(value) { this.xp += value; } };
  const zones = {};
  const system = new OperationsSystem(inventory, { getSellPrice: id => ({ wheat: 15, potato: 22, flour: 35, bread: 90, apple_tree: 30, iron_ingot: 110, wire: 130 }[id]) }, profile, () => zones, warehouse);
  return { system, inventory, warehouse, profile, zones };
}

test('offers follow actual level and zone access; working capital and slots limit commitments', () => {
  const { system, inventory, profile, zones } = setup(100);
  assert.deepEqual(system.getAvailable().map(o => o.id), ['pantry', 'market']);
  system.setReserve(100);
  assert.equal(system.accept('pantry').success, false);
  assert.equal(inventory.coins, 100);
  system.setReserve(50);
  assert.equal(system.accept('pantry').success, true);
  assert.equal(system.accept('pantry').success, false);
  assert.equal(system.accept('market').success, true);
  profile.level = 8;
  assert.equal(system.getAvailable().some(o => o.id === 'bread'), false);
  zones.zone2 = true;
  assert.equal(system.getAvailable().some(o => o.id === 'bread'), true);
  assert.equal(system.accept('bread').success, false);
  system.destroy();
});

test('partial deliveries combine backpack and warehouse; complete pays exactly once', () => {
  const { system, inventory, warehouse, profile } = setup();
  const offer = system.getAvailable()[0];
  system.accept(offer.id);
  assert.equal(system.deliver(offer.id).success, false);
  inventory.addItem('wheat', 2);
  warehouse.addItem('wheat', 3);
  system.deliver(offer.id);
  assert.equal(system.active[0].delivered, 5);
  assert.equal(system.stock('wheat'), 0);
  assert.equal(inventory.coins, 500 - offer.bond);
  warehouse.addItem('wheat', 8);
  system.deliver(offer.id);
  assert.equal(warehouse.getItemCount('wheat'), 5);
  assert.equal(inventory.coins, 500 + offer.payout);
  assert.equal(system.completed, 1);
  assert.equal(profile.xp, 20);
  assert.equal(system.deliver(offer.id).success, false);
  assert.equal(system.cashIn - system.cashOut, offer.payout);
});

test('cancellation returns both partial shipment and bond; cannot duplicate refunds', () => {
  const { system, inventory } = setup();
  system.accept('pantry');
  inventory.addItem('wheat', 3);
  system.deliver('pantry');
  system.cancel('pantry');
  assert.equal(inventory.coins, 500);
  assert.equal(inventory.getItemCount('wheat'), 3);
  assert.equal(system.cancel('pantry').success, false);
  assert.equal(system.completed, 0);
});

test('save round-trip preserves partial commitments and never books restore as income', () => {
  const { system, inventory } = setup();
  system.accept('pantry');
  inventory.addItem('wheat', 3);
  system.deliver('pantry');
  system.setReserve(250);
  const data = JSON.parse(JSON.stringify(system.getSaveState()));
  system.loadSaveState(data);
  inventory.events.emit('coins-changed', { delta: 0 });
  assert.deepEqual(system.getSaveState(), data);
  system.loadSaveState();
  assert.equal(system.active.length, 0);
  assert.equal(system.reserve, 50);
});

test('recipe planning expands chains and rounds output batches without understating inputs', () => {
  assert.deepEqual(productionPlan('bread', 4).raw, { wheat: 16 });
  assert.equal(productionPlan('bread', 4).workMs, 140000);
  assert.deepEqual(productionPlan('wire', 4).raw, { copper_ore: 8, coal: 4 });
  assert.equal(productionPlan('wire', 4).workMs, 78000);
});

test('invalid/duplicate saved orders are rejected; reputation and size growth are bounded', () => {
  const { system } = setup();
  system.accept('pantry');
  const data = system.getSaveState();
  data.active.push({ ...data.active[0] }, { ...data.active[0], quantity: -10 });
  data.completed = 1000;
  system.loadSaveState(data);
  assert.equal(system.active.length, 1);
  assert.equal(system.bonus, .1);
  assert.equal(system.getAvailable()[0].quantity, 16);
  system.setReserve(-1);
  assert.equal(system.reserve, 50);
});
