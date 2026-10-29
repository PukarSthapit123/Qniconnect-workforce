/* The fake bell (portal inventory BELL.C1 and BELL.C2), answered from
   bcStore's notifications (payroll-seed.ts):
   - the list is the employee number's in the query, newest first; without
     one, the whole company's, as QniConnect's code comment says the backend
     answers (BELL.R1: which is why the app never asks without one);
   - marking one seen sets its flag; one that does not exist is 404. */
import { notificationSeen, notificationsList, type BcNotification } from '@/contract/bc/notifications';
import { bcRefuse, bcServe } from './serve';
import { bcStore } from './seed';

export const bcNotificationsHandlers = [
  bcServe(notificationsList, ({ query }): BcNotification[] =>
    bcStore.db.notifications.filter(n => !query.employeeNo || n.employeeNo === query.employeeNo)
      .sort((a, b) => `${b.createdDate}T${b.createdTime}`.localeCompare(`${a.createdDate}T${a.createdTime}`))
      .map(({ employeeNo: _owner, ...n }) => { void _owner; return { ...n }; })),
  bcServe(notificationSeen, ({ params, body }) => {
    const n = bcStore.db.notifications.find(x => x.systemId === params.systemId);
    if (!n) return bcRefuse(404, `No notification ${params.systemId} was found.`);
    n.seen = body.seen;
    return { systemId: n.systemId, seen: n.seen };
  }),
];
