import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, ExternalLink, KeyRound, Server, ShieldCheck, UserPlus } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Card, CardHead, IconTile, NavLink, Page, PageHead, Small, Stat, Stats } from '@/ui';
import { useBcEnvironment } from '@/shell/SessionProvider';
import { useShellData } from '@/shell/shellData';
import { useOverview } from '@/api/bc/admin';
import { authTone, daysRemaining, expiryAlert, expiryAlertText, formatDay, statusBadge, userCounts } from '@/domain/admin';

/* Setup › Business Central › Overview: QniConnect's admin dashboard
   (docs/superpowers/inventory/admin.md, ADM.DASH) on the design system.
   Four reads, one after another, each failure read as nothing, so a call
   that fails shows zeros and "Unknown" rather than an error page (ADM.DASH.R3).
   The tenant's name now shows (R8, Ruling Q11), and "Active: 0" says so
   (R7). People & access is linked only when this account can open it: the
   portal users live there, beside the Workforce record (Task 20). */
export function OverviewPage() {
  const env = useBcEnvironment();
  const q = useOverview(env);
  const shell = useShellData();
  const reach = (view: string) => shell.kind === 'ready' && shell.nav.some(g => g.tabs.some(t => t.view === view)) ? `/setup/${view}` : null;
  const people = reach('aemployees');
  return (
    <Page testId={tid.page('aoverview')}>
      <PageHead title="Overview" tip="Management console for the QniConnect employee portal." tipTestId={tid.head.tip('aoverview')} />
      {q.isPending || !q.data
        ? <p data-testid={tid.aoverview.loading} role="status" className="text-text-secondary">Loading the overview&hellip;</p>
        : <Overview data={q.data} envName={env?.name ?? null} envType={typeof env?.type === 'string' ? env.type : null} people={people} />}
    </Page>);
}

function Overview({ data, envName, envType, people }: {
  data: NonNullable<ReturnType<typeof useOverview>['data']>; envName: string | null; envType: string | null; people: string | null;
}) {
  const counts = userCounts(data.users);
  const days = daysRemaining(data.auth.expiresAt);
  const alert = expiryAlert(days);
  const badge = statusBadge(data.auth.status);
  return (
    <>
      <Small testId={tid.aoverview.tenant} className="-mt-sm mb-lg text-sm">
        Tenant: <b className="font-semibold text-text-primary">{data.tenant.name}</b>
        <span aria-hidden="true"> · </span><span data-testid={tid.aoverview.registered}>Registered: {formatDay(data.tenant.registrationDate)}</span>
      </Small>
      <Stats>
        <Stat label="Total users" testId={tid.aoverview.stat('users')} foot={`Active: ${counts.active}`}>{counts.total}</Stat>
        <Stat label="Environments" testId={tid.aoverview.stat('environments')}>{data.environments.length}</Stat>
        <Stat label="Authorization" testId={tid.aoverview.stat('auth')} tone={authTone(data.auth.status, days)}
          foot={days === null ? 'Expiry unknown' : `Remaining: ${days} day${days === 1 ? '' : 's'}`}>{badge?.label ?? 'Unknown'}</Stat>
        <Stat label="Active environment" testId={tid.aoverview.stat('environment')} foot={`Type: ${envType || 'N/A'}`}>
          <span className="block truncate">{envName || 'None'}</span></Stat>
      </Stats>
      {alert && (
        <Banner testId={tid.aoverview.expiry} tone={alert} title={days !== null && days > 0 ? 'Authorization expiring soon' : 'Authorization needs refreshing'}
          actions={<NavLink to="/setup/aauth" testId={tid.aoverview.expiryLink} className="inline-flex min-h-touch items-center gap-xs text-sm font-semibold underline md:min-h-0">Manage authorization</NavLink>}>
          {expiryAlertText(days)}
        </Banner>)}

      <h2 className="mt-xl mb-md">Quick actions</h2>
      <div className="mb-md grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-md">
        {people && <QuickAction id="user" icon={<UserPlus />} title="Add user" desc="Create a new portal user account" to={people} cta="Add user" />}
        <QuickAction id="environment" icon={<Server />} title="Add environment" desc="Connect a new Business Central environment" to="/setup/aenv" cta="Add environment" />
        <QuickAction id="authorization" icon={<KeyRound />} title="Refresh authorization" desc="Update the Business Central OAuth authorization" to="/setup/aauth" cta="Go to authorization" />
      </div>

      <div className="grid gap-md lg:grid-cols-2">
        <Card testId={tid.aoverview.users}>
          <CardHead title="Portal users" actions={people && <NavLink to={people} testId={tid.aoverview.usersAll}
            className="text-xs font-semibold text-brand underline dark:text-brand-accent max-md:inline-flex max-md:min-h-touch max-md:items-center">View all users</NavLink>} />
          <div className="grid grid-cols-3 gap-sm">
            <Tile id="active" label="Active" n={counts.active} />
            <Tile id="pending" label="Pending" n={counts.pending} />
            <Tile id="inactive" label="Inactive" n={counts.inactive} />
          </div>
        </Card>
        <Card>
          <CardHead title="Business Central resources" />
          <ul className="flex flex-col">
            <Resource id="docs" icon={<BookOpen />} href="https://learn.microsoft.com/en-us/dynamics365/business-central/"
              title="Business Central documentation" desc="Official Microsoft documentation for Business Central" />
            <Resource id="s2s" icon={<ShieldCheck />} href="https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication"
              title="Service-to-service authentication guide" desc="Learn about OAuth and service-to-service authentication" />
          </ul>
        </Card>
      </div>
    </>);
}

/* A quick action card: the whole card is the link, so it presses as one.
   Only the press is timed: the hover border lands at once, with the arrow's
   nudge (a pointer that can hover only), as the setup cards do. */
function QuickAction({ id, icon, title, desc, to, cta }: { id: string; icon: ReactNode; title: string; desc: string; to: string; cta: string }) {
  return (
    <NavLink to={to} testId={tid.aoverview.action(id)}
      className="group flex flex-col gap-sm rounded-card border bg-surface-card p-lg transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none hover:border-brand active:scale-[0.98] motion-reduce:active:scale-100 dark:hover:border-brand-accent">
      <span className="flex items-center gap-md"><IconTile>{icon}</IconTile><b className="text-sm font-semibold">{title}</b></span>
      <span className="text-xs text-text-muted">{desc}</span>
      <span className="mt-auto inline-flex items-center gap-xs text-xs font-semibold text-brand dark:text-brand-accent">{cta}
        <ArrowRight aria-hidden="true" className="size-[13px] transition-transform duration-(--dur-press) ease-(--ease-out) [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-[2px] motion-reduce:transition-none" /></span>
    </NavLink>);
}

function Tile({ id, label, n }: { id: string; label: string; n: number }) {
  return (
    <div className="rounded-sm bg-surface-tint px-md py-sm text-center">
      <div data-testid={tid.aoverview.tile(id)} className="text-xl font-semibold tabular-nums">{n}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>);
}

function Resource({ id, icon, href, title, desc }: { id: string; icon: ReactNode; href: string; title: string; desc: string }) {
  return (
    <li className="border-b last:border-b-0">
      <a data-testid={tid.aoverview.resource(id)} href={href} target="_blank" rel="noopener noreferrer"
        className={cn('flex items-start gap-md rounded-sm px-xs py-sm text-sm select-none hover:bg-surface-tint focus-visible:shadow-focus active:bg-surface-tint max-md:min-h-touch')}>
        <IconTile>{icon}</IconTile>
        <span className="min-w-0 flex-1"><b className="flex items-center gap-xs font-semibold">{title}
          <ExternalLink aria-hidden="true" className="size-[13px] text-text-muted" /><span className="sr-only">(opens in a new tab)</span></b>
          <span className="block text-xs text-text-muted">{desc}</span></span>
      </a>
    </li>);
}
