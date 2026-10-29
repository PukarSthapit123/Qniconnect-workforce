/* The one session (spec section 6), signed in as QniConnect signs in
   (docs/superpowers/inventory/auth.md), in this order:
     1. the Microsoft account (auth(), MSAL or the dev stub), and its login
        token (AUTH.M1);
     2. the portal check, POST /bc/portalUsers/verify (AUTH.C1). On `exists`
        the user data is merged, isAdmin is kept in state only (never stored,
        never read back: AUTH.R20, AUTH.R22), currentUser is stored without
        it, registrationId is stored, /session/init (AUTH.C2) is sent with its
        errors logged and ignored, and the stored environment is restored,
        unless /bc/environments (AUTH.C4) no longer lists it: then it is
        dropped and the person chooses again (Review focus 5).
        Not registered: QniConnect's message, isAuthenticated removed, and a
        sign-out 15 s later (AUTH.R23);
     3. the Workforce session, GET /api/v1/session.
   Nothing routes until all three have answered (`ready`), so a reload of an
   admin page waits for isAdmin to be verified again instead of bouncing
   (Review focus 1, Ruling Q6).

   A 401 from the QniConnect API ('auth-required') or from /api/v1
   ('signed-out', toasted first) reauthenticates, once. A 401 during the
   portal check (verify through session init) does not: it is answered by the
   auth error (AUTH.R24), so it cannot loop back into the call that raised it
   (Task 13 review, review M3). Nor does a token that needed interaction: the
   adapter has already started its one redirect (review M1, M4).

   While the fake server runs, a Microsoft account that is none of the seed
   people is sent to the dev picker (`unmatched`) before anything is checked;
   the person picked there answers instead (src/lib/dev-account.ts).

   QniConnect's automatic sign-outs are kept: five minutes without activity
   signs out (AUTH.R25), another tab removing isAuthenticated reauthenticates
   this one (AUTH.R30), and a page load that finds the auth error page's
   manual_redirect finishes the sign-out it started (AUTH.R63). Signing out
   clears QniConnect's keys, sweeps, expires the auth cookies, then signs out
   of Microsoft (AUTH.R46). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, INTERACTION_REQUIRED } from '@/api/client';
import { bcApi, BcError } from '@/api/bc/client';
import { bcContext, type BcEnvironment } from '@/api/bc/context';
import { logoutCleanup, takeManualRedirect } from '@/api/bc/cleanup';
import { environmentsList, registrationFilter } from '@/contract/bc/environments';
import { bcEvents } from '@/api/bc/events';
import { sessionEvents } from '@/api/session-events';
import { queryClient } from '@/api/query';
import { auth, type AuthAccount } from '@/auth';
import { portalUserVerify, sessionInit, type PortalUserVerifyResponse } from '@/contract/bc/session';
import { deleteSession, endViewAs, getSession, listAccounts, startViewAs, type Session } from '@/contract/session';
import type { Refusal } from '@/contract/common';
import { FAKE_SERVER_ON } from '@/lib/fake-server';
import { devAccount, setDevAccount } from '@/lib/dev-account';
import { logger } from '@/lib/logger';
import { toastRefusal } from '@/ui';
import { useInactivitySignOut } from './useInactivitySignOut';
import { useCrossTabSignOut } from './useCrossTabSignOut';

/* The portal user as QniConnect kept it: the Microsoft account's basic data
   (AUTH.R22) with the portal check's userData spread over it. */
export interface PortalUser { oid: string; email: string; name: string; id?: string; employeeNo?: string; registrationId?: string; status?: string; [k: string]: unknown }
export interface PortalState { user: PortalUser | null; isAdmin: boolean; adminVerified: boolean; pendingFirstLogin: boolean; error: string | null }
/* checking: signing in (nothing routes); signed-out: no Microsoft account;
   signing-out: on the way out (no sign-in check starts again, Ruling Q7). */
export type SessionStatus = 'checking' | 'signed-out' | 'signing-out' | 'ready';

interface Ctx {
  session: Session | null;
  ready: boolean;
  status: SessionStatus;
  portal: PortalState;
  environment: BcEnvironment | null;
  /* development only: the Microsoft account is none of the seed people */
  unmatched: boolean;
  /* development only: ...and the portal check says it is a portal admin, so
     the dev picker suggests a seed admin (spec N18) */
  unmatchedAdmin: boolean;
  /* the Workforce session could not be read (not a 401): the shell offers a retry */
  sessionError: Refusal | null;
  retrySession(): void;
  signIn(opts?: { popup?: boolean }): Promise<void>; signOut(): Promise<void>;
  setEnvironment(e: BcEnvironment): void; completeFirstLogin(): void;
  viewAs(employeeCode: string): Promise<void>; endViewAs(): Promise<void>;
}
const SessionCtx = createContext<Ctx | null>(null);
export const useSession = (): Ctx => { const c = useContext(SessionCtx); if (!c) throw new Error('useSession outside provider'); return c; };
/* The signed-in session, or null, without requiring a provider: for a page
   that only needs to know who is making a change (a component test may mount
   the page on its own). */
export const useCurrentSession = (): Session | null => useContext(SessionCtx)?.session ?? null;
const SIGNED_OUT_PORTAL: PortalState = { user: null, isAdmin: false, adminVerified: false, pendingFirstLogin: false, error: null };
export const usePortal = (): PortalState => useContext(SessionCtx)?.portal ?? SIGNED_OUT_PORTAL;
/* The chosen Business Central environment, or null, without requiring a provider. */
export const useBcEnvironment = (): BcEnvironment | null => useContext(SessionCtx)?.environment ?? null;

/* QniConnect's own words (AUTH.R23, AUTH.R24, AUTH.R26a). */
export const NOT_REGISTERED = 'Your account is not registered in QniConnect. Please contact your administrator.';
const VERIFY_FAILED = 'Failed to verify your account in Business Central';
const VALIDATION_FAILED = 'Authentication validation failed. Please try again.';
const TOKEN_FAILED = 'Authentication error. Please try again.';
const SIGN_OUT_AFTER_MS = 15_000;

const readLocal = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const removeLocal = (k: string) => { try { localStorage.removeItem(k); } catch { /* no storage */ } };
const isInteractionRequired = (e: unknown) => e instanceof Error && e.name === 'InteractionRequiredAuthError';
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

/* AUTH.R20: the user stored at the last sign-in, without isAdmin, while
   isAuthenticated says the session is live. A copy that cannot be read is
   removed (currentUser only). */
function restoredUser(): PortalUser | null {
  if (readLocal('isAuthenticated') !== 'true') return null;
  const raw = readLocal('currentUser');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { isAdmin: _dropped, ...rest } = parsed as Record<string, unknown>;
    void _dropped;
    return { ...rest, oid: String(rest.oid ?? ''), email: String(rest.email ?? ''), name: String(rest.name ?? '') };
  } catch {
    removeLocal('currentUser');
    return null;
  }
}

/* AUTH.R24's text for a portal check that failed (not a 404): the body's
   message, else its error.message, else the error's own message, else
   QniConnect's fallback. An `error` that is not text never reaches the
   screen as an object (Ruling Q2, inventory A1): BcError's own message has
   already fallen back to "API Error: <status>" for it. */
function verifyErrorText(e: unknown): string {
  if (e instanceof BcError) {
    const d = e.data && typeof e.data === 'object' ? (e.data as Record<string, unknown>) : {};
    const nested = d.error && typeof d.error === 'object' ? (d.error as Record<string, unknown>).message : undefined;
    return text(d.message) ?? text(nested) ?? text(e.message) ?? VERIFY_FAILED;
  }
  return (e instanceof Error ? text(e.message) : undefined) ?? VERIFY_FAILED;
}

/* Review focus 5: is the stored environment still one /bc/environments
   lists (AUTH.C4, as environment selection sends it)? A list that cannot be
   read proves nothing, so the environment is kept and the calls that follow
   say what is wrong. 'redirecting': the token needed interaction. */
async function storedEnvironmentListed(env: BcEnvironment): Promise<boolean | 'redirecting'> {
  const registrationId = bcContext.registrationId();
  try {
    const data = await bcApi(environmentsList, registrationId ? { query: { $filter: registrationFilter(registrationId) } } : {});
    return (data.value || data.environments || []).some(e => (e.id || e.environmentId) === env.id);
  } catch (e) {
    if (isInteractionRequired(e)) return 'redirecting';
    logger.warn('The environment list could not be read, so the stored environment is kept:', e);
    return true;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [portal, setPortal] = useState<PortalState>(() => ({ ...SIGNED_OUT_PORTAL, user: restoredUser() }));
  const [environment, setEnvironmentState] = useState<BcEnvironment | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [unmatchedAdmin, setUnmatchedAdmin] = useState(false);
  const [sessionError, setSessionError] = useState<Refusal | null>(null);
  const started = useRef(false);
  const verifying = useRef(false);
  const signingOut = useRef(false);
  const reauthenticating = useRef(false);
  const hasSession = useRef(false);
  /* what the portal check said, kept for a retry of the Workforce session (final review M3) */
  const portalAdminSeen = useRef(false);
  const signOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A new session (signing in, starting or ending view-as) is a different
     person's data, so the cache is cleared with it. */
  const adopt = useCallback((s: Session) => { hasSession.current = true; setSession(s); queryClient.clear(); }, []);

  const reauthenticate = useCallback((refusal?: Refusal) => {
    /* The token needed interaction: the adapter's own redirect is already
       under way, so a second one is not started (review M4). */
    if (refusal?.code === INTERACTION_REQUIRED) return;
    if (signingOut.current || reauthenticating.current) return;
    reauthenticating.current = true;
    if (refusal) toastRefusal(refusal);
    /* a redirect leaves the page; one that fails stays, so the next 401 may ask again (final review M6) */
    auth().reauthenticate().catch((e: unknown) => { reauthenticating.current = false; logger.error('Reauthentication failed:', e); });
  }, []);

  /* 3. The Workforce session. */
  const loadWorkforce = useCallback(async (portalAdmin = false) => {
    try { adopt(await api(getSession)); setSessionError(null); }
    catch (e) {
      if (!(e instanceof ApiError)) throw e;
      /* With the fake server, a 401 means the address is no seed person. */
      if (e.status === 401) {
        if (FAKE_SERVER_ON) { setUnmatchedAdmin(portalAdmin); setUnmatched(true); }
        else setPortal(p => ({ ...p, error: e.refusal.message }));
        return;
      }
      setSessionError(e.refusal);
    }
  }, [adopt]);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    if (signOutTimer.current) clearTimeout(signOutTimer.current);
    setStatus('signing-out');
    if (hasSession.current) {
      try { await api(deleteSession); } catch (e) { logger.error('Ending the Workforce session failed:', e); }
    }
    /* AUTH.R46 steps 3 to 5: the named keys, the sweep, the cookies. */
    logoutCleanup();
    if (FAKE_SERVER_ON) setDevAccount(null);
    hasSession.current = false;
    setSession(null);
    queryClient.clear();
    try { await auth().signOut(); } catch (e) { logger.error('Signing out of Microsoft failed:', e); }
  }, []);
  const signOutRef = useRef(signOut);
  useEffect(() => { signOutRef.current = signOut; });

  /* AUTH.R25: while there is a user and nobody is leaving. */
  useInactivitySignOut(status === 'signing-out' || status === 'signed-out' ? null : portal.user, () => { void signOut(); });
  /* AUTH.R30 (Ruling Q8): untoasted, as QniConnect's was. */
  useCrossTabSignOut(() => { logger.log('Sign-out detected from another tab — redirecting to login'); reauthenticate(); });

  const signInFlow = useCallback(async () => {
    /* 1. The Microsoft account. */
    /* AUTH.R63: the auth error page's "Return to Home" started a sign-out;
       this page load finishes it rather than signing in again. Taken either
       way, so it cannot sign out a later sign-in. */
    const finishSignOut = takeManualRedirect();
    const account: AuthAccount | null = auth().account();
    if (!account) { setStatus('signed-out'); return; }
    if (finishSignOut) { await signOutRef.current(); return; }
    /* AUTH.M1: the login token first, before any call (the dev check below
       makes one). Interaction needed: the adapter has started its one
       redirect, so nothing else is sent or shown (AUTH.R26a, review M1). */
    try {
      if (!await auth().token('login')) return;
    } catch (e) {
      if (isInteractionRequired(e)) return;
      removeLocal('isAuthenticated');
      setPortal(p => ({ ...p, error: TOKEN_FAILED }));
      setStatus('ready');
      return;
    }
    if (FAKE_SERVER_ON && !devAccount()) {
      const seeded = await api(listAccounts).then(list => list.some(a => a.email.toLowerCase() === account.email.toLowerCase()), () => true);
      if (!seeded) {
        /* N18: whether the portal check makes this account a portal admin,
           so the picker can suggest a seed admin. QniConnect's own call
           (AUTH.C1), unchanged; a failure suggests nobody. */
        verifying.current = true;
        let admin = false;
        try {
          const r = await bcApi(portalUserVerify, { body: { email: account.email, userId: account.oid } });
          admin = r.exists === true && r.userData?.isAdmin === true;
        } catch (e) {
          if (isInteractionRequired(e)) return;
          logger.warn('The portal check for the unmatched account failed, so no admin is suggested:', e);
        } finally { verifying.current = false; }
        setUnmatchedAdmin(admin);
        setUnmatched(true); setStatus('ready'); return;
      }
    }
    /* AUTH.R22: written before the backend check. */
    const basic: PortalUser = { oid: account.oid, email: account.email, name: account.name };
    try {
      localStorage.setItem('currentUser', JSON.stringify(basic));
      localStorage.setItem('isAuthenticated', 'true');
    } catch { /* no storage: the session lasts this page */ }
    setPortal(p => ({ ...p, user: basic }));

    /* 2. The portal check, verify through session init. While it runs, a
       401 is answered by the auth error, never by a sign-in redirect that
       would come back to the same call (Task 13 review; review M3). */
    verifying.current = true;
    let verifiedAdmin: boolean | undefined;
    try {
      let result: PortalUserVerifyResponse;
      try {
        result = await bcApi(portalUserVerify, { body: { email: account.email, userId: account.oid } });
      } catch (e) {
        if (e instanceof BcError && e.status === 404) result = { exists: false };
        else if (isInteractionRequired(e)) return;
        else {
          removeLocal('isAuthenticated');
          setPortal(p => ({ ...p, error: verifyErrorText(e) }));
          setStatus('ready');
          return;
        }
      }
  
      if (!result.exists) {
        removeLocal('isAuthenticated');
        setPortal(p => ({ ...p, error: NOT_REGISTERED }));
        setStatus('ready');
        signOutTimer.current = setTimeout(() => { void signOutRef.current(); }, SIGN_OUT_AFTER_MS);
        return;
      }
  
      try {
        const data = result.userData;
        let user: PortalUser = basic, isAdmin = false, pendingFirstLogin = false;
        if (data) {
          const { isAdmin: admin, ...rest } = data;
          user = { ...basic, ...rest, id: data.id || basic.oid, email: data.email || basic.email, name: data.name || basic.name };
          isAdmin = admin || false;
          pendingFirstLogin = data.status === 'PendingFirstLogin';
          localStorage.setItem('currentUser', JSON.stringify(user));
          if (data.registrationId) bcContext.setRegistrationId(data.registrationId);
          /* AUTH.R26: a failure is logged and sign-in goes on, except a 401,
             which is the auth error (review M3) rather than QniConnect's
             redirect, so a backend that refuses every init cannot loop. */
          try {
            logger.log('Session init:', await bcApi(sessionInit, { body: { registrationId: data.registrationId || '', userEmail: user.email || '', employeeNo: '' } }));
          } catch (e) {
            logger.error('Session init failed:', e);
            if (e instanceof BcError && e.status === 401) {
              removeLocal('isAuthenticated');
              setPortal(p => ({ ...p, error: verifyErrorText(e) }));
              setStatus('ready');
              return;
            }
          }
        }
        let env = bcContext.environment();
        if (env) {
          const listed = await storedEnvironmentListed(env);
          if (listed === 'redirecting') return;
          if (!listed) { logger.warn(`The stored environment ${env.id} is no longer listed, so it is chosen again.`); bcContext.setEnvironment(null); env = null; }
        }
        setEnvironmentState(env);
        setPortal({ user, isAdmin, adminVerified: true, pendingFirstLogin, error: null });
        verifiedAdmin = isAdmin;
      } catch (e) {
        logger.error('Sign-in failed after the portal check:', e);
        removeLocal('isAuthenticated');
        setPortal(p => ({ ...p, error: VALIDATION_FAILED }));
        setStatus('ready');
        return;
      }
    } finally {
      verifying.current = false;
    }

    /* 3. */
    portalAdminSeen.current = verifiedAdmin === true;
    await loadWorkforce(portalAdminSeen.current);
    setStatus('ready');
  }, [loadWorkforce]);

  useEffect(() => {
    /* Once per page, StrictMode's second effect run included. */
    if (started.current) return;
    started.current = true;
    signInFlow().catch((e: unknown) => {
      logger.error('Sign-in failed:', e);
      setPortal(p => ({ ...p, error: VALIDATION_FAILED }));
      setStatus('ready');
    });
  }, [signInFlow]);
  useEffect(() => () => { if (signOutTimer.current) clearTimeout(signOutTimer.current); }, []);

  /* A redirect leaves the page; a popup (Ruling A2) comes back with the
     account, so the sequence runs now. One at a time: the gate calls this
     from an effect. */
  const signingIn = useRef(false);
  const signIn = useCallback(async (opts?: { popup?: boolean }) => {
    if (signingIn.current || signingOut.current) return;
    signingIn.current = true;
    try {
      await auth().signIn(opts);
      if (!hasSession.current && auth().account()) { setStatus('checking'); await signInFlow(); }
    } finally { signingIn.current = false; }
  }, [signInFlow]);

  /* QniConnect's authRequired (AUTH.R31), from the /bc client on a 401. */
  useEffect(() => bcEvents.on('auth-required', () => {
    if (verifying.current) { logger.warn('A 401 on the portal check: shown as the auth error, not a sign-in redirect.'); return; }
    reauthenticate();
  }), [reauthenticate]);
  /* A query or mutation answered 401 (src/api/query.ts): toasted, then reauthenticated. */
  useEffect(() => sessionEvents.on('signed-out', refusal => { reauthenticate(refusal); }), [reauthenticate]);
  /* A write that can change this employee's own capabilities asks for the
     session to be read again. Only the session and the tenant (which the nav
     is built from) are re-read; the rest of the cache is kept. */
  useEffect(() => sessionEvents.on('refresh', () => {
    if (!hasSession.current) return;
    api(getSession).then(s => { setSession(s); void queryClient.invalidateQueries({ queryKey: ['tenant'] }); },
      (err: unknown) => {
        if (!(err instanceof ApiError)) return;
        if (err.status === 401) reauthenticate(err.refusal);
        else toastRefusal(err.refusal);
      });
  }), [reauthenticate]);

  /* Starting or ending view-as changes the session only from a real
     response. A refusal or fault is toasted and the session stays exactly as
     it was, so a failed "Return to my account" is never silent. */
  const switchView = useCallback(async (call: () => Promise<Session>) => {
    let next: Session;
    try { next = await call(); }
    catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.status === 401) reauthenticate(err.refusal);
      else toastRefusal(err.refusal);
      return;
    }
    adopt(next);
  }, [adopt, reauthenticate]);

  const value: Ctx = {
    session, ready: status !== 'checking', status, portal, environment, unmatched, unmatchedAdmin, sessionError,
    retrySession: () => { setSessionError(null); void loadWorkforce(portalAdminSeen.current); },
    signIn,
    signOut,
    /* AUTH.R34: only an environment with an id is kept. */
    setEnvironment: e => { if (!e.id) return; bcContext.setEnvironment(e); setEnvironmentState(e); },
    /* AUTH.R35: in state only; the backend status is the overlay's call (Task 15). */
    completeFirstLogin: () => { setPortal(p => ({ ...p, pendingFirstLogin: false })); },
    viewAs: employeeCode => switchView(() => api(startViewAs, { body: { employeeCode } })),
    endViewAs: () => switchView(() => api(endViewAs)),
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
