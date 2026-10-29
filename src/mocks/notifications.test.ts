import { server } from './node';
import { store } from './store';
import { MatrixSaved, MyNotifications, NotifChannel, NotificationMatrix, NotificationsRead } from '@/contract/notifications';
import { Refusal } from '@/contract/common';
import { NOTIF_CHANNELS } from '@/domain/notifications';
import { audits, caller, fault, resetTo, snapshot, tokenFor, type Persona } from '@/test/api-helpers';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterAll(() => server.close());
beforeEach(() => resetTo('social'));

const as = async (p: Persona) => caller(await tokenFor(p));
const mine = async (call: Awaited<ReturnType<typeof as>>) => MyNotifications.parse((await call('GET', '/api/v1/notifications/me')).body);
const matrix = async (call: Awaited<ReturnType<typeof as>>) => NotificationMatrix.parse((await call('GET', '/api/v1/notifications/matrix')).body);
const refusal = (r: { body: unknown }) => Refusal.parse(r.body);
const own = () => audits().filter(a => a.act !== 'Signed in');
const setModule = (k: string, on: boolean) => { const t = store.coll<{ modules: Record<string, boolean> }>('tenant').tenant; if (t) t.modules[k] = on; };
const WRITES = ['notifications', 'notifMatrix', 'audit'];
/* Timesheet is live while either capture method is on */
const timesheetOff = () => { setModule('A', false); setModule('B', false); };
const timesheetOn = () => { setModule('A', true); setModule('B', true); };
/* the employee's one seeded item, Timesheet approved, starts read: make it unread */
const unreadOne = () => { const n = Object.values(store.coll<{ employeeId: string; title: string; read: boolean }>('notifications')).find(x => x.employeeId === 'CP-1042' && x.title === 'Timesheet approved'); if (n) n.read = false; };
const APPROVE_DAY = '/api/v1/timesheet-days/tsd_CP-1042_2026-08-12/transition';
const approvedFor = () => Object.values(store.coll<{ employeeId: string; title: string; delivery?: unknown }>('notifications')).filter(n => n.employeeId === 'CP-1042' && n.title === 'Timesheet approved');

test('the contract\'s channels are the catalogue\'s', () => {
  expect(NotifChannel.options).toEqual([...NOTIF_CHANNELS]);
});

describe('my notifications (Review Focus 4)', () => {
  test('mine only, newest first, with the unread count and a link only where I can go', async () => {
    unreadOne();
    const me = await mine(await as('employee'));
    expect(me.items.map(i => [i.title, i.ago, i.read])).toEqual([['Timesheet approved', '2d', false]]);
    expect(me.unread).toBe(1);
    expect(me.items.map(i => i.link?.path ?? null)).toEqual(['/work/ts']);
    const mgr = await mine(await as('manager'));
    expect(mgr.items).toHaveLength(2);
    /* Workforce opens Employees for a manager; Timesheet opens Approvals */
    expect(mgr.items.find(i => i.area === 'Workforce')?.link).toEqual({ view: 'temployees', path: '/team/temployees', label: 'Employees' });
    /* the admin's Workforce item opens Setup */
    const adm = await mine(await as('admin'));
    expect(adm.items.find(i => i.area === 'Workforce')?.link).toEqual({ view: 'asetup', path: '/setup/asetup', label: 'Setup' });
  });
  test('an item whose module is off is hidden and not counted, and comes back with the module', async () => {
    const call = await as('employee');
    unreadOne();
    timesheetOff();
    const off = await mine(call);
    expect(off.items.map(i => i.area)).toEqual([]);
    expect(off.unread).toBe(0);
    timesheetOn();
    expect((await mine(call)).unread).toBe(1);
  });
  test('marking one read lowers the count with one audit row; someone else\'s is not found; again changes nothing', async () => {
    unreadOne();
    const call = await as('employee'), first = (await mine(call)).items[0];
    if (!first) throw new Error('no item');
    const r = NotificationsRead.parse((await call('POST', `/api/v1/notifications/${first.id}/read`)).body);
    expect(r).toMatchObject({ unread: 0, marked: 1, auditId: expect.any(String) });
    expect(own()).toEqual([expect.objectContaining({ act: 'Notification read', entityId: first.id })]);
    const again = NotificationsRead.parse((await call('POST', `/api/v1/notifications/${first.id}/read`)).body);
    expect(again).toEqual({ unread: 0, marked: 0, auditId: null });
    const theirs = (await mine(await as('manager'))).items[0];
    const before = snapshot(...WRITES);
    const r404 = await call('POST', `/api/v1/notifications/${theirs?.id ?? ''}/read`);
    expect(r404.status).toBe(404);
    expect(snapshot(...WRITES)).toEqual(before);
  });
  test('mark all read marks what is in my inbox, once; a hidden item stays unread', async () => {
    unreadOne();
    const call = await as('employee');
    const r = NotificationsRead.parse((await call('POST', '/api/v1/notifications/read-all')).body);
    expect(r).toMatchObject({ unread: 0, marked: 1 });
    expect(own().filter(a => a.act === 'Notifications marked read')).toHaveLength(1);
    expect(NotificationsRead.parse((await call('POST', '/api/v1/notifications/read-all')).body)).toEqual({ unread: 0, marked: 0, auditId: null });
  });
  test('an item hidden with its module stays unread when everything else is marked', async () => {
    const call = await as('employee');
    unreadOne();
    timesheetOff();
    expect(NotificationsRead.parse((await call('POST', '/api/v1/notifications/read-all')).body)).toEqual({ unread: 0, marked: 0, auditId: null });
    timesheetOn();
    expect((await mine(call)).unread).toBe(1);
  });
});

describe('the matrix (Review Focus 1, 4, 7)', () => {
  test('framework only; events of an off module are hidden', async () => {
    const emp = await as('employee');
    expect((await emp('GET', '/api/v1/notifications/matrix')).status).toBe(403);
    const call = await as('admin'), m = await matrix(call);
    expect(m.version).toBe(0);
    expect(m.events.find(e => e.code === 'ts_approved')?.channels).toEqual({ employee: 'In-app + email', manager: 'Off', admin: 'Off' });
    expect(m.events.some(e => e.code === 'ts_geo')).toBe(false); // GEOFENCE is off in social
    expect(m.events.some(e => e.module === 'Rota')).toBe(false);
    timesheetOff();
    expect((await matrix(call)).events.some(e => e.module === 'Timesheet')).toBe(false);
  });
  test('a change is saved whole with one audit row, and the migrated event follows it: Timesheet approved off for Employee tells nobody', async () => {
    const call = await as('admin');
    const r = await call('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Off' } } }, 0);
    expect(r.status).toBe(200);
    const saved = MatrixSaved.parse(r.body);
    expect(saved.record.version).toBe(1);
    expect(saved.message).toBe('Timesheet approved for Employee: off.');
    expect(own()).toEqual([expect.objectContaining({ act: 'Notification settings changed', before: { 'ts_approved.employee': 'In-app + email' } })]);
    const mgr = await as('manager'), was = approvedFor().length;
    expect((await mgr('POST', APPROVE_DAY, { to: 'ok', reason: '' }, 1)).status).toBe(200);
    expect(approvedFor()).toHaveLength(was);
  });
  test('an email channel is recorded on the row as not connected and never reaches the inbox', async () => {
    const call = await as('admin');
    expect((await call('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Email' } } }, 0)).status).toBe(200);
    await (await as('manager'))('POST', APPROVE_DAY, { to: 'ok', reason: '' }, 1);
    const rows = approvedFor().filter(n => n.delivery !== undefined);
    expect(rows).toEqual([expect.objectContaining({ delivery: { inApp: false, email: 'not-connected', sms: null } })]);
  });
  test('stale, forbidden, switched off, never-applies and a fault each leave no change and no audit row', async () => {
    const call = await as('admin'), before = snapshot(...WRITES);
    expect((await call('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Off' } } }, 3)).status).toBe(412);
    const mgr = await as('manager');
    const forbidden = await mgr('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Off' } } }, 0);
    expect(forbidden.status).toBe(403);
    expect(refusal(forbidden).code).toBe('capability');
    const never = await call('PATCH', '/api/v1/notifications/matrix', { events: { cfg: { employee: 'In-app' } } }, 0);
    expect(refusal(never)).toMatchObject({ code: 'invalid', field: 'events.cfg.employee' });
    timesheetOff();
    const off = await call('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Off' } } }, 0);
    expect(off.status).toBe(409);
    expect(refusal(off).code).toBe('MODULE_OFF');
    timesheetOn();
    await fault('PATCH', '/api/v1/notifications/matrix');
    expect((await call('PATCH', '/api/v1/notifications/matrix', { events: { ts_approved: { employee: 'Off' } } }, 0)).status).toBe(500);
    expect(snapshot('notifications', 'notifMatrix')).toEqual({ notifications: before.notifications, notifMatrix: before.notifMatrix });
    expect(own()).toEqual([]);
  });
});
