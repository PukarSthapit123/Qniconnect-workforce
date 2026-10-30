import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { tid } from '../src/testids';

/* Task 20: Setup › Employees (spec D12, N18, N19), one table of people, in the
   browser on the fake /bc and /api/v1. The social seed's admin, Dee Fitzgerald, holds
   master_data and is a portal admin; every seed person has a portal login,
   and the other tenant's people have logins but no record here, so they are
   not listed (user ruling 2026-10-27). A row has one View; the login is
   shown as a mark beside the status and managed on the record. */
const AMARA_ID = 'pu-CP-1042';
async function open(page: Page) {
  await page.goto('/setup/aemployees');
  await page.getByTestId(tid.page('aemployees')).waitFor();
  await page.getByTestId(tid.employees.table).waitFor();
  await expect(page.getByTestId(tid.people.portalCol('CP-1042'))).toHaveAttribute('data-login', 'on');
}
async function loginMenu(page: Page) {
  if (!(await page.getByTestId(tid.employee.record).isVisible())) {
    await page.getByTestId(tid.employees.open('CP-1042')).click();
    await page.getByTestId(tid.employee.record).waitFor();
  }
  await page.getByTestId(tid.ausers.menu(AMARA_ID)).click();
}

test('Setup · Employees: each person once, in one table, with their portal login', async ({ page, signInAs }) => {
  await signInAs('admin');
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Employees');
  await expect(page.getByTestId(tid.nav.tab('aemployees'))).toHaveText('Employees');
  await expect(page.getByTestId(tid.people.recordsNotConnected)).toContainText('Not yet connected');
  await expect(page.getByTestId(tid.people.portalCol('CP-1002'))).toContainText('portal admin');
  /* one button per row, and no row for a login without a record */
  await expect(page.getByTestId(tid.employees.row('CP-1042')).getByRole('button')).toHaveCount(1);
  await expect(page.getByTestId(tid.ausers.noRecord('pu-EMP001'))).toHaveCount(0);
  /* View opens the Workforce record, with its portal login and the login's actions */
  await page.getByTestId(tid.employees.open('CP-1042')).click();
  await expect(page.getByTestId(tid.employee.record)).toContainText('Amara Okafor');
  await expect(page.getByTestId(tid.people.recordPortal)).toContainText('Active');
  await expect(page.getByTestId(tid.ausers.menu(AMARA_ID))).toBeVisible();
});

test('deactivate and activate a portal login from the record; the mark on the row follows', async ({ page, signInAs }) => {
  await signInAs('admin');
  await open(page);
  await loginMenu(page);
  await page.getByTestId(tid.ausers.deactivate(AMARA_ID)).click();
  await expect(page.getByTestId(tid.ausers.status(AMARA_ID))).toHaveText('Inactive');
  await expect(page.getByTestId(tid.people.portalCol('CP-1042'))).toHaveAttribute('data-login', 'off');
  await loginMenu(page);
  await page.getByTestId(tid.ausers.activate(AMARA_ID)).click();
  await expect(page.getByTestId(tid.ausers.status(AMARA_ID))).toHaveText('Active');
  await expect(page.getByTestId(tid.people.portalCol('CP-1042'))).toHaveAttribute('data-login', 'on');
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: Setup · Employees, a record and its login dialog have no serious issues (${theme})`, async ({ page, signInAs }) => {
    await signInAs('admin');
    await open(page);
    await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
    const serious = async (what: string) => {
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${what} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
    };
    expect(await serious('page')).toEqual([]);
    await page.getByTestId(tid.employees.open('CP-1042')).click();
    await page.getByTestId(tid.employee.record).waitFor();
    expect(await serious('record')).toEqual([]);
    await page.getByTestId(tid.ausers.menu(AMARA_ID)).click();
    await page.getByTestId(tid.ausers.edit(AMARA_ID)).click();
    await page.getByTestId(tid.ausers.form).waitFor();
    expect(await serious('login dialog')).toEqual([]);
  });
}

test('phone: no horizontal overflow on Setup · Employees at 390px', async ({ page, signInAs }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs('admin');
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
