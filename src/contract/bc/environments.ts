/* Environments and companies (docs/superpowers/inventory/auth.md): the
   environment list as environment selection reads it (AUTH.C4), and the
   client-tenant company lookup, as environment selection sends it (AUTH.C5)
   and as the portal dashboard does (AUTH.C9, portal HOME.C1). AUTH.C7, the
   admin pages' environment list, is left to the admin port, which decides
   which instance's environment its X-BC-Environment carries. POST
   /bc/environments/activate (AUTH.C8) is never sent by QniConnect
   (updateBackend is never true), so it has no endpoint (Ruling Q9). */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

/* AUTH.C4: every item field is read with a fallback (`env.id || env.environmentId`,
   `|| 'Production'`, `|| ''`, `|| 'Active'`), so every one may be absent. */
export const BcEnvironmentItem = lenient({
  id: z.string().optional(), environmentId: z.string().optional(),
  name: z.string().optional(), environmentName: z.string().optional(),
  type: z.string().optional(), environmentType: z.string().optional(),
  url: z.string().optional(), environmentUrl: z.string().optional(),
  status: z.string().optional(),
  /* company_name: the admin pages' mapper read this spelling (admin ADM.C2) */
  companyName: z.string().optional(), company_Name: z.string().optional(), company_name: z.string().optional(),
  company_Id: z.string().optional(), companyId: z.string().optional(),
  registrationId: z.string().optional(),
});
export type BcEnvironmentItem = z.infer<typeof BcEnvironmentItem>;
/* `data.value || data.environments || []` */
export const EnvironmentsResponse = lenient({ value: z.array(BcEnvironmentItem).optional(), environments: z.array(BcEnvironmentItem).optional() });
export type EnvironmentsResponse = z.infer<typeof EnvironmentsResponse>;

/* The $filter value AUTH.C4 sends, apostrophes included; the client encodes
   it with encodeURIComponent, so they stay apostrophes on the wire. */
export const registrationFilter = (registrationId: string) => `registrationId eq '${registrationId}'`;

export const environmentsList = defineBcEndpoint({
  method: 'GET', path: '/bc/environments', inventory: 'AUTH.C4',
  summary: 'The Business Central environments the signed-in account may use (environment selection)',
  /* Authorization alone: no Content-Type, no Accept */
  token: 'bc', literalHeaders: [], headers: [], credentials: 'default',
  query: z.object({ $filter: z.string().optional() }),
  response: EnvironmentsResponse,
});

export const BcCompany = lenient({ id: z.string().optional(), name: z.string().optional(), displayName: z.string().optional() });
/* AUTH.C5 reads `updateResult && updateResult.success`; AUTH.C9 reads
   `response.value || response || []`. One response: both are this path. */
export const ClientTenantCompaniesResponse = lenient({
  value: z.array(BcCompany).optional(),
  updateResult: lenient({ success: z.boolean().optional() }).optional(),
});
export type ClientTenantCompaniesResponse = z.infer<typeof ClientTenantCompaniesResponse>;
export const ClientTenantCompaniesRequest = z.object({ environmentName: z.string(), registrationId: z.string() });

export const clientTenantCompaniesSetup = defineBcEndpoint({
  method: 'POST', path: '/bc/client-tenant/companies', inventory: 'AUTH.C5',
  summary: "Look up the chosen environment's company when it has none yet (environment selection)",
  /* getAccessToken() with no scopes: the login-scope token, not bc */
  token: 'login', literalHeaders: ['Content-Type'], headers: [], credentials: 'default',
  request: ClientTenantCompaniesRequest, response: ClientTenantCompaniesResponse,
});

/* The dashboard read `response.value || response || []` (HOME.C1), so a bare
   list of companies is read as well as one under `value`. */
export const PortalCompaniesResponse = z.union([z.array(BcCompany), ClientTenantCompaniesResponse]);
export type PortalCompaniesResponse = z.infer<typeof PortalCompaniesResponse>;

export const clientTenantCompanies = defineBcEndpoint({
  method: 'POST', path: '/bc/client-tenant/companies', inventory: 'AUTH.C9, HOME.C1',
  summary: "The client tenant's companies in the active environment (portal dashboard)",
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID'], whenSet: ['X-Registration-ID'],
  credentials: 'include', readsCompanyHeader: true,
  request: ClientTenantCompaniesRequest, response: PortalCompaniesResponse,
});
