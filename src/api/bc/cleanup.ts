/* QniConnect's session clean-ups, other than logout's localStorage part
   (bcContext.clearAll). Each is one list in the auth inventory, kept exactly:
   - the cookie sweep: logout (AUTH.R46 step 5), cleanupSession (AUTH.R48)
     and the auth error page (AUTH.R62);
   - cleanupSession: environment selection turning the account away (AUTH.R48);
   - environment selection's "← Home" (AUTH.R58);
   - the auth error page's "Return to Home" (AUTH.R62).
   None of them signs out of Microsoft. Storage that throws counts as empty. */
import { bcContext } from './context';

const remove = (store: Storage, keys: readonly string[]) => {
  try { for (const k of keys) store.removeItem(k); } catch { /* no storage */ }
};
const sweep = (store: Storage, match: (key: string) => boolean) => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k !== null) keys.push(k); }
    for (const k of keys) if (match(k)) store.removeItem(k);
  } catch { /* no storage: nothing to sweep */ }
};

/* Expire every cookie whose name contains msal, auth or session, at path /.
   An HttpOnly cookie, or one set for another path or domain, cannot be
   reached from here, as in QniConnect. */
export function expireAuthCookies(): void {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim() ?? '';
    if (name && (name.includes('msal') || name.includes('auth') || name.includes('session')))
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}

/* sessionStorage keys starting msal., or containing token or auth */
const sweepSessionStorage = () => {
  try { sweep(sessionStorage, k => k.startsWith('msal.') || k.includes('token') || k.includes('auth')); } catch { /* no storage */ }
};

/* The keys "← Home" (AUTH.R58) removes, which cleanupSession (AUTH.R48) and
   "Return to Home" (AUTH.R62) remove too, in QniConnect's order. */
const SESSION_KEYS = ['isAuthenticated', 'currentUser', 'activeEnvironment', 'registrationId', 'employeeNo', 'employeeId',
  'clientCompanyId', 'clientCompanyName', 'clientCompanies'] as const;

const local = (): Storage | null => { try { return localStorage; } catch { return null; } };

/* AUTH.R58: environment selection's "← Home". */
export function clearSessionKeys(): void {
  const l = local();
  if (l) remove(l, SESSION_KEYS);
}

/* AUTH.R48: TenantVerificationService.cleanupSession. No bc_ sweep, no
   Microsoft sign-out. */
export function cleanupSession(): void {
  clearSessionKeys();
  sweepSessionStorage();
  expireAuthCookies();
}

/* AUTH.R62: the auth error page's "Return to Home", before it marks the
   sign-out for the next page load (manual_redirect, AUTH.R63) and leaves. */
export function returnHomeCleanup(): void {
  clearSessionKeys();
  const l = local();
  if (l) sweep(l, k => k.startsWith('bc_') || k.includes('auth') || k.includes('user') || k.includes('token'));
  sweepSessionStorage();
  expireAuthCookies();
}

/* logout's own order (AUTH.R46 steps 3 to 5): the named keys and the sweep,
   then the cookies. */
export function logoutCleanup(): void {
  bcContext.clearAll();
  expireAuthCookies();
}

/* AUTH.R63: "Return to Home" left this for the next page load. */
export const MANUAL_REDIRECT_KEY = 'manual_redirect';
export function markManualRedirect(): void {
  try { sessionStorage.setItem(MANUAL_REDIRECT_KEY, 'true'); } catch { /* no storage: the sign-out is not finished for you */ }
}
/* True once, then gone. */
export function takeManualRedirect(): boolean {
  try {
    if (sessionStorage.getItem(MANUAL_REDIRECT_KEY) !== 'true') return false;
    sessionStorage.removeItem(MANUAL_REDIRECT_KEY);
    return true;
  } catch { return false; }
}
