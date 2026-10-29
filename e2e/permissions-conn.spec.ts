import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { tid } from '../src/testids';

/* Task 19: Setup › Business Central (QniConnect's admin pages) behind
   isAdmin from the portal check (spec N18, Review focus 4), in the browser,
   on the fake /bc. Seed admins are portal admins; seed employees are not. */
const READY: Record<string, string> = {
  aoverview: tid.aoverview.tenant, aenv: tid.aenv.list, aauth: tid.aauth.details, asettings: tid.asettings.save,
};
async function at(page: Page, view: string) {
  await page.goto(`/setup/${view}`);
  await page.getByTestId(tid.page(view)).waitFor();
  const ready = READY[view];
  if (ready) await page.getByTestId(ready).waitFor();
}

test('typing /setup/aenv without isAdmin shows Page unavailable', async ({ page, signInAs }) => {
  await signInAs('employee');
  for (const view of ['aenv', 'aoverview', 'aauth', 'asettings']) {
    await page.goto(`/setup/${view}`);
    const un = page.getByTestId(tid.unavailable.root);
    await expect(un).toBeVisible();
    await expect(un).toHaveAttribute('data-known', 'true');
    await expect(page.getByTestId(tid.page(view))).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/setup/${view}`);
  }
  await expect(page.getByTestId(tid.nav.group('setup'))).toHaveCount(0);
});

test('a portal admin lands on the overview; the Business Central section opens all four pages', async ({ page, signInAs }) => {
  await signInAs('admin');
  await expect(page).toHaveURL(/\/setup\/aoverview$/);
  await page.getByTestId(tid.aoverview.tenant).waitFor();
  await expect(page.getByTestId(tid.aoverview.tenant)).toContainText('BrightPath Care Ltd');
  for (const view of ['aenv', 'aauth', 'asettings', 'aoverview']) {
    await page.getByTestId(tid.nav.tab(view)).click();
    await page.getByTestId(tid.page(view)).waitFor();
    await expect(page.getByTestId(tid.nav.tab(view))).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/setup/asetup');
  await expect(page.getByTestId(tid.setup.card('conn'))).toContainText('Overview · Environments · Authorization · Settings');
});

test('a new authorization runs its popup round trip on the fake and reports success', async ({ page, signInAs }) => {
  await signInAs('admin');
  await at(page, 'aauth');
  await page.getByTestId(tid.aauth.start).click();
  const popup = page.waitForEvent('popup');
  await page.getByTestId(tid.aauth.begin).click();
  const win = await popup;
  await expect(win.getByTestId(tid.auth.callbackTitle)).toHaveText('Authorization successful');
  await expect(page.getByTestId(tid.aauth.message)).toHaveText('Authorization completed and tokens stored successfully in Business Central!');
  await expect(page.getByTestId(tid.aauth.expiry)).toHaveText('90 days remaining');
});

test('Set as default moves the session to that environment', async ({ page, signInAs }) => {
  await signInAs('admin');
  await at(page, 'aenv');
  await page.getByTestId(tid.aenv.setDefault('env-sandbox-01')).click();
  await expect(page.getByTestId(tid.aenv.isDefault('env-sandbox-01'))).toHaveText('Default');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}').id)).toBe('env-sandbox-01');
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: the Business Central pages have no serious issues (${theme})`, async ({ page, signInAs }) => {
    await signInAs('admin');
    for (const view of ['aoverview', 'aenv', 'aauth', 'asettings']) {
      await at(page, view);
      await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${view} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}

test('phone: no horizontal overflow on the Business Central pages at 390px', async ({ page, signInAs }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs('admin');
  for (const view of ['aoverview', 'aenv', 'aauth', 'asettings']) {
    await at(page, view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), view).toBe(true);
  }
});
