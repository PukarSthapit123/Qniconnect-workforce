import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, ExternalLink, KeyRound, Server, ShieldCheck, UserPlus } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Card, CardHead, IconTile, Lead, LEAD_PRIMARY, Meter, NavLink, Page, PageHead, Small } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import { useBcEnvironment } from '@/shell/SessionProvider';
import { useShellData } from '@/shell/shellData';
import { useOverview } from '@/api/bc/admin';
import { authTermDays, authTone, daysRemaining, expiryAlert, expiryAlertText, formatDay, statusBadge, userCounts, type Tone3 } from '@/domain/admin';

/* Setup › Business Central › Overview: QniConnect's admin dashboard
   (docs/superpowers/inventory/admin.md, ADM.DASH) on the design system.
   Four reads, one after another, each failure read as nothing, so a call
   that fails shows zeros and "Unknown" rather than an error page (ADM.DASH.R3).
   The tenant's name now shows (R8, Ruling Q11), and "Active: 0" says so
   (R7). Setup · Employees is linked only when this account can open it: the
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

/* Ruling Q20 (taste review 2026-10-26): the overview answers "is the
   Business Central connection healthy?", so the connection leads: the
   authorization with its days left measured against its term, the active
   environment and the environment count, the expiry banner inside it, and
   Refresh authorization as its one primary action (QniConnect's third quick
   action, moved here, so it is not offered twice). The portal users are one
   strip of four counts (the four stat tiles and the separate Portal users
   card showed them twice). The other quick actions and the resources share
   one row, each sized to its content. Every ADM.DASH figure, text and link
   is kept. */
function Overview({ data, envName, envType, people }: {
  data: NonNullable<ReturnType<typeof useOverview>['data']>; envName: string | null; envType: string | null; people: string | null;
}) {
  const counts = userCounts(data.users);
  const days = daysRemaining(data.auth.expiresAt);
  const alert = expiryAlert(days);
  const badge = statusBadge(data.auth.status);
  const tone = authTone(data.auth.status, days);
  const term = authTermDays(data.auth.issuedAt, data.auth.expiresAt);
  const remaining = days === null ? 'Expiry unknown' : `Remaining: ${days} day${days === 1 ? '' : 's'}`;
  return (
    <>
      <Small testId={tid.aoverview.tenant} className="-mt-sm mb-lg text-sm">
        Tenant: <b className="font-semibold text-text-primary">{data.tenant.name}</b>
        <span aria-hidden="true"> · </span><span data-testid={tid.aoverview.registered}>Registered: {formatDay(data.tenant.registrationDate)}</span>
      </Small>

      {/* the answer, on the dark lead surface (ui/Lead); status inks there are the light ones (tokens.css, inverse) */}
      <Lead testId={tid.aoverview.connection} labelledBy="aoverview-connection-head">
        <div className="mb-md flex flex-wrap items-center justify-between gap-md">
          <h2 id="aoverview-connection-head">Business Central connection</h2>
          <NavLink to="/setup/aauth" testId={tid.aoverview.action('authorization')} className={cn(buttonVariants({ size: 'sm' }), LEAD_PRIMARY, 'motion-reduce:active:scale-100')}>
            <KeyRound aria-hidden="true" />Refresh authorization</NavLink>
        </div>
        {alert && (
          <Banner testId={tid.aoverview.expiry} tone={alert} title={days !== null && days > 0 ? 'Authorization expiring soon' : 'Authorization needs refreshing'}
            actions={<NavLink to="/setup/aauth" testId={tid.aoverview.expiryLink} className="inline-flex min-h-touch items-center gap-xs text-sm font-semibold underline md:min-h-0">Manage authorization</NavLink>}>
            {expiryAlertText(days)}
          </Banner>)}
        <div className="grid gap-x-2xl gap-y-lg md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)]">
          <Figure label="Authorization" testId={tid.aoverview.stat('auth')} tone={tone}
            foot={days !== null && term
              /* the days left, as a share of the whole term; the words carry it, the bar repeats it */
              ? <Meter testId={tid.aoverview.meter} pct={(Math.max(0, days) / term) * 100} tone={METER[tone]} inverse>{remaining}</Meter>
              : remaining}>{badge?.label ?? 'Unknown'}</Figure>
          <Figure label="Active environment" testId={tid.aoverview.stat('environment')} foot={`Type: ${envType || 'N/A'}`}>
            <span className="block truncate">{envName || 'None'}</span></Figure>
          <Figure label="Environments" testId={tid.aoverview.stat('environments')}>{data.environments.length}</Figure>
        </div>
      </Lead>

      <section data-testid={tid.aoverview.users} aria-labelledby="aoverview-users-head" className="mb-md rounded-card border bg-surface-card px-xl py-lg max-md:p-lg">
        <div className="mb-md flex flex-wrap items-center justify-between gap-md">
          <h2 id="aoverview-users-head" className="text-base">Portal users</h2>
          {people && <NavLink to={people} testId={tid.aoverview.usersAll}
            className="text-xs font-semibold text-brand underline dark:text-brand-accent max-md:inline-flex max-md:min-h-touch max-md:items-center">View all users</NavLink>}
        </div>
        {/* one strip, divided by rules: two by two on a phone */}
        <dl className="grid grid-cols-4 max-md:grid-cols-2 max-md:gap-y-md md:divide-x">
          <Count label="Total" testId={tid.aoverview.stat('users')} n={counts.total} />
          <Count label="Active" testId={tid.aoverview.tile('active')} n={counts.active} />
          <Count label="Pending" testId={tid.aoverview.tile('pending')} n={counts.pending} />
          <Count label="Inactive" testId={tid.aoverview.tile('inactive')} n={counts.inactive} />
        </dl>
      </section>

      <div className="grid items-start gap-md lg:grid-cols-2">
        <Card>
          <CardHead title="Quick actions" />
          <ul className="flex flex-col">
            {people && <QuickAction id="user" icon={<UserPlus />} title="Add user" desc="Create a new portal user account" to={people} cta="Add user" />}
            <QuickAction id="environment" icon={<Server />} title="Add environment" desc="Connect a new Business Central environment" to="/setup/aenv" cta="Add environment" />
          </ul>
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

const METER = { good: 'ok', warn: 'warn', bad: 'err' } as const;
const TONE = { good: 'text-ok', warn: 'text-warn', bad: 'text-err' } as const;

/* A figure of the connection block, on the dark lead surface: its name in
   the muted shell ink, the value (in the status colour for the
   authorization, ADM.DASH.R5), and a line under it in the pale shell ink. */
function Figure({ label, testId, tone, foot, children }: { label: string; testId: string; tone?: Tone3; foot?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-shell-ink-muted">{label}</div>
      <div data-testid={testId} className={cn('mt-[2px] text-2xl leading-[1.15] font-semibold tabular-nums', tone && TONE[tone])}>{children}</div>
      {foot && <div className="mt-xs text-xs text-shell-ink">{foot}</div>}
    </div>);
}

/* one count of the portal users strip: the figure over its name */
function Count({ label, testId, n }: { label: string; testId: string; n: number }) {
  return (
    <div className="flex flex-col-reverse px-lg first:pl-0 max-md:px-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd data-testid={testId} className="text-2xl leading-[1.15] font-semibold tabular-nums">{n}</dd>
    </div>);
}

/* A quick action: the whole row is the link, so it presses as one. Only the
   press is timed: the hover tint lands at once, with the arrow's nudge (a
   pointer that can hover only), as the setup cards do. */
function QuickAction({ id, icon, title, desc, to, cta }: { id: string; icon: ReactNode; title: string; desc: string; to: string; cta: string }) {
  return (
    <li className="border-b last:border-b-0">
      <NavLink to={to} testId={tid.aoverview.action(id)}
        className="group flex items-center gap-md rounded-sm px-xs py-sm text-sm transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none hover:bg-surface-tint active:scale-[0.99] motion-reduce:active:scale-100 max-md:min-h-touch">
        <IconTile>{icon}</IconTile>
        <span className="min-w-0 flex-1"><b className="block font-semibold">{title}</b><span className="block text-xs text-text-muted">{desc}</span></span>
        <span className="inline-flex shrink-0 items-center gap-xs text-xs font-semibold text-brand dark:text-brand-accent max-md:sr-only">{cta}
          <ArrowRight aria-hidden="true" className="size-[13px] transition-transform duration-(--dur-press) ease-(--ease-out) [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-[2px] motion-reduce:transition-none" /></span>
      </NavLink>
    </li>);
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
