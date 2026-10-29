/* The real adapter: Microsoft Entra through @azure/msal-browser, doing what
   QniConnect's index.js and AuthContext.js did with the same config, scopes
   and redirects (docs/superpowers/inventory/auth.md, AUTH.M1 to AUTH.M9).
   No @azure/msal-react: the app reaches MSAL only through this module. */
import {
  EventType, InteractionRequiredAuthError, PublicClientApplication,
  type AccountInfo, type AuthenticationResult, type EventMessage,
} from '@azure/msal-browser';
import { logger } from '@/lib/logger';
import { businessCentralScopes, loginRequest, msalConfig } from './config';
import type { AuthAccount, AuthAdapter, TokenKind } from './types';

const SCOPES: Record<TokenKind, string[]> = { login: loginRequest.scopes, bc: businessCentralScopes.read };

/* AuthContext.js basicUserData (AUTH.R22), placeholders included. */
const toAccount = (a: AccountInfo): AuthAccount => {
  const claims = a.idTokenClaims;
  return {
    oid: claims?.oid || a.localAccountId || 'unknown-id',
    email: a.username || 'unknown@example.com',
    name: a.name || 'Unknown User',
    ...(claims?.login_hint ? { loginHint: claims.login_hint } : {}),
  };
};

export function createMsalAuth(): AuthAdapter {
  /* Made on first use, so importing this module (main.tsx always does) costs
     nothing when the stub is chosen instead. */
  let pca: PublicClientApplication | null = null;
  let ready: Promise<void> | null = null;
  const msal = () => (pca ??= new PublicClientApplication(msalConfig()));
  /* QniConnect read the active account, else the first cached one (AUTH.M9). */
  const current = () => msal().getActiveAccount() ?? msal().getAllAccounts()[0] ?? null;
  /* Not awaited, as in QniConnect: the page is leaving. A refused redirect
     (another interaction in progress) is logged rather than left unhandled. */
  const redirect = (scopes: string[]) => {
    msal().acquireTokenRedirect({ scopes }).catch((e: unknown) => { logger.error('Redirect to sign in failed:', e); });
  };

  const start = async () => {
    const m = msal();
    await m.initialize();
    /* index.js:27-38 (AUTH.R3). Registered before the redirect is handled, as
       in QniConnect, so a sign-in that just came back fires LOGIN_SUCCESS here. */
    m.addEventCallback((event: EventMessage) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        m.setActiveAccount((event.payload as AuthenticationResult).account);
        localStorage.setItem('isAuthenticated', 'true');
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) localStorage.removeItem('isAuthenticated');
    });
    /* App.js:150-172 (AUTH.M7, AUTH.R14): a result marks the session signed in; an error is only logged. */
    let result: AuthenticationResult | null = null;
    try {
      result = await m.handleRedirectPromise();
      if (result) localStorage.setItem('isAuthenticated', 'true');
    } catch (e) {
      logger.error('Error handling the sign-in redirect:', e);
    }
    /* index.js:21-24: the first cached account is active (the one a redirect just signed in, if any). */
    const active = result?.account ?? m.getAllAccounts()[0];
    if (active) m.setActiveAccount(active);
  };

  return {
    init: () => (ready ??= start()),
    account: () => {
      const a = current();
      return a ? toAccount(a) : null;
    },
    /* SignInButton.js (AUTH.M2, AUTH.M3, AUTH.R18; Ruling A2): wider than
       768 px the popup first, its account made active; a popup that fails
       (blocked, closed) is logged and falls through to the redirect.
       popup: false skips the popup: the sign-in the gate starts on its own
       is not a click, and a browser blocks a popup without one (final
       review M1), as QniConnect sent that case to its /login redirect. */
    signIn: async opts => {
      if (opts?.popup !== false && window.innerWidth > 768) {
        try {
          const result = await msal().loginPopup({ scopes: loginRequest.scopes });
          msal().setActiveAccount(result.account);
          return;
        } catch (e) {
          logger.error('Popup sign-in failed, so signing in by redirect:', e);
        }
      }
      await msal().loginRedirect({ scopes: loginRequest.scopes, redirectUri: window.location.origin });
    },
    reauthenticate: () => msal().acquireTokenRedirect({ scopes: loginRequest.scopes }),
    signOut: () => {
      /* AuthContext.js:385-390 (AUTH.R46): read before anything is cleared. */
      const account = current();
      const claims = account?.idTokenClaims;
      const logoutHint = claims?.login_hint || claims?.sid || account?.username;
      return msal().logoutRedirect({ account, logoutHint, postLogoutRedirectUri: window.location.origin });
    },
    /* AuthContext.js getAccessToken (AUTH.R33). */
    token: async kind => {
      const account = current();
      if (!account) {
        redirect(loginRequest.scopes);
        return null;
      }
      try {
        return (await msal().acquireTokenSilent({ scopes: SCOPES[kind], account })).accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) redirect(SCOPES[kind]);
        throw e;
      }
    },
  };
}

export const msalAuth: AuthAdapter = createMsalAuth();
