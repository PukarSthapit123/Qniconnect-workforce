/* The stand-in for Microsoft Entra in tests and dev (VITE_AUTH=stub). The
   signed-in account is whatever the dev picker (/dev/sign-in, Task 14) left
   in sessionStorage, and its tokens are unsigned JWTs the fake server can
   read. main.tsx reaches this module only behind __FAKE_SERVER_ON__, so a
   plain production build never carries it; build:check looks for the key and
   the unsigned header below to prove it. */
import type { AuthAccount, AuthAdapter } from '@/auth';
import { STUB_ACCOUNT_KEY } from '@/lib/dev-account';

export { STUB_ACCOUNT_KEY };

const base64url = (text: string) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/* Written out, not JSON.stringify'd, so the header survives minification as
   the text build:check looks for. */
const UNSIGNED_HEADER = '{"alg":"none"}';

const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

const readAccount = (): AuthAccount | null => {
  try {
    const raw = sessionStorage.getItem(STUB_ACCOUNT_KEY);
    if (!raw) return null;
    const { oid, email, name } = JSON.parse(raw) as Record<string, unknown>;
    return isText(oid) && isText(email) && isText(name) ? { oid, email, name } : null;
  } catch {
    return null;
  }
};

/* The unsigned JWT the stub hands out for an account: what the fake servers
   read the email from. Tests build their callers' tokens with it too. */
export function unsignedToken(a: AuthAccount): string {
  const claims = { preferred_username: a.email, email: a.email, oid: a.oid, name: a.name };
  return `${base64url(UNSIGNED_HEADER)}.${base64url(JSON.stringify(claims))}.`;
}

export const stubAuth: AuthAdapter = {
  init: async () => undefined,
  account: readAccount,
  signIn: async () => { window.location.href = '/dev/sign-in'; },
  reauthenticate: async () => { window.location.href = '/dev/sign-in'; },
  signOut: async () => {
    try { sessionStorage.removeItem(STUB_ACCOUNT_KEY); } catch { /* no storage: nothing to clear */ }
    window.location.href = '/';
  },
  token: async () => {
    const a = readAccount();
    return a ? unsignedToken(a) : null;
  },
};
