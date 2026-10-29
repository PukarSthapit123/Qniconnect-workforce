/* QniConnect's diagnostics beyond the logger (public inventory DIAG.DBG,
   DIAG.CORS and DIAG.HAND). Today the debug panel renders nothing and the
   CORS debugger and CORS error handler are never mounted, so a user sees
   none of them; Ruling Q13 does not port them. Each rule is checked here as
   "not shipped": no source carries them, the app never replaces fetch, and
   build:check keeps their words out of a build that is not a debug build
   (scripts/build-check.test.ts). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { server } from '@/mocks/node';
import { App } from '@/App';
import { tid } from '@/testids';
import { BC_ENDPOINTS } from '@/contract/bc/endpoints';

const SRC = resolve(__dirname, '..');
/* Every product source file: not tests, not the fake server. */
function productSources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { if (!['mocks', 'test'].includes(name)) walk(p); continue; }
      if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push({ file: p, text: readFileSync(p, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}
const carrying = (re: RegExp) => productSources().filter(s => re.test(s.text)).map(s => s.file);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('DIAG.DBG: the debug panel', () => {
  test('DIAG.R10 to DIAG.R13: nothing is mounted beside the routes: no Auth Debug overlay, no Force Auth or Clear Auth, in any mode', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    await screen.findByTestId(tid.page('landing'));
    expect(document.body).not.toHaveTextContent(/Auth Debug|MSAL Auth:|LocalStorage Auth:|Force Auth|Clear Auth/);
    expect(carrying(/DebugPanel|Auth Debug|Force Auth/)).toEqual([]);
  });
});

describe('DIAG.CORS: the CORS debugger', () => {
  test('DIAG.C1 and DIAG.C2 wire: no GET or OPTIONS /cors-test is ever sent, and no endpoint names it', () => {
    expect(BC_ENDPOINTS.map(e => e.path)).not.toContain('/cors-test');
    expect(carrying(/cors-test/)).toEqual([]);
    expect(carrying(/Bearer test-token|X-Test-Header/)).toEqual([]);
  });
  test('DIAG.S1 to DIAG.S7 and DIAG.R20 to DIAG.R24: none of its screen exists', () => {
    expect(carrying(/CorsDebugger|CORS Debugger|Test CORS Connection|Test OPTIONS Preflight|CORS Test Results/)).toEqual([]);
  });
});

describe('DIAG.HAND: the CORS error handler', () => {
  test('DIAG.R30 to DIAG.R32 and DIAG.R35: the app never replaces window.fetch', async () => {
    const original = window.fetch;
    window.history.replaceState(null, '', '/');
    const view = render(<App />);
    await screen.findByTestId(tid.page('landing'));
    expect(window.fetch).toBe(original);
    view.unmount();
    expect(carrying(/window\.fetch\s*=/)).toEqual([]);
  });
  test('DIAG.S10 to DIAG.S12, DIAG.R33 and DIAG.R34: no banner, panel or diagnostic snapshot exists', () => {
    expect(carrying(/CorsErrorHandler|CORS Error Detected|CORS Error Details|gatherDiagnosticInfo|ALLOWED_ORIGINS/)).toEqual([]);
  });
});
