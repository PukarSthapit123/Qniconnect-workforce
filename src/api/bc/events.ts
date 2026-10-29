/* QniConnect's window events, as a typed emitter, kept apart from
   src/api/session-events.ts, which is the /api/v1 session's:
   - 'auth-required' is its 'authRequired' (AUTH.R31): bcApi emits it when
     the backend answers 401, and whoever holds the session (Task 14's
     provider) answers it with a sign-in redirect;
   - 'employee-no-ready' is its 'employeeNoReady' (portal HOME.R10): the
     dashboard has stored the employee number, so the bell can load (BELL.R1). */
type BcEvent = 'auth-required' | 'employee-no-ready';
const listeners: Record<BcEvent, Set<() => void>> = { 'auth-required': new Set(), 'employee-no-ready': new Set() };

export const bcEvents = {
  on(event: BcEvent, fn: () => void): () => void {
    listeners[event].add(fn);
    return () => { listeners[event].delete(fn); };
  },
  emit(event: BcEvent) { for (const fn of [...listeners[event]]) fn(); },
};
