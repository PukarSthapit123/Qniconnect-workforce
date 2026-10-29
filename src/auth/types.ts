/* The one way the app reaches the identity provider: Microsoft Entra through
   MSAL (src/auth/msal.ts) in the real app, a sessionStorage stub
   (src/mocks/auth-stub.ts) in tests and dev. main.tsx picks one; tests call
   setAuth directly. */

/* Who MSAL says is signed in, in the shape QniConnect read it
   (AuthContext.js basicUserData, inventory AUTH.R22). */
export interface AuthAccount { oid: string; email: string; name: string; loginHint?: string }

/* Which audience a token is for: 'login' is QniConnect's loginRequest
   (User.Read openid profile email), 'bc' is Business Central's .default. */
export type TokenKind = 'login' | 'bc';

export interface AuthAdapter {
  /* MSAL initialize, handleRedirectPromise and the active account (QC index.js). Await before rendering. */
  init(): Promise<void>;
  account(): AuthAccount | null;
  /* QC SignInButton: loginPopup first on a window wider than 768 px, else (or when it fails) loginRedirect (AUTH.M2, AUTH.M3, AUTH.R18).
     popup: false is the redirect alone, for a sign-in that is not a click, where a browser blocks the popup (final review M1). */
  signIn(opts?: { popup?: boolean }): Promise<void>;
  /* acquireTokenRedirect(loginRequest): QC's authRequired and cross-tab sign-out path (AUTH.R30, AUTH.R31). */
  reauthenticate(): Promise<void>;
  /* logoutRedirect({ account, logoutHint, postLogoutRedirectUri: origin }) (AUTH.M5). */
  signOut(): Promise<void>;
  /* acquireTokenSilent. InteractionRequiredAuthError starts a redirect and is
     rethrown; no account starts a sign-in redirect and gives null (AUTH.R33). */
  token(kind: TokenKind): Promise<string | null>;
}
