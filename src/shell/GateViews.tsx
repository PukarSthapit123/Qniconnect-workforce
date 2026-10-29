/* What the sign-in gate (src/App.tsx) shows outside the shell while the page
   is about to leave. The auth error page and environment selection are
   features of their own (src/features/auth-pages, src/features/account-setup). */
import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

/* On the way to Microsoft sign-in, or out of it: the page is about to leave. */
export function AuthStatus({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main data-testid={testId} className="flex flex-1 flex-col items-center justify-center gap-md p-lg text-center">
        <p role="status" className="text-text-secondary">{children}</p>
      </main>
    </div>);
}
