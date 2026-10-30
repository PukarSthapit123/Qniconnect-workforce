/* The fake portal users (docs/superpowers/inventory/admin.md, USERS): the
   list (USERS.C1, also the overview's ADM.C1), adding one (USERS.C2) and
   editing one (USERS.C3). Activating and deactivating (USERS.C4) is the
   first-login overlay's AUTH.C6, answered in session.ts: one path, one
   handler.

   A new user's employee number comes from Business Central's own employee
   records (the fake's profiles), matched by email, as the backend would know
   it: never from the Workforce side (spec N19). Someone with no Business
   Central record has none, and Setup · Employees shows them unmatched. Kept
   for this page load, as the rest of the fake /bc is. */
import { portalUserCreate, portalUsersList, portalUserUpdate, type BcPortalUser } from '@/contract/bc/portal-users';
import { bcRefuse, bcServe } from './serve';
import { bcStore, REGISTRATION_ID, type FakePortalUser } from './seed';

const view = ({ id, name, email, status, isAdmin, employeeNo, role, lastLogin }: FakePortalUser): BcPortalUser =>
  ({ id, name, email, status, isAdmin, employeeNo, role, lastLogin });
const taken = (email: string, except = '') =>
  bcStore.db.portalUsers.some(u => u.id !== except && u.email.toLowerCase() === email.toLowerCase());
const DUPLICATE = 'A portal user with this email address already exists.';
let made = 0;

export const bcPortalUserHandlers = [
  bcServe(portalUsersList, () => ({ value: bcStore.db.portalUsers.map(view) })),

  /* They sign in for the first time later, so they start pending (BC:1502-1508). */
  bcServe(portalUserCreate, ({ body, request }): BcPortalUser | Response => {
    if (taken(body.email)) return bcRefuse(409, DUPLICATE);
    made += 1;
    const profile = bcStore.db.profiles.find(p => p.email.toLowerCase() === body.email.toLowerCase());
    const user: FakePortalUser = {
      id: `pu-new-${String(made).padStart(3, '0')}`, name: body.name, email: body.email, status: 'PendingFirstLogin', isAdmin: body.isAdmin,
      registrationId: request.headers.get('X-Registration-ID') || REGISTRATION_ID, employeeNo: profile?.employeeNo ?? '', role: body.role, lastLogin: null,
    };
    bcStore.db.portalUsers.push(user);
    return view(user);
  }),

  bcServe(portalUserUpdate, ({ params, body }): BcPortalUser | Response => {
    const user = bcStore.db.portalUsers.find(u => u.id === params.userId);
    if (!user) return bcRefuse(404, `No portal user has the id ${params.userId}.`);
    if (taken(body.email, user.id)) return bcRefuse(409, DUPLICATE);
    Object.assign(user, { name: body.name, email: body.email, role: body.role, isAdmin: body.isAdmin });
    return view(user);
  }),
];
