import type { AuthAdapter } from './types';

/* A fresh copy of the module each time: other files in a shared worker may
   already have set the adapter on theirs. */
const freshIndex = async () => { vi.resetModules(); return import('./index'); };

const adapter: AuthAdapter = {
  init: async () => undefined, account: () => null, signIn: async () => undefined,
  reauthenticate: async () => undefined, signOut: async () => undefined, token: async () => null,
};

test('auth() throws until an adapter is set', async () => {
  const { auth } = await freshIndex();
  expect(() => auth()).toThrow(/no auth adapter/i);
});

test('auth() returns the adapter setAuth was given', async () => {
  const { auth, setAuth } = await freshIndex();
  setAuth(adapter);
  expect(auth()).toBe(adapter);
});
