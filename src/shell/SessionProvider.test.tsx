/* The one session (spec section 6, inventory AUTH): the Microsoft account,
   the QniConnect portal check (/bc/portalUsers/verify, then /session/init),
   then the Workforce session (GET /api/v1/session). Signed in through the
   auth stub, as every test is, with its navigations replaced by spies. */
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { server } from '@/mocks/node';
import { queryClient } from '@/api/query';
import { api } from '@/api/client';
import { bcEvents } from '@/api/bc/events';
import { getTenant } from '@/contract/tenant';
import { logger } from '@/lib/logger';
import { setAuth } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { Toaster } from '@/ui/shadcn/sonner';
import { bcStore, REGISTRATION_ID } from '@/mocks/bc/seed';
import { accountOf, fault, resetTo, setSeedEnvironment, setStubAccount, testAuth, type Persona } from '@/test/api-helpers';
import { SessionProvider, usePortal, useSession } from './SessionProvider';

const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const VERIFY = `${BASE}/bc/portalUsers/verify`;
const NOT_REGISTERED = 'Your account is not registered in QniConnect. Please contact your administrator.';

const spies = { signIn: vi.fn(async () => undefined), reauthenticate: vi.fn(async () => undefined), signOut: vi.fn(async () => undefined) };
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetTo('social');
  bcStore.reset();
  queryClient.clear();
  for (const s of Object.values(spies)) s.mockClear();
  setAuth({ ...testAuth, ...spies });
});
afterEach(() => { server.resetHandlers(); server.events.removeAllListeners(); vi.useRealTimers(); });

/* What the provider holds, as text a test can read. */
function Probe() {
  const { ready, session, environment, unmatched } = useSession();
  const portal = usePortal();
  return <pre data-testid="probe">{JSON.stringify({ ready, email: session?.account.email ?? null, environment: environment?.id ?? null, unmatched, portal })}</pre>;
}
interface Probed { ready: boolean; email: string | null; environment: string | null; unmatched: boolean;
  portal: { user: { email: string; id?: string; isAdmin?: unknown } | null; isAdmin: boolean; adminVerified: boolean; pendingFirstLogin: boolean; error: string | null } }
const probe = (): Probed => JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as Probed;
const mount = () => render(
  <QueryClientProvider client={queryClient}><MemoryRouter><SessionProvider><Probe /></SessionProvider></MemoryRouter><Toaster /></QueryClientProvider>);
const signInAccount = (p: Persona) => { const a = accountOf(p); setStubAccount(a.email); return a; };
/* Holds every portal check until release() is called, answering it as the fake would. */
function holdVerify() {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let calls = 0;
  server.use(http.post(VERIFY, async ({ request }) => {
    calls++;
    const body = (await request.json()) as { email: string };
    await gate;
    const u = bcStore.userByEmail(body.email);
    return HttpResponse.json(u ? { exists: true, isActive: true, userData: { ...u } } : { exists: false });
  }));
  return { release: () => release(), calls: () => calls };
}

test('signs in: verify, then session init, then the Workforce session', async () => {
  const admin = signInAccount('admin');
  setSeedEnvironment();
  const order: string[] = [];
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/bc/portalUsers/verify' || pathname === '/session/init' || (pathname === '/api/v1/session' && request.method === 'GET')) order.push(pathname);
  });
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  expect(order).toEqual(['/bc/portalUsers/verify', '/session/init', '/api/v1/session']);
  const p = probe();
  expect(p.email).toBe(admin.email);
  expect(p.environment).toBe('env-production-01');
  expect(p.portal).toMatchObject({ isAdmin: true, adminVerified: true, pendingFirstLogin: false, error: null, user: { email: admin.email, id: `pu-${admin.employeeCode}` } });
  /* AUTH.R22/R26: currentUser is stored without isAdmin, registrationId is kept, isAuthenticated set */
  const stored = JSON.parse(localStorage.getItem('currentUser') ?? '{}') as Record<string, unknown>;
  expect(stored).toMatchObject({ email: admin.email, employeeNo: admin.employeeCode });
  expect(stored).not.toHaveProperty('isAdmin');
  expect(localStorage.getItem('registrationId')).toBe(REGISTRATION_ID);
  expect(localStorage.getItem('isAuthenticated')).toBe('true');
});

test('isAdmin is never read from localStorage', async () => {
  const emp = signInAccount('employee');
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('currentUser', JSON.stringify({ oid: 'x', email: emp.email, name: 'Someone', isAdmin: true }));
  const held = holdVerify();
  mount();
  await waitFor(() => expect(held.calls()).toBe(1));
  expect(probe().portal.isAdmin).toBe(false);
  expect(probe().portal.adminVerified).toBe(false);
  expect(probe().portal.user).not.toHaveProperty('isAdmin');
  held.release();
  await waitFor(() => expect(probe().portal.adminVerified).toBe(true));
  expect(probe().portal.isAdmin).toBe(false);
});

test('unregistered user sees the QC message and is signed out after 15 s', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signInAccount('employee');
  server.use(http.post(VERIFY, () => HttpResponse.json({ exists: false, isActive: false, message: 'User not found in Business Central Portal' })));
  let sessionReads = 0;
  server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname === '/api/v1/session' && request.method === 'GET') sessionReads++; });
  mount();
  await waitFor(() => expect(probe().portal.error).toBe(NOT_REGISTERED));
  expect(probe().ready).toBe(true);
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
  expect(sessionReads).toBe(0);
  act(() => { vi.advanceTimersByTime(14_000); });
  expect(spies.signOut).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1_000); });
  await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
});

test('auth-required triggers reauthenticate', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  act(() => { bcEvents.emit('auth-required'); });
  expect(spies.reauthenticate).toHaveBeenCalledTimes(1);
});

/* final review M6: a reauthentication that fails without leaving the page
   does not stop the next 401 from asking again. */
test('a failed reauthenticate is logged, and the next auth-required asks again', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  spies.reauthenticate.mockRejectedValueOnce(new Error('redirect_in_progress'));
  act(() => { bcEvents.emit('auth-required'); });
  await waitFor(() => expect(logged).toHaveBeenCalledWith('Reauthentication failed:', expect.any(Error)));
  act(() => { bcEvents.emit('auth-required'); });
  expect(spies.reauthenticate).toHaveBeenCalledTimes(2);
  logged.mockRestore();
});

/* Task 13 review: a 401 on the portal check itself emits auth-required too
   (src/api/bc/client.ts). Answering that with a redirect would come straight
   back to the same check: a sign-in loop. QniConnect showed the auth error
   for it (AUTH.R24), so the port does. */
test('a 401 on the portal check while signing in shows the auth error, with no reauthenticate loop', async () => {
  signInAccount('employee');
  let verifies = 0;
  server.use(http.post(VERIFY, () => { verifies++; return HttpResponse.json({ message: 'Authorization has been denied for this request.' }, { status: 401 }); }));
  mount();
  await waitFor(() => expect(probe().portal.error).toBe('Authorization has been denied for this request.'));
  expect(spies.reauthenticate).not.toHaveBeenCalled();
  expect(spies.signIn).not.toHaveBeenCalled();
  expect(verifies).toBe(1);
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
});

/* Review M3: /session/init (AUTH.C2) answering 401 emits auth-required too.
   During sign-in that must not send the person round again (a backend that
   401s every init would loop across redirects): it shows the auth error. */
test('a 401 on session init while signing in shows the auth error, with no reauthenticate loop', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  let inits = 0;
  server.use(http.post(`${BASE}/session/init`, () => { inits++; return HttpResponse.json({ message: 'Session expired.' }, { status: 401 }); }));
  mount();
  await waitFor(() => expect(probe().portal.error).toBe('Session expired.'));
  expect(inits).toBe(1);
  expect(spies.reauthenticate).not.toHaveBeenCalled();
  expect(spies.signIn).not.toHaveBeenCalled();
  expect(probe().ready).toBe(true);
});

/* Review M1 (Review focus 2): a token that needs interaction while signing in.
   The adapter starts its one MSAL redirect itself (AUTH.R33), so the provider
   adds none, shows no error, sends nothing more, and leaves the loading state
   up (no blank page) while the page leaves. */
const interactionRequired = () => Object.assign(new Error('interaction_required'), { name: 'InteractionRequiredAuthError' });
test('InteractionRequiredAuthError while signing in ends in exactly one MSAL redirect, with no blank page', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  let redirects = 0, verifies = 0;
  setAuth({ ...testAuth, ...spies, token: async () => { redirects++; throw interactionRequired(); } });
  server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname === '/bc/portalUsers/verify') verifies++; });
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    window.history.replaceState(null, '', '/work/home');
    render(<App />);
    await waitFor(() => expect(redirects).toBe(1));
    await new Promise(r => setTimeout(r, 50));
    expect(redirects).toBe(1);
    expect(spies.reauthenticate).not.toHaveBeenCalled();
    expect(spies.signIn).not.toHaveBeenCalled();
    expect(verifies).toBe(0);
    expect(screen.getByTestId(tid.shell.loading)).toBeInTheDocument();
    expect(screen.queryByTestId(tid.auth.errorMessage)).not.toBeInTheDocument();
    expect(unhandled).not.toHaveBeenCalled();
  } finally { process.off('unhandledRejection', unhandled); }
});

/* Review M4: the same during a call once signed in. api() answers it as a
   401, but the adapter has already started the redirect, so the provider
   must not start a second one. */
test('a token that needs interaction during a call ends in exactly one MSAL redirect', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  let interact = false, redirects = 0;
  setAuth({ ...testAuth, ...spies, token: async kind => {
    if (interact) { redirects++; throw interactionRequired(); }
    return testAuth.token(kind);
  } });
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  interact = true;
  await queryClient.fetchQuery({ queryKey: ['tenant'], queryFn: () => api(getTenant) }).catch(() => undefined);
  expect(redirects).toBe(1);
  expect(spies.reauthenticate).not.toHaveBeenCalled();
});

test('a 401 from /api/v1 toasts and reauthenticates', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  await fault('GET', '/api/v1/tenant', 401);
  await queryClient.fetchQuery({ queryKey: ['tenant'], queryFn: () => api(getTenant) }).catch(() => undefined);
  expect(await screen.findByTestId(tid.toast.error)).toHaveTextContent('Nothing has been changed');
  expect(spies.reauthenticate).toHaveBeenCalledTimes(1);
});

/* Review focus 1. After a reload the account comes back from sessionStorage
   (the MSAL cache; here the stub's), the stored user is restored without
   isAdmin (AUTH.R20), and no admin page renders until the portal check has
   answered again (Ruling Q6: a loading state, never a bounce). */
test('refresh restores the user and re-verifies admin', async () => {
  const admin = signInAccount('admin');
  setSeedEnvironment();
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('currentUser', JSON.stringify({ oid: `oid-${admin.email}`, email: admin.email, name: 'Dee Fitzgerald', id: `pu-${admin.employeeCode}` }));
  const held = holdVerify();
  window.history.replaceState(null, '', '/setup/asetup');
  render(<App />);
  await waitFor(() => expect(held.calls()).toBe(1));
  expect(screen.queryByTestId(tid.page('asetup'))).not.toBeInTheDocument();
  expect(screen.getByTestId(tid.shell.loading)).toBeInTheDocument();
  held.release();
  expect(await screen.findByTestId(tid.page('asetup'))).toBeInTheDocument();
  expect(held.calls()).toBe(1);
  expect(window.location.pathname).toBe('/setup/asetup');
});

test('the restored user is shown while the portal check runs, without isAdmin', async () => {
  const admin = signInAccount('admin');
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('currentUser', JSON.stringify({ oid: 'o', email: admin.email, name: 'Dee Fitzgerald', isAdmin: true }));
  const held = holdVerify();
  mount();
  await waitFor(() => expect(held.calls()).toBe(1));
  expect(probe()).toMatchObject({ ready: false, portal: { user: { email: admin.email }, isAdmin: false, adminVerified: false } });
  expect(probe().portal.user).not.toHaveProperty('isAdmin');
  held.release();
  await waitFor(() => expect(probe().portal).toMatchObject({ isAdmin: true, adminVerified: true }));
});

test('signed out on a protected route starts sign-in', async () => {
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.auth.redirecting)).toBeInTheDocument();
  expect(spies.signIn).toHaveBeenCalledTimes(1);
  /* final review M1: not a click, so no popup, which the browser would block: straight to the redirect */
  expect(spies.signIn).toHaveBeenCalledWith({ popup: false });
});

/* Ruling A2: a popup sign-in (a wide window) does not leave the page, so the
   sequence runs as soon as it returns with an account. */
test('a sign-in that returns with an account runs the sign-in sequence without a reload', async () => {
  const emp = accountOf('employee');
  setSeedEnvironment();
  spies.signIn.mockImplementationOnce(async () => { setStubAccount(emp.email); });
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
  expect(spies.signIn).toHaveBeenCalledTimes(1);
});

test('a portal error routes to /auth-error with its message', async () => {
  signInAccount('employee');
  server.use(http.post(VERIFY, () => HttpResponse.json({ exists: false })));
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.auth.errorMessage)).toHaveTextContent(NOT_REGISTERED);
  expect(window.location.pathname).toBe('/auth-error');
});

test('with no environment the gate goes to environment selection', async () => {
  signInAccount('employee');
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.page('account-setup-environment'))).toBeInTheDocument();
  expect(window.location.pathname).toBe('/account-setup/environment');
});

/* Review focus 5 (hard requirement, Task 13 carry-in). An activeEnvironment
   whose id /bc/environments no longer lists is dropped while signing in, so
   the person chooses again rather than every call failing against it. */
test('stale activeEnvironment returns to environment selection', async () => {
  signInAccount('employee');
  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-retired-07', name: 'Retired', type: 'Sandbox', company_Id: 'g' }));
  const lists: string[] = [];
  server.events.on('request:start', ({ request }) => { const u = new URL(request.url); if (u.pathname === '/bc/environments') lists.push(u.search); });
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.page('account-setup-environment'))).toBeInTheDocument();
  expect(window.location.pathname).toBe('/account-setup/environment');
  expect(localStorage.getItem('activeEnvironment')).toBeNull();
  /* checked with AUTH.C4 as environment selection sends it, filtered by the registration */
  /* (the URL parser shows the apostrophes as %27; the client sends them as apostrophes: client.test.ts) */
  expect(lists[0]).toBe(`?$filter=registrationId%20eq%20%27${REGISTRATION_ID}%27`);
  expect(screen.queryByTestId(tid.shell.account)).not.toBeInTheDocument();
  /* and the selection offers the environments that do exist */
  expect(await screen.findByTestId(tid.accountSetup.environment('env-production-01'))).toBeInTheDocument();
});

test('a stored environment that is still listed is kept, and the shell opens', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toMatchObject({ id: 'env-production-01' });
});

/* The environment list failing is not proof the environment has gone: it is
   kept, and the calls that follow say what went wrong. */
test('a stored environment is kept when the environment list cannot be read', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  server.use(http.get(`${BASE}/bc/environments`, () => HttpResponse.json({ message: 'down' }, { status: 503 })));
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  expect(probe().environment).toBe('env-production-01');
});

/* AUTH.R25, wired: the session signs out after 5 minutes without activity. */
test('inactivity signs out after 5 minutes and resets on activity', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signInAccount('employee');
  setSeedEnvironment();
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000); });
  window.dispatchEvent(new Event('keydown'));
  await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000); });
  expect(spies.signOut).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(60 * 1000 + 50); });
  await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
});

/* AUTH.R30, wired: another tab removed isAuthenticated (signed out, or hit an
   auth error: Ruling Q8), so this tab goes to Microsoft sign-in, untoasted. */
test('cross-tab sign-out reauthenticates', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  mount();
  await waitFor(() => expect(probe().ready).toBe(true));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'isAuthenticated', oldValue: 'true', newValue: null })); });
  expect(spies.reauthenticate).toHaveBeenCalledTimes(1);
  expect(spies.signOut).not.toHaveBeenCalled();
  expect(screen.queryByTestId(tid.toast.error)).not.toBeInTheDocument();
});

/* AUTH.R46 steps 3 to 6, in that order: the named keys, the sweep, the
   cookies, then Microsoft. Left alone: what QniConnect's logout left
   (AUTH.R46a), and sessionStorage, which MSAL clears itself. */
test('logout clears every QC key and the bc_/auth/user/token sweep', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  function SignOut() { const { signOut } = useSession(); return <button type="button" data-testid="probe-sign-out" onClick={() => void signOut()}>Sign out</button>; }
  render(<QueryClientProvider client={queryClient}><MemoryRouter><SessionProvider><Probe /><SignOut /></SessionProvider></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(probe().ready).toBe(true));
  const QC_KEYS = ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'clientCompanies',
    'clientCompanyId', 'clientCompanyName', 'employeeData', 'employeeId', 'employeeNo'];
  for (const k of QC_KEYS) if (localStorage.getItem(k) === null) localStorage.setItem(k, 'x');
  const SWEPT = ['bc_cache', 'oauthState', 'username', 'idtoken'];
  const KEPT = ['portalTheme', 'adminAuthIncomplete', 'adminAuthEnvironment', 'adminAuthErrorCode', 'BC_upper', 'qnipay.theme'];
  for (const k of [...SWEPT, ...KEPT]) localStorage.setItem(k, 'x');
  sessionStorage.setItem('msal.account.keys', 'x');
  for (const c of ['msal.interaction=1', 'app_session=2', 'authState=3', 'theme=dark']) document.cookie = `${c}; path=/`;
  const order: string[] = [];
  spies.signOut.mockImplementationOnce(async () => {
    order.push(`signOut:${String(localStorage.getItem('bc_cache'))}:${document.cookie.includes('app_session') ? 'cookie' : 'no-cookie'}`);
  });
  act(() => { screen.getByTestId('probe-sign-out').click(); });
  await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
  for (const k of [...QC_KEYS, ...SWEPT]) expect(localStorage.getItem(k), k).toBeNull();
  for (const k of KEPT) expect(localStorage.getItem(k), k).toBe('x');
  expect(sessionStorage.getItem('msal.account.keys')).toBe('x');
  /* the cookies were expired before Microsoft was asked to sign out */
  expect(order).toEqual(['signOut:null:no-cookie']);
  expect(document.cookie).not.toMatch(/msal|session|auth/);
  expect(document.cookie).toContain('theme=dark');
  document.cookie = 'theme=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
});

/* AUTH.R63: the auth error page's "Return to Home" leaves manual_redirect
   for the next page load, which completes the sign-out it started. */
test('AUTH.R63: a page load that finds manual_redirect signs out of Microsoft instead of signing in', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  sessionStorage.setItem('manual_redirect', 'true');
  let verifies = 0;
  server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname === '/bc/portalUsers/verify') verifies++; });
  mount();
  await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
  expect(sessionStorage.getItem('manual_redirect')).toBeNull();
  expect(verifies).toBe(0);
});

test('a Microsoft account that is no seed person is sent to the dev picker', async () => {
  setStubAccount('somebody@contoso.com');
  setSeedEnvironment();
  let verifies = 0;
  server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname === '/bc/portalUsers/verify') verifies++; });
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  expect(await screen.findByTestId(tid.devSignIn.unmatched)).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dev/sign-in');
  expect(window.location.search).toBe('?unmatched=1');
  /* spec N18 (Task 19): one portal check, to learn whether the picker should suggest a seed admin */
  expect(verifies).toBe(1);
});

test('a 5xx on the Workforce session keeps the account signed in and offers a retry', async () => {
  signInAccount('employee');
  setSeedEnvironment();
  await fault('GET', '/api/v1/session', 500);
  window.history.replaceState(null, '', '/work/home');
  render(<App />);
  const retry = await screen.findByTestId(tid.shell.retry);
  expect(spies.reauthenticate).not.toHaveBeenCalled();
  act(() => { retry.click(); });
  expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
});

test('signing out ends the Workforce session, clears the QniConnect keys and signs out of Microsoft', async () => {
  const emp = signInAccount('employee');
  setSeedEnvironment();
  let deleted = 0;
  server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname === '/api/v1/session' && request.method === 'DELETE') deleted++; });
  function SignOut() { const { signOut } = useSession(); return <button type="button" data-testid="probe-sign-out" onClick={() => void signOut()}>Sign out</button>; }
  render(<QueryClientProvider client={queryClient}><MemoryRouter><SessionProvider><Probe /><SignOut /></SessionProvider></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(probe().email).toBe(emp.email));
  act(() => { screen.getByTestId('probe-sign-out').click(); });
  await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
  expect(deleted).toBe(1);
  for (const k of ['isAuthenticated', 'currentUser', 'registrationId', 'activeEnvironment']) expect(localStorage.getItem(k), k).toBeNull();
});
