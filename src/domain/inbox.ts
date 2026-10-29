/* The merged bell's one list (spec D13): the payroll notifications Business
   Central sends (portal inventory BELL.C1) and Workforce's inbox
   (/api/v1/notifications/me), mapped to one shape that keeps where each came
   from, newest first. Marking an item read goes back to its own source.

   QniConnect showed its list in the order it came (BELL.R4); with two feeds
   there is no one order to keep, so both are sorted by time. A payroll item
   is dated by its createdDate and createdTime, as written, read as local
   time; one with no date has nothing to sort by and goes last. Two items at
   the same moment keep payroll first, then each feed's own order. */
import type { BcNotification } from '@/contract/bc/notifications';
import type { NotificationItem as WfNotification } from '@/contract/notifications';

export type InboxSource = 'payroll' | 'workforce';
export interface InboxItem {
  id: string; source: InboxSource; title: string; body?: string; at: string; read: boolean;
  /* what the row shows: its area in capitals and its time (Workforce's "4h";
     payroll's date line, BELL.R9), and where a Workforce item opens */
  area?: string; when?: string; link?: WfNotification['link'];
}
export type { BcNotification, WfNotification };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/* BELL.R9 formatNotifDate: nothing without a date; else the date as sent,
   and ' • ' and the first five characters of the time when there is one. */
export function bcWhen(n: Pick<BcNotification, 'createdDate' | 'createdTime'>): string {
  const date = str(n.createdDate), time = str(n.createdTime);
  if (!date) return '';
  return time ? `${date} • ${time.substring(0, 5)}` : date;
}

/* When a payroll item was made, as a local date-time ('' with no date). */
export function bcAt(n: Pick<BcNotification, 'createdDate' | 'createdTime'>): string {
  const date = str(n.createdDate);
  if (!date) return '';
  return `${date}T${str(n.createdTime) || '00:00:00'}`;
}

/* An item with no systemId gets one of its own, so the list still has a key;
   it cannot be marked seen (QniConnect sent /bc/notifications/undefined). */
export const bcItemId = (n: BcNotification, i: number): string => str(n.systemId) || `payroll-${i}`;

const fromBc = (n: BcNotification, i: number): InboxItem => ({
  id: bcItemId(n, i), source: 'payroll', title: str(n.message), at: bcAt(n), read: !!n.seen, area: 'Payroll', when: bcWhen(n),
});
const fromWf = (n: WfNotification): InboxItem => ({
  id: n.id, source: 'workforce', title: n.title, body: n.body, at: n.at, read: n.read, area: n.area, when: n.ago, link: n.link,
});

/* A payroll date not written as ISO (yyyy-mm-dd, as Business Central sends
   it), such as 28/07/2026, does not parse: it sorts last, with the items that
   have no date, rather than being guessed at. */
const time = (at: string) => { const t = Date.parse(at); return Number.isNaN(t) ? -Infinity : t; };

export function mergeInbox(bc: BcNotification[], wf: WfNotification[]): InboxItem[] {
  /* payroll first, so a stable sort keeps it first on a tie */
  return [...bc.map(fromBc), ...wf.map(fromWf)].sort((a, b) => {
    const x = time(a.at), y = time(b.at);
    return x === y ? 0 : y > x ? 1 : -1;
  });
}
