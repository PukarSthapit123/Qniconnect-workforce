import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { tid } from '../src/testids';

/* Task 21: the public pages outside the app frame (landing, sign-in,
   registration, pricing) and QniConnect's old addresses, in the browser on
   the fake /bc. Signed out, / is the landing page; the auth stub's sign-in
   is the dev picker. */
const NORTHWIND = { companyName: 'Northwind Care', companyEmail: 'hello@northwind.test', tenantId: '3c9d1e2f-0000-4a4a-9b9b-111122223333',
  domainName: 'northwind.onmicrosoft.com', bcEnvironment: 'Production', bcCompanyName: 'Northwind UK', numberOfEmployees: '40',
  contactName: 'Ana Silva', contactEmail: 'ana@northwind.test' };

async function fillRegistration(page: Page, values: Record<string, string> = NORTHWIND) {
  const fill = (name: string) => page.getByTestId(tid.reg.field(name)).fill(values[name] ?? '');
  await fill('companyName'); await fill('companyEmail');
  await page.getByTestId(tid.reg.next).click();
  for (const k of ['tenantId', 'domainName', 'bcEnvironment', 'bcCompanyName', 'numberOfEmployees']) await fill(k);
  await page.getByTestId(tid.reg.next).click();
  await expect(page.getByTestId(tid.reg.total)).toHaveText('£192.00'); // 40 employees at £0.40 a month, billed annually (Ruling Q23)
  await page.getByTestId(tid.reg.next).click();
  await fill('contactName'); await fill('contactEmail');
  await page.getByTestId(tid.reg.field('agreeTerms')).click();
  await page.getByTestId(tid.reg.field('agreeDataProcessing')).click();
}

test('signed out, / is the landing page; signing in goes through Microsoft (the dev picker) into the app', async ({ page, api }) => {
  void api;
  await page.goto('/');
  await expect(page.getByTestId(tid.page('landing'))).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your payroll.');
  await page.getByTestId(tid.land.signIn).click();
  await expect(page).toHaveURL(/\/dev\/sign-in$/);
  await page.locator('[data-testid^="dev-sign-in-account-"]').first().click();
  await expect(page.getByTestId(tid.page('account-setup-environment'))).toBeVisible();
});

test('registration: from the landing page through four steps to the confirmation, then home', async ({ page, api }) => {
  void api;
  await page.goto('/');
  await page.getByTestId(tid.land.register).click();
  await expect(page).toHaveURL(/\/register$/);
  await fillRegistration(page);
  await expect(page.getByTestId(tid.reg.summary('plan'))).toHaveText('QniConnect · £0.40/user/mo');
  const posted = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/bc/portalRegistrations'));
  await page.getByTestId(tid.reg.submit).click();
  const body = (await posted).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ company_Name: 'Northwind Care', contactEmail: 'ana@northwind.test', numberOfEmployees: 40, registrationSource: 'Portal' });
  expect(body).not.toHaveProperty('selectedPlan');
  await expect(page.getByTestId(tid.reg.done)).toContainText('We’ve sent a confirmation email to ana@northwind.test');
  await page.getByTestId(tid.reg.doneHome).click();
  await expect(page.getByTestId(tid.page('landing'))).toBeVisible();
});

test('registration: a tenant already registered is refused in the backend\'s words, without its correlation id', async ({ page, api }) => {
  void api;
  await page.goto('/register');
  await fillRegistration(page, { ...NORTHWIND, tenantId: '7d2e9a4b-1c3f-4e5a-8b6d-0f9e8d7c6b02' });
  await page.getByTestId(tid.reg.submit).click();
  await expect(page.getByTestId(tid.reg.error)).toHaveText(/^Registration errorA registration for this tenant already exists\.$/);
  await expect(page.getByTestId(tid.reg.step)).toHaveText('Step 4 of 4');
});

test('pricing: the base price, the add-ons to be priced, and the way to register and to sign in (Ruling Q23)', async ({ page, api }) => {
  void api;
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('£0.50 per employee a month');
  await expect(page.getByTestId(tid.price.addOn('TS'))).toContainText('Price to be confirmed');
  await expect(page.getByTestId(tid.price.addOn('ON'))).toContainText('Price to be confirmed');
  await page.getByTestId(tid.price.cta).click();
  await expect(page.getByTestId(tid.page('register'))).toBeVisible();
  await page.goto('/pricing');
  await page.getByTestId(tid.pub.signIn).click();
  await expect(page.getByTestId(tid.page('login'))).toBeVisible();
  await page.getByTestId(tid.login.signIn).click();
  await expect(page).toHaveURL(/\/dev\/sign-in$/);
});

test('old QniConnect addresses open their new pages', async ({ page, signInAs }) => {
  const visit = async (from: string, to: string, view: string) => {
    await page.goto(from);
    await expect(page.getByTestId(tid.page(view)), from).toBeVisible();
    expect(new URL(page.url()).pathname, from).toBe(to);
  };
  await signInAs('employee');
  await visit('/portal/documents', '/work/docs', 'docs');
  await visit('/portal', '/work/home', 'home');
  /* the seed admin is a portal admin: QniConnect's admin pages, and its admin landing */
  await signInAs('admin');
  await visit('/admin/users', '/setup/aemployees', 'aemployees');
  await visit('/admin/environments', '/setup/aenv', 'aenv');
  await visit('/environment-select', '/setup/aoverview', 'aoverview');
  await page.goto('/login');
  await expect(page.getByTestId(tid.shell.account)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/setup/aoverview');
});

const PAGES: [string, string, (p: Page) => Promise<void>][] = [
  ['/', 'landing', async () => undefined],
  ['/login', 'login', async () => undefined],
  ['/register', 'register', async p => { await fillRegistration(p); }],
  ['/pricing', 'pricing', async p => { await p.getByTestId(tid.price.base).waitFor(); }],
];

for (const theme of ['light', 'dark'] as const) {
  test(`axe: the public pages have no serious issues (${theme})`, async ({ page, api }) => {
    void api;
    for (const [path, view, ready] of PAGES) {
      await page.goto(path);
      await page.getByTestId(tid.page(view)).waitFor();
      await ready(page);
      await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), path).toEqual([]);
    }
  });
}

test('phone: the public pages fit 390px with no sideways scroll', async ({ page, api }) => {
  void api;
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, view, ready] of PAGES) {
    await page.goto(path);
    await page.getByTestId(tid.page(view)).waitFor();
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});

for (const { w, h, theme } of [{ w: 1440, h: 1000, theme: 'light' }, { w: 1440, h: 1000, theme: 'dark' }, { w: 390, h: 844, theme: 'light' }] as const) {
  test(`visual: the public pages at ${w}px, ${theme}`, async ({ page, api }) => {
    void api;
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(t => { try { localStorage.setItem('qnipay.theme', t); } catch { /* set below too */ } }, theme);
    for (const [path, view, ready] of PAGES) {
      await page.goto(path);
      await page.getByTestId(tid.page(view)).waitFor();
      await ready(page);
      await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`public-${view}-${w}-${theme}.png`, { fullPage: true });
    }
  });
}
