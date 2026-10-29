import { useState } from 'react';
import { Check } from 'lucide-react';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Button, Modal } from '@/ui';
import type { FiscalYear } from '@/contract/bc/documents';
import { formatPortalDate } from '@/domain/payroll';
import { yearsFor, type TaxDocType } from '@/domain/documents';

/* QniConnect's FiscalYearSelectionModal (portal inventory FYM.R1 to FYM.R7),
   on the design system's Modal: Radix closes it on Escape, a click on the
   scrim, the close button and Cancel, and restores the page's scroll
   (FYM.R1, FYM.R3). Each opening starts with nothing chosen (FYM.R2). A P60
   is offered only for the closed years flagged printable (FYM.R5).
   Upgrades (Ruling Q2): a year is chosen by its place in the list, so years
   without an id no longer all look chosen together; its dates are written
   dd/mm/yyyy rather than as the API sent them; and when no year is left for
   a P60 the dialog says so instead of showing an empty list. */
export function FiscalYearDialog({ open, onClose, onSelect, years, loading, type }: {
  open: boolean; onClose: () => void; onSelect: (year: FiscalYear) => void; years: FiscalYear[]; loading: boolean; type: TaxDocType | null;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  /* FYM.R2: whichever way it closes, the next opening starts with none chosen */
  const close = () => { setChosen(null); onClose(); };
  const shown = type ? yearsFor(type, years) : years;
  const picked = chosen === null ? undefined : shown[chosen];
  const confirm = () => { if (!picked) return; onSelect(picked); close(); };
  const what = type ?? 'document';
  return (
    <Modal open={open} onOpenChange={o => { if (!o) close(); }} title={`Select fiscal year for ${type ?? 'document'}`}
      footer={<>
        <Button testId={tid.docs.fyCancel} kind="ghost" onClick={close}>Cancel</Button>
        <Button testId={tid.docs.fyConfirm} kind="primary" disabled={!picked || loading} onClick={confirm}>Confirm selection</Button>
      </>}>
      {/* the body keeps a floor, so the dialog does not jump from its loading line to the list */}
      <div className="min-h-[13rem]">
        {loading
          ? <p data-testid={tid.docs.fyLoading} role="status" className="py-xl text-center text-sm text-text-secondary">Loading fiscal years&hellip;</p>
          : years.length === 0
            ? <p data-testid={tid.docs.fyEmpty} className="py-xl text-center text-sm text-text-muted">No fiscal years available</p>
            : <>
              <p data-testid={tid.docs.fyPrompt} className="mb-md text-sm text-text-secondary">Choose a fiscal year to generate the {what} document.</p>
              {shown.length === 0
                ? <p data-testid={tid.docs.fyNone} className="py-lg text-center text-sm text-text-muted">No fiscal year has a {what} ready to print yet. Try again after the tax year closes.</p>
                : <div role="group" aria-label="Fiscal years" className="grid gap-sm">
                  {shown.map((y, i) => {
                    const on = i === chosen;
                    const dates = [formatPortalDate(y.startDate), formatPortalDate(y.endDate)];
                    return (
                      <button key={`${String(y.id ?? '')}-${i}`} type="button" data-testid={tid.docs.fyOption(i)} aria-pressed={on} onClick={() => setChosen(i)}
                        className={cn('flex w-full items-center gap-md rounded-control border px-lg py-md text-left transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none active:scale-[0.98] hover:bg-surface-tint',
                          on && 'border-brand bg-brand-subtle hover:bg-brand-subtle dark:border-brand-accent')}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold tabular-nums">{y.fiscalYear}</span>
                          <span className="block text-xs text-text-muted tabular-nums">{dates[0]} to {dates[1]}</span>
                        </span>
                        {on && <Check aria-hidden="true" className="size-4 shrink-0 text-brand dark:text-brand-accent" />}
                      </button>);
                  })}
                </div>}
            </>}
      </div>
    </Modal>);
}
