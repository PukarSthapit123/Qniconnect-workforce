import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/* The prototype's .btn (qnipay-workforce-v15.html:423-449, 939-940): 38px,
   0 16px, radius 8, 14px/600, gap 7px, a 1px border that is transparent
   unless the kind draws one. On a phone every button grows to the 44px touch
   target with the padding to match; the small size does too (the prototype
   stops at 40px there, spec §10.3 does not). The focus ring is the base
   layer's :focus-visible box-shadow (src/index.css), --qp-ring-focus.

   Press: every button, and every link drawn as one, scales to 0.97 while
   pressed (--dur-press, --ease-out), so the press is answered before the
   work it starts; a disabled or pending one does not move. The scale is
   Tailwind's `scale` property, so it is in the transition list by name. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[7px] rounded-control border border-transparent text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,scale] duration-(--dur-press) ease-(--ease-out) outline-none select-none active:scale-[0.97] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-tint disabled:text-text-disabled disabled:active:scale-none aria-disabled:active:scale-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* .pri: brand, and the lime accent with its dark ink in dark theme
           (--primary is re-pointed there). The prototype's dark rule is
           declared after :hover, so hover does not change it in dark. */
        default: "bg-primary text-primary-foreground hover:bg-brand-hover active:bg-brand-active dark:hover:bg-primary dark:active:bg-primary",
        /* .dgr: an outlined error, never a filled red block */
        destructive: "border-err bg-transparent text-err hover:bg-err-surface",
        /* .sec: the brand's subtle tint with brand ink, accent ink in dark */
        secondary: "bg-brand-subtle text-brand hover:bg-brand-subtle-hover dark:text-brand-accent",
        /* .gho: a 1px strong outline on the card surface */
        ghost: "border-border-strong bg-surface-card text-text-primary hover:bg-surface-tint",
        /* .lnk: underlined text that does not squash when pressed. Its hit
           area reaches past the 12px text, to 44px tall on a phone. */
        link: "relative h-auto border-0 p-0 text-xs font-semibold text-brand underline active:scale-none before:absolute before:-inset-x-1 before:-inset-y-2 max-md:before:-inset-y-[14px] dark:text-brand-accent",
      },
      size: {
        default: "h-[38px] px-lg max-md:h-auto max-md:min-h-touch max-md:px-[18px] max-md:py-[11px]",
        /* .sml: 30px, 0 11px, 12px, radius 4 */
        sm: "h-[30px] rounded-sm px-[11px] text-xs max-md:h-auto max-md:min-h-touch max-md:px-[14px] max-md:py-[9px] max-md:text-sm",
        lg: "h-11 px-xl",
        icon: "size-[38px] max-md:size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
