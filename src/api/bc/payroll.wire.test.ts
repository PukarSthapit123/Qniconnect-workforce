/* The portal dashboard's calls on the wire (docs/superpowers/inventory/portal.md):
   one wire test per HOME call row, and one test per SHARED transport rule
   (fetchThroughBackend, which every one of them but HOME.C5 went through).
   bcApi runs against a stubbed fetch, with everything QniConnect could have
   sent stored first, so a header the row does not list would show up. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';
import { clientTenantCompanies } from '@/contract/bc/environments';
import { sessionInit } from '@/contract/bc/session';
import { employeeCurrent, payslipPdf, payslipsList } from '@/contract/bc/payroll';
import { logger } from '@/lib/logger';
import { bcApi, BcError } from './client';
import { bcContext } from './context';
import { bcEvents } from './events';
import { fetchEmployeeProfile, fetchPayslipPdf, fetchPayslips, profileQuery } from './payroll';

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
const NOW = new Date('2026-08-13T14:30:00.000Z');
const ENV = { id: 'env-1', name: 'Production Env', companyName: 'BrightPath Care Ltd' };
const stored = () => {
  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify(ENV));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E-7');
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Ana@Contoso.com' }));
};

beforeEach(() => {
  localStorage.clear();
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { fetchSpy.mockRestore(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('HOME wire', () => {
  test('HOME.C1 wire: POST /bc/client-tenant/companies', async () => {
    stored(); answer({ value: [] });
    const body = { environmentName: ENV.name, registrationId: 'REG-1' };
    await bcApi(clientTenantCompanies, { body });
    expect(clientTenantCompanies.inventory).toContain('HOME.C1');
    expect(sent().url).toBe(`${BASE}/bc/client-tenant/companies`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(body) });
    /* no headers option: X-Registration-ID only through SHARED.R7, when one is stored */
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: `Bearer ${signed('bc')}`, 'X-Registration-ID': 'REG-1' });
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('HOME.C2 wire: GET /bc/employees/current', async () => {
    stored(); answer({ id: 'p1' });
    await bcApi(employeeCurrent, { query: profileQuery() });
    /* URLSearchParams, in the row's order, the email lower-cased; a space is + */
    expect(sent().url).toBe(`${BASE}/bc/employees/current?registrationId=REG-1&clientEnvironment=Production+Env&clientCompanyId=cmp-1&email=ana%40contoso.com`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    expect(Object.entries(sent().headers)).toEqual([
      ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`],
      ['X-Registration-ID', 'REG-1'], ['X-Client-Environment', 'Production Env'], ['X-Client-Company-ID', 'cmp-1'], ['X-User-Email', 'ana@contoso.com'],
    ]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('HOME.C2 wire: a param with no value is left out of the query, and its header goes as ""', async () => {
    localStorage.setItem('currentUser', JSON.stringify({ email: 'ana@contoso.com' }));
    answer({});
    await bcApi(employeeCurrent, { query: profileQuery() });
    expect(sent().url).toBe(`${BASE}/bc/employees/current?email=ana%40contoso.com`);
    expect(sent().headers).toMatchObject({ 'X-Registration-ID': '', 'X-Client-Environment': '', 'X-Client-Company-ID': '', 'X-User-Email': 'ana@contoso.com' });
  });

  test('HOME.C3 wire: GET /bc/payslips', async () => {
    stored(); answer([]);
    await bcApi(payslipsList);
    expect(sent().url).toBe(`${BASE}/bc/payslips`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    expect(Object.entries(sent().headers)).toEqual([
      ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`],
      ['X-Registration-ID', 'REG-1'], ['X-Client-Environment', 'Production Env'], ['X-Client-Company-ID', 'cmp-1'],
      ['X-Employee-No', 'E-7'], ['X-User-Email', 'ana@contoso.com'], ['X-LocalStorage-EmployeeNo', 'E-7'],
      ['X-Session-Request-Time', String(NOW.getTime())],
    ]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('HOME.C4 wire: POST /bc/payslips/{systemId}/pdf', async () => {
    stored(); answer({ value: 'JVBERi0=' });
    await bcApi(payslipPdf, { params: { systemId: 'a1b2 c3' }, body: { systemId: 'a1b2 c3' } });
    /* systemId goes in as given, not URL-encoded */
    expect(sent().url).toBe(`${BASE}/bc/payslips/a1b2 c3/pdf`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ systemId: 'a1b2 c3' }) });
    expect(Object.entries(sent().headers)).toEqual([
      ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`],
      ['X-Registration-ID', 'REG-1'], ['X-Client-Environment', 'Production Env'], ['X-Client-Company-ID', 'cmp-1'],
    ]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('HOME.C5 wire: POST /session/init', async () => {
    stored(); answer({ success: true });
    const body = { registrationId: 'REG-1', userEmail: 'ana@contoso.com', employeeNo: 'E-7' };
    await bcApi(sessionInit, { body });
    expect(sessionInit.inventory).toContain('HOME.C5');
    expect(sent().url).toBe(`${BASE}/session/init`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify(body) });
    /* ApiService: Content-Type only, no token */
    expect(sent().headers).toEqual({ 'Content-Type': 'application/json' });
    expect(tokenFn).not.toHaveBeenCalled();
  });
});

/* fetchThroughBackend's rules (portal SHARED.R1 to SHARED.R13), for the
   three portal calls that go through it here. */
describe('SHARED transport', () => {
  const portalCalls = [employeeCurrent, payslipsList, payslipPdf, clientTenantCompanies] as const;

  test('SHARED.R1: the URL is REACT_APP_API_BASE_URL plus the endpoint', async () => {
    stored(); answer([]);
    await fetchPayslips();
    expect(sent().url).toBe(`${BASE}/bc/payslips`);
    vi.stubEnv('REACT_APP_API_BASE_URL', 'https://api.example.test/api/');
    answer([]);
    await fetchPayslips();
    expect(sent(1).url).toBe('https://api.example.test/api/bc/payslips');
  });

  test('SHARED.R2: Content-Type and Accept are sent on every call, GET included', () => {
    for (const ep of portalCalls) expect(ep.literalHeaders, ep.inventory).toEqual(['Content-Type', 'Accept']);
  });

  test("SHARED.R3: no token, or QniConnect's sentinel tokens, stop the call before anything is sent", async () => {
    stored();
    for (const t of [null, '', 'Not Readable', 'mock-token-for-development']) {
      tokenFn.mockResolvedValueOnce(t);
      await expect(bcApi(payslipsList)).rejects.toThrow('Authentication failed. Please log in again.');
    }
    tokenFn.mockRejectedValueOnce(new Error('no account'));
    await expect(bcApi(payslipsList)).rejects.toThrow('no account');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('SHARED.R4: every portal call takes the bc token, so none reaches the no-scopes branch', () => {
    for (const ep of portalCalls) expect(ep.token, ep.inventory).toBe('bc');
  });

  test('SHARED.R5: credentials are included on every call', () => {
    for (const ep of portalCalls) expect(ep.credentials, ep.inventory).toBe('include');
  });

  test('SHARED.R6: no portal call sends X-BC-Environment, with an environment stored', async () => {
    stored();
    for (const ep of portalCalls) expect(ep.headers as readonly string[], ep.inventory).not.toContain('X-BC-Environment');
    answer([]);
    await bcApi(payslipsList);
    expect(sent().headers).not.toHaveProperty('X-BC-Environment');
  });

  test('SHARED.R7: X-Registration-ID goes on a call that passes no headers only when one is stored; the others send "" when none is', async () => {
    answer({ value: [] });
    await bcApi(clientTenantCompanies, { body: { environmentName: 'P', registrationId: '' } });
    expect(sent().headers).not.toHaveProperty('X-Registration-ID');
    answer([]);
    await bcApi(payslipsList);
    expect(sent(1).headers['X-Registration-ID']).toBe('');
    localStorage.setItem('registrationId', 'REG-2');
    answer([]);
    await bcApi(payslipsList);
    expect(sent(2).headers['X-Registration-ID']).toBe('REG-2');
  });

  test('SHARED.R8: X-Client-Company-ID on any response, a refusal too, is stored', async () => {
    stored();
    for (const [ep, opts] of [[employeeCurrent, { query: {} }], [payslipsList, {}], [payslipPdf, { params: { systemId: 's' }, body: { systemId: 's' } }]] as const) {
      expect(ep.readsCompanyHeader, ep.inventory).toBe(true);
      answer({}, { status: 500, headers: { 'X-Client-Company-ID': `cmp-${ep.inventory}` } });
      await expect(bcApi(ep, opts as never)).rejects.toBeInstanceOf(BcError);
      expect(bcContext.clientCompanyId()).toBe(`cmp-${ep.inventory}`);
    }
  });

  test('SHARED.R9: a refusal says message, else error, else API Error: <status>; an error that is not text never becomes the message', async () => {
    stored();
    answer({ message: 'No employee' }, { status: 404 });
    await expect(bcApi(payslipsList)).rejects.toMatchObject({ status: 404, message: 'No employee', data: { message: 'No employee' } });
    answer({ error: 'Bad gateway' }, { status: 502 });
    await expect(bcApi(payslipsList)).rejects.toMatchObject({ message: 'Bad gateway' });
    fetchSpy.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(bcApi(payslipsList)).rejects.toMatchObject({ message: 'API Error: 503', data: {} });
    /* inventory A1: an object `error` stays in data, the message stays text */
    answer({ error: { code: 'X', message: 'nested' } }, { status: 400 });
    await expect(bcApi(payslipsList)).rejects.toMatchObject({ message: 'API Error: 400', data: { error: { code: 'X' } } });
  });

  test('SHARED.R10: a 2xx whose body is not JSON is an error', async () => {
    stored();
    fetchSpy.mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200 }));
    await expect(bcApi(employeeCurrent, { query: {} })).rejects.toBeInstanceOf(BcError);
  });

  test("SHARED.R11: there are no development mock answers; a failure is a failure (Ruling Q3)", async () => {
    stored();
    answer({ message: 'down' }, { status: 500 });
    await expect(fetchEmployeeProfile()).rejects.toBeInstanceOf(BcError);
    answer({ message: 'down' }, { status: 500 });
    await expect(fetchPayslipPdf('s1')).rejects.toBeInstanceOf(BcError);
  });

  test('SHARED.R12: session init uses the same one base URL (Ruling Q5)', async () => {
    vi.stubEnv('REACT_APP_API_BASE_URL', 'https://one.example.test/api');
    answer({});
    await bcApi(sessionInit, { body: { registrationId: '', userEmail: '', employeeNo: '' } });
    expect(sent().url).toBe('https://one.example.test/api/session/init');
    vi.stubEnv('REACT_APP_API_BASE_URL', '');
    await expect(bcApi(sessionInit, { body: { registrationId: '', userEmail: '', employeeNo: '' } })).rejects.toThrow(/REACT_APP_API_BASE_URL/);
  });

  test('SHARED.R13: the portal calls log through the logger only, which is silent unless REACT_APP_DEBUG is true', async () => {
    expect(import.meta.env.REACT_APP_DEBUG).not.toBe('true');
    const writes = (['log', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => undefined));
    stored();
    answer({ message: 'down' }, { status: 500 });
    answer({ message: 'down' }, { status: 500 });
    /* a failed profile and failed payslips are logged, never printed */
    await expect(fetchEmployeeProfile()).rejects.toBeInstanceOf(BcError);
    await expect(fetchPayslips()).resolves.toEqual([]);
    logger.log('quiet');
    for (const w of writes) { expect(w).not.toHaveBeenCalled(); w.mockRestore(); }
  });

  test('the dashboard endpoints are registered (so the contract tests see them), and none emits auth-required but on a 401', async () => {
    for (const ep of [employeeCurrent, payslipsList, payslipPdf]) expect(BC_ENDPOINTS).toContain(ep);
    const heard = vi.fn();
    const off = bcEvents.on('auth-required', heard);
    stored();
    answer({}, { status: 500 });
    await expect(bcApi(payslipsList)).rejects.toBeInstanceOf(BcError);
    expect(heard).not.toHaveBeenCalled();
    answer({}, { status: 401 });
    await expect(bcApi(payslipsList)).rejects.toBeInstanceOf(BcError);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });
});
