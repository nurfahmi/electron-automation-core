'use strict';

class GridManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   */
  constructor(mainWindow) {
    this._mainWindow = mainWindow;
    /** @type {Map<string, Electron.BrowserView>} */
    this._views = new Map();
    this._cols = 2;
    this._rows = 2;
    this._maximizedId = null;

    this._onResize = () => this._applyLayout();
    this._mainWindow.on('resize', this._onResize);
  }

  /**
   * Register a BrowserView for grid layout.
   */
  addView(profileId, view) {
    this._views.set(profileId, view);
  }

  /**
   * Remove a view from grid tracking.
   */
  removeView(profileId) {
    this._views.delete(profileId);
    if (this._maximizedId === profileId) {
      this._maximizedId = null;
    }
  }

  /**
   * Set grid dimensions.
   */
  setGrid(cols, rows) {
    this._cols = cols;
    this._rows = rows;
    this._maximizedId = null;
    this._applyLayout();
  }

  /**
   * Auto-calculate grid from view count.
   */
  autoGrid() {
    const count = this._views.size;
    if (count <= 1) { this._cols = 1; this._rows = 1; }
    else if (count <= 2) { this._cols = 2; this._rows = 1; }
    else if (count <= 4) { this._cols = 2; this._rows = 2; }
    else if (count <= 6) { this._cols = 3; this._rows = 2; }
    else if (count <= 9) { this._cols = 3; this._rows = 3; }
    else { this._cols = 5; this._rows = 2; }
    this._maximizedId = null;
    this._applyLayout();
  }

  /**
   * Maximize a single view.
   */
  maximize(profileId) {
    if (!this._views.has(profileId)) return;
    this._maximizedId = profileId;
    this._applyLayout();
  }

  /**
   * Restore grid after maximize.
   */
  restoreGrid() {
    this._maximizedId = null;
    this._applyLayout();
  }

  /**
   * Recalculate and apply bounds to all views.
   */
  _applyLayout() {
    const [winWidth, winHeight] = this._mainWindow.getContentSize();
    const views = Array.from(this._views.entries());

    if (this._maximizedId) {
      // Maximize one, hide others
      for (const [id, view] of views) {
        if (id === this._maximizedId) {
          view.setBounds({ x: 0, y: 0, width: winWidth, height: winHeight });
          view.setAutoResize({ width: true, height: true });
        } else {
          view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
          view.setAutoResize({ width: false, height: false });
        }
      }
      return;
    }

    const cols = this._cols;
    const rows = this._rows;
    const cellWidth = Math.floor(winWidth / cols);
    const cellHeight = Math.floor(winHeight / rows);

    let index = 0;
    for (const [, view] of views) {
      if (index >= cols * rows) {
        // Hide views that don't fit
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        view.setAutoResize({ width: false, height: false });
        index++;
        continue;
      }
      const col = index % cols;
      const row = Math.floor(index / cols);
      view.setBounds({
        x: col * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
      view.setAutoResize({ width: false, height: false });
      index++;
    }
  }

  /**
   * Clean up listeners.
   */
  destroy() {
    try {
      this._mainWindow.removeListener('resize', this._onResize);
    } catch {
      // ignore
    }
    this._views.clear();
  }
}

module.exports = GridManager;
