import { cn } from '@/lib/utils';

/* The prototype's .seg (qnipay-workforce-v15.html:551-557): a pill of two or
   three choices on the tint, the chosen one lifted onto the card surface in
   brand ink (the accent in dark). Used for My timesheet's Day and Week, the
   approvals queue's views and proxy entry's Day and Week. Each choice is a
   pressed or unpressed button, so a screen reader hears which is on.

   Motion: a press scales the option to 0.97; the choice itself lands at
   once. A view switch happens tens of times a day, often from the keyboard,
   so the lifted pill neither crossfades nor slides. On a phone each option
   is 38px tall, a 44px group with its padding. A focused chosen option
   keeps its ring over its own lift shadow. */
export interface SegOption<T extends string> { value: T; label: string; disabled?: boolean }
export function Seg<T extends string>({ label, options, value, onChange, testId }: {
  label: string; options: readonly SegOption<T>[]; value: T; onChange: (v: T) => void; testId: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-pill bg-surface-tint p-[3px]">
      {options.map(o => (
        <button key={o.value} type="button" data-testid={testId(o.value)} aria-pressed={o.value === value} disabled={o.disabled}
          onClick={() => { if (o.value !== value) onChange(o.value); }}
          className={cn('rounded-pill px-[13px] py-[5px] text-xs font-semibold text-text-secondary transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-none max-md:min-h-[38px] max-md:px-lg max-md:text-sm',
            o.value === value && 'bg-surface-card text-brand shadow-sm focus-visible:shadow-focus dark:text-brand-accent')}>
          {o.label}
        </button>))}
    </div>);
}
