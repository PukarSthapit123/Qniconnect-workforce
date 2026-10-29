/* The auth error page (/auth-error: AUTH.S5, AUTH.R62) and the Business
   Central authorization callback (/auth/callback: AUTH.R64, S18 to S20),
   through the whole app. */
import type { MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { setAuth } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { bcStore } from '@/mocks/bc/seed';
import { hardNavigation } from '@/lib/hard-navigation';
import { accountOf, resetTo, setSeedEnvironment, setStubAccount, testAuth } from '@/test/api-helpers';

const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
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
afterEach(() => { server.resetHandlers(); go.mockRestore(); vi.useRealTimers(); });

/* jsdom's window.opener is a plain value, so it is swapped, then put back. */
function setOpener(value: unknown) {
  const was = window.opener as unknown;
  Object.defineProperty(window, 'opener', { value, configurable: true, writable: true });
  return { restore: () => { Object.defineProperty(window, 'opener', { value: was, configurable: true, writable: true }); } };
}
const open = (path: string) => { window.history.replaceState(null, '', path); return render(<App />); };

describe('auth error page', () => {
  test('AUTH.S5: the title, the error, and Return to Home', async () => {
    setStubAccount(accountOf('employee').email);
    server.use(http.post(`${BASE}/bc/portalUsers/verify`, () => HttpResponse.json({ message: 'Tenant suspended.' }, { status: 500 })));
    open('/work/home');
    expect(await screen.findByRole('heading', { name: 'Authentication error' })).toBeInTheDocument();
    expect(screen.getByTestId(tid.auth.errorMessage)).toHaveTextContent('Tenant suspended.');
    expect(screen.getByTestId(tid.auth.errorHome)).toHaveTextContent(/^Return to home$/);
    expect(window.location.pathname).toBe('/auth-error');
  });

  test('AUTH.S5: opened with no error, it says you do not have access', async () => {
    open('/auth-error');
    expect(await screen.findByTestId(tid.auth.errorMessage)).toHaveTextContent('You do not have access to this application.');
  });

  test('AUTH.S2: while there is an auth error, no other page opens', async () => {
    setStubAccount(accountOf('admin').email);
    setSeedEnvironment();
    server.use(http.post(`${BASE}/bc/portalUsers/verify`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    open('/setup/asetup');
    await screen.findByTestId(tid.auth.errorMessage);
    expect(window.location.pathname).toBe('/auth-error');
    expect(screen.queryByTestId(tid.page('asetup'))).not.toBeInTheDocument();
  });

  test('AUTH.R62: Return to Home clears the session everywhere, marks the sign-out to finish, and goes to /', async () => {
    open('/auth-error');
    await screen.findByTestId(tid.auth.errorMessage);
    for (const k of ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'employeeNo', 'employeeId', 'clientCompanyId', 'clientCompanyName', 'clientCompanies', 'bc_x', 'oauth', 'username', 'idtoken', 'portalTheme'])
      localStorage.setItem(k, 'x');
    for (const k of ['msal.account', 'xtokenx', 'authority', 'qniconnect.stubAccount']) sessionStorage.setItem(k, 'x');
    document.cookie = 'msal.state=1; path=/';
    document.cookie = 'backend_session=1; path=/';
    fireEvent.click(screen.getByTestId(tid.auth.errorHome));
    for (const k of ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'employeeNo', 'employeeId', 'clientCompanyId', 'clientCompanyName', 'clientCompanies', 'bc_x', 'oauth', 'username', 'idtoken'])
      expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem('portalTheme')).toBe('x');
    for (const k of ['msal.account', 'xtokenx', 'authority']) expect(sessionStorage.getItem(k), k).toBeNull();
    expect(sessionStorage.getItem('qniconnect.stubAccount')).toBe('x');
    expect(sessionStorage.getItem('manual_redirect')).toBe('true');
    expect(document.cookie).not.toMatch(/msal|session/);
    expect(go).toHaveBeenCalledWith('/');
    /* it does not sign out of Microsoft itself: the next page load does (AUTH.R63) */
    expect(spies.signOut).not.toHaveBeenCalled();
  });
});

describe('authorization callback', () => {
  const title = () => screen.findByTestId(tid.auth.callbackTitle);
  const message = () => screen.getByTestId(tid.auth.callbackMessage);

  test('AUTH.R64: it opens signed out, makes no call of its own', async () => {
    const seen: string[] = [];
    server.events.on('request:start', ({ request }) => { seen.push(new URL(request.url).pathname); });
    open('/auth/callback?error=access_denied');
    expect(await title()).toHaveTextContent('Authorization failed');
    expect(spies.signIn).not.toHaveBeenCalled();
    expect(seen.filter(p => p.startsWith('/bc/') || p.startsWith('/session/'))).toEqual([]);
    server.events.removeAllListeners();
  });

  test('AUTH.R64 and AUTH.S19: success in a popup tells the opener and closes after 2 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const post = vi.fn();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const opener = setOpener({ postMessage: post });
    try {
      open('/auth/callback?status=success&registrationId=REG-9&tokenReceived=true&tokenStoredInBC=false');
      expect(await title()).toHaveTextContent('Authorization successful');
      expect(message()).toHaveTextContent('Authorization successful! Redirecting...');
      expect(post).toHaveBeenCalledWith({ type: 'AUTH_SUCCESS', registrationId: 'REG-9', timestamp: expect.any(Number) as number, tokenReceived: true, tokenStoredInBC: false }, '*');
      expect(close).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(2000); });
      expect(close).toHaveBeenCalledTimes(1);
    } finally { close.mockRestore(); opener.restore(); }
  });

  test('AUTH.R64: success with no opener goes to the Authorization page after 2 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open('/auth/callback?status=success');
    await title();
    expect(window.location.pathname).toBe('/auth/callback');
    act(() => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(window.location.pathname).not.toBe('/auth/callback'));
    expect(window.location.pathname).toBe('/setup/aauth');
  });

  /* Task 19 (carried from the Task 15 review): the route it goes to exists now,
     and a signed-in portal admin lands on the Authorization page itself. */
  test('AUTH.R64: the return lands on Setup › Business Central › Authorization for a signed-in portal admin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setStubAccount(accountOf('admin').email);
    setSeedEnvironment();
    open('/auth/callback?status=success');
    await title();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(await screen.findByTestId(tid.page('aauth'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/setup/aauth');
    expect(screen.queryByTestId(tid.unavailable.root)).toBeNull();
  });

  test('AUTH.R64: "Return to Authorization Page" lands on the Authorization page', async () => {
    setStubAccount(accountOf('admin').email);
    setSeedEnvironment();
    open('/auth/callback?error=access_denied');
    fireEvent.click(await screen.findByTestId(tid.auth.callbackReturn));
    expect(await screen.findByTestId(tid.page('aauth'))).toBeInTheDocument();
  });

  test('AUTH.R64 and AUTH.S20: an error says what failed, error_description first', async () => {
    open('/auth/callback?error=access_denied&error_description=The%20user%20cancelled');
    expect(await title()).toHaveTextContent('Authorization failed');
    expect(message()).toHaveTextContent('Authorization failed: The user cancelled');
    expect(screen.getByTestId(tid.auth.callbackReturn)).toHaveTextContent(/^Return to the authorization page$/);
  });

  test('AUTH.R64: no code is a failure', async () => {
    open('/auth/callback');
    await title();
    expect(message()).toHaveTextContent('No authorization code was provided in the callback.');
  });

  test('AUTH.R64: a code reaching the front end is a configuration error; the opener is told and the window closes after 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const post = vi.fn();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const opener = setOpener({ postMessage: post });
    try {
      open('/auth/callback?code=abc');
      await title();
      expect(message()).toHaveTextContent('Authentication flow configuration error. The authorization code was sent to the frontend instead of the backend. Please check your Azure AD app registration.');
      expect(post).toHaveBeenCalledWith({ type: 'AUTH_ERROR', error: 'Authentication flow configuration error',
        message: 'The authorization code was sent to the frontend instead of the backend', timestamp: expect.any(Number) as number }, '*');
      act(() => { vi.advanceTimersByTime(4500); });
      expect(close).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(500); });
      expect(close).toHaveBeenCalledTimes(1);
    } finally { close.mockRestore(); opener.restore(); }
  });

  test('AUTH.R64: a code with no opener goes to the Authorization page after 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open('/auth/callback?code=abc');
    await title();
    act(() => { vi.advanceTimersByTime(5000); });
    await waitFor(() => expect(window.location.pathname).toBe('/setup/aauth'));
  });

  test('AUTH.R64: the registration id: stored, else from state, else registration_id, and kept', async () => {
    localStorage.setItem('registrationId', 'REG-STORED');
    const { unmount } = open(`/auth/callback?state=${encodeURIComponent(JSON.stringify({ registrationId: 'REG-STATE' }))}&error=x`);
    await title();
    expect(localStorage.getItem('registrationId')).toBe('REG-STATE');
    unmount();
    localStorage.removeItem('registrationId');
    open('/auth/callback?state=not-json&registration_id=REG-QUERY&error=x');
    await title();
    expect(localStorage.getItem('registrationId')).toBe('REG-QUERY');
  });

  test('AUTH.R64: Return to Authorization Page goes to Setup › Authorization', async () => {
    open('/auth/callback?error=x');
    await title();
    fireEvent.click(screen.getByTestId(tid.auth.callbackReturn));
    await waitFor(() => expect(window.location.pathname).toBe('/setup/aauth'));
  });
});
