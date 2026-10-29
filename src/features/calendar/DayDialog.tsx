import type { ReactNode } from 'react';
import { tid } from '@/testids';
import { Button, Fact, GroupLabel, Modal, NavLink, Pill, Small, type Tone } from '@/ui';
import { buttonVariants } from '@/ui/shadcn/button';
import type { HomeDay, HomeMonth } from '@/api/home';
import { shortDate } from '@/domain/home';
import { statePill } from '@/features/timesheet/team';

/* What is on a day: the prototype's empDayBox (qnipay-workforce-v15.html:
   5435-5474). Where the day comes from, the bank holiday, what the timesheet
   holds, and a way to the page that owns it: My timesheet on that day. */
function dayPill(d: HomeDay): { label: string; tone: Tone; glyph: ReactNode } | null {
  if (d.ts) return statePill(d.ts.state, d.ts.waitingOn);
  return null;
}
export function DayDialog({ m, day: d, onClose }: { m: HomeMonth; day: HomeDay; onClose: () => void }) {
  const pill = dayPill(d);
  const recorded = d.ts?.minutes ?? 0;
  const canRecord = m.can.recordHours && !d.future && !d.locked;
  return (
    <Modal open onOpenChange={o => { if (!o) onClose(); }} title={`${shortDate(d.date)} ${d.date.slice(0, 4)}`}
      footer={<>
        <Button testId={tid.cal.dayClose} kind="ghost" onClick={onClose}>Close</Button>
        {canRecord && <NavLink testId={tid.cal.recordHours} to={`/work/ts?date=${d.date}`} className={buttonVariants({ variant: 'default' })}>
          {recorded ? 'Edit the timesheet' : 'Record hours'}</NavLink>}
      </>}>
      {pill && <div className="mb-md"><Pill testId={tid.cal.dayState} tone={pill.tone} glyph={pill.glyph}>{pill.label}</Pill></div>}
      {d.bankHoliday && <>
        <GroupLabel>The day</GroupLabel>
        <Fact label="Bank holiday" testId={tid.cal.dayBank}>{d.bankHoliday}</Fact>
      </>}

      {(m.can.recordHours || d.ts) && <>
        <GroupLabel className="mt-lg">Your timesheet</GroupLabel>
        <Fact label="Hours recorded" testId={tid.cal.dayHours}>{d.ts?.text || 'Nothing yet'}</Fact>
        {d.locked && <Small testId={tid.cal.dayLocked} className="mt-sm">Approved and locked. Ask your manager to reopen it.</Small>}
      </>}
    </Modal>);
}
