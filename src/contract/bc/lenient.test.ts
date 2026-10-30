/* Review focus 3: the real backend may send more, or less, than the fake. Every
   /bc response schema accepts a field it has never heard of, at any depth, and
   accepts the absence of every field QniConnect's code guarded (`?.`, `||`,
   `&&`), as the auth and portal inventories' "Response fields read" tables record. */
import type { z } from 'zod';
import { BC_ENDPOINTS } from './endpoints';
import { portalUserUpdateStatus, portalUserVerify, portalUserVerifyAccess, sessionInit } from './session';
import { clientTenantCompanies, clientTenantCompaniesSetup, environmentsList } from './environments';
import { employeeCurrent, payslipPdf, payslipsList } from './payroll';
import { fiscalYearsList, p11dPdf, p45Pdf, p60Pdf } from './documents';
import { notificationSeen, notificationsList } from './notifications';
import { adminEnvironmentsList, authRefresh, authStatus, authUrl, environmentCreate, portalRegistration } from './admin';
import { portalUserCreate, portalUsersList, portalUserUpdate } from './portal-users';
import { portalRegistrationSubmit } from './registration';

/* One full response per endpoint, as the fake answers it. */
const FULL: [z.ZodType, unknown][] = [
  [portalUserUpdateStatus.response, { success: true, message: 'User status updated successfully' }],
  [portalUserVerify.response, { exists: true, isActive: true, message: 'User found', userData: { id: 'u1', email: 'a@b.c', name: 'A', isAdmin: true, status: 'Active', registrationId: 'REG-1', employeeNo: 'E1', role: 'Admin' } }],
  [portalUserVerifyAccess.response, { exists: true, isActive: true, message: 'User found', userData: { id: 'u1', registrationId: 'REG-1' } }],
  [sessionInit.response, { success: true, message: 'Session started' }],
  [environmentsList.response, { value: [{ id: 'env-1', name: 'Production', type: 'Production', url: 'https://x', status: 'Active', companyName: 'C', company_Id: 'g' }] }],
  [clientTenantCompaniesSetup.response, { value: [{ id: 'c1', name: 'C', displayName: 'C' }], updateResult: { success: true } }],
  [clientTenantCompanies.response, { value: [{ id: 'c1', name: 'C', displayName: 'C' }] }],
  /* HOME.C1 also read a bare list (`response.value || response`) */
  [clientTenantCompanies.response, [{ id: 'c1', name: 'C', displayName: 'C' }]],
  [employeeCurrent.response, { id: 'p1', employeeNo: 'E1', firstName: 'Ana', middleName: 'M', lastName: 'Silva', jobTitle: 'Nurse', email: 'a@b.c',
    employmentDate: '2022-01-15', manager: 'Bo', address: '1 Road', address2: 'Flat 2', addressLine3: '', addressLine4: '', city: 'London', postCode: 'N1 1AA',
    birthDate: '1990-05-20', gender: 'Female', frequency: 'Monthly', hmrcTaxCode: '1257L', nationalInsuranceNumber: 'QQ123456C',
    niClassCode: 'A', nationalInsuranceCode: 'Standard', weeklyHoursWorked: 37.5, mobilePhoneNo: '07700 900000',
    /* PROF: the profile page's own fields */
    maritalStatus: 'Single', county: 'Greater London', country: 'United Kingdom', status: 'Active', bankName: 'Barclays', bankAccountName: 'A Silva',
    bankAccountNo: '12345678', bankBranchNo: '200000', annualSalary: 32000, pensionSet: 'Auto-enrolment', pensionContribution: '5%', pensionProvider: 'NEST' }],
  [payslipsList.response, [{ id: 'ps1', systemId: 's1', period: 'Jul 2026', payDate: '2026-07-31', grossPay: 2000, taxPaid: 200, netPay: 1600 }]],
  [payslipPdf.response, { value: 'JVBERi0xLjQ=' }],
  [fiscalYearsList.response, [{ id: 'fy-2024', fiscalYear: '2024/2025', active: false, startDate: '2024-04-06', endDate: '2025-04-05', allowP60Print: true }]],
  [p60Pdf.response, { value: 'JVBERi0xLjQ=' }],
  [p11dPdf.response, { value: 'JVBERi0xLjQ=' }],
  [p45Pdf.response, { value: 'JVBERi0xLjQ=' }],
  [notificationsList.response, [{ systemId: 'n1', seen: false, message: 'Your payslip is ready', createdDate: '2026-07-28', createdTime: '08:15:00' }]],
  /* BELL.C2's answer is ignored */
  [notificationSeen.response, { systemId: 'n1', seen: true }],
  /* the admin pages' (Task 19) */
  [portalUsersList.response, { value: [{ id: 'pu-1', name: 'Dee', email: 'd@b.c', status: 'Active', isAdmin: true, employeeNo: 'E1', role: 'Admin', lastLogin: '2026-08-12T08:15:00Z' }] }],
  /* Setup · Employees' (Task 20) */
  [portalUserCreate.response, { id: 'pu-2', name: 'Ann', email: 'a@b.c', status: 'PendingFirstLogin', isAdmin: false, employeeNo: '', role: 'User', lastLogin: null }],
  [portalUserUpdate.response, { id: 'pu-2', name: 'Ann Lee', email: 'a@b.c', status: 'Active', isAdmin: false, employeeNo: 'E2', role: 'User', lastLogin: null }],
  [adminEnvironmentsList.response, { value: [{ id: 'env-1', name: 'Production', type: 'Production', url: 'https://x', status: 'Active', companyName: 'C' }] }],
  [environmentCreate.response, { id: 'env-2', name: 'Sandbox', type: 'Sandbox', url: 'https://y', status: 'Active', companyName: 'C', company_Id: '' }],
  [authStatus.response, { isAuthorized: true, status: 'active', clientId: 'c', tenantId: 't', environment: 'Production', scope: 's', issuedAt: '2026-07-01T09:00:00Z', expiresAt: '2026-10-01T09:00:00Z', accessToken: 'a', refreshToken: 'r', registrationId: 'REG-1', diagnostics: { hasAccessToken: true, hasRefreshToken: true, tokenStoredInBC: true } }],
  [authRefresh.response, { isAuthorized: true, status: 'active', clientId: 'c', tenantId: 't', environment: 'Production', scope: 's', issuedAt: '2026-07-01T09:00:00Z', expiresAt: '2026-10-01T09:00:00Z', accessToken: 'a', refreshToken: 'r', registrationId: 'REG-1', diagnostics: { hasAccessToken: true, hasRefreshToken: true, tokenStoredInBC: true } }],
  [authUrl.response, { authUrl: 'https://login.example/authorize?code_challenge=x', registrationId: 'REG-1', pkceEnabled: true }],
  [portalRegistration.response, { id: 'REG-1', companyName: 'C', registrationDate: '2025-03-14' }],
  /* registration's (Task 21): the answer is never read (REG.R22) */
  [portalRegistrationSubmit.response, { id: 'REG-2', company_Name: 'Northwind Care', status: 'Pending' }],
];

/* The same value with an unknown field added to every object in it. */
const withExtras = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(withExtras);
  if (v && typeof v === 'object') return { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withExtras(x)])), surpriseField: { from: 'the real backend' } };
  return v;
};

test('every BC_ENDPOINTS response accepts an unknown extra field', () => {
  expect(BC_ENDPOINTS.length).toBeGreaterThan(0);
  for (const ep of BC_ENDPOINTS) {
    expect(ep.response.safeParse({ surpriseField: 1 }).success, `${ep.inventory} top level`).toBe(true);
    expect(FULL.some(([schema]) => schema === ep.response), `${ep.inventory} has a full sample here`).toBe(true);
  }
  for (const [schema, full] of FULL) {
    expect(schema.safeParse(full).success).toBe(true);
    const r = schema.safeParse(withExtras(full));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    /* and the extra field is kept, not stripped, so a later port can read it
       (a list's, on its items) */
    const top = Array.isArray(r.data) ? (r.data as unknown[])[0] : r.data;
    expect((top as Record<string, unknown>).surpriseField).toEqual({ from: 'the real backend' });
  }
});

test('fields the inventory marks guarded may be absent', () => {
  /* AUTH.C1 / AUTH.C3: exists, isActive, message and userData are all read
     through a guard; so is every userData field read */
  for (const ep of [portalUserVerify, portalUserVerifyAccess]) {
    expect(ep.response.safeParse({}).success, ep.inventory).toBe(true);
    expect(ep.response.safeParse({ exists: true, userData: {} }).success, ep.inventory).toBe(true);
  }
  /* AUTH.C6: `!result || !result.success` and `result?.message` */
  expect(portalUserUpdateStatus.response.safeParse({}).success).toBe(true);
  /* AUTH.C2: the whole response is only logged */
  expect(sessionInit.response.safeParse({}).success).toBe(true);
  /* AUTH.C4: `data.value || data.environments || []`, and every item field has a fallback */
  expect(environmentsList.response.safeParse({}).success).toBe(true);
  expect(environmentsList.response.safeParse({ environments: [{}] }).success).toBe(true);
  expect(environmentsList.response.safeParse({ value: [{ environmentId: 'e', environmentName: 'P', environmentType: 'Sandbox', environmentUrl: '', company_Name: '', companyId: '' }] }).success).toBe(true);
  /* AUTH.C5: `updateResult && updateResult.success`; AUTH.C9: `response.value || response || []` */
  expect(clientTenantCompaniesSetup.response.safeParse({}).success).toBe(true);
  expect(clientTenantCompaniesSetup.response.safeParse({ updateResult: {} }).success).toBe(true);
  expect(clientTenantCompanies.response.safeParse({}).success).toBe(true);
  expect(clientTenantCompanies.response.safeParse([]).success).toBe(true);
  /* HOME.C2: every field read through `||` or `&&`, and null reads as missing */
  expect(employeeCurrent.response.safeParse({}).success).toBe(true);
  expect(employeeCurrent.response.safeParse({ firstName: null, niClassCode: null, weeklyHoursWorked: '37.5' }).success).toBe(true);
  /* HOME.C3: `Array.isArray(response) ? response : []`, and every payslip field guarded */
  expect(payslipsList.response.safeParse({ value: [] }).data).toEqual([]);
  expect(payslipsList.response.safeParse(null).data).toEqual([]);
  expect(payslipsList.response.safeParse([{}]).success).toBe(true);
  /* HOME.C4: `response && response.value` */
  expect(payslipPdf.response.safeParse({}).success).toBe(true);
  /* DOCS.C1: the client says "Invalid response format" for anything not a list,
     and every fiscal year field is read through a guard or compared strictly */
  expect(fiscalYearsList.response.safeParse({ value: [] }).success).toBe(true);
  expect(fiscalYearsList.response.safeParse(null).success).toBe(true);
  expect(fiscalYearsList.response.safeParse([{}]).success).toBe(true);
  /* DOCS.C2 to DOCS.C4: `response && response.value` */
  for (const ep of [p60Pdf, p11dPdf, p45Pdf]) expect(ep.response.safeParse({}).success, ep.inventory).toBe(true);
  /* DOCS.C0 and DOCS.C0b: the fields Documents reads besides the dashboard's */
  expect(payslipsList.response.safeParse([{ expectedPaymentDate: null, taxAmount: null, fiscalYear: null }]).success).toBe(true);
  expect(employeeCurrent.response.safeParse({ validP11D: null }).success).toBe(true);
  /* PROF: every field the profile page reads went through `|| ''`; the numbers may come as numbers (A3) */
  expect(employeeCurrent.response.safeParse({ status: null, county: null, country: null, bankName: null, bankAccountName: null, bankAccountNo: null,
    bankBranchNo: null, pensionSet: null, pensionContribution: null, pensionProvider: null, maritalStatus: null, annualSalary: null }).success).toBe(true);
  expect(employeeCurrent.response.safeParse({ bankAccountNo: 12345678, bankBranchNo: 200000, pensionContribution: 5, annualSalary: 32000 }).success).toBe(true);
  /* BELL.C1: `Array.isArray(response) ? response : []`, and every item field read through a guard or as text */
  expect(notificationsList.response.safeParse({ success: true }).data).toEqual([]);
  expect(notificationsList.response.safeParse(null).data).toEqual([]);
  expect(notificationsList.response.safeParse([{}]).success).toBe(true);
  /* BELL.C2: the answer is ignored, so anything, or nothing, will do */
  expect(notificationSeen.response.safeParse(undefined).success).toBe(true);
  /* ADM.C1: `response.value || []`; every user field may be missing */
  expect(portalUsersList.response.safeParse({}).success).toBe(true);
  expect(portalUsersList.response.safeParse({ value: [{}] }).success).toBe(true);
  /* USERS.C1: name and email were read unguarded, and the port reads them as blank; lastLogin falsy is Never */
  expect(portalUsersList.response.safeParse({ value: [{ id: 'pu-1', name: null, email: null, lastLogin: null, isAdmin: null }] }).success).toBe(true);
  /* USERS.C2: `{status: 'Active', ...result}`; USERS.C3: `result || {}` */
  expect(portalUserCreate.response.safeParse({}).success).toBe(true);
  for (const v of [{}, null, undefined]) expect(portalUserUpdate.response.safeParse(v).success).toBe(true);
  /* ADM.C2 / ENV.C1: as AUTH.C4, plus the admin mapper's company_name */
  expect(adminEnvironmentsList.response.safeParse({}).success).toBe(true);
  expect(adminEnvironmentsList.response.safeParse({ environments: [{ environmentId: 'e', company_name: 'C' }] }).success).toBe(true);
  /* ENV.C2: appended as it came, every field may be missing */
  expect(environmentCreate.response.safeParse({}).success).toBe(true);
  /* AUTHZ.C1 / ADM.C3 / AUTHZ.C3: read field by field through guards; null is the Not authorized view */
  for (const ep of [authStatus, authRefresh]) {
    expect(ep.response.safeParse({}).success, ep.inventory).toBe(true);
    expect(ep.response.safeParse(null).success, ep.inventory).toBe(true);
    expect(ep.response.safeParse({ isAuthorized: 'yes', status: null, expiresAt: null, diagnostics: null }).success, ep.inventory).toBe(true);
    expect(ep.response.safeParse({ diagnostics: { hasAccessToken: 1 } }).success, ep.inventory).toBe(true);
  }
  /* AUTHZ.C2: a missing authUrl is said on screen (AUTHZ.R11) */
  expect(authUrl.response.safeParse({}).success).toBe(true);
  /* ADM.C4: each field has a fallback, and null is the defaults */
  expect(portalRegistration.response.safeParse({}).success).toBe(true);
  expect(portalRegistration.response.safeParse(null).success).toBe(true);
  /* REG.C1: any OK answer is success, whatever its body, or none (REG.R22) */
  for (const v of [undefined, null, 'Created', [], {}]) expect(portalRegistrationSubmit.response.safeParse(v).success).toBe(true);
});

test('a guarded field that arrives with the wrong type is still refused', () => {
  expect(portalUserVerify.response.safeParse({ exists: 'yes' }).success).toBe(false);
  expect(portalUserVerify.response.safeParse({ userData: { isAdmin: 'true' } }).success).toBe(false);
  expect(environmentsList.response.safeParse({ value: 'none' }).success).toBe(false);
  expect(employeeCurrent.response.safeParse({ employeeNo: 7 }).success).toBe(false);
  expect(payslipsList.response.safeParse([{ netPay: '1,600.00' }]).success).toBe(false);
  expect(fiscalYearsList.response.safeParse([{ active: 'true' }]).success).toBe(false);
  expect(employeeCurrent.response.safeParse({ validP11D: 'yes' }).success).toBe(false);
  expect(employeeCurrent.response.safeParse({ bankName: 7 }).success).toBe(false);
  expect(notificationsList.response.safeParse([{ message: 7 }]).success).toBe(false);
  expect(portalUsersList.response.safeParse({ value: 'all' }).success).toBe(false);
  expect(authStatus.response.safeParse({ expiresAt: 1767225600 }).success).toBe(false);
  expect(authUrl.response.safeParse({ authUrl: 7 }).success).toBe(false);
  expect(portalRegistration.response.safeParse({ registrationDate: 20250314 }).success).toBe(false);
  /* a profile that is not an object at all is unreadable (HOME.R9's failure) */
  expect(employeeCurrent.response.safeParse(null).success).toBe(false);
});

test('every endpoint cites an AUTH, HOME, DOCS, BELL, ADM, USERS, ENV, AUTHZ or REG row, and none is a dead QniConnect call (AUTH.C8, AUTH.C11 to AUTH.C13)', () => {
  for (const ep of BC_ENDPOINTS) {
    expect(ep.inventory, ep.path).toMatch(/^(AUTH|HOME|DOCS|BELL|ADM|USERS|ENV|AUTHZ|REG)\.C\d+/);
    expect(ep.inventory, ep.path).not.toMatch(/AUTH\.C(8|11|12|13)\b/);
  }
  expect(BC_ENDPOINTS.map(e => `${e.method} ${e.path}`)).not.toContain('GET /session/verify');
});
