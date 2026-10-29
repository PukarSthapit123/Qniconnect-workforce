/* The admin pages' calls (docs/superpowers/inventory/admin.md): the overview
   (ADM.C2 to ADM.C4; ADM.C1 is People & access's USERS.C1, in
   ./portal-users.ts), Environments (ENV.C1, ENV.C2) and Authorization
   (AUTHZ.C1 to AUTHZ.C3). Every one went through fetchThroughBackend (BCS):
   Content-Type and Accept, the bc token, credentials include, the
   X-Client-Company-ID response header stored (BCS.R8), then X-BC-Environment
   when the calling service instance held an active environment (BCS.R5) and
   X-Registration-ID when one is stored (BCS.R6), in that order. Which
   instance held which environment is the caller's to say (src/api/bc/admin.ts
   passes it as the call's header value).

   Not here, on purpose:
   - ENV.C3, POST /bc/environments/activate: never sent (ENV.R6, Ruling Q10;
     it is AUTH.C8, Ruling Q9);
   - ENV.C4, the client-tenant company lookup: no admin page calls it; it is
     AUTH.C9 / HOME.C1 (src/contract/bc/environments.ts);
   - AUTHZ.C4, POST /bc/authorization/storeTokens: nothing in QniConnect
     calls it (Ruling Q9). */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';
import { BcEnvironmentItem, EnvironmentsResponse } from './environments';

const fetchThroughBackend = {
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-BC-Environment', 'X-Registration-ID'], whenSet: ['X-BC-Environment', 'X-Registration-ID'],
  credentials: 'include', readsCompanyHeader: true,
} as const;
const text = z.string().nullish();

/* ADM.C2 and ENV.C1: the registration filter WITHOUT apostrophes (BC:1007,
   "IMPORTANT: no apostrophes"), unlike environment selection's AUTH.C4. */
export const adminRegistrationFilter = (registrationId: string) => `registrationId eq ${registrationId}`;

export const adminEnvironmentsList = defineBcEndpoint({
  method: 'GET', path: '/bc/environments', inventory: 'ADM.C2, ENV.C1',
  summary: "The organisation's Business Central environments (the admin overview and Environments)",
  ...fetchThroughBackend,
  query: z.object({ $filter: z.string().optional() }),
  response: EnvironmentsResponse,
});

/* ENV.C2: the form as typed, untrimmed; companyId may be ''. */
export const EnvironmentCreateRequest = z.object({
  name: z.string(), type: z.string(), url: z.string(), companyId: z.string(), companyName: z.string(),
});
export type EnvironmentCreateRequest = z.infer<typeof EnvironmentCreateRequest>;

export const environmentCreate = defineBcEndpoint({
  method: 'POST', path: '/bc/environments', inventory: 'ENV.C2',
  summary: 'Add a Business Central environment (Environments)',
  ...fetchThroughBackend,
  request: EnvironmentCreateRequest,
  /* appended to the list as it came; every field may be missing */
  response: BcEnvironmentItem,
});

/* AUTHZ.C1 / ADM.C3: the whole answer is kept and read field by field, each
   through a guard (AUTHZ "Response fields read"). The diagnostics flags are
   compared with `=== true` or tested for truth, so any value will do. A JSON
   null is the "Not authorized" view (AUTHZ.R2) and the overview's defaults. */
export const AuthDiagnostics = lenient({
  hasAccessToken: z.unknown().optional(), hasRefreshToken: z.unknown().optional(), tokenStoredInBC: z.unknown().optional(),
});
export const AuthStatus = lenient({
  isAuthorized: z.unknown().optional(),
  status: text,
  clientId: text, tenantId: text, environment: text, scope: text,
  issuedAt: text, expiresAt: text,
  accessToken: text, refreshToken: text,
  registrationId: text,
  diagnostics: AuthDiagnostics.nullish(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;
export const AuthStatusResponse = AuthStatus.nullable();

const registrationQuery = z.object({ registrationId: z.string().optional() });

export const authStatus = defineBcEndpoint({
  method: 'GET', path: '/auth/status', inventory: 'ADM.C3, AUTHZ.C1',
  summary: 'The Business Central authorization: its state, its tokens and when they expire',
  ...fetchThroughBackend,
  query: registrationQuery,
  response: AuthStatusResponse,
});

/* AUTHZ.C2: authUrl is the popup's address; registrationId is stored;
   pkceEnabled was only logged. */
export const AuthUrlResponse = lenient({ authUrl: text, registrationId: text, pkceEnabled: z.unknown().optional() });
export type AuthUrlResponse = z.infer<typeof AuthUrlResponse>;

export const authUrl = defineBcEndpoint({
  method: 'GET', path: '/auth/bc-auth-url', inventory: 'AUTHZ.C2',
  summary: "The Microsoft sign-in address that starts a new Business Central authorization",
  ...fetchThroughBackend,
  query: registrationQuery,
  response: AuthUrlResponse,
});

/* AUTHZ.C3: `{ registrationId }`, or `{}` when none is stored. The answer
   replaces the authorization on screen (AUTHZ.R4). */
export const authRefresh = defineBcEndpoint({
  method: 'POST', path: '/auth/refresh', inventory: 'AUTHZ.C3',
  summary: 'Refresh the Business Central tokens',
  ...fetchThroughBackend,
  request: z.object({ registrationId: z.string().optional() }),
  response: AuthStatusResponse,
});

/* ADM.C4: companyName, id and registrationDate, each with a fallback. */
export const PortalRegistration = lenient({ companyName: text, id: text, registrationDate: text });
export const PortalRegistrationResponse = PortalRegistration.nullable();

export const portalRegistration = defineBcEndpoint({
  method: 'GET', path: '/bc/portalRegistrations', inventory: 'ADM.C4',
  summary: "This organisation's QniConnect registration (the admin overview's tenant line)",
  ...fetchThroughBackend,
  response: PortalRegistrationResponse,
});
