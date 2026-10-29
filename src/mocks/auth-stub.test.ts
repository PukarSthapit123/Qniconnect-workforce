import { STUB_ACCOUNT_KEY, stubAuth } from './auth-stub';

const decode = (part: string) => {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
};

const ANA = { oid: 'oid-ana', email: 'ana@contoso.com', name: 'Ana Silva' };

beforeEach(() => { sessionStorage.clear(); });

test('account() is null with no stub account', async () => {
  await stubAuth.init();
  expect(stubAuth.account()).toBeNull();
});

test('account() is the stub account kept in sessionStorage', () => {
  sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify(ANA));
  expect(stubAuth.account()).toEqual(ANA);
});

test('a malformed stub account reads as no account', () => {
  sessionStorage.setItem(STUB_ACCOUNT_KEY, '{not json');
  expect(stubAuth.account()).toBeNull();
  sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify({ email: 'ana@contoso.com' }));
  expect(stubAuth.account()).toBeNull();
});

test('token() decodes to the stub email', async () => {
  sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify({ ...ANA, name: 'Ána Silva' }));
  for (const kind of ['login', 'bc'] as const) {
    const token = await stubAuth.token(kind);
    expect(token).not.toBeNull();
    const [header = '', payload = '', signature] = (token ?? '').split('.');
    expect(decode(header)).toEqual({ alg: 'none' });
    expect(decode(payload)).toEqual({ preferred_username: ANA.email, email: ANA.email, oid: ANA.oid, name: 'Ána Silva' });
    expect(signature).toBe('');
    expect(token).not.toMatch(/[+/=]/);
  }
});

test('token() is null with no stub account', async () => {
  await expect(stubAuth.token('bc')).resolves.toBeNull();
});
