import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Clock, Ellipsis, FileText, Gauge, House, KeyRound, LayoutGrid, ListChecks, Moon, Server, Settings, Sun, User, Users } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { NavGroup, NavTab } from '@/domain/nav';
import type { Session } from '@/contract/session';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/shadcn/dropdown-menu';
import { buttonVariants } from '@/ui/shadcn/button';
import { Modal, NavLink, Page, PageHead, Card, toastInfo } from '@/ui';
import { AccountMenu, type MenuAccount } from './AccountMenu';
import { TopBar } from './TopBar';
import { NotificationBell, type InboxState } from './Inbox';
import { useMarkAllRead, useMarkRead, useMyNotifications } from '@/api/notifications';
import { useBcNotifications } from '@/api/bc/notifications';
import { bcItemId, mergeInbox } from '@/domain/inbox';
import { useShellData, ShellLoading, ShellError } from './shellData';
import { NotBuilt } from '@/features/not-built/NotBuilt';
import { PageUnavailable } from '@/features/not-built/PageUnavailable';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { SetupIndex } from '@/features/setup/SetupIndex';
import { PermissionsPage } from '@/features/access/PermissionsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { AdminEmployeesPage } from '@/features/employees/AdminEmployeesPage';
import { TeamEmployeesPage } from '@/features/employees/TeamEmployeesPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { DimensionsPage } from '@/features/dimensions/DimensionsPage';
import { WorkPatternsPage } from '@/features/work-patterns/WorkPatternsPage';
import { TimesheetPage } from '@/features/timesheet/TimesheetPage';
import { TeamTimesheetsPage } from '@/features/timesheet/TeamTimesheetsPage';
import { TimesheetSetupPage } from '@/features/timesheet/TimesheetSetupPage';
import { ModulesPage } from '@/features/modules/ModulesPage';
import { BankHolidaysPage } from '@/features/calendar/BankHolidaysPage';
import { OrganisationPage } from '@/features/organisation/OrganisationPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { HomePage } from '@/features/home/HomePage';
import { MyCalendarPage } from '@/features/calendar/MyCalendarPage';
import { TeamHomePage } from '@/features/home/TeamHomePage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { TeamOnboardingPage } from '@/features/onboarding/TeamOnboardingPage';
import { OnboardingSetupPage } from '@/features/onboarding/OnboardingSetupPage';
import { PayCodesPage } from '@/features/pay-codes/PayCodesPage';
import { FirstLoginOverlay } from '@/features/account-setup/FirstLoginOverlay';
import { moduleBy } from '@/domain/modules';
import { OverviewPage } from '@/features/connection/OverviewPage';
import { EnvironmentsPage } from '@/features/connection/EnvironmentsPage';
import { AuthorizationPage } from '@/features/connection/AuthorizationPage';
import { SettingsPage } from '@/features/connection/SettingsPage';

const BUILT: Record<string, ComponentType> = { asetup: SetupIndex, aperm: PermissionsPage, iaudit: AuditPage,
  aemployees: AdminEmployeesPage, temployees: TeamEmployeesPage, profile: ProfilePage,
  aloc: DimensionsPage, atypes: WorkPatternsPage, ts: TimesheetPage, tteam: TeamTimesheetsPage,
  mts: TimesheetSetupPage,
  amods: ModulesPage, acal: BankHolidaysPage, aorg: OrganisationPage, anotif: NotificationsPage, aappr: ApprovalsPage,
  home: HomePage, cal: MyCalendarPage, thome: TeamHomePage, docs: DocumentsPage, onb: OnboardingPage, tonb: TeamOnboardingPage,
  monb: OnboardingSetupPage, mpay: PayCodesPage,
  aoverview: OverviewPage, aenv: EnvironmentsPage, aauth: AuthorizationPage, asettings: SettingsPage };
const THEME_KEY = 'qnipay.theme';

/* Avoids a non-null assertion on role[0]: charAt(0) is always defined, even
   for an empty string, so this needs no unsafe indexing. */
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* The role pill's text: the access role's display name (D11), so a renamed
   role shows its new name; while viewing as someone, the viewed employee's. */
export function roleLabelOf(session: Pick<Session, 'account' | 'viewingAs'>): string {
  const on = session.viewingAs ?? session.account;
  return on.roleName || capitalise(on.userType);
}

export function Shell() {
  const data = useShellData();
  if (data.kind === 'loading') return <ShellLoading chrome />;
  if (data.kind === 'error') return <ShellError onRetry={data.onRetry} onSignOut={data.onSignOut} />;
  const { session } = data;
  /* QniConnect's first-login welcome sits over the app until it is done (AUTH.R66). */
  return <>
    <ShellView nav={data.nav} roleLabel={roleLabelOf(session)} viewingAs={session.viewingAs?.name ?? null}
      account={session.account} canViewAs={session.capabilities.includes('perm_cfg')}
      who={`${session.account.email}|${session.viewingAs?.employeeCode ?? ''}`}
      onSignOut={data.onSignOut} onViewAs={data.onViewAs} onEndViewAs={data.onEndViewAs} />
    <FirstLoginOverlay />
  </>;
}

/* The bell's inbox, merged (spec D13): Workforce's items (D9) and the
   signed-in account's payroll notifications from Business Central (portal
   BELL), one list, newest first. Opening an item marks it read on the
   backend it came from, never while looking at the app as someone else
   (which changes nothing, and shows no payroll items: those are the
   account's own, not the viewed person's).
   - A Workforce item: marked read on /api/v1, and the dot and the count
     change once that server has answered; it goes where it points.
   - A payroll item: marked seen at once and Business Central told without
     waiting, as QniConnect did (BELL.R8); it opens its detail (BELL.R10).
   Mark all read does both: Workforce's read-all, and BELL.C2 for each
   unseen payroll item (Business Central has no read-all). A payroll item
   with no systemId is marked seen here only (useBcNotifications). */
function useInbox(readOnly: boolean): InboxState {
  const q = useMyNotifications(), markRead = useMarkRead(), markAll = useMarkAllRead();
  const payroll = useBcNotifications(!readOnly);
  const unseen = payroll.items.flatMap((n, i) => (n.seen ? [] : [bcItemId(n, i)]));
  return {
    status: q.isPending ? 'loading' : q.isError ? 'error' : 'ready',
    items: mergeInbox(payroll.items, q.data?.items ?? []),
    unread: (q.data?.unread ?? 0) + unseen.length,
    readOnly, markAllPending: markAll.isPending('notifications/all'),
    onOpen: n => {
      if (n.source === 'payroll') {
        if (!n.read && !readOnly) payroll.markSeen(n.id);
        return;
      }
      if (!n.read && !readOnly) markRead.mutate({ id: n.id });
      toastInfo(`Opened from your notifications: ${n.title}.`);
    },
    onMarkAll: () => {
      if (readOnly) return;
      if (q.data?.unread) markAll.mutate(null);
      for (const id of unseen) payroll.markSeen(id);
    },
  };
}

/* The shell chrome is shared: a module never restyles it. Top bar, then the
   tab strip (desktop) or the bottom bar (phone), both painted from the same
   array, then the routed page inside its own Page frame. */
export function ShellView({ nav, roleLabel, viewingAs, account, canViewAs = false, inbox, who, onSignOut, onViewAs = () => {}, onEndViewAs }: {
  nav: NavGroup[]; roleLabel: string; viewingAs: string | null; account: MenuAccount; canViewAs?: boolean;
  /* the bell's inbox; read from the server when not given */
  inbox?: InboxState;
  /* who the app is showing: the account, and whoever it is viewing as */
  who?: string;
  onSignOut(): void; onViewAs?(employeeCode: string): void; onEndViewAs(): void;
}) {
  const { pathname, search } = useLocation();
  useHomeOnSwitch(who, nav, pathname);
  const [theme, toggleTheme] = useTheme();
  const current = nav.find(g => pathname.startsWith(`/${g.key}/`)) ?? nav[0];
  const first = nav[0]?.tabs[0];
  /* Where / lands (spec section 8): a portal admin (only they have the
     Business Central overview) on the overview, as QniConnect sent an admin
     to /admin/dashboard (ADM.ROUTES.R7); anyone else on their first page,
     as Workforce does. */
  const landing = nav.flatMap(g => g.tabs).find(t => t.view === 'aoverview') ?? first;
  const stripTabs = stripTabsFor(current, pathname, search);
  const here = pathname + search;
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar>
        <AreaSwitcher>{nav.map(g => <AreaLink key={g.key} group={g} current={g === current} />)}</AreaSwitcher>
        <div className="ml-auto flex shrink-0 items-center gap-md max-md:gap-[2px]">
          {/* .rolepill (v15:303-306), quietened (taste review 2026-10-26, D1;
              a deliberate deviation): the role in sentence case and the muted
              shell ink, with no outline. Looking at the app as someone else
              keeps the prototype's dashed accent edge at 85%, so that state still
              stands out. The transparent border holds the width steady. */}
          <span data-testid={tid.shell.rolePill}
            className={cn('hidden shrink-0 items-center rounded-pill border px-[11px] py-xs text-xs font-semibold text-shell-ink-muted md:inline-flex',
              viewingAs ? 'border-dashed border-accent-line text-shell-ink opacity-85' : 'border-transparent')}
            title={viewingAs ? `Looking at the app as ${viewingAs} · your account is ${account.name}` : undefined}>{roleLabel}</span>
          {/* the icon previews what the button does, as its name says it */}
          <IconButton testId={tid.shell.theme} label={`${theme === 'dark' ? 'Light' : 'Dark'} theme`} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</IconButton>
          {inbox ? <NotificationBell inbox={inbox} /> : <ServerBell readOnly={viewingAs !== null} />}
          <AccountMenu account={account} viewingAs={viewingAs} canViewAs={canViewAs} onSignOut={onSignOut} onViewAs={onViewAs} onEndViewAs={onEndViewAs} />
        </div>
      </TopBar>
      {viewingAs && <div role="status" className="flex flex-wrap items-center gap-md border-b border-warn bg-warn-surface px-xl py-sm text-sm text-warn max-lg:px-md">
        <span>Looking at the app as <b>{viewingAs}</b>. Your own account is unchanged.</span>
        <button type="button" data-testid={tid.shell.viewAsEnd} className="inline-flex min-h-touch items-center font-semibold underline" onClick={onEndViewAs}>Return to my account</button></div>}
      {stripTabs.length > 0 && <TabStrip tabs={stripTabs} here={here} />}
      {/* the page reserves what the bottom bar occupies, home indicator included (v15:815-816) */}
      <main className={cn('flex-1 md:pb-10', stripTabs.length > 0 && 'max-md:pb-[calc(var(--qp-bottom-bar-clear)+env(safe-area-inset-bottom,0px))]')}>
        <Routes>
          {nav.flatMap(g => g.tabs).map(t => {
            const Built = BUILT[t.view];
            return <Route key={t.path} path={t.path} element={Built ? <Built /> : <NotBuilt tab={t} />} />;
          })}
          {/* Working hours became the Hours column on Employees (2026-10-27); an old link lands there */}
          <Route path="/setup/acon" element={<Navigate to="/setup/aemployees" replace />} />
          <Route path="/" element={landing ? <Navigate to={landing.path} replace /> : <NothingAvailable />} />
          <Route path="*" element={first ? <PageUnavailable path={pathname} home={first} /> : <NothingAvailable />} />
        </Routes>
      </main>
      {stripTabs.length > 0 && <BottomBar tabs={stripTabs} here={here} />}
    </div>);
}

function ServerBell({ readOnly }: { readOnly: boolean }) {
  return <NotificationBell inbox={useInbox(readOnly)} />;
}

/* Switching account or who you view as starts from that employee's first page
   when the page on screen is not theirs; a link opened on purpose to a page
   you cannot reach says so instead (PageUnavailable). */
function useHomeOnSwitch(who: string | undefined, nav: NavGroup[], pathname: string) {
  const navigate = useNavigate(), last = useRef(who);
  useEffect(() => {
    if (last.current === who) return;
    last.current = who;
    const first = nav[0]?.tabs[0];
    if (first && !nav.some(g => g.tabs.some(t => t.path === pathname))) void navigate(first.path, { replace: true });
  }, [who, nav, pathname, navigate]);
}

/* On a phone the areas scroll sideways with no scrollbar. An edge fades out
   only while there is an area past it, so it reads as more to come; and the
   current area is scrolled into view, so it is never the one under the fade.
   Before, a fixed fade on the right cut "My Team" to "My" at 390px (taste
   review 2026-10-26, Phase 1 item 3). On a wider screen nothing scrolls, so
   neither edge fades. */
const EDGE_MASK = {
  none: '',
  end: 'max-md:[mask-image:linear-gradient(90deg,black_88%,transparent)]',
  start: 'max-md:[mask-image:linear-gradient(270deg,black_88%,transparent)]',
  both: 'max-md:[mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]',
} as const;
function AreaSwitcher({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState<keyof typeof EDGE_MASK>('none');
  const { pathname } = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const before = el.scrollLeft > 1, after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdge(before && after ? 'both' : before ? 'start' : after ? 'end' : 'none');
    };
    /* centre the current area, as far as the strip can scroll (the nav is its offsetParent) */
    const on = el.querySelector<HTMLElement>('[aria-current="true"]');
    if (on && el.scrollWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [pathname]);
  return (
    <nav ref={ref} aria-label="Areas" data-surface="inverse"
      className={cn('relative flex min-w-0 gap-[2px] md:flex-wrap max-md:flex-1 max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none]', EDGE_MASK[edge])}>
      {children}
    </nav>);
}

/* .modsw button (v15:287-301, 1527, 1560-1561): 14px/500 in the muted shell
   green, 7px 14px, a white lift on hover. The link itself is the 44px touch
   target; the pill is drawn inside it, so the bar keeps the prototype's 34px
   pill. The current area is white at 600 on a faint white pill with a 1px
   edge, not the prototype's lime fill: a deliberate deviation (taste review
   2026-10-26, D1; the tokens are --qp-color-shell-current*, src/index.css).

   Switching area is the most frequent navigation in the app, so the
   "current" pill lands at once, with no crossfade between the old area and
   the new; only the press scales the pill. The keyboard ring is the
   inverse one (the nav carries data-surface="inverse"). */
function AreaLink({ group, current }: { group: NavGroup; current: boolean }) {
  return (
    <NavLink to={firstTabPath(group)} testId={tid.nav.group(group.key)} aria-current={current ? 'true' : undefined}
      className="group inline-flex min-h-touch shrink-0 items-center rounded-pill select-none focus-visible:shadow-none">
      <span className={cn('rounded-pill px-[14px] py-[7px] text-sm whitespace-nowrap transition-[scale] duration-(--dur-press) ease-(--ease-out) group-focus-visible:shadow-focus group-active:scale-[0.97] max-lg:px-[9px] max-lg:py-[6px] max-lg:text-xs max-md:px-[11px]',
        current ? 'bg-shell-current font-semibold text-text-on-brand shadow-[inset_0_0_0_1px_var(--qp-color-shell-current-line)]' : 'font-medium text-shell-ink-muted group-hover:bg-shell-hover group-hover:text-text-on-brand')}>{group.label}</span>
    </NavLink>);
}

/* .iconbtn (v15:307-315, 1549): a 34px round button in the pale shell ink
   with an 18px stroked icon, 44px on a phone. A press lifts it and scales it
   to 0.94 (a small round target takes a deeper press than a button), which
   is the only feedback a touch screen gets. Only the scale moves; the hover
   and press tints land at once, as everything in the chrome does. */
function IconButton({ testId, label, onClick, children }: { testId: string; label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" data-testid={testId} aria-label={label} onClick={onClick} data-surface="inverse"
      className="relative grid size-[34px] shrink-0 place-items-center rounded-pill text-shell-ink transition-[scale] duration-(--dur-press) ease-(--ease-out) hover:bg-shell-hover active:scale-[0.94] active:bg-shell-hover max-md:size-11 [&>svg]:size-[18px]">
      {children}
    </button>);
}

/* buildNav never returns a group with no tabs (it filters those out before
   returning), so the first tab always exists; this still satisfies
   noUncheckedIndexedAccess without a non-null assertion, and fails loudly
   (rather than silently) if that invariant is ever broken. */
function firstTabPath(g: NavGroup): string {
  const t = g.tabs[0];
  if (!t) throw new Error(`nav group "${g.key}" has no tabs`);
  return t.path;
}

/* Setup is not one flat strip. At the index there is no strip: the
   prototype's held the index's own tab alone ("Setup"), which said Setup a
   third time under the top bar's area and over the page title (taste review
   2026-10-26, a deliberate deviation; the phone already had no bottom bar
   there). Inside a
   section it shows only that section's pages, plus a way back (ported from
   the prototype's SETUP_SECTIONS drill and its "‹ All setup" tab,
   qnipay-workforce-v15.html:4075). Work and My Team are unaffected: their
   strip is just the group's tabs, as it always was. Inside Modules, opening
   a module (/setup/amods?m=<code>) drills in once more, as the prototype's
   NAV() does (v15:4059-4076): a way back to the module list, the module's
   features, and its setup page when this employee can reach it. A module's
   setup page (mts, monb) sits inside that drill-in, never on the
   Modules section's own strip (suite ADMIN LAYOUT: "‹ All modules |
   Timesheet features | Timesheet setup"). */
export function stripTabsFor(current: NavGroup | undefined, pathname: string, search = ''): NavTab[] {
  if (!current) return [];
  if (current.key !== 'setup') return current.tabs;
  const index = current.tabs.find(t => t.view === 'asetup');
  const active = current.tabs.find(t => t.path === pathname);
  const section = active?.section;
  if (!section) return [];
  const m = moduleBy(active.module ?? (active.view === 'amods' ? new URLSearchParams(search).get('m') ?? '' : ''));
  const amods = current.tabs.find(t => t.view === 'amods');
  if (m && amods) {
    const own = current.tabs.find(t => t.view === m.setup);
    return [
      { view: 'amods', label: '‹ All modules', path: amods.path, built: true, back: true },
      { view: 'mfeat', label: `${m.name} features`, path: `${amods.path}?m=${m.code}`, built: true },
      ...(own && m.setupLabel ? [{ ...own, label: m.setupLabel }] : []),
    ];
  }
  const back: NavTab = { view: 'asetup', label: '‹ All setup', path: index?.path ?? '/setup/asetup', built: true, back: true };
  return [back, ...current.tabs.filter(t => t.section === section && !t.module)];
}
/* Whether a strip tab is the page on screen. A tab whose path carries a query
   (a module's features) matches only with that query; any other matches its
   path whatever the query, and a way back never does. */
export const isHere = (t: NavTab, here: string) => !t.back && (t.path.includes('?') ? here === t.path : here.split('?')[0] === t.path);

function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  /* A theme change is one swap, not two waves: while the attribute flips,
     data-theme-switching turns every transition off (index.css), so a
     button's colour fade cannot trail the page behind it. Two frames later,
     once the new colours are painted, transitions come back. */
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme === theme) return; // index.html already applied it before the first paint
    root.setAttribute('data-theme-switching', '');
    root.dataset.theme = theme;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => root.removeAttribute('data-theme-switching')); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); root.removeAttribute('data-theme-switching'); };
  }, [theme]);
  const toggle = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage full or blocked: the theme still applies this session */ }
    return next;
  });
  return [theme, toggle];
}

/* Plan review focus: a valid session whose capabilities resolve to nothing
   (e.g. everything revoked) must not render an empty shell. This is what it
   sees instead of a blank main area: a clear statement and what to do next. */
function NothingAvailable() {
  return (
    <Page testId={tid.page('none')} narrow>
      <PageHead title="Nothing available" />
      <Card><p className="text-text-secondary">Your account has no access to open here. Ask an administrator to grant a capability on Setup &rarr; Permissions.</p></Card>
    </Page>);
}

function menuKey(r: { group?: string; groupKey?: string }): string {
  if (!r.groupKey) throw new Error(`nav group "${r.group ?? '(none)'}" has no stable key`);
  return r.groupKey;
}

/* .tabs (v15:338-351, 1523): the 44px card-surface strip, sticky under the
   top bar, 24px side padding (16px below 1024px). A tab is 14px/500 in
   secondary ink, 0 13px, 43px tall over a 2px rule; hover lifts it onto the
   tint; selected is brand ink at 600 with the rule in brand (the accent in
   dark). A heading's menu (.tabgrp, .tabmenu; v15:352-384) marks the page
   you are on with a fill and an inset bar, never colour alone.

   Nothing in the strip animates. Moving between pages happens a hundred
   times a day, often from the keyboard, so the selected rule and ink move
   to the new tab at once (a fade leaves the strip a beat behind the page),
   and its heading menus open at once from the keyboard. */
const TAB = 'relative inline-flex h-[43px] shrink-0 items-center border-b-2 border-transparent px-[13px] text-sm font-medium whitespace-nowrap text-text-secondary select-none hover:bg-surface-tint hover:text-text-primary';
const TAB_ON = 'border-brand font-semibold text-brand hover:bg-transparent hover:text-brand dark:border-brand-accent dark:text-brand-accent dark:hover:text-brand-accent';
function TabStrip({ tabs, here }: { tabs: NavTab[]; here: string }) {
  const runs: { group?: string; groupKey?: string; tabs: NavTab[] }[] = [];
  tabs.forEach(t => { const last = runs[runs.length - 1]; if (t.group && last?.group === t.group) last.tabs.push(t); else runs.push({ group: t.group, groupKey: t.groupKey, tabs: [t] }); });
  const link = (t: NavTab) => <NavLink key={t.view} to={t.path} testId={tid.nav.tab(t.view)} aria-current={isHere(t, here) ? 'page' : undefined}
    className={cn(TAB, isHere(t, here) && TAB_ON)}>{t.label}</NavLink>;
  return (
    <nav aria-label="Pages" className="sticky top-[calc(var(--qp-topbar-h)+env(safe-area-inset-top,0px))] z-(--qp-z-tabs) hidden min-h-11 flex-wrap items-stretch gap-y-[2px] border-b bg-surface-card px-xl max-lg:px-md md:flex">
      {runs.map(r => !r.group ? r.tabs.map(link) : (
        <DropdownMenu key={r.group}>
          <DropdownMenuTrigger data-testid={tid.nav.menu(menuKey(r))}
            className={cn(TAB, 'data-[state=open]:bg-surface-tint data-[state=open]:text-text-primary', r.tabs.some(t => isHere(t, here)) && TAB_ON)}>
            {r.group}<ChevronDown aria-hidden="true" className="ml-[3px] size-[14px] opacity-55" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={-1} className="min-w-[212px] p-[5px] shadow-md">
            {r.tabs.map(t => <DropdownMenuItem key={t.view} asChild
              className={cn('h-9 px-[10px] py-0 font-medium whitespace-nowrap text-text-secondary focus:text-text-primary',
                isHere(t, here) && 'bg-brand-subtle font-semibold text-brand shadow-[inset_2px_0_0_var(--qp-color-brand-primary)] focus:bg-brand-subtle focus:text-brand dark:text-brand-accent dark:shadow-[inset_2px_0_0_var(--qp-color-brand-accent)] dark:focus:text-brand-accent')}>
              <NavLink to={t.path} testId={tid.nav.tab(t.view)} aria-current={isHere(t, here) ? 'page' : undefined}>{t.label}</NavLink>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>))}
    </nav>);
}

/* The bottom bar's icons, standing for the prototype's glyphs (TAB_GLYPH,
   v15:10648-10653), from the shared icon set at 20px: the prototype's
   geometric characters fell back to each phone's own font, so their weight,
   size and baseline changed from one phone to the next. Anything unlisted
   takes the grid. */
const GLYPH: Record<string, ReactNode> = {
  home: <House />, cal: <CalendarDays />, ts: <Clock />, profile: <User />, docs: <FileText />, onb: <ListChecks />,
  thome: <House />, tteam: <Clock />, temployees: <Users />, tonb: <ListChecks />,
  aoverview: <Gauge />, aenv: <Server />, aauth: <KeyRound />, asettings: <Settings />,
};
/* A press scales the item to 0.97: on a phone there is no hover, so without
   it a tap feels dropped until the next page paints. */
const BAR_ITEM = 'flex min-h-[52px] min-w-0 flex-1 flex-col items-center gap-[3px] px-[2px] pt-[6px] pb-[7px] text-xs leading-[1.25] font-semibold transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none active:scale-[0.97]';
const barGlyph = (g: ReactNode) => <span aria-hidden="true" className="leading-none [&_svg]:size-5 [&_svg]:stroke-[1.75]">{g}</span>;
/* The first word of a tab's name, as the prototype shows it, unless the tab
   names a better one (My Calendar is Calendar); the link's accessible name
   stays the whole name. */
const shortLabel = (t: NavTab) => t.short ?? t.label.split(' ')[0] ?? t.label;
/* A name longer than this does not fit an equal fifth of a 390px bar at
   12px/600 ("Environments", "Authorization"). Names stay whole plain words
   (Ruling U1): a bar holding one sizes each column to its name and shares
   what is left, so a short name ("‹", "Settings") gives room to a long one.
   Bars of shorter names keep their equal columns. */
const LONGEST_EQUAL = 10;

/* .btabs (v15:796-817): fixed to the foot of a phone screen above the page
   (80) and below any sheet (100+), the home-indicator inset added once, by
   the bar. Each destination is a 52px column: a glyph over a 12px/600 short
   label in muted ink, the one you are on in brand (the accent in dark). At
   most five items: five destinations, or four and More for the rest, from
   the same array the strip uses (v15:10654-10661; `tabs` here is Shell's
   `stripTabs`, so setup already arrives section-scoped with its "back to
   setup" entry first). More is lit while the page on screen is one the bar
   has no room for, and opens the Go to sheet listing every page (GoToSheet):
   a Dialog (Radix traps and restores focus, per Modal.tsx), a sheet from the
   bottom on a phone, closed by choosing a page. */
function BottomBar({ tabs, here }: { tabs: NavTab[]; here: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = tabs.length > 5;
  const destinations = overflow ? tabs.slice(0, 4) : tabs;
  const remaining = overflow ? tabs.slice(4) : [];
  if (!destinations.length) return null;
  const on = (active: boolean) => active ? 'text-brand dark:text-brand-accent' : 'text-text-muted';
  const sized = destinations.some(t => shortLabel(t).length > LONGEST_EQUAL) && 'flex-[1_1_auto]';
  return (
    <nav aria-label="Quick pages" className="fixed inset-x-0 bottom-0 z-(--qp-z-bottombar) flex border-t bg-surface-card pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      {destinations.map(t => <NavLink key={t.view} to={t.path} testId={tid.nav.bottom(t.view)} aria-label={t.label}
        aria-current={isHere(t, here) ? 'page' : undefined} className={cn(BAR_ITEM, sized, on(isHere(t, here)))}>
        {barGlyph(GLYPH[t.view] ?? <LayoutGrid />)}<span className="max-w-full truncate">{shortLabel(t)}</span></NavLink>)}
      {remaining.length > 0 && <>
        <button type="button" data-testid={tid.nav.more} aria-haspopup="dialog" aria-label="More sections" onClick={() => setMoreOpen(true)}
          className={cn(BAR_ITEM, sized, on(remaining.some(t => isHere(t, here))))}>{barGlyph(<Ellipsis />)}<span>More</span></button>
        <GoToSheet tabs={tabs} here={here} open={moreOpen} onOpenChange={setMoreOpen} />
      </>}
    </nav>);
}

/* The prototype's more-tabs sheet (v15:12072-12080): "Go to", every page of
   the strip in its order, one .att row each (the name, then on the right
   Current for the page you are on, Open for the rest). Choosing one goes
   there and closes the sheet. On a phone the whole row is the target, not
   a small button at its end: the row is the link, at least 44px tall, and
   tints while pressed; Current and Open are its tag. The list clips its
   rounded corners, so a row's keyboard ring is drawn inside it. */
function GoToSheet({ tabs, here, open, onOpenChange }: { tabs: NavTab[]; here: string; open: boolean; onOpenChange(o: boolean): void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Go to">
      <ul data-testid={tid.nav.goToList} className="overflow-hidden rounded-card border bg-surface-card">
        {tabs.map(t => {
          const current = isHere(t, here);
          return (
            <li key={t.view} className="border-b last:border-b-0">
              <NavLink to={t.path} testId={tid.nav.goTo(t.view)} onClick={() => onOpenChange(false)}
                aria-current={current ? 'page' : undefined} aria-label={current ? `Current: ${t.label}` : `Open ${t.label}`}
                className="flex min-h-touch items-center gap-md px-md py-[10px] text-sm select-none hover:bg-surface-tint focus-visible:shadow-focus-inset active:bg-surface-tint">
                <span className="min-w-0">{t.label}</span>
                <span aria-hidden="true" className={cn(buttonVariants({ variant: current ? 'secondary' : 'ghost', size: 'sm' }), 'pointer-events-none ml-auto shrink-0 max-md:min-h-0 max-md:py-[5px]')}>
                  {current ? 'Current' : 'Open'}</span></NavLink>
            </li>);
        })}
      </ul>
    </Modal>);
}
