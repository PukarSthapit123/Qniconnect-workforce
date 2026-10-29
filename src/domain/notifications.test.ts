import { buildNav, everyTab } from './nav';
import {
  DEFAULT_MATRIX, NOTIF_CHANNELS, NOTIF_EVENTS, PART_COLUMN, ageText, applyMatrixChange, areaLive, channelFor, channelLabel, deliveryOf, deliveryText, eventBy,
  eventShown, inboxOf, linkFor, plannedDeliveries, targetView, unreadOf, type InboxRow, type LiveContext,
} from './notifications';

const must = <T,>(v: T | undefined, what = 'value'): T => { if (v === undefined) throw new Error(`missing ${what}`); return v; };
const ALL = { CORE: true, TS: true, A: true, B: true, C: true, ON: true };
const FLAGS = { GEOFENCE: true };
const ctx = (over: Partial<LiveContext> = {}): LiveContext => ({ modules: ALL, flags: FLAGS, allowances: true, ...over });
const ev = (code: string) => must(eventBy(code), code);

describe('the catalogue (NOTIF_EVENTS, NOTIF_CHANNELS)', () => {
  test('carries the prototype\'s events in its order, grouped by module, with their default channels', () => {
    /* the prototype's 30 less the ten Rota events, the six Leave events and the Notice event, and module 5's four Onboarding events (brief D9) */
    expect(NOTIF_EVENTS).toHaveLength(17);
    expect(NOTIF_EVENTS.map(e => e.code).slice(0, 3)).toEqual(['ts_submitted', 'ts_approved', 'ts_returned']);
    expect([...new Set(NOTIF_EVENTS.map(e => e.module))]).toEqual(['Timesheet', 'Onboarding', 'Workforce']);
    expect(NOTIF_EVENTS.filter(e => e.module === 'Onboarding').map(e => e.code)).toEqual(['ob_submitted', 'ob_doc_decided', 'ob_chased', 'ob_invited']);
    /* an invitation reaches the starter in the app only: no email is sent in this build (D6, D9) */
    expect(ev('ob_invited').defaults).toEqual({ employee: 'In-app', manager: null, admin: null });
    expect(ev('ts_approved').defaults).toEqual({ employee: 'In-app + email', manager: 'Off', admin: 'Off' });
    expect(ev('cfg').defaults).toEqual({ employee: null, manager: null, admin: 'In-app + email' });
    expect(NOTIF_CHANNELS).toEqual(['Off', 'In-app', 'Email', 'In-app + email', 'In-app + email + SMS']);
  });
  test('an email or SMS channel is labelled not connected', () => {
    expect(NOTIF_CHANNELS.map(channelLabel)).toEqual(['Off', 'In-app', 'Email (not connected)', 'In-app + email (not connected)', 'In-app + email + SMS (not connected)']);
  });
});

describe('what is offered and what is live', () => {
  test('an event is hidden while its module is off, Timesheet while neither capture method is on', () => {
    expect(eventShown(ev('ob_submitted'), ctx({ modules: { ...ALL, ON: false } }))).toBe(false);
    expect(eventShown(ev('ob_invited'), ctx({ modules: { ...ALL, ON: false } }))).toBe(false);
    expect(eventShown(ev('ts_submitted'), ctx({ modules: { ...ALL, A: false, B: false } }))).toBe(false);
    expect(eventShown(ev('ts_submitted'), ctx({ modules: { ...ALL, A: false } }))).toBe(true);
    expect(eventShown(ev('pf_req'), ctx({ modules: { CORE: true } }))).toBe(true);
  });
  test('an event that needs a feature or allowances is hidden without it', () => {
    expect(eventShown(ev('ts_geo'), ctx({ flags: { ...FLAGS, GEOFENCE: false } }))).toBe(false);
    expect(eventShown(ev('ts_geo'), ctx({ modules: { ...ALL, C: false } }))).toBe(false);
    expect(eventShown(ev('ts_allow'), ctx({ allowances: false }))).toBe(false);
    expect(eventShown(ev('ts_allow'), ctx())).toBe(true);
  });
  test('an area is live with its source (NOTIF_SRC_MOD); Workforce and any other area always are', () => {
    const off = { CORE: true };
    expect(['Timesheet', 'Onboarding', 'Workforce', 'Elsewhere'].map(a => areaLive(a, off))).toEqual([false, false, true, true]);
    expect(['Timesheet', 'Onboarding'].map(a => areaLive(a, ALL))).toEqual([true, true]);
  });
});

describe('delivery (Review Focus 4)', () => {
  test('Off and a dash deliver nothing; only In-app is delivered; email and SMS are never delivered, only recorded as not connected', () => {
    expect(deliveryOf('Off')).toBeNull();
    expect(deliveryOf(null)).toBeNull();
    expect(deliveryOf('In-app')).toEqual({ inApp: true, email: null, sms: null });
    expect(deliveryOf('Email')).toEqual({ inApp: false, email: 'not-connected', sms: null });
    expect(deliveryOf('In-app + email + SMS')).toEqual({ inApp: true, email: 'not-connected', sms: 'not-connected' });
    for (const c of NOTIF_CHANNELS) expect(deliveryText(deliveryOf(c))).not.toMatch(/sent/i);
    expect(deliveryText(deliveryOf('In-app + email'))).toBe('In-app, email not connected.');
    expect(deliveryText(deliveryOf('Email'))).toBe('Email not connected.');
  });
  test('a recipient\'s part in the event picks the column: subject Employee, actor Manager, back office Admin (I3)', () => {
    expect(PART_COLUMN).toEqual({ subject: 'employee', actor: 'manager', backOffice: 'admin' });
    /* an administrator deciding a request is told in the Manager column; a manager who is the subject in the Employee column */
    expect(plannedDeliveries(ev('pf_req'), [{ employeeCode: 'A1', persona: PART_COLUMN.actor }], DEFAULT_MATRIX, ALL).map(d => d.channel)).toEqual(['In-app + email']);
    expect(plannedDeliveries(ev('ts_approved'), [{ employeeCode: 'M1', persona: PART_COLUMN.subject }], DEFAULT_MATRIX, ALL).map(d => d.channel)).toEqual(['In-app + email']);
    expect(plannedDeliveries(ev('cfg'), [{ employeeCode: 'A1', persona: PART_COLUMN.backOffice }], DEFAULT_MATRIX, ALL).map(d => d.channel)).toEqual(['In-app + email']);
  });
  test('the matrix is read per column, and a change to it is respected', () => {
    const employees = [{ employeeCode: 'E1', persona: 'employee' as const }, { employeeCode: 'M1', persona: 'manager' as const }, { employeeCode: 'A1', persona: 'admin' as const }];
    expect(plannedDeliveries(ev('ts_approved'), employees, DEFAULT_MATRIX, ALL).map(d => [d.employeeCode, d.channel])).toEqual([['E1', 'In-app + email']]);
    const off = { ...DEFAULT_MATRIX, ts_approved: { employee: 'Off' as const, manager: 'In-app' as const, admin: 'Off' as const } };
    expect(plannedDeliveries(ev('ts_approved'), employees, off, ALL).map(d => d.employeeCode)).toEqual(['M1']);
    expect(channelFor(off, 'ts_approved', 'employee')).toBe('Off');
    expect(channelFor({}, 'ts_approved', 'employee')).toBe('In-app + email');
  });
  test('an event whose module is off reaches nobody; a recipient named twice is told once', () => {
    const p = [{ employeeCode: 'E1', persona: 'employee' as const }, { employeeCode: 'E1', persona: 'employee' as const }];
    expect(plannedDeliveries(ev('ts_approved'), p, DEFAULT_MATRIX, { ...ALL, A: false, B: false })).toEqual([]);
    expect(plannedDeliveries(ev('ts_approved'), p, DEFAULT_MATRIX, ALL)).toHaveLength(1);
  });
});

describe('deep links (NOTIF_TARGETS, notifReachable)', () => {
  const nav = (...caps: string[]) => buildNav({ caps: new Set(caps), modules: ALL, flags: FLAGS, onboarding: false, portalAdmin: false });
  test('each area opens its page for each user type; an unknown area opens the Workforce one', () => {
    expect(['Timesheet', 'DBS', 'Workforce'].map(a => targetView(a, 'manager'))).toEqual(['tteam', 'temployees', 'temployees']);
    expect(['Timesheet', 'DBS', 'Workforce'].map(a => targetView(a, 'employee'))).toEqual(['ts', 'profile', 'home']);
    expect(['Timesheet', 'DBS', 'Workforce'].map(a => targetView(a, 'admin'))).toEqual(['tteam', 'aemployees', 'asetup']);
    expect(targetView('Elsewhere', 'admin')).toBe('asetup');
    expect((['employee', 'manager', 'admin'] as const).map(p => targetView('Onboarding', p))).toEqual(['onb', 'tonb', 'tonb']);
  });
  test('a link is offered only when the page is on that employee\'s nav and built', () => {
    expect(linkFor('Onboarding', 'manager', nav('onb_track'))).toEqual({ view: 'tonb', path: '/team/tonb', label: 'Onboarding' });
    expect(linkFor('Onboarding', 'manager', nav('team_ts'))).toBeNull();
    expect(linkFor('Timesheet', 'admin', nav('pay_appr'))).toEqual({ view: 'tteam', path: '/team/tteam', label: 'Approvals' }); // the payroll layer's queue
    expect(linkFor('Timesheet', 'admin', nav('mod_cfg'))).toBeNull(); // not on the nav without payroll approval
    expect(linkFor('Workforce', 'employee', nav('own_home'))).toEqual({ view: 'home', path: '/work/home', label: 'Home' }); // built in 1c group 7
    expect(linkFor('Workforce', 'employee', nav('own_ts'))).toBeNull(); // not on the nav without own_home
    expect(linkFor('Workforce', 'admin', nav('mod_cfg'))).toEqual({ view: 'asetup', path: '/setup/asetup', label: 'Setup' });
  });
  test('every page the app knows is listed once, whoever reaches it', () => {
    const paths = everyTab().map(t => t.path);
    expect(paths).toEqual(expect.arrayContaining(['/work/onb', '/work/home', '/team/tonb', '/setup/anotif', '/setup/mpay']));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('the inbox', () => {
  const row = (id: string, area: string, at: string, read = false, over: Partial<InboxRow> = {}): InboxRow => ({ id, employeeId: 'E1', area, at, read, ...over });
  test('mine, delivered in-app, from a live source, newest first; the unread count follows it', () => {
    const rows = [row('n1', 'Onboarding', '2026-08-10T09:00:00.000Z'), row('n2', 'Timesheet', '2026-08-12T09:00:00.000Z', true), row('n3', 'Timesheet', '2026-08-11T09:00:00.000Z'),
      row('n4', 'Timesheet', '2026-08-13T09:00:00.000Z', false, { employeeId: 'M1' }), row('n5', 'Timesheet', '2026-08-13T09:00:00.000Z', false, { delivery: { inApp: false, email: 'not-connected', sms: null } })];
    const mine = inboxOf(rows, 'E1', ALL);
    expect(mine.map(r => r.id)).toEqual(['n2', 'n3', 'n1']);
    expect(unreadOf(mine)).toBe(2);
    const onboardingOff = inboxOf(rows, 'E1', { ...ALL, ON: false });
    expect(onboardingOff.map(r => r.id)).toEqual(['n2', 'n3']);
    expect(unreadOf(onboardingOff)).toBe(1);
  });
  test('the age reads as the prototype\'s ago column', () => {
    const now = '2026-08-13T14:30:00.000Z';
    expect(['2026-08-13T14:30:00.000Z', '2026-08-13T14:10:00.000Z', '2026-08-13T10:30:00.000Z', '2026-08-11T14:30:00.000Z', '2026-08-06T14:30:00.000Z'].map(a => ageText(a, now)))
      .toEqual(['now', '20m', '4h', '2d', '1w']);
  });
});

describe('changing the matrix', () => {
  test('a change lists each cell before and after, and keeps the rest', () => {
    const r = applyMatrixChange(DEFAULT_MATRIX, { ts_approved: { employee: 'Off', manager: 'Off' }, pf_req: { admin: 'In-app + email' } }, ctx());
    if (!r.ok) throw new Error(r.problem.message);
    expect(r.before).toEqual({ 'ts_approved.employee': 'In-app + email', 'pf_req.admin': 'Off' });
    expect(r.after).toEqual({ 'ts_approved.employee': 'Off', 'pf_req.admin': 'In-app + email' });
    expect(r.matrix.ts_approved).toEqual({ employee: 'Off', manager: 'Off', admin: 'Off' });
    expect(r.matrix.ts_submitted).toEqual(DEFAULT_MATRIX.ts_submitted);
  });
  test('an unknown event, a role the event never applies to and an event that is switched off are refused', () => {
    const bad = (change: Parameters<typeof applyMatrixChange>[1], c = ctx()) => { const r = applyMatrixChange(DEFAULT_MATRIX, change, c); return r.ok ? null : r.problem; };
    expect(bad({ nope: { employee: 'Off' } })).toMatchObject({ status: 422, field: 'events.nope' });
    expect(bad({ cfg: { employee: 'In-app' } })).toMatchObject({ status: 422, field: 'events.cfg.employee', message: 'Configuration changed never applies to that role.' });
    expect(bad({ ts_approved: { employee: 'Off' } }, ctx({ modules: { ...ALL, A: false, B: false } }))).toMatchObject({ status: 409, code: 'MODULE_OFF' });
  });
});
