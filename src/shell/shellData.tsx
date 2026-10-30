import { ApiError } from '@/api/client';
import { useTenant } from '@/api/tenant';
import { buildNav, type NavGroup } from '@/domain/nav';
import type { Session } from '@/contract/session';
import { tid } from '@/testids';
import { Button } from '@/ui';
import { useSession, type PortalState } from './SessionProvider';
import { TopBar } from './TopBar';

/* Shared by Shell and any routed page that needs to know what this account
   can reach (SetupIndex today). Both used to fetch the tenant and derive nav
   independently, and both went blank on a slow or failed tenant load: no
   header, no way to sign out. This is the one place that loading and error
   state is handled, so a page only ever renders once there is something real
   to show. */
export type ShellData =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry(): void; onSignOut(): void }
  | { kind: 'ready'; session: Session; nav: NavGroup[]; onSignOut(): void; onViewAs(employeeCode: string): void; onEndViewAs(): void };

/* The tenant's settings, from the one cached query the shell itself reads
   (src/api/tenant.ts, beside the writes that invalidate it). */
export { useTenant };

/* QniConnect's pages follow the signed-in account's isAdmin, re-verified at
   this sign-in (never read from storage), and Workforce's follow the
   session's capabilities (N18). While looking at the app as someone else
   the nav is theirs, and their portal access is not known, so the Business
   Central pages (and Setup · Employees' portal logins) are not shown. */
export const isPortalAdmin = (portal: PortalState, session: Session | null) =>
  portal.adminVerified && portal.isAdmin && !session?.viewingAs;
export function usePortalAdmin(): boolean {
  const { session, portal } = useSession();
  return isPortalAdmin(portal, session);
}

export function useShellData(): ShellData {
  const { session, portal, signOut, viewAs, endViewAs } = useSession();
  const tenant = useTenant();

  if (!session) return { kind: 'loading' }; // Gate never mounts a routed page without a session
  if (tenant.isPending) return { kind: 'loading' };
  if (tenant.isError) {
    /* A 401 has already been toasted and sent to sign in again, once, by
       SessionProvider (query.ts raises 'signed-out'): the page is leaving. */
    if (tenant.error instanceof ApiError && tenant.error.status === 401) return { kind: 'loading' };
    return { kind: 'error', onRetry: () => void tenant.refetch(), onSignOut: () => void signOut() };
  }
  const portalAdmin = isPortalAdmin(portal, session);
  const nav = buildNav({ caps: new Set(session.capabilities), modules: tenant.data.modules, flags: tenant.data.flags, onboarding: session.onboarding, portalAdmin });
  /* viewAs and endViewAs toast their own failures and never reject on a
     refusal (SessionProvider's switchView), so nothing here goes unhandled. */
  return { kind: 'ready', session, nav, onSignOut: () => void signOut(), onViewAs: employeeCode => void viewAs(employeeCode), onEndViewAs: () => void endViewAs() };
}

/* `chrome`: the shell's own loading state draws the top bar and the tab
   strip's place already, so the frame does not jump in around the page once
   it loads, and a cold start feels quicker. A page that waits on the same
   data inside the shell leaves `chrome` off: the shell is already there. */
export function ShellLoading({ chrome }: { chrome?: boolean }) {
  const text = <p className="text-text-secondary">Loading your workspace&hellip;</p>;
  if (!chrome) return <div data-testid={tid.shell.loading} className="flex min-h-dvh items-center justify-center p-lg">{text}</div>;
  return (
    <div data-testid={tid.shell.loading} className="flex min-h-dvh flex-col">
      <TopBar />
      <div aria-hidden="true" className="hidden min-h-11 border-b bg-surface-card md:block" />
      <div className="flex flex-1 items-center justify-center p-lg">{text}</div>
    </div>);
}

export function ShellError({ onRetry, onSignOut }: { onRetry(): void; onSignOut(): void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-md p-lg text-center">
      <p data-testid={tid.shell.error} className="text-err">QniConnect could not load your workspace. Nothing has changed on your account.</p>
      <p className="text-text-secondary">Try again, or sign out and sign back in.</p>
      <div className="flex gap-sm">
        <Button testId={tid.shell.retry} kind="primary" onClick={onRetry}>Try again</Button>
        <Button testId={tid.shell.signOut} kind="ghost" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>);
}
