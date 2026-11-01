import { CONTRACTS } from '../data/contracts.js';
import { PLANT_TYPES } from '../data/plants.js';
import { REFINED_PRICES } from '../systems/EconomySystem.js';
import { productionPlan } from '../systems/OperationsSystem.js';

const name = id => PLANT_TYPES[id]?.name || REFINED_PRICES[id]?.name || id.replaceAll('_', ' ');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `${Math.round(value).toLocaleString('id-ID')}g`;

export default class OperationsUI {
  constructor(scene) {
    this.scene = scene;
    this.system = scene.operationsSystem;
    this.root = document.getElementById('operations-content');
    this.feedback = '';
    this.onClick = event => {
      const button = event.target.closest('button[data-operation]');
      if (!button) return;
      const result = this.system[button.dataset.operation](button.dataset.contract);
      this.feedback = result.message;
      this.render();
      scene.saveSystem.saveLocal();
    };
    this.root.addEventListener('click', this.onClick);
    this.reserveSelect = document.getElementById('operations-reserve');
    this.onReserve = () => {
      this.system.setReserve(Number(this.reserveSelect.value));
      this.render();
      scene.saveSystem.saveLocal();
    };
    this.reserveSelect.addEventListener('change', this.onReserve);
    this.timer = scene.time.addEvent({ delay: 750, loop: true, callback: () => this.render() });
    this.render();
    scene.events.once('shutdown', () => this.destroy());
  }

  hint(order) {
    const system = this.system;
    const remaining = order.quantity - order.delivered;
    if (system.stock(order.item) >= remaining) return 'Barang siap. Kirim pesanan untuk mencairkan pembayaran dan jaminan.';
    const plan = productionPlan(order.item, remaining);
    const machines = [...this.scene.machineSystem.machines.values()].filter(m => plan.machines.includes(m.type));
    if (machines.some(m => (m.outputBuffer.get(order.item) || 0) > 0)) return 'Hasil sudah ada di mesin. Jadwalkan pengangkutan ke gudang sebelum menambah produksi.';
    if (machines.some(m => m.activeRecipe)) return 'Lini sedang bekerja. Cek pasokan bahan untuk batch selanjutnya dan siapkan drone logistik.';
    if (plan.machines.length) {
      const first = plan.machines.find(type => !machines.some(m => m.type === type));
      if (first) return `Lini membutuhkan ${first}. Periksa mesin dan akses zona sebelum menambah komitmen.`;
      return 'Mesin lini ini menunggu bahan. Distribusikan input sesuai resep; menambah drone belum tentu mengatasi hambatannya.';
    }
    return `Masih perlu ${Math.max(0, remaining - system.stock(order.item))} ${name(order.item)}. Bagi tugas menanam, menyiram, dan mengangkut hasil.`;
  }

  contractCard(offer, order = null) {
    const system = this.system;
    const quantity = order?.quantity ?? offer.quantity;
    const payout = order?.payout ?? offer.payout;
    const bond = order?.bond ?? offer.bond;
    const plan = productionPlan(offer.item, quantity - (order?.delivered || 0));
    const ingredients = Object.entries(plan.raw).map(([id, count]) => `${count} ${name(id)}`).join(' · ');
    const accepted = system.active.some(o => o.id === offer.id);
    const reason = system.active.length >= 2 ? 'Slot penuh' : system.inventory.getCoins() - bond < system.reserve ? 'Cadangan belum cukup' : '';
    const stock = system.stock(offer.item);
    const premium = payout - quantity * system.economy.getSellPrice(offer.item);
    return `<article class="contract-card ${order ? 'is-active' : ''}">
      <div class="contract-heading"><span class="eyebrow">${escape(offer.client)}</span><span class="contract-tag">${order ? 'Dikerjakan' : 'Tersedia'}</span></div>
      <h3>${escape(offer.title)}</h3><p class="contract-product">${quantity} × ${escape(name(offer.item))}<strong>${money(payout)}</strong></p>
      <p class="contract-meta">+${money(premium)} dibanding jual biasa · jaminan ${money(bond)}</p>
      ${order ? `<progress value="${order.delivered}" max="${quantity}" aria-label="Pengiriman ${escape(offer.title)}"></progress><p class="contract-meta">Terkirim ${order.delivered}/${quantity} · stok tas + gudang ${stock}</p><p class="operations-hint">${escape(this.hint(order))}</p>` : ''}
      <details><summary>Rencana produksi & manfaat</summary><p>Latihan: ${escape(offer.skill)}.</p><p>Bahan resep dari nol: ${escape(ingredients)}.</p>${plan.machines.length ? `<p>Alur: ${escape([...plan.machines].reverse().join(' → '))}. Total kerja mesin ${Math.ceil(plan.workMs / 1000)} detik; belum termasuk tumbuh, perjalanan, atau antrean. Mesin bisa bekerja paralel.</p>` : '<p>Tanam bertahap agar tugas drone dan persediaan benih tetap seimbang.</p>'}<p>Jaminan dikembalikan saat selesai atau batal. Pesanan tidak kedaluwarsa.</p></details>
      <div class="contract-actions">${order ? `<button class="op-primary" data-operation="deliver" data-contract="${offer.id}" ${stock <= 0 ? 'disabled' : ''}>Kirim ${Math.min(stock, quantity - order.delivered)} unit</button><button class="op-secondary" data-operation="cancel" data-contract="${offer.id}">Batalkan</button>` : `<button class="op-primary" data-operation="accept" data-contract="${offer.id}" ${accepted || reason ? 'disabled' : ''}>${accepted ? 'Sedang dikerjakan' : reason || 'Ambil kontrak'}</button>`}</div>
    </article>`;
  }

  render() {
    const s = this.system;
    const balance = s.inventory.getCoins();
    const drones = this.scene.deviceManager.getAll();
    document.getElementById('workspace-wallet').textContent = money(balance);
    document.getElementById('workspace-fleet').textContent = `${drones.filter(d => d.status === 'running').length}/${drones.length} drone aktif`;
    document.getElementById('operations-rank').textContent = s.rank;
    document.getElementById('operations-completed').textContent = `${s.completed} kontrak selesai · bonus reputasi ${Math.round(s.bonus * 100)}%`;
    if (document.activeElement !== this.reserveSelect) {
      if (![...this.reserveSelect.options].some(o => Number(o.value) === s.reserve)) this.reserveSelect.add(new Option(money(s.reserve), String(s.reserve)));
      this.reserveSelect.value = String(s.reserve);
    }
    const offers = s.getAvailable();
    const html = `<div class="operations-metrics"><div><span>Kas masuk</span><strong>${money(s.cashIn)}</strong></div><div><span>Kas keluar</span><strong>${money(s.cashOut)}</strong></div><div><span>Arus kas bersih</span><strong class="${s.cashIn - s.cashOut < 0 ? 'text-warning' : 'text-positive'}">${money(s.cashIn - s.cashOut)}</strong></div></div>
      <p class="operations-note">Arus kas mencakup investasi dan jaminan; bukan laba.</p>
      <div class="operations-insight ${balance < s.reserve ? 'is-warning' : ''}"><span class="eyebrow">Modal kerja</span><p>${balance < s.reserve ? `Kas ${money(balance)} di bawah cadangan ${money(s.reserve)}. Jual sebagian stok atau selesaikan pengiriman sebelum ekspansi.` : `${money(balance - s.reserve)} di atas cadangan. Bandingkan kebutuhan benih dengan biaya ekspansi.`}</p><small>Cadangan membatasi pengambilan kontrak. Belanja lain tetap memakai aturan toko.</small></div>
      ${this.feedback ? `<p class="operations-feedback" role="status">${escape(this.feedback)}</p>` : ''}
      <div class="section-heading"><h2>Prioritas sekarang</h2><span>${s.active.length}/2 slot</span></div>
      ${s.active.length ? s.active.map(order => this.contractCard(CONTRACTS.find(t => t.id === order.id), order)).join('') : '<div class="operations-empty"><strong>Mulai dari satu pesanan.</strong><p>Ambil kontrak gandum, rencanakan pasokan, lalu kirim dari tas atau gudang. Dua slot membuat prioritasmu berarti.</p></div>'}
      <div class="section-heading"><h2>Papan kontrak</h2><span>Tanpa tenggat</span></div>
      ${offers.filter(o => !s.active.some(a => a.id === o.id)).map(o => this.contractCard(o)).join('')}
      <p class="operations-note">Pesanan lanjutan terbuka mengikuti level dan zona. Setiap 3 kontrak, volume naik hingga batas; setiap 5 kontrak, reputasi menambah premium hingga 10%.</p>
      ${s.lastReport ? `<div class="operations-insight"><span class="eyebrow">Evaluasi terakhir</span><p>${escape(s.lastReport)}</p></div>` : ''}`;
    // Keep open recipe details and focus intact when only the clock advances.
    if (html !== this.lastHTML) {
      const open = [...this.root.querySelectorAll('details[open]')].map(d => d.closest('article')?.querySelector('[data-contract]')?.dataset.contract);
      this.root.innerHTML = html;
      this.root.querySelectorAll('article').forEach(card => {
        if (open.includes(card.querySelector('[data-contract]')?.dataset.contract)) card.querySelector('details').open = true;
      });
      this.lastHTML = html;
    }
  }

  destroy() {
    this.timer.remove();
    this.root.removeEventListener('click', this.onClick);
    this.reserveSelect.removeEventListener('change', this.onReserve);
    this.system.destroy();
  }
}
