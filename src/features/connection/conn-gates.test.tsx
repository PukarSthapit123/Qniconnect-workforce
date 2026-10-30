/* The two admin gates through the whole app (spec N18, Review focus 4,
   inventory ADM.ROUTES): isAdmin from the portal check opens Setup ›
   Business Central and nothing else; Workforce capabilities open the
   Workforce setup pages and nothing else. Plus where an admin lands, and the
   development picker's suggestion for a portal admin it cannot match. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { setAuth } from '@/auth';
import { tid } from '@/testids';
import { App } from '@/App';
import { bcStore } from '@/mocks/bc/seed';
import { store } from '@/mocks/store';
import { accountOf, fault, resetTo, setSeedEnvironment, setStubAccount, testAuth } from '@/test/api-helpers';

const BASE = (import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
const AMARA = 'amara.okafor@brightpath.org';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  resetTo('social'); bcStore.reset();
  setAuth(testAuth);
});
afterEach(() => { server.resetHandlers(); server.events.removeAllListeners(); });

const portalAdmin = (email: string, isAdmin: boolean) => {
  const u = bcStore.userByEmail(email);
  if (!u) throw new Error(`no portal user ${email}`);
  u.isAdmin = isAdmin;
};
const open = (email: string, path: string) => {
  setStubAccount(email); setSeedEnvironment();
  window.history.replaceState(null, '', path);
  return render(<App />);
};
const sections = async () => {
  await screen.findByTestId(tid.page('asetup'));
  return [...document.querySelectorAll('[data-testid^="setup-card-"]')].map(e => e.getAttribute('data-testid'));
};

describe('Review focus 4: the two admin sources disagree', () => {
  test('isAdmin with an employee persona: lands on the overview, and Setup holds the QniConnect pages only (Business Central, and Setup · Employees for its portal logins)', async () => {
    portalAdmin(AMARA, true);
    open(AMARA, '/');
    expect(await screen.findByTestId(tid.page('aoverview'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/setup/aoverview');
    expect(screen.getByTestId(tid.nav.group('work'))).toBeInTheDocument();
    window.history.replaceState(null, '', '/setup/asetup');
    window.dispatchEvent(new PopStateEvent('popstate'));
    /* Task 20: the Employees section holds Setup · Employees alone (its portal half) */
    expect(await sections()).toEqual([tid.setup.card('conn'), tid.setup.card('employees')]);
    /* the audit log is not theirs, so neither are its recent changes */
    expect(screen.queryByTestId(tid.setup.recent)).toBeNull();
  });

  test('isAdmin with an employee persona: a Workforce setup page typed by hand is unavailable', async () => {
    portalAdmin(AMARA, true);
    open(AMARA, '/setup/aorg');
    const un = await screen.findByTestId(tid.unavailable.root);
    expect(un).toHaveAttribute('data-known', 'true');
    expect(un).toHaveTextContent('Organisation is not available to you.');
  });

  test('an admin persona without isAdmin: the Workforce setup pages, no Business Central section, and /setup/aenv typed by hand is unavailable', async () => {
    const dee = accountOf('admin').email;
    portalAdmin(dee, false);
    open(dee, '/setup/aenv');
    const un = await screen.findByTestId(tid.unavailable.root);
    expect(un).toHaveAttribute('data-known', 'true');
    expect(un).toHaveTextContent('Environments is not available to you.');
    expect(screen.queryByTestId(tid.page('aenv'))).toBeNull();
    window.history.replaceState(null, '', '/setup/asetup');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await sections()).toEqual(['org', 'mods', 'employees', 'gov', 'int'].map(k => tid.setup.card(k)));
  });

  /* Task 20 review: the same disagreement on Setup · Employees, through the
     whole app: the admin persona keeps the Workforce records, and without
     isAdmin there is no portal logins panel, no portal column, and no
     /bc/portalUsers read at all (N18). */
  test('an admin persona without isAdmin: Setup · Employees shows the Workforce records only, and reads no portal users', async () => {
    const reads: string[] = [];
    server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname.includes('/bc/portalUsers') && request.method === 'GET') reads.push(request.url); });
    const dee = accountOf('admin').email;
    portalAdmin(dee, false);
    open(dee, '/setup/aemployees');
    const table = await screen.findByTestId(tid.employees.table);
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1));
    expect(screen.queryByTestId(tid.ausers.panel)).toBeNull();
    expect(screen.queryByTestId(tid.ausers.list)).toBeNull();
    expect(document.querySelectorAll('[data-testid^="people-portal-"]')).toHaveLength(0);
    expect(within(table).queryByText('Portal login')).toBeNull();
    expect(reads).toEqual([]);
  });

  test('ADM.ROUTES.R3: an employee who is not a portal admin types an admin address: unavailable, not sent elsewhere', async () => {
    for (const path of ['/setup/aoverview', '/setup/aauth', '/setup/asettings']) {
      const { unmount } = open(accountOf('employee').email, path);
      expect(await screen.findByTestId(tid.unavailable.root)).toHaveAttribute('data-known', 'true');
      expect(window.location.pathname).toBe(path);
      unmount();
    }
  });
});

describe('ADM.ROUTES and the landing page', () => {
  test('ADM.ROUTES.R7 and spec section 8: a portal admin lands on Setup › Business Central › Overview; its strip holds the four pages', async () => {
    open(accountOf('admin').email, '/');
    expect(await screen.findByTestId(tid.page('aoverview'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/setup/aoverview');
    const strip = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(strip).getAllByRole('link').map(a => a.textContent)).toEqual(['‹ All setup', 'Overview', 'Environments', 'Authorization', 'Settings']);
  });

  test('ADM.ROUTES.R1 and ADM.ROUTES.R4: isAdmin must be exactly true; each page has its route', async () => {
    server.use(http.post(`${BASE}/bc/portalUsers/verify`, () => HttpResponse.json({ exists: true, isActive: true,
      userData: { id: 'pu-x', email: accountOf('employee').email, name: 'Amara', status: 'Active', registrationId: 'REG-DEMO-0001', employeeNo: 'CP-1042' } })));
    open(accountOf('employee').email, '/');
    expect(await screen.findByTestId(tid.page('home'))).toBeInTheDocument();
    server.resetHandlers();
    for (const view of ['aoverview', 'aenv', 'aauth', 'asettings']) {
      const { unmount } = open(accountOf('admin').email, `/setup/${view}`);
      expect(await screen.findByTestId(tid.page(view))).toBeInTheDocument();
      unmount();
    }
  });

  /* Task 19 review: while looking at the app as someone else their portal
     access is not known, so Business Central setup is not shown (shellData.tsx
     isPortalAdmin, !session.viewingAs); ending the view brings it back. */
  test('ADM.ROUTES: viewing as someone else hides Business Central setup; ending the view brings it back', async () => {
    const go = (path: string) => { window.history.replaceState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
    open(accountOf('admin').email, '/setup/aoverview');
    await screen.findByTestId(tid.page('aoverview'));
    expect(screen.getByTestId(tid.nav.tab('aenv'))).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(tid.shell.account));
    await userEvent.click(await screen.findByTestId(tid.shell.viewAs(accountOf('manager').employeeCode)));
    await screen.findByTestId(tid.shell.viewAsEnd);
    for (const view of ['aoverview', 'aenv', 'aauth', 'asettings']) {
      go(`/setup/${view}`);
      expect(await screen.findByTestId(tid.unavailable.root)).toHaveAttribute('data-known', 'true');
      expect(screen.queryByTestId(tid.page(view))).toBeNull();
      expect(screen.queryByTestId(tid.nav.tab(view))).toBeNull();
    }
    await userEvent.click(screen.getByTestId(tid.shell.account));
    await userEvent.click(await screen.findByTestId(tid.shell.menuViewAsEnd));
    await waitFor(() => expect(screen.queryByTestId(tid.shell.viewAsEnd)).toBeNull());
    go('/setup/aoverview');
    expect(await screen.findByTestId(tid.page('aoverview'))).toBeInTheDocument();
    expect(screen.getByTestId(tid.nav.tab('aenv'))).toBeInTheDocument();
  });

  test('Review focus 1: after a reload of an admin page, isAdmin is asked again before the page renders', async () => {
    let verified = 0;
    server.events.on('request:start', ({ request }) => { if (new URL(request.url).pathname.endsWith('/bc/portalUsers/verify')) verified++; });
    open(accountOf('admin').email, '/setup/aenv');
    await screen.findByTestId(tid.page('aenv'));
    expect(verified).toBe(1);
    expect(localStorage.getItem('isAdmin')).toBeNull();
    expect(JSON.parse(localStorage.getItem('currentUser') ?? '{}')).not.toHaveProperty('isAdmin');
  });
});

/* QniConnect's AdminLayout is not ported: the Workforce shell is the frame
   (spec N2, section 8). Each of its rules, and where it went. */
describe('ADM.LAYOUT: the admin pages sit in the shell', () => {
  test('ADM.LAYOUT.R1 to R4, R6, R7, R8 and R11: the four pages in the strip in order, the page you are on marked, the active environment on the overview, Sign out in the account menu, no search stub, no "Admin Portal" or 2025 footer', async () => {
    open(accountOf('admin').email, '/setup/aenv');
    await screen.findByTestId(tid.page('aenv'));
    const strip = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(strip).getAllByRole('link').map(a => a.textContent).slice(1)).toEqual(['Overview', 'Environments', 'Authorization', 'Settings']);
    expect(within(strip).getByTestId(tid.nav.tab('aenv'))).toHaveAttribute('aria-current', 'page');
    expect(within(strip).getByTestId(tid.nav.tab('asettings'))).toHaveAttribute('href', '/setup/asettings');
    expect(screen.getByRole('heading', { level: 1 }).firstChild?.textContent).toBe('Environments');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByPlaceholderText(/Search users, environments/)).toBeNull();
    expect(document.body).not.toHaveTextContent(/Admin Portal|© 2025/);
    expect(screen.getByTestId(tid.shell.account)).toBeInTheDocument();
    window.history.replaceState(null, '', '/setup/aoverview');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByTestId(tid.aoverview.stat('environment'))).toHaveTextContent('Production');
  });

  test('ADM.LAYOUT.R5 and R9: "Switch to User Portal" is no longer needed: a portal admin with their own pages has My Work in the same bar', async () => {
    portalAdmin(AMARA, true);
    open(AMARA, '/setup/aoverview');
    await screen.findByTestId(tid.page('aoverview'));
    expect(screen.getByTestId(tid.nav.group('work'))).toHaveAttribute('href', '/work/home');
    expect(screen.getByTestId(tid.nav.group('setup'))).toBeInTheDocument();
  });
});

describe('N18: the development picker and a portal admin it cannot match', () => {
  test('the portal check says admin: the picker leads with the admins and suggests the first, focused', async () => {
    server.use(http.post(`${BASE}/bc/portalUsers/verify`, () => HttpResponse.json({ exists: true, isActive: true, userData: { isAdmin: true, email: 'boss@contoso.com' } })));
    setStubAccount('boss@contoso.com');
    window.history.replaceState(null, '', '/');
    render(<App />);
    const suggested = await screen.findByTestId(tid.devSignIn.suggested);
    expect(window.location.search).toBe('?unmatched=1&admin=1');
    const firstAdmin = Object.values(store.coll<{ email: string; userType: string }>('accounts')).find(a => a.userType === 'admin');
    if (!firstAdmin) throw new Error('no seed admin');
    const button = screen.getByTestId(tid.devSignIn.account(firstAdmin.email));
    expect(button).toContainElement(suggested);
    await waitFor(() => expect(button).toHaveFocus());
    expect(screen.getByTestId(tid.devSignIn.unmatched)).toHaveTextContent('Business Central says you are a portal administrator, so a sample admin is suggested.');
    const groups = [...document.querySelectorAll('[data-testid^="dev-sign-in-group-"]')].map(e => e.getAttribute('data-testid'));
    expect(groups[0]).toBe(tid.devSignIn.group('admin'));
  });

  /* final review M3: a retry after the Workforce session failed keeps what
     the portal check said. A seed admin (a portal admin) whose session fails,
     and whose account is gone by the retry, is unmatched: the picker still
     suggests an admin. */
  test('after a failed Workforce session and a retry, the picker still suggests an admin', async () => {
    const dee = accountOf('admin');
    await fault('GET', '/api/v1/session', 500);
    open(dee.email, '/');
    const retry = await screen.findByTestId(tid.shell.retry);
    /* her account is no longer a seed account by the retry */
    for (const a of Object.values(store.coll<{ email: string }>('accounts'))) if (a.email === dee.email) a.email = 'moved.on@brightpath.org';
    await userEvent.click(retry);
    expect(await screen.findByTestId(tid.devSignIn.suggested)).toBeInTheDocument();
    expect(window.location.search).toBe('?unmatched=1&admin=1');
  });

  test('not a portal admin (or no portal user): no suggestion, groups in their usual order', async () => {
    setStubAccount('somebody@contoso.com');
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByTestId(tid.devSignIn.unmatched)).not.toHaveTextContent('portal administrator');
    expect(window.location.search).toBe('?unmatched=1');
    await screen.findByTestId(tid.devSignIn.group('employee'));
    expect(screen.queryByTestId(tid.devSignIn.suggested)).toBeNull();
    const groups = [...document.querySelectorAll('[data-testid^="dev-sign-in-group-"]')].map(e => e.getAttribute('data-testid'));
    expect(groups[0]).toBe(tid.devSignIn.group('employee'));
  });
});
