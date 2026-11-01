import { CONTRACTS } from '../data/contracts.js';
import { RECIPES } from './MachineSystem.js';

const integer = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const recipeFor = (item) => Object.entries(RECIPES).flatMap(([machine, recipes]) =>
  (Array.isArray(recipes) ? recipes : [recipes]).map(recipe => ({ ...recipe, machine })))
  .find(recipe => recipe.output.id === item);

/** Pure planning helper: includes batch rounding and intermediate machine work. */
export function productionPlan(item, quantity) {
  const raw = {};
  const machines = new Set();
  let workMs = 0;
  function expand(id, amount) {
    const recipe = recipeFor(id);
    if (!recipe) { raw[id] = (raw[id] || 0) + amount; return; }
    const batches = Math.ceil(amount / recipe.output.count);
    machines.add(recipe.machine);
    workMs += batches * recipe.timeMs;
    Object.entries(recipe.inputs).forEach(([input, count]) => expand(input, count * batches));
  }
  expand(item, quantity);
  return { raw, machines: [...machines], workMs };
}

/** Persistent objectives, working capital and cash flow, without real-world deadlines. */
export default class OperationsSystem {
  constructor(inventory, economy, profile, getZones = () => ({}), warehouse = null) {
    Object.assign(this, { inventory, economy, profile, getZones, warehouse });
    this.active = [];
    this.completed = 0;
    this.reserve = 50;
    this.cashIn = 0;
    this.cashOut = 0;
    this.lastReport = '';
    this.onCoins = ({ delta }) => {
      if (!Number.isFinite(delta)) return;
      if (delta > 0) this.cashIn += delta;
      if (delta < 0) this.cashOut -= delta;
    };
    inventory.events.on('coins-changed', this.onCoins);
  }

  get rank() { return ['Perintis', 'Koordinator', 'Manajer', 'Direktur'][Math.min(3, Math.floor(this.completed / 5))]; }
  get bonus() { return Math.min(0.10, Math.floor(this.completed / 5) * 0.02); }
  getAvailable() {
    const eligible = CONTRACTS.filter(t => t.level <= this.profile.level && (!t.zone || this.getZones()[t.zone]));
    const cycle = Math.min(4, Math.floor(this.completed / 3));
    return eligible.map(t => {
      const quantity = t.quantity + cycle * 2;
      const marketValue = quantity * this.economy.getSellPrice(t.item);
      return { ...t, quantity, marketValue, payout: Math.floor(marketValue * (1 + t.premium + this.bonus)), bond: Math.ceil(marketValue * 0.1) };
    });
  }

  accept(id) {
    const offer = this.getAvailable().find(o => o.id === id);
    if (!offer || this.active.some(o => o.id === id)) return { success: false, message: 'Kontrak tidak tersedia.' };
    if (this.active.length >= 2) return { success: false, message: 'Dua slot terisi. Selesaikan atau batalkan satu kontrak.' };
    if (this.inventory.getCoins() - offer.bond < this.reserve) {
      return { success: false, message: 'Modal setelah jaminan di bawah cadangan. Tambah kas atau ubah rencana cadangan.' };
    }
    if (!this.inventory.removeCoins(offer.bond)) return { success: false, message: 'Kas belum cukup untuk jaminan.' };
    this.active.push({ id, item: offer.item, quantity: offer.quantity, delivered: 0, payout: offer.payout, bond: offer.bond });
    return { success: true, message: 'Kontrak diambil. Jaminan kembali saat selesai atau dibatalkan.' };
  }

  stock(item) { return this.inventory.getItemCount(item) + (this.warehouse?.getItemCount(item) || 0); }

  deliver(id) {
    const order = this.active.find(o => o.id === id);
    if (!order) return { success: false, message: 'Kontrak tidak ditemukan.' };
    const amount = Math.min(order.quantity - order.delivered, this.stock(order.item));
    if (amount <= 0) return { success: false, message: 'Belum ada barang di tas atau gudang. Ambil hasil dari drone/mesin dulu.' };
    const backpack = Math.min(amount, this.inventory.getItemCount(order.item));
    order.delivered += amount;
    if (backpack) this.inventory.removeItem(order.item, backpack);
    if (amount > backpack) this.warehouse.withdraw(order.item, amount - backpack);
    if (order.delivered < order.quantity) return { success: true, message: `${amount} unit dikirim. Sisa ${order.quantity - order.delivered} unit.` };
    this.active = this.active.filter(o => o !== order);
    this.completed++;
    this.lastReport = `Kontrak selesai: ${order.quantity} unit → ${order.payout}g + jaminan ${order.bond}g kembali. Evaluasi kapasitas sebelum mengambil pesanan berikutnya.`;
    this.inventory.addCoins(order.payout + order.bond);
    this.profile.addXp(20);
    return { success: true, message: this.lastReport };
  }

  cancel(id) {
    const order = this.active.find(o => o.id === id);
    if (!order) return { success: false, message: 'Kontrak tidak ditemukan.' };
    this.active = this.active.filter(o => o !== order);
    // Delivered stock was held for the client; cancellation returns it to the backpack.
    if (order.delivered) this.inventory.addItem(order.item, order.delivered);
    this.inventory.addCoins(order.bond);
    return { success: true, message: 'Kontrak dibatalkan. Jaminan dan barang yang dikirim dikembalikan ke tas.' };
  }

  setReserve(value) { if (Number.isSafeInteger(value) && value >= 0 && value <= 1000000) this.reserve = value; }
  getSaveState() {
    return { active: this.active.map(o => ({ ...o })), completed: this.completed, reserve: this.reserve, cashIn: this.cashIn, cashOut: this.cashOut, lastReport: this.lastReport };
  }
  loadSaveState(state) {
    const data = state || {};
    this.completed = integer(data.completed);
    this.reserve = integer(data.reserve, 50);
    this.cashIn = integer(data.cashIn);
    this.cashOut = integer(data.cashOut);
    this.lastReport = typeof data.lastReport === 'string' ? data.lastReport.slice(0, 500) : '';
    const seen = new Set();
    this.active = (Array.isArray(data.active) ? data.active : []).filter(o => {
      const template = CONTRACTS.find(t => t.id === o?.id && t.item === o.item);
      if (!template || seen.has(o.id) || !Number.isSafeInteger(o.quantity) || o.quantity < 1 || o.quantity > 1000 ||
        integer(o.delivered, -1) < 0 || o.delivered >= o.quantity || integer(o.payout, -1) < 0 || integer(o.bond, -1) < 0) return false;
      seen.add(o.id);
      return true;
    }).slice(0, 2).map(({ id, item, quantity, delivered, payout, bond }) => ({ id, item, quantity, delivered, payout, bond }));
  }
  destroy() { this.inventory.events.off('coins-changed', this.onCoins); }
}
