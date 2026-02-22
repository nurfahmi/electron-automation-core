'use strict';

const { sleep, safeAttachDebugger, cdpSend } = require('./utils');

class Touch {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
  }

  async _ensureDebugger() {
    await safeAttachDebugger(this._wc);
  }

  /**
   * Dispatch a touch event via CDP.
   */
  async _dispatchTouch(type, touchPoints) {
    await this._ensureDebugger();
    await cdpSend(this._wc, 'Input.dispatchTouchEvent', {
      type,
      touchPoints: touchPoints.map(tp => ({
        x: Math.round(tp.x),
        y: Math.round(tp.y),
        id: tp.id || 0,
        radiusX: tp.radiusX || 1,
        radiusY: tp.radiusY || 1,
        force: tp.force || 1,
      })),
    });
  }

  /**
   * Tap at (x, y).
   */
  async tap(x, y) {
    const point = { x, y, id: 0 };
    await this._dispatchTouch('touchStart', [point]);
    await sleep(50);
    await this._dispatchTouch('touchEnd', []);
    await sleep(10);
  }

  /**
   * Double tap at (x, y).
   */
  async doubleTap(x, y) {
    await this.tap(x, y);
    await sleep(80);
    await this.tap(x, y);
  }

  /**
   * Long press at (x, y).
   * @param {number} duration - Hold duration in ms (default 800).
   */
  async longPress(x, y, duration = 800) {
    const point = { x, y, id: 0 };
    await this._dispatchTouch('touchStart', [point]);
    await sleep(duration);
    await this._dispatchTouch('touchEnd', []);
    await sleep(10);
  }

  /**
   * Swipe from (fromX, fromY) to (toX, toY).
   * @param {number} steps - Number of intermediate move steps.
   * @param {number} duration - Total swipe duration in ms.
   */
  async swipe(fromX, fromY, toX, toY, steps = 10, duration = 300) {
    const point = { x: fromX, y: fromY, id: 0 };
    await this._dispatchTouch('touchStart', [point]);

    const stepDelay = duration / steps;
    for (let i = 1; i <= steps; i++) {
      const x = fromX + (toX - fromX) * (i / steps);
      const y = fromY + (toY - fromY) * (i / steps);
      await this._dispatchTouch('touchMove', [{ x, y, id: 0 }]);
      await sleep(stepDelay);
    }

    await this._dispatchTouch('touchEnd', []);
    await sleep(10);
  }

  /**
   * Pinch in or out at center (cx, cy).
   * @param {number} cx - Center X.
   * @param {number} cy - Center Y.
   * @param {number} startDistance - Starting distance between fingers.
   * @param {number} endDistance - Ending distance between fingers.
   * @param {number} steps - Number of steps.
   */
  async pinch(cx, cy, startDistance, endDistance, steps = 10) {
    const stepDelay = 20;
    // Start with two fingers
    const startOffset = startDistance / 2;
    await this._dispatchTouch('touchStart', [
      { x: cx - startOffset, y: cy, id: 0 },
      { x: cx + startOffset, y: cy, id: 1 },
    ]);
    await sleep(50);

    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      const offset = startOffset + (endDistance / 2 - startOffset) * ratio;
      await this._dispatchTouch('touchMove', [
        { x: cx - offset, y: cy, id: 0 },
        { x: cx + offset, y: cy, id: 1 },
      ]);
      await sleep(stepDelay);
    }

    await this._dispatchTouch('touchEnd', []);
    await sleep(10);
  }

  /**
   * Scroll via touch from (x, y) by deltaX, deltaY.
   */
  async scroll(x, y, deltaX = 0, deltaY = 0, steps = 5) {
    await this.swipe(x, y, x - deltaX, y - deltaY, steps, 200);
  }
}

module.exports = Touch;
