import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';

/* Pay amounts are hidden until asked for (taste review 2026-10-26): Home and
   Documents are open on screen while an employee fills in a timesheet beside
   a colleague, and a salary is nobody else's business. Every page load starts
   hidden, and nothing is remembered: showing them is a choice made each time.
   One toggle on a page shows or hides every amount on it. */
export function usePayMask() {
  const [shown, setShown] = useState(false);
  return { shown, toggle: () => setShown(s => !s) };
}
export type PayMask = ReturnType<typeof usePayMask>;

/* The eye: open while the amounts are hidden (press it to see them), crossed
   out while they show (press it to hide them). Its name says what a press
   does; aria-pressed says the amounts are showing. `className` lets the dark
   lead block draw it in its own glass (ui/Lead). */
export function PayMaskToggle({ testId, mask, className }: { testId: string; mask: PayMask; className?: string }) {
  return (
    <Button testId={testId} small kind="ghost" aria-pressed={mask.shown} className={className} onClick={mask.toggle}>
      {mask.shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{mask.shown ? 'Hide amounts' : 'Show amounts'}
    </Button>);
}

/* The same eye, icon alone, set right beside the figure it hides, as a
   banking app does: a 34px round target (44px on a phone), named by what a
   press does. For the dark lead block, in its pale ink with a white lift. */
export function PayMaskEye({ testId, mask }: { testId: string; mask: PayMask }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={mask.shown} aria-label={mask.shown ? 'Hide amounts' : 'Show amounts'}
      onClick={mask.toggle}
      className="grid size-[34px] shrink-0 place-items-center self-center rounded-pill text-shell-ink transition-[scale] duration-(--dur-press) ease-(--ease-out) hover:bg-shell-hover active:scale-[0.94] active:bg-shell-hover motion-reduce:active:scale-100 max-md:size-11 [&>svg]:size-[18px]">
      {mask.shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>);
}

/* An amount, or while hidden the same four dots whatever its size, so the
   length of a figure gives nothing away. The figure is not rendered at all
   until shown. A screen reader hears "hidden". */
export function Masked({ shown, children }: { shown: boolean; children: ReactNode }) {
  if (shown) return <>{children}</>;
  return <><span aria-hidden="true">£••••</span><span className="sr-only">hidden</span></>;
}
