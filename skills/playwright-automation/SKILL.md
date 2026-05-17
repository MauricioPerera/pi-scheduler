---
name: playwright-automation
description: Browser automation templates for pi-scheduler using Playwright
version: 1.0.0
---

# Playwright Automation

pi-scheduler includes three built-in templates for browser automation via [Playwright](https://playwright.dev). These templates execute as JavaScript scripts in a `child_process`, keeping `pi-scheduler-core` zero-dependency.

## Prerequisites

Install Playwright in your project directory (the `cwd` you set on the automation):

```bash
npm install playwright
npx playwright install chromium
```

## Built-in Templates

### `web-screenshot`

Navigates to a URL and saves a `screenshot.png` in the automation's `cwd`.

```typescript
scheduler.instantiateTemplate('web-screenshot', {
  name: 'Dashboard screenshot',
  cwd: 'D:/repos/myproject',
  params: { url: 'http://localhost:3000' },
});
```

**Params:** `url` — target URL (no query strings; use simple URLs like `http://host:port/path`).

---

### `url-health-check`

Loads a URL with a real browser and exits with code 1 if HTTP status ≥ 400. Useful for SPAs or pages behind auth that need JavaScript to render.

```typescript
scheduler.instantiateTemplate('url-health-check', {
  name: 'API health',
  intervalMinutes: 5,
  cwd: 'D:/repos/myproject',
  params: { url: 'http://localhost:8080/health' },
});
```

**Params:** `url` — endpoint to check.

---

### `login-flow`

Submits a login form and reports the resulting page title. Useful for verifying an auth flow is still working.

```typescript
scheduler.instantiateTemplate('login-flow', {
  name: 'Auth smoke check',
  intervalMinutes: 30,
  cwd: 'D:/repos/myproject',
  params: { url: 'https://myapp.internal/login' },
});
```

**Params:** `url` — login page URL.  
**Env vars:** `PW_USERNAME`, `PW_PASSWORD` — credentials (never put secrets in the `params` object).

> The login-flow template uses heuristic selectors (`[name="username"]`, `[type="submit"]`). Copy the script to a custom template and adjust selectors for your specific app.

---

## Custom Playwright Templates

Register your own template at runtime:

```typescript
scheduler.registerTemplate({
  id: 'my-playwright-task',
  name: 'My browser task',
  description: 'Custom Playwright automation.',
  defaultInterval: 60,
  scriptType: 'javascript',
  command: null,
  script: `
const { createRequire } = require('node:module');
const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://yourapp.com');
  // ... your automation logic ...
  await browser.close();
})();
  `.trim(),
  subagentConfig: null,
  requiredParams: [],
});
```

The key pattern is `createRequire(process.cwd() + '/package.json')` — this resolves `playwright` from the `node_modules` of the automation's `cwd`, so each project can have its own Playwright version.

## Running the Integration Test

```bash
cd D:/repos/pi-scheduler
npm install playwright
npx playwright install chromium
node test-integration/playwright.mjs
```

The test is skipped gracefully if Playwright is not installed.
