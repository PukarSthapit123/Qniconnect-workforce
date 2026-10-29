/* Ported from the prototype's NAV() (qnipay-workforce-v15.html, "function NAV()").
   Order is screen order; a run of tabs sharing `group` becomes one menu. */
export interface NavInput {
  caps: Pick<ReadonlySet<string>, 'has'>; modules: Record<string, boolean>; flags: Record<string, boolean>; onboarding: boolean;
  /* isAdmin from QniConnect's portal check (spec N18). It gates the Business
     Central pages, and only those; capabilities gate the Workforce setup
     pages. Neither gate raises or lowers the other (Review focus 4). */
  portalAdmin: boolean;
}
export interface NavTab {
  view: string; label: string; path: string; built: boolean; subProject?: string;
  /* the phone bottom bar's one-word name, where the label's first word would
     not say where it goes ("My Calendar" is "Calendar", not "My") */
  short?: string;
  /* team tabs: a run sharing `group` becomes one dropdown menu in the strip.
     `groupKey` is the stable, copy-independent id behind that display label
     (never derived from it: a copy change must not silently change a test id). */
  group?: string; groupKey?: string;
  /* setup tabs: which of the five setup sections a page belongs to. `section`
     is the display label, `sectionKey` its stable id, same reasoning as above. */
  section?: string; sectionKey?: string;
  /* What the section configures, shown behind hover on its setup card
     (prototype SETUP_SECTIONS desc, html:3975-3991). */
  sectionDescription?: string;
  /* a strip's way back ("‹ All setup", "‹ All modules"): never the page you are on */
  back?: true;
  /* a module's own setup page (mts, monb): the code of the module
     whose drill-in reaches it, so it is not listed with its section's pages */
  module?: string;
}
export interface NavGroup { key: 'work' | 'team' | 'setup'; label: string; tabs: NavTab[] }

/* which sub-project brings each view; a view not listed here is built in plan 1a */
const LATER: Record<string, string> = {
  /* every view is built */
};
const tab = (group: NavGroup['key'], view: string, label: string, extra: Partial<NavTab> = {}): NavTab =>
  ({ view, label, path: `/${group}/${view}`, built: !(view in LATER), ...(view in LATER ? { subProject: LATER[view] } : {}), ...extra });

/* The prototype's SETUP_SECTIONS (qnipay-workforce-v15.html:3975-3991): the
   fixed order and grouping an administrator sees setup in. Its "Modules"
   section there only lists 'amods'; mts/monb are reached one level
   deeper, after choosing a specific module (its MODULE_SEC drill-down, e.g.
   "Timesheet features" -> "Timesheet setup"). They are routes of the
   Modules section here, gated exactly as the prototype's SETUP_NEED
   (html:4002-4011) gates them, and carry `module` so the strip and the
   setup index leave them to their module's drill-in (Shell.tsx stripTabsFor). */
function setupSections(can: (c: string) => boolean, on: (m: string) => boolean, ts: boolean, portalAdmin: boolean) {
  const sec = (key: string, label: string, description: string, pages: [boolean, NavTab][]) => ({ key, label, description, pages });
  return [
    /* QniConnect's admin pages (its /admin/*), first: what the organisation
       runs on. Gated by portalAdmin alone, never by a capability (N18). */
    sec('conn', 'Business Central', 'The environments, connection and settings this organisation runs on', [
      [portalAdmin, tab('setup', 'aoverview', 'Overview')],
      [portalAdmin, tab('setup', 'aenv', 'Environments')],
      [portalAdmin, tab('setup', 'aauth', 'Authorization')],
      [portalAdmin, tab('setup', 'asettings', 'Settings')],
    ]),
    sec('org', 'Organisation', 'Who this organisation is, the template it runs on, the bank holidays, and how it looks', [
      [can('master_data'), tab('setup', 'aorg', 'Organisation')],
      [can('master_data'), tab('setup', 'acal', 'Bank holidays')],
    ]),
    sec('mods', 'Modules', 'What this tenant runs, the features inside each module, and how each behaves', [
      [can('mod_cfg'), tab('setup', 'amods', 'Modules & features')],
      [can('mod_cfg') && ts, tab('setup', 'mts', 'Timesheet', { module: 'TS' })],
      /* Onboarding setup is gated on Configure onboarding, as the prototype's cap row says (v15:2232) */
      [can('onb_cfg') && on('ON'), tab('setup', 'monb', 'Onboarding', { module: 'ON' })],
    ]),
    sec('employees', 'Employees', 'The canonical employee record, what each employee is, and the structure work is costed to', [
      /* People & access (D12): its portal-login half is a QniConnect page, so
         isAdmin alone reaches it (N18, D8); its Workforce half needs master_data */
      [can('master_data') || portalAdmin, tab('setup', 'aemployees', 'People & access')],
      [can('type_cfg'), tab('setup', 'atypes', 'Employee types')],
      [can('master_data'), tab('setup', 'acon', 'Contracts')],
      [can('master_data'), tab('setup', 'aloc', 'Dimensions')],
    ]),
    sec('gov', 'Governance', 'Who may do what, who is told, and who signs it off', [
      [can('perm_cfg'), tab('setup', 'aperm', 'Permissions')],
      [can('framework'), tab('setup', 'anotif', 'Notifications')],
      [can('framework'), tab('setup', 'aappr', 'Approvals')],
    ]),
    sec('int', 'Integrations', 'The pay codes timesheets use and what is recorded', [
      [can('mod_cfg'), tab('setup', 'mpay', 'Pay codes')],
      [can('framework'), tab('setup', 'iaudit', 'Audit log')],
    ]),
  ];
}

/* `flags` no longer gates a tab (Documents was the last, Task 16); it stays
   on NavInput because the shell passes the tenant's flags as they are. */
export function buildNav({ caps, modules, onboarding, portalAdmin }: NavInput): NavGroup[] {
  const can = (c: string) => caps.has(c), on = (m: string) => !!modules[m];
  const ts = on('A') || on('B');
  const work: [boolean, NavTab][] = [
    [can('own_onb') && on('ON') && onboarding, tab('work', 'onb', 'Onboarding')],
    /* Home is QniConnect's payslip dashboard; the Workforce month is My
       Calendar, the timesheet's calendar, so it goes with the timesheet */
    [can('own_home') && !onboarding, tab('work', 'home', 'Home')],
    [can('own_ts') && ts && !onboarding, tab('work', 'cal', 'My Calendar', { short: 'Calendar' })],
    [can('own_ts') && ts && !onboarding, tab('work', 'ts', 'Timesheet')],
    [can('own_home') && !onboarding, tab('work', 'profile', 'Profile')],
    /* payslips and tax documents live here, so no Workforce flag hides it */
    [can('own_home') && !onboarding, tab('work', 'docs', 'Documents')],
  ];
  const teamHome = ['team_ts', 'team_employees'].some(can);
  const team: [boolean, NavTab][] = [
    [teamHome, tab('team', 'thome', 'Team Home')],
    [can('team_ts') && ts, tab('team', 'tteam', 'Approvals')],
    [can('team_employees'), tab('team', 'temployees', 'Employees', { group: 'Employees', groupKey: 'employees' })],
    [(can('onb_track') || can('onb_verify')) && on('ON'), tab('team', 'tonb', 'Onboarding', { group: 'Employees', groupKey: 'employees' })],
    /* module 8: payroll signs off the Timesheet chain's payroll layer from the same queue. Someone who
       holds only that comes to it last, so an administrator still lands where they did */
    [!can('team_ts') && can('pay_appr') && ts, tab('team', 'tteam', 'Approvals')],
  ];
  const keep = (xs: [boolean, NavTab][]) => xs.filter(([ok]) => ok).map(([, t]) => t);
  const sections = setupSections(can, on, ts, portalAdmin)
    .map(s => ({ ...s, tabs: keep(s.pages).map(t => ({ ...t, section: s.label, sectionKey: s.key, sectionDescription: s.description })) }))
    .filter(s => s.tabs.length);
  const setupTabs = sections.flatMap(s => s.tabs);
  const groups: NavGroup[] = [
    { key: 'work', label: 'My Work', tabs: keep(work) },
    { key: 'team', label: 'My Team', tabs: onboarding ? [] : keep(team) },
    { key: 'setup', label: 'Setup', tabs: onboarding || !setupTabs.length ? [] : [tab('setup', 'asetup', 'Setup'), ...setupTabs] },
  ];
  return groups.filter(g => g.tabs.length);
}

/* Every page the app knows, whoever can reach it: a link to anything else is
   unknown, and a link to one of these that is not on your own nav is
   unavailable to you (brief D9). */
export function everyTab(): NavTab[] {
  const all = { has: () => true };
  const modules = { A: true, B: true, C: true, TS: true, ON: true, CORE: true };
  const flags = { DOCS: true };
  const tabs = [true, false].flatMap(onboarding => buildNav({ caps: all, modules, flags, onboarding, portalAdmin: true }).flatMap(g => g.tabs));
  return tabs.filter((t, i) => tabs.findIndex(x => x.path === t.path) === i);
}
