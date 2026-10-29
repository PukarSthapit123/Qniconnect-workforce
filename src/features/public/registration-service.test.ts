/* REG.C2, REG.C3 and REG.R40 to R51: QniConnect's TenantVerificationService,
   inventoried with registration because the file sat beside it, but called
   only after sign-in, by environment selection. Ruling Q12 puts it with
   account setup (Task 15): these are the same calls as AUTH.C3 and AUTH.C4,
   made by src/api/bc/account-setup.ts and cleaned up by src/api/bc/cleanup.ts.
   Each rule is checked here against that code, under its REG id; the
   development-only mocks are not ported (Ruling Q13). */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter } from '@/auth';
import { environmentsList } from '@/contract/bc/environments';
import { portalUserVerifyAccess } from '@/contract/bc/session';
import { availableEnvironments, verifyUserAccess } from '@/api/bc/account-setup';
import { bcContext } from '@/api/bc/context';
import { cleanupSession } from '@/api/bc/cleanup';
import { logger } from '@/lib/logger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = import.meta.env.REACT_APP_API_BASE_URL;
const BC_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.bc.sig';
const tokenFn = vi.fn<AuthAdapter['token']>();
const adapter: AuthAdapter = {
  init: async () => undefined, account: () => ({ oid: 'oid-1', email: 'ana@contoso.com', name: 'Ana' }), signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: tokenFn,
};
let fetchSpy: MockInstance<typeof fetch>;
const answer = (body: unknown, status = 200) =>
  fetchSpy.mockResolvedValueOnce(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const sent = (call = 0) => {
  const [url, init] = fetchSpy.mock.calls[call] ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
};
const USER = { email: 'ana@contoso.com', oid: 'oid-1' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => (kind === 'bc' ? BC_TOKEN : 'login-token'));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => { fetchSpy.mockRestore(); vi.mocked(logger.error).mockRestore(); });

test('REG.C2 wire: POST /bc/portalUsers/verify', async () => {
  expect(portalUserVerifyAccess.inventory).toBe('AUTH.C3');
  answer({ exists: true, isActive: true });
  await verifyUserAccess(USER);
  expect(`${sent().init.method} ${sent().url}`).toBe(`POST ${BASE}/bc/portalUsers/verify`);
  expect(Object.entries(sent().headers)).toEqual([['Content-Type', 'application/json'], ['Authorization', `Bearer ${BC_TOKEN}`]]);
  expect(sent().init.body).toBe('{"email":"ana@contoso.com","userId":"oid-1"}');
  expect(sent().init).not.toHaveProperty('credentials');
  expect(tokenFn.mock.calls).toEqual([['bc']]);
});

test('REG.C3 wire: GET /bc/environments', async () => {
  expect(environmentsList.inventory).toBe('AUTH.C4');
  answer({ value: [] });
  await availableEnvironments();
  expect(`${sent().init.method} ${sent().url}`).toBe(`GET ${BASE}/bc/environments`);
  expect(Object.entries(sent().headers)).toEqual([['Authorization', `Bearer ${BC_TOKEN}`]]);
  expect(sent().init).not.toHaveProperty('body');
  bcContext.setRegistrationId("REG-1");
  answer({ value: [] });
  await availableEnvironments();
  expect(sent(1).url).toBe(`${BASE}/bc/environments?$filter=${encodeURIComponent("registrationId eq 'REG-1'")}`);
});

test('REG.R40 and REG.R41: one backend base (Ruling Q5), and a stored registration id is used from the start', async () => {
  const service = readFileSync(resolve(__dirname, '../../api/bc/client.ts'), 'utf8');
  expect(service).not.toMatch(/demo-backend-demo|azurewebsites/);
  bcContext.setRegistrationId('REG-7');
  answer({ value: [] });
  await availableEnvironments();
  expect(sent().url).toContain(encodeURIComponent("registrationId eq 'REG-7'"));
});

test('REG.R42: no token, or QniConnect\'s sentinel tokens, sends nothing and turns the account away', async () => {
  for (const t of [null, 'Not Readable', 'mock-token-for-development']) {
    tokenFn.mockImplementationOnce(async () => t);
    const r = await verifyUserAccess(USER);
    expect(r, String(t)).toMatchObject({ exists: false, isActive: false, requiresRedirect: true });
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('REG.R43 and REG.R44: a 404 cleans up and gives the not-found message; a 404 that is not JSON gives it too', async () => {
  localStorage.setItem('isAuthenticated', 'true');
  answer({ message: 'No portal user with that email' }, 404);
  expect(await verifyUserAccess(USER)).toEqual({ exists: false, isActive: false, message: 'No portal user with that email', requiresRedirect: true });
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
  answer('<html>Not Found</html>', 404);
  expect((await verifyUserAccess(USER)).message).toBe('User not found in Business Central Portal');
});

test('REG.R45: any other refusal cleans up and turns the account away with its message, or QniConnect\'s', async () => {
  localStorage.setItem('activeEnvironment', '{"id":"e"}');
  answer({ message: 'Portal disabled', shouldCleanup: true }, 403);
  expect(await verifyUserAccess(USER)).toMatchObject({ exists: false, message: 'Portal disabled', requiresRedirect: true });
  expect(localStorage.getItem('activeEnvironment')).toBeNull();
  answer({}, 500);
  expect((await verifyUserAccess(USER)).message).toBe('Failed to verify user access');
});

test('REG.R46: an inactive or missing account cleans up; an active one keeps its registration id', async () => {
  localStorage.setItem('isAuthenticated', 'true');
  answer({ exists: true, isActive: false });
  expect(await verifyUserAccess(USER)).toMatchObject({ requiresRedirect: true });
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
  answer({ exists: true, isActive: true, userData: { registrationId: 'REG-9' } });
  expect(await verifyUserAccess(USER)).toMatchObject({ exists: true, isActive: true, requiresRedirect: false });
  expect(localStorage.getItem('registrationId')).toBe('REG-9');
});

test('REG.R47: a failure in development is a failure too: no mock success, no mock registration id (Ruling Q13)', async () => {
  fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await verifyUserAccess(USER)).toEqual({ exists: false, isActive: false, message: 'Failed to fetch', requiresRedirect: true });
  expect(localStorage.getItem('registrationId')).toBeNull();
});

test('REG.R48: the environments, mapped through QniConnect\'s fallbacks; a failure is an empty list, never the development mocks', async () => {
  answer({ environments: [{ environmentId: 'e1', environmentName: 'Live', company_Name: 'C', companyId: 'g' }, { id: 'e2', name: 'Test', type: 'Sandbox' }] });
  expect(await availableEnvironments()).toEqual([
    { id: 'e1', name: 'Live', type: 'Production', url: '', status: 'Active', companyName: 'C', company_Id: 'g' },
    { id: 'e2', name: 'Test', type: 'Sandbox', url: '', status: 'Active', companyName: '', company_Id: '' },
  ]);
  answer({ message: 'nope' }, 500);
  expect(await availableEnvironments()).toEqual([]);
  fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await availableEnvironments()).toEqual([]);
});

test('REG.R49: choosing an environment stores it under activeEnvironment, with its id and name, and calls nothing', () => {
  bcContext.setEnvironment({ id: 'env-1', name: 'Production' });
  expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toMatchObject({ id: 'env-1', name: 'Production' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('REG.R50 and REG.R51: the clean-up removes the nine keys, the MSAL, token and auth session keys and the auth cookies, but not employeeData', () => {
  const nine = ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'employeeNo', 'employeeId', 'clientCompanyId', 'clientCompanyName', 'clientCompanies'];
  for (const k of [...nine, 'employeeData', 'theme']) localStorage.setItem(k, 'v');
  for (const k of ['msal.account.keys', 'a-token-b', 'xauthx', 'keep']) sessionStorage.setItem(k, 'v');
  document.cookie = 'msal.state=1; path=/';
  document.cookie = 'mysession=1; path=/';
  document.cookie = 'plain=1; path=/';
  cleanupSession();
  for (const k of nine) expect(localStorage.getItem(k), k).toBeNull();
  expect(localStorage.getItem('employeeData')).toBe('v');
  expect(localStorage.getItem('theme')).toBe('v');
  expect(Object.keys({ ...sessionStorage })).toEqual(['keep']);
  expect(document.cookie).toBe('plain=1');
  document.cookie = 'plain=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
});
