import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { TOOLTIP_DELAY_MS } from "@/ui/motion"

/* One provider at the app's root (App.tsx), so once a tooltip is open the
   next one the pointer reaches opens at once (Radix's "instant-open"), with
   no delay and no animation. A tooltip rendered outside any provider (a
   component test, say) brings its own, so it still works on its own. */
const Shared = React.createContext(false)

function TooltipProvider({
  delayDuration = TOOLTIP_DELAY_MS,
  skipDelayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <Shared.Provider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      />
    </Shared.Provider>
  )
}

/* `tap`: Radix opens a tooltip on hover and focus only, so on a phone a tap
   on an `i`, a caution or a pill with a note showed nothing. With `tap`, a
   click or tap on the trigger opens it and a second one closes it; a tap
   anywhere else closes it, as before. Only for a trigger that does nothing
   else on click: never a link or a button with an action of its own. */
type Tap = { open: boolean; setOpen(open: boolean): void }
const TapContext = React.createContext<Tap | null>(null)

function Tooltip({
  tap,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & { tap?: boolean }) {
  const shared = React.useContext(Shared)
  const [own, setOwn] = React.useState(defaultOpen)
  const open = openProp ?? own
  const setOpen = React.useCallback((next: boolean) => {
    if (openProp === undefined) setOwn(next)
    onOpenChange?.(next)
  }, [openProp, onOpenChange])
  const tapState = React.useMemo(() => (tap ? { open, setOpen } : null), [tap, open, setOpen])
  const root = (
    <TapContext.Provider value={tapState}>
      <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={setOpen} {...props} />
    </TapContext.Provider>
  )
  return shared ? root : <TooltipProvider>{root}</TooltipProvider>
}

function TooltipTrigger({
  onPointerDown,
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const tap = React.useContext(TapContext)
  /* Radix closes an open tooltip on pointer down, before the click: what
     the click toggles is the state the press found. */
  const wasOpen = React.useRef(false)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onPointerDown={e => { wasOpen.current = tap?.open ?? false; onPointerDown?.(e) }}
      onClick={e => {
        onClick?.(e)
        if (!tap || e.defaultPrevented) return
        /* stops Radix's own close-on-click; the toggle below decides */
        e.preventDefault()
        tap.setOpen(!wasOpen.current)
      }}
      {...props}
    />
  )
}

/* Motion (tokens.css): a delayed open fades in and scales up from 0.97 at the
   trigger over --dur-tooltip; an instant open (the next tooltip along) has
   no animation at all. No slide: the tooltip grows out of its trigger. And
   no exit: moving along a row of tips, a fading tooltip would still be on
   screen beside the next one, which opens instantly. */
function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-(--qp-z-tooltip) w-fit max-w-[280px] origin-(--radix-tooltip-content-transform-origin) rounded-sm bg-surface-inverse px-[11px] py-[9px] text-left text-xs leading-normal font-normal tracking-normal normal-case text-balance text-text-on-inverse shadow-lg",
          "duration-(--dur-tooltip) ease-(--ease-out) data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-97",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
