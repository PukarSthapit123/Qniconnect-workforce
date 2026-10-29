/* Module 8's approval-chain states, set up straight on the server, for the
   accessibility and visual checks that need a screen part-way through a
   chain. On social: Dee Fitzgerald, the administrator, becomes the second layer
   of the Timesheet chain; Rachel Hussain, the line manager at Willow House,
   then decides the first layer of a timesheet day, which leaves it waiting on
   Dee. */
import { expect, type Page } from '@playwright/test';
import { signInEmail, sendVersioned, dayState } from './timesheet';
import type { Reply } from './read';
import { DEE, RACHEL } from './read';

type Api = { get(path: string): Promise<Reply> };
interface Layer { role: string; scope: string; when: string; sla: string; fixed: boolean }
interface Chain { module: string; version: number; steps: Layer[] }

export const AMARA_DAY = 'tsd_CP-1042_2026-08-12';

/* Signed in as an administrator: give the administrator template a capability. */
export async function grantAdmin(page: Page, api: Api, cap: string) {
  const types = (await api.get('/api/v1/user-types')).body as { id: string; version: number }[];
  const admin = types.find(t => t.id === 'admin');
  if (!admin) throw new Error('no admin user type');
  expect((await sendVersioned(page, 'PUT', `/api/v1/user-types/admin/capabilities/${cap}`, admin.version, { granted: true })).status).toBe(200);
}

/* Signed in as an administrator: a module's chain becomes these layers, before its fixed posting step. */
export async function setChain(page: Page, api: Api, module: string, layers: Omit<Layer, 'fixed'>[]) {
  const chain = ((await api.get('/api/v1/approvals/chains')).body as { chains: Chain[] }).chains.find(c => c.module === module);
  if (!chain) throw new Error(`no ${module} chain`);
  const steps = [...layers.map(l => ({ ...l, fixed: false })), ...chain.steps.filter(s => s.fixed)];
  expect((await sendVersioned(page, 'PUT', `/api/v1/approvals/chains/${module}`, chain.version, { steps })).status, `${module} chain`).toBe(200);
}

export async function waitingOnDee(page: Page, api: Api) {
  await signInEmail(page, DEE);
  await setChain(page, api, 'Timesheet', [
    { role: 'Line manager', scope: 'Own department', when: 'Every timesheet', sla: '24 hours' },
    { role: 'Payroll', scope: 'All departments', when: 'Every timesheet', sla: '48 hours' }]);

  await signInEmail(page, RACHEL);
  const day = await dayState(api, 'CP-1042', '2026-08-12');
  expect((await sendVersioned(page, 'POST', `/api/v1/timesheet-days/${AMARA_DAY}/transition`, day.version, { to: 'ok', reason: '' })).status).toBe(200);
}
