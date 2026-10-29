/* Spec N9 and R4, Ruling F1: VITE_FAKE_MODULES picks which /api/v1 modules
   the fake server answers. Unset, every module is on the fake, as before; a
   list fakes only those, and the rest pass through to the real backend. */
import { ENDPOINTS } from '@/contract';
import { MODULES, moduleOf } from '@/contract/modules';
import { apiHandlersIfOn, handlers } from '@/mocks/handlers';
import { SERVED_HANDLERS } from '@/mocks/serve';
import { fakeModuleOn, fakeModules } from './fake-modules';

afterEach(() => { vi.unstubAllEnvs(); });

test('the modules are grouped as the backend hand-off groups them: core, timesheet, onboarding', () => {
  expect(MODULES).toEqual(['core', 'timesheet', 'onboarding']);
  expect(moduleOf('/api/v1/session')).toBe('core');
  expect(moduleOf('/api/v1/timesheets/:id')).toBe('timesheet');
  expect(moduleOf('/api/v1/timesheet-days')).toBe('timesheet');
  expect(moduleOf('/api/v1/timesheet-config')).toBe('timesheet');
  expect(moduleOf('/api/v1/clock/in')).toBe('timesheet');
  expect(moduleOf('/api/v1/onboarding/cases')).toBe('onboarding');
  /* every module has endpoints */
  for (const m of MODULES) expect(ENDPOINTS.some(e => moduleOf(e.path) === m), m).toBe(true);
});

test('unset or empty, every module is on the fake (as before)', () => {
  vi.stubEnv('VITE_FAKE_MODULES', undefined);
  expect([...fakeModules()]).toEqual(['core', 'timesheet', 'onboarding']);
  vi.stubEnv('VITE_FAKE_MODULES', ' ');
  expect([...fakeModules()]).toEqual(['core', 'timesheet', 'onboarding']);
});

test('a list fakes only those modules, by name or short code, in any case; none fakes nothing', () => {
  vi.stubEnv('VITE_FAKE_MODULES', 'core,ts');
  expect([...fakeModules()]).toEqual(['core', 'timesheet']);
  expect(fakeModuleOn('/api/v1/session')).toBe(true);
  expect(fakeModuleOn('/api/v1/timesheets')).toBe(true);
  expect(fakeModuleOn('/api/v1/onboarding/cases')).toBe(false);
  vi.stubEnv('VITE_FAKE_MODULES', ' Onboarding , ON ');
  expect([...fakeModules()]).toEqual(['onboarding']);
  vi.stubEnv('VITE_FAKE_MODULES', 'none');
  expect([...fakeModules()]).toEqual([]);
});

test('a name that is not a module stops start-up, saying which and what the modules are', () => {
  vi.stubEnv('VITE_FAKE_MODULES', 'core,payroll');
  expect(() => fakeModules()).toThrow('VITE_FAKE_MODULES names "payroll", which is not a module. Use core, timesheet (ts) or onboarding (on), separated by commas, or none.');
});

test('the fake server registers only the faked modules\' handlers; its own controls and the fault hook stay', () => {
  const pathOf = (h: (typeof handlers)[number]) => String(h.info.path);
  const served = (list: typeof handlers) => list.filter(h => SERVED_HANDLERS.has(h)).map(h => moduleOf(pathOf(h)));
  expect(apiHandlersIfOn()).toEqual(handlers);
  vi.stubEnv('VITE_FAKE_MODULES', 'core,ts');
  const list = apiHandlersIfOn();
  expect(new Set(served(list))).toEqual(new Set(['core', 'timesheet']));
  expect(list.filter(h => !SERVED_HANDLERS.has(h))).toEqual(handlers.filter(h => !SERVED_HANDLERS.has(h)));
  vi.stubEnv('VITE_FAKE_MODULES', 'none');
  expect(served(apiHandlersIfOn())).toEqual([]);
});
