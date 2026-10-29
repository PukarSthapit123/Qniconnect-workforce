/* The dashboard's sequence (docs/superpowers/inventory/portal.md, HOME.R1 to
   HOME.R11 and HOME.R17), against the fake /bc server through the real bcApi
   and the auth stub: what is called, in what order, what is stored, and what
   the page is given to show. Amara Okafor (CP-1042) on the social seed. */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { bcStore, REGISTRATION_ID } from '@/mocks/bc/seed';
import { queryClient } from '@/api/query';
import { setStubAccount } from '@/test/api-helpers';
import type { BcEnvironment } from './context';
import { bcEvents } from './events';
import { fetchEmployeeProfile, loadDashboard, toDashboardPerson, useDashboard, type PortalPerson } from './payroll';

const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
const AMARA = 'amara.okafor@brightpath.org';
const ME: PortalPerson = { name: 'Amara from Microsoft', email: AMARA };
const PRODUCTION = (): BcEnvironment => {
  const e = bcStore.db.environments.find(x => x.name === 'Production');
  if (!e) throw new Error('no Production environment in the fake seed');
  return { id: e.id, name: e.name, companyName: e.companyName, company_Id: e.company_Id };
};
const SANDBOX = (extra: Partial<BcEnvironment> = {}): BcEnvironment => ({ id: 'env-sandbox-01', name: 'Sandbox', companyName: 'BrightPath Care (Sandbox)', company_Id: '', ...extra });

interface Seen { method: string; path: string; headers: Headers; body: string }
let seen: Seen[] = [];
const paths = () => seen.map(s => `${s.method} ${s.path}`);
const ls = (k: string) => localStorage.getItem(k);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  seen = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (!u.href.startsWith(BASE)) return;
    void request.clone().text().then(body => { seen.push({ method: request.method, path: u.pathname.slice(new URL(BASE).pathname.replace(/\/$/, '').length) + u.search, headers: request.headers, body }); });
  });
  localStorage.clear();
  setStubAccount(AMARA);
  localStorage.setItem('registrationId', REGISTRATION_ID);
  localStorage.setItem('currentUser', JSON.stringify({ email: AMARA, name: 'Amara' }));
  localStorage.setItem('activeEnvironment', JSON.stringify(PRODUCTION()));
});
afterEach(() => { server.events.removeAllListeners(); server.resetHandlers(); queryClient.clear(); });

/* settle the request log (bodies are read asynchronously) */
const settled = async () => { await new Promise(r => setTimeout(r, 0)); };

test('HOME.R1: the whole sequence runs again when the user or the environment changes', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(({ user, env }) => useDashboard(user, env), { wrapper, initialProps: { user: ME, env: PRODUCTION() } });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await settled();
  const once = seen.filter(s => s.path.startsWith('/bc/employees/current')).length;
  expect(once).toBe(1);
  /* the same user and environment again: nothing new */
  rerender({ user: { ...ME }, env: PRODUCTION() });
  await settled();
  expect(seen.filter(s => s.path.startsWith('/bc/employees/current'))).toHaveLength(1);
  /* the user's name changes (QniConnect set the basic user, then the enhanced one) */
  rerender({ user: { ...ME, name: 'Amara Okafor' }, env: PRODUCTION() });
  await waitFor(() => expect(seen.filter(s => s.path.startsWith('/bc/employees/current'))).toHaveLength(2));
  /* the environment changes */
  localStorage.setItem('activeEnvironment', JSON.stringify(SANDBOX()));
  rerender({ user: { ...ME, name: 'Amara Okafor' }, env: SANDBOX() });
  await waitFor(() => expect(seen.filter(s => s.path.startsWith('/bc/employees/current'))).toHaveLength(3));
  await waitFor(() => expect(seen.filter(s => s.path === '/bc/payslips')).toHaveLength(3));
});

test('HOME.R2: companies, then the profile, then the payslips, strictly one after another, the payslips with the number the profile stored', async () => {
  localStorage.setItem('activeEnvironment', JSON.stringify(SANDBOX()));
  const order: string[] = [];
  server.events.on('request:end', ({ request }) => { order.push(`end ${request.method} ${new URL(request.url).pathname.replace(/^.*?(\/bc\/|\/session\/)/, '$1')}`); });
  server.events.on('request:start', ({ request }) => { order.push(`start ${request.method} ${new URL(request.url).pathname.replace(/^.*?(\/bc\/|\/session\/)/, '$1')}`); });
  await loadDashboard(ME, SANDBOX());
  expect(order).toEqual([
    'start POST /bc/client-tenant/companies', 'end POST /bc/client-tenant/companies',
    'start GET /bc/employees/current', 'end GET /bc/employees/current',
    'start POST /session/init', 'end POST /session/init',
    'start GET /bc/payslips', 'end GET /bc/payslips',
  ]);
  await settled();
  expect(seen.find(s => s.path === '/bc/payslips')?.headers.get('X-Employee-No')).toBe('CP-1042');
});

describe('HOME.R3', () => {
  test('HOME.R3: no call is made without both a user and an environment, and the page stays loading', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const noEnv = renderHook(() => useDashboard(ME, null), { wrapper });
    const noUser = renderHook(() => useDashboard(null, PRODUCTION()), { wrapper });
    await settled(); await settled();
    expect(seen).toEqual([]);
    expect(noEnv.result.current.isPending).toBe(true);
    expect(noUser.result.current.isPending).toBe(true);
  });
});

test('HOME.R4: an environment with a company skips the lookup and stores it; no registration id skips it too', async () => {
  await loadDashboard(ME, PRODUCTION());
  await settled();
  expect(paths()).not.toContain('POST /bc/client-tenant/companies');
  expect(ls('clientCompanyId')).toBe(PRODUCTION().company_Id);
  expect(ls('clientCompanyName')).toBe('BrightPath Care Ltd');

  /* the all-zero id is no company: it is looked up */
  seen = [];
  localStorage.removeItem('clientCompanyId');
  await loadDashboard(ME, SANDBOX({ company_Id: '00000000-0000-0000-0000-000000000000' }));
  await settled();
  expect(paths()[0]).toBe('POST /bc/client-tenant/companies');

  /* no registration id: no lookup, and the profile still runs */
  seen = [];
  localStorage.removeItem('registrationId');
  await loadDashboard(ME, SANDBOX());
  await settled();
  expect(paths()).not.toContain('POST /bc/client-tenant/companies');
  expect(paths()).toContain('GET /bc/employees/current?clientEnvironment=Production&clientCompanyId=2b8d4e6f-1a3c-4d5e-8f70-9a1b2c3d4e02&email=amara.okafor%40brightpath.org');
});

test('HOME.R5: a failed company lookup is swallowed and the profile and payslips still load', async () => {
  server.use(http.post(`${BASE}/bc/client-tenant/companies`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  const d = await loadDashboard(ME, SANDBOX());
  expect(d.person?.name).toBe('Amara Okafor');
  expect(d.payslips.length).toBeGreaterThan(0);
});

test('HOME.R6: the list is stored, and the exact name match (trimmed, any case) is remembered; no match, or no name, forgets both', async () => {
  const companies = [{ id: 'c-1', name: 'Other Ltd', displayName: 'Other' }, { id: 'c-2', name: '', displayName: '  brightpath care (sandbox) ' }];
  server.use(http.post(`${BASE}/bc/client-tenant/companies`, () => HttpResponse.json({ value: companies })));
  await loadDashboard(ME, SANDBOX({ companyName: 'BrightPath Care (Sandbox)' }));
  expect(JSON.parse(ls('clientCompanies') ?? '[]')).toEqual(companies);
  expect(ls('clientCompanyId')).toBe('c-2');
  expect(ls('clientCompanyName')).toBe('  brightpath care (sandbox) ');

  /* a partial match is no match */
  await loadDashboard(ME, SANDBOX({ companyName: 'BrightPath' }));
  expect(ls('clientCompanyId')).toBeNull();
  expect(ls('clientCompanyName')).toBeNull();

  localStorage.setItem('clientCompanyId', 'stale');
  await loadDashboard(ME, SANDBOX({ companyName: '' }));
  expect(ls('clientCompanyId')).toBeNull();

  /* a bare list is read as well (`response.value || response`) */
  server.use(http.post(`${BASE}/bc/client-tenant/companies`, () => HttpResponse.json([{ id: 'c-9', name: 'Sandbox Co' }])));
  await loadDashboard(ME, SANDBOX({ companyName: 'Sandbox Co' }));
  expect(ls('clientCompanyId')).toBe('c-9');

  /* not a list: only logged, nothing stored or forgotten */
  server.use(http.post(`${BASE}/bc/client-tenant/companies`, () => HttpResponse.json({ updateResult: { success: true } })));
  localStorage.setItem('clientCompanies', '"kept"');
  await loadDashboard(ME, SANDBOX({ companyName: 'Sandbox Co' }));
  expect(ls('clientCompanies')).toBe('"kept"');
  expect(ls('clientCompanyId')).toBe('c-9');
});

test('HOME.R7: with no company stored, the profile looks the environment\'s company up in the stored list', async () => {
  localStorage.setItem('activeEnvironment', JSON.stringify(SANDBOX({ companyName: 'Sandbox Co' })));
  localStorage.setItem('clientCompanies', JSON.stringify([{ id: 'c-7', displayName: 'SANDBOX CO' }]));
  await fetchEmployeeProfile();
  await settled();
  expect(ls('clientCompanyId')).toBe('c-7');
  expect(ls('clientCompanyName')).toBe('SANDBOX CO');
  expect(seen.find(s => s.path.startsWith('/bc/employees/current'))?.path).toContain('clientCompanyId=c-7');

  /* no match: both forgotten, and no company is sent */
  seen = [];
  localStorage.removeItem('clientCompanyId');
  localStorage.setItem('clientCompanies', JSON.stringify([{ id: 'c-8', name: 'Elsewhere' }]));
  await fetchEmployeeProfile();
  await settled();
  expect(ls('clientCompanyName')).toBeNull();
  expect(seen[0]?.path).not.toContain('clientCompanyId');
  expect(seen[0]?.headers.get('X-Client-Company-ID')).toBe('');

  /* a stored list that is not JSON is ignored */
  localStorage.setItem('clientCompanies', '{not json');
  await expect(fetchEmployeeProfile()).resolves.toMatchObject({ employeeNo: 'CP-1042' });
});

test('HOME.R8: without a stored email the profile fails before anything is sent', async () => {
  localStorage.setItem('currentUser', JSON.stringify({ name: 'No email' }));
  await expect(fetchEmployeeProfile()).rejects.toThrow(/email/);
  await settled();
  expect(seen).toEqual([]);
});

test('HOME.R9: a failed profile gives no person and fetches no payslips', async () => {
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  await expect(loadDashboard(ME, PRODUCTION())).resolves.toEqual({ person: null, payslips: [] });
  await settled();
  expect(paths().some(p => p.startsWith('GET /bc/payslips'))).toBe(false);
  /* a profile answer that is not a record at all is the same */
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json(null)));
  await expect(loadDashboard(ME, PRODUCTION())).resolves.toEqual({ person: null, payslips: [] });
});

test('HOME.R10: the profile stores the number, id and record, starts the session with the number, and the bell is told only when there is one', async () => {
  const ready = vi.fn();
  const off = bcEvents.on('employee-no-ready', ready);
  localStorage.setItem('employeeNo', 'OLD');
  await loadDashboard(ME, PRODUCTION());
  await settled();
  expect(ls('employeeNo')).toBe('CP-1042');
  expect(ls('employeeId')).toMatch(/^f1/);
  expect(JSON.parse(ls('employeeData') ?? '{}')).toMatchObject({ employeeNo: 'CP-1042', firstName: 'Amara' });
  const init = seen.find(s => s.path === '/session/init');
  expect(JSON.parse(init?.body ?? '{}')).toEqual({ registrationId: REGISTRATION_ID, userEmail: AMARA, employeeNo: 'CP-1042' });
  expect(ready).toHaveBeenCalledTimes(1);

  /* a session init that fails is ignored */
  server.use(http.post(`${BASE}/session/init`, () => HttpResponse.json({ message: 'no' }, { status: 500 })));
  await expect(loadDashboard(ME, PRODUCTION())).resolves.toMatchObject({ person: { employeeId: 'CP-1042' } });
  expect(ready).toHaveBeenCalledTimes(2);

  /* no employeeNo: cleared, no session init, no bell */
  seen = [];
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ id: 'p-1', firstName: 'Amara' })));
  localStorage.setItem('employeeNo', 'OLD');
  await loadDashboard(ME, PRODUCTION());
  await settled();
  expect(ls('employeeNo')).toBe('');
  expect(paths()).not.toContain('POST /session/init');
  expect(ready).toHaveBeenCalledTimes(2);

  /* a number but no id: stored by the dashboard, no record, no session init */
  seen = [];
  localStorage.removeItem('employeeId');
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ employeeNo: 'CP-9' })));
  await loadDashboard(ME, PRODUCTION());
  await settled();
  expect(ls('employeeNo')).toBe('CP-9');
  expect(ls('employeeId')).toBeNull();
  expect(paths()).not.toContain('POST /session/init');
  expect(ready).toHaveBeenCalledTimes(3);
  off();
});

test('HOME.R11: the person, with QniConnect\'s defaults, the department from the environment', () => {
  const env = { ...PRODUCTION(), department: 'Care' };
  expect(toDashboardPerson({ firstName: 'Jane', middleName: 'Anne', lastName: 'Smith', jobTitle: 'Nurse', employeeNo: 'E1', email: 'j@x.y',
    employmentDate: '2022-01-15', frequency: 'Monthly', hmrcTaxCode: '1257L', nationalInsuranceNumber: 'QQ123456C', niClassCode: 'A', nationalInsuranceCode: 'B',
    mobilePhoneNo: '0770', address: '1 Road', address2: 'Flat 2', addressLine3: 'L3', addressLine4: 'L4', city: 'London', postCode: 'N1' }, ME, env)).toEqual({
    name: 'Jane Anne Smith', position: 'Nurse', department: 'Care', employeeId: 'E1', email: 'j@x.y', joinDate: '2022-01-15', payFrequency: 'Monthly',
    taxCode: '1257L', niNumber: 'QQ123456C', niCategory: 'A B', phone: '0770', address: '1 Road', address2: 'Flat 2',
    addressLine3: 'L3', addressLine4: 'L4', city: 'London', postCode: 'N1' });
  expect(toDashboardPerson({}, ME, PRODUCTION())).toEqual({
    name: 'Amara from Microsoft', position: 'Employee', department: '', employeeId: 'N/A', email: AMARA, joinDate: 'N/A', payFrequency: 'N/A',
    taxCode: 'N/A', niNumber: 'N/A', niCategory: 'N/A', phone: 'N/A', address: 'N/A', address2: 'N/A',
    addressLine3: '', addressLine4: '', city: '', postCode: '' });
});

test('HOME.R17: NI category never shows the word "undefined": the parts there are, or N/A (fixed, Ruling Q2)', () => {
  const cat = (p: Record<string, string | null>) => toDashboardPerson(p, ME, PRODUCTION()).niCategory;
  expect(cat({ niClassCode: 'A' })).toBe('A');
  expect(cat({ nationalInsuranceCode: 'B' })).toBe('B');
  expect(cat({ niClassCode: null, nationalInsuranceCode: null })).toBe('N/A');
  expect(cat({ niClassCode: 'Class 1', nationalInsuranceCode: 'A' })).toBe('Class 1 A');
});

test('the fake answers each seeded employee with their own record and payslips, newest first', async () => {
  const d = await loadDashboard(ME, PRODUCTION());
  expect(d.person).toMatchObject({ name: 'Amara Okafor', position: 'Support Worker', employeeId: 'CP-1042', joinDate: '2022-02-14', city: 'London', postCode: 'N6 7QA' });
  expect(d.payslips.map(p => p.period)).toEqual(['July 2026', 'June 2026', 'May 2026', 'April 2026', 'March 2026', 'February 2026', 'January 2026', 'December 2025']);
  for (const p of d.payslips) expect((p.grossPay ?? 0) - (p.taxPaid ?? 0)).toBeGreaterThanOrEqual(p.netPay ?? 0);
});
