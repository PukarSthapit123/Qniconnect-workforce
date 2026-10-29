import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

/* The prototype's .calnav (qnipay-workforce-v15.html:1372-1383): a 28px
   previous button, the period in 14px display type, a 28px next button, then
   a small ghost button that returns to the current period and is disabled
   while you are on it. The arrows keep their drawn size and take a 44px tap
   on a transparent pseudo-element around them. Shared by My timesheet's day
   and week, proxy entry and the team matrix.

   Stepping through periods is fast and repeated, so nothing here animates:
   a pressed arrow fills at once (on a phone, with no hover, that is the only
   sign the tap landed), and the period changes in place. Its label is in
   tabular digits, so "12 – 18 Oct" and "19 – 25 Oct" are the same width and
   the next arrow never jumps sideways under the pointer. */
const ARROW = 'relative grid size-7 shrink-0 place-items-center rounded-sm border text-sm leading-none text-text-secondary select-none before:absolute before:-inset-2 hover:enabled:bg-surface-tint active:enabled:bg-brand-subtle disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-4';
export function CalNav({ label, labelTestId, prev, next, back }: {
  label: string; labelTestId: string;
  prev: { testId: string; label: string; onClick: () => void; disabled?: boolean };
  next: { testId: string; label: string; onClick: () => void; disabled?: boolean };
  /* `current` names the button while you are on the current period ("Today"), `label` once you have left it ("Back to today") */
  back: { testId: string; label: string; current: string; atCurrent: boolean; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-sm">
      <button type="button" data-testid={prev.testId} aria-label={prev.label} className={ARROW} disabled={prev.disabled} onClick={prev.onClick}><ChevronLeft aria-hidden="true" /></button>
      <b data-testid={labelTestId} aria-live="polite" className="min-w-[118px] shrink-0 text-center text-sm font-bold tabular-nums">{label}</b>
      <button type="button" data-testid={next.testId} aria-label={next.label} className={ARROW} disabled={next.disabled} onClick={next.onClick}><ChevronRight aria-hidden="true" /></button>
      <Button testId={back.testId} kind="ghost" small disabled={back.atCurrent} onClick={back.onClick}>{back.atCurrent ? back.current : back.label}</Button>
    </div>);
}
