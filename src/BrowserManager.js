'use strict';

const { BrowserView } = require('electron');
const ElectronPage = require('./ElectronPage');
const ProfileManager = require('./ProfileManager');
const GridManager = require('./GridManager');
const { safeDetachDebugger } = require('./utils');

class BrowserManager {
  /**
   * @param {Electron.BrowserWindow} mainWindow
   */
  constructor(mainWindow) {
    if (!mainWindow) throw new Error('mainWindow is required');
    this._mainWindow = mainWindow;

    /** @type {Map<string, { view: Electron.BrowserView, page: ElectronPage }>} */
    this._profiles = new Map();

    this._profileManager = new ProfileManager();
    this._gridManager = new GridManager(mainWindow);
  }

  /** @returns {GridManager} */
  get grid() { return this._gridManager; }

  /**
   * Create a new profile with a BrowserView.
   * @param {string} profileId
   * @param {object} [options]
   * @param {string} [options.proxy] - Proxy rules e.g. "http://proxy:8080"
   * @param {string} [options.userAgent]
   * @param {boolean} [options.disableImages] - Block image/media loading
   * @param {boolean} [options.disableAnimations] - Inject CSS to disable animations
   * @returns {ElectronPage}
   */
  createProfile(profileId, options = {}) {
    if (this._profiles.has(profileId)) {
      return this._profiles.get(profileId).page;
    }

    // Create session profile
    const profile = this._profileManager.create(profileId, {
      proxy: options.proxy,
      userAgent: options.userAgent,
    });

    // Create BrowserView with partition
    const view = new BrowserView({
      webPreferences: {
        partition: profile.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    // Set user agent if provided
    if (options.userAgent) {
      view.webContents.setUserAgent(options.userAgent);
    }

    // Add view to window
    this._mainWindow.addBrowserView(view);

    // Create automation page
    const page = new ElectronPage(view, {
      disableImages: options.disableImages || false,
      disableAnimations: options.disableAnimations || false,
    });

    this._profiles.set(profileId, { view, page });

    // Register with grid
    this._gridManager.addView(profileId, view);
    this._gridManager.autoGrid();

    return page;
  }

  /**
   * Destroy a profile and its BrowserView.
   */
  async destroyProfile(profileId) {
    const entry = this._profiles.get(profileId);
    if (!entry) return;

    const { view, page } = entry;

    // Destroy page (removes listeners, detaches debugger)
    page.destroy();

    // Remove from grid
    this._gridManager.removeView(profileId);

    // Remove view from window
    try {
      this._mainWindow.removeBrowserView(view);
    } catch {
      // ignore if window already closed
    }

    // Destroy the webContents
    try {
      view.webContents.close();
    } catch {
      // ignore
    }

    // Destroy profile session data
    await this._profileManager.destroy(profileId);

    this._profiles.delete(profileId);

    // Re-layout remaining views
    if (this._profiles.size > 0) {
      this._gridManager.autoGrid();
    }
  }

  /**
   * Get ElectronPage for a profile.
   */
  getProfile(profileId) {
    const entry = this._profiles.get(profileId);
    return entry ? entry.page : null;
  }

  /**
   * List all profile IDs.
   */
  listProfiles() {
    return Array.from(this._profiles.keys());
  }

  /**
   * Destroy all profiles and clean up.
   */
  async cleanup() {
    const ids = this.listProfiles();
    for (const id of ids) {
      await this.destroyProfile(id);
    }
    this._gridManager.destroy();
  }
}

module.exports = BrowserManager;
