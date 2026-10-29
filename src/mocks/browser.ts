import { http } from 'msw';
import { setupWorker } from 'msw/browser';
import { apiHandlersIfOn } from './handlers';
import { bcHandlersIfOn } from './bc/handlers';
import { installFakeBcHook } from './bc/dev-hook';
import { unhandledRequest } from './bc/unhandled';
import { store } from './store';

/* Each tab runs its own copy of the fake server. Before any handler reads the
   database, this reloads it if another tab has saved since, so a stale write
   from a second tab meets the first tab's version and is refused with 412
   instead of overwriting it. It answers nothing itself. */
const syncFromOtherTabs = http.all('/api/*', () => { store.sync(); return undefined; });

export async function startFakeServer() {
  store.boot();
  /* The /bc and /session handlers sit at REACT_APP_API_BASE_URL, another
     origin, which the worker intercepts like any other request from the page.
     syncFromOtherTabs matches this origin's /api/* only, so it never sees them.
     With VITE_FAKE_BC off there are none, and onUnhandledRequest lets
     those calls through to the real API; with it on, a /bc call no handler
     answers is an error rather than a call to the real API (bc/unhandled.ts). Likewise an /api/v1 module that
     VITE_FAKE_MODULES leaves off has no handlers, and goes on to the real
     backend at this origin. */
  const bc = bcHandlersIfOn();
  const worker = setupWorker(syncFromOtherTabs, ...apiHandlersIfOn(), ...bc);
  /* the e2e specs' handle on the fake /bc data (window.__fakeBc), only while that fake answers */
  if (bc.length) installFakeBcHook();
  /* every write persists; a handler never has to remember to */
  worker.events.on('response:mocked', ({ request }) => { if (request.method !== 'GET') store.save(); });
  await worker.start({ onUnhandledRequest: unhandledRequest(bc.length > 0), quiet: true });
}
