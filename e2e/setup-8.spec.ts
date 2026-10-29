import { test, expect, FROZEN } from './support/fixtures';
import type { Page } from '@playwright/test';
import { tid } from '../src/testids';
import { signInEmail } from './support/timesheet';
import { AMARA, DEE, RACHEL, auditRows, info, refusedToast } from './support/config';
import { TOM_SOCIAL, openPortal, pdf, uploadDoc } from './support/onboarding';

/* Module 8, setup hardening: an administrator changes a setting and the rule
   visibly follows. Group 4, Timesheet: a payroll layer added to the
   Timesheet approval chain holds a day the line manager approves until
   payroll approves it too, and only then is it approved. On social, Rachel
   Hussain is the line manager at Whitehaven and Dee Fitzgerald the
   administrator, who approves timesheets for payroll. */
test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });
const AMARA_DAY = 'tsd_CP-1042_2026-08-12';
const WAITING = 'Approved by manager, waiting on payroll';

test('a payroll layer added on Approvals: the manager\'s approval leaves the day waiting on payroll, and it is approved only after payroll approves', async ({ page }) => {
  test.setTimeout(90_000);
  await signInEmail(page, DEE);
  await page.goto('/setup/aappr');
  await page.getByTestId(tid.aappr.chainTable).waitFor();
  await page.getByTestId(tid.aappr.edit('Timesheet')).click();
  const box = page.getByTestId(tid.modal.root);
  /* the seeded payroll layer applies only above a premium threshold: take it out and add one for every timesheet */
  await box.getByTestId(tid.aappr.remove(1)).click();
  await box.getByTestId(tid.aappr.add).click();
  await box.getByTestId(tid.aappr.role(1)).selectOption('Payroll');
  await box.getByTestId(tid.aappr.scope(1)).selectOption('All departments');
  await box.getByTestId(tid.aappr.when(1)).selectOption('Every timesheet');
  await box.getByTestId(tid.aappr.chainSave).click();
  await expect(info(page, 'Timesheet approval chain saved: Line manager, then Payroll, then Business Central.')).toBeVisible();
  await expect(page.getByTestId(tid.aappr.row('Timesheet', 1))).toContainText('Every timesheet');

  await signInEmail(page, RACHEL);
  await page.goto('/team/tteam');
  const row = page.getByTestId(tid.tteam.row(AMARA_DAY));
  await row.getByTestId(tid.tteam.approve(AMARA_DAY)).click();
  await expect(info(page, 'Approved · Amara Okafor · now waiting on payroll')).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByTestId(tid.tteam.filter('mgrok')).click();
  await expect(page.getByTestId(tid.tteam.state(AMARA_DAY))).toHaveText(WAITING);
  await expect(page.getByTestId(tid.tteam.approve(AMARA_DAY))).toHaveCount(0);

  await signInEmail(page, DEE);
  await page.goto('/team/tteam');
  await expect(page.getByTestId(tid.tteam.state(AMARA_DAY))).toHaveText(WAITING);
  await page.getByTestId(tid.tteam.approve(AMARA_DAY)).click();
  await expect(info(page, 'Approved · Amara Okafor')).toBeVisible();
  await page.getByTestId(tid.tteam.filter('ok')).click();
  await expect(page.getByTestId(tid.tteam.state(AMARA_DAY))).toHaveText('Approved');
  expect((await auditRows(page, 'timesheetDay')).map(a => a.act).slice(-2)).toEqual(['Timesheet passed to payroll', 'Timesheet approved']);
});

/* Group 5: the smaller setup gaps. */
test('Onboarding setup: a document the administrator adds and makes required is asked of a new starter, and cannot be removed once he holds it', async ({ page }) => {
  test.setTimeout(120_000);
  await signInEmail(page, DEE);
  await page.goto('/setup/monb');
  await page.getByTestId(tid.monb.docs).waitFor();
  await page.getByTestId(tid.monb.docAdd).click();
  await page.getByTestId(tid.monb.docName).fill('DBS check');
  await page.getByTestId(tid.monb.docHint).fill('An enhanced certificate issued in the last three years.');
  await page.getByTestId(tid.monb.docSave).click();
  await expect(info(page, 'DBS check added. It is optional until you make it required and save.')).toBeVisible();
  await page.getByTestId(tid.monb.docReq('dbs-check')).click();
  await page.getByTestId(tid.monb.save).click();
  await expect(page.getByTestId(tid.monb.dirty)).toHaveCount(0, { timeout: 10_000 });

  /* Tom is asked for it, with its hint, and uploads it */
  await signInEmail(page, TOM_SOCIAL);
  await openPortal(page);
  await page.getByTestId(tid.onb.step('documents')).click();
  await page.getByTestId(tid.onb.body('documents')).waitFor();
  await expect(page.getByTestId(tid.onb.doc('dbs-check'))).toContainText('An enhanced certificate issued in the last three years.');
  await uploadDoc(page, 'dbs-check', pdf('dbs.pdf'));
  await expect(page.getByTestId(tid.onb.docFile('dbs-check'))).toContainText('dbs.pdf');

  /* now he holds it, removing it is refused and names him */
  await signInEmail(page, DEE);
  await page.goto('/setup/monb');
  await page.getByTestId(tid.monb.docRemove('dbs-check')).click();
  await page.getByTestId(tid.modal.root).getByRole('button', { name: 'Remove' }).click();
  await expect(refusedToast(page, 'DBS check is on the onboarding of Tom Achterberg, so it cannot be removed.')).toBeVisible();
  await expect(page.getByTestId(tid.monb.doc('dbs-check'))).toBeVisible();
});

test('Organisation: the country offers its own time zone, and taking it sets the organisation\'s', async ({ page }) => {
  await signInEmail(page, DEE);
  await page.goto('/setup/aorg');
  await page.getByTestId(tid.aorg.card('pay')).waitFor();
  await expect(page.getByTestId(tid.aorg.card('pay'))).not.toContainText('Used by Payroll and Business Central, which is not built yet.');
  await page.getByTestId(tid.aorg.country).selectOption('Nepal');
  await expect(page.getByTestId(tid.aorg.countryZone)).toContainText('Its time zone is Asia/Kathmandu. This organisation keeps Europe/London');
  await page.getByTestId(tid.aorg.useCountryZone).click();
  await expect(info(page, 'Time zone saved: Asia/Kathmandu.')).toBeVisible();
  await expect(page.getByTestId(tid.aorg.timezone)).toHaveValue('Asia/Kathmandu');
  await expect(page.getByTestId(tid.aorg.countryZone)).toContainText('Its time zone, Asia/Kathmandu, is the one set under Date and time.');
});

test('Approvals: the return-reason row opens the real control on Timesheet setup, and what is saved there shows back on Approvals', async ({ page }) => {
  await signInEmail(page, DEE);
  await page.goto('/setup/aappr');
  await expect(page.getByTestId(tid.aappr.reason)).toHaveText('Required');
  await page.getByTestId(tid.aappr.reasonLink).click();
  await expect(page).toHaveURL(/\/setup\/mts#mts-return-reason$/);
  const control = page.getByTestId(tid.mts.returnReasonRequired);
  await expect(control).toBeInViewport();
  await control.click();
  await page.getByTestId(tid.mts.save).click();
  await expect(page.getByTestId(tid.mts.dirty)).toHaveCount(0, { timeout: 10_000 });
  await page.goto('/setup/aappr');
  await expect(page.getByTestId(tid.aappr.reason)).toHaveText('Not required');
  await page.getByTestId(tid.aappr.cutoffLink).click();
  await expect(page.locator('#mts-cutoff')).toBeInViewport();
});

/* Group 6. Group 1: the day changes at the tenant's own midnight. 18:30 UTC
   on Thursday 13 August is 19:30 in London and 00:15 on Friday in
   Kathmandu; half an hour earlier it is 23:45 there, still Thursday. */
const KTM_BEFORE_MIDNIGHT = '2026-08-13T18:00:00.000Z', KTM_AFTER_MIDNIGHT = '2026-08-13T18:30:00.000Z';
async function myDay(page: Page) {
  await page.goto('/work/ts');
  await page.getByTestId(tid.ts.view('day')).click();
  return page.getByTestId(tid.ts.dayLabel);
}

test('Organisation: a new time zone moves today at its own midnight, so My timesheet and My home open on the Kathmandu date', async ({ page, api }) => {
  test.setTimeout(120_000);
  await api.setClock(KTM_AFTER_MIDNIGHT);
  await signInEmail(page, AMARA);
  await expect(await myDay(page)).toContainText('Thu 13 Aug');

  await signInEmail(page, DEE);
  await page.goto('/setup/aorg');
  const zone = page.getByTestId(tid.aorg.timezone);
  await zone.fill('Asia/Kathmandu');
  await zone.press('Enter');
  await expect(info(page, 'Time zone saved.')).toBeVisible();

  /* 23:45 in Kathmandu: still Thursday */
  await api.setClock(KTM_BEFORE_MIDNIGHT);
  await signInEmail(page, AMARA);
  await expect(await myDay(page)).toContainText('Thu 13 Aug');
  /* past midnight there it is Friday, though London is still on Thursday evening */
  await api.setClock(KTM_AFTER_MIDNIGHT);
  await expect(await myDay(page)).toContainText('Fri 14 Aug');
  await page.getByTestId(tid.ts.dayPrev).click();
  await page.getByTestId(tid.ts.dayToday).click();
  await expect(page.getByTestId(tid.ts.dayLabel)).toContainText('Fri 14 Aug');
  await page.goto('/work/cal');
  await expect(page.getByTestId(tid.cal.day('2026-08-14'))).not.toHaveAttribute('data-future');
  await expect(page.getByTestId(tid.cal.day('2026-08-15'))).toHaveAttribute('data-future', 'true');
});
