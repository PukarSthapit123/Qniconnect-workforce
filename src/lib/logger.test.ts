/* QniConnect's debug logger (public inventory DIAG.R1 to DIAG.R5): silent
   unless REACT_APP_DEBUG is exactly 'true', read once when the module loads. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const METHODS = ['log', 'warn', 'error', 'debug'] as const;
/* A fresh copy of the module under that value of the switch. */
async function loggerWith(value: string | undefined) {
  vi.stubEnv('REACT_APP_DEBUG', value);
  vi.resetModules();
  return (await import('./logger')).logger;
}
const spies = () => Object.fromEntries(METHODS.map(m => [m, vi.spyOn(console, m).mockImplementation(() => undefined)]));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });

test('DIAG.R1 and DIAG.R2: with REACT_APP_DEBUG "true", each of the four methods prints through its console method', async () => {
  const logger = await loggerWith('true');
  const c = spies();
  for (const m of METHODS) logger[m]('a', 1);
  for (const m of METHODS) expect(c[m], m).toHaveBeenCalledWith('a', 1);
});

test('DIAG.R1 and DIAG.R2: unset, "false", "TRUE" or "1", nothing prints, errors included', async () => {
  for (const v of [undefined, 'false', 'TRUE', '1', ' true']) {
    const logger = await loggerWith(v);
    const c = spies();
    for (const m of METHODS) logger[m]('quiet');
    for (const m of METHODS) expect(c[m], `${String(v)} ${m}`).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  }
});

test('DIAG.R1: the switch is read once, when the module loads', async () => {
  const logger = await loggerWith('false');
  vi.stubEnv('REACT_APP_DEBUG', 'true');
  const c = spies();
  logger.error('still quiet');
  expect(c.error).not.toHaveBeenCalled();
});

test('DIAG.R3: both QniConnect env files set REACT_APP_DEBUG=false, so no build prints by default', () => {
  for (const f of ['.env.development', '.env.production']) {
    const text = readFileSync(resolve(__dirname, '../..', f), 'utf8');
    expect(text, f).toMatch(/^REACT_APP_DEBUG=false\s*$/m);
  }
});

test('DIAG.R4: the logger only prints; it returns nothing for a page to show', async () => {
  const logger = await loggerWith('true');
  spies();
  expect(Object.keys(logger).sort()).toEqual([...METHODS].sort());
  for (const m of METHODS) expect(logger[m]('x')).toBeUndefined();
});

test('DIAG.R5: MSAL\'s messages go through the logger, so they are gated too; a message with personal data never does', async () => {
  vi.resetModules();
  const { logger } = await import('./logger');
  const { msalConfig } = await import('@/auth/config');
  const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
  const callback = msalConfig('http://localhost').system?.loggerOptions?.loggerCallback;
  callback?.(1, 'msal says', false);
  callback?.(1, 'ana@contoso.com', true);
  expect(log.mock.calls).toEqual([['msal says']]);
});
