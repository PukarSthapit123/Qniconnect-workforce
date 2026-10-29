/* Documents' calls on the wire (docs/superpowers/inventory/portal.md, DOCS):
   one wire test per DOCS call row, and one test per row of
   SHARED.formatBCErrorMessage (SHARED.F1 to SHARED.F6), which only the tax
   documents and the fiscal years use. bcApi runs against a stubbed fetch,
   with everything QniConnect could have sent stored first, so a header the
   row does not list would show up. */
import type { MockInstance } from 'vitest';
import { setAuth, type AuthAdapter, type TokenKind } from '@/auth';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';
import { employeeCurrent, payslipPdf, payslipsList } from '@/contract/bc/payroll';
import { fiscalYearsList, p11dPdf, p45Pdf, p60Pdf } from '@/contract/bc/documents';
import { BcError } from './client';
import { fetchFiscalYears, fetchTaxDocument, formatBCErrorMessage } from './documents';
import { fetchEmployeeProfile, fetchPayslipPdf, fetchPayslips } from './payroll';

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
const GUID = 'f1104200-ec2e-f011-9a4a-cp-1042';
const stored = () => {
  localStorage.setItem('registrationId', 'REG-1');
  localStorage.setItem('activeEnvironment', JSON.stringify(ENV));
  localStorage.setItem('clientCompanyId', 'cmp-1');
  localStorage.setItem('employeeNo', 'E-7');
  localStorage.setItem('employeeId', GUID);
  localStorage.setItem('currentUser', JSON.stringify({ email: 'Ana@Contoso.com' }));
};
/* the three X- headers DOCS.C1 to DOCS.C4 send, as HOME.C4 does */
const THREE = [
  ['Content-Type', 'application/json'], ['Accept', 'application/json'], ['Authorization', `Bearer ${signed('bc')}`],
  ['X-Registration-ID', 'REG-1'], ['X-Client-Environment', 'Production Env'], ['X-Client-Company-ID', 'cmp-1'],
];

beforeEach(() => {
  localStorage.clear();
  setAuth(adapter);
  tokenFn.mockReset();
  tokenFn.mockImplementation(async kind => signed(kind));
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { fetchSpy.mockRestore(); vi.useRealTimers(); });

describe('DOCS wire', () => {
  test('DOCS.C0 wire: GET /bc/payslips, the same call as HOME.C3', async () => {
    stored(); answer([]);
    await fetchPayslips();
    expect(payslipsList.inventory).toContain('DOCS.C0');
    expect(sent().url).toBe(`${BASE}/bc/payslips`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    expect(Object.entries(sent().headers)).toEqual([...THREE,
      ['X-Employee-No', 'E-7'], ['X-User-Email', 'ana@contoso.com'], ['X-LocalStorage-EmployeeNo', 'E-7'],
      ['X-Session-Request-Time', String(NOW.getTime())]]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('DOCS.C0b wire: GET /bc/employees/current, the same call as HOME.C2', async () => {
    stored(); answer({ id: GUID });
    await fetchEmployeeProfile();
    expect(employeeCurrent.inventory).toContain('DOCS.C0b');
    expect(sent().url).toBe(`${BASE}/bc/employees/current?registrationId=REG-1&clientEnvironment=Production+Env&clientCompanyId=cmp-1&email=ana%40contoso.com`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(Object.entries(sent().headers)).toEqual([...THREE, ['X-User-Email', 'ana@contoso.com']]);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('DOCS.C0c wire: POST /bc/payslips/{systemId}/pdf, the same call as HOME.C4', async () => {
    stored(); answer({ value: 'JVBERi0=' });
    await fetchPayslipPdf('s-1 a');
    expect(payslipPdf.inventory).toContain('DOCS.C0c');
    expect(sent().url).toBe(`${BASE}/bc/payslips/s-1 a/pdf`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ systemId: 's-1 a' }) });
    expect(Object.entries(sent().headers)).toEqual(THREE);
  });

  test('DOCS.C1 wire: GET /bc/fiscalyears', async () => {
    stored(); answer([]);
    await fetchFiscalYears();
    expect(sent().url).toBe(`${BASE}/bc/fiscalyears`);
    expect(sent().init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(sent().init).not.toHaveProperty('body');
    expect(Object.entries(sent().headers)).toEqual(THREE);
    expect(tokenFn).toHaveBeenCalledExactlyOnceWith('bc');
  });

  test('DOCS.C1 wire: with nothing stored, each X- header goes as ""', async () => {
    answer([]);
    await fetchFiscalYears();
    expect(sent().headers).toMatchObject({ 'X-Registration-ID': '', 'X-Client-Environment': '', 'X-Client-Company-ID': '' });
  });

  test('DOCS.C2 wire: POST /bc/employees/{employeeId}/p60, with the tax year only when there is one', async () => {
    stored(); answer({ value: 'JVBERi0=' }); answer({ value: 'JVBERi0=' });
    await fetchTaxDocument('P60', GUID, '2024/2025');
    /* the GUID goes in as given, not URL-encoded */
    expect(sent().url).toBe(`${BASE}/bc/employees/${GUID}/p60`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ employeeId: GUID, taxYear: '2024/2025' }) });
    expect(Object.entries(sent().headers)).toEqual(THREE);
    await fetchTaxDocument('P60', GUID, '');
    expect(sent(1).init.body).toBe(JSON.stringify({ employeeId: GUID }));
    expect(tokenFn).toHaveBeenCalledWith('bc');
  });

  test('DOCS.C3 wire: POST /bc/employees/{employeeId}/p11d', async () => {
    stored(); answer({ value: 'JVBERi0=' });
    await fetchTaxDocument('P11D', GUID, '2025/2026');
    expect(sent().url).toBe(`${BASE}/bc/employees/${GUID}/p11d`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ employeeId: GUID, taxYear: '2025/2026' }) });
    expect(Object.entries(sent().headers)).toEqual(THREE);
  });

  test('DOCS.C4 wire: POST /bc/employees/{employeeId}/p45, the employee alone (Ruling Q4)', async () => {
    stored(); answer({ value: 'JVBERi0=' });
    await fetchTaxDocument('P45', GUID);
    expect(sent().url).toBe(`${BASE}/bc/employees/${GUID}/p45`);
    expect(sent().init).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ employeeId: GUID }) });
    expect(Object.entries(sent().headers)).toEqual(THREE);
  });

  test('DOCS: the documents endpoints are registered, read the company header, and never send X-BC-Environment', () => {
    for (const ep of [fiscalYearsList, p60Pdf, p11dPdf, p45Pdf]) {
      expect(BC_ENDPOINTS).toContain(ep);
      expect(ep.token).toBe('bc');
      expect(ep.credentials).toBe('include');
      expect(ep.readsCompanyHeader).toBe(true);
      expect(ep.headers as readonly string[]).not.toContain('X-BC-Environment');
    }
  });

  test('DOCS.C2: an empty employee id stops the call before anything is sent', async () => {
    stored();
    await expect(fetchTaxDocument('P60', '', '2024/2025')).resolves.toEqual({ success: false, data: null, error: 'Employee ID is required' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('DOCS.C1: a response that is not a list is the failure shape, with QniConnect\'s words', async () => {
    stored(); answer({ value: [] });
    await expect(fetchFiscalYears()).resolves.toEqual({ success: false, data: [], error: 'Invalid response format from fiscal years API' });
  });

  test('DOCS.C2/C3: a response with no value is the failure shape, with QniConnect\'s words', async () => {
    stored(); answer({}); answer({ value: '' });
    await expect(fetchTaxDocument('P60', GUID, '2024/2025')).resolves.toEqual({ success: false, data: null, error: 'Invalid response format from P60 document API' });
    await expect(fetchTaxDocument('P11D', GUID, '2024/2025')).resolves.toEqual({ success: false, data: null, error: 'Invalid response format from P11D document API' });
  });
});

/* SHARED.formatBCErrorMessage: first match wins, in this order. The refusal
   is bcApi's BcError, whose `data` is QniConnect's `error.response.data`. */
describe('SHARED.formatBCErrorMessage', () => {
  const refusal = (data: unknown, status = 400) => new BcError(status, data);

  test('SHARED.F1: with nothing to say, "An error occurred while processing your request"', () => {
    expect(formatBCErrorMessage(refusal({}))).toBe('API Error: 400');
    expect(formatBCErrorMessage({})).toBe('An error occurred while processing your request');
    expect(formatBCErrorMessage(null)).toBe('An error occurred while processing your request');
    expect(formatBCErrorMessage(new Error(''))).toBe('An error occurred while processing your request');
  });

  test('SHARED.F2: error.message, cut at the first CorrelationId:', () => {
    expect(formatBCErrorMessage(refusal({ error: { code: 'BadRequest', message: 'No P60 for 2026/2027.  CorrelationId: 9f1c-22  CorrelationId: x' }, message: 'm' })))
      .toBe('No P60 for 2026/2027.');
  });

  test('SHARED.F3: else the error\'s code, or the error itself when it is text', () => {
    expect(formatBCErrorMessage(refusal({ error: { code: 'Internal_ServerError' }, message: 'm' }))).toBe('Internal_ServerError');
    expect(formatBCErrorMessage(refusal({ error: 'Bad gateway', message: 'm' }))).toBe('Bad gateway');
    /* an object with no code is no longer the words "[object Object]": it
       falls through to what else there is (Ruling Q2) */
    expect(formatBCErrorMessage(refusal({ error: { detail: 1 }, message: 'Try later' }))).toBe('Try later');
    expect(formatBCErrorMessage(refusal({ error: { detail: 1 } }, 502))).toBe('API Error: 502');
  });

  test('SHARED.F4: else the response\'s message', () => {
    expect(formatBCErrorMessage(refusal({ message: 'No employee record' }))).toBe('No employee record');
  });

  test('SHARED.F5: else the error\'s own message', () => {
    expect(formatBCErrorMessage(new Error('Employee ID is required'))).toBe('Employee ID is required');
    expect(formatBCErrorMessage(refusal({}, 503))).toBe('API Error: 503');
  });

  test('SHARED.F6: a formatter that throws gives the default', () => {
    const hostile = { get response() { throw new Error('boom'); }, get data() { throw new Error('boom'); }, message: 'x' };
    expect(formatBCErrorMessage(hostile)).toBe('An error occurred while processing your request');
  });

  test('SHARED.F2 to F5: the tax documents and fiscal years say the formatted refusal', async () => {
    stored();
    answer({ error: { code: 'NotFound', message: 'No P45 has been issued. CorrelationId: abc' } }, { status: 404 });
    await expect(fetchTaxDocument('P45', GUID)).resolves.toEqual({ success: false, data: null, error: 'No P45 has been issued.' });
    answer({ message: 'Fiscal years are unavailable' }, { status: 500 });
    await expect(fetchFiscalYears()).resolves.toEqual({ success: false, data: [], error: 'Fiscal years are unavailable' });
  });
});
