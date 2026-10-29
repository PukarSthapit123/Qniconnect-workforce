import * as React from "react"
import { cn } from "@/lib/utils"

/* The prototype's .fld input (qnipay-workforce-v15.html:497-508, 944-946):
   38px, 0 11px, a strong border on the sunken surface, radius 8, 14px. Focus
   rings it and draws the border in brand; an invalid field is outlined in
   error. On a phone it is 44px and 16px, so iOS does not zoom the page; on
   any touch screen (an iPad is wider than a phone) the text is 16px too.
   Focus is not animated: tabbing through a form lands the ring at once. */
export const fieldControl =
  "h-[38px] w-full min-w-0 rounded-control border border-border-strong bg-surface-sunken px-[11px] text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand focus:shadow-focus disabled:cursor-default disabled:bg-surface-tint disabled:text-text-secondary aria-invalid:border-err aria-invalid:shadow-invalid max-md:min-h-touch max-md:text-base pointer-coarse:text-base"

/* The prototype's filter-bar controls (.srch input, select.flt, .chipbtn;
   v15:538-549): 32px pills on the card surface with a strong border. On a
   phone they take the same 44px/16px floor as every other control. Most of
   them are buttons, so they ring on keyboard focus only (the base
   :focus-visible rule), never on a click or a tap; the search box is an
   Input, which rings on focus through fieldControl. */
export const filterControl =
  "h-8 rounded-pill border border-border-strong bg-surface-card text-text-primary outline-none max-md:min-h-touch max-md:text-base"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControl, className)}
      {...props}
    />
  )
}

export { Input }
