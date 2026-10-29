/* The notification bell's Business Central calls (docs/superpowers/inventory/
   portal.md, BELL): the signed-in employee's payroll notifications (BELL.C1)
   and marking one seen (BELL.C2). Both went through fetchThroughBackend
   (portal SHARED.R1 to R10) with no headers option: Content-Type and Accept,
   the bc token, credentials include, the X-Client-Company-ID response header
   stored, never X-BC-Environment, and X-Registration-ID only when one is
   stored (SHARED.R7). The query is built with URLSearchParams, each param
   only when it has a value, in the row's order. */
import { z } from 'zod';
import { defineBcEndpoint, lenient } from './endpoints';

const text = z.string().nullish();

/* A notification as the bell read it (BELL.C1 "Response fields read"):
   systemId (the key and BELL.C2's path), seen (a truthiness test), the
   message, and createdDate and createdTime for the date line. None was
   guarded against absence in a way that broke, so each may be missing. */
export const BcNotification = lenient({
  systemId: text,
  seen: z.unknown().optional(),
  message: text,
  createdDate: text,
  createdTime: text,
});
export type BcNotification = z.infer<typeof BcNotification>;
/* `Array.isArray(response) ? response : []` (BCS:848): anything that is not a list is none. */
export const BcNotificationsResponse = z.preprocess(v => (Array.isArray(v) ? v : []), z.array(BcNotification));

export const BcNotificationsQuery = z.object({
  registrationId: z.string().optional(), clientEnvironment: z.string().optional(),
  clientCompanyId: z.string().optional(), employeeNo: z.string().optional(),
});

export const notificationsList = defineBcEndpoint({
  method: 'GET', path: '/bc/notifications', inventory: 'BELL.C1',
  summary: "The signed-in employee's payroll notifications (the bell)",
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID'], whenSet: ['X-Registration-ID'],
  credentials: 'include', readsCompanyHeader: true,
  query: BcNotificationsQuery, queryStyle: 'form',
  response: BcNotificationsResponse,
});

/* BELL.C2's query leaves out employeeNo. */
export const BcNotificationSeenQuery = z.object({
  registrationId: z.string().optional(), clientEnvironment: z.string().optional(), clientCompanyId: z.string().optional(),
});

export const notificationSeen = defineBcEndpoint({
  method: 'PATCH', path: '/bc/notifications/:systemId', inventory: 'BELL.C2',
  summary: 'Mark one payroll notification seen (the bell)',
  token: 'bc', literalHeaders: ['Content-Type', 'Accept'],
  headers: ['X-Registration-ID'], whenSet: ['X-Registration-ID'],
  credentials: 'include', readsCompanyHeader: true,
  params: z.object({ systemId: z.string() }),
  query: BcNotificationSeenQuery, queryStyle: 'form',
  request: z.object({ seen: z.literal(true) }),
  /* the answer is ignored (BELL.C2 "response body: ignored") */
  response: z.unknown(),
});
