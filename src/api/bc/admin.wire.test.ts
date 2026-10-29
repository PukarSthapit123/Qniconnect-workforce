/* The admin pages' calls on the wire (docs/superpowers/inventory/admin.md:
   ADM.C1 to C4, ENV.C1 and C2, AUTHZ.C1 to C3, and the shared transport
   BCS), with everything QniConnect could have sent stored first, so a header
   or param the row does not list would show up. bcApi runs against a
   stubbed fetch. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';
import { adminEnvironmentsList, authRefresh, authStatus, authUrl, environmentCreate, portalRegistration } from '@/contract/bc/admin';
import { portalUsersList } from '@/contract/bc/portal-users';
import { BcError } from './client';
import { adminInstance, createAdminEnvironment, fetchAdminEnvironments, fetchAuthStatus, fetchAuthUrl, loadOverview, refreshAuthorization } from './admin';

const BASE = import.meta.env.REACT_APP_API_BASE_URL;
const signed = (kind: TokenKind) => `eyJhbGciOiJSUzI1NiJ9.${kind}.sig`;
const tokenFn = vi.fn<AuthAdapter['token']>();
const adapter: AuthAdapter = {
  init: async () => undefined, account: () => ({ oid: 'oid-dee', email: 'dee@contoso.com', name: 'Dee' }), signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: tokenFn,
};

let fetchSpy: MockInstance<typeof fetch>;
const answer = (body: unknown, init: ResponseInit = {}) =>
  fetchSpy.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status: 200, ...init }));
const sent = (call = 0) => {
  const [url, init] = fetchSpy.mock.calls[call] ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
};
const ENV = { id: 'env-1', name: 'Production Env', type: 'Production', companyName: 'BrightPath Care Ltd', company_Id: 'cmp-1' };
const stored = () => {
  localStorage.setItem('registrationId', 'REG 1&x');
  localStorage.setItem('activeEnvironment', JSON.stringify(ENV));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E7');
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Dee@Contoso.com' }));
};
const BC = `Bearer ${signed('bc')}`;
const base = [['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', BC]];

beforeEach(() => {
  localStorage.clear();
  adminInstance.setEnvironment(null);
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { fetchSpy.mockRestore(); });

describe('ADM wire (the overview, its own service instance)', () => {
  test('ADM.C1 wire: GET /bc/portalUsers, ADM.C2 wire: GET /bc/environments?$filter=, ADM.C3 wire: GET /auth/status, ADM.C4 wire: GET /bc/portalRegistrations, in that order', async () => {
    stored();
    answer({ value: [] }); answer({ value: [] }); answer({}); answer({});
    await loadOverview(ENV);
    expect([portalUsersList.inventory, adminEnvironmentsList.inventory, authStatus.inventory, portalRegistration.inventory])
      .toEqual(['ADM.C1, USERS.C1', 'ADM.C2, ENV.C1', 'ADM.C3, AUTHZ.C1', 'ADM.C4']);
    expect(fetchSpy.mock.calls.map((_, i) => `${sent(i).init.method} ${sent(i).url}`)).toEqual([
      `GET ${BASE}/bc/portalUsers`,
      /* no apostrophes, and only the id encoded (BC:1007): QniConnect's literal spaces are %20 once the URL is parsed, so the wire is the same */
      `GET ${BASE}/bc/environments?$filter=registrationId%20eq%20REG%201%26x`,
      `GET ${BASE}/auth/status?registrationId=REG%201%26x`,
      `GET ${BASE}/bc/portalRegistrations`,
    ]);
    for (let i = 0; i < 4; i++) {
      /* ADM.DASH.R2a: the overview's own instance holds the session's environment */
      expect(Object.entries(sent(i).headers), `call ${i}`).toEqual([...base, ['X-BC-Environment', 'env-1'], ['X-Registration-ID', 'REG 1&x']]);
      expect(sent(i).init).toMatchObject({ credentials: 'include' });
      expect(sent(i).init).not.toHaveProperty('body');
    }
    expect(tokenFn.mock.calls).toEqual([['bc'], ['bc'], ['bc'], ['bc']]);
    /* ADM.DASH.R2b is not reproduced (Ruling Q11): the stored environment keeps every field */
    expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toEqual(ENV);
  });

  test('ADM.C2 wire: no registration id, no filter; no environment, no X-BC-Environment; no X-Registration-ID when none is stored', async () => {
    answer({ value: [] }); answer({ value: [] }); answer({}); answer({});
    await loadOverview(null);
    expect(sent(1).url).toBe(`${BASE}/bc/environments`);
    expect(sent(2).url).toBe(`${BASE}/auth/status`);
    for (let i = 0; i < 4; i++) expect(Object.entries(sent(i).headers)).toEqual(base);
  });

  test('ADM.DASH.R3: a call that fails is logged and read as nothing; the next still runs', async () => {
    stored();
    fetchSpy.mockResolvedValueOnce(new Response('{"message":"down"}', { status: 500 }));
    answer({ value: [{ id: 'e1', environmentName: 'Sandbox' }] });
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchSpy.mockResolvedValueOnce(new Response('null', { status: 200 }));
    const data = await loadOverview(ENV);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(data.users).toEqual([]);
    expect(data.environments.map(e => e.name)).toEqual(['Sandbox']);
    expect(data.auth).toEqual({ status: null, expiresAt: null });
    /* ADM.C4's fallbacks: the environment's name and id */
    expect(data.tenant).toEqual({ name: 'Production Env', id: 'env-1', registrationDate: null });
  });
});

describe('ENV and AUTHZ wire (the pages\' shared service instance)', () => {
  test('ENV.C1 wire: GET /bc/environments?$filter=registrationId eq <id>, and X-BC-Environment only once "Set as default" has been used (ENV.R6d, BCS.R5)', async () => {
    stored();
    answer({ value: [{ id: 'env-1', name: 'Production' }] });
    await fetchAdminEnvironments();
    expect(sent().url).toBe(`${BASE}/bc/environments?$filter=registrationId%20eq%20REG%201%26x`);
    /* a stored environment is not this instance's (BCS.R12): not sent */
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', 'REG 1&x']]);
    adminInstance.setEnvironment('env-2');
    answer({ value: [] });
    await fetchAdminEnvironments();
    expect(Object.entries(sent(1).headers)).toEqual([...base, ['X-BC-Environment', 'env-2'], ['X-Registration-ID', 'REG 1&x']]);
  });

  test('ENV.C2 wire: POST /bc/environments with the form as typed', async () => {
    stored();
    adminInstance.setEnvironment('env-1');
    answer({ id: 'env-9', name: ' New ' });
    const env = await createAdminEnvironment({ name: ' New ', type: 'Sandbox', url: 'https://x', companyId: '', companyName: 'C ' });
    expect(environmentCreate.inventory).toBe('ENV.C2');
    expect(sent().url).toBe(`${BASE}/bc/environments`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"name":" New ","type":"Sandbox","url":"https://x","companyId":"","companyName":"C "}' });
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-BC-Environment', 'env-1'], ['X-Registration-ID', 'REG 1&x']]);
    expect(env).toMatchObject({ id: 'env-9', name: ' New ', type: 'Production', status: 'Active' });
  });

  test('AUTHZ.C1 wire: GET /auth/status?registrationId=', async () => {
    stored(); answer({ isAuthorized: true });
    await fetchAuthStatus();
    expect(sent().url).toBe(`${BASE}/auth/status?registrationId=REG%201%26x`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', 'REG 1&x']]);
  });

  test('AUTHZ.C2 wire: GET /auth/bc-auth-url?registrationId=, and the registration id it returns is stored (AUTHZ.R6)', async () => {
    stored(); answer({ authUrl: 'https://login.example/authorize?code_challenge=x', registrationId: 'REG-NEW' });
    expect(authUrl.inventory).toBe('AUTHZ.C2');
    await fetchAuthUrl();
    expect(sent().url).toBe(`${BASE}/auth/bc-auth-url?registrationId=REG%201%26x`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', 'REG 1&x']]);
    expect(localStorage.getItem('registrationId')).toBe('REG-NEW');
    /* none stored, none sent */
    localStorage.clear(); answer({ authUrl: 'https://x' });
    await fetchAuthUrl();
    expect(sent(1).url).toBe(`${BASE}/auth/bc-auth-url`);
    expect(localStorage.getItem('registrationId')).toBeNull();
  });

  test('AUTHZ.C3 wire: POST /auth/refresh with { registrationId }, or {} when none is stored', async () => {
    stored(); answer({ isAuthorized: true });
    await refreshAuthorization();
    expect(authRefresh.inventory).toBe('AUTHZ.C3');
    expect(sent().url).toBe(`${BASE}/auth/refresh`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"registrationId":"REG 1&x"}' });
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', 'REG 1&x']]);
    localStorage.clear(); answer({});
    await refreshAuthorization();
    expect(sent(1).init.body).toBe('{}');
    expect(Object.entries(sent(1).headers)).toEqual(base);
  });

  test('ENV.C3, ENV.C4 and AUTHZ.C4 are not sent by the admin pages: no activate, no storeTokens endpoint exists', () => {
    const calls = BC_ENDPOINTS.map(e => `${e.method} ${e.path}`);
    expect(calls).not.toContain('POST /bc/environments/activate');
    expect(calls).not.toContain('POST /bc/authorization/storeTokens');
    /* the company lookup is environment selection's and the dashboard's, never an admin row's */
    expect(BC_ENDPOINTS.filter(e => e.path === '/bc/client-tenant/companies').map(e => e.inventory)).not.toContain(expect.stringMatching(/ENV|ADM|AUTHZ/));
  });
});

describe('BCS: the shared transport', () => {
  test('BCS.R1, BCS.R4, BCS.R7: JSON headers, cookies included, the one base URL', async () => {
    answer({ value: [] });
    await fetchAdminEnvironments();
    expect(sent().url.startsWith(`${BASE}/bc/`)).toBe(true);
    expect(sent().headers['Content-Type']).toBe('application/json');
    expect(sent().headers.Accept).toBe('application/json');
    expect(sent().init.credentials).toBe('include');
  });
  test('BCS.R2: no token, or QniConnect\'s placeholder tokens, and nothing is sent', async () => {
    for (const token of [null, 'Not Readable', 'mock-token-for-development']) {
      tokenFn.mockResolvedValueOnce(token);
      await expect(fetchAuthStatus()).rejects.toThrow('Authentication failed. Please log in again.');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('BCS.R6: X-Registration-ID is read at call time', async () => {
    answer({}); await fetchAuthStatus();
    expect(sent().headers).not.toHaveProperty('X-Registration-ID');
    localStorage.setItem('registrationId', 'REG-2'); answer({});
    await fetchAuthStatus();
    expect(sent(1).headers['X-Registration-ID']).toBe('REG-2');
  });
  test('BCS.R8: X-Client-Company-ID on any answer, OK or not, is stored', async () => {
    answer({}, { headers: { 'X-Client-Company-ID': 'cmp-ok' } });
    await fetchAuthStatus();
    expect(localStorage.getItem('clientCompanyId')).toBe('cmp-ok');
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 500, headers: { 'X-Client-Company-ID': 'cmp-err' } }));
    await expect(fetchAuthStatus()).rejects.toBeInstanceOf(BcError);
    expect(localStorage.getItem('clientCompanyId')).toBe('cmp-err');
  });
  test('BCS.R9: a refusal says the body\'s message, else its error, else "API Error: <status>"', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"message":"Refresh token expired"}', { status: 400 }));
    await expect(refreshAuthorization()).rejects.toThrow('Refresh token expired');
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"bad"}', { status: 400 }));
    await expect(refreshAuthorization()).rejects.toThrow('bad');
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 502 }));
    await expect(refreshAuthorization()).rejects.toThrow('API Error: 502');
  });
  test('BCS.R10: an empty 2xx answer is unreadable, not a crash', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(refreshAuthorization()).rejects.toBeInstanceOf(BcError);
  });
  test('BCS.R11: no development fallback: a failure is a failure, in every mode', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(fetchAdminEnvironments()).rejects.toThrow('API Error: 500');
  });
  test('BCS.R12: the overview\'s instance and the pages\' instance hold their own environments', async () => {
    stored();
    adminInstance.setEnvironment('env-shared');
    answer({}); await fetchAuthStatus();
    answer({ value: [] }); answer({ value: [] }); answer({}); answer({});
    await loadOverview(ENV);
    expect(sent(0).headers['X-BC-Environment']).toBe('env-shared');
    expect(sent(1).headers['X-BC-Environment']).toBe('env-1');
  });
});
