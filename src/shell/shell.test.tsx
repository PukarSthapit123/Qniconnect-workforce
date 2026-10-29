import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/query';
import { ShellView, isHere, roleLabelOf, stripTabsFor } from './Shell';
import { emptyInbox } from './Inbox';
import { buildNav } from '@/domain/nav';
import { expectTestIdCoverage } from '@/test/testid-coverage';
import { tid } from '@/testids';
import type { MenuAccount } from './AccountMenu';

const menuAccount = (name: string): MenuAccount => ({ name, email: 'someone@example.org', employeeCode: 'CP-0001', roleName: 'Admin', roleDescription: 'Configure how this workforce operates', locationName: 'Head office' });

test('the shell has full test id coverage for a manager', () => {
  const nav = buildNav({ caps: new Set(['own_home', 'team_ts', 'team_employees']), modules: { TS: true, A: true, CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/work/home']}>
    <ShellView nav={nav} roleLabel="Manager" viewingAs={null} account={menuAccount('Rachel Hussain')} inbox={emptyInbox(2)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  expectTestIdCoverage();
});

/* Spec §6: "The role pill shows the account's role, and says so while viewing
   as someone else." Ported from the prototype (qnipay-workforce-v15.html:
   10605-10608: the `.viewing` toggle and the composed title) and CSS
   (html:1164, `.rolepill.viewing{opacity:.85;border-style:dashed}`). */
test('viewing as someone else shows a dashed role pill naming both employees, a way back, and full test id coverage', () => {
  const nav = buildNav({ caps: new Set(['own_home']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/work/home']}>
    <ShellView nav={nav} roleLabel="Employee" viewingAs="Amara Okafor" account={menuAccount('Priya Shah')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByTestId(tid.shell.viewAsEnd)).toBeInTheDocument();
  expect(screen.getByText(/Amara Okafor/)).toBeInTheDocument();
  const pill = screen.getByTestId(tid.shell.rolePill);
  expect(pill).toHaveTextContent('Employee');
  expect(pill.className).toMatch(/border-dashed/);
  expect(pill.className).toMatch(/opacity-85/);
  expect(pill).toHaveAttribute('title', 'Looking at the app as Amara Okafor · your account is Priya Shah');
  expectTestIdCoverage();
});

test('not viewing as anyone shows a plain role pill with no title and no dashed style', () => {
  const nav = buildNav({ caps: new Set(['own_home']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/work/home']}>
    <ShellView nav={nav} roleLabel="Employee" viewingAs={null} account={menuAccount('Priya Shah')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  const pill = screen.getByTestId(tid.shell.rolePill);
  expect(pill).not.toHaveAttribute('title');
  expect(pill.className).not.toMatch(/border-dashed/);
});

/* Plan review focus: a valid session whose capabilities resolve to nothing
   (e.g. everything revoked) must not render an empty shell. It gets a clear
   page saying there is nothing to open and what to do, while the header
   (account menu, sign-out) stays reachable. */
test('an account with no reachable capability sees a clear page, not an empty shell', () => {
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/']}>
    <ShellView nav={[]} roleLabel="Employee" viewingAs={null} account={menuAccount('Priya Shah')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByTestId(tid.page('none'))).toHaveTextContent(/administrator/i);
  expect(screen.getByTestId(tid.shell.account)).toBeInTheDocument();
  expectTestIdCoverage();
});

/* Item 4: setup is sectioned, not one flat strip. Inside a section the strip
   shows a "‹ All setup" way back plus that section's own pages, and every
   page it can reach still carries full test id coverage. */
test('inside a setup section the strip shows a way back plus that section\'s pages, with full test id coverage', () => {
  const nav = buildNav({ caps: new Set(['perm_cfg', 'framework']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/setup/aperm']}>
    <ShellView nav={nav} roleLabel="Admin" viewingAs={null} account={menuAccount('Dee Fitzgerald')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByTestId(tid.nav.tab('asetup'))).toHaveTextContent(/All setup/);
  expect(screen.getByTestId(tid.nav.tab('aperm'))).toBeInTheDocument();
  expect(screen.getByTestId(tid.nav.tab('anotif'))).toBeInTheDocument();
  expect(screen.getByTestId(tid.nav.tab('aappr'))).toBeInTheDocument();
  expect(screen.queryByTestId(tid.nav.tab('aorg'))).not.toBeInTheDocument();
  expectTestIdCoverage();
});

/* Rendering ShellView all the way to the 'asetup' route would mount the real
   SetupIndex, which needs a full SessionProvider; that belongs to
   shell-data.test.tsx. This checks the same rule at the level it actually
   lives: the pure helper Shell.tsx uses to decide what the strip shows. */
test('at the setup index the strip holds the index tab alone, as in the prototype (SetupIndex itself shows the section cards)', () => {
  const nav = buildNav({ caps: new Set(['perm_cfg']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  const setup = nav.find(g => g.key === 'setup');
  if (!setup) throw new Error('expected a setup group to exist for this capability set');
  expect(stripTabsFor(setup, '/setup/asetup').map(t => [t.view, t.label])).toEqual([['asetup', 'Setup']]);
});

/* MANAGER NAV GROUPED BY MODULE: "The secondary strip stays scannable"
   (prototype: `#tabs>button,#tabs>.tabgrp).length<=7`, "the strip carries
   five items, not twelve: two pages and three headings"). Consecutive tabs
   sharing a `group` collapse into one dropdown trigger (TabStrip's `runs`),
   so a manager holding every team capability still sees a handful of
   top-level items, not one per page. */
test('the manager strip stays scannable: a handful of top-level items, not one per page', () => {
  const nav = buildNav({
    caps: new Set(['own_home', 'team_ts', 'team_employees', 'onb_track']),
    modules: { CORE: true, TS: true, A: true, ON: true }, flags: {}, onboarding: false, portalAdmin: false
  });
  /* on Onboarding: the strip is the subject, and Team Home now reads the session */
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/team/tonb']}>
    <ShellView nav={nav} roleLabel="Manager" viewingAs={null} account={menuAccount('Rachel Hussain')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  const strip = screen.getByRole('navigation', { name: 'Pages' });
  const topLevel = within(strip).getAllByTestId(/^nav-(tab|menu)-/);
  expect(topLevel.length).toBeLessThanOrEqual(7);
});

/* MANAGER NAV GROUPED BY MODULE: "A page inside a menu still marks its
   heading as current". */
test('a page inside a menu still marks its heading as current', () => {
  const nav = buildNav({ caps: new Set(['own_home', 'team_ts', 'team_employees', 'onb_track']), modules: { CORE: true, TS: true, A: true, ON: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/team/tonb']}>
    <ShellView nav={nav} roleLabel="Manager" viewingAs={null} account={menuAccount('Rachel Hussain')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByTestId(tid.nav.menu('employees')).className).toMatch(/font-semibold/);
});

/* The module drill-in (v15:4059-4076, suite S:3051-3060): opening a module
   gives a way back to the module list, the module's features, and its setup
   page when this employee can reach it; the way back is never the current page. */
test('inside a module the strip reads All modules, then its features, then its setup page', () => {
  const nav = buildNav({ caps: new Set(['mod_cfg', 'onb_cfg']), modules: { CORE: true, TS: true, A: true, ON: true }, flags: {}, onboarding: false, portalAdmin: false });
  const setup = nav.find(g => g.key === 'setup');
  if (!setup) throw new Error('expected a setup group');
  const strip = stripTabsFor(setup, '/setup/amods', '?m=ON');
  expect(strip.map(t => t.label)).toEqual(['‹ All modules', 'Onboarding features', 'Onboarding setup']);
  expect(strip.map(t => t.path)).toEqual(['/setup/amods', '/setup/amods?m=ON', '/setup/monb']);
  expect(strip.map(t => isHere(t, '/setup/amods?m=ON'))).toEqual([false, true, false]);
  expect(stripTabsFor(setup, '/setup/amods', '?m=CORE').map(t => t.label)).toEqual(['‹ All modules', 'QniConnect features']);
  expect(stripTabsFor(setup, '/setup/amods').map(t => t.label)).toEqual(['‹ All setup', 'Modules & features']);
});

/* ADMIN LAYOUT (suite S:3051-3060): a module's setup page is inside its drill-in,
   "‹ All modules | Timesheet features | Timesheet setup", the setup page the
   one on screen, and the way back returns to the module list. */
test('on a module setup page (mts, monb) the strip is that module’s drill-in, with the setup page current', () => {
  const nav = buildNav({ caps: new Set(['mod_cfg', 'onb_cfg']), modules: { CORE: true, TS: true, A: true, ON: true }, flags: {}, onboarding: false, portalAdmin: false });
  const setup = nav.find(g => g.key === 'setup');
  if (!setup) throw new Error('expected a setup group');
  const cases = [['/setup/mts', 'TS', ['‹ All modules', 'Timesheet features', 'Timesheet setup']],
    ['/setup/monb', 'ON', ['‹ All modules', 'Onboarding features', 'Onboarding setup']]] as const;
  for (const [path, code, labels] of cases) {
    const strip = stripTabsFor(setup, path);
    expect(strip.map(t => t.label)).toEqual(labels);
    expect(strip.map(t => t.path)).toEqual(['/setup/amods', `/setup/amods?m=${code}`, path]);
    expect(strip.map(t => isHere(t, path))).toEqual([false, false, true]);
  }
});

test('the strip on a module setup page renders the drill-in tabs, the setup page marked current', () => {
  const nav = buildNav({ caps: new Set(['mod_cfg', 'onb_cfg']), modules: { CORE: true, TS: true, A: true, ON: true }, flags: {}, onboarding: false, portalAdmin: false });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/setup/amods?m=ON']}>
    <ShellView nav={nav} roleLabel="Admin" viewingAs={null} account={menuAccount('Dee Fitzgerald')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
  const strip = screen.getByRole('navigation', { name: 'Pages' });
  expect(within(strip).getAllByRole('link').map(a => a.textContent)).toEqual(['‹ All modules', 'Onboarding features', 'Onboarding setup']);
  expect(within(strip).getByRole('link', { name: 'Onboarding setup' })).toHaveAttribute('href', '/setup/monb');
  expect(within(strip).getByRole('link', { name: 'Onboarding features' })).toHaveAttribute('aria-current', 'page');
});

/* 1c follow-up from group 2 (D11): the role pill shows the renamed role,
   the viewed employee's own while viewing as someone, never the raw user type. */
test('the role pill shows the renamed role, the viewed employee\'s while viewing as someone', () => {
  const account = { email: 'a@example.org', userType: 'admin' as const, employeeCode: 'CP-0001', name: 'Dee', roleName: 'Administrator', roleDescription: '', locationName: '' };
  expect(roleLabelOf({ account })).toBe('Administrator');
  expect(roleLabelOf({ account, viewingAs: { employeeCode: 'CP-0002', name: 'Amara Okafor', userType: 'employee', roleName: 'Colleague' } })).toBe('Colleague');
  expect(roleLabelOf({ account: { ...account, roleName: '' } })).toBe('Admin');
});

/* MOBILE FOUNDATION (suite S:1739-1790) and the bar itself (v15:10648-10661):
   the phone's bottom bar is painted from the strip's own array, at most five
   items, four destinations and More when there are more, each a glyph over
   the first word of its name; More is lit while the page on screen is one the
   bar has no room for, and opens "Go to", every page of the strip with
   Current against the one you are on. */
const renderAt = (nav: ReturnType<typeof buildNav>, path: string) =>
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}>
    <ShellView nav={nav} roleLabel="Employee" viewingAs={null} account={menuAccount('Amara Okafor')} inbox={emptyInbox(0)} onSignOut={() => {}} onEndViewAs={() => {}} /></MemoryRouter></QueryClientProvider>);
const bar = () => screen.getByRole('navigation', { name: 'Quick pages' });
const barItems = () => within(bar()).getAllByRole('link').concat(within(bar()).queryAllByRole('button'));
/* Each item's icon (from the shared set, named by its lucide class) and its short name. */
const glyphAndName = (a: Element) => [a.querySelector('svg')?.classList[1], a.textContent];

/* No persona overflows the bar today: an employee's work group and a manager's
   team group hold four tabs each, and no setup section has more than five
   pages with its way back. The More button, the Go to sheet and the overflow
   rule are Shell logic that must stay tested, so the cases below that need an
   overflow run on a synthetic nav: one work group of seven pages. */
const managerNav = () => buildNav({ caps: new Set(['own_home', 'team_ts', 'team_employees', 'onb_track']),
  modules: { CORE: true, TS: true, A: true, ON: true }, flags: { DOCS: true }, onboarding: false, portalAdmin: false });
const tabOf = (view: string, label: string) => ({ view, label, path: `/work/${view}`, built: true });
const BIG_TABS = [['alpha', 'Alpha desk'], ['bravo', 'Bravo'], ['charlie', 'Charlie'], ['delta', 'Delta'], ['echo', 'Echo'], ['foxtrot', 'Foxtrot'], ['golf', 'Golf']] as const;
const bigNav = () => [{ key: 'work' as const, label: 'My Work', tabs: BIG_TABS.map(([v, l]) => tabOf(v, l)) }];

test('employee: all five destinations fit on the bar, with their glyphs and short names, and no More', () => {
  const nav = buildNav({ caps: new Set(['own_home', 'own_ts']),
    modules: { CORE: true, TS: true, A: true }, flags: { DOCS: true }, onboarding: false, portalAdmin: false });
  renderAt(nav, '/work/docs');
  const links = within(bar()).getAllByRole('link');
  expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['Home', 'My Calendar', 'Timesheet', 'Profile', 'Documents']);
  /* My Calendar's short name is Calendar, not the first word */
  expect(links.map(glyphAndName)).toEqual([['lucide-house', 'Home'], ['lucide-calendar-days', 'Calendar'], ['lucide-clock', 'Timesheet'], ['lucide-user', 'Profile'], ['lucide-file-text', 'Documents']]);
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
  expect(links.filter(a => a.hasAttribute('aria-current')).map(a => a.getAttribute('aria-label'))).toEqual(['Documents']);
  /* every name fits an equal column: the columns stay equal */
  expect(links.some(a => a.className.includes('flex-[1_1_auto]'))).toBe(false);
});

test('manager: all four team destinations fit on the bar, with their glyphs and short names, and no More', () => {
  const nav = managerNav();
  renderAt(nav, '/team/tonb');
  const links = within(bar()).getAllByRole('link');
  expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['Team Home', 'Approvals', 'Employees', 'Onboarding']);
  expect(links.map(glyphAndName)).toEqual([['lucide-house', 'Team'], ['lucide-clock', 'Approvals'], ['lucide-users', 'Employees'], ['lucide-list-checks', 'Onboarding']]);
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
  expect(links.filter(a => a.hasAttribute('aria-current')).map(a => a.getAttribute('aria-label'))).toEqual(['Onboarding']);
});

test('admin: inside a setup section the bar holds the way back and that section’s pages, with no More when they fit', () => {
  const nav = buildNav({ caps: new Set(['framework', 'mod_cfg']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: false });
  renderAt(nav, '/setup/mpay');
  const links = within(bar()).getAllByRole('link');
  expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['‹ All setup', 'Pay codes', 'Audit log']);
  expect(links.map(glyphAndName)).toEqual([['lucide-layout-grid', '‹'], ['lucide-layout-grid', 'Pay'], ['lucide-layout-grid', 'Audit']]);
  expect(screen.getByTestId(tid.nav.bottom('mpay'))).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
});

/* Task 19 carry-in, Ruling U1: at 390px each of five equal items is about
   74px wide, and "Environments" and "Authorization" were cut short. The
   names stay plain whole words: a bar holding a name longer than ten
   letters sizes its columns to their names and shares the rest, so the short
   ones give room to the long ones. (e2e/visual-qc.spec.ts checks no label is
   cut at 390px.) */
test('admin in Business Central: the bar holds the way back and its four pages, Environments and Authorization whole, in columns sized to them', () => {
  const nav = buildNav({ caps: new Set(['framework']), modules: { CORE: true }, flags: {}, onboarding: false, portalAdmin: true });
  renderAt(nav, '/setup/asettings');
  const links = within(bar()).getAllByRole('link');
  expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['‹ All setup', 'Overview', 'Environments', 'Authorization', 'Settings']);
  expect(links.map(glyphAndName)).toEqual([['lucide-layout-grid', '‹'], ['lucide-gauge', 'Overview'], ['lucide-server', 'Environments'], ['lucide-key-round', 'Authorization'], ['lucide-settings', 'Settings']]);
  expect(links.every(a => a.className.includes('flex-[1_1_auto]'))).toBe(true);
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
});

test('a group of more than five pages: four destinations, then More, which is lit on a page the bar has no room for', () => {
  renderAt(bigNav(), '/work/foxtrot');
  const links = within(bar()).getAllByRole('link');
  expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['Alpha desk', 'Bravo', 'Charlie', 'Delta']);
  expect(links.map(glyphAndName)).toEqual([['lucide-layout-grid', 'Alpha'], ['lucide-layout-grid', 'Bravo'], ['lucide-layout-grid', 'Charlie'], ['lucide-layout-grid', 'Delta']]);
  expect(barItems()).toHaveLength(5);
  const more = screen.getByTestId(tid.nav.more);
  expect(more).toHaveAccessibleName('More sections');
  expect(more.className).toMatch(/text-brand/);
  expect(links.every(a => !a.hasAttribute('aria-current'))).toBe(true);
});

test('exactly five pages fit the bar whole; a sixth brings More', () => {
  const five = [{ key: 'work' as const, label: 'My Work', tabs: BIG_TABS.slice(0, 5).map(([v, l]) => tabOf(v, l)) }];
  const view = renderAt(five, '/work/echo');
  expect(within(bar()).getAllByRole('link')).toHaveLength(5);
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
  view.unmount();
  const six = [{ key: 'work' as const, label: 'My Work', tabs: BIG_TABS.slice(0, 6).map(([v, l]) => tabOf(v, l)) }];
  renderAt(six, '/work/echo');
  expect(within(bar()).getAllByRole('link')).toHaveLength(4);
  expect(screen.getByTestId(tid.nav.more)).toBeInTheDocument();
});

test('More opens Go to, listing every page of the strip with Current against the one on screen, and choosing one closes it', async () => {
  renderAt(bigNav(), '/work/bravo');
  await userEvent.click(screen.getByTestId(tid.nav.more));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByTestId(tid.modal.title)).toHaveTextContent('Go to');
  const rows = within(screen.getByTestId(tid.nav.goToList)).getAllByRole('listitem');
  /* each row is one link: the page's name, then its Current or Open tag */
  expect(rows.map(r => r.querySelector('a')?.firstChild?.textContent)).toEqual(BIG_TABS.map(([, l]) => l));
  expect(screen.getByTestId(tid.nav.goTo('bravo'))).toHaveTextContent('Current');
  expect(screen.getByTestId(tid.nav.goTo('bravo'))).toHaveAttribute('aria-current', 'page');
  expect(screen.getByTestId(tid.nav.goTo('golf'))).toHaveTextContent('Open');
  expect(screen.getByTestId(tid.nav.goTo('golf'))).toHaveAccessibleName('Open Golf');
  expectTestIdCoverage();
  await userEvent.click(screen.getByTestId(tid.nav.goTo('echo')));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByTestId(tid.nav.bottom('bravo'))).not.toHaveAttribute('aria-current');
  await userEvent.click(screen.getByTestId(tid.nav.more));
  expect(await screen.findByTestId(tid.nav.goTo('echo'))).toHaveTextContent('Current');
});

/* MOBILE FOUNDATION: "The strip and the bar agree on the current tab". Both
   are painted from one array: on a page the bar has room for, the same view
   is current in both; on one it has no room for, the bar marks none of its
   destinations and lights More instead. */
test('the tab strip and the bottom bar agree on the page on screen', async () => {
  const nav = bigNav();
  const current = (testIds: RegExp) => screen.getAllByTestId(testIds).filter(a => a.getAttribute('aria-current') === 'page')
    .map(a => (a.getAttribute('data-testid') ?? '').replace(/^nav-(tab|bottom)-/, ''));
  const view = renderAt(nav, '/work/charlie');
  expect(current(/^nav-tab-/)).toEqual(['charlie']);
  expect(current(/^nav-bottom-/)).toEqual(['charlie']);
  expect(screen.getByTestId(tid.nav.more).className).not.toMatch(/text-brand/);
  view.unmount();
  renderAt(nav, '/work/foxtrot');
  expect(current(/^nav-tab-/)).toEqual(['foxtrot']);
  expect(current(/^nav-bottom-/)).toEqual([]);
  expect(screen.getByTestId(tid.nav.more).className).toMatch(/text-brand/);
});

test('on a persona nav the strip and the bar agree, and the bar has nothing to lift into More', () => {
  renderAt(managerNav(), '/team/tteam');
  const here = (testIds: RegExp) => screen.getAllByTestId(testIds).filter(a => a.getAttribute('aria-current') === 'page').map(a => a.getAttribute('data-testid'));
  expect(here(/^nav-tab-/)).toEqual(['nav-tab-tteam']);
  expect(here(/^nav-bottom-/)).toEqual(['nav-bottom-tteam']);
  expect(screen.queryByTestId(tid.nav.more)).toBeNull();
});
