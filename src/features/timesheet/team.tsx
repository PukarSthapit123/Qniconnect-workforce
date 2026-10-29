import type { ReactNode } from 'react';
import { Check, Clock, Minus, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tone } from '@/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type { QueueRow } from '@/contract/timesheets';
import { formatMinutes, tsLabel, tsStateInfo } from '@/domain/timesheet';

/* What the approver's queue and matrix show of a day: the prototype's
   mgrTeamDay and mgrTeamMatrix cells (qnipay-workforce-v15.html:6990-7070). */

/* Hours as the queue prints them, "7h 30m", whatever the tenant's capture format. */
export const queueHours = (min: number) => formatMinutes(min, 'h m');
const hoursFigure = (min: number) => String(Math.round((min / 60) * 100) / 100);
/* The pay elements: the work type with its hours, then each declared allowance's pay code ("STD 9h + WAKING_NIGHT"). */
export const payElements = (r: Pick<QueueRow, 'workType' | 'minutes' | 'allowances'>) =>
  [`${r.workType || 'STD'} ${hoursFigure(r.minutes)}h`, ...r.allowances].join(' + ');
/* IMP-009: the transitions the record carries, one line each. */
export const historyText = (r: Pick<QueueRow, 'history'>) => r.history.map(h =>
  `${tsStateInfo(h.from).label} → ${tsStateInfo(h.to).label} · ${h.by.name}${h.reason ? ` · "${h.reason}"` : ''}`).join(' | ');

/* tsPill: TS_STATE's label and tone, with the glyphs the day chip draws from the shared icon set. An mgrok
   day's label names the layer it waits on (module 8 review M3). */
const GLYPH: Record<string, ReactNode> = { draft: <Minus />, pend: <Clock />, back: <X />, resub: <RotateCw />, ok: <Check />, mgrok: <Clock /> };
export function statePill(state: string, waitingOn?: string): { label: string; tone: Tone; glyph: ReactNode } {
  const s = tsStateInfo(state);
  return { label: tsLabel(state, waitingOn), tone: s.tone, glyph: GLYPH[state] ?? GLYPH.draft };
}
/* still awaiting a decision at some layer of the approval chain (module 8: mgrok waits on payroll) */
export const isPending = (state: string) => state === 'pend' || state === 'resub' || state === 'mgrok';

/* The matrix pip (mgrTeamMatrix, v15:7076-7097, and .pip, 1387-1393): the
   submitted day (approved, sent back, awaiting a decision), or nothing to show. */
export type PipState = 'ok' | 'back' | 'pend' | 'off';
export function pipFor(row: Pick<QueueRow, 'state' | 'minutes'> | undefined): { state: PipState; value: string } {
  if (row) return { state: row.state === 'ok' ? 'ok' : row.state === 'back' ? 'back' : 'pend', value: hoursFigure(row.minutes) };
  return { state: 'off', value: '–' };
}
export const PIP: Record<PipState, string> = {
  ok: 'bg-ok-surface text-ok', back: 'bg-err-surface text-err', pend: 'bg-info-surface text-info',
  off: 'bg-transparent text-text-disabled',
};

/* A hover note on something small that is not a control: focusable, with the
   note also in the document, visually hidden, for a screen reader (as Pill's
   note); a tap opens it on a phone. The app's one tooltip provider times it. */
function Note({ testId, note, className, children }: { testId: string; note: string; className?: string; children?: ReactNode }) {
  return (
    <Tooltip tap>
      <TooltipTrigger asChild>
        <span data-testid={testId} tabIndex={0} className={cn('cursor-help', className)}>{children}<span className="sr-only">{note}</span></span>
      </TooltipTrigger>
      <TooltipContent aria-hidden="true">{note}</TooltipContent>
    </Tooltip>);
}
/* The history count beside the state pill, its transitions behind hover. */
export function HistoryCount({ testId, row }: { testId: string; row: Pick<QueueRow, 'history'> }) {
  if (!row.history.length) return null;
  return <Note testId={testId} note={historyText(row)} className="ml-[6px] text-xs text-text-muted"><span aria-hidden="true">({row.history.length})</span></Note>;
}
