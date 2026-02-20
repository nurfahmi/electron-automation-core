'use strict';

const { sleep } = require('./utils');

// Electron key names map for special keys
const KEY_MAP = {
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4',
  F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8',
  F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  Control: 'Control',
  Shift: 'Shift',
  Alt: 'Alt',
  Meta: 'Meta',
  Space: ' ',
};

class Keyboard {
  /**
   * @param {Electron.WebContents} webContents
   */
  constructor(webContents) {
    this._wc = webContents;
  }

  /**
   * Type text character by character.
   */
  async type(text, delay = 0) {
    for (const char of text) {
      this._wc.sendInputEvent({ type: 'keyDown', keyCode: char });
      this._wc.sendInputEvent({ type: 'char', keyCode: char });
      this._wc.sendInputEvent({ type: 'keyUp', keyCode: char });
      if (delay > 0) await sleep(delay);
    }
  }

  /**
   * Press a single key (keyDown → char → keyUp).
   */
  async press(key) {
    const mapped = KEY_MAP[key] || key;
    await this.down(mapped);
    // Only send char event for printable single characters
    if (mapped.length === 1) {
      this._wc.sendInputEvent({ type: 'char', keyCode: mapped });
    }
    await this.up(mapped);
  }

  /**
   * Hold key down.
   */
  async down(key) {
    const mapped = KEY_MAP[key] || key;
    this._wc.sendInputEvent({ type: 'keyDown', keyCode: mapped });
    await sleep(5);
  }

  /**
   * Release key.
   */
  async up(key) {
    const mapped = KEY_MAP[key] || key;
    this._wc.sendInputEvent({ type: 'keyUp', keyCode: mapped });
    await sleep(5);
  }

  /**
   * Press a keyboard shortcut like ['Control', 'a'].
   */
  async shortcut(keysArray) {
    const modifiers = [];
    for (const key of keysArray) {
      const lower = key.toLowerCase();
      if (['control', 'shift', 'alt', 'meta'].includes(lower)) {
        modifiers.push(lower);
      }
    }

    // Press all modifier keys down
    for (const key of keysArray.slice(0, -1)) {
      await this.down(key);
    }

    // Press the final key
    const lastKey = keysArray[keysArray.length - 1];
    const mapped = KEY_MAP[lastKey] || lastKey;
    this._wc.sendInputEvent({
      type: 'keyDown',
      keyCode: mapped,
      modifiers,
    });
    await sleep(20);
    this._wc.sendInputEvent({
      type: 'keyUp',
      keyCode: mapped,
      modifiers,
    });

    // Release all modifiers in reverse
    for (let i = keysArray.length - 2; i >= 0; i--) {
      await this.up(keysArray[i]);
    }
  }
}

module.exports = Keyboard;
