/* Setup › Business Central (docs/superpowers/inventory/admin.md): the
   overview (ADM.DASH), Environments (ENV), Authorization (AUTHZ) and Settings
   (SET), as Dee Fitzgerald (the social seed's admin, a portal admin) sees
   them, against the fake /bc and /api/v1. */
import type { ReactNode } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router';
import { tid } from '@/testids';
import { server } from '@/mocks/node';
import { bcStore, freshAuthorization, REGISTRATION_ID } from '@/mocks/bc/seed';
import { adminInstance } from '@/api/bc/admin';
import { DAY_MS } from '@/domain/admin';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs, signInEmail } from '@/test/api-helpers';
import { OverviewPage } from './OverviewPage';
import { EnvironmentsPage } from './EnvironmentsPage';
import { AuthorizationPage } from './AuthorizationPage';
import { SettingsPage } from './SettingsPage';

withFakeServer();
const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const PATH = new URL(BASE).pathname.replace(/\/$/, '');
let sent: { line: string; headers: Headers; body: Promise<string> }[] = [];
beforeEach(async () => {
  localStorage.clear();
  resetTo('social'); bcStore.reset(); adminInstance.setEnvironment(null);
  await signInAs('admin');
  sent = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (u.href.startsWith(BASE)) sent.push({ line: `${request.method} ${u.pathname.slice(PATH.length)}${u.search}`, headers: request.headers, body: request.clone().text() });
  });
});
afterEach(() => { server.events.removeAllListeners(); vi.restoreAllMocks(); vi.useRealTimers(); });
const calls = (prefix: string) => sent.filter(s => s.line.startsWith(prefix));
const text = (id: string) => screen.getByTestId(id).textContent;
const refuse = (method: 'get' | 'post', path: string, status = 500, body: unknown = { message: 'The service is down.' }) =>
  server.use(http[method](`${BASE}${path}`, () => HttpResponse.json(body as Record<string, unknown>, { status })));
function Where() { const l = useLocation(); return <output data-testid="where-now">{l.pathname + l.search}</output>; }
const withWhere = (ui: ReactNode) => <>{ui}<Where /></>;

/* ---------------- the overview ---------------- */

describe('ADM.DASH: the overview', () => {
  const open = async () => { renderPage(<OverviewPage />, '/setup/aoverview'); await screen.findByTestId(tid.aoverview.tenant); };

  test('ADM.DASH states (Ruling Q20): loading, then the tenant, the connection, the portal users strip, quick actions and the resources, with full test id coverage', async () => {
    renderPage(<OverviewPage />, '/setup/aoverview');
    expect(await screen.findByTestId(tid.aoverview.loading)).toHaveTextContent('Loading the overview…');
    await screen.findByTestId(tid.aoverview.tenant);
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Overview');
    expect(document.getElementById(`${tid.head.tip('aoverview')}-text`)).toHaveTextContent('Management console for the QniConnect employee portal.');
    const users = bcStore.db.portalUsers;
    expect(text(tid.aoverview.stat('users'))).toBe(String(users.length));
    /* Ruling Q20: the total heads the users strip; its "Active: n" line is the strip's own Active count */
    expect(screen.getByTestId(tid.aoverview.stat('users')).parentElement).toHaveTextContent(new RegExp(`^Total${users.length}$`));
    /* Ruling Q20: the connection leads, with Refresh authorization as its one primary action */
    const connection = within(screen.getByTestId(tid.aoverview.connection));
    for (const id of [tid.aoverview.stat('auth'), tid.aoverview.stat('environment'), tid.aoverview.stat('environments'), tid.aoverview.action('authorization')])
      expect(connection.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByTestId(tid.aoverview.action('authorization'))).toHaveTextContent(/^Refresh authorization$/);
    /* 67 days left of a 90-day term */
    const meter = screen.getByTestId(tid.aoverview.meter);
    expect(meter).toHaveAttribute('data-tone', 'ok');
    expect(meter.nextElementSibling?.querySelector('i')?.getAttribute('style')).toMatch(/width: 74\.4\d*%/);
    expect(text(tid.aoverview.stat('environments'))).toBe('2');
    expect(text(tid.aoverview.stat('auth'))).toBe('Active');
    expect(screen.getByTestId(tid.aoverview.stat('auth')).parentElement).toHaveTextContent('Remaining: 67 days');
    expect(text(tid.aoverview.stat('environment'))).toBe('Production');
    expect(screen.getByTestId(tid.aoverview.stat('environment')).parentElement).toHaveTextContent('Type: Production');
    /* 67 days: no warning */
    expect(screen.queryByTestId(tid.aoverview.expiry)).toBeNull();
    expect(screen.getByTestId(tid.aoverview.action('user'))).toHaveAttribute('href', '/setup/aemployees');
    expect(screen.getByTestId(tid.aoverview.action('environment'))).toHaveAttribute('href', '/setup/aenv');
    expect(screen.getByTestId(tid.aoverview.action('authorization'))).toHaveAttribute('href', '/setup/aauth');
    expect(screen.getByTestId(tid.aoverview.action('user'))).toHaveTextContent('Add userCreate a new portal user accountAdd user');
    expect(screen.getByTestId(tid.aoverview.usersAll)).toHaveAttribute('href', '/setup/aemployees');
    expect(text(tid.aoverview.tile('active'))).toBe(String(users.filter(u => u.status === 'Active').length));
    expect(text(tid.aoverview.tile('pending'))).toBe('1');
    expect(text(tid.aoverview.tile('inactive'))).toBe('0');
    for (const [id, href] of [['docs', 'https://learn.microsoft.com/en-us/dynamics365/business-central/'],
      ['s2s', 'https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication']] as const) {
      const a = screen.getByTestId(tid.aoverview.resource(id));
      expect(a).toHaveAttribute('href', href);
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(document.body).not.toHaveTextContent(/undefined|NaN|Invalid Date/);
    expectTestIdCoverage(document.body);
  });

  test('ADM.DASH.R8 (fixed): the tenant line names the tenant, and says when it registered', async () => {
    await open();
    expect(text(tid.aoverview.tenant)).toBe('Tenant: BrightPath Care Ltd · Registered: 14 Mar 2025');
  });

  test('ADM.DASH.R8 (fixed): with no registration, the environment name, and the date is unknown, not a made-up one', async () => {
    bcStore.db.registration = { id: '', companyName: '', registrationDate: '' };
    await open();
    expect(text(tid.aoverview.tenant)).toBe('Tenant: Production · Registered: Unknown');
  });

  test('ADM.DASH.R1 and ADM.DASH.R2: the four calls, in order, carry the session\'s environment; the stored environment is not rewritten', async () => {
    const stored = localStorage.getItem('activeEnvironment');
    await open();
    expect(sent.map(s => s.line).filter(l => !l.startsWith('POST /bc/portalUsers/verify') && !l.startsWith('POST /session/init')).slice(-4)).toEqual([
      'GET /bc/portalUsers', `GET /bc/environments?$filter=registrationId%20eq%20${REGISTRATION_ID}`,
      `GET /auth/status?registrationId=${REGISTRATION_ID}`, 'GET /bc/portalRegistrations']);
    for (const s of sent.slice(-4)) expect(s.headers.get('X-BC-Environment')).toBe('env-production-01');
    expect(localStorage.getItem('activeEnvironment')).toBe(stored);
  });

  test('ADM.DASH.R3: a failing call shows its zeros or "Unknown" and the rest still load; no error page', async () => {
    refuse('get', '/bc/portalUsers');
    refuse('get', '/auth/status');
    await open();
    expect(text(tid.aoverview.stat('users'))).toBe('0');
    expect(text(tid.aoverview.stat('environments'))).toBe('2');
    expect(text(tid.aoverview.stat('auth'))).toBe('Unknown');
    expect(screen.getByTestId(tid.aoverview.stat('auth')).parentElement).toHaveTextContent('Expiry unknown');
    /* no term to measure against, so no meter */
    expect(screen.queryByTestId(tid.aoverview.meter)).toBeNull();
    /* no expiry counts as none left (ADM.DASH.R6), so it asks for a refresh */
    expect(screen.getByTestId(tid.aoverview.expiry)).toHaveTextContent('Authorization needs refreshing');
    expect(text(tid.aoverview.tenant)).toMatch(/^Tenant: BrightPath Care Ltd/);
  });

  test('ADM.DASH.R4 and ADM.DASH.R7: exact statuses are counted, and no active users is a named zero, not a bare "0"', async () => {
    for (const u of bcStore.db.portalUsers) u.status = 'Inactive';
    const first = bcStore.db.portalUsers[0];
    if (first) first.status = 'PendingFirstLogin';
    await open();
    /* Ruling Q20: R7's "Active: 0" is the strip's Active count, under its name */
    expect(screen.getByTestId(tid.aoverview.tile('active')).parentElement).toHaveTextContent(/^Active0$/);
    expect(text(tid.aoverview.tile('active'))).toBe('0');
    expect(text(tid.aoverview.tile('pending'))).toBe('1');
    expect(text(tid.aoverview.tile('inactive'))).toBe(String(bcStore.db.portalUsers.length - 1));
  });

  test('ADM.DASH.R5 and ADM.DASH.R6: 10 days left is a warning; 5 days is an error; both link to Authorization', async () => {
    bcStore.db.authorization = freshAuthorization(Date.now(), 80, 10);
    const { unmount } = renderPage(<OverviewPage />, '/setup/aoverview');
    const alert = await screen.findByTestId(tid.aoverview.expiry);
    expect(alert).toHaveClass('text-warn');
    /* Ruling Q20: the banner sits in the connection block */
    expect(within(screen.getByTestId(tid.aoverview.connection)).getByTestId(tid.aoverview.expiry)).toBe(alert);
    expect(screen.getByTestId(tid.aoverview.meter)).toHaveAttribute('data-tone', 'warn');
    expect(alert).toHaveTextContent('Authorization expiring soon');
    expect(alert).toHaveTextContent('The Business Central authorization expires in 10 days. Refresh it so the portal keeps uninterrupted access to Business Central.');
    expect(screen.getByTestId(tid.aoverview.expiryLink)).toHaveAttribute('href', '/setup/aauth');
    expect(screen.getByTestId(tid.aoverview.stat('auth'))).toHaveClass('text-warn');
    unmount();
    bcStore.db.authorization = freshAuthorization(Date.now(), 85, 5);
    renderPage(<OverviewPage />, '/setup/aoverview');
    expect(await screen.findByTestId(tid.aoverview.expiry)).toHaveClass('text-err');
    expect(screen.getByTestId(tid.aoverview.stat('auth'))).toHaveClass('text-warn');
    expect(screen.getByTestId(tid.aoverview.stat('auth')).parentElement).toHaveTextContent('Remaining: 5 days');
  });

  test('ADM.DASH.R5: an expired status is red whatever its days', async () => {
    bcStore.db.authorization = { ...freshAuthorization(), status: 'Expired' };
    await open();
    expect(screen.getByTestId(tid.aoverview.stat('auth'))).toHaveClass('text-err');
    expect(text(tid.aoverview.stat('auth'))).toBe('Expired');
  });

  test('ADM.DASH.R11 and R12: nothing refreshes on its own; and the people links show only to someone who can open Setup · Employees', async () => {
    /* an employee who is a portal admin: no Workforce setup, but People &
       access's portal-login half is theirs (Task 20, N18), so the links are */
    const amara = bcStore.db.portalUsers.find(u => u.email === 'amara.okafor@brightpath.org');
    if (!amara) throw new Error('no Amara in the fake portal users');
    amara.isAdmin = true;
    await signInEmail('amara.okafor@brightpath.org');
    await open();
    expect(screen.getByTestId(tid.aoverview.action('user'))).toHaveAttribute('href', '/setup/aemployees');
    expect(screen.getByTestId(tid.aoverview.usersAll)).toHaveAttribute('href', '/setup/aemployees');
    expect(screen.getByTestId(tid.aoverview.action('environment'))).toBeInTheDocument();
    const n = calls('GET /bc/portalUsers').length;
    await new Promise(r => setTimeout(r, 300));
    expect(calls('GET /bc/portalUsers').length).toBe(n);
  });
});

/* ---------------- Environments ---------------- */

describe('ENV: environments', () => {
  const open = async () => { renderPage(<EnvironmentsPage />, '/setup/aenv'); return screen.findByTestId(tid.aenv.list); };
  /* the page's own reads: the admin filter has no apostrophes (sign-in's AUTH.C4 has) */
  const envCalls = () => calls('GET /bc/environments').filter(c => !c.line.includes('%27')).length;

  test('ENV states: loading, then one row per environment, with its type, URL, version and last sync; full test id coverage', async () => {
    renderPage(<EnvironmentsPage />, '/setup/aenv');
    expect(await screen.findByTestId(tid.aenv.loading)).toHaveTextContent('Loading the environments…');
    await screen.findByTestId(tid.aenv.list);
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Environments');
    expect(document.getElementById(`${tid.head.tip('aenv')}-text`)).toHaveTextContent('Manage your Business Central environments.');
    const prod = screen.getByTestId(tid.aenv.row('env-production-01'));
    expect(prod).toHaveTextContent('Production');
    expect(prod).toHaveTextContent('https://businesscentral.dynamics.com/production');
    expect(prod).toHaveTextContent('Unknown version');
    expect(prod).toHaveTextContent('Last synchronised: Never');
    expect(screen.getByTestId(tid.aenv.row('env-sandbox-01'))).toHaveTextContent('Sandbox');
    /* no default until one is set here (ENV.R7) */
    expect(screen.queryByText('Default')).toBeNull();
    expectTestIdCoverage(document.body);
  });

  test('ENV.R1: the list is read once when the page opens, and not again after adding', async () => {
    await open();
    expect(envCalls()).toBe(1);
    await userEvent.click(screen.getByTestId(tid.aenv.add));
    await userEvent.type(screen.getByTestId(tid.aenv.name), 'Test');
    await userEvent.type(screen.getByTestId(tid.aenv.url), 'https://bc/test');
    await userEvent.type(screen.getByTestId(tid.aenv.companyName), 'BrightPath Test');
    await userEvent.click(screen.getByTestId(tid.aenv.save));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    expect(envCalls()).toBe(1);
  });

  test('ENV.C1 failure: "Failed to load environments. Please try again." and the empty state', async () => {
    refuse('get', '/bc/environments');
    renderPage(<EnvironmentsPage />, '/setup/aenv');
    expect(await screen.findByTestId(tid.aenv.error)).toHaveTextContent('Failed to load environments. Please try again.');
    expect(screen.getByTestId(tid.aenv.empty)).toBeInTheDocument();
  });

  test('ENV empty: "No environments found." with a way to add the first', async () => {
    bcStore.db.environments = bcStore.db.environments.map(e => ({ ...e, registrationId: 'REG-OTHER' }));
    renderPage(<EnvironmentsPage />, '/setup/aenv');
    const empty = await screen.findByTestId(tid.aenv.empty);
    expect(empty).toHaveTextContent('No environments found.Get started by adding your first environment.');
    await userEvent.click(within(empty).getByTestId(tid.aenv.emptyAdd));
    expect(await screen.findByTestId(tid.modal.title)).toHaveTextContent('Add environment');
  });

  test('ENV.R2: without a name, URL and company name nothing is sent; whitespace passes, as typed', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.aenv.add));
    expect(await screen.findByTestId(tid.modal.root)).toHaveTextContent('Connect a new Business Central environment to your portal.');
    expectTestIdCoverage(document.body);
    await userEvent.type(screen.getByTestId(tid.aenv.name), 'Prod');
    await userEvent.click(screen.getByTestId(tid.aenv.save));
    expect(screen.getByTestId(tid.aenv.formError)).toHaveTextContent('Name, URL and company name are required. Fill them in to add the environment.');
    expect(calls('POST /bc/environments')).toEqual([]);
  });

  test('ENV.R3 and ENV.C2: added as typed, appended to the list, the dialog closes', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.aenv.add));
    await userEvent.type(screen.getByTestId(tid.aenv.name), ' Test ');
    await userEvent.click(screen.getByTestId(tid.aenv.type));
    await userEvent.click(await screen.findByTestId(`${tid.aenv.type}-option-Development`));
    await userEvent.type(screen.getByTestId(tid.aenv.url), 'https://bc/test');
    await userEvent.type(screen.getByTestId(tid.aenv.companyName), 'BrightPath Test');
    await userEvent.click(screen.getByTestId(tid.aenv.save));
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    expect(await calls('POST /bc/environments')[0]?.body).toBe('{"name":" Test ","type":"Development","url":"https://bc/test","companyId":"","companyName":"BrightPath Test"}');
    const rows = within(screen.getByTestId(tid.aenv.list)).getAllByRole('listitem');
    expect(rows.map(r => r.querySelector('b')?.textContent)).toEqual(['Production', 'Sandbox', ' Test ']);
  });

  test('ENV.R3: a refusal keeps the dialog open with what the server said', async () => {
    refuse('post', '/bc/environments', 409, { message: 'An environment with that name already exists.' });
    await open();
    await userEvent.click(screen.getByTestId(tid.aenv.add));
    await userEvent.type(screen.getByTestId(tid.aenv.name), 'Production');
    await userEvent.type(screen.getByTestId(tid.aenv.url), 'https://bc/p');
    await userEvent.type(screen.getByTestId(tid.aenv.companyName), 'C');
    await userEvent.click(screen.getByTestId(tid.aenv.save));
    expect(await screen.findByTestId(tid.aenv.formError)).toHaveTextContent('An environment with that name already exists.');
    expect(screen.getByTestId(tid.modal.root)).toBeInTheDocument();
  });

  test('ENV.R4: Enter in a field adds the environment', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.aenv.add));
    await userEvent.type(screen.getByTestId(tid.aenv.name), 'Test');
    await userEvent.type(screen.getByTestId(tid.aenv.url), 'https://bc/test');
    await userEvent.type(screen.getByTestId(tid.aenv.companyName), 'C{Enter}');
    await waitFor(() => expect(calls('POST /bc/environments')).toHaveLength(1));
  });

  test('ENV.R5, ENV.R8 to ENV.R10: each row offers Set as default and Open; Sync, Edit and Delete (which did nothing) are not offered', async () => {
    const list = await open();
    for (const row of within(list).getAllByRole('listitem')) {
      expect(within(row).getAllByRole('button').map(b => b.textContent)).toEqual(['Set as default']);
      expect(within(row).getAllByRole('link')).toHaveLength(1);
    }
    expect(screen.queryByText(/Sync Environment|Edit Environment|Delete Environment/i)).toBeNull();
  });

  test('ENV.R6 and ENV.R7: Set as default marks that one only, moves this session to it (no activate call, no "true" company), and later calls carry it', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.aenv.setDefault('env-sandbox-01')));
    expect(screen.getByTestId(tid.aenv.isDefault('env-sandbox-01'))).toHaveTextContent('Default');
    expect(screen.queryByTestId(tid.aenv.isDefault('env-production-01'))).toBeNull();
    expect(screen.queryByTestId(tid.aenv.setDefault('env-sandbox-01'))).toBeNull();
    expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toEqual({
      id: 'env-sandbox-01', name: 'Sandbox', type: 'Sandbox', url: 'https://businesscentral.dynamics.com/sandbox', companyName: '' });
    /* Sandbox has no company yet: the old one's is not kept */
    expect(localStorage.getItem('clientCompanyId')).toBeNull();
    expect(sent.some(s => s.line.includes('/activate'))).toBe(false);
    await userEvent.click(screen.getByTestId(tid.aenv.setDefault('env-production-01')));
    expect(localStorage.getItem('clientCompanyId')).toBe('6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01');
    expect(adminInstance.environment()).toBe('env-production-01');
  });

  test('ENV.R11: Open goes to the environment\'s own address in a new tab', async () => {
    await open();
    const a = screen.getByTestId(tid.aenv.open('env-production-01'));
    expect(a).toHaveAttribute('href', 'https://businesscentral.dynamics.com/production');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).toHaveAccessibleName('Open Production in a new tab');
  });

  /* Task 24: QniConnect's Open had href undefined with no address, a button that did nothing */
  test('ENV.R11: an environment with no address has no Open button', async () => {
    bcStore.db.environments.push({ id: 'env-nourl-01', name: 'No address', type: 'Sandbox', url: '', status: 'Active', companyName: '', company_Id: '', registrationId: 'REG-DEMO-0001' });
    await open();
    expect(screen.getByTestId(tid.aenv.row('env-nourl-01'))).toBeInTheDocument();
    expect(screen.queryByTestId(tid.aenv.open('env-nourl-01'))).toBeNull();
    expect(screen.getByTestId(tid.aenv.open('env-production-01'))).toBeInTheDocument();
  });
});

/* ---------------- Authorization ---------------- */

describe('AUTHZ: authorization', () => {
  const open = async (path = '/setup/aauth') => { renderPage(withWhere(<AuthorizationPage />), path); return screen.findByTestId(tid.aauth.card); };
  const message = () => screen.getByTestId(tid.aauth.message).textContent;
  const success = (data: unknown, origin = window.location.origin) =>
    act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin })); });

  test('AUTHZ states: loading, then the authorization\'s details with its status and expiry, tokens masked; the how-to; full test id coverage', async () => {
    renderPage(<AuthorizationPage />, '/setup/aauth');
    expect(await screen.findByTestId(tid.aauth.loading)).toHaveTextContent('Loading the authorization…');
    await screen.findByTestId(tid.aauth.details);
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Authorization');
    const a = bcStore.db.authorization;
    expect(text(tid.aauth.field('clientId'))).toBe(a.clientId);
    expect(text(tid.aauth.field('tenantId'))).toBe(a.tenantId);
    expect(text(tid.aauth.field('environment'))).toBe('Production');
    expect(text(tid.aauth.field('scope'))).toBe('https://api.businesscentral.dynamics.com/.default');
    expect(text(tid.aauth.status)).toBe('Active');
    expect(text(tid.aauth.expiry)).toBe('67 days remaining');
    expect(screen.getByTestId(tid.aauth.accessToken)).toHaveAttribute('type', 'password');
    expect(screen.getByTestId(tid.aauth.accessToken)).toHaveValue(a.accessToken);
    const guide = screen.getByTestId(tid.aauth.guide);
    expect(guide).toHaveTextContent('How to authorize Business Central');
    expect(guide).toHaveTextContent('A Microsoft sign-in window opens.');
    expect(guide).toHaveTextContent('Access token: Used to make API calls to Business Central. Valid for 1 hour.');
    expect(guide).toHaveTextContent('If the refresh token expires, you will need to perform a full authorization again.');
    expect(screen.getByTestId(tid.aauth.docsLink)).toHaveAttribute('href', 'https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication');
    expect(screen.queryByText('QniConnect Authentication Guide')).toBeNull();
    expect(screen.queryByTestId(tid.aauth.message)).toBeNull();
    expectTestIdCoverage(document.body);
  });

  test('AUTHZ.R1: the callback\'s address is read, its registration id kept, its message shown, and the address cleaned', async () => {
    await open('/setup/aauth?status=success&tokenReceived=true&tokenStoredInBC=true&registrationId=REG-NEW&timestamp=1');
    expect(message()).toBe('Authorization completed and tokens stored successfully in Business Central!');
    expect(localStorage.getItem('registrationId')).toBe('REG-NEW');
    await waitFor(() => expect(screen.getByTestId('where-now')).toHaveTextContent(/^\/setup\/aauth$/));
    expect(calls('GET /auth/status')).toHaveLength(1);
  });

  test('AUTHZ.R1: an error from the callback says its message', async () => {
    await open('/setup/aauth?status=error&message=Consent%20was%20declined');
    expect(message()).toBe('Consent was declined');
  });

  test('AUTHZ.R2: after a success, a status without an access token says the tokens may not be stored', async () => {
    bcStore.db.authorization.diagnostics.hasAccessToken = false;
    await open('/setup/aauth?status=success&tokenReceived=true&tokenStoredInBC=true');
    await waitFor(() => expect(message()).toBe('Authorization completed but tokens may not have been stored correctly. Please try again.'));
  });

  test('AUTHZ.R3: a status that cannot be read says so, over the Not authorized view', async () => {
    refuse('get', '/auth/status');
    await open('/setup/aauth?status=success&tokenReceived=true&tokenStoredInBC=true');
    expect(message()).toBe('Failed to load authorization data. Please try again.');
    expect(screen.getByTestId(tid.aauth.notAuthorized)).toHaveTextContent('Not authorizedThe application is not currently authorized to access Business Central.Start authorization');
  });

  test('AUTHZ.R4: Refresh token sends the refresh, shows the answer and says so; a refusal says what the server said', async () => {
    await open();
    await screen.findByTestId(tid.aauth.details);
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    await waitFor(() => expect(message()).toBe('Token refreshed successfully!'));
    expect(text(tid.aauth.expiry)).toBe('90 days remaining');
    expect(await calls('POST /auth/refresh')[0]?.body).toBe(`{"registrationId":"${REGISTRATION_ID}"}`);
    refuse('post', '/auth/refresh', 400, { message: 'The refresh token has expired.' });
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    await waitFor(() => expect(message()).toBe('The refresh token has expired.'));
    refuse('post', '/auth/refresh', 502, 'gateway');
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    await waitFor(() => expect(message()).toBe('API Error: 502'));
  });

  test('AUTHZ.R4: while refreshing, the button says so and does not send twice', async () => {
    server.use(http.post(`${BASE}/auth/refresh`, async () => { await new Promise(r => setTimeout(r, 150)); return HttpResponse.json({ isAuthorized: true }); }));
    await open();
    await screen.findByTestId(tid.aauth.details);
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    expect(screen.getByTestId(tid.aauth.refresh)).toHaveTextContent('Refreshing…');
    expect(screen.getByTestId(tid.aauth.refresh)).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    await waitFor(() => expect(screen.getByTestId(tid.aauth.refresh)).toHaveTextContent('Refresh token'));
    expect(calls('POST /auth/refresh')).toHaveLength(1);
  });

  test('AUTHZ.R5: a refresh answer without isAuthorized shows Not authorized', async () => {
    server.use(http.post(`${BASE}/auth/refresh`, () => HttpResponse.json({ accessToken: 'a', refreshToken: 'r', expiresAt: new Date(Date.now() + 90 * DAY_MS).toISOString() })));
    await open();
    await screen.findByTestId(tid.aauth.details);
    await userEvent.click(screen.getByTestId(tid.aauth.refresh));
    expect(await screen.findByTestId(tid.aauth.notAuthorized)).toBeInTheDocument();
  });

  test('AUTHZ.R6 to R8, R10 and R12: Start authorization opens Microsoft\'s sign-in with consent in an 800 by 600 popup, closes the dialog and says so', async () => {
    const popup = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await open();
    await userEvent.click(screen.getByTestId(tid.aauth.start));
    const dialog = await screen.findByTestId(tid.modal.root);
    expect(dialog).toHaveTextContent('You are about to start a new authorization flow with Microsoft.');
    expect(dialog).toHaveTextContent('Administrator privileges required');
    expectTestIdCoverage(document.body);
    await userEvent.click(screen.getByTestId(tid.aauth.begin));
    await waitFor(() => expect(popup).toHaveBeenCalledTimes(1));
    const [url, target, features] = popup.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/auth\/callback\?status=success&.*code_challenge=fake-pkce-challenge.*&prompt=consent$/);
    expect([target, features]).toEqual(['_blank', 'width=800,height=600']);
    await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    expect(message()).toBe('Authorization window opened. Please complete the login process in the new window.');
    expect(localStorage.getItem('registrationId')).toBe(REGISTRATION_ID);
  });

  test('AUTHZ.R7: an address with no PKCE challenge opens nothing and says so; the dialog stays open (R13)', async () => {
    const popup = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    server.use(http.get(`${BASE}/auth/bc-auth-url`, () => HttpResponse.json({ authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x&scope=y' })));
    await open();
    await userEvent.click(screen.getByTestId(tid.aauth.start));
    await userEvent.click(await screen.findByTestId(tid.aauth.begin));
    await waitFor(() => expect(message()).toBe('PKCE setup failed. Authorization URL is missing required parameters.'));
    expect(popup).not.toHaveBeenCalled();
    expect(screen.getByTestId(tid.modal.root)).toHaveTextContent('PKCE setup failed.');
  });

  test('AUTHZ.R10: a blocked popup says to allow popups', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await open();
    await userEvent.click(screen.getByTestId(tid.aauth.start));
    await userEvent.click(await screen.findByTestId(tid.aauth.begin));
    await waitFor(() => expect(message()).toBe('The authorization window was blocked by your browser. Please allow popups for this site.'));
    expect(screen.getByTestId(tid.modal.root)).toBeInTheDocument();
  });

  test('AUTHZ.R11 (fixed) and AUTHZ.R13: no address is "Failed to get authorization URL from the server."; a refusal says the server\'s words', async () => {
    const popup = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    server.use(http.get(`${BASE}/auth/bc-auth-url`, () => HttpResponse.json({ registrationId: REGISTRATION_ID })));
    await open();
    await userEvent.click(screen.getByTestId(tid.aauth.start));
    await userEvent.click(await screen.findByTestId(tid.aauth.begin));
    await waitFor(() => expect(message()).toBe('Failed to get authorization URL from the server.'));
    refuse('get', '/auth/bc-auth-url', 503, { message: 'Authorization is unavailable.' });
    await userEvent.click(screen.getByTestId(tid.aauth.begin));
    await waitFor(() => expect(message()).toBe('Authorization is unavailable.'));
    expect(popup).not.toHaveBeenCalled();
  });

  test('AUTHZ.R12 and AUTHZ.R14: the callback\'s AUTH_SUCCESS (from this app only) reads the status again and says how it went', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await open();
    await userEvent.click(screen.getByTestId(tid.aauth.start));
    await userEvent.click(await screen.findByTestId(tid.aauth.begin));
    await waitFor(() => expect(message()).toMatch(/^Authorization window opened/));
    const before = calls('GET /auth/status').length;
    /* another origin, and AUTH_ERROR, are ignored */
    success({ type: 'AUTH_SUCCESS', registrationId: 'REG-EVIL' }, 'https://evil.example');
    success({ type: 'AUTH_ERROR', error: 'x' });
    expect(localStorage.getItem('registrationId')).toBe(REGISTRATION_ID);
    expect(calls('GET /auth/status')).toHaveLength(before);
    success({ type: 'AUTH_SUCCESS', registrationId: 'REG-9', tokenReceived: true, tokenStoredInBC: true });
    expect(message()).toBe('Authorization completed successfully! Refreshing data...');
    await waitFor(() => expect(message()).toBe('Authorization completed and tokens stored successfully in Business Central!'));
    expect(localStorage.getItem('registrationId')).toBe('REG-9');
    expect(calls('GET /auth/status')).toHaveLength(before + 1);
    /* the listener is gone once it has answered */
    success({ type: 'AUTH_SUCCESS' });
    expect(message()).toBe('Authorization completed and tokens stored successfully in Business Central!');
    await new Promise(r => setTimeout(r, 100));
    expect(calls('GET /auth/status')).toHaveLength(before + 1);
  });

  test('AUTHZ.R14: stored in memory only is a warning; no access token is an error; a status that cannot be read says verify failed', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const begin = async () => {
      await userEvent.click(screen.getByTestId(tid.aauth.start));
      await userEvent.click(await screen.findByTestId(tid.aauth.begin));
      await waitFor(() => expect(message()).toMatch(/^Authorization window opened/));
    };
    await open();
    await begin();
    bcStore.db.authorization.diagnostics.tokenStoredInBC = false;
    success({ type: 'AUTH_SUCCESS' });
    await waitFor(() => expect(message()).toBe('Authorization completed and tokens stored in memory, but failed to store in Business Central. Some features may not work correctly.'));
    await begin();
    bcStore.db.authorization = { ...bcStore.db.authorization, isAuthorized: false, diagnostics: { hasAccessToken: false, hasRefreshToken: false, tokenStoredInBC: false } };
    success({ type: 'AUTH_SUCCESS' });
    await waitFor(() => expect(message()).toBe('Authorization started but token storage failed. Please check server logs and try again.'));
    await begin();
    refuse('get', '/auth/status');
    success({ type: 'AUTH_SUCCESS' });
    await waitFor(() => expect(message()).toBe('Authorization may have failed. Unable to verify token status. Please refresh and try again.'));
  });

  test('AUTHZ.R12 (fixed): one listener at a time, removed when the page closes', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderPage(<AuthorizationPage />, '/setup/aauth');
    await screen.findByTestId(tid.aauth.details);
    for (let i = 0; i < 2; i++) {
      await userEvent.click(screen.getByTestId(tid.aauth.start));
      await userEvent.click(await screen.findByTestId(tid.aauth.begin));
      await waitFor(() => expect(screen.queryByTestId(tid.modal.root)).toBeNull());
    }
    const listeners = () => added.mock.calls.filter(c => c[0] === 'message').length - removed.mock.calls.filter(c => c[0] === 'message').length;
    expect(listeners()).toBe(1);
    unmount();
    expect(listeners()).toBe(0);
  });

  test('AUTHZ.R15 to R17: masked by default; one Show reveals both tokens; Copy copies and says so for two seconds; a failed copy says so', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await open();
    await screen.findByTestId(tid.aauth.details);
    expect(screen.getByTestId(tid.aauth.refreshToken)).toHaveAttribute('type', 'password');
    const show = screen.getByTestId(tid.aauth.show);
    expect(show).toHaveAccessibleName('Show tokens');
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(show);
    expect(screen.getByTestId(tid.aauth.accessToken)).toHaveAttribute('type', 'text');
    expect(screen.getByTestId(tid.aauth.refreshToken)).toHaveAttribute('type', 'text');
    expect(show).toHaveAccessibleName('Hide tokens');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByTestId(tid.aauth.copy('access')));
    await waitFor(() => expect(text(tid.aauth.copied('access'))).toBe('Access token copied'));
    expect(write).toHaveBeenCalledWith(bcStore.db.authorization.accessToken);
    act(() => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(text(tid.aauth.copied('access'))).toBe(''));
    write.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByTestId(tid.aauth.copy('refresh')));
    await waitFor(() => expect(text(tid.aauth.copied('refresh'))).toBe('Could not copy'));
  });

  test('AUTHZ.R18: after "Set as default" on Environments, the authorization\'s calls carry that environment', async () => {
    adminInstance.setEnvironment('env-sandbox-01');
    await open();
    expect(calls('GET /auth/status').at(-1)?.headers.get('X-BC-Environment')).toBe('env-sandbox-01');
  });
});

/* ---------------- Settings ---------------- */

describe('SET: settings', () => {
  const open = () => { renderPage(<SettingsPage />, '/setup/asettings'); return screen.findByTestId(tid.asettings.save); };
  const stored = () => JSON.parse(localStorage.getItem('adminSettings') ?? 'null') as unknown;

  test('SET states and SET.R1: the defaults, every field, a note that they stay in this browser; full test id coverage', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Settings');
    expect(screen.getByTestId(tid.asettings.defaultEnvironment)).toHaveValue('');
    expect(screen.getByTestId(tid.asettings.notifications)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.asettings.autoRefresh)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.asettings.interval)).toHaveValue('15');
    expect(screen.getByTestId(tid.asettings.debug)).toHaveAttribute('aria-checked', 'false');
    expect(text(tid.asettings.note)).toBe('These settings are kept in this browser only, and nothing in the portal uses them yet.');
    expect(document.body).toHaveTextContent('The default environment to select when users log in');
    expectTestIdCoverage(document.body);
  });

  test('SET.R2 (fixed): stored settings are read, laid over the defaults', async () => {
    localStorage.setItem('adminSettings', JSON.stringify({ defaultEnvironment: 'Sandbox', enableNotifications: false }));
    await open();
    expect(screen.getByTestId(tid.asettings.defaultEnvironment)).toHaveValue('Sandbox');
    expect(screen.getByTestId(tid.asettings.notifications)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId(tid.asettings.interval)).toHaveValue('15');
  });

  test('SET.R3 and SET.R4: Save keeps the settings in this browser and says so; an interval outside 1 to 60 is refused and nothing saved', async () => {
    await open();
    await userEvent.selectOptions(screen.getByTestId(tid.asettings.defaultEnvironment), 'Production');
    await userEvent.click(screen.getByTestId(tid.asettings.notifications));
    const interval = screen.getByTestId(tid.asettings.interval);
    await userEvent.clear(interval);
    await userEvent.click(screen.getByTestId(tid.asettings.save));
    expect(screen.getByText('Enter a whole number of minutes from 1 to 60.')).toBeInTheDocument();
    expect(interval).toHaveAttribute('aria-invalid', 'true');
    expect(stored()).toBeNull();
    await userEvent.type(interval, '30');
    await userEvent.click(screen.getByTestId(tid.asettings.save));
    expect(text(tid.asettings.message)).toBe('Settings saved successfully');
    expect(stored()).toEqual({ defaultEnvironment: 'Production', enableNotifications: false, autoRefreshData: true, refreshInterval: 30, debugMode: false });
  });

  test('SET.R4: storage that refuses says so', async () => {
    await open();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    await userEvent.click(screen.getByTestId(tid.asettings.save));
    expect(text(tid.asettings.message)).toBe('Failed to save settings: Quota exceeded');
  });

  test('SET.R5: the default environment is one of Production, Sandbox and Development, or none', async () => {
    await open();
    const options = [...(screen.getByTestId(tid.asettings.defaultEnvironment) as HTMLSelectElement).options].map(o => [o.value, o.textContent]);
    expect(options).toEqual([['', 'Select a default environment'], ['Production', 'Production'], ['Sandbox', 'Sandbox'], ['Development', 'Development']]);
  });

  test('SET.R6 (fixed): "Settings saved" clears after three seconds, every time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open();
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByTestId(tid.asettings.save));
      expect(text(tid.asettings.message)).toBe('Settings saved successfully');
      act(() => { vi.advanceTimersByTime(2900); });
      expect(screen.getByTestId(tid.asettings.message)).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.queryByTestId(tid.asettings.message)).toBeNull();
    }
  });

  test('SET.R7 (fixed): Reset goes back to what was last saved, or to the defaults when nothing was', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.asettings.autoRefresh));
    expect(screen.queryByTestId(tid.asettings.interval)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.asettings.reset));
    expect(screen.getByTestId(tid.asettings.autoRefresh)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.asettings.interval)).toHaveValue('15');
    await userEvent.selectOptions(screen.getByTestId(tid.asettings.defaultEnvironment), 'Sandbox');
    await userEvent.click(screen.getByTestId(tid.asettings.save));
    await userEvent.selectOptions(screen.getByTestId(tid.asettings.defaultEnvironment), 'Development');
    await userEvent.click(screen.getByTestId(tid.asettings.reset));
    expect(screen.getByTestId(tid.asettings.defaultEnvironment)).toHaveValue('Sandbox');
    expect(screen.queryByTestId(tid.asettings.message)).toBeNull();
  });

  test('SET.R8 and SET.R9: the interval only while auto-refresh is on; switching it off keeps the saved interval; nothing else reads the settings', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.asettings.autoRefresh));
    expect(screen.queryByTestId(tid.asettings.interval)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.asettings.save));
    expect(stored()).toMatchObject({ autoRefreshData: false, refreshInterval: 15 });
    /* debug mode is development only: the test build is one */
    expect(import.meta.env.DEV).toBe(true);
    expect(screen.getByTestId(tid.asettings.debug)).toBeInTheDocument();
  });
});
