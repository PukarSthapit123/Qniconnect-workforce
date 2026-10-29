import { cleanup, render, screen, within } from '@testing-library/react';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { queryClient } from '@/api/query';
import { App } from '@/App';
import { caller, resetTo, tokenFor, type Persona, clearStubAccount, signInAs } from '@/test/api-helpers';

/* What a switch in Modules & features, a template or a change in
   Permissions does to everyone else's tabs, read from the app itself: the
   admin writes through the API, then each persona signs in and the shell
   paints its tab strip from the session and the tenant (useShellData). */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => resetTo('social'));
afterEach(() => { cleanup(); clearStubAccount(); window.history.pushState({}, '', '/'); });

const tenantVersion = () => store.coll<{ version: number }>('tenant').tenant?.version ?? 0;
async function admin(method: string, url: string, body: unknown, version = tenantVersion()) {
  const r = await caller(await tokenFor('admin'))(method, url, body, version);
  expect(r.status, `${method} ${url}`).toBe(200);
}
const setModule = (code: string, on: boolean) => admin('PATCH', `/api/v1/tenant/modules/${code}`, { on });
const setFlag = (code: string, on: boolean) => admin('PATCH', `/api/v1/tenant/flags/${code}`, { on });
/* the views on the tab strip a persona sees once signed in */
async function tabsOf(p: Persona): Promise<string[]> {
  cleanup(); queryClient.clear();
  await signInAs(p);
  window.history.pushState({}, '', p === 'employee' ? '/work/home' : '/team/thome');
  render(<App />);
  const strip = await screen.findByRole('navigation', { name: 'Pages' });
  return within(strip).queryAllByTestId(/^nav-tab-/).map(a => (a.getAttribute('data-testid') ?? '').replace('nav-tab-', ''));
}

/* Suite TIMESHEET AS ONE MODULE: one capture method on keeps the employee's
   Timesheet; with every method off the tab goes; a method back brings it. */
test('the employee keeps Timesheet with one capture method on, loses it with none, and has it back when a method returns', async () => {
  expect(await tabsOf('employee')).toContain('ts');
  await setModule('B', false);
  expect(await tabsOf('employee')).toContain('ts');
  await setModule('A', false);
  expect(await tabsOf('employee')).not.toContain('ts');
  await setModule('A', true);
  expect(await tabsOf('employee')).toContain('ts');
});

/* Suite TIMESHEET IS LICENSABLE: with Timesheet off the employee loses it
   entirely and the manager loses Team timesheets (their Approvals tab);
   turning it back on gives the employee Timesheet back. */
test('Timesheet off takes Timesheet from the employee and Approvals from the manager, and on gives the employee it back', async () => {
  expect(await tabsOf('manager')).toContain('tteam');
  await setModule('TS', false);
  expect(await tabsOf('employee')).not.toContain('ts');
  expect(await tabsOf('manager')).not.toContain('tteam');
  await setModule('TS', true);
  expect(await tabsOf('employee')).toContain('ts');
  expect(await tabsOf('manager')).toContain('tteam');
});

/* Suite DOCUMENT CENTRE, changed by Task 16: Documents holds the payslips and
   tax documents, so the document centre flag no longer takes the tab away. */
test('the Documents tab stays when the document centre flag is switched off', async () => {
  expect(await tabsOf('employee')).toContain('docs');
  await setFlag('DOCS', false);
  expect(await tabsOf('employee')).toContain('docs');
});

/* Task 16: My Calendar is the timesheet's calendar, after Home, and goes with the Timesheet module. */
test('My Calendar sits after Home, and goes and comes back with the Timesheet module', async () => {
  expect((await tabsOf('employee')).slice(0, 3)).toEqual(['home', 'cal', 'ts']);
  await setModule('TS', false);
  expect(await tabsOf('employee')).not.toContain('cal');
  await setModule('TS', true);
  expect(await tabsOf('employee')).toContain('cal');
});

/* Suite FUSION3 CONFIGURED THROUGH THE TEMPLATE: the manager keeps timesheet
   approvals after the M&E template is applied. */
test('after the Fusion3 template is applied, the manager keeps timesheet approvals', async () => {
  await admin('POST', '/api/v1/templates/mne/apply', undefined);
  expect(store.coll<{ template: string }>('tenant').tenant?.template).toBe('mne');
  expect(await tabsOf('manager')).toContain('tteam');
});
