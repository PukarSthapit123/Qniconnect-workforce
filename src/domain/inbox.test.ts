/* The merged bell's one list (spec D13): Business Central's payroll
   notifications (portal inventory BELL) and Workforce's inbox, in one shape,
   newest first. */
import type { BcNotification } from '@/contract/bc/notifications';
import type { NotificationItem } from '@/contract/notifications';
import { bcAt, bcWhen, mergeInbox } from './inbox';

const wf = (id: string, at: string, read = false): NotificationItem =>
  ({ id, area: 'Timesheet', title: `wf ${id}`, body: 'detail', at, read, ago: '4h', link: null });
const bc = (systemId: string, createdDate?: string, createdTime?: string, seen = false): BcNotification =>
  ({ systemId, message: `bc ${systemId}`, createdDate, createdTime, seen });

test('merges both feeds newest first', () => {
  const items = mergeInbox(
    [bc('b-old', '2026-07-01', '09:00:00'), bc('b-new', '2026-08-13', '15:00:00')],
    [wf('w-mid', '2026-08-01T10:00:00.000Z'), wf('w-newest', '2026-08-13T16:30:00.000Z')]);
  expect(items.map(i => i.id)).toEqual(['w-newest', 'b-new', 'w-mid', 'b-old']);
  /* an undated payroll item has no time to sort by, so it goes last, in its order */
  expect(mergeInbox([bc('b-undated'), bc('b-dated', '2026-01-01')], [wf('w', '2025-01-01T00:00:00.000Z')]).map(i => i.id))
    .toEqual(['b-dated', 'w', 'b-undated']);
});

test('a payroll date not written as ISO sorts last, with the undated ones, in its order', () => {
  expect(mergeInbox([bc('b-uk', '28/07/2026', '08:15:00'), bc('b-iso', '2026-01-01')], [wf('w', '2025-01-01T00:00:00.000Z')]).map(i => i.id))
    .toEqual(['b-iso', 'w', 'b-uk']);
});

test('keeps source', () => {
  const [w, b] = mergeInbox([bc('b1', '2026-08-01', '09:30:12', true)], [wf('w1', '2026-08-02T00:00:00.000Z', false)]);
  expect(w).toMatchObject({ id: 'w1', source: 'workforce', title: 'wf w1', body: 'detail', read: false, at: '2026-08-02T00:00:00.000Z' });
  expect(b).toMatchObject({ id: 'b1', source: 'payroll', title: 'bc b1', read: true, at: '2026-08-01T09:30:12' });
  expect(b?.body).toBeUndefined();
});

test('ties keep payroll first', () => {
  const at = '2026-08-13T09:00:00';
  const items = mergeInbox([bc('b1', '2026-08-13', '09:00:00'), bc('b2', '2026-08-13', '09:00:00')], [wf('w1', new Date(at).toISOString())]);
  expect(items.map(i => i.source)).toEqual(['payroll', 'payroll', 'workforce']);
  expect(items.map(i => i.id)).toEqual(['b1', 'b2', 'w1']);
});

/* BELL.R8's `seen`: anything falsy is unseen */
test('BELL.R8: a payroll item is read only when it is seen', () => {
  const items = mergeInbox([{ systemId: 'a', message: 'x' }, { systemId: 'b', message: 'y', seen: true }], []);
  expect(items.map(i => i.read)).toEqual([false, true]);
});

/* BELL.R9: the date line is the date as sent and the first five characters of the time */
test('BELL.R9: the date line is the raw date and the time cut to HH:MM', () => {
  expect(bcWhen({ createdDate: '2024-06-01', createdTime: '09:30:45' })).toBe('2024-06-01 • 09:30');
  expect(bcWhen({ createdDate: '01/06/2024' })).toBe('01/06/2024');
  expect(bcWhen({ createdTime: '09:30:45' })).toBe('');
  expect(bcWhen({})).toBe('');
});

test('a payroll item missing its id or message still has a row', () => {
  const items = mergeInbox([{ createdDate: '2026-08-01' }, { createdDate: '2026-07-01' }], []);
  expect(items.map(i => i.id)).toEqual(['payroll-0', 'payroll-1']);
  expect(items.map(i => i.title)).toEqual(['', '']);
  expect(bcAt({ createdDate: '2026-08-01' })).toBe('2026-08-01T00:00:00');
  expect(bcAt({})).toBe('');
});
