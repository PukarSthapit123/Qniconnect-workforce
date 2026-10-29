/* People & access's portal user calls on the wire (docs/superpowers/inventory/
   admin.md: USERS.C1 to C4), with everything QniConnect could have sent
   stored first, so a header the row does not list would show up. bcApi runs
   against a stubbed fetch. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { portalUserCreate, portalUsersList, portalUserUpdate } from '@/contract/bc/portal-users';
import { portalUserUpdateStatus } from '@/contract/bc/session';
import { adminInstance } from './admin';
import { createPortalUser, fetchPortalUsers, setPortalUserStatus, updatePortalUser } from './portal-users';

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
  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify(ENV));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E7');
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Dee@Contoso.com' }));
};
const BC = `Bearer ${signed('bc')}`;
const base = [['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', BC]];
const FORM = { name: '  <b>Ann</b> Lee ', email: '  Ann.Lee@Contoso.COM ', role: 'Admin', isAdmin: true };
const SENT = '{"name":"Ann Lee","email":"ann.lee@contoso.com","role":"Admin","isAdmin":true}';

beforeEach(() => {
  localStorage.clear();
  adminInstance.setEnvironment(null);
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { fetchSpy.mockRestore(); });

describe('USERS wire', () => {
  test('USERS.C1 wire: GET /bc/portalUsers, the shared instance\'s environment only after Set as default, and X-Registration-ID when stored', async () => {
    expect(portalUsersList.inventory).toBe('ADM.C1, USERS.C1');
    stored();
    answer({ value: [{ id: 'pu-1', name: 'Ann', email: 'a@b.c', status: 'Active' }] });
    const users = await fetchPortalUsers();
    expect(users.map(u => u.id)).toEqual(['pu-1']);
    expect(`${sent().init.method} ${sent().url}`).toBe(`GET ${BASE}/bc/portalUsers`);
    /* the session's environment is stored, but the shared instance holds none yet (ENV.R6d) */
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', 'REG-1']]);
    expect(sent().init).toMatchObject({ credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    adminInstance.setEnvironment('env-2');
    answer({});
    expect(await fetchPortalUsers()).toEqual([]);
    expect(Object.entries(sent(1).headers)).toEqual([...base, ['X-BC-Environment', 'env-2'], ['X-Registration-ID', 'REG-1']]);
    expect(tokenFn.mock.calls).toEqual([['bc'], ['bc']]);
  });

  test('USERS.C1 wire: nothing stored, nothing but the defaults and the token', async () => {
    answer({ value: [] });
    await fetchPortalUsers();
    expect(Object.entries(sent().headers)).toEqual(base);
  });

  test('USERS.C2 wire: POST /bc/portalUsers with the sanitised name and email (USERS.R7)', async () => {
    expect(portalUserCreate.inventory).toBe('USERS.C2');
    stored();
    adminInstance.setEnvironment('env-2');
    answer({ id: 'pu-9', name: 'Ann Lee' });
    expect(await createPortalUser(FORM)).toEqual({ id: 'pu-9', name: 'Ann Lee' });
    expect(`${sent().init.method} ${sent().url}`).toBe(`POST ${BASE}/bc/portalUsers`);
    expect(sent().init.body).toBe(SENT);
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-BC-Environment', 'env-2'], ['X-Registration-ID', 'REG-1']]);
    expect(sent().init).toMatchObject({ credentials: 'include' });
  });

  test('USERS.C3 wire: PATCH /bc/portalUsers/{id}, the id as given, X-Registration-ID even when blank and before X-BC-Environment (USERS.R17: it is PATCH)', async () => {
    expect(portalUserUpdate.inventory).toBe('USERS.C3');
    answer({ id: 'pu 1/x' });
    await updatePortalUser('pu 1/x', FORM);
    expect(`${sent().init.method} ${sent().url}`).toBe(`PATCH ${BASE}/bc/portalUsers/pu 1/x`);
    expect(sent().init.body).toBe(SENT);
    /* nothing stored: the header is still sent, as '' (BC:792) */
    expect(Object.entries(sent().headers)).toEqual([...base, ['X-Registration-ID', '']]);
    stored();
    adminInstance.setEnvironment('env-2');
    /* an empty answer is fine (`result || {}`, USERS.R12) */
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await updatePortalUser('pu-1', FORM)).toBeUndefined();
    expect(Object.entries(sent(1).headers)).toEqual([...base, ['X-Registration-ID', 'REG-1'], ['X-BC-Environment', 'env-2']]);
    expect(sent(1).init).toMatchObject({ credentials: 'include' });
  });

  test('USERS.C4 wire: POST /bc/portalUsers/{id}/updateStatus with only Content-Type and the token, no credentials (USERS.R18)', async () => {
    /* one endpoint, two inventory rows: the first-login overlay's and the users page's */
    expect(portalUserUpdateStatus.inventory).toBe('AUTH.C6, USERS.C4');
    stored();
    adminInstance.setEnvironment('env-2');
    answer({ success: true }, { headers: { 'X-Client-Company-ID': 'cmp-other' } });
    answer({ success: true });
    await setPortalUserStatus('pu-1', 'Active');
    await setPortalUserStatus('pu-1', 'Inactive');
    expect(`${sent().init.method} ${sent().url}`).toBe(`POST ${BASE}/bc/portalUsers/pu-1/updateStatus`);
    expect(sent().init.body).toBe('{"status":"Active"}');
    expect(sent(1).init.body).toBe('{"status":"Inactive"}');
    for (const i of [0, 1]) {
      expect(Object.entries(sent(i).headers)).toEqual([['Content-Type', 'application/json'], ['Authorization', BC]]);
      expect(sent(i).init).not.toHaveProperty('credentials');
    }
    expect(tokenFn.mock.calls).toEqual([['bc'], ['bc']]);
    /* the company header is not read on this path */
    expect(localStorage.getItem('clientCompanyId')).toBe('cmp-1');
  });

  test('BCS.R8 on USERS.C1 to C3: a company id the answer names is stored', async () => {
    for (const call of [() => fetchPortalUsers(), () => createPortalUser(FORM), () => updatePortalUser('pu-1', FORM)]) {
      localStorage.removeItem('clientCompanyId');
      answer({ value: [] }, { headers: { 'X-Client-Company-ID': 'cmp-9' } });
      await call();
      expect(localStorage.getItem('clientCompanyId')).toBe('cmp-9');
    }
  });

  test('BCS.R9 on USERS.C2: a refusal carries the backend\'s message (USERS.R11 shows it)', async () => {
    answer({ message: 'A portal user with this email address already exists.' }, { status: 409 });
    await expect(createPortalUser(FORM)).rejects.toMatchObject({ status: 409, message: 'A portal user with this email address already exists.' });
  });
});
