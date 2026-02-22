'use strict';

const { safeAttachDebugger, cdpSend } = require('./utils');

class DialogHandler {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
    this._enabled = false;
    this._handler = null;
    this._onDialog = null;
    this._dialogHistory = [];
  }

  /**
   * Enable dialog handling via CDP.
   * @param {object} [options]
   * @param {boolean} [options.acceptAlerts=true] - Auto-accept alert()
   * @param {boolean} [options.acceptConfirms=true] - Auto-accept confirm()
   * @param {string} [options.promptText=''] - Default text for prompt()
   * @param {boolean} [options.acceptBeforeUnload=true] - Auto-accept beforeunload
   * @param {function} [options.handler] - Custom handler: (dialog) => { accept: bool, text: string }
   */
  async enable(options = {}) {
    if (this._enabled) return;
    await safeAttachDebugger(this._wc);
    await cdpSend(this._wc, 'Page.enable');

    this._handler = options.handler || null;
    this._defaultOptions = {
      acceptAlerts: options.acceptAlerts !== false,
      acceptConfirms: options.acceptConfirms !== false,
      promptText: options.promptText || '',
      acceptBeforeUnload: options.acceptBeforeUnload !== false,
    };

    this._onDialog = async (_event, method, params) => {
      if (method !== 'Page.javascriptDialogOpening') return;

      const dialog = {
        type: params.type,
        message: params.message,
        defaultPrompt: params.defaultPrompt || '',
        url: params.url || '',
        timestamp: Date.now(),
      };
      this._dialogHistory.push(dialog);

      let accept = true;
      let promptText = this._defaultOptions.promptText;

      if (this._handler) {
        try {
          const result = await this._handler(dialog);
          if (result) {
            accept = result.accept !== false;
            if (result.text !== undefined) promptText = result.text;
          }
        } catch {
          // fallback to defaults
        }
      } else {
        switch (params.type) {
          case 'alert':
            accept = this._defaultOptions.acceptAlerts;
            break;
          case 'confirm':
            accept = this._defaultOptions.acceptConfirms;
            break;
          case 'prompt':
            accept = true;
            break;
          case 'beforeunload':
            accept = this._defaultOptions.acceptBeforeUnload;
            break;
        }
      }

      try {
        await cdpSend(this._wc, 'Page.handleJavaScriptDialog', {
          accept,
          promptText,
        });
      } catch {
        // ignore — dialog may have been dismissed
      }
    };

    this._wc.debugger.on('message', this._onDialog);
    this._enabled = true;
  }

  /**
   * Disable dialog handling.
   */
  async disable() {
    if (!this._enabled) return;
    if (this._onDialog) {
      try {
        this._wc.debugger.removeListener('message', this._onDialog);
      } catch {
        // ignore
      }
      this._onDialog = null;
    }
    this._handler = null;
    this._enabled = false;
  }

  /**
   * Get dialog history.
   */
  getHistory() {
    return [...this._dialogHistory];
  }

  /**
   * Clear dialog history.
   */
  clearHistory() {
    this._dialogHistory = [];
  }

  /**
   * Destroy and clean up.
   */
  destroy() {
    this.disable();
    this._dialogHistory = [];
  }
}

module.exports = DialogHandler;
