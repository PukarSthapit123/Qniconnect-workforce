/* The fake /bc and /session server, through the real bcApi client and the auth
   stub's unsigned tokens, as the app will call it in dev and tests. */
import { setAuth } from '@/auth';
import { STUB_ACCOUNT_KEY, stubAuth } from '@/mocks/auth-stub';
import { server } from '@/mocks/node';
import { bcApi, BcError } from '@/api/bc/client';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';
import { portalUserUpdateStatus, portalUserVerify, portalUserVerifyAccess, sessionInit } from '@/contract/bc/session';
import { clientTenantCompanies, clientTenantCompaniesSetup, environmentsList, registrationFilter } from '@/contract/bc/environments';
import { employeeCurrent, payslipPdf, payslipsList } from '@/contract/bc/payroll';
import { fiscalYearsList, p11dPdf, p45Pdf, p60Pdf } from '@/contract/bc/documents';
import { notificationSeen, notificationsList } from '@/contract/bc/notifications';
import { adminEnvironmentsList, adminRegistrationFilter, authRefresh, authStatus, authUrl, environmentCreate, portalRegistration } from '@/contract/bc/admin';
import { portalUserCreate, portalUsersList, portalUserUpdate } from '@/contract/bc/portal-users';
import { portalRegistrationSubmit } from '@/contract/bc/registration';
import { INITIAL_REGISTRATION, registrationPayload } from '@/domain/registration';
import { bcHandlers, bcHandlersIfOn } from './handlers';
import { bcStore, FIRST_LOGIN_EMAIL, REGISTRATION_ID } from './seed';
import social from '../seed/social.json';
import qnipay from '../seed/qnipay.json';

const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
const signInAs = (email: string) => sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify({ oid: `oid-${email}`, email, name: email }));
const verify = (email: string) => bcApi(portalUserVerify, { body: { email, userId: `oid-${email}` } });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { setAuth(stubAuth); bcStore.reset(); signInAs('dee.fitzgerald@brightpath.org'); });
afterEach(() => { vi.unstubAllEnvs(); });

test('verify returns exists:false for an unknown email', async () => {
  const r = await verify('nobody@contoso.com');
  expect(r.exists).toBe(false);
  expect(r.userData).toBeUndefined();
});

test('verify returns isAdmin true for the seed admin', async () => {
  const r = await verify('dee.fitzgerald@brightpath.org');
  expect(r).toMatchObject({ exists: true, isActive: true,
    userData: { email: 'dee.fitzgerald@brightpath.org', name: 'Dee Fitzgerald', isAdmin: true, status: 'Active', registrationId: REGISTRATION_ID, employeeNo: 'CP-1002' } });
  /* an employee is not an admin; the address is matched whatever its case */
  const amara = await verify('Amara.Okafor@brightpath.org');
  expect(amara.userData).toMatchObject({ isAdmin: false, employeeNo: 'CP-1042' });
  /* the qnipay seed's people are portal users too */
  expect((await verify('manish.nepal@dogmagroup.co.uk')).userData).toMatchObject({ isAdmin: true, employeeNo: 'EMP014' });
});

test('firstlogin user is PendingFirstLogin', async () => {
  const r = await verify(FIRST_LOGIN_EMAIL);
  expect(r.exists).toBe(true);
  expect(r.userData?.status).toBe('PendingFirstLogin');
  /* still active, or EnvironmentSelector's check (AUTH.C3) would turn them away before the overlay */
  expect(r.isActive).toBe(true);
});

test('one portal user per Workforce seed account in both seeds, with the same email and employee number', () => {
  const accounts = [...Object.values(social.data.accounts), ...Object.values(qnipay.data.accounts)] as { email: string; employeeCode: string; userType: string }[];
  const users = bcStore.db.portalUsers;
  expect(users.map(u => u.email).sort()).toEqual(accounts.map(a => a.email).sort());
  for (const a of accounts) {
    const u = users.find(x => x.email === a.email);
    expect(u, a.email).toMatchObject({ employeeNo: a.employeeCode, isAdmin: a.userType === 'admin', registrationId: REGISTRATION_ID,
      status: a.email === FIRST_LOGIN_EMAIL ? 'PendingFirstLogin' : 'Active' });
  }
  expect(accounts.some(a => a.email === FIRST_LOGIN_EMAIL)).toBe(true);
});

/* Spec section 6: the dev picker's choice answers for any Microsoft account,
   read from the tab, so the request itself is QniConnect's, unchanged. */
test('verify answers as the person the dev picker chose, whoever the body names', async () => {
  sessionStorage.setItem('qniconnect.devAccount', 'amara.okafor@brightpath.org');
  try {
    const r = await verify('somebody@contoso.com');
    expect(r).toMatchObject({ exists: true, userData: { email: 'amara.okafor@brightpath.org', isAdmin: false, employeeNo: 'CP-1042' } });
  } finally { sessionStorage.removeItem('qniconnect.devAccount'); }
  expect((await verify('somebody@contoso.com')).exists).toBe(false);
});

test('verify with no token is 401, and AUTH.C3 is answered on the same path', async () => {
  const res = await fetch(`${BASE}/bc/portalUsers/verify`, { method: 'POST', body: JSON.stringify({ email: 'dee.fitzgerald@brightpath.org' }) });
  expect(res.status).toBe(401);
  await expect(bcApi(portalUserVerifyAccess, { body: { email: 'dee.fitzgerald@brightpath.org', userId: 'x' } })).resolves.toMatchObject({ exists: true, isActive: true });
});

test('/session/init answers without a token', async () => {
  sessionStorage.clear();
  await expect(bcApi(sessionInit, { body: { registrationId: REGISTRATION_ID, userEmail: 'dee.fitzgerald@brightpath.org', employeeNo: '' } }))
    .resolves.toMatchObject({ success: true });
});

test('environments: Production and Sandbox, filtered by registration id', async () => {
  const all = await bcApi(environmentsList);
  expect(all.value?.map(e => e.name)).toEqual(['Production', 'Sandbox']);
  const mine = await bcApi(environmentsList, { query: { $filter: registrationFilter(REGISTRATION_ID) } });
  expect(mine.value?.map(e => e.id)).toEqual(['env-production-01', 'env-sandbox-01']);
  const none = await bcApi(environmentsList, { query: { $filter: registrationFilter('REG-OTHER') } });
  expect(none.value).toEqual([]);
});

test('the company lookup gives Sandbox its company, so the next environments read has it (AUTH.C5, AUTH.R53)', async () => {
  const before = await bcApi(environmentsList);
  expect(before.value?.find(e => e.name === 'Sandbox')?.company_Id).toBe('');
  const r = await bcApi(clientTenantCompaniesSetup, { body: { environmentName: 'Sandbox', registrationId: REGISTRATION_ID } });
  expect(r.updateResult?.success).toBe(true);
  expect(r.value?.length).toBeGreaterThan(0);
  const after = await bcApi(environmentsList);
  expect(after.value?.find(e => e.name === 'Sandbox')?.company_Id).toMatch(/^[0-9a-f-]{36}$/);
  /* the portal's call to the same path (AUTH.C9) reads the companies from `value` */
  const portal = await bcApi(clientTenantCompanies, { body: { environmentName: 'Production', registrationId: REGISTRATION_ID } });
  expect((Array.isArray(portal) ? portal : portal.value)?.length).toBeGreaterThan(0);
  await expect(bcApi(clientTenantCompanies, { body: { environmentName: 'Nowhere', registrationId: REGISTRATION_ID } })).rejects.toBeInstanceOf(BcError);
});

/* AUTH.C6: the first-login overlay's Continue makes the user Active, so the
   next portal check no longer flags the first login. */
test('updateStatus makes a first-login user Active; an unknown id is 404', async () => {
  const user = bcStore.userByEmail(FIRST_LOGIN_EMAIL);
  if (!user) throw new Error('no first-login user in the fake seed');
  await expect(bcApi(portalUserUpdateStatus, { params: { userId: user.id }, body: { status: 'Active' } }))
    .resolves.toMatchObject({ success: true });
  expect((await verify(FIRST_LOGIN_EMAIL)).userData?.status).toBe('Active');
  await expect(bcApi(portalUserUpdateStatus, { params: { userId: 'pu-nobody' }, body: { status: 'Active' } }))
    .rejects.toMatchObject({ status: 404 });
});

/* BELL.C1 and BELL.C2: an employee's own payroll notifications, newest
   first; marking one seen is kept; an unknown one is 404. */
test('the bell: my payroll notifications, newest first, and marking one seen is kept', async () => {
  const mine = await bcApi(notificationsList, { query: { employeeNo: 'CP-1042' } });
  expect(mine.map(n => n.message)).toEqual(['Your payslip for July 2026 is ready to view.', 'Your P60 for 2025/2026 is available in Documents.', 'Your tax code for 2026/2027 is 1257L.']);
  expect(mine.map(n => n.seen)).toEqual([true, true, true]);
  expect(mine[0]).not.toHaveProperty('employeeNo');
  const id = mine[0]?.systemId ?? '';
  const row = bcStore.db.notifications.find(n => n.systemId === id);
  if (row) row.seen = false;
  expect((await bcApi(notificationsList, { query: { employeeNo: 'CP-1042' } }))[0]?.seen).toBe(false);
  await bcApi(notificationSeen, { params: { systemId: id }, query: {}, body: { seen: true } });
  expect((await bcApi(notificationsList, { query: { employeeNo: 'CP-1042' } }))[0]?.seen).toBe(true);
  /* someone else's are not mine */
  expect((await bcApi(notificationsList, { query: { employeeNo: 'CP-1001' } })).every(n => !n.systemId?.startsWith(id.slice(0, 8)))).toBe(true);
  await expect(bcApi(notificationSeen, { params: { systemId: 'nobody' }, query: {}, body: { seen: true } })).rejects.toMatchObject({ status: 404 });
});

test('every /bc endpoint in the contract is answered by the fake', () => {
  const served = new Set(bcHandlers.map(h => h.info.header));
  for (const ep of BC_ENDPOINTS) expect(served.has(`${ep.method} ${BASE}${ep.path}`), `${ep.method} ${ep.path}`).toBe(true);
  /* named, so an endpoint never imported here cannot slip past the loop: the dashboard's (Task 16), Documents' (Task 17), the bell's (Task 18)
     the admin pages' (Task 19), Setup · Employees' (Task 20) and registration's (Task 21) */
  for (const ep of [employeeCurrent, payslipsList, payslipPdf, fiscalYearsList, p60Pdf, p11dPdf, p45Pdf, notificationsList, notificationSeen,
    portalUsersList, adminEnvironmentsList, environmentCreate, authStatus, authUrl, authRefresh, portalRegistration,
    portalUserCreate, portalUserUpdate, portalUserUpdateStatus, portalRegistrationSubmit]) {
    expect(BC_ENDPOINTS).toContain(ep);
    expect(served.has(`${ep.method} ${BASE}${ep.path}`), `${ep.method} ${ep.path}`).toBe(true);
  }
});

/* Registration's fake (Task 21): signed out, with no token; a new tenant is
   kept for this page load, and one already registered is refused the way a
   Business Central error reads, with its correlation id (REG.R24). */
test('the registration fake: a new organisation is kept, a tenant already registered is refused, and nothing needs a token', async () => {
  sessionStorage.clear();
  const form = { ...INITIAL_REGISTRATION, companyName: 'Northwind Care', companyEmail: 'hello@northwind.test', tenantId: '3c9d1e2f-0000-4a4a-9b9b-111122223333',
    bcEnvironment: 'Production', bcCompanyName: 'Northwind UK', numberOfEmployees: '40', contactName: 'Ana Silva', contactEmail: 'ana@northwind.test' };
  const before = bcStore.db.registrations.length;
  const made = await bcApi(portalRegistrationSubmit, { body: registrationPayload(form) });
  expect(made).toMatchObject({ company_Name: 'Northwind Care', status: 'Pending' });
  expect(bcStore.db.registrations).toHaveLength(before + 1);
  expect(bcStore.db.registrations.at(-1)).toMatchObject({ tenantId: form.tenantId, contactEmail: 'ana@northwind.test', numberOfEmployees: 40 });
  const again = bcApi(portalRegistrationSubmit, { body: registrationPayload({ ...form, tenantId: form.tenantId.toUpperCase() }) });
  await expect(again).rejects.toMatchObject({ status: 409 });
  await again.catch((e: BcError) => { expect(e.message).toMatch(/^A registration for this tenant already exists\. CorrelationId: /); });
  /* the seed organisation's own tenant is already registered */
  await expect(bcApi(portalRegistrationSubmit, { body: registrationPayload({ ...form, tenantId: bcStore.db.authorization.tenantId }) })).rejects.toMatchObject({ status: 409 });
  expect(bcStore.db.registrations).toHaveLength(before + 1);
});

/* The admin pages' fake (Task 19): the portal users, the environment list
   with the admin's unquoted filter, a new environment kept, and an
   authorization whose sign-in address is this app's own callback. */
test('the admin fake: users, environments (unquoted filter), a new environment, the authorization and the registration', async () => {
  const users = await bcApi(portalUsersList);
  expect(users.value?.length).toBe(bcStore.db.portalUsers.length);
  expect(users.value?.find(u => u.email === 'dee.fitzgerald@brightpath.org')).toMatchObject({ isAdmin: true, status: 'Active', employeeNo: 'CP-1002' });
  const filtered = await bcApi(adminEnvironmentsList, { query: { $filter: adminRegistrationFilter(REGISTRATION_ID) } });
  expect(filtered.value?.map(e => e.id)).toEqual(['env-production-01', 'env-sandbox-01']);
  expect((await bcApi(adminEnvironmentsList, { query: { $filter: adminRegistrationFilter('REG-OTHER') } })).value).toEqual([]);
  const made = await bcApi(environmentCreate, { body: { name: 'Test', type: 'Test', url: 'https://bc/test', companyId: '', companyName: 'BrightPath Test' } });
  expect(made).toMatchObject({ name: 'Test', type: 'Test', status: 'Active', companyName: 'BrightPath Test' });
  expect((await bcApi(adminEnvironmentsList)).value?.map(e => e.name)).toEqual(['Production', 'Sandbox', 'Test']);
  const status = await bcApi(authStatus);
  expect(status).toMatchObject({ isAuthorized: true, status: 'active', diagnostics: { hasAccessToken: true, tokenStoredInBC: true } });
  const url = await bcApi(authUrl, { query: { registrationId: REGISTRATION_ID } });
  expect(url.authUrl).toMatch(/^http:\/\/localhost(:\d+)?\/auth\/callback\?status=success&tokenReceived=true&tokenStoredInBC=true&registrationId=REG-DEMO-0001&code_challenge=/);
  expect(url.registrationId).toBe(REGISTRATION_ID);
  const refreshed = await bcApi(authRefresh, { body: { registrationId: REGISTRATION_ID } });
  expect(Date.parse(refreshed?.expiresAt ?? '')).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  expect(await bcApi(portalRegistration)).toEqual({ id: REGISTRATION_ID, companyName: 'BrightPath Care Ltd', registrationDate: '2025-03-14' });
});

/* Setup · Employees' fake (Task 20): a new user starts pending, with the
   employee number Business Central's own record gives their email (never
   the Workforce side's, N19); an edit is kept; a duplicate email is refused. */
test('the portal users fake: add (pending, employee number from the BC record), edit, and a duplicate refused', async () => {
  const profile = bcStore.db.profiles[0];
  if (!profile) throw new Error('no BC profile in the seed');
  bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email.toLowerCase() !== profile.email.toLowerCase());
  const made = await bcApi(portalUserCreate, { body: { name: 'Back Again', email: profile.email.toLowerCase(), role: 'User', isAdmin: false } });
  expect(made).toMatchObject({ name: 'Back Again', status: 'PendingFirstLogin', isAdmin: false, role: 'User', employeeNo: profile.employeeNo, lastLogin: null });
  const stranger = await bcApi(portalUserCreate, { body: { name: 'No Record', email: 'no.record@elsewhere.org', role: 'Admin', isAdmin: true } });
  expect(stranger).toMatchObject({ employeeNo: '', isAdmin: true });
  await expect(bcApi(portalUserCreate, { body: { name: 'Twice', email: 'NO.RECORD@elsewhere.org', role: 'User', isAdmin: false } }))
    .rejects.toMatchObject({ status: 409, message: 'A portal user with this email address already exists.' });
  const edited = await bcApi(portalUserUpdate, { params: { userId: stranger.id ?? '' }, body: { name: 'Now Named', email: 'no.record@elsewhere.org', role: 'User', isAdmin: false } });
  expect(edited).toMatchObject({ id: stranger.id, name: 'Now Named', role: 'User', isAdmin: false, status: 'PendingFirstLogin' });
  await expect(bcApi(portalUserUpdate, { params: { userId: 'nobody' }, body: { name: 'X', email: 'x@y.z', role: 'User', isAdmin: false } })).rejects.toMatchObject({ status: 404 });
  const list = (await bcApi(portalUsersList)).value ?? [];
  expect(list.slice(-2).map(u => u.name)).toEqual(['Back Again', 'Now Named']);
  /* USERS.C4 is AUTH.C6's handler: one path, one handler */
  await bcApi(portalUserUpdateStatus, { params: { userId: stranger.id ?? '' }, body: { status: 'Inactive' } });
  expect(bcStore.db.portalUsers.find(u => u.id === stranger.id)?.status).toBe('Inactive');
});

test('/bc passes through when VITE_FAKE_BC is off', () => {
  expect(bcHandlersIfOn().length).toBeGreaterThan(0);
  vi.stubEnv('VITE_FAKE_BC', 'off');
  const list = bcHandlersIfOn();
  expect(list.filter(h => /\/(bc|session)\//.test(h.info.header))).toEqual([]);
  expect(list).toEqual([]);
});
