import type { ReactNode } from 'react';
import { CircleCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/* A note (taste review 2026-10-26): something worth knowing on this screen
   that is not a problem: how a setting behaves, who sees a change, or that
   all is done. A banner (Record.tsx) is for what went wrong or needs action;
   a tinted box for every remark taught that a box means nothing. So a note is
   a plain line in the secondary ink with a small glyph: `info` for an
   explanation, `done` (in the ok colour) for good news. */
export function Note({ testId, title, tone = 'info', className, children }: {
  testId?: string; title?: string; tone?: 'info' | 'done'; className?: string; children?: ReactNode;
}) {
  const Glyph = tone === 'done' ? CircleCheck : Info;
  return (
    <div data-testid={testId} className={cn('mb-md flex items-start gap-sm text-sm text-text-secondary', className)}>
      <Glyph aria-hidden="true" className={cn('mt-[2px] size-4 shrink-0', tone === 'done' ? 'text-ok' : 'text-text-muted')} />
      <span>{title && <b className="font-semibold text-text-primary">{title}{children ? '. ' : ''}</b>}{children}</span>
    </div>);
}
