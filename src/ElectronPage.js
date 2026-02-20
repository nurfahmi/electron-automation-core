'use strict';

const { BrowserView } = require('electron');
const Mouse = require('./Mouse');
const Keyboard = require('./Keyboard');
const Network = require('./Network');
const Waiter = require('./Waiter');
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
    this._waiter = new Waiter(this._wc);

    this._options = options;
    this._handleCounter = 0;

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

  // --- Element Query ---

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

  /**
   * Emulate a mobile device with touch, viewport, and UA override.
   * @param {object} device
   * @param {number} device.width
   * @param {number} device.height
   * @param {number} [device.deviceScaleFactor=2]
   * @param {boolean} [device.mobile=true]
   * @param {boolean} [device.hasTouch=true]
   * @param {string} [device.userAgent]
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
