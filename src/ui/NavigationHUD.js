import { formatCoord } from '../systems/NavigationSystem.js';

/**
 * Format a zone key into short label, e.g. 'zone1' -> 'Z1', null -> 'Z?'
 * @param {string|null} zoneKey
 * @returns {string}
 */
export function getZoneShortCode(zoneKey) {
  if (!zoneKey) return 'Z?';
  const match = zoneKey.match(/zone(\d+)/i);
  return match ? `Z${match[1]}` : 'Z?';
}

/**
 * NavigationHUD — Manages the live coordinates chip HUD in the bottom-left corner (#nav-cluster).
 * Updates DOM only when coordinate text changes, and handles clicking to copy coordinates.
 */
export default class NavigationHUD {
  /**
   * @param {object} scene - Game scene instance
   * @param {import('../systems/NavigationSystem.js').default} navigationSystem
   */
  constructor(scene, navigationSystem) {
    this.scene = scene;
    this.navigationSystem = navigationSystem;

    this.clusterEl = typeof document !== 'undefined' ? document.getElementById('nav-cluster') : null;
    this.coordsBtn = typeof document !== 'undefined' ? document.getElementById('nav-coords') : null;
    this.zEl = typeof document !== 'undefined' ? document.getElementById('nav-z') : null;
    this.xEl = typeof document !== 'undefined' ? document.getElementById('nav-x') : null;
    this.yEl = typeof document !== 'undefined' ? document.getElementById('nav-y') : null;

    this._currentPos = { x: 0, y: 0, zoneKey: null, zoneLabel: '' };
    this._onPositionChanged = (pos) => this.update(pos);
    this._onClickCoords = () => this.copyCoordinates();

    if (this.coordsBtn) {
      this.coordsBtn.addEventListener('click', this._onClickCoords);
    }

    if (this.navigationSystem?.events) {
      this.navigationSystem.events.on('position-changed', this._onPositionChanged);
    }

    // Measure height of cluster to dynamically raise tutorial box
    this.resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && this.clusterEl) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = Math.round(entry.contentRect.height);
          if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.style.setProperty('--nav-h', `${h}px`);
          }
        }
      });
      this.resizeObserver.observe(this.clusterEl);
    }

    // Initial populate
    if (this.navigationSystem) {
      this.update(this.navigationSystem.getPlayerPosition());
    }

    // Cleanup on scene shutdown
    if (this.scene?.events?.once) {
      this.scene.events.once('shutdown', () => this.destroy());
    }
  }

  /**
   * Update the coordinates chip text if values changed.
   * @param {{ x: number, y: number, zoneKey: string|null, zoneLabel: string }} pos
   */
  update(pos) {
    if (!pos) return;
    this._currentPos = pos;

    const zText = getZoneShortCode(pos.zoneKey);
    const xText = formatCoord(pos.x);
    const yText = formatCoord(pos.y);

    if (this.zEl && this.zEl.textContent !== zText) {
      this.zEl.textContent = zText;
    }
    if (this.xEl && this.xEl.textContent !== xText) {
      this.xEl.textContent = xText;
    }
    if (this.yEl && this.yEl.textContent !== yText) {
      this.yEl.textContent = yText;
    }
  }

  /**
   * Format text for copying to clipboard or scripts.
   * @returns {string} e.g. "5, 12"
   */
  getCopyText() {
    return `${this._currentPos.x}, ${this._currentPos.y}`;
  }

  /**
   * Copy player's current tile coordinates to clipboard.
   */
  copyCoordinates() {
    const text = this.getCopyText();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          this.scene?.hud?.showMessage?.(`Koordinat ${text} disalin`, 2000);
        })
        .catch(() => {
          this.scene?.hud?.showMessage?.(`Gagal menyalin koordinat`, 2000);
        });
    } else {
      this.scene?.hud?.showMessage?.(`Koordinat ${text}`, 2000);
    }
  }

  /**
   * Destroy listeners and reset CSS variable.
   */
  destroy() {
    if (this.coordsBtn && this._onClickCoords) {
      this.coordsBtn.removeEventListener('click', this._onClickCoords);
    }
    if (this.navigationSystem?.events && this._onPositionChanged) {
      this.navigationSystem.events.off?.('position-changed', this._onPositionChanged);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.removeProperty('--nav-h');
    }
  }
}
