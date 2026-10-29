/* The fake admin calls (docs/superpowers/inventory/admin.md): adding an
   environment (ENV.C2), the
   Business Central authorization (AUTHZ.C1 to AUTHZ.C3, ADM.C3) and the
   registration (ADM.C4). The environment list (ADM.C2, ENV.C1) is answered
   by environments.ts's handler, and the portal users the overview counts
   (ADM.C1) by portal-users.ts's: one path, one handler. The fake's new
   authorization is made up and opens nothing: the sign-in address it hands
   out is this app's own /auth/callback, as the backend would send the
   popup back there, so the whole popup round trip runs in development. */
import { authRefresh, authStatus, authUrl, environmentCreate, portalRegistration, type AuthStatus } from '@/contract/bc/admin';
import type { BcEnvironmentItem } from '@/contract/bc/environments';
import { bcServe } from './serve';
import { bcStore, freshAuthorization, REGISTRATION_ID, type FakeEnvironment } from './seed';

const origin = () => (typeof location !== 'undefined' ? location.origin : 'http://localhost:3000');
const status = (): AuthStatus => ({ ...bcStore.db.authorization, diagnostics: { ...bcStore.db.authorization.diagnostics } });
let created = 0;

export const bcAdminHandlers = [
  /* Kept for this page load, as the rest of the fake /bc is. */
  bcServe(environmentCreate, ({ body, request }): BcEnvironmentItem => {
    created += 1;
    const env: FakeEnvironment = {
      id: `env-${body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'new'}-${String(created).padStart(2, '0')}`,
      name: body.name, type: body.type, url: body.url, status: 'Active',
      companyName: body.companyName, company_Id: body.companyId,
      registrationId: request.headers.get('X-Registration-ID') || REGISTRATION_ID,
    };
    bcStore.db.environments.push(env);
    return { ...env };
  }),
  bcServe(authStatus, () => status()),
  /* A new authorization: the address to sign in at, with the PKCE challenge
     QniConnect checks for. Handing it out renews the fake's tokens, so the
     status read after the popup reports success. */
  bcServe(authUrl, ({ query }) => {
    const registrationId = query.registrationId || REGISTRATION_ID;
    bcStore.db.authorization = { ...freshAuthorization(Date.now(), 0, 90), registrationId };
    const q = new URLSearchParams({ status: 'success', tokenReceived: 'true', tokenStoredInBC: 'true', registrationId,
      code_challenge: 'fake-pkce-challenge', code_challenge_method: 'S256' });
    return { authUrl: `${origin()}/auth/callback?${q.toString()}`, registrationId, pkceEnabled: true };
  }),
  /* New tokens for another 90 days; the answer is the whole authorization. */
  bcServe(authRefresh, ({ body }) => {
    bcStore.db.authorization = { ...freshAuthorization(Date.now(), 0, 90), registrationId: body.registrationId || bcStore.db.authorization.registrationId };
    return status();
  }),
  bcServe(portalRegistration, () => ({ ...bcStore.db.registration })),
];
