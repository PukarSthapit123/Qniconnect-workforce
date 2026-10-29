/* The Workforce api() client follows the same rule as bcApi: the auth stub's
   unsigned token never reaches a server that is not the fake one. Whether the
   /api/v1 fake is on is a build-time constant (lib/fake-server.ts), so this
   file loads a fresh copy of the client with the constant switched off. */
import type { MockInstance } from 'vitest';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const UNSIGNED = `${b64url('{"alg":"none"}')}.${b64url('{"email":"ana@contoso.com"}')}.`;
const SIGNED = `${b64url('{"alg":"RS256"}')}.${b64url('{"email":"ana@contoso.com"}')}.sig`;

const freshClient = async (fakeServerOn: boolean) => {
  vi.resetModules();
  vi.doMock('@/lib/fake-server', () => ({ FAKE_SERVER_ON: fakeServerOn }));
  const [{ api, ApiError }, { setAuth }, { getSession }, { testAuth }] = await Promise.all([import('./client'), import('@/auth'), import('@/contract/session'), import('@/test/api-helpers')]);
  /* the token the (fresh) auth adapter hands out, and which kind was asked for */
  const kinds: string[] = [];
  const setToken = (t: string | null | (() => never)) => {
    setAuth({ ...testAuth, token: async kind => { kinds.push(kind); return typeof t === 'function' ? t() : t; } });
  };
  return { api, ApiError, setToken, getSession, kinds };
};
const sent = (i: number) => new Headers(fetchSpy.mock.calls[i]?.[1]?.headers);

let fetchSpy: MockInstance<typeof fetch>;
beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 500 })); });
afterEach(() => { fetchSpy.mockRestore(); vi.doUnmock('@/lib/fake-server'); vi.resetModules(); localStorage.clear(); sessionStorage.clear(); });

test('api() refuses to attach an unsigned token when the fake server is off, and sends nothing', async () => {
  const { api, ApiError, setToken, getSession } = await freshClient(false);
  setToken(UNSIGNED);
  const e: unknown = await api(getSession).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect(e).toMatchObject({ status: 401, refusal: { code: 'unsigned-token' } });
  expect(fetchSpy).not.toHaveBeenCalled();
  setToken(null);
});

test('api() attaches a signed token with the fake server off, and the unsigned one with it on', async () => {
  const off = await freshClient(false);
  off.setToken(SIGNED);
  await off.api(off.getSession).catch(() => undefined);
  expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(`Bearer ${SIGNED}`);

  const on = await freshClient(true);
  on.setToken(UNSIGNED);
  await on.api(on.getSession).catch(() => undefined);
  expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(`Bearer ${UNSIGNED}`);
  on.setToken(null);
});

/* Spec section 6: /api/v1 carries the Microsoft login token, and the
   environment and registration headers once environment selection has
   stored them; the dev picker's choice only beside the fake server. */
test('api() takes the login token from auth(), and sends X-BC-Environment and X-Registration-ID only when set', async () => {
  const c = await freshClient(true);
  c.setToken(SIGNED);
  await c.api(c.getSession).catch(() => undefined);
  expect(c.kinds).toEqual(['login']);
  expect(sent(0).get('Authorization')).toBe(`Bearer ${SIGNED}`);
  expect(sent(0).has('X-BC-Environment')).toBe(false);
  expect(sent(0).has('X-Registration-ID')).toBe(false);

  localStorage.setItem('activeEnvironment', JSON.stringify({ id: 'env-production-01', name: 'Production' }));
  localStorage.setItem('registrationId', 'REG-1');
  await c.api(c.getSession).catch(() => undefined);
  expect(sent(1).get('X-BC-Environment')).toBe('env-production-01');
  expect(sent(1).get('X-Registration-ID')).toBe('REG-1');
});

test('api() sends X-Dev-Account only while the fake server runs and the dev picker has chosen someone', async () => {
  sessionStorage.setItem('qniconnect.devAccount', 'amara.okafor@brightpath.org');
  const on = await freshClient(true);
  on.setToken(UNSIGNED);
  await on.api(on.getSession).catch(() => undefined);
  expect(sent(0).get('X-Dev-Account')).toBe('amara.okafor@brightpath.org');

  const off = await freshClient(false);
  off.setToken(SIGNED);
  await off.api(off.getSession).catch(() => undefined);
  expect(sent(1).has('X-Dev-Account')).toBe(false);

  sessionStorage.clear();
  const unpicked = await freshClient(true);
  unpicked.setToken(UNSIGNED);
  await unpicked.api(unpicked.getSession).catch(() => undefined);
  expect(sent(2).has('X-Dev-Account')).toBe(false);
});

test('api() answers a token that needs interaction as a 401 of its own code, and sends nothing', async () => {
  const c = await freshClient(true);
  c.setToken(() => { const e = new Error('interaction_required'); e.name = 'InteractionRequiredAuthError'; throw e; });
  const e: unknown = await c.api(c.getSession).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(c.ApiError);
  expect(e).toMatchObject({ status: 401, refusal: { code: 'interaction-required' } });
  expect(fetchSpy).not.toHaveBeenCalled();
});
/* Spec N9 and R4, Ruling F1: with VITE_FAKE_MODULES naming some modules, a
   module left off goes to the real backend, so it is never handed the
   stub's unsigned token, nor the dev picker's choice; a faked one still is. */
test('api() with VITE_FAKE_MODULES: an unsigned token goes only to a module the fake answers', async () => {
  vi.stubEnv('VITE_FAKE_MODULES', 'core,ts');
  sessionStorage.setItem('qniconnect.devAccount', 'amara.okafor@brightpath.org');
  const c = await freshClient(true);
  const { getMyOnboarding } = await import('@/contract/onboarding');
  c.setToken(UNSIGNED);
  await c.api(c.getSession).catch(() => undefined);
  expect(sent(0).get('Authorization')).toBe(`Bearer ${UNSIGNED}`);
  expect(sent(0).get('X-Dev-Account')).toBe('amara.okafor@brightpath.org');
  const e: unknown = await c.api(getMyOnboarding).catch((x: unknown) => x);
  expect(e).toMatchObject({ status: 401, refusal: { code: 'unsigned-token' } });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  c.setToken(SIGNED);
  await c.api(getMyOnboarding).catch(() => undefined);
  expect(sent(1).get('Authorization')).toBe(`Bearer ${SIGNED}`);
  expect(sent(1).has('X-Dev-Account')).toBe(false);
  vi.unstubAllEnvs();
});
