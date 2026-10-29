import type { AuthAdapter } from './types';

export type { AuthAccount, AuthAdapter, TokenKind } from './types';

let current: AuthAdapter | null = null;

/* main.tsx sets the adapter once, before rendering; a test sets its own. */
export function setAuth(a: AuthAdapter): void { current = a; }

export function auth(): AuthAdapter {
  if (!current) throw new Error('No auth adapter is set: main.tsx (or the test) must call setAuth first.');
  return current;
}
