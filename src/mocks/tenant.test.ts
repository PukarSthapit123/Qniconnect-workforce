import { server } from './node';
import { store } from './store';
import { Refusal } from '@/contract/common';
import { FlagChanged, ModuleSwitched, Tenant, getTenant, updateTenantSettings } from '@/contract/tenant';
import { renameUserType } from '@/contract/access';
import { Session } from '@/contract/session';
import { accountOf, audits, caller, fault, resetTo, snapshot, tokenFor, type Persona } from '@/test/api-helpers';
import { today } from './world';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
beforeEach(() => resetTo('social'));
const as = async (p: Persona) => caller(await tokenFor(p));
const T = '/api/v1/tenant';
const MOD = (c: string) => `${T}/modules/${c}`;
const FLAG = (c: string) => `${T}/flags/${c}`;
const SETTINGS = `${T}/settings`;
const WRITES = ['tenant', 'employeeTypes', 'timesheetConfig', 'userTypes', 'audit'];

const tenant = () => {
  const t = store.coll<{ version: number; modules: Record<string, boolean>; flags: Record<string, boolean> }>('tenant').tenant;
  if (!t) throw new Error('no tenant');
  return t;
};
const ver = () => tenant().version;
const read = async () => getTenant.response.parse((await (await as('admin'))('GET', T)).body);
const typeCaps = () => Object.fromEntries(Object.values(store.coll<{ code: string; capabilities: string[] }>('employeeTypes')).map(t => [t.code, [...t.capabilities]]));

describe('reading the tenant', () => {
  test('the GET carries the catalogue state, company, calendar and the extras from their homes', async () => {
    const t = Tenant.parse(await read());
    expect(t.company).toMatchObject({ registration: '09876543', country: 'United Kingdom', payFrequency: 'Fortnightly', firstPayDate: '2026-08-21' });
    expect(t.company).not.toHaveProperty('currency');
    expect(t.financialYear).toEqual({ start: '2026-04-01', end: '2027-03-31', label: '2026/27' });
    expect(t.weekStart).toBe('Monday');
    expect(t.bankHolidays.map(b => b.date)).toEqual(['2026-08-31', '2026-12-25', '2026-12-28']);
    expect(t).not.toHaveProperty('rotaHorizon');
    expect(t.extras).toEqual({ weekGrid: 'times', weekLayout: 'classic', breaksMax: 5, vehiclesMax: 4 });
    expect(t.restore).toEqual({});
    expect(t).not.toHaveProperty('rotaSetAside');
  });

  test('tenant today is 00:30 on the next calendar day during British Summer Time', () => {
    store.setClock('2026-07-10T23:30:00.000Z');
    expect(today()).toBe('2026-07-11');
  });
  test('anyone signed in reads it (every module reader depends on it)', async () => {
    expect((await (await as('employee'))('GET', T)).status).toBe(200);
  });
});

describe('who may switch (Review Focus 1)', () => {
  test('modules and features need Module configuration; a manager and an employee are refused and nothing changes', async () => {
    const calls = { manager: await as('manager'), employee: await as('employee') }, before = snapshot(...WRITES);
    for (const p of ['manager', 'employee'] as const) {
      const call = calls[p];
      for (const [url, body] of [[MOD('ON'), { on: false }], [FLAG('DOCS'), { on: false }], [SETTINGS, { fullTimeWeeklyHours: 40 }]] as const) {
        const r = await call('PATCH', url, body, ver());
        expect(r.status, `${p} ${url}`).toBe(403);
        expect(Refusal.parse(r.body).code).toBe('capability');
      }
    }
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('settings need Master data, not Module configuration', async () => {
    const acc = store.coll<{ revocations: string[] }>('accounts')[`acc_${accountOf('admin').email}`];
    if (!acc) throw new Error('no admin account');
    acc.revocations = ['master_data'];
    const call = await as('admin');
    const r = await call('PATCH', SETTINGS, { fullTimeWeeklyHours: 40 }, ver());
    expect([r.status, Refusal.parse(r.body).message]).toEqual([403, 'This needs "Master data", which your access does not include.']);
    expect((await call('PATCH', MOD('ON'), { on: false }, ver())).status).toBe(200);
    acc.revocations = ['mod_cfg'];
    const c2 = await as('admin');
    expect((await c2('PATCH', MOD('ON'), { on: true }, ver())).status).toBe(403);
    expect((await c2('PATCH', SETTINGS, { fullTimeWeeklyHours: 40 }, ver())).status).toBe(200);
  });
  test('every write needs the tenant\'s version: missing is 428, stale is 412, and nothing changes', async () => {
    const call = await as('admin'), before = snapshot(...WRITES);
    for (const [url, body] of [[MOD('ON'), { on: false }], [FLAG('DOCS'), { on: false }], [SETTINGS, { fullTimeWeeklyHours: 40 }]] as const) {
      expect((await call('PATCH', url, body)).status).toBe(428);
      expect((await call('PATCH', url, body, ver() + 1)).status).toBe(412);
    }
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('a fault on each write leaves no change and no audit row (Review Focus 7)', async () => {
    const call = await as('admin');
    for (const [url, body] of [[MOD('ON'), { on: false }], [MOD('C'), { on: false }], [FLAG('WEEKLY'), { weekLayout: 'days' }], [SETTINGS, { fullTimeWeeklyHours: 40 }]] as const) {
      const before = snapshot(...WRITES);
      await fault('PATCH', url);
      expect((await call('PATCH', url, body, ver())).status, url).toBe(500);
      expect(snapshot(...WRITES), url).toEqual(before);
    }
  });
});

describe('modules (Review Focus 2)', () => {
  test('QniConnect is LOCKED: nothing changes and no audit row', async () => {
    const call = await as('admin'), before = snapshot(...WRITES);
    const r = await call('PATCH', MOD('CORE'), { on: false }, ver());
    expect(r.status).toBe(409);
    expect(Refusal.parse(r.body)).toMatchObject({ code: 'LOCKED', message: 'QniConnect cannot be switched off. Everything else depends on it.' });
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('an unknown module is 404', async () => {
    expect((await (await as('admin'))('PATCH', MOD('XX'), { on: true }, ver())).status).toBe(404);
  });
  test('switching to the state it is in writes nothing and no audit row', async () => {
    const call = await as('admin'), before = snapshot(...WRITES);
    const out = ModuleSwitched.parse((await call('PATCH', MOD('ON'), { on: true }, ver())).body);
    expect(out.auditId).toBeNull();
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('Timesheet off remembers its capture methods, a capture method then refuses MODULE_OFF, and on restores exactly them', async () => {
    const call = await as('admin');
    await call('PATCH', MOD('B'), { on: false }, ver());
    const off = ModuleSwitched.parse((await call('PATCH', MOD('TS'), { on: false }, ver())).body);
    expect(off.effect.capturesRemembered).toEqual(['A', 'C']);
    expect(off.record.restore).toEqual({ TS: ['A', 'C'] });
    expect([off.record.modules.TS, off.record.modules.A, off.record.modules.B, off.record.modules.C]).toEqual([false, false, false, false]);
    expect(off.effect.kept).toEqual([{ what: 'timesheet days', count: Object.keys(store.coll('timesheetDays')).length }]);
    expect(audits().find(a => a.id === off.auditId)).toMatchObject({ act: 'Module turned off', entity: 'tenant', entityId: 'TS' });
    expect(Object.keys(store.coll('timesheetDays')).length).toBeGreaterThan(0);

    const before = snapshot(...WRITES);
    const refused = await call('PATCH', MOD('A'), { on: true }, ver());
    expect([refused.status, Refusal.parse(refused.body).code]).toEqual([409, 'MODULE_OFF']);
    expect(snapshot(...WRITES)).toEqual(before);

    const on = ModuleSwitched.parse((await call('PATCH', MOD('TS'), { on: true }, ver())).body);
    expect(on.effect.capturesRestored).toEqual(['A', 'C']);
    expect([on.record.modules.TS, on.record.modules.A, on.record.modules.B, on.record.modules.C]).toEqual([true, true, false, true]);
    expect(on.record.restore).toEqual({});
    expect(on.effect.message).toBe('Timesheet turned on with Manual time entry, Sites & locations. It is live for everyone now.');
    expect(audits().find(a => a.id === on.auditId)?.act).toBe('Module turned on');
  });
  test('Sites off takes the site capability off every employee type and says which; on does not put it back (as the prototype)', async () => {
    const call = await as('admin'), before = typeCaps();
    expect(Object.values(before).filter(c => c.includes('site')).length).toBe(2);
    const off = ModuleSwitched.parse((await call('PATCH', MOD('C'), { on: false }, ver())).body);
    expect(off.effect.siteRemovedFrom.sort()).toEqual(['Relief / Bank Worker', 'Support Worker'].sort());
    expect(Object.values(typeCaps()).some(c => c.includes('site'))).toBe(false);
    expect(audits().filter(a => a.id === off.auditId)).toHaveLength(1);
    ModuleSwitched.parse((await call('PATCH', MOD('C'), { on: true }, ver())).body);
    expect(Object.values(typeCaps()).some(c => c.includes('site'))).toBe(false);
  });
  test('Clock in / out off keeps every timesheet day and clock record, with true counts', async () => {
    const id = 'clk_CP-1042_2026-08-13';
    store.coll('clockRecords')[id] = { id, version: 1, updatedAt: '2026-08-13T06:00:00.000Z', employeeCode: 'CP-1042', date: '2026-08-13',
      events: [{ kind: 'in', at: '2026-08-13T06:00:00.000Z' }], closedLate: null };
    const call = await as('admin');
    const off = ModuleSwitched.parse((await call('PATCH', MOD('B'), { on: false }, ver())).body);
    expect(off.effect.kept).toEqual([
      { what: 'timesheet days', count: Object.keys(store.coll('timesheetDays')).length },
      { what: 'clock records', count: 1 },
    ]);
    expect(Object.keys(store.coll('clockRecords'))).toEqual([id]);
  });
  test('Onboarding off keeps every case in progress, and says so', async () => {
    const call = await as('admin');
    const off = ModuleSwitched.parse((await call('PATCH', MOD('ON'), { on: false }, ver())).body);
    expect(off.effect.kept).toEqual([{ what: 'onboarding cases in progress', count: expect.any(Number) }]);
    expect(off.record.modules.ON).toBe(false);
  });
});

describe('features and their extras', () => {
  test('a feature of a module that is off is MODULE_OFF, and nothing changes', async () => {
    const call = await as('admin');
    await call('PATCH', MOD('ON'), { on: false }, ver());
    const before = snapshot(...WRITES);
    const r = await call('PATCH', FLAG('ONB_SIGN'), { on: false }, ver());
    expect(r.status).toBe(409);
    expect(Refusal.parse(r.body)).toMatchObject({ code: 'MODULE_OFF', message: 'Onboarding is off, so its features cannot be changed.' });
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('a feature switch writes one Feature changed row', async () => {
    const out = FlagChanged.parse((await (await as('admin'))('PATCH', FLAG('DOCS'), { on: false }, ver())).body);
    expect(out.record.flags.DOCS).toBe(false);
    expect(out.message).toBe('Document centre off. It is live for everyone now.');
    expect(audits().filter(a => a.id === out.auditId)).toEqual([expect.objectContaining({ act: 'Feature changed', entityId: 'DOCS', before: { on: true } })]);
  });
  test('the weekly layout and capture write through to Timesheet setup, which module 2 keeps reading', async () => {
    const call = await as('admin');
    const tcBefore = store.coll<{ version: number }>('timesheetConfig').timesheetConfig?.version ?? 0;
    const out = FlagChanged.parse((await call('PATCH', FLAG('WEEKLY'), { weekGrid: 'hours', weekLayout: 'days' }, ver())).body);
    expect(out.record.extras).toMatchObject({ weekGrid: 'hours', weekLayout: 'days' });
    expect(store.coll<{ version: number; weekLayout: string; weekGrid: string }>('timesheetConfig').timesheetConfig).toMatchObject({ weekGrid: 'hours', weekLayout: 'days', version: tcBefore + 1 });
    const setup = (await call('GET', '/api/v1/timesheet-config')).body as { config: { weekLayout: string } };
    expect(setup.config.weekLayout).toBe('days');
    expect(audits().filter(a => a.id === out.auditId)).toEqual([expect.objectContaining({ act: 'Feature changed', before: { weekGrid: 'times', weekLayout: 'classic' } })]);
  });
  test('the breaks stepper and vehicle maximum keep to their bounds; extras of a feature that is off are FLAG_OFF', async () => {
    const call = await as('admin');
    const ok = FlagChanged.parse((await call('PATCH', FLAG('BREAKS'), { breaksMax: 3 }, ver())).body);
    expect(ok.record.extras.breaksMax).toBe(3);
    const before = snapshot(...WRITES);
    const high = await call('PATCH', FLAG('BREAKS'), { breaksMax: 6 }, ver());
    expect([high.status, Refusal.parse(high.body).message]).toEqual([422, 'Breaks per entry must be between 1 and 5.']);
    const off = await call('PATCH', FLAG('VEHICLE'), { vehiclesMax: 2 }, ver());
    expect([off.status, Refusal.parse(off.body).code]).toEqual([409, 'FLAG_OFF']);
    const stray = await call('PATCH', FLAG('BREAKS'), { weekGrid: 'hours' }, ver());
    expect([stray.status, Refusal.parse(stray.body).field]).toEqual([422, 'weekGrid']);
    expect(snapshot(...WRITES)).toEqual(before);
  });
});

describe('settings', () => {
  test('timezone, date format, clock and week start save on the tenant with one audit row', async () => {
    const call = await as('admin');
    const out = updateTenantSettings.response.parse((await call('PATCH', SETTINGS,
      { timezone: 'Pacific/Auckland', dateFormat: 'yyyy-mm-dd', clock: '12h' }, ver())).body);
    expect(out.record).toMatchObject({ timezone: 'Pacific/Auckland', dateFormat: 'yyyy-mm-dd', clock: '12h', weekStart: 'Monday' });
    expect(audits().filter(a => a.entity === 'tenant')).toEqual([
      expect.objectContaining({ act: 'Calendar settings changed', before: { timezone: 'Europe/London', dateFormat: 'dd/mm/yyyy', clock: '24h' },
        after: { timezone: 'Pacific/Auckland', dateFormat: 'yyyy-mm-dd', clock: '12h' } }),
    ]);
  });
  test('an IANA zone alias is stored as the selected ID and a raw UTC offset is refused', async () => {
    const call = await as('admin');
    const out = updateTenantSettings.response.parse((await call('PATCH', SETTINGS, { timezone: 'Asia/Kathmandu' }, ver())).body);
    expect(out.record.timezone).toBe('Asia/Kathmandu');
    const before = snapshot(...WRITES);
    const invalid = await call('PATCH', SETTINGS, { timezone: '+05:45' }, ver());
    expect([invalid.status, Refusal.parse(invalid.body)]).toEqual([422, expect.objectContaining({
      field: 'timezone', message: 'Choose a valid IANA time zone.',
    })]);
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('week start refuses while open timesheet days remain, and names the count', async () => {
    const call = await as('admin');
    const openTimesheets = Object.values(store.coll<{ state: string }>('timesheetDays')).filter(d => ['pend', 'back', 'resub'].includes(d.state)).length;
    expect(openTimesheets).toBeGreaterThan(0);
    const r = await call('PATCH', SETTINGS, { weekStart: 'Sunday' }, ver());
    expect([r.status, Refusal.parse(r.body)]).toEqual([409, expect.objectContaining({
      code: 'week-start-in-use', message: `The week start cannot change while ${openTimesheets} timesheet ${openTimesheets === 1 ? 'day is' : 'days are'} open.`,
    })]);
  });
  test('week start changes when all timesheet days are closed', async () => {
    Object.values(store.coll<{ state: string }>('timesheetDays')).forEach(d => { d.state = 'ok'; });
    const out = updateTenantSettings.response.parse((await (await as('admin'))('PATCH', SETTINGS, { weekStart: 'Sunday' }, ver())).body);
    expect(out.record.weekStart).toBe('Sunday');
    expect(audits().filter(a => a.entity === 'tenant')).toEqual([
      expect.objectContaining({ act: 'Calendar settings changed', before: { weekStart: 'Monday' }, after: { weekStart: 'Sunday' } }),
    ]);
  });
  test('company details change, and a currency is not accepted', async () => {
    const call = await as('admin');
    const out = updateTenantSettings.response.parse((await call('PATCH', SETTINGS, { company: { payFrequency: 'Monthly' } }, ver())).body);
    expect(out.record.company.payFrequency).toBe('Monthly');
    expect(audits().find(a => a.id === out.auditId)?.act).toBe('Organisation settings changed');
    expect((await call('PATCH', SETTINGS, { company: { currency: 'EUR €' } }, ver())).status).toBe(422);
  });
});

describe('role names (D11)', () => {
  const URL = (id: string) => `/api/v1/user-types/${id}`;
  const typeVer = (id: string) => store.coll<{ version: number }>('userTypes')[id]?.version ?? -1;
  test('a rename changes only the name, writes Roles renamed, and the session\'s role name follows', async () => {
    const caps = store.coll<{ capabilities: string[] }>('userTypes').manager?.capabilities;
    const out = renameUserType.response.parse((await (await as('admin'))('PATCH', URL('manager'), { name: '  Service Manager ' }, typeVer('manager'))).body);
    expect(out.record).toMatchObject({ name: 'Service Manager', capabilities: caps });
    expect(audits().find(a => a.id === out.auditId)).toMatchObject({ act: 'Roles renamed', before: { name: 'Manager' }, after: { name: 'Service Manager' } });
    const s = Session.parse((await (await as('manager'))('GET', '/api/v1/session')).body);
    expect(s.account.roleName).toBe('Service Manager');
  });
  test('every role needs a name, at most 24 characters, and two roles cannot share one (ignoring case); nothing changes', async () => {
    const call = await as('admin'), before = snapshot(...WRITES);
    const blank = await call('PATCH', URL('employee'), { name: '  ' }, typeVer('employee'));
    expect([blank.status, Refusal.parse(blank.body)]).toEqual([422, expect.objectContaining({ field: 'name', message: 'Every role needs a name.' })]);
    const long = await call('PATCH', URL('employee'), { name: 'x'.repeat(25) }, typeVer('employee'));
    expect(long.status).toBe(422);
    const dup = await call('PATCH', URL('employee'), { name: 'ADMIN' }, typeVer('employee'));
    expect([dup.status, Refusal.parse(dup.body)]).toEqual([409, expect.objectContaining({ code: 'NAME_TAKEN', field: 'name', message: 'Two roles cannot share a name.' })]);
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('it needs Permissions and role configuration, and a fault changes nothing', async () => {
    const mgr = await as('manager'), admin = await as('admin'), before = snapshot(...WRITES);
    const r = await mgr('PATCH', URL('employee'), { name: 'Support Worker' }, typeVer('employee'));
    expect([r.status, Refusal.parse(r.body).code]).toEqual([403, 'capability']);
    await fault('PATCH', URL('employee'));
    expect((await admin('PATCH', URL('employee'), { name: 'Support Worker' }, typeVer('employee'))).status).toBe(500);
    expect(snapshot(...WRITES)).toEqual(before);
  });
});
