/* The bell's payroll notifications, as QniConnect's UserPortalLayout and
   BusinessCentralService loaded them (docs/superpowers/inventory/portal.md,
   BELL.R1 to BELL.R8):
   - they are asked for only with an employee number stored, so the backend
     answers for this employee and not the whole company (BELL.R1);
   - each 'employee-no-ready' (a profile has just stored the number) asks
     again and replaces the list (BELL.R1, BELL.R2);
   - a failure, or an answer that is not a list, is no notifications;
   - opening an unseen one marks it seen at once and tells Business Central
     without waiting; that call's failure is ignored and nothing is undone
     (BELL.R8).
   QniConnect loaded them only once the dashboard had run, so a page opened
   directly (Documents, Profile) showed none (BELL.R2). Fixed under Ruling
   Q2: the bell asks as soon as it is shown with a number already stored,
   and the Profile and Documents pages tell it when they store one. The
   calls are the same. There is still no polling and no reload on an
   environment change (BELL.R1, BELL.R2c). */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { logger } from '@/lib/logger';
import { queryClient } from '@/api/query';
import { notificationSeen, notificationsList, type BcNotification, type BcNotificationSeenQuery, type BcNotificationsQuery } from '@/contract/bc/notifications';
import { bcItemId } from '@/domain/inbox';
import { bcApi } from './client';
import { bcContext } from './context';
import { bcEvents } from './events';
import { isInteractionRequired } from './account-setup';

/* BELL.C2's query: each param only when it has a value, in this order. */
export function seenQuery(): z.input<typeof BcNotificationSeenQuery> {
  const q: Record<string, string> = {};
  const registrationId = bcContext.registrationId(), environment = bcContext.environment()?.name, company = bcContext.clientCompanyId();
  if (registrationId) q.registrationId = registrationId;
  if (environment) q.clientEnvironment = environment;
  if (company) q.clientCompanyId = company;
  return q;
}
/* BELL.C1's: the same, then employeeNo. */
export function notificationsQuery(): z.input<typeof BcNotificationsQuery> {
  const employeeNo = bcContext.employeeNo();
  return { ...seenQuery(), ...(employeeNo ? { employeeNo } : {}) };
}

/* BELL.C1. Never throws but for a token that needs interaction (the adapter is already redirecting). */
export async function fetchBcNotifications(): Promise<BcNotification[]> {
  if (!bcContext.employeeNo()) return [];
  try {
    return await bcApi(notificationsList, { query: notificationsQuery() });
  } catch (e) {
    if (isInteractionRequired(e)) throw e;
    logger.error('Error fetching notifications:', e);
    return [];
  }
}

/* BELL.C2, fire and forget: never throws. */
export async function markBcNotificationSeen(systemId: string): Promise<void> {
  try {
    await bcApi(notificationSeen, { params: { systemId }, query: seenQuery(), body: { seen: true } });
  } catch (e) {
    logger.error('Error marking notification as seen:', e);
  }
}

export const bcNotificationKeys = { all: ['bc', 'notifications'] as const, seenHere: ['bc', 'notifications-seen-here'] as const };

/* The items with no systemId marked seen in this session: Business Central
   cannot be told (there is nothing to address), so a later read of the list
   would bring them back unseen and the badge with them. They are kept with
   the query cache, so signing out (which clears it) forgets them. An item
   with no systemId is known only by its place in the list (bcItemId), so if
   the server reorders such items between reads, the wrong one stays seen. */
queryClient.setQueryDefaults(bcNotificationKeys.seenHere, { gcTime: Infinity, staleTime: Infinity });
const seenHere = (): readonly string[] => queryClient.getQueryData<string[]>(bcNotificationKeys.seenHere) ?? [];
const withSeenHere = (list: BcNotification[]): BcNotification[] => {
  const here = seenHere();
  return here.length ? list.map((n, i) => (here.includes(bcItemId(n, i)) ? { ...n, seen: true } : n)) : list;
};

/* The bell's payroll list, while `on` (not while looking at the app as
   someone else: these are the signed-in account's own). */
export function useBcNotifications(on: boolean) {
  const [known, setKnown] = useState(() => !!bcContext.employeeNo());
  const knownRef = useRef(known);
  useEffect(() => bcEvents.on('employee-no-ready', () => {
    if (!bcContext.employeeNo()) return;
    if (knownRef.current) void queryClient.refetchQueries({ queryKey: bcNotificationKeys.all, type: 'active' });
    else { knownRef.current = true; setKnown(true); }
  }), []);
  const q = useQuery({
    queryKey: bcNotificationKeys.all, queryFn: async () => withSeenHere(await fetchBcNotifications()), enabled: on && known,
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  return {
    items: on ? q.data ?? [] : [],
    /* BELL.R8: seen at once, then Business Central is told. `id` is the
       item's id in the bell (src/domain/inbox.ts bcItemId): its systemId, or
       a key of its own when it has none. One without a systemId cannot be
       addressed, so Business Central is not told (QniConnect sent
       /bc/notifications/undefined), but it is still seen here, as QniConnect
       showed it: otherwise the badge could never clear. It stays seen for
       the session when the list is read again (seenHere, above). */
    markSeen(id: string) {
      let systemId = '';
      queryClient.setQueryData<BcNotification[]>(bcNotificationKeys.all, list => list?.map((n, i) => {
        if (bcItemId(n, i) !== id) return n;
        systemId = typeof n.systemId === 'string' ? n.systemId : '';
        return { ...n, seen: true };
      }));
      if (systemId) void markBcNotificationSeen(systemId);
      else queryClient.setQueryData<string[]>(bcNotificationKeys.seenHere, ids => [...(ids ?? []), id]);
    },
  };
}
