import type { ReactNode } from 'react';
import { Blocks, Building, Plug, Server, ShieldCheck, Users, LayoutGrid } from 'lucide-react';
import type { NavTab } from '@/domain/nav';
import { tid } from '@/testids';
import { Card, CardHead, Caution, IconTile, NavLink, Page, PageHead } from '@/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { useShellData, ShellLoading, ShellError } from '@/shell/shellData';
import { useAudit } from '@/api/audit';
import { formatDateTime } from '@/lib/format';
import { detail, whoLabel } from '@/features/audit/entry';

interface Section { key: string; label: string; description: string; pages: NavTab[] }

/* The prototype's icon for each section (SETUP_SECTIONS[].ic, v15:3975-3991),
   from the shared icon set. */
const ICON: Record<string, ReactNode> = { conn: <Server />, org: <Building />, mods: <Blocks />, employees: <Users />, gov: <ShieldCheck />, int: <Plug /> };

/* Ported from the prototype's admSetupIndex and SETUP_SECTIONS
   (qnipay-workforce-v15.html:9271-9281, 3975-3991): an administrator has one
   place called setup, sectioned by what it configures, not a single strip of
   a dozen-plus tabs. Each card opens the section's first reachable page; the
   tab strip then shows the rest of that section plus a way back (Shell.tsx's
   stripTabsFor). A card is the prototype's .setupcard (v15:1406-1432): a 34px
   icon tile, the section in 16px/600, the pages it holds named in 12px/600
   brand ink, and their count in a pill top right. What a section configures
   sits behind hover and focus rather than printed under every title. */
export function SetupIndex() {
  const data = useShellData();
  if (data.kind === 'loading') return <ShellLoading />;
  if (data.kind === 'error') return <ShellError onRetry={data.onRetry} onSignOut={data.onSignOut} />;
  const setup = data.nav.find(g => g.key === 'setup');
  /* a module's own setup page is reached through its module, not listed here */
  const pages = setup ? setup.tabs.filter(t => t.view !== 'asetup' && !t.module) : [];
  const sections: Section[] = [];
  pages.forEach(t => {
    if (!t.sectionKey || !t.section) return; // every setup page except asetup itself carries a section
    let s = sections.find(x => x.key === t.sectionKey);
    if (!s) { s = { key: t.sectionKey, label: t.section, description: t.sectionDescription ?? '', pages: [] }; sections.push(s); }
    s.pages.push(t);
  });
  return (
    <Page testId={tid.page('asetup')}>
      <PageHead title="Setup" tip="Everything that decides how this workforce runs, grouped by what it decides." tipTestId={tid.head.tip('asetup')}
        actions={<Caution testId={tid.head.caution('asetup')} text="Changes here apply immediately, to everyone. Drafts, approvals and scheduled releases are a future enhancement. A setting is live for the whole organisation the moment it is changed, and the change is recorded in the audit log." />} />
      <TooltipProvider delayDuration={400}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-md">
          {sections.map(s => {
            const first = s.pages[0];
            if (!first) return null;
            const descId = tid.setup.cardDescription(s.key);
            const n = s.pages.length;
            /* The description is a sibling of the link, not inside it, so it
               describes the card without becoming part of its name. */
            return (
              <div key={s.key} className="contents">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink to={first.path} testId={tid.setup.card(s.key)} aria-describedby={descId}
                      className="flex items-start gap-md rounded-card border bg-surface-card p-lg text-left transition-[border-color,box-shadow] duration-(--qp-duration-fast) ease-qp hover:border-brand hover:shadow-sm dark:hover:border-brand-accent">
                      <IconTile>{ICON[s.key] ?? <LayoutGrid />}</IconTile>
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="text-base leading-[normal] font-semibold text-text-primary">{s.label}</span>{' '}
                        <span className="mt-xs text-xs leading-[normal] font-semibold text-brand dark:text-brand-accent">{s.pages.map(p => p.label).join(' · ')}</span>
                      </span>{' '}
                      <span className="grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-pill bg-surface-tint px-xs text-xs font-bold text-text-muted">
                        <span aria-hidden="true">{n}</span><span className="sr-only">{n} page{n === 1 ? '' : 's'}</span></span>
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent>{s.description}</TooltipContent>
                </Tooltip>
                <span id={descId} data-testid={descId} className="sr-only">{s.description}</span>
              </div>);
          })}
        </div>
      </TooltipProvider>
      {data.nav.some(g => g.tabs.some(t => t.view === 'iaudit')) && <RecentChanges />}
    </Page>);
}

const RECENT = 5;
/* Recent changes (taste review 2026-10-26, Phase 2): the last five entries of
   the audit log, under the sections, so the index answers "what changed
   lately?" as well as "where do I change X?". Shown only to someone who can
   open the audit log (its own capability), in the log's own words
   (features/audit/entry.ts), and read with the log's unfiltered query, so
   opening the log after it is instant. */
function RecentChanges() {
  const audit = useAudit({});
  const items = audit.data?.items.slice(0, RECENT) ?? [];
  return (
    <Card testId={tid.setup.recent} className="mt-xl">
      <CardHead title="Recent changes" actions={<NavLink to="/setup/iaudit" testId={tid.setup.recentAll}
        className="text-xs font-semibold text-brand underline dark:text-brand-accent max-md:inline-flex max-md:min-h-touch max-md:items-center">View audit log</NavLink>} />
      {audit.isPending && <p className="text-sm text-text-secondary">Loading the latest changes&hellip;</p>}
      {audit.isError && <p data-testid={tid.setup.recentError} role="alert" className="text-sm text-err">
        The latest changes could not be loaded. The audit log has them all.</p>}
      {audit.isSuccess && items.length === 0 && <p data-testid={tid.setup.recentEmpty} className="text-sm text-text-muted">
        Nothing has changed yet. Every change anyone makes in setup appears here and in the audit log.</p>}
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map(e => (
            <li key={e.id} data-testid={tid.setup.recentRow(e.id)} className="flex flex-wrap items-baseline justify-between gap-x-lg gap-y-[2px] border-b py-sm text-sm last:border-b-0">
              {/* a 16rem base lets who and when wrap under the entry on a phone, rather than squeezing it into a column */}
              <span className="min-w-0 flex-1 basis-[16rem]"><b className="font-semibold">{e.act}</b>
                {detail(e) && <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">{detail(e)}</span>}</span>
              <span className="shrink-0 text-xs text-text-muted tabular-nums">{whoLabel(e.who)}<span aria-hidden="true"> · </span>{formatDateTime(e.at)}</span>
            </li>))}
        </ul>)}
    </Card>);
}
