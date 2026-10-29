/* The frame the auth pages share: the signed-out top bar, then one centred
   card with a round status icon over a heading, as QniConnect drew its auth
   error and callback pages (AuthErrorPage.js, AuthCallbackPage.js), on the
   design system. */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/ui';
import { TopBar } from '@/shell/TopBar';

export type AuthTone = 'err' | 'ok';
const TONE: Record<AuthTone, string> = { err: 'bg-err-surface text-err', ok: 'bg-ok-surface text-ok' };

export function AuthCard({ testId, tone, icon, title, titleTestId, children }: {
  testId: string; tone: AuthTone; icon: ReactNode; title: string; titleTestId?: string; children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main data-testid={testId} className="flex flex-1 items-start justify-center px-xl py-2xl max-lg:px-md max-md:py-lg md:items-center">
        <Card className="mb-0 flex w-[min(440px,100%)] flex-col items-center px-xl py-2xl text-center max-md:px-md">
          <span aria-hidden="true" className={cn('mb-md grid size-12 place-items-center rounded-pill [&_svg]:size-6', TONE[tone])}>{icon}</span>
          <h1 data-testid={titleTestId} className="mb-sm">{title}</h1>
          {children}
        </Card>
      </main>
    </div>);
}
