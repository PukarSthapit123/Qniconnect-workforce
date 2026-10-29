"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/* The prototype's #toasts (qnipay-workforce-v15.html:627-640, 1566-1567):
   bottom centre, 20px up, at most 520px wide; on a phone it clears the
   bottom bar and the home indicator under it, 12px in from each edge. The
   toasts themselves are drawn, in both themes, by src/ui/toast.tsx through
   toast.custom, so none of Sonner's own icons, colours or theme apply. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    position="bottom-center"
    offset={{ bottom: 20 }}
    mobileOffset={{ bottom: "calc(var(--qp-bottom-bar-clear) + env(safe-area-inset-bottom, 0px))", left: 12, right: 12 }}
    className="toaster group"
    style={{ "--width": "min(520px, calc(100vw - 24px))" } as React.CSSProperties}
    {...props}
  />
)

export { Toaster }
