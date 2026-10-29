/* bcApi against a stubbed fetch: what it puts on the wire for each endpoint
   must be exactly what the auth inventory's row records for QniConnect
   (docs/superpowers/inventory/auth.md), and its errors QniConnect's wording. */
import type { MockInstance } from 'vitest';
import { z } from 'zod';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { lenient, type BcEndpoint } from '@/contract/bc/endpoints';
import { portalUserUpdateStatus, portalUserVerify, portalUserVerifyAccess, sessionInit } from '@/contract/bc/session';
import { clientTenantCompanies, clientTenantCompaniesSetup, environmentsList, registrationFilter } from '@/contract/bc/environments';
import { bcApi, BcError } from './client';
import { bcContext } from './context';
import { bcEvents } from './events';

const BASE = import.meta.env.REACT_APP_API_BASE_URL;
const ANA = { oid: 'oid-ana', email: 'ana@contoso.com', name: 'Ana Silva' };

/* A signed JWT shape (alg RS256) whose payload is irrelevant to the client. */
const signed = (kind: TokenKind) => `eyJhbGciOiJSUzI1NiJ9.${kind}.sig`;
const tokenFn = vi.fn<AuthAdapter['token']>();
const adapter: AuthAdapter = {
  init: async () => undefined, account: () => ANA, signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: tokenFn,
};

let fetchSpy: MockInstance<typeof fetch>;
const answer = (body: unknown, init: ResponseInit = {}) =>
  fetchSpy.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status: 200, ...init }));
const sent = (call = 0) => {
  const [url, init] = fetchSpy.mock.calls[call] ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
};

beforeEach(() => {
  /* each test starts with nothing stored, as before sign-in */
  localStorage.clear();
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { fetchSpy.mockRestore(); vi.unstubAllEnvs(); });

const plain = { method: 'GET', path: '/bc/things', summary: 'test', inventory: 'TEST', token: 'none', credentials: 'include',
  literalHeaders: [], headers: [], response: lenient({ message: z.string().optional() }) } as const satisfies BcEndpoint;

test("sends the inventory headers with QC's '' defaults", async () => {
  const payslipsLike = { ...plain, token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
    headers: ['X-Registration-ID', 'X-Client-Environment', 'X-Client-Company-ID', 'X-Employee-No', 'X-User-Email'] } as const satisfies BcEndpoint;
  answer({});
  await bcApi(payslipsLike);
  /* nothing stored: every listed header still goes, as '' (QC's `|| ''`) */
  expect(sent().headers).toEqual({
    'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${signed('bc')}`,
    'X-Registration-ID': '', 'X-Client-Environment': '', 'X-Client-Company-ID': '', 'X-Employee-No': '', 'X-User-Email': '',
  });

  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-1', name: 'Production' }));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E-7');
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Ana@Contoso.com' }));
  answer({});
  await bcApi(payslipsLike);
  expect(Object.entries(sent(1).headers)).toEqual([
    ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`],
    ['X-Registration-ID', 'REG-1'], ['X-Client-Environment', 'Production'], ['X-Client-Company-ID', 'cmp-1'],
    ['X-Employee-No', 'E-7'], ['X-User-Email', 'ana@contoso.com'],
  ]);
});

test('AUTH.C1 sends X-Registration-ID only when one is stored, and never X-BC-Environment', async () => {
  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-1', name: 'Production' }));
  answer({ exists: true });
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(sent().url).toBe(`${BASE}/bc/portalUsers/verify`);
  expect(sent().init.method).toBe('POST');
  expect(sent().init.body).toBe(JSON.stringify({ email: ANA.email, userId: ANA.oid }));
  expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${signed('login')}` });

  localStorage.setItem('registrationId', 'REG-1');
  answer({ exists: true });
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(sent(1).headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${signed('login')}`, 'X-Registration-ID': 'REG-1' });
});

test('AUTH.C4 sends Authorization alone, and its $filter with the apostrophes inside the encoded value', async () => {
  localStorage.setItem('registrationId', 'REG-1');
  answer({ value: [] });
  await bcApi(environmentsList, { query: { $filter: "registrationId eq 'REG 1'" } });
  expect(sent().url).toBe(`${BASE}/bc/environments?$filter=${encodeURIComponent("registrationId eq 'REG 1'")}`);
  expect(sent().headers).toEqual({ Authorization: `Bearer ${signed('bc')}` });
  answer({ value: [] });
  await bcApi(environmentsList);
  expect(sent(1).url).toBe(`${BASE}/bc/environments`);
});

test('adds Authorization only for token bc/login', async () => {
  answer({});
  await bcApi(sessionInit, { body: { registrationId: '', userEmail: '', employeeNo: '' } });
  expect(tokenFn).not.toHaveBeenCalled();
  expect(sent().headers).toEqual({ 'Content-Type': 'application/json' });

  answer({});
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(tokenFn).toHaveBeenLastCalledWith('login');
  answer({});
  await bcApi(portalUserVerifyAccess, { body: { email: ANA.email, userId: ANA.oid } });
  expect(tokenFn).toHaveBeenLastCalledWith('bc');
  expect(sent(2).headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${signed('bc')}` });
});

test('includes credentials', async () => {
  answer({});
  await bcApi(sessionInit, { body: { registrationId: '', userEmail: '', employeeNo: '' } });
  expect(sent().init.credentials).toBe('include');
  answer({});
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(sent(1).init.credentials).toBe('include');
  /* QC's TenantVerificationService set no credentials option (AUTH.C3, AUTH.C4) */
  answer({});
  await bcApi(portalUserVerifyAccess, { body: { email: ANA.email, userId: ANA.oid } });
  expect(sent(2).init).not.toHaveProperty('credentials');
});

test('401 emits auth-required', async () => {
  const heard = vi.fn();
  const off = bcEvents.on('auth-required', heard);
  answer({ message: 'Session expired' }, { status: 401 });
  await expect(bcApi(sessionInit, { body: { registrationId: '', userEmail: '', employeeNo: '' } }))
    .rejects.toMatchObject({ status: 401, message: 'Session expired', data: { message: 'Session expired' } });
  expect(heard).toHaveBeenCalledTimes(1);
  off();
  answer({}, { status: 500 });
  await expect(bcApi(plain)).rejects.toBeInstanceOf(BcError);
  expect(heard).toHaveBeenCalledTimes(1);
});

test('stores X-Client-Company-ID from the response', async () => {
  answer({}, { headers: { 'X-Client-Company-ID': 'cmp-9' } });
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(bcContext.clientCompanyId()).toBe('cmp-9');
  /* on a refusal too, before the status is looked at (AUTH.R11) */
  answer({}, { status: 404, headers: { 'X-Client-Company-ID': 'cmp-10' } });
  await expect(bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } })).rejects.toMatchObject({ status: 404 });
  expect(bcContext.clientCompanyId()).toBe('cmp-10');
  /* an empty header leaves the stored one */
  answer({}, { headers: { 'X-Client-Company-ID': '' } });
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(bcContext.clientCompanyId()).toBe('cmp-10');
});

test('error message falls back to API Error: <status>', async () => {
  answer({ message: 'User not found' }, { status: 404 });
  await expect(bcApi(plain)).rejects.toMatchObject({ status: 404, message: 'User not found' });
  answer({ error: 'Bad gateway' }, { status: 502 });
  await expect(bcApi(plain)).rejects.toMatchObject({ status: 502, message: 'Bad gateway' });
  fetchSpy.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 503 }));
  await expect(bcApi(plain)).rejects.toMatchObject({ status: 503, message: 'API Error: 503', data: {} });
});

/* AUTH.R57 reads a refusal's raw text when it is not JSON. */
test('a refusal keeps its raw body text', async () => {
  fetchSpy.mockResolvedValueOnce(new Response('No HTTP resource was found that matches the request', { status: 404 }));
  await expect(bcApi(plain)).rejects.toMatchObject({ status: 404, data: {}, text: 'No HTTP resource was found that matches the request' });
  answer({ message: 'nope' }, { status: 400 });
  await expect(bcApi(plain)).rejects.toMatchObject({ status: 400, data: { message: 'nope' }, text: JSON.stringify({ message: 'nope' }) });
});

test('a response its schema cannot read is refused, an unknown field is not', async () => {
  answer({ message: 'hello', extra: { nested: true } });
  await expect(bcApi(plain)).resolves.toEqual({ message: 'hello', extra: { nested: true } });
  answer({ message: 42 });
  await expect(bcApi(plain)).rejects.toBeInstanceOf(BcError);
});

test('InteractionRequiredAuthError from the token propagates after the redirect', async () => {
  const redirect = vi.fn();
  const error = new InteractionRequiredAuthError('interaction_required');
  tokenFn.mockImplementation(async () => { redirect(); throw error; });
  const heard = vi.fn();
  const off = bcEvents.on('auth-required', heard);
  await expect(bcApi(portalUserVerifyAccess, { body: { email: ANA.email, userId: ANA.oid } })).rejects.toBe(error);
  off();
  expect(redirect).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(heard).not.toHaveBeenCalled();
});

test("no token, or QC's sentinel tokens, never reach the network (AUTH.R7)", async () => {
  for (const t of [null, '', 'Not Readable', 'mock-token-for-development']) {
    tokenFn.mockResolvedValueOnce(t);
    await expect(bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } })).rejects.toThrow('Authentication failed. Please log in again.');
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('an unsigned (alg none) token is refused when the fake /bc is off, and sent when it is on', async () => {
  const unsigned = `${btoa('{"alg":"none"}').replace(/=+$/, '')}.${btoa('{"email":"ana@contoso.com"}').replace(/=+$/, '')}.`;
  tokenFn.mockResolvedValue(unsigned);
  vi.stubEnv('VITE_FAKE_BC', 'off');
  await expect(bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } })).rejects.toThrow(/unsigned/i);
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.stubEnv('VITE_FAKE_BC', 'on');
  answer({});
  await bcApi(portalUserVerify, { body: { email: ANA.email, userId: ANA.oid } });
  expect(sent().headers.Authorization).toBe(`Bearer ${unsigned}`);
});

test('a missing REACT_APP_API_BASE_URL fails loudly, before anything is sent', async () => {
  vi.stubEnv('REACT_APP_API_BASE_URL', '');
  await expect(bcApi(plain)).rejects.toThrow(/REACT_APP_API_BASE_URL/);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a blob endpoint answers a Blob', async () => {
  const pdf = { ...plain, responseType: 'blob' } as const satisfies BcEndpoint;
  /* a text body: undici's Response cannot read jsdom's Blob as a body */
  fetchSpy.mockResolvedValueOnce(new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
  const blob = await bcApi(pdf);
  expect(blob).toBeInstanceOf(Blob);
  expect(await (blob as Blob).text()).toBe('%PDF-1.4');
});

/* One wire test per AUTH call row this task defines (phase 5 method, step 2):
   method, URL with query, every header and its value, the token's audience,
   the body and the credentials, exactly as the auth inventory records them.
   Everything QniConnect could have sent is stored first, so a header the row
   does not list would show up. */
describe('AUTH wire', () => {
  const stored = () => {
    localStorage.setItem('registrationId', 'REG-1');
    localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-1', name: 'Production' }));
    localStorage.setItem('clientCompanyId', 'cmp-1');
    localStorage.setItem('employeeNo', 'E-7');
    localStorage.setItem('currentUser', JSON.stringify({ email: ANA.email }));
  };
  const who = { email: ANA.email, userId: ANA.oid };
  const companyBody = { environmentName: 'Production', registrationId: 'REG-1' };

  test('AUTH.C1 wire: POST /bc/portalUsers/verify', async () => {
    stored(); answer({ exists: true });
    await bcApi(portalUserVerify, { body: who });
    expect(sent().url).toBe(`${BASE}/bc/portalUsers/verify`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(who) });
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: `Bearer ${signed('login')}`, 'X-Registration-ID': 'REG-1' });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('login');
  });

  test('AUTH.C2 wire: POST /session/init', async () => {
    stored(); answer({});
    const body = { registrationId: 'REG-1', userEmail: ANA.email, employeeNo: '' };
    await bcApi(sessionInit, { body });
    expect(sent().url).toBe(`${BASE}/session/init`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(body) });
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json' });
    expect(tokenFn).not.toHaveBeenCalled();
  });

  test('AUTH.C3 wire: POST /bc/portalUsers/verify', async () => {
    stored(); answer({ exists: true, isActive: true });
    await bcApi(portalUserVerifyAccess, { body: who });
    expect(sent().url).toBe(`${BASE}/bc/portalUsers/verify`);
    expect(sent().init).toMatchObject({ method: 'POST', body: JSON.stringify(who) });
    expect(sent().init).not.toHaveProperty('credentials');
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${signed('bc')}` });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('AUTH.C6 wire: POST /bc/portalUsers/{userId}/updateStatus', async () => {
    stored(); answer({ success: true });
    await bcApi(portalUserUpdateStatus, { params: { userId: 'pu-CP-1503' }, body: { status: 'Active' } });
    /* the id goes in as given, not URL-encoded; QniConnect's comment says PATCH, the method is POST */
    expect(sent().url).toBe(`${BASE}/bc/portalUsers/pu-CP-1503/updateStatus`);
    expect(sent().init).toMatchObject({ method: 'POST', body: JSON.stringify({ status: 'Active' }) });
    expect(sent().init).not.toHaveProperty('credentials');
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${signed('bc')}` });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('AUTH.C4 wire: GET /bc/environments', async () => {
    stored(); answer({ value: [] });
    await bcApi(environmentsList, { query: { $filter: registrationFilter('REG-1') } });
    expect(sent().url).toBe(`${BASE}/bc/environments?$filter=registrationId%20eq%20'REG-1'`);
    expect(sent().init).toMatchObject({ method: 'GET' });
    expect(sent().init).not.toHaveProperty('credentials');
    expect(sent().init).not.toHaveProperty('body');
    expect(sent().headers).toEqual({ Authorization: `Bearer ${signed('bc')}` });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('AUTH.C5 wire: POST /bc/client-tenant/companies', async () => {
    stored(); answer({ updateResult: { success: true } });
    await bcApi(clientTenantCompaniesSetup, { body: companyBody });
    expect(sent().url).toBe(`${BASE}/bc/client-tenant/companies`);
    expect(sent().init).toMatchObject({ method: 'POST', body: JSON.stringify(companyBody) });
    expect(sent().init).not.toHaveProperty('credentials');
    /* getAccessToken() with no scopes: the login token, not bc */
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${signed('login')}` });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('login');
  });

  test('AUTH.C9 wire: POST /bc/client-tenant/companies', async () => {
    stored(); answer({ value: [] });
    await bcApi(clientTenantCompanies, { body: companyBody });
    expect(sent().url).toBe(`${BASE}/bc/client-tenant/companies`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(companyBody) });
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: `Bearer ${signed('bc')}`, 'X-Registration-ID': 'REG-1' });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });
});
