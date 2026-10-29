import { test, expect, FROZEN, PRODUCTION, signInPage } from './support/fixtures';
import { tid } from '../src/testids';

/* Sign-in through the auth stub (VITE_AUTH=stub): the account the dev picker,
   or signInAs, leaves in sessionStorage stands in for the Microsoft one, and
   the fake /bc and /api/v1 read its email from the unsigned token. */

test('employee lands on My Work', async ({ page, signInAs }) => {
  await signInAs('employee');
  expect(new URL(page.url()).pathname).toBe('/work/home');
  await expect(page.getByTestId(tid.shell.rolePill)).toHaveText('Employee');
  await expect(page.getByTestId(tid.nav.group('setup'))).toHaveCount(0);
});

test('admin sees Setup', async ({ page, signInAs }) => {
  await signInAs('admin');
  await expect(page.getByTestId(tid.shell.rolePill)).toHaveText('Admin');
  await expect(page.getByTestId(tid.nav.group('setup'))).toBeVisible();
});

/* AUTH.R65 to AUTH.R67: the welcome sits over the app, cannot be closed,
   and Continue (the fake /bc's status update) clears it. */
test('first-login user sees the overlay, and Continue clears it', async ({ page }) => {
  await page.goto('/dev/sign-in');
  await signInPage(page, 'firstlogin@brightpath.org');
  const overlay = page.getByTestId(tid.accountSetup.firstLogin);
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('This is your first login to the QniConnect Employee Portal.');
  await page.keyboard.press('Escape');
  await expect(overlay).toBeVisible();
  await page.getByTestId(tid.accountSetup.firstLoginContinue).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId(tid.shell.account)).toBeVisible();
});

/* Environment selection (AUTH.R49 to AUTH.R56) through the dev picker. */
test('signed out, the app goes to the dev picker; picking somebody, then an environment, signs in as them', async ({ page, api }) => {
  const accounts = (await api.get('/api/v1/session/accounts')).body as { email: string; name: string; userType: string }[];
  const manager = accounts.find(a => a.userType === 'manager');
  if (!manager) throw new Error('no seeded manager');
  await page.evaluate(() => { localStorage.removeItem('activeEnvironment'); });
  await page.goto('/work/home');
  await expect(page).toHaveURL(/\/dev\/sign-in$/);
  await expect(page.getByTestId(tid.devSignIn.group('manager'))).toBeVisible();
  await page.getByTestId(tid.devSignIn.account(manager.email)).click();
  await expect(page).toHaveURL(/\/account-setup\/environment$/);
  await expect(page.getByTestId(tid.accountSetup.continue)).toBeDisabled();
  await page.getByTestId(tid.accountSetup.environment(PRODUCTION.id)).click();
  await page.getByTestId(tid.accountSetup.continue).click();
  await expect(page.getByTestId(tid.shell.rolePill)).toHaveText('Manager');
  expect(await page.evaluate(() => sessionStorage.getItem('qniconnect.devAccount'))).toBe(manager.email);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('activeEnvironment') ?? '{}'))).toMatchObject({ id: PRODUCTION.id });
});

/* Review focus 5: an environment /bc/environments no longer lists sends the
   person back to environment selection, not to calls that fail. */
test('a stale activeEnvironment returns to environment selection', async ({ page, signInAs }) => {
  await signInAs('employee');
  await page.evaluate(() => { localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-retired-07', name: 'Retired', type: 'Sandbox' })); });
  await page.reload();
  await expect(page).toHaveURL(/\/account-setup\/environment$/);
  await expect(page.getByTestId(tid.accountSetup.environment(PRODUCTION.id))).toBeVisible();
  await expect(page.getByTestId(tid.shell.account)).toHaveCount(0);
});

test('each persona signs in, and signing out ends at the landing page', async ({ page, signInAs }) => {
  const roleName = { employee: 'Employee', manager: 'Manager', admin: 'Admin' } as const;
  /* Employee and manager both hold own_home, so they land on My Work's Home;
     the seed admin is a portal admin (isAdmin), so it lands on Setup ›
     Business Central › Overview (Task 19, spec section 8). */
  const landingPath = { employee: '/work/home', manager: '/work/home', admin: '/setup/aoverview' } as const;
  for (const p of ['employee', 'manager', 'admin'] as const) {
    await signInAs(p);
    await expect(page.getByTestId(tid.shell.rolePill)).toHaveText(roleName[p]);
    expect(new URL(page.url()).pathname, `${p} lands on their own surface`).toBe(landingPath[p]);
    await page.getByTestId(tid.shell.account).click();
    await page.getByTestId(tid.shell.signOut).click();
    /* Microsoft's sign-out returns to the origin, which is the landing page signed out (Task 21) */
    await expect(page.getByTestId(tid.page('landing'))).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByTestId(tid.shell.account)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('activeEnvironment'))).toBeNull();
  }
});

test('signInAs reloads the page but the frozen clock survives it', async ({ api, signInAs }) => {
  await api.setClock(FROZEN);
  await signInAs('employee');
  expect(await api.get('/api/_dev/clock')).toMatchObject({ status: 200, body: { now: FROZEN } });
});
