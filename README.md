# electron-automation-core

Reusable Electron automation core module with embedded multi-browser grid and Playwright-like wrapper API.

## Installation

```bash
npm install github:nurfahmi/electron-automation-core
```

## Requirements

- Electron >= 28
- Node.js >= 18
- CommonJS

---

## Quick Start

```js
const { app, BrowserWindow } = require('electron')
const { BrowserManager } = require('electron-automation-core')

app.whenReady().then(async () => {
  const mainWindow = new BrowserWindow({ width: 1400, height: 900 })

  const manager = new BrowserManager(mainWindow)
  const page = manager.createProfile('user1')

  await page.goto('https://example.com')
  await page.waitForSelector('h1')
  await page.click('a')
})
```

---

## Running 10 Browsers in One Window

```js
const { app, BrowserWindow } = require('electron')
const { BrowserManager } = require('electron-automation-core')

app.whenReady().then(async () => {
  const mainWindow = new BrowserWindow({ width: 1600, height: 1000 })

  const manager = new BrowserManager(mainWindow)

  // Create 10 profiles — each gets its own BrowserView, session, cookies
  const pages = []
  for (let i = 1; i <= 10; i++) {
    const page = manager.createProfile(`user${i}`, {
      disableImages: true,      // optional: faster loading
      disableAnimations: true,  // optional: less CPU
    })
    pages.push(page)
  }

  // GridManager auto-arranges into 5x2 grid (5 columns, 2 rows)
  // This happens automatically, but you can also force it:
  manager.grid.setGrid(5, 2)

  // Navigate all 10 browsers
  await Promise.all(pages.map((page, i) =>
    page.goto(`https://example.com/page${i + 1}`)
  ))

  // Interact with a specific browser
  await pages[0].waitForSelector('#login')
  await pages[0].type('#email', 'user1@test.com')
  await pages[0].click('#submit')

  // Maximize one browser to full window
  manager.grid.maximize('user3')

  // Restore back to 5x2 grid
  manager.grid.restoreGrid()

  // Destroy a specific profile
  await manager.destroyProfile('user5')

  // Cleanup everything when done
  await manager.cleanup()
})
```

**Auto-grid behavior by view count:**

| Views | Grid Layout |
|-------|-------------|
| 1     | 1x1         |
| 2     | 2x1         |
| 3-4   | 2x2         |
| 5-6   | 3x2         |
| 7-9   | 3x3         |
| 10+   | 5x2         |

You can override with `manager.grid.setGrid(cols, rows)` anytime.

---

## Full API Reference

### BrowserManager

The main entry point. Receives your existing `BrowserWindow` — does NOT create its own.

```js
const { BrowserManager } = require('electron-automation-core')
const manager = new BrowserManager(mainWindow)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `createProfile(profileId, options?)` | `ElectronPage` | Create a BrowserView with isolated session. Options: `{ proxy, userAgent, disableImages, disableAnimations }` |
| `destroyProfile(profileId)` | `Promise<void>` | Destroy view, clear session, remove from grid |
| `getProfile(profileId)` | `ElectronPage\|null` | Get existing page by ID |
| `listProfiles()` | `string[]` | List all active profile IDs |
| `cleanup()` | `Promise<void>` | Destroy all profiles and clean up |
| `grid` | `GridManager` | Access the grid manager |

**createProfile options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxy` | `string` | `null` | Proxy rules, e.g. `"http://proxy:8080"` or `"socks5://proxy:1080"` |
| `userAgent` | `string` | `null` | Custom user agent string |
| `disableImages` | `boolean` | `false` | Block Image/Media resource loading via CDP |
| `disableAnimations` | `boolean` | `false` | Inject CSS to disable all CSS animations/transitions |

---

### ElectronPage

Playwright-like automation wrapper returned by `createProfile()`.

#### Navigation

```js
await page.goto('https://example.com')
await page.reload()
await page.reloadIgnoringCache()
await page.goBack()
await page.goForward()
page.stop()
await page.waitForNavigation(timeout?)       // default 30000ms
await page.waitForNetworkIdle(timeout?)       // default 30000ms
```

| Method | Description |
|--------|-------------|
| `goto(url)` | Navigate to URL, resolves when page loads |
| `reload()` | Reload and wait for navigation |
| `reloadIgnoringCache()` | Reload bypassing cache |
| `goBack()` | Go back in history (noop if can't go back) |
| `goForward()` | Go forward in history (noop if can't go forward) |
| `stop()` | Stop loading the current page |
| `canGoBack()` | Returns `boolean` — can we go back? |
| `canGoForward()` | Returns `boolean` — can we go forward? |
| `goToIndex(index)` | Navigate to specific index in navigation history |
| `waitForNavigation(timeout?)` | Wait for next navigation to complete |
| `waitForNetworkIdle(timeout?)` | Wait until no network activity for 500ms |

#### Navigation History

```js
// Check before navigating
if (page.canGoBack()) await page.goBack()
if (page.canGoForward()) await page.goForward()

// Get full navigation history
const history = page.getNavigationHistory()
// { currentIndex: 2, entries: [{ url, title }, { url, title }, ...] }

// Navigate to specific entry
await page.goToIndex(0) // go to first page in history

// Clear history
page.clearHistory()
```

| Method | Returns | Description |
|--------|---------|-------------|
| `getNavigationHistory()` | `{ currentIndex, entries[] }` | Full back-forward list |
| `goToIndex(index)` | `Promise<void>` | Navigate to specific history entry |
| `clearHistory()` | `void` | Clear navigation history |

#### Page Info

```js
const title = page.title()          // "Example Domain"
const url = page.url()              // "https://example.com"
const html = await page.pageSource()  // full HTML source
const icon = await page.favicon()     // favicon URL or null
```

| Method | Returns | Description |
|--------|---------|-------------|
| `title()` | `string` | Current page title |
| `url()` | `string` | Current page URL |
| `pageSource()` | `Promise<string>` | Full HTML source of the page |
| `favicon()` | `Promise<string\|null>` | Favicon URL |

#### Evaluation

```js
const title = await page.evaluate('document.title')
await page.waitForSelector('#myElement', 10000)
await page.waitForFunction('() => window.ready === true', 5000)
await page.waitForTimeout(2000)
```

| Method | Description |
|--------|-------------|
| `evaluate(script)` | Execute JavaScript in page, returns result |
| `waitForSelector(selector, timeout?)` | Wait until DOM element exists |
| `waitForFunction(fn, timeout?)` | Wait until JS function returns truthy. Pass as string: `'() => condition'` |
| `waitForTimeout(ms)` | Simple delay |

#### Element Query

```js
// CSS Selector
const el = await page.querySelector('#myId')
const all = await page.querySelectorAll('.items li')

// By ID, Class, Tag
const btn = await page.getElementById('submit')
const cards = await page.getElementsByClassName('card')
const divs = await page.getElementsByTagName('div')

// By name attribute
const email = await page.getElementByName('email')
const inputs = await page.getElementsByName('field')

// XPath
const results = await page.xpath('//div[@class="content"]/p')

// Click / Type by XPath
await page.clickByXpath('//button[text()="Login"]')
await page.typeByXpath('//input[@name="email"]', 'test@gmail.com')
```

All query methods return serializable element info: `{ tagName, id, className, textContent, value, bounds, href, src }`

| Method | Description |
|--------|-------------|
| `querySelector(selector)` | Get single element by CSS selector |
| `querySelectorAll(selector)` | Get all elements by CSS selector |
| `getElementById(id)` | Get element by ID |
| `getElementsByClassName(className)` | Get elements by class name |
| `getElementsByTagName(tagName)` | Get elements by tag name |
| `getElementByName(name)` | Get first element by `name` attribute |
| `getElementsByName(name)` | Get all elements by `name` attribute |
| `xpath(expression)` | Get elements by XPath expression |
| `clickByXpath(expression)` | Click first element matching XPath |
| `typeByXpath(expression, text, delay?)` | Focus XPath element and type text |

#### Element Handle (`$`, `$$`, `$x`)

Select an element first, then interact with it:

```js
// Select element, then interact
const btn = await page.$('#submit')
await btn.click()

const input = await page.$('#email')
await input.type('hello@test.com')
await input.value()  // get current value

// Select multiple
const items = await page.$$('.list-item')
for (const item of items) {
  const text = await item.textContent()
  console.log(text)
}
await items[0].click()

// Select by XPath
const [loginBtn] = await page.$x('//button[text()="Login"]')
await loginBtn.click()

// Element info & state
const el = await page.$('.card')
await el.hover()
await el.scrollIntoView()
const visible = await el.isVisible()
const href = await el.getAttribute('href')
await el.dispose()  // cleanup tracking attribute
```

| Method | Returns | Description |
|--------|---------|-------------|
| `page.$(selector)` | `ElementHandle\|null` | Select single element by CSS |
| `page.$$(selector)` | `ElementHandle[]` | Select all elements by CSS |
| `page.$x(xpath)` | `ElementHandle[]` | Select elements by XPath |

**ElementHandle methods:**

| Method | Description |
|--------|-------------|
| `click()` | Click element (native mouse) |
| `doubleClick()` | Double-click element |
| `rightClick()` | Right-click element |
| `hover()` | Hover over element |
| `focus()` | Focus element |
| `type(text, delay?)` | Focus and type text |
| `select(value)` | Set select/input value |
| `check()` / `uncheck()` | Toggle checkbox |
| `textContent()` | Get textContent |
| `innerText()` | Get innerText |
| `value(newVal?)` | Get or set value |
| `getAttribute(name)` | Get attribute |
| `setAttribute(name, val)` | Set attribute |
| `isVisible()` | Check visibility |
| `scrollIntoView()` | Scroll into view |
| `getInfo()` | Get full element info |
| `dispose()` | Cleanup tracking |

#### Element Interaction

```js
await page.click('#button')
await page.type('#input', 'hello world', 50)  // 50ms delay per char
await page.hover('.menu-item')
await page.focus('#search')
await page.select('#dropdown', 'option2')
await page.check('#agree')
await page.uncheck('#newsletter')
```

| Method | Description |
|--------|-------------|
| `click(selector)` | Wait for element, get center coordinates, send native mouse click |
| `type(selector, text, delay?)` | Focus element, type text char-by-char |
| `hover(selector)` | Move mouse to element center |
| `focus(selector)` | Focus element via JS |
| `select(selector, value)` | Set select/dropdown value and dispatch change event |
| `check(selector)` | Check a checkbox (noop if already checked) |
| `uncheck(selector)` | Uncheck a checkbox (noop if already unchecked) |

#### Files & Media

```js
// Upload to a visible file input
await page.upload('#fileInput', '/path/to/file.pdf')
await page.upload('#fileInput', ['/path/a.jpg', '/path/b.jpg'])  // multiple files

// Upload to the Nth matching file input (0-indexed)
await page.uploadByIndex('input[type="file"]', 2, '/path/to/file.pdf')

// Upload to hidden/dynamic file input (Facebook, Instagram, etc.)
// Set up interceptor BEFORE clicking the upload button
await page.interceptFileChooser('/path/to/image.jpg')
await page.click('[aria-label="Photo/video"]')  // dialog never shows

// Multiple files
await page.interceptFileChooser(['/path/to/img1.jpg', '/path/to/img2.jpg'])
await page.click('.upload-btn')

// Persistent mode — keeps intercepting for multiple sequential uploads
await page.interceptFileChooser('/path/to/image.jpg', { persistent: true })
await page.click('.upload-btn-1')  // auto-provides file
await page.click('.upload-btn-2')  // auto-provides again
await page.stopInterceptFileChooser()  // stop when done

// Screenshot & PDF
const pngBuffer = await page.screenshot()
await page.screenshot({ path: '/tmp/shot.png' })

const pdfBuffer = await page.pdf()
await page.pdf({ path: '/tmp/page.pdf', landscape: true, pageSize: 'A4' })
```

| Method | Description |
|--------|-------------|
| `upload(selector, filePath)` | Set file(s) on `<input type="file">` via CDP. Targets first match. |
| `uploadByIndex(selector, index, filePath)` | Set file on the Nth matching element (0-indexed) |
| `interceptFileChooser(filePaths, options?)` | Intercept next file dialog and auto-provide file(s). Options: `{ persistent }` |
| `stopInterceptFileChooser()` | Stop intercepting file chooser dialogs |
| `screenshot(options?)` | Capture page as PNG. Options: `{ path }` |
| `pdf(options?)` | Export page as PDF. Options: `{ path, landscape, printBackground, pageSize }` |

#### Cookies

```js
const cookies = await page.getCookies()
const filtered = await page.getCookies({ domain: '.example.com' })

// Set multiple cookies
await page.setCookies([
  { url: 'https://example.com', name: 'session', value: 'abc123' }
])

// Set single cookie with full attributes
await page.setCookie({
  url: 'https://example.com',
  name: 'token',
  value: 'xyz',
  domain: '.example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',          // 'unspecified', 'no_restriction', 'lax', 'strict'
  expirationDate: Math.floor(Date.now() / 1000) + 86400,  // 24h from now
})

// Delete specific cookie
await page.deleteCookie('https://example.com', 'token')

// Flush cookies to disk
await page.flushCookies()

// Clear all cookies
await page.clearCookies()
```

| Method | Description |
|--------|-------------|
| `getCookies(filter?)` | Get all cookies, optionally filtered by `{ domain, name, url, path }` |
| `setCookies(cookies[])` | Set multiple cookies. Each needs at minimum `{ url, name, value }` |
| `setCookie(cookie)` | Set single cookie with full attributes (domain, path, secure, httpOnly, sameSite, expiration) |
| `deleteCookie(url, name)` | Delete a specific cookie by URL and name |
| `flushCookies()` | Persist cookies to disk |
| `clearCookies()` | Remove all cookies for the session |

#### localStorage & sessionStorage

```js
// localStorage
await page.setLocalStorage('key', 'value')
const val = await page.getLocalStorage('key')
await page.removeLocalStorage('key')
const allData = await page.getAllLocalStorage()  // { key1: val1, key2: val2 }
await page.clearLocalStorage()

// sessionStorage
await page.setSessionStorage('key', 'value')
const val2 = await page.getSessionStorage('key')
await page.removeSessionStorage('key')
const allSession = await page.getAllSessionStorage()
await page.clearSessionStorage()
```

| Method | Description |
|--------|-------------|
| `getLocalStorage(key)` | Get value from localStorage |
| `setLocalStorage(key, value)` | Set value in localStorage |
| `removeLocalStorage(key)` | Remove key from localStorage |
| `getAllLocalStorage()` | Get all key-value pairs |
| `clearLocalStorage()` | Clear all localStorage |
| `getSessionStorage(key)` | Get value from sessionStorage |
| `setSessionStorage(key, value)` | Set value in sessionStorage |
| `removeSessionStorage(key)` | Remove key from sessionStorage |
| `getAllSessionStorage()` | Get all key-value pairs |
| `clearSessionStorage()` | Clear all sessionStorage |

#### Browser Emulation

```js
await page.setUserAgent('Mozilla/5.0 Custom Agent')
await page.setViewport(1280, 720)
await page.setExtraHTTPHeaders({ 'X-Custom': 'value' })
```

| Method | Description |
|--------|-------------|
| `setUserAgent(ua)` | Override user agent |
| `setViewport(width, height)` | Resize the BrowserView bounds |
| `setExtraHTTPHeaders(headers)` | Add extra headers to all requests via CDP |

#### Mobile Emulation

```js
// Quick preset — switches to mobile viewport, touch, and UA
await page.setMobile('iphone12')
await page.goto('https://example.com')  // site sees mobile device

// Switch back to desktop
await page.setDesktop()

// Custom device
await page.emulateDevice({
  width: 400,
  height: 800,
  deviceScaleFactor: 2,
  mobile: true,
  hasTouch: true,
  userAgent: 'Custom Mobile UA'
})
```

**Available presets for `setMobile()`:**

| Preset | Resolution | Device |
|--------|-----------|--------|
| `iphone12` | 390×844 | iPhone 12 |
| `iphone14pro` | 393×852 | iPhone 14 Pro |
| `iphoneSE` | 375×667 | iPhone SE |
| `pixel7` | 412×915 | Pixel 7 |
| `galaxyS21` | 360×800 | Galaxy S21 |
| `ipadAir` | 820×1180 | iPad Air |
| `ipadPro` | 1024×1366 | iPad Pro |

| Method | Description |
|--------|-------------|
| `setMobile(preset?)` | Switch to mobile view with device preset (default: `'iphone12'`) |
| `emulateDevice(device)` | Custom device emulation with touch, viewport, scale factor, UA |
| `setDesktop()` | Reset emulation back to desktop mode |

#### Zoom

```js
page.setZoom(1.5)         // 150%
page.setZoom(0.5)         // 50%
const zoom = page.getZoom() // 1.5

page.setZoomLevel(0)      // 0 = 100% (Chromium zoom level)
page.setZoomLevel(1)      // ~120%
page.setZoomLevel(-1)     // ~83%
const level = page.getZoomLevel()
```

| Method | Description |
|--------|-------------|
| `setZoom(factor)` | Set zoom factor. `1.0` = 100%, `0.5` = 50%, `2.0` = 200% |
| `getZoom()` | Get current zoom factor |
| `setZoomLevel(level)` | Set Chromium zoom level (0 = 100%) |
| `getZoomLevel()` | Get current Chromium zoom level |

#### Text Search / Find on Page

```js
// Find text on the page
const result = await page.findText('hello')
// { matches: 3, activeMatchOrdinal: 1 }

// Search options
const result2 = await page.findText('Hello', {
  matchCase: true,      // case-sensitive
  forward: true,        // search direction
  wordStart: false,     // match at word boundaries only
  findNext: true,       // find next occurrence
})

// Stop searching and clear highlights
page.stopFindText('clearSelection')   // clear selection
page.stopFindText('keepSelection')    // keep the selection
page.stopFindText('activateSelection') // activate (click) the selection
```

| Method | Returns | Description |
|--------|---------|-------------|
| `findText(text, options?)` | `{ matches, activeMatchOrdinal }` | Find text on page. Options: `forward`, `matchCase`, `wordStart`, `findNext` |
| `stopFindText(action?)` | `void` | Stop find. Action: `'clearSelection'`, `'keepSelection'`, `'activateSelection'` |

#### Frames / iFrames

```js
// List all frames on the page
const frames = await page.getFrames()
// [{ name: 'main', url: '...', index: 0 }, { name: 'ad-frame', url: '...', index: 1 }]

// Execute JavaScript inside an iframe
const title = await page.evaluateInFrame(1, 'document.title')           // by index
const title2 = await page.evaluateInFrame('ad-frame', 'document.title') // by name

// Click inside an iframe
await page.clickInFrame(1, '#button-inside-iframe')

// Type inside an iframe
await page.typeInFrame(1, '#input-inside-iframe', 'hello')

// Get iframe content
const html = await page.getFrameContent(1)
const text = await page.getFrameText(1)

// Main frame (index 0)
const mainHtml = await page.evaluateInFrame(0, 'document.title')
const mainHtml2 = await page.evaluateInFrame('main', 'document.title')
```

| Method | Description |
|--------|-------------|
| `getFrames()` | List all frames: `[{ name, url, index }]` |
| `evaluateInFrame(frameRef, script)` | Execute JS in iframe. `frameRef`: index (0=main) or name |
| `clickInFrame(frameRef, selector)` | Click element inside an iframe |
| `typeInFrame(frameRef, selector, text, delay?)` | Type into element inside an iframe |
| `getFrameContent(frameRef)` | Get full HTML of an iframe |
| `getFrameText(frameRef)` | Get text content of an iframe |

#### WebRTC IP Policy

Controls WebRTC IP exposure — critical for privacy and anti-detection automation.

```js
// Hide local IP from WebRTC (most common for automation)
await page.setWebRTCPolicy('default_public_interface_only')

// Force all WebRTC through proxy
await page.setWebRTCPolicy('disable_non_proxied_udp')

// Get current policy
const policy = page.getWebRTCPolicy()
```

| Policy | Description |
|--------|-------------|
| `'default'` | WebRTC uses all available interfaces (leaks local IPs) |
| `'default_public_and_private_interfaces'` | Use default route + private interfaces |
| `'default_public_interface_only'` | Only use default route (no private IPs leaked) |
| `'disable_non_proxied_udp'` | Force through proxy, no direct UDP |

| Method | Description |
|--------|-------------|
| `setWebRTCPolicy(policy)` | Set WebRTC IP handling policy |
| `getWebRTCPolicy()` | Get current policy |

#### Permissions

```js
// Auto-grant specific permissions
page.setPermissions({
  'media': 'grant',            // camera & mic
  'geolocation': 'grant',
  'notifications': 'deny',
  'clipboard-read': 'grant',
})

// Grant ALL permissions (useful for automation)
page.grantAllPermissions()

// Reset to defaults
page.clearPermissions()
```

**Available permissions:** `media`, `geolocation`, `notifications`, `midi`, `pointerLock`, `fullscreen`, `clipboard-read`, `clipboard-sanitized-write`, `sensors`, `hid`, `serial`, `usb`

| Method | Description |
|--------|-------------|
| `setPermissions(permissionsMap)` | Set per-permission grants. Values: `'grant'`, `'deny'`, `'prompt'` |
| `grantAllPermissions()` | Grant all permissions automatically |
| `clearPermissions()` | Reset permission handlers to defaults |

#### Popup Handling

```js
// Block all popups (default-safe for automation)
page.blockPopups()

// Allow all popups
page.allowPopups()

// Custom handler — inspect each popup request
page.setPopupHandler((details) => {
  // details: { url, frameName, disposition, referrer }
  if (details.url.includes('ads')) return 'deny'
  return 'allow'
})
```

| Method | Description |
|--------|-------------|
| `setPopupHandler(handler)` | Custom handler: `(details) => 'allow' \| 'deny'` |
| `blockPopups()` | Block all popups |
| `allowPopups()` | Allow all popups |

#### JS Dialog Handling

Auto-handle `alert()`, `confirm()`, `prompt()`, and `beforeunload` dialogs.

```js
// Enable with defaults (accept everything)
await page.dialogs.enable()

// Enable with custom config
await page.dialogs.enable({
  acceptAlerts: true,       // auto-accept alert() (default: true)
  acceptConfirms: true,     // auto-accept confirm() (default: true)
  promptText: 'my answer',  // default text for prompt() (default: '')
  acceptBeforeUnload: true, // auto-accept beforeunload (default: true)
})

// Enable with custom handler for full control
await page.dialogs.enable({
  handler: (dialog) => {
    // dialog: { type, message, defaultPrompt, url, timestamp }
    if (dialog.type === 'confirm' && dialog.message.includes('delete')) {
      return { accept: false }  // deny dangerous confirms
    }
    if (dialog.type === 'prompt') {
      return { accept: true, text: 'custom answer' }
    }
    return { accept: true }
  }
})

// Check dialog history
const history = page.dialogs.getHistory()
// [{ type: 'alert', message: 'Hello!', timestamp: 1708... }, ...]

page.dialogs.clearHistory()

// Disable handling
await page.dialogs.disable()
```

| Method | Description |
|--------|-------------|
| `page.dialogs.enable(options?)` | Start auto-handling dialogs |
| `page.dialogs.disable()` | Stop handling dialogs |
| `page.dialogs.getHistory()` | Get array of all dialogs that were handled |
| `page.dialogs.clearHistory()` | Clear dialog history |
| `page.dialogs.destroy()` | Full cleanup |

#### Download Management

```js
// Enable download handling
page.downloads.enable({
  savePath: '/tmp/downloads',  // default save directory
  autoAccept: true,            // auto-accept all downloads (default: true)
})

// Enable with custom handler
page.downloads.enable({
  handler: (info) => {
    // info: { id, url, filename, mimeType, totalBytes }
    if (info.filename.endsWith('.exe')) {
      return { accept: false }  // block exe files
    }
    return { accept: true, savePath: `/tmp/${info.filename}` }
  }
})

// Trigger a download by URL
page.downloads.downloadURL('https://example.com/file.zip')

// List all downloads
const allDownloads = page.downloads.getAll()
// [{ id, url, filename, totalBytes, receivedBytes, state, savePath }]

// Get specific download
const dl = page.downloads.get('dl_1')
// { id: 'dl_1', state: 'progressing', receivedBytes: 5000, totalBytes: 10000 }

// Cancel a download
page.downloads.cancel('dl_1')

// Wait for download to complete
const completed = await page.downloads.waitForDownload('dl_1', 60000)
// { id: 'dl_1', state: 'completed', savePath: '/tmp/downloads/file.zip' }

// Disable
page.downloads.disable()
```

**Download states:** `'progressing'`, `'completed'`, `'cancelled'`, `'interrupted'`

| Method | Description |
|--------|-------------|
| `page.downloads.enable(options?)` | Start handling downloads. Options: `{ savePath, autoAccept, handler }` |
| `page.downloads.disable()` | Stop handling downloads |
| `page.downloads.downloadURL(url)` | Trigger a download by URL |
| `page.downloads.getAll()` | Get info on all downloads |
| `page.downloads.get(id)` | Get info on specific download |
| `page.downloads.cancel(id)` | Cancel a download |
| `page.downloads.waitForDownload(id, timeout?)` | Wait for download to finish (default 60s) |
| `page.downloads.destroy()` | Cancel all active downloads and cleanup |

#### Direct Access

```js
page.mouse      // Mouse instance
page.keyboard   // Keyboard instance
page.network    // Network instance
page.touch      // Touch instance
page.dialogs    // DialogHandler instance
page.downloads  // DownloadManager instance
page.webContents // Electron WebContents
page.view        // Electron BrowserView
```

#### Lifecycle

```js
page.destroy()   // Clean up all listeners, detach debugger, destroy sub-modules
```

---

### Mouse

Native mouse simulation using `webContents.sendInputEvent`.

```js
await page.mouse.move(100, 200)
await page.mouse.click(100, 200)
await page.mouse.click(100, 200, 'right')  // right click
await page.mouse.doubleClick(100, 200)
await page.mouse.rightClick(100, 200)
await page.mouse.drag(100, 200, 300, 400)
await page.mouse.drag(100, 200, 300, 400, 20)  // 20 steps (smoother)
await page.mouse.wheel(0, -100)  // scroll up
await page.mouse.wheel(0, 100)   // scroll down
```

| Method | Description |
|--------|-------------|
| `move(x, y)` | Move mouse cursor |
| `click(x, y, button?)` | Click at position. `button`: `'left'`(default), `'right'`, `'middle'` |
| `doubleClick(x, y)` | Double-click at position |
| `rightClick(x, y)` | Right-click at position |
| `drag(fromX, fromY, toX, toY, steps?)` | Drag from A to B. Default 10 steps |
| `wheel(deltaX, deltaY, x?, y?)` | Scroll wheel event |

---

### Keyboard

Native keyboard simulation using `webContents.sendInputEvent`.

```js
await page.keyboard.type('Hello World', 50)  // 50ms delay between chars
await page.keyboard.press('Enter')
await page.keyboard.press('Tab')
await page.keyboard.press('Escape')
await page.keyboard.down('Shift')
await page.keyboard.up('Shift')
await page.keyboard.shortcut(['Control', 'a'])  // Select all
await page.keyboard.shortcut(['Control', 'c'])  // Copy
await page.keyboard.shortcut(['Control', 'v'])  // Paste
await page.keyboard.shortcut(['Meta', 'a'])     // Cmd+A on Mac
```

| Method | Description |
|--------|-------------|
| `type(text, delay?)` | Type text character by character |
| `press(key)` | Press and release a key (keyDown → char → keyUp) |
| `down(key)` | Hold a key down |
| `up(key)` | Release a key |
| `shortcut(keysArray)` | Press modifier combo, e.g. `['Control', 'Shift', 'i']` |

**Supported special keys:** `Enter`, `Tab`, `Backspace`, `Delete`, `Escape`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `F1`-`F12`, `Control`, `Shift`, `Alt`, `Meta`, `Space`

---

### Touch

Touch input simulation via CDP. Available at `page.touch`.

```js
await page.touch.tap(200, 300)
await page.touch.doubleTap(200, 300)
await page.touch.longPress(200, 300, 1000)   // hold for 1s

// Swipe from point A to B
await page.touch.swipe(200, 500, 200, 100)   // swipe up
await page.touch.swipe(200, 100, 200, 500)   // swipe down
await page.touch.swipe(300, 200, 50, 200)    // swipe left

// Pinch zoom
await page.touch.pinch(200, 300, 50, 200)    // zoom in (fingers spread)
await page.touch.pinch(200, 300, 200, 50)    // zoom out (fingers close)

// Touch scroll
await page.touch.scroll(200, 300, 0, 200)    // scroll down 200px
```

| Method | Description |
|--------|-------------|
| `tap(x, y)` | Tap at position |
| `doubleTap(x, y)` | Double-tap at position |
| `longPress(x, y, duration?)` | Long press (default 800ms) |
| `swipe(fromX, fromY, toX, toY, steps?, duration?)` | Swipe gesture |
| `pinch(cx, cy, startDistance, endDistance, steps?)` | Pinch in/out at center point |
| `scroll(x, y, deltaX, deltaY, steps?)` | Touch scroll |

---

### Network

CDP-based network interception using Chrome DevTools Protocol.

#### Block Resource Types (Performance)

```js
// Block images, media, and fonts for faster loading
await page.network.blockResourceTypes(['Image', 'Media', 'Font'])
```

**Available resource types:** `Document`, `Stylesheet`, `Image`, `Media`, `Font`, `Script`, `TextTrack`, `XHR`, `Fetch`, `EventSource`, `WebSocket`, `Manifest`, `Other`

#### Set Extra Headers

```js
await page.network.setExtraHTTPHeaders({
  'Authorization': 'Bearer token123',
  'X-Custom-Header': 'value'
})
```

#### Intercept Requests

```js
await page.network.interceptRequests(async (params) => {
  const url = params.request.url

  // Block ads
  if (url.includes('ads') || url.includes('tracking')) {
    return { action: 'block' }
  }

  // Modify request
  if (url.includes('api.example.com')) {
    return {
      action: 'continue',
      headers: { 'Authorization': 'Bearer mytoken' }
    }
  }

  // Let everything else through
  return { action: 'continue' }
})
```

**Handler return values:**

| Return | Description |
|--------|-------------|
| `{ action: 'continue' }` | Allow request normally |
| `{ action: 'continue', url, headers }` | Allow with modified URL or headers |
| `{ action: 'block' }` | Block the request |

#### Get Response Body

```js
const { body, base64Encoded } = await page.network.getResponseBody(requestId)
```

#### Lifecycle

```js
await page.network.enable()   // Enable CDP Network domain
await page.network.disable()  // Disable CDP Network domain
page.network.destroy()        // Clean up all listeners
```

---

### GridManager

Arranges multiple BrowserViews in a dynamic grid inside the window.

```js
// Access via manager.grid
manager.grid.setGrid(5, 2)      // 5 columns, 2 rows
manager.grid.setGrid(2, 2)      // 2x2 grid
manager.grid.setGrid(3, 3)      // 3x3 grid
manager.grid.autoGrid()          // Auto-calculate from view count
manager.grid.maximize('user1')   // Maximize one view to full window
manager.grid.restoreGrid()       // Restore back to grid
manager.grid.destroy()           // Clean up resize listener
```

| Method | Description |
|--------|-------------|
| `setGrid(cols, rows)` | Set explicit grid dimensions |
| `autoGrid()` | Auto-calculate grid based on number of views |
| `maximize(profileId)` | Make one view fill the entire window, hide others |
| `restoreGrid()` | Restore all views to grid layout |
| `destroy()` | Remove resize listener and clear view tracking |

Grid auto-adjusts on window resize.

---

### ProfileManager

Each profile uses `partition: persist:<profileId>` for fully isolated sessions.

```js
const { ProfileManager } = require('electron-automation-core')

const pm = new ProfileManager()
const profile = pm.create('user1', { proxy: 'http://proxy:8080', userAgent: 'MyUA' })
// profile.partition = 'persist:user1'
// profile.session = Electron Session object

pm.get('user1')      // get profile info
pm.list()            // ['user1']
await pm.destroy('user1')  // clear storage + cache
await pm.cleanup()         // destroy all
```

> **Note:** You typically don't use ProfileManager directly — `BrowserManager` handles this internally.

---

## Multi-Profile with Proxy Example

```js
const manager = new BrowserManager(mainWindow)

const p1 = manager.createProfile('user1', {
  proxy: 'http://proxy1:8080',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
})

const p2 = manager.createProfile('user2', {
  proxy: 'socks5://proxy2:1080',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
})

// Each profile has its own cookies, localStorage, proxy, and UA
await p1.goto('https://whatismyip.com')
await p2.goto('https://whatismyip.com')
```

---

## Full Automation Example (Facebook-like)

```js
const manager = new BrowserManager(mainWindow)
const page = manager.createProfile('bot1')

// Setup
page.grantAllPermissions()
page.blockPopups()
await page.dialogs.enable()
await page.setWebRTCPolicy('default_public_interface_only')
page.downloads.enable({ savePath: '/tmp/downloads' })

// Navigate
await page.goto('https://example.com')
await page.waitForSelector('#login')

// Fill form
await page.type('#email', 'user@example.com', 30)
await page.type('#password', 'pass123', 30)
await page.click('#submit')
await page.waitForNavigation()

// Upload image (hidden file input)
await page.interceptFileChooser('/path/to/photo.jpg')
await page.click('[aria-label="Photo/video"]')
await page.waitForTimeout(2000)

// Search text on page
const found = await page.findText('Welcome')
console.log(`Found ${found.matches} matches`)

// Read page info
console.log('Title:', page.title())
console.log('URL:', page.url())

// Work with iframes
const frames = await page.getFrames()
if (frames.length > 1) {
  const iframeText = await page.getFrameText(1)
  console.log('iframe content:', iframeText)
}

// Save cookies for later
const cookies = await page.getCookies()
await page.flushCookies()

// Cleanup
await manager.cleanup()
```

---

## Performance Tips

| Tip | How |
|-----|-----|
| Block images/media | `createProfile('id', { disableImages: true })` |
| Disable CSS animations | `createProfile('id', { disableAnimations: true })` |
| Block specific resources | `page.network.blockResourceTypes(['Image', 'Media', 'Font'])` |
| Disable GPU | Launch Electron with `--disable-gpu` flag |
| Prevent memory leaks | Always call `manager.cleanup()` or `manager.destroyProfile(id)` |
| Reduce CPU per view | `backgroundThrottling: false` is already set in webPreferences |
| Block popups | `page.blockPopups()` to prevent unwanted windows |
| Handle dialogs | `page.dialogs.enable()` to prevent automation from getting stuck |

---

## Exported Modules

```js
const {
  BrowserManager,    // Main entry — manages profiles and grid
  ElectronPage,      // Page automation (Playwright-like API)
  Mouse,             // Mouse input simulation
  Keyboard,          // Keyboard input simulation
  Touch,             // Touch input simulation (tap, swipe, pinch)
  Network,           // CDP network interception
  DialogHandler,     // JS dialog auto-handling
  DownloadManager,   // Download management
  Waiter,            // Wait utilities
  ProfileManager,    // Session/partition management
  GridManager,       // Multi-view grid layout
  ElementHandle,     // Element interaction handle
} = require('electron-automation-core')
```

---

## Safety

- Debugger is never attached twice (check `isAttached()` before attach)
- All debugger attach errors are caught
- All listeners are removed on `destroy()`
- Fully async/await — no callback hell
- Crashed renderers are caught via `render-process-gone` event
- Unhandled promise rejections are prevented with `.catch()` on fire-and-forget calls

---

## License

MIT
