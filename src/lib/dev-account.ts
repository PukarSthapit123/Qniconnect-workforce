/* The person the dev picker (/dev/sign-in) chose, for development with the
   fake server only (spec section 6): while it is set, the fake server answers
   as that seed person whoever the Microsoft account is, so any Entra account
   can try the employee, manager and admin screens. The /api/v1 client sends
   it as X-Dev-Account, and the fake /bc portal check reads it here, so the
   /bc wire stays exactly as QniConnect sends it. Every caller reads it behind
   FAKE_SERVER_ON, so a plain production build never does; build:check looks
   for the key to prove it. Kept for the tab only (sessionStorage), like the
   MSAL cache. */
export const DEV_ACCOUNT_KEY = 'qniconnect.devAccount';
export const DEV_ACCOUNT_HEADER = 'X-Dev-Account';
/* Where the auth stub (src/mocks/auth-stub.ts) keeps its signed-in account;
   here so the dev picker can sign in under the stub without importing the
   fake server's modules. */
export const STUB_ACCOUNT_KEY = 'qniconnect.stubAccount';

export function devAccount(): string | null {
  try { return sessionStorage.getItem(DEV_ACCOUNT_KEY) || null; } catch { return null; }
}

export function setDevAccount(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(DEV_ACCOUNT_KEY, email);
    else sessionStorage.removeItem(DEV_ACCOUNT_KEY);
  } catch { /* no storage: the choice lasts until the page reloads */ }
}
