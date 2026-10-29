/* The fake portal user check, session init and status update. One handler
   answers POST /bc/portalUsers/verify for both its callers (AUTH.C1 and AUTH.C3). */
import { portalUserUpdateStatus, portalUserVerify, sessionInit, type PortalUserVerifyResponse, type UpdateStatusResponse } from '@/contract/bc/session';
import { bcRefuse, bcServe } from './serve';
import { bcStore, type PortalUserStatus } from './seed';
import { devAccount } from '@/lib/dev-account';

const STATUSES: readonly PortalUserStatus[] = ['Active', 'PendingFirstLogin', 'Inactive'];

export const bcSessionHandlers = [
  /* The user is the seed person the dev picker chose, if any (read from the
     tab's sessionStorage, so the request stays exactly as QniConnect sends
     it); else the one the body names (the MSAL account's username), else the
     token's. */
  bcServe(portalUserVerify, ({ body, email }): PortalUserVerifyResponse => {
    const user = bcStore.userByEmail(devAccount() || body.email || email || '');
    if (!user) return { exists: false, isActive: false, message: 'User not found in Business Central Portal' };
    const { id, email: userEmail, name, status, isAdmin, registrationId, employeeNo, role } = user;
    return {
      exists: true,
      /* a first-login user is active: AUTH.C3 turns away only isActive === false */
      isActive: status !== 'Inactive',
      message: 'User found in Business Central Portal',
      userData: { id, email: userEmail, name, status, isAdmin, registrationId, employeeNo, role },
    };
  }),
  /* AUTH.C2: cookies only; QniConnect only logged the answer. */
  bcServe(sessionInit, () => ({ success: true, message: 'Session initialised' })),
  /* AUTH.C6: the first-login overlay's Continue. Kept for this page load, as
     the rest of the fake /bc is. */
  bcServe(portalUserUpdateStatus, ({ params, body }): UpdateStatusResponse | Response => {
    const user = bcStore.db.portalUsers.find(u => u.id === params.userId);
    if (!user) return bcRefuse(404, `No portal user has the id ${params.userId}.`);
    if (!STATUSES.includes(body.status as PortalUserStatus)) return bcRefuse(400, `${body.status} is not a portal user status.`);
    user.status = body.status as PortalUserStatus;
    return { success: true, message: 'User status updated successfully' };
  }),
];
