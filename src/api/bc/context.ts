/* QniConnect's localStorage keys (constraints: names and meaning kept), typed,
   and the /bc context headers read from them. Every read is at call time, as
   QniConnect read them, so another tab's change is seen on the next call.
   Storage that throws (private mode, blocked) reads as unset. */
import type { BcHeader } from '@/contract/bc/endpoints';

export interface BcEnvironment { id: string; name: string; [k: string]: unknown }

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* no storage: the value lasts this call */ }
};
const readJson = (key: string): unknown => {
  const raw = read(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/* AuthContext.logout's list (AUTH.R46 step 3), in its order. */
const LOGOUT_KEYS = ['isAuthenticated', 'activeEnvironment', 'registrationId', 'currentUser', 'clientCompanies',
  'clientCompanyId', 'clientCompanyName', 'employeeData', 'employeeId', 'employeeNo'] as const;
/* and its sweep (step 4): case-sensitive, lower-case substrings */
const swept = (key: string) => key.startsWith('bc_') || key.includes('auth') || key.includes('user') || key.includes('token');

export const bcContext = {
  registrationId: (): string | null => read('registrationId'),
  setRegistrationId: (v: string | null) => { write('registrationId', v); },
  /* activeEnvironment, when it is an object with an id (AUTH.R34 stores only those) */
  environment: (): BcEnvironment | null => {
    const v = readJson('activeEnvironment');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const e = v as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id === '') return null;
    return { ...e, id: e.id, name: text(e.name) };
  },
  setEnvironment: (e: BcEnvironment | null) => { write('activeEnvironment', e ? JSON.stringify(e) : null); },
  clientCompanyId: (): string | null => read('clientCompanyId'),
  setClientCompanyId: (v: string | null) => { write('clientCompanyId', v); },
  setClientCompanyName: (v: string | null) => { write('clientCompanyName', v); },
  /* clientCompanies, the dashboard's last company list (portal HOME.R6, HOME.R7):
     null when it is not stored or not JSON */
  clientCompanies: (): unknown => readJson('clientCompanies'),
  setClientCompanies: (v: unknown[]) => { write('clientCompanies', JSON.stringify(v)); },
  employeeNo: (): string | null => read('employeeNo'),
  setEmployeeNo: (v: string | null) => { write('employeeNo', v); },
  /* employeeId and employeeData, from the profile (portal HOME.R10) */
  setEmployeeRecord: (id: string, data: unknown) => { write('employeeId', id); write('employeeData', JSON.stringify(data)); },
  /* currentUser.email */
  userEmail: (): string | null => {
    const u = readJson('currentUser');
    const email = u && typeof u === 'object' ? (u as Record<string, unknown>).email : undefined;
    return typeof email === 'string' && email !== '' ? email : null;
  },
  /* A context header's value, '' when unset, exactly as QniConnect's `|| ''`
     (portal inventory HOME.C2 and HOME.C3 for the ones auth does not send). */
  headerValue(h: BcHeader): string {
    switch (h) {
      case 'X-BC-Environment': return bcContext.environment()?.id || '';
      case 'X-Registration-ID': return bcContext.registrationId() || '';
      case 'X-Client-Environment': return bcContext.environment()?.name || '';
      case 'X-Client-Company-ID': return bcContext.clientCompanyId() || '';
      case 'X-Employee-No':
      case 'X-LocalStorage-EmployeeNo': return bcContext.employeeNo() || '';
      case 'X-User-Email': return bcContext.userEmail()?.toLowerCase() || '';
      case 'X-Session-Request-Time': return Date.now().toString();
    }
  },
  /* AuthContext.logout's localStorage cleanup (AUTH.R46 steps 3 and 4): the
     named keys, then every key the sweep matches. Cookies and the MSAL
     redirect are the session's to do. */
  clearAll() {
    for (const k of LOGOUT_KEYS) write(k, null);
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== null) keys.push(k); }
      for (const k of keys) if (swept(k)) localStorage.removeItem(k);
    } catch { /* no storage: nothing to sweep */ }
  },
};
