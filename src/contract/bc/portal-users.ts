/* The portal users (docs/superpowers/inventory/admin.md, USERS; QniConnect's
   UserManagement): the list (USERS.C1, which is also the admin overview's
   ADM.C1), adding one (USERS.C2) and editing one (USERS.C3). C1 to C3 went
   through fetchThroughBackend (BCS): Content-Type and Accept, the bc token,
   credentials include and the X-Client-Company-ID response header stored.

   USERS.C4 (activate or deactivate) is BusinessCentralService.updateUserStatus,
   the same call as the first-login overlay's AUTH.C6, so it is that
   endpoint: portalUserUpdateStatus in ./session.ts. Its own fetch sends only
   Content-Type and the bc token, with no credentials option (USERS.R18).

   USERS.R17: updatePortalUser's doc comment says "Get notifications"; the call
   really is PATCH /bc/portalUsers/{id}. */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

const text = z.string().nullish();

/* USERS.C1 "Response fields read": `response.value || []`. name and email
   were read unguarded (a missing one crashed the page); the port reads them
   as blank, so every field may be missing. lastLogin falsy is "Never". */
export const BcPortalUser = lenient({
  id: text, name: text, email: text, status: text, isAdmin: z.boolean().nullish(), employeeNo: text, role: text, lastLogin: text,
});
export type BcPortalUser = z.infer<typeof BcPortalUser>;
export const PortalUsersResponse = lenient({ value: z.array(BcPortalUser).nullish() });

const fetchThroughBackend = {
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'], credentials: 'include', readsCompanyHeader: true,
} as const;

/* USERS.C1 / ADM.C1: X-BC-Environment when the calling service instance held
   an environment (BCS.R5), then X-Registration-ID when one is stored (BCS.R6). */
export const portalUsersList = defineBcEndpoint({
  method: 'GET', path: '/bc/portalUsers', inventory: 'ADM.C1, USERS.C1',
  summary: "The organisation's portal users (People & access, and the admin overview's counts)",
  ...fetchThroughBackend,
  headers: ['X-BC-Environment', 'X-Registration-ID'], whenSet: ['X-BC-Environment', 'X-Registration-ID'],
  response: PortalUsersResponse,
});

/* USERS.C2 and C3's body: the name trimmed with its tags stripped, the email
   trimmed and lower-cased (USERS.R7), role 'User' or 'Admin'. */
export const PortalUserRequest = z.object({ name: z.string(), email: z.string(), role: z.string(), isAdmin: z.boolean() });
export type PortalUserRequest = z.infer<typeof PortalUserRequest>;

/* USERS.C2: the answer is added to the list as `{status: 'Active', ...result}` (USERS.R10). */
export const portalUserCreate = defineBcEndpoint({
  method: 'POST', path: '/bc/portalUsers', inventory: 'USERS.C2',
  summary: 'Add a portal user (People & access): they sign in to QniConnect with this email',
  ...fetchThroughBackend,
  headers: ['X-BC-Environment', 'X-Registration-ID'], whenSet: ['X-BC-Environment', 'X-Registration-ID'],
  request: PortalUserRequest,
  response: BcPortalUser,
});

/* USERS.C3: the id as given, not encoded. X-Registration-ID is the caller's
   own header, `localStorage.registrationId || ''`, so it is sent even when
   blank, and before X-BC-Environment (BC:792, then BCS.R5). The answer is
   merged over the row, `result || {}` (USERS.R12): an empty answer is fine. */
export const portalUserUpdate = defineBcEndpoint({
  method: 'PATCH', path: '/bc/portalUsers/:userId', inventory: 'USERS.C3',
  summary: "Change a portal user's name, email, role or administrator access (People & access)",
  ...fetchThroughBackend,
  headers: ['X-Registration-ID', 'X-BC-Environment'], whenSet: ['X-BC-Environment'],
  params: z.object({ userId: z.string() }),
  request: PortalUserRequest,
  response: BcPortalUser.nullish(),
});
