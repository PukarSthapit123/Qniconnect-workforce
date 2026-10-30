import type { Page } from '@playwright/test';
import { test, expect, FROZEN } from './support/fixtures';
import { tid } from '../src/testids';
import { signInEmail } from './support/timesheet';
import { AMARA, DEE } from './support/read';

/* Task 24: visual baselines for the pages ported from QniConnect, after the
   design pass (docs/superpowers/reviews/ui-pass.md), at desktop (1440) and
   phone (390) widths, in light and dark, on the social seed against the
   frozen clock: Home, Documents and Profile for Amara Okafor; Overview,
   Environments and Setup · Employees for Dee Fitzgerald (a portal admin); and,
   signed out, Landing, Registration and Pricing. Refresh them deliberately,
   with --update-snapshots, only after looking at what changed. */
const WIDTHS = [{ w: 1440, h: 1000 }, { w: 390, h: 844 }] as const;
const THEMES = ['light', 'dark'] as const;
test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
}

for (const { w, h } of WIDTHS) {
  for (const theme of THEMES) {
    test(`visual: the QniConnect pages at ${w}px, ${theme}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.clock.setFixedTime(new Date(FROZEN));
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript(t => { try { localStorage.setItem('qnipay.theme', t); } catch { /* the theme is also set on the html element */ } }, theme);
      const shot = async (name: string) => {
        await settle(page);
        await expect(page).toHaveScreenshot(`qc-${name}-${w}-${theme}.png`, { fullPage: true });
      };
      const visit = async (path: string, ...ready: string[]) => {
        await page.goto(path);
        for (const r of ready) await page.getByTestId(r).waitFor();
        await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
      };

      /* signed out: the public pages */
      await visit('/', tid.page('landing'));
      await shot('landing');
      await visit('/register', tid.page('register'), tid.reg.step);
      await shot('register');
      await visit('/pricing', tid.page('pricing'), tid.price.base);
      await shot('pricing');

      await signInEmail(page, AMARA);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await visit('/work/home', tid.home.summary, tid.home.payslip(0));
      await shot('home');
      await visit('/work/docs', tid.docs.card, tid.docs.payslip(0), tid.docs.tax);
      await shot('docs');
      await visit('/work/profile', tid.profile.state, tid.profile.bcValue('pensionContribution'));
      await shot('profile');

      await signInEmail(page, DEE);
      await visit('/setup/aoverview', tid.aoverview.tenant, tid.aoverview.users);
      await shot('overview');
      await visit('/setup/aenv', tid.aenv.list);
      await shot('environments');
      await visit('/setup/aemployees', tid.employees.table, tid.people.portalCol('CP-1042'));
      await shot('people');
    });
  }
}

/* Task 19 carry-in: at 390px no label in the phone's bottom bar is cut
   short, in Business Central's setup (Environments, Authorization) or in My
   work (My Calendar's Calendar, Documents). */
test('phone: every bottom bar label is whole at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const whole = async (where: string) => {
    const bar = page.getByRole('navigation', { name: 'Quick pages' });
    await bar.waitFor();
    const cut = await bar.locator('a > span:last-child, button > span:last-child').evaluateAll(spans =>
      spans.filter(s => s.scrollWidth > s.clientWidth).map(s => s.textContent));
    expect(cut, where).toEqual([]);
  };
  await signInEmail(page, DEE);
  await page.goto('/setup/aenv');
  await page.getByTestId(tid.aenv.list).waitFor();
  await whole('Business Central setup');
  await signInEmail(page, AMARA);
  await page.goto('/work/home');
  await page.getByTestId(tid.home.summary).waitFor();
  await whole('My work');
});
