'use strict';

const { BrowserView } = require('electron');
const Mouse = require('./Mouse');
const Keyboard = require('./Keyboard');
const Network = require('./Network');
const Waiter = require('./Waiter');
const Touch = require('./Touch');
const DialogHandler = require('./DialogHandler');
const DownloadManager = require('./DownloadManager');
const { sleep, safeDetachDebugger, safeAttachDebugger, cdpSend } = require('./utils');
const ElementHandle = require('./ElementHandle');

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
    this.touch = new Touch(this._wc);
    this.dialogs = new DialogHandler(this._wc);
    this.downloads = new DownloadManager(this._wc);
    this._waiter = new Waiter(this._wc);

    this._options = options;
    this._handleCounter = 0;
    this._popupHandler = null;
    this._onNewWindow = null;

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

  // ==============================
  // Navigation
  // ==============================

  async goto(url) {
    await this._wc.loadURL(url);
  }

  async reload() {
    this._wc.reload();
    await this.waitForNavigation();
  }

  /**
   * Reload ignoring cache.
   */
  async reloadIgnoringCache() {
    this._wc.reloadIgnoringCache();
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

  /**
   * Stop loading the current page.
   */
  stop() {
    this._wc.stop();
  }

  /**
   * Check if browser can navigate back.
   */
  canGoBack() {
    return this._wc.canGoBack();
  }

  /**
   * Check if browser can navigate forward.
   */
  canGoForward() {
    return this._wc.canGoForward();
  }

  /**
   * Navigate to a specific index in the navigation history.
   */
  async goToIndex(index) {
    this._wc.goToIndex(index);
    await this.waitForNavigation();
  }

  /**
   * Get the current navigation history.
   * @returns {{ currentIndex: number, entries: Array<{ url: string, title: string }> }}
   */
  getNavigationHistory() {
    const history = this._wc.navigationHistory;
    if (!history) {
      // Fallback for older Electron
      return { currentIndex: 0, entries: [{ url: this.url(), title: this.title() }] };
    }
    const count = history.length();
    const entries = [];
    for (let i = 0; i < count; i++) {
      const entry = history.getEntryAtIndex(i);
      entries.push({ url: entry.url, title: entry.title || '' });
    }
    return {
      currentIndex: history.getActiveIndex(),
      entries,
    };
  }

  /**
   * Clear navigation history.
   */
  clearHistory() {
    try {
      this._wc.clearHistory();
    } catch {
      // ignore — not available in all versions
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

  // ==============================
  // Page Info
  // ==============================

  /**
   * Get the current page title.
   */
  title() {
    return this._wc.getTitle();
  }

  /**
   * Get the current page URL.
   */
  url() {
    return this._wc.getURL();
  }

  /**
   * Get the full HTML source of the page.
   */
  async pageSource() {
    return this._wc.executeJavaScript('document.documentElement.outerHTML', true);
  }

  /**
   * Get the favicon URL of the current page.
   */
  async favicon() {
    return this._wc.executeJavaScript(`
      (function() {
        var link = document.querySelector('link[rel*="icon"]');
        return link ? link.href : null;
      })()
    `, true);
  }

  // ==============================
  // Evaluation
  // ==============================

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

  // ==============================
  // Element Query
  // ==============================

  /**
   * Query single element by CSS selector. Returns serializable properties.
   */
  async querySelector(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {
          tagName: el.tagName, id: el.id, className: el.className,
          textContent: el.textContent.substring(0, 500),
          innerText: (el.innerText || '').substring(0, 500),
          value: el.value || null,
          href: el.href || null,
          src: el.src || null,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        };
      })()
    `, true);
  }

  /**
   * Query all elements by CSS selector.
   */
  async querySelectorAll(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`
      (function() {
        var els = document.querySelectorAll('${escaped}');
        return Array.from(els).map(function(el) {
          var r = el.getBoundingClientRect();
          return {
            tagName: el.tagName, id: el.id, className: el.className,
            textContent: el.textContent.substring(0, 500),
            value: el.value || null,
            bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        });
      })()
    `, true);
  }

  /**
   * Get element by ID.
   */
  async getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  /**
   * Get elements by class name.
   */
  async getElementsByClassName(className) {
    return this.querySelectorAll(`.${className}`);
  }

  /**
   * Get elements by tag name.
   */
  async getElementsByTagName(tagName) {
    return this.querySelectorAll(tagName);
  }

  /**
   * Get element by name attribute.
   */
  async getElementByName(name) {
    const escaped = name.replace(/'/g, "\\'");
    return this.querySelector(`[name='${escaped}']`);
  }

  /**
   * Get elements by name attribute.
   */
  async getElementsByName(name) {
    const escaped = name.replace(/'/g, "\\'");
    return this.querySelectorAll(`[name='${escaped}']`);
  }

  /**
   * Query element(s) by XPath expression.
   * Returns array of serializable element info.
   */
  async xpath(expression) {
    const escaped = expression.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`
      (function() {
        var result = document.evaluate('${escaped}', document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        var items = [];
        for (var i = 0; i < result.snapshotLength; i++) {
          var el = result.snapshotItem(i);
          var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x:0, y:0, width:0, height:0 };
          items.push({
            tagName: el.tagName || null, id: el.id || null, className: el.className || null,
            textContent: (el.textContent || '').substring(0, 500),
            value: el.value || null,
            bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
          });
        }
        return items;
      })()
    `, true);
  }

  /**
   * Click element found by XPath.
   */
  async clickByXpath(expression) {
    const escaped = expression.replace(/'/g, "\\'");
    const result = await this._wc.executeJavaScript(`
      (function() {
        var result = document.evaluate('${escaped}', document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        var el = result.singleNodeValue;
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `, true);
    if (!result) throw new Error(`XPath element not found: ${expression}`);
    await this.mouse.click(Math.round(result.x), Math.round(result.y));
  }

  /**
   * Type into element found by XPath.
   */
  async typeByXpath(expression, text, delay = 0) {
    const escaped = expression.replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`
      (function() {
        var result = document.evaluate('${escaped}', document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        var el = result.singleNodeValue;
        if (el) el.focus();
      })()
    `, true);
    await this.keyboard.type(text, delay);
  }

  // --- Element Handle ($, $$, $x) ---

  _nextHandleId() {
    return `eac_${Date.now()}_${++this._handleCounter}`;
  }

  /**
   * Select a single element by CSS selector. Returns an ElementHandle for interaction.
   * @param {string} selector
   * @returns {Promise<ElementHandle|null>}
   */
  async $(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    const handleId = this._nextHandleId();
    const found = await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('${escaped}');
        if (!el) return false;
        el.setAttribute('__eac_id', '${handleId}');
        return true;
      })()
    `, true);
    if (!found) return null;
    return new ElementHandle(this._wc, this.mouse, this.keyboard, handleId);
  }

  /**
   * Select all elements by CSS selector. Returns array of ElementHandles.
   * @param {string} selector
   * @returns {Promise<ElementHandle[]>}
   */
  async $$(selector) {
    const escaped = selector.replace(/'/g, "\\'");
    const baseId = this._nextHandleId();
    const count = await this._wc.executeJavaScript(`
      (function() {
        var els = document.querySelectorAll('${escaped}');
        for (var i = 0; i < els.length; i++) {
          els[i].setAttribute('__eac_id', '${baseId}_' + i);
        }
        return els.length;
      })()
    `, true);
    const handles = [];
    for (let i = 0; i < count; i++) {
      handles.push(new ElementHandle(this._wc, this.mouse, this.keyboard, `${baseId}_${i}`));
    }
    return handles;
  }

  /**
   * Select element(s) by XPath. Returns array of ElementHandles.
   * @param {string} expression
   * @returns {Promise<ElementHandle[]>}
   */
  async $x(expression) {
    const escaped = expression.replace(/'/g, "\\'");
    const baseId = this._nextHandleId();
    const count = await this._wc.executeJavaScript(`
      (function() {
        var result = document.evaluate('${escaped}', document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (var i = 0; i < result.snapshotLength; i++) {
          var el = result.snapshotItem(i);
          if (el.setAttribute) el.setAttribute('__eac_id', '${baseId}_' + i);
        }
        return result.snapshotLength;
      })()
    `, true);
    const handles = [];
    for (let i = 0; i < count; i++) {
      handles.push(new ElementHandle(this._wc, this.mouse, this.keyboard, `${baseId}_${i}`));
    }
    return handles;
  }

  // ==============================
  // Element interaction
  // ==============================

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

  // ==============================
  // Files & Media
  // ==============================

  async upload(selector, filePath) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.waitForSelector(selector, 10000);
    // Use webContents debugger
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

  /**
   * Upload file to the Nth matching input element (0-indexed).
   * @param {string} selector - CSS selector that matches multiple file inputs.
   * @param {number} index - 0-based index of which matched element to target.
   * @param {string|string[]} filePath - File path(s) to upload.
   */
  async uploadByIndex(selector, index, filePath) {
    await this.waitForSelector(selector, 10000);
    await safeAttachDebugger(this._wc);
    const { root } = await cdpSend(this._wc, 'DOM.getDocument');
    const { nodeIds } = await cdpSend(this._wc, 'DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeIds || index >= nodeIds.length) {
      throw new Error(`Element at index ${index} not found for selector: ${selector} (found ${nodeIds ? nodeIds.length : 0})`);
    }
    await cdpSend(this._wc, 'DOM.setFileInputFiles', {
      nodeId: nodeIds[index],
      files: Array.isArray(filePath) ? filePath : [filePath],
    });
  }

  /**
   * Intercept the next file chooser dialog and auto-provide file(s).
   * Use this when the site uses hidden/dynamic file inputs (like Facebook).
   * 
   * Usage:
   *   await page.interceptFileChooser('/path/to/image.jpg');
   *   await page.click('.upload-button'); // triggers the file dialog
   *   // Dialog never shows — file is auto-provided
   *
   * @param {string|string[]} filePaths - File path(s) to provide.
   * @param {object} [options]
   * @param {boolean} [options.persistent=false] - Keep intercepting (for multiple uploads).
   */
  async interceptFileChooser(filePaths, options = {}) {
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    const persistent = options.persistent || false;

    await safeAttachDebugger(this._wc);
    await cdpSend(this._wc, 'Page.enable');
    await cdpSend(this._wc, 'Page.setInterceptFileChooserDialog', { enabled: true });

    // Remove old listener if any
    if (this._fileChooserListener) {
      this._wc.debugger.removeListener('message', this._fileChooserListener);
    }

    this._fileChooserListener = async (_event, method, params) => {
      if (method !== 'Page.fileChooserOpened') return;

      try {
        await cdpSend(this._wc, 'DOM.setFileInputFiles', {
          backendNodeId: params.backendNodeId,
          files,
        });
      } catch {
        // ignore — element may have been removed
      }

      if (!persistent) {
        this.stopInterceptFileChooser();
      }
    };

    this._wc.debugger.on('message', this._fileChooserListener);
  }

  /**
   * Stop intercepting file chooser dialogs.
   */
  async stopInterceptFileChooser() {
    if (this._fileChooserListener) {
      try {
        this._wc.debugger.removeListener('message', this._fileChooserListener);
      } catch { /* ignore */ }
      this._fileChooserListener = null;
    }
    try {
      await cdpSend(this._wc, 'Page.setInterceptFileChooserDialog', { enabled: false });
    } catch { /* ignore */ }
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

  // ==============================
  // Cookies & Storage
  // ==============================

  async getCookies(filter = {}) {
    return this._wc.session.cookies.get(filter);
  }

  async setCookies(cookies) {
    for (const cookie of cookies) {
      await this._wc.session.cookies.set(cookie);
    }
  }

  /**
   * Set a single cookie with full attributes.
   * @param {object} cookie
   * @param {string} cookie.url - The URL to associate the cookie with.
   * @param {string} cookie.name
   * @param {string} cookie.value
   * @param {string} [cookie.domain]
   * @param {string} [cookie.path]
   * @param {boolean} [cookie.secure]
   * @param {boolean} [cookie.httpOnly]
   * @param {string} [cookie.sameSite] - 'unspecified', 'no_restriction', 'lax', 'strict'
   * @param {number} [cookie.expirationDate] - Unix timestamp in seconds
   */
  async setCookie(cookie) {
    await this._wc.session.cookies.set(cookie);
  }

  /**
   * Delete a specific cookie by name and url.
   */
  async deleteCookie(url, name) {
    await this._wc.session.cookies.remove(url, name);
  }

  /**
   * Flush cookies to disk.
   */
  async flushCookies() {
    await this._wc.session.cookies.flushStore();
  }

  async clearCookies() {
    const cookies = await this.getCookies();
    for (const cookie of cookies) {
      const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await this._wc.session.cookies.remove(url, cookie.name);
    }
  }

  // ==============================
  // localStorage & sessionStorage
  // ==============================

  /**
   * Get a value from localStorage.
   */
  async getLocalStorage(key) {
    const escaped = key.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`localStorage.getItem('${escaped}')`, true);
  }

  /**
   * Set a value in localStorage.
   */
  async setLocalStorage(key, value) {
    const eKey = key.replace(/'/g, "\\'");
    const eVal = String(value).replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`localStorage.setItem('${eKey}', '${eVal}')`, true);
  }

  /**
   * Remove a key from localStorage.
   */
  async removeLocalStorage(key) {
    const escaped = key.replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`localStorage.removeItem('${escaped}')`, true);
  }

  /**
   * Clear all localStorage.
   */
  async clearLocalStorage() {
    await this._wc.executeJavaScript('localStorage.clear()', true);
  }

  /**
   * Get all localStorage keys and values.
   */
  async getAllLocalStorage() {
    return this._wc.executeJavaScript(`
      (function() {
        var data = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          data[k] = localStorage.getItem(k);
        }
        return data;
      })()
    `, true);
  }

  /**
   * Get a value from sessionStorage.
   */
  async getSessionStorage(key) {
    const escaped = key.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`sessionStorage.getItem('${escaped}')`, true);
  }

  /**
   * Set a value in sessionStorage.
   */
  async setSessionStorage(key, value) {
    const eKey = key.replace(/'/g, "\\'");
    const eVal = String(value).replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`sessionStorage.setItem('${eKey}', '${eVal}')`, true);
  }

  /**
   * Remove a key from sessionStorage.
   */
  async removeSessionStorage(key) {
    const escaped = key.replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`sessionStorage.removeItem('${escaped}')`, true);
  }

  /**
   * Clear all sessionStorage.
   */
  async clearSessionStorage() {
    await this._wc.executeJavaScript('sessionStorage.clear()', true);
  }

  /**
   * Get all sessionStorage keys and values.
   */
  async getAllSessionStorage() {
    return this._wc.executeJavaScript(`
      (function() {
        var data = {};
        for (var i = 0; i < sessionStorage.length; i++) {
          var k = sessionStorage.key(i);
          data[k] = sessionStorage.getItem(k);
        }
        return data;
      })()
    `, true);
  }

  // ==============================
  // Browser Emulation
  // ==============================

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

  /**
   * Emulate a mobile device with touch, viewport, and UA override.
   */
  async emulateDevice(device) {
    await safeAttachDebugger(this._wc);
    await cdpSend(this._wc, 'Emulation.setDeviceMetricsOverride', {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.deviceScaleFactor || 2,
      mobile: device.mobile !== false,
    });
    await cdpSend(this._wc, 'Emulation.setTouchEmulationEnabled', {
      enabled: device.hasTouch !== false,
    });
    if (device.userAgent) {
      await cdpSend(this._wc, 'Emulation.setUserAgentOverride', {
        userAgent: device.userAgent,
      });
    }
  }

  /**
   * Quick switch to mobile view with common presets.
   * @param {string} [preset='iphone12'] - Device preset name.
   */
  async setMobile(preset = 'iphone12') {
    const devices = {
      iphone12: { width: 390, height: 844, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
      iphone14pro: { width: 393, height: 852, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
      iphoneSE: { width: 375, height: 667, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
      pixel7: { width: 412, height: 915, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
      galaxyS21: { width: 360, height: 800, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
      ipadAir: { width: 820, height: 1180, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
      ipadPro: { width: 1024, height: 1366, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
    };
    const device = devices[preset];
    if (!device) throw new Error(`Unknown device preset: ${preset}. Available: ${Object.keys(devices).join(', ')}`);
    await this.emulateDevice(device);
  }

  /**
   * Reset mobile emulation back to desktop.
   */
  async setDesktop() {
    await safeAttachDebugger(this._wc);
    await cdpSend(this._wc, 'Emulation.clearDeviceMetricsOverride');
    await cdpSend(this._wc, 'Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  // ==============================
  // Zoom
  // ==============================

  /**
   * Set zoom level. 1.0 = 100%, 0.5 = 50%, 2.0 = 200%.
   */
  setZoom(factor) {
    this._wc.setZoomFactor(factor);
  }

  /**
   * Get current zoom factor.
   */
  getZoom() {
    return this._wc.getZoomFactor();
  }

  /**
   * Set zoom level (Chromium zoom level, where 0 = 100%).
   */
  setZoomLevel(level) {
    this._wc.setZoomLevel(level);
  }

  /**
   * Get current Chromium zoom level.
   */
  getZoomLevel() {
    return this._wc.getZoomLevel();
  }

  // ==============================
  // Text Search / Find
  // ==============================

  /**
   * Find text on the page.
   * @param {string} text - Text to search for.
   * @param {object} [options]
   * @param {boolean} [options.forward=true] - Search direction.
   * @param {boolean} [options.matchCase=false]
   * @param {boolean} [options.wordStart=false]
   * @returns {Promise<{ matches: number, activeMatchOrdinal: number }>}
   */
  async findText(text, options = {}) {
    return new Promise((resolve) => {
      const requestId = Date.now();
      const onResult = (_event, result) => {
        if (result.requestId === requestId && result.finalUpdate) {
          this._wc.removeListener('found-in-page', onResult);
          resolve({
            matches: result.matches || 0,
            activeMatchOrdinal: result.activeMatchOrdinal || 0,
          });
        }
      };
      this._wc.on('found-in-page', onResult);
      this._wc.findInPage(text, {
        forward: options.forward !== false,
        matchCase: options.matchCase || false,
        wordStart: options.wordStart || false,
        findNext: options.findNext || false,
      });
    });
  }

  /**
   * Stop find in page and clear highlights.
   * @param {string} [action='clearSelection'] - 'clearSelection', 'keepSelection', 'activateSelection'
   */
  stopFindText(action = 'clearSelection') {
    this._wc.stopFindInPage(action);
  }

  // ==============================
  // Frames / iFrames
  // ==============================

  /**
   * Get list of all frames on the page (main + iframes).
   * @returns {Promise<Array<{ name: string, url: string, id: number }>>}
   */
  async getFrames() {
    return this._wc.executeJavaScript(`
      (function() {
        var frames = [{ name: 'main', url: window.location.href, index: 0 }];
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          var f = iframes[i];
          frames.push({
            name: f.name || f.id || ('iframe_' + i),
            url: f.src || '',
            index: i + 1,
          });
        }
        return frames;
      })()
    `, true);
  }

  /**
   * Execute JavaScript inside a specific iframe by index or selector.
   * @param {string|number} frameRef - CSS selector for the iframe or index (0 = main frame).
   * @param {string} script - JavaScript to execute.
   */
  async evaluateInFrame(frameRef, script) {
    if (frameRef === 0 || frameRef === 'main') {
      return this.evaluate(script);
    }

    // Get the frame's webContents via mainFrame hierarchy
    const allFrames = this._wc.mainFrame.frames;
    let targetFrame = null;

    if (typeof frameRef === 'number') {
      // Index-based (1-indexed for iframes, subtract 1)
      const idx = frameRef - 1;
      if (idx >= 0 && idx < allFrames.length) {
        targetFrame = allFrames[idx];
      }
    } else {
      // Selector-based — find by name or url
      for (const frame of allFrames) {
        if (frame.name === frameRef || frame.url === frameRef) {
          targetFrame = frame;
          break;
        }
      }
    }

    if (!targetFrame) {
      throw new Error(`Frame not found: ${frameRef}`);
    }
    return targetFrame.executeJavaScript(script);
  }

  /**
   * Click an element inside an iframe.
   * @param {string|number} frameRef
   * @param {string} selector
   */
  async clickInFrame(frameRef, selector) {
    const escaped = selector.replace(/'/g, "\\'");
    const result = await this.evaluateInFrame(frameRef, `
      (function() {
        var el = document.querySelector('${escaped}');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `);
    if (!result) throw new Error(`Element not found in frame: ${selector}`);

    // Get iframe offset in main page
    if (frameRef !== 0 && frameRef !== 'main') {
      const iframeSelector = typeof frameRef === 'number'
        ? `iframe:nth-of-type(${frameRef})`
        : `iframe[name='${frameRef}'], iframe#${frameRef}`;
      const offset = await this.evaluate(`
        (function() {
          var iframe = document.querySelector("${iframeSelector.replace(/"/g, '\\"')}");
          if (!iframe) return { x: 0, y: 0 };
          var r = iframe.getBoundingClientRect();
          return { x: r.x, y: r.y };
        })()
      `);
      await this.mouse.click(
        Math.round(result.x + (offset ? offset.x : 0)),
        Math.round(result.y + (offset ? offset.y : 0))
      );
    } else {
      await this.mouse.click(Math.round(result.x), Math.round(result.y));
    }
  }

  /**
   * Type into an element inside an iframe.
   * @param {string|number} frameRef
   * @param {string} selector
   * @param {string} text
   * @param {number} [delay=0]
   */
  async typeInFrame(frameRef, selector, text, delay = 0) {
    const escaped = selector.replace(/'/g, "\\'");
    await this.evaluateInFrame(frameRef, `
      (function() {
        var el = document.querySelector('${escaped}');
        if (el) el.focus();
      })()
    `);
    await this.keyboard.type(text, delay);
  }

  /**
   * Get the HTML content of an iframe.
   */
  async getFrameContent(frameRef) {
    return this.evaluateInFrame(frameRef, 'document.documentElement.outerHTML');
  }

  /**
   * Get text content of an iframe.
   */
  async getFrameText(frameRef) {
    return this.evaluateInFrame(frameRef, 'document.body.innerText');
  }

  // ==============================
  // WebRTC IP Handling
  // ==============================

  /**
   * Set WebRTC IP handling policy. Critical for privacy / anti-detection.
   * @param {string} policy - One of:
   *   'default' - WebRTC uses all available interfaces.
   *   'default_public_and_private_interfaces' - Use default route + private interfaces.
   *   'default_public_interface_only' - Only use the default route (no private IPs).
   *   'disable_non_proxied_udp' - Force through proxy, no direct UDP.
   */
  async setWebRTCPolicy(policy) {
    const validPolicies = [
      'default',
      'default_public_and_private_interfaces',
      'default_public_interface_only',
      'disable_non_proxied_udp',
    ];
    if (!validPolicies.includes(policy)) {
      throw new Error(`Invalid WebRTC policy: ${policy}. Valid: ${validPolicies.join(', ')}`);
    }
    this._wc.setWebRTCIPHandlingPolicy(policy);
  }

  /**
   * Get current WebRTC IP handling policy.
   */
  getWebRTCPolicy() {
    return this._wc.getWebRTCIPHandlingPolicy();
  }

  // ==============================
  // Permissions
  // ==============================

  /**
   * Set permission handler to auto-grant or deny permissions.
   * @param {object} permissions - Map of permission -> 'grant' | 'deny' | 'prompt'.
   * Available permissions: 'media', 'geolocation', 'notifications', 'midi',
   * 'pointerLock', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write',
   * 'sensors', 'hid', 'serial', 'usb'
   */
  setPermissions(permissions) {
    this._wc.session.setPermissionRequestHandler((wc, permission, callback) => {
      if (wc.id !== this._wc.id) {
        callback(false);
        return;
      }
      const setting = permissions[permission];
      if (setting === 'grant') {
        callback(true);
      } else if (setting === 'deny') {
        callback(false);
      } else {
        // Default: grant
        callback(true);
      }
    });

    // Also handle permission check handler
    this._wc.session.setPermissionCheckHandler((_wc, permission) => {
      const setting = permissions[permission];
      if (setting === 'grant') return true;
      if (setting === 'deny') return false;
      return true; // default grant
    });
  }

  /**
   * Grant all permissions (useful for automation).
   */
  grantAllPermissions() {
    this._wc.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(true);
    });
    this._wc.session.setPermissionCheckHandler(() => true);
  }

  /**
   * Clear permission handlers (reset to defaults).
   */
  clearPermissions() {
    this._wc.session.setPermissionRequestHandler(null);
    this._wc.session.setPermissionCheckHandler(null);
  }

  // ==============================
  // Popup Handling
  // ==============================

  /**
   * Set popup/new window handler.
   * @param {function} handler - (details) => 'allow' | 'deny' | { action: 'allow'|'deny', url?: string }
   *   details: { url, frameName, disposition, referrer }
   *   If handler is null, popups are denied by default.
   */
  setPopupHandler(handler) {
    // Remove old handler
    if (this._onNewWindow) {
      this._wc.removeListener('did-create-window', this._onNewWindow);
      this._onNewWindow = null;
    }

    this._popupHandler = handler;

    // Use setWindowOpenHandler for intercepting
    this._wc.setWindowOpenHandler((details) => {
      if (!this._popupHandler) {
        return { action: 'deny' };
      }
      try {
        const result = this._popupHandler({
          url: details.url,
          frameName: details.frameName || '',
          disposition: details.disposition,
          referrer: details.referrer || {},
        });
        if (result === 'allow') return { action: 'allow' };
        if (result === 'deny') return { action: 'deny' };
        if (result && result.action) return { action: result.action };
        return { action: 'deny' };
      } catch {
        return { action: 'deny' };
      }
    });
  }

  /**
   * Block all popups.
   */
  blockPopups() {
    this._wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  /**
   * Allow all popups.
   */
  allowPopups() {
    this._wc.setWindowOpenHandler(() => ({ action: 'allow' }));
  }

  // ==============================
  // Lifecycle
  // ==============================

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
    this.dialogs.destroy();
    this.downloads.destroy();
    safeDetachDebugger(this._wc);
  }
}

module.exports = ElectronPage;
