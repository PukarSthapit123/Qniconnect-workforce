/* The profile page's data (docs/superpowers/inventory/portal.md, PROF.R1),
   and the bell being told when a page stores the employee number (BELL.R2,
   fixed under Ruling Q2), against the fake /bc server through the real
   bcApi and the auth stub. Amara Okafor (CP-1042) on the social seed. */
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
import { loadProfile, useBcProfile } from './profile';
import { loadDocuments } from './documents';
import type { PortalPerson } from './payroll';

const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
const PATH = new URL(BASE).pathname.replace(/\/$/, '');
const AMARA = 'amara.okafor@brightpath.org';
const ME: PortalPerson = { name: 'Amara from Microsoft', email: AMARA };
const PRODUCTION = (): BcEnvironment => {
  const e = bcStore.db.environments.find(x => x.name === 'Production');
  if (!e) throw new Error('no Production environment in the fake seed');
  return { id: e.id, name: e.name, companyName: e.companyName, company_Id: e.company_Id };
};

let seen: string[] = [];
const ls = (k: string) => localStorage.getItem(k);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  seen = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (u.href.startsWith(BASE)) seen.push(`${request.method} ${u.pathname.slice(PATH.length)}`);
  });
  localStorage.clear();
  bcStore.reset();
  setStubAccount(AMARA);
  localStorage.setItem('registrationId', REGISTRATION_ID);
  localStorage.setItem('currentUser', JSON.stringify({ email: AMARA, name: 'Amara' }));
  localStorage.setItem('activeEnvironment', JSON.stringify(PRODUCTION()));
});
afterEach(() => { server.events.removeAllListeners(); server.resetHandlers(); queryClient.clear(); });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

test('PROF.R1: one profile call (HOME.C2), with its storage: employeeNo, employeeId and employeeData', async () => {
  const profile = await loadProfile();
  expect(profile).toMatchObject({ employeeNo: 'CP-1042', firstName: 'Amara' });
  /* the profile call, then the session init it starts (HOME.R10); no companies, no payslips */
  expect(seen).toEqual(['GET /bc/employees/current', 'POST /session/init']);
  expect(ls('employeeNo')).toBe('CP-1042');
  expect(ls('employeeId')).toBe(profile.id);
  expect(JSON.parse(ls('employeeData') ?? '{}')).toMatchObject({ employeeNo: 'CP-1042', bankAccountName: 'Amara Okafor' });
});

test('PROF.R1: nothing is asked without a user or an environment, and a new environment asks again', async () => {
  const { result, rerender } = renderHook(({ user, env }) => useBcProfile(user, env), { wrapper, initialProps: { user: null as PortalPerson | null, env: PRODUCTION() as BcEnvironment | null } });
  await new Promise(r => setTimeout(r, 20));
  expect(result.current.fetchStatus).toBe('idle');
  rerender({ user: ME, env: null });
  await new Promise(r => setTimeout(r, 20));
  expect(seen).toEqual([]);
  rerender({ user: ME, env: PRODUCTION() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  rerender({ user: ME, env: { ...PRODUCTION(), id: 'env-sandbox-01', name: 'Sandbox' } });
  await waitFor(() => expect(seen.filter(s => s === 'GET /bc/employees/current')).toHaveLength(2));
});

test('PROF.R12: a profile that cannot be read is an error, and nothing is stored', async () => {
  server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  await expect(loadProfile()).rejects.toThrow('down');
  expect(ls('employeeId')).toBeNull();
});

test('BELL.R2 (fixed): the profile page and Documents tell the bell when they have stored the employee number, and not when there is none', async () => {
  const ready = vi.fn();
  const off = bcEvents.on('employee-no-ready', ready);
  try {
    await loadProfile();
    expect(ready).toHaveBeenCalledTimes(1);
    localStorage.removeItem('employeeNo');
    await loadDocuments();
    expect(ready).toHaveBeenCalledTimes(2);
    /* a profile with no number stores none, and the bell is not told */
    server.use(http.get(`${BASE}/bc/employees/current`, () => HttpResponse.json({ id: 'p-1', firstName: 'Amara' })));
    await loadProfile();
    await loadDocuments();
    expect(ready).toHaveBeenCalledTimes(2);
  } finally { off(); }
});
