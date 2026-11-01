/** One modal at a time, with focus restoration and a shared input lock. */
export default class PanelManager {
  constructor(scene) {
    this.scene = scene;
    this.panels = new Map();
    this.current = null;
    this.opener = null;
    this.onKey = event => {
      if (!this.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
      if (event.key !== 'Tab') return;
      const root = this.panels.get(this.current).element;
      const controls = [...root.querySelectorAll('button,input,select,textarea,[tabindex="0"],summary')]
        .filter(e => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!controls.length) { event.preventDefault(); root.focus(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', this.onKey, true);
    scene.events.once('shutdown', () => this.destroy());
    document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => this.close()));
  }
  register(id, onClose = () => {}) {
    const element = document.getElementById(id);
    element.classList.add('rpg-panel');
    element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true');
    if (!element.hasAttribute('aria-labelledby')) element.setAttribute('aria-label', ({ 'backpack-popup':'Tas penjelajah', 'warehouse-popup':'Gudang', 'smartphone-chat':'Ponsel' })[id] || 'Menu');
    element.tabIndex = -1; element.inert = true;
    this.panels.set(id, { element, onClose });
  }
  open(id, opener = document.activeElement) {
    if (!this.panels.has(id)) return;
    const original = this.current ? this.opener : opener;
    this.close(false);
    const { element } = this.panels.get(id);
    this.current = id; this.opener = original;
    element.dataset.open = 'true'; element.classList.add('active'); element.classList.remove('collapsed');
    element.inert = false;
    this.scene.isModalOpen = true;
    requestAnimationFrame(() => {
      if (this.current !== id) return;
      (element.querySelector('[data-close-panel], button:not(:disabled)') || element).focus({ preventScroll: true });
    });
  }
  close(restoreFocus = true) {
    if (!this.current) return;
    const { element, onClose } = this.panels.get(this.current);
    delete element.dataset.open; element.classList.remove('active'); element.inert = true;
    this.current = null; this.scene.isModalOpen = false;
    onClose();
    if (restoreFocus && this.opener?.isConnected && this.opener.getClientRects().length) this.opener.focus({ preventScroll: true });
    else if (restoreFocus) document.getElementById('btn-toggle-editor')?.focus({ preventScroll: true });
  }
  updateHudZone() {
    const zones = {
      zone1: 'Kebun Perintis',
      zone2: 'Bengkel Artisan',
      zone3: 'Lembah Tambang',
      zone4: 'Laboratorium',
      zone5: 'Hutan Liar Selatan',
    };
    const zone = this.scene._getPlayerZone?.() || 'zone1';
    const el = document.getElementById('workspace-zone');
    if (el && el.dataset.zone !== zone) { el.textContent = zones[zone] || 'Zona Eksplorasi'; el.dataset.zone = zone; }
  }
  destroy() { document.removeEventListener('keydown', this.onKey, true); this.close(false); }
}
