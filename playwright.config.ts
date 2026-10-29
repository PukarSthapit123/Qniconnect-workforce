import { defineConfig, devices } from '@playwright/test';
/* E2E_PORT moves the dev server off 3000, so a second checkout (a git
   worktree) can run its suite without reusing another checkout's server. */
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testDir: 'e2e', fullyParallel: false, workers: 1, retries: 0, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, testIdAttribute: 'data-testid', trace: 'retain-on-failure', locale: 'en-GB', timezoneId: 'Europe/London' },
  /* Visual baselines (e2e/visual.spec.ts): font smoothing and sub-pixel text
     differ a little between runs, never by a layout's worth. */
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  /* One worker, never more: a full run on a memory-starved machine lost Chromium
     workers (Windows 0xC0000142, "Target crashed"). The dev server gets a
     bounded heap so it cannot grow into the room the browser needs. The specs
     sign in through the auth stub (signInAs in e2e/support/fixtures.ts), with
     the fake /bc and /session on; values in the process environment win over
     the .env files, so `npm run dev` itself stays on MSAL. */
  webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI,
    env: { NODE_OPTIONS: '--max-old-space-size=2048', VITE_AUTH: 'stub', VITE_FAKE_BC: 'on' } },
});
