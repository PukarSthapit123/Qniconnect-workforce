import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/ui';

/* The prototype's .topbar (qnipay-workforce-v15.html:258-265, 1521-1522,
   1552-1582): 56px of the inverse surface, sticky at the top above the tab
   strip, the logo hard left, 24px side padding (12px below 1024px, 10px on a
   phone), 16px between its parts (8px below 1024px). Signed out, it carries
   the logo alone (body.signed-out, v15:790).

   The page is laid out under a notch (viewport-fit=cover), so the bar keeps
   its contents clear of one: in landscape its sides grow to the safe-area
   insets, and in a home-screen app it grows down past the status bar. Where
   there is no notch every inset is 0 and nothing moves. */
const PAD = 'pl-[max(var(--qp-space-xl),env(safe-area-inset-left,0px))] pr-[max(var(--qp-space-xl),env(safe-area-inset-right,0px))] '
  + 'max-lg:pl-[max(var(--qp-space-md),env(safe-area-inset-left,0px))] max-lg:pr-[max(var(--qp-space-md),env(safe-area-inset-right,0px))] '
  + 'max-md:pl-[max(10px,env(safe-area-inset-left,0px))] max-md:pr-[max(10px,env(safe-area-inset-right,0px))]';
/* `homeTestId`: the public pages' bar, whose logo is a link to the landing
   page (QniConnect's pricing header, PRICE). */
export function TopBar({ children, homeTestId }: { children?: ReactNode; homeTestId?: string }) {
  return (
    <header className={`sticky top-0 z-(--qp-z-topbar) flex h-[calc(var(--qp-topbar-h)+env(safe-area-inset-top,0px))] shrink-0 items-center gap-lg bg-surface-inverse pt-[env(safe-area-inset-top,0px)] text-text-on-brand max-lg:gap-sm ${PAD}`}>
      {homeTestId
        ? <Link to="/" data-testid={homeTestId} className="-mx-xs flex shrink-0 items-center rounded-sm px-xs py-xs"><Logo /></Link>
        : <span className="flex shrink-0 items-center"><Logo /></span>}
      {children}
    </header>);
}
