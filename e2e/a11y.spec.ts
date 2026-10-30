import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, FROZEN } from './support/fixtures';
import { BIGYAN, EDDIE, PUKAR, signInEmail } from './support/timesheet';
import { forgetClock, london } from './support/clock';
import { TOM, completeMine } from './support/onboarding';
import { AMARA_DAY, waitingOnDee } from './support/approvals';
import { CLOCK_STATUS } from '../src/domain/clock';
import { tid } from '../src/testids';
import { AMARA, DEE, RACHEL } from './support/read';

/* Flip the theme, then let the colour transitions it starts finish: axe reads
   computed colours, and a chip caught mid-transition reads as low contrast. */
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(async t => {
    document.documentElement.setAttribute('data-theme', t);
    await Promise.all(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished.catch(() => undefined)));
  }, theme);
}

/* Every built page beyond sign-in, keyed to the one extra piece of its own
   data (besides the page container itself) that means it is actually ready:
   the permissions matrix or the audit table. Running axe or the overflow
   check the instant after goto() risks catching the page mid-fetch (its
   loading state, or nothing yet), rather than the page as an employee would
   actually see it. */
const READY: Record<string, string> = { '/setup/aperm': tid.access.table, '/setup/iaudit': tid.audit.table };

async function waitUntilReady(page: Page, path: string) {
  const view = path.split('/').pop() ?? '';
  await page.getByTestId(tid.page(view)).waitFor();
  const extra = READY[path];
  if (extra) await page.getByTestId(extra).waitFor();
}

/* A fresh admin session starts with an empty audit log (the seed carries no
   audit rows), and the log's own empty state carries no test id to wait on.
   Toggling one capability while on /setup/aperm (visited before /setup/iaudit
   in the loop below) gives /setup/iaudit a real row, so waitUntilReady's wait
   for tid.audit.table below does not hang forever on an empty log. */
async function seedOneAuditRow(page: Page) {
  const saved = page.waitForResponse(r => r.url().includes('/capabilities/proxy') && r.ok());
  await page.getByTestId(tid.access.cell('proxy', 'employee')).click();
  await saved;
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: sign-in, permissions and audit have no serious issues (${theme})`, async ({ page, signInAs }) => {
    const check = async () => {
      await setTheme(page, theme);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    };
    await page.getByTestId(tid.page('dev-sign-in')).waitFor();
    await check();
    await signInAs('admin');
    for (const path of ['/setup/asetup', '/setup/aperm', '/setup/iaudit']) {
      await page.goto(path);
      await waitUntilReady(page, path);
      if (path === '/setup/aperm') await seedOneAuditRow(page);
      await check();
    }
  });
}
test('phone: no horizontal overflow on built pages at 390px', async ({ page, signInAs }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs('admin');
  for (const path of ['/setup/asetup', '/setup/aperm', '/setup/iaudit']) {
    await page.goto(path);
    await waitUntilReady(page, path);
    if (path === '/setup/aperm') await seedOneAuditRow(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});

/* Plan 1b's pages, each read once its own data is on screen, for the
   persona that reaches it; the employee form and the proposal dialog too. */
const PAGES_1B: Record<'admin' | 'manager' | 'employee', [string, string][]> = {
  admin: [['/setup/aemployees', tid.employees.table], ['/setup/aloc', tid.dims.card('locations')], ['/setup/aloc?d=locations', tid.dims.table],
    ['/setup/aloc?d=projects', tid.dims.table], ['/setup/atypes', tid.types.detail]],
  manager: [['/team/temployees', tid.employees.table]],
  employee: [['/work/profile', tid.profile.state]],
};
/* a page with a second part that loads on its own: My profile's payroll record (Task 18) */
const ALSO_READY: Record<string, string> = { '/work/profile': tid.profile.bcValue('pensionContribution') };
const DIALOGS_1B: Record<string, [string, string]> = { '/setup/aemployees': [tid.employees.add, tid.employeeForm.root], '/work/profile': [tid.profile.propose, tid.profile.send] };
for (const theme of ['light', 'dark'] as const) {
  for (const persona of ['admin', 'manager', 'employee'] as const) {
    test(`axe: plan 1b pages for the ${persona} have no serious issues (${theme})`, async ({ page, signInAs }) => {
      test.setTimeout(90_000); // six admin pages, a dialog and an axe run on each
      const check = async (where: string) => {
        await setTheme(page, theme);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
      };
      await signInAs(persona);
      for (const [path, ready] of PAGES_1B[persona]) {
        await page.goto(path);
        await page.getByTestId(ready).waitFor();
        const also = ALSO_READY[path];
        if (also) await page.getByTestId(also).waitFor();
        await check(path);
        const dialog = DIALOGS_1B[path];
        if (dialog) {
          await page.getByTestId(dialog[0]).click();
          await page.getByTestId(dialog[1]).waitFor();
          await check(`${path} dialog`);
          await page.keyboard.press('Escape');
        }
      }
    });
  }
}
test('phone: plan 1b pages have no horizontal overflow at 390px', async ({ page, signInAs }) => {
  test.setTimeout(60_000); // three sign-ins and eight page loads, about 31s on the dev server
  await page.setViewportSize({ width: 390, height: 844 });
  for (const persona of ['admin', 'manager', 'employee'] as const) {
    await signInAs(persona);
    for (const [path, ready] of PAGES_1B[persona]) {
      await page.goto(path);
      await page.getByTestId(ready).waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    }
  }
});

/* Module 2's pages on the qnipay seed, where the timesheet data is: My
   timesheet (week and day) for Bigyan Poudel, Team timesheets (queue, week
   matrix, return and bulk dialogs) and proxy entry for Pukar Sthapit, and
   Timesheet setup with its Add allowance dialog for Eddie Harford. Each step
   is one state of the screen, read once its own data is on screen. */
type Step = [where: string, go: (page: Page) => Promise<void>];
const open = (path: string, ready: string) => async (page: Page) => { await page.goto(path); await page.getByTestId(ready).waitFor(); };
const click = (testId: string, ready: string) => async (page: Page) => { await page.getByTestId(testId).click(); await page.getByTestId(ready).waitFor(); };
const escape = async (page: Page) => { await page.keyboard.press('Escape'); await expect(page.getByTestId(tid.modal.root)).toHaveCount(0); };
const PAGES_2: [string, Step[]][] = [
  [BIGYAN, [
    ['/work/ts week', open('/work/ts', tid.week.grid)],
    ['/work/ts day', click(tid.ts.view('day'), tid.dayForm.field('start'))],
  ]],
  [PUKAR, [
    ['/team/tteam queue', open('/team/tteam', tid.tteam.table)],
    ['return dialog', click(tid.tteam.ret('tsd_EMP005_2026-08-11'), tid.tteam.returnReason)],
    ['bulk dialog', async page => { await escape(page); await click(tid.tteam.approveAll, tid.tteam.bulkAck)(page); }],
    ['/team/tteam week', async page => { await escape(page); await click(tid.tteam.view('week'), tid.tteam.matrix)(page); }],
    ['proxy dialog day', async page => { await open('/team/temployees', tid.employees.table)(page); await page.getByTestId(tid.employees.open('EMP005')).click();
      await click(tid.proxy.open, tid.dayForm.field('start'))(page); }],
    ['proxy dialog week', click(tid.proxy.view('week'), tid.week.grid)],
  ]],
  [EDDIE, [
    ['/setup/mts', open('/setup/mts', tid.mts.card('rules'))],
    ['add allowance dialog', click(tid.mts.allowAdd, tid.mts.allowName)],
  ]],
];
test.describe('module 2 pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('qnipay'); await api.setClock(FROZEN); });
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: timesheet pages and dialogs have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const [email, steps] of PAGES_2) {
        await signInEmail(page, email);
        for (const [where, go] of steps) {
          await go(page);
          await setTheme(page, theme);
          const r = await new AxeBuilder({ page }).analyze();
          expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
      }
    });
  }
  test('phone: timesheet pages and dialogs have no horizontal overflow at 390px', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [email, steps] of PAGES_2) {
      await signInEmail(page, email);
      for (const [where, go] of steps) {
        await go(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
      }
    }
  });
});

/* 1c's pages on the social seed, each with its dialogs: Organisation with
   the template apply preview, the save dialog, a file imported and the remove
   confirm; Calendar and saved data with the reset confirm; Modules & features
   (the list, and Rota's drill-in with its impact confirm); Notifications;
   Approvals with the chain and delegation editors; the Rename roles dialog
   and a guide on Permissions, for Dee Fitzgerald. Team Home, the inbox panel
   and the page-unavailable page for Rachel Hussain. My home with its day
   dialog, and Documents for Amara Okafor. */
const PRESET_FILE = JSON.stringify({ kind: 'qnipay.template', v: 1, key: 'tpl_x', template: {
  name: 'From a file', description: 'Brought in', scope: 'config', modules: { R: true }, flags: {}, extras: {}, labels: {}, workPatterns: [] } });
const PAGES_1C: [string, Step[]][] = [
  [DEE, [
    ['/setup/aorg', async page => { await open('/setup/aorg', tid.aorg.spine)(page); await page.getByTestId(tid.aorg.noSaved).waitFor(); }],
    ['template apply dialog', click(tid.aorg.template('mne'), tid.aorg.plan('changes'))],
    ['template save dialog', async page => { await escape(page); await click(tid.aorg.saveOpen, tid.aorg.saveName)(page); }],
    ['template imported', async page => {
      await escape(page);
      await page.getByTestId(tid.aorg.importFile).setInputFiles({ name: 'from-a-file.json', mimeType: 'application/json', buffer: Buffer.from(PRESET_FILE) });
      await page.getByTestId(tid.aorg.savedRow('tpl_from_a_file')).waitFor();
    }],
    ['template remove confirm', click(tid.aorg.remove('tpl_from_a_file'), tid.modal.confirm)],
    ['/setup/acal', async page => { await escape(page); await open('/setup/acal', tid.acal.card('saved'))(page); await page.getByTestId(tid.acal.holidays).waitFor(); }],
    ['saved data reset confirm', click(tid.acal.reset, tid.modal.confirm)],
    ['/setup/amods', async page => { await escape(page); await open('/setup/amods', tid.amods.card('TS'))(page); }],
    ['/setup/amods?m=ON', open('/setup/amods?m=ON', tid.amods.features)],
    ['module impact confirm', click(tid.amods.mod('ON'), tid.modal.confirm)],
    ['/setup/anotif', async page => { await escape(page); await open('/setup/anotif', tid.anotif.table)(page); }],
    ['/setup/aappr', async page => { await open('/setup/aappr', tid.aappr.chainTable)(page); await page.getByTestId(tid.aappr.delegTable).waitFor(); }],
    ['chain editor', click(tid.aappr.edit('Profile'), tid.aappr.chainSave)],
    ['delegation editor', async page => { await escape(page); await click(tid.aappr.delegAdd, tid.aappr.delegSave)(page); }],
    ['rename roles dialog', async page => { await escape(page); await open('/setup/aperm', tid.access.table)(page); await click(tid.roleNames.open, tid.roleNames.save)(page); }],
    ['a guide dialog', async page => { await escape(page); await click(tid.guide.open('aperm'), tid.guide.close)(page); }],
  ]],
  [RACHEL, [
    ['/team/thome', async page => { await escape(page); await open('/team/thome', tid.thome.grid)(page); }],
    ['inbox panel', async page => { await escape(page); await click(tid.shell.bell, tid.inbox.item('ntf_seed_0008'))(page); }],
    ['page unavailable', async page => { await page.keyboard.press('Escape'); await open('/team/no-such-page', tid.unavailable.root)(page); }],
  ]],
  [AMARA, [
    ['/work/home', async page => { await open('/work/home', tid.home.payslip(0))(page); }],
    ['payslip preview', click(tid.home.view(0), tid.pdf.close)],
    ['/work/cal', async page => { await escape(page); await open('/work/cal', tid.cal.grid)(page); }],
    ['calendar day dialog', click(tid.cal.day('2026-08-13'), tid.cal.dayClose)],
    ['/work/docs', async page => { await escape(page); await open('/work/docs', tid.docs.card)(page); await page.getByTestId(tid.docs.payslip(0)).waitFor(); }],
    ['fiscal year dialog', click(tid.docs.taxView('P60'), tid.docs.fyPrompt)],
  ]],
];
test.describe('1c pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
  const serious = async (page: Page, where: string, theme: 'light' | 'dark') => {
    await setTheme(page, theme);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
  };
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: 1c pages and dialogs have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(240_000);
      for (const [email, steps] of PAGES_1C) {
        await signInEmail(page, email);
        for (const [where, go] of steps) {
          await go(page);
          await serious(page, where, theme);
        }
      }
    });
    /* no persona overflows the bottom bar, so there is no More or Go to sheet to reach; the sheet's markup is covered by src/shell/shell.test.tsx on a synthetic nav */
    test(`axe: Home, My Calendar and Team Home at 390px have no serious issues (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signInEmail(page, AMARA);
      await open('/work/home', tid.home.payslip(0))(page);
      await serious(page, '/work/home at 390px', theme);
      await open('/work/cal', tid.cal.grid)(page);
      await serious(page, '/work/cal at 390px', theme);
      await signInEmail(page, RACHEL);
      await open('/team/thome', tid.thome.grid)(page);
      await serious(page, '/team/thome at 390px', theme);
      await expect(page.getByTestId(tid.nav.more)).toHaveCount(0);
    });
  }
  test('phone: 1c pages and dialogs have no horizontal overflow at 390px', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = async (where: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
    for (const [email, steps] of PAGES_1C) {
      await signInEmail(page, email);
      for (const [where, go] of steps) {
        await go(page);
        await fits(where);
      }
    }
    await signInEmail(page, RACHEL);
    await open('/team/thome', tid.thome.grid)(page);
    await expect(page.getByTestId(tid.nav.more)).toHaveCount(0);
    await fits('Team Home with the whole bottom bar');
  });
});
/* Module 2b: the clock card on My timesheet's day view in each of its states,
   and the banner for a clock left running on an earlier day. Amara Okafor
   enters by clock on social; the server clock moves the shift on. */
test.describe('clock', () => {
  test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
  type ClockApi = Parameters<typeof forgetClock>[1];
  /* through every state of the card, calling `at` with a name for each */
  async function walkTheClock(page: Page, api: ClockApi, at: (where: string) => Promise<void>) {
    const status = page.getByTestId(tid.clock.status);
    await signInEmail(page, AMARA);
    await forgetClock(page, api, '2026-08-11', '06:55', FROZEN);
    await page.goto('/work/ts');
    await page.getByTestId(tid.clock.forgotten).waitFor();
    await expect(status).toHaveText(CLOCK_STATUS.idle);
    await at('the forgotten clock banner, the card idle');
    await page.getByTestId(tid.clock.finish).fill('15:00');
    await page.getByTestId(tid.clock.close).click();
    await expect(page.getByTestId(tid.clock.forgotten)).toHaveCount(0);
    await page.getByTestId(tid.clock.clockIn).click();
    await expect(status).toHaveText(CLOCK_STATUS.running);
    await at('the card running');
    await api.setClock(london('16:00'));
    await page.getByTestId(tid.clock.breakStart).click();
    await expect(status).toHaveText(CLOCK_STATUS.onBreak);
    await at('the card on a break');
    await api.setClock(london('18:00'));
    await page.getByTestId(tid.clock.clockOut).click();
    await expect(status).toHaveText(CLOCK_STATUS.clockedOut);
    await at('the card clocked out');
  }
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: the clock card in every state and the forgotten clock banner have no serious issues (${theme})`, async ({ page, api }) => {
      test.setTimeout(90_000);
      await walkTheClock(page, api, async where => {
        await setTheme(page, theme);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    });
  }
  /* MOBILE-FOUNDATION#31: below md the card stacks (P's 1243-1249) and nothing scrolls sideways */
  test('phone: the clock card stacks and nothing overflows at 390px in any state', async ({ page, api }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await walkTheClock(page, api, async where => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
      const card = page.getByTestId(tid.clock.card);
      expect(await card.evaluate(e => getComputedStyle(e).flexDirection), where).toBe('column');
      const box = await card.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 390, `${where}: the card within the screen`).toBe(true);
    });
  });
});

/* Module 5 on the qnipay seed, where Onboarding and every ONB_* feature are
   on: Tom Achterberg's portal on its personal, documents, policies and review
   steps, with a policy's read dialog, then (once he has sent everything) his
   submitted page; Team onboarding for Pukar Sthapit with the check dialog,
   the not-ready dialog and Add a new starter; Onboarding setup for Eddie
   Harford with the add-policy dialog and the remove confirm. */
const pages5 = (api: Parameters<typeof completeMine>[1]): [string, Step[]][] => [
  [TOM, [
    ['/work/onb personal', open('/work/onb', tid.onb.body('personal'))],
    ['documents step', click(tid.onb.step('documents'), tid.onb.docs)],
    ['policies step', click(tid.onb.step('policies'), tid.onb.polCount)],
    ['policy read dialog', click(tid.onb.polRead('pol_conduct'), tid.onb.readBody)],
    ['review step', async page => { await escape(page); await click(tid.onb.step('review'), tid.onb.todo)(page); }],
    ['submitted page', async page => { await completeMine(page, api); await open('/work/onb', tid.onb.submitted)(page); }],
  ]],
  [PUKAR, [
    ['/team/tonb', async page => { await open('/team/tonb', tid.tonb.queue)(page); await page.getByTestId(tid.tonb.table).waitFor(); }],
    ['check dialog', click(tid.tonb.check('EMP003', 'rtw'), tid.tonb.reason)],
    ['not-ready dialog', async page => { await escape(page); await click(tid.tonb.start('EMP003'), tid.tonb.notReady)(page); }],
    ['add a new starter', async page => { await escape(page); await click(tid.tonb.add, tid.employeeForm.root)(page); }],
  ]],
  [EDDIE, [
    ['/setup/monb', async page => { await open('/setup/monb', tid.monb.card('steps'))(page); await page.getByTestId(tid.monb.policies).waitFor(); }],
    ['add policy dialog', click(tid.monb.polAdd, tid.monb.polName)],
    ['remove policy confirm', async page => { await escape(page); await click(tid.monb.polRemove('pol_itsec'), tid.modal.root)(page); }],
    ['add document dialog', async page => { await escape(page); await click(tid.monb.docAdd, tid.monb.docName)(page); }],
    ['named template', open('/setup/monb?template=onbt-senior-consultants', tid.monb.card('applies'))],
    ['add position list', click(tid.monb.profileAdd, `${tid.monb.profileAdd}-search`)],
    ['new template dialog', async page => { await escape(page); await click(tid.monb.templateNew, tid.monb.newName)(page); }],
    ['delete template confirm', async page => { await escape(page); await click(tid.monb.templateDelete, tid.modal.root)(page); }],
  ]],
];
test.describe('module 5 pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('qnipay'); await api.setClock(FROZEN); });
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: onboarding pages and dialogs have no serious issues (${theme})`, async ({ page, api }) => {
      test.setTimeout(150_000);
      for (const [email, steps] of pages5(api)) {
        await signInEmail(page, email);
        for (const [where, go] of steps) {
          await go(page);
          await setTheme(page, theme);
          const r = await new AxeBuilder({ page }).analyze();
          expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
      }
    });
  }
  test('phone: onboarding pages and dialogs have no horizontal overflow at 390px', async ({ page, api }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [email, steps] of pages5(api)) {
      await signInEmail(page, email);
      for (const [where, go] of steps) {
        await go(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
      }
    }
  });
});

/* Module 8 on the social seed: what its groups added that the sections above
   do not reach. Calendar's Fill from region confirm and Organisation's country
   time zone note for Dee Fitzgerald; then, with a second layer on the Timesheet
   approval chain (support/approvals.ts), My timesheet on a day waiting on
   payroll for Amara Okafor, and for Dee Team timesheets waiting on payroll. */
const PAGES_8: [string, Step[]][] = [
  [AMARA, [
    ['/work/ts a day waiting on payroll', open('/work/ts?date=2026-08-12', tid.ts.dayState)],
  ]],
  [DEE, [
    ['fill from region confirm', async page => { await open('/setup/acal', tid.acal.holidays)(page); await click(tid.acal.fillRegion, tid.modal.confirm)(page); }],
    ['/setup/aorg country time zone', async page => {
      await escape(page);
      await open('/setup/aorg', tid.aorg.country)(page);
      await page.getByTestId(tid.aorg.country).selectOption('Nepal');
      await page.getByTestId(tid.aorg.useCountryZone).waitFor();
    }],
    ['/team/tteam waiting on payroll', async page => { await escape(page); await open('/team/tteam', tid.tteam.table)(page); await click(tid.tteam.filter('mgrok'), tid.tteam.approve(AMARA_DAY))(page); }],
  ]],
];
test.describe('module 8 pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: module 8 states and dialogs have no serious issues (${theme})`, async ({ page, api }) => {
      test.setTimeout(180_000);
      await waitingOnDee(page, api);
      for (const [email, steps] of PAGES_8) {
        await signInEmail(page, email);
        for (const [where, go] of steps) {
          await go(page);
          await setTheme(page, theme);
          const r = await new AxeBuilder({ page }).analyze();
          expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
      }
    });
  }
  test('phone: module 8 states and dialogs have no horizontal overflow at 390px', async ({ page, api }) => {
    test.setTimeout(180_000);
    await waitingOnDee(page, api);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [email, steps] of PAGES_8) {
      await signInEmail(page, email);
      for (const [where, go] of steps) {
        await go(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
      }
    }
  });
});

/* Pay codes, on social at the frozen clock: for Dee Fitzgerald the list, the
   new code dialog and a code in use. */
const PAGES_6: [string, Step[]][] = [
  [DEE, [
    ['/setup/mpay', async page => { await escape(page); await open('/setup/mpay', tid.mpay.table)(page); }],
    ['new pay code dialog', click(tid.mpay.add, tid.mpay.code)],
    ['pay code in use dialog', async page => { await escape(page); await click(tid.mpay.edit('STD'), tid.mpay.inUse)(page); }],
  ]],
];
test.describe('pay codes pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: pay codes pages and dialogs have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const [email, steps] of PAGES_6) {
        await signInEmail(page, email);
        for (const [where, go] of steps) {
          await go(page);
          await setTheme(page, theme);
          const r = await new AxeBuilder({ page }).analyze();
          expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.length}`)).toEqual([]);
        }
      }
    });
  }
  test('phone: pay codes pages and dialogs have no horizontal overflow at 390px', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [email, steps] of PAGES_6) {
      await signInEmail(page, email);
      for (const [where, go] of steps) {
        await go(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
      }
    }
  });
});

/* The employee form's position combobox with its panel open: the search box
   and the list sit in a portal over the dialog. */
test.describe('searchable combobox', () => {
  const openPosition = async (page: Page) => {
    await page.goto('/setup/aemployees');
    await page.getByTestId(tid.employees.table).waitFor();
    await page.getByTestId(tid.employees.add).click();
    await page.getByTestId(tid.employeeForm.root).waitFor();
    await page.getByTestId(tid.employeeForm.field('position')).click();
    await page.getByTestId(`${tid.employeeForm.field('position')}-search`).waitFor();
  };
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: the open position combobox has no violations (${theme})`, async ({ page, signInAs }) => {
      await signInAs('admin');
      await openPosition(page);
      await setTheme(page, theme);
      await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
  test('phone: the open position combobox has no horizontal overflow at 390px, even with a long label', async ({ page, api, signInAs }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs('admin');
    const long = 'Senior regional operations and compliance lead for the north west and the islands';
    const made = await api.send('POST', '/api/v1/positions', { code: 'LONGPROFILE', name: long, night: false });
    expect(made.status).toBeLessThan(300);
    await openPosition(page);
    await expect(page.getByTestId(`${tid.employeeForm.field('position')}-option-LONGPROFILE`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.getByRole('listbox').boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390, 'the panel within the screen').toBe(true);
    const row = await page.getByTestId(`${tid.employeeForm.field('position')}-option-LONGPROFILE`).boundingBox();
    expect(row && row.x >= 0 && row.x + row.width <= 390, 'the long row within the screen').toBe(true);
  });
});

/* Task 24: the pages ported from QniConnect. Home, My Calendar, Documents
   and Profile are read above (1b, 1c). Here: the signed-out pages (landing,
   sign-in, registration, pricing with its comparison, the auth error page and
   a failed authorization callback); account setup (environment selection, its
   "Sign in required" and "Access not provisioned" cards, the first-login
   welcome); and Business Central setup (overview, environments with the add
   dialog, authorization with its dialog, settings) and Setup · Employees with
   the add user dialog, for Dee Fitzgerald, a portal admin. */
const FIRST_LOGIN = 'firstlogin@brightpath.org';
/* The fake /bc's data lives in this page's memory: change it through the
   fake server's development hook (window.__fakeBc, src/mocks/bc/dev-hook.ts),
   then remount environment selection without a reload (a reload would build
   the data again), by a route change the gate sends back. */
async function changeBcSeed(page: Page, change: 'no-environments' | 'inactive', email: string) {
  await page.waitForFunction(() => !!window.__fakeBc);
  await page.evaluate(([kind, who]) => {
    if (kind === 'no-environments') window.__fakeBc?.removeEnvironments();
    else window.__fakeBc?.deactivate(who);
    history.pushState(null, '', '/work/home');
    dispatchEvent(new PopStateEvent('popstate'));
  }, [change, email] as const);
}
async function toEnvironmentSelection(page: Page, email: string) {
  await signInEmail(page, email);
  await page.evaluate(() => { localStorage.removeItem('activeEnvironment'); });
  await page.goto('/');
  await page.getByTestId(tid.page('account-setup-environment')).waitFor();
  await page.getByTestId(tid.accountSetup.continue).waitFor();
}
test.describe('QniConnect pages', () => {
  test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
  const serious = async (page: Page, where: string, theme: 'light' | 'dark') => {
    await setTheme(page, theme);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => `${where} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  };
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: the signed-out QniConnect pages have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(240_000);
      const steps: Step[] = [
        ['/', open('/', tid.page('landing'))],
        ['/login', open('/login', tid.page('login'))],
        ['/register', open('/register', tid.reg.step)],
        ['/pricing', open('/pricing', tid.price.base)],
        ['/auth-error', open('/auth-error', tid.auth.errorMessage)],
        ['/auth/callback, failed', open('/auth/callback?error=access_denied&error_description=The%20admin%20declined', tid.auth.callbackReturn)],
      ];
      for (const [where, go] of steps) { await go(page); await serious(page, where, theme); }
    });

    test(`axe: account setup, its two refusals and the first-login welcome have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(240_000);
      await toEnvironmentSelection(page, AMARA);
      await serious(page, 'environment selection', theme);
      await changeBcSeed(page, 'no-environments', AMARA);
      await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
      await serious(page, 'Sign in required', theme);
      await toEnvironmentSelection(page, AMARA);
      await changeBcSeed(page, 'inactive', AMARA);
      await expect(page.getByRole('heading', { name: 'Access not provisioned' })).toBeVisible();
      await serious(page, 'Access not provisioned', theme);
      await signInEmail(page, FIRST_LOGIN);
      await page.getByTestId(tid.accountSetup.firstLogin).waitFor();
      await serious(page, 'first-login welcome', theme);
    });

    test(`axe: Business Central setup and Setup · Employees have no serious issues (${theme})`, async ({ page }) => {
      test.setTimeout(240_000);
      await signInEmail(page, DEE);
      const steps: Step[] = [
        ['/setup/aoverview', async p => { await open('/setup/aoverview', tid.aoverview.tenant)(p); await p.getByTestId(tid.aoverview.users).waitFor(); }],
        ['/setup/aenv', open('/setup/aenv', tid.aenv.list)],
        ['add environment dialog', click(tid.aenv.add, tid.aenv.save)],
        ['/setup/aauth', async p => { await escape(p); await open('/setup/aauth', tid.aauth.details)(p); }],
        ['new authorization dialog', click(tid.aauth.start, tid.aauth.begin)],
        ['/setup/asettings', async p => { await escape(p); await open('/setup/asettings', tid.asettings.save)(p); }],
        ['/setup/aemployees', async p => { await open('/setup/aemployees', tid.employees.table)(p); await p.getByTestId(tid.people.portalCol('CP-1042')).waitFor(); }],
        /* the login is managed on the record now (2026-10-27): its edit dialog is the same form the add dialog was */
        ['login dialog', async p => { await click(tid.employees.open('CP-1042'), tid.employee.record)(p); await click(tid.ausers.menu('pu-CP-1042'), tid.ausers.edit('pu-CP-1042'))(p); await click(tid.ausers.edit('pu-CP-1042'), tid.ausers.save)(p); }],
      ];
      for (const [where, go] of steps) { await go(page); await serious(page, where, theme); }
    });
  }
  test('phone: the QniConnect pages have no horizontal overflow at 390px', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = async (where: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
    for (const [path, ready] of [['/auth-error', tid.auth.errorMessage], ['/auth/callback?error=access_denied', tid.auth.callbackReturn]] as const) {
      await open(path, ready)(page); await fits(path);
    }
    await toEnvironmentSelection(page, AMARA);
    await fits('environment selection');
    await signInEmail(page, DEE);
    for (const [path, ready] of [['/setup/aoverview', tid.aoverview.users], ['/setup/aenv', tid.aenv.list], ['/setup/aauth', tid.aauth.details],
      ['/setup/asettings', tid.asettings.save], ['/setup/aemployees', tid.employees.table]] as const) {
      await open(path, ready)(page); await fits(path);
    }
  });
});
