import { buildNav, everyTab, type NavGroup } from './nav';

const ALL_MODULES = { A: true, B: true, TS: true, ON: true, CORE: true };
const flags = { DOCS: true };
const caps = (...c: string[]) => new Set(c);

/* Array indexing and Array#find both return T | undefined here
   (noUncheckedIndexedAccess), so a missing entry fails loudly with a clear
   message instead of a bare non-null assertion. */
function must<T>(v: T | undefined, msg = 'expected a value, got undefined'): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

test('an employee gets My Work only, in prototype order', () => {
  const g = buildNav({ caps: caps('own_home', 'own_ts'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  expect(g.map(x => x.key)).toEqual(['work']);
  expect(must(g[0]).tabs.map(t => t.label)).toEqual(['Home', 'My Calendar', 'Timesheet', 'Profile', 'Documents']);
  /* 1c group 7 builds My home and Documents */
  for (const view of ['home', 'docs']) {
    expect(must(must(g[0]).tabs.find(t => t.view === view)), view).toMatchObject({ built: true, path: `/work/${view}` });
    expect(must(must(g[0]).tabs.find(t => t.view === view)).subProject).toBeUndefined();
  }
  expect(g.flatMap(x => x.tabs).filter(t => t.subProject?.includes('plan 1c'))).toEqual([]);
});
test('a manager also gets My Team, with Team Home and Approvals in the strip and Employees under a heading', () => {
  const g = buildNav({ caps: caps('own_home', 'team_ts', 'team_employees', 'onb_track'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const team = must(g.find((x): x is NavGroup => x.key === 'team'));
  expect(team.tabs.filter(t => !t.group).map(t => t.label)).toEqual(['Team Home', 'Approvals']);
  expect([...new Set(team.tabs.filter(t => t.group).map(t => t.group))]).toEqual(['Employees']);
  /* module 2 builds Team timesheets */
  expect(must(team.tabs.find(t => t.view === 'tteam'))).toMatchObject({ built: true, path: '/team/tteam' });
  expect(must(team.tabs.find(t => t.view === 'tteam')).subProject).toBeUndefined();
  /* 1c group 7 builds Team Home */
  expect(must(team.tabs.find(t => t.view === 'thome'))).toMatchObject({ built: true, path: '/team/thome' });
  expect(must(team.tabs.find(t => t.view === 'thome')).subProject).toBeUndefined();
});
test('a module switched off removes its tabs', () => {
  const g = buildNav({ caps: caps('own_home', 'own_ts'), modules: { ...ALL_MODULES, A: false, B: false }, flags, onboarding: false, portalAdmin: false });
  expect(must(g[0]).tabs.map(t => t.label)).not.toContain('Timesheet');
});
/* Task 16: Home is QniConnect's payslip dashboard, and the Workforce month
   moves to My Calendar, right after it. My Calendar is the timesheet's
   calendar, so it needs the timesheet: the capability and a capture module. */
test('nav: My Calendar after Home', () => {
  const g = buildNav({ caps: caps('own_home', 'own_ts'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const work = must(g[0]).tabs;
  expect(work.map(t => t.view)).toEqual(['home', 'cal', 'ts', 'profile', 'docs']);
  expect(must(work.find(t => t.view === 'cal'))).toMatchObject({ label: 'My Calendar', path: '/work/cal', built: true });
  expect(must(work.find(t => t.view === 'home'))).toMatchObject({ label: 'Home', path: '/work/home' });
  /* without the timesheet capability, or with no capture module, there is no calendar */
  expect(must(buildNav({ caps: caps('own_home'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false })[0]).tabs.map(t => t.view)).not.toContain('cal');
  expect(must(buildNav({ caps: caps('own_home', 'own_ts'), modules: { ...ALL_MODULES, A: false, B: false }, flags, onboarding: false, portalAdmin: false })[0]).tabs.map(t => t.view)).not.toContain('cal');
  /* nor while onboarding */
  expect(buildNav({ caps: caps('own_home', 'own_ts', 'own_onb'), modules: ALL_MODULES, flags, onboarding: true, portalAdmin: false }).flatMap(x => x.tabs).map(t => t.view)).not.toContain('cal');
});
/* Documents holds the payslips and tax documents now, so the Workforce
   document-centre flag no longer takes the tab away. */
test('nav: Documents does not depend on the DOCS flag', () => {
  const g = buildNav({ caps: caps('own_home', 'own_ts'), modules: ALL_MODULES, flags: { ...flags, DOCS: false }, onboarding: false, portalAdmin: false });
  expect(must(g[0]).tabs.map(t => t.view)).toContain('docs');
  expect(must(buildNav({ caps: caps('own_ts'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false })[0]).tabs.map(t => t.view)).not.toContain('docs');
});
test('someone still onboarding sees onboarding and nothing else', () => {
  const g = buildNav({ caps: caps('own_home', 'own_onb', 'own_ts'), modules: ALL_MODULES, flags, onboarding: true, portalAdmin: false });
  expect(g.flatMap(x => x.tabs).map(t => t.label)).toEqual(['Onboarding']);
});
test('every listed view is built: with every capability, module and flag, no tab is marked not built or names a sub-project', () => {
  const all = buildNav({ caps: { has: () => true }, modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false }).flatMap(x => x.tabs);
  expect(all.map(t => t.view)).toContain('iaudit');
  expect(all.filter(t => !t.built || t.subProject !== undefined).map(t => t.view)).toEqual([]);
});
test('Timesheet and the Pay codes and Audit log pages are built', () => {
  const g = buildNav({ caps: caps('own_home', 'own_ts', 'mod_cfg', 'framework'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  expect(must(setup.tabs.find(t => t.view === 'mpay'))).toMatchObject({ built: true, path: '/setup/mpay' });
  expect(must(setup.tabs.find(t => t.view === 'iaudit'))).toMatchObject({ built: true, path: '/setup/iaudit' });
  /* module 2 builds My timesheet */
  expect(must(must(g[0]).tabs.find(t => t.view === 'ts'))).toMatchObject({ built: true });
});

test('team tabs carry a stable groupKey distinct from their display label (never derived from it)', () => {
  const g = buildNav({ caps: caps('own_home', 'team_employees', 'onb_track'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const team = must(g.find((x): x is NavGroup => x.key === 'team'));
  const employees = team.tabs.filter(t => t.group === 'Employees');
  expect(employees.length).toBeGreaterThan(0);
  expect(employees.every(t => t.groupKey === 'employees')).toBe(true);
});

test('setup pages are grouped into the prototype\'s five sections (SETUP_SECTIONS), in order', () => {
  const g = buildNav({
    caps: caps('perm_cfg', 'master_data', 'mod_cfg', 'type_cfg', 'framework'),
    modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false
  });
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  const sectionKeys = [...new Set(setup.tabs.filter(t => t.sectionKey).map(t => t.sectionKey))];
  expect(sectionKeys).toEqual(['org', 'mods', 'employees', 'gov', 'int']);
});

test('the module setup and integration pages the prototype\'s SETUP_NEED lists are reachable, gated and named for their sub-project', () => {
  const g = buildNav({ caps: caps('mod_cfg', 'framework'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  const byView = (v: string) => must(setup.tabs.find(t => t.view === v), `no setup tab for view "${v}"`);
  expect(byView('mts')).toMatchObject({ built: true, path: '/setup/mts', section: 'Modules' });
  expect(byView('mts').subProject).toBeUndefined();
  expect(byView('mpay')).toMatchObject({ built: true, path: '/setup/mpay', section: 'Integrations' });
  expect(byView('mpay').subProject).toBeUndefined();
  expect(byView('iaudit')).toMatchObject({ built: true, path: '/setup/iaudit', section: 'Integrations' });
  expect(byView('iaudit').subProject).toBeUndefined();
});

test('Notifications and Approvals are built in 1c and gated on the framework capability', () => {
  const g = buildNav({ caps: caps('framework'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const tabs = must(g.find((x): x is NavGroup => x.key === 'setup')).tabs;
  expect(tabs.find(t => t.view === 'anotif')).toMatchObject({ built: true, path: '/setup/anotif', section: 'Governance' });
  expect(tabs.find(t => t.view === 'anotif')?.subProject).toBeUndefined();
  expect(tabs.find(t => t.view === 'aappr')).toMatchObject({ built: true, path: '/setup/aappr', section: 'Governance' });
  expect(tabs.find(t => t.view === 'aappr')?.subProject).toBeUndefined();
  expect(buildNav({ caps: caps('mod_cfg'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false }).flatMap(x => x.tabs).some(t => t.view === 'anotif')).toBe(false);
});

test('mts and monb each still need their own module switched on, not just their capability', () => {
  const g = buildNav({ caps: caps('mod_cfg', 'onb_cfg'), modules: { ...ALL_MODULES, A: false, B: false, ON: false }, flags, onboarding: false, portalAdmin: false });
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  const views = setup.tabs.map(t => t.view);
  expect(views).not.toContain('mts');
  expect(views).not.toContain('monb');
});

/* MANAGER NAV GROUPED BY MODULE: "The manager keeps their own employee
   surface". A manager's capability set always includes the employee-level
   caps too ("everything an employee can do, plus their team" — seed/social.json),
   so the work group is never trimmed down just because team caps were added.
   What the work group holds is asserted exactly, for each persona. */
const WORK = ['Home', 'My Calendar', 'Timesheet', 'Profile', 'Documents'];
const workLabels = (c: string[], onboarding = false) =>
  must(buildNav({ caps: caps(...c), modules: ALL_MODULES, flags, onboarding, portalAdmin: false }).find((x): x is NavGroup => x.key === 'work')).tabs.map(t => t.label);
test('a manager keeps their own employee surface: the work group holds exactly what an employee has', () => {
  expect(workLabels(['own_home', 'own_ts', 'team_ts', 'team_employees'])).toEqual(WORK);
  expect(workLabels(['own_home', 'own_ts'])).toEqual(WORK);
});
test('the work group, persona by persona: a new starter sees Onboarding only; an employee without the Timesheet module loses Timesheet and My Calendar', () => {
  expect(workLabels(['own_home', 'own_ts', 'own_onb'], true)).toEqual(['Onboarding']);
  expect(must(buildNav({ caps: caps('own_home', 'own_ts'), modules: { ...ALL_MODULES, A: false, B: false }, flags: {}, onboarding: false, portalAdmin: false })[0]).tabs.map(t => t.label)).toEqual(['Home', 'Profile', 'Documents']);
});

/* MANAGER NAV GROUPED BY MODULE: "Turning it back on restores them". buildNav
   is a pure function of `modules`, so re-enabling one is just calling it
   again with that flag true; this proves the round trip rather than only
   half of it (a module switched off removes its tabs, tested above). */
test('re-enabling a module brings its tabs back', () => {
  const caps_ = caps('own_home', 'team_ts');
  const off = buildNav({ caps: caps_, modules: { ...ALL_MODULES, A: false, B: false }, flags, onboarding: false, portalAdmin: false });
  const on = buildNav({ caps: caps_, modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const teamOff = must(off.find((x): x is NavGroup => x.key === 'team'));
  const teamOn = must(on.find((x): x is NavGroup => x.key === 'team'));
  expect(teamOff.tabs.map(t => t.label)).not.toContain('Approvals');
  expect(teamOn.tabs.map(t => t.label)).toContain('Approvals');
});

/* MANAGER NAV GROUPED BY MODULE: An admin's capability set holds no team_*
   capability at all (seed/social.json), so buildNav never produces a 'team'
   group for one; configuration is reached through the setup group instead. */
test('an admin capability set produces no team group; configuration lives under Setup instead', () => {
  const g = buildNav({
    caps: caps('perm_cfg', 'master_data', 'mod_cfg', 'type_cfg', 'framework'),
    modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false
  });
  expect(g.some(x => x.key === 'team')).toBe(false);
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  expect(setup.tabs.map(t => t.view)).toContain('mts');
});

/* ADMIN LAYOUT: "One place called setup, not two top-level groups". The same
   admin capability set above produces exactly one top-level group, 'setup':
   no second admin-only group duplicating it, and (per the row above) no
   'team' group either. */
test('an admin capability set produces exactly one top-level group: setup, not two', () => {
  const g = buildNav({
    caps: caps('perm_cfg', 'master_data', 'mod_cfg', 'type_cfg', 'framework'),
    modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false
  });
  expect(g.map(x => x.key)).toEqual(['setup']);
});
test('plan 1b builds the employees, profile, dimensions, contracts and employee types pages', () => {
  const g = buildNav({ caps: caps('own_home', 'master_data', 'team_employees', 'type_cfg'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const tabs = g.flatMap(x => x.tabs);
  for (const view of ['aemployees', 'temployees', 'profile', 'aloc', 'acon', 'atypes']) expect(tabs.find(t => t.view === view), view).toMatchObject({ built: true });
  expect(tabs.filter(t => t.subProject?.includes('plan 1b'))).toEqual([]);
});

test('1c builds Modules & features, Calendar and Organisation', () => {
  const g = buildNav({ caps: caps('master_data', 'mod_cfg'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const tabs = g.flatMap(x => x.tabs);
  expect(tabs.find(t => t.view === 'amods')).toMatchObject({ built: true, path: '/setup/amods', section: 'Modules' });
  expect(tabs.find(t => t.view === 'amods')?.subProject).toBeUndefined();
  expect(tabs.find(t => t.view === 'acal')).toMatchObject({ built: true, path: '/setup/acal', section: 'Organisation' });
  expect(tabs.find(t => t.view === 'aorg')).toMatchObject({ built: true, path: '/setup/aorg', section: 'Organisation' });
  expect(tabs.find(t => t.view === 'aorg')?.subProject).toBeUndefined();
});

test('nav: no rota views', () => {
  const views = everyTab().map(t => t.view);
  for (const v of ['shifts', 'trota', 'tcover', 'tshifts', 'tpat', 'mrota']) expect(views).not.toContain(v);
});

test('nav: no leave views', () => {
  const views = everyTab().map(t => t.view);
  for (const v of ['leave', 'tleave', 'tsick', 'mleave']) expect(views).not.toContain(v);
});

test('nav: no notice views', () => {
  const views = everyTab().map(t => t.view);
  for (const v of ['notices', 'tnotices']) expect(views).not.toContain(v);
});

test('nav: no hours, exceptions, payroll readiness, BC or IT views', () => {
  const views = everyTab().map(t => t.view);
  for (const v of ['hours', 'thours', 'texc', 'ipay', 'ibc', 'iit']) expect(views).not.toContain(v);
});

test('Integrations holds just Pay codes and the Audit log; the Audit log needs Governance (framework), not a removed capability', () => {
  const int = (c: string[]) => buildNav({ caps: caps(...c), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false }).flatMap(g => g.tabs).filter(t => t.sectionKey === 'int').map(t => t.view);
  expect(int(['mod_cfg', 'framework'])).toEqual(['mpay', 'iaudit']);
  expect(int(['mod_cfg'])).toEqual(['mpay']);
  expect(int(['framework'])).toEqual(['iaudit']);
  expect(everyTab().filter(t => t.sectionKey === 'int').map(t => t.view)).toEqual(['mpay', 'iaudit']);
});

/* Task 19, spec N18 and Review focus 4: QniConnect's Business Central pages
   are gated by isAdmin from the portal check (portalAdmin), the Workforce
   setup pages by capabilities, and neither gate raises or lowers the other. */
const ADMIN_CAPS = ['perm_cfg', 'master_data', 'mod_cfg', 'type_cfg', 'framework'];
const EMPLOYEE_CAPS = ['own_home', 'own_ts'];
const CONN = ['aoverview', 'aenv', 'aauth', 'asettings'];
test('nav: Business Central section needs portalAdmin', () => {
  const on = buildNav({ caps: caps(...EMPLOYEE_CAPS), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: true });
  const setup = must(on.find((x): x is NavGroup => x.key === 'setup'));
  const conn = setup.tabs.filter(t => t.sectionKey === 'conn');
  expect(conn.map(t => [t.view, t.label, t.path])).toEqual([
    ['aoverview', 'Overview', '/setup/aoverview'], ['aenv', 'Environments', '/setup/aenv'],
    ['aauth', 'Authorization', '/setup/aauth'], ['asettings', 'Settings', '/setup/asettings']]);
  expect(conn.every(t => t.section === 'Business Central' && t.built
    && t.sectionDescription === 'The environments, connection and settings this organisation runs on')).toBe(true);
  /* the first setup section, straight after the index */
  expect(setup.tabs.map(t => t.view).slice(0, 5)).toEqual(['asetup', ...CONN]);
  const off = buildNav({ caps: caps(...EMPLOYEE_CAPS), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  expect(off.flatMap(g => g.tabs).filter(t => t.sectionKey === 'conn')).toEqual([]);
  expect(off.map(g => g.key)).toEqual(['work']);
  /* every page the app knows includes them, so a link to one is "not available", not "not found" */
  expect(everyTab().filter(t => t.sectionKey === 'conn').map(t => t.view)).toEqual(CONN);
  /* still onboarding: nothing but onboarding, whatever the portal says */
  expect(buildNav({ caps: caps('own_home', 'own_onb'), modules: ALL_MODULES, flags, onboarding: true, portalAdmin: true }).flatMap(g => g.tabs).map(t => t.view)).toEqual(['onb']);
});
/* Task 20 (D12, N18): People & access is one page with two halves. Its
   portal-login half is a QniConnect page, so isAdmin alone reaches it (D8:
   isAdmin wins for QniConnect admin access); its Workforce half still needs
   master_data, which the page checks. */
test('nav: isAdmin with employee persona shows only the QniConnect pages: the Business Central section and People & access', () => {
  const g = buildNav({ caps: caps(...EMPLOYEE_CAPS), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: true });
  expect(g.map(x => x.key)).toEqual(['work', 'setup']);
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  expect([...new Set(setup.tabs.filter(t => t.sectionKey).map(t => t.sectionKey))]).toEqual(['conn', 'employees']);
  expect(setup.tabs.map(t => t.view)).toEqual(['asetup', ...CONN, 'aemployees']);
  /* the employee's own pages are untouched */
  expect(must(g[0]).tabs.map(t => t.label)).toEqual(WORK);
});
test('nav: admin persona without isAdmin has no Business Central section', () => {
  const g = buildNav({ caps: caps(...ADMIN_CAPS), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: false });
  const setup = must(g.find((x): x is NavGroup => x.key === 'setup'));
  expect([...new Set(setup.tabs.filter(t => t.sectionKey).map(t => t.sectionKey))]).toEqual(['org', 'mods', 'employees', 'gov', 'int']);
  expect(setup.tabs.map(t => t.view).filter(v => CONN.includes(v))).toEqual([]);
  /* and with isAdmin it gains the section without losing a Workforce page */
  const both = must(buildNav({ caps: caps(...ADMIN_CAPS), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: true }).find((x): x is NavGroup => x.key === 'setup'));
  expect(both.tabs.map(t => t.view)).toEqual(['asetup', ...CONN, ...setup.tabs.map(t => t.view).slice(1)]);
});
test('nav: People & access is the aemployees view, reached with master_data or isAdmin, and with neither it is not offered', () => {
  const people = (c: string[], portalAdmin: boolean) => buildNav({ caps: caps(...c), modules: ALL_MODULES, flags, onboarding: false, portalAdmin })
    .flatMap(g => g.tabs).find(t => t.view === 'aemployees');
  expect(people(['master_data'], false)).toMatchObject({ label: 'People & access', path: '/setup/aemployees', section: 'Employees', sectionKey: 'employees', built: true });
  expect(people(EMPLOYEE_CAPS, true)).toMatchObject({ label: 'People & access', path: '/setup/aemployees' });
  expect(people(['master_data'], true)).toMatchObject({ label: 'People & access' });
  expect(people(EMPLOYEE_CAPS, false)).toBeUndefined();
  /* a team Employees tab keeps its name */
  expect(buildNav({ caps: caps('team_employees'), modules: ALL_MODULES, flags, onboarding: false, portalAdmin: true }).flatMap(g => g.tabs)
    .find(t => t.view === 'temployees')?.label).toBe('Employees');
  /* still onboarding: nothing but onboarding, whatever the portal says */
  expect(buildNav({ caps: caps('own_onb', 'master_data'), modules: ALL_MODULES, flags, onboarding: true, portalAdmin: true }).flatMap(g => g.tabs).map(t => t.view)).toEqual(['onb']);
});
