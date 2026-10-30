/* Setup · Employees (spec D12, N18, N19; inventory USERS): every Workforce
   record once, in one table, with its portal login joined by employee number
   in the browser, against the fake /bc and /api/v1. A login no record matches
   is not listed there (user ruling 2026-10-27); a portal admin without
   master_data gets the logins-only list. A row's one action is View; the
   login's status, menu and last login are on the record. Dee Fitzgerald (the
   social seed's admin) holds master_data and is a portal admin. */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { tid } from '@/testids';
import { server } from '@/mocks/node';
import { store } from '@/mocks/store';
import { bcStore } from '@/mocks/bc/seed';
import { adminInstance } from '@/api/bc/admin';
import { portalUsersKey } from '@/api/bc/portal-users';
import { queryClient } from '@/api/query';
import type { PortalUserRow } from '@/domain/people-access';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { renderPage, withFakeServer } from '@/test/render-page';
import { employeeOf, resetTo, signInAs, signInEmail } from '@/test/api-helpers';
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
const FIRST = 'firstlogin@brightpath.org';
/* the other tenant's people have logins but no record here */
const OTHER = 'pukar.sthapit@dogmagroup.co.uk';
/* a row's portal login mark, beside its Status pill */
const mark = (code: string) => screen.getByTestId(tid.people.portalCol(code));
/* the one table, once the logins are read into it (a mark shows only then) */
const open = async () => {
  renderPage(<AdminEmployeesPage />, '/setup/aemployees');
  const table = await screen.findByTestId(tid.employees.table);
  await screen.findByTestId(tid.people.portalCol(userBy(DEE).employeeNo));
  return table;
};
/* a portal admin without master_data: the logins alone, with QniConnect's tabs and Add */
const openLogins = async () => {
  userBy(AMARA).isAdmin = true;
  await signInEmail(AMARA);
  renderPage(<AdminEmployeesPage />, '/setup/aemployees');
  return screen.findByTestId(tid.ausers.list);
};
/* a person's record, opened from their row's View, with its portal login section */
const openRecord = async (email: string) => {
  await userEvent.click(screen.getByTestId(tid.employees.open(userBy(email).employeeNo)));
  return screen.findByTestId(tid.people.recordPortal);
};
const closeRecord = async () => {
  await userEvent.click(screen.getByTestId(tid.employee.close));
  await waitFor(() => expect(screen.queryByTestId(tid.employee.record)).toBeNull());
};
/* the login's menu is on the record; the record stays open behind a menu action and the edit form */
const menu = async (email: string) => {
  const id = userBy(email).id;
  if (!screen.queryByTestId(tid.ausers.menu(id))) await openRecord(email);
  await userEvent.click(await screen.findByTestId(tid.ausers.menu(id)));
};
/* the add or edit form's own dialog: the record may be open beneath it */
const formDialog = () => {
  const d = screen.getByTestId(tid.ausers.form).closest<HTMLElement>('[role="dialog"]');
  if (!d) throw new Error('the form is not in a dialog');
  return d;
};
const typeForm = async (name: string, email: string) => {
  await userEvent.clear(screen.getByTestId(tid.ausers.name)); if (name) { await userEvent.click(screen.getByTestId(tid.ausers.name)); await userEvent.paste(name); }
  await userEvent.clear(screen.getByTestId(tid.ausers.email)); if (email) { await userEvent.click(screen.getByTestId(tid.ausers.email)); await userEvent.paste(email); }
};
/* by the DOM, not the a11y tree: an open dialog hides the page from it */
const rowsIn = (testId: string) => [...screen.getByTestId(testId).querySelectorAll('tbody tr')].map(r => r.getAttribute('data-testid'));
const listed = () => rowsIn(tid.employees.table);
const loginsListed = () => rowsIn(tid.ausers.list);
const pick = async (filter: string, value: string) => {
  await userEvent.click(screen.getByTestId(filter));
  await userEvent.click(await screen.findByTestId(`${filter}-option-${value}`));
};

describe('Setup · Employees: one table', () => {
  test('one page, one table: each Workforce record with its portal login marked beside its status, one View per row, the records marked not yet connected, with full test id coverage', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Employees');
    expect(screen.getByTestId(tid.people.recordsNotConnected)).toHaveTextContent('Not yet connected');
    /* each record's login, joined by employee number, marked in the same row's Status cell */
    expect(mark('CP-1002')).toHaveAttribute('data-login', 'on');
    expect(mark('CP-1002')).toHaveTextContent('Signs in to the portal, portal admin');
    expect(mark('CP-1042')).toHaveAttribute('data-login', 'on');
    expect(mark('CP-1042')).toHaveTextContent(/^Signs in to the portal$/);
    expect(mark('CP-1503')).toHaveAttribute('data-login', 'sent');
    expect(mark('CP-1503')).toHaveTextContent('Invited to the portal, pending first login');
    expect(screen.getByTestId(tid.people.loginLegend)).toBeInTheDocument();
    /* the row's one action is View; the login's menu, Invite and Edit are on the record */
    const row = screen.getByTestId(tid.employees.row('CP-1042'));
    expect(within(row).getAllByRole('button').map(b => b.getAttribute('data-testid'))).toEqual([tid.employees.open('CP-1042')]);
    expect(within(row).getByTestId(tid.employees.open('CP-1042'))).toHaveAccessibleName('View Amara Okafor');
    expect(screen.queryByTestId(tid.ausers.menu(userBy(AMARA).id))).toBeNull();
    /* no Add portal login on this page, and no second table of logins */
    expect(screen.queryByTestId(tid.ausers.add)).toBeNull();
    expect(screen.queryByTestId(tid.ausers.panel)).toBeNull();
    expect(screen.queryByTestId(tid.ausers.list)).toBeNull();
    expectTestIdCoverage(document.body);
    /* and the record, with its portal login section and the login's menu */
    await openRecord(AMARA);
    expect(screen.getByTestId(tid.ausers.menu(userBy(AMARA).id))).toBeInTheDocument();
    expectTestIdCoverage(document.body);
  });

  test('N19: the two sides meet in the browser only: the logins are read from /bc, the records from /api/v1, and no Workforce data goes to /bc', async () => {
    await open();
    expect(sent.map(s => s.line).filter(l => l.startsWith('GET /bc/portalUsers'))).toEqual(['GET /bc/portalUsers']);
    expect(sent.filter(s => !s.line.startsWith('POST /bc/portalUsers/verify') && !s.line.startsWith('POST /session') && !s.line.startsWith('GET /bc/environments')).map(s => s.line))
      .toEqual(['GET /bc/portalUsers']);
    expect(workforce).toContain('GET /api/v1/employees');
  });

  test('each record once: a record with no login is marked so, and a login no record matches is not listed, nor counted', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    const table = await open();
    expect(mark('CP-1088')).toHaveAttribute('data-login', 'none');
    expect(mark('CP-1088')).toHaveTextContent('No portal login');
    /* the invitation is on the record, not the row */
    expect(screen.queryByTestId(tid.people.invite('CP-1088'))).toBeNull();
    const other = userBy(OTHER);
    expect(screen.queryByTestId(tid.ausers.row(other.id))).toBeNull();
    expect(screen.queryByTestId(tid.ausers.noRecord(other.id))).toBeNull();
    expect(table).not.toHaveTextContent(other.email);
    expect(listed().every(r => r?.startsWith(tid.employees.row('')))).toBe(true);
    /* the count is the records' alone: no login is added to it */
    const records = Object.keys(store.coll('employees')).length;
    expect(screen.getByTestId(tid.employees.count)).toHaveTextContent(`${listed().length} of ${records}`);
  });

  test('the Status column marks a login switched off, and the one to act on: a leaver who can still sign in; Hours has a column', async () => {
    userBy(MARCUS).status = 'Inactive';
    employeeOf('CP-1042').state = 'leaver';
    await open();
    expect(mark('CP-1088')).toHaveAttribute('data-login', 'off');
    expect(mark('CP-1088')).toHaveTextContent('Portal login switched off');
    await pick(tid.employees.stateFilter, 'all');
    await waitFor(() => expect(mark('CP-1042')).toHaveAttribute('data-login', 'risk'));
    expect(mark('CP-1042')).toHaveTextContent('Has left and can still sign in to the portal');
    expect(screen.getByTestId(tid.employees.row('CP-1042'))).toHaveTextContent('37.5 h');
  });

  test('the portal login filter: active, inactive or pending, admins, or nobody with a login', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    await pick(tid.employees.loginFilter, 'none');
    expect(listed()).toEqual([tid.employees.row('CP-1088')]);
    await pick(tid.employees.loginFilter, 'admin');
    expect(listed()).toContain(tid.employees.row('CP-1002'));
    expect(listed()).not.toContain(tid.employees.row('CP-1042'));
    await pick(tid.employees.loginFilter, 'inactive');
    expect(listed()).toContain(tid.employees.row('CP-1503'));
    expect(listed()).not.toContain(tid.employees.row('CP-1042'));
  });

  /* the logins-only list still lists it: the two gates' "isAdmin without master_data" test */
  test('no portal login filter brings a login without a record into the one table', async () => {
    await open();
    const other = userBy(OTHER);
    for (const f of ['active', 'admin', 'inactive', 'all'] as const) {
      await pick(tid.employees.loginFilter, f);
      expect(screen.queryByTestId(tid.ausers.row(other.id))).toBeNull();
      expect(listed().every(r => r?.startsWith(tid.employees.row('')))).toBe(true);
    }
  });

  test('Invite on a record with no login opens the add form, filled in from the record, adds the login, and the row is marked invited', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    await userEvent.click(screen.getByTestId(tid.employees.open('CP-1088')));
    await userEvent.click(await screen.findByTestId(tid.people.recordInvite));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Marcus Reilly');
    expect(screen.getByTestId(tid.ausers.email)).toHaveValue(MARCUS);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls('POST /bc/portalUsers')[0]?.body).toBe(`{"name":"Marcus Reilly","email":"${MARCUS}","role":"User","isAdmin":false}`);
    await waitFor(() => expect(mark('CP-1088')).toHaveAttribute('data-login', 'sent'));
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('a record opens with its portal login: status, last login and the login\'s menu', async () => {
    await open();
    const amara = userBy(AMARA);
    await userEvent.click(screen.getByTestId(tid.employees.open('CP-1042')));
    expect(await screen.findByTestId(tid.employee.record)).toHaveTextContent('Amara Okafor');
    expect(screen.getByTestId(tid.people.recordPortal)).toContainElement(screen.getByTestId(tid.ausers.status(amara.id)));
    expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Active');
    expect(screen.getByTestId(tid.ausers.lastLogin(amara.id))).toHaveTextContent(/^\d{2} [A-Z][a-z]{2} 2026$/);
    expect(screen.queryByTestId(tid.employee.fact('lastLogin'))).toBeNull();
    expect(screen.getByTestId(tid.ausers.menu(amara.id))).toHaveAccessibleName('Portal login actions for Amara Okafor');
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

describe('Setup · Employees: the two gates (N18, D8)', () => {
  test('master_data without isAdmin: the Workforce records alone, and no portal user is read', async () => {
    userBy(DEE).isAdmin = false;
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    await screen.findByTestId(tid.employees.table);
    expect(screen.queryByTestId(tid.ausers.add)).toBeNull();
    expect(screen.queryByTestId(tid.people.portalCol('CP-1042'))).toBeNull();
    expect(within(screen.getByTestId(tid.employees.table)).queryByText('Portal login')).toBeNull();
    expect(screen.queryByTestId(tid.employees.loginFilter)).toBeNull();
    expect(calls('GET /bc/portalUsers')).toEqual([]);
  });

  test('isAdmin without master_data (an employee persona): the portal logins alone, those no record matches included; no Workforce record is read or matched', async () => {
    await openLogins();
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Employees');
    expect(screen.queryByTestId(tid.employees.table)).toBeNull();
    expect(within(screen.getByTestId(tid.ausers.list)).queryByText('No Workforce record')).toBeNull();
    expect(screen.getByTestId(tid.ausers.row(userBy(OTHER).id))).toHaveTextContent(OTHER);
    expect(workforce.filter(w => w.startsWith('GET /api/v1/employees'))).toEqual([]);
    expectTestIdCoverage(document.body);
  });
});

describe('USERS: the logins alone, for a portal admin without master_data', () => {
  test('USERS states: loading, then the list with its tabs, search and Add portal login; a row shows the initial, name, email, last login and badges', async () => {
    userBy(AMARA).isAdmin = true;
    await signInEmail(AMARA);
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    expect(await screen.findByTestId(tid.ausers.loading)).toHaveTextContent('Loading the portal users…');
    await screen.findByTestId(tid.ausers.list);
    expect(screen.getByTestId(tid.ausers.search)).toHaveAttribute('placeholder', 'Search by name or email');
    expect(screen.getByTestId(tid.ausers.add)).toHaveTextContent('Add portal login');
    const dee = userBy(DEE);
    expect(screen.getByTestId(tid.ausers.row(dee.id))).toHaveTextContent('Dee Fitzgerald');
    expect(screen.getByTestId(tid.ausers.row(dee.id))).toHaveTextContent(DEE);
    expect(screen.getByTestId(tid.ausers.status(dee.id))).toHaveTextContent('Active');
    expect(screen.getByTestId(tid.ausers.admin(dee.id))).toHaveTextContent('Admin');
  });

  test('USERS states: a load failure says so, and the empty list offers Clear filters', async () => {
    server.use(http.get(`${BASE}/bc/portalUsers`, () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    userBy(AMARA).isAdmin = true;
    await signInEmail(AMARA);
    renderPage(<AdminEmployeesPage />, '/setup/aemployees');
    expect(await screen.findByTestId(tid.ausers.error)).toHaveTextContent('Failed to load users. Please try again.');
    expect(screen.getByTestId(tid.ausers.empty)).toHaveTextContent('No users found matching your criteria.');
  });

  test('USERS.R2: the tabs filter by status and admin, then a case-insensitive search on name or email', async () => {
    await openLogins();
    const users = bcStore.db.portalUsers;
    const ids = (pred: (u: (typeof users)[number]) => boolean) => users.filter(pred).map(u => tid.ausers.row(u.id));
    expect(loginsListed()).toEqual(ids(() => true));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('inactive')));
    expect(loginsListed()).toEqual(ids(u => u.status !== 'Active'));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('admin')));
    expect(loginsListed()).toEqual(ids(u => u.isAdmin));
    await userEvent.click(screen.getByTestId(tid.ausers.tab('active')));
    await userEvent.type(screen.getByTestId(tid.ausers.search), 'OKAFOR');
    expect(loginsListed()).toEqual(ids(u => u.status === 'Active' && /okafor/i.test(u.name + u.email)));
    expect(loginsListed().length).toBeGreaterThan(0);
  });

  test('USERS.R3: the tab counts are the whole list\'s, whatever the search', async () => {
    await openLogins();
    const users = bcStore.db.portalUsers;
    await userEvent.type(screen.getByTestId(tid.ausers.search), 'nobody-matches-this');
    expect(screen.getByTestId(tid.ausers.tab('all'))).toHaveTextContent(`All users ${users.length}`);
    expect(screen.getByTestId(tid.ausers.tab('active'))).toHaveTextContent(`Active ${users.filter(u => u.status === 'Active').length}`);
    expect(screen.getByTestId(tid.ausers.tab('inactive'))).toHaveTextContent(`Inactive ${users.filter(u => u.status !== 'Active').length}`);
    expect(screen.getByTestId(tid.ausers.tab('admin'))).toHaveTextContent(`Admins ${users.filter(u => u.isAdmin).length}`);
    await userEvent.click(screen.getByTestId(tid.ausers.tab('admin')));
    await userEvent.click(screen.getByTestId(tid.ausers.clear));
    expect(screen.getByTestId(tid.ausers.search)).toHaveValue('');
    expect(screen.getByTestId(tid.ausers.tab('all'))).toHaveAttribute('aria-pressed', 'true');
    expect(loginsListed()).toHaveLength(users.length);
  });
});

/* The one table has no Add portal login: a login is added there through a
   record's Invite, which opens this same form filled in. The form's own
   checks are proven on the logins-only list's Add, which opens it empty. */
describe('USERS: the add form, from the logins-only list\'s Add', () => {
  test('USERS.R6: administrator access makes the role Admin and locks it; unticking leaves Admin and unlocks it', async () => {
    await openLogins();
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
    await openLogins();
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

  test('USERS.R9: Enter in the form and the button run the same checks', async () => {
    await openLogins();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Ann', 'ann@x');
    await userEvent.type(screen.getByTestId(tid.ausers.email), '{Enter}');
    expect(screen.getByTestId(tid.ausers.formError)).toHaveTextContent('Please enter a valid email address.');
    await typeForm('Ann Lee', 'ann.lee@elsewhere.org');
    await userEvent.type(screen.getByTestId(tid.ausers.name), '{Enter}');
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(calls('POST /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R10: a new login is sent sanitised and added at the end of the logins list, and the dialog closes, with no list read', async () => {
    await openLogins();
    const before = loginsListed().length;
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('  <i>Ann</i> Lee ', '  Ann.Lee@Elsewhere.ORG ');
    await userEvent.click(screen.getByTestId(tid.ausers.isAdmin));
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls('POST /bc/portalUsers')[0]?.body).toBe('{"name":"Ann Lee","email":"ann.lee@elsewhere.org","role":"Admin","isAdmin":true}');
    const rows = loginsListed();
    expect(rows).toHaveLength(before + 1);
    const made = userBy('ann.lee@elsewhere.org');
    expect(rows.at(-1)).toBe(tid.ausers.row(made.id));
    /* the fake answers pending: the answer's status wins over Active */
    expect(screen.getByTestId(tid.ausers.status(made.id))).toHaveTextContent('Pending first login');
    expect(screen.getByTestId(tid.ausers.lastLogin(made.id))).toHaveTextContent('Never');
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R11: a refused add keeps the dialog open with what the server said', async () => {
    await openLogins();
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

  test('USERS.R13: Cancel closes the dialog and forgets what was typed', async () => {
    await openLogins();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Half Typed', 'half@x.org');
    await userEvent.click(screen.getByTestId(tid.ausers.cancel));
    expect(screen.queryByTestId(tid.ausers.form)).toBeNull();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('');
    expect(calls('POST /bc/portalUsers')).toEqual([]);
  });

  test('USERS.R14: what is typed survives the list changing behind the dialog', async () => {
    await openLogins();
    await userEvent.click(screen.getByTestId(tid.ausers.add));
    await typeForm('Still Here', 'still@x.org');
    const gone = bcStore.db.portalUsers[0]?.id ?? '';
    expect(screen.getByTestId(tid.ausers.status(gone))).toBeInTheDocument();
    act(() => { queryClient.setQueryData<PortalUserRow[]>(portalUsersKey, list => (list ?? []).slice(1)); });
    /* the list behind the dialog did change */
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.status(gone))).toBeNull());
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Still Here');
    expect(screen.getByTestId(tid.ausers.email)).toHaveValue('still@x.org');
  });
});

describe('USERS: portal logins in the one table, on the record', () => {
  test('USERS.R1: the list is read once when the page opens, and not again after a change', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(userBy(AMARA).id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(userBy(AMARA).id))).toHaveTextContent('Inactive'));
    await new Promise(r => setTimeout(r, 200));
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R4: an administrator cannot be changed; anyone else is activated or deactivated by status, and always edited', async () => {
    userBy(MARCUS).status = 'Inactive';
    await open();
    const dee = userBy(DEE), amara = userBy(AMARA), marcus = userBy(MARCUS), first = userBy(FIRST);
    await openRecord(DEE);
    expect(screen.getByTestId(tid.ausers.locked(dee.id))).toHaveTextContent('Admin logins cannot be changed here');
    expect(screen.queryByTestId(tid.ausers.menu(dee.id))).toBeNull();
    await closeRecord();
    await openRecord(AMARA);
    expect(screen.getByTestId(tid.ausers.menu(amara.id))).toHaveAccessibleName('Portal login actions for Amara Okafor');
    await menu(AMARA);
    expect((await screen.findByRole('menu')).textContent).toBe('Deactivate loginEdit login');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await closeRecord();
    for (const [email, u] of [[MARCUS, marcus], [FIRST, first]] as const) {
      await menu(email);
      expect((await screen.findByRole('menu')).textContent).toBe('Activate loginEdit login');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(screen.getByTestId(tid.ausers.menu(u.id))).toBeInTheDocument();
      await closeRecord();
    }
  });

  test('USERS.R5: deactivate and activate change only that login, in place; a failure says so and changes nothing', async () => {
    await open();
    const amara = userBy(AMARA);
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.deactivate(amara.id)));
    await waitFor(() => expect(screen.getByTestId(tid.ausers.status(amara.id))).toHaveTextContent('Inactive'));
    expect(await calls(`POST /bc/portalUsers/${amara.id}/updateStatus`)[0]?.body).toBe('{"status":"Inactive"}');
    /* the row's mark follows; another row's does not move */
    expect(mark('CP-1042')).toHaveAttribute('data-login', 'off');
    expect(mark('CP-1088')).toHaveAttribute('data-login', 'on');
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
    /* four menu round trips on the 35-row table: about 5s on a loaded machine, so the 5s default made it flaky */
  }, 15_000);

  test('USERS.R5: activating a pending user says "Failed to activate user" when it is refused', async () => {
    server.use(http.post(`${BASE}/bc/portalUsers/:id/updateStatus`, () => HttpResponse.json({ message: 'no' }, { status: 500 })));
    await open();
    const first = userBy(FIRST);
    await menu(FIRST);
    await userEvent.click(await screen.findByTestId(tid.ausers.activate(first.id)));
    expect(await screen.findByTestId(tid.ausers.error)).toHaveTextContent('Failed to activate user. Please try again.');
    expect(screen.getByTestId(tid.ausers.status(first.id))).toHaveTextContent('Pending first login');
    /* said where it was tried: on the record, not behind it */
    expect(screen.getByTestId(tid.employee.record)).toContainElement(screen.getByTestId(tid.ausers.error));
  });

  test('Edit login from the record closes the record first, so one dialog is open at a time', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    await screen.findByTestId(tid.ausers.form);
    await waitFor(() => expect(screen.queryByTestId(tid.employee.record)).toBeNull());
    expectTestIdCoverage(document.body);
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

  test('USERS.R10 in the one table: a login added from a record\'s Invite under an address no record has is not listed, and the count does not move', async () => {
    bcStore.db.portalUsers = bcStore.db.portalUsers.filter(u => u.email !== MARCUS);
    await open();
    const before = listed(), count = screen.getByTestId(tid.employees.count).textContent;
    await userEvent.click(screen.getByTestId(tid.employees.open('CP-1088')));
    await userEvent.click(await screen.findByTestId(tid.people.recordInvite));
    await typeForm('Ann Lee', 'ann.lee@elsewhere.org');
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    const made = userBy('ann.lee@elsewhere.org');
    expect(made.employeeNo).toBe('');
    expect(listed()).toEqual(before);
    expect(screen.queryByTestId(tid.ausers.row(made.id))).toBeNull();
    expect(screen.getByTestId(tid.employees.count).textContent).toBe(count);
    /* the record it was sent from still has none */
    expect(mark('CP-1088')).toHaveAttribute('data-login', 'none');
    expect(calls('GET /bc/portalUsers')).toHaveLength(1);
  });

  test('USERS.R12: a saved edit replaces the login with what was typed and what the server answered; a refusal keeps the dialog open', async () => {
    await open();
    const amara = userBy(AMARA);
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(amara.id)));
    expect(within(formDialog()).getByTestId(tid.modal.title)).toHaveTextContent('Edit user');
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Amara Okafor');
    await typeForm('Amara O. Okafor', AMARA);
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    await waitFor(() => expect(screen.queryByTestId(tid.ausers.form)).toBeNull());
    expect(await calls(`PATCH /bc/portalUsers/${amara.id}`)[0]?.body).toBe(`{"name":"Amara O. Okafor","email":"${AMARA}","role":"Employee","isAdmin":false}`);
    /* the row shows the Workforce record's name; the login keeps what was typed */
    expect(screen.getByTestId(tid.employees.row('CP-1042'))).toHaveTextContent('Amara Okafor');
    expect(screen.getByTestId(tid.employees.row('CP-1042'))).not.toHaveTextContent('Amara O. Okafor');
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(amara.id)));
    expect(screen.getByTestId(tid.ausers.name)).toHaveValue('Amara O. Okafor');
    await userEvent.click(screen.getByTestId(tid.ausers.cancel));
    server.use(http.patch(`${BASE}/bc/portalUsers/:id`, () => HttpResponse.json({ message: 'That email belongs to someone else.' }, { status: 409 })));
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(amara.id)));
    await userEvent.click(screen.getByTestId(tid.ausers.save));
    expect(await screen.findByTestId(tid.ausers.formError)).toHaveTextContent('That email belongs to someone else.');
    expect(screen.getByTestId(tid.ausers.form)).toBeInTheDocument();
  });

  test('USERS.R15: the last login as a day, or Never, on the record', async () => {
    userBy(AMARA).lastLogin = '2026-07-01T09:00:00Z';
    await open();
    await openRecord(AMARA);
    expect(screen.getByTestId(tid.ausers.lastLogin(userBy(AMARA).id))).toHaveTextContent('01 Jul 2026');
    await closeRecord();
    await openRecord(FIRST);
    expect(screen.getByTestId(tid.ausers.lastLogin(userBy(FIRST).id))).toHaveTextContent('Never');
  });

  test('USERS.R16: the edit dialog opens only for a chosen user, and names them', async () => {
    await open();
    expect(screen.queryByTestId(tid.ausers.form)).toBeNull();
    await menu(AMARA);
    expect(screen.queryByTestId(tid.ausers.form)).toBeNull();
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    expect(formDialog()).toHaveTextContent(AMARA);
  });

  test('USERS edit: a role QniConnect\'s form does not list is shown as it is, never silently changed', async () => {
    await open();
    await menu(AMARA);
    await userEvent.click(await screen.findByTestId(tid.ausers.edit(userBy(AMARA).id)));
    expect(screen.getByTestId(tid.ausers.role)).toHaveTextContent('Employee');
  });
});
