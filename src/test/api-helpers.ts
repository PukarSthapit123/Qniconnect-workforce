/* Shared by contract and component tests: sign in through the auth stub,
   call the fake server, fault it, and read the store directly to prove what
   changed. */
import { store } from '@/mocks/store';
import { faults } from '@/mocks/faults';
import { STUB_ACCOUNT_KEY, stubAuth, unsignedToken } from '@/mocks/auth-stub';
import { bcStore } from '@/mocks/bc/seed';
import { bcContext } from '@/api/bc/context';
import { DEV_ACCOUNT_KEY } from '@/lib/dev-account';
import type { AuthAccount, AuthAdapter } from '@/auth';
import type { AuditEntry } from '@/contract/audit';
import { isStarterState } from '@/domain/onboarding';

export type Persona = 'employee' | 'manager' | 'admin';
export const FROZEN = '2026-08-13T14:30:00.000Z';
/* Clears faults too, so one a test set but never consumed cannot leak into the next. */
export function resetTo(tenant: 'social' | 'qnipay' = 'social') { faults.length = 0; store.reset(tenant); store.setClock(FROZEN); }

interface Acc { email: string; userType: Persona; employeeCode: string }
/* The first account of that user type whose employee has started. The server
   keeps a new starter (candidate or preboard) to the onboarding portal, so
   the generic persona never picks one: qnipay's first employee accounts are
   Priya Raman (candidate) and Tom Achterberg (preboard), and the tests about
   starters sign in as them by name. */
export function accountOf(t: Persona): Acc {
  const employees = Object.values(store.coll<{ code: string; state: string }>('employees'));
  const started = (code: string) => { const p = employees.find(x => x.code === code); return !p || !isStarterState(p.state); };
  const a = Object.values(store.coll<Acc>('accounts')).find(x => x.userType === t && started(x.employeeCode));
  if (!a) throw new Error(`the seed has no ${t} account for somebody who has started`);
  return a;
}
/* Signing in, as the app does it in tests (VITE_AUTH=stub): the auth stub's
   account in sessionStorage, and its unsigned token, from which the fake
   server reads the email (src/mocks/auth.ts). There is no sign-in request any
   more: the fake server opens the Workforce session the first time it sees
   the address. */
const stubAccountFor = (email: string): AuthAccount => ({ oid: `oid-${email.toLowerCase()}`, email, name: email });
export const tokenOf = (email: string) => unsignedToken(stubAccountFor(email));
/* The stub, minus its page navigations (jsdom cannot navigate): what
   src/test/setup.ts installs for every test file. A test that needs to see a
   sign-in, reauthentication or sign-out happen wraps these in vi.fn. */
export const testAuth: AuthAdapter = {
  ...stubAuth,
  signIn: async () => undefined,
  reauthenticate: async () => undefined,
  signOut: async () => { clearStubAccount(); },
};
export function setStubAccount(email: string) {
  sessionStorage.setItem(STUB_ACCOUNT_KEY, JSON.stringify(stubAccountFor(email)));
}
export function clearStubAccount() {
  try { sessionStorage.removeItem(STUB_ACCOUNT_KEY); sessionStorage.removeItem(DEV_ACCOUNT_KEY); } catch { /* no storage */ }
}
/* The seed's Production environment as environment selection stores it, so a
   test of the whole app lands on the shell, not on environment selection. */
export function setSeedEnvironment() {
  const env = bcStore.db.environments.find(e => e.name === 'Production');
  if (!env) throw new Error('the fake /bc seed has no Production environment');
  bcContext.setEnvironment({ id: env.id, name: env.name, type: env.type, url: env.url, companyName: env.companyName, company_Id: env.company_Id });
}
/* A token for that address whose Workforce session is already open (and its
   "Signed in" audit row written), so what a test snapshots or counts after
   this is what its own calls changed. */
export async function tokenForEmail(email: string): Promise<string> {
  const token = tokenOf(email);
  const r = await fetch('/api/v1/session', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`sign-in as ${email} failed with ${r.status}`);
  return token;
}
export const tokenFor = (t: Persona): Promise<string> => tokenForEmail(accountOf(t).email);
/* As e2e's signInAs: the stub's account and the seed Production environment,
   so the app (and api() through the stub) is signed in as that address. */
export async function signInEmail(email: string) {
  setStubAccount(email);
  setSeedEnvironment();
  return tokenForEmail(email);
}
export const signInAs = (t: Persona) => signInEmail(accountOf(t).email);

export interface Reply { status: number; body: unknown }
export function caller(token: string) {
  return async (method: string, url: string, body?: unknown, ifMatch?: number): Promise<Reply> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ifMatch !== undefined) headers['If-Match'] = String(ifMatch);
    const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
}
export async function fault(method: string, path: string, status = 500) {
  await fetch('/api/_dev/faults', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path, status, times: 1 }) });
}
export const snapshot = (...collections: string[]) =>
  structuredClone(Object.fromEntries(collections.map(c => [c, store.coll(c)])));
export const audits = () => Object.values(store.coll<AuditEntry>('audit'));
export function employeeOf(code: string) {
  const p = Object.values(store.coll<{ id: string; code: string; version: number } & Record<string, unknown>>('employees')).find(x => x.code === code);
  if (!p) throw new Error(`no employee ${code} in the store`);
  return p;
}
