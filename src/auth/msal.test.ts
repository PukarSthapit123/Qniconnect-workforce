/* The MSAL adapter against a mocked @azure/msal-browser: it must ask MSAL for
   exactly what QniConnect asked for (docs/superpowers/inventory/auth.md). */
import type { AccountInfo } from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { createMsalAuth } from './msal';
import { logger } from '@/lib/logger';

type Callback = (event: { eventType: string; payload: unknown }) => void;

const msal = vi.hoisted(() => {
  const instance = {
    initialize: vi.fn(async () => undefined),
    handleRedirectPromise: vi.fn(async (): Promise<unknown> => null),
    getAllAccounts: vi.fn((): unknown[] => []),
    getActiveAccount: vi.fn((): unknown => null),
    setActiveAccount: vi.fn(),
    addEventCallback: vi.fn(),
    acquireTokenSilent: vi.fn(async (): Promise<unknown> => ({ accessToken: 'token' })),
    acquireTokenRedirect: vi.fn(async () => undefined),
    loginRedirect: vi.fn(async () => undefined),
    loginPopup: vi.fn(async (): Promise<unknown> => { throw new Error('no popup in this test'); }),
    logoutRedirect: vi.fn(async () => undefined),
  };
  return { instance, config: undefined as unknown };
});

vi.mock('@azure/msal-browser', () => {
  class InteractionRequiredAuthError extends Error {}
  return {
    PublicClientApplication: vi.fn(function (config: unknown) { msal.config = config; return msal.instance; }),
    InteractionRequiredAuthError,
    EventType: { LOGIN_SUCCESS: 'msal:loginSuccess', LOGOUT_SUCCESS: 'msal:logoutSuccess' },
    LogLevel: { Error: 0, Warning: 1, Info: 2, Verbose: 3, Trace: 4 },
  };
});

const LOGIN_SCOPES = ['User.Read', 'openid', 'profile', 'email'];
const BC_SCOPES = ['https://api.businesscentral.dynamics.com/.default'];
const ORIGIN = window.location.origin;

const account = (over: Partial<AccountInfo> = {}): AccountInfo => ({
  homeAccountId: 'home', environment: 'login.microsoftonline.com', tenantId: 'tenant',
  username: 'ana@contoso.com', localAccountId: 'local-oid', name: 'Ana Silva',
  idTokenClaims: { oid: 'oid-1' }, ...over,
});

const eventCallback = (): Callback => {
  const [call] = msal.instance.addEventCallback.mock.calls as unknown[][];
  if (!call) throw new Error('init registered no MSAL event callback');
  return call[0] as Callback;
};

beforeEach(() => {
  for (const fn of Object.values(msal.instance)) fn.mockClear();
  msal.instance.getAllAccounts.mockReturnValue([]);
  msal.instance.getActiveAccount.mockReturnValue(null);
  msal.instance.handleRedirectPromise.mockResolvedValue(null);
  msal.instance.acquireTokenSilent.mockResolvedValue({ accessToken: 'token' });
  localStorage.clear();
});

test('the MSAL config is QniConnect authConfig.js (AUTH.R1)', async () => {
  await createMsalAuth().init();
  expect(msal.config).toMatchObject({
    auth: {
      clientId: import.meta.env.REACT_APP_CLIENT_ID || 'demoClientID',
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: ORIGIN, postLogoutRedirectUri: ORIGIN, navigateToLoginRequestUrl: true,
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: true },
    system: { loggerOptions: { piiLoggingEnabled: false, logLevel: 1 } },
  });
});

test('init sets the first cached account active (index.js, AUTH.M7, AUTH.M9)', async () => {
  const first = account(), second = account({ homeAccountId: 'other', username: 'bo@contoso.com' });
  msal.instance.getAllAccounts.mockReturnValue([first, second]);
  await createMsalAuth().init();
  expect(msal.instance.initialize).toHaveBeenCalledTimes(1);
  expect(msal.instance.handleRedirectPromise).toHaveBeenCalledTimes(1);
  const [initializedAt] = msal.instance.initialize.mock.invocationCallOrder;
  const [redirectHandledAt = 0] = msal.instance.handleRedirectPromise.mock.invocationCallOrder;
  expect(initializedAt).toBeLessThan(redirectHandledAt);
  expect(msal.instance.setActiveAccount).toHaveBeenCalledWith(first);
});

test('the event callback is registered before the redirect is handled (index.js:27-38, AUTH.R3)', async () => {
  await createMsalAuth().init();
  const [registeredAt = Infinity] = msal.instance.addEventCallback.mock.invocationCallOrder;
  const [redirectHandledAt = 0] = msal.instance.handleRedirectPromise.mock.invocationCallOrder;
  expect(registeredAt).toBeLessThan(redirectHandledAt);
});

test('the MSAL logger drops a message that contains PII and forwards any other (AUTH.R1)', async () => {
  await createMsalAuth().init();
  type LoggerCallback = (level: number, message: string, containsPii: boolean) => void;
  const loggerCallback = (msal.config as { system: { loggerOptions: { loggerCallback: LoggerCallback } } }).system.loggerOptions.loggerCallback;
  const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
  try {
    loggerCallback(1, 'user ana@contoso.com signed in', true);
    expect(log).not.toHaveBeenCalled();
    loggerCallback(1, 'token cache hit', false);
    expect(log).toHaveBeenCalledExactlyOnceWith('token cache hit');
  } finally {
    log.mockRestore();
  }
});

test('init with an empty MSAL cache sets no account active', async () => {
  await createMsalAuth().init();
  expect(msal.instance.setActiveAccount).not.toHaveBeenCalled();
});

test('a redirect result marks the session signed in (AUTH.R14)', async () => {
  const signedIn = account();
  msal.instance.handleRedirectPromise.mockResolvedValue({ account: signedIn });
  msal.instance.getAllAccounts.mockReturnValue([signedIn]);
  await createMsalAuth().init();
  expect(localStorage.getItem('isAuthenticated')).toBe('true');
  expect(msal.instance.setActiveAccount).toHaveBeenCalledWith(signedIn);
});

test('a failed redirect result is logged, not thrown, and the app still starts (AUTH.R14)', async () => {
  msal.instance.handleRedirectPromise.mockRejectedValue(new Error('state mismatch'));
  await expect(createMsalAuth().init()).resolves.toBeUndefined();
});

test('the event callback writes and removes isAuthenticated (AUTH.R3)', async () => {
  await createMsalAuth().init();
  const callback = eventCallback();
  const signedIn = account();
  callback({ eventType: 'msal:loginSuccess', payload: { account: signedIn } });
  expect(msal.instance.setActiveAccount).toHaveBeenLastCalledWith(signedIn);
  expect(localStorage.getItem('isAuthenticated')).toBe('true');
  callback({ eventType: 'msal:logoutSuccess', payload: null });
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
});

test('a LOGIN_SUCCESS with no payload changes nothing (AUTH.R3)', async () => {
  await createMsalAuth().init();
  const callback = eventCallback();
  msal.instance.setActiveAccount.mockClear();
  callback({ eventType: 'msal:loginSuccess', payload: null });
  expect(msal.instance.setActiveAccount).not.toHaveBeenCalled();
  expect(localStorage.getItem('isAuthenticated')).toBeNull();
});

test('account() is the active account, else the first cached one, as QniConnect read it (AUTH.M9, AUTH.R22)', () => {
  const adapter = createMsalAuth();
  expect(adapter.account()).toBeNull();
  msal.instance.getAllAccounts.mockReturnValue([account({ idTokenClaims: { oid: 'oid-1', login_hint: 'hint' } })]);
  expect(adapter.account()).toEqual({ oid: 'oid-1', email: 'ana@contoso.com', name: 'Ana Silva', loginHint: 'hint' });
  msal.instance.getActiveAccount.mockReturnValue(account({ idTokenClaims: {}, username: 'bo@contoso.com', name: '' }));
  expect(adapter.account()).toEqual({ oid: 'local-oid', email: 'bo@contoso.com', name: 'Unknown User' });
});

test("token('bc') asks for https://api.businesscentral.dynamics.com/.default (AUTH.C3)", async () => {
  const active = account();
  msal.instance.getActiveAccount.mockReturnValue(active);
  msal.instance.acquireTokenSilent.mockResolvedValue({ accessToken: 'bc-token' });
  await expect(createMsalAuth().token('bc')).resolves.toBe('bc-token');
  expect(msal.instance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: BC_SCOPES, account: active });
});

test("token('login') asks for User.Read openid profile email (AUTH.M1)", async () => {
  const active = account();
  msal.instance.getAllAccounts.mockReturnValue([active]);
  msal.instance.acquireTokenSilent.mockResolvedValue({ accessToken: 'login-token' });
  await expect(createMsalAuth().token('login')).resolves.toBe('login-token');
  expect(msal.instance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES, account: active });
});

test('InteractionRequiredAuthError redirects and rethrows (AUTH.M4, AUTH.R33)', async () => {
  msal.instance.getActiveAccount.mockReturnValue(account());
  const error = new InteractionRequiredAuthError('consent_required');
  msal.instance.acquireTokenSilent.mockRejectedValue(error);
  await expect(createMsalAuth().token('login')).rejects.toBe(error);
  expect(msal.instance.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES });
});

test("InteractionRequiredAuthError on token('bc') redirects for the scopes it asked for (AUTH.M4 AuthContext.js:336)", async () => {
  msal.instance.getActiveAccount.mockReturnValue(account());
  const error = new InteractionRequiredAuthError('interaction_required');
  msal.instance.acquireTokenSilent.mockRejectedValue(error);
  await expect(createMsalAuth().token('bc')).rejects.toBe(error);
  expect(msal.instance.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: BC_SCOPES });
});

test('any other token error is rethrown with no redirect (AUTH.R33)', async () => {
  msal.instance.getActiveAccount.mockReturnValue(account());
  const error = new Error('network');
  msal.instance.acquireTokenSilent.mockRejectedValue(error);
  await expect(createMsalAuth().token('bc')).rejects.toBe(error);
  expect(msal.instance.acquireTokenRedirect).not.toHaveBeenCalled();
});

test('token() with no account redirects to sign in and returns null (AUTH.R33)', async () => {
  await expect(createMsalAuth().token('bc')).resolves.toBeNull();
  expect(msal.instance.acquireTokenSilent).not.toHaveBeenCalled();
  expect(msal.instance.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES });
});

/* SignInButton.js (AUTH.R18): a window 768 px wide or less goes straight to the redirect. */
const atWidth = (w: number) => { Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w }); };
const WIDTH = window.innerWidth;
afterEach(() => { atWidth(WIDTH); });

test('signIn redirects to Microsoft with the login scopes (AUTH.M3)', async () => {
  atWidth(768);
  await createMsalAuth().signIn();
  expect(msal.instance.loginRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES, redirectUri: ORIGIN });
  expect(msal.instance.loginPopup).not.toHaveBeenCalled();
});

/* Ruling A2: QniConnect's popup first on a wide window (AUTH.M2, AUTH.R18). */
test('wider than 768 px, signIn tries the popup first and makes its account active (AUTH.M2, AUTH.R18)', async () => {
  atWidth(769);
  const a = account();
  msal.instance.loginPopup.mockResolvedValueOnce({ account: a });
  await createMsalAuth().signIn();
  expect(msal.instance.loginPopup).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES });
  expect(msal.instance.setActiveAccount).toHaveBeenCalledWith(a);
  expect(msal.instance.loginRedirect).not.toHaveBeenCalled();
});

test('a popup that fails falls back to the redirect, and is only logged (AUTH.R18)', async () => {
  atWidth(1440);
  const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  msal.instance.loginPopup.mockRejectedValueOnce(new Error('popup_window_error'));
  await createMsalAuth().signIn();
  expect(msal.instance.loginRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES, redirectUri: ORIGIN });
  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});

/* final review M1: the gate's sign-in is not a click, so a popup would be
   blocked; it asks for the redirect alone, whatever the width. */
test('signIn({ popup: false }) goes straight to the redirect on a wide window', async () => {
  atWidth(1440);
  await createMsalAuth().signIn({ popup: false });
  expect(msal.instance.loginPopup).not.toHaveBeenCalled();
  expect(msal.instance.loginRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES, redirectUri: ORIGIN });
});

test('reauthenticate redirects with the login request (AUTH.M4, AUTH.R30, AUTH.R31)', async () => {
  await createMsalAuth().reauthenticate();
  expect(msal.instance.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: LOGIN_SCOPES });
});

test('signOut passes login_hint, then sid, then username as logoutHint (AUTH.M5, AUTH.R46)', async () => {
  const adapter = createMsalAuth();
  const cases: [AccountInfo, string][] = [
    [account({ idTokenClaims: { login_hint: 'the-hint', sid: 'the-sid' } }), 'the-hint'],
    [account({ idTokenClaims: { sid: 'the-sid' } }), 'the-sid'],
    [account({ idTokenClaims: {} }), 'ana@contoso.com'],
  ];
  for (const [active, hint] of cases) {
    msal.instance.getActiveAccount.mockReturnValue(active);
    msal.instance.logoutRedirect.mockClear();
    await adapter.signOut();
    expect(msal.instance.logoutRedirect).toHaveBeenCalledWith({ account: active, logoutHint: hint, postLogoutRedirectUri: ORIGIN });
  }
});

test('signOut falls back to the first cached account when none is active (AUTH.R46)', async () => {
  const cached = account({ idTokenClaims: { sid: 'the-sid' } });
  msal.instance.getAllAccounts.mockReturnValue([cached]);
  await createMsalAuth().signOut();
  expect(msal.instance.logoutRedirect).toHaveBeenCalledWith({ account: cached, logoutHint: 'the-sid', postLogoutRedirectUri: ORIGIN });
});

/* The landing page's and the sign-in page's MSAL calls (public inventory
   LAND.C1, C2, LOGIN.C1, C2): both buttons sign in through this adapter, so
   both make exactly these calls. */
describe('the public pages sign in through these calls', () => {
  test('LAND.C1 wire and LOGIN.C1 wire: MSAL loginPopup with the login request, wider than 768 px', async () => {
    atWidth(1024);
    msal.instance.loginPopup.mockResolvedValueOnce({ account: account() });
    await createMsalAuth().signIn();
    expect(msal.instance.loginPopup.mock.calls).toEqual([[{ scopes: LOGIN_SCOPES }]]);
  });
  test('LAND.C2 wire and LOGIN.C2 wire: MSAL loginRedirect with the login request and redirectUri the origin (LAND.R8)', async () => {
    atWidth(390);
    await createMsalAuth().signIn();
    expect(msal.instance.loginRedirect.mock.calls).toEqual([[{ scopes: LOGIN_SCOPES, redirectUri: ORIGIN }]]);
  });
  test('LAND.R6 and LOGIN.R6: a popup that throws falls through to the redirect; exactly 768 px goes straight to the redirect', async () => {
    atWidth(769);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    msal.instance.loginPopup.mockRejectedValueOnce(new Error('user_cancelled'));
    await createMsalAuth().signIn();
    expect(msal.instance.loginRedirect).toHaveBeenCalledTimes(1);
    msal.instance.loginPopup.mockClear();
    msal.instance.loginRedirect.mockClear();
    atWidth(768);
    await createMsalAuth().signIn();
    expect(msal.instance.loginPopup).not.toHaveBeenCalled();
    expect(msal.instance.loginRedirect).toHaveBeenCalledTimes(1);
    vi.mocked(logger.error).mockRestore();
  });
  test('LAND.R7 and LOGIN.R6: a redirect that cannot start is thrown to the page, which says so', async () => {
    atWidth(390);
    msal.instance.loginRedirect.mockRejectedValueOnce(new Error('interaction_in_progress'));
    await expect(createMsalAuth().signIn()).rejects.toThrow('interaction_in_progress');
  });
  test('LOGIN.R9: the configuration that affects sign-in is QniConnect\'s (authority common, sessionStorage with the cookie, back to the request URL)', async () => {
    await createMsalAuth().init();
    expect(msal.config).toMatchObject({
      auth: { authority: 'https://login.microsoftonline.com/common', navigateToLoginRequestUrl: true },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: true },
    });
  });
});
