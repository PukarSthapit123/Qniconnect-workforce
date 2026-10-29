/* Account setup (inventory AUTH): environment selection at
   /account-setup/environment (AUTH.R47 to AUTH.R60, states S11 to S15) and
   the first-login overlay (AUTH.R65 to AUTH.R69, S16 and S17), through the
   whole app: the auth stub's account, the fake /bc and /api/v1. */
import type { MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { setAuth } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { bcStore, FIRST_LOGIN_EMAIL, REGISTRATION_ID } from '@/mocks/bc/seed';
import { hardNavigation } from '@/lib/hard-navigation';
import { accountOf, resetTo, setSeedEnvironment, setStubAccount, testAuth } from '@/test/api-helpers';

const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const VERIFY = `${BASE}/bc/portalUsers/verify`;
const ENVIRONMENTS = `${BASE}/bc/environments`;
const COMPANIES = `${BASE}/bc/client-tenant/companies`;
const ZERO = '00000000-0000-0000-0000-000000000000';
const PATH = '/account-setup/environment';

const spies = { signIn: vi.fn(async () => undefined), reauthenticate: vi.fn(async () => undefined), signOut: vi.fn(async () => undefined) };
let go: MockInstance<(url: string) => void>;
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetTo('social');
  bcStore.reset();
  for (const s of Object.values(spies)) s.mockClear();
  setAuth({ ...testAuth, ...spies });
  go = vi.spyOn(hardNavigation, 'go').mockImplementation(() => undefined);
});
afterEach(() => { server.resetHandlers(); server.events.removeAllListeners(); go.mockRestore(); });

/* Every /bc request the page makes, as "METHOD path?query". */
function recordBc() {
  const calls: { line: string; auth: string | null; body: Promise<string> }[] = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (!u.pathname.startsWith('/bc/')) return;
    calls.push({ line: `${request.method} ${u.pathname}${u.search}`, auth: request.headers.get('Authorization'), body: request.clone().text() });
  });
  return calls;
}
const verifyAccessCalls = (calls: ReturnType<typeof recordBc>) => calls.filter(c => c.line === 'POST /bc/portalUsers/verify').slice(1);

function openSelection(email = accountOf('employee').email) {
  setStubAccount(email);
  window.history.replaceState(null, '', PATH);
  return render(<App />);
}
const page = () => screen.findByTestId(tid.page('account-setup-environment'));
const option = (id: string) => screen.findByTestId(tid.accountSetup.environment(id));

describe('environment selection', () => {
  test('AUTH.S14: lists the environments with their type and company, under its heading', async () => {
    openSelection();
    await page();
    expect(await screen.findByRole('heading', { name: 'Choose your workspace' })).toBeInTheDocument();
    expect(screen.getByText('Select the Business Central environment you want to access.')).toBeInTheDocument();
    expect(screen.getByText('Environment select')).toBeInTheDocument();
    const prod = await option('env-production-01');
    expect(prod).toHaveTextContent('Production');
    expect(prod).toHaveTextContent('BrightPath Care Ltd');
    expect(screen.getByTestId(tid.accountSetup.continue)).toHaveTextContent('Continue to portal');
    expect(screen.getByTestId(tid.accountSetup.home)).toHaveTextContent('Home');
    expect(screen.getByText(`© ${new Date().getFullYear()} QniConnect`)).toBeInTheDocument();
  });

  test('AUTH.R49: verify access (AUTH.C3) first, then the environment list (AUTH.C4); with two, none is chosen for you', async () => {
    const calls = recordBc();
    openSelection();
    await option('env-sandbox-01');
    const lines = calls.map(c => c.line);
    const c3 = lines.indexOf('POST /bc/portalUsers/verify', 1);
    const c4 = lines.findIndex(l => l.startsWith('GET /bc/environments'));
    expect(c3).toBeGreaterThan(0);
    expect(c4).toBeGreaterThan(c3);
    expect(screen.getByTestId(tid.accountSetup.environment('env-production-01'))).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId(tid.accountSetup.environment('env-sandbox-01'))).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId(tid.accountSetup.continue)).toBeDisabled();
  });

  test('AUTH.R49: exactly one environment is chosen for you', async () => {
    bcStore.db.environments = bcStore.db.environments.filter(e => e.id === 'env-production-01');
    openSelection();
    expect(await option('env-production-01')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.accountSetup.continue)).toBeEnabled();
  });

  test('AUTH.R49: an empty list is the "Sign In Required" card (AUTH.S12)', async () => {
    bcStore.db.environments = [];
    openSelection();
    const card = await screen.findByTestId(tid.accountSetup.error);
    expect(within(card).getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Your session could not be verified. Please sign in again to continue.');
    fireEvent.click(within(card).getByTestId(tid.accountSetup.errorAction));
    expect(screen.getByTestId(tid.accountSetup.errorAction)).toHaveTextContent(/^Sign in$/);
    expect(go).toHaveBeenCalledWith('/');
    expect(spies.signIn).not.toHaveBeenCalled();
  });

  /* Task 19 (carried from the Task 15 review): with nobody signed in to
     Microsoft any more, "Sign In" is a real sign-in, not a reload. */
  test('AUTH.S12: "Sign In" with nobody signed in starts Microsoft\'s sign-in', async () => {
    bcStore.db.environments = [];
    openSelection();
    const card = await screen.findByTestId(tid.accountSetup.error);
    sessionStorage.removeItem('qniconnect.stubAccount');
    fireEvent.click(within(card).getByTestId(tid.accountSetup.errorAction));
    await waitFor(() => expect(spies.signIn).toHaveBeenCalledTimes(1));
    expect(go).not.toHaveBeenCalled();
  });

  test('AUTH.R47: an inactive or unknown account is "Access not provisioned" (AUTH.S13), and Sign out signs out', async () => {
    let n = 0;
    server.use(http.post(VERIFY, async ({ request }) => {
      n++;
      const { email } = await request.json() as { email: string };
      const u = bcStore.userByEmail(email);
      /* the sign-in check (AUTH.C1) passes; the page's own (AUTH.C3) says inactive */
      return HttpResponse.json(n === 1 ? { exists: true, isActive: true, userData: { ...u } } : { exists: true, isActive: false, message: 'Your account is inactive' });
    }));
    openSelection();
    const card = await screen.findByTestId(tid.accountSetup.error);
    expect(within(card).getByRole('heading', { name: 'Access not provisioned' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Your account is authenticated but has not been granted access to QniConnect. Contact your administrator to request access.');
    /* the reason itself is not shown, as in QniConnect */
    expect(card).not.toHaveTextContent('Your account is inactive');
    fireEvent.click(within(card).getByTestId(tid.accountSetup.errorAction));
    await waitFor(() => expect(spies.signOut).toHaveBeenCalledTimes(1));
  });

  test('AUTH.R47: a failing access check (network, 404, 500) is the access-denied card too, and never shows the list', async () => {
    for (const status of [404, 500]) {
      let n = 0;
      server.use(http.post(VERIFY, async ({ request }) => {
        n++;
        const { email } = await request.json() as { email: string };
        if (n === 1) return HttpResponse.json({ exists: true, isActive: true, userData: { ...bcStore.userByEmail(email) } });
        return HttpResponse.json({ message: 'nope' }, { status });
      }));
      const { unmount } = openSelection();
      expect(within(await screen.findByTestId(tid.accountSetup.error)).getByRole('heading', { name: 'Access not provisioned' })).toBeInTheDocument();
      unmount();
      localStorage.clear();
    }
    let n = 0;
    server.use(http.post(VERIFY, async ({ request }) => {
      n++;
      const { email } = await request.json() as { email: string };
      return n === 1 ? HttpResponse.json({ exists: true, isActive: true, userData: { ...bcStore.userByEmail(email) } }) : HttpResponse.error();
    }));
    openSelection();
    expect(within(await screen.findByTestId(tid.accountSetup.error)).getByRole('heading', { name: 'Access not provisioned' })).toBeInTheDocument();
    expect(screen.queryByTestId(tid.accountSetup.environment('env-production-01'))).not.toBeInTheDocument();
  });

  test('AUTH.R48: turned away, the session is cleaned up: its keys, sessionStorage tokens and auth cookies, but not bc_ keys and not Microsoft', async () => {
    let n = 0;
    server.use(http.post(VERIFY, async ({ request }) => {
      n++;
      const { email } = await request.json() as { email: string };
      return HttpResponse.json(n === 1 ? { exists: true, isActive: true, userData: { ...bcStore.userByEmail(email) } } : { exists: false });
    }));
    localStorage.setItem('bc_keep', 'x');
    localStorage.setItem('employeeData', 'kept');
    sessionStorage.setItem('msal.cache', 'x');
    sessionStorage.setItem('idtoken.x', 'x');
    sessionStorage.setItem('oauth', 'x');
    sessionStorage.setItem('other', 'x');
    document.cookie = 'msal.state=1; path=/';
    openSelection();
    await screen.findByTestId(tid.accountSetup.error);
    for (const k of ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'employeeNo', 'employeeId', 'clientCompanyId', 'clientCompanyName', 'clientCompanies'])
      expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem('bc_keep')).toBe('x');
    expect(localStorage.getItem('employeeData')).toBe('kept');
    for (const k of ['msal.cache', 'idtoken.x', 'oauth']) expect(sessionStorage.getItem(k), k).toBeNull();
    expect(sessionStorage.getItem('other')).toBe('x');
    expect(document.cookie).not.toContain('msal.state');
    expect(spies.signOut).not.toHaveBeenCalled();
  });

  test('AUTH.R47: an access check that answers without exists is turned away without the clean-up (strict === false)', async () => {
    let n = 0;
    server.use(http.post(VERIFY, async ({ request }) => {
      n++;
      const { email } = await request.json() as { email: string };
      return HttpResponse.json(n === 1 ? { exists: true, isActive: true, userData: { ...bcStore.userByEmail(email) } } : { message: 'odd' });
    }));
    openSelection();
    await screen.findByTestId(tid.accountSetup.error);
    expect(localStorage.getItem('isAuthenticated')).toBe('true');
  });

  test('AUTH.R50: the list is filtered by the registration id the access check returns, else sent unfiltered', async () => {
    const calls = recordBc();
    openSelection();
    await option('env-production-01');
    expect(calls.find(c => c.line.startsWith('GET /bc/environments'))?.line)
      .toBe(`GET /bc/environments?$filter=registrationId%20eq%20%27${REGISTRATION_ID}%27`);
    expect(localStorage.getItem('registrationId')).toBe(REGISTRATION_ID);
  });

  test('AUTH.R50: with no registration id anywhere, AUTH.C4 has no filter', async () => {
    for (const u of bcStore.db.portalUsers) u.registrationId = '';
    const calls = recordBc();
    openSelection();
    await option('env-production-01');
    expect(calls.find(c => c.line.startsWith('GET /bc/environments'))?.line).toBe('GET /bc/environments');
  });

  test('AUTH.R49: the access check sends the account email and oid with the bc token, once', async () => {
    const calls = recordBc();
    const emp = accountOf('employee');
    openSelection(emp.email);
    await option('env-production-01');
    const c3 = verifyAccessCalls(calls);
    expect(c3).toHaveLength(1);
    expect(JSON.parse(await (c3[0]?.body ?? Promise.resolve('{}')))).toEqual({ email: emp.email, userId: `oid-${emp.email.toLowerCase()}` });
  });

  test('AUTH.R60: the checks run once per visit, not again when the page re-renders', async () => {
    const calls = recordBc();
    openSelection();
    const prod = await option('env-production-01');
    fireEvent.click(prod);
    fireEvent.click(await option('env-sandbox-01'));
    expect(verifyAccessCalls(calls)).toHaveLength(1);
    expect(calls.filter(c => c.line.startsWith('GET /bc/environments'))).toHaveLength(1);
  });

  test('AUTH.R51: choosing one marks it (and only it); Continue waits for a choice', async () => {
    openSelection();
    const prod = await option('env-production-01');
    expect(screen.getByTestId(tid.accountSetup.continue)).toBeDisabled();
    fireEvent.click(prod);
    expect(prod).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(await option('env-sandbox-01'));
    expect(prod).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId(tid.accountSetup.environment('env-sandbox-01'))).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(tid.accountSetup.continue)).toBeEnabled();
  });

  test('AUTH.R59: the Ready badge shows on an environment with no real company id, as QniConnect labelled it', async () => {
    const sandbox = bcStore.db.environments.find(e => e.id === 'env-sandbox-01');
    if (!sandbox) throw new Error('no Sandbox in the fake seed');
    bcStore.db.environments.push({ ...sandbox, id: 'env-zero-03', name: 'Zero', company_Id: ZERO, companyName: 'Zero Co' });
    openSelection();
    expect(within(await option('env-sandbox-01')).getByText('Ready')).toBeInTheDocument();
    expect(within(await option('env-zero-03')).getByText('Ready')).toBeInTheDocument();
    expect(within(await option('env-production-01')).queryByText('Ready')).not.toBeInTheDocument();
    /* no company name: the type alone */
    expect(await option('env-sandbox-01')).not.toHaveTextContent('·');
  });

  test('AUTH.R52 and AUTH.R56: an environment with a company is stored as chosen, with no company lookup, and the app opens', async () => {
    const calls = recordBc();
    openSelection();
    fireEvent.click(await option('env-production-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toEqual({
      id: 'env-production-01', name: 'Production', type: 'Production', url: 'https://businesscentral.dynamics.com/production',
      companyName: 'BrightPath Care Ltd', company_Id: '6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01' });
    expect(localStorage.getItem('clientCompanyId')).toBe('6f1c2a9e-4b7d-4e2a-9c31-0d8e5b7a1f01');
    expect(calls.some(c => c.line === 'POST /bc/client-tenant/companies')).toBe(false);
    expect(window.location.pathname).not.toBe(PATH);
  });

  test('AUTH.R53: no company yet: the lookup (AUTH.C5, login token) then a fresh list gives it its company', async () => {
    const calls = recordBc();
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    const lookup = calls.find(c => c.line === 'POST /bc/client-tenant/companies');
    expect(JSON.parse(await (lookup?.body ?? Promise.resolve('{}')))).toEqual({ environmentName: 'Sandbox', registrationId: REGISTRATION_ID });
    const idx = calls.findIndex(c => c === lookup);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(calls.slice(idx + 1).some(c => c.line.startsWith('GET /bc/environments'))).toBe(true);
    const sandboxCompany = bcStore.db.companies.find(c => c.environmentId === 'env-sandbox-01')?.id;
    expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toMatchObject({ id: 'env-sandbox-01', company_Id: sandboxCompany, companyName: '' });
    expect(localStorage.getItem('clientCompanyId')).toBe(sandboxCompany);
  });

  test('AUTH.R53 and AUTH.R55: a lookup that fails is ignored: the placeholder company id is stored and the app opens', async () => {
    server.use(http.post(COMPANIES, () => HttpResponse.json({ message: 'Bad request' }, { status: 400 })));
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('activeEnvironment') ?? '{}')).toMatchObject({ id: 'env-sandbox-01', company_Id: ZERO });
    expect(localStorage.getItem('clientCompanyId')).toBe(ZERO);
    /* not an authorization problem: nothing flagged for the admin */
    expect(localStorage.getItem('adminAuthIncomplete')).toBeNull();
  });

  test('AUTH.R53: with no registration id stored, the lookup is skipped and the app still opens', async () => {
    for (const u of bcStore.db.portalUsers) u.registrationId = '';
    const calls = recordBc();
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(calls.some(c => c.line === 'POST /bc/client-tenant/companies')).toBe(false);
    expect(localStorage.getItem('clientCompanyId')).toBe(ZERO);
  });

  test('AUTH.R54: while continuing, Continue shows Processing… and nothing can be pressed twice', async () => {
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    server.use(http.post(COMPANIES, async () => { await held; return HttpResponse.json({ updateResult: { success: false } }); }));
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    const btn = await screen.findByTestId(tid.accountSetup.continue);
    await waitFor(() => expect(btn).toHaveTextContent('Processing…'));
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId(tid.accountSetup.home)).toBeDisabled();
    act(() => { release(); });
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
  });

  test('AUTH.R57: an authorization failure on the lookup flags the environment for the admin', async () => {
    const cases: [() => Response, string][] = [
      [() => HttpResponse.json({ message: 'x', responseData: { error: { message: 'getClientToken failed' } } }, { status: 500 }), '500'],
      [() => HttpResponse.json({ message: 'refresh token missing' }, { status: 500 }), '500'],
      [() => HttpResponse.json({ error: 'No HTTP resource was found' }, { status: 404 }), '404'],
      [() => HttpResponse.json({}, { status: 403 }), '403'],
      [() => new HttpResponse('upstream auth failure', { status: 502 }), '502'],
      [() => HttpResponse.error(), ''],
    ];
    for (const [reply, code] of cases) {
      localStorage.clear();
      bcStore.reset();
      server.use(http.post(COMPANIES, reply));
      const { unmount } = openSelection();
      fireEvent.click(await option('env-sandbox-01'));
      fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
      expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
      if (code) {
        expect(localStorage.getItem('adminAuthIncomplete'), code).toBe('true');
        expect(localStorage.getItem('adminAuthEnvironment')).toBe('Sandbox');
        expect(localStorage.getItem('adminAuthErrorCode')).toBe(code);
      } else {
        /* a network failure ("Failed to fetch") names no auth problem */
        expect(localStorage.getItem('adminAuthIncomplete')).toBeNull();
      }
      unmount();
    }
  });

  /* QniConnect asked for the login token itself before the lookup (its outer
     handler: SETUP_ERROR), then sent the lookup (its fetch handler:
     FETCH_ERROR). `failLoginTokens` makes the next login-token requests, from
     the click on, answer or throw in turn. */
  function failLoginTokens(...plan: ('ok' | 'throw' | 'interaction')[]) {
    setAuth({ ...testAuth, ...spies, token: async kind => {
      if (kind === 'login' && plan.length && sessionStorage.getItem('armed') === '1') {
        const step = plan.shift();
        if (step === 'throw') throw new Error('token unauthorized');
        if (step === 'interaction') { const e = new Error('interaction_required: token unauthorized'); e.name = 'InteractionRequiredAuthError'; throw e; }
      }
      return testAuth.token(kind);
    } });
  }

  test('AUTH.R57: getting the token for the lookup fails with an auth-ish message: flagged SETUP_ERROR', async () => {
    failLoginTokens('throw');
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    sessionStorage.setItem('armed', '1');
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(localStorage.getItem('adminAuthErrorCode')).toBe('SETUP_ERROR');
    expect(localStorage.getItem('adminAuthIncomplete')).toBe('true');
  });

  test('AUTH.R57: the lookup itself throws with an auth-ish message: flagged FETCH_ERROR', async () => {
    failLoginTokens('ok', 'throw');
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    sessionStorage.setItem('armed', '1');
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(localStorage.getItem('adminAuthErrorCode')).toBe('FETCH_ERROR');
    expect(localStorage.getItem('adminAuthEnvironment')).toBe('Sandbox');
  });

  /* final review M2: a token that needs interaction, for the lookup or for
     its call, means MSAL is already redirecting: the page stays as it is,
     with nothing stored, flagged or opened behind the redirect. */
  test.each([['the lookup token', ['interaction']], ['the lookup call token', ['ok', 'interaction']]] as const)('AUTH.R57: %s needs interaction: nothing is stored or flagged and the app does not open', async (_, plan) => {
    failLoginTokens(...plan);
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    sessionStorage.setItem('armed', '1');
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    await waitFor(() => expect(sessionStorage.getItem('armed')).toBe('1'));
    await new Promise(r => setTimeout(r, 300));
    expect(screen.queryByTestId(tid.shell.account)).toBeNull();
    expect(screen.queryByTestId(tid.accountSetup.error)).toBeNull();
    expect(localStorage.getItem('activeEnvironment')).toBeNull();
    expect(localStorage.getItem('adminAuthErrorCode')).toBeNull();
    expect(screen.getByTestId(tid.page('account-setup-environment'))).toBeInTheDocument();
  });

  test('AUTH.R53: a failing re-read after the lookup is only logged; the placeholder company is used', async () => {
    let lists = 0;
    server.use(http.get(ENVIRONMENTS, () => {
      lists++;
      /* the page's list passes (no environment is stored, so sign-in made no stale check); the re-read fails */
      return lists < 2 ? undefined : HttpResponse.json({ message: 'token expired' }, { status: 500 });
    }));
    openSelection();
    fireEvent.click(await option('env-sandbox-01'));
    fireEvent.click(screen.getByTestId(tid.accountSetup.continue));
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    /* QniConnect's re-read swallowed its own failure; the stored company stays the placeholder */
    expect(localStorage.getItem('clientCompanyId')).toBe(ZERO);
    expect(localStorage.getItem('adminAuthIncomplete')).toBeNull();
  });

  test('AUTH.R58: ← Home clears the session keys (not Microsoft) and goes to /', async () => {
    openSelection();
    await option('env-production-01');
    localStorage.setItem('clientCompanies', 'x');
    localStorage.setItem('employeeData', 'kept');
    fireEvent.click(screen.getByTestId(tid.accountSetup.home));
    for (const k of ['isAuthenticated', 'currentUser', 'activeEnvironment', 'registrationId', 'employeeNo', 'employeeId', 'clientCompanyId', 'clientCompanyName', 'clientCompanies'])
      expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem('employeeData')).toBe('kept');
    expect(go).toHaveBeenCalledWith('/');
    expect(spies.signOut).not.toHaveBeenCalled();
  });

  test('AUTH.S11: while the checks run, the page says it is loading your environments', async () => {
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    server.use(http.get(ENVIRONMENTS, async () => { await held; return undefined; }));
    openSelection();
    expect(await screen.findByTestId(tid.accountSetup.loading)).toHaveTextContent('Loading your environments…');
    act(() => { release(); });
    expect(await option('env-production-01')).toBeInTheDocument();
  });

  test('an environment already chosen skips the page', async () => {
    setSeedEnvironment();
    openSelection();
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(window.location.pathname).not.toBe(PATH);
  });
});

describe('first login', () => {
  const overlay = () => screen.findByTestId(tid.accountSetup.firstLogin);
  function openAsFirstLogin() {
    setStubAccount(FIRST_LOGIN_EMAIL);
    setSeedEnvironment();
    window.history.replaceState(null, '', '/');
    return render(<App />);
  }

  test('AUTH.R65 and AUTH.S16: a PendingFirstLogin user sees the welcome over the app', async () => {
    openAsFirstLogin();
    const o = await overlay();
    expect(within(o).getByRole('heading', { name: 'Welcome!' })).toBeInTheDocument();
    expect(o).toHaveTextContent('This is your first login to the QniConnect Employee Portal. We need to set up a few things before you can access your information.');
    expect(o).toHaveTextContent('By continuing, you agree to our terms of use and privacy policy.');
    expect(screen.getByTestId(tid.accountSetup.firstLoginContinue)).toHaveTextContent('Continue to portal');
    expect(screen.getByTestId(tid.shell.account)).toBeInTheDocument();
  });

  test('AUTH.R65: an Active user sees no overlay', async () => {
    setStubAccount(accountOf('employee').email);
    setSeedEnvironment();
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByTestId(tid.shell.account)).toBeInTheDocument();
    expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument();
  });

  test('AUTH.R66: the overlay has no close: Escape and the backdrop leave it up', async () => {
    openAsFirstLogin();
    const o = await overlay();
    expect(within(o).queryByTestId(tid.modal.close)).not.toBeInTheDocument();
    fireEvent.keyDown(o, { key: 'Escape' });
    expect(screen.getByTestId(tid.accountSetup.firstLogin)).toBeInTheDocument();
  });

  test('AUTH.R66: no overlay until an environment is chosen', async () => {
    setStubAccount(FIRST_LOGIN_EMAIL);
    window.history.replaceState(null, '', '/');
    render(<App />);
    await page();
    expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument();
  });

  test('AUTH.R67: Continue sets the user Active (AUTH.C6) and closes the overlay', async () => {
    const calls = recordBc();
    openAsFirstLogin();
    await overlay();
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    await waitFor(() => expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument());
    const user = bcStore.userByEmail(FIRST_LOGIN_EMAIL);
    const c6 = calls.find(c => c.line === `POST /bc/portalUsers/${user?.id}/updateStatus`);
    expect(c6).toBeDefined();
    expect(JSON.parse(await (c6?.body ?? Promise.resolve('{}')))).toEqual({ status: 'Active' });
    expect(user?.status).toBe('Active');
  });

  /* "No user id: skip the call" cannot happen after sign-in: the user id
     falls back to the account's oid (AUTH.C1 userData.id || oid), so the call
     is made with that. */
  test('AUTH.R67: a portal user with no id is updated by the account oid', async () => {
    const calls = recordBc();
    server.use(
      http.post(VERIFY, () => HttpResponse.json({ exists: true, isActive: true, userData: { status: 'PendingFirstLogin', registrationId: REGISTRATION_ID } })),
      http.post(`${BASE}/bc/portalUsers/:userId/updateStatus`, () => HttpResponse.json({ success: true })));
    setStubAccount(FIRST_LOGIN_EMAIL);
    setSeedEnvironment();
    window.history.replaceState(null, '', '/');
    render(<App />);
    await overlay();
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    await waitFor(() => expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument());
    expect(calls.map(c => c.line)).toContain(`POST /bc/portalUsers/oid-${FIRST_LOGIN_EMAIL}/updateStatus`);
  });

  test('AUTH.R68 and AUTH.S17: a failed update keeps the overlay, says so, and can be tried again', async () => {
    let fail = true;
    server.use(http.post(`${BASE}/bc/portalUsers/:userId/updateStatus`, () => (fail ? HttpResponse.json({ message: 'down' }, { status: 500 }) : HttpResponse.json({ success: true }))));
    openAsFirstLogin();
    await overlay();
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    expect(await screen.findByTestId(tid.accountSetup.firstLoginError))
      .toHaveTextContent('There was an error updating your account status. Please try again or contact support.');
    expect(screen.getByTestId(tid.accountSetup.firstLogin)).toBeInTheDocument();
    expect(screen.getByTestId(tid.accountSetup.firstLoginContinue)).not.toHaveAttribute('aria-busy');
    fail = false;
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    await waitFor(() => expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument());
  });

  test('AUTH.R68: an answer without success is a failure too', async () => {
    server.use(http.post(`${BASE}/bc/portalUsers/:userId/updateStatus`, () => HttpResponse.json({ success: false, message: 'no' })));
    openAsFirstLogin();
    await overlay();
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    expect(await screen.findByTestId(tid.accountSetup.firstLoginError)).toBeInTheDocument();
  });

  test('AUTH.S16: while it works, Continue shows Processing...', async () => {
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    server.use(http.post(`${BASE}/bc/portalUsers/:userId/updateStatus`, async () => { await held; return HttpResponse.json({ success: true }); }));
    openAsFirstLogin();
    await overlay();
    fireEvent.click(screen.getByTestId(tid.accountSetup.firstLoginContinue));
    await waitFor(() => expect(screen.getByTestId(tid.accountSetup.firstLoginContinue)).toHaveTextContent('Processing…'));
    expect(screen.getByTestId(tid.accountSetup.firstLoginContinue)).toHaveAttribute('aria-busy', 'true');
    act(() => { release(); });
    await waitFor(() => expect(screen.queryByTestId(tid.accountSetup.firstLogin)).not.toBeInTheDocument());
  });

  test('AUTH.R69: there is no Force Proceed: the fake /bc completes it the real way', async () => {
    openAsFirstLogin();
    await overlay();
    expect(screen.queryByText(/Force Proceed/i)).not.toBeInTheDocument();
  });
});
