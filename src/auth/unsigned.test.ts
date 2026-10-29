/* The auth stub's tokens are unsigned JWTs (alg none). Only a fake server may
   ever see one: both clients ask sendableToken before attaching a token. */
import { stubAuth, STUB_ACCOUNT_KEY } from '@/mocks/auth-stub';
import { isUnsignedToken, sendableToken, UnsignedTokenError } from './unsigned';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (header: object) => `${b64url(JSON.stringify(header))}.${b64url('{"email":"ana@contoso.com"}')}.sig`;

test("the stub's tokens read as unsigned", async () => {
  sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify({ oid: 'o', email: 'ana@contoso.com', name: 'Ana' }));
  const token = await stubAuth.token('bc');
  expect(isUnsignedToken(token ?? '')).toBe(true);
});

test('alg none in any case is unsigned; a signed JWT, an opaque token or a malformed one is not', () => {
  expect(isUnsignedToken(jwt({ alg: 'none' }))).toBe(true);
  expect(isUnsignedToken(jwt({ alg: 'None', typ: 'JWT' }))).toBe(true);
  expect(isUnsignedToken(jwt({ alg: 'RS256', typ: 'JWT' }))).toBe(false);
  expect(isUnsignedToken('3f9a1c2e-uuid-session-token')).toBe(false);
  expect(isUnsignedToken('not-base64!.x.y')).toBe(false);
  expect(isUnsignedToken('')).toBe(false);
});

test('an unsigned token is refused when no fake server answers, and allowed when one does', () => {
  const unsigned = jwt({ alg: 'none' }), signed = jwt({ alg: 'RS256' });
  expect(() => sendableToken(unsigned, false)).toThrow(UnsignedTokenError);
  expect(sendableToken(unsigned, true)).toBe(unsigned);
  expect(sendableToken(signed, false)).toBe(signed);
  expect(sendableToken(signed, true)).toBe(signed);
});
