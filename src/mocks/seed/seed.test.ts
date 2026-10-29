import social from './social.json';
import qnipay from './qnipay.json';
import meta from './meta.json';

type Rec = Record<string, unknown> & { id: string; code?: string };
const vals = (s: { data: Record<string, Record<string, Rec>> }, c: string) => Object.values(s.data[c] ?? {});

for (const [name, seed] of Object.entries({ social, qnipay }) as [string, { tenant: string; data: Record<string, Record<string, Rec>> }][]) {
  describe(`seed ${name}`, () => {
    test('has employees, accounts, user types, capabilities and a tenant', () => {
      for (const c of ['employees', 'accounts', 'userTypes', 'capabilities', 'locations', 'departments'])
        expect(vals(seed, c).length, c).toBeGreaterThan(0);
      expect(seed.data.tenant?.tenant).toBeDefined();
    });
    test('every record has id, version and updatedAt', () => {
      for (const [c, recs] of Object.entries(seed.data)) for (const r of Object.values(recs))
        expect(r.id && typeof r.version === 'number' && typeof r.updatedAt === 'string', `${c}/${r.id}`).toBe(true);
    });
    test('codes are unique within each dimension', () => {
      for (const c of ['employees', 'locations', 'departments', 'costCentres', 'jobProfiles', 'projects']) {
        const codes = vals(seed, c).map(r => r.code);
        expect(new Set(codes).size, c).toBe(codes.length);
      }
    });
    test('every employee sits in a location that exists, and every account in an employee that exists', () => {
      const locs = new Set(vals(seed, 'locations').map(l => l.code));
      const employees = new Set(vals(seed, 'employees').map(p => p.code));
      expect(vals(seed, 'employees').filter(p => p.location && !locs.has(p.location as string)).map(p => p.code)).toEqual([]);
      expect(vals(seed, 'accounts').filter(a => !employees.has(a.employeeCode as string)).map(a => a.email)).toEqual([]);
    });
    test('none of the removed capabilities, data or posting links remains', () => {
      /* Rota, Hours and Exceptions, Payroll readiness and the Business Central page leave with their capabilities */
      const REMOVED = ['own_shifts', 'claim', 'team_rota', 'team_cover', 'rota_pattern', 'rota_shift', 'own_hours', 'team_hours', 'integration'];
      const held = new Set([...Object.keys(seed.data.capabilities ?? {}),
        ...vals(seed, 'userTypes').flatMap(u => u.capabilities as string[]),
        ...vals(seed, 'accounts').flatMap(a => [...(a.grants as string[]), ...(a.revocations as string[])])]);
      expect(REMOVED.filter(c => held.has(c))).toEqual([]);
      for (const c of ['integrationAttempts', 'exceptionHandling', 'payrollRuns']) expect(seed.data[c], c).toBeUndefined();
      expect(vals(seed, 'timesheetDays').filter(d => 'integrationAttemptId' in d).map(d => d.id)).toEqual([]);
      expect(vals(seed, 'notifications').filter(n => n.area === 'Integration').map(n => n.id)).toEqual([]);
    });
    test('at least one account of each user type exists', () => {
      const types = new Set(vals(seed, 'accounts').map(a => a.userType));
      expect([...types].sort()).toEqual(['admin', 'employee', 'manager']);
    });
    test('the admin user type holds framework (Notifications and Approvals setup)', () => {
      const admin = vals(seed, 'userTypes').find(u => u.id === 'admin');
      expect(admin?.capabilities as string[]).toContain('framework');
    });
  });
}
/* Copy a person reads: a capability's label and where it applies (Permissions page) and each module's name. */
test('seed copy: capability labels, gates and module names say neither Qnipay nor Workforce core', () => {
  const strings: string[] = [];
  for (const seed of [social, qnipay]) for (const c of vals(seed, 'capabilities')) strings.push(String(c.label), String(c.gate));
  for (const m of (meta as unknown as { modules: { name: string }[] }).modules) strings.push(m.name);
  expect(strings.length).toBeGreaterThan(20);
  expect(strings.filter(t => /qnipay|workforce core/i.test(t))).toEqual([]);
});

test('meta carries flags, modules and the lifecycle', () => {
  const flagCodes = meta.flags.map((f: { code: string }) => f.code);
  for (const f of ['SHIFT', 'FULFIL', 'LV_ROTA', 'ITACCESS', 'NOTICES']) expect(flagCodes).not.toContain(f);
  expect(flagCodes).toHaveLength(23);
  expect(flagCodes.filter((f: string) => f.startsWith('LV_'))).toEqual([]);
  expect(meta.modules.map((m: { code: string }) => m.code)).not.toContain('R');
  expect(meta.modules.map((m: { code: string }) => m.code)).not.toContain('L');
  expect(meta.modules.map((m: { code: string }) => m.code)).toContain('CORE');
  expect(Object.keys(meta.empStates)).toEqual(['candidate', 'preboard', 'active', 'suspended', 'onleave', 'leaver', 'archived']);
});
