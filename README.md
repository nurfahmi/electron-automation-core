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

app.whenReady().then(() => {
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
await page.goBack()
await page.goForward()
await page.waitForNavigation(timeout?)       // default 30000ms
await page.waitForNetworkIdle(timeout?)       // default 30000ms
```

| Method | Description |
|--------|-------------|
| `goto(url)` | Navigate to URL, resolves when page loads |
| `reload()` | Reload and wait for navigation |
| `goBack()` | Go back in history |
| `goForward()` | Go forward in history |
| `waitForNavigation(timeout?)` | Wait for next navigation to complete |
| `waitForNetworkIdle(timeout?)` | Wait until no network activity for 500ms |

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
await page.upload('#fileInput', '/path/to/file.pdf')
await page.upload('#fileInput', ['/path/a.jpg', '/path/b.jpg'])  // multiple files

const pngBuffer = await page.screenshot()
await page.screenshot({ path: '/tmp/shot.png' })

const pdfBuffer = await page.pdf()
await page.pdf({ path: '/tmp/page.pdf', landscape: true, pageSize: 'A4' })
```

| Method | Description |
|--------|-------------|
| `upload(selector, filePath)` | Set file(s) on `<input type="file">` via CDP |
| `screenshot(options?)` | Capture page as PNG. Options: `{ path }` |
| `pdf(options?)` | Export page as PDF. Options: `{ path, landscape, printBackground, pageSize }` |

#### Cookies & Storage

```js
const cookies = await page.getCookies()
const filtered = await page.getCookies({ domain: '.example.com' })

await page.setCookies([
  { url: 'https://example.com', name: 'session', value: 'abc123' }
])

await page.clearCookies()
```

| Method | Description |
|--------|-------------|
| `getCookies(filter?)` | Get all cookies, optionally filtered by `{ domain, name, url, path }` |
| `setCookies(cookies[])` | Set cookies. Each needs at minimum `{ url, name, value }` |
| `clearCookies()` | Remove all cookies for the session |

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

#### Direct Access

```js
page.mouse      // Mouse instance
page.keyboard   // Keyboard instance
page.network    // Network instance
page.webContents // Electron WebContents
page.view        // Electron BrowserView
```

#### Lifecycle

```js
page.destroy()   // Clean up listeners, detach debugger, destroy network
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

## Performance Tips

| Tip | How |
|-----|-----|
| Block images/media | `createProfile('id', { disableImages: true })` |
| Disable CSS animations | `createProfile('id', { disableAnimations: true })` |
| Block specific resources | `page.network.blockResourceTypes(['Image', 'Media', 'Font'])` |
| Disable GPU | Launch Electron with `--disable-gpu` flag |
| Prevent memory leaks | Always call `manager.cleanup()` or `manager.destroyProfile(id)` |
| Reduce CPU per view | `backgroundThrottling: false` is already set in webPreferences |

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
