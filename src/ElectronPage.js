'use strict';

const { BrowserView } = require('electron');
const Mouse = require('./Mouse');
const Keyboard = require('./Keyboard');
const Network = require('./Network');
const Waiter = require('./Waiter');
const { sleep, safeDetachDebugger } = require('./utils');

const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}`;

class ElectronPage {
  /**
   * @param {Electron.BrowserView} view
   * @param {object} [options]
   * @param {boolean} [options.disableImages]
   * @param {boolean} [options.disableAnimations]
   */
  constructor(view, options = {}) {
    this._view = view;
    this._wc = view.webContents;
    this._destroyed = false;

    this.mouse = new Mouse(this._wc);
    this.keyboard = new Keyboard(this._wc);
    this.network = new Network(this._wc);
    this._waiter = new Waiter(this._wc);

    this._options = options;

    // Apply performance options after each navigation
    this._onFinishLoad = () => this._applyPerformanceOptions();
    this._wc.on('did-finish-load', this._onFinishLoad);

    // Handle crash
    this._onCrash = () => {
      console.error(`[electron-automation-core] WebContents crashed for view`);
    };
    this._wc.on('render-process-gone', this._onCrash);
  }

  /** @returns {Electron.WebContents} */
  get webContents() { return this._wc; }
  /** @returns {Electron.BrowserView} */
  get view() { return this._view; }

  // --- Performance ---

  async _applyPerformanceOptions() {
    if (this._destroyed) return;
    try {
      if (this._options.disableImages) {
        await this.network.blockResourceTypes(['Image', 'Media']);
      }
      if (this._options.disableAnimations) {
        await this._wc.insertCSS(DISABLE_ANIMATIONS_CSS);
      }
    } catch {
      // ignore — page may have navigated away
    }
  }

  // --- Navigation ---

  async goto(url) {
    await this._wc.loadURL(url);
  }

  async reload() {
    this._wc.reload();
    await this.waitForNavigation();
  }

  async goBack() {
    if (this._wc.canGoBack()) {
      this._wc.goBack();
      await this.waitForNavigation();
    }
  }

  async goForward() {
    if (this._wc.canGoForward()) {
      this._wc.goForward();
      await this.waitForNavigation();
    }
  }

  async waitForNavigation(timeout = 30000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(); }
      }, timeout);

      const onFinish = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          this._wc.removeListener('did-finish-load', onFinish);
          this._wc.removeListener('did-fail-load', onFail);
          resolve();
        }
      };
      const onFail = (_e, code, desc) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          this._wc.removeListener('did-finish-load', onFinish);
          this._wc.removeListener('did-fail-load', onFail);
          if (code === -3) resolve(); // aborted — normal on redirect
          else reject(new Error(`Navigation failed: ${desc} (code ${code})`));
        }
      };

      this._wc.on('did-finish-load', onFinish);
      this._wc.on('did-fail-load', onFail);
    });
  }

  async waitForNetworkIdle(timeout = 30000) {
    return this._waiter.waitForNetworkIdle(timeout);
  }

  // --- Evaluation ---

  async evaluate(script) {
    return this._wc.executeJavaScript(script, true);
  }

  async waitForSelector(selector, timeout = 30000) {
    return this._waiter.waitForSelector(selector, timeout);
  }

  async waitForFunction(fn, timeout = 30000) {
    return this._waiter.waitForFunction(fn, timeout);
  }

  async waitForTimeout(ms) {
    return sleep(ms);
  }

  // --- Element interaction ---

  async _getElementCenter(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    const rect = await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `, true);
    if (!rect) throw new Error(`Element not found: ${selector}`);
    return rect;
  }

  async click(selector) {
    await this.waitForSelector(selector, 10000);
    const { x, y } = await this._getElementCenter(selector);
    await this.mouse.click(Math.round(x), Math.round(y));
  }

  async type(selector, text, delay = 0) {
    await this.focus(selector);
    await this.keyboard.type(text, delay);
  }

  async hover(selector) {
    await this.waitForSelector(selector, 10000);
    const { x, y } = await this._getElementCenter(selector);
    await this.mouse.move(Math.round(x), Math.round(y));
  }

  async focus(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    await this._wc.executeJavaScript(`document.querySelector('${escaped}').focus()`, true);
  }

  async select(selector, value) {
    const escaped = selector.replace(/'/g, "\\'");
    const escapedVal = value.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        el.value = '${escapedVal}';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `, true);
  }

  async check(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
      })()
    `, true);
  }

  async uncheck(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
      })()
    `, true);
  }

  // --- Files & Media ---

  async upload(selector, filePath) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    // Use CDP to set file input
    const { nodeId } = await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        return { nodeId: null };
      })()
    `, true);

    // Alternative: use webContents debugger
    const { safeAttachDebugger, cdpSend } = require('./utils');
    await safeAttachDebugger(this._wc);
    const { root } = await cdpSend(this._wc, 'DOM.getDocument');
    const { nodeId: nId } = await cdpSend(this._wc, 'DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    await cdpSend(this._wc, 'DOM.setFileInputFiles', {
      nodeId: nId,
      files: Array.isArray(filePath) ? filePath : [filePath],
    });
  }

  async screenshot(options = {}) {
    const image = await this._wc.capturePage();
    if (options.path) {
      const fs = require('fs');
      fs.writeFileSync(options.path, image.toPNG());
      return options.path;
    }
    return image.toPNG();
  }

  async pdf(options = {}) {
    const data = await this._wc.printToPDF({
      landscape: options.landscape || false,
      printBackground: options.printBackground !== false,
      pageSize: options.pageSize || 'A4',
    });
    if (options.path) {
      const fs = require('fs');
      fs.writeFileSync(options.path, data);
      return options.path;
    }
    return data;
  }

  // --- Cookies & Storage ---

  async getCookies(filter = {}) {
    return this._wc.session.cookies.get(filter);
  }

  async setCookies(cookies) {
    for (const cookie of cookies) {
      await this._wc.session.cookies.set(cookie);
    }
  }

  async clearCookies() {
    const cookies = await this.getCookies();
    for (const cookie of cookies) {
      const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await this._wc.session.cookies.remove(url, cookie.name);
    }
  }

  // --- Browser Emulation ---

  async setUserAgent(ua) {
    this._wc.setUserAgent(ua);
  }

  async setViewport(width, height) {
    this._view.setBounds({
      x: this._view.getBounds().x,
      y: this._view.getBounds().y,
      width,
      height,
    });
  }

  async setExtraHTTPHeaders(headers) {
    await this.network.setExtraHTTPHeaders(headers);
  }

  // --- Lifecycle ---

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // Remove listeners
    try {
      this._wc.removeListener('did-finish-load', this._onFinishLoad);
      this._wc.removeListener('render-process-gone', this._onCrash);
    } catch {
      // ignore
    }

    // Destroy sub-modules
    this.network.destroy();
    safeDetachDebugger(this._wc);
  }
}

module.exports = ElectronPage;
