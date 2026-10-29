/* QniConnect's two automatic sign-outs, as hooks (inventory AUTH.R25 and
   AUTH.R30). SessionProvider.test.tsx checks them wired into the session. */
import { act, renderHook } from '@testing-library/react';
import { INACTIVITY_EVENTS, INACTIVITY_MS, useInactivitySignOut } from './useInactivitySignOut';
import { useCrossTabSignOut } from './useCrossTabSignOut';

afterEach(() => { vi.useRealTimers(); });

test('AUTH.R25: inactivity fires after 5 minutes, and every listed activity starts the 5 minutes again', () => {
  vi.useFakeTimers();
  expect(INACTIVITY_MS).toBe(5 * 60 * 1000);
  expect(INACTIVITY_EVENTS).toEqual(['mousemove', 'keydown', 'click', 'scroll', 'touchstart']);
  const onIdle = vi.fn();
  renderHook(() => { useInactivitySignOut({ email: 'a@b.c' }, onIdle); });
  for (const ev of INACTIVITY_EVENTS) {
    act(() => { vi.advanceTimersByTime(INACTIVITY_MS - 1); });
    window.dispatchEvent(new Event(ev));
  }
  expect(onIdle).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(INACTIVITY_MS - 1); });
  expect(onIdle).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); });
  expect(onIdle).toHaveBeenCalledTimes(1);
});

test('AUTH.R25: no user, no timer; the listeners go with the user and on unmount', () => {
  vi.useFakeTimers();
  const onIdle = vi.fn();
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  try {
    const { rerender, unmount } = renderHook(({ user }) => { useInactivitySignOut(user, onIdle); }, { initialProps: { user: null as object | null } });
    act(() => { vi.advanceTimersByTime(INACTIVITY_MS * 2); });
    expect(onIdle).not.toHaveBeenCalled();
    expect(add.mock.calls.filter(([t]) => (INACTIVITY_EVENTS as readonly string[]).includes(t))).toHaveLength(0);
    rerender({ user: { email: 'a@b.c' } });
    expect(add.mock.calls.filter(([t]) => (INACTIVITY_EVENTS as readonly string[]).includes(t))).toHaveLength(5);
    /* a new user object rebuilds the timer from zero (QniConnect's effect on [user]) */
    act(() => { vi.advanceTimersByTime(INACTIVITY_MS - 10); });
    rerender({ user: { email: 'a@b.c', id: 'x' } });
    act(() => { vi.advanceTimersByTime(INACTIVITY_MS - 10); });
    expect(onIdle).not.toHaveBeenCalled();
    unmount();
    expect(remove.mock.calls.filter(([t]) => (INACTIVITY_EVENTS as readonly string[]).includes(t))).toHaveLength(10);
    act(() => { vi.advanceTimersByTime(INACTIVITY_MS * 2); });
    expect(onIdle).not.toHaveBeenCalled();
  } finally { add.mockRestore(); remove.mockRestore(); }
});

test('AUTH.R30: only isAuthenticated removed in another tab counts as a sign-out there', () => {
  const onSignedOut = vi.fn();
  const { unmount } = renderHook(() => { useCrossTabSignOut(onSignedOut); });
  const storage = (init: StorageEventInit) => { window.dispatchEvent(new StorageEvent('storage', init)); };
  storage({ key: 'isAuthenticated', newValue: 'true' });
  storage({ key: 'currentUser', newValue: null });
  /* localStorage.clear() in another tab: key null, which QniConnect did not match */
  storage({ key: null, newValue: null });
  expect(onSignedOut).not.toHaveBeenCalled();
  storage({ key: 'isAuthenticated', oldValue: 'true', newValue: null });
  expect(onSignedOut).toHaveBeenCalledTimes(1);
  unmount();
  storage({ key: 'isAuthenticated', oldValue: 'true', newValue: null });
  expect(onSignedOut).toHaveBeenCalledTimes(1);
});
