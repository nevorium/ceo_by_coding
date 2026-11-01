/**
 * @fileoverview TutorialSystem — RPG Step-by-Step interactive guide for new players.
 * Features Eli NPC guidance, objective tracking, directional highlights,
 * and completion rewards. Automatically skipped for returning/existing players.
 */

import UniversalEventEmitter from '../utils/EventEmitter.js';
import { TILE_SIZE } from '../config/constants.js';

export const TUTORIAL_STORAGE_KEY = 'droneharvest_tutorial_completed';

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: 'movement',
    badge: 'LANGKAH 1/6',
    title: 'Gerakan Dasar Pilot',
    dialog: 'Halo Pilot baru! Selamat datang di DroneHarvest. Sebelum mulai memprogram drone otonom, biasakan kakimu berjalan di lahan Starter Farm ini.',
    objective: 'Gunakan tombol [W][A][S][D] atau tombol Panah untuk melangkah.',
    actionHint: 'Tekan W, A, S, atau D',
    requiredCount: 3,
    targetType: 'movement',
  },
  {
    id: 'till_soil',
    badge: 'LANGKAH 2/6',
    title: 'Menggemburkan Tanah (Plow)',
    dialog: 'Bagus! Tanah rumput hijau ini butuh dicangkul agar gembur. Pilih Cangkul di Hotbar slot 1, hadapkan badan ke petak rumput, lalu cangkul!',
    objective: 'Pilih Cangkul (tekan [1] atau klik Slot 1 Hotbar), lalu tekan [SPACE] atau klik tanah rumput.',
    actionHint: 'Pilih Slot 1, lalu tekan [SPACE]',
    hotbarSlot: 0,
    targetType: 'till',
  },
  {
    id: 'water_soil',
    badge: 'LANGKAH 3/6',
    title: 'Menyiram Tanah (Watering Can)',
    dialog: 'Tanah gembur butuh air segar agar bibit bisa bertunas. Ambil Penyiram di Hotbar slot 2 dan siram petak tadi.',
    objective: 'Pilih Penyiram (tekan [2] atau klik Slot 2 Hotbar), lalu tekan [SPACE] pada tanah cangkulan.',
    actionHint: 'Pilih Slot 2, lalu tekan [SPACE]',
    hotbarSlot: 1,
    targetType: 'water',
  },
  {
    id: 'plant_seed',
    badge: 'LANGKAH 4/6',
    title: 'Menanam Benih Gandum (Seed)',
    dialog: 'Tanah sudah basah dan subur! Sekarang ambil Benih Gandum di Hotbar slot 4 untuk ditanam di petak basah tersebut.',
    objective: 'Pilih Benih Gandum (tekan [4] atau klik Slot 4 Hotbar), lalu tekan [SPACE] pada tanah basah.',
    actionHint: 'Pilih Slot 4, lalu tekan [SPACE]',
    hotbarSlot: 3,
    targetType: 'plant',
  },
  {
    id: 'visit_warehouse',
    badge: 'LANGKAH 5/6',
    title: 'Gudang Logistik (Warehouse HQ)',
    dialog: 'Keren! Semua hasil panen, batu tambang, dan material disimpan di Gudang Pusat (Warehouse HQ di utara). Dekati dan periksa!',
    objective: 'Berjalan mendekati Gudang di koordinat (10, 2) dan tekan [E] untuk membuka Storage Dock.',
    actionHint: 'Dekati Gudang lalu tekan [E]',
    targetTile: { x: 10, y: 2 },
    targetType: 'warehouse',
  },
  {
    id: 'run_drone_code',
    badge: 'LANGKAH 6/6',
    title: 'Otomasi Drone Pertama (▶ RUN)',
    dialog: 'Inilah keajaiban teknologi kita: Drone Pertanian Otonom! Buka panel kode di sebelah kanan, lalu klik tombol ▶ RUN untuk mengaktifkannya!',
    objective: 'Klik tombol [▶ RUN] di panel kontrol editor sebelah kanan.',
    actionHint: 'Klik tombol [▶ RUN]',
    targetSelector: '#btn-run',
    targetType: 'run_code',
  },
]);

export const TUTORIAL_REWARD = Object.freeze({
  coins: 150,
  xp: 50,
});

export default class TutorialSystem {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.events = new UniversalEventEmitter();
    this.currentStepIndex = 0;
    this.completed = false;
    this.stepProgress = 0;
    this.lastTile = null;

    // UI elements
    this.containerEl = null;
    this.titleEl = null;
    this.badgeEl = null;
    this.dialogEl = null;
    this.objectiveEl = null;
    this.progressFillEl = null;
    this.pointerEl = null;
    this.worldIndicator = null;

    // Check if tutorial was already completed
    if (TutorialSystem.isTutorialCompleted()) {
      this.completed = true;
    }
  }

  /** Check if tutorial is permanently marked completed in local storage */
  static isTutorialCompleted() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Verify if loaded save indicates an existing returning player.
   * If yes, automatically marks tutorial as completed so it never disturbs them.
   * @param {object} saveData
   * @returns {boolean} True if player is existing/returning.
   */
  static shouldSkipForReturningPlayer(saveData) {
    if (TutorialSystem.isTutorialCompleted()) return true;
    if (!saveData || typeof saveData !== 'object') return false;

    const profile = saveData.profile;
    const inv = saveData.inventory;
    const zones = saveData.unlockedZones;
    const grid = saveData.grid || [];
    const buildings = saveData.buildings || [];
    const machines = saveData.machines || [];

    const isProgressed =
      (profile && (Number(profile.level) > 1 || Number(profile.xp) > 0)) ||
      (inv && Number(inv.coins) > 100) ||
      (zones && (zones.zone2 || zones.zone3 || zones.zone4 || zones.zone5)) ||
      grid.length > 0 ||
      buildings.length > 0 ||
      machines.length > 0 ||
      saveData.tutorial?.completed === true;

    if (isProgressed) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
        }
      } catch {}
      return true;
    }
    return false;
  }

  /** Initialize tutorial UI and start step 1 if not completed */
  startIfEligible(loadedSaveData = null) {
    if (this.completed || TutorialSystem.isTutorialCompleted()) {
      this.completed = true;
      return;
    }

    if (TutorialSystem.shouldSkipForReturningPlayer(loadedSaveData)) {
      this.markCompleted(false);
      return;
    }

    this._createDOM();
    this._renderCurrentStep();
    this._updateWorldIndicators();
    this.events.emit('tutorial-started');
  }

  /** Create DOM overlay for RPG dialog card */
  _createDOM() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('rpg-tutorial-container')) {
      this.containerEl = document.getElementById('rpg-tutorial-container');
      this._bindDOMRefs();
      return;
    }

    const container = document.createElement('div');
    container.id = 'rpg-tutorial-container';
    container.className = 'rpg-tutorial-box';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Panduan Tutorial RPG');

    container.innerHTML = `
      <div class="rpg-tutorial-card">
        <div class="rpg-tutorial-header">
          <div class="rpg-speaker-badge">
            <div class="rpg-eli-avatar">
              <span class="rpg-eli-pixel"></span>
              <span class="rpg-status-pulse"></span>
            </div>
            <div class="rpg-speaker-details">
              <span class="rpg-speaker-title">ELI · INSTRUKTUR PILOT</span>
              <span class="rpg-step-pill" id="rpg-tutorial-badge">LANGKAH 1/6</span>
            </div>
          </div>
          <button id="btn-skip-tutorial" class="rpg-btn-skip" title="Lewati seluruh tutorial">Lewati ⏩</button>
        </div>

        <div class="rpg-tutorial-body">
          <h4 id="rpg-tutorial-title" class="rpg-tutorial-title">Gerakan Dasar Pilot</h4>
          <p id="rpg-tutorial-dialog" class="rpg-tutorial-dialog">
            "Halo Pilot baru! Selamat datang di DroneHarvest..."
          </p>

          <div class="rpg-tutorial-task-card">
            <div class="rpg-task-info">
              <span class="rpg-task-icon" id="rpg-task-icon">🎯</span>
              <span id="rpg-tutorial-objective" class="rpg-task-label">Gunakan tombol [W][A][S][D] untuk melangkah.</span>
            </div>
            <div class="rpg-progress-track">
              <div id="rpg-tutorial-progress-fill" class="rpg-progress-fill" style="width: 16%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    this.containerEl = container;
    this._bindDOMRefs();
  }

  _bindDOMRefs() {
    if (typeof document === 'undefined') return;
    this.titleEl = document.getElementById('rpg-tutorial-title');
    this.badgeEl = document.getElementById('rpg-tutorial-badge');
    this.dialogEl = document.getElementById('rpg-tutorial-dialog');
    this.objectiveEl = document.getElementById('rpg-tutorial-objective');
    this.progressFillEl = document.getElementById('rpg-tutorial-progress-fill');

    const skipBtn = document.getElementById('btn-skip-tutorial');
    if (skipBtn) {
      skipBtn.onclick = (e) => {
        e.stopPropagation();
        this.skip();
      };
    }
  }

  /** Render current active step to RPG dialog */
  _renderCurrentStep() {
    if (this.completed) {
      this._hideDOM();
      return;
    }

    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (!step) {
      this.completeTutorial();
      return;
    }

    if (this.containerEl) {
      this.containerEl.style.display = 'block';
      this.containerEl.classList.remove('rpg-tutorial-hidden');
    }

    if (this.titleEl) this.titleEl.textContent = step.title;
    if (this.badgeEl) this.badgeEl.textContent = step.badge;
    if (this.dialogEl) this.dialogEl.textContent = `"${step.dialog}"`;
    if (this.objectiveEl) {
      if (step.targetType === 'movement') {
        this.objectiveEl.textContent = `${step.objective} (${this.stepProgress}/${step.requiredCount})`;
      } else {
        this.objectiveEl.textContent = step.objective;
      }
    }

    if (this.progressFillEl) {
      const pct = Math.round(((this.currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100);
      this.progressFillEl.style.width = `${pct}%`;
    }

    this._updateWorldIndicators();
  }

  /** Update pointer arrow in game world & highlights */
  _updateWorldIndicators() {
    if (this.completed || !this.scene?.add) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (!step) return;

    // Highlight target element or tile
    if (step.targetType === 'warehouse') {
      this._showWorldPointer(step.targetTile.x, step.targetTile.y, 'Gudang HQ [E]');
    } else if (step.targetType === 'till') {
      const facing = this.scene.player?.getFacingTile?.() || { x: 5, y: 6 };
      this._showWorldPointer(facing.x, facing.y, 'Cangkul [SPACE]');
    } else if (step.targetType === 'water') {
      const facing = this.scene.player?.getFacingTile?.() || { x: 5, y: 6 };
      this._showWorldPointer(facing.x, facing.y, 'Siram [SPACE]');
    } else if (step.targetType === 'plant') {
      const facing = this.scene.player?.getFacingTile?.() || { x: 5, y: 6 };
      this._showWorldPointer(facing.x, facing.y, 'Tanam [SPACE]');
    } else {
      this._clearWorldPointer();
    }
  }

  _showWorldPointer(tileX, tileY, label = '') {
    if (!this.scene.add) return;
    if (!this.worldIndicator) {
      const arrow = this.scene.add.text(0, 0, '⬇', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#63d8d1',
        stroke: '#101a21',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(200);

      const tag = this.scene.add.text(0, -22, label, {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '10px',
        color: '#e9bf62',
        backgroundColor: '#101a21',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(200);

      this.worldIndicator = { arrow, tag };

      // Bouncing tween
      this.scene.tweens?.add?.({
        targets: arrow,
        y: '+=8',
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const wx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = tileY * TILE_SIZE;

    this.worldIndicator.arrow.setPosition(wx, wy);
    this.worldIndicator.tag.setPosition(wx, wy - 22);
    this.worldIndicator.tag.setText(label);
    this.worldIndicator.arrow.setVisible(true);
    this.worldIndicator.tag.setVisible(true);
  }

  _clearWorldPointer() {
    if (this.worldIndicator) {
      this.worldIndicator.arrow?.destroy?.();
      this.worldIndicator.tag?.destroy?.();
      this.worldIndicator = null;
    }
  }

  /** Advance to next step with visual feedback */
  _advanceStep() {
    const prev = TUTORIAL_STEPS[this.currentStepIndex];
    this.stepProgress = 0;

    if (this.scene?._showFloatingText && this.scene.player) {
      this.scene._showFloatingText(this.scene.player.tileX, this.scene.player.tileY, '✓ Misi Selesai!', '#63d8d1');
    }
    if (this.scene?._emitFruitParticles && this.scene.player) {
      this.scene._emitFruitParticles(this.scene.player.tileX, this.scene.player.tileY);
    }

    this.currentStepIndex++;
    this.events.emit('step-completed', { step: prev, nextIndex: this.currentStepIndex });

    if (this.currentStepIndex >= TUTORIAL_STEPS.length) {
      this.completeTutorial();
    } else {
      this._renderCurrentStep();
    }
  }

  // ── Trigger Listeners ──

  onPlayerMove(tileX, tileY) {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id !== 'movement') return;

    if (!this.lastTile) {
      this.lastTile = { x: tileX, y: tileY };
      this.stepProgress++;
    } else if (this.lastTile.x !== tileX || this.lastTile.y !== tileY) {
      this.lastTile = { x: tileX, y: tileY };
      this.stepProgress++;
    } else {
      return;
    }

    if (this.objectiveEl) {
      this.objectiveEl.textContent = `${step.objective} (${this.stepProgress}/${step.requiredCount} langkah)`;
    }
    if (this.stepProgress >= step.requiredCount) {
      this._advanceStep();
    }
  }

  onTileTilled(x, y) {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id === 'till_soil') {
      this._advanceStep();
    }
  }

  onTileWatered(x, y) {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id === 'water_soil') {
      this._advanceStep();
    }
  }

  onSeedPlanted(x, y, seed) {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id === 'plant_seed') {
      this._advanceStep();
    }
  }

  onWarehouseOpened() {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id === 'visit_warehouse') {
      this._advanceStep();
    }
  }

  onDroneStarted() {
    if (this.completed) return;
    const step = TUTORIAL_STEPS[this.currentStepIndex];
    if (step?.id === 'run_drone_code') {
      this._advanceStep();
    }
  }

  /** Complete full tutorial and grant rewards */
  completeTutorial() {
    if (this.completed) return;
    this.completed = true;
    this.markCompleted(true);
    this._clearWorldPointer();

    // Deliver rewards
    if (this.scene.inventorySystem?.addCoins) {
      this.scene.inventorySystem.addCoins(TUTORIAL_REWARD.coins);
    }
    if (this.scene.profileSystem?.addXp) {
      this.scene.profileSystem.addXp(TUTORIAL_REWARD.xp);
    }

    this._showCompletionModal();
    this.events.emit('tutorial-completed');
    this.scene.saveSystem?.saveLocal?.();
  }

  /** Skip tutorial immediately */
  skip() {
    if (this.completed) return;
    this.completed = true;
    this.markCompleted(true);
    this._clearWorldPointer();
    this._hideDOM();

    if (this.scene.hud?.showMessage) {
      this.scene.hud.showMessage('Tutorial dilewati. Selamat bertani & bereksplorasi!', 3000);
    }
    this.events.emit('tutorial-skipped');
    this.scene.saveSystem?.saveLocal?.();
  }

  /** Mark completed in localStorage */
  markCompleted(saveToStorage = true) {
    this.completed = true;
    if (saveToStorage) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
        }
      } catch {}
    }
  }

  _hideDOM() {
    if (typeof document === 'undefined') return;
    if (this.containerEl) {
      this.containerEl.style.display = 'none';
      this.containerEl.classList.add('rpg-tutorial-hidden');
    }
    const modal = document.getElementById('rpg-tutorial-complete-modal');
    if (modal) modal.remove();
  }

  _showCompletionModal() {
    this._hideDOM();
    if (typeof document === 'undefined') return;

    const modal = document.createElement('div');
    modal.id = 'rpg-tutorial-complete-modal';
    modal.className = 'rpg-completion-modal';
    modal.innerHTML = `
      <div class="rpg-completion-card">
        <div class="rpg-completion-badge">🎖️ KELULUSAN PILOT</div>
        <h2 class="rpg-completion-title">Selamat! Pelatihan Pilot Selesai!</h2>
        <p class="rpg-completion-desc">
          "Hebat sekali! Kamu sudah menguasai dasar bertani dan otomasi drone. Sekarang kamu bebas menjelajahi 5 zona rahasia, menambang mineral, membangun rantai konveyor, dan menciptakan kerajaan agrikultur otomatis!"
        </p>
        <div class="rpg-reward-box">
          <span class="rpg-reward-item">💰 +150 Koin Emas</span>
          <span class="rpg-reward-item">🌟 +50 XP Pilot</span>
        </div>
        <button id="btn-close-tutorial-modal" class="rpg-btn-primary">Mulai Berpetualang! 🚀</button>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('btn-close-tutorial-modal');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.remove();
      };
    }
  }

  getSaveState() {
    return {
      completed: this.completed,
      currentStepIndex: this.currentStepIndex,
    };
  }

  loadSaveState(state, fullSaveData = null) {
    if (TutorialSystem.isTutorialCompleted() || TutorialSystem.shouldSkipForReturningPlayer(fullSaveData)) {
      this.completed = true;
      this._hideDOM();
      return;
    }

    if (state && typeof state === 'object') {
      if (state.completed) {
        this.completed = true;
        this.markCompleted(true);
        this._hideDOM();
      } else {
        this.currentStepIndex = Number(state.currentStepIndex) || 0;
      }
    }
  }

  destroy() {
    this._clearWorldPointer();
    this._hideDOM();
  }
}
