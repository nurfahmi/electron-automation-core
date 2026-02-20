'use strict';

const { sleep } = require('./utils');

class Mouse {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
  }

  /**
   * Move mouse to (x, y).
   */
  async move(x, y) {
    this._wc.sendInputEvent({ type: 'mouseMove', x, y });
    await sleep(5);
  }

  /**
   * Click at (x, y).
   */
  async click(x, y, button = 'left') {
    await this.move(x, y);
    this._wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    await sleep(20);
    this._wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    await sleep(5);
  }

  /**
   * Double-click at (x, y).
   */
  async doubleClick(x, y, button = 'left') {
    await this.move(x, y);
    this._wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    this._wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    await sleep(30);
    this._wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 2 });
    this._wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 2 });
    await sleep(5);
  }

  /**
   * Right-click at (x, y).
   */
  async rightClick(x, y) {
    return this.click(x, y, 'right');
  }

  /**
   * Drag from (fromX, fromY) to (toX, toY).
   */
  async drag(fromX, fromY, toX, toY, steps = 10) {
    await this.move(fromX, fromY);
    this._wc.sendInputEvent({ type: 'mouseDown', x: fromX, y: fromY, button: 'left', clickCount: 1 });
    await sleep(20);

    for (let i = 1; i <= steps; i++) {
      const x = Math.round(fromX + (toX - fromX) * (i / steps));
      const y = Math.round(fromY + (toY - fromY) * (i / steps));
      this._wc.sendInputEvent({ type: 'mouseMove', x, y, button: 'left' });
      await sleep(10);
    }

    this._wc.sendInputEvent({ type: 'mouseUp', x: toX, y: toY, button: 'left', clickCount: 1 });
    await sleep(5);
  }

  /**
   * Scroll wheel.
   */
  async wheel(deltaX = 0, deltaY = 0, x = 0, y = 0) {
    this._wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX, deltaY });
    await sleep(5);
  }
}

module.exports = Mouse;
