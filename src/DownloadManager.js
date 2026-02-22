'use strict';

const path = require('path');
const { sleep } = require('./utils');

class DownloadManager {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
    this._session = webContents.session;
    this._enabled = false;
    this._downloadPath = null;
    this._handler = null;
    this._downloads = new Map();
    this._onWillDownload = null;
    this._downloadCounter = 0;
  }

  /**
   * Enable download handling.
   * @param {object} [options]
   * @param {string} [options.savePath] - Default save directory.
   * @param {boolean} [options.autoAccept=true] - Auto-accept downloads.
   * @param {function} [options.handler] - Custom handler: (info) => { accept: bool, savePath?: string }
   */
  enable(options = {}) {
    if (this._enabled) return;

    this._downloadPath = options.savePath || null;
    this._handler = options.handler || null;
    const autoAccept = options.autoAccept !== false;

    this._onWillDownload = (_event, item, _wc) => {
      const id = `dl_${++this._downloadCounter}`;
      const info = {
        id,
        url: item.getURL(),
        filename: item.getFilename(),
        mimeType: item.getMimeType(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        state: 'progressing',
        savePath: null,
        item,
      };

      let accept = autoAccept;
      let savePath = this._downloadPath
        ? path.join(this._downloadPath, info.filename)
        : null;

      if (this._handler) {
        try {
          const result = this._handler({
            id: info.id,
            url: info.url,
            filename: info.filename,
            mimeType: info.mimeType,
            totalBytes: info.totalBytes,
          });
          if (result) {
            accept = result.accept !== false;
            if (result.savePath) savePath = result.savePath;
          }
        } catch {
          // fallback to defaults
        }
      }

      if (!accept) {
        item.cancel();
        info.state = 'cancelled';
        this._downloads.set(id, info);
        return;
      }

      if (savePath) {
        item.setSavePath(savePath);
        info.savePath = savePath;
      }

      this._downloads.set(id, info);

      item.on('updated', (_event, state) => {
        info.receivedBytes = item.getReceivedBytes();
        info.state = state; // 'progressing' or 'interrupted'
      });

      item.once('done', (_event, state) => {
        info.receivedBytes = item.getReceivedBytes();
        info.state = state; // 'completed', 'cancelled', 'interrupted'
        info.savePath = item.getSavePath();
      });
    };

    this._session.on('will-download', this._onWillDownload);
    this._enabled = true;
  }

  /**
   * Disable download handling.
   */
  disable() {
    if (!this._enabled) return;
    if (this._onWillDownload) {
      try {
        this._session.removeListener('will-download', this._onWillDownload);
      } catch {
        // ignore
      }
      this._onWillDownload = null;
    }
    this._enabled = false;
  }

  /**
   * Trigger a download by URL.
   */
  downloadURL(url) {
    this._wc.downloadURL(url);
  }

  /**
   * Get all downloads info.
   */
  getAll() {
    const result = [];
    for (const [, info] of this._downloads) {
      result.push({
        id: info.id,
        url: info.url,
        filename: info.filename,
        mimeType: info.mimeType,
        totalBytes: info.totalBytes,
        receivedBytes: info.receivedBytes,
        state: info.state,
        savePath: info.savePath,
      });
    }
    return result;
  }

  /**
   * Get a specific download by id.
   */
  get(id) {
    const info = this._downloads.get(id);
    if (!info) return null;
    return {
      id: info.id,
      url: info.url,
      filename: info.filename,
      totalBytes: info.totalBytes,
      receivedBytes: info.receivedBytes,
      state: info.state,
      savePath: info.savePath,
    };
  }

  /**
   * Cancel a download by id.
   */
  cancel(id) {
    const info = this._downloads.get(id);
    if (!info || !info.item) return false;
    try {
      info.item.cancel();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for a download to complete.
   * @param {string} id
   * @param {number} timeout
   */
  async waitForDownload(id, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const info = this._downloads.get(id);
      if (info && (info.state === 'completed' || info.state === 'cancelled' || info.state === 'interrupted')) {
        return this.get(id);
      }
      await sleep(200);
    }
    throw new Error(`Download ${id} timed out after ${timeout}ms`);
  }

  /**
   * Destroy and clean up.
   */
  destroy() {
    // Cancel all active downloads
    for (const [, info] of this._downloads) {
      if (info.state === 'progressing' && info.item) {
        try { info.item.cancel(); } catch { /* ignore */ }
      }
    }
    this.disable();
    this._downloads.clear();
  }
}

module.exports = DownloadManager;
