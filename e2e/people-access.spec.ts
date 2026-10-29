import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { tid } from '../src/testids';

/* Task 20: Setup › People & access (spec D12, N18, N19), in the browser on
   the fake /bc and /api/v1. The social seed's admin, Dee Fitzgerald, holds
   master_data and is a portal admin; every seed person has a portal login,
   and the other tenant's people have logins but no record here. */
const AMARA_ID = 'pu-CP-1042';
async function open(page: Page) {
  await page.goto('/setup/aemployees');
  await page.getByTestId(tid.page('aemployees')).waitFor();
  await page.getByTestId(tid.ausers.list).waitFor();
  await expect(page.getByTestId(tid.people.portalCol('CP-1042'))).toContainText('Active');
}

test('People & access: the records with their logins, and the logins with their records, on one page', async ({ page, signInAs }) => {
  await signInAs('admin');
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('People & access');
  await expect(page.getByTestId(tid.nav.tab('aemployees'))).toHaveText('People & access');
  await expect(page.getByTestId(tid.people.recordsNotConnected)).toContainText('Not yet connected');
  await expect(page.getByTestId(tid.people.portalCol('CP-1002'))).toContainText('Admin');
  await expect(page.getByTestId(tid.ausers.recordOpen(AMARA_ID))).toHaveText('CP-1042');
  await expect(page.getByTestId(tid.ausers.noRecord('pu-EMP001'))).toContainText('No Workforce record');
  /* a login's record opens the Workforce record, with its portal login */
  await page.getByTestId(tid.ausers.recordOpen(AMARA_ID)).click();
  await expect(page.getByTestId(tid.employee.record)).toContainText('Amara Okafor');
  await expect(page.getByTestId(tid.people.recordPortal)).toContainText('Active');
});

test('deactivate, activate and add a portal login; the list changes in place', async ({ page, signInAs }) => {
  await signInAs('admin');
  await open(page);
  await page.getByTestId(tid.ausers.menu(AMARA_ID)).click();
  await page.getByTestId(tid.ausers.deactivate(AMARA_ID)).click();
  await expect(page.getByTestId(tid.ausers.status(AMARA_ID))).toHaveText('Inactive');
  await expect(page.getByTestId(tid.people.portalCol('CP-1042'))).toContainText('Inactive');
  await page.getByTestId(tid.ausers.menu(AMARA_ID)).click();
  await page.getByTestId(tid.ausers.activate(AMARA_ID)).click();
  await expect(page.getByTestId(tid.ausers.status(AMARA_ID))).toHaveText('Active');

  await page.getByTestId(tid.ausers.add).click();
  await page.getByTestId(tid.ausers.name).fill('Ann Lee');
  await page.getByTestId(tid.ausers.email).fill('Ann.Lee@Elsewhere.org');
  await page.getByTestId(tid.ausers.email).press('Enter');
  await expect(page.getByTestId(tid.ausers.form)).toHaveCount(0);
  const row = page.getByTestId(tid.ausers.list).locator('tbody tr').last();
  await expect(row).toContainText('Ann Lee');
  await expect(row).toContainText('ann.lee@elsewhere.org');
  await expect(row).toContainText('Pending first login');
  await expect(row).toContainText('No Workforce record');
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: People & access and its add dialog have no serious issues (${theme})`, async ({ page, signInAs }) => {
    await signInAs('admin');
    await open(page);
    await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
    const serious = async (what: string) => {
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${what} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
    };
    expect(await serious('page')).toEqual([]);
    await page.getByTestId(tid.ausers.add).click();
    await page.getByTestId(tid.ausers.form).waitFor();
    expect(await serious('add dialog')).toEqual([]);
  });
}

test('phone: no horizontal overflow on People & access at 390px', async ({ page, signInAs }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs('admin');
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
