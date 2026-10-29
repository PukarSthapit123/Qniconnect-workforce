/* The fake registration call (docs/superpowers/inventory/public.md, REG.C1):
   signed out, no token. A new tenant is kept for this page load; a tenant
   already registered (the seed organisation's own, or one registered
   earlier) is refused as a Business Central error reads, its correlation id
   on the end, which the page cuts off (REG.R24). */
import { portalRegistrationSubmit } from '@/contract/bc/registration';
import { bcRefuse, bcServe } from './serve';
import { bcStore } from './seed';

let made = 0;

export const bcRegistrationHandlers = [
  bcServe(portalRegistrationSubmit, ({ body }) => {
    const tenant = body.tenantId.trim().toLowerCase();
    if (bcStore.db.registrations.some(r => r.tenantId.toLowerCase() === tenant)) {
      const correlation = crypto.randomUUID();
      return bcRefuse(409, `A registration for this tenant already exists. CorrelationId: ${correlation}`);
    }
    made += 1;
    const registration = { id: `REG-NEW-${String(made).padStart(4, '0')}`, company_Name: body.company_Name, tenantId: body.tenantId,
      contactEmail: body.contactEmail, numberOfEmployees: body.numberOfEmployees, status: 'Pending' };
    bcStore.db.registrations.push(registration);
    return { ...registration };
  }),
];
