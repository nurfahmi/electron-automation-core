'use strict';

const { safeAttachDebugger, safeDetachDebugger, cdpSend } = require('./utils');

class Network {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
    this._enabled = false;
    this._interceptHandler = null;
    this._onRequestPaused = null;
  }

  /**
   * Enable network domain via CDP.
   */
  async enable() {
    if (this._enabled) return;
    await safeAttachDebugger(this._wc);
    await cdpSend(this._wc, 'Network.enable');
    this._enabled = true;
  }

  /**
   * Disable network domain via CDP.
   */
  async disable() {
    if (!this._enabled) return;
    try {
      await cdpSend(this._wc, 'Network.disable');
    } catch (err) {
      // ignore
    }
    this._enabled = false;
  }

  /**
   * Block specific resource types (e.g. ['Image', 'Media', 'Font']).
   */
  async blockResourceTypes(typesArray) {
    await this.enable();
    await cdpSend(this._wc, 'Network.setBlockedURLs', { urls: [] }); // clear first

    // Use Fetch domain to intercept and block by resource type
    await cdpSend(this._wc, 'Fetch.enable', {
      patterns: typesArray.map((type) => ({
        resourceType: type,
        requestStage: 'Request',
      })),
    });

    // Remove old listener if any
    if (this._onRequestPaused) {
      this._wc.debugger.removeListener('message', this._onRequestPaused);
    }

    this._onRequestPaused = (event, method, params) => {
      if (method === 'Fetch.requestPaused') {
        if (typesArray.includes(params.resourceType)) {
          cdpSend(this._wc, 'Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'BlockedByClient',
          }).catch(() => {});
        } else {
          cdpSend(this._wc, 'Fetch.continueRequest', {
            requestId: params.requestId,
          }).catch(() => {});
        }
      }
    };
    this._wc.debugger.on('message', this._onRequestPaused);
  }

  /**
   * Set extra HTTP headers.
   */
  async setExtraHTTPHeaders(headers) {
    await this.enable();
    await cdpSend(this._wc, 'Network.setExtraHTTPHeaders', { headers });
  }

  /**
   * Intercept all requests with a custom handler.
   * Handler receives (params) and must return { action: 'continue' } or { action: 'block' }
   * or { action: 'modify', url?, headers? }.
   */
  async interceptRequests(handler) {
    await this.enable();
    this._interceptHandler = handler;

    await cdpSend(this._wc, 'Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });

    // Remove old listener if any
    if (this._onRequestPaused) {
      this._wc.debugger.removeListener('message', this._onRequestPaused);
    }

    this._onRequestPaused = async (event, method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (!this._interceptHandler) {
        await cdpSend(this._wc, 'Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        return;
      }
      try {
        const result = await this._interceptHandler(params);
        if (!result || result.action === 'continue') {
          const opts = { requestId: params.requestId };
          if (result && result.url) opts.url = result.url;
          if (result && result.headers) {
            opts.headers = Object.entries(result.headers).map(([name, value]) => ({ name, value }));
          }
          await cdpSend(this._wc, 'Fetch.continueRequest', opts);
        } else if (result.action === 'block') {
          await cdpSend(this._wc, 'Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'BlockedByClient',
          });
        }
      } catch (err) {
        // Fail-safe: continue the request
        await cdpSend(this._wc, 'Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      }
    };
    this._wc.debugger.on('message', this._onRequestPaused);
  }

  /**
   * Get response body for a given requestId.
   */
  async getResponseBody(requestId) {
    await this.enable();
    return cdpSend(this._wc, 'Network.getResponseBody', { requestId });
  }

  /**
   * Clean up listeners.
   */
  destroy() {
    if (this._onRequestPaused) {
      try {
        this._wc.debugger.removeListener('message', this._onRequestPaused);
      } catch (err) {
        // ignore
      }
      this._onRequestPaused = null;
    }
    this._interceptHandler = null;
    this._enabled = false;
  }
}

module.exports = Network;
