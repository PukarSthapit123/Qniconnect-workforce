import { server } from './node';
import { store } from './store';
import { tokenForEmail, tokenOf } from '@/test/api-helpers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
beforeEach(() => store.reset('social'));
const post = (url: string, body?: unknown, token?: string) => fetch(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
const getSession = (headers: Record<string, string>) => fetch('/api/v1/session', { headers });
/* Explicit guard rather than `!`: a missing seeded account is a broken test
   fixture, and this fails with a clear message instead of a TypeError. */
const anyAccount = (type: string) => {
  const found = Object.values(store.db.accounts as Record<string, { email: string; userType: string; employeeCode: string }>).find(a => a.userType === type);
  if (!found) throw new Error(`no seeded account with userType "${type}"`);
  return found;
};

/* Spec section 6: the fake server maps the email in the Microsoft token to a
   seed account, without verifying the token (development only). */
test('session from bearer JWT email', async () => {
  const mgr = anyAccount('manager');
  const r = await getSession({ Authorization: `Bearer ${tokenOf(mgr.email)}` });
  expect(r.status).toBe(200);
  const s = await r.json();
  expect(s.account).toMatchObject({ email: mgr.email, userType: 'manager', employeeCode: mgr.employeeCode });
  expect(s.capabilities).toContain('team_employees');
  /* the token and the "simulated" label are gone: the session is the Microsoft one */
  expect(s).not.toHaveProperty('token');
  expect(s).not.toHaveProperty('simulated');
  /* the address is matched whatever its case */
  expect((await getSession({ Authorization: `Bearer ${tokenOf(mgr.email.toUpperCase())}` })).status).toBe(200);
});
test('X-Dev-Account overrides the token email', async () => {
  const mgr = anyAccount('manager'), admin = anyAccount('admin');
  const r = await getSession({ Authorization: `Bearer ${tokenOf('somebody@contoso.com')}`, 'X-Dev-Account': admin.email });
  expect(r.status).toBe(200);
  expect((await r.json()).account).toMatchObject({ email: admin.email, userType: 'admin' });
  const both = await getSession({ Authorization: `Bearer ${tokenOf(mgr.email)}`, 'X-Dev-Account': admin.email });
  expect((await both.json()).account.email).toBe(admin.email);
  /* and it is enough on its own */
  expect((await getSession({ 'X-Dev-Account': mgr.email })).status).toBe(200);
});
test('unknown email is 401 signed-out', async () => {
  const tries: Record<string, string>[] = [{ Authorization: `Bearer ${tokenOf('nobody@example.org')}` }, { 'X-Dev-Account': 'nobody@example.org' }, {}, { Authorization: 'Bearer not-a-jwt' }];
  for (const headers of tries) {
    const r = await getSession(headers);
    expect(r.status, JSON.stringify(headers)).toBe(401);
    expect(await r.json()).toMatchObject({ code: 'signed-out', next: expect.any(String) });
  }
  expect(Object.keys(store.coll('sessions'))).toEqual([]);
});
test('the session record is keyed by the lower-case email, made on first use, and keeps view-as', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  expect(store.coll('sessions')).toEqual({});
  await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, tokenOf(admin.email.toUpperCase()));
  expect(Object.keys(store.coll('sessions'))).toEqual([admin.email.toLowerCase()]);
  const again = await getSession({ Authorization: `Bearer ${tokenOf(admin.email)}` });
  expect((await again.json()).viewingAs).toMatchObject({ employeeCode: emp.employeeCode });
});
test('a session whose account has gone is refused, so the client signs out', async () => {
  const acc = anyAccount('employee');
  const token = await tokenForEmail(acc.email);
  Reflect.deleteProperty(store.db.accounts as Record<string, unknown>, `acc_${acc.email}`);
  const r = await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(401);
});
test('view-as is audited, and the session says who is really signed in', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  const r = await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  const s = await r.json();
  expect(s.viewingAs.employeeCode).toBe(emp.employeeCode);
  expect(s.account.email).toBe(admin.email);
  expect(Object.values(store.coll<{ act: string }>('audit')).some(a => a.act === 'View-as started')).toBe(true);
});
test('a signed-in employee without the perm_cfg capability is refused view-as with a plain 403', async () => {
  const emp = anyAccount('employee'), target = anyAccount('manager');
  const token = await tokenForEmail(emp.email);
  const r = await post('/api/v1/session/view-as', { employeeCode: target.employeeCode }, token);
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: 'capability', next: expect.any(String) });
});
test('view-as refuses an unknown employee ID with a 422 naming the field', async () => {
  const admin = anyAccount('admin');
  const token = await tokenForEmail(admin.email);
  const r = await post('/api/v1/session/view-as', { employeeCode: 'NOPE-0000' }, token);
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ code: 'invalid', field: 'employeeCode', next: expect.any(String) });
});
test('view-as refuses an employee with no account, rather than quietly using the viewer\'s own capabilities under their label', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  Reflect.deleteProperty(store.db.accounts as Record<string, unknown>, `acc_${emp.email}`);
  const r = await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ code: 'invalid', field: 'employeeCode', next: expect.any(String) });
});
test('a view-as target whose account vanishes mid-view falls back to the real account, not a leaked, mislabelled one', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  Reflect.deleteProperty(store.db.accounts as Record<string, unknown>, `acc_${emp.email}`);
  const r = await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(200);
  const s = await r.json();
  expect(s.viewingAs).toBeUndefined();
  expect(s.account.email).toBe(admin.email);
  expect(s.capabilities).toContain('framework'); // the admin's own capability, not the employee's
});
test('the view-as-started audit row names the real account and records what it started viewing as, with correct before/after', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  const rows = Object.values(store.coll<{ act: string; who: { employeeCode: string; viewingAs?: string }; before: unknown; after: unknown }>('audit'));
  const row = rows.find(r => r.act === 'View-as started');
  expect(row).toMatchObject({ who: { employeeCode: admin.employeeCode, viewingAs: emp.employeeCode }, before: null, after: { viewingAs: emp.employeeCode } });
});
test('ending view-as writes its own audit row', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  const r = await fetch('/api/v1/session/view-as', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(200);
  const rows = Object.values(store.coll<{ act: string; before: unknown; after: unknown }>('audit'));
  const row = rows.find(x => x.act === 'View-as ended');
  expect(row).toMatchObject({ before: { viewingAs: emp.employeeCode }, after: null });
});

/* I4: view-as is gated on perm_cfg, as in the prototype (v15:10773). Holding
   framework (the audit log) alone is not enough. */
test('an account holding framework but not perm_cfg is refused view-as', async () => {
  const emp = anyAccount('employee'), target = anyAccount('manager');
  const accounts = store.db.accounts as Record<string, { grants: string[] }>;
  const record = accounts[`acc_${emp.email}`];
  if (!record) throw new Error('no seeded employee record');
  record.grants = [...record.grants, 'framework'];
  const token = await tokenForEmail(emp.email);
  const { capabilities } = await (await getSession({ Authorization: `Bearer ${token}` })).json();
  expect(capabilities).toContain('framework');
  const r = await post('/api/v1/session/view-as', { employeeCode: target.employeeCode }, token);
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: 'capability', message: expect.stringContaining('Permissions and role configuration'), next: expect.any(String) });
});

async function viewingAsEmployee() {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  const token = await tokenForEmail(admin.email);
  const started = await post('/api/v1/session/view-as', { employeeCode: emp.employeeCode }, token);
  expect(started.status).toBe(200);
  return { token, admin, emp };
}

test('while viewing as someone, a write is refused with 403 and the store is unchanged', async () => {
  const { token } = await viewingAsEmployee();
  const before = structuredClone(store.db);
  const r = await fetch('/api/v1/user-types/employee/capabilities/proxy', { method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'If-Match': '1' }, body: JSON.stringify({ granted: true }) });
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: 'viewing-as', message: expect.stringContaining('changes are off'), next: expect.stringContaining('Return to your own account') });
  expect(store.db).toEqual(before);
});

test('while viewing as someone, starting another view-as is refused too', async () => {
  const { token } = await viewingAsEmployee();
  const r = await post('/api/v1/session/view-as', { employeeCode: anyAccount('manager').employeeCode }, token);
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: 'viewing-as' });
});

test('while viewing as someone, reads still work and ending view-as still works', async () => {
  const { token, admin } = await viewingAsEmployee();
  expect((await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  const r = await fetch('/api/v1/session/view-as', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(200);
  const s = await r.json();
  expect(s.viewingAs).toBeUndefined();
  expect(s.account.email).toBe(admin.email);
});

/* The token is Microsoft's, so signing out cannot revoke it here: it ends
   the Workforce session record, view-as and all, and the client then signs
   out of Microsoft. */
test('while viewing as someone, signing out still works, and ends the view', async () => {
  const { token, admin } = await viewingAsEmployee();
  const r = await fetch('/api/v1/session', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(200);
  expect(store.coll('sessions')).toEqual({});
  const s = await (await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(s.viewingAs).toBeUndefined();
  expect(s.account.email).toBe(admin.email);
});

/* I6: sign-in and sign-out are audited; an address the server does not know is not a change. */
type AuditRow = { act: string; entity: string; entityId: string; who: { employeeCode: string; name: string }; before: unknown; after: unknown };
const auditRows = () => Object.values(store.coll<AuditRow>('audit'));

test('signing in writes one audit row naming who, with no token in it', async () => {
  const acc = anyAccount('manager');
  const token = await tokenForEmail(acc.email);
  await getSession({ Authorization: `Bearer ${token}` });
  const rows = auditRows().filter(r => r.act === 'Signed in');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ entity: 'session', entityId: acc.email, who: { employeeCode: acc.employeeCode }, before: null, after: { signedIn: true } });
  expect(JSON.stringify(rows[0])).not.toContain(token);
});

test('an unknown address writes no audit row', async () => {
  await getSession({ Authorization: `Bearer ${tokenOf('nobody@example.org')}` });
  await getSession({ 'X-Dev-Account': 'nobody@example.org' });
  expect(auditRows()).toEqual([]);
});

test('signing out writes one audit row naming who', async () => {
  const acc = anyAccount('employee');
  const token = await tokenForEmail(acc.email);
  await fetch('/api/v1/session', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const rows = auditRows().filter(r => r.act === 'Signed out');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ entity: 'session', entityId: acc.email, who: { employeeCode: acc.employeeCode }, before: { signedIn: true }, after: null });
});

/* I5: who the account menu offers to view as. */
test('the view-as list offers one employee per role, never yourself, nobody who has left, at most five', async () => {
  const admin = anyAccount('admin');
  const token = await tokenForEmail(admin.email);
  const r = await fetch('/api/v1/session/view-as/employees', { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status).toBe(200);
  const employees = (await r.json()) as { employeeCode: string; userType: string; roleName: string; locationName: string; onboarding: boolean }[];
  expect(employees.length).toBeGreaterThan(0);
  expect(employees.length).toBeLessThanOrEqual(5);
  expect(employees.map(p => p.employeeCode)).not.toContain(admin.employeeCode);
  expect(employees.filter(p => p.userType === 'manager')).toHaveLength(1);
  const gone = Object.values(store.coll<{ code: string; state: string }>('employees')).filter(p => p.state === 'leaver').map(p => p.code);
  expect(employees.some(p => gone.includes(p.employeeCode))).toBe(false);
  expect(employees.every(p => p.roleName && p.locationName)).toBe(true);
});
test('the session names the account\'s role, what it is for and where they work', async () => {
  const s = await (await getSession({ Authorization: `Bearer ${tokenOf(anyAccount('manager').email)}` })).json();
  expect(s.account).toMatchObject({ roleName: 'Manager', roleDescription: expect.stringContaining('team'), locationName: expect.any(String) });
  expect(s.account.locationName.length).toBeGreaterThan(0);
});

/* 1a minor: view-as of yourself is refused, not quietly started. */
test('view-as of yourself is refused with 422 in plain words, and nothing is recorded', async () => {
  const admin = anyAccount('admin');
  const token = await tokenForEmail(admin.email);
  const r = await post('/api/v1/session/view-as', { employeeCode: admin.employeeCode }, token);
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({ code: 'invalid', field: 'employeeCode', message: expect.stringContaining('yourself'), next: expect.any(String) });
  expect(auditRows().some(x => x.act === 'View-as started')).toBe(false);
  expect((await (await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } })).json()).viewingAs).toBeUndefined();
});

/* 1c D11: a renamed role shows its new name everywhere, the role pill while
   viewing as someone included, so the session carries the viewed employee's
   role name as well as their user type. */
test('viewing as someone whose role was renamed carries the new role name', async () => {
  const { token } = await viewingAsEmployee();
  const r = await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  expect((await r.json()).viewingAs).toMatchObject({ userType: 'employee', roleName: 'Employee' });
  const types = store.coll<{ name: string }>('userTypes');
  const employee = types.employee;
  if (!employee) throw new Error('no seeded employee user type');
  employee.name = 'Colleague';
  const again = await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  expect((await again.json()).viewingAs).toMatchObject({ userType: 'employee', roleName: 'Colleague' });
});

/* D8: a work email change re-keys the account; the open session record follows it. */
test('a session record follows its account to a new work email', async () => {
  const admin = anyAccount('admin'), emp = anyAccount('employee');
  await tokenForEmail(emp.email);
  const token = await tokenForEmail(admin.email);
  const p = Object.values(store.coll<{ id: string; code: string; version: number }>('employees')).find(x => x.code === emp.employeeCode);
  if (!p) throw new Error('no seeded employee');
  const r = await fetch(`/api/v1/employees/${p.id}`, { method: 'PATCH', body: JSON.stringify({ email: 'moved.here@brightpath.org' }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'If-Match': String(p.version) } });
  expect(r.status).toBe(200);
  expect(Object.keys(store.coll('sessions')).sort()).toEqual([admin.email.toLowerCase(), 'moved.here@brightpath.org'].sort());
});
