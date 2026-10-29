import { useState, type ReactNode } from 'react';
import { Check, Clock, History, Lock, Minus, RotateCw, X } from 'lucide-react';
import { tid } from '@/testids';
import { Banner, Button, CalNav, Card, CardHead, ConfirmModal, Field, Pill, SelectBox, Small, SwitchField, TextInput, Tip, toastInfo, type Tone } from '@/ui';
import { useMyClock, type ClockRecord, type MyClock } from '@/api/clock';
import type { DaySaved, TimesheetWeek, WeekDay } from '@/contract/timesheets';
import { CLOCK_OUT_FIRST } from '@/domain/clock';
import { addDays, formatDay, formatDmy, mgrokLabel } from '@/domain/timesheet';
import { dayIndex } from '@/domain/time';
import { NON_WORKING_REASONS, formGroups, hm, valuesFromDay } from './capture';
import { ClockCard, ForgottenClock, clockedStart } from './ClockCard';
import { DayFields, DayStatsCard, hasClosedGroups } from './DayForm';
import { DayChecks, holdFocus, useDayEntry } from './useDayEntry';

/* The day chip: the prototype's stMap in essTimesheet (qnipay-workforce-v15.html:6263-6266),
   with the glyphs from the shared icon set. A resubmission reads as awaiting approval, as dayInfo maps it. */
const CHIP: Record<string, { label: string; tone: Tone; glyph: ReactNode }> = {
  ok: { label: 'Approved', tone: 'ok', glyph: <Check /> },
  pend: { label: 'Awaiting approval', tone: 'info', glyph: <Clock /> },
  resub: { label: 'Awaiting approval', tone: 'info', glyph: <Clock /> },
  mgrok: { label: 'Approved by manager, waiting on payroll', tone: 'info', glyph: <Clock /> },
  draft: { label: 'Draft · not submitted', tone: 'neu', glyph: <Minus /> },
  back: { label: 'Sent back', tone: 'err', glyph: <X /> },
  future: { label: 'Not yet open', tone: 'neu', glyph: <Minus /> },
  none: { label: 'Nothing logged', tone: 'neu', glyph: <Minus /> },
};
const NONE_CHIP = { label: 'Nothing logged', tone: 'neu' as Tone, glyph: <Minus /> };
/* A day with nothing recorded is not yet open when it has not come yet (dayInfo). */
export function dayChip(day: WeekDay) {
  const key = day.state !== 'none' ? day.state : day.future ? 'future' : 'none';
  const chip = CHIP[key] ?? NONE_CHIP;
  /* module 8 review M3: an mgrok day names the layer it waits on */
  return key === 'mgrok' ? { ...chip, label: mgrokLabel(day.record?.waitingOn) } : chip;
}

/* The day view: tsDayView (qnipay-workforce-v15.html:6277-6336). The panel
   is keyed by the day and its version, so after a save the form starts again
   from what the server stored, never from what was typed (no optimistic
   updates); a clock out writes the day, so its times appear the same way.
   A clock-mode type (module 2b) reads its own clock: the card shows on the
   day the clock acts on while the server's gates allow it (D4), and a clock
   left open on an earlier day shows its close banner (D6). */
const FIRST_DAY = 'This is the first day of the week, so there is no earlier day to copy.';
export interface DayClock { card: MyClock | null; readAt: number; open: ClockRecord | null; openBlocked: MyClock['openBlocked'] }
export function DayView({ week, date, today, onDate, employeeId }: {
  week: TimesheetWeek; date: string; today: string; onDate: (d: string) => void; employeeId: string;
}) {
  const q = useMyClock(week.capture.mode === 'clock'), c = q.data;
  const day = week.days.find(d => d.date === date);
  if (!day) return null;
  /* review I3: the card follows the current clock wherever it started: on its own day, and on today's view; so does a new
     clock that goes on the night line of the day before (review M1) */
  const onCard = c ? date === c.date || date === c.now.date : false;
  const clock: DayClock = { card: c?.gates.show && onCard ? c : null, readAt: q.dataUpdatedAt,
    open: c?.gates.live && c.gates.mode === 'clock' ? c.open : null, openBlocked: c?.openBlocked ?? null };
  return <DayPanel key={`${date}:${day.version}`} week={week} day={day} today={today} onDate={onDate} employeeId={employeeId} clock={clock} />;
}

function entryTip(week: TimesheetWeek, clocking: boolean) {
  const c = week.capture;
  const first = c.mode === 'clock' && clocking ? 'Clock in when you start and out when you finish.'
    : c.mode === 'grid' ? 'Enter this day here, or switch to Week to fill the whole week at once.'
      : 'Enter your start and finish times for this day.';
  const mand = formGroups(c).some(g => g.fields.some(f => f.setting.mand));
  return mand ? `${first} Fields marked required are required for ${week.employee.typeName}.` : first;
}

function DayPanel({ week, day, today, onDate, employeeId, clock }: {
  week: TimesheetWeek; day: WeekDay; today: string; onDate: (d: string) => void; employeeId: string; clock: DayClock;
}) {
  const c = week.capture, rec = day.record, mgr = week.employee.manager.trim() || 'your manager';
  const flagged = (r: DaySaved) => (r.warnings.length ? `Flagged: ${r.warnings.join(' ')}` : undefined);
  const entry = useDayEntry({ week, day, employeeId,
    onSaved: res => toastInfo(`Draft saved · ${hm(c, res.record.minutes)} · not submitted yet`, flagged(res)),
    onSubmitted: res => toastInfo(res.record.state === 'resub'
      ? `Resubmitted · ${formatDmy(day.date)} · back with ${mgr}`
      : `Day submitted · ${hm(c, res.record.minutes)} · routed to ${mgr} for sign-off`, flagged(res)) });
  const savedReason = rec && !rec.entries.length ? rec.nonWorkingReason : '';
  const [nonwork, setNonwork] = useState(Boolean(savedReason));
  const [reason, setReason] = useState(() => savedReason.split(' · ')[0] || NON_WORKING_REASONS[0]);
  const [notes, setNotes] = useState(() => savedReason.split(' · ').slice(1).join(' · '));
  /* lockShiftTimes: while the shift runs the start is the clock's first clock in, and start and finish are read-only.
     The finish is empty, not the rota line's, so the stats wait for clock out; and the day cannot be saved or
     submitted until then, since the clock writes it when it stops (review I1). */
  /* only the clock's own day is held: a clock from an earlier day shown on today leaves today's form alone */
  const own = clock.card?.current?.date === day.date ? clock.card.current : null;
  const clockStart = clockedStart(own, rec?.entries[0]?.start);
  const [filled, setFilled] = useState<string | null>(null);
  if (clockStart && clockStart !== filled) {
    setFilled(clockStart);
    if (entry.fields.values.start !== clockStart || entry.fields.values.finish) entry.fill({ start: clockStart, finish: '' });
  }
  const locked = clockStart ? ['start', 'finish'] : undefined;
  const { busy, busyKind, fields, stats } = entry, chip = dayChip(day);
  const lockedTitle = day.locked ? day.lockNote : undefined;
  const running = clockStart != null, held = day.locked || running, heldTitle = day.locked ? lockedTitle : running ? CLOCK_OUT_FIRST : undefined;
  /* review row 10: the times on the form differ from the saved day; a running clock fills its own start, which is not an edit */
  const dirty = !running && JSON.stringify(fields.values) !== JSON.stringify(valuesFromDay(day, c));
  const [leaving, setLeaving] = useState<string | null>(null);
  const moveTo = (d: string) => { if (dirty) setLeaving(d); else onDate(d); };

  /* submit-nonwork: a reason and no times, routed to the approver like any day */
  const submitReason = () => entry.submit.mutate(
    { employeeId, date: day.date, version: day.version, body: { entries: [], nonWorkingReason: notes.trim() ? `${reason} · ${notes.trim()}` : reason } },
    { onSuccess: () => toastInfo(`Reason submitted · ${reason} · routed to ${mgr}`) });
  /* copy-day: yesterday's recorded entry */
  const copyYesterday = () => {
    const y = week.days[dayIndex(day.date) - 1];
    if (!y) return;
    if (!y.record?.entries.length) { toastInfo('Nothing recorded yesterday to copy'); return; }
    const from = valuesFromDay(y, c);
    entry.fill(from);
    toastInfo(`Filled from yesterday · ${typeof from.start === 'string' ? from.start : ''}`);
  };
  const side = hasClosedGroups(c), first = dayIndex(day.date) === 0;
  return (
    <>
      <Card className="px-lg py-md">
        <div className="flex flex-wrap items-center gap-md">
          <CalNav label={formatDay(day.date)} labelTestId={tid.ts.dayLabel}
            prev={{ testId: tid.ts.dayPrev, label: 'Previous day', onClick: () => moveTo(addDays(day.date, -1)) }}
            next={{ testId: tid.ts.dayNext, label: 'Next day', onClick: () => moveTo(addDays(day.date, 1)) }}
            back={{ testId: tid.ts.dayToday, label: 'Back to today', current: 'Today', atCurrent: day.date === today, onClick: () => moveTo(today) }} />
          <div className="ml-auto flex flex-wrap items-center gap-sm">
            <label className="flex items-center gap-[9px] text-xs">Non-working day
              <SwitchField testId={tid.ts.nonWorking} aria-label="Mark as a non-working day" checked={nonwork}
                onCheckedChange={v => setNonwork(v)} /></label>
            <Button testId={tid.ts.copyDay} kind="ghost" small disabled={first} title={first ? FIRST_DAY : undefined} onClick={copyYesterday}>Copy yesterday</Button>
            {day.clock?.closedLate && <Pill testId={tid.clock.closedLate} tone="neu" glyph={<History />}>Closed later</Pill>}
            <Pill testId={tid.ts.dayState} tone={chip.tone} glyph={chip.glyph}>{chip.label}</Pill>
          </div>
        </div>
      </Card>
      {/* review row 11: why a day was sent back, or why it is closed, is read before the form */}
      {day.state === 'back' && <Banner testId={tid.ts.banner('back')} tone="err" icon={<X />} title="Sent back for correction">
        {rec?.returnReason}<br />Correct the entry and submit again. It will go back to {mgr} as a resubmission.</Banner>}
      {day.state === 'resub' && <Banner testId={tid.ts.banner('resub')} tone="info" icon={<RotateCw />} title="Resubmitted">
        Corrected and sent back to {mgr}. Awaiting a decision.</Banner>}
      {day.locked && <Banner testId={tid.ts.banner('locked')} tone="warn" icon={<Lock />} title="Pay period closed">
        {day.lockNote}. This day can no longer be saved or submitted. Ask {mgr} to raise an amendment.</Banner>}
      {clock.open && <ForgottenClock key={`${clock.open.date}:${clock.open.version}`} open={clock.open} blocked={clock.openBlocked} manager={mgr} />}
      {nonwork && <Card>
        <CardHead title="Why this day is non-working" />
        <div className="grid grid-cols-2 gap-x-md max-lg:grid-cols-1">
          <Field label="Reason" required>
            <SelectBox testId={tid.ts.reason} options={NON_WORKING_REASONS.map(r => ({ value: r, label: r }))} value={reason} onValueChange={setReason} />
          </Field>
          <Field label="Notes">
            <TextInput testId={tid.ts.reasonNotes} value={notes} placeholder="Anything your approver should know" onChange={e => setNotes(e.target.value)} />
          </Field>
        </div>
        <Small>A reason is enough. No times are needed.</Small>
        <div className="mt-lg flex flex-wrap justify-end gap-sm">
          <Button testId={tid.ts.submitReason} kind="primary" disabled={day.locked} title={lockedTitle} pending={busy} onClick={submitReason}>Submit reason</Button>
        </div>
      </Card>}
      {!nonwork && <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-lg max-lg:grid-cols-1">
        <div>
          {clock.card && <ClockCard clock={clock.card} readAt={clock.readAt} />}
          <Card>
            <CardHead title={<>Timesheet entry<Tip testId={tid.ts.entryTip} text={entryTip(week, Boolean(clock.card))} /></>} />
            <DayFields {...fields} readOnly={locked} which={side ? 'open' : 'all'} />
            <DayChecks checked={entry.checked} refusal={entry.refusal} />
            <div className="mt-lg flex flex-wrap items-center justify-end gap-sm">
              {running && <span data-testid={tid.clock.outFirst} className="text-xs text-text-muted">{CLOCK_OUT_FIRST}</span>}
              <Button testId={tid.dayForm.save} kind="ghost" disabled={held || busyKind === 'submit'} title={heldTitle} pending={busyKind === 'save'} onMouseDown={holdFocus} onClick={() => entry.attempt('save')}>Save draft</Button>
              <Button testId={tid.dayForm.submit} kind="primary" disabled={held || busyKind === 'save'} title={heldTitle} pending={busyKind === 'submit'} onMouseDown={holdFocus} onClick={() => entry.attempt('submit')}>Submit day</Button>
            </div>
          </Card>
        </div>
        <div>
          <DayStatsCard capture={c} stats={stats} />
          {side && <Card>
            <CardHead title="Shift details" actions={<span className="text-xs text-text-muted">Add only what applies</span>} />
            <DayFields {...fields} readOnly={locked} which="closed" />
          </Card>}
        </div>
      </div>}
      <ConfirmModal open={leaving !== null} onOpenChange={o => { if (!o) setLeaving(null); }} title="Discard this day’s changes?"
        body="The times you entered on this day are not saved. Save a draft first if you want to keep them." confirmLabel="Discard" cancelLabel="Keep editing" danger
        onConfirm={() => { const d = leaving; setLeaving(null); if (d) onDate(d); }} />
    </>);
}
