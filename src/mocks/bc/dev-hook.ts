/* A development-only handle on the fake /bc data, for the e2e specs: the data
   lives in this page's memory (bcStore), so a spec changes it here rather
   than reaching into the bundler's modules. Installed only where the fake
   server starts (src/mocks/browser.ts), which a production build leaves out;
   build:check fails a dist carrying its name (scripts/build-check.mjs). */
import { bcStore } from './seed';

export interface FakeBcHook {
  /** /bc/environments answers an empty list (account setup's "Sign in required") */
  removeEnvironments(): void;
  /** the portal user is Inactive (account setup's "Access not provisioned") */
  deactivate(email: string): void;
}
declare global { interface Window { __fakeBc?: FakeBcHook } }

export const fakeBcHook: FakeBcHook = {
  removeEnvironments() { bcStore.db.environments.length = 0; },
  deactivate(email) {
    const u = bcStore.userByEmail(email);
    if (!u) throw new Error(`no fake portal user ${email}`);
    u.status = 'Inactive';
  },
};
export function installFakeBcHook(win: Window = window) { win.__fakeBc = fakeBcHook; }
