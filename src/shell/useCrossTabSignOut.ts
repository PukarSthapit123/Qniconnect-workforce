/* QniConnect's cross-tab sign-out (inventory AUTH.R30, Ruling Q8): another
   tab removed isAuthenticated (it signed out, or met an auth error), so this
   one goes to sign-in too. The browser fires `storage` only in the other
   tabs, and localStorage.clear() (key null) does not count. */
import { useEffect, useRef } from 'react';

export function useCrossTabSignOut(onSignedOutElsewhere: () => void): void {
  const handler = useRef(onSignedOutElsewhere);
  useEffect(() => { handler.current = onSignedOutElsewhere; });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'isAuthenticated' && e.newValue === null) handler.current();
    };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('storage', onStorage); };
  }, []);
}
