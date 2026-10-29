/* Sign-in's backend calls (docs/superpowers/inventory/auth.md): the portal
   user check, twice (AuthContext's, AUTH.C1, and EnvironmentSelector's,
   AUTH.C3, which differ on the wire), session init (AUTH.C2), and the
   first-login overlay's status update (AUTH.C6).
   GET /session/verify (AUTH.C13) has no caller in QniConnect, so it has no
   endpoint here (Ruling Q9). */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

/* AUTH.C1 and AUTH.C3 "Response fields read": every field is read through a
   guard (`&&`, `||`, `?.`, or `=== false`, which absence does not trip), so
   every one may be absent. Other userData fields are kept (QniConnect spread
   them into currentUser). */
export const PortalUserData = lenient({
  id: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  isAdmin: z.boolean().optional(),
  status: z.string().optional(),
  registrationId: z.string().optional(),
  employeeNo: z.string().optional(),
  role: z.string().optional(),
});
export type PortalUserData = z.infer<typeof PortalUserData>;
export const PortalUserVerifyResponse = lenient({
  exists: z.boolean().optional(),
  isActive: z.boolean().optional(),
  message: z.string().optional(),
  userData: PortalUserData.optional(),
});
export type PortalUserVerifyResponse = z.infer<typeof PortalUserVerifyResponse>;
/* { email, userId }: the MSAL account's username and oid. */
export const PortalUserVerifyRequest = z.object({ email: z.string(), userId: z.string() });

export const portalUserVerify = defineBcEndpoint({
  method: 'POST', path: '/bc/portalUsers/verify', inventory: 'AUTH.C1',
  summary: 'Is the signed-in Microsoft account a QniConnect portal user, and an admin? (AuthContext, at sign-in)',
  /* the login-scope token: AuthContext injected it, ignoring the bc scopes it was asked for */
  token: 'login', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID'], whenSet: ['X-Registration-ID'],
  credentials: 'include', readsCompanyHeader: true,
  request: PortalUserVerifyRequest, response: PortalUserVerifyResponse,
});

export const portalUserVerifyAccess = defineBcEndpoint({
  method: 'POST', path: '/bc/portalUsers/verify', inventory: 'AUTH.C3',
  summary: 'Is the signed-in account still an active portal user? (environment selection)',
  token: 'bc', literalHeaders: ['Content-Type'], headers: [], credentials: 'default',
  request: PortalUserVerifyRequest, response: PortalUserVerifyResponse,
});

/* AUTH.C2: the whole response is only logged. */
export const SessionInitResponse = lenient({ success: z.boolean().optional(), message: z.string().optional() });
/* { registrationId: userData.registrationId || '', userEmail: email || '', employeeNo: '' } at sign-in
   (AUTH.C2); the dashboard sends it again with the profile's employeeNo (HOME.C5). */
export const SessionInitRequest = z.object({ registrationId: z.string(), userEmail: z.string(), employeeNo: z.string() });

export const sessionInit = defineBcEndpoint({
  method: 'POST', path: '/session/init', inventory: 'AUTH.C2, HOME.C5',
  summary: 'Start the backend session (cookies only, no token)',
  token: 'none', literalHeaders: ['Content-Type'], headers: [], credentials: 'include',
  request: SessionInitRequest, response: SessionInitResponse,
});

/* AUTH.C6: `!result || !result.success` throws with `result?.message`. */
export const UpdateStatusResponse = lenient({ success: z.boolean().optional(), message: z.string().optional() });
export type UpdateStatusResponse = z.infer<typeof UpdateStatusResponse>;

export const portalUserUpdateStatus = defineBcEndpoint({
  method: 'POST', path: '/bc/portalUsers/:userId/updateStatus', inventory: 'AUTH.C6, USERS.C4',
  summary: "Set the portal user's status (the first-login overlay sets it Active)",
  /* BusinessCentralService.updateUserStatus: its own fetch, not fetchThroughBackend */
  token: 'bc', literalHeaders: ['Content-Type'], headers: [], credentials: 'default',
  params: z.object({ userId: z.string() }),
  request: z.object({ status: z.string() }), response: UpdateStatusResponse,
});
