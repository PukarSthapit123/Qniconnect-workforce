/* The frame the public pages share, outside the app (spec section 8): the
   signed-out top bar, its logo a link home, with the page's own links on the
   right; the page; and one footer, the current year and QniConnect's legal
   links. QniConnect drew each page's header and footer by hand; the brand is
   QniConnect throughout, and the footer's dead links and newsletter are not
   ported (Ruling Q13). */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { tid } from '@/testids';
import { TopBar } from '@/shell/TopBar';

/* QniConnect's legal page, for Privacy and Terms alike (LAND, REG, PRICE). */
export const LEGAL_URL = 'https://qnipay.com/legal/';
/* The one support address the landing and registration pages give (LAND, REG). */
export const SUPPORT_MAIL = 'mailto:support@dogmagroup.co.uk';
/* The sign-in page's own contact, exactly as QniConnect shows it (LOGIN static content, AuthPages.js:62-65): the address as text,
   linking to the legal page. Kept literally until the user decides (Ruling Q18); each page carries its own contact. */
export const LOGIN_CONTACT = { text: 'support@qnipay.com', href: LEGAL_URL } as const;

const TOP_LINK = 'inline-flex items-center rounded-sm px-sm py-xs text-sm font-semibold text-shell-ink transition-[background-color,scale] duration-(--dur-press) ease-(--ease-out) select-none hover:bg-shell-hover hover:text-text-on-inverse active:scale-[0.97] motion-reduce:active:scale-100 max-md:min-h-touch';

/* A link in the bar: a route, or an address outside the app. */
export function TopLink({ to, href, testId, primary, children }: { to?: string; href?: string; testId: string; primary?: boolean; children: ReactNode }) {
  const cls = cn(TOP_LINK, primary && 'border border-glass-line bg-glass hover:bg-glass-hover');
  return to
    ? <Link to={to} data-testid={testId} className={cls}>{children}</Link>
    : <a href={href} data-testid={testId} className={cls}>{children}</a>;
}

export function PublicLayout({ testId, nav, children }: { testId: string; nav?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-page">
      <TopBar homeTestId={tid.pub.home}>
        {nav && <nav aria-label="QniConnect" className="ml-auto flex items-center gap-xs">{nav}</nav>}
      </TopBar>
      <main data-testid={testId} className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t bg-surface-page">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-sm px-xl py-lg text-xs text-text-muted max-lg:px-lg">
          <p data-testid={tid.pub.year}>© {new Date().getFullYear()} QniConnect. All rights reserved.</p>
          <div className="flex gap-lg">
            <a href={LEGAL_URL} target="_blank" rel="noreferrer" data-testid={tid.pub.privacy} className="rounded-sm underline-offset-2 hover:text-text-primary hover:underline max-md:inline-flex max-md:min-h-touch max-md:items-center">Privacy</a>
            <a href={LEGAL_URL} target="_blank" rel="noreferrer" data-testid={tid.pub.terms} className="rounded-sm underline-offset-2 hover:text-text-primary hover:underline max-md:inline-flex max-md:min-h-touch max-md:items-center">Terms</a>
          </div>
        </div>
      </footer>
    </div>);
}
