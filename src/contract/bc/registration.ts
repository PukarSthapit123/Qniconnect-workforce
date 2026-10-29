/* Registration's one call (docs/superpowers/inventory/public.md, REG.C1):
   EnhancedRegistration's own fetch, signed out. Tenant verification and the
   company lookup are account setup's (AUTH.C3 to AUTH.C5, Ruling Q12), not
   this page's. */
import { z } from 'zod';
import { defineBcEndpoint } from './endpoints';

/* REG.R17's keys, every one always sent. */
export const PortalRegistrationRequest = z.object({
  company_Name: z.string(), contactEmail: z.string(), contactName: z.string(), tenantId: z.string(),
  primaryEnvironment: z.string(), primaryCompanyName: z.string(), numberOfEmployees: z.number().int(), industry: z.string(),
  registrationSource: z.string(), vatRegistrationNo: z.string(), companyRegistrationNo: z.string(), primaryContactLanguage: z.string(),
  address: z.string(), city: z.string(), county: z.string(), postCode: z.string(), countryRegionCode: z.string(),
});

export const portalRegistrationSubmit = defineBcEndpoint({
  method: 'POST', path: '/bc/portalRegistrations', inventory: 'REG.C1',
  summary: 'Register an organisation for QniConnect (the public registration form)',
  /* REG.R19: Content-Type only, no token, no credentials option */
  token: 'none', literalHeaders: ['Content-Type'], headers: [], credentials: 'default', anonymous: true,
  request: PortalRegistrationRequest,
  /* REG.R22: an OK answer is success whatever its body; it is never read */
  response: z.unknown(),
});
