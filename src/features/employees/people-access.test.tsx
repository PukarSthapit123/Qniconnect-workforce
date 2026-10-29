/* Setup · People & access (spec D12, N18, N19; inventory USERS): the
   Workforce records and the portal logins on one page, joined by employee
   number in the browser, against the fake /bc and /api/v1. Dee Fitzgerald
   (the social seed's admin) holds master_data and is a portal admin. */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { tid } from '@/testids';
import { server } from '@/mocks/node';
import { bcStore } from '@/mocks/bc/seed';
import { adminInstance } from '@/api/bc/admin';
import { portalUsersKey } from '@/api/bc/portal-users';
import { queryClient } from '@/api/query';
import type { PortalUserRow } from '@/domain/people-access';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { resetTo, signInAs, signInEmail } from '@/test/api-helpers';
import { AdminEmployeesPage } from './AdminEmployeesPage';

withFakeServer();
const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const PATH = new URL(BASE).pathname.replace(/\/$/, '');
let sent: { line: string; body: Promise<string> }[] = [];
let workforce: string[] = [];
beforeEach(async () => {
  localStorage.clear();
  resetTo('social'); bcStore.reset(); adminInstance.setEnvironment(null);
  await signInAs('admin');
  sent = []; workforce = [];
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    if (u.href.startsWith(BASE)) sent.push({ line: `${request.method} ${u.pathname.slice(PATH.length)}${u.search}`, body: request.clone().text() });
    else if (u.pathname.startsWith('/api/v1/')) workforce.push(`${request.method} ${u.pathname}`);
  });
});
afterEach(() => { server.events.removeAllListeners(); vi.restoreAllMocks(); });
const calls = (line: string) => sent.filter(s => s.line === line);
const userBy = (email: string) => {
  const u = bcStore.db.portalUsers.find(x => x.email === email);
  if (!u) throw new Error(`no portal user ${email}`);
  return u;
};
const AMARA = 'amara.okafor@brightpath.org', DEE = 'dee.fitzgerald@brightpath.org', MARCUS = 'marcus.reilly@brightpath.org';
const open = async () => {
  renderPage(<AdminEmployeesPage />, '/setup/aemployees');
  return screen.findByTestId(tid.ausers.list);
};
const rowOf = (email: string) => screen.getByTestId(tid.ausers.row(userBy(email).id));
const menu = async (email: string) => { await userEvent.click(screen.getByTestId(tid.ausers.menu(userBy(email).id))); };
const typeForm = async (name: string, email: string) => {
  await userEvent.clear(screen.getByTestId(tid.ausers.name)); if (name) { await userEvent.click(screen.getByTestId(tid.ausers.name)); await userEvent.paste(name); }
  await userEvent.clear(screen.getByTestId(tid.ausers.email)); if (email) { await userEvent.click(screen.getByTestId(tid.ausers.email)); await userEvent.paste(email); }
};
/* by the DOM, not the a11y tree: an open dialog hides the page from it */
const listed = () => [...screen.getByTestId(tid.ausers.list).querySelectorAll('tbody tr')].map(r => r.getAttribute('data-testid'));

describe('People & access: the page', () => {
  test('one page: People & access, the Workforce records marked not yet connected, each with its portal login, and the portal logins below, with full test id coverage', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('People & access');
    expect(screen.getByText('Setup · People & access')).toBeInTheDocument();
    expect(screen.getByTestId(tid.people.records)).toHaveTextContent('Workforce records');
    expect(screen.getByTestId(tid.people.recordsNotConnected)).toHaveTextContent('Not yet connected');
    /* each record's login, joined by employee number */
    await waitFor(() => expect(screen.getByTestId(tid.people.portalCol('CP-1002'))).toHaveTextContent('ActiveAdmin'));
    expect(screen.getByTestId(tid.people.portalCol('CP-1042'))).toHaveTextContent('Active');
    expect(screen.getByTestId(tid.people.portalCol('CP-1503'))).toHaveTextContent('Pending first login');
    expect(screen.getByTestId(tid.ausers.panel)).toHaveTextContent('Portal logins');
    expectTestIdCoverage(document.body);
  });

  test('N19: the two sides meet in the browser only: the logins are read from /bc, the records from /api/v1, and no Workforce data goes to /bc', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId(tid.people.portalCol('CP-1042'))).toHaveTextContent('Active'));
    expect(sent.map(s => s.line).filter(l => l.startsWith('GET /bc/portalUsers'))).toEqual(['GET /bc/portalUsers']);
    expect(sent.filter(s => !s.line.startsWith('POST /bc/portalUsers/verify') && !s.line.startsWith('POST /session') && !s.line.startsWith('GET /bc/environments')).map(s => s.line))
      .toEqual(['GET /bc/portalUsers']);
    expect(workforce).toContain('GET /api/v1/employees');
  });

  test('a login with no Workforce record, and a record with no login, are both kept', async () => {
    /* Marcus's login is gone: his record stays, with no login and an invitation */
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    await waitFor(() => expect(screen.getByTestId(tid.people.portalCol('CP-1088'))).toHaveTextContent('No portal login'));
    expect(screen.getByTestId(tid.people.invite('CP-1088'))).toHaveAccessibleName('Invite Marcus Reilly to the portal');
    /* the other tenant's people have logins but no record here */
    const other = userBy('pukar.sthapit@dogmagroup.co.uk');
    expect(screen.getByTestId(tid.ausers.noRecord(other.id))).toHaveTextContent('No Workforce record');
    expect(screen.getByTestId(tid.ausers.noRecord(other.id))).toHaveTextContent(`No Workforce record has the employee number ${other.employeeNo}.`);
    expect(screen.getByTestId(tid.ausers.recordOpen(userBy(AMARA).id))).toHaveTextContent('CP-1042');
  });

  test('Invite on a record with no login opens the add form, filled in from the record, and adds the login', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    await userEvent.click(await screen.findByTestId(tid.people.invite('CP-1088')));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Marcus Reilly');
    expect(screen.getByTestId(tid.ausers.email)).toHaveValue(MARCUS);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls('POST /bc/portalUsers')[0]?.body).toBe(`{"name":"Marcus Reilly","email":"${MARCUS}","role":"User","isAdmin":false}`);
  });

  test('a login\'s record opens the Workforce record, which shows its portal login', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.recordOpen(userBy(AMARA).id)));
    expect(await screen.findByTestId(tid.employee.record)).toHaveTextContent('Amara Okafor');
    expect(screen.getByTestId(tid.people.recordPortal)).toHaveTextContent('Active');
    expect(screen.getByTestId(tid.employee.fact('lastLogin'))).toHaveTextContent(/^\d{2} [A-Z][a-z]{2} 2026$/);
  });

  test('a record with no login says so, and its Invite opens the add form', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    await userEvent.click(screen.getByTestId(tid.employees.open('CP-1088')));
    await screen.findByTestId(tid.employee.record);
    await waitFor(() => expect(screen.getByTestId(tid.people.recordPortal)).toHaveTextContent('No portal login'));
    await userEvent.click(screen.getByTestId(tid.people.recordInvite));
    expect(await screen.findByTestId(tid.ausers.email)).toHaveValue(MARCUS);
    expect(screen.queryByTestId(tid.employee.record)).toBeNull();
  });
});

describe('People & access: the two gates (N18, D8)', () => {
  test('master_data without isAdmin: the Workforce records alone, and no portal user is read', async () => {
    userBy(DEE).isAdmin = false;
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    await screen.findByTestId(tid.employees.table);
    expect(screen.queryByTestId(tid.ausers.panel)).toBeNull();
    expect(screen.queryByTestId(tid.people.portalCol('CP-1042'))).toBeNull();
    expect(within(screen.getByTestId(tid.employees.table)).queryByText('Portal login')).toBeNull();
    expect(calls('GET /bc/portalUsers')).toEqual([]);
  });

  test('isAdmin without master_data (an employee persona): the portal logins alone; no Workforce record is read or matched', async () => {
    userBy(AMARA).isAdmin = true;
    await signInEmail(AMARA);
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    await screen.findByTestId(tid.ausers.list);
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('People & access');
    expect(screen.queryByTestId(tid.employees.table)).toBeNull();
    expect(screen.queryByTestId(tid.ausers.record(userBy(AMARA).id))).toBeNull();
    expect(within(screen.getByTestId(tid.ausers.list)).queryByText('Workforce record')).toBeNull();
    expect(workforce.filter(w => w.startsWith('GET /api/v1/employees'))).toEqual([]);
    expectTestIdCoverage(document.body);
  });
});

describe('USERS: portal logins', () => {
  test('USERS states: loading, then the list with its tabs, search and Add user; a row shows the initial, name, email, last login and badges', async () => {
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    expect(await screen.findByTestId(tid.ausers.loading)).toHaveTextContent('Loading the portal users…');
    await screen.findByTestId(tid.ausers.list);
    expect(screen.getByTestId(tid.ausers.search)).toHaveAttribute('placeholder', 'Search by name or email');
    expect(screen.getByTestId(tid.ausers.add)).toHaveTextContent('Add user');
    const dee = userBy(DEE);
    expect(rowOf(DEE)).toHaveTextContent('Dee Fitzgerald');
    expect(rowOf(DEE)).toHaveTextContent(DEE);
    expect(screen.getByTestId(tid.ausers.status(dee.id))).toHaveTextContent('Active');
    expect(screen.getByTestId(tid.ausers.admin(dee.id))).toHaveTextContent('Admin');
    expect(screen.queryByTestId(tid.ausers.admin(userBy(AMARA).id))).toBeNull();
  });

  test('USERS states: a load failure says so, and the empty list offers Clear filters', async () => {
    server.use(http.get(`${BASE}/bc/portalUsers`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    expect(await screen.findByTestId(tid.ausers.error)).toHaveTextContent('Failed to load users. Please try again.');
    expect(screen.getByTestId(tid.ausers.empty)).toHaveTextContent('No users found matching your criteria.');
  });

  test('USERS.R1: the list is read once when the page opens, and not again after a change', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(userBy(AMARA).id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(userBy(AMARA).id))).toHaveTextContent('Inactive'));
    await new Promise(r => setTimeout(r, 200));
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R2: the tabs filter by status and admin, then a case-insensitive search on name or email', async () => {
    await open();
    const users = bcStore.db.portalUsers;
    const ids = (pred: (u: (typeof users)[number]) => boolean) => users.filter(pred).map(u => tid.ausers.row(u.id));
    expect(listed()).toEqual(ids(() => true));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('inactive')));
    expect(listed()).toEqual(ids(u => u.status !== 'Active'));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('admin')));
    expect(listed()).toEqual(ids(u => u.isAdmin));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('active')));
    await userEvent.type(screen.getByTestId(tid.ausers.search), 'OKAFOR');
    expect(listed()).toEqual(ids(u => u.status === 'Active' && /okafor/i.test(u.name + u.email)));
    expect(listed().length).toBeGreaterThan(0);
  });

  test('USERS.R3: the tab counts are the whole list\'s, whatever the search', async () => {
    await open();
    const users = bcStore.db.portalUsers;
    await userEvent.type(screen.getByTestId(tid.ausers.search), 'nobody-matches-this');
    expect(screen.getByTestId(tid.ausers.tab('all'))).toHaveTextContent(`All users ${users.length}`);
    expect(screen.getByTestId(tid.ausers.tab('active'))).toHaveTextContent(`Active ${users.filter(u => u.status === 'Active').length}`);
    expect(screen.getByTestId(tid.ausers.tab('inactive'))).toHaveTextContent(`Inactive ${users.filter(u => u.status !== 'Active').length}`);
    expect(screen.getByTestId(tid.ausers.tab('admin'))).toHaveTextContent(`Admins ${users.filter(u => u.isAdmin).length}`);
    /* and an empty result offers to clear both */
    await userEvent.click(screen.getByTestId(tid.ausers.tab('admin')));
    await userEvent.click(screen.getByTestId(tid.ausers.clear));
    expect(screen.getByTestId(tid.ausers.search)).toHaveValue('');
    expect(screen.getByTestId(tid.ausers.tab('all'))).toHaveAttribute('aria-pressed', 'true');
    expect(listed()).toHaveLength(users.length);
  });

  test('USERS.R4: an administrator cannot be changed; anyone else is activated or deactivated by status, and always edited', async () => {
    userBy(MARCUS).status = 'Inactive';
    await open();
    const dee = userBy(DEE), amara = userBy(AMARA), marcus = userBy(MARCUS), first = userBy('firstlogin@brightpath.org');
    expect(screen.getByTestId(tid.ausers.locked(dee.id))).toHaveTextContent('Admin users cannot be modified');
    expect(screen.queryByTestId(tid.ausers.menu(dee.id))).toBeNull();
    expect(screen.getByTestId(tid.ausers.menu(amara.id))).toHaveAccessibleName('Actions for Amara Okafor');
    await menu(AMARA);
    expect((await screen.findByRole('menu')).textContent).toBe('Deactivate userEdit user');
    await userEvent.keyboard('{Escape}');
    for (const u of [marcus, first]) {
      await userEvent.click(screen.getByTestId(tid.ausers.menu(u.id)));
      expect((await screen.findByRole('menu')).textContent).toBe('Activate userEdit user');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  test('USERS.R5: deactivate and activate change only that row, in place; a failure says so and changes nothing', async () => {
    await open();
    const amara = userBy(AMARA);
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(amara.id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Inactive'));
    expect(await calls(`POST /bc/portalUsers/${amara.id}/updateStatus`)[0]?.body).toBe('{"status":"Inactive"}');
    expect(screen.getByTestId(tid.ausers.status(userBy(MARCUS).id))).toHaveTextContent('Active');
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.activate(amara.id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Active'));
    expect(await calls(`POST /bc/portalUsers/${amara.id}/updateStatus`)[1]?.body).toBe('{"status":"Active"}');
    server.use(http.post(`${BASE}/bc/portalUsers/:id/updateStatus`, () => HttpResponse.json({ message: 'no' }, { status: 500 })));
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(amara.id)));
    expect(await screen.findByTestId(tid.ausers.error)).toHaveTextContent('Failed to deactivate user. Please try again.');
    expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Active');
    /* the next attempt clears the last failure's banner first */
    server.resetHandlers();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(amara.id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Inactive'));
    expect(screen.queryByTestId(tid.ausers.error)).toBeNull();
  });

  test('USERS.R5: activating a pending user says "Failed to activate user" when it is refused', async () => {
    server.use(http.post(`${BASE}/bc/portalUsers/:id/updateStatus`, () => HttpResponse.json({ message: 'no' }, { status: 500 })));
    await open();
    const first = userBy('firstlogin@brightpath.org');
    await userEvent.click(screen.getByTestId(tid.ausers.menu(first.id)));
    await userEvent.click(await screen.findByTestId(tid.ausers.activate(first.id)));
    expect(await screen.findByTestId(tid.ausers.error)).toHaveTextContent('Failed to activate user. Please try again.');
    expect(screen.getByTestId(tid.ausers.status(first.id))).toHaveTextContent('Pending first login');
  });

  test('USERS.R6: administrator access makes the role Admin and locks it; unticking leaves Admin and unlocks it', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    expect(screen.getByTestId(tid.ausers.role)).toHaveTextContent('User');
    await userEvent.click(screen.getByTestId(tid.ausers.isAdmin));
    expect(screen.getByTestId(tid.ausers.role)).toHaveTextContent('Admin');
    expect(screen.getByTestId(tid.ausers.role)).toBeDisabled();
    await userEvent.click(screen.getByTestId(tid.ausers.isAdmin));
    expect(screen.getByTestId(tid.ausers.role)).toHaveTextContent('Admin');
    expect(screen.getByTestId(tid.ausers.role)).toBeEnabled();
  });

  test('USERS.R7: the add form\'s checks, in order; nothing is sent while one fails', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    expect(screen.getByTestId(tid.modal.title)).toHaveTextContent('Add new user');
    for (const [name, email, message] of [
      ['', 'a@b.co', 'Name and email are required fields.'],
      ['<b></b>', 'a@b.co', 'Name and email are required fields.'],
      ['Ann', 'ann@x', 'Please enter a valid email address.'],
      ['x'.repeat(101), 'a@b.co', 'Name must be 100 characters or fewer.'],
    ] as const) {
      await typeForm(name, email);
      await userEvent.click(screen.getByTestId(tid.ausers.save));
      expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent(message);
    }
    expect(calls('POST /bc/portalUsers')).toEqual([]);
  });

  test('USERS.R8: the edit form checks the same way, with its own first message', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    await typeForm('', AMARA);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent('Name and email are required.');
    await typeForm('Amara', 'amara@x');
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent('Please enter a valid email address.');
    expect(sent.filter(s => s.line.startsWith('PATCH '))).toEqual([]);
  });

  test('USERS.R9: Enter in the form and the button run the same checks', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Ann', 'ann@x');
    await userEvent.type(screen.getByTestId(tid.ausers.email), '{Enter}');
    expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent('Please enter a valid email address.');
    await typeForm('Ann Lee', 'ann.lee@elsewhere.org');
    await userEvent.type(screen.getByTestId(tid.ausers.name), '{Enter}');
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(calls('POST /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R10: a new user is sent sanitised and added at the end of the list, and the dialog closes, with no list read', async () => {
    await open();
    const before = listed().length;
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('  <i>Ann</i> Lee ', '  Ann.Lee@Elsewhere.ORG ');
    await userEvent.click(screen.getByTestId(tid.ausers.isAdmin));
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls('POST /bc/portalUsers')[0]?.body).toBe('{"name":"Ann Lee","email":"ann.lee@elsewhere.org","role":"Admin","isAdmin":true}');
    const rows = listed();
    expect(rows).toHaveLength(before + 1);
    const made = userBy('ann.lee@elsewhere.org');
    expect(rows.at(-1)).toBe(tid.ausers.row(made.id));
    /* the fake answers pending: the answer's status wins over Active */
    expect(screen.getByTestId(tid.ausers.status(made.id))).toHaveTextContent('Pending first login');
    expect(screen.getByTestId(tid.ausers.lastLogin(made.id))).toHaveTextContent('Never');
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R11: a refused add keeps the dialog open with what the server said', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Amara Again', AMARA);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    expect(await screen.findByTestId(tid.ausers.formError)).toHaveTextContent('A portal user with this email address already exists.');
    expect(screen.getByTestId(tid.ausers.form)).toBeInTheDocument();
    server.use(http.post(`${BASE}/bc/portalUsers`, () => HttpResponse.json({}, { status: 500 })));
    await typeForm('Someone', 'someone@elsewhere.org');
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent('API Error: 500'));
  });

  test('USERS.R12: a saved edit replaces the row with what was typed and what the server answered; a refusal keeps the dialog open', async () => {
    await open();
    const amara = userBy(AMARA);
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(amara.id)));
    expect(screen.getByTestId(tid.modal.title)).toHaveTextContent('Edit user');
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Amara Okafor');
    await typeForm('Amara O. Okafor', AMARA);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls(`PATCH /bc/portalUsers/${amara.id}`)[0]?.body).toBe(`{"name":"Amara O. Okafor","email":"${AMARA}","role":"Employee","isAdmin":false}`);
    expect(rowOf(AMARA)).toHaveTextContent('Amara O. Okafor');
    server.use(http.patch(`${BASE}/bc/portalUsers/:id`, () => HttpResponse.json({ message: 'That email belongs to someone else.' }, { status: 409 })));
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(amara.id)));
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    expect(await screen.findByTestId(tid.ausers.formError)).toHaveTextContent('That email belongs to someone else.');
    expect(screen.getByTestId(tid.ausers.form)).toBeInTheDocument();
  });

  test('USERS.R13: Cancel closes the dialog and forgets what was typed', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Half Typed', 'half@x.org');
    await userEvent.click(screen.getByTestId(tid.ausers.cancel));
    expect(screen.queryByTestId(tid.ausers.form)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('');
    expect(calls('POST /bc/portalUsers')).toEqual([]);
  });

  test('USERS.R14: what is typed survives the list changing behind the dialog', async () => {
    await open();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Still Here', 'still@x.org');
    const before = listed().length;
    act(() => { queryClient.setQueryData<PortalUserRow[]>(portalUsersKey, list => (list ?? []).slice(1)); });
    /* the list behind the dialog did change */
    await waitFor(() => expect(listed()).toHaveLength(before - 1));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Still Here');
    expect(screen.getByTestId(tid.ausers.email)).toHaveValue('still@x.org');
  });

  test('USERS.R15: the last login as a day, or Never', async () => {
    userBy(AMARA).lastLogin = '2026-07-01T09:00:00Z';
    await open();
    expect(screen.getByTestId(tid.ausers.lastLogin(userBy(AMARA).id))).toHaveTextContent('01 Jul 2026');
    expect(screen.getByTestId(tid.ausers.lastLogin(userBy('firstlogin@brightpath.org').id))).toHaveTextContent('Never');
  });

  test('USERS.R16: the edit dialog opens only for a chosen user, and names them', async () => {
    await open();
    expect(screen.queryByTestId(tid.ausers.form)).toBeNull();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    expect(screen.getByTestId(tid.modal.root)).toHaveTextContent(AMARA);
  });

  test('USERS edit: a role QniConnect\'s form does not list is shown as it is, never silently changed', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    expect(screen.getByTestId(tid.ausers.role)).toHaveTextContent('Employee');
  });
});
