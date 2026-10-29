/* Registration's one call on the wire (docs/superpowers/inventory/public.md,
   REG.C1), with everything QniConnect could have sent stored first, so a
   header the row does not list would show up. bcApi runs against a stubbed
   fetch. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter } from '@/auth';
import { portalRegistrationSubmit } from '@/contract/bc/registration';
import { INITIAL_REGISTRATION, type RegistrationForm } from '@/domain/registration';
import { bcEvents } from './events';
import { submitRegistration } from './registration';

const BASE = import.meta.env.REACT_APP_API_BASE_URL;
const tokenFn = vi.fn<AuthAdapter['token']>(async () => 'eyJhbGciOiJSUzI1NiJ9.x.sig');
const adapter: AuthAdapter = {
  init: async () => undefined, account: () => ({ oid: 'oid-1', email: 'a@b.c', name: 'A' }), signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: tokenFn,
};
let fetchSpy: MockInstance<typeof fetch>;
const answer = (body: string | null, init: ResponseInit = {}) => fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200, ...init }));
const sent = () => {
  const [url, init] = fetchSpy.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
};
const FORM: RegistrationForm = { ...INITIAL_REGISTRATION, companyName: 'Acme Ltd', companyEmail: 'info@acme.test', tenantId: 't-1', domainName: 'acme.onmicrosoft.com',
  bcEnvironment: 'Production', bcCompanyName: 'CRONUS UK Ltd.', numberOfEmployees: '25', contactName: 'Jo Smith', contactEmail: 'jo@acme.test',
  agreeTerms: true, agreeDataProcessing: true };

beforeEach(() => {
  localStorage.clear();
  /* everything a context header could carry */
  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-1', name: 'Production' }));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E7');
  setAuth(adapter);
  tokenFn.mockClear();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { fetchSpy.mockRestore(); });

test('REG.C1 wire: POST /bc/portalRegistrations', async () => {
  expect(portalRegistrationSubmit.inventory).toBe('REG.C1');
  answer(JSON.stringify({ id: 'REG-9' }), { status: 201 });
  expect(await submitRegistration(FORM)).toEqual({ ok: true });
  expect(`${sent().init.method} ${sent().url}`).toBe(`POST ${BASE}/bc/portalRegistrations`);
  /* REG.R19: Content-Type only, no Authorization, no credentials option */
  expect(Object.entries(sent().headers)).toEqual([['Content-Type', 'application/json']]);
  expect(sent().init).not.toHaveProperty('credentials');
  expect(tokenFn).not.toHaveBeenCalled();
  expect(JSON.parse(String(sent().init.body))).toEqual({
    company_Name: 'Acme Ltd', contactEmail: 'jo@acme.test', contactName: 'Jo Smith', tenantId: 't-1', primaryEnvironment: 'Production',
    primaryCompanyName: 'CRONUS UK Ltd.', numberOfEmployees: 25, industry: '', registrationSource: 'Portal', vatRegistrationNo: '',
    companyRegistrationNo: '', primaryContactLanguage: 'EN', address: '', city: '', county: '', postCode: '', countryRegionCode: '' });
});

test('REG.R19: no token is asked for, even with nobody signed in', async () => {
  setAuth({ ...adapter, account: () => null, token: async () => null });
  answer('{}');
  expect(await submitRegistration(FORM)).toEqual({ ok: true });
  expect(sent().headers).not.toHaveProperty('Authorization');
});

test('REG.R22: any OK answer is success, whatever its body (none, text, JSON)', async () => {
  for (const body of [null, 'Created', '{"surprise":true}', '[]']) {
    answer(body);
    expect(await submitRegistration(FORM), String(body)).toEqual({ ok: true });
  }
});

test('REG.R20 and R21: a refusal shows its own words, from JSON or from text', async () => {
  answer(JSON.stringify({ error: 'Tenant ID not recognised' }), { status: 400 });
  expect(await submitRegistration(FORM)).toEqual({ ok: false, message: 'Tenant ID not recognised' });
  fetchSpy.mockClear();
  answer('Service Unavailable', { status: 503 });
  expect(await submitRegistration(FORM)).toEqual({ ok: false, message: 'Service Unavailable' });
});

test('REG.R28: a network failure shows the browser\'s own message', async () => {
  fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await submitRegistration(FORM)).toEqual({ ok: false, message: 'Failed to fetch' });
});

test('REG.R10: a 401 on this public call is the page\'s error, never a sign-in redirect', async () => {
  const heard = vi.fn();
  const off = bcEvents.on('auth-required', heard);
  answer(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
  expect(await submitRegistration(FORM)).toEqual({ ok: false, message: 'Unauthorized' });
  expect(heard).not.toHaveBeenCalled();
  off();
});
