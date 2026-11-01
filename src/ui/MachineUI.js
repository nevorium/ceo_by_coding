import { RECIPES } from '../systems/MachineSystem.js';
import { pixelIcon } from '../rendering/PixelAssets.js';
import { getItem } from '../data/items.js';

const label = id => getItem(id)?.name || id.replaceAll('_', ' ');

export default class MachineUI {
  constructor(scene, machineSystem, inventorySystem) {
    Object.assign(this, { scene, machineSystem, inventorySystem });
    this._visible = false;
    this._machineId = null;
    this._craftCategory = 'all';
    this._showAuto = false;
    this.root = document.getElementById('machine-content');
    scene.panelManager.register('machine-inspector', () => { this._visible = false; });

    this.onClick = e => {
      const button = e.target.closest('[data-machine-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.machineAction;

      if (action === 'craft') {
        const recipeId = button.dataset.recipe;
        const maxQty = parseInt(button.dataset.maxQty, 10) || 1;
        const requestedQty = button.dataset.craftMax === 'true' || e.shiftKey
          ? maxQty
          : (parseInt(button.dataset.qty, 10) || 1);

        const result = this.machineSystem.craftItem(recipeId, this.inventorySystem, this._machineId, requestedQty);
        if (result.success) {
          const outLabel = label(result.outputItem);
          this.scene.hud?.showMessage(`🔨 Berhasil merakit ${result.outputCount}× ${outLabel}!`, 2600);
        } else {
          if (result.reason === 'inventory_full') {
            this.scene.hud?.showMessage('⚠️ Tas penuh! Kosongkan slot ransel terlebih dahulu.', 2600);
          } else if (result.reason === 'insufficient_materials') {
            this.scene.hud?.showMessage('⚠️ Bahan material tidak mencukupi.', 2600);
          } else {
            this.scene.hud?.showMessage('Gagal merakit item.', 2000);
          }
        }
        this.render();
        this.scene.saveSystem?.saveLocal();
        return;
      }

      if (action === 'craft-filter') {
        this._craftCategory = button.dataset.category || 'all';
        this.render();
        return;
      }

      if (action === 'toggle-auto') {
        this._showAuto = !this._showAuto;
        this.render();
        return;
      }

      const item = button.dataset.item;
      if (action === 'deposit') {
        const have = this.inventorySystem.getItemCount(item);
        const qty = e.shiftKey ? have : Math.min(1, have);
        if (qty > 0 && this.inventorySystem.removeItem(item, qty)) {
          this.machineSystem.deposit(this._machineId, item, qty);
        }
      } else if (action === 'retrieve') {
        const outputs = this.machineSystem.retrieve(this._machineId);
        for (const output of outputs) {
          this.inventorySystem.addItem(output.id, output.count);
        }
      }

      this.render();
      this.scene.saveSystem?.saveLocal();
    };

    this.root.addEventListener('click', this.onClick);
    this.timer = scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => { if (this._visible) this.render(); },
    });
  }

  show(id) {
    this._machineId = id;
    this._visible = true;
    this._craftCategory = 'all';
    this.lastRender = null;
    this.render();
    this.scene.panelManager.open('machine-inspector');
  }

  hide() {
    this._visible = false;
    if (this.scene.panelManager.current === 'machine-inspector') {
      this.scene.panelManager.close();
    }
  }

  isVisible() {
    return this._visible;
  }

  render() {
    const m = this.machineSystem.getMachineState(this._machineId);
    if (!m) {
      this.hide();
      return;
    }

    const signature = JSON.stringify([
      m,
      this.inventorySystem.getAllItems(),
      this._craftCategory,
      this._showAuto,
    ]);
    if (signature === this.lastRender) return;
    this.lastRender = signature;

    const recipes = Array.isArray(RECIPES[m.type]) ? RECIPES[m.type] : [RECIPES[m.type]];
    const title = m.type === 'crafting_table' ? 'Crafting Table' : label(m.type);
    document.getElementById('machine-title').textContent = title;

    this.images ||= new Map();
    if (!this.images.has(m.type)) {
      const texKey = 'machine_' + m.type;
      if (this.scene.textures.exists(texKey)) {
        this.images.set(m.type, this.scene.textures.get(texKey).getSourceImage().toDataURL());
      } else {
        this.images.set(m.type, '');
      }
    }
    const image = this.images.get(m.type) || '';

    if (m.type === 'crafting_table') {
      this.renderCraftingTable(m, recipes, image);
    } else {
      this.renderStandardMachine(m, recipes, image);
    }
  }

  renderCraftingTable(m, recipes, image) {
    const categories = ['all', 'Bangunan', 'Peralatan', 'Komponen'];
    const filteredRecipes = this._craftCategory === 'all'
      ? recipes
      : recipes.filter(r => r.category === this._craftCategory);

    const hasStoredInputs = m.inputs.length > 0;
    const hasOutputs = m.outputs.length > 0;
    const isAutoActive = m.isProcessing || hasStoredInputs || hasOutputs;

    const filterTabsHtml = `
      <div class="crafting-filter-tabs">
        ${categories.map(cat => {
          const catLabel = cat === 'all' ? 'Semua' : cat;
          const isActive = this._craftCategory === cat;
          return `<button data-machine-action="craft-filter" data-category="${cat}" class="${isActive ? 'active' : ''}">${catLabel}</button>`;
        }).join('')}
      </div>
    `;

    const recipeCardsHtml = filteredRecipes.map(recipe => {
      const check = this.machineSystem.checkCraftRequirements(recipe, this.inventorySystem, this._machineId);
      const outputMeta = getItem(recipe.output.id);
      const outputName = outputMeta?.name || label(recipe.output.id);
      const outputCount = recipe.output.count || 1;
      const hasSpace = this.inventorySystem.hasSpaceFor(recipe.output.id, outputCount);
      const recipeKey = recipe.id || recipe.output.id;

      const reqChips = Object.entries(recipe.inputs).map(([reqId, neededCount]) => {
        const have = check.available[reqId] || 0;
        const isMet = have >= neededCount;
        return `
          <span class="crafting-req-chip ${isMet ? 'is-met' : 'is-missing'}" title="${label(reqId)}: Memiliki ${have}, Butuh ${neededCount}">
            ${pixelIcon(reqId)}
            <span>${label(reqId)}: <strong>${have}/${neededCount}</strong></span>
          </span>
        `;
      }).join('');

      let actionButtons = '';
      if (!hasSpace) {
        actionButtons = `<button disabled class="btn-craft-disabled">Tas Penuh</button>`;
      } else if (check.canCraft) {
        actionButtons = `
          <button data-machine-action="craft" data-recipe="${recipeKey}" data-qty="1" class="btn-craft-primary" title="Shift + klik untuk rakit maksimal">Rakit 1</button>
          ${check.maxCraftable > 1 ? `<button data-machine-action="craft" data-recipe="${recipeKey}" data-max-qty="${check.maxCraftable}" data-craft-max="true" class="btn-craft-max">Rakit Maks (${check.maxCraftable})</button>` : ''}
        `;
      } else {
        actionButtons = `<button disabled class="btn-craft-disabled">Bahan Kurang</button>`;
      }

      return `
        <div class="crafting-recipe-card ${check.canCraft ? 'craftable' : ''}">
          <div class="crafting-recipe-header">
            ${pixelIcon(recipe.output.id)}
            <div class="crafting-recipe-title">
              <strong>${outputCount > 1 ? `${outputCount}× ` : ''}${outputName}</strong>
              ${recipe.category ? `<span class="crafting-cat-badge">${recipe.category}</span>` : ''}
            </div>
          </div>
          ${recipe.description ? `<p class="crafting-recipe-desc">${recipe.description}</p>` : ''}
          <div class="crafting-reqs">
            ${reqChips}
          </div>
          <div class="crafting-recipe-actions">
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');

    const autoSectionHtml = `
      <section class="inspector-section" style="margin-top: 16px;">
        <button data-machine-action="toggle-auto" class="crafting-toggle-btn">
          <span>⚙️ Logistik & Buffer Otomatis ${isAutoActive ? '🔴 (Aktif)' : ''}</span>
          <span>${this._showAuto ? '▲ Tutup' : '▼ Lihat'}</span>
        </button>

        ${this._showAuto ? `
          <div style="margin-top: 12px; padding: 10px; background: #101a21; border: 1px solid #42535b;">
            <div style="margin-bottom: 10px;">
              <span class="eyebrow">ANTREAN OTOMATIS</span>
              <p style="font-size: 11px; margin: 4px 0;">${m.activeRecipeName || 'Antrean kosong. Masukkan bahan atau biarkan drone mengisi.'}</p>
              <progress max="100" value="${m.progress}" aria-label="Progres otomatis"></progress>
            </div>

            <div style="margin-bottom: 12px;">
              <h4 style="font-size: 11px; color: #63d8d1; margin: 8px 0 6px;">Bahan Masuk Mesin</h4>
              <div class="machine-inputs">
                ${[...new Set(recipes.flatMap(r => Object.keys(r.inputs)))].map(id => {
                  const stored = m.inputs.find(i => i.id === id)?.count || 0;
                  const have = this.inventorySystem.getItemCount(id);
                  return `
                    <div class="machine-item">
                      ${pixelIcon(id)}
                      <div>
                        <strong>${label(id)}</strong>
                        <small>Mesin ${stored} · Tas ${have}</small>
                      </div>
                      <button data-machine-action="deposit" data-item="${id}" ${!have ? 'disabled' : ''}>Isi 1</button>
                    </div>
                  `;
                }).join('')}
              </div>
              <small style="color: #93a7a1; font-size: 9.5px;">Shift + klik untuk memasukkan semua bahan dari tas ke buffer.</small>
            </div>

            <div>
              <h4 style="font-size: 11px; color: #63d8d1; margin: 8px 0 6px;">Hasil Produksi Buffer</h4>
              ${m.outputs.length ? m.outputs.map(o => `
                <div class="machine-item">
                  ${pixelIcon(o.id)}
                  <span>${o.count} × ${label(o.id)}</span>
                </div>
              `).join('') : '<p style="font-size: 10px; color: #93a7a1; margin: 4px 0;">Belum ada hasil produksi otomatis.</p>'}
              <button data-machine-action="retrieve" ${!m.outputs.length ? 'disabled' : ''} style="margin-top: 8px;">Ambil Hasil Buffer</button>
            </div>
          </div>
        ` : ''}
      </section>
    `;

    this.root.innerHTML = `
      <div class="machine-portrait">
        ${image ? `<img width="96" height="96" alt="Crafting Table" src="${image}">` : ''}
        <div>
          <span class="eyebrow">STASIUN PERAKITAN</span>
          <h3>Meja Kerja (Crafting Table)</h3>
          <p>Rakit kit bangunan, beliung, cangkul, dan komponen mekanis dari bahan tambang & alam.</p>
        </div>
      </div>

      <section class="inspector-section" style="border-top: none; padding-top: 0; margin-top: 0;">
        <h3 style="margin-bottom: 8px;">Daftar Resep & Perakitan</h3>
        ${filterTabsHtml}
        <div class="crafting-recipes-list">
          ${recipeCardsHtml}
        </div>
        <p style="font-size: 9.5px; color: #93a7a1; margin-top: 10px; line-height: 1.5;">
          💡 Tip: Klik "Rakit 1" untuk membuat satu item. Gunakan "Rakit Maks" atau tahan Shift saat mengklik untuk merakit semua bahan sekaligus.
        </p>
      </section>

      ${autoSectionHtml}
    `;
  }

  renderStandardMachine(m, recipes, image) {
    const status = m.outputs.length
      ? 'Hasil siap diangkut'
      : m.isProcessing
        ? 'Sedang bekerja'
        : 'Menunggu bahan';

    const inputs = [...new Set(recipes.flatMap(r => Object.keys(r.inputs)))];
    const active = document.activeElement?.dataset?.item;

    this.root.innerHTML = `
      <div class="machine-portrait">
        ${image ? `<img width="96" height="96" alt="${label(m.type)}" src="${image}">` : ''}
        <div>
          <span class="eyebrow">STATUS LINI</span>
          <h3>${status}</h3>
          <p>${this._machineId}</p>
        </div>
      </div>

      <section class="inspector-section">
        <h3>Proses</h3>
        <p>${m.activeRecipeName || 'Masukkan bahan sesuai resep atau gunakan tombol rakit.'}</p>
        <progress max="100" value="${m.progress}" aria-label="Progres produksi"></progress>
      </section>

      <section class="inspector-section">
        <h3>Bahan masuk</h3>
        <div class="machine-inputs">
          ${inputs.map(id => {
            const stored = m.inputs.find(i => i.id === id)?.count || 0;
            const have = this.inventorySystem.getItemCount(id);
            return `
              <div class="machine-item">
                ${pixelIcon(id)}
                <div>
                  <strong>${label(id)}</strong>
                  <small>Mesin ${stored} · Tas ${have}</small>
                </div>
                <button data-machine-action="deposit" data-item="${id}" ${!have ? 'disabled' : ''}>Isi 1</button>
              </div>
            `;
          }).join('')}
        </div>
        <small>Shift + klik untuk memasukkan semua.</small>
      </section>

      <section class="inspector-section">
        <h3>Hasil produksi</h3>
        ${m.outputs.length ? m.outputs.map(o => `
          <div class="machine-item">
            ${pixelIcon(o.id)}
            <span>${o.count} × ${label(o.id)}</span>
          </div>
        `).join('') : '<p>Belum ada hasil.</p>'}
        <button data-machine-action="retrieve" ${!m.outputs.length ? 'disabled' : ''}>Ambil hasil</button>
      </section>

      <section class="inspector-section">
        <h3>Resep & Perakitan Langsung</h3>
        <div class="crafting-recipes-list">
          ${recipes.map(r => {
            const check = this.machineSystem.checkCraftRequirements(r, this.inventorySystem, this._machineId);
            const reqText = Object.entries(r.inputs).map(([id, n]) => `${n} ${label(id)}`).join(' + ');
            const outText = `${r.output.count} ${label(r.output.id)}`;
            const recipeKey = r.id || r.output.id;
            return `
              <div class="machine-item" style="padding: 6px 0;">
                <div>
                  <strong>${outText}</strong>
                  <small>${reqText}</small>
                </div>
                ${check.canCraft ? `
                  <button data-machine-action="craft" data-recipe="${recipeKey}" data-qty="1" class="btn-craft-primary" style="margin-left: auto;">Rakit 1</button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    if (active) {
      this.root.querySelector(`[data-item="${active}"]`)?.focus({ preventScroll: true });
    }
  }

  destroy() {
    this.hide();
    this.timer.remove();
    this.root.removeEventListener('click', this.onClick);
  }
}
