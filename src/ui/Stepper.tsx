import { Minus, Plus } from 'lucide-react';

/* The prototype's .stepper (qnipay-workforce-v15.html:1518-1525): a minus
   and a plus either side of the value, one strong border round all three,
   the value in 14px/600 tabular figures between two light rules. Each end
   is disabled at its bound rather than clamping silently. On a phone the
   buttons grow to the 44px touch target.

   A stepper is tapped many times in a row, so nothing in it animates: a
   press fills its button at once and the fill goes at once on release (no
   scale, which would break the joined border of the group). The group
   clips its rounded corners, so a button's keyboard ring is drawn inside
   it. The signs come from the shared icon set. */
export function Stepper({ label, value, min, max, disabled, onChange, downTestId, upTestId, valueTestId }: {
  label: string; value: number; min: number; max: number; disabled?: boolean; onChange(next: number): void;
  downTestId: string; upTestId: string; valueTestId: string;
}) {
  const btn = 'grid h-7 w-[26px] place-items-center bg-surface-card text-sm text-text-secondary select-none hover:bg-surface-tint focus-visible:shadow-focus-inset active:enabled:bg-brand-subtle disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 [&_svg]:size-[14px]';
  return (
    <span role="group" aria-label={label} className="inline-flex items-center overflow-hidden rounded-sm border border-border-strong">
      <button type="button" data-testid={downTestId} aria-label={`${label}: fewer`} className={btn}
        disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><Minus aria-hidden="true" /></button>
      <span data-testid={valueTestId} aria-live="polite"
        className="grid h-7 w-[30px] place-items-center border-x text-sm font-semibold tabular-nums max-md:h-11">{value}</span>
      <button type="button" data-testid={upTestId} aria-label={`${label}: more`} className={btn}
        disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Plus aria-hidden="true" /></button>
    </span>);
}
