# electron-automation-core

Reusable Electron automation core module with embedded multi-browser grid and Playwright-like wrapper API.

## Installation

```bash
npm install github:yourname/electron-automation-core
```

## Requirements

- Electron >= 28
- Node.js >= 18
- CommonJS

## Basic Usage

```js
const { BrowserManager } = require('electron-automation-core')

// mainWindow = your existing BrowserWindow instance
const manager = new BrowserManager(mainWindow)

const profile1 = manager.createProfile('user1')

await profile1.goto('https://example.com')
await profile1.waitForSelector('#login')
await profile1.type('#email', 'test@gmail.com')
await profile1.click('#submit')

// Cleanup when done
await manager.cleanup()
```

## Grid Layout

```js
const manager = new BrowserManager(mainWindow)

manager.createProfile('user1')
manager.createProfile('user2')
manager.createProfile('user3')
manager.createProfile('user4')

// Set custom grid
manager.grid.setGrid(2, 2) // 2 columns x 2 rows

// Maximize one view
manager.grid.maximize('user1')

// Restore grid
manager.grid.restoreGrid()

// Auto-calculate grid based on view count
manager.grid.autoGrid()
```

## Network Blocking (Performance)

```js
const profile = manager.createProfile('fast-user', {
  disableImages: true,
  disableAnimations: true,
})

await profile.goto('https://heavy-site.com')

// Or manually block resource types
await profile.network.blockResourceTypes(['Image', 'Media', 'Font'])
```

## Request Interception

```js
await profile.network.interceptRequests(async (params) => {
  if (params.request.url.includes('ads')) {
    return { action: 'block' }
  }
  return { action: 'continue' }
})
```

## Multi-Profile with Proxy

```js
const p1 = manager.createProfile('user1', {
  proxy: 'http://proxy1:8080',
  userAgent: 'Custom UA 1',
})

const p2 = manager.createProfile('user2', {
  proxy: 'socks5://proxy2:1080',
  userAgent: 'Custom UA 2',
})

await p1.goto('https://example.com')
await p2.goto('https://example.com')
```

## Cookies

```js
const cookies = await profile.getCookies()
await profile.setCookies([
  { url: 'https://example.com', name: 'token', value: 'abc123' }
])
await profile.clearCookies()
```

## Screenshots & PDF

```js
await profile.screenshot({ path: '/tmp/screenshot.png' })
await profile.pdf({ path: '/tmp/page.pdf', landscape: true })
```

## Mouse & Keyboard

```js
await profile.mouse.click(100, 200)
await profile.mouse.drag(100, 200, 300, 400)
await profile.mouse.wheel(0, -100)

await profile.keyboard.type('Hello World', 50)
await profile.keyboard.press('Enter')
await profile.keyboard.shortcut(['Control', 'a'])
```

## API Reference

### BrowserManager

| Method | Description |
|---|---|
| `createProfile(id, options)` | Create a BrowserView + ElectronPage |
| `destroyProfile(id)` | Destroy a profile and its view |
| `getProfile(id)` | Get ElectronPage by profile ID |
| `listProfiles()` | List all profile IDs |
| `cleanup()` | Destroy everything |
| `grid` | Access GridManager |

### ElectronPage

**Navigation:** `goto(url)`, `reload()`, `goBack()`, `goForward()`, `waitForNavigation()`, `waitForNetworkIdle()`

**Evaluation:** `evaluate(script)`, `waitForSelector(selector)`, `waitForFunction(fn)`, `waitForTimeout(ms)`

**Interaction:** `click(selector)`, `type(selector, text, delay)`, `hover(selector)`, `focus(selector)`, `select(selector, value)`, `check(selector)`, `uncheck(selector)`

**Files:** `upload(selector, filePath)`, `screenshot(options)`, `pdf(options)`

**Cookies:** `getCookies()`, `setCookies(cookies)`, `clearCookies()`

**Emulation:** `setUserAgent(ua)`, `setViewport(w, h)`, `setExtraHTTPHeaders(headers)`

**Sub-objects:** `mouse` (Mouse), `keyboard` (Keyboard), `network` (Network)

### GridManager

| Method | Description |
|---|---|
| `setGrid(cols, rows)` | Set grid dimensions |
| `autoGrid()` | Auto-calculate from view count |
| `maximize(profileId)` | Maximize one view |
| `restoreGrid()` | Restore grid layout |

## Performance Tips

- Use `disableImages: true` to block images/media
- Use `disableAnimations: true` to inject CSS disabling animations
- Detach debugger when not using CDP features
- Call `destroy()` / `cleanup()` to prevent memory leaks
- Use `backgroundThrottling: false` in webPreferences (already set)
- Run with `--disable-gpu` flag if not rendering visuals

## License

MIT
