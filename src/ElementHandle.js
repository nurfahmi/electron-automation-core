'use strict';

const { sleep } = require('./utils');

/**
 * Represents a handle to a DOM element for chainable interaction.
 * Identified by a unique __eac_id attribute set on the element.
 */
class ElementHandle {
  /**
   * @param {Electron.WebContents} webContents
   * @param {import('./Mouse')} mouse
   * @param {import('./Keyboard')} keyboard
   * @param {string} handleId - Unique ID assigned to the element
   */
  constructor(webContents, mouse, keyboard, handleId) {
    this._wc = webContents;
    this._mouse = mouse;
    this._keyboard = keyboard;
    this._id = handleId;
  }

  /**
   * Get bounding box center of this element.
   */
  async _center() {
    const rect = await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `, true);
    if (!rect) throw new Error(`Element handle expired (id: ${this._id})`);
    return rect;
  }

  /**
   * Get element info (tagName, id, className, text, value, bounds).
   */
  async getInfo() {
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
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
   * Click on this element using native mouse input.
   */
  async click() {
    const { x, y } = await this._center();
    await this._mouse.click(Math.round(x), Math.round(y));
  }

  /**
   * Double-click on this element.
   */
  async doubleClick() {
    const { x, y } = await this._center();
    await this._mouse.doubleClick(Math.round(x), Math.round(y));
  }

  /**
   * Right-click on this element.
   */
  async rightClick() {
    const { x, y } = await this._center();
    await this._mouse.rightClick(Math.round(x), Math.round(y));
  }

  /**
   * Hover over this element.
   */
  async hover() {
    const { x, y } = await this._center();
    await this._mouse.move(Math.round(x), Math.round(y));
  }

  /**
   * Focus this element.
   */
  async focus() {
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el) el.focus();
      })()
    `, true);
  }

  /**
   * Type text into this element (focuses first).
   */
  async type(text, delay = 0) {
    await this.focus();
    await this._keyboard.type(text, delay);
  }

  /**
   * Set value on a select/input element and dispatch change.
   */
  async select(value) {
    const escapedVal = value.replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el) {
          el.value = '${escapedVal}';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `, true);
  }

  /**
   * Check a checkbox.
   */
  async check() {
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el && !el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `, true);
  }

  /**
   * Uncheck a checkbox.
   */
  async uncheck() {
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el && el.checked) {
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `, true);
  }

  /**
   * Get text content of this element.
   */
  async textContent() {
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        return el ? el.textContent : null;
      })()
    `, true);
  }

  /**
   * Get inner text of this element.
   */
  async innerText() {
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        return el ? el.innerText : null;
      })()
    `, true);
  }

  /**
   * Get or set value of input/textarea/select.
   */
  async value(newValue) {
    if (newValue !== undefined) {
      const escaped = String(newValue).replace(/'/g, "\\'");
      await this._wc.executeJavaScript(`
        (function() {
          var el = document.querySelector('[__eac_id="${this._id}"]');
          if (el) { el.value = '${escaped}'; el.dispatchEvent(new Event('input', { bubbles: true })); }
        })()
      `, true);
      return newValue;
    }
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        return el ? el.value : null;
      })()
    `, true);
  }

  /**
   * Get an attribute value.
   */
  async getAttribute(name) {
    const escaped = name.replace(/'/g, "\\'");
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        return el ? el.getAttribute('${escaped}') : null;
      })()
    `, true);
  }

  /**
   * Set an attribute.
   */
  async setAttribute(name, val) {
    const eName = name.replace(/'/g, "\\'");
    const eVal = String(val).replace(/'/g, "\\'");
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el) el.setAttribute('${eName}', '${eVal}');
      })()
    `, true);
  }

  /**
   * Check if element is visible.
   */
  async isVisible() {
    return this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (!el) return false;
        var s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      })()
    `, true);
  }

  /**
   * Scroll this element into view.
   */
  async scrollIntoView() {
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()
    `, true);
    await sleep(300);
  }

  /**
   * Remove the tracking attribute (cleanup).
   */
  async dispose() {
    await this._wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[__eac_id="${this._id}"]');
        if (el) el.removeAttribute('__eac_id');
      })()
    `, true).catch(() => {});
  }
}

module.exports = ElementHandle;
