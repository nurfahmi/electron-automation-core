'use strict';

const { sleep, poll } = require('./utils');

class Waiter {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
  }

  /**
   * Wait until a DOM selector exists.
   */
  async waitForSelector(selector, timeout = 30000) {
    const escaped = selector.replace(/'/g, "\\'");
    return poll(
      async () => {
        try {
          const found = await this._wc.executeJavaScript(
            `!!document.querySelector('${escaped}')`
          );
          return found ? true : null;
        } catch {
          return null;
        }
      },
      timeout,
      100
    );
  }

  /**
   * Wait until a JS function returns truthy.
   * fn should be a string of JS code that returns a truthy value.
   */
  async waitForFunction(fn, timeout = 30000) {
    return poll(
      async () => {
        try {
          const result = await this._wc.executeJavaScript(`(${fn})()`);
          return result || null;
        } catch {
          return null;
        }
      },
      timeout,
      100
    );
  }

  /**
   * Wait for a fixed duration.
   */
  async waitForTimeout(ms) {
    return sleep(ms);
  }

  /**
   * Wait until network is idle (no pending requests for idleTime ms).
   */
  async waitForNetworkIdle(timeout = 30000, idleTime = 500) {
    return new Promise((resolve, reject) => {
      let timer = null;
      let done = false;
      let pending = 0;

      const timeoutId = setTimeout(() => {
        cleanup();
        if (!done) {
          done = true;
          resolve(); // resolve on timeout rather than reject for network idle
        }
      }, timeout);

      const checkIdle = () => {
        if (done) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (!done && pending <= 0) {
            done = true;
            cleanup();
            resolve();
          }
        }, idleTime);
      };

      const onStart = () => {
        pending++;
        if (timer) clearTimeout(timer);
      };

      const onFinish = () => {
        pending = Math.max(0, pending - 1);
        checkIdle();
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (timer) clearTimeout(timer);
        try {
          this._wc.removeListener('did-start-loading', onStart);
          this._wc.removeListener('did-stop-loading', onFinish);
          this._wc.removeListener('did-finish-load', onFinish);
          this._wc.removeListener('did-fail-load', onFinish);
        } catch {
          // ignore
        }
      };

      this._wc.on('did-start-loading', onStart);
      this._wc.on('did-stop-loading', onFinish);
      this._wc.on('did-finish-load', onFinish);
      this._wc.on('did-fail-load', onFinish);

      // Kickstart the idle check
      checkIdle();
    });
  }
}

module.exports = Waiter;
