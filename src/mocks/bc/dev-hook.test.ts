import { bcStore } from './seed';
import { fakeBcHook, installFakeBcHook } from './dev-hook';

beforeEach(() => { bcStore.reset(); });

test('the dev hook empties the environments and deactivates a portal user, and is installed on the window', () => {
  installFakeBcHook();
  expect(window.__fakeBc).toBe(fakeBcHook);
  expect(bcStore.db.environments.length).toBeGreaterThan(0);
  window.__fakeBc?.removeEnvironments();
  expect(bcStore.db.environments).toEqual([]);
  window.__fakeBc?.deactivate('amara.okafor@brightpath.org');
  expect(bcStore.userByEmail('amara.okafor@brightpath.org')?.status).toBe('Inactive');
  expect(() => window.__fakeBc?.deactivate('nobody@example.org')).toThrow('no fake portal user nobody@example.org');
  delete window.__fakeBc;
});
