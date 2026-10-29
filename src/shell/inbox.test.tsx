import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { bcStore } from '@/mocks/bc/seed';
import { queryClient } from '@/api/query';
import { bcEvents } from '@/api/bc/events';
import { tid } from '@/testids';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { accountOf, audits, resetTo, signInAs } from '@/test/api-helpers';
import { Shell } from './Shell';
import { NotificationBell, emptyInbox } from './Inbox';

/* The bell and its inbox (brief D9, Review Focus 4), on the social seed: the
   prototype's per-role feeds, copied to each account of that role. */
withFakeServer();
beforeEach(() => { resetTo('social'); bcStore.reset(); localStorage.removeItem('employeeNo'); });
interface Row { id: string; employeeId: string; read: boolean; title: string }
const rows = (employeeId: string) => Object.values(store.coll<Row>('notifications')).filter(n => n.employeeId === employeeId);
const openBell = async () => {
  await userEvent.click(await screen.findByTestId(tid.shell.bell));
  return screen.findByTestId(tid.inbox.panel);
};

test('the bell shows the real unread count and the panel lists my items, newest first, with full test id coverage', async () => {
  await signInAs('manager');
  renderPage(<Shell />, '/team/temployees');
  expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('1');
  expect(screen.getByTestId(tid.shell.bell)).toHaveAccessibleName('Notifications, 1 unread');
  const panel = await openBell();
  await waitFor(() => expect(within(panel).getAllByRole('link')).toHaveLength(2));
  const titles = within(panel).getAllByRole('link').map(a => a.textContent ?? '');
  expect(titles[0]).toMatch(/^Unread\. 3 timesheets awaiting your approval/);
  expect(titles[0]).toMatch(/Timesheet · Approvals/);
  expect(titles[0]).toMatch(/4h/);
  expectTestIdCoverage(document.body);
});

test('opening an item marks it read and goes to its page; the count follows the server', async () => {
  await signInAs('manager');
  renderPage(<Shell />, '/team/temployees');
  const panel = await openBell();
  const item = within(panel).getAllByRole('link').find(a => /3 timesheets awaiting your approval/.test(a.textContent ?? ''));
  if (!item) throw new Error('no timesheet item');
  expect(item).toHaveAttribute('href', '/team/tteam');
  await userEvent.click(item);
  await waitFor(() => expect(screen.getByTestId(tid.page('tteam'))).toBeInTheDocument());
  expect(screen.queryByTestId(tid.inbox.panel)).toBeNull();
  expect(await screen.findByText('Opened from your notifications: 3 timesheets awaiting your approval.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
  expect(rows('CP-1001').find(n => n.title.startsWith('3 timesheets awaiting'))?.read).toBe(true);
  expect(audits().filter(a => a.act === 'Notification read')).toHaveLength(1);
});

test('an item whose page I cannot reach is shown without a link; Mark all read clears the count', async () => {
  /* the admin's Timesheet destination is the Approvals queue (tteam), which an admin reaches through payroll approval: this admin has it revoked */
  const acc = accountOf('admin') as ReturnType<typeof accountOf> & { revocations: string[] };
  acc.revocations = ['pay_appr'];
  await signInAs('admin');
  const admin = acc.employeeCode;
  store.coll('notifications').ntf_test_home = { id: 'ntf_test_home', version: 1, updatedAt: '2026-08-13T14:30:00.000Z', employeeId: admin, area: 'Timesheet',
    title: 'Approval delegated to you', body: 'Covering Rachel Hussain', at: '2026-08-13T14:00:00.000Z', read: false };
  const unread = rows(admin).filter(n => !n.read).length;
  renderPage(<Shell />, '/setup/asetup');
  expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent(String(unread));
  const panel = await openBell();
  const plain = await within(panel).findByTestId(tid.inbox.item('ntf_test_home'));
  expect(plain.tagName).toBe('DIV');
  expect(within(plain).queryByTestId(tid.inbox.dest('ntf_test_home'))).toBeNull();
  expect(within(panel).getAllByRole('link').every(a => a.getAttribute('href') !== null)).toBe(true);
  await userEvent.click(within(panel).getByTestId(tid.inbox.markAll));
  await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
  expect(rows(admin).every(n => n.read)).toBe(true);
  expect(within(panel).getByTestId(tid.inbox.markAll)).toBeDisabled();
});

test('a link to a page I cannot open, or to no page at all, says so in the page frame', async () => {
  await signInAs('employee');
  const first = renderPage(<Shell />, '/setup/aperm');
  expect(await screen.findByTestId(tid.unavailable.root)).toHaveTextContent('Permissions is not available to you.');
  expect(screen.getByTestId(tid.unavailable.home)).toHaveAttribute('href', '/work/home');
  first.unmount();
  renderPage(<Shell />, '/work/nonsense');
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(screen.getByTestId(tid.unavailable.root)).toHaveTextContent('There is no page at /work/nonsense.');
});

/* A count past 99 is capped, so it never outgrows the 16px badge; its digits
   are tabular, so the badge does not twitch as the count changes. */
test('the bell count caps at 99+', () => {
  render(<NotificationBell inbox={emptyInbox(120)} />);
  const count = screen.getByTestId(tid.shell.bellCount);
  expect(count).toHaveTextContent(/^99\+$/);
  expect(count.className).toMatch(/tabular-nums/);
  expect(screen.getByTestId(tid.shell.bell)).toHaveAccessibleName('Notifications, 120 unread');
});

/* The merged bell (spec D13; portal inventory BELL): Business Central's
   payroll notifications beside Workforce's, for Amara Okafor (CP-1042):
   Workforce's "Timesheet approved" (read, 11 Aug) and three payroll ones,
   the July payslip (unseen, 28 Jul), the P60 and the tax code (seen). */
describe('the merged bell', () => {
  const BASE = import.meta.env.REACT_APP_API_BASE_URL ?? '';
  const PATH = new URL(BASE).pathname.replace(/\/$/, '');
  let sent: string[] = [];
  beforeEach(() => {
    sent = [];
    server.events.on('request:start', ({ request }) => {
      const u = new URL(request.url);
      if (u.href.startsWith(BASE)) sent.push(`${request.method} ${u.pathname.slice(PATH.length)}${u.search}`);
      else if (u.pathname.startsWith('/api/v1/notifications')) sent.push(`${request.method} ${u.pathname}`);
    });
  });
  afterEach(() => { server.events.removeAllListeners(); });
  const bcGets = () => sent.filter(s => s.startsWith('GET /bc/notifications'));
  const payslipNote = () => {
    const n = bcStore.db.notifications.find(x => x.employeeNo === 'CP-1042' && x.systemId.includes('-ps-'));
    if (!n) throw new Error('no payslip notification for CP-1042');
    return n;
  };
  /* the seed's payroll notifications are all seen; the July payslip's is made unseen here */
  beforeEach(() => { payslipNote().seen = false; });
  const amara = async () => { await signInAs('employee'); localStorage.setItem('employeeNo', 'CP-1042'); renderPage(<Shell />, '/work/ts'); };
  const rowsIn = (panel: HTMLElement) => within(panel).getAllByTestId(/^inbox-item-/);

  test('BELL.R4 (D13): one list from both sources, newest first, each with its source; the count adds both, with full test id coverage', async () => {
    await amara();
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('1');
    const panel = await openBell();
    await waitFor(() => expect(rowsIn(panel)).toHaveLength(4));
    expect(rowsIn(panel).map(r => within(r).getByTestId(/^inbox-source-/).textContent?.split(' · ')[0])).toEqual(['Timesheet', 'Payroll', 'Payroll', 'Payroll']);
    expect(rowsIn(panel)[1]).toHaveTextContent('Your payslip for July 2026 is ready to view.');
    expectTestIdCoverage(document.body);
  });

  test('mark read goes to the source backend', async () => {
    await amara();
    const n = payslipNote();
    let panel = await openBell();
    await userEvent.click(await within(panel).findByTestId(tid.inbox.item(n.systemId)));
    /* payroll: BELL.C2 to Business Central, with its query, and nothing to Workforce */
    await waitFor(() => expect(sent.filter(s => s.startsWith('PATCH'))).toEqual([`PATCH /bc/notifications/${n.systemId}?registrationId=REG-DEMO-0001&clientEnvironment=Production`]));
    expect(sent.some(s => s.startsWith('POST /api/v1/notifications'))).toBe(false);
    await waitFor(() => expect(n.seen).toBe(true));
    await userEvent.click(await screen.findByTestId(tid.inbox.detailDone));
    /* Workforce: its own read endpoint, and nothing to Business Central */
    const wf = Object.values(store.coll<Row>('notifications')).find(x => x.employeeId === 'CP-1042');
    if (!wf) throw new Error('no Workforce notification for CP-1042');
    wf.read = false;
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    panel = await openBell();
    sent = [];
    const item = await within(panel).findByTestId(tid.inbox.item(wf.id));
    await waitFor(() => expect(within(item).getByTestId(tid.inbox.dot(wf.id))).toHaveAttribute('data-unread'));
    await userEvent.click(item);
    await waitFor(() => expect(sent).toContain(`POST /api/v1/notifications/${wf.id}/read`));
    expect(sent.some(s => s.startsWith('PATCH /bc/'))).toBe(false);
    await waitFor(() => expect(rows('CP-1042').find(x => x.id === wf.id)?.read).toBe(true));
  });

  test('BELL.R1: no payroll notifications are asked for without an employee number; employee-no-ready asks, and each one asks again and replaces the list (BELL.R2)', async () => {
    await signInAs('employee');
    renderPage(<Shell />, '/work/ts');
    await screen.findByTestId(tid.shell.bell);
    await new Promise(r => setTimeout(r, 50));
    expect(bcGets()).toEqual([]);
    /* the event without a number stored still asks nothing */
    act(() => bcEvents.emit('employee-no-ready'));
    await new Promise(r => setTimeout(r, 20));
    expect(bcGets()).toEqual([]);
    localStorage.setItem('employeeNo', 'CP-1042');
    act(() => bcEvents.emit('employee-no-ready'));
    await waitFor(() => expect(bcGets()).toEqual(['GET /bc/notifications?registrationId=REG-DEMO-0001&clientEnvironment=Production&employeeNo=CP-1042']));
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('1');
    /* the list is replaced by the next answer */
    payslipNote().seen = true;
    act(() => bcEvents.emit('employee-no-ready'));
    await waitFor(() => expect(bcGets()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
  });

  test('BELL.R2 (fixed, Ruling Q2): a page opened directly loads the payroll notifications once the number is known, without the dashboard', async () => {
    await amara();
    await waitFor(() => expect(bcGets()).toHaveLength(1));
    expect(sent.some(s => s.startsWith('GET /bc/payslips') || s.startsWith('GET /bc/employees'))).toBe(false);
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('1');
  });

  test('BELL.R5: the badge counts the unread of both, and is gone with none', async () => {
    await amara();
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('1');
    expect(screen.getByTestId(tid.shell.bell)).toHaveAccessibleName('Notifications, 1 unread');
    for (const n of bcStore.db.notifications) if (n.employeeNo === 'CP-1042') n.seen = false;
    act(() => bcEvents.emit('employee-no-ready'));
    await waitFor(() => expect(screen.getByTestId(tid.shell.bellCount)).toHaveTextContent('3'));
    for (const n of bcStore.db.notifications) n.seen = true;
    act(() => bcEvents.emit('employee-no-ready'));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
  });

  test('BELL.R6: the bell opens and closes the panel; a press outside or Escape closes it', async () => {
    await amara();
    await openBell();
    await userEvent.click(screen.getByTestId(tid.shell.bell));
    expect(screen.queryByTestId(tid.inbox.panel)).toBeNull();
    await openBell();
    await userEvent.click(document.body);
    expect(screen.queryByTestId(tid.inbox.panel)).toBeNull();
    await openBell();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId(tid.inbox.panel)).toBeNull();
  });

  test('BELL.R7: the panel says how many are new, and an unseen payroll item has the dot and is announced unread', async () => {
    await amara();
    await screen.findByTestId(tid.shell.bellCount);
    const panel = await openBell();
    expect(within(panel).getByTestId(tid.inbox.newCount)).toHaveTextContent('1 new');
    const n = payslipNote();
    const row = await within(panel).findByTestId(tid.inbox.item(n.systemId));
    expect(within(row).getByTestId(tid.inbox.dot(n.systemId))).toHaveAttribute('data-unread');
    expect(row).toHaveTextContent(/^Unread\. Your payslip/);
    const seen = bcStore.db.notifications.find(x => x.employeeNo === 'CP-1042' && x.seen);
    if (!seen) throw new Error('no seen payroll notification');
    expect(within(panel).getByTestId(tid.inbox.dot(seen.systemId))).not.toHaveAttribute('data-unread');
  });

  test('BELL.R8: opening an unseen payroll item marks it seen at once; a failed PATCH is ignored and not undone; a seen one sends nothing', async () => {
    server.use(http.patch(`${BASE}/bc/notifications/:id`, () => HttpResponse.json({ message: 'no' }, { status: 500 })));
    await amara();
    await screen.findByTestId(tid.shell.bellCount);
    const n = payslipNote();
    let panel = await openBell();
    await userEvent.click(await within(panel).findByTestId(tid.inbox.item(n.systemId)));
    expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull();
    await waitFor(() => expect(sent.filter(s => s.startsWith('PATCH'))).toHaveLength(1));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull();
    expect(screen.queryByTestId(tid.toast.error)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.inbox.detailDone));
    panel = await openBell();
    await userEvent.click(within(panel).getByTestId(tid.inbox.item(n.systemId)));
    expect(await screen.findByTestId(tid.inbox.detail)).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 20));
    expect(sent.filter(s => s.startsWith('PATCH'))).toHaveLength(1);
  });

  test('BELL.R9: a payroll item shows its date as sent and the time to the minute', async () => {
    await amara();
    const n = payslipNote();
    const panel = await openBell();
    expect(await within(panel).findByTestId(tid.inbox.when(n.systemId))).toHaveTextContent('2026-07-28 • 08:15');
  });

  test('BELL.R10: a payroll item opens its detail: Notification, the date line and the message; Done closes it', async () => {
    await amara();
    const n = payslipNote();
    const panel = await openBell();
    await userEvent.click(await within(panel).findByTestId(tid.inbox.item(n.systemId)));
    expect(screen.queryByTestId(tid.inbox.panel)).toBeNull();
    const detail = await screen.findByTestId(tid.inbox.detail);
    expect(within(detail).getByRole('heading', { name: 'Notification' })).toBeInTheDocument();
    expect(within(detail).getByTestId(tid.inbox.detailWhen)).toHaveTextContent('2026-07-28 • 08:15');
    expect(within(detail).getByTestId(tid.inbox.detailMessage)).toHaveTextContent('Your payslip for July 2026 is ready to view.');
    expectTestIdCoverage(document.body);
    await userEvent.click(within(detail).getByTestId(tid.inbox.detailDone));
    await waitFor(() => expect(screen.queryByTestId(tid.inbox.detail)).toBeNull());
  });

  test('BELL error state: payroll notifications that cannot be read are none, without a message, and Workforce\'s still show', async () => {
    server.use(http.get(`${BASE}/bc/notifications`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    await amara();
    const panel = await openBell();
    await waitFor(() => expect(bcGets()).toHaveLength(1));
    await waitFor(() => expect(rowsIn(panel)).toHaveLength(1));
    expect(within(panel).getByTestId(/^inbox-source-/)).toHaveTextContent('Timesheet');
    expect(within(panel).queryByTestId(tid.inbox.error)).toBeNull();
  });

  test('Mark all read marks both: Workforce\'s read-all, and BELL.C2 for each unseen payroll item', async () => {
    for (const n of bcStore.db.notifications) if (n.employeeNo === 'CP-1042') n.seen = false;
    await amara();
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('3');
    const panel = await openBell();
    await userEvent.click(within(panel).getByTestId(tid.inbox.markAll));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
    await waitFor(() => expect(sent.filter(s => s.startsWith('PATCH /bc/notifications/'))).toHaveLength(3));
    /* Workforce had nothing unread, so it was not asked */
    expect(sent).not.toContain('POST /api/v1/notifications/read-all');
    await waitFor(() => expect(bcStore.db.notifications.filter(n => n.employeeNo === 'CP-1042').every(n => n.seen)).toBe(true));
  });

  test('Mark all read with Workforce unread and payroll unseen together clears both, and the badge with them', async () => {
    const manager = accountOf('manager').employeeCode;
    const mine = bcStore.db.notifications.filter(n => n.employeeNo === manager);
    expect(mine.length).toBeGreaterThan(0);
    for (const n of mine) n.seen = false;
    await signInAs('manager');
    localStorage.setItem('employeeNo', manager);
    renderPage(<Shell />, '/team/temployees');
    /* one Workforce item unread, and every payroll item unseen */
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent(String(1 + mine.length));
    const panel = await openBell();
    await userEvent.click(within(panel).getByTestId(tid.inbox.markAll));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
    expect(sent).toContain('POST /api/v1/notifications/read-all');
    await waitFor(() => expect(sent.filter(s => s.startsWith('PATCH /bc/notifications/'))).toHaveLength(mine.length));
    await waitFor(() => expect(mine.every(n => n.seen)).toBe(true));
    expect(rows(manager).every(n => n.read)).toBe(true);
  });

  /* QniConnect sent PATCH /bc/notifications/undefined for an item with no
     systemId and marked it seen on screen anyway (BELL.R8: nothing is undone).
     The port sends nothing for it, but must still let it go from the badge:
     before Task 24 it stayed unseen for good and Mark all read could not
     clear the count. */
  test('a payroll item with no systemId: opening it or Mark all read clears it from the badge, and nothing is sent for it', async () => {
    for (const n of bcStore.db.notifications) if (n.employeeNo === 'CP-1042') n.seen = true;
    bcStore.db.notifications.push({ systemId: '', employeeNo: 'CP-1042', message: 'A note with no id.', seen: false, createdDate: '2026-07-30', createdTime: '09:00:00' },
      { systemId: '', employeeNo: 'CP-1042', message: 'Another note with no id.', seen: false, createdDate: '2026-07-29', createdTime: '09:00:00' });
    await amara();
    expect(await screen.findByTestId(tid.shell.bellCount)).toHaveTextContent('2');
    let panel = await openBell();
    const first = await within(panel).findByText('A note with no id.');
    await userEvent.click(first);
    await userEvent.click(await screen.findByTestId(tid.inbox.detailDone));
    await waitFor(() => expect(screen.getByTestId(tid.shell.bellCount)).toHaveTextContent('1'));
    panel = await openBell();
    await userEvent.click(within(panel).getByTestId(tid.inbox.markAll));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull());
    expect(sent.filter(s => s.startsWith('PATCH'))).toEqual([]);
    /* Task 24 fix round 1: the list is read again (employee-no-ready), and the
       server still says unseen; what was seen here stays seen this session */
    const gets = bcGets().length;
    act(() => bcEvents.emit('employee-no-ready'));
    await waitFor(() => expect(bcGets().length).toBe(gets + 1));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByTestId(tid.shell.bellCount)).toBeNull();
    expect(bcStore.db.notifications.filter(n => n.systemId === '').every(n => !n.seen)).toBe(true);
  });

  test('while looking at the app as someone else, the bell shows no payroll items (they are the account\'s own) and asks for none', async () => {
    await signInAs('admin');
    localStorage.setItem('employeeNo', accountOf('admin').employeeCode);
    renderPage(<Shell />, '/setup/asetup');
    await waitFor(() => expect(bcGets()).toHaveLength(1));
    await userEvent.click(await screen.findByTestId(tid.shell.account));
    await userEvent.click(await screen.findByTestId(tid.shell.viewAs(accountOf('manager').employeeCode)));
    await screen.findByTestId(tid.shell.viewAsEnd);
    const panel = await openBell();
    await waitFor(() => expect(within(panel).queryAllByTestId(/^inbox-source-/).length).toBeGreaterThan(0));
    expect(within(panel).queryAllByTestId(/^inbox-source-/).map(s => s.textContent)).not.toContain('Payroll');
    expect(bcGets()).toHaveLength(1);
  });
});
