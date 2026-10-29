import { toast } from 'sonner';
import { XIcon } from 'lucide-react';
import { tid } from '@/testids';
import type { Refusal } from '@/contract/common';
import { REFUSAL_LIFE_MS, TOAST_LIFE_MS } from './motion';

/* The prototype's .toast (qnipay-workforce-v15.html:632-640): the inverse
   surface with its pale ink, 11px 18px, radius 8, 14px, shadow-lg, as wide
   as its words and centred. An error is the error colour with white ink; in
   dark theme that colour is a light coral, so its ink turns dark to stay
   readable (the prototype kept white there, at about 2.3:1).

   A toast states the consequence and what to do next. `next` is not optional
   on a refusal, so a refusal can never be shown without it. A refusal stays
   longer than news (it carries what to do next) and can be dismissed.

   Sonner's own list is already a polite live region, so news carries no
   role of its own (a nested one is read twice by some screen readers); a
   refusal is role="alert", which interrupts. Sonner moves its toasts with
   transitions it can retarget mid-flight, and drops them for reduced
   motion itself. */
const BOX = 'mx-auto w-fit max-w-full rounded-control px-[18px] py-[11px] text-sm shadow-lg';
export function toastInfo(message: string, next?: string) {
  toast.custom(() => (
    <div data-testid={tid.toast.info} className={`${BOX} bg-surface-inverse text-text-on-inverse`}>
      <div>{message}</div>{next && <div data-testid={tid.toast.next} className="opacity-80">{next}</div>}
    </div>), { duration: TOAST_LIFE_MS });
}
export function toastRefusal(r: Pick<Refusal, 'message' | 'next'>) {
  toast.custom(id => (
    <div data-testid={tid.toast.error} role="alert" className={`${BOX} flex items-start gap-md bg-err text-text-on-brand dark:text-text-on-accent`}>
      <div className="min-w-0"><div>{r.message}</div><div data-testid={tid.toast.next} className="opacity-90">{r.next}</div></div>
      <button type="button" data-testid={tid.toast.dismiss} aria-label="Dismiss" onClick={() => toast.dismiss(id)}
        className="relative -mr-[6px] grid size-6 shrink-0 place-items-center rounded-sm transition-[scale] duration-(--dur-press) ease-(--ease-out) active:scale-[0.94] before:absolute before:-inset-[10px] [&_svg]:size-4">
        <XIcon aria-hidden="true" /></button>
    </div>), { duration: REFUSAL_LIFE_MS });
}
