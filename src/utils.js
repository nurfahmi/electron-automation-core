'use strict';

/**
 * Sleep for given milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a condition function until it returns truthy or timeout is reached.
 */
async function poll(fn, timeout = 30000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await sleep(interval);
  }
  throw new Error(`Polling timed out after ${timeout}ms`);
}

/**
 * Safely attach debugger to webContents. Returns true if attached.
 */
async function safeAttachDebugger(webContents, version = '1.3') {
  if (webContents.debugger.isAttached()) return true;
  try {
    webContents.debugger.attach(version);
    return true;
  } catch (err) {
    console.error('[ISHbrowser] Failed to attach debugger:', err.message);
    return false;
  }
}

/**
 * Safely detach debugger from webContents.
 */
function safeDetachDebugger(webContents) {
  try {
    if (webContents.debugger.isAttached()) {
      webContents.debugger.detach();
    }
  } catch (err) {
    // ignore – webContents may already be destroyed
  }
}

/**
 * Send CDP command via debugger.
 */
async function cdpSend(webContents, method, params = {}) {
  if (!webContents.debugger.isAttached()) {
    const ok = await safeAttachDebugger(webContents);
    if (!ok) throw new Error('Cannot attach debugger for CDP command');
  }
  return webContents.debugger.sendCommand(method, params);
}

module.exports = {
  sleep,
  poll,
  safeAttachDebugger,
  safeDetachDebugger,
  cdpSend,
};
