import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* The lead block (taste review 2026-10-26): each screen's one answer, on the
   prototype's dark card (.mc.dark, v15:730-734, as EssCard dark draws it;
   the clock card, v15:1227-1253, is the same surface): the dark brand green
   with its pale ink, the key figure in the lime accent. It is EssCard's dark
   look as a labelled section, with room for an answer's figure and actions.
   The top bar keeps its colour off the navigation (decision D1), so the brand
   colour lands here instead, where the eye should go first. One per screen,
   and only for the screen's answer, never for chrome or a warning. Controls on
   it ring in the accent, as the surface is marked inverse. */
export function Lead({ testId, labelledBy, className, children }: { testId?: string; labelledBy?: string; className?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} aria-labelledby={labelledBy} data-surface="inverse"
      className={cn('mb-md rounded-card border border-transparent bg-surface-inverse px-xl py-lg text-text-on-inverse max-md:p-lg', className)}>
      {children}
    </section>);
}

/* The lead's buttons, as the clock card draws them (.btn.lime, .btn.glass):
   the one primary in the accent with its dark ink, the rest translucent white. */
export const LEAD_PRIMARY = 'bg-brand-accent text-text-on-accent hover:bg-brand-accent active:bg-brand-accent';
export const LEAD_SECONDARY = 'border-glass-line bg-glass text-text-on-brand hover:bg-glass-hover';
