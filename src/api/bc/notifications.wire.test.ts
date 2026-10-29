/* The bell's Business Central calls on the wire (docs/superpowers/inventory/
   portal.md, BELL.C1 and BELL.C2), with everything QniConnect could have
   sent stored first, so a header or param the row does not list would show
   up. bcApi runs against a stubbed fetch. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';
import { notificationSeen, notificationsList } from '@/contract/bc/notifications';
import { bcApi, BcError } from './client';
import { bcContext } from './context';
import { fetchBcNotifications, markBcNotificationSeen, notificationsQuery, seenQuery } from './notifications';

const BASE = import.meta.env.REACT_APP_API_BASE_URL;
const signed = (kind: TokenKind) => `eyJhbGciOiJSUzI1NiJ9.${kind}.sig`;
const tokenFn = vi.fn<AuthAdapter['token']>();
const adapter: AuthAdapter = {
  init: async () => undefined, account: () => ({ oid: 'oid-ana', email: 'ana@contoso.com', name: 'Ana Silva' }), signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: tokenFn,
};

let fetchSpy: MockInstance<typeof fetch>;
const answer = (body: unknown, init: ResponseInit = {}) =>
  fetchSpy.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status: 200, ...init }));
const sent = (call = 0) => {
  const [url, init] = fetchSpy.mock.calls[call] ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
};
const stored = () => {
  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-1', name: 'Production Env', companyName: 'BrightPath Care Ltd' }));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E 7');
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Ana@Contoso.com' }));
};

beforeEach(() => {
  localStorage.clear();
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { fetchSpy.mockRestore(); });

describe('BELL wire', () => {
  test('BELL.C1 wire: GET /bc/notifications', async () => {
    stored(); answer([]);
    await bcApi(notificationsList, { query: notificationsQuery() });
    expect(notificationsList.inventory).toBe('BELL.C1');
    /* URLSearchParams, in the row's order; a space is + */
    expect(sent().url).toBe(`${BASE}/bc/notifications?registrationId=REG-1&clientEnvironment=Production+Env&clientCompanyId=cmp-1&employeeNo=E+7`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    /* no headers option: X-Registration-ID only through SHARED.R7 */
    expect(Object.entries(sent().headers)).toEqual([
      ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`], ['X-Registration-ID', 'REG-1'],
    ]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('BELL.C1 wire: a param with no value is left out, and X-Registration-ID is not sent when none is stored', async () => {
    localStorage.setItem('employeeNo', 'E-7');
    answer([]);
    await bcApi(notificationsList, { query: notificationsQuery() });
    expect(sent().url).toBe(`${BASE}/bc/notifications?employeeNo=E-7`);
    expect(sent().headers).not.toHaveProperty('X-Registration-ID');
  });

  test('BELL.C2 wire: PATCH /bc/notifications/{systemId}', async () => {
    stored(); answer({});
    await bcApi(notificationSeen, { params: { systemId: 'ab c/1' }, query: seenQuery(), body: { seen: true } });
    expect(notificationSeen.inventory).toBe('BELL.C2');
    /* the systemId is not encoded, and the query has no employeeNo */
    expect(sent().url).toBe(`${BASE}/bc/notifications/ab c/1?registrationId=REG-1&clientEnvironment=Production+Env&clientCompanyId=cmp-1`);
    expect(sent().init).toMatchObject({ method: 'PATCH', credentials: 'include', body: '{"seen":true}' });
    expect(Object.entries(sent().headers)).toEqual([
      ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`], ['X-Registration-ID', 'REG-1'],
    ]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('BELL.C2 wire: with nothing stored there is no query and no X-Registration-ID', async () => {
    answer(null);
    await bcApi(notificationSeen, { params: { systemId: 's1' }, query: seenQuery(), body: { seen: true } });
    expect(sent().url).toBe(`${BASE}/bc/notifications/s1`);
    expect(sent().headers).not.toHaveProperty('X-Registration-ID');
  });

  test('BELL.C1 and BELL.C2 store X-Client-Company-ID from any response (SHARED.R8), never send X-BC-Environment (SHARED.R6), and are registered', async () => {
    stored();
    for (const ep of [notificationsList, notificationSeen]) {
      expect(BC_ENDPOINTS).toContain(ep);
      expect(ep.headers as readonly string[]).not.toContain('X-BC-Environment');
    }
    answer({}, { status: 500, headers: { 'X-Client-Company-ID': 'cmp-c1' } });
    await expect(bcApi(notificationsList, { query: {} })).rejects.toBeInstanceOf(BcError);
    expect(bcContext.clientCompanyId()).toBe('cmp-c1');
    answer({}, { headers: { 'X-Client-Company-ID': 'cmp-c2' } });
    await bcApi(notificationSeen, { params: { systemId: 's' }, query: {}, body: { seen: true } });
    expect(bcContext.clientCompanyId()).toBe('cmp-c2');
  });
});

describe('BELL loading and marking', () => {
  test('BELL.R1: without a stored employeeNo nothing is asked and there are none', async () => {
    stored(); localStorage.removeItem('employeeNo');
    await expect(fetchBcNotifications()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('BELL.R1: with one, the list is what came back', async () => {
    stored();
    answer([{ systemId: 's1', message: 'Your payslip is ready', seen: false, createdDate: '2026-07-28', createdTime: '09:00:00' }]);
    await expect(fetchBcNotifications()).resolves.toEqual([{ systemId: 's1', message: 'Your payslip is ready', seen: false, createdDate: '2026-07-28', createdTime: '09:00:00' }]);
  });

  test('BELL error state: a failure, or an answer that is not a list, is no notifications', async () => {
    stored();
    answer({ message: 'down' }, { status: 500 });
    await expect(fetchBcNotifications()).resolves.toEqual([]);
    answer({ success: true, message: 'Mock data' });
    await expect(fetchBcNotifications()).resolves.toEqual([]);
    answer('not json', { headers: { 'Content-Type': 'text/plain' } });
    await expect(fetchBcNotifications()).resolves.toEqual([]);
  });

  test('BELL.R8: marking seen sends BELL.C2 and swallows its failure', async () => {
    stored();
    answer({ message: 'no' }, { status: 500 });
    await expect(markBcNotificationSeen('s1')).resolves.toBeUndefined();
    expect(sent().init.method).toBe('PATCH');
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(markBcNotificationSeen('s2')).resolves.toBeUndefined();
  });
});
