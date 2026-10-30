import { ArrowRight } from 'lucide-react';
import { tid } from '@/testids';
import { NavLink } from '@/ui';
import { useCurrentSession } from '@/shell/SessionProvider';
import { useTenant } from '@/api/tenant';
import { useHome } from '@/api/home';
import { useMyClock } from '@/api/clock';
import type { ClockStateKey, MyClock } from '@/contract/clock';
import type { HomeMonth } from '@/contract/home';
import { buildNav } from '@/domain/nav';
import { GLYPHS } from '@/domain/home';
import { clockTime } from '@/domain/clock';
import { formatTime } from '@/domain/time';

/* Home's Today strip (taste review 2026-10-26, decision D2): today's clock
   or timesheet state and this week's hours against the contract, linking to
   the timesheet. New scope beyond QniConnect's Home (Ruling Q19). It shows
   exactly when the nav offers Timesheet (buildNav's own rule: own_ts, the
   module on, not onboarding), and only once its figures are read: Home's
   own answer, the payslip, never waits on it, and a strip that cannot be
   read is left out rather than shown half empty. */
export function TodayStrip() {
  const session = useCurrentSession(), tenant = useTenant();
  if (!session || !tenant.data) return null;
  const nav = buildNav({ caps: new Set(session.capabilities), modules: tenant.data.modules, flags: tenant.data.flags, onboarding: session.onboarding, portalAdmin: false });
  if (!nav.some(g => g.tabs.some(t => t.view === 'ts'))) return null;
  return <Today />;
}

const CLOCK_SHORT: Readonly<Record<ClockStateKey, string>> = {
  idle: 'Not clocked in', running: 'Clocked in', onBreak: 'On break', clockedOut: 'Clocked out',
};

/* A clock-mode employee sees the clock (D4's gates: live and entered by
   clock); anyone else sees today's timesheet as My Calendar has it. */
function todayText(m: HomeMonth, c: MyClock | undefined): string {
  if (c?.gates.live && c.gates.mode === 'clock') {
    const state = c.current?.state ?? 'idle', first = c.current?.events.find(e => e.kind === 'in');
    return state === 'running' && first ? `Clocked in since ${formatTime(clockTime(first.at))}` : CLOCK_SHORT[state];
  }
  const d = m.todayDay, glyph = d.glyph ? GLYPHS[d.glyph].label.split(',')[0] : '';
  return d.ts?.text ? `${glyph || 'Recorded'} · ${d.ts.text} today` : 'Nothing recorded today';
}

function Today() {
  const home = useHome(''), clock = useMyClock();
  const m = home.data;
  if (!m?.can.recordHours) return null;
  const w = m.week, hours = Math.round(w.minutes / 6) / 10;
  return (
    <section data-testid={tid.home.today} aria-label="Today"
      className="mb-md flex flex-wrap items-center gap-x-xl gap-y-xs rounded-card border bg-surface-card px-lg py-md text-sm">
      <span className="font-semibold">Today</span>
      <span data-testid={tid.home.todayState}>{todayText(m, clock.data)}</span>
      <span data-testid={tid.home.todayWeek} className="text-text-secondary tabular-nums">
        {w.contracted > 0 ? `${hours}h of ${w.contracted}h contracted this week` : `${hours}h this week`}</span>
      <NavLink to="/work/ts" testId={tid.home.todayLink}
        className="ml-auto inline-flex items-center gap-xs font-semibold text-brand underline-offset-2 hover:underline dark:text-brand-accent max-md:ml-0 max-md:min-h-touch">
        Open timesheet<ArrowRight aria-hidden="true" className="size-4" /></NavLink>
    </section>);
}
