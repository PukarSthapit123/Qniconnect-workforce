/* Documents' load (docs/superpowers/inventory/portal.md, DOCS.R1 to DOCS.R6,
   DOCS.R11), against the fake /bc server through the real bcApi and the auth
   stub: what is called, in what order, and what the page is given. Amara
   Okafor (CP-1042) on the social seed, who has a P11D. */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { bcStore, REGISTRATION_ID } from '@/mocks/bc/seed';
import { queryClient } from '@/api/query';
import { setStubAccount } from '@/test/api-helpers';
import type { BcEnvironment } from './context';
import type { PortalPerson } from './payroll';
import { employeeGuid, loadDocuments, useDocuments } from './documents';

const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
const AMARA = 'amara.okafor@brightpath.org';
const ME: PortalPerson = { name: 'Amara', email: AMARA };
const PRODUCTION = (): BcEnvironment => {
  const e = bcStore.db.environments.find(x => x.name === 'Production');
  if (!e) throw new Error('no Production environment in the fake seed');
  return { id: e.id, name: e.name, companyName: e.companyName, company_Id: e.company_Id };
};

let seen: string[] = [];
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  seen = [];
  bcStore.reset();
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (u.href.startsWith(BASE)) seen.push(`${request.method} ${u.pathname.slice(new URL(BASE).pathname.replace(/\/$/, '').length)}`);
  });
  localStorage.clear();
  setStubAccount(AMARA);
  localStorage.setItem('registrationId', REGISTRATION_ID);
  localStorage.setItem('currentUser', JSON.stringify({ email: AMARA, name: 'Amara' }));
  localStorage.setItem('activeEnvironment', JSON.stringify(PRODUCTION()));
  localStorage.setItem('clientCompanyId', PRODUCTION().company_Id as string);
  localStorage.setItem('employeeNo', 'CP-1042');
});
afterEach(() => { server.events.removeAllListeners(); server.resetHandlers(); queryClient.clear(); });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

test('DOCS.R1: payslips, then the fiscal years, then the profile; again when the environment changes; nothing without one', async () => {
  const { result, rerender } = renderHook(({ env }) => useDocuments(ME, env), { wrapper, initialProps: { env: PRODUCTION() as BcEnvironment | null } });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  /* the profile stores the employee number, so it starts the session (HOME.C5) after it */
  expect(seen).toEqual(['GET /bc/payslips', 'GET /bc/fiscalyears', 'GET /bc/employees/current', 'POST /session/init']);
  seen = [];
  rerender({ env: { ...PRODUCTION(), id: 'env-sandbox-01', name: 'Sandbox' } });
  await waitFor(() => expect(seen).toContain('GET /bc/employees/current'));
  seen = [];
  const none = renderHook(() => useDocuments(ME, null), { wrapper });
  await new Promise(r => setTimeout(r, 20));
  expect(none.result.current.fetchStatus).toBe('idle');
  expect(seen).toEqual([]);
});

test('DOCS.R1: with no employee number stored yet, the profile, which stores it, is read first, so the payslips are found (Ruling Q2)', async () => {
  localStorage.removeItem('employeeNo');
  const d = await loadDocuments();
  expect(seen).toEqual(['GET /bc/employees/current', 'POST /session/init', 'GET /bc/payslips', 'GET /bc/fiscalyears']);
  expect(d.payslips).toHaveLength(8);
  expect(d.taxDocuments.map(t => t.type)).toEqual(['P60', 'P11D', 'P45']);
});

test('DOCS.R1: a fiscal years failure never stops the payslips', async () => {
  server.use(http.get(`${BASE}/bc/fiscalyears`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  const d = await loadDocuments();
  expect(d.payslips).toHaveLength(8);
  expect(d.taxDocuments.length).toBeGreaterThan(0);
});

test('DOCS.R2: the API\'s years, in its order, when it sends any', async () => {
  const d = await loadDocuments();
  expect(d.years.map(y => y.fiscalYear)).toEqual(['2026/2027', '2025/2026', '2024/2025', '2023/2024', '2022/2023']);
  expect(d.years[0]?.active).toBe(true);
});

test('DOCS.R2: no years from the API, a failure or a list that is not a list falls back to the payslips\' years', async () => {
  for (const reply of [HttpResponse.json([]), HttpResponse.json({ message: 'down' }, { status: 500 }), HttpResponse.json({ value: [] })]) {
    server.use(http.get(`${BASE}/bc/fiscalyears`, () => reply.clone()));
    const d = await loadDocuments();
    expect(d.years).toEqual([{ fiscalYear: '2026/2027', active: false }, { fiscalYear: '2025/2026', active: false }]);
    server.resetHandlers();
  }
});

test('DOCS.R4: the first pick is the active year, else the first; none with no years', async () => {
  expect((await loadDocuments()).firstYear).toBe('2026/2027');
  bcStore.db.fiscalYears = bcStore.db.fiscalYears.map(y => ({ ...y, active: false }));
  bcStore.db.fiscalYears.reverse();
  expect((await loadDocuments()).firstYear).toBe('2022/2023');
  bcStore.db.fiscalYears = [];
  server.use(http.get(`${BASE}/bc/payslips`, () => HttpResponse.json([])));
  const d = await loadDocuments();
  expect(d.years).toEqual([]);
  expect(d.firstYear).toBeNull();
});

test('DOCS.R6: P60, P11D when the profile says so, and P45 (Ruling Q4)', async () => {
  expect((await loadDocuments()).taxDocuments.map(t => t.type)).toEqual(['P60', 'P11D', 'P45']);
  const amara = bcStore.db.profiles.find(p => p.employeeNo === 'CP-1042');
  if (amara) amara.validP11D = false;
  const d = await loadDocuments();
  expect(d.taxDocuments.map(t => t.type)).toEqual(['P60', 'P45']);
  expect(d.taxDocuments.map(t => t.description)).toEqual(['End of year certificate', 'Details of employee leaving work']);
});

test('DOCS.R6: a profile that fails leaves the payslips and the years, and no tax documents', async () => {
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  const d = await loadDocuments();
  expect(d.payslips).toHaveLength(8);
  expect(d.years).toHaveLength(5);
  expect(d.taxDocuments).toEqual([]);
  expect(d.profileFailed).toBe(true);
});

test('DOCS.R11: the employee GUID is the stored profile\'s id, else the stored employeeId; a profile that is not JSON reads as none (Ruling Q2)', async () => {
  expect(employeeGuid()).toBe('');
  localStorage.setItem('employeeId', 'guid-stored');
  expect(employeeGuid()).toBe('guid-stored');
  localStorage.setItem('employeeData', '{not json');
  expect(employeeGuid()).toBe('guid-stored');
  localStorage.setItem('employeeData', JSON.stringify({ id: 'guid-profile' }));
  expect(employeeGuid()).toBe('guid-profile');
  /* and the profile load stores them */
  localStorage.clear();
  localStorage.setItem('registrationId', REGISTRATION_ID);
  localStorage.setItem('currentUser', JSON.stringify({ email: AMARA }));
  localStorage.setItem('activeEnvironment', JSON.stringify(PRODUCTION()));
  await loadDocuments();
  expect(employeeGuid()).toBe(bcStore.db.profiles.find(p => p.employeeNo === 'CP-1042')?.id);
});
