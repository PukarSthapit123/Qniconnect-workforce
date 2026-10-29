/* The fake environment list and client-tenant company lookup. One handler
   answers POST /bc/client-tenant/companies for both its callers (AUTH.C5 and
   AUTH.C9): both send { environmentName, registrationId }. */
import { clientTenantCompaniesSetup, environmentsList, type BcEnvironmentItem, type ClientTenantCompaniesResponse, type EnvironmentsResponse } from '@/contract/bc/environments';
import { bcRefuse, bcServe } from './serve';
import { bcStore } from './seed';

/* AUTH.C4 sends `registrationId eq '<id>'`; the admin list (AUTH.C7) the same
   without the apostrophes. Anything else filters nothing. */
const filteredRegistration = (filter: string | undefined): string | null => {
  const m = filter?.match(/^registrationId eq '?(.*?)'?$/);
  return m ? (m[1] ?? '') : null;
};

export const bcEnvironmentHandlers = [
  bcServe(environmentsList, ({ query }): EnvironmentsResponse => {
    const registrationId = filteredRegistration(query.$filter);
    const value: BcEnvironmentItem[] = bcStore.db.environments
      .filter(e => registrationId === null || e.registrationId === registrationId)
      .map(e => ({ ...e }));
    return { value };
  }),
  /* Gives the environment its company when it has none yet, and says so with
     updateResult, so environment selection's re-read finds it (AUTH.R53). */
  bcServe(clientTenantCompaniesSetup, ({ body }): ClientTenantCompaniesResponse | Response => {
    const env = bcStore.db.environments.find(e => e.name === body.environmentName && e.registrationId === body.registrationId);
    if (!env) return bcRefuse(404, `No environment named ${body.environmentName} is registered for ${body.registrationId}.`);
    const companies = bcStore.db.companies.filter(c => c.environmentId === env.id);
    const first = companies[0];
    const updated = !env.company_Id && first !== undefined;
    if (updated) { env.company_Id = first.id; env.companyName = first.name; }
    return { value: companies.map(({ id, name, displayName }) => ({ id, name, displayName })), updateResult: { success: updated || env.company_Id !== '' } };
  }),
];
