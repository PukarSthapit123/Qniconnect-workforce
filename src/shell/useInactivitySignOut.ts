/* QniConnect's inactivity sign-out (inventory AUTH.R25): while there is a
   user, five minutes with none of these events on the window signs out.
   Every event starts the five minutes again, unthrottled, and the timer
   starts at once. A different user object (signing in, the portal check
   filling the user in) builds the listeners and the timer again, as
   QniConnect's effect on [user] did. */
import { useEffect, useRef } from 'react';

export const INACTIVITY_MS = 5 * 60 * 1000;
export const INACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export function useInactivitySignOut(user: unknown, onIdle: () => void): void {
  const idle = useRef(onIdle);
  useEffect(() => { idle.current = onIdle; });
  useEffect(() => {
    if (!user) return;
    let timer = setTimeout(() => { idle.current(); }, INACTIVITY_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { idle.current(); }, INACTIVITY_MS);
    };
    /* passive: listening never holds up a scroll or a touch */
    for (const ev of INACTIVITY_EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const ev of INACTIVITY_EVENTS) window.removeEventListener(ev, reset);
    };
  }, [user]);
}
