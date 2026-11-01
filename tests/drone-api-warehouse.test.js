import test from 'node:test';
import assert from 'node:assert/strict';
import DroneAPI from '../src/systems/DroneAPI.js';

function inventory(items = {}, capacity = 100) {
  const stock = new Map(Object.entries(items));
  return {
    stock,
    capacity,
    getItemCount: id => stock.get(id) || 0,
    getTotalCount: () => [...stock.values()].reduce((total, count) => total + count, 0),
    getAll: () => [...stock].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count })),
    addItem(id, count) { stock.set(id, (stock.get(id) || 0) + count); return true; },
    removeItem(id, count) {
      const available = stock.get(id) || 0;
      if (available < count) return false;
      if (available === count) stock.delete(id);
      else stock.set(id, available - count);
      return true;
    },
    clear() { stock.clear(); },
  };
}

function storage(items = {}) {
  const stock = new Map(Object.entries(items));
  return {
    stock,
    isAdjacentTo: () => true,
    getItemCount: id => stock.get(id) || 0,
    withdraw(id, count) {
      const available = stock.get(id) || 0;
      if (available < count) return false;
      if (available === count) stock.delete(id);
      else stock.set(id, available - count);
      return true;
    },
    deposit(id, count) { stock.set(id, (stock.get(id) || 0) + count); },
  };
}

function setup({ cargo = {}, warehouseItems = {}, capacity = 100, atMarket = true } = {}) {
  const droneInventory = inventory(cargo, capacity);
  const warehouse = storage(warehouseItems);
  const events = [];
  const drone = {
    id: 'drone-001',
    tileX: atMarket ? 16 : 3,
    tileY: atMarket ? 1 : 3,
    droneInventory,
    getInventoryCapacity: () => capacity,
    hasAbility: ability => ability === 'sell',
    executeAction: async () => {},
    events: { emit: (event, data) => events.push({ event, data }) },
    scene: { marketZone: { x: 17, y: 1, w: 3, h: 2 } },
  };
  const economy = { sellCrop: () => ({ success: true, earned: 10 }) };
  return { api: new DroneAPI(drone, {}, inventory(), null, economy, warehouse), drone, warehouse, events };
}

test('transferFromWarehouse fills only the drone capacity that remains', async () => {
  const { api, drone, warehouse, events } = setup({ cargo: { potato: 30 }, warehouseItems: { wheat: 200 }, capacity: 100 });

  await api._handleTransferFromWarehouse('wheat');

  assert.equal(drone.droneInventory.getItemCount('wheat'), 70);
  assert.equal(drone.droneInventory.getTotalCount(), 100);
  assert.equal(warehouse.getItemCount('wheat'), 130);
  assert.equal(events.at(-1).event, 'inventory-changed');
});

test('seller must reach the market before selling warehouse cargo', async () => {
  const atMarket = setup({ cargo: { wheat: 4 }, atMarket: true });
  await atMarket.api._handleSell();
  assert.equal(atMarket.drone.droneInventory.getItemCount('wheat'), 0);

  const awayFromMarket = setup({ cargo: { wheat: 4 }, atMarket: false });
  await assert.rejects(awayFromMarket.api._handleSell(), /beside the Market/);
  assert.equal(awayFromMarket.drone.droneInventory.getItemCount('wheat'), 4);
});
