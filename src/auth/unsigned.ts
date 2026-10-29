/* The auth stub (src/mocks/auth-stub.ts) signs nobody in for real: its tokens
   are JWTs whose header says alg none. A fake server reads them; a real one
   must never be handed one. Both clients (src/api/client.ts for /api/v1 and
   src/api/bc/client.ts for /bc and /session) ask sendableToken before they
   attach a token, each with its own fake-server switch. The check reads the
   header, so it holds whichever adapter produced the token. */

export class UnsignedTokenError extends Error {
  constructor() {
    super('This sign-in is an unsigned test token, so it was not sent to a real server. Nothing was sent.');
    this.name = 'UnsignedTokenError';
  }
}

const decodeSegment = (segment: string): unknown => {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

/* True when the token is a JWT whose header names alg none, in any case. An
   opaque token, or one whose header cannot be read, is not one. */
export function isUnsignedToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0]) return false;
  try {
    const header = decodeSegment(parts[0]);
    if (!header || typeof header !== 'object') return false;
    const alg = (header as { alg?: unknown }).alg;
    return typeof alg === 'string' && alg.toLowerCase() === 'none';
  } catch {
    return false;
  }
}

/* The token to attach, or a refusal when it is unsigned and no fake server
   will answer the request. */
export function sendableToken(token: string, fakeServerAnswers: boolean): string {
  if (!fakeServerAnswers && isUnsignedToken(token)) throw new UnsignedTokenError();
  return token;
}
