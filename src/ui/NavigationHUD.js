import { formatCoord } from '../systems/NavigationSystem.js';
import ZoneMap from '../systems/ZoneMap.js';
import { ZONE_LABELS, UNKNOWN_ZONE_LABEL, TILE_SIZE, GRID_COLS, GRID_ROWS } from '../config/constants.js';
import { MAP_COLORS, pickScale, drawTerrain, drawView } from './MapRenderer.js';

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
 * NavigationHUD — Manages the live coordinates chip HUD in the bottom-left corner (#nav-cluster),
 * the 60x60 minimap thumbnail canvas, and the expanded World Map modal (#map-popup).
 */
export default class NavigationHUD {
  /**
   * @param {object} scene - Game scene instance
   * @param {import('../systems/NavigationSystem.js').default} navigationSystem
   */
  constructor(scene, navigationSystem) {
    this.scene = scene;
    this.navigationSystem = navigationSystem;

    // DOM references: Cluster & Coordinates Chip
    this.clusterEl = typeof document !== 'undefined' ? document.getElementById('nav-cluster') : null;
    this.coordsBtn = typeof document !== 'undefined' ? document.getElementById('nav-coords') : null;
    this.zEl = typeof document !== 'undefined' ? document.getElementById('nav-z') : null;
    this.xEl = typeof document !== 'undefined' ? document.getElementById('nav-x') : null;
    this.yEl = typeof document !== 'undefined' ? document.getElementById('nav-y') : null;

    // DOM references: Minimap thumbnail
    this.minimapBtn = typeof document !== 'undefined' ? document.getElementById('nav-minimap-btn') : null;
    this.minimapCanvas = typeof document !== 'undefined' ? document.getElementById('nav-minimap-canvas') : null;
    this.minimapCtx = this.minimapCanvas?.getContext?.('2d') || null;

    // DOM references: World actions map button
    this.worldMapBtn = typeof document !== 'undefined' ? document.getElementById('btn-workspace-map') : null;

    // DOM references: Big World Map popup
    this.mapPopup = typeof document !== 'undefined' ? document.getElementById('map-popup') : null;
    this.mapCanvas = typeof document !== 'undefined' ? document.getElementById('map-canvas') : null;
    this.mapCtx = this.mapCanvas?.getContext?.('2d') || null;
    this.hoverCoordsEl = typeof document !== 'undefined' ? document.getElementById('map-hover-coords') : null;
    this.hoverZoneEl = typeof document !== 'undefined' ? document.getElementById('map-hover-zone') : null;
    this.hoverEntityEl = typeof document !== 'undefined' ? document.getElementById('map-hover-entity') : null;
    this.copyPosBtn = typeof document !== 'undefined' ? document.getElementById('btn-map-copy-pos') : null;

    // Offscreen 60x60 base terrain canvas buffer
    this.terrainCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null;
    if (this.terrainCanvas) {
      this.terrainCanvas.width = GRID_COLS;
      this.terrainCanvas.height = GRID_ROWS;
    }
    this.terrainCtx = this.terrainCanvas?.getContext?.('2d') || null;

    this._terrainDirty = true;
    this._blinkOn = true;
    this._mapScale = 6;
    this._currentPos = { x: 0, y: 0, zoneKey: null, zoneLabel: '' };
    this._hoverPos = { x: -1, y: -1 };

    // Register with PanelManager if available
    if (this.scene?.panelManager && this.mapPopup) {
      this.scene.panelManager.register('map-popup', () => {
        // on close hook
      });
    }

    // Bound listeners
    this._onPositionChanged = (pos) => {
      this.update(pos);
      this.render();
    };
    this._onMarkersChanged = () => {
      this._terrainDirty = true;
      this.render();
    };
    this._onRevealChanged = () => {
      this._terrainDirty = true;
      this.render();
    };
    this._onClickCoords = () => this.copyCoordinates();
    this._onOpenMap = () => this.openWorldMap();
    this._onMapKeydown = (e) => {
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        this.closeWorldMap();
      }
    };
    this._onMapPointerMove = (e) => this._handleMapHover(e);
    this._onMapCanvasClick = (e) => this._handleMapClick(e);
    this._onCopyPosClick = () => this.copyCoordinates();
    this._onPixelResize = () => this._updateMapScale();

    // Attach DOM event listeners
    if (this.coordsBtn) {
      this.coordsBtn.addEventListener('click', this._onClickCoords);
    }
    if (this.minimapBtn) {
      this.minimapBtn.addEventListener('click', this._onOpenMap);
    }
    if (this.worldMapBtn) {
      this.worldMapBtn.addEventListener('click', this._onOpenMap);
    }
    if (this.mapPopup) {
      this.mapPopup.addEventListener('keydown', this._onMapKeydown);
    }
    if (this.mapCanvas) {
      this.mapCanvas.addEventListener('pointermove', this._onMapPointerMove);
      this.mapCanvas.addEventListener('click', this._onMapCanvasClick);
    }
    if (this.copyPosBtn) {
      this.copyPosBtn.addEventListener('click', this._onCopyPosClick);
    }

    // Attach NavigationSystem events
    if (this.navigationSystem?.events) {
      this.navigationSystem.events.on('position-changed', this._onPositionChanged);
      this.navigationSystem.events.on('markers-changed', this._onMarkersChanged);
      this.navigationSystem.events.on('reveal-changed', this._onRevealChanged);
    }

    // Listen for Phaser pixel-resize
    if (this.scene?.game?.events) {
      this.scene.game.events.on('pixel-resize', this._onPixelResize);
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

    // Periodic 250ms render loop (player blink, camera rect, drone motion)
    this._reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    this._renderTimer = null;
    if (this.scene?.time?.addEvent) {
      this._renderTimer = this.scene.time.addEvent({
        delay: 250,
        loop: true,
        callback: () => {
          if (!this._reducedMotion) {
            this._blinkOn = !this._blinkOn;
          }
          this.render();
        },
      });
    }

    // Initial populate & render
    if (this.navigationSystem) {
      this.update(this.navigationSystem.getPlayerPosition());
    }
    this._updateMapScale();
    this.render();

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
   * Check if map popup modal is currently open.
   * @returns {boolean}
   */
  isWorldMapOpen() {
    return Boolean(this.mapPopup && this.mapPopup.dataset.open === 'true');
  }

  /**
   * Open the World Map popup modal.
   */
  openWorldMap() {
    if (this.scene?.panelManager) {
      this.scene.panelManager.open('map-popup', this.minimapBtn || this.worldMapBtn);
    } else if (this.mapPopup) {
      this.mapPopup.hidden = false;
      this.mapPopup.dataset.open = 'true';
    }
    this._updateMapScale();
    this.render(true);
  }

  /**
   * Close the World Map popup modal.
   */
  closeWorldMap() {
    if (this.scene?.panelManager) {
      this.scene.panelManager.close();
    } else if (this.mapPopup) {
      this.mapPopup.hidden = true;
      this.mapPopup.dataset.open = 'false';
    }
  }

  /**
   * Toggle between open and closed state for the World Map.
   */
  toggleWorldMap() {
    if (this.isWorldMapOpen()) {
      this.closeWorldMap();
    } else {
      this.openWorldMap();
    }
  }

  /**
   * Recalculate canvas size for the big world map modal.
   */
  _updateMapScale() {
    if (!this.mapCanvas || !this.mapPopup) return;
    const bodyW = this.mapPopup.clientWidth || 600;
    const bodyH = this.mapPopup.clientHeight || 480;

    // Reserve room for header and legend panel
    const availW = Math.max(200, bodyW - 250);
    const availH = Math.max(200, bodyH - 120);

    this._mapScale = pickScale(availW, availH, { min: 4, max: 10 });
    const targetDim = GRID_COLS * this._mapScale;

    if (this.mapCanvas.width !== targetDim || this.mapCanvas.height !== targetDim) {
      this.mapCanvas.width = targetDim;
      this.mapCanvas.height = targetDim;
    }
  }

  /**
   * Get the current viewport bounds in grid tile coordinates.
   * @returns {{ x: number, y: number, w: number, h: number }|null}
   */
  getCameraRect() {
    const cam = this.scene?.cameras?.main;
    if (!cam) return null;

    if (cam.worldView) {
      return {
        x: cam.worldView.x / TILE_SIZE,
        y: cam.worldView.y / TILE_SIZE,
        w: cam.worldView.width / TILE_SIZE,
        h: cam.worldView.height / TILE_SIZE,
      };
    }

    const zoom = cam.zoom || 1;
    return {
      x: (cam.scrollX || 0) / TILE_SIZE,
      y: (cam.scrollY || 0) / TILE_SIZE,
      w: (cam.width || 640) / (TILE_SIZE * zoom),
      h: (cam.height || 480) / (TILE_SIZE * zoom),
    };
  }

  /**
   * Main render dispatch for both minimap and big map modal.
   * @param {boolean} [force=false]
   */
  render(force = false) {
    if (typeof document !== 'undefined' && document.hidden && !force) {
      return;
    }

    const isMinimapActive = Boolean(this.minimapCanvas && this.minimapCtx);
    const isBigMapActive = this.isWorldMapOpen() && Boolean(this.mapCanvas && this.mapCtx);

    if (!isMinimapActive && !isBigMapActive && !force) {
      return;
    }

    // 1. Redraw base terrain if dirty
    if (this._terrainDirty && this.terrainCtx) {
      drawTerrain(this.terrainCtx, this.navigationSystem, this.scene?.gridManager);
      this._terrainDirty = false;
    }

    const markers = this.navigationSystem?.getMarkers ? this.navigationSystem.getMarkers() : [];
    const cameraRect = this.getCameraRect();
    const blinkOn = this._reducedMotion ? true : this._blinkOn;

    // 2. Draw Minimap thumbnail (scale = 1: 60x60 native px)
    if (isMinimapActive && this.minimapCtx && this.terrainCanvas) {
      drawView(this.minimapCtx, this.terrainCanvas, markers, {
        scale: 1,
        cameraRect,
        blinkOn,
      });
    }

    // 3. Draw Big World Map (scale = 4..10)
    if (isBigMapActive && this.mapCtx && this.terrainCanvas) {
      drawView(this.mapCtx, this.terrainCanvas, markers, {
        scale: this._mapScale,
        cameraRect,
        blinkOn,
      });
    }
  }

  /**
   * Handle hovering over the interactive big world map.
   * @param {PointerEvent} event
   */
  _handleMapHover(event) {
    if (!this.mapCanvas) return;
    const rect = this.mapCanvas.getBoundingClientRect();
    const scale = this._mapScale || 6;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const tileX = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(offsetX / scale)));
    const tileY = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(offsetY / scale)));

    this._hoverPos = { x: tileX, y: tileY };

    if (this.hoverCoordsEl) {
      this.hoverCoordsEl.textContent = `X ${formatCoord(tileX)} · Y ${formatCoord(tileY)}`;
    }

    const zoneKey = ZoneMap.getZoneAt(tileX, tileY);
    const zoneLabel = (zoneKey && ZONE_LABELS[zoneKey]) || UNKNOWN_ZONE_LABEL;
    const isRevealed = this.navigationSystem?.isRevealed ? this.navigationSystem.isRevealed(zoneKey) : true;

    if (this.hoverZoneEl) {
      this.hoverZoneEl.textContent = isRevealed ? zoneLabel : `${zoneLabel} (Terkunci)`;
    }

    // Check for entity at hovered tile
    if (this.hoverEntityEl) {
      const markers = this.navigationSystem?.getMarkers ? this.navigationSystem.getMarkers() : [];
      const foundMarker = markers.find(m =>
        tileX >= m.x && tileX < m.x + (m.w || 1) &&
        tileY >= m.y && tileY < m.y + (m.h || 1)
      );

      if (foundMarker) {
        this.hoverEntityEl.textContent = foundMarker.label;
      } else if (ZoneMap.isFenceTile(tileX, tileY)) {
        this.hoverEntityEl.textContent = 'Pagar Pembatas';
      } else {
        const tile = this.scene?.gridManager?.getTile ? this.scene.gridManager.getTile(tileX, tileY) : null;
        if (tile && isRevealed) {
          if (tile.isOre || tile.oreType === 'depleted') {
            this.hoverEntityEl.textContent = 'Batu Tambang Ore';
          } else if (tile.isConveyor) {
            this.hoverEntityEl.textContent = 'Belt Conveyor';
          } else if (tile.isBuilding || tile.isMachine) {
            this.hoverEntityEl.textContent = 'Bangunan';
          } else if (tile.plant) {
            this.hoverEntityEl.textContent = 'Tanaman Ladang';
          } else {
            this.hoverEntityEl.textContent = 'Lahan Terbuka';
          }
        } else {
          this.hoverEntityEl.textContent = isRevealed ? 'Lahan Terbuka' : 'Kabut Belum Dijelajahi';
        }
      }
    }
  }

  /**
   * Handle clicking on the big world map to copy coordinates.
   * @param {PointerEvent} event
   */
  _handleMapClick(event) {
    if (!this.mapCanvas) return;
    const rect = this.mapCanvas.getBoundingClientRect();
    const scale = this._mapScale || 6;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const tileX = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(offsetX / scale)));
    const tileY = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(offsetY / scale)));

    const text = `${tileX}, ${tileY}`;
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
   * Format text for copying player's coordinates.
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
   * Destroy all listeners and reset CSS variable.
   */
  destroy() {
    if (this.coordsBtn && this._onClickCoords) {
      this.coordsBtn.removeEventListener('click', this._onClickCoords);
    }
    if (this.minimapBtn && this._onOpenMap) {
      this.minimapBtn.removeEventListener('click', this._onOpenMap);
    }
    if (this.worldMapBtn && this._onOpenMap) {
      this.worldMapBtn.removeEventListener('click', this._onOpenMap);
    }
    if (this.mapPopup && this._onMapKeydown) {
      this.mapPopup.removeEventListener('keydown', this._onMapKeydown);
    }
    if (this.mapCanvas) {
      this.mapCanvas.removeEventListener('pointermove', this._onMapPointerMove);
      this.mapCanvas.removeEventListener('click', this._onMapCanvasClick);
    }
    if (this.copyPosBtn && this._onCopyPosClick) {
      this.copyPosBtn.removeEventListener('click', this._onCopyPosClick);
    }

    if (this.navigationSystem?.events) {
      this.navigationSystem.events.off?.('position-changed', this._onPositionChanged);
      this.navigationSystem.events.off?.('markers-changed', this._onMarkersChanged);
      this.navigationSystem.events.off?.('reveal-changed', this._onRevealChanged);
    }

    if (this.scene?.game?.events && this._onPixelResize) {
      this.scene.game.events.off?.('pixel-resize', this._onPixelResize);
    }

    if (this._renderTimer) {
      this._renderTimer.remove?.();
      this._renderTimer = null;
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
