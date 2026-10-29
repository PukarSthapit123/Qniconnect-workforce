import { test, expect, FROZEN } from './support/fixtures';
import { tid } from '../src/testids';
import { sendVersioned, signInEmail } from './support/timesheet';
import { DEE, RACHEL, auditRows, info, refusedToast } from './support/config';

/* Pay codes, on social at the frozen clock (Thursday 13/08/2026). Dee
   Fitzgerald is the administrator, who holds Master data; Rachel
   Hussain manages Willow House and holds no setup capability. */
test.beforeEach(async ({ api }) => { await api.seed('social'); await api.setClock(FROZEN); });

test('admin: a pay code is created and is at once a rate type, an edit says how many fields changed, and a code in use cannot be removed', async ({ page, api }) => {
  test.setTimeout(90_000);
  await signInEmail(page, DEE);
  await page.goto('/setup/mpay');
  await page.getByTestId(tid.mpay.table).waitFor();

  await page.getByTestId(tid.mpay.add).click();
  let box = page.getByTestId(tid.modal.root);
  await expect(box.getByTestId(tid.mpay.money)).toContainText('Nothing here sets a monetary value.');
  await box.getByTestId(tid.mpay.code).fill('ot-bh');
  await box.getByTestId(tid.mpay.label).fill('Overtime bank holiday');
  await box.getByTestId(tid.mpay.valueInput).fill('2');
  await box.getByTestId(tid.mpay.element).fill('PE-OTBH');
  await box.getByTestId(tid.mpay.wt).click();
  await box.getByTestId(tid.mpay.save).click();
  await expect(info(page, 'OT-BH created · Overtime bank holiday · available now as a rate type on timesheets and in Timesheet setup’s pay rules')).toBeVisible();
  await expect(page.getByTestId(tid.mpay.row('OT-BH'))).toContainText('PE-OTBH');
  await expect(page.getByTestId(tid.mpay.workType('OT-BH'))).toHaveText('Yes');
  const cfg = (await api.get('/api/v1/timesheet-config')).body as { payCodes: { code: string }[] };
  expect(cfg.payCodes.map(p => p.code)).toContain('OT-BH');

  /* the code is locked once it exists */
  await page.getByTestId(tid.mpay.edit('OT20')).click();
  box = page.getByTestId(tid.modal.root);
  await expect(box.getByTestId(tid.mpay.code)).toBeDisabled();
  await expect(box).toContainText('Codes cannot change. Postings already reference them.');
  await box.getByTestId(tid.mpay.valueInput).fill('2.5');
  await box.getByTestId(tid.mpay.wt).click();
  await box.getByTestId(tid.mpay.save).click();
  await expect(info(page, 'OT20 updated · 2 field(s) changed')).toBeVisible();
  await expect(page.getByTestId(tid.mpay.value('OT20'))).toContainText('2.5');

  await page.getByTestId(tid.mpay.edit('STD')).click();
  box = page.getByTestId(tid.modal.root);
  await expect(box.getByTestId(tid.mpay.inUse)).toContainText('In use by');
  /* a code in use is not offered for removal (Task 24): Remove is off and names what uses it */
  await expect(box.getByTestId(tid.mpay.remove)).toBeDisabled();
  await expect(box.getByTestId(tid.mpay.removeWhy)).toContainText(/In use by 2 employee types and \d+ timesheet days, so it cannot be removed\./);
  await box.getByTestId(tid.mpay.cancel).click();
  await expect(page.getByTestId(tid.mpay.row('STD'))).toBeVisible();
  expect((await auditRows(page, 'payCode')).map(a => a.act)).toEqual(['Pay code created', 'Pay code edited']);
});

test('admin: a pay code saved over a newer version is refused with 412 and the reload prompt, re-read, and saved once applied again', async ({ page }) => {
  test.setTimeout(90_000);
  await signInEmail(page, DEE);
  await page.goto('/setup/mpay');
  await page.getByTestId(tid.mpay.edit('OT20')).click();
  const box = page.getByTestId(tid.modal.root);
  await expect(box.getByTestId(tid.mpay.valueInput)).toHaveValue('2');

  /* another administrator changes OT20 while the dialog is open */
  expect((await sendVersioned(page, 'PATCH', '/api/v1/pay-codes/pc_OT20', 1, { value: '2.5' })).status).toBe(200);

  await box.getByTestId(tid.mpay.label).fill('Overtime, double');
  const answer = page.waitForResponse(r => r.url().endsWith('/api/v1/pay-codes/pc_OT20') && r.request().method() === 'PATCH');
  await box.getByTestId(tid.mpay.save).click();
  expect((await answer).status()).toBe(412);
  const toast = refusedToast(page, 'Somebody changed this since you opened it. Your change has not been saved.');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Reload and apply your change again');
  /* the dialog starts again on what is stored: the other change shows, its own draft is gone */
  await expect(box.getByTestId(tid.mpay.valueInput)).toHaveValue('2.5');
  await expect(box.getByTestId(tid.mpay.label)).not.toHaveValue('Overtime, double');
  expect((await auditRows(page, 'payCode')).map(a => a.after)).toEqual([{ value: '2.5' }]);

  await box.getByTestId(tid.mpay.label).fill('Overtime, double');
  await box.getByTestId(tid.mpay.save).click();
  await expect(info(page, 'OT20 updated · 1 field(s) changed')).toBeVisible();
  expect(await auditRows(page, 'payCode')).toHaveLength(2);
});

test('the server refuses a pay code write to a session without its capability, and nothing is written', async ({ page }) => {
  await signInEmail(page, RACHEL);
  for (const [method, path, body, v] of [
    ['PATCH', '/api/v1/pay-codes/pc_OT20', { value: '3' }, 1],
  ] as const) {
    const r = await sendVersioned(page, method, path, v, body);
    expect([path, r.status, (r.body as { code: string }).code]).toEqual([path, 403, 'capability']);
  }
  expect(await auditRows(page, 'payCode')).toEqual([]);
});
