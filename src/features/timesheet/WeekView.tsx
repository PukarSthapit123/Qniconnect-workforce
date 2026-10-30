import { useState, type ReactNode } from 'react';
import { Check, Clock, Minus, X } from 'lucide-react';
import { tid } from '@/testids';
import { Banner, Button, CalNav, Card, FormWarn, Meter, Pill, toastInfo, useNarrow, type Tone } from '@/ui';
import { useSubmitWeek } from '@/api/timesheets';
import type { TimesheetWeek, WeekSubmitted } from '@/contract/timesheets';
import { addDays, formatDay, isoWeek, periodStart, weekLayoutFor, weekModel } from '@/domain/timesheet';
import { envOf, flagOn, hm, typeOf } from './capture';
import { gridAs, gridTotals, initialGrid, kindFor, refusedDay, weekBody, type GridState } from './week';
import { WeekGrid, weekend } from './WeekGrid';
import { MultiWeek } from './MultiWeek';

/* The week view: tsWeekView (qnipay-workforce-v15.html:6337-6366) and the
   submit-week action (11370-11419). The submission is one
   request; what the server held back comes back with its reasons and stays on
   screen under the grid. */
const WEEK_CHIP: Record<string, { label: string; tone: Tone; glyph: ReactNode }> = {
  back: { label: 'Sent back', tone: 'err', glyph: <X /> },
  draft: { label: 'Draft · not submitted', tone: 'neu', glyph: <Minus /> },
  pend: { label: 'Awaiting approval', tone: 'info', glyph: <Clock /> },
  ok: { label: 'Approved', tone: 'ok', glyph: <Check /> },
};
/* What the week as a whole is: anything sent back first, then anything still a draft, then waiting, then approved. */
const DRAFT_CHIP = { label: 'Draft · not submitted', tone: 'neu' as Tone, glyph: <Minus /> };
export function weekChip(week: TimesheetWeek) {
  const states = week.days.filter(d => d.record).map(d => d.state);
  const key = states.includes('back') ? 'back' : !states.length || states.includes('draft') ? 'draft'
    : states.some(s => s === 'pend' || s === 'resub' || s === 'mgrok') ? 'pend' : 'ok';
  return WEEK_CHIP[key] ?? DRAFT_CHIP;
}

export function WeekView({ week, today, onAnchor, employeeId }: {
  week: TimesheetWeek; today: string; onAnchor: (date: string) => void; employeeId: string;
}) {
  const submit = useSubmitWeek();
  const [result, setResult] = useState<{ weekStart: string; res: WeekSubmitted } | null>(null);
  const c = week.capture, mgr = week.employee.manager.trim() || 'your manager';
  const pending = submit.isPending(`${employeeId}/week/${week.weekStart}`);
  const onSubmit = (state: GridState) => {
    const m = weekModel(c.fields, typeOf(c), envOf(c), c.weekGrid);
    submit.mutate({ employeeId, weekStart: week.weekStart, body: weekBody(week, state, m) }, { onSuccess: res => {
      const n = res.submitted.length;
      toastInfo(`Week ${isoWeek(week.weekStart)} submitted · ${n} day${n === 1 ? '' : 's'} · ${hm(c, res.weekMinutes)} · routed to ${mgr}`
        + (res.held.length ? ` · ${res.held.length} day${res.held.length === 1 ? '' : 's'} held back` : ''),
      res.flagged.length ? `Flagged: ${res.flagged.join('; ')}` : undefined);
      setResult({ weekStart: week.weekStart, res });
    } });
  };
  const signature = `${week.weekStart}:${week.days.map(d => d.version).join('.')}`;
  const shown = result?.weekStart === week.weekStart ? result.res : null;
  return (
    <>
      <WeekPanel key={signature} week={week} today={today} onAnchor={onAnchor} onSubmit={onSubmit} pending={pending} />
      {submit.refusal && <FormWarn testId={tid.ts.banner('week-refusal')}>{refusedDay(week, submit.refusal.field)}{submit.refusal.message} <span className="opacity-90">{submit.refusal.next}</span></FormWarn>}
      {shown && shown.held.length > 0 && <Banner testId={tid.ts.weekResult} tone="info" title={`${shown.held.length} day${shown.held.length === 1 ? '' : 's'} held back`}>
        {shown.held.map(h => <span key={h.date} className="block">{h.reason}</span>)}</Banner>}
      {flagOn(c, 'MULTIWEEK') && <MultiWeek week={week} employeeId={employeeId} />}
    </>);
}

/* Timesheet week review (2026-10-27): the week's answer leads, beside Submit week, instead of a 12px line under the
   grid. Recorded against contracted on the app's Meter, then the weekdays up to today with nothing on them: a future
   day is not blank yet, and a closed one cannot be filled. The status is the pill alone. */
function WeekAnswer({ week, minutes, dayMin }: { week: TimesheetWeek; minutes: number; dayMin: number[] }) {
  const c = week.capture, contracted = week.employee.contractedHours * 60;
  const blank = week.days.filter((d, i) => !weekend(d.date) && !d.future && !d.locked && !dayMin[i]).length;
  const figure = <><span data-testid={tid.ts.weekTotal}>{hm(c, minutes)}</span><span className="font-normal text-text-secondary">{contracted > 0
    && <> of <span data-testid={tid.ts.contracted}>{hm(c, contracted)}</span></>} recorded</span></>;
  return (
    <div data-testid={tid.ts.weekAnswer} className="flex min-w-[240px] flex-[1_1_320px] flex-wrap items-center gap-x-md gap-y-xs text-sm">
      {contracted > 0
        ? <div className="min-w-[240px] flex-[0_1_360px]"><Meter pct={(minutes / contracted) * 100} tone="ok">{figure}</Meter></div>
        : <strong className="font-semibold tabular-nums">{figure}</strong>}
      {blank > 0 && <span className="text-text-secondary">{blank} weekday{blank === 1 ? '' : 's'} still blank</span>}
    </div>);
}

function WeekPanel({ week, today, onAnchor, onSubmit, pending }: {
  week: TimesheetWeek; today: string; onAnchor: (date: string) => void; onSubmit: (s: GridState) => void; pending: boolean;
}) {
  const c = week.capture, narrow = useNarrow();
  const m = weekModel(c.fields, typeOf(c), envOf(c), c.weekGrid);
  const layout = weekLayoutFor(c.weekLayout, narrow);
  const [state, setState] = useState<GridState>(() => initialGrid(week, m, layout));
  const current = gridAs(state, kindFor(layout), m);
  const totals = gridTotals(current, m, week.days.map(d => d.date));
  const chip = weekChip(week);
  const end = addDays(week.weekStart, 6), thisWeek = periodStart(today);
  return (
    <Card>
      <div className="mb-md flex flex-wrap items-center gap-md">
        <CalNav label={`Week ${isoWeek(week.weekStart)} · ${formatDay(week.weekStart).slice(4)} – ${formatDay(end).slice(4)}`} labelTestId={tid.ts.weekLabel}
          prev={{ testId: tid.ts.weekPrev, label: 'Previous week', onClick: () => onAnchor(addDays(week.weekStart, -7)) }}
          next={{ testId: tid.ts.weekNext, label: 'Next week', onClick: () => onAnchor(addDays(week.weekStart, 7)) }}
          back={{ testId: tid.ts.weekToday, label: 'Back to this week', current: 'This week', atCurrent: week.weekStart === thisWeek, onClick: () => onAnchor(today) }} />
        <WeekAnswer week={week} minutes={totals.weekMin} dayMin={totals.dayMin} />
        <div className="ml-auto flex flex-wrap items-center gap-sm">
          <Pill testId={tid.ts.weekState} tone={chip.tone} glyph={chip.glyph}>{chip.label}</Pill>
          <Button testId={tid.ts.submitWeek} kind="primary" small pending={pending} onClick={() => onSubmit(current)}>Submit week</Button>
        </div>
      </div>
      <WeekGrid week={week} model={m} layout={layout} state={current} onChange={setState} today={today} />
    </Card>);
}
