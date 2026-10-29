import social from './social.json';
import qnipay from './qnipay.json';
import { Company, FinancialYear, BankHoliday } from '@/contract/tenant';
import { EXTRA_BOUNDS, FLAGS, SWITCH_CODES, moduleLive, moduleBy } from '@/domain/modules';

interface TenantSeed {
  modules: Record<string, boolean>; flags: Record<string, boolean>; company: unknown; financialYear: unknown; weekStart: string;
  bankHolidays: unknown[]; extras: { breaksMax: number; vehiclesMax: number }; restore: Record<string, string[]>;
}
interface SeedFile { data: Record<string, Record<string, unknown>> }
const tenantOf = (s: SeedFile) => s.data.tenant?.tenant as TenantSeed;

for (const [name, raw] of Object.entries({ social, qnipay })) {
  const seed = raw as unknown as SeedFile, t = tenantOf(seed);
  describe(`seed ${name} for 1c`, () => {
    test('company details parse, and carry no currency (no money)', () => {
      expect(Company.parse(t.company)).toBeTruthy();
      expect(JSON.stringify(t.company)).not.toMatch(/currency|£|€|\$/i);
    });
    test('the financial year is the prototype\'s 2026/27', () => {
      expect(FinancialYear.parse(t.financialYear)).toEqual({ start: '2026-04-01', end: '2027-03-31', label: '2026/27' });
    });
    test('the week starts on Monday and the bank holidays are the prototype\'s, as ISO dates in order', () => {
      expect(t.weekStart).toBe('Monday');
      expect(t.bankHolidays.map(b => BankHoliday.parse(b))).toEqual([
        { date: '2026-08-31', name: 'Summer bank holiday' }, { date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-12-28', name: 'Boxing Day' }]);
    });
    test('every switch the catalogue knows is seeded, QniConnect is on and Timesheet is live', () => {
      expect(Object.keys(t.modules).sort()).toEqual([...SWITCH_CODES].sort());
      expect(t.modules.CORE).toBe(true);
      const ts = moduleBy('TS');
      expect(ts && moduleLive(t.modules, ts)).toBe(true);
      expect(Object.keys(t.flags).sort()).toEqual(FLAGS.map(f => f.code).sort());
    });
    test('feature extras sit inside their bounds, and nothing is remembered to restore yet', () => {
      expect(t.extras.breaksMax).toBeGreaterThanOrEqual(EXTRA_BOUNDS.breaksMax.min);
      expect(t.extras.breaksMax).toBeLessThanOrEqual(EXTRA_BOUNDS.breaksMax.max);
      expect(t.extras.vehiclesMax).toBeGreaterThanOrEqual(EXTRA_BOUNDS.vehiclesMax.min);
      expect(t.extras.vehiclesMax).toBeLessThanOrEqual(EXTRA_BOUNDS.vehiclesMax.max);
      expect(t.restore).toEqual({});
    });
    test('the weekly grid is not repeated on the tenant (one home each, D6)', () => {
      expect(t).not.toHaveProperty('weekGrid');
      expect(t).not.toHaveProperty('weekLayout');
      expect(seed.data.timesheetConfig?.timesheetConfig).toMatchObject({ weekGrid: expect.any(String), weekLayout: expect.any(String) });
    });
  });
}
test('no seed carries rota data, a Rota module switch or a Rota feature', () => {
  for (const seed of [social, qnipay] as unknown as SeedFile[]) {
    for (const c of ['shiftTypes', 'patterns', 'rotaWeeks', 'rotaProfiles', 'coverRequests', 'filledShifts', 'rotaConfig', 'rotaSetAside', 'itRequests', 'notifEvidence'])
      expect(seed.data[c], c).toBeUndefined();
    const t = seed.data.tenant?.tenant as { modules: Record<string, boolean>; flags: Record<string, boolean> };
    expect(t.modules).not.toHaveProperty('R');
    for (const f of ['SHIFT', 'PATTERNS', 'MINSTAFF', 'FULFIL', 'SAFEWORKER', 'FLEXMON', 'ITACCESS', 'RESTRULE', 'PREFS', 'LV_ROTA']) expect(t.flags, f).not.toHaveProperty(f);
  }
});
test('social carries the prototype\'s delegation by employee code (D8); qnipay has none; no chain is seeded', () => {
  expect((social as unknown as SeedFile).data.delegations).toEqual({ dlg_1: { id: 'dlg_1', version: 1, updatedAt: '2026-08-13T14:30:00.000Z',
    who: 'CP-1001', to: 'CP-1002', from: '2026-08-24', until: '2026-08-31', modules: ['Timesheet'] } });
  expect((qnipay as unknown as SeedFile).data.delegations).toEqual({});
  for (const s of [social, qnipay]) expect((s as unknown as SeedFile).data.approvalChains).toBeUndefined();
});
test('neither tenant carries notices, a notice board flag or its capabilities', () => {
  for (const raw of [social, qnipay]) {
    const seed = raw as unknown as SeedFile;
    expect(seed.data.notices).toBeUndefined();
    expect(JSON.stringify(seed)).not.toMatch(/own_notices|notice_post|notice_org|NOTICES/);
  }
});
test('each tenant carries the prototype\'s seven documents for its first employee account, with ISO dates, and no payroll documents (Business Central\'s, Task 25)', () => {
  for (const [raw, owner] of [[social, 'CP-1042'], [qnipay, 'EMP002']] as const) {
    const seed = raw as unknown as SeedFile;
    const docs = Object.values(seed.data.documents ?? {}) as { employeeCode: string; name: string; date: string; source: string }[];
    expect(docs.map(d => d.name)).toEqual(['Contract of employment', 'Job description · Support Worker', 'DBS certificate', 'Safeguarding L2 certificate',
      'Medication competency', 'Working time opt-out', 'Annual leave statement 2026/27']);
    expect(docs.every(d => d.employeeCode === owner && /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    expect(seed.data).not.toHaveProperty('payrollDocuments');
  }
});
