import { ZONE_LABELS, UNKNOWN_ZONE_LABEL } from '../config/constants.js';

/**
 * TeleporterUI — Manages the modal popup (#teleporter-popup) for viewing destination pads,
 * initiating travel, and renaming teleporter pads.
 */
export default class TeleporterUI {
  /**
   * @param {object} scene - GameScene instance
   */
  constructor(scene) {
    this.scene = scene;
    this.currentPadId = null;

    this.element = typeof document !== 'undefined' ? document.getElementById('teleporter-popup') : null;
    this.subtitleEl = typeof document !== 'undefined' ? document.getElementById('teleporter-subtitle') : null;
    this.nameInput = typeof document !== 'undefined' ? document.getElementById('teleporter-name-input') : null;
    this.saveNameBtn = typeof document !== 'undefined' ? document.getElementById('btn-save-teleporter-name') : null;
    this.listContainer = typeof document !== 'undefined' ? document.getElementById('teleporter-list') : null;

    if (this.scene?.panelManager && this.element) {
      this.scene.panelManager.register('teleporter-popup', () => {
        this.currentPadId = null;
      });
    }

    // Attach DOM listeners
    if (this.saveNameBtn) {
      this.saveNameBtn.addEventListener('click', () => this.handleSaveName());
    }
    if (this.nameInput) {
      this.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSaveName();
        }
      });
    }
    if (this.listContainer) {
      this.listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-dest-id]');
        if (btn) {
          const destId = btn.dataset.destId;
          this.handleTravel(destId);
        }
      });
    }

    if (this.scene?.events?.once) {
      this.scene.events.once('shutdown', () => this.destroy());
    }
  }

  isOpen() {
    return Boolean(this.element && this.element.dataset.open === 'true');
  }

  open(padId) {
    const pad = this.scene?.buildingSystem?.buildings?.get(padId);
    if (!pad) {
      this.scene?.hud?.showMessage?.('Teleporter tidak ditemukan.', 2000);
      return;
    }

    this.currentPadId = padId;

    if (this.nameInput) {
      this.nameInput.value = pad.name || '';
    }
    if (this.subtitleEl) {
      this.subtitleEl.textContent = `Pad Aktif: ${pad.name || 'TP-?'}`;
    }

    this.renderDestinations();

    if (this.scene?.panelManager) {
      this.scene.panelManager.open('teleporter-popup');
    } else if (this.element) {
      this.element.hidden = false;
      this.element.dataset.open = 'true';
    }
  }

  close() {
    if (this.scene?.panelManager) {
      this.scene.panelManager.close();
    } else if (this.element) {
      this.element.hidden = true;
      this.element.dataset.open = 'false';
      this.currentPadId = null;
    }
  }

  closeIfOpenFor(padId) {
    if (this.isOpen() && this.currentPadId === padId) {
      this.close();
    }
  }

  renderDestinations() {
    if (!this.listContainer) return;

    if (!this.scene?.teleportSystem) {
      this.listContainer.innerHTML = '<div class="teleporter-empty">Sistem teleporter belum aktif.</div>';
      return;
    }

    const destinations = this.scene.teleportSystem.getDestinations(this.currentPadId);

    if (destinations.length === 0) {
      this.listContainer.innerHTML = `
        <div class="teleporter-empty">
          Belum ada teleporter lain.<br>Pasang minimal dua untuk bisa berpindah.
        </div>
      `;
      return;
    }

    this.listContainer.innerHTML = destinations.map(dest => {
      const zoneName = (dest.zoneKey && ZONE_LABELS[dest.zoneKey]) || UNKNOWN_ZONE_LABEL;
      const isReachable = Boolean(dest.reachable);
      const actionHtml = isReachable
        ? `<button type="button" class="btn-teleport-travel" data-dest-id="${dest.id}">Teleport</button>`
        : `<span class="tp-locked-badge">✕ Terkunci</span>`;

      return `
        <div class="teleporter-item ${isReachable ? '' : 'is-locked'}">
          <div class="tp-info-main">
            <span class="tp-name">${dest.name || 'TP-?'}</span>
            <span class="tp-sub">${zoneName} · (${dest.x}, ${dest.y})</span>
          </div>
          <div class="tp-meta">
            <span class="tp-distance">±${dest.distance} petak</span>
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  handleTravel(destId) {
    if (!this.currentPadId || !destId || !this.scene?.teleportSystem) return;

    const dest = this.scene.buildingSystem?.buildings?.get(destId);
    const res = this.scene.teleportSystem.travel(this.currentPadId, destId);

    if (res.ok) {
      this.close();
      const destName = dest?.name || 'lokasi tujuan';
      this.scene.hud?.showMessage?.(`✨ Berpindah ke ${destName}!`, 2200);
    } else {
      const reasonMessages = {
        cooldown: 'Teleporter masih mengisi daya.',
        moving: 'Berhenti dulu sebelum teleport.',
        zone_locked: 'Zona tujuan belum terbuka.',
        blocked: 'Area tujuan terhalang. Kosongkan petak di sekitar teleporter tujuan.',
        missing: 'Teleporter tujuan tidak ditemukan.',
      };
      const msg = reasonMessages[res.reason] || 'Perjalanan teleport gagal.';
      this.scene.hud?.showMessage?.(msg, 2400);
    }
  }

  handleSaveName() {
    if (!this.currentPadId || !this.nameInput || !this.scene?.teleportSystem) return;

    const rawName = this.nameInput.value;
    const res = this.scene.teleportSystem.rename(this.currentPadId, rawName);

    if (res.ok) {
      this.scene.hud?.showMessage?.(`Nama teleporter diubah menjadi "${res.name}".`, 2200);
      if (this.subtitleEl) {
        this.subtitleEl.textContent = `Pad Aktif: ${res.name}`;
      }
      this.renderDestinations();
    } else if (res.reason === 'invalid_format') {
      this.scene.hud?.showMessage?.('Nama hanya boleh 1-16 huruf, angka, spasi, _, -', 2600);
    } else if (res.reason === 'duplicate') {
      this.scene.hud?.showMessage?.('Nama teleporter sudah digunakan. Pilih nama lain.', 2600);
    } else {
      this.scene.hud?.showMessage?.('Gagal mengubah nama teleporter.', 2000);
    }
  }

  destroy() {
    this.currentPadId = null;
  }
}
