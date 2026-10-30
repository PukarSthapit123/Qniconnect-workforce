import { useState } from 'react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Banner, Card, CalNav, NavLink, Page, PageHead, Stat, Stats } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import { ApiError } from '@/api/client';
import { useHome, type HomeDay, type HomeMonth } from '@/api/home';
import { MONTH_SHORT, formatDay, formatDmy, parseIso, periodStart, weekHeads } from '@/domain/time';
import { GLYPHS, shiftMonth } from '@/domain/home';
import { DayDialog } from './DayDialog';

/* My Calendar: the prototype's essHome (qnipay-workforce-v15.html:5316-5416),
   Workforce's My home until Task 16 gave Home to QniConnect's payslip
   dashboard. It shows the timesheet layer, bank holidays and today (D16).
   The month is the page: what you recorded is reached by opening the day it
   belongs to.
   The server paints every day (GET /api/v1/home); this draws it. A month
   outside the window (the month before this one to twelve months ahead) is not
   offered: the arrows stop there. */
export function MyCalendarPage() {
  /* '' is the server's current month */
  const [month, setMonth] = useState('');
  const q = useHome(month);
  const m = q.data;
  const refused = q.error instanceof ApiError ? q.error.refusal : null;
  return (
    <Page testId={tid.page('cal')}>
      <PageHead title="My Calendar" context={m?.who} />
      {q.isError && !m && <p data-testid={tid.cal.error} role="alert" className="text-err">
        {refused && refused.code !== 'network' ? `${refused.message} ${refused.next}` : 'Your month could not be loaded. Reload the page to try again.'}</p>}
      {!m && !q.isError && <p data-testid={tid.cal.loading} role="status" className="text-text-secondary">Loading your month&hellip;</p>}
      {m && <Home m={m} month={month} stale={q.isPlaceholderData} onMonth={setMonth} />}
    </Page>);
}

function Home({ m, month, stale, onMonth }: { m: HomeMonth; month: string; stale: boolean; onMonth: (month: string) => void }) {
  const [open, setOpen] = useState<HomeDay | null>(null);
  /* the arrows step from the month asked for: while the next one loads, m is still the last one read (review row 75) */
  const at = month || m.month;
  return (
    <>
      {m.sentBack && <Banner testId={tid.cal.sentBack} tone="err" title={`A timesheet was sent back · ${formatDmy(m.sentBack.date)}`}
        actions={m.can.recordHours && <NavLink testId={tid.cal.fixIt} to={`/work/ts?date=${m.sentBack.date}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Fix it</NavLink>}>
        {m.sentBack.reason}</Banner>}
      <Figures m={m} />
      <Card>
        {/* .cardhead: the month with its arrows, and what the month holds on the right */}
        <div className="mb-md flex flex-wrap items-center gap-sm">
          <CalNav label={m.label} labelTestId={tid.cal.month}
            prev={{ testId: tid.cal.prev, label: 'Previous month', disabled: at <= m.bounds.min, onClick: () => onMonth(shiftMonth(at, -1)) }}
            next={{ testId: tid.cal.nextMonth, label: 'Next month', disabled: at >= m.bounds.max, onClick: () => onMonth(shiftMonth(at, 1)) }}
            back={{ testId: tid.cal.thisMonth, label: 'This month', current: 'This month', atCurrent: at === m.thisMonth, onClick: () => onMonth(m.thisMonth) }} />
          {m.summary && <span data-testid={tid.cal.summary} className="ml-auto text-xs text-text-muted">{m.summary}</span>}
        </div>
        {/* .calm: the day heads follow the tenant's week start. */}
        <div data-testid={tid.cal.grid} aria-busy={stale || undefined} className={cn('grid grid-cols-7 gap-xs', stale && 'opacity-60')}>
          {weekHeads().map(d => <div key={d} aria-hidden="true" data-caps className="pb-xs text-center text-xs font-bold tracking-(--qp-tracking-caps) text-text-muted uppercase">{d}</div>)}
          {Array.from({ length: m.leadingBlanks }, (_, i) => <div key={`blank-${i}`} aria-hidden="true" />)}
          {m.days.map(d => <DayCell key={d.date} d={d} onOpen={() => setOpen(d)} />)}
        </div>
        <MonthKeyLine m={m} />
      </Card>
      {open && <DayDialog m={m} day={open} onClose={() => setOpen(null)} />}
    </>);
}

/* The figures above the month (.stats): today's timesheet and this week's
   hours while the timesheet is on. The week's hours are every day recorded in
   it, drafts included, the same measure as the month's "45.0h recorded"; the
   foot says so and names the week, so the two read apart (taste review
   2026-10-26, Phase 1 item 5). */
function Figures({ m }: { m: HomeMonth }) {
  const t = m.todayDay, w = m.week;
  const hours = Math.round(w.minutes / 6) / 10;
  const recorded = `recorded in the week from ${formatDay(periodStart(m.today))}`;
  if (!m.can.recordHours) return null;
  return (
    <Stats>
      {m.can.recordHours && <Stat label="Today’s timesheet" testId={tid.cal.today}>
        <span className="text-lg">{t.ts?.text || '—'}</span>
      </Stat>}
      {m.can.recordHours && <Stat label="Hours this week" testId={tid.cal.week}
        foot={w.contracted > 0 ? `${recorded}, of ${w.contracted}h contracted` : `${recorded} · bank, no contracted baseline`}>{hours}h</Stat>}
    </Stats>);
}
/* ----------------------------------------------------------------- a day */
/* .calc (v15:1312-1343, 1357-1358): today is
   ringed in the brand, a day still to come is dimmed. The prototype dims the whole cell to .74
   and the recorded time to .75, which takes the muted inks
   below AA; here a day to come has its number in the muted ink and the
   recorded time is in the secondary ink, both at full strength. The state is
   one glyph. */
/* .cst.ok/.pend/.draft/.att/.mut (v15:1336-1340), and the key's .cst-i (1350-1355): one set, so a glyph cannot drift from its key */
const GLYPH_INK = { ok: 'text-ok', pend: 'text-info', draft: 'text-warn', att: 'text-err', mut: 'text-text-muted' } as const;
const ICON_FIT = 'inline-flex items-center [&_svg]:size-[1em]';

/* What a cell says to a screen reader: "13 Aug, Approved, 7h 30m recorded". */
function cellLabel(d: HomeDay): string {
  const dt = parseIso(d.date);
  return [`${dt.getUTCDate()} ${MONTH_SHORT[dt.getUTCMonth()] ?? ''}`, d.bankHoliday, d.glyph ? GLYPHS[d.glyph].label : '',
    d.ts?.text ? `${d.ts.text} recorded` : ''].filter(Boolean).join(', ');
}

function DayCell({ d, onOpen }: { d: HomeDay; onOpen: () => void }) {
  const g = d.glyph ? GLYPHS[d.glyph] : null;
  return (
    <button type="button" data-testid={tid.cal.day(d.date)} data-glyph={d.glyph ?? undefined}
      data-future={d.future || undefined} aria-label={cellLabel(d)} onClick={onOpen}
      className={cn('flex min-h-14 min-w-0 cursor-pointer flex-col items-stretch gap-[2px] overflow-hidden rounded-sm border border-l-3 border-l-transparent bg-surface-card px-[6px] py-[5px] text-left text-xs',
        /* a day is opened tens of times a month: the press tints at once, nothing scales or fades */
        'hover:border-y-brand hover:border-r-brand active:bg-surface-tint dark:hover:border-y-brand-accent dark:hover:border-r-brand-accent',
        d.today && 'border-2 border-brand dark:border-brand-accent')}>
      <span className={cn('text-xs font-bold', d.future && 'text-text-muted')}>{parseIso(d.date).getUTCDate()}</span>
      {/* a phone cell is about 34px: "BH" there, the name in its label and in the day dialog */}
      {d.bankHoliday && <span className="text-xs leading-(--qp-lh-12) text-text-muted"><span className="max-md:hidden">Bank holiday</span><span aria-hidden="true" className="md:hidden">BH</span></span>}
      {(g || d.ts?.text) && <span className={cn('mt-auto flex items-center gap-xs text-xs font-bold', GLYPH_INK[g?.tone ?? 'mut'])}>
        {g && <span aria-hidden="true" className={ICON_FIT}>{g.glyph}</span>}
        {d.ts?.text && <span className="font-semibold tabular-nums text-text-secondary max-md:hidden">{d.ts.text}</span>}</span>}
    </button>);
}

/* calKey (v15:6244-6256) and .callegend (1344-1371): only what this month
   holds, each with its count, in the calendar's own colours. */
function MonthKeyLine({ m }: { m: HomeMonth }) {
  const k = m.key;
  const n = (c: number) => <b className="font-semibold text-text-primary">{c}</b>;
  const item = 'flex items-center gap-[5px]';
  return (
    <div data-testid={tid.cal.key} className="mt-md flex flex-wrap gap-md text-xs text-text-muted">
      {!k.states.length && <span data-testid={tid.cal.keyEmpty} className={item}>Nothing recorded this month yet</span>}
      {k.states.map(s => <span key={s.key} data-testid={tid.cal.keyItem('state', s.key)} className={item}>
        <b aria-hidden="true" className={cn('font-bold', ICON_FIT, GLYPH_INK[s.tone])}>{s.glyph}</b> {s.label} {n(s.count)}</span>)}
    </div>);
}
